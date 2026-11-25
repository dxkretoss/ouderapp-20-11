// manage-agenda — appointments (calendar_events) with proposals, care-schedule change proposals with
// exceptions/versions, attendance coordination and "Nu afstemmen". Session required for every action.
// Rules: the user comes from the session only; private appointments are only ever visible to their owner;
// shared edits by a connected parent become proposals the OTHER parent answers (Akkoord / Ander voorstel /
// Niet akkoord / Meer tijd nodig); without a connected parent for those children changes apply directly;
// final statuses never change; a reply date is only a request; every shared change is audited.
import { db } from "../_shared/db.ts";
import { check, err, HttpError, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { requireUuid } from "../_shared/util.ts";
import {
  assertOnePair, assertResponder, audit, canSee, childIdsFromBody, coParentsFor, dateList, familyScope, optDateStr, optTime,
  reqDateStr, response, Scope, str, toAbs, toRel, today,
} from "../_shared/agenda-family.ts";
import { notify, NotifyCategory } from "../_shared/practical-audit.ts";

/* ================================================================ appointments */
const CATEGORIES: Record<string, string> = {
  school: "School", opvang: "Care", sport: "Sport", medisch: "Medical", verjaardag: "Celebration",
  vakantie: "Vacation", wissel: "Care", overig: "General",
};
const FREQ = ["geen", "wekelijks", "tweewekelijks", "maandelijks", "aangepast"];
const REMINDERS = ["geen", "uur", "dag", "twee"];
const SCOPES = ["alleen", "toekomst", "reeks"];
const EVENT_COLS =
  "id, created_by, title, category, category_key, start_date, start_time, end_date, end_time, is_all_day, location, description, is_shared, recurrence, skipped_dates, child_ids, reminder, take_along, deleted_at, created_at, updated_at";

type Row = Record<string, any>;

/* ---------- notifications (shared items only; only the other parent of the children involved) ---------- */
async function kidNames(ids: string[]): Promise<string> {
  if (!ids?.length) return "";
  const { data } = await db().from("children").select("name").in("id", ids);
  return ((data ?? []) as Row[]).map((c) => String(c.name)).join(" & ").slice(0, 80);
}
/** Best-effort: never fails the action. `to` = explicit recipients, otherwise the co-parents of `childIds`. */
async function tell(me: string, s: Scope, o: { to?: string | null; childIds: string[]; key: string; category: NotifyCategory; type?: string; titel?: string | null; datum?: string | null; entityId?: string }) {
  try {
    const to = o.to !== undefined ? (o.to ? [o.to] : []) : coParentsFor(s, o.childIds ?? []);
    if (!to.length) return;
    const params: Record<string, string> = {};
    if (o.titel) params.titel = String(o.titel).slice(0, 80);
    if (o.datum) params.datum = o.datum;
    const kind = await kidNames(o.childIds ?? []);
    if (kind) params.kind = kind;
    await notify({ to, actorId: me, type: o.type ?? "care", category: o.category, key: o.key, params, link: "/agenda", entityType: o.type ?? "care", entityId: o.entityId, childIds: o.childIds ?? [] });
  } catch (e) {
    console.warn("[manage-agenda] notify failed:", (e as Error)?.message ?? e);
  }
}

function recurrenceIn(v: unknown): Row | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) throw err.validation("herhaling must be an object");
  const h = v as Row;
  if (!FREQ.includes(h.freq)) throw err.validation("herhaling.freq is invalid");
  if (h.freq === "geen") return null;
  const interval = Number(h.interval ?? 1);
  if (!Number.isInteger(interval) || interval < 1 || interval > 12) throw err.validation("herhaling.interval is invalid");
  const eenheid = h.eenheid === "maanden" ? "maanden" : "weken";
  const eind = optDateStr(h.eind, "herhaling.eind");
  return { freq: h.freq, interval, eenheid, ...(eind ? { eind } : {}) };
}

/** Validated appointment fields in the app's shape (also stored as-is inside proposals). */
function fieldsIn(s: Scope, v: unknown): Row {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw err.validation("fields must be an object");
  const f = v as Row;
  const gedeeld = f.gedeeld !== false;
  const kindIds = childIdsFromBody(s, f.kind_ids, { required: gedeeld });
  if (gedeeld) assertOnePair(s, kindIds);
  const categorie = typeof f.categorie === "string" && f.categorie in CATEGORIES ? f.categorie : "overig";
  const startDatum = reqDateStr(f.datum, "datum");
  const eindDatum = optDateStr(f.einddatum, "einddatum");
  if (eindDatum && eindDatum < startDatum) throw err.validation("einddatum must be on or after datum");
  const neemMee = Array.isArray(f.neem_mee) ? f.neem_mee.slice(0, 30).map((x: unknown) => str(x, "neem_mee", 100)).filter(Boolean) : [];
  return {
    titel: str(f.titel, "titel", 200, true),
    datum: startDatum,
    einddatum: eindDatum && eindDatum !== startDatum ? eindDatum : null,
    tijd: optTime(f.tijd, "tijd"),
    eindtijd: optTime(f.eindtijd, "eindtijd"),
    heleDag: f.heleDag === true,
    categorie,
    kind_ids: kindIds,
    herhaling: recurrenceIn(f.herhaling),
    locatie: str(f.locatie, "locatie", 300),
    toelichting: str(f.toelichting, "toelichting", 2000),
    herinnering: REMINDERS.includes(f.herinnering) ? f.herinnering : "geen",
    gedeeld,
    neem_mee: neemMee,
  };
}

function rowFromFields(f: Row): Row {
  return {
    title: f.titel, start_date: f.datum, end_date: f.einddatum, start_time: f.tijd, end_time: f.eindtijd,
    is_all_day: !!f.heleDag, category: CATEGORIES[f.categorie] ?? "General", category_key: f.categorie,
    child_ids: f.kind_ids, child_id: f.kind_ids[0] ?? null, recurrence: f.herhaling, location: f.locatie,
    description: f.toelichting, reminder: f.herinnering, is_shared: f.gedeeld, take_along: f.neem_mee ?? [],
  };
}

function eventOut(r: Row, me: string) {
  return {
    id: r.id, mine: r.created_by === me, titel: r.title, datum: r.start_date, einddatum: r.end_date ?? null,
    tijd: r.start_time ? String(r.start_time).slice(0, 5) : "", eindtijd: r.end_time ? String(r.end_time).slice(0, 5) : null,
    heleDag: !!r.is_all_day, categorie: r.category_key ?? "overig", kind_ids: r.child_ids ?? [], herhaling: r.recurrence ?? null,
    overslaan: r.skipped_dates ?? [], locatie: r.location ?? null, toelichting: r.description ?? null,
    herinnering: r.reminder ?? "geen", gedeeld: r.is_shared !== false, neem_mee: r.take_along ?? [],
    created_at: r.created_at, updated_at: r.updated_at,
  };
}

const plusDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const isSeries = (r: Row) => !!r.recurrence && r.recurrence.freq && r.recurrence.freq !== "geen";

async function loadEvent(s: Scope, id: string): Promise<Row> {
  const r = check(await db().from("calendar_events").select(EVENT_COLS).eq("id", id).is("deleted_at", null).maybeSingle(), "load event") as Row | null;
  if (!r || !canSee(s, r)) throw err.notFound("Appointment not found");
  return r;
}

async function insertEvent(owner: string, f: Row): Promise<Row> {
  return check(await db().from("calendar_events").insert({ ...rowFromFields(f), created_by: owner, status: "confirmed" }).select(EVENT_COLS).single(), "insert event") as Row;
}

/** The same scope rules as the app: only this date / this and future dates / the whole series. */
async function applyUpdate(r: Row, f: Row, scope: string, occ: string | null, actor: string): Promise<Row[]> {
  if (!isSeries(r) || scope === "reeks" || (scope === "toekomst" && occ === r.start_date) || !occ) {
    const row = rowFromFields({ ...f, datum: isSeries(r) && scope !== "toekomst" ? r.start_date : f.datum });
    return [check(await db().from("calendar_events").update(row).eq("id", r.id).select(EVENT_COLS).single(), "update event") as Row];
  }
  if (scope === "alleen") {
    const skipped = [...new Set([...(r.skipped_dates ?? []), occ])];
    const a = check(await db().from("calendar_events").update({ skipped_dates: skipped }).eq("id", r.id).select(EVENT_COLS).single(), "skip date") as Row;
    return [a, await insertEvent(r.created_by === actor ? actor : r.created_by, { ...f, herhaling: null })];
  }
  const ended = { ...r.recurrence, eind: plusDays(occ, -1) };
  const a = check(await db().from("calendar_events").update({ recurrence: ended }).eq("id", r.id).select(EVENT_COLS).single(), "end series") as Row;
  return [a, await insertEvent(r.created_by, f)];
}

async function applyDelete(r: Row, scope: string, occ: string | null, actor: string): Promise<void> {
  if (!isSeries(r) || scope === "reeks" || !occ || (scope === "toekomst" && occ === r.start_date)) {
    check(await db().from("calendar_events").update({ deleted_at: new Date().toISOString(), deleted_by: actor, status: "cancelled" }).eq("id", r.id), "delete event");
  } else if (scope === "alleen") {
    check(await db().from("calendar_events").update({ skipped_dates: [...new Set([...(r.skipped_dates ?? []), occ])] }).eq("id", r.id), "skip date");
  } else {
    check(await db().from("calendar_events").update({ recurrence: { ...r.recurrence, eind: plusDays(occ, -1) } }).eq("id", r.id), "end series");
  }
}

const EP_COLS = "id, event_id, created_by, kind, scope, occurrence_date, child_ids, fields, status, reply_by, more_time, reminders, response_note, responded_by, responded_at, created_at";
function eventProposalOut(p: Row, me: string) {
  return {
    id: p.id, event_id: p.event_id, mine: p.created_by === me, soort: p.kind === "create" ? "nieuw" : p.kind === "delete" ? "verwijder" : "wijzig",
    bereik: p.scope, datum: p.occurrence_date, kind_ids: p.child_ids ?? [], velden: p.kind === "delete" ? null : p.fields,
    status: p.status === "open" ? null : p.status, reactie_datum: p.reply_by, meer_tijd: moreTimeOut(p.more_time, me),
    toelichting: p.response_note ?? null, created_at: p.created_at, responded_at: p.responded_at,
  };
}
function moreTimeOut(m: Row | null, me: string) {
  return m ? { mine: m.by === me, datum: m.date, ...(m.until ? { tot: m.until } : {}) } : null;
}

async function loadEventProposal(id: string): Promise<Row> {
  const p = check(await db().from("calendar_event_proposals").select(EP_COLS).eq("id", id).maybeSingle(), "load event proposal") as Row | null;
  if (!p) throw err.notFound("Proposal not found");
  return p;
}

/** Creates an open proposal; an older open proposal of the same parent for this appointment is withdrawn first. */
async function proposeEvent(s: Scope, kind: string, ev: Row | null, f: Row | null, scope: string, occ: string | null, replyBy: string | null) {
  if (ev) {
    const open = check(await db().from("calendar_event_proposals").select("id, created_by").eq("event_id", ev.id).eq("status", "open"), "open proposals") as Row[];
    for (const o of open ?? []) {
      if (o.created_by !== s.me) throw new HttpError(409, "VALIDATION", "The other parent already proposed a change; answer that first");
      check(await db().from("calendar_event_proposals").update({ status: "ingetrokken", responded_at: new Date().toISOString() }).eq("id", o.id).eq("status", "open"), "withdraw older");
    }
  }
  const childIds = f?.kind_ids?.length ? f.kind_ids : ev?.child_ids ?? [];
  const p = check(await db().from("calendar_event_proposals").insert({
    event_id: ev?.id ?? null, created_by: s.me, kind, scope, occurrence_date: occ, child_ids: childIds, fields: f ?? {}, reply_by: replyBy,
  }).select(EP_COLS).single(), "insert event proposal") as Row;
  await audit(s.me, "afspraak", ev?.id ?? p.id, "CREATED", { item_naam: f?.titel ?? ev?.title, kinderen: childIds, meta: { voorstel: kind, status: "open", datum: f?.datum ?? occ, tijd: f?.tijd ?? null } });
  return p;
}

/* ================================================================ care schedule */
const CARE_COLS = "id, created_by, child_ids, type, proposal_date, soort, dates, naar, wisseltijd, plek, note, aanleiding, datum_label, reply_by, more_time, reminders, alternative, moment, reason, status, responded_by, responded_at, created_at";
const CARE_STATUS_OUT: Record<string, string> = { pending: "open", accepted: "geaccepteerd", declined: "afgewezen", counterproposal: "alternatief", withdrawn: "ingetrokken" };

function careOut(p: Row, me: string) {
  return {
    id: p.id, mine: p.created_by === me, soort: p.soort ?? (p.type === "recurring" ? "structureel" : "eenmalig"), kind_ids: p.child_ids ?? [],
    tekst: p.note ?? "", naar: toRel(p.naar, me), datums: p.dates ?? [], wisseltijd: p.wisseltijd ?? null, plek: p.plek ?? null,
    datum_label: p.datum_label ?? p.proposal_date, aanleiding: p.aanleiding ?? null, reactie_datum: p.reply_by ?? null,
    meer_tijd: moreTimeOut(p.more_time, me), herinneringen: p.reminders ?? [], alternatief: p.alternative ?? null,
    moment: p.moment ?? null, reden: p.reason ?? null, status: CARE_STATUS_OUT[p.status] ?? "open",
    created_at: p.created_at, responded_at: p.responded_at,
  };
}

function parseSchedule(v: unknown): Row | null {
  if (!v) return null;
  if (typeof v === "object") return v as Row;
  try { const x = JSON.parse(String(v)); return x && typeof x === "object" ? x : null; } catch { return null; }
}
const mondayOf = (d: string) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};
const dayIndex = (start: string, d: string) => {
  const n = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000);
  return ((n % 14) + 14) % 14;
};

/** New base-schedule version from `from`: same 14-day rhythm restarted that week, with the children at `naarAbs` on that day. */
async function versionFor(childId: string, from: string, naarAbs: string, wisseltijd: string | null, plek: string | null, actor: string): Promise<Row> {
  const versions = check(await db().from("care_schedule_versions").select("schedule, valid_from").eq("child_id", childId).lte("valid_from", from).order("valid_from", { ascending: false }).order("created_at", { ascending: false }).limit(1), "versions") as Row[];
  let base = parseSchedule(versions?.[0]?.schedule);
  if (!base) {
    const c = check(await db().from("children").select("care_schedule").eq("id", childId).single(), "base schedule") as Row;
    base = parseSchedule(c.care_schedule);
  }
  const ok14 = base && Array.isArray(base.dagen) && base.dagen.length === 14;
  const dagen: string[] = ok14 ? [...base!.dagen] : [...Array(7).fill("ik"), ...Array(7).fill("ander")];
  const ikId = ok14 && base!.ikId ? String(base!.ikId) : actor;
  const startMaandag = mondayOf(from);
  const who = naarAbs.startsWith("is:") ? naarAbs.slice(3) : null;
  const notWho = naarAbs.startsWith("not:") ? naarAbs.slice(4) : null;
  const target = who ? (who === ikId ? "ik" : "ander") : notWho ? (notWho === ikId ? "ander" : "ik") : "ik";
  const i = dayIndex(startMaandag, from);
  const flipped = dagen[i] === target ? dagen : dagen.map((d) => (d === "ik" ? "ander" : d === "ander" ? "ik" : d));
  return {
    ...(ok14 ? base : { patroonId: "om-de-week" }), dagen: flipped, startMaandag, ikId,
    wisseltijd: wisseltijd ?? (ok14 ? base!.wisseltijd : "14:30") ?? "14:30", ...(plek ? { plek } : {}),
  };
}

async function applyCare(p: Row, actor: string) {
  const naar = p.naar as string | null;
  if (!naar || p.aanleiding === "moment") return;
  if ((p.soort ?? "eenmalig") === "eenmalig") {
    const rows = (p.child_ids ?? []).flatMap((k: string) => (p.dates ?? []).map((d: string) => ({ child_id: k, date: d, parent: naar, proposal_id: p.id, created_by: actor })));
    if (rows.length) check(await db().from("care_schedule_exceptions").insert(rows), "insert exceptions");
  } else {
    const from = (p.dates ?? [])[0] ?? p.proposal_date;
    for (const k of p.child_ids ?? []) {
      const schedule = await versionFor(k, from, naar, p.wisseltijd ?? null, p.plek ?? null, actor);
      check(await db().from("care_schedule_versions").insert({ child_id: k, valid_from: from, schedule, proposal_id: p.id, created_by: actor }), "insert version");
    }
  }
}

async function loadCare(id: string): Promise<Row> {
  const p = check(await db().from("care_schedule_proposals").select(CARE_COLS).eq("id", id).maybeSingle(), "load care proposal") as Row | null;
  if (!p) throw err.notFound("Proposal not found");
  return p;
}

/** Final statuses are immutable: only an open proposal can change, guarded in SQL as well (status = pending). */
async function closeCare(p: Row, patch: Row): Promise<Row> {
  const r = check(await db().from("care_schedule_proposals").update(patch).eq("id", p.id).eq("status", "pending").select(CARE_COLS).maybeSingle(), "close care proposal") as Row | null;
  if (!r) throw new HttpError(409, "VALIDATION", "This proposal is already closed");
  return r;
}

/* ================================================================ attendance */
const KEUZES = ["samen", "een", "afzonderlijk", "later", "halen", "brengen"];
function attendanceOut(a: Row, me: string) {
  const rel = (x: unknown) => (x === "nog" || x === "onbekend" ? x : toRel(x, me));
  return {
    event_id: a.event_id, keuze: a.keuze, fase: a.fase, door: toRel(a.proposed_by ? `is:${a.proposed_by}` : null, me),
    wie_gaat: rel(a.wie_gaat), contact_wie: rel(a.contact_wie), uitkomst: a.uitkomst ?? null, uitkomst_toelichting: a.uitkomst_toelichting ?? null,
    nabespreking: a.nabespreking ? { ...a.nabespreking, door: toRel(a.nabespreking.door, me) } : null,
    geschiedenis: (a.history ?? []).map((h: Row) => ({ ...h, door: toRel(h.door, me), wie_gaat: rel(h.wie_gaat), contact_wie: rel(h.contact_wie) })),
    updated_at: a.updated_at,
  };
}
const relToAbsKeep = (v: unknown, me: string) => (v === "nog" || v === "onbekend" ? v : toAbs(v, me));

async function loadAttendance(eventId: string): Promise<Row | null> {
  return check(await db().from("appointment_attendance").select("*").eq("event_id", eventId).maybeSingle(), "load attendance") as Row | null;
}

/* ================================================================ urgent */
const URG_CATS = ["halen", "ziek", "planning", "vergeten", "anders"];
const URG_REPLY = ["zsm", "15", "30", "60", "eigen"];
function urgentOut(u: Row, me: string) {
  return {
    id: u.id, van: u.created_by === me ? "jij" : "ander", kind_ids: u.child_ids ?? [], categorie: u.categorie, titel: u.titel,
    toelichting: u.toelichting ?? "", reactie_gewenst: u.reactie_gewenst ?? "zsm", status: u.status, antwoord: u.antwoord ?? null,
    moment: u.created_at, oude_tijd: u.old_time ?? null, nieuwe_tijd: u.new_time ?? null,
  };
}

/* ================================================================ list helpers */
async function familyRows(table: string, cols: string, s: Scope, extra?: (q: any) => any): Promise<Row[]> {
  let q = db().from(table).select(cols);
  const kids = [...s.kids];
  q = kids.length ? q.or(`created_by.eq.${s.me},child_ids.ov.{${kids.join(",")}}`) : q.eq("created_by", s.me);
  if (extra) q = extra(q);
  return ((check(await q, `list ${table}`) ?? []) as Row[]).filter((r) => canSee(s, r));
}

function flipForViewer(schedule: Row | null, me: string) {
  if (!schedule) return null;
  const { ikId, ...r } = schedule;
  const flip = ikId && ikId !== me && Array.isArray(r.dagen);
  return { ...r, patroon: r.patroon ?? r.patroonId, ...(flip ? { dagen: r.dagen.map((d: string) => (d === "ik" ? "ander" : d === "ander" ? "ik" : d)) } : {}) };
}

/* ================================================================ actions */
Deno.serve(serveActions("manage-agenda", {
  /** Everything the agenda needs for this family, relative to the viewer. */
  async list(req) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const kids = [...s.kids];
    const [events, eventProposals, care, urgent] = await Promise.all([
      familyRows("calendar_events", EVENT_COLS, s, (q) => q.is("deleted_at", null)),
      familyRows("calendar_event_proposals", EP_COLS, s, (q) => q.order("created_at", { ascending: true })),
      familyRows("care_schedule_proposals", CARE_COLS, s, (q) => q.order("created_at", { ascending: true })),
      familyRows("urgent_requests", "*", s, (q) => q.gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString()).order("created_at", { ascending: false })),
    ]);
    const visibleEventIds = events.filter((e) => e.is_shared !== false).map((e) => e.id);
    const att = visibleEventIds.length ? (check(await db().from("appointment_attendance").select("*").in("event_id", visibleEventIds), "attendance") ?? []) as Row[] : [];
    const [exc, ver] = kids.length ? await Promise.all([
      db().from("care_schedule_exceptions").select("id, child_id, date, parent, reason, proposal_id, created_at").in("child_id", kids).order("created_at", { ascending: true }),
      db().from("care_schedule_versions").select("id, child_id, valid_from, schedule, proposal_id, created_at").in("child_id", kids).order("valid_from", { ascending: true }).order("created_at", { ascending: true }),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    return ok({
      events: events.map((e) => eventOut(e, me.id)),
      event_proposals: eventProposals.map((p) => eventProposalOut(p, me.id)),
      care_proposals: care.map((p) => careOut(p, me.id)),
      care_exceptions: ((check(exc as any, "exceptions") ?? []) as Row[]).map((x) => ({ id: x.id, kind_id: x.child_id, datum: x.date, ouder: toRel(x.parent, me.id), reden: x.reason ?? null, proposal_id: x.proposal_id })),
      care_versions: ((check(ver as any, "versions") ?? []) as Row[]).map((x) => ({ id: x.id, kind_id: x.child_id, vanaf: x.valid_from, regeling: flipForViewer(parseSchedule(x.schedule), me.id), proposal_id: x.proposal_id })),
      attendance: att.map((a) => attendanceOut(a, me.id)),
      urgent: urgent.map((u) => urgentOut(u, me.id)),
      connected: s.coParents.length > 0,
    });
  },

  /** New appointment: applied directly (also shared ones); `voorstel: true` sends it as a proposal to the other parent. */
  async "create-event"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const f = fieldsIn(s, body.fields);
    if (body.voorstel === true && f.gedeeld && coParentsFor(s, f.kind_ids).length) {
      const p = await proposeEvent(s, "create", null, f, "reeks", null, optDateStr(body.reply_by, "reply_by"));
      await tell(me.id, s, { childIds: f.kind_ids, key: "agendaVoorstel", category: "actie", titel: f.titel, datum: f.datum, entityId: p.id });
      return ok({ applied: false, proposal: eventProposalOut(p, me.id) });
    }
    const r = await insertEvent(me.id, f);
    if (f.gedeeld) await audit(me.id, "afspraak", r.id, "CREATED", { item_naam: f.titel, kinderen: f.kind_ids, meta: { datum: f.datum, tijd: f.tijd } });
    if (f.gedeeld) await tell(me.id, s, { childIds: f.kind_ids, key: "afspraakNieuw", category: "info", titel: f.titel, datum: f.datum, entityId: r.id });
    return ok({ applied: true, event: eventOut(r, me.id) });
  },

  /** Change: private or no connected parent → applied; otherwise a proposal for the other parent. */
  async "update-event"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const r = await loadEvent(s, requireUuid(body.event_id, "event_id"));
    const f = fieldsIn(s, body.fields);
    const scope = SCOPES.includes(body.scope) ? body.scope : "reeks";
    const occ = optDateStr(body.occurrence_date, "occurrence_date");
    if (r.is_shared === false && r.created_by !== me.id) throw err.notFound("Appointment not found");
    const oldKids: string[] = r.child_ids ?? [];
    const newKids: string[] = f.kind_ids ?? [];
    // Only the creator decides who an appointment is for and who sees it (a co-parent can never re-point it).
    const sameKids = oldKids.length === newKids.length && oldKids.every((k) => newKids.includes(k));
    if (r.created_by !== me.id && (!sameKids || f.gedeeld !== (r.is_shared !== false))) {
      throw err.forbidden("Only the parent who made this appointment can change its children or sharing");
    }
    const nobody = (kids: string[]) => kids.every((k) => (s.coParentsByChild.get(k)?.size ?? 0) === 0);
    // Directly: a private appointment, or one that nobody else could see (its children have no connected
    // other parent; only the creator can see such an appointment, so this equals creating it).
    const direct = r.is_shared === false || nobody(oldKids);
    if (!direct) {
      // Old and new children must belong to the same ONE other parent; that parent answers the proposal.
      const pair = coParentsFor(s, oldKids);
      // (No new children = the change only makes it private; the proposal then keeps the old children.)
      const newPair = newKids.length ? coParentsFor(s, newKids) : pair;
      if (pair.length !== 1 || newPair.length !== 1 || newPair[0] !== pair[0]) {
        throw new HttpError(400, "MIXED_CHILDREN", "These children are not all shared with the same other parent");
      }
      const p = await proposeEvent(s, "update", r, f, scope, occ, optDateStr(body.reply_by, "reply_by"));
      await tell(me.id, s, { to: pair[0], childIds: oldKids, key: "agendaVoorstel", category: "actie", titel: f.titel ?? r.title, datum: f.datum, entityId: p.id });
      return ok({ applied: false, proposal: eventProposalOut(p, me.id) });
    }
    const rows = await applyUpdate(r, f, scope, occ, me.id);
    if (f.gedeeld) await audit(me.id, "afspraak", r.id, r.is_shared === false ? "CREATED" : "UPDATED", { item_naam: f.titel, kinderen: f.kind_ids, meta: { datum: f.datum, tijd: f.tijd, bereik: scope } });
    return ok({ applied: true, events: rows.map((x) => eventOut(x, me.id)) });
  },

  async "delete-event"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const r = await loadEvent(s, requireUuid(body.event_id, "event_id"));
    const scope = SCOPES.includes(body.scope) ? body.scope : "reeks";
    const occ = optDateStr(body.occurrence_date, "occurrence_date");
    if (r.is_shared === false && r.created_by !== me.id) throw err.notFound("Appointment not found");
    const direct = r.is_shared === false || coParentsFor(s, r.child_ids ?? []).length === 0;
    if (!direct) {
      const p = await proposeEvent(s, "delete", r, null, scope, occ, null);
      await tell(me.id, s, { childIds: r.child_ids ?? [], key: "agendaVoorstel", category: "actie", titel: r.title, datum: occ ?? r.start_date, entityId: p.id });
      return ok({ applied: false, proposal: eventProposalOut(p, me.id) });
    }
    await applyDelete(r, scope, occ, me.id);
    if (r.is_shared !== false) await audit(me.id, "afspraak", r.id, "DELETED", { item_naam: r.title, kinderen: r.child_ids ?? [], meta: { datum: occ ?? r.start_date, bereik: scope } });
    return ok({ applied: true });
  },

  /** Only the other parent answers; Akkoord applies the change, everything else leaves the appointment as it is. */
  async "respond-event-proposal"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const p = await loadEventProposal(requireUuid(body.proposal_id, "proposal_id"));
    assertResponder(s, p);
    if (p.status !== "open") throw new HttpError(409, "VALIDATION", "This proposal is already closed");
    const r = response(body.response);
    const now = new Date().toISOString();
    if (r === "meer-tijd") {
      const until = optDateStr(body.until, "until");
      const u = check(await db().from("calendar_event_proposals").update({ more_time: { by: me.id, date: today(), ...(until ? { until } : {}) } }).eq("id", p.id).eq("status", "open").select(EP_COLS).single(), "more time") as Row;
      await audit(me.id, "afspraak", p.event_id ?? p.id, "UPDATED", { item_naam: p.fields?.titel, kinderen: p.child_ids, wijziging: { veld: "reactie", oud: "open", nieuw: "meer-tijd" }, meta: until ? { tot: until } : {} });
      await tell(me.id, s, { to: p.created_by, childIds: p.child_ids ?? [], key: "agendaMeerTijd", category: "info", titel: p.fields?.titel, entityId: p.id });
      return ok({ proposal: eventProposalOut(u, me.id) });
    }
    const status = r === "akkoord" ? "geaccepteerd" : r === "niet-akkoord" ? "afgewezen" : "alternatief";
    const note = str(body.note, "note", 1000);
    // Load + check the appointment BEFORE closing: never apply a proposal to a record the responder cannot
    // see (e.g. its children are now shared with someone else), and never re-point another family's record.
    let ev: Row | null = null;
    if (status === "geaccepteerd" && p.kind !== "create" && p.event_id) {
      ev = check(await db().from("calendar_events").select(EVENT_COLS).eq("id", p.event_id).is("deleted_at", null).maybeSingle(), "load event") as Row | null;
      if (ev && (!canSee(s, ev) || (ev.created_by !== p.created_by && ev.created_by !== me.id))) throw err.notFound("Appointment not found");
      if (ev && ev.created_by === me.id && !coParentsFor(s, ev.child_ids ?? []).includes(p.created_by)) throw err.notFound("Appointment not found");
    }
    const u = check(await db().from("calendar_event_proposals").update({ status, responded_by: me.id, responded_at: now, response_note: note }).eq("id", p.id).eq("status", "open").select(EP_COLS).maybeSingle(), "close proposal") as Row | null;
    if (!u) throw new HttpError(409, "VALIDATION", "This proposal is already closed");
    let events: Row[] = [];
    if (status === "geaccepteerd") {
      if (p.kind === "create") events = [await insertEvent(p.created_by, p.fields)];
      else if (ev && p.kind === "update") events = await applyUpdate(ev, p.fields, p.scope, p.occurrence_date, me.id);
      else if (ev && p.kind === "delete") await applyDelete(ev, p.scope, p.occurrence_date, me.id);
    }
    await audit(me.id, "afspraak", p.event_id ?? events[0]?.id ?? p.id, status === "geaccepteerd" ? "ACCEPTED" : "DECLINED", { item_naam: p.fields?.titel, kinderen: p.child_ids, wijziging: { veld: "status", oud: "open", nieuw: status }, meta: note ? { toelichting: note } : {} });
    await tell(me.id, s, { to: p.created_by, childIds: p.child_ids ?? [], key: status === "geaccepteerd" ? "agendaAkkoord" : status === "afgewezen" ? "agendaNietAkkoord" : "agendaAnderVoorstel", category: "wijziging", titel: p.fields?.titel, entityId: p.id });
    return ok({ proposal: eventProposalOut(u, me.id), events: events.map((e) => eventOut(e, me.id)) });
  },

  async "withdraw-event-proposal"(req, body) {
    const me = await requireUser(req);
    const p = await loadEventProposal(requireUuid(body.proposal_id, "proposal_id"));
    if (p.created_by !== me.id) throw err.forbidden("Only the proposer can withdraw");
    const u = check(await db().from("calendar_event_proposals").update({ status: "ingetrokken", responded_at: new Date().toISOString() }).eq("id", p.id).eq("status", "open").select(EP_COLS).maybeSingle(), "withdraw") as Row | null;
    if (!u) throw new HttpError(409, "VALIDATION", "This proposal is already closed");
    await audit(me.id, "afspraak", p.event_id ?? p.id, "CANCELLED", { item_naam: p.fields?.titel, kinderen: p.child_ids, wijziging: { veld: "status", oud: "open", nieuw: "ingetrokken" } });
    return ok({ proposal: eventProposalOut(u, me.id) });
  },

  /* ---------------- care schedule ---------------- */
  /** One-off ("Alleen deze keer") or structural ("Vanaf nu") change. Without a connected parent it applies directly. */
  async "propose-care"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const v = body.proposal ?? {};
    const soort = v.soort === "structureel" ? "structureel" : "eenmalig";
    const childIds = childIdsFromBody(s, v.kind_ids, { required: true });
    assertOnePair(s, childIds);
    const datums = dateList(v.datums, "datums");
    const aanleiding = str(v.aanleiding, "aanleiding", 40);
    const moment = v.moment && typeof v.moment === "object" ? { datum: optDateStr(v.moment.datum, "moment.datum"), tijd: optTime(v.moment.tijd, "moment.tijd"), oud: optTime(v.moment.oud, "moment.oud") } : null;
    if (!datums.length && !moment) throw err.validation("datums is required");
    const naar = aanleiding === "moment" ? null : toAbs(v.naar ?? "ik", me.id);
    if (naar === "samen" || naar === "open") throw err.validation("naar must be ik or ander");
    const counterOf = body.counter_of ? requireUuid(body.counter_of, "counter_of") : null;
    if (counterOf) {
      // "Ander voorstel": the answered proposal closes as 'counterproposal' (final), the new one starts open.
      const old = await loadCare(counterOf);
      assertResponder(s, old);
      if (old.status !== "pending") throw new HttpError(409, "VALIDATION", "This proposal is already closed");
      await closeCare(old, { status: "counterproposal", alternative: str(v.tekst, "tekst", 1000), responded_by: me.id, responded_at: new Date().toISOString() });
      await audit(me.id, "schema", old.id, "DECLINED", { item_naam: old.note, kinderen: old.child_ids, wijziging: { veld: "status", oud: "open", nieuw: "alternatief" } });
    }
    const connected = coParentsFor(s, childIds).length > 0;
    const first = datums[0] ?? moment?.datum ?? today();
    const row = check(await db().from("care_schedule_proposals").insert({
      created_by: me.id, child_ids: childIds, type: soort === "structureel" ? "recurring" : "onetime", proposal_date: first, soort, dates: datums, naar,
      wisseltijd: optTime(v.wisseltijd, "wisseltijd"), plek: str(v.plek, "plek", 200), note: str(v.tekst, "tekst", 1000, true), aanleiding,
      datum_label: str(v.datum_label, "datum_label", 120), reply_by: optDateStr(v.reactie_datum, "reactie_datum"), moment, reason: str(v.reden, "reden", 1000),
      status: connected ? "pending" : "accepted", ...(connected ? {} : { responded_at: new Date().toISOString() }),
    }).select(CARE_COLS).single(), "insert care proposal") as Row;
    if (!connected) await applyCare(row, me.id);
    else await tell(me.id, s, { childIds, key: "zorgVoorstel", category: "actie", titel: row.datum_label ?? row.note, entityId: row.id });
    await audit(me.id, "schema", row.id, connected ? "CREATED" : "UPDATED", { item_naam: row.note, kinderen: childIds, meta: { soort, betreft: row.datum_label, direct: !connected } });
    return ok({ proposal: careOut(row, me.id), applied: !connected });
  },

  async "respond-care"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const p = await loadCare(requireUuid(body.proposal_id, "proposal_id"));
    assertResponder(s, p);
    if (p.status !== "pending") throw new HttpError(409, "VALIDATION", "This proposal is already closed");
    const r = response(body.response);
    if (r === "meer-tijd") {
      const until = optDateStr(body.until, "until");
      const u = check(await db().from("care_schedule_proposals").update({ more_time: { by: me.id, date: today(), ...(until ? { until } : {}) } }).eq("id", p.id).eq("status", "pending").select(CARE_COLS).single(), "more time") as Row;
      await audit(me.id, "schema", p.id, "UPDATED", { item_naam: p.note, kinderen: p.child_ids, wijziging: { veld: "reactie", oud: "open", nieuw: "meer-tijd" }, meta: until ? { tot: until } : {} });
      await tell(me.id, s, { to: p.created_by, childIds: p.child_ids ?? [], key: "zorgMeerTijd", category: "info", titel: p.datum_label ?? p.note, entityId: p.id });
      return ok({ proposal: careOut(u, me.id) });
    }
    const status = r === "akkoord" ? "accepted" : r === "niet-akkoord" ? "declined" : "counterproposal";
    const u = await closeCare(p, { status, responded_by: me.id, responded_at: new Date().toISOString(), ...(r === "ander-voorstel" ? { alternative: str(body.alternative, "alternative", 1000) } : {}) });
    if (status === "accepted") await applyCare(u, me.id);
    await audit(me.id, "schema", p.id, status === "accepted" ? "ACCEPTED" : "DECLINED", { item_naam: p.note, kinderen: p.child_ids, wijziging: { veld: "status", oud: "open", nieuw: CARE_STATUS_OUT[status] }, meta: { betreft: p.datum_label } });
    await tell(me.id, s, { to: p.created_by, childIds: p.child_ids ?? [], key: status === "accepted" ? "zorgAkkoord" : status === "declined" ? "zorgNietAkkoord" : "zorgAnderVoorstel", category: "wijziging", titel: p.datum_label ?? p.note, entityId: p.id });
    return ok({ proposal: careOut(u, me.id) });
  },

  async "withdraw-care"(req, body) {
    const me = await requireUser(req);
    const p = await loadCare(requireUuid(body.proposal_id, "proposal_id"));
    if (p.created_by !== me.id) throw err.forbidden("Only the proposer can withdraw");
    const u = await closeCare(p, { status: "withdrawn", responded_at: new Date().toISOString() });
    await audit(me.id, "schema", p.id, "CANCELLED", { item_naam: p.note, kinderen: p.child_ids, wijziging: { veld: "status", oud: "open", nieuw: "ingetrokken" } });
    return ok({ proposal: careOut(u, me.id) });
  },

  /** Friendly reminder: proposer only, at most one before and one after the requested reply date (one in total without a date). */
  async "remind-care"(req, body) {
    const me = await requireUser(req);
    const p = await loadCare(requireUuid(body.proposal_id, "proposal_id"));
    if (p.created_by !== me.id) throw err.forbidden("Only the proposer can send a reminder");
    if (p.status !== "pending") throw new HttpError(409, "VALIDATION", "This proposal is already closed");
    const sent: string[] = p.reminders ?? [];
    const d = today();
    const before = sent.filter((x) => !p.reply_by || x <= p.reply_by).length;
    const after = sent.filter((x) => p.reply_by && x > p.reply_by).length;
    const allowed = !p.reply_by ? sent.length === 0 : d <= p.reply_by ? before === 0 : after === 0;
    if (!allowed) throw new HttpError(429, "RATE_LIMITED", "Reminder limit reached");
    const u = check(await db().from("care_schedule_proposals").update({ reminders: [...sent, d] }).eq("id", p.id).select(CARE_COLS).single(), "remind") as Row;
    await tell(me.id, await familyScope(me.id), { childIds: p.child_ids ?? [], key: "zorgHerinnering", category: "actie", titel: p.datum_label ?? p.note, entityId: p.id });
    await audit(me.id, "schema", p.id, "UPDATED", { item_naam: p.note, kinderen: p.child_ids, wijziging: { veld: "herinnering", oud: "", nieuw: d } });
    return ok({ proposal: careOut(u, me.id) });
  },

  /* ---------------- attendance ---------------- */
  /** Start or replace the current attendance proposal for a shared appointment (one current proposal per appointment). */
  async "set-attendance"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const ev = await loadEvent(s, requireUuid(body.event_id, "event_id"));
    if (ev.is_shared === false) throw err.validation("Attendance only for shared appointments");
    const keuze = KEUZES.includes(body.keuze) ? body.keuze : null;
    if (!keuze) throw err.validation("keuze is invalid");
    const wieGaat = relToAbsKeep(body.wie_gaat, me.id);
    const contactWie = relToAbsKeep(body.contact_wie, me.id);
    const fase = keuze === "later" || (keuze === "afzonderlijk" && (!contactWie || contactWie === "nog")) ? "open"
      : keuze === "afzonderlijk" && contactWie === `is:${me.id}` ? "afgestemd" : coParentsFor(s, ev.child_ids ?? []).length ? "voorstel" : "afgestemd";
    const old = await loadAttendance(ev.id);
    const entry = { datum: today(), soort: "voorstel", door: `is:${me.id}`, keuze, wie_gaat: wieGaat, contact_wie: contactWie, vervangt: !!old };
    const row = { event_id: ev.id, created_by: old?.created_by ?? me.id, proposed_by: me.id, keuze, fase, wie_gaat: wieGaat, contact_wie: contactWie, history: [entry, ...(old?.history ?? [])] };
    const saved = check(await db().from("appointment_attendance").upsert(row, { onConflict: "event_id" }).select("*").single(), "save attendance") as Row;
    await audit(me.id, "afspraak", ev.id, "UPDATED", { item_naam: ev.title, kinderen: ev.child_ids, wijziging: { veld: "aanwezigheid", oud: old?.keuze ?? "", nieuw: keuze } });
    if (fase === "voorstel") await tell(me.id, s, { childIds: ev.child_ids ?? [], key: "aanwezigheidVraag", category: "actie", type: "attendance", titel: ev.title, datum: ev.start_date, entityId: ev.id });
    return ok({ attendance: attendanceOut(saved, me.id) });
  },

  async "respond-attendance"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const ev = await loadEvent(s, requireUuid(body.event_id, "event_id"));
    const a = await loadAttendance(ev.id);
    if (!a || a.fase !== "voorstel") throw new HttpError(409, "VALIDATION", "No open attendance proposal");
    if (a.proposed_by === me.id) throw err.forbidden("You cannot answer your own proposal");
    const reactie = String(body.reactie ?? "");
    if (!["akkoord", "dat-lukt", "liever-niet-samen", "dat-lukt-niet"].includes(reactie)) throw err.validation("reactie is invalid");
    const ok2 = reactie === "akkoord" || reactie === "dat-lukt";
    const soort = ok2 ? "afgestemd" : reactie === "liever-niet-samen" ? "nietSamen" : "luktNiet";
    const saved = check(await db().from("appointment_attendance").update({ fase: ok2 ? "afgestemd" : "open", history: [{ datum: today(), soort, door: `is:${me.id}`, keuze: a.keuze, wie_gaat: a.wie_gaat }, ...(a.history ?? [])] }).eq("id", a.id).select("*").single(), "respond attendance") as Row;
    await audit(me.id, "afspraak", ev.id, ok2 ? "ACCEPTED" : "DECLINED", { item_naam: ev.title, kinderen: ev.child_ids, wijziging: { veld: "aanwezigheid", oud: "voorstel", nieuw: soort } });
    await tell(me.id, s, { to: a.proposed_by, childIds: ev.child_ids ?? [], key: ok2 ? "aanwezigheidAkkoord" : "aanwezigheidNiet", category: "wijziging", type: "attendance", titel: ev.title, datum: ev.start_date, entityId: ev.id });
    return ok({ attendance: attendanceOut(saved, me.id) });
  },

  async "attendance-outcome"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const ev = await loadEvent(s, requireUuid(body.event_id, "event_id"));
    const a = await loadAttendance(ev.id);
    if (!a) throw err.notFound("No attendance");
    const uitkomst = ["mogelijk", "wacht-op-school", "niet-mogelijk", "contact-opgenomen"].includes(body.uitkomst) ? body.uitkomst : null;
    if (!uitkomst) throw err.validation("uitkomst is invalid");
    const saved = check(await db().from("appointment_attendance").update({
      uitkomst, uitkomst_toelichting: str(body.toelichting, "toelichting", 1000), fase: uitkomst === "mogelijk" ? "afgestemd" : a.fase,
      history: [{ datum: today(), soort: `uitkomst:${uitkomst}`, door: `is:${me.id}` }, ...(a.history ?? [])],
    }).eq("id", a.id).select("*").single(), "attendance outcome") as Row;
    return ok({ attendance: attendanceOut(saved, me.id) });
  },

  async "attendance-debrief"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const ev = await loadEvent(s, requireUuid(body.event_id, "event_id"));
    const besproken = str(body.besproken, "besproken", 2000) ?? "";
    const afspraken = str(body.afspraken, "afspraken", 2000) ?? "";
    if (!besproken && !afspraken) throw err.validation("Nothing to share");
    const a = await loadAttendance(ev.id);
    const nabespreking = { besproken, afspraken, door: `is:${me.id}`, datum: today() };
    const history = [{ datum: today(), soort: "puntenGedeeld", door: `is:${me.id}` }, ...(a?.history ?? [])];
    const saved = check(await db().from("appointment_attendance").upsert(a ? { ...a, nabespreking, history } : { event_id: ev.id, created_by: me.id, keuze: "later", fase: "open", nabespreking, history }, { onConflict: "event_id" }).select("*").single(), "debrief") as Row;
    await audit(me.id, "afspraak", ev.id, "UPDATED", { item_naam: ev.title, kinderen: ev.child_ids, wijziging: { veld: "nabespreking", oud: "", nieuw: "gedeeld" } });
    return ok({ attendance: attendanceOut(saved, me.id) });
  },

  /* ---------------- Nu afstemmen ---------------- */
  /** Same-day question to the other parent. Answering is recorded and audited; it never changes the planning. */
  async "start-urgent"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const childIds = childIdsFromBody(s, body.kind_ids);
    assertOnePair(s, childIds.length ? childIds : [...s.kids]);
    const categorie = URG_CATS.includes(body.categorie) ? body.categorie : "anders";
    const row = check(await db().from("urgent_requests").insert({
      created_by: me.id, child_ids: childIds.length ? childIds : [...s.kids], categorie, titel: str(body.titel, "titel", 300, true),
      toelichting: str(body.toelichting, "toelichting", 2000), reactie_gewenst: URG_REPLY.includes(body.reactie_gewenst) ? body.reactie_gewenst : "zsm",
      old_time: optTime(body.oude_tijd, "oude_tijd"), new_time: optTime(body.nieuwe_tijd, "nieuwe_tijd"),
    }).select("*").single(), "insert urgent") as Row;
    await audit(me.id, "besluit", row.id, "CREATED", { item_naam: row.titel, kinderen: row.child_ids, meta: { categorie } });
    await tell(me.id, s, { childIds: row.child_ids ?? [], key: "nuAfstemmenVraag", category: "actie", titel: row.titel, entityId: row.id });
    return ok({ request: urgentOut(row, me.id) });
  },

  async "answer-urgent"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const u = check(await db().from("urgent_requests").select("*").eq("id", requireUuid(body.id, "id")).maybeSingle(), "load urgent") as Row | null;
    if (!u || !canSee(s, u)) throw err.notFound("Request not found");
    if (u.created_by === me.id) throw err.forbidden("You cannot answer your own request");
    const antwoord = str(body.antwoord, "antwoord", 1000, true);
    const r = check(await db().from("urgent_requests").update({ status: "opgelost", antwoord, answered_by: me.id, answered_at: new Date().toISOString() }).eq("id", u.id).eq("status", "open").select("*").maybeSingle(), "answer urgent") as Row | null;
    if (!r) throw new HttpError(409, "VALIDATION", "Already answered");
    await audit(me.id, "besluit", u.id, "UPDATED", { item_naam: u.titel, kinderen: u.child_ids, wijziging: { veld: "reactie", oud: "open", nieuw: antwoord } });
    await tell(me.id, s, { to: u.created_by, childIds: u.child_ids ?? [], key: "nuAfstemmenAntwoord", category: "wijziging", titel: u.titel, entityId: u.id });
    return ok({ request: urgentOut(r, me.id) });
  },
}));
