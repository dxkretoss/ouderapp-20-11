// manage-handover — "Mee met de wissel" packing list, fixed items per child, handover notes. Session required.
// A handover is identified by its date (moment_id = YYYY-MM-DD), derived in the app from the care schedule.
// Both parents of a shared child see and edit the list; the receiving parent confirms what arrived and items
// that did not arrive move to the next handover. Lists are deleted one month after the handover.
import { db } from "../_shared/db.ts";
import { check, err, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { requireUuid } from "../_shared/util.ts";
import { audit, canSee, childIdsFromBody, familyScope, reqDateStr, Scope, str, toAbs, toRel } from "../_shared/agenda-family.ts";
import { CHECKLIST_RETENTION_DAYS, PACKING_OPTIONS } from "../_shared/agenda-packing-options.ts";

type Row = Record<string, any>;
const ITEM_COLS = "id, user_id, moment_id, item_name, child_ids, source, source_ref, is_packed, packed_by, packed_at, received, removed, deleted_at, created_at";
const SOURCES = ["vast", "afspraak", "verzoek", "toegevoegd", "niet_meegekomen"];
const DAYS = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag", "elke"];

const expiry = (moment: string) => {
  const d = new Date(`${moment}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + CHECKLIST_RETENTION_DAYS);
  return d.toISOString();
};
const own = (r: Row) => ({ created_by: r.user_id, child_ids: r.child_ids?.length ? r.child_ids : r.child_id ? [r.child_id] : [] });

function itemOut(r: Row, me: string) {
  return {
    id: r.id, moment_id: r.moment_id, naam: r.item_name, kind_ids: r.child_ids ?? [], bron: r.source, bron_ref: r.source_ref ?? null,
    door: r.user_id === me ? "ik" : "ander", ingepakt: !!r.is_packed, ingepakt_door: r.packed_by ? (r.packed_by === me ? "ik" : "ander") : null,
    ingepakt_op: r.packed_at ?? null, ontvangen: r.received ?? null, verwijderd: !!r.removed,
  };
}
const routineOut = (r: Row, me: string) => ({ id: r.id, kind: r.child_id, dag: r.day_of_week, item: r.item_name, reden: r.reason ?? "", door: r.user_id === me ? "ik" : "ander" });
const logOut = (r: Row, me: string) => ({
  id: r.id, moment_id: r.moment_id ?? r.datum, van: r.user_id === me ? "ik" : "ander", aan: toRel(r.to_parent, me), kind_ids: r.child_ids ?? [],
  inhoud: r.content ?? null, datum: r.datum, gedeeld_op: r.updated_at ?? r.created_at,
});

async function loadItem(s: Scope, id: string): Promise<Row> {
  const r = check(await db().from("handover_checklist_items").select(ITEM_COLS + ", child_id").eq("id", id).maybeSingle(), "load item") as Row | null;
  if (!r || !canSee(s, own(r))) throw err.notFound("Item not found");
  return r;
}

function familyQuery(table: string, cols: string, s: Scope, childCol = "child_ids"): any {
  const kids = [...s.kids];
  let q = db().from(table).select(cols);
  q = kids.length ? q.or(childCol === "child_ids" ? `user_id.eq.${s.me},child_ids.ov.{${kids.join(",")}}` : `user_id.eq.${s.me},child_id.in.(${kids.join(",")})`) : q.eq("user_id", s.me);
  return q;
}

Deno.serve(serveActions("manage-handover", {
  async list(req) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const now = new Date().toISOString();
    const [items, routines, logs] = await Promise.all([
      familyQuery("handover_checklist_items", ITEM_COLS + ", child_id", s).or(`deleted_at.is.null,deleted_at.gt.${now}`).order("created_at", { ascending: true }),
      familyQuery("fixed_routines", "id, user_id, child_id, day_of_week, item_name, reason, created_at", s, "child_id").order("created_at", { ascending: true }),
      familyQuery("handover_logs", "id, user_id, child_id, child_ids, moment_id, datum, content, to_parent, created_at, updated_at", s).order("updated_at", { ascending: false }).limit(60),
    ]);
    const it = ((check(items, "items") ?? []) as Row[]).filter((r) => canSee(s, own(r)));
    const ro = ((check(routines, "routines") ?? []) as Row[]).filter((r) => canSee(s, { created_by: r.user_id, child_ids: r.child_id ? [r.child_id] : [] }));
    const lo = ((check(logs, "logs") ?? []) as Row[]).filter((r) => canSee(s, own(r)));
    const getypt = [...new Set(it.filter((r) => r.source === "toegevoegd" || r.source === "verzoek").map((r) => String(r.item_name)))].filter((n) => !PACKING_OPTIONS.includes(n));
    return ok({
      items: it.filter((r) => !r.removed).map((r) => itemOut(r, me.id)), routines: ro.map((r) => routineOut(r, me.id)), logs: lo.map((r) => logOut(r, me.id)),
      options: [...PACKING_OPTIONS, ...getypt.slice(0, 50)],
    });
  },

  /** Add one or more items to the list of a handover (from the option list or typed). */
  async "add-items"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const moment = reqDateStr(body.moment_id, "moment_id");
    const childIds = childIdsFromBody(s, body.kind_ids, { required: true });
    const source = SOURCES.includes(body.bron) ? body.bron : "toegevoegd";
    if (!Array.isArray(body.namen) || !body.namen.length || body.namen.length > 20) throw err.validation("namen must be a list");
    const rows = body.namen.map((n: unknown) => ({
      user_id: me.id, child_id: childIds[0], child_ids: childIds, moment_id: moment, item_name: str(n, "naam", 100, true), source,
      source_ref: str(body.bron_ref, "bron_ref", 200), deleted_at: expiry(moment),
    }));
    const saved = (check(await db().from("handover_checklist_items").insert(rows).select(ITEM_COLS), "insert items") ?? []) as Row[];
    await audit(me.id, "spullen", moment, "CREATED", { item_naam: rows.map((r: Row) => r.item_name).join(", "), kinderen: childIds, meta: { type: "Spul", bron: source } });
    return ok({ items: saved.map((r) => itemOut(r, me.id)) });
  },

  async "set-packed"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const r = await loadItem(s, requireUuid(body.id, "id"));
    const packed = body.packed === true;
    const u = check(await db().from("handover_checklist_items").update({ is_packed: packed, packed_by: packed ? me.id : null, packed_at: packed ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", r.id).select(ITEM_COLS).single(), "pack") as Row;
    return ok({ item: itemOut(u, me.id) });
  },

  /** Removes an item from this list (kept as removed until the list expires). */
  async "remove-item"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const r = await loadItem(s, requireUuid(body.id, "id"));
    check(await db().from("handover_checklist_items").update({ removed: true, updated_at: new Date().toISOString() }).eq("id", r.id), "remove item");
    return ok({});
  },

  /**
   * "Is alles meegekomen?": received per item. Items that did not arrive are put on the next handover's list
   * (`next_moment_id`, computed in the app from the schedule) with source niet_meegekomen.
   */
  async "confirm-received"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const moment = reqDateStr(body.moment_id, "moment_id");
    const next = body.next_moment_id ? reqDateStr(body.next_moment_id, "next_moment_id") : null;
    const received = body.received && typeof body.received === "object" ? body.received as Row : {};
    const missing: Row[] = [];
    for (const [id, val] of Object.entries(received)) {
      const r = await loadItem(s, requireUuid(id, "item id"));
      if (r.moment_id !== moment) throw err.validation("item belongs to another handover");
      check(await db().from("handover_checklist_items").update({ received: val === true, updated_at: new Date().toISOString() }).eq("id", r.id), "received");
      if (val !== true) missing.push(r);
    }
    const carried = next && missing.length
      ? ((check(await db().from("handover_checklist_items").insert(missing.map((r) => ({
        user_id: me.id, child_id: r.child_ids?.[0] ?? r.child_id, child_ids: r.child_ids, moment_id: next, item_name: r.item_name,
        source: "niet_meegekomen", source_ref: moment, deleted_at: expiry(next),
      }))).select(ITEM_COLS), "carry over") ?? []) as Row[])
      : [];
    await audit(me.id, "spullen", moment, "UPDATED", { item_naam: "Mee met de wissel", kinderen: [...new Set(missing.flatMap((r) => r.child_ids ?? []))], wijziging: { veld: "ontvangen", oud: "", nieuw: missing.length ? `${missing.length} niet meegekomen` : "alles ontvangen" } });
    return ok({ carried: carried.map((r) => itemOut(r, me.id)) });
  },

  /** Fixed items per child ("Vaste spullen"): both parents can change them. */
  async "add-routine"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const [kind] = childIdsFromBody(s, [body.kind], { required: true });
    const dag = DAYS.includes(body.dag) ? body.dag : "elke";
    const r = check(await db().from("fixed_routines").insert({ user_id: me.id, child_id: kind, day_of_week: dag, item_name: str(body.item, "item", 100, true), reason: str(body.reden, "reden", 300) }).select("*").single(), "add routine") as Row;
    await audit(me.id, "spullen", r.id, "CREATED", { item_naam: r.item_name, kinderen: [kind], meta: { type: "Vast", dag } });
    return ok({ routine: routineOut(r, me.id) });
  },

  async "remove-routine"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const r = check(await db().from("fixed_routines").select("*").eq("id", requireUuid(body.id, "id")).maybeSingle(), "load routine") as Row | null;
    if (!r || !canSee(s, { created_by: r.user_id, child_ids: r.child_id ? [r.child_id] : [] })) throw err.notFound("Routine not found");
    check(await db().from("fixed_routines").delete().eq("id", r.id), "delete routine");
    await audit(me.id, "spullen", r.id, "DELETED", { item_naam: r.item_name, kinderen: r.child_id ? [r.child_id] : [], meta: { type: "Vast" } });
    return ok({});
  },

  /** Handover note for the other parent (one per author per handover; sharing again replaces it). */
  async "share-log"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const moment = reqDateStr(body.moment_id, "moment_id");
    const childIds = childIdsFromBody(s, body.kind_ids, { required: true });
    const content = body.inhoud;
    if (!content || typeof content !== "object" || JSON.stringify(content).length > 20000) throw err.validation("inhoud is invalid");
    const existing = check(await db().from("handover_logs").select("id").eq("user_id", me.id).eq("moment_id", moment).maybeSingle(), "find log") as Row | null;
    const row = { user_id: me.id, child_id: childIds[0], child_ids: childIds, moment_id: moment, datum: moment, content, to_parent: toAbs("ander", me.id), richting_key: "handover.directionToOther", updated_at: new Date().toISOString() };
    const r = existing
      ? check(await db().from("handover_logs").update(row).eq("id", existing.id).select("*").single(), "update log") as Row
      : check(await db().from("handover_logs").insert(row).select("*").single(), "insert log") as Row;
    await audit(me.id, "overdracht", r.id, existing ? "UPDATED" : "CREATED", { item_naam: "Overdracht", kinderen: childIds, meta: { datum: moment } });
    return ok({ log: logOut(r, me.id) });
  },

  /** The author takes a shared note back to edit it again. */
  async "unshare-log"(req, body) {
    const me = await requireUser(req);
    const moment = reqDateStr(body.moment_id, "moment_id");
    check(await db().from("handover_logs").delete().eq("user_id", me.id).eq("moment_id", moment), "unshare log");
    return ok({});
  },
}));
