// manage-vacations — holidays and special days as proposals between the two parents. Session required.
// A pending revision keeps the confirmed fields on the same record; declining restores them; withdrawal is
// final and keeps the record. Only the other parent answers. Without a connected parent for those children a
// proposal is agreed directly (nobody to wait for). School/public holidays are computed in the app, not here.
import { db } from "../_shared/db.ts";
import { check, err, HttpError, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { requireUuid } from "../_shared/util.ts";
import {
  assertOnePair, assertResponder, audit, canSee, childIdsFromBody, coParentsFor, familyScope, optDateStr, optTime, reqDateStr, Scope, str, toAbs, toRel, today,
} from "../_shared/agenda-family.ts";

/** Shared holiday periods concern the children of one co-parent only. */
const onePair = (s: Scope, ids: string[]) => { assertOnePair(s, ids); return ids; };

type Row = Record<string, any>;
const COLS = "id, created_by, title, period, start_date, end_date, status, proposed_by, details, child_ids, fields, confirmed, history, reply_by, response, more_time, created_at, updated_at";
const SOORT = ["vakantie", "bijzonder"];
const HERHAAL = ["eenmalig", "jaarlijks", "afwisselend"];

/** Validated fields; parent values arrive viewer-relative and are stored as absolute tokens. */
function fieldsIn(s: Scope, v: unknown): Row {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw err.validation("fields must be an object");
  const f = v as Row;
  const van = reqDateStr(f.vanDatum, "vanDatum");
  const tot = reqDateStr(f.totDatum, "totDatum");
  if (tot < van) throw err.validation("totDatum before vanDatum");
  const deel = (d: Row) => {
    const a = reqDateStr(d.van, "verdeling.van"), b = reqDateStr(d.tot, "verdeling.tot");
    if (b < a) throw err.validation("verdeling dates");
    return { van: a, tot: b, ouder: toAbs(d.ouder ?? "ik", s.me), plek: str(d.plek, "plek", 200), wisseltijd: optTime(d.wisseltijd, "wisseltijd"), tijdVan: optTime(d.tijdVan, "tijdVan"), tijdTot: optTime(d.tijdTot, "tijdTot") };
  };
  if (f.verdeling !== undefined && (!Array.isArray(f.verdeling) || f.verdeling.length > 20)) throw err.validation("verdeling must be a list");
  return {
    naam: str(f.naam, "naam", 120, true), periode: str(f.periode, "periode", 120) ?? `${van} – ${tot}`, vanDatum: van, totDatum: tot,
    kinderen: onePair(s, childIdsFromBody(s, f.kinderen, { required: true })), ouder: toAbs(f.ouder ?? "open", s.me),
    details: str(f.details, "details", 2000) ?? "", soort: SOORT.includes(f.soort) ? f.soort : "vakantie",
    herhaal: HERHAAL.includes(f.herhaal) ? f.herhaal : "eenmalig", verdeling: (f.verdeling ?? []).map(deel),
    buitenland: f.buitenland === true, bestemming: str(f.bestemming, "bestemming", 200) ?? "", annuleren: f.annuleren === true,
  };
}

function relFields(f: Row | null, me: string) {
  if (!f) return null;
  return { ...f, ouder: toRel(f.ouder, me) ?? "open", verdeling: (f.verdeling ?? []).map((d: Row) => ({ ...d, ouder: toRel(d.ouder, me) })) };
}

function out(r: Row, me: string) {
  const f = relFields(r.fields ?? {}, me)!;
  return {
    ...f, id: r.id, naam: f.naam ?? r.title, periode: f.periode ?? r.period, vanDatum: f.vanDatum ?? r.start_date, totDatum: f.totDatum ?? r.end_date,
    kinderen: f.kinderen ?? r.child_ids ?? [], status: r.status, van: r.proposed_by ? (r.proposed_by === me ? "ik" : "ander") : null,
    afgesproken: relFields(r.confirmed, me), reactie: r.response ?? null, reactieDatum: r.reply_by ?? null,
    meerTijd: r.more_time ? { mine: r.more_time.by === me, datum: r.more_time.date } : null,
    geschiedenis: (r.history ?? []).map((h: Row) => ({ datum: h.datum, door: toRel(`is:${h.door}`, me), actie: h.actie, velden: relFields(h.velden, me) })),
    created_at: r.created_at, updated_at: r.updated_at,
  };
}

const columns = (f: Row) => ({ title: f.naam, period: f.periode, start_date: f.vanDatum, end_date: f.totDatum, child_ids: f.kinderen, details: f.details });
const hist = (r: Row, me: string, actie: string) => [...(r.history ?? []), { datum: new Date().toISOString(), door: me, actie, velden: r.fields }];

async function load(s: Scope, id: string): Promise<Row> {
  const r = check(await db().from("vacations").select(COLS).eq("id", id).maybeSingle(), "load vacation") as Row | null;
  if (!r || !canSee(s, { created_by: r.created_by, child_ids: r.child_ids })) throw err.notFound("Holiday not found");
  return r;
}

/** Guarded write: only when the status is still what we read (no silent overwrite of a final state). */
async function write(r: Row, patch: Row): Promise<Row> {
  const u = check(await db().from("vacations").update(patch).eq("id", r.id).eq("status", r.status).select(COLS).maybeSingle(), "update vacation") as Row | null;
  if (!u) throw new HttpError(409, "VALIDATION", "This holiday changed in the meantime");
  return u;
}

Deno.serve(serveActions("manage-vacations", {
  async list(req) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const kids = [...s.kids];
    let q = db().from("vacations").select(COLS).order("start_date", { ascending: true });
    q = kids.length ? q.or(`created_by.eq.${me.id},child_ids.ov.{${kids.join(",")}}`) : q.eq("created_by", me.id);
    const rows = ((check(await q, "list vacations") ?? []) as Row[]).filter((r) => canSee(s, { created_by: r.created_by, child_ids: r.child_ids }));
    return ok({ vacations: rows.map((r) => out(r, me.id)), connected: s.coParents.length > 0 });
  },

  /** New holiday/special day proposal. Without a connected parent for these children it is agreed directly. */
  async propose(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const f = fieldsIn(s, body.fields);
    const connected = coParentsFor(s, f.kinderen).length > 0;
    const row = check(await db().from("vacations").insert({
      ...columns(f), created_by: me.id, fields: f, status: connected ? "voorstel" : "afgesproken", proposed_by: connected ? me.id : null,
      assigned_to: f.ouder, reply_by: optDateStr(body.fields?.reactieDatum, "reactieDatum"),
      history: [{ datum: new Date().toISOString(), door: me.id, actie: connected ? "voorstel" : "afgesproken", velden: f }],
    }).select(COLS).single(), "insert vacation") as Row;
    await audit(me.id, "schema", row.id, "CREATED", { item_naam: f.naam, kinderen: f.kinderen, meta: { betreft: f.periode, type: f.soort, direct: !connected } });
    return ok({ vacation: out(row, me.id), applied: !connected });
  },

  /** Amendment ("Ander voorstel" or a change of an agreed holiday). The confirmed fields stay effective until accepted. */
  async amend(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const r = await load(s, requireUuid(body.id, "id"));
    if (r.status === "ingetrokken") throw new HttpError(409, "VALIDATION", "Withdrawn proposals are final");
    if (r.status === "voorstel" && r.proposed_by === me.id) throw new HttpError(409, "VALIDATION", "Your proposal is still waiting for a reply");
    const f = fieldsIn(s, body.fields);
    const connected = coParentsFor(s, f.kinderen).length > 0;
    const confirmed = r.confirmed ?? (r.status === "afgesproken" ? r.fields : null);
    const patch = connected
      ? { ...columns(f), fields: f, confirmed, status: "voorstel", proposed_by: me.id, response: null, more_time: null, reply_by: optDateStr(body.fields?.reactieDatum, "reactieDatum"), history: hist(r, me.id, "anderVoorstel") }
      : { ...columns(f), fields: f, confirmed: null, status: "afgesproken", proposed_by: null, response: null, history: hist(r, me.id, "afgesproken") };
    const u = await write(r, patch);
    await audit(me.id, "schema", r.id, connected ? "CREATED" : "UPDATED", { item_naam: f.naam, kinderen: f.kinderen, meta: { betreft: f.periode, type: "vakantiewijziging" } });
    return ok({ vacation: out(u, me.id) });
  },

  /** An open (not yet arranged) holiday: propose who has the children. */
  async "set-split"(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const r = await load(s, requireUuid(body.id, "id"));
    if (r.status !== "open") throw new HttpError(409, "VALIDATION", "Only open holidays");
    const ouder = toAbs(body.ouder, me.id);
    const connected = coParentsFor(s, r.child_ids ?? []).length > 0;
    const fields = { ...(r.fields ?? {}), ouder };
    const u = await write(r, { fields, assigned_to: ouder, status: connected ? "voorstel" : "afgesproken", proposed_by: connected ? me.id : null, history: hist({ ...r, fields }, me.id, connected ? "voorstel" : "afgesproken") });
    await audit(me.id, "schema", r.id, "CREATED", { item_naam: r.title, kinderen: r.child_ids, meta: { betreft: r.period } });
    return ok({ vacation: out(u, me.id) });
  },

  /** Akkoord / Niet akkoord / Meer tijd nodig — only the other parent. ("Ander voorstel" goes through amend.) */
  async respond(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const r = await load(s, requireUuid(body.id, "id"));
    if (r.status !== "voorstel" || !r.proposed_by) throw new HttpError(409, "VALIDATION", "Nothing to answer");
    assertResponder(s, { created_by: r.proposed_by, child_ids: r.child_ids });
    const resp = String(body.response ?? "");
    if (resp === "meer-tijd") {
      const u = await write(r, { more_time: { by: me.id, date: today() } });
      await audit(me.id, "schema", r.id, "UPDATED", { item_naam: r.title, kinderen: r.child_ids, wijziging: { veld: "reactie", oud: "open", nieuw: "meer-tijd" } });
      return ok({ vacation: out(u, me.id) });
    }
    if (resp === "akkoord") {
      const u = await write(r, { status: "afgesproken", confirmed: null, response: null, more_time: null, history: hist(r, me.id, r.fields?.annuleren ? "annuleringAfgesproken" : "afgesproken") });
      await audit(me.id, "schema", r.id, "ACCEPTED", { item_naam: r.title, kinderen: r.child_ids, meta: { betreft: r.period } });
      return ok({ vacation: out(u, me.id) });
    }
    if (resp !== "niet-akkoord") throw err.validation("response must be akkoord, niet-akkoord or meer-tijd");
    const back = r.confirmed;
    const u = await write(r, {
      ...(back ? { ...columns(back), fields: back } : {}), status: back ? "afgesproken" : "open", proposed_by: null, confirmed: null, response: "niet-akkoord", more_time: null,
      history: hist(r, me.id, "nietAkkoord"),
    });
    await audit(me.id, "schema", r.id, "DECLINED", { item_naam: r.title, kinderen: r.child_ids, meta: { betreft: r.period } });
    return ok({ vacation: out(u, me.id) });
  },

  /** Withdrawal by the proposer: final, the record and its history stay. */
  async withdraw(req, body) {
    const me = await requireUser(req);
    const s = await familyScope(me.id);
    const r = await load(s, requireUuid(body.id, "id"));
    if (r.status !== "voorstel" || r.proposed_by !== me.id) throw err.forbidden("Only the proposer can withdraw an open proposal");
    const u = await write(r, { status: "ingetrokken", history: hist(r, me.id, "ingetrokken") });
    await audit(me.id, "schema", r.id, "CANCELLED", { item_naam: r.title, kinderen: r.child_ids, wijziging: { veld: "status", oud: "voorstel", nieuw: "ingetrokken" } });
    return ok({ vacation: out(u, me.id) });
  },
}));
