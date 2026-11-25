// Family scope for the practical domain (tasks, belongings, moments, documents, agreements,
// audit, notifications). Always called with the SESSION user id.
//
// A record is visible to the caller when
//   - the caller created it, or
//   - it is not private AND it was created by an ACTIVE co-parent of the caller AND
//     (it concerns no specific child, or at least one child the caller can access).
import { db } from "./db.ts";
import { check, err, HttpError } from "./respond.ts";
import { childIdsFor, coParentIdsFor } from "./access.ts";
import { caregiverGrantsFor } from "./family-caregivers.ts";

export interface Family {
  userId: string;
  /** children the caller created or is linked to */
  childIds: string[];
  /** active co-parents */
  coParents: string[];
  /** per co-parent: the children both of you can access */
  shared: Record<string, string[]>;
}

export async function familyFor(userId: string): Promise<Family> {
  const [childIds, coParents] = await Promise.all([childIdsFor(userId), coParentIdsFor(userId)]);
  const shared: Record<string, string[]> = {};
  for (const c of coParents) shared[c] = [];
  if (childIds.length && coParents.length) {
    const [kids, links] = await Promise.all([
      db().from("children").select("id, created_by").in("id", childIds),
      db().from("child_parents").select("child_id, parent_id").in("child_id", childIds),
    ]);
    const k = (check(kids, "family children") ?? []) as Array<{ id: string; created_by: string }>;
    const l = (check(links, "family links") ?? []) as Array<{ child_id: string; parent_id: string }>;
    for (const c of coParents) {
      shared[c] = childIds.filter((id) => k.some((x) => x.id === id && x.created_by === c) || l.some((x) => x.child_id === id && x.parent_id === c));
    }
  }
  return { userId, childIds, coParents, shared };
}

/** Everyone whose records may appear for the caller (caller first). */
export const familyMembers = (f: Family): string[] => [f.userId, ...f.coParents];

/**
 * Visible for the caller: own records always. A co-parent's record only when it is not private and
 *  - for tables with an `other_parent_id` column (pass it as `addressedTo`, also when null): it is
 *    addressed to the caller. null = not shared (made while Solo, or "Alleen jij") → hidden;
 *  - EVERY child of the record is shared between the caller and that co-parent (so father B never
 *    sees anything of child 1, which the mother shares with father A);
 *  - without `addressedTo` (undefined) a record without children stays with its owner.
 */
export function canSee(
  f: Family,
  ownerId: string | null | undefined,
  childIds: string[] | null | undefined,
  isPrivate = false,
  addressedTo?: string | null,
): boolean {
  if (!ownerId) return false;
  if (ownerId === f.userId) return true;
  if (isPrivate) return false;
  if (!f.coParents.includes(ownerId)) return false;
  const kids = (childIds ?? []).filter(Boolean);
  if (addressedTo !== undefined) {
    if (addressedTo !== f.userId) return false;
  } else if (!kids.length) return false;
  const shared = f.shared[ownerId] ?? [];
  return kids.every((id) => shared.includes(id));
}

/**
 * The co-parent who shares ALL these children with the caller (at most one, see access.pairOf).
 * Without children: only `addressedTo` when that is an active co-parent — never "everyone".
 */
export function otherParents(f: Family, childIds: string[] = [], addressedTo?: string | null): string[] {
  if (!childIds.length) return addressedTo && f.coParents.includes(addressedTo) ? [addressedTo] : [];
  return f.coParents.filter((c) => childIds.every((id) => (f.shared[c] ?? []).includes(id)));
}

/**
 * other_parent_id for a new shared record: the one co-parent of these children; without children the
 * requested co-parent or the only one. null = nobody else (Solo, or private).
 * Throws MIXED_CHILDREN when the children belong to different co-parents.
 */
export function addressFor(f: Family, childIds: string[], isPrivate: boolean, requested?: unknown): string | null {
  if (isPrivate) return null;
  const want = typeof requested === "string" && requested ? requested : null;
  if (!childIds.length) {
    if (want) {
      if (!f.coParents.includes(want)) throw err.notFound();
      return want;
    }
    if (f.coParents.length > 1) throw err.validation("Choose the other parent this is for");
    return f.coParents[0] ?? null;
  }
  const o = otherParents(f, childIds).filter((c) => !want || c === want);
  if (o.length === 1) return o[0];
  if (!f.coParents.some((c) => childIds.some((id) => (f.shared[c] ?? []).includes(id)))) return null; // Solo children
  throw new HttpError(400, "MIXED_CHILDREN", "These children are not all shared with the same other parent");
}

/** Validates a list of child ids: each must be accessible by the caller. Empty list = whole family. */
export function assertChildren(f: Family, value: unknown, field = "child_ids"): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw err.validation(`${field} must be an array`);
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) throw err.validation(`${field} must contain child UUIDs`);
    const id = v.toLowerCase();
    if (!f.childIds.includes(id)) throw err.notFound("Child not found");
    if (!out.includes(id)) out.push(id);
  }
  if (out.length > 20) throw err.validation(`${field} is too long`);
  return out;
}

/** Display names of the given profiles (id -> name). */
export async function namesFor(ids: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const rows = check(await db().from("profiles").select("id, name").in("id", uniq), "profile names") as Array<{ id: string; name: string }> | null;
  return Object.fromEntries((rows ?? []).map((r) => [r.id, r.name || ""]));
}

// ---------------- caregiver sessions (circle members with an account) ----------------

export interface CaregiverAccess {
  /** child ids per section at "bekijken" or higher */
  view: (section: string) => string[];
  /** child ids per section at "bijdragen" */
  contribute: (section: string) => string[];
  /** caregiver record ids of this account (moments shared with "the circle" list these) */
  caregiverIds: string[];
}

/** Live grants of this account as a caregiver (empty for a parent without circle roles). */
export async function caregiverAccess(userId: string): Promise<CaregiverAccess> {
  const grants = await caregiverGrantsFor(userId);
  return {
    view: (s) => [...new Set(grants.filter((g) => g.section === s).map((g) => g.child_id))],
    contribute: (s) => [...new Set(grants.filter((g) => g.section === s && g.level === "bijdragen").map((g) => g.child_id))],
    caregiverIds: [...new Set(grants.map((g) => g.caregiver_id))],
  };
}

/** Profiles that are live caregivers (with an account) of one of these children — authors of circle moments. */
export async function caregiverProfilesFor(childIds: string[]): Promise<Set<string>> {
  if (!childIds.length) return new Set();
  const rows = (check(
    await db().from("family_caregivers").select("connected_user_id, child_ids, status, revoked_at").overlaps("child_ids", childIds).not("connected_user_id", "is", null),
    "caregiver profiles",
  ) ?? []) as Array<{ connected_user_id: string; status: string; revoked_at: string | null }>;
  return new Set(rows.filter((r) => r.status === "active" && !r.revoked_at).map((r) => r.connected_user_id));
}
