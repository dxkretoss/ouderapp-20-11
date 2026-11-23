// Private-bucket helpers: image upload + signed URLs for stored avatars.
import { db } from "./db.ts";
import { err } from "./respond.ts";

export const AVATAR_BUCKETS = ["avatars", "child-avatars"] as const;
const KNOWN_BUCKETS = ["avatars", "child-avatars", "receipts", "documents", "moments"];
const SIGNED_URL_TTL = 60 * 60; // 1 hour
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

export interface StoredRef {
  bucket: string;
  path: string;
}

/**
 * Parses a value from an avatar_url column into a storage reference.
 * Accepts the new format "<bucket>/<path>" and legacy public/signed Supabase URLs.
 */
export function parseStoredRef(value: unknown): StoredRef | null {
  if (typeof value !== "string" || !value) return null;
  const legacy = value.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/);
  if (legacy && KNOWN_BUCKETS.includes(legacy[1])) {
    return { bucket: legacy[1], path: decodeURIComponent(legacy[2]) };
  }
  if (/^[a-z]+:\/\//i.test(value) || value.startsWith("avatar:") || value.startsWith("data:")) return null;
  const slash = value.indexOf("/");
  if (slash > 0) {
    const bucket = value.slice(0, slash);
    if (KNOWN_BUCKETS.includes(bucket)) return { bucket, path: value.slice(slash + 1) };
  }
  return null;
}

/**
 * Resolves avatar column values to what the client may show:
 * "avatar:<n>" (built-in illustration) as-is, stored files as 1 h signed URLs,
 * other absolute https URLs as-is, everything else null. Batched per bucket.
 */
export async function resolveAvatars(values: Array<string | null | undefined>): Promise<Array<string | null>> {
  const out: Array<string | null> = values.map(() => null);
  const byBucket = new Map<string, Array<{ index: number; path: string }>>();
  values.forEach((v, index) => {
    if (typeof v !== "string" || !v) return;
    if (v.startsWith("avatar:")) {
      out[index] = v;
      return;
    }
    const ref = parseStoredRef(v);
    if (ref) {
      const list = byBucket.get(ref.bucket) ?? [];
      list.push({ index, path: ref.path });
      byBucket.set(ref.bucket, list);
      return;
    }
    if (/^https:\/\//i.test(v)) out[index] = v;
  });
  for (const [bucket, items] of byBucket) {
    const paths = [...new Set(items.map((i) => i.path))];
    const { data, error } = await db().storage.from(bucket).createSignedUrls(paths, SIGNED_URL_TTL);
    if (error || !data) {
      console.warn(`[storage] signing failed for ${bucket}:`, error);
      continue;
    }
    const urlByPath = new Map<string, string>();
    for (const row of data as Array<{ path: string | null; signedUrl: string; error: string | null }>) {
      if (row.path && row.signedUrl && !row.error) urlByPath.set(row.path, row.signedUrl);
    }
    for (const item of items) out[item.index] = urlByPath.get(item.path) ?? null;
  }
  return out;
}

export async function resolveAvatar(value: string | null | undefined): Promise<string | null> {
  return (await resolveAvatars([value]))[0];
}

function sniffImage(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: "image/png", ext: "png" };
  }
  if (
    bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

/** Decodes a jpeg/png/webp data URL (or raw base64), max 1.5 MB. */
export function decodeImage(input: unknown): { bytes: Uint8Array; mime: string; ext: string } {
  if (typeof input !== "string" || !input) throw err.validation("image_base64 is required");
  let b64 = input;
  const m = input.match(/^data:([a-z/+.-]+);base64,(.*)$/is);
  if (m) {
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(m[1].toLowerCase())) {
      throw err.validation("Only jpeg, png or webp images are allowed");
    }
    b64 = m[2];
  }
  b64 = b64.replace(/\s+/g, "");
  if (b64.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8) throw err.validation("Image is too large (max 1.5 MB)");
  let bytes: Uint8Array;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    throw err.validation("image_base64 is not valid base64");
  }
  if (bytes.length > MAX_IMAGE_BYTES) throw err.validation("Image is too large (max 1.5 MB)");
  const kind = sniffImage(bytes);
  if (!kind) throw err.validation("Only jpeg, png or webp images are allowed");
  return { bytes, ...kind };
}

/** Uploads an image to <bucket>/<folder>/<uuid>.<ext>; returns the stored ref "<bucket>/<path>". */
export async function uploadImage(bucket: string, folder: string, input: unknown): Promise<string> {
  const img = decodeImage(input);
  const path = `${folder}/${crypto.randomUUID()}.${img.ext}`;
  const { error } = await db().storage.from(bucket).upload(path, img.bytes, {
    contentType: img.mime,
    upsert: false,
  });
  if (error) {
    console.error("[storage] upload failed:", error);
    throw err.server("Upload failed");
  }
  return `${bucket}/${path}`;
}

/** Best-effort removal of a stored file referenced by an avatar_url value. */
export async function removeStored(value: unknown): Promise<void> {
  const ref = parseStoredRef(value);
  if (!ref) return;
  const { error } = await db().storage.from(ref.bucket).remove([ref.path]);
  if (error) console.warn("[storage] remove failed:", error);
}

/** Best-effort removal of every file directly under <bucket>/<folder>/. */
export async function removeFolder(bucket: string, folder: string): Promise<void> {
  try {
    const { data, error } = await db().storage.from(bucket).list(folder, { limit: 1000 });
    if (error || !data?.length) return;
    const paths = data.filter((f: { name: string }) => f.name).map((f: { name: string }) => `${folder}/${f.name}`);
    if (paths.length) await db().storage.from(bucket).remove(paths);
  } catch (e) {
    console.warn("[storage] folder cleanup failed:", e);
  }
}
