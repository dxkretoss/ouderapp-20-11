// manage-handover — "Mee met de wissel" packing list, fixed items per child, handover notes. Session required.
// A handover is identified by its date (moment_id = YYYY-MM-DD), derived in the app from the care schedule.
// Both parents of a shared child see and edit the list; the receiving parent confirms what arrived and items
// that did not arrive move to the next handover. Lists are deleted one month after the handover.
// "Is alles meegekomen?" (confirm-received) is only for the RECEIVING parent and only after the handover time
// (derived on the server, _shared/handover-schedule.ts). Unshared handover notes are server drafts (author only).
// Timed notifications (list ready, evening reminder, received check) come from the handover-reminders function.
import { db } from "../_shared/db.ts";
import { check, err, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { requireUuid } from "../_shared/util.ts";
import { assertOnePair, audit, canSee, childIdsFromBody, coParentsFor, familyScope, reqDateStr, Scope, str, toAbs, toRel } from "../_shared/agenda-family.ts";
import { CHECKLIST_RETENTION_DAYS, PACKING_OPTIONS } from "../_shared/agenda-packing-options.ts";
import { handoversOn, loadSchedules, localInstant, localParts, OUT } from "../_shared/handover-schedule.ts";
import { notify } from "../_shared/practical-audit.ts";

const MAX_DRAFT_BYTES = 20000;

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

/**
 * Handover notes are per handover date AND per pair: a parent with child 1 shared with A and child 2 with B
 * has two notes on the same date. The pair key is the one other parent of the children ('' = Solo / none).
 */
const pairKey = (s: Scope, kids: string[]): string => {
  const p = coParentsFor(s, kids);
  return p.length === 1 ? p[0] : "";
};
/** Optional kind_ids from the body (older app versions send none): validated, may be empty. */
const optKids = (s: Scope, v: unknown): string[] => (v === undefined || v === null ? [] : childIdsFromBody(s, v));
/** My shared notes for this date. */
async function myLogs(me: string, moment: string): Promise<Row[]> {
  return (check(await db().from("handover_logs").select("id, user_id, child_id, child_ids, content").eq("user_id", me).eq("moment_id", moment), "my logs") ?? []) as Row[];
}

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
    const [items, routines, logs, drafts] = await Promise.all([
      familyQuery("handover_checklist_items", ITEM_COLS + ", child_id", s).or(`deleted_at.is.null,deleted_at.gt.${now}`).order("created_at", { ascending: true }),
      familyQuery("fixed_routines", "id, user_id, child_id, day_of_week, item_name, reason, created_at", s, "child_id").order("created_at", { ascending: true }),
      familyQuery("handover_logs", "id, user_id, child_id, child_ids, moment_id, datum, content, to_parent, created_at, updated_at", s).order("updated_at", { ascending: false }).limit(60),
      db().from("handover_note_drafts").select("moment_id, pair_key, child_ids, content, updated_at").eq("user_id", me.id).order("updated_at", { ascending: false }).limit(30),
    ]);
    const seenVast = new Set<string>();
    const it = ((check(items, "items") ?? []) as Row[]).filter((r) => canSee(s, own(r))).filter((r) => {
      // older duplicates of the same fixed item (before the unique index) are shown once
      if (r.source !== "vast" || !r.source_ref) return true;
      const k = `${r.moment_id}|${r.source_ref}`;
      if (seenVast.has(k)) return false;
      seenVast.add(k);
      return true;
    });
    const ro = ((check(routines, "routines") ?? []) as Row[]).filter((r) => canSee(s, { created_by: r.user_id, child_ids: r.child_id ? [r.child_id] : [] }));
    const lo = ((check(logs, "logs") ?? []) as Row[]).filter((r) => canSee(s, own(r)));
    const getypt = [...new Set(it.filter((r) => r.source === "toegevoegd" || r.source === "verzoek").map((r) => String(r.item_name)))].filter((n) => !PACKING_OPTIONS.includes(n));
    return ok({
      items: it.filter((r) => !r.removed).map((r) => itemOut(r, me.id)),
      // fixed items a parent removed from a handover: the client must not add them back
      removed_fixed: it.filter((r) => r.removed && r.source === "vast" && r.source_ref).map((r) => ({ moment_id: r.moment_id, ref: r.source_ref })), routines: ro.map((r) => routineOut(r, me.id)), logs: lo.map((r) => logOut(r, me.id)),
      options: [...PACKING_OPTIONS, ...getypt.slice(0, 50)],
      drafts: ((check(drafts, "drafts") ?? []) as Row[]).map((d) => ({
        moment_id: d.moment_id, kind_ids: d.child_ids ?? [], other_parent_id: d.pair_key || null, inhoud: d.content ?? {}, bijgewerkt: d.updated_at,
      })),
    });
  },

  /**
   * Add one or more items to the list of a handover (from the option list or typed). A fixed item ("vast",
   * bron_ref = routine id) and an appointment item ("afspraak", bron_ref = appointment) are added at most once.
   * A request from the receiving parent ("verzoek") notifies the other parent.
   */
  async "add-items"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const moment = reqDateStr(body.moment_id, "moment_id");
    const childIds = childIdsFromBody(s, body.kind_ids, { required: true });
    assertOnePair(s, childIds);
    const source = SOURCES.includes(body.bron) ? body.bron : "toegevoegd";
    if (!Array.isArray(body.namen) || !body.namen.length || body.namen.length > 20) throw err.validation("namen must be a list");
    const ref = str(body.bron_ref, "bron_ref", 200);
    let rows: Row[] = body.namen.map((n: unknown) => ({
      user_id: me.id, child_id: childIds[0], child_ids: childIds, moment_id: moment, item_name: str(n, "naam", 100, true), source,
      source_ref: ref, deleted_at: expiry(moment),
    }));
    const saved: Row[] = [];
    if ((source === "vast" || source === "afspraak") && ref) {
      const existing = (check(
        await db().from("handover_checklist_items").select(ITEM_COLS + ", child_id").eq("moment_id", moment).eq("source", source).eq("source_ref", ref),
        "existing items",
      ) ?? []) as Row[];
      const visible = existing.filter((r) => canSee(s, own(r)));
      // already there (or removed by a parent): return the visible ones, never add a second copy
      saved.push(...visible.filter((r) => !r.removed));
      const have = new Set(existing.map((r) => String(r.item_name).toLowerCase()));
      rows = source === "vast" && existing.length ? [] : rows.filter((r) => !have.has(String(r.item_name).toLowerCase()));
      for (const r of rows) {
        const ins = await db().from("handover_checklist_items").insert(r).select(ITEM_COLS).maybeSingle();
        if (ins.error && (ins.error as { code?: string }).code === "23505") continue; // added concurrently
        const row = check(ins, "insert item") as Row | null;
        if (row) saved.push(row);
      }
    } else {
      saved.push(...((check(await db().from("handover_checklist_items").insert(rows).select(ITEM_COLS), "insert items") ?? []) as Row[]));
    }
    if (rows.length) {
      await audit(me.id, "spullen", moment, "CREATED", { item_naam: rows.map((r: Row) => r.item_name).join(", "), kinderen: childIds, meta: { type: "Spul", bron: source } });
    }
    if (source === "verzoek" && rows.length) {
      await notify({
        to: coParentsFor(s, childIds), actorId: me.id, type: "handover", category: "actie", key: "overdrachtVerzoek",
        params: { item: rows.map((r) => r.item_name).join(", ").slice(0, 120) }, link: `/overdracht?moment=${moment}`,
        entityType: "handover", entityId: moment, childIds,
      });
    }
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
   * "Is alles meegekomen?": received per item, only by the RECEIVING parent and only after the handover time.
   * Items that did not arrive are put on the next handover's list (`next_moment_id`, computed in the app from
   * the schedule) with source niet_meegekomen. The handing-over parent gets the result.
   */
  async "confirm-received"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const moment = reqDateStr(body.moment_id, "moment_id");
    const next = body.next_moment_id ? reqDateStr(body.next_moment_id, "next_moment_id") : null;
    if (next && next <= moment) throw err.validation("next_moment_id must be after moment_id");
    const received = body.received && typeof body.received === "object" ? body.received as Row : {};
    const entries = Object.entries(received);
    if (!entries.length || entries.length > 100) throw err.validation("received is required");
    const items: Array<[Row, boolean]> = [];
    for (const [id, val] of entries) {
      const r = await loadItem(s, requireUuid(id, "item id"));
      if (r.moment_id !== moment) throw err.validation("item belongs to another handover");
      items.push([r, val === true]);
    }
    const kids = [...new Set(items.flatMap(([r]) => r.child_ids?.length ? r.child_ids : r.child_id ? [r.child_id] : []))] as string[];
    const handovers = handoversOn((await loadSchedules(kids)).values(), moment).filter((h) => kids.includes(h.childId));
    const nowLocal = localParts();
    if (handovers.length) {
      if (!handovers.some((h) => h.to === me.id)) throw err.forbidden("Only the receiving parent confirms what arrived");
      const at = localInstant(moment, handovers.find((h) => h.to === me.id)!.time || "00:00");
      if (Date.now() < at.getTime()) throw err.validation("The handover has not happened yet");
    } else if (moment > nowLocal.date) {
      // no derivable handover (no fixed schedule): at least not before the day itself
      throw err.validation("The handover has not happened yet");
    }
    const missing: Row[] = [];
    for (const [r, val] of items) {
      check(await db().from("handover_checklist_items").update({ received: val, updated_at: new Date().toISOString() }).eq("id", r.id), "received");
      if (!val) missing.push(r);
    }
    let carried: Row[] = [];
    if (next && missing.length) {
      // never twice on the next list (a second confirmation replaces nothing)
      const already = (check(
        await db().from("handover_checklist_items").select("source_ref, item_name").eq("moment_id", next).eq("source", "niet_meegekomen").eq("source_ref", moment),
        "carried before",
      ) ?? []) as Row[];
      const have = new Set(already.map((a) => String(a.item_name).toLowerCase()));
      const add = missing.filter((r) => !have.has(String(r.item_name).toLowerCase()));
      carried = add.length
        ? ((check(await db().from("handover_checklist_items").insert(add.map((r) => ({
          user_id: me.id, child_id: r.child_ids?.[0] ?? r.child_id, child_ids: r.child_ids, moment_id: next, item_name: r.item_name,
          source: "niet_meegekomen", source_ref: moment, deleted_at: expiry(next),
        }))).select(ITEM_COLS), "carry over") ?? []) as Row[])
        : [];
    }
    await audit(me.id, "spullen", moment, "UPDATED", { item_naam: "Mee met de wissel", kinderen: kids, wijziging: { veld: "ontvangen", oud: "", nieuw: missing.length ? `${missing.length} niet meegekomen` : "alles ontvangen" } });
    // result to the handing-over parent (only a parent in the app who shares these children)
    const shared = new Set(coParentsFor(s, kids));
    const from = [...new Set(handovers.filter((h) => h.to === me.id).map((h) => h.from))].filter((p) => p !== OUT && shared.has(p));
    const to = from.length ? from : [...shared];
    await notify({
      to, actorId: me.id, type: "handover", category: missing.length ? "actie" : "info",
      key: missing.length ? "overdrachtNietMeegekomen" : "overdrachtAllesOntvangen",
      params: { aantal: missing.length, items: missing.map((r) => r.item_name).join(", ").slice(0, 120) },
      link: `/overdracht?moment=${moment}`, entityType: "handover", entityId: moment, childIds: kids,
    });
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
    await notify({ to: coParentsFor(s, [kind]), actorId: me.id, type: "handover", category: "wijziging", key: "vasteSpullenGewijzigd", params: { item: r.item_name }, link: "/overdracht", entityType: "routine", entityId: r.id, childIds: [kind] });
    return ok({ routine: routineOut(r, me.id) });
  },

  async "remove-routine"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const r = check(await db().from("fixed_routines").select("*").eq("id", requireUuid(body.id, "id")).maybeSingle(), "load routine") as Row | null;
    if (!r || !canSee(s, { created_by: r.user_id, child_ids: r.child_id ? [r.child_id] : [] })) throw err.notFound("Routine not found");
    check(await db().from("fixed_routines").delete().eq("id", r.id), "delete routine");
    await audit(me.id, "spullen", r.id, "DELETED", { item_naam: r.item_name, kinderen: r.child_id ? [r.child_id] : [], meta: { type: "Vast" } });
    if (r.child_id) await notify({ to: coParentsFor(s, [r.child_id]), actorId: me.id, type: "handover", category: "wijziging", key: "vasteSpullenGewijzigd", params: { item: r.item_name }, link: "/overdracht", entityType: "routine", entityId: r.id, childIds: [r.child_id] });
    return ok({});
  },

  /** Handover note for the other parent (one per author per handover; sharing again replaces it). */
  async "share-log"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const moment = reqDateStr(body.moment_id, "moment_id");
    const childIds = childIdsFromBody(s, body.kind_ids, { required: true });
    assertOnePair(s, childIds);
    const content = body.inhoud;
    if (!content || typeof content !== "object" || JSON.stringify(content).length > 20000) throw err.validation("inhoud is invalid");
    // One note per author, date AND pair: never overwrite the note for another co-parent's children.
    const pair = pairKey(s, childIds);
    const existing = (await myLogs(me.id, moment)).find((l) => pairKey(s, own(l).child_ids) === pair) ?? null;
    const row = { user_id: me.id, child_id: childIds[0], child_ids: childIds, moment_id: moment, datum: moment, content, to_parent: toAbs("ander", me.id), richting_key: "handover.directionToOther", updated_at: new Date().toISOString() };
    const r = existing
      ? check(await db().from("handover_logs").update(row).eq("id", existing.id).select("*").single(), "update log") as Row
      : check(await db().from("handover_logs").insert(row).select("*").single(), "insert log") as Row;
    await audit(me.id, "overdracht", r.id, existing ? "UPDATED" : "CREATED", { item_naam: "Overdracht", kinderen: childIds, meta: { datum: moment } });
    await db().from("handover_note_drafts").delete().eq("user_id", me.id).eq("moment_id", moment).eq("pair_key", pair);
    // A draft of an older app version (no pair) is unambiguous only with a single co-parent.
    if (s.coParents.length <= 1) await db().from("handover_note_drafts").delete().eq("user_id", me.id).eq("moment_id", moment).eq("pair_key", "");
    return ok({ log: logOut(r, me.id) });
  },

  /** The author takes a shared note back to edit it again. */
  async "unshare-log"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const moment = reqDateStr(body.moment_id, "moment_id");
    // Only the note of ONE pair: by log_id, or by kind_ids; without either only when there is just one note.
    const logs = await myLogs(me.id, moment);
    let log: Row | null = null;
    if (body.log_id !== undefined && body.log_id !== null) {
      const id = requireUuid(body.log_id, "log_id");
      log = logs.find((l) => l.id === id) ?? null;
      if (!log) throw err.notFound("Note not found");
    } else if (body.kind_ids !== undefined && body.kind_ids !== null) {
      const pair = pairKey(s, optKids(s, body.kind_ids));
      log = logs.find((l) => pairKey(s, own(l).child_ids) === pair) ?? null;
    } else if (logs.length > 1) {
      throw err.validation("log_id is required");
    } else log = logs[0] ?? null;
    if (!log) return ok({});
    // the note becomes the author's draft again (never lost)
    const kids = own(log).child_ids as string[];
    if (log.content) {
      check(await db().from("handover_note_drafts").upsert(
        { user_id: me.id, moment_id: moment, pair_key: pairKey(s, kids), child_ids: kids, content: log.content, updated_at: new Date().toISOString() },
        { onConflict: "user_id,moment_id,pair_key" },
      ), "draft from log");
    }
    check(await db().from("handover_logs").delete().eq("id", log.id).eq("user_id", me.id), "unshare log");
    return ok({});
  },

  /** Unshared handover note: stored for the author only (never visible to the other parent). */
  async "save-draft"(req, body) {
    const me = await requireUser(req);
    const moment = reqDateStr(body.moment_id, "moment_id");
    const content = body.inhoud;
    if (!content || typeof content !== "object" || Array.isArray(content) || JSON.stringify(content).length > MAX_DRAFT_BYTES) throw err.validation("inhoud is invalid");
    // One draft per date and pair (kind_ids decide the pair; older app versions send none: key '').
    const s = await familyScope(me.id);
    const kids = optKids(s, body.kind_ids);
    check(await db().from("handover_note_drafts").upsert(
      { user_id: me.id, moment_id: moment, pair_key: pairKey(s, kids), child_ids: kids, content, updated_at: new Date().toISOString() },
      { onConflict: "user_id,moment_id,pair_key" },
    ), "save draft");
    return ok({});
  },

  async "delete-draft"(req, body) {
    const me = await requireUser(req);
    const moment = reqDateStr(body.moment_id, "moment_id");
    const s = await familyScope(me.id);
    const pair = pairKey(s, optKids(s, body.kind_ids));
    check(await db().from("handover_note_drafts").delete().eq("user_id", me.id).eq("moment_id", moment).eq("pair_key", pair), "delete draft");
    return ok({});
  },
}));
