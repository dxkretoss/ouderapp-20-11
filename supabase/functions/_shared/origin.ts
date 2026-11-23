// Which web origin may appear in e-mailed links.
import { err } from "./respond.ts";

function originOf(v: string): string | null {
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** APP_ORIGINS (comma-separated) allow-list. */
export function allowedOrigins(): string[] {
  return (Deno.env.get("APP_ORIGINS") || "")
    .split(",")
    .map((s) => originOf(s))
    .filter((s): s is string => !!s);
}

/**
 * `requested` is used only when it is in APP_ORIGINS; otherwise PUBLIC_APP_URL,
 * otherwise the first APP_ORIGINS entry.
 */
export function appOrigin(requested?: unknown): string {
  const allowed = allowedOrigins();
  if (typeof requested === "string" && requested) {
    const o = originOf(requested);
    if (o && allowed.includes(o)) return o;
  }
  const pub = originOf(Deno.env.get("PUBLIC_APP_URL") || "");
  if (pub) return pub;
  if (allowed.length) return allowed[0];
  console.error("[origin] PUBLIC_APP_URL / APP_ORIGINS not configured");
  throw err.server("App URL is not configured");
}
