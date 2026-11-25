// manage-children — children of the signed-in parent. Session required for every action.
// Profile sections are protected per child and parent (child_parent_permissions, see
// _shared/parent-permissions.ts): data of sections a parent may not view is never sent, edits need `edit`.
import { db } from "../_shared/db.ts";
import { check, err, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { assertChildAccess, childIdsFor } from "../_shared/access.ts";
import { buildChild, buildChildren, PROFILE_SECTION, sectionOfColumn } from "../_shared/children.ts";
import { removeFolder, removeStored, uploadImage } from "../_shared/storage.ts";
import {
  accessFor, accessOfAllParents, assertParentMay, dropAccess, ENFORCED_SECTIONS, isRestriction, isSection,
  linkedParents, normaliseFlags, publicAccess, type Section, seedBaseline, writeAccess,
} from "../_shared/parent-permissions.ts";
import { logAudit, notify } from "../_shared/practical-audit.ts";
import { isPlainObject, isUuid, jsonSize, optDate, optText, parseJsonText, reqText, requireUuid } from "../_shared/util.ts";

/** A birth date may not lie in the future (one day of slack for time zones: the server runs in UTC). */
function birthDate(v: unknown): string | null | undefined {
  const d = optDate(v, "date_of_birth");
  if (d) {
    const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
    if (d > tomorrow) throw err.validation("date_of_birth cannot be in the future");
  }
  return d;
}

const AVATAR_PRESET_RE = /^avatar:[A-Za-z0-9_-]{1,40}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const CUSTODY = ["gezamenlijk", "een-ouder", "anders", "onbekend"];
// "noodkaart" = which fields the parents put on the emergency card for circle members ({ velden: [], extra }).
const PROFILE_SECTIONS = Object.keys(PROFILE_SECTION);
const CUSTODY_DETAIL = ["voogd", "anders"];
const CUSTODY_DEVIATIONS = ["aangepast", "informatie", "beperkteInfo", "begeleid", "geenOmgang", "communicatie", "anders"];
const MAX_PROFILE_BYTES = 64 * 1024;
const MAX_SCHEDULE_BYTES = 32 * 1024;
const MAX_NOTE_LENGTH = 20000;

/** Text columns that `update` may change, with their max length. */
const TEXT_FIELDS: Record<string, number> = {
  last_name: 100,
  description: 2000,
  school: 300,
  daycare: 300,
  doctor: 300,
  medical_notes: 4000,
  allergies: 2000,
  dietary_notes: 2000,
  clothes_size: 50,
  shoe_size: 50,
};

function optColor(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string" || !COLOR_RE.test(v)) throw err.validation("color_code must be #RRGGBB");
  return v;
}

async function childOrThrow(userId: string, childId: string) {
  const child = await buildChild(userId, childId);
  if (!child) throw err.notFound("Child not found");
  return child;
}

/** The other linked parents of a child (excluding `me`). */
async function otherParents(childId: string, me: string): Promise<string[]> {
  const l = await linkedParents([childId]);
  return [...(l.parents.get(childId) ?? [])].filter((p) => p !== me);
}

const childName = async (childId: string) =>
  ((check(await db().from("children").select("name").eq("id", childId).maybeSingle(), "child name") as { name: string } | null)?.name ?? "");

/** Light validation of a care schedule ({ later } or { dagen[14], startMaandag, wisseltijd, plek, patroon }). */
function validSchedule(s: Record<string, unknown>): Record<string, unknown> {
  if (s.later === true) return { later: true };
  if (!Array.isArray(s.dagen) || s.dagen.length !== 14 || s.dagen.some((d) => d !== "ik" && d !== "ander")) {
    throw err.validation("schedule.dagen must be 14 times ik/ander");
  }
  if (typeof s.startMaandag !== "string" || !DATE_RE.test(s.startMaandag)) throw err.validation("schedule.startMaandag must be YYYY-MM-DD");
  if (s.wisseltijd !== undefined && s.wisseltijd !== null && (typeof s.wisseltijd !== "string" || !TIME_RE.test(s.wisseltijd))) {
    throw err.validation("schedule.wisseltijd must be HH:MM");
  }
  if (s.plek !== undefined && s.plek !== null && (typeof s.plek !== "string" || s.plek.length > 200)) throw err.validation("schedule.plek is invalid");
  return s;
}

Deno.serve(serveActions("manage-children", {
  async list(req) {
    const me = await requireUser(req);
    return ok({ children: await buildChildren(me.id, await childIdsFor(me.id)) });
  },

  async get(req, body) {
    const me = await requireUser(req);
    const childId = requireUuid(body.child_id, "child_id");
    await assertChildAccess(me.id, childId);
    const child = await childOrThrow(me.id, childId);
    const extra = check(
      await db().from("children").select("bsn").eq("id", childId).single(),
      "load bsn",
    ) as { bsn: string | null };
    // bsn belongs to "basis" (always visible for a linked parent)
    return ok({ child: { ...child, bsn: extra.bsn ?? null } });
  },

  async create(req, body) {
    const me = await requireUser(req);
    const row: Record<string, unknown> = {
      name: reqText(body.name, "name", 100),
      created_by: me.id,
      // the column defaults to 'gezamenlijk'; custody only exists once a parent filled it in (save-custody)
      custody: null,
    };
    const dob = birthDate(body.date_of_birth);
    if (dob !== undefined) row.date_of_birth = dob;
    const color = optColor(body.color_code);
    if (color !== undefined && color !== null) row.color_code = color;
    const description = optText(body.description, "description", 2000);
    if (description !== undefined) row.description = description;

    const created = check(
      await db().from("children").insert(row).select("id").single(),
      "create child",
    ) as { id: string };
    const link = await db().from("child_parents").insert({
      child_id: created.id,
      parent_id: me.id,
      role: "parent",
      can_edit: true,
    });
    if (link.error) {
      await db().from("children").delete().eq("id", created.id);
      check(link, "link child");
    }
    await seedBaseline([created.id], [me.id]);
    // Care schedule and custody are inherited from a sibling, so a new child follows the same arrangement.
    // The schedule stays PER CHILD afterwards (save-schedule with child_id); the copy needs no confirmation
    // (the new child has only this parent), the custody copy counts as reported by this parent.
    const siblings = (await childIdsFor(me.id)).filter((id) => id !== created.id);
    if (siblings.length) {
      const { data: sib } = await db()
        .from("children")
        .select("care_schedule, custody, practical_notes")
        .in("id", siblings)
        .or("care_schedule.not.is.null,custody.not.is.null")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (sib) {
        const inherit: Record<string, unknown> = {};
        const cs = parseJsonText(sib.care_schedule);
        if (isPlainObject(cs)) {
          const { bevestiging: _b, ikId: sibIk, ...rest } = cs as Record<string, unknown>;
          // "ik"/"ander" are relative to ikId. The new child has only me as parent, so the copy is mine:
          // keep the days as they are when the sibling's schedule was mine, mirror them when it was the
          // other parent's. Never carry over someone else's ikId.
          const mirrored = typeof sibIk === "string" && sibIk && sibIk !== me.id && Array.isArray(rest.dagen)
            ? { ...rest, dagen: (rest.dagen as unknown[]).map((d) => (d === "ik" ? "ander" : d === "ander" ? "ik" : d)) }
            : rest;
          inherit.care_schedule = JSON.stringify(rest.later ? { later: true } : { ...mirrored, ikId: me.id });
        }
        if (sib.custody) {
          inherit.custody = sib.custody;
          const meta = (parseJsonText(sib.practical_notes) as Record<string, unknown> | null)?.custody_meta as Record<string, unknown> | undefined;
          if (meta) inherit.practical_notes = JSON.stringify({ custody_meta: { ...meta, ingevuldDoor: me.id, bevestigdDoorAnder: false, betwist: false, updated_at: new Date().toISOString() } });
        }
        if (Object.keys(inherit).length) await db().from("children").update(inherit).eq("id", created.id);
        if (sib.custody) {
          await db().from("child_parents").update({ gezag_status: sib.custody === "gezamenlijk" ? "gezamenlijk" : "onbekend", gezag_provenance: "reported", reported_by: me.id, reported_at: new Date().toISOString() })
            .eq("child_id", created.id).eq("parent_id", me.id);
        }
      }
    }
    return ok({ child: await childOrThrow(me.id, created.id) });
  },

  async update(req, body) {
    const me = await requireUser(req);
    const childId = requireUuid(body.child_id, "child_id");
    if (!isPlainObject(body.updates)) throw err.validation("updates must be an object");
    await assertChildAccess(me.id, childId, { edit: true });
    const u = body.updates as Record<string, unknown>;
    const unknown = Object.keys(u).filter(
      (k) => !["name", "date_of_birth", "color_code", "bsn", "profile", ...Object.keys(TEXT_FIELDS)].includes(k),
    );
    if (unknown.length) throw err.validation(`Fields not allowed: ${unknown.join(", ")}`);

    // every touched section needs `edit` for this parent
    const touched = new Set<Section>();
    for (const k of Object.keys(u)) if (k !== "profile") touched.add(sectionOfColumn(k));
    if (isPlainObject(u.profile)) {
      for (const s of Object.keys(u.profile)) {
        if (!PROFILE_SECTIONS.includes(s)) throw err.validation(`Unknown profile section "${s}"`);
        touched.add(PROFILE_SECTION[s]);
      }
    }
    for (const s of touched) await assertParentMay(me.id, childId, s, "edit");

    const patch: Record<string, unknown> = {};
    if (u.name !== undefined) patch.name = reqText(u.name, "name", 100);
    for (const [field, max] of Object.entries(TEXT_FIELDS)) {
      const v = optText(u[field], field, max);
      if (v !== undefined) patch[field] = v;
    }
    const dob = birthDate(u.date_of_birth);
    if (dob !== undefined) patch.date_of_birth = dob;
    const color = optColor(u.color_code);
    if (color !== undefined) patch.color_code = color;
    if (u.bsn !== undefined) {
      if (u.bsn === null || u.bsn === "") {
        patch.bsn = null;
      } else if (typeof u.bsn === "string" && /^\d{8,9}$/.test(u.bsn.replace(/[\s.]/g, ""))) {
        patch.bsn = u.bsn.replace(/[\s.]/g, "");
      } else {
        throw err.validation("bsn must be 8 or 9 digits");
      }
    }
    if (u.profile !== undefined) {
      if (!isPlainObject(u.profile)) throw err.validation("profile must be an object");
      const current = check(
        await db().from("children").select("profile").eq("id", childId).single(),
        "load child profile",
      ) as { profile: Record<string, unknown> | null };
      // merge into the STORED profile: sections this parent cannot see stay untouched
      const merged: Record<string, unknown> = { ...(isPlainObject(current.profile) ? current.profile : {}) };
      for (const [section, value] of Object.entries(u.profile)) {
        if (value === null) delete merged[section];
        else if (typeof value === "object") merged[section] = value;
        else throw err.validation(`profile.${section} must be an object or array`);
      }
      if (jsonSize(merged) > MAX_PROFILE_BYTES) throw err.validation("profile is too large");
      patch.profile = merged;
    }

    if (Object.keys(patch).length) {
      check(await db().from("children").update(patch).eq("id", childId), "update child");
    }
    return ok({ child: await childOrThrow(me.id, childId) });
  },

  async "set-avatar"(req, body) {
    const me = await requireUser(req);
    const childId = requireUuid(body.child_id, "child_id");
    await assertChildAccess(me.id, childId, { edit: true });
    await assertParentMay(me.id, childId, "basis", "edit");
    const current = check(
      await db().from("children").select("avatar_url").eq("id", childId).single(),
      "load child avatar",
    ) as { avatar_url: string | null };
    let next: string | null;
    if (body.image_base64 !== undefined && body.image_base64 !== null) {
      next = await uploadImage("child-avatars", childId, body.image_base64);
    } else if (body.avatar === null || (typeof body.avatar === "string" && AVATAR_PRESET_RE.test(body.avatar))) {
      next = body.avatar;
    } else {
      throw err.validation('Provide avatar ("avatar:<n>" or null) or image_base64');
    }
    check(await db().from("children").update({ avatar_url: next }).eq("id", childId), "set child avatar");
    if (current.avatar_url && current.avatar_url !== next) await removeStored(current.avatar_url);
    return ok({ child: await childOrThrow(me.id, childId) });
  },

  /**
   * Removes a child from the caller's family.
   * - Only parent of the child: the child and everything that cascades from it is deleted (mode "deleted").
   * - Shared with another parent: NEVER deleted for both. The caller's link, private note and access rows
   *   are removed; when the caller created the child, the other parent becomes its owner (mode "unlinked").
   */
  async delete(req, body) {
    const me = await requireUser(req);
    const childId = requireUuid(body.child_id, "child_id");
    const access = await assertChildAccess(me.id, childId);
    const others = await otherParents(childId, me.id);
    if (!others.length) {
      const row = check(
        await db().from("children").select("avatar_url").eq("id", childId).single(),
        "load child",
      ) as { avatar_url: string | null };
      await removeStored(row.avatar_url);
      await removeFolder("child-avatars", childId);
      check(await db().from("children").delete().eq("id", childId), "delete child");
      return ok({ mode: "deleted" });
    }
    const name = await childName(childId);
    if (access.is_creator) {
      // the other parent keeps the child: transfer ownership first (the link row of `others[0]` exists)
      check(await db().from("children").update({ created_by: others[0] }).eq("id", childId), "transfer child");
      check(await db().from("child_parents").update({ can_edit: true }).eq("child_id", childId).eq("parent_id", others[0]), "owner can edit");
    }
    check(await db().from("child_parents").delete().eq("child_id", childId).eq("parent_id", me.id), "unlink child");
    // An accepted co-parent invitation for this child between us is closed: it can never be "retried" to
    // re-link the child (and reset agreed access rights) after leaving. A new invitation is needed.
    const between = others.join(",");
    const invs = (check(
      await db().from("invitations").select("id, child_ids").eq("status", "accepted")
        .or(`and(from_parent_id.eq.${me.id},to_parent_id.in.(${between})),and(to_parent_id.eq.${me.id},from_parent_id.in.(${between}))`),
      "invitations for child",
    ) ?? []) as Array<{ id: string; child_ids: unknown }>;
    const closeIds = invs
      .filter((i) => Array.isArray(i.child_ids) && (i.child_ids as unknown[]).some((c) => String(c).toLowerCase() === childId))
      .map((i) => i.id);
    if (closeIds.length) check(await db().from("invitations").update({ status: "disconnected" }).in("id", closeIds), "close invitations");
    check(await db().from("child_private_notes").delete().eq("child_id", childId).eq("parent_id", me.id), "delete own note");
    await dropAccess([childId], me.id);
    await notify({
      to: others, actorId: me.id, type: "system", category: "info", key: "kindOntkoppeld",
      params: { kind: name }, link: "/kinderen", entityType: "child", entityId: childId, childIds: [childId],
    });
    return ok({ mode: "unlinked" });
  },

  /**
   * Fixed care schedule PER CHILD (`child_id`; "all"/absent = every child the caller may edit).
   * `ikId` is always the caller: "ik"/"ander" in `dagen` are from the caller's point of view.
   * With another parent linked, the schedule needs that parent's confirmation ("Klopt / Klopt niet").
   */
  async "save-schedule"(req, body) {
    const me = await requireUser(req);
    if (!isPlainObject(body.schedule)) throw err.validation("schedule must be an object");
    if (jsonSize(body.schedule) > MAX_SCHEDULE_BYTES) throw err.validation("schedule is too large");
    const clean = validSchedule({ ...(body.schedule as Record<string, unknown>) });
    delete clean.bevestiging;
    const ids = await targetChildIds(me.id, body.child_id);
    const now = new Date().toISOString();
    for (const id of ids) {
      const others = await otherParents(id, me.id);
      const schedule = clean.later
        ? { later: true }
        : { ...clean, ikId: me.id, opgeslagen: now, ...(others.length ? { bevestiging: { status: "open", gevraagd: now } } : {}) };
      check(await db().from("children").update({ care_schedule: JSON.stringify(schedule) }).eq("id", id), "save schedule");
      if (others.length && !clean.later) {
        const auditId = await logAudit({ actorId: me.id, section: "schema", entityId: id, label: "Vaste verdeling", action: "UPDATED", childIds: [id], familyIds: [me.id, others[0]] });
        await notify({
          to: others, actorId: me.id, type: "care", category: "actie", key: "regelingBevestigen",
          params: { kind: await childName(id) }, link: "/", entityType: "care_schedule", entityId: id, childIds: [id], auditId,
        });
      }
    }
    return ok({ child_ids: ids });
  },

  /** The OTHER parent answers the fixed schedule: klopt = true ("Klopt") or false ("Klopt niet" + note). */
  async "confirm-schedule"(req, body) {
    const me = await requireUser(req);
    const childId = requireUuid(body.child_id, "child_id");
    await assertChildAccess(me.id, childId);
    if (typeof body.klopt !== "boolean") throw err.validation("klopt must be true or false");
    const note = optText(body.opmerking, "opmerking", 1000) ?? null;
    if (body.klopt === false && !note) throw err.validation("opmerking is required");
    const row = check(await db().from("children").select("care_schedule").eq("id", childId).single(), "load schedule") as { care_schedule: string | null };
    const cs = parseJsonText(row.care_schedule);
    if (!isPlainObject(cs) || cs.later || !cs.ikId) throw err.validation("Nothing to confirm yet");
    if (cs.ikId === me.id) throw err.forbidden("Only the other parent can confirm");
    // The schedule's owner must still be a linked parent of this child (never notify a stranger).
    if (!(await otherParents(childId, me.id)).includes(String(cs.ikId))) throw err.validation("Nothing to confirm yet");
    const now = new Date().toISOString();
    const next = { ...cs, bevestiging: { status: body.klopt ? "klopt" : "klopt_niet", door: me.id, op: now, ...(note ? { opmerking: note } : {}) } };
    check(await db().from("children").update({ care_schedule: JSON.stringify(next) }).eq("id", childId), "confirm schedule");
    const auditId = await logAudit({ actorId: me.id, section: "schema", entityId: childId, label: "Vaste verdeling", action: body.klopt ? "ACCEPTED" : "DECLINED", childIds: [childId], familyIds: [me.id, String(cs.ikId)] });
    await notify({
      to: String(cs.ikId), actorId: me.id, type: "care", category: body.klopt ? "info" : "actie",
      key: body.klopt ? "regelingKlopt" : "regelingKloptNiet", params: { kind: await childName(childId) },
      link: "/", entityType: "care_schedule", entityId: childId, childIds: [childId], auditId,
    });
    return ok({ child: await childOrThrow(me.id, childId) });
  },

  /**
   * Self-reported custody (display only, never grants or removes access). Optional detail:
   * holder "me" | "other" (who has sole custody, for "een-ouder"), detail "voogd" | "anders",
   * deviations (a list of agreed deviations), afwijkend (the parents have a deviating arrangement),
   * restrictions_note (only visible to the reporter). Every change needs the other parent's confirmation again.
   */
  async "save-custody"(req, body) {
    const me = await requireUser(req);
    if (!CUSTODY.includes(body.custody)) throw err.validation(`custody must be one of ${CUSTODY.join(", ")}`);
    if (body.holder !== undefined && body.holder !== null && !["me", "other"].includes(body.holder)) throw err.validation("holder must be me or other");
    if (body.detail !== undefined && body.detail !== null && !CUSTODY_DETAIL.includes(body.detail)) throw err.validation("detail is invalid");
    if (body.deviations !== undefined && (!Array.isArray(body.deviations) || body.deviations.some((d: unknown) => !CUSTODY_DEVIATIONS.includes(d as string)))) {
      throw err.validation("deviations is invalid");
    }
    if (body.afwijkend !== undefined && typeof body.afwijkend !== "boolean") throw err.validation("afwijkend must be a boolean");
    const restrictions = optText(body.restrictions_note, "restrictions_note", 2000);
    const ids = await targetChildIds(me.id, body.child_id);
    if (!ids.length) return ok({});
    const rows = (check(
      await db().from("children").select("id, name, practical_notes, created_by").in("id", ids),
      "load practical notes",
    ) ?? []) as Array<{ id: string; name: string; practical_notes: string | null; created_by: string }>;
    const links = (check(
      await db().from("child_parents").select("child_id, parent_id").in("child_id", ids),
      "load custody parents",
    ) ?? []) as Array<{ child_id: string; parent_id: string }>;
    const now = new Date().toISOString();
    for (const r of rows) {
      const parsed = parseJsonText(r.practical_notes);
      const notes = isPlainObject(parsed) ? parsed : {};
      delete (notes as Record<string, unknown>).private_notes; // never keep private notes on the shared row
      const prev = isPlainObject((notes as Record<string, any>).custody_meta) ? (notes as Record<string, any>).custody_meta : null;
      const meta: Record<string, unknown> = { ingevuldDoor: me.id, bevestigdDoorAnder: false, updated_at: now };
      const parentsOf = [...new Set([r.created_by, ...links.filter((l) => l.child_id === r.id).map((l) => l.parent_id)])];
      const other = parentsOf.find((id) => id && id !== me.id);
      if (body.custody === "een-ouder" && body.holder) {
        // the other parent of THIS child (if linked); otherwise "other" stays a description
        meta.houder = body.holder === "me" ? me.id : other ?? "other";
      }
      if (body.custody === "anders" && body.detail) meta.detail = body.detail;
      if (Array.isArray(body.deviations)) meta.afwijkingen = [...new Set(body.deviations)];
      else if (prev && Array.isArray(prev.afwijkingen)) meta.afwijkingen = prev.afwijkingen;
      if (typeof body.afwijkend === "boolean") meta.afwijkend = body.afwijkend;
      else if (prev && typeof prev.afwijkend === "boolean") meta.afwijkend = prev.afwijkend;
      if (Array.isArray(meta.afwijkingen) && meta.afwijkingen.length) meta.afwijkend = true;
      notes.custody = body.custody;
      notes.custody_meta = meta;
      check(
        await db()
          .from("children")
          .update({ custody: body.custody, practical_notes: JSON.stringify(notes) })
          .eq("id", r.id),
        "save custody",
      );
      // provenance per relationship (display only): reported by me, not yet acknowledged
      for (const p of parentsOf) {
        const status = body.custody === "gezamenlijk" ? "gezamenlijk"
          : body.custody === "een-ouder" ? (!body.holder ? "onbekend" : (body.holder === "me") === (p === me.id) ? "eenhoofdig" : "geen")
          : body.custody === "anders" ? (body.detail === "voogd" ? "voogd" : "anders")
          : "onbekend";
        check(
          await db().from("child_parents").update({
            gezag_status: status, gezag_provenance: "reported", reported_by: me.id, reported_at: now,
            acknowledged_by: null, acknowledged_at: null,
            ...(p === me.id && restrictions !== undefined ? { restrictions_note: restrictions } : {}),
          }).eq("child_id", r.id).eq("parent_id", p),
          "custody provenance",
        );
      }
      if (other) {
        await notify({
          to: other, actorId: me.id, type: "system", category: "actie", key: "gezagBevestigen",
          params: { kind: r.name }, link: "/gezag", entityType: "custody", entityId: r.id, childIds: [r.id],
        });
      }
    }
    return ok({});
  },

  /** The OTHER parent confirms what was filled in (still self-reported, still display only). */
  async "confirm-custody"(req, body) {
    const me = await requireUser(req);
    const childId = requireUuid(body.child_id, "child_id");
    await assertChildAccess(me.id, childId);
    const meta = await custodyAnswer(me.id, childId, true);
    if (meta.ingevuldDoor && isUuid(meta.ingevuldDoor)) {
      await notify({
        to: meta.ingevuldDoor, actorId: me.id, type: "system", category: "info", key: "gezagBevestigd",
        params: { kind: await childName(childId) }, link: "/gezag", entityType: "custody", entityId: childId, childIds: [childId],
      });
    }
    return ok({ child: await childOrThrow(me.id, childId) });
  },

  /** The OTHER parent says the reported custody is not right ("Klopt niet"): status becomes disputed. */
  async "dispute-custody"(req, body) {
    const me = await requireUser(req);
    const childId = requireUuid(body.child_id, "child_id");
    await assertChildAccess(me.id, childId);
    const meta = await custodyAnswer(me.id, childId, false);
    if (meta.ingevuldDoor && isUuid(meta.ingevuldDoor)) {
      await notify({
        to: meta.ingevuldDoor, actorId: me.id, type: "system", category: "actie", key: "gezagBetwist",
        params: { kind: await childName(childId) }, link: "/gezag", entityType: "custody", entityId: childId, childIds: [childId],
      });
    }
    return ok({ child: await childOrThrow(me.id, childId) });
  },

  async "get-private-note"(req, body) {
    const me = await requireUser(req);
    const childId = requireUuid(body.child_id, "child_id");
    await assertChildAccess(me.id, childId);
    const row = check(
      await db()
        .from("child_private_notes")
        .select("note")
        .eq("child_id", childId)
        .eq("parent_id", me.id)
        .maybeSingle(),
      "load private note",
    ) as { note: string } | null;
    return ok({ note: row?.note ?? "" });
  },

  async "save-private-note"(req, body) {
    const me = await requireUser(req);
    const childId = requireUuid(body.child_id, "child_id");
    await assertChildAccess(me.id, childId);
    if (typeof body.note !== "string") throw err.validation("note must be a string");
    if (body.note.length > MAX_NOTE_LENGTH) throw err.validation("note is too long");
    check(
      await db()
        .from("child_private_notes")
        .upsert({ child_id: childId, parent_id: me.id, note: body.note }, { onConflict: "child_id,parent_id" }),
      "save private note",
    );
    return ok({});
  },

  /* ------------------------------------------------------------ Gezag en toegang (per child) */

  /**
   * Access overview of one child: my effective access, the other parent's (only the section flags, never
   * evidence or notes), open requests, and the custody provenance. Only enforced sections are listed.
   */
  async access(req, body) {
    const me = await requireUser(req);
    const childId = requireUuid(body.child_id, "child_id");
    await assertChildAccess(me.id, childId);
    return ok(await accessOverview(me.id, childId));
  },

  /**
   * Change access for `parent_id` (me or the other linked parent) on one section.
   * Lowering my own access, or restoring a restriction I made myself, is effective at once.
   * Everything else becomes a pending request for the parent who must agree.
   */
  async "request-access"(req, body) {
    const me = await requireUser(req);
    const childId = requireUuid(body.child_id, "child_id");
    await assertChildAccess(me.id, childId);
    const target = requireUuid(body.parent_id, "parent_id");
    if (!isSection(body.section) || !ENFORCED_SECTIONS.includes(body.section)) throw err.validation("section is invalid");
    const section = body.section as Section;
    const all = await accessOfAllParents(childId);
    if (!all.has(target)) throw err.notFound("Parent not found");
    const others = [...all.keys()].filter((p) => p !== me.id);
    const cur = all.get(target)![section];
    const next = normaliseFlags(section, { view: body.view, propose: body.propose, edit: body.edit });
    if (cur.view === next.view && cur.propose === next.propose && cur.edit === next.edit) return ok(await accessOverview(me.id, childId));

    const label = "Gezag en toegang";
    const change = [{ veld: section, oud: flagText(cur), nieuw: flagText(next) }];
    if (target === me.id) {
      const own = check(
        await db().from("child_parent_permissions").select("basis, granted_by").eq("child_id", childId).eq("parent_id", me.id).eq("section", section).maybeSingle(),
        "load own permission",
      ) as { basis: string; granted_by: string | null } | null;
      const selfMade = own?.basis === "self_restriction" && own.granted_by === me.id;
      if (isRestriction(cur, next) || selfMade || !others.length) {
        // lowering on top of an agreed restriction stays "agreed": raising it again needs the other parent
        const agreed = own?.basis === "agreed" || own?.basis === "reviewed";
        await writeAccess(childId, me.id, section, next, agreed && others.length ? "agreed" : "self_restriction", me.id, null);
        await logAudit({ actorId: me.id, section: "toegang", entityId: childId, label, action: "UPDATED", changes: change, childIds: [childId], familyIds: [me.id, others[0]] });
        return ok(await accessOverview(me.id, childId));
      }
    }
    // a request: the target answers changes to their own access; for my own raise, the other parent answers
    const approver = target === me.id ? others[0] : target;
    await db().from("child_permission_requests").update({ status: "withdrawn", responded_at: new Date().toISOString() })
      .eq("child_id", childId).eq("target_parent_id", target).eq("section", section).eq("status", "pending");
    const insRes = await db().from("child_permission_requests").insert({
      child_id: childId, target_parent_id: target, requested_by: me.id, approver_id: approver, section,
      can_view: next.view, can_propose: next.propose, can_edit: next.edit,
    }).select("id").single();
    // A parallel request for the same child/parent/section won (uq_child_permission_requests_open): that
    // open request stands; answer with the current overview instead of a server error.
    if (insRes.error && (insRes.error as { code?: string }).code === "23505") return ok(await accessOverview(me.id, childId));
    const ins = check(insRes, "create permission request") as { id: string };
    const auditId = await logAudit({ actorId: me.id, section: "toegang", entityId: childId, label, action: "CREATED", changes: change, childIds: [childId], familyIds: [me.id, approver] });
    await notify({
      to: approver, actorId: me.id, type: "system", category: "actie", key: "toegangVerzoek",
      params: { kind: await childName(childId) }, link: `/kinderen/${childId}`, entityType: "permission_request", entityId: ins.id, childIds: [childId], auditId,
    });
    return ok(await accessOverview(me.id, childId));
  },

  /** The approver accepts or declines a pending request. Accepting makes it effective (basis 'agreed'). */
  async "respond-access"(req, body) {
    const me = await requireUser(req);
    const id = requireUuid(body.request_id, "request_id");
    if (typeof body.accept !== "boolean") throw err.validation("accept must be true or false");
    const r = check(await db().from("child_permission_requests").select("*").eq("id", id).maybeSingle(), "load request") as Record<string, any> | null;
    if (!r || r.approver_id !== me.id) throw err.notFound("Request not found");
    await assertChildAccess(me.id, r.child_id);
    if (r.status !== "pending") throw err.validation("This request was already answered");
    const all = await accessOfAllParents(r.child_id);
    if (!all.has(r.target_parent_id) || !all.has(r.requested_by)) {
      await db().from("child_permission_requests").update({ status: "expired", responded_at: new Date().toISOString() }).eq("id", id);
      throw err.notFound("Request not found");
    }
    check(
      await db().from("child_permission_requests").update({ status: body.accept ? "accepted" : "declined", responded_at: new Date().toISOString() }).eq("id", id).eq("status", "pending"),
      "answer request",
    );
    if (body.accept) {
      await writeAccess(r.child_id, r.target_parent_id, r.section, { view: r.can_view, propose: r.can_propose, edit: r.can_edit }, "agreed", r.requested_by, me.id);
    }
    const auditId = await logAudit({ actorId: me.id, section: "toegang", entityId: r.child_id, label: "Gezag en toegang", action: body.accept ? "ACCEPTED" : "DECLINED", childIds: [r.child_id], familyIds: [me.id, r.requested_by] });
    await notify({
      to: r.requested_by, actorId: me.id, type: "system", category: "info", key: body.accept ? "toegangAkkoord" : "toegangNietAkkoord",
      params: { kind: await childName(r.child_id) }, link: `/kinderen/${r.child_id}`, entityType: "permission_request", entityId: id, childIds: [r.child_id], auditId,
    });
    return ok(await accessOverview(me.id, r.child_id));
  },

  /** The requester withdraws a pending request. */
  async "withdraw-access"(req, body) {
    const me = await requireUser(req);
    const id = requireUuid(body.request_id, "request_id");
    const r = check(await db().from("child_permission_requests").select("id, child_id, requested_by, status").eq("id", id).maybeSingle(), "load request") as Record<string, any> | null;
    if (!r || r.requested_by !== me.id) throw err.notFound("Request not found");
    await assertChildAccess(me.id, r.child_id);
    if (r.status === "pending") {
      check(await db().from("child_permission_requests").update({ status: "withdrawn", responded_at: new Date().toISOString() }).eq("id", id), "withdraw request");
    }
    return ok(await accessOverview(me.id, r.child_id));
  },
}));

const flagText = (f: { view: boolean; propose: boolean; edit: boolean }) =>
  [f.view ? "bekijken" : null, f.propose ? "voorstellen" : null, f.edit ? "bewerken" : null].filter(Boolean).join(", ") || "geen";

/** Confirms (true) or disputes (false) the reported custody of one child. Returns the stored meta. */
async function custodyAnswer(me: string, childId: string, agree: boolean): Promise<Record<string, any>> {
  const row = check(
    await db().from("children").select("custody, practical_notes").eq("id", childId).single(),
    "load custody",
  ) as { custody: string | null; practical_notes: string | null };
  const parsed = parseJsonText(row.practical_notes);
  const notes = isPlainObject(parsed) ? parsed : {};
  const meta = isPlainObject((notes as Record<string, any>).custody_meta) ? { ...(notes as Record<string, any>).custody_meta } : null;
  if (!row.custody || !meta) throw err.validation("Nothing to confirm yet");
  if (meta.ingevuldDoor === me) throw err.forbidden("Only the other parent can confirm");
  const now = new Date().toISOString();
  meta.bevestigdDoorAnder = agree;
  meta.betwist = !agree;
  meta.bevestigdDoor = me;
  meta.bevestigdOp = now;
  delete (notes as Record<string, unknown>).private_notes;
  notes.custody_meta = meta;
  check(await db().from("children").update({ practical_notes: JSON.stringify(notes) }).eq("id", childId), "answer custody");
  check(
    await db().from("child_parents").update({
      gezag_provenance: agree ? "acknowledged" : "disputed", acknowledged_by: agree ? me : null, acknowledged_at: agree ? now : null,
    }).eq("child_id", childId).or("gezag_provenance.is.null,gezag_provenance.neq.verified"),
    "custody provenance",
  );
  return meta;
}

/** Overview for the "Gezag en toegang" sheet (viewer-relative: "ik" / "ander"). */
async function accessOverview(me: string, childId: string) {
  const all = await accessOfAllParents(childId);
  const ids = [...all.keys()];
  const profiles = ids.length
    ? ((check(await db().from("profiles").select("id, name").in("id", ids), "access names") ?? []) as Array<{ id: string; name: string }>)
    : [];
  const requests = (check(
    await db().from("child_permission_requests")
      .select("id, target_parent_id, requested_by, approver_id, section, can_view, can_propose, can_edit, status, created_at")
      .eq("child_id", childId).eq("status", "pending").order("created_at", { ascending: true }),
    "load requests",
  ) ?? []) as Array<Record<string, any>>;
  const rel = (id: string) => (id === me ? "ik" : "ander");
  return {
    sections: ENFORCED_SECTIONS,
    parents: ids.map((id) => ({
      id, rol: rel(id), name: id === me ? "" : profiles.find((p) => p.id === id)?.name ?? "",
      access: publicAccess(all.get(id)),
    })),
    requests: requests
      .filter((r) => [r.target_parent_id, r.requested_by, r.approver_id].includes(me))
      .map((r) => ({
        id: r.id, section: r.section, voor: rel(r.target_parent_id), parent_id: r.target_parent_id,
        door: rel(r.requested_by), aan_mij: r.approver_id === me, view: r.can_view, propose: r.can_propose, edit: r.can_edit, created_at: r.created_at,
      })),
    my_access: publicAccess((await accessFor(me, [childId])).get(childId)),
  };
}

/** One child (edit access required) or every child the user may edit. */
async function targetChildIds(userId: string, childId: unknown): Promise<string[]> {
  if (childId !== undefined && childId !== null && childId !== "" && childId !== "all") {
    const id = requireUuid(childId, "child_id");
    await assertChildAccess(userId, id, { edit: true });
    return [id];
  }
  const all = await buildChildren(userId, await childIdsFor(userId));
  return all.filter((c) => c.can_edit).map((c) => c.id);
}
