// Session tokens: random 32-byte hex handed to the client once; only the sha256 is stored.
import { db } from "./db.ts";
import { check, err } from "./respond.ts";
import { PROFILE_PUBLIC_COLS } from "./users.ts";
import { randomHex, sha256Hex } from "./util.ts";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  usage_mode: string;
  is_verified: boolean;
  onboarding_completed: boolean;
  role: string;
  session_id: string;
}

const SESSION_DAYS = 30;
const TOUCH_AFTER_MS = 5 * 60 * 1000;

function readToken(req: Request): string | null {
  const raw = req.headers.get("x-session-token");
  if (!raw) return null;
  const token = raw.trim();
  // our tokens are 64 hex chars; anything else can never match
  return /^[0-9a-f]{64}$/i.test(token) ? token.toLowerCase() : null;
}

/** Creates a session and returns the plaintext token (only ever returned once). */
export async function createSession(userId: string, req: Request): Promise<string> {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const ua = (req.headers.get("user-agent") || "").slice(0, 300) || null;
  check(
    await db().from("user_sessions").insert({
      user_id: userId,
      token_hash: tokenHash,
      user_agent: ua,
      expires_at: new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000).toISOString(),
    }),
    "create session",
  );
  return token;
}

export async function optionalUser(req: Request): Promise<SessionUser | null> {
  const token = readToken(req);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const session = check(
    await db()
      .from("user_sessions")
      .select("id, user_id, expires_at, revoked_at, last_seen_at")
      .eq("token_hash", tokenHash)
      .maybeSingle(),
    "load session",
  ) as { id: string; user_id: string; expires_at: string; revoked_at: string | null; last_seen_at: string } | null;
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return null;

  const profile = check(
    await db().from("profiles").select(PROFILE_PUBLIC_COLS).eq("id", session.user_id).maybeSingle(),
    "load session profile",
  ) as Record<string, any> | null;
  if (!profile || !profile.is_verified) return null;

  if (Date.now() - new Date(session.last_seen_at).getTime() > TOUCH_AFTER_MS) {
    const { error } = await db()
      .from("user_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", session.id);
    if (error) console.warn("[session] touch failed:", error);
  }

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    usage_mode: profile.usage_mode,
    is_verified: profile.is_verified,
    onboarding_completed: profile.onboarding_completed,
    role: profile.role || "parent",
    session_id: session.id,
  };
}

/** Returns the session user or throws 401 UNAUTHORIZED. */
export async function requireUser(req: Request): Promise<SessionUser> {
  const user = await optionalUser(req);
  if (!user) throw err.unauthorized();
  return user;
}

/** Revokes the session carried by this request (no-op without a valid token). */
export async function revokeCurrentSession(req: Request): Promise<void> {
  const token = readToken(req);
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  check(
    await db()
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)
      .is("revoked_at", null),
    "revoke session",
  );
}

export async function revokeAllSessions(userId: string): Promise<void> {
  check(
    await db()
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("revoked_at", null),
    "revoke all sessions",
  );
}
