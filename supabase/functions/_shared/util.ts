// Small validation / crypto helpers shared by the functions.
import { err } from "./respond.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function requireUuid(v: unknown, field: string): string {
  if (!isUuid(v)) throw err.validation(`${field} must be a UUID`);
  return v.toLowerCase();
}

export function normalizeEmail(v: unknown): string {
  if (typeof v !== "string") throw err.validation("email is required");
  const email = v.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) throw err.validation("email is invalid");
  return email;
}

/** Optional trimmed string; '' becomes null. Throws when too long or wrong type. */
export function optText(v: unknown, field: string, max = 2000): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw err.validation(`${field} must be a string`);
  const t = v.trim();
  if (t.length > max) throw err.validation(`${field} is too long (max ${max})`);
  return t === "" ? null : t;
}

export function reqText(v: unknown, field: string, max = 200): string {
  const t = optText(v, field, max);
  if (!t) throw err.validation(`${field} is required`);
  return t;
}

/** YYYY-MM-DD or null/'' (-> null). */
export function optDate(v: unknown, field: string): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw err.validation(`${field} must be YYYY-MM-DD`);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw err.validation(`${field} is not a valid date`);
  return v;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function jsonSize(v: unknown): number {
  return new TextEncoder().encode(JSON.stringify(v ?? null)).length;
}

/** Parses a JSON text column; returns null when empty or invalid. */
export function parseJsonText(v: unknown): any {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return v;
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomHex(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

/** Constant-time comparison of two equal-length hex strings. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Escapes % _ \ for use in an ILIKE pattern (exact, case-insensitive match). */
export function likeExact(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** HTML-escape user supplied text before it goes into an e-mail. */
export function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
