// Costs domain helpers (manage-expenses, manage-still-needed).
// Family scope for cost records = the PAIR of parents: the creator and `other_parent_id`
// (the active co-parent at creation time). Records without other_parent_id belong to the creator only.
import { db } from "./db.ts";
import { check, err } from "./respond.ts";
import { assertChildAccess, coParentIdsFor } from "./access.ts";
import { isUuid } from "./util.ts";

export const RECEIPTS_BUCKET = "receipts";
const SIGNED_URL_TTL = 60 * 60; // 1 hour
/** Same ceiling as the old receipts bucket (10 MB). */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export interface Family {
  me: string;
  /** The (first) active co-parent, or null for a solo parent. */
  partner: string | null;
  partners: string[];
}

export async function familyOf(userId: string): Promise<Family> {
  const partners = (await coParentIdsFor(userId)).sort();
  return { me: userId, partner: partners[0] ?? null, partners };
}

/** PostgREST filter: rows created by me or addressed to me. */
export const pairFilter = (me: string, creatorCol = "created_by") => `${creatorCol}.eq.${me},other_parent_id.eq.${me}`;

/** The other party of a pair record, seen from `me`. */
export function otherOf(me: string, creator: string | null, other: string | null): string | null {
  return creator === me ? other : creator;
}

/** Visible = I created it, or it was addressed to me. */
export function assertParticipant(me: string, creator: string | null, other: string | null): void {
  if (creator !== me && other !== me) throw err.notFound();
}

/** Shared mutations need the other party to still be an active co-parent. */
export function assertActivePartner(fam: Family, other: string | null): string {
  if (!other || !fam.partners.includes(other)) throw err.forbidden("No active connection with the other parent");
  return other;
}

/** Validates a list of child ids; every child must be accessible by the user. */
export async function childIdsInput(userId: string, v: unknown): Promise<string[]> {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 20) throw err.validation("child_ids must be an array");
  const ids = [...new Set(v.map((x) => {
    if (!isUuid(x)) throw err.validation("child_ids must contain UUIDs");
    return String(x).toLowerCase();
  }))];
  for (const id of ids) await assertChildAccess(userId, id);
  return ids;
}

export function money(v: unknown, field: string, opts: { allowZero?: boolean } = {}): number {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  if (!Number.isFinite(n) || n < 0 || (!opts.allowZero && n <= 0) || n > 99_999_999) throw err.validation(`${field} must be a positive amount`);
  return Math.round(n * 100) / 100;
}

export function pct(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw err.validation(`${field} must be 0-100`);
  return Math.round(n * 100) / 100;
}

export const r2 = (n: number) => Math.round(n * 100) / 100;

/** Optional future moment (max one year ahead), ISO string. */
export function optFuture(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  const d = new Date(String(v));
  const now = Date.now();
  if (Number.isNaN(d.getTime()) || d.getTime() <= now - 60_000 || d.getTime() > now + 366 * 24 * 3600 * 1000) {
    throw err.validation(`${field} must be a future moment`);
  }
  return d.toISOString();
}

/** Known payment-request hosts only (same list as the app). Returns the normalised URL or throws. */
export function safePaymentLink(v: unknown): string {
  try {
    const url = new URL(String(v ?? "").trim());
    const ok = url.protocol === "https:" && !url.username && !url.password && !url.port && url.pathname !== "/" &&
      ["tikkie.me", "betaalverzoek.rabobank.nl", "www.abnamro.nl", "abnamro.nl"].includes(url.hostname);
    if (ok) return url.href;
  } catch { /* fallthrough */ }
  throw err.validation("payment_link is not a recognised payment request link");
}

/** IBAN format + mod-97 check. Returns the compact upper-case IBAN. */
export function validIban(v: unknown): string {
  const s = String(v ?? "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) throw err.validation("bank_iban is not a valid IBAN");
  const moved = s.slice(4) + s.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const code = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of code) rest = (rest * 10 + Number(d)) % 97;
  }
  if (rest !== 1) throw err.validation("bank_iban is not a valid IBAN");
  return s;
}

/** Decodes a receipt/attachment (data URL or raw base64): jpeg/png/webp/pdf, max 10 MB. */
function decodeFile(input: unknown, mimeHint?: unknown): { bytes: Uint8Array; mime: string; ext: string } {
  if (typeof input !== "string" || !input) throw err.validation("file is required");
  let b64 = input;
  let mime = typeof mimeHint === "string" ? mimeHint.toLowerCase() : "";
  const m = input.match(/^data:([a-z/+.-]+);base64,(.*)$/is);
  if (m) {
    mime = m[1].toLowerCase();
    b64 = m[2];
  }
  b64 = b64.replace(/\s+/g, "");
  if (b64.length > Math.ceil((MAX_FILE_BYTES * 4) / 3) + 8) throw err.validation("File is too large (max 10 MB)");
  let bytes: Uint8Array;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    throw err.validation("file is not valid base64");
  }
  // Trust the bytes, not the label.
  const sniff = bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg"
    : bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png"
    : String.fromCharCode(...bytes.slice(0, 4)) === "%PDF" ? "application/pdf"
    : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" ? "image/webp"
    : "";
  if (!sniff || (mime && FILE_TYPES[mime] && FILE_TYPES[mime] !== FILE_TYPES[sniff])) throw err.validation("Only jpeg, png, webp or pdf files are allowed");
  return { bytes, mime: sniff, ext: FILE_TYPES[sniff] };
}

/** Stores a file for an expense and records it in expense_attachments. */
export async function storeAttachment(
  userId: string,
  expenseId: string,
  kind: "bon" | "bijlage",
  file: unknown,
  name: unknown,
): Promise<void> {
  const f = decodeFile(file);
  const path = `${expenseId}/${crypto.randomUUID()}.${f.ext}`;
  const { error } = await db().storage.from(RECEIPTS_BUCKET).upload(path, f.bytes, { contentType: f.mime, upsert: false });
  if (error) {
    console.error("[costs] upload failed:", error);
    throw err.server("Upload failed");
  }
  const fileName = typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : `${kind}.${f.ext}`;
  check(
    await db().from("expense_attachments").insert({ expense_id: expenseId, kind, storage_path: path, file_name: fileName, mime: f.mime, uploaded_by: userId }),
    "insert attachment",
  );
  if (kind === "bon") {
    check(await db().from("expenses").update({ receipt_url: `${RECEIPTS_BUCKET}/${path}` }).eq("id", expenseId).is("receipt_url", null), "set receipt");
  }
}

/** Signed URLs (1 h) for storage paths in the receipts bucket. */
export async function signReceipts(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return out;
  const { data, error } = await db().storage.from(RECEIPTS_BUCKET).createSignedUrls(unique, SIGNED_URL_TTL);
  if (error || !data) {
    console.warn("[costs] signing failed:", error);
    return out;
  }
  for (const row of data as Array<{ path: string | null; signedUrl: string; error: string | null }>) {
    if (row.path && row.signedUrl && !row.error) out.set(row.path, row.signedUrl);
  }
  return out;
}

/** Best-effort audit trail (append-only audit_events) with the family pair in the details. */
export async function audit(
  actor: string,
  entityType: string,
  entityId: string,
  action: string,
  family: Array<string | null>,
  details: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db().from("audit_events").insert({
    actor_id: actor,
    entity_type: entityType,
    entity_id: entityId,
    action,
    details: { ...details, family_ids: family.filter(Boolean) },
  });
  if (error) console.warn("[costs] audit insert failed:", error);
}
