// manage-pickups — who picks up / drops off a child at a handover or appointment, "Ik ben onderweg" and
// arrival check-ins, and help requests ("Hulp vragen") to the circle. Session required.
//
// Parents (actions: list, assign, withdraw, checkin, help-ask, help-withdraw)
//  - assign only for children they have access to; the record is addressed to the ONE other parent of
//    those children (pairOf, per-child co-parents; NULL for Solo children). Only the creator and that
//    other parent see it and can withdraw / reassign.
//  - the assignee is the caller, that other parent, or a circle member of every child: with the app it
//    needs live access and a "wissel" or "agenda" grant (view) for every child; a contact without the
//    app can only be registered (no digital confirmation).
// Caregivers (actions: mine, respond, packed, on-the-way, arrived, help-respond)
//  - only the assignee / recipient answers, and only while its circle access is live and still grants
//    the section for every child. A missing item and an item that is not theirs give the same NOT_FOUND.
import { db } from "../_shared/db.ts";
import { check, err, HttpError, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { assertChildAccess, childIdsFor, pairOf } from "../_shared/access.ts";
import { logAudit, notify } from "../_shared/practical-audit.ts";
import { namesFor } from "../_shared/practical-scope.ts";
import { CAREGIVER_COLS, type Grant, grantsAll, hasLiveAccess, liveCaregiverRows, rowGrants, todayNl } from "../_shared/family-caregivers.ts";
import { optDate, optText, reqText, requireUuid } from "../_shared/util.ts";

type Row = Record<string, any>;

const A_COLS =
  "id, created_by, other_parent_id, moment_key, moment_type, moment_date, moment_time, place, title, child_ids, assignee_type, " +
  "assignee_parent_id, caregiver_id, status, responded_at, reason, packed_items, on_the_way_at, arrived_at, withdrawn_at, created_at, updated_at";
const C_COLS = "id, user_id, other_parent_id, moment_key, moment_date, moment_time, child_ids, kind, created_at";
const H_COLS = "id, created_by, other_parent_id, child_ids, what, req_date, req_time, status, accepted_caregiver_id, accepted_at, withdrawn_at, created_at, updated_at";
const R_COLS = "request_id, caregiver_id, status, responded_at, reason";

const ACTIVE = ["requested", "accepted"];
const PICKUP_SECTIONS = ["wissel", "agenda"];
const HELP_SECTIONS = ["wissel", "agenda", "taken"];
const KEY_RE = /^[0-9A-Za-z|:_.-]{1,120}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const notOpen = () => new HttpError(409, "NOT_OPEN" as any, "This request is no longer open");

// ---------------------------------------------------------------------------- validation

function momentKey(v: unknown): string {
  if (typeof v !== "string" || !KEY_RE.test(v)) throw err.validation("moment_key is invalid");
  return v;
}
function reqDate(v: unknown, field: string): string {
  const d = optDate(v, field);
  if (!d) throw err.validation(`${field} is required`);
  return d;
}
function optTime(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !TIME_RE.test(v)) throw err.validation(`${field} must be HH:MM`);
  return v;
}
function childList(v: unknown): string[] {
  if (!Array.isArray(v) || !v.length) throw err.validation("child_ids must be a non-empty array");
  if (v.length > 20) throw err.validation("too many children");
  return [...new Set(v.map((x) => requireUuid(x, "child_ids[]")))];
}
/** NL calendar date `n` days before today. */
function daysAgo(n: number): string {
  const d = new Date(`${todayNl()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
/** Short date (+ time) for notification texts, in the actor's language. */
function dateLabel(date: string, time: string | null, isEn: boolean): string {
  const s = new Intl.DateTimeFormat(isEn ? "en-GB" : "nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${String(date).slice(0, 10)}T12:00:00Z`));
  return time ? `${s} ${time}` : s;
}
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const nowIso = () => new Date().toISOString();
const day = (v: unknown) => (v ? String(v).slice(0, 10) : null);

// ---------------------------------------------------------------------------- loading

async function caregivers(ids: string[]): Promise<Map<string, Row>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const rows = (check(await db().from("family_caregivers").select(CAREGIVER_COLS).in("id", uniq), "load caregivers") ?? []) as Row[];
  return new Map(rows.map((r) => [r.id, r]));
}

async function childNames(ids: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const rows = (check(await db().from("children").select("id, name").in("id", uniq), "child names") ?? []) as Row[];
  return Object.fromEntries(rows.map((r) => [r.id, r.name ?? ""]));
}

async function loadAssignment(id: string): Promise<Row> {
  const r = check(await db().from("pickup_assignments").select(A_COLS).eq("id", id).maybeSingle(), "load assignment") as Row | null;
  if (!r) throw err.notFound();
  return r;
}

async function loadHelp(id: string): Promise<Row> {
  const r = check(await db().from("help_requests").select(H_COLS).eq("id", id).maybeSingle(), "load help request") as Row | null;
  if (!r) throw err.notFound();
  return r;
}

/** A parent sees a record they made or that is addressed to them, and only while they still have every child. */
function parentSees(meId: string, mine: Set<string>, ownerId: string, otherId: string | null, childIds: string[]): boolean {
  if (ownerId !== meId && otherId !== meId) return false;
  return (childIds ?? []).every((c) => mine.has(c));
}

interface Care {
  rows: Row[];
  ids: string[];
  grants: Grant[];
}
/** This account as a caregiver: its live circle records and their grants. */
async function careOf(userId: string): Promise<Care> {
  const rows = await liveCaregiverRows(userId);
  return { rows, ids: rows.map((r) => r.id), grants: await rowGrants(rows) };
}
const parentsOf = (r: Row) => [r.created_by, r.other_parent_id].filter(Boolean) as string[];

// ---------------------------------------------------------------------------- output

function assignmentOut(r: Row, meId: string | null, names: Record<string, string>, cg: Map<string, Row>) {
  const c = r.caregiver_id ? cg.get(r.caregiver_id) : null;
  return {
    id: r.id,
    moment_key: r.moment_key,
    moment_type: r.moment_type,
    date: day(r.moment_date),
    time: r.moment_time ?? null,
    place: r.place ?? null,
    title: r.title ?? null,
    child_ids: r.child_ids ?? [],
    assignee_type: r.assignee_type,
    assignee_id: r.assignee_type === "parent" ? r.assignee_parent_id : r.caregiver_id,
    assignee_name: r.assignee_type === "parent" ? names[r.assignee_parent_id] ?? "" : c?.name ?? "",
    assignee_role: c?.role ?? null,
    status: r.status,
    responded_at: r.responded_at ?? null,
    reason: r.reason ?? null,
    packed_items: r.packed_items ?? [],
    on_the_way_at: r.on_the_way_at ?? null,
    arrived_at: r.arrived_at ?? null,
    by_me: meId !== null && r.created_by === meId,
    created_at: r.created_at,
  };
}

const checkinOut = (r: Row, meId: string, names: Record<string, string>) => ({
  id: r.id,
  moment_key: r.moment_key,
  date: day(r.moment_date),
  time: r.moment_time ?? null,
  child_ids: r.child_ids ?? [],
  kind: r.kind,
  user_id: r.user_id,
  name: names[r.user_id] ?? "",
  mine: r.user_id === meId,
  at: r.created_at,
});

function helpOut(r: Row, meId: string | null, recipients: Row[], cg: Map<string, Row>) {
  return {
    id: r.id,
    child_ids: r.child_ids ?? [],
    what: r.what,
    date: day(r.req_date),
    time: r.req_time ?? null,
    status: r.status,
    accepted_by: r.accepted_caregiver_id ?? null,
    // caregivers never see the names of other circle members
    accepted_by_name: meId !== null && r.accepted_caregiver_id ? cg.get(r.accepted_caregiver_id)?.name ?? "" : null,
    accepted_at: r.accepted_at ?? null,
    by_me: meId !== null && r.created_by === meId,
    recipients: recipients.filter((x) => x.request_id === r.id).map((x) => ({
      caregiver_id: x.caregiver_id,
      name: cg.get(x.caregiver_id)?.name ?? "",
      status: x.status,
      responded_at: x.responded_at ?? null,
      reason: x.reason ?? null,
    })),
    created_at: r.created_at,
  };
}

// ---------------------------------------------------------------------------- audit + notifications

async function auditPickup(actorId: string, r: Row, action: "CREATED" | "UPDATED" | "CANCELLED" | "ACCEPTED" | "DECLINED", changes: { veld: string; oud?: string | null; nieuw?: string | null }[] = []) {
  return await logAudit({
    actorId,
    section: "overdracht",
    entityId: r.id,
    label: `${r.moment_type === "afspraak" && r.title ? r.title : "Halen en brengen"} · ${day(r.moment_date)}${r.moment_time ? ` ${r.moment_time}` : ""}`,
    action,
    changes,
    childIds: r.child_ids ?? [],
    familyIds: parentsOf(r),
    meta: { type: "ophalen" },
  });
}

// ---------------------------------------------------------------------------- actions

Deno.serve(serveActions("manage-pickups", {
  /** Parent: assignments, check-ins and help requests of their children (per-child pair only). */
  async list(req) {
    const me = await requireUser(req);
    const mine = new Set(await childIdsFor(me.id));
    if (!mine.size) return ok({ assignments: [], checkins: [], help: [] });
    const since = daysAgo(2);
    const [a, c, h] = await Promise.all([
      db().from("pickup_assignments").select(A_COLS).or(`created_by.eq.${me.id},other_parent_id.eq.${me.id}`)
        .gte("moment_date", since).neq("status", "withdrawn").order("moment_date", { ascending: true }).limit(400),
      db().from("pickup_checkins").select(C_COLS).or(`user_id.eq.${me.id},other_parent_id.eq.${me.id}`)
        .gte("moment_date", since).limit(400),
      db().from("help_requests").select(H_COLS).or(`created_by.eq.${me.id},other_parent_id.eq.${me.id}`)
        .gte("req_date", daysAgo(14)).order("req_date", { ascending: true }).limit(200),
    ]);
    const as = ((check(a, "list assignments") ?? []) as Row[]).filter((r) => parentSees(me.id, mine, r.created_by, r.other_parent_id, r.child_ids));
    const cs = ((check(c, "list checkins") ?? []) as Row[]).filter((r) => parentSees(me.id, mine, r.user_id, r.other_parent_id, r.child_ids));
    const hs = ((check(h, "list help") ?? []) as Row[]).filter((r) => parentSees(me.id, mine, r.created_by, r.other_parent_id, r.child_ids));
    const rec = hs.length
      ? ((check(await db().from("help_request_recipients").select(R_COLS).in("request_id", hs.map((r) => r.id)), "list recipients") ?? []) as Row[])
      : [];
    const cg = await caregivers([...as.map((r) => r.caregiver_id), ...rec.map((r) => r.caregiver_id), ...hs.map((r) => r.accepted_caregiver_id)]);
    const names = await namesFor([...as.map((r) => r.assignee_parent_id), ...cs.map((r) => r.user_id)]);
    return ok({
      assignments: as.map((r) => assignmentOut(r, me.id, names, cg)),
      checkins: cs.map((r) => checkinOut(r, me.id, names)),
      help: hs.map((r) => helpOut(r, me.id, rec, cg)),
    });
  },

  /** Parent: who picks up / drops off at this moment. Replaces the current active assignment of these children. */
  async assign(req, body, { isEn }) {
    const me = await requireUser(req);
    const childIds = childList(body.child_ids);
    for (const c of childIds) await assertChildAccess(me.id, c);
    const other = await pairOf(me.id, childIds);
    const key = momentKey(body.moment_key);
    const type = body.moment_type === "afspraak" ? "afspraak" : "wissel";
    const date = reqDate(body.date, "date");
    if (date < daysAgo(1)) throw err.validation("This moment has passed");
    const time = optTime(body.time, "time");
    const place = optText(body.place, "place", 200) ?? null;
    const title = optText(body.title, "title", 200) ?? null;
    const assigneeId = requireUuid(body.assignee_id, "assignee_id");

    const now = nowIso();
    const row: Row = {
      created_by: me.id, other_parent_id: other, moment_key: key, moment_type: type, moment_date: date, moment_time: time,
      place, title, child_ids: childIds, packed_items: [], updated_at: now,
    };
    let cg: Row | null = null;
    if (body.assignee_type === "parent") {
      if (assigneeId !== me.id && assigneeId !== other) throw err.notFound();
      Object.assign(row, { assignee_type: "parent", assignee_parent_id: assigneeId, status: "accepted", responded_at: now });
    } else if (body.assignee_type === "caregiver") {
      cg = (await caregivers([assigneeId])).get(assigneeId) ?? null;
      if (!cg || cg.revoked_at || cg.status === "revoked" || !childIds.every((c) => (cg!.child_ids ?? []).includes(c))) throw err.notFound();
      if (cg.status === "contact_only") {
        // a contact without the app: the parent registers it, there is no digital confirmation
        Object.assign(row, { assignee_type: "contact", caregiver_id: cg.id, status: "accepted", responded_at: now });
      } else {
        if (!hasLiveAccess(cg)) throw err.forbidden("This person has no access to the app (yet)");
        if (!grantsAll(await rowGrants([cg]), cg.id, childIds, PICKUP_SECTIONS)) throw err.forbidden("No access to handovers or agenda of these children");
        Object.assign(row, { assignee_type: "caregiver", caregiver_id: cg.id, status: "requested", responded_at: null });
      }
    } else throw err.validation("assignee_type must be parent or caregiver");

    // the current active assignment(s) of this moment for these children
    const mine = new Set(await childIdsFor(me.id));
    const prev = ((check(
      await db().from("pickup_assignments").select(A_COLS).eq("moment_key", key).in("status", [...ACTIVE, "declined"])
        .overlaps("child_ids", childIds).or(`created_by.eq.${me.id},other_parent_id.eq.${me.id}`),
      "current assignments",
    ) ?? []) as Row[]).filter((r) => parentSees(me.id, mine, r.created_by, r.other_parent_id, r.child_ids));
    const assigneeOf = (r: Row) => (r.assignee_type === "parent" ? r.assignee_parent_id : r.caregiver_id);
    const same = prev.find((r) => ACTIVE.includes(r.status) && assigneeOf(r) === assigneeId && sameSet(r.child_ids ?? [], childIds));
    const names = await namesFor([me.id, other ?? "", row.assignee_parent_id ?? ""]);
    const cgMap = await caregivers([...prev.map((r) => r.caregiver_id), cg?.id ?? ""]);
    if (same) {
      // nothing changes for the assignee; keep the moment details current
      const u = check(await db().from("pickup_assignments").update({ moment_time: time, place, title, moment_date: date, updated_at: now }).eq("id", same.id).select(A_COLS).single(), "refresh assignment") as Row;
      return ok({ assignment: assignmentOut(u, me.id, names, cgMap), replaced: [] });
    }
    if (prev.length) {
      check(
        await db().from("pickup_assignments").update({ status: "withdrawn", withdrawn_by: me.id, withdrawn_at: now, updated_at: now }).in("id", prev.map((r) => r.id)),
        "replace assignments",
      );
    }
    const saved = check(await db().from("pickup_assignments").insert(row).select(A_COLS).single(), "insert assignment") as Row;
    const label = dateLabel(date, time, isEn);
    const nameOf = (r: Row) => r.assignee_type === "parent" ? (names[r.assignee_parent_id] ?? "") : (cgMap.get(r.caregiver_id)?.name ?? "");
    const auditId = await auditPickup(me.id, saved, prev.length ? "UPDATED" : "CREATED", [{ veld: "verantwoordelijke", oud: prev[0] ? nameOf(prev[0]) : null, nieuw: nameOf(saved) }]);

    // the previous caregiver no longer has to come
    for (const p of prev) {
      if (p.assignee_type !== "caregiver" || !ACTIVE.includes(p.status)) continue;
      const u = cgMap.get(p.caregiver_id)?.connected_user_id;
      if (u) await notify({ to: u, actorId: me.id, type: "pickup", category: "wijziging", key: "ophaalIngetrokken", params: { datum: label }, link: "/verzorger", entityType: "pickup", entityId: p.id, childIds: p.child_ids ?? [] });
    }
    if (saved.assignee_type === "caregiver" && cg?.connected_user_id) {
      await notify({ to: cg.connected_user_id, actorId: me.id, type: "pickup", category: "actie", key: "ophaalGevraagd", params: { datum: label }, link: "/verzorger", entityType: "pickup", entityId: saved.id, childIds });
    }
    if (other) {
      const forOther = saved.assignee_type === "parent" && saved.assignee_parent_id === other;
      await notify({
        to: other, actorId: me.id, type: "pickup", category: forOther ? "actie" : "wijziging", key: forOther ? "ophaalVoorJou" : "ophaalToegewezen",
        params: { datum: label }, link: `/kring/${childIds[0]}`, entityType: "pickup", entityId: saved.id, childIds, auditId,
      });
    }
    return ok({ assignment: assignmentOut(saved, me.id, names, cgMap), replaced: prev.map((r) => r.id) });
  },

  /** Parent: withdraw an assignment (also to clear a declined one). */
  async withdraw(req, body, { isEn }) {
    const me = await requireUser(req);
    const r = await loadAssignment(requireUuid(body.id, "id"));
    const mine = new Set(await childIdsFor(me.id));
    if (!parentSees(me.id, mine, r.created_by, r.other_parent_id, r.child_ids)) throw err.notFound();
    if (![...ACTIVE, "declined"].includes(r.status)) throw notOpen();
    const now = nowIso();
    check(await db().from("pickup_assignments").update({ status: "withdrawn", withdrawn_by: me.id, withdrawn_at: now, updated_at: now }).eq("id", r.id), "withdraw assignment");
    const auditId = await auditPickup(me.id, r, "CANCELLED");
    const label = dateLabel(day(r.moment_date)!, r.moment_time, isEn);
    if (r.assignee_type === "caregiver" && ACTIVE.includes(r.status)) {
      const u = (await caregivers([r.caregiver_id])).get(r.caregiver_id)?.connected_user_id;
      if (u) await notify({ to: u, actorId: me.id, type: "pickup", category: "wijziging", key: "ophaalIngetrokken", params: { datum: label }, link: "/verzorger", entityType: "pickup", entityId: r.id, childIds: r.child_ids ?? [] });
    }
    const otherParent = parentsOf(r).find((p) => p !== me.id);
    if (otherParent) await notify({ to: otherParent, actorId: me.id, type: "pickup", category: "wijziging", key: "ophaalGewist", params: { datum: label }, link: `/kring/${(r.child_ids ?? [])[0]}`, entityType: "pickup", entityId: r.id, childIds: r.child_ids ?? [], auditId });
    return ok({});
  },

  /** Parent: "Ik ben onderweg" / arrival for a moment. Visible to the other parent of these children. */
  async checkin(req, body, { isEn }) {
    const me = await requireUser(req);
    const childIds = childList(body.child_ids);
    for (const c of childIds) await assertChildAccess(me.id, c);
    const other = await pairOf(me.id, childIds);
    const kind = body.kind === "aangekomen" ? "aangekomen" : body.kind === "onderweg" ? "onderweg" : null;
    if (!kind) throw err.validation("kind must be onderweg or aangekomen");
    const key = momentKey(body.moment_key);
    const date = reqDate(body.date, "date");
    const today = todayNl();
    if (date < daysAgo(1) || date > today) throw err.validation("Check-ins are only possible on the day itself");
    const time = optTime(body.time, "time");
    const find = async () => {
      const qq = db().from("pickup_checkins").select(C_COLS).eq("user_id", me.id).eq("moment_key", key).eq("kind", kind);
      return check(await (other ? qq.eq("other_parent_id", other) : qq.is("other_parent_id", null)).limit(1).maybeSingle(), "find checkin") as Row | null;
    };
    const existing = await find();
    const names = await namesFor([me.id]);
    if (existing) return ok({ checkin: checkinOut(existing, me.id, names) });
    const ins = await db().from("pickup_checkins").insert({ user_id: me.id, other_parent_id: other, moment_key: key, moment_date: date, moment_time: time, child_ids: childIds, kind }).select(C_COLS).single();
    if (ins.error && (ins.error as { code?: string }).code === "23505") {
      // a parallel tap already checked in (uq_pickup_checkins_once): same answer, no second notification
      const again = await find();
      if (again) return ok({ checkin: checkinOut(again, me.id, names) });
    }
    const saved = check(ins, "insert checkin") as Row;
    if (other) {
      const auditId = await logAudit({ actorId: me.id, section: "overdracht", entityId: saved.id, label: `${kind === "onderweg" ? "Onderweg" : "Aangekomen"} · ${date}${time ? ` ${time}` : ""}`, action: "CREATED", childIds, familyIds: [me.id, other], meta: { type: kind } });
      await notify({ to: other, actorId: me.id, type: "pickup", category: "info", key: kind === "onderweg" ? "onderweg" : "aangekomen", params: { tijd: time ?? "", datum: dateLabel(date, null, isEn) }, link: "/overdracht", entityType: "pickup_checkin", entityId: saved.id, childIds, auditId });
    }
    return ok({ checkin: checkinOut(saved, me.id, names) });
  },

  /** Caregiver: own assignments and help requests (only with live access and the grants still in place). */
  async mine(req) {
    const me = await requireUser(req);
    const care = await careOf(me.id);
    if (!care.ids.length) return ok({ assignments: [], help: [], children: {} });
    const [a, r] = await Promise.all([
      db().from("pickup_assignments").select(A_COLS).in("caregiver_id", care.ids).eq("assignee_type", "caregiver")
        .in("status", ["requested", "accepted", "declined", "done"]).gte("moment_date", daysAgo(1)).order("moment_date", { ascending: true }).limit(200),
      db().from("help_request_recipients").select(R_COLS).in("caregiver_id", care.ids).limit(400),
    ]);
    const as = ((check(a, "my assignments") ?? []) as Row[]).filter((x) => grantsAll(care.grants, x.caregiver_id, x.child_ids ?? [], PICKUP_SECTIONS));
    const myRec = (check(r, "my help") ?? []) as Row[];
    const hs = myRec.length
      ? ((check(await db().from("help_requests").select(H_COLS).in("id", [...new Set(myRec.map((x) => x.request_id))]).gte("req_date", daysAgo(1)).neq("status", "withdrawn"), "help for me") ?? []) as Row[])
          .filter((h) => myRec.some((x) => x.request_id === h.id && grantsAll(care.grants, x.caregiver_id, h.child_ids ?? [], HELP_SECTIONS)))
      : [];

    // packing list of a handover: only for children with "spullen" and only the item names
    const meeByAssignment: Record<string, string[]> = {};
    const wissel = as.filter((x) => x.moment_type === "wissel");
    if (wissel.length) {
      // only items of children this caregiver was granted (never whole dates across families)
      const grantedKids = [...new Set(wissel.flatMap((x) => (x.child_ids ?? []) as string[]))]
        .filter((c) => care.grants.some((g) => g.child_id === c && g.section === "spullen"));
      const items = (grantedKids.length ? (check(
        await db().from("handover_checklist_items").select("moment_id, item_name, child_ids, removed, deleted_at")
          .in("moment_id", [...new Set(wissel.map((x) => day(x.moment_date)!))]).overlaps("child_ids", grantedKids).limit(500),
        "packing items",
      ) ?? []) as Row[] : []).filter((i) => !i.removed && (!i.deleted_at || i.deleted_at > nowIso()));
      for (const x of wissel) {
        const allowed = (x.child_ids ?? []).filter((c: string) => grantsAll(care.grants, x.caregiver_id, [c], ["spullen"]));
        meeByAssignment[x.id] = [...new Set(items.filter((i) => i.moment_id === day(x.moment_date) && (i.child_ids ?? []).length && (i.child_ids ?? []).every((c: string) => allowed.includes(c))).map((i) => String(i.item_name)))];
      }
    }
    // a parent's "onderweg"/arrival for the moments this caregiver is part of
    const checkins = as.length
      ? ((check(await db().from("pickup_checkins").select(C_COLS).in("moment_key", [...new Set(as.map((x) => x.moment_key))])
        .overlaps("child_ids", [...new Set(as.flatMap((x) => (x.child_ids ?? []) as string[]))]).gte("moment_date", daysAgo(1)).limit(500), "checkins for me") ?? []) as Row[])
      : [];
    const cg = await caregivers([...as.map((x) => x.caregiver_id), ...hs.map((h) => h.accepted_caregiver_id)]);
    const names = await namesFor(checkins.map((x) => x.user_id));
    const kids = await childNames([...as.flatMap((x) => x.child_ids ?? []), ...hs.flatMap((h) => h.child_ids ?? [])]);
    return ok({
      assignments: as.map((x) => ({
        ...assignmentOut(x, null, {}, cg),
        mee: meeByAssignment[x.id] ?? [],
        checkins: checkins
          .filter((c) => c.moment_key === x.moment_key && parentsOf(x).includes(c.user_id) && (c.child_ids ?? []).some((k: string) => (x.child_ids ?? []).includes(k)))
          .map((c) => ({ kind: c.kind, name: names[c.user_id] ?? "", at: c.created_at })),
      })),
      help: hs.map((h) => helpOut(h, null, myRec, cg)),
      children: kids,
    });
  },

  /** Caregiver: accept ("Ik regel het") or decline ("Kan niet", optional reason) an assignment. */
  async respond(req, body, { isEn }) {
    const me = await requireUser(req);
    const answer = body.answer === "accept" ? "accepted" : body.answer === "decline" ? "declined" : null;
    if (!answer) throw err.validation("answer must be accept or decline");
    const reason = answer === "declined" ? optText(body.reason, "reason", 300) ?? null : null;
    const r = await loadAssignment(requireUuid(body.id, "id"));
    const care = await careOf(me.id);
    if (r.assignee_type !== "caregiver" || !care.ids.includes(r.caregiver_id) || !grantsAll(care.grants, r.caregiver_id, r.child_ids ?? [], PICKUP_SECTIONS)) throw err.notFound();
    if (!["requested", "accepted", "declined"].includes(r.status) || r.arrived_at) throw notOpen();
    if (r.status === answer) return ok({ assignment: assignmentOut(r, null, {}, await caregivers([r.caregiver_id])) });
    const now = nowIso();
    const u = check(
      await db().from("pickup_assignments").update({ status: answer, responded_at: now, reason, updated_at: now, ...(answer === "declined" ? { on_the_way_at: null } : {}) })
        .eq("id", r.id).eq("status", r.status).select(A_COLS),
      "respond assignment",
    ) as Row[] | null;
    if (!u || !u.length) throw notOpen();
    const cg = await caregivers([r.caregiver_id]);
    const auditId = await auditPickup(me.id, u[0], answer === "accepted" ? "ACCEPTED" : "DECLINED");
    await notify({
      to: parentsOf(r), actorId: me.id, type: "pickup", category: answer === "declined" ? "actie" : "wijziging",
      key: answer === "accepted" ? "ophaalGeaccepteerd" : "ophaalGeweigerd",
      params: { datum: dateLabel(day(r.moment_date)!, r.moment_time, isEn), naam: cg.get(r.caregiver_id)?.name ?? "" },
      link: `/kring/${(r.child_ids ?? [])[0]}`, entityType: "pickup", entityId: r.id, childIds: r.child_ids ?? [], auditId,
    });
    return ok({ assignment: assignmentOut(u[0], null, {}, cg) });
  },

  /** Caregiver: tick an item of the packing list (needs "spullen" contribute for a child of the moment). */
  async packed(req, body) {
    const me = await requireUser(req);
    const item = reqText(body.item, "item", 100);
    const r = await loadAssignment(requireUuid(body.id, "id"));
    const care = await careOf(me.id);
    if (r.assignee_type !== "caregiver" || !care.ids.includes(r.caregiver_id) || !grantsAll(care.grants, r.caregiver_id, r.child_ids ?? [], PICKUP_SECTIONS)) throw err.notFound();
    if (!(r.child_ids ?? []).some((c: string) => grantsAll(care.grants, r.caregiver_id, [c], ["spullen"], "bijdragen"))) throw err.forbidden("No permission for belongings");
    if (!ACTIVE.includes(r.status)) throw notOpen();
    const list: string[] = r.packed_items ?? [];
    const next = body.packed === true ? [...new Set([...list, item])] : list.filter((x) => x !== item);
    if (next.length > 100) throw err.validation("too many items");
    const u = check(await db().from("pickup_assignments").update({ packed_items: next, updated_at: nowIso() }).eq("id", r.id).select(A_COLS).single(), "pack") as Row;
    return ok({ assignment: assignmentOut(u, null, {}, await caregivers([r.caregiver_id])) });
  },

  /** Caregiver: "Ik ben onderweg" for an accepted assignment (on the day itself). */
  async "on-the-way"(req, body, { isEn }) {
    return await caregiverStep(req, body, isEn, "on_the_way_at", "onderweg");
  },

  /** Caregiver: "Ik ben er" for an accepted assignment (on the day itself). */
  async arrived(req, body, { isEn }) {
    return await caregiverStep(req, body, isEn, "arrived_at", "aangekomen");
  },

  /** Parent: ask chosen circle members for help (each needs a grant for every child). */
  async "help-ask"(req, body, { isEn }) {
    const me = await requireUser(req);
    const childIds = childList(body.child_ids);
    for (const c of childIds) await assertChildAccess(me.id, c);
    const other = await pairOf(me.id, childIds);
    const what = reqText(body.what, "what", 200);
    const date = reqDate(body.date, "date");
    if (date < todayNl()) throw err.validation("date has passed");
    const time = optTime(body.time, "time");
    if (!Array.isArray(body.recipients) || !body.recipients.length || body.recipients.length > 20) throw err.validation("recipients must be a non-empty list");
    const ids = [...new Set(body.recipients.map((x: unknown) => requireUuid(x, "recipients[]")))] as string[];
    const cg = await caregivers(ids);
    const rows = ids.map((id) => cg.get(id)).filter(Boolean) as Row[];
    if (rows.length !== ids.length) throw err.notFound();
    const grants = await rowGrants(rows);
    for (const r of rows) {
      if (!childIds.every((c) => (r.child_ids ?? []).includes(c))) throw err.notFound();
      if (!hasLiveAccess(r) || !grantsAll(grants, r.id, childIds, HELP_SECTIONS)) throw err.forbidden("This person has no access for these children");
    }
    const saved = check(
      await db().from("help_requests").insert({ created_by: me.id, other_parent_id: other, child_ids: childIds, what, req_date: date, req_time: time, status: "open" }).select(H_COLS).single(),
      "insert help request",
    ) as Row;
    const rec = check(
      await db().from("help_request_recipients").insert(rows.map((r) => ({ request_id: saved.id, caregiver_id: r.id, status: "requested" }))).select(R_COLS),
      "insert recipients",
    ) as Row[];
    const auditId = await logAudit({ actorId: me.id, section: "taak", entityId: saved.id, label: what, action: "CREATED", childIds, familyIds: [me.id, other], meta: { type: "hulpverzoek" } });
    const users = rows.map((r) => r.connected_user_id).filter(Boolean);
    if (users.length) await notify({ to: users, actorId: me.id, type: "help", category: "actie", key: "hulpGevraagd", params: { taak: what, datum: dateLabel(date, time, isEn) }, link: "/verzorger", entityType: "help_request", entityId: saved.id, childIds });
    if (other) await notify({ to: other, actorId: me.id, type: "help", category: "info", key: "hulpVerstuurd", params: { taak: what }, link: "/taken", entityType: "help_request", entityId: saved.id, childIds, auditId });
    return ok({ help: helpOut(saved, me.id, rec ?? [], cg) });
  },

  /** Parent (the requester): withdraw an open help request. */
  async "help-withdraw"(req, body) {
    const me = await requireUser(req);
    const h = await loadHelp(requireUuid(body.id, "id"));
    const mine = new Set(await childIdsFor(me.id));
    if (!parentSees(me.id, mine, h.created_by, h.other_parent_id, h.child_ids)) throw err.notFound();
    if (h.created_by !== me.id) throw err.forbidden("Only the parent who asked can withdraw this");
    if (h.status === "withdrawn") return ok({});
    const now = nowIso();
    check(await db().from("help_requests").update({ status: "withdrawn", withdrawn_at: now, updated_at: now }).eq("id", h.id), "withdraw help");
    check(await db().from("help_request_recipients").update({ status: "closed" }).eq("request_id", h.id).eq("status", "requested"), "close recipients");
    await logAudit({ actorId: me.id, section: "taak", entityId: h.id, label: h.what, action: "CANCELLED", childIds: h.child_ids ?? [], familyIds: [h.created_by, h.other_parent_id], meta: { type: "hulpverzoek" } });
    const rec = (check(await db().from("help_request_recipients").select(R_COLS).eq("request_id", h.id), "recipients") ?? []) as Row[];
    const cg = await caregivers(rec.map((r) => r.caregiver_id));
    const users = rec.map((r) => cg.get(r.caregiver_id)?.connected_user_id).filter(Boolean) as string[];
    if (users.length) await notify({ to: users, actorId: me.id, type: "help", category: "wijziging", key: "hulpIngetrokken", params: { taak: h.what }, link: "/verzorger", entityType: "help_request", entityId: h.id, childIds: h.child_ids ?? [] });
    return ok({});
  },

  /** Caregiver (a recipient): "Ik regel het" (first one wins) or "Kan niet" (optional reason). */
  async "help-respond"(req, body) {
    const me = await requireUser(req);
    const answer = body.answer === "accept" ? "accepted" : body.answer === "decline" ? "declined" : null;
    if (!answer) throw err.validation("answer must be accept or decline");
    const reason = answer === "declined" ? optText(body.reason, "reason", 300) ?? null : null;
    const h = await loadHelp(requireUuid(body.id, "id"));
    const care = await careOf(me.id);
    const mineRec = (check(await db().from("help_request_recipients").select(R_COLS).eq("request_id", h.id).in("caregiver_id", care.ids.length ? care.ids : ["00000000-0000-0000-0000-000000000000"]), "my recipient") ?? []) as Row[];
    const rec = mineRec.find((x) => grantsAll(care.grants, x.caregiver_id, h.child_ids ?? [], HELP_SECTIONS));
    if (!rec || h.status === "withdrawn") throw err.notFound();
    if (h.status !== "open" || rec.status !== "requested") throw notOpen();
    const now = nowIso();
    if (answer === "accepted") {
      const won = check(
        await db().from("help_requests").update({ status: "accepted", accepted_caregiver_id: rec.caregiver_id, accepted_at: now, updated_at: now }).eq("id", h.id).eq("status", "open").select("id"),
        "accept help",
      ) as Row[] | null;
      if (!won || !won.length) throw notOpen();
      check(await db().from("help_request_recipients").update({ status: "accepted", responded_at: now }).eq("request_id", h.id).eq("caregiver_id", rec.caregiver_id), "accept recipient");
      check(await db().from("help_request_recipients").update({ status: "closed" }).eq("request_id", h.id).eq("status", "requested"), "close others");
    } else {
      check(await db().from("help_request_recipients").update({ status: "declined", responded_at: now, reason }).eq("request_id", h.id).eq("caregiver_id", rec.caregiver_id), "decline recipient");
      const left = (check(await db().from("help_request_recipients").select("status").eq("request_id", h.id).eq("status", "requested"), "open recipients") ?? []) as Row[];
      if (!left.length) check(await db().from("help_requests").update({ status: "declined", updated_at: now }).eq("id", h.id).eq("status", "open"), "all declined");
    }
    const cg = await caregivers([rec.caregiver_id]);
    const naam = cg.get(rec.caregiver_id)?.name ?? "";
    const auditId = await logAudit({ actorId: me.id, section: "taak", entityId: h.id, label: h.what, action: answer === "accepted" ? "ACCEPTED" : "DECLINED", childIds: h.child_ids ?? [], familyIds: [h.created_by, h.other_parent_id], meta: { type: "hulpverzoek" } });
    await notify({
      to: [h.created_by, h.other_parent_id].filter(Boolean) as string[], actorId: me.id, type: "help", category: answer === "accepted" ? "wijziging" : "actie",
      key: answer === "accepted" ? "hulpGeaccepteerd" : "hulpAfgewezen", params: { taak: h.what, naam }, link: "/taken", entityType: "help_request", entityId: h.id, childIds: h.child_ids ?? [], auditId,
    });
    const fresh = await loadHelp(h.id);
    const all = (check(await db().from("help_request_recipients").select(R_COLS).eq("request_id", h.id), "recipients") ?? []) as Row[];
    return ok({ help: helpOut(fresh, null, all.filter((x) => care.ids.includes(x.caregiver_id)), cg) });
  },
}));

/** Shared by on-the-way / arrived: the assignee caregiver, accepted, on the day of the moment. */
async function caregiverStep(req: Request, body: Row, isEn: boolean, column: "on_the_way_at" | "arrived_at", key: "onderweg" | "aangekomen") {
  const me = await requireUser(req);
  const r = await loadAssignment(requireUuid(body.id, "id"));
  const care = await careOf(me.id);
  if (r.assignee_type !== "caregiver" || !care.ids.includes(r.caregiver_id) || !grantsAll(care.grants, r.caregiver_id, r.child_ids ?? [], PICKUP_SECTIONS)) throw err.notFound();
  if (r.status !== "accepted") throw notOpen();
  const date = day(r.moment_date)!;
  if (date < daysAgo(1) || date > todayNl()) throw err.validation("Only on the day itself");
  if (r[column]) return ok({ assignment: assignmentOut(r, null, {}, await caregivers([r.caregiver_id])) });
  const now = nowIso();
  const u = check(await db().from("pickup_assignments").update({ [column]: now, updated_at: now }).eq("id", r.id).select(A_COLS).single(), key) as Row;
  const cg = await caregivers([r.caregiver_id]);
  await notify({
    to: parentsOf(r), actorId: me.id, type: "pickup", category: "info", key,
    params: { tijd: r.moment_time ?? "", datum: dateLabel(date, null, isEn), naam: cg.get(r.caregiver_id)?.name ?? "" },
    link: "/overdracht", entityType: "pickup", entityId: r.id, childIds: r.child_ids ?? [],
  });
  return ok({ assignment: assignmentOut(u, null, {}, cg) });
}
