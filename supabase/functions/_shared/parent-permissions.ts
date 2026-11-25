// Per-child access of LINKED PARENTS ("Gezag en toegang"). Always called with the SESSION user id.
//
//   import { parentMay, assertParentMay, parentMayBatch } from "../_shared/parent-permissions.ts";
//   if (!(await parentMay(me.id, childId, "gezondheid", "view"))) { ...leave the health fields out... }
//   const allowed = await parentMayBatch(me.id, childIds, "kosten", "propose"); // Set of child ids
//
// Product decision (approved): the DEFAULT is exactly what the app allowed before: every linked parent has
// view + propose + edit for every section (rows with basis 'legacy_baseline', seeded by the migration and
// whenever a parent gets linked). A missing row therefore means the baseline as well.
//
// Rule for changes (conservative, follows docs/.../legal-authority-access-kretoss.md):
//  * Self-reported custody (gezag) never grants or removes access. Nothing in save-custody touches this.
//  * A parent may LOWER their own access at once (basis 'self_restriction'): it removes nobody else's access.
//  * A parent may restore their own access at once only when they restricted it themselves.
//  * Every other change is a REQUEST (child_permission_requests) and only becomes effective when the parent
//    who must agree accepts it: a change to the other parent's access needs THAT parent's response; raising
//    your own access after an agreed restriction needs the other parent's response. One parent alone can
//    therefore never take away the other parent's existing access, and nobody can grant themselves more.
//  * 'verified'/'reviewed' outcomes are never produced by the app (legal review procedure, outside the app).
//  * New sections must be added to SECTIONS AND to the migration backfill; until a function enforces a
//    section it is listed as not enforced (ENFORCED_SECTIONS) and the UI does not offer it.
import { db } from "./db.ts";
import { check, err } from "./respond.ts";

/** Every section that has rows. Keep in sync with the backfill in 20261126000005_child_access_handover.sql. */
export const SECTIONS = [
  "basis", "school", "gezondheid", "praktisch", "personen", "noodkaart",
  "agenda", "overdracht", "kosten", "documenten", "momentjes", "beslissingen", "berichten",
] as const;
export type Section = typeof SECTIONS[number];
export type Action = "view" | "propose" | "edit";

/** Sections that are enforced on the server today (manage-children). Only these are offered in the UI. */
export const ENFORCED_SECTIONS: Section[] = ["basis", "school", "gezondheid", "praktisch", "personen", "noodkaart"];

/** basis (name, birth date, colour, photo) is how a parent knows the child at all: it is always visible. */
const ALWAYS_VIEW: Section[] = ["basis"];

export interface SectionAccess {
  view: boolean;
  propose: boolean;
  edit: boolean;
  basis: string;
}
export type ChildAccessMap = Record<string, SectionAccess>;

const BASELINE: SectionAccess = { view: true, propose: true, edit: true, basis: "legacy_baseline" };

export const isSection = (v: unknown): v is Section => typeof v === "string" && (SECTIONS as readonly string[]).includes(v);

interface Links {
  /** child -> parents (creator + child_parents) */
  parents: Map<string, Set<string>>;
  /** child -> parent -> legacy child_parents.can_edit (creator: true) */
  legacyEdit: Map<string, Map<string, boolean>>;
}

/** The linked parents of these children (creator + child_parents rows). */
export async function linkedParents(childIds: string[]): Promise<Links> {
  const ids = [...new Set(childIds)].filter(Boolean);
  const parents = new Map<string, Set<string>>();
  const legacyEdit = new Map<string, Map<string, boolean>>();
  if (!ids.length) return { parents, legacyEdit };
  const [kids, links] = await Promise.all([
    db().from("children").select("id, created_by").in("id", ids),
    db().from("child_parents").select("child_id, parent_id, can_edit").in("child_id", ids),
  ]);
  const add = (c: string, p: string, edit: boolean) => {
    if (!p) return;
    const s = parents.get(c) ?? new Set<string>();
    s.add(p);
    parents.set(c, s);
    const m = legacyEdit.get(c) ?? new Map<string, boolean>();
    m.set(p, (m.get(p) ?? false) || edit);
    legacyEdit.set(c, m);
  };
  for (const r of (check(kids, "permission children") ?? []) as Array<{ id: string; created_by: string }>) add(r.id, r.created_by, true);
  for (const r of (check(links, "permission links") ?? []) as Array<{ child_id: string; parent_id: string; can_edit: boolean }>) add(r.child_id, r.parent_id, !!r.can_edit);
  return { parents, legacyEdit };
}

/** Raw rows for (children x parents). */
async function rowsFor(childIds: string[], parentIds: string[]) {
  if (!childIds.length || !parentIds.length) return [] as Array<Record<string, any>>;
  return (check(
    await db()
      .from("child_parent_permissions")
      .select("child_id, parent_id, section, can_view, can_propose, can_edit, basis, granted_by, updated_at")
      .in("child_id", childIds)
      .in("parent_id", parentIds),
    "load permissions",
  ) ?? []) as Array<Record<string, any>>;
}

function effective(row: Record<string, any> | undefined, section: Section, legacyEdit: boolean): SectionAccess {
  const base = row
    ? { view: !!row.can_view, propose: !!row.can_propose, edit: !!row.can_edit, basis: String(row.basis ?? "legacy_baseline") }
    : { ...BASELINE };
  if (ALWAYS_VIEW.includes(section)) base.view = true;
  if (!base.view) {
    base.propose = false;
    base.edit = false;
  }
  if (!legacyEdit) base.edit = false; // an older read-only link stays read-only
  return base;
}

/**
 * Effective access of `parentId` per child and section. Children the parent is not linked to are absent.
 * (Use for the caller: parentId = session user id.)
 */
export async function accessFor(parentId: string, childIds: string[], links?: Links): Promise<Map<string, ChildAccessMap>> {
  const l = links ?? await linkedParents(childIds);
  const mine = [...new Set(childIds)].filter((c) => l.parents.get(c)?.has(parentId));
  const rows = await rowsFor(mine, [parentId]);
  const out = new Map<string, ChildAccessMap>();
  for (const c of mine) {
    const legacy = l.legacyEdit.get(c)?.get(parentId) ?? false;
    const m: ChildAccessMap = {};
    for (const s of SECTIONS) m[s] = effective(rows.find((r) => r.child_id === c && r.section === s), s, legacy);
    out.set(c, m);
  }
  return out;
}

/** Effective access of every linked parent of one child: Map parent -> sections. */
export async function accessOfAllParents(childId: string): Promise<Map<string, ChildAccessMap>> {
  const l = await linkedParents([childId]);
  const parents = [...(l.parents.get(childId) ?? [])];
  const rows = await rowsFor([childId], parents);
  const out = new Map<string, ChildAccessMap>();
  for (const p of parents) {
    const legacy = l.legacyEdit.get(childId)?.get(p) ?? false;
    const m: ChildAccessMap = {};
    for (const s of SECTIONS) m[s] = effective(rows.find((r) => r.parent_id === p && r.section === s), s, legacy);
    out.set(p, m);
  }
  return out;
}

/** May this (session) parent perform `action` on `section` of this child? false when not linked. */
export async function parentMay(me: string, childId: string, section: Section, action: Action): Promise<boolean> {
  const a = (await accessFor(me, [childId])).get(childId);
  return !!a && !!a[section]?.[action];
}

/** Batch: the subset of childIds on which the parent may perform `action` on `section`. */
export async function parentMayBatch(me: string, childIds: string[], section: Section, action: Action): Promise<Set<string>> {
  const a = await accessFor(me, childIds);
  return new Set([...a.entries()].filter(([, m]) => m[section]?.[action]).map(([c]) => c));
}

/**
 * Throws NOT_FOUND when the parent is not linked to the child or may not even VIEW the section
 * (same answer as a missing record), FORBIDDEN when they may view but not perform `action`.
 */
export async function assertParentMay(me: string, childId: string, section: Section, action: Action): Promise<SectionAccess> {
  const a = (await accessFor(me, [childId])).get(childId);
  const s = a?.[section];
  if (!s || !s.view) throw err.notFound("Not found");
  if (!s[action]) throw err.forbidden("No permission for this section");
  return s;
}

/**
 * Seeds the baseline (full access, 'legacy_baseline') for these parents on these children. Existing rows
 * (restrictions) are never overwritten. Call whenever a parent gets linked to a child.
 */
export async function seedBaseline(childIds: string[], parentIds: string[]): Promise<void> {
  const rows = [];
  for (const c of new Set(childIds)) {
    for (const p of new Set(parentIds)) {
      if (!c || !p) continue;
      for (const s of SECTIONS) rows.push({ child_id: c, parent_id: p, section: s, can_view: true, can_propose: true, can_edit: true, basis: "legacy_baseline" });
    }
  }
  if (!rows.length) return;
  check(
    await db().from("child_parent_permissions").upsert(rows, { onConflict: "child_id,parent_id,section", ignoreDuplicates: true }),
    "seed permissions",
  );
}

/** Removes the access rows and open requests of a parent for children they are no longer linked to. */
export async function dropAccess(childIds: string[], parentId: string): Promise<void> {
  if (!childIds.length) return;
  check(await db().from("child_parent_permissions").delete().eq("parent_id", parentId).in("child_id", childIds), "drop permissions");
  check(
    await db().from("child_permission_requests").update({ status: "expired", responded_at: new Date().toISOString() })
      .eq("status", "pending").in("child_id", childIds).or(`target_parent_id.eq.${parentId},requested_by.eq.${parentId},approver_id.eq.${parentId}`),
    "expire permission requests",
  );
}

/** Only the enforced sections, as plain flags (for API output). */
export function publicAccess(m: ChildAccessMap | undefined): Record<string, { view: boolean; propose: boolean; edit: boolean; basis: string }> {
  const out: Record<string, { view: boolean; propose: boolean; edit: boolean; basis: string }> = {};
  for (const s of ENFORCED_SECTIONS) {
    const a = m?.[s] ?? { view: false, propose: false, edit: false, basis: "none" };
    out[s] = { view: a.view, propose: a.propose, edit: a.edit, basis: a.basis };
  }
  return out;
}

/** Normalises requested flags: no view = nothing; edit implies view; basis is always viewable. */
export function normaliseFlags(section: Section, v: { view: unknown; propose: unknown; edit: unknown }) {
  let view = v.view === true, propose = v.propose === true, edit = v.edit === true;
  if (ALWAYS_VIEW.includes(section)) view = true;
  if (!view) { propose = false; edit = false; }
  return { view, propose, edit };
}

/** true when every flag of `next` is <= the same flag of `cur` (a pure restriction). */
export function isRestriction(cur: SectionAccess, next: { view: boolean; propose: boolean; edit: boolean }) {
  return (!next.view || cur.view) && (!next.propose || cur.propose) && (!next.edit || cur.edit);
}

/** Writes an effective row (used after a valid self-restriction or an accepted request). */
export async function writeAccess(
  childId: string, parentId: string, section: Section,
  flags: { view: boolean; propose: boolean; edit: boolean },
  basis: "legacy_baseline" | "self_restriction" | "agreed", grantedBy: string, approvedBy: string | null,
) {
  const full = flags.view && flags.propose && flags.edit;
  check(
    await db().from("child_parent_permissions").upsert({
      child_id: childId, parent_id: parentId, section,
      can_view: flags.view, can_propose: flags.propose, can_edit: flags.edit,
      basis: full && basis !== "agreed" ? "legacy_baseline" : basis,
      granted_by: grantedBy, approved_by: approvedBy, updated_at: new Date().toISOString(),
    }, { onConflict: "child_id,parent_id,section" }),
    "write permission",
  );
}
