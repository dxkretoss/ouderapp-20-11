// Server-side derivation of handover moments (wisselmomenten), the same rules as the app
// (src/lib/agenda-zorg.js agendaZorgOp + zorg-store zorgOp): base schedule per child (children.care_schedule,
// "ik"/"ander" relative to schedule.ikId) -> latest accepted version (care_schedule_versions) -> accepted
// one-off exception (care_schedule_exceptions) -> agreed holiday / special day (vacations).
// A handover of a child on date D = the child is with another parent on D than on D-1.
// Not covered: an accepted "Ik ben later" time shift (only moves the time later).
// Times are Europe/Amsterdam (the app's users); the server runs in UTC.
import { db } from "./db.ts";
import { check } from "./respond.ts";
import { ACTIVE_CONNECTION } from "./access.ts";

type Row = Record<string, any>;
/** "out" = the other parent of a Solo child (not in the app). */
export type Person = string;
export const OUT = "out";
export const TZ = "Europe/Amsterdam";

export interface ChildSchedule {
  id: string;
  name: string;
  createdBy: string;
  parents: string[];
  base: Row | null;
  versions: Array<{ from: string; schedule: Row; createdBy: string | null }>;
  exceptions: Array<{ date: string; parent: string; createdAt: string }>;
  vacations: Row[];
}

export interface Handover {
  childId: string;
  date: string;
  from: Person;
  to: Person;
  time: string;
  place: string;
}

const parse = (v: unknown): Row | null => {
  if (!v) return null;
  if (typeof v === "object") return v as Row;
  try { const x = JSON.parse(String(v)); return x && typeof x === "object" ? x : null; } catch { return null; }
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const valid = (r: Row | null) => !!r && Array.isArray(r.dagen) && r.dagen.length === 14;

export function plusDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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

/** Loads everything needed to derive handovers for these children. */
export async function loadSchedules(childIds: string[]): Promise<Map<string, ChildSchedule>> {
  const ids = [...new Set(childIds)].filter(Boolean);
  const out = new Map<string, ChildSchedule>();
  if (!ids.length) return out;
  const [kids, links, versions, exceptions, vacations] = await Promise.all([
    db().from("children").select("id, name, created_by, care_schedule").in("id", ids),
    db().from("child_parents").select("child_id, parent_id, role").in("child_id", ids),
    db().from("care_schedule_versions").select("child_id, valid_from, schedule, created_by, created_at").in("child_id", ids).order("valid_from", { ascending: true }).order("created_at", { ascending: true }),
    db().from("care_schedule_exceptions").select("child_id, date, parent, created_at").in("child_id", ids).order("created_at", { ascending: true }),
    db().from("vacations").select("id, status, fields, confirmed, child_ids").overlaps("child_ids", ids),
  ]);
  for (const k of (check(kids, "handover children") ?? []) as Row[]) {
    out.set(k.id, { id: k.id, name: k.name ?? "", createdBy: k.created_by, parents: [k.created_by], base: parse(k.care_schedule), versions: [], exceptions: [], vacations: [] });
  }
  // Only real parents (role 'parent') with an ACTIVE connection to the child's owner count as "the other
  // parent": a professional/step-parent link or a disconnected parent never receives handovers.
  const linked = ((check(links, "handover links") ?? []) as Row[]).filter((l) => (l.role ?? "parent") === "parent");
  // linked parents other than the child's creator (the creator is always a parent of the child)
  const others = [...new Set(linked.filter((l) => out.get(l.child_id)?.createdBy !== l.parent_id).map((l) => l.parent_id))].filter(Boolean);
  const connected = new Set<string>();
  if (others.length) {
    // two small queries (either side of the undirected connection) instead of one with two long id lists
    const [a, b] = await Promise.all([
      db().from("parent_connections").select("parent_1_id, parent_2_id").in("parent_1_id", others).in("status", ACTIVE_CONNECTION),
      db().from("parent_connections").select("parent_1_id, parent_2_id").in("parent_2_id", others).in("status", ACTIVE_CONNECTION),
    ]);
    const conns = [...((check(a, "handover connections") ?? []) as Row[]), ...((check(b, "handover connections") ?? []) as Row[])];
    for (const r of conns) {
      connected.add(`${r.parent_1_id}|${r.parent_2_id}`);
      connected.add(`${r.parent_2_id}|${r.parent_1_id}`);
    }
  }
  for (const l of linked) {
    const c = out.get(l.child_id);
    if (!c || c.parents.includes(l.parent_id)) continue;
    if (connected.has(`${c.createdBy}|${l.parent_id}`)) c.parents.push(l.parent_id);
  }
  for (const v of (check(versions, "handover versions") ?? []) as Row[]) {
    const s = parse(v.schedule);
    if (s) out.get(v.child_id)?.versions.push({ from: String(v.valid_from).slice(0, 10), schedule: s, createdBy: v.created_by ?? null });
  }
  for (const e of (check(exceptions, "handover exceptions") ?? []) as Row[]) {
    out.get(e.child_id)?.exceptions.push({ date: String(e.date).slice(0, 10), parent: e.parent, createdAt: e.created_at });
  }
  for (const v of (check(vacations, "handover vacations") ?? []) as Row[]) {
    const f = v.status === "afgesproken" && !v.fields?.annuleren ? v.fields : v.confirmed;
    if (!f || !f.vanDatum || !f.totDatum) continue;
    for (const id of v.child_ids ?? []) out.get(id)?.vacations.push(f);
  }
  return out;
}

/** The other parent of `p` for this child, or OUT when the child has no other parent in the app. */
const otherOf = (c: ChildSchedule, p: string): Person => c.parents.find((x) => x !== p) ?? OUT;

/** Absolute token ("is:<id>" / "not:<id>" / samen / open) -> person; null = no single parent. */
function fromToken(c: ChildSchedule, tok: unknown): Person | null {
  if (typeof tok !== "string") return null;
  // A token naming someone who is not (or no longer) a parent of this child is ignored.
  if (tok.startsWith("is:")) return c.parents.includes(tok.slice(3)) ? tok.slice(3) : null;
  if (tok.startsWith("not:")) return c.parents.includes(tok.slice(4)) ? otherOf(c, tok.slice(4)) : null;
  return null;
}

/** The schedule valid on `date` and its owner (the parent "ik" refers to). */
function scheduleOn(c: ChildSchedule, date: string): { s: Row; owner: string } | null {
  const v = c.versions.filter((x) => x.from <= date).at(-1);
  const s = v?.schedule ?? c.base;
  if (!valid(s)) return null;
  // "ik" must be a parent of THIS child (a schedule copied from a sibling of another family, or an ikId of
  // someone who left, never makes a stranger the owner).
  const cands = [typeof s!.ikId === "string" ? s!.ikId : null, v?.createdBy ?? null, c.createdBy];
  const owner = cands.find((p) => !!p && c.parents.includes(p)) ?? c.createdBy;
  return { s: s!, owner };
}

/** Holiday parts on `date` for this child (same rules as vakantieDelenOp in the app). */
function holidayParts(c: ChildSchedule, date: string): Row[][] {
  const year = Number(date.slice(0, 4));
  const res: Row[][] = [];
  for (const a of c.vacations) {
    if (Array.isArray(a.kinderen) && a.kinderen.length && !a.kinderen.includes(c.id)) continue;
    const srcYear = Number(String(a.vanDatum).slice(0, 4));
    const years = a.herhaal && a.herhaal !== "eenmalig" ? [year - 1, year] : [srcYear];
    const parts: Row[] = [];
    for (const j of years) {
      if (j < srcYear) continue;
      const shift = (s: string) => `${Number(s.slice(0, 4)) + j - srcYear}${s.slice(4)}`;
      const van = shift(String(a.vanDatum)), tot = shift(String(a.totDatum));
      if (date < van || date > tot) continue;
      const delen: Row[] = Array.isArray(a.verdeling) && a.verdeling.length
        ? a.verdeling
        : typeof a.ouder === "string" && (a.ouder.startsWith("is:") || a.ouder.startsWith("not:") || a.ouder === "samen")
        ? [{ van: a.vanDatum, tot: a.totDatum, ouder: a.ouder }]
        : [];
      for (const d of delen) {
        if (!d?.van || !d?.tot || date < shift(String(d.van)) || date > shift(String(d.tot))) continue;
        let ouder = d.ouder;
        if (a.herhaal === "afwisselend" && (j - srcYear) % 2 !== 0 && typeof ouder === "string") {
          ouder = ouder.startsWith("is:") ? `not:${ouder.slice(3)}` : ouder.startsWith("not:") ? `is:${ouder.slice(4)}` : ouder;
        }
        parts.push({ ...d, ouder });
      }
    }
    if (parts.length) res.push(parts);
  }
  return res;
}

/** Who has the child on `date` (person, OUT, or null = unknown), plus the handover time and place. */
export function parentOn(c: ChildSchedule, date: string): { who: Person | null; time: string; place: string } {
  const sch = scheduleOn(c, date);
  let who: Person | null = null;
  let time = "", place = "";
  if (sch) {
    const start = typeof sch.s.startMaandag === "string" && DATE_RE.test(sch.s.startMaandag) ? sch.s.startMaandag : mondayOf(date);
    const slot = sch.s.dagen[dayIndex(start, date)];
    who = slot === "ik" ? sch.owner : slot === "ander" ? otherOf(c, sch.owner) : null;
    time = typeof sch.s.wisseltijd === "string" ? sch.s.wisseltijd : "";
    place = typeof sch.s.plek === "string" ? sch.s.plek : "";
  }
  const exc = c.exceptions.filter((e) => e.date === date).at(-1);
  if (exc) who = fromToken(c, exc.parent);
  const hol = holidayParts(c, date);
  if (hol.length) {
    const owners = new Set(hol.flat().map((p) => p.ouder));
    if (hol.length > 1 && owners.size > 1) return { who: null, time, place };
    const last = hol.flat().at(-1)!;
    who = last.ouder === "samen" ? null : fromToken(c, last.ouder);
    if (typeof last.wisseltijd === "string" && last.wisseltijd) time = last.wisseltijd;
    if (typeof last.plek === "string" && last.plek) place = last.plek;
  }
  return { who, time, place };
}

/** Handovers on `date` for these children (only children whose parent is known on both days). */
export function handoversOn(children: Iterable<ChildSchedule>, date: string): Handover[] {
  const out: Handover[] = [];
  for (const c of children) {
    const today = parentOn(c, date), before = parentOn(c, plusDays(date, -1));
    if (today.who && before.who && today.who !== before.who) {
      out.push({ childId: c.id, date, from: before.who, to: today.who, time: today.time || "", place: today.place });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- Europe/Amsterdam time */

function tzOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - at.getTime();
}

/** The instant of a local Amsterdam date + time ("HH:MM", default 12:00). */
export function localInstant(date: string, time?: string | null): Date {
  const [h, m] = (time && /^\d{2}:\d{2}/.test(time) ? time : "12:00").split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m);
  let at = new Date(guess - tzOffsetMs(new Date(guess)));
  at = new Date(guess - tzOffsetMs(at)); // DST edge
  return at;
}

/** Local Amsterdam date (YYYY-MM-DD) and "HH:MM" of an instant. */
export function localParts(at = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
}
