// Circle members (family_caregivers) and their per-child, per-section permissions.
// Used by manage-caregivers and available to other functions that serve CAREGIVER sessions:
// a caregiver may only see a section of a child when caregiverMay(...) says so (default: nothing).
import { db } from "./db.ts";
import { check, err } from "./respond.ts";

/** Sections and the levels each one allows (same ids as the app's kring-store). */
export const SECTIONS: Record<string, string[]> = {
  wissel: ["bekijken"],
  momentjes: ["bekijken", "bijdragen"],
  taken: ["bekijken", "bijdragen"],
  spullen: ["bekijken", "bijdragen"],
  agenda: ["bekijken", "bijdragen"],
  nood: ["bekijken"],
  documenten: ["bekijken"],
};

export const CAREGIVER_COLS =
  "id, created_by, name, role, phone, email, address, photo_url, is_emergency_contact, invite_token, status, " +
  "connected_user_id, valid_from, valid_to, valid_until, child_ids, invited_at, accepted_at, revoked_at, created_at, updated_at";

export interface Grant {
  caregiver_id: string;
  child_id: string;
  section: string;
  level: string;
}

/** Today's date in the Netherlands (YYYY-MM-DD); access periods are calendar days there. */
export function todayNl(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Within the access period (inclusive dates) and not revoked. Says nothing about invited/accepted. */
export function inPeriod(row: Record<string, any>, today = todayNl()): boolean {
  if (row.revoked_at || row.status === "revoked") return false;
  const from = row.valid_from ? String(row.valid_from).slice(0, 10) : null;
  const to = row.valid_to ? String(row.valid_to).slice(0, 10) : null;
  if (from && today < from) return false;
  if (to && today > to) return false;
  return true;
}

/** A member whose account currently has access: accepted (active), in period, not revoked. */
export function hasLiveAccess(row: Record<string, any>, today = todayNl()): boolean {
  return row.status === "active" && !!row.connected_user_id && inPeriod(row, today);
}

/** Normalises a stored level; old rows may say "none"/"geen". */
export function normLevel(section: string, level: unknown): string {
  const allowed = SECTIONS[section];
  if (!allowed || typeof level !== "string") return "geen";
  return allowed.includes(level) ? level : "geen";
}

/** Circle records of this account (as caregiver) that grant access right now. */
export async function liveCaregiverRows(userId: string): Promise<Record<string, any>[]> {
  const rows = (check(
    await db().from("family_caregivers").select(CAREGIVER_COLS).eq("connected_user_id", userId).eq("status", "active"),
    "caregiver rows for user",
  ) ?? []) as Record<string, any>[];
  const today = todayNl();
  return rows.filter((r) => hasLiveAccess(r, today));
}

/**
 * Grants (levels above "geen") of these circle records, only for children the record belongs to.
 * The caller decides whether the records themselves are live (see hasLiveAccess / liveCaregiverRows).
 */
export async function rowGrants(rows: Record<string, any>[]): Promise<Grant[]> {
  if (!rows.length) return [];
  const perms = (check(
    await db().from("caregiver_permissions").select("caregiver_id, child_id, section, permission_level").in(
      "caregiver_id",
      rows.map((r) => r.id),
    ),
    "caregiver grants",
  ) ?? []) as Array<{ caregiver_id: string; child_id: string; section: string; permission_level: string }>;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: Grant[] = [];
  for (const p of perms) {
    const r = byId.get(p.caregiver_id);
    const level = normLevel(p.section, p.permission_level);
    if (!r || level === "geen") continue;
    if (!(r.child_ids ?? []).includes(p.child_id)) continue;
    out.push({ caregiver_id: p.caregiver_id, child_id: p.child_id, section: p.section, level });
  }
  return out;
}

/** Every live grant of this account as a caregiver (only levels above "geen", only for its children). */
export async function caregiverGrantsFor(userId: string): Promise<Grant[]> {
  return rowGrants(await liveCaregiverRows(userId));
}

/**
 * Does this record grant one of `sections` (at least `min`) for EVERY given child?
 * Used for pick-up assignments (wissel/agenda) and help requests (wissel/agenda/taken).
 */
export function grantsAll(grants: Grant[], caregiverId: string, childIds: string[], sections: string[], min = "bekijken"): boolean {
  return childIds.length > 0 && childIds.every((c) =>
    grants.some((g) => g.caregiver_id === caregiverId && g.child_id === c && sections.includes(g.section) && (min === "bekijken" || g.level === "bijdragen"))
  );
}

/** May this account (as caregiver) use `section` of `childId` at least at `min` ("bekijken" | "bijdragen")? */
export async function caregiverMay(userId: string, childId: string, section: string, min = "bekijken"): Promise<boolean> {
  const grants = await caregiverGrantsFor(userId);
  return grants.some((g) => g.child_id === childId && g.section === section && (min === "bekijken" || g.level === "bijdragen"));
}

/** Throws FORBIDDEN unless caregiverMay(...) — for functions that serve caregiver sessions. */
export async function assertCaregiverMay(userId: string, childId: string, section: string, min = "bekijken"): Promise<void> {
  if (!(await caregiverMay(userId, childId, section, min))) throw err.forbidden("No permission for this section");
}
