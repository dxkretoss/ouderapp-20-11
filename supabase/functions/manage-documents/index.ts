// manage-documents — family documents (parenting plan, school, medical, insurance, ...) in the PRIVATE
// bucket "documents". Session required. Files are uploaded through this function (base64, max 10 MB)
// and only handed out as 1 h signed URLs after the access check. Documents with is_shared=false are
// only visible to the uploader.
import { db } from "../_shared/db.ts";
import { check, err, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { optText, reqText, requireUuid } from "../_shared/util.ts";
import { caregiverAccess, canSee, Family, familyFor, familyMembers, otherParents } from "../_shared/practical-scope.ts";
import { logAudit, notify } from "../_shared/practical-audit.ts";

const MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL = 60 * 60;
const SOURCES = ["upload", "ouderschapsplan", "bon", "school"];
const MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
const COLS = "id, user_id, child_id, title, category, file_path, file_size, mime_type, is_shared, source, file_name, created_at, updated_at, deleted_at";

type Row = Record<string, any>;

const visible = (f: Family, r: Row) => !r.deleted_at && canSee(f, r.user_id, r.child_id ? [r.child_id] : [], r.is_shared === false);

function out(r: Row) {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    child_id: r.child_id ?? null,
    uploaded_by: r.user_id,
    file_name: r.file_name ?? null,
    file_size: r.file_size ?? 0,
    mime_type: r.mime_type ?? null,
    is_shared: r.is_shared !== false,
    source: r.source || "upload",
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/** Checks the magic bytes against the declared type (text/plain only needs to be valid UTF-8). */
function sniffOk(bytes: Uint8Array, mime: string): boolean {
  const b = (i: number) => bytes[i];
  switch (mime) {
    case "application/pdf": return b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46;
    case "image/jpeg": return b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff;
    case "image/png": return b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47;
    case "image/webp": return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": return b(0) === 0x50 && b(1) === 0x4b;
    case "application/msword": return b(0) === 0xd0 && b(1) === 0xcf && b(2) === 0x11 && b(3) === 0xe0;
    case "text/plain":
      try { new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(0, 65536)); return true; } catch { return false; }
  }
  return false;
}

function decodeFile(input: unknown, mime: string): Uint8Array {
  if (typeof input !== "string" || !input) throw err.validation("file_base64 is required");
  const m = input.match(/^data:[^;,]*;base64,(.*)$/s);
  const b64 = (m ? m[1] : input).replace(/\s+/g, "");
  if (b64.length > Math.ceil((MAX_BYTES * 4) / 3) + 8) throw err.validation("File is too large (max 10 MB)");
  let bytes: Uint8Array;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    throw err.validation("file_base64 is not valid base64");
  }
  if (!bytes.length) throw err.validation("File is empty");
  if (bytes.length > MAX_BYTES) throw err.validation("File is too large (max 10 MB)");
  if (!sniffOk(bytes, mime)) throw err.validation("File content does not match its type");
  return bytes;
}

async function loadDoc(f: Family, id: unknown, caregiverKids: string[] = []): Promise<Row> {
  const docId = requireUuid(id, "document_id");
  const row = check(await db().from("documents").select(COLS).eq("id", docId).maybeSingle(), "load document") as Row | null;
  const asParent = !!row && visible(f, row) && (!row.child_id || f.childIds.includes(row.child_id));
  const asCaregiver = !!row && !row.deleted_at && row.is_shared !== false && !!row.child_id && caregiverKids.includes(row.child_id);
  if (!row || (!asParent && !asCaregiver)) throw err.notFound("Document not found");
  return row;
}

Deno.serve(serveActions("manage-documents", {
  async list(req) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const rows = (check(
      await db().from("documents").select(COLS).in("user_id", familyMembers(f)).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
      "list documents",
    ) ?? []) as Row[];
    // Caregiver sessions: shared documents of the children granted "documenten" (read-only).
    const cgKids = (await caregiverAccess(me.id)).view("documenten").filter((k) => !f.childIds.includes(k));
    const circle = cgKids.length
      ? ((check(await db().from("documents").select(COLS).in("child_id", cgKids).is("deleted_at", null).neq("is_shared", false).limit(200), "caregiver documents") ?? []) as Row[])
      : [];
    return ok({ documents: [...rows.filter((r) => visible(f, r) && (!r.child_id || f.childIds.includes(r.child_id))), ...circle].map(out) });
  },

  async upload(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const mime = String(body.mime_type ?? "").toLowerCase();
    const ext = MIME[mime];
    if (!ext) throw err.validation("Only pdf, images, Word or text files are allowed");
    const title = reqText(body.title, "title", 200);
    const category = optText(body.category, "category", 60) ?? "Overig";
    const source = body.source ?? "upload";
    if (!SOURCES.includes(source)) throw err.validation("source is invalid");
    let childId: string | null = null;
    if (body.child_id) {
      childId = requireUuid(body.child_id, "child_id");
      if (!f.childIds.includes(childId)) throw err.notFound("Child not found");
    }
    const bytes = decodeFile(body.file_base64, mime);
    const path = `${childId ?? `family-${me.id}`}/${crypto.randomUUID()}.${ext}`;
    const { error } = await db().storage.from("documents").upload(path, bytes, { contentType: mime, upsert: false });
    if (error) {
      console.error("[manage-documents] upload failed:", error);
      throw err.server("Upload failed");
    }
    const isShared = body.is_shared !== false;
    const row = check(
      await db().from("documents").insert({
        user_id: me.id,
        child_id: childId,
        title,
        category,
        file_path: path,
        file_size: bytes.length,
        mime_type: mime,
        is_shared: isShared,
        source,
        file_name: optText(body.file_name, "file_name", 200) ?? null,
      }).select(COLS).single(),
      "create document",
    ) as Row;
    if (isShared) {
      const auditId = await logAudit({ actorId: me.id, section: "document", entityId: row.id, label: title, action: "CREATED", childIds: childId ? [childId] : [], meta: { categorie: category } });
      await notify({ to: otherParents(f, childId ? [childId] : []), actorId: me.id, type: "document", category: "info", key: "documentToegevoegd", params: { titel: title }, link: "/documenten", entityType: "document", entityId: row.id, childIds: childId ? [childId] : [], auditId });
    }
    return ok({ document: out(row) });
  },

  /** Signed download/view link, 1 hour, only after the access check. */
  async "get-url"(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadDoc(f, body.document_id, (await caregiverAccess(me.id)).view("documenten"));
    const ref = String(row.file_path || "").replace(/^documents\//, "");
    const { data, error } = await db().storage.from("documents").createSignedUrl(ref, SIGNED_URL_TTL, body.download ? { download: row.file_name || row.title } : undefined);
    if (error || !data?.signedUrl) {
      console.error("[manage-documents] sign failed:", error);
      throw err.notFound("File not found");
    }
    return ok({ url: data.signedUrl, expires_in: SIGNED_URL_TTL });
  },

  async update(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadDoc(f, body.document_id);
    if (row.user_id !== me.id) throw err.forbidden("Only the uploader can change a document");
    const patch: Row = {};
    if (body.title !== undefined) patch.title = reqText(body.title, "title", 200);
    if (body.category !== undefined) patch.category = optText(body.category, "category", 60) ?? "Overig";
    if (!Object.keys(patch).length) return ok({ document: out(row) });
    const upd = check(await db().from("documents").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", row.id).select(COLS).single(), "update document") as Row;
    if (upd.is_shared !== false) {
      await logAudit({ actorId: me.id, section: "document", entityId: row.id, label: upd.title, action: "UPDATED",
        changes: [...(patch.title ? [{ veld: "naam", oud: row.title, nieuw: upd.title }] : []), ...(patch.category ? [{ veld: "categorie", oud: row.category, nieuw: upd.category }] : [])],
        childIds: row.child_id ? [row.child_id] : [] });
    }
    return ok({ document: out(upd) });
  },

  /** Removes the document from the list (soft delete, file kept for history). Uploader only. */
  async delete(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadDoc(f, body.document_id);
    if (row.user_id !== me.id) throw err.forbidden("Only the uploader can remove a document");
    check(await db().from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", row.id), "delete document");
    if (row.is_shared !== false) {
      await logAudit({ actorId: me.id, section: "document", entityId: row.id, label: row.title, action: "DELETED", childIds: row.child_id ? [row.child_id] : [] });
    }
    return ok({});
  },
}));
