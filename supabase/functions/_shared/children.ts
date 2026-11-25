// Builds the API "Child" shape (never includes bsn or private notes).
// Profile sections the caller may not VIEW (child_parent_permissions) are left out entirely.
import { db } from "./db.ts";
import { check } from "./respond.ts";
import { resolveAvatars } from "./storage.ts";
import { parseJsonText } from "./util.ts";
import { coParentsByChild } from "./access.ts";
import { accessFor, type ChildAccessMap, linkedParents, publicAccess, type Section } from "./parent-permissions.ts";

export const CHILD_COLS =
  "id, name, last_name, date_of_birth, color_code, avatar_url, description, school, daycare, doctor, " +
  "medical_notes, allergies, dietary_notes, clothes_size, shoe_size, profile, care_schedule, custody, " +
  "practical_notes, created_by, created_at";

/** Which columns / profile sections belong to which permission section ("basis" = everything else). */
export const SECTION_COLUMNS: Partial<Record<Section, string[]>> = {
  school: ["school", "daycare"],
  gezondheid: ["doctor", "medical_notes", "allergies", "dietary_notes"],
  praktisch: ["clothes_size", "shoe_size"],
};
/** profile.<key> -> permission section */
export const PROFILE_SECTION: Record<string, Section> = {
  basis: "basis",
  school: "school",
  gezondheid: "gezondheid",
  praktisch: "praktisch",
  personen: "personen",
  noodkaart: "noodkaart",
};
/** Permission section of a column (update / redaction). */
export function sectionOfColumn(col: string): Section {
  for (const [s, cols] of Object.entries(SECTION_COLUMNS)) if (cols!.includes(col)) return s as Section;
  return "basis";
}

export interface LinkedParent {
  id: string;
  name: string;
  avatar: string | null;
}

export interface ApiChild {
  id: string;
  name: string;
  last_name: string | null;
  date_of_birth: string | null;
  color_code: string | null;
  avatar: string | null;
  description: string | null;
  school: string | null;
  daycare: string | null;
  doctor: string | null;
  medical_notes: string | null;
  allergies: string | null;
  dietary_notes: string | null;
  clothes_size: string | null;
  shoe_size: string | null;
  profile: Record<string, unknown>;
  care_schedule: unknown;
  custody: string | null;
  custody_meta: unknown;
  custody_record: Record<string, unknown> | null;
  created_by: string;
  my_role: string;
  can_edit: boolean;
  linked_parents: LinkedParent[];
  /** Samen = an actively connected other parent is linked to this child. */
  samen: boolean;
  andere_ouder: LinkedParent | null;
  /** The caller's effective access per enforced section. */
  my_access: Record<string, { view: boolean; propose: boolean; edit: boolean; basis: string }>;
  /** Sections left out because the caller may not view them. */
  hidden_sections: string[];
}

/** Removes the data of sections the caller may not view. */
export function redact(child: Record<string, any>, access: ChildAccessMap | undefined): string[] {
  const hidden: string[] = [];
  for (const [s, cols] of Object.entries(SECTION_COLUMNS)) {
    if (access?.[s]?.view) continue;
    for (const c of cols!) child[c] = null;
    hidden.push(s);
  }
  const profile = { ...(child.profile ?? {}) };
  for (const [key, s] of Object.entries(PROFILE_SECTION)) {
    if (access?.[s]?.view) continue;
    delete profile[key];
    if (!hidden.includes(s)) hidden.push(s);
  }
  child.profile = profile;
  return hidden;
}

/**
 * Loads the given children (which the caller has ALREADY been authorised for) and
 * returns them in API shape from the perspective of `userId`.
 * linked_parents = every other parent of the child (creator + child_parents), excluding the caller.
 */
export async function buildChildren(userId: string, childIds: string[]): Promise<ApiChild[]> {
  if (!childIds.length) return [];
  const rows = (check(
    await db().from("children").select(CHILD_COLS).in("id", childIds).order("created_at", { ascending: true }),
    "load children",
  ) ?? []) as Record<string, any>[];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);

  const [linkRes, perm, pairs] = await Promise.all([
    db().from("child_parents")
      .select("child_id, parent_id, role, can_edit, created_at, gezag_status, gezag_provenance, reported_by, reported_at, acknowledged_by, acknowledged_at, restrictions_note")
      .in("child_id", ids),
    linkedParents(ids),
    coParentsByChild(userId),
  ]);
  const links = (check(linkRes, "load child links") ?? []) as Array<Record<string, any>>;
  const access = await accessFor(userId, ids, perm);

  const parentIds = new Set<string>();
  for (const r of rows) parentIds.add(r.created_by);
  for (const l of links) parentIds.add(l.parent_id);
  parentIds.delete(userId);

  const parents = parentIds.size
    ? ((check(
      await db().from("profiles").select("id, name, avatar_url").in("id", [...parentIds]),
      "load linked parents",
    ) ?? []) as Array<{ id: string; name: string; avatar_url: string | null }>)
    : [];

  // resolve all avatars in one batch
  const avatarInputs = [...rows.map((r) => r.avatar_url), ...parents.map((p) => p.avatar_url)];
  const resolved = await resolveAvatars(avatarInputs);
  const childAvatar = resolved.slice(0, rows.length);
  const parentAvatar = new Map(parents.map((p, i) => [p.id, resolved[rows.length + i]]));
  const parentById = new Map(parents.map((p) => [p.id, p]));
  const person = (id: string): LinkedParent => ({ id, name: parentById.get(id)!.name, avatar: parentAvatar.get(id) ?? null });

  return rows.map((r, i) => {
    const myLink = links.find((l) => l.child_id === r.id && l.parent_id === userId);
    const isCreator = r.created_by === userId;
    const otherIds = new Set<string>([r.created_by, ...links.filter((l) => l.child_id === r.id).map((l) => l.parent_id)]);
    otherIds.delete(userId);
    const practical = parseJsonText(r.practical_notes);
    const profile = r.profile && typeof r.profile === "object" && !Array.isArray(r.profile) ? r.profile : {};
    const connected = (pairs.get(r.id) ?? []).filter((p) => parentById.has(p));
    // custody provenance: written on every link of the child at once; read it from my own link (or any link)
    const rec = myLink?.gezag_provenance ? myLink : links.find((l) => l.child_id === r.id && l.gezag_provenance);
    const myAccess = access.get(r.id);
    const child: Record<string, any> = {
      id: r.id,
      name: r.name,
      last_name: r.last_name ?? null,
      date_of_birth: r.date_of_birth ? String(r.date_of_birth).slice(0, 10) : null,
      color_code: r.color_code ?? null,
      avatar: childAvatar[i],
      description: r.description ?? null,
      school: r.school ?? null,
      daycare: r.daycare ?? null,
      doctor: r.doctor ?? null,
      medical_notes: r.medical_notes ?? null,
      allergies: r.allergies ?? null,
      dietary_notes: r.dietary_notes ?? null,
      clothes_size: r.clothes_size ?? null,
      shoe_size: r.shoe_size ?? null,
      profile,
      care_schedule: parseJsonText(r.care_schedule),
      custody: r.custody ?? null,
      custody_meta: practical && typeof practical === "object" ? practical.custody_meta ?? null : null,
      custody_record: rec
        ? {
          provenance: rec.gezag_provenance,
          my_status: myLink?.gezag_status ?? null,
          reported_by: rec.reported_by ? (rec.reported_by === userId ? "ik" : "ander") : null,
          reported_at: rec.reported_at ?? null,
          acknowledged_at: rec.acknowledged_at ?? null,
          // a restriction note is only shown to the parent who wrote it
          restrictions_note: rec.reported_by === userId ? rec.restrictions_note ?? null : null,
        }
        : null,
      created_by: r.created_by,
      my_role: myLink?.role || "parent",
      can_edit: isCreator || !!myLink?.can_edit,
      linked_parents: [...otherIds].filter((id) => parentById.has(id)).map(person),
      samen: connected.length > 0,
      andere_ouder: connected.length ? person(connected[0]) : null,
      my_access: publicAccess(myAccess),
      hidden_sections: [] as string[],
    };
    child.hidden_sections = redact(child, myAccess);
    return child as ApiChild;
  });
}

export async function buildChild(userId: string, childId: string): Promise<ApiChild | null> {
  const list = await buildChildren(userId, [childId]);
  return list[0] ?? null;
}
