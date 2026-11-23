// Access rules for children and co-parents. Always called with the SESSION user id.
import { db } from "./db.ts";
import { check, err } from "./respond.ts";

export interface ChildAccess {
  child_id: string;
  created_by: string;
  is_creator: boolean;
  my_role: string;
  can_edit: boolean;
}

/** Children the user created or is linked to via child_parents. */
export async function childIdsFor(userId: string): Promise<string[]> {
  const [created, linked] = await Promise.all([
    db().from("children").select("id").eq("created_by", userId),
    db().from("child_parents").select("child_id").eq("parent_id", userId),
  ]);
  const a = check(created, "children by creator") as Array<{ id: string }> | null;
  const b = check(linked, "children by link") as Array<{ child_id: string }> | null;
  return [...new Set([...(a ?? []).map((r) => r.id), ...(b ?? []).map((r) => r.child_id)])];
}

/**
 * Throws NOT_FOUND when the child does not exist or the user has no access,
 * FORBIDDEN when edit is required but the user may only view.
 */
export async function assertChildAccess(
  userId: string,
  childId: string,
  opts: { edit?: boolean } = {},
): Promise<ChildAccess> {
  const child = check(
    await db().from("children").select("id, created_by").eq("id", childId).maybeSingle(),
    "load child",
  ) as { id: string; created_by: string } | null;
  if (!child) throw err.notFound("Child not found");
  const link = check(
    await db()
      .from("child_parents")
      .select("role, can_edit")
      .eq("child_id", childId)
      .eq("parent_id", userId)
      .maybeSingle(),
    "load child link",
  ) as { role: string; can_edit: boolean } | null;
  const isCreator = child.created_by === userId;
  if (!isCreator && !link) throw err.notFound("Child not found");
  const access: ChildAccess = {
    child_id: child.id,
    created_by: child.created_by,
    is_creator: isCreator,
    my_role: link?.role || "parent",
    can_edit: isCreator || !!link?.can_edit,
  };
  if (opts.edit && !access.can_edit) throw err.forbidden("No edit permission for this child");
  return access;
}

export const ACTIVE_CONNECTION = ["active", "connected"];

/** Co-parents with an active (undirected) parent_connections row. */
export async function coParentIdsFor(userId: string): Promise<string[]> {
  const rows = check(
    await db()
      .from("parent_connections")
      .select("parent_1_id, parent_2_id")
      .or(`parent_1_id.eq.${userId},parent_2_id.eq.${userId}`)
      .in("status", ACTIVE_CONNECTION),
    "co-parents",
  ) as Array<{ parent_1_id: string; parent_2_id: string }> | null;
  const ids = (rows ?? []).map((r) => (r.parent_1_id === userId ? r.parent_2_id : r.parent_1_id));
  return [...new Set(ids.filter((id) => id && id !== userId))];
}

/** The undirected connection between two users (any status), if any. */
export async function findConnection(a: string, b: string): Promise<Record<string, any> | null> {
  const rows = check(
    await db()
      .from("parent_connections")
      .select("*")
      .or(`and(parent_1_id.eq.${a},parent_2_id.eq.${b}),and(parent_1_id.eq.${b},parent_2_id.eq.${a})`)
      .limit(1),
    "find connection",
  ) as Record<string, any>[] | null;
  return rows && rows.length ? rows[0] : null;
}

/** Number of distinct parents (links + creator) of a child, optionally ignoring one user. */
export async function parentCount(childId: string, createdBy: string, ignoreUserId?: string): Promise<number> {
  const links = check(
    await db().from("child_parents").select("parent_id").eq("child_id", childId),
    "count parents",
  ) as Array<{ parent_id: string }> | null;
  const ids = new Set((links ?? []).map((l) => l.parent_id));
  if (createdBy) ids.add(createdBy);
  if (ignoreUserId) ids.delete(ignoreUserId);
  return ids.size;
}
