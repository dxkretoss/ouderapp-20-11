// Profile <-> API "user" shape.
import { db } from "./db.ts";
import { check, err } from "./respond.ts";
import { resolveAvatar } from "./storage.ts";

/** Columns that may leave the server (never password, codes or tokens). */
export const PROFILE_PUBLIC_COLS =
  "id, email, name, avatar_url, usage_mode, is_verified, onboarding_completed, preferences, role";

export interface ProfileRow {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  usage_mode: string;
  is_verified: boolean;
  onboarding_completed: boolean;
  preferences: Record<string, unknown> | null;
  role: string | null;
}

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  usage_mode: string;
  is_verified: boolean;
  onboarding_completed: boolean;
  preferences: Record<string, unknown>;
  role: string;
}

export async function toApiUser(p: ProfileRow): Promise<ApiUser> {
  return {
    id: p.id,
    email: p.email,
    name: p.name,
    avatar: await resolveAvatar(p.avatar_url),
    usage_mode: p.usage_mode,
    is_verified: !!p.is_verified,
    onboarding_completed: !!p.onboarding_completed,
    preferences: p.preferences && typeof p.preferences === "object" ? p.preferences : {},
    role: p.role || "parent",
  };
}

export async function loadProfile(userId: string): Promise<ProfileRow> {
  const row = check(
    await db().from("profiles").select(PROFILE_PUBLIC_COLS).eq("id", userId).maybeSingle(),
    "load profile",
  );
  if (!row) throw err.unauthorized("Profile no longer exists");
  return row as ProfileRow;
}

export async function loadApiUser(userId: string): Promise<ApiUser> {
  return await toApiUser(await loadProfile(userId));
}

/** Full row incl. secrets — server-side only. Email must already be normalized (emails are stored lower-case since the Phase 1 migration). */
export async function findProfileByEmailWithSecrets(email: string): Promise<Record<string, any> | null> {
  const rows = check(
    await db()
      .from("profiles")
      .select(`${PROFILE_PUBLIC_COLS}, password, code_hash, code_purpose, code_expires_at, code_attempts`)
      .eq("email", email)
      .limit(1),
    "find profile by email",
  ) as Record<string, any>[] | null;
  return rows && rows.length ? rows[0] : null;
}
