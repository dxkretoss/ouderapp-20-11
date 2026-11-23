import bcrypt from "npm:bcryptjs@2.4.3";
import { HttpError } from "./respond.ts";

const BCRYPT_RE = /^\$2[aby]\$/;
// A valid bcrypt hash of a random string, used to keep timing similar for unknown users.
const DUMMY_HASH = "$2a$10$CWI..vG/Y2p3nR8aMqAExO3Xx3wK8mDQ5mx/CI8UiqmXpk5d9IJwi";

/** Policy: >= 8 chars, >= 1 uppercase letter, >= 1 digit or special character. */
export function assertPasswordPolicy(password: unknown): string {
  if (typeof password !== "string") throw new HttpError(400, "WEAK_PASSWORD", "Password is required");
  if (password.length > 200) throw new HttpError(400, "WEAK_PASSWORD", "Password is too long");
  const okLength = password.length >= 8;
  const okUpper = /[A-Z]/.test(password);
  const okDigitOrSpecial = /[0-9]|[^A-Za-z0-9]/.test(password);
  if (!okLength || !okUpper || !okDigitOrSpecial) {
    throw new HttpError(
      400,
      "WEAK_PASSWORD",
      "Password must have at least 8 characters, one uppercase letter and one digit or special character",
    );
  }
  return password;
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

/**
 * bcrypt only. Plaintext/legacy values were re-hashed by the Phase 1 migration, so
 * anything that is not a bcrypt hash (or NULL, e.g. the retired admin) never matches.
 */
export async function verifyPassword(password: unknown, stored: string | null | undefined): Promise<boolean> {
  const candidate = typeof password === "string" ? password : "";
  if (!stored || !BCRYPT_RE.test(stored) || !candidate) {
    // spend comparable time so unknown/disabled accounts are not distinguishable by timing
    try {
      await bcrypt.compare(candidate || "x", DUMMY_HASH);
    } catch { /* ignore */ }
    return false;
  }
  try {
    return await bcrypt.compare(candidate, stored);
  } catch {
    return false;
  }
}
