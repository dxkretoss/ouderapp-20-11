// 6-digit e-mail codes. Stored only as sha256, 15 min expiry, max 5 attempts.
import { db } from "./db.ts";
import { check, HttpError } from "./respond.ts";
import { safeEqual, sha256Hex } from "./util.ts";

export type CodePurpose = "verify" | "reset";

export const CODE_TTL_MINUTES = 15;
export const CODE_MAX_ATTEMPTS = 5;
export const CODES_PER_HOUR = 5;

/** Uniform random 6-digit code (rejection sampling, no modulo bias). */
export function generateCode(): string {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

async function hashCode(purpose: CodePurpose, userId: string, code: string): Promise<string> {
  return await sha256Hex(`${purpose}:${userId}:${code}`);
}

/** Counts rate events for this email in the window. */
export async function countRateEvents(email: string, kind: string, windowMinutes: number): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const res = await db()
    .from("auth_rate_events")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .eq("kind", kind)
    .gte("created_at", since);
  if (res.error) {
    console.error("[rate] count failed:", res.error);
    throw new HttpError(500, "SERVER", "Rate limit check failed");
  }
  return res.count ?? 0;
}

export async function recordRateEvent(email: string, kind: string): Promise<void> {
  const { error } = await db().from("auth_rate_events").insert({ email, kind });
  if (error) console.warn("[rate] record failed:", error);
}

/** Max CODES_PER_HOUR codes per email per hour (counted whether or not the account exists). */
export async function isCodeRateLimited(email: string, purpose: CodePurpose): Promise<boolean> {
  return (await countRateEvents(email, purpose, 60)) >= CODES_PER_HOUR;
}

export async function assertCodeRateLimit(email: string, purpose: CodePurpose): Promise<void> {
  if (await isCodeRateLimited(email, purpose)) {
    throw new HttpError(429, "RATE_LIMITED", "Too many codes requested, try again later");
  }
}

/**
 * Generates a code, records the rate event and stores the hash on the profile.
 * Returns the plaintext code (to be e-mailed, never returned to the client).
 */
export async function issueCode(userId: string, email: string, purpose: CodePurpose): Promise<string> {
  const code = generateCode();
  await recordRateEvent(email, purpose);
  check(
    await db()
      .from("profiles")
      .update({
        code_hash: await hashCode(purpose, userId, code),
        code_purpose: purpose,
        code_expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString(),
        code_attempts: 0,
        verification_code: null,
      })
      .eq("id", userId),
    "store code",
  );
  return code;
}

export interface CodeState {
  id: string;
  code_hash: string | null;
  code_purpose: string | null;
  code_expires_at: string | null;
  code_attempts: number | null;
}

/**
 * Validates a submitted code against the profile. Wrong codes increase the attempt
 * counter. With consume=true a correct code is cleared (single use).
 * Throws CODE_INVALID / CODE_EXPIRED / TOO_MANY_ATTEMPTS.
 */
export async function checkCode(
  profile: CodeState | null,
  purpose: CodePurpose,
  submitted: unknown,
  consume: boolean,
): Promise<void> {
  const code = typeof submitted === "string" ? submitted.trim() : String(submitted ?? "");
  if (!profile || !profile.code_hash || profile.code_purpose !== purpose || !/^\d{6}$/.test(code)) {
    if (profile && profile.code_hash && profile.code_purpose === purpose) {
      await bumpAttempts(profile);
    }
    throw new HttpError(400, "CODE_INVALID", "Code is invalid");
  }
  const attempts = profile.code_attempts ?? 0;
  if (attempts >= CODE_MAX_ATTEMPTS) {
    throw new HttpError(429, "TOO_MANY_ATTEMPTS", "Too many attempts, request a new code");
  }
  if (!profile.code_expires_at || new Date(profile.code_expires_at).getTime() <= Date.now()) {
    throw new HttpError(400, "CODE_EXPIRED", "Code has expired, request a new code");
  }
  const expected = await hashCode(purpose, profile.id, code);
  if (!safeEqual(expected, profile.code_hash)) {
    const now = await bumpAttempts(profile);
    if (now >= CODE_MAX_ATTEMPTS) {
      throw new HttpError(429, "TOO_MANY_ATTEMPTS", "Too many attempts, request a new code");
    }
    throw new HttpError(400, "CODE_INVALID", "Code is invalid");
  }
  if (consume) await clearCode(profile.id);
}

async function bumpAttempts(profile: CodeState): Promise<number> {
  const next = (profile.code_attempts ?? 0) + 1;
  const { error } = await db().from("profiles").update({ code_attempts: next }).eq("id", profile.id);
  if (error) console.warn("[codes] attempt bump failed:", error);
  return next;
}

export async function clearCode(userId: string): Promise<void> {
  check(
    await db()
      .from("profiles")
      .update({ code_hash: null, code_purpose: null, code_expires_at: null, code_attempts: 0 })
      .eq("id", userId),
    "clear code",
  );
}
