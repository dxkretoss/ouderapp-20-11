// manage-caregivers — the circle around a child: grandparents, babysitters, step-parents, contacts.
// Parents (session) manage members per child; a member only gets app access after an invitation
// is accepted while signed in (the link alone never grants anything). Permissions are per child and
// per section, default none, limited by an optional period, and enforced here for caregiver sessions.
import { db } from "../_shared/db.ts";
import { check, err, HttpError, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { assertChildAccess, childIdsFor, coParentIdsFor } from "../_shared/access.ts";
import { resolveAvatars, removeStored, uploadImage } from "../_shared/storage.ts";
import { sendEmail } from "../_shared/mail.ts";
import { appOrigin } from "../_shared/origin.ts";
import { caregiverInviteEmail } from "../_shared/family-mail.ts";
import {
  CAREGIVER_COLS,
  hasLiveAccess,
  inPeriod,
  liveCaregiverRows,
  normLevel,
  SECTIONS,
  todayNl,
} from "../_shared/family-caregivers.ts";
import { isPlainObject, isUuid, normalizeEmail, optDate, optText, reqText, requireUuid } from "../_shared/util.ts";

const STATUSES = ["contact_only", "invited", "active", "revoked"];
const NOOD_FIELDS = ["geboortedatum", "contacten", "huisarts", "allergieen", "medicatie", "extra"];

type Row = Record<string, any>;
type Perms = Record<string, Record<string, string>>;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function statusOf(r: Row): string {
  if (r.revoked_at || r.status === "revoked") return "revoked";
  return STATUSES.includes(r.status) ? r.status : r.connected_user_id ? "active" : "contact_only";
}

async function audit(actorId: string | null, entityId: string, action: string, details: Record<string, unknown>) {
  const { error } = await db().from("audit_events").insert({
    actor_id: actorId,
    entity_type: "caregiver",
    entity_id: entityId,
    action,
    // log-audit reads the children from details.kinderen: without it the event is family-wide
    details: Array.isArray(details.child_ids) && !Array.isArray(details.kinderen) ? { ...details, kinderen: details.child_ids } : details,
  });
  if (error) console.warn("[manage-caregivers] audit insert failed:", error);
}

async function loadRow(id: string): Promise<Row> {
  const row = check(
    await db().from("family_caregivers").select(CAREGIVER_COLS).eq("id", id).maybeSingle(),
    "load caregiver",
  ) as Row | null;
  if (!row) throw err.notFound("Circle member not found");
  return row;
}

async function permsFor(ids: string[]): Promise<Map<string, Perms>> {
  const out = new Map<string, Perms>();
  if (!ids.length) return out;
  const rows = (check(
    await db().from("caregiver_permissions").select("caregiver_id, child_id, section, permission_level").in("caregiver_id", ids),
    "load permissions",
  ) ?? []) as Array<{ caregiver_id: string; child_id: string; section: string; permission_level: string }>;
  for (const r of rows) {
    const level = normLevel(r.section, r.permission_level);
    if (level === "geen") continue;
    const p = out.get(r.caregiver_id) ?? {};
    (p[r.child_id] ??= {})[r.section] = level;
    out.set(r.caregiver_id, p);
  }
  return out;
}

/** The caller may see a member when it was added by them or belongs to one of their children. */
function visibleChildIds(row: Row, mine: Set<string>): string[] {
  return ((row.child_ids ?? []) as string[]).filter((id) => mine.has(id));
}

async function assertMemberAccess(userId: string, row: Row): Promise<string[]> {
  const mine = new Set(await childIdsFor(userId));
  const visible = visibleChildIds(row, mine);
  if (row.created_by !== userId && !visible.length) throw err.notFound("Circle member not found");
  return visible;
}

/**
 * May the caller change the member as a whole (contact details, period, invitation, e-mail)? Only with edit
 * access to EVERY child on the row: the person may carry the other parent's grants for a child the caller
 * does not share, so redirecting the invitation (another e-mail) must not be possible for one parent alone.
 */
async function canEditWhole(userId: string, row: Row): Promise<boolean> {
  const kids = (row.child_ids ?? []) as string[];
  if (!kids.length) return row.created_by === userId;
  for (const c of kids) {
    try {
      await assertChildAccess(userId, c, { edit: true });
    } catch {
      return false;
    }
  }
  return true;
}

async function assertEditWhole(userId: string, row: Row): Promise<void> {
  if (!(await canEditWhole(userId, row))) throw err.forbidden("Only a parent of every child of this person can change this");
}

/** API shape of a member for a parent. Only children the caller can access; token only for its creator while invited. */
async function toMembers(userId: string, rows: Row[]): Promise<Row[]> {
  if (!rows.length) return [];
  const mine = new Set(await childIdsFor(userId));
  const perms = await permsFor(rows.map((r) => r.id));
  const creatorIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];
  const creators = creatorIds.length
    ? ((check(await db().from("profiles").select("id, name").in("id", creatorIds), "load creators") ?? []) as Array<{ id: string; name: string }>)
    : [];
  const photos = await resolveAvatars(rows.map((r) => r.photo_url));
  return rows.map((r, i) => {
    const kids = visibleChildIds(r, mine);
    const p = perms.get(r.id) ?? {};
    const status = statusOf(r);
    return {
      id: r.id,
      name: r.name,
      role: r.role,
      phone: r.phone ?? null,
      email: r.email ?? null,
      address: r.address ?? null,
      photo: photos[i],
      is_emergency_contact: !!r.is_emergency_contact,
      status,
      child_ids: kids,
      permissions: Object.fromEntries(kids.map((k) => [k, p[k] ?? {}])),
      valid_from: r.valid_from ? String(r.valid_from).slice(0, 10) : null,
      valid_to: r.valid_to ? String(r.valid_to).slice(0, 10) : null,
      has_account: !!r.connected_user_id,
      live: hasLiveAccess(r),
      created_by: r.created_by,
      added_by_me: r.created_by === userId,
      added_by_name: creators.find((c) => c.id === r.created_by)?.name ?? null,
      invite_token: status === "invited" && r.created_by === userId ? r.invite_token : null,
      invited_at: r.invited_at ?? null,
      accepted_at: r.accepted_at ?? null,
      created_at: r.created_at,
    };
  });
}

async function toMember(userId: string, id: string): Promise<Row> {
  return (await toMembers(userId, [await loadRow(id)]))[0];
}

/** Validates `{ <childId>: { <section>: level } }` for the given children; "geen" entries are dropped. */
function parsePermissions(input: unknown, childIds: string[]): Perms {
  if (input === undefined || input === null) return {};
  if (!isPlainObject(input)) throw err.validation("permissions must be an object");
  const out: Perms = {};
  for (const [childId, secs] of Object.entries(input)) {
    if (!childIds.includes(childId)) continue; // only children this member belongs to
    if (!isPlainObject(secs)) throw err.validation("permissions per child must be an object");
    for (const [section, level] of Object.entries(secs)) {
      if (!SECTIONS[section]) throw err.validation(`Unknown section "${section}"`);
      if (level === "geen" || level === "none" || level === null) continue;
      if (typeof level !== "string" || !SECTIONS[section].includes(level)) throw err.validation(`Invalid level for ${section}`);
      (out[childId] ??= {})[section] = level;
    }
  }
  return out;
}

async function writePermissions(caregiverId: string, childIds: string[], perms: Perms) {
  if (!childIds.length) return;
  check(
    await db().from("caregiver_permissions").delete().eq("caregiver_id", caregiverId).in("child_id", childIds),
    "clear permissions",
  );
  const rows = childIds.flatMap((c) =>
    Object.entries(perms[c] ?? {}).map(([section, level]) => ({ caregiver_id: caregiverId, child_id: c, section, permission_level: level }))
  );
  if (rows.length) check(await db().from("caregiver_permissions").insert(rows), "save permissions");
}

function parsePeriod(body: Record<string, any>) {
  const from = optDate(body.valid_from, "valid_from");
  const to = optDate(body.valid_to, "valid_to");
  if (from && to && from > to) throw err.validation("valid_from must be before valid_to");
  return { from, to };
}

function parseChildIds(v: unknown): string[] {
  if (!Array.isArray(v) || !v.length) throw err.validation("child_ids must be a non-empty array");
  if (v.length > 20) throw err.validation("too many children");
  return [...new Set(v.map((x) => requireUuid(x, "child_ids[]")))];
}

function contactFields(body: Record<string, any>, partial: boolean) {
  const f: Row = {};
  if (!partial || body.name !== undefined) f.name = reqText(body.name, "name", 100);
  if (!partial || body.role !== undefined) f.role = reqText(body.role, "role", 60);
  const phone = optText(body.phone, "phone", 40);
  if (phone !== undefined) f.phone = phone;
  if (body.email !== undefined) f.email = body.email === null || body.email === "" ? null : normalizeEmail(body.email);
  const address = optText(body.address, "address", 300);
  if (address !== undefined) f.address = address;
  if (body.is_emergency_contact !== undefined) f.is_emergency_contact = body.is_emergency_contact === true;
  return f;
}

async function namesOf(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = (check(await db().from("children").select("id, name").in("id", ids), "child names") ?? []) as Array<{ id: string; name: string }>;
  return new Map(rows.map((r) => [r.id, r.name]));
}

// ---------------------------------------------------------------------------
// what a caregiver sees (also used for the parent's preview)
// ---------------------------------------------------------------------------

/**
 * Builds exactly what this member may see: only children with at least one permitted section,
 * and emergency details only with "nood" and only the fields the parents put on the card.
 * No ids of profiles other than the parents' names, no schedules, notes, messages or money.
 */
async function buildView(row: Row): Promise<Row> {
  const perms = (await permsFor([row.id])).get(row.id) ?? {};
  const kidIds = ((row.child_ids ?? []) as string[]).filter((c) => Object.keys(perms[c] ?? {}).length);
  const kids = kidIds.length
    ? ((check(
      await db().from("children").select("id, name, color_code, avatar_url, date_of_birth, doctor, allergies, profile, created_by").in("id", kidIds),
      "view children",
    ) ?? []) as Row[])
    : [];
  const links = kidIds.length
    ? ((check(await db().from("child_parents").select("child_id, parent_id").in("child_id", kidIds), "view links") ?? []) as Row[])
    : [];
  const parentIds = [...new Set([...kids.map((k) => k.created_by), ...links.map((l) => l.parent_id)].filter(Boolean))];
  const parents = parentIds.length
    ? ((check(await db().from("profiles").select("id, name").in("id", parentIds), "view parents") ?? []) as Array<{ id: string; name: string }>)
    : [];
  // emergency contacts from the circle (only phone numbers, only flagged members of that child)
  const circle = kidIds.length
    ? ((check(
      await db().from("family_caregivers").select("id, name, role, phone, child_ids, is_emergency_contact, status, revoked_at").overlaps("child_ids", kidIds).eq("is_emergency_contact", true),
      "view circle contacts",
    ) ?? []) as Row[])
    : [];
  const avatars = await resolveAvatars(kids.map((k) => k.avatar_url));
  const children = kids.map((k, i) => {
    const p = perms[k.id] ?? {};
    const base: Row = { id: k.id, name: k.name, color_code: k.color_code ?? null, avatar: avatars[i] };
    if (p.nood) {
      const profile = isPlainObject(k.profile) ? k.profile : {};
      const card = isPlainObject(profile.noodkaart) ? profile.noodkaart : {};
      const fields = (Array.isArray(card.velden) ? card.velden : []).filter((f: unknown) => typeof f === "string" && NOOD_FIELDS.includes(f));
      const health = isPlainObject(profile.gezondheid) ? profile.gezondheid : {};
      const e: Row = {};
      if (fields.includes("geboortedatum")) e.date_of_birth = k.date_of_birth ? String(k.date_of_birth).slice(0, 10) : null;
      if (fields.includes("huisarts")) e.doctor = k.doctor ?? null;
      if (fields.includes("allergieen")) e.allergies = k.allergies ?? null;
      if (fields.includes("medicatie")) e.medication = typeof health.medicatie === "string" ? health.medicatie : null;
      if (fields.includes("extra")) e.extra = typeof card.extra === "string" ? card.extra : null;
      if (fields.includes("contacten")) {
        const ownParents = new Set([k.created_by, ...links.filter((l) => l.child_id === k.id).map((l) => l.parent_id)]);
        const people = Array.isArray(profile.personen) ? profile.personen : [];
        e.contacts = [
          ...parents.filter((pp) => ownParents.has(pp.id)).map((pp) => ({ name: pp.name, role: "ouder", phone: null })),
          ...people.filter((x: Row) => x && x.nood && typeof x.naam === "string").map((x: Row) => ({ name: x.naam, role: typeof x.rol === "string" ? x.rol : "", phone: typeof x.telefoon === "string" ? x.telefoon : null })),
          ...circle.filter((c) => c.id !== row.id && (c.child_ids ?? []).includes(k.id) && statusOf(c) !== "revoked").map((c) => ({ name: c.name, role: c.role, phone: c.phone ?? null })),
        ];
      }
      base.emergency = e;
    }
    return base;
  });
  return {
    caregiver: {
      id: row.id,
      name: row.name,
      role: row.role,
      status: statusOf(row),
      valid_from: row.valid_from ? String(row.valid_from).slice(0, 10) : null,
      valid_to: row.valid_to ? String(row.valid_to).slice(0, 10) : null,
    },
    permissions: Object.fromEntries(kidIds.map((c) => [c, perms[c]])),
    children,
    parents: parents.map((p) => ({ id: p.id, name: p.name })),
  };
}

// ---------------------------------------------------------------------------
// invitation by token (?t=)
// ---------------------------------------------------------------------------

async function rowForToken(token: unknown): Promise<Row> {
  if (!isUuid(token)) throw err.validation("token is invalid");
  const row = check(
    await db().from("family_caregivers").select(CAREGIVER_COLS).eq("invite_token", String(token).toLowerCase()).maybeSingle(),
    "load invitation",
  ) as Row | null;
  if (!row) throw err.notFound("Invitation not found");
  const status = statusOf(row);
  if (status === "revoked") throw new HttpError(410, "INVITE_CANCELLED", "Invitation was withdrawn");
  if (status === "active") throw new HttpError(409, "INVITE_USED", "Invitation was already used");
  if (status !== "invited") throw err.notFound("Invitation not found");
  if (row.valid_to && todayNl() > String(row.valid_to).slice(0, 10)) throw new HttpError(410, "INVITE_EXPIRED", "Access period has ended");
  return row;
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

Deno.serve(serveActions("manage-caregivers", {
  /** Every member of the caller's children (both parents see the same circle), plus members they added. */
  async list(req) {
    const me = await requireUser(req);
    const mine = await childIdsFor(me.id);
    const [byChild, byMe] = await Promise.all([
      mine.length
        ? db().from("family_caregivers").select(CAREGIVER_COLS).overlaps("child_ids", mine)
        : Promise.resolve({ data: [], error: null }),
      db().from("family_caregivers").select(CAREGIVER_COLS).eq("created_by", me.id),
    ]);
    const rows = new Map<string, Row>();
    for (const r of [...((check(byChild as any, "list by child") ?? []) as Row[]), ...((check(byMe, "list by creator") ?? []) as Row[])]) {
      rows.set(r.id, r);
    }
    const list = [...rows.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return ok({ members: await toMembers(me.id, list) });
  },

  async create(req, body, { isEn }) {
    const me = await requireUser(req);
    const childIds = parseChildIds(body.child_ids);
    for (const c of childIds) await assertChildAccess(me.id, c, { edit: true });
    const fields = contactFields(body, false);
    const invite = body.invite === true;
    if (invite && !fields.phone && !fields.email) throw err.validation("An invitation needs a phone number or e-mail address");
    const { from, to } = parsePeriod(body);
    const perms = invite ? parsePermissions(body.permissions, childIds) : {};
    const now = new Date().toISOString();
    const created = check(
      await db().from("family_caregivers").insert({
        ...fields,
        created_by: me.id,
        updated_by: me.id,
        child_ids: childIds,
        status: invite ? "invited" : "contact_only",
        invited_at: invite ? now : null,
        valid_from: from ?? null,
        valid_to: to ?? null,
        valid_until: null,
      }).select("id").single(),
      "create caregiver",
    ) as { id: string };
    await writePermissions(created.id, childIds, perms);
    if (body.image_base64) {
      const ref = await uploadImage("avatars", `caregivers/${created.id}`, body.image_base64);
      check(await db().from("family_caregivers").update({ photo_url: ref }).eq("id", created.id), "set photo");
    }
    await audit(me.id, created.id, invite ? "INVITED" : "CREATED", { child_ids: childIds, role: fields.role, permissions: perms, valid_from: from ?? null, valid_to: to ?? null });
    let emailSent = false;
    if (invite && fields.email && body.send_email === true) emailSent = await mailInvite(me, await loadRow(created.id), body.redirect_origin, isEn);
    return ok({ member: await toMember(me.id, created.id), email_sent: emailSent });
  },

  /**
   * Change contact details, children, permissions, period, or turn a contact into an invitation.
   * Permissions are replaced only for children the caller may edit; other children keep theirs.
   */
  async update(req, body, { isEn }) {
    const me = await requireUser(req);
    const id = requireUuid(body.caregiver_id, "caregiver_id");
    const row = await loadRow(id);
    await assertMemberAccess(me.id, row);
    if (statusOf(row) === "revoked") throw err.validation("Access was withdrawn; add the person again");
    const mine = new Set(await childIdsFor(me.id));
    const contact = contactFields(body, true);
    const patch: Row = { ...contact, updated_by: me.id };
    // Contact details, photo, period and the invitation belong to the whole member: see canEditWhole.
    const wholeChange = Object.keys(contact).length > 0 || body.image_base64 || body.photo === null ||
      body.valid_from !== undefined || body.valid_to !== undefined || body.invite === true;
    if (wholeChange) await assertEditWhole(me.id, row);

    let childIds: string[] = row.child_ids ?? [];
    if (body.child_ids !== undefined) {
      const next = parseChildIds(body.child_ids);
      const changed = [...next.filter((c) => !childIds.includes(c)), ...childIds.filter((c) => !next.includes(c))];
      for (const c of changed) await assertChildAccess(me.id, c, { edit: true });
      childIds = next;
      patch.child_ids = next;
      // removed children lose their permissions
      const removed = (row.child_ids ?? []).filter((c: string) => !next.includes(c));
      if (removed.length) check(await db().from("caregiver_permissions").delete().eq("caregiver_id", id).in("child_id", removed), "drop permissions");
    }
    if (body.valid_from !== undefined || body.valid_to !== undefined) {
      const { from, to } = parsePeriod({ valid_from: body.valid_from ?? row.valid_from ?? null, valid_to: body.valid_to ?? row.valid_to ?? null });
      patch.valid_from = from ?? null;
      patch.valid_to = to ?? null;
    }
    const becomesInvite = body.invite === true && statusOf(row) === "contact_only";
    if (becomesInvite) {
      const phone = patch.phone !== undefined ? patch.phone : row.phone;
      const email = patch.email !== undefined ? patch.email : row.email;
      if (!phone && !email) throw err.validation("An invitation needs a phone number or e-mail address");
      patch.status = "invited";
      patch.invited_at = new Date().toISOString();
      patch.invite_token = crypto.randomUUID();
    }
    if (body.image_base64) {
      patch.photo_url = await uploadImage("avatars", `caregivers/${id}`, body.image_base64);
      if (row.photo_url) await removeStored(row.photo_url);
    } else if (body.photo === null && row.photo_url) {
      patch.photo_url = null;
      await removeStored(row.photo_url);
    }
    check(await db().from("family_caregivers").update(patch).eq("id", id), "update caregiver");

    let perms: Perms | null = null;
    if (body.permissions !== undefined) {
      if (statusOf({ ...row, ...patch }) === "contact_only") throw err.validation("A contact without app access has no permissions");
      const editable: string[] = [];
      for (const c of childIds.filter((x) => mine.has(x))) {
        try {
          await assertChildAccess(me.id, c, { edit: true });
          editable.push(c);
        } catch { /* view-only child: its permissions stay as they are */ }
      }
      perms = parsePermissions(body.permissions, editable);
      await writePermissions(id, editable, perms);
    }
    await audit(me.id, id, becomesInvite ? "INVITED" : "UPDATED", {
      fields: Object.keys(patch).filter((k) => !["updated_by", "invite_token"].includes(k)),
      child_ids: childIds,
      ...(perms ? { permissions: perms } : {}),
    });
    let emailSent = false;
    if (becomesInvite && body.send_email === true && (patch.email ?? row.email)) emailSent = await mailInvite(me, await loadRow(id), body.redirect_origin, isEn);
    return ok({ member: await toMember(me.id, id), email_sent: emailSent });
  },

  /** Withdraw access immediately (any parent of one of the member's children). History stays. */
  async revoke(req, body) {
    const me = await requireUser(req);
    const id = requireUuid(body.caregiver_id, "caregiver_id");
    const row = await loadRow(id);
    const visible = await assertMemberAccess(me.id, row);
    if (row.created_by !== me.id) for (const c of visible) await assertChildAccess(me.id, c, { edit: true });
    if (statusOf(row) !== "revoked") {
      check(
        await db().from("family_caregivers").update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
          revoked_by: me.id,
          updated_by: me.id,
          invite_token: crypto.randomUUID(),
        }).eq("id", id),
        "revoke caregiver",
      );
      // open pick-ups and help requests of this person end with the access
      const now = new Date().toISOString();
      check(
        await db().from("pickup_assignments").update({ status: "withdrawn", withdrawn_by: me.id, withdrawn_at: now, updated_at: now }).eq("caregiver_id", id).in("status", ["requested", "accepted"]),
        "withdraw pick-ups",
      );
      check(await db().from("help_request_recipients").update({ status: "closed" }).eq("caregiver_id", id).eq("status", "requested"), "close help requests");
      await audit(me.id, id, "REVOKED", { child_ids: row.child_ids ?? [] });
    }
    return ok({ member: await toMember(me.id, id) });
  },

  /** Remove the entry completely — only the parent who added it. */
  async delete(req, body) {
    const me = await requireUser(req);
    const id = requireUuid(body.caregiver_id, "caregiver_id");
    const row = await loadRow(id);
    if (row.created_by !== me.id) throw err.forbidden("Only the parent who added this person can remove them");
    if (row.photo_url) await removeStored(row.photo_url);
    check(await db().from("family_caregivers").delete().eq("id", id), "delete caregiver");
    await audit(me.id, id, "DELETED", { child_ids: row.child_ids ?? [], name: row.name });
    return ok({});
  },

  async "send-invite-email"(req, body, { isEn }) {
    const me = await requireUser(req);
    const id = requireUuid(body.caregiver_id, "caregiver_id");
    const row = await loadRow(id);
    await assertMemberAccess(me.id, row);
    if (statusOf(row) !== "invited") throw err.validation("Only an open invitation can be e-mailed");
    if (!row.email) throw err.validation("No e-mail address");
    await assertEditWhole(me.id, row);
    return ok({ email_sent: await mailInvite(me, row, body.redirect_origin, isEn) });
  },

  /** Parent preview: exactly what this member would see (period and withdrawal respected). */
  async "view-as"(req, body) {
    const me = await requireUser(req);
    const row = await loadRow(requireUuid(body.caregiver_id, "caregiver_id"));
    await assertMemberAccess(me.id, row);
    if (statusOf(row) === "contact_only" || !inPeriod(row)) return ok({ view: null });
    return ok({ view: await buildView(row) });
  },

  /** The signed-in account as caregiver: one view per family circle it currently has access to. */
  async "get-for-user"(req) {
    const me = await requireUser(req);
    const rows = await liveCaregiverRows(me.id);
    const views: Row[] = [];
    for (const r of rows) views.push(await buildView(r));
    const [kids, coParents] = await Promise.all([childIdsFor(me.id), coParentIdsFor(me.id)]);
    const only = !kids.length && !coParents.length && rows.length > 0;
    return ok({ views, role: only ? "caregiver" : "parent", is_caregiver_only: only });
  },

  /**
   * Which app this account should see. "caregiver" = only circle access: no own children, no co-parent
   * links, and at least one accepted circle record (also when its period has ended or it was withdrawn
   * later, so the account never falls back into an empty parent app). Otherwise "parent".
   */
  async role(req) {
    const me = await requireUser(req);
    const [kids, coParents] = await Promise.all([childIdsFor(me.id), coParentIdsFor(me.id)]);
    if (kids.length || coParents.length) return ok({ role: "parent", is_caregiver_only: false });
    const rows = (check(
      await db().from("family_caregivers").select("id").eq("connected_user_id", me.id).in("status", ["active", "revoked"]).limit(1),
      "caregiver role",
    ) ?? []) as Row[];
    const only = rows.length > 0;
    return ok({ role: only ? "caregiver" : "parent", is_caregiver_only: only });
  },

  /** Public: what the invitation is about — names only, no contact or health details. */
  async "get-by-token"(_req, body) {
    const row = await rowForToken(body.token);
    const perms = (await permsFor([row.id])).get(row.id) ?? {};
    const names = await namesOf(row.child_ids ?? []);
    const sender = row.created_by
      ? (check(await db().from("profiles").select("name").eq("id", row.created_by).maybeSingle(), "load sender") as { name: string } | null)
      : null;
    return ok({
      invitation: {
        name: row.name,
        role: row.role,
        // The address this invitation was sent to (only while it is open): pre-filled at registration.
        email: row.email ? String(row.email).trim().toLowerCase() : null,
        from_parent: { name: sender?.name ?? "" },
        children: (row.child_ids ?? []).filter((c: string) => names.has(c)).map((c: string) => ({ id: c, name: names.get(c) })),
        permissions: perms,
        valid_from: row.valid_from ? String(row.valid_from).slice(0, 10) : null,
        valid_to: row.valid_to ? String(row.valid_to).slice(0, 10) : null,
      },
    });
  },

  /** Signed in: accept the invitation; the token is rotated so the link cannot be reused. */
  async accept(req, body) {
    const me = await requireUser(req);
    const row = await rowForToken(body.token);
    if (row.email && row.email.toLowerCase() !== String(me.email).toLowerCase()) {
      throw new HttpError(403, "INVITE_EMAIL_MISMATCH", "Invitation is for another e-mail address");
    }
    const mine = new Set(await childIdsFor(me.id));
    if (row.created_by === me.id || (row.child_ids ?? []).some((c: string) => mine.has(c))) {
      throw new HttpError(400, "INVITE_OWN", "Parents cannot join their own child's circle");
    }
    const now = new Date().toISOString();
    const updated = check(
      await db().from("family_caregivers").update({
        status: "active",
        connected_user_id: me.id,
        accepted_at: now,
        invite_token: crypto.randomUUID(),
      }).eq("id", row.id).eq("status", "invited").select(CAREGIVER_COLS),
      "accept invitation",
    ) as Row[] | null;
    if (!updated || !updated.length) throw new HttpError(409, "INVITE_USED", "Invitation was already used");
    await audit(me.id, row.id, "ACCEPTED", { child_ids: row.child_ids ?? [] });
    return ok({ view: await buildView(updated[0]) });
  },
}));

async function mailInvite(me: { id: string; name: string }, row: Row, redirectOrigin: unknown, isEn: boolean): Promise<boolean> {
  const names = await namesOf(row.child_ids ?? []);
  const link = `${appOrigin(redirectOrigin)}/uitnodiging?t=${encodeURIComponent(row.invite_token)}`;
  const mail = caregiverInviteEmail({
    recipientName: row.name,
    senderName: me.name,
    role: row.role,
    childrenNames: [...names.values()],
    inviteLink: link,
    isEn,
  });
  return await sendEmail({ to: row.email, ...mail });
}

