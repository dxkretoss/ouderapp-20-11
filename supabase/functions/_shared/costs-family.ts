// Costs domain helpers (manage-expenses, manage-still-needed).
// Family scope for cost records = the PAIR of parents: the creator and `other_parent_id`
// (the active co-parent at creation time). Records without other_parent_id belong to the creator only.
import { db } from "./db.ts";
import { check, err } from "./respond.ts";
import { assertChildAccess, coParentIdsFor, pairOf } from "./access.ts";
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
  /**
   * The co-parent ONLY when there is exactly one (the usual family); null for a solo parent and for a
   * parent with several co-parents (child 1 with A, child 2 with B). Never use it to address a record
   * that has children: use `pairOf(me, childIds)` so every record goes to the parent of those children.
   */
  partner: string | null;
  partners: string[];
}

export async function familyOf(userId: string): Promise<Family> {
  const partners = (await coParentIdsFor(userId)).sort();
  return { me: userId, partner: partners.length === 1 ? partners[0] : null, partners };
}

/**
 * Pair of a shared cost record: the other parent of these children (see access.pairOf), or null when
 * the record is private ("Alleen jij"), i.e. `shared` is false or the children are Solo.
 */
export async function costPair(me: string, childIds: string[], shared: unknown, requested?: unknown): Promise<string | null> {
  if (shared === false) return null;
  return await pairOf(me, childIds, requested);
}

/** PostgREST filter: rows created by me or addressed to me. */
export const pairFilter = (me: string, creatorCol = "created_by") => `${creatorCol}.eq.${me},other_parent_id.eq.${me}`;

/** The other party of a pair record, seen from `me`. */
export function otherOf(me: string, creator: string | null, other: string | null): string | null {
  return creator === me ? other : creator;
}

/** Visible = I created it, or it was addressed to me. (Use assertVisible for records with children.) */
export function assertParticipant(me: string, creator: string | null, other: string | null): void {
  if (creator !== me && other !== me) throw err.notFound();
}

/** Per child: every account linked to it as a parent (child_parents role 'parent' + the child's creator). */
export async function childParents(childIds: string[]): Promise<Map<string, Set<string>>> {
  const ids = [...new Set(childIds.filter(Boolean))];
  const out = new Map<string, Set<string>>();
  if (!ids.length) return out;
  const [links, kids] = await Promise.all([
    db().from("child_parents").select("child_id, parent_id, role").in("child_id", ids),
    db().from("children").select("id, created_by").in("id", ids),
  ]);
  const add = (c: string, p: string | null) => {
    if (!p) return;
    const s = out.get(c) ?? new Set<string>();
    s.add(p);
    out.set(c, s);
  };
  for (const l of (check(links, "child parents") ?? []) as Array<{ child_id: string; parent_id: string; role: string | null }>) {
    if ((l.role ?? "parent") === "parent") add(l.child_id, l.parent_id);
  }
  for (const k of (check(kids, "child creators") ?? []) as Array<{ id: string; created_by: string | null }>) add(k.id, k.created_by);
  return out;
}

/**
 * Per-child visibility of a pair record (same rule as practical-scope.canSee): the creator always; the
 * addressed other parent only while EVERY child of the record is still linked to both of them
 * (child 1 shared with A, later only with B → A no longer sees it). Without children: the pair only.
 */
export function pairSees(
  me: string,
  creator: string | null,
  other: string | null,
  childIds: string[] | null | undefined,
  parents: Map<string, Set<string>>,
): boolean {
  if (creator === me) return true;
  if (!creator || other !== me) return false;
  return (childIds ?? []).filter(Boolean).every((c) => {
    const s = parents.get(c);
    return !!s && s.has(me) && s.has(creator);
  });
}

/** Throws NOT_FOUND unless pairSees(...) — use when loading one cost record. */
export async function assertVisible(me: string, creator: string | null, other: string | null, childIds: string[] | null | undefined): Promise<void> {
  assertParticipant(me, creator, other);
  if (creator === me) return;
  const kids = (childIds ?? []).filter(Boolean);
  if (kids.length && !pairSees(me, creator, other, kids, await childParents(kids))) throw err.notFound();
}

/** Keeps only the rows `me` may see (pairSees), loading the child links once. */
export async function visibleRows<T extends Record<string, any>>(me: string, rows: T[], creatorOf: (r: T) => string | null = (r) => r.created_by ?? null): Promise<T[]> {
  const foreign = rows.filter((r) => creatorOf(r) !== me);
  const kids = foreign.flatMap((r) => (Array.isArray(r.child_ids) ? r.child_ids : []) as string[]);
  const parents = await childParents(kids);
  return rows.filter((r) => pairSees(me, creatorOf(r), r.other_parent_id ?? null, r.child_ids ?? [], parents));
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
