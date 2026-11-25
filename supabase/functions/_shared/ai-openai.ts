// Server-side AI for all "Co" features (Phase 2). The OpenAI key lives ONLY in the function secret
// OPENAI_API_KEY; the browser never sees it. Every call needs a session and passes a per-user rate limit.
// Nothing is stored by OpenAI on our behalf (`store: false`), and we only log timestamps in ai_requests.
import { childIdsFor } from "./access.ts";
import { db } from "./db.ts";
import { check, err, ErrorCode, HttpError } from "./respond.ts";
import { requireUser, SessionUser } from "./session.ts";

const OPENAI_URL = "https://api.openai.com/v1";
/** Same default model as the old ai-coach / co-assistant functions; override with OPENAI_MODEL. */
export const aiModel = (): string => Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
const transcribeModel = (): string => Deno.env.get("OPENAI_TRANSCRIBE_MODEL") || "whisper-1";
const TIMEOUT_MS = 60_000;

const intEnv = (name: string, fallback: number): number => {
  const v = Number(Deno.env.get(name));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
};

const coded = (status: number, code: string, message: string) => new HttpError(status, code as ErrorCode, message);
const rateLimited = () => coded(429, "RATE_LIMITED", "Too many AI requests, try again shortly");
const notConfigured = () => coded(503, "NOT_CONFIGURED", "OPENAI_API_KEY is not configured");

function apiKey(): string {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw notConfigured();
  return key;
}

/**
 * Session + simple per-user rate limit (default 20 requests / minute and 300 / day over all AI features;
 * AI_RATE_PER_MINUTE / AI_RATE_PER_DAY override). Throws UNAUTHORIZED or RATE_LIMITED.
 */
export async function requireAiUser(req: Request, feature: string): Promise<SessionUser> {
  const user = await requireUser(req);
  // Fail fast without counting when the AI is not configured at all.
  apiKey();
  const perMinute = intEnv("AI_RATE_PER_MINUTE", 20);
  const perDay = intEnv("AI_RATE_PER_DAY", 300);
  const now = Date.now();
  // Insert first, then count (own row included): parallel requests cannot all slip under the
  // limit. A rejected request removes its own row again so it does not count.
  const mine = check(
    await db().from("ai_requests").insert({ user_id: user.id, feature: feature.slice(0, 40) }).select("id").single(),
    "ai rate insert",
  ) as { id: number } | null;
  const countSince = async (ms: number) => {
    const res = await db()
      .from("ai_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", new Date(now - ms).toISOString());
    if (res.error) throw new HttpError(500, "SERVER", "AI rate check failed");
    return res.count ?? 0;
  };
  if ((await countSince(60_000)) > perMinute || (await countSince(24 * 3600 * 1000)) > perDay) {
    if (mine?.id) await db().from("ai_requests").delete().eq("id", mine.id);
    throw rateLimited();
  }
  if (Math.random() < 0.02) {
    const { error } = await db()
      .from("ai_requests")
      .delete()
      .lt("created_at", new Date(now - 3 * 24 * 3600 * 1000).toISOString());
    if (error) console.warn("[ai] cleanup failed:", error);
  }
  return user;
}

export type ChatContent =
  | string
  | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
    | { type: "file"; file: { filename: string; file_data: string } }
  >;
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ChatContent;
}

async function post(path: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${OPENAI_URL}${path}`, { ...init, signal: ctrl.signal });
  } catch (e) {
    console.error(`[ai] ${path} network error:`, e);
    throw coded(504, "SERVER", "AI service not reachable");
  } finally {
    clearTimeout(timer);
  }
}

async function failFrom(res: Response, path: string): Promise<never> {
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 500);
  } catch { /* ignore */ }
  console.error(`[ai] ${path} -> ${res.status}: ${detail}`);
  if (res.status === 429) throw rateLimited();
  if (res.status === 400 || res.status === 413 || res.status === 415) {
    throw err.validation("The AI service could not process this input");
  }
  if (res.status === 401 || res.status === 403) throw notConfigured();
  throw coded(502, "SERVER", "AI service error");
}

interface ChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

async function chat(body: Record<string, unknown>): Promise<string> {
  const res = await post("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({ store: false, ...body }),
  });
  if (!res.ok) await failFrom(res, "/chat/completions");
  const json = await res.json();
  const msg = json?.choices?.[0]?.message;
  if (msg?.refusal) {
    console.warn("[ai] refusal:", String(msg.refusal).slice(0, 200));
    throw coded(502, "SERVER", "AI refused");
  }
  const text = typeof msg?.content === "string" ? msg.content : "";
  if (!text.trim()) throw coded(502, "SERVER", "Empty AI answer");
  return text;
}

/** Structured output (json_schema, strict) — returns the parsed object. */
export async function chatJson<T = Record<string, unknown>>(
  opts: ChatOptions & { schema: Record<string, unknown>; name: string },
): Promise<T> {
  const text = await chat({
    model: opts.model || aiModel(),
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 1200,
    response_format: { type: "json_schema", json_schema: { name: opts.name, strict: true, schema: opts.schema } },
  });
  try {
    return JSON.parse(text) as T;
  } catch {
    console.error("[ai] invalid JSON from model:", text.slice(0, 300));
    throw coded(502, "SERVER", "Unusable AI answer");
  }
}

/** Plain text answer. */
export async function chatText(opts: ChatOptions): Promise<string> {
  const text = await chat({
    model: opts.model || aiModel(),
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 600,
  });
  return text.trim();
}

/** Speech to text (audio as bytes). */
export async function transcribe(bytes: Uint8Array, mime: string, lang: "nl" | "en"): Promise<string> {
  const type = (mime || "audio/webm").replace(/^video\//, "audio/").split(";")[0] || "audio/webm";
  const ext = (type.split("/")[1] || "webm").replace(/[^a-z0-9]/gi, "") || "webm";
  const form = new FormData();
  form.append("file", new Blob([bytes as unknown as BlobPart], { type }), `opname.${ext}`);
  form.append("model", transcribeModel());
  form.append("language", lang);
  form.append("response_format", "json");
  const res = await post("/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!res.ok) await failFrom(res, "/audio/transcriptions");
  const json = await res.json();
  return String(json?.text ?? "").trim();
}

/* ---------------------------------------------------------------- minimal family context */

export interface AiChild {
  id: string;
  naam: string;
  geboortedatum: string | null;
}

/** The caller's children (id, first name, date of birth) — nothing else leaves the database. */
export async function childrenForAi(userId: string): Promise<AiChild[]> {
  const ids = await childIdsFor(userId);
  if (!ids.length) return [];
  const rows = check(
    await db().from("children").select("id, name, date_of_birth, created_at").in("id", ids).order("created_at"),
    "children for ai",
  ) as Array<{ id: string; name: string; date_of_birth: string | null }> | null;
  return (rows ?? []).map((c) => ({ id: c.id, naam: (c.name || "").trim(), geboortedatum: c.date_of_birth }));
}

export function ageOf(dob: string | null, now = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age >= 0 && age < 30 ? age : null;
}

/**
 * The minimal GEZIN line (user decision 17 Nov 2026): the speaking parent's name and the children's
 * names + ages. Built on the server from the session user, never from client input.
 */
export function familyLine(user: SessionUser, kids: AiChild[], isEn: boolean): string {
  const kinderen = kids.length
    ? kids.map((k) => {
      const a = ageOf(k.geboortedatum);
      return a === null ? k.naam : isEn ? `${k.naam} (${a} years)` : `${k.naam} (${a} jaar)`;
    }).join(", ")
    : isEn ? "not filled in yet" : "nog niet ingevuld";
  return isEn
    ? `Parent speaking: ${user.name || "unknown"}. Children: ${kinderen}.`
    : `Ouder die praat: ${user.name || "onbekend"}. Kinderen: ${kinderen}.`;
}

/* ---------------------------------------------------------------- small input helpers */

export function str(v: unknown, field: string, max: number, opts: { min?: number; optional?: boolean } = {}): string {
  if (v === undefined || v === null) {
    if (opts.optional) return "";
    throw err.validation(`${field} is required`);
  }
  if (typeof v !== "string") throw err.validation(`${field} must be a string`);
  if (v.length > max) throw err.validation(`${field} is too long (max ${max})`);
  if (v.trim().length < (opts.min ?? 0)) throw err.validation(`${field} is too short`);
  return v;
}

export function oneOf<T extends string>(v: unknown, field: string, allowed: readonly T[]): T {
  if (typeof v !== "string" || !allowed.includes(v as T)) throw err.validation(`${field} is invalid`);
  return v as T;
}

/** Decodes base64 (no data: prefix) with a size cap in bytes. */
export function base64Bytes(b64: string, maxBytes: number): Uint8Array {
  const clean = b64.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) throw err.validation("Invalid base64");
  if (Math.floor((clean.length * 3) / 4) > maxBytes) throw err.validation("File is too large");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
