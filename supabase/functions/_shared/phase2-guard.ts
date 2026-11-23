// Minimal Phase 1 hardening for the Phase 2 functions (not yet rewritten):
// a valid session is required and the identity fields in the body are pinned to
// the session user, so callers can no longer act as somebody else by sending an id.
// Object-level access checks (e.g. "may this user touch expense X?") are still
// missing in those functions -> see "Phase 2: to secure" in supabase/DEPLOY-PHASE1.md.
import { fail } from "./respond.ts";
import { optionalUser, SessionUser } from "./session.ts";

const IDENTITY_FIELDS = ["user_id", "userId", "parent_id", "parentId", "actor_id", "actorId"];

/** Overwrites caller-identity fields that are present in the body with the session user id. */
export function pinIdentity(body: Record<string, unknown> | null | undefined, user: SessionUser): void {
  if (!body || typeof body !== "object") return;
  for (const k of IDENTITY_FIELDS) {
    if (k in body) body[k] = user.id;
  }
  // always present, so "filter by user if given" code paths are always filtered
  body.user_id = user.id;
  body.userId = user.id;
}

/**
 * Returns a 401 Response when there is no valid session; otherwise pins the identity
 * fields of `body` (when given) and returns null.
 */
export async function phase2Guard(req: Request, body?: Record<string, unknown>): Promise<Response | null> {
  let user: SessionUser | null = null;
  try {
    user = await optionalUser(req);
  } catch (e) {
    console.error("[phase2-guard] session lookup failed:", e);
    return fail(500, "SERVER", "Internal error");
  }
  if (!user) return fail(401, "UNAUTHORIZED", "No valid session");
  pinIdentity(body, user);
  return null;
}
