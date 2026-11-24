// Domain 2 (Agenda & care) helpers: family scope, viewer-relative parent tokens, proposal rules and audit.
// Always called with the SESSION user id (requireUser) — never with an id from the request body.
import { db } from "./db.ts";
import { check, err } from "./respond.ts";
import { childIdsFor, coParentIdsFor } from "./access.ts";
import { isUuid } from "./util.ts";

export interface Scope {
  me: string;
  kids: Set<string>;
  coParents: string[];
  /** Active co-parents per child (only those also linked to that child). */
  coParentsByChild: Map<string, Set<string>>;
}

/** Children of the caller and, per child, which ACTIVE co-parents are also linked to it. */
export async function familyScope(me: string): Promise<Scope> {
  const [kidIds, coParents] = await Promise.all([childIdsFor(me), coParentIdsFor(me)]);
  const kids = new Set(kidIds);
  const coParentsByChild = new Map<string, Set<string>>();
  if (kidIds.length && coParents.length) {
    const [links, rows] = await Promise.all([
      db().from("child_parents").select("child_id, parent_id").in("child_id", kidIds).in("parent_id", coParents),
      db().from("children").select("id, created_by").in("id", kidIds).in("created_by", coParents),
    ]);
    const l = (check(links, "family links") ?? []) as Array<{ child_id: string; parent_id: string }>;
    const c = (check(rows, "family creators") ?? []) as Array<{ id: string; created_by: string }>;
    for (const x of [...l.map((r) => [r.child_id, r.parent_id]), ...c.map((r) => [r.id, r.created_by])]) {
      const set = coParentsByChild.get(x[0]) ?? new Set<string>();
      set.add(x[1]);
      coParentsByChild.set(x[0], set);
    }
  }
  return { me, kids, coParents, coParentsByChild };
}

/** Active co-parents who share at least one of these children with the caller. */
export function coParentsFor(s: Scope, childIds: string[]): string[] {
  const out = new Set<string>();
  for (const k of childIds) for (const p of s.coParentsByChild.get(k) ?? []) out.add(p);
  return [...out];
}

/**
 * May the caller see a family record? Own records always; a co-parent's record only when it is
 * shared and concerns a child both parents are linked to (and the co-parent is still connected).
 */
export function canSee(s: Scope, row: { created_by: string; child_ids?: string[] | null; is_shared?: boolean | null }): boolean {
  if (row.created_by === s.me) return true;
  if (row.is_shared === false) return false;
  return (row.child_ids ?? []).some((k) => (s.coParentsByChild.get(k) ?? new Set()).has(row.created_by));
}

/** Only the other parent may answer a proposal; the proposer may only withdraw. */
export function assertResponder(s: Scope, row: { created_by: string; child_ids?: string[] | null }) {
  if (row.created_by === s.me) throw err.forbidden("You cannot answer your own proposal");
  if (!canSee(s, row)) throw err.notFound("Proposal not found");
}

/** Child ids from the body: unique uuids, each accessible by the caller. */
export function childIdsFromBody(s: Scope, v: unknown, opts: { required?: boolean } = {}): string[] {
  if (v === undefined || v === null) {
    if (opts.required) throw err.validation("child_ids is required");
    return [];
  }
  if (!Array.isArray(v) || v.length > 20) throw err.validation("child_ids must be an array");
  const ids = [...new Set(v.map((x) => String(x).toLowerCase()))];
  for (const id of ids) {
    if (!isUuid(id)) throw err.validation("child_ids must contain UUIDs");
    if (!s.kids.has(id)) throw err.notFound("Child not found");
  }
  if (opts.required && !ids.length) throw err.validation("child_ids is required");
  return ids;
}

/* ---------- parent tokens ---------- */
const REL = ["ik", "ander", "samen", "open"];

/** Viewer-relative ('ik' | 'ander' | 'samen' | 'open') → absolute stored token. */
export function toAbs(rel: unknown, caller: string): string | null {
  if (rel === undefined || rel === null || rel === "") return null;
  if (typeof rel !== "string" || !REL.includes(rel)) throw err.validation("parent must be ik, ander, samen or open");
  if (rel === "ik") return `is:${caller}`;
  if (rel === "ander") return `not:${caller}`;
  return rel;
}

/** Absolute stored token → relative for this viewer. */
export function toRel(abs: unknown, viewer: string): string | null {
  if (typeof abs !== "string" || !abs) return null;
  if (abs.startsWith("is:")) return abs.slice(3) === viewer ? "ik" : "ander";
  if (abs.startsWith("not:")) return abs.slice(4) === viewer ? "ander" : "ik";
  return abs;
}

/* ---------- validation ---------- */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function optDateStr(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) throw err.validation(`${field} must be YYYY-MM-DD`);
  return v;
}
export function reqDateStr(v: unknown, field: string): string {
  const d = optDateStr(v, field);
  if (!d) throw err.validation(`${field} is required`);
  return d;
}
export function optTime(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !TIME_RE.test(v.slice(0, 5))) throw err.validation(`${field} must be HH:MM`);
  return v.slice(0, 5);
}
export function str(v: unknown, field: string, max: number, required = false): string | null {
  if (v === undefined || v === null || v === "") {
    if (required) throw err.validation(`${field} is required`);
    return null;
  }
  if (typeof v !== "string") throw err.validation(`${field} must be text`);
  const t = v.trim();
  if (required && !t) throw err.validation(`${field} is required`);
  if (t.length > max) throw err.validation(`${field} is too long`);
  return t || null;
}
export function dateList(v: unknown, field: string, max = 366): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max) throw err.validation(`${field} must be a list of dates`);
  return [...new Set(v.map((d) => reqDateStr(d, field)))].sort();
}

/** 4 replies, used everywhere ("Ander voorstel", never "Tegenvoorstel"). */
export const RESPONSES = ["akkoord", "ander-voorstel", "niet-akkoord", "meer-tijd"];
export function response(v: unknown): string {
  if (typeof v !== "string" || !RESPONSES.includes(v)) throw err.validation(`response must be one of ${RESPONSES.join(", ")}`);
  return v;
}

/** Append-only history: one audit_events row per change (actor = session user). Private items are never logged. */
export async function audit(actor: string, entityType: string, entityId: string, action: string, details: Record<string, unknown>) {
  const res = await db().from("audit_events").insert({ actor_id: actor, entity_type: entityType, entity_id: entityId, action, details });
  if (res.error) console.error("[audit]", res.error);
}

export const today = () => new Date().toISOString().slice(0, 10);
