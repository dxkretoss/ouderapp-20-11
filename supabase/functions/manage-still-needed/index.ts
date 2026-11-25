// manage-still-needed — "Nog nodig" list of the signed-in parent's family (Phase 2, domain 3).
// Visible: items I created, items addressed to me (other_parent_id), and legacy items of an active
// co-parent for a child I can access. Never another family's items.
// An item only links to a budget by id; it never creates an expense or a budget by itself.
import { db } from "../_shared/db.ts";
import { check, err, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { optText, reqText, requireUuid } from "../_shared/util.ts";
import { assertVisible, audit, childIdsInput, costPair, visibleRows } from "../_shared/costs-family.ts";

type Row = Record<string, any>;
const CATEGORIES = ["Nodig", "Boodschap"];

function itemOut(r: Row): Row {
  return {
    id: r.id,
    user_id: r.user_id,
    other_parent_id: r.other_parent_id ?? null,
    title: r.title,
    category: r.category ?? "Nodig",
    child_ids: r.child_ids?.length ? r.child_ids : r.child_id ? [r.child_id] : [],
    child_name: r.child_name ?? null,
    is_purchased: !!r.is_purchased,
    purchased_by: r.purchased_by ?? null,
    purchased_at: r.purchased_at ?? null,
    budget_id: r.budget_id ?? null,
    buyer_id: r.buyer_id ?? null,
    expense_id: r.expense_id ?? null,
    deadline: r.deadline ?? null,
    notes: r.notes ?? null,
    created_at: r.created_at,
  };
}

const kidsOf = (r: Row): string[] => (r.child_ids?.length ? r.child_ids : r.child_id ? [r.child_id] : []);

/**
 * Mine, or shared with me (other_parent_id) while EVERY child of the item is still linked to both of us
 * (per-child rule, see costs-family.pairSees). Items made while Solo stay private until shared.
 */
async function visibleItems(me: string): Promise<Row[]> {
  const rows = (check(
    await db().from("still_needed_items").select("*").or(`user_id.eq.${me},other_parent_id.eq.${me}`).order("created_at", { ascending: false }).limit(500),
    "list items",
  ) ?? []) as Row[];
  return await visibleRows(me, rows.map((r) => ({ ...r, child_ids: kidsOf(r) })), (r) => r.user_id ?? null);
}

async function loadItem(me: string, id: unknown): Promise<Row> {
  const itemId = requireUuid(id, "id");
  const row = check(await db().from("still_needed_items").select("*").eq("id", itemId).maybeSingle(), "load item") as Row | null;
  if (!row) throw err.notFound("Item not found");
  await assertVisible(me, row.user_id ?? null, row.other_parent_id ?? null, kidsOf(row));
  return { ...row, child_ids: kidsOf(row) };
}

/**
 * A linked budget must be visible to the caller AND belong to the same pair as the item: a shared item
 * (me + other) only links to a budget of exactly that pair; a private item only to a budget of mine.
 */
async function budgetIdInput(me: string, v: unknown, other: string | null): Promise<string | null> {
  if (v === undefined || v === null || v === "") return null;
  const id = requireUuid(v, "budget_id");
  const b = check(await db().from("budget_proposals").select("id, created_by, other_parent_id, child_ids").eq("id", id).maybeSingle(), "load budget") as Row | null;
  if (!b) throw err.notFound("Budget not found");
  await assertVisible(me, b.created_by, b.other_parent_id, b.child_ids);
  const budgetOther = b.created_by === me ? b.other_parent_id : b.created_by;
  if (other && budgetOther !== other) throw err.validation("This budget belongs to another parent");
  return id;
}

async function update(me: string, item: Row, patch: Row, label = "UPDATED"): Promise<Row> {
  const row = check(
    await db().from("still_needed_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", item.id).select("*").single(),
    "update item",
  ) as Row;
  await audit(me, "nog_nodig", item.id, label, [item.user_id, row.other_parent_id ?? item.other_parent_id], { label: row.title ?? item.title });
  return itemOut(row);
}

Deno.serve(serveActions("manage-still-needed", {
  async list(req) {
    const me = await requireUser(req);
    return ok({ items: (await visibleItems(me.id)).map(itemOut) });
  },

  async create(req, body) {
    const me = await requireUser(req);
    const childIds = await childIdsInput(me.id, body.child_ids ?? (body.child_id ? [body.child_id] : []));
    // Shared with the other parent of these children, unless "Alleen jij" (shared: false).
    const partner = await costPair(me.id, childIds, body.shared, body.other_parent_id);
    const purchased = !!body.is_purchased;
    const row = check(
      await db().from("still_needed_items").insert({
        user_id: me.id,
        other_parent_id: partner,
        title: reqText(body.title, "title", 200),
        category: CATEGORIES.includes(body.category) ? body.category : "Nodig",
        child_ids: childIds,
        child_id: childIds[0] ?? null,
        is_purchased: purchased,
        purchased_by: purchased ? me.id : null,
        purchased_at: purchased ? new Date().toISOString() : null,
        budget_id: await budgetIdInput(me.id, body.budget_id, partner),
        buyer_id: body.buyer === "me" ? me.id : null,
        deadline: optText(body.deadline, "deadline", 40) ?? null,
        notes: optText(body.notes, "notes", 1000) ?? null,
      }).select("*").single(),
      "insert item",
    ) as Row;
    await audit(me.id, "nog_nodig", row.id, "CREATED", [me.id, partner], { label: row.title });
    return ok({ item: itemOut(row) });
  },

  async toggle(req, body) {
    const me = await requireUser(req);
    const item = await loadItem(me.id, body.id);
    const purchased = !!body.is_purchased;
    return ok({
      item: await update(me.id, item, {
        is_purchased: purchased,
        purchased_by: purchased ? me.id : null,
        purchased_at: purchased ? new Date().toISOString() : null,
      }),
    });
  },

  async link_budget(req, body) {
    const me = await requireUser(req);
    const item = await loadItem(me.id, body.id);
    // The item's pair, seen from me (null = private item).
    const other = item.user_id === me.id ? item.other_parent_id ?? null : item.user_id;
    return ok({ item: await update(me.id, item, { budget_id: await budgetIdInput(me.id, body.budget_id, other) }) });
  },

  /** "Ik koop het" (buyer = me) or undo; a parent can never assign the other parent as buyer. */
  async set_buyer(req, body) {
    const me = await requireUser(req);
    const item = await loadItem(me.id, body.id);
    if (item.buyer_id && item.buyer_id !== me.id) throw err.forbidden("The other parent already buys this");
    return ok({ item: await update(me.id, item, { buyer_id: body.buyer === "me" ? me.id : null }) });
  },

  async update(req, body) {
    const me = await requireUser(req);
    const item = await loadItem(me.id, body.id);
    const patch: Row = {};
    if (body.title !== undefined) patch.title = reqText(body.title, "title", 200);
    if (body.category !== undefined) patch.category = CATEGORIES.includes(body.category) ? body.category : "Nodig";
    if (body.deadline !== undefined) patch.deadline = optText(body.deadline, "deadline", 40) ?? null;
    if (body.notes !== undefined) patch.notes = optText(body.notes, "notes", 1000) ?? null;
    // Children and sharing: only the creator decides. Shared always goes to the other parent of ALL the
    // (new) children, so changing the children re-addresses a shared item (or fails with MIXED_CHILDREN).
    const mine = item.user_id === me.id;
    if (body.child_ids !== undefined) {
      if (!mine) throw err.forbidden("Only the parent who added it can change the children");
      const ids = await childIdsInput(me.id, body.child_ids);
      Object.assign(patch, { child_ids: ids, child_id: ids[0] ?? null });
    }
    if (body.shared !== undefined && !mine) throw err.forbidden("Only the parent who added it can change who sees it");
    if (mine && (body.shared !== undefined || patch.child_ids)) {
      const shared = body.shared !== undefined ? body.shared === true : !!item.other_parent_id;
      const ids: string[] = patch.child_ids ?? (item.child_ids?.length ? item.child_ids : item.child_id ? [item.child_id] : []);
      const requested = body.other_parent_id ?? (ids.length ? undefined : item.other_parent_id ?? undefined);
      patch.other_parent_id = shared ? await costPair(me.id, ids, true, requested) : null;
    }
    if (!Object.keys(patch).length) return ok({ item: itemOut(item) });
    return ok({ item: await update(me.id, item, patch) });
  },

  async delete(req, body) {
    const me = await requireUser(req);
    const item = await loadItem(me.id, body.id);
    if (item.user_id !== me.id && item.other_parent_id !== me.id) throw err.notFound();
    check(await db().from("still_needed_items").delete().eq("id", item.id), "delete item");
    await audit(me.id, "nog_nodig", item.id, "DELETED", [item.user_id, item.other_parent_id], { label: item.title });
    return ok({});
  },
}));
