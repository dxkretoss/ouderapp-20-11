// manage-children — children of the signed-in parent. Session required for every action.
import { db } from "../_shared/db.ts";
import { check, err, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { assertChildAccess, childIdsFor } from "../_shared/access.ts";
import { buildChild, buildChildren } from "../_shared/children.ts";
import { removeFolder, removeStored, uploadImage } from "../_shared/storage.ts";

/** A birth date may not lie in the future (one day of slack for time zones: the server runs in UTC). */
function birthDate(v: unknown): string | null | undefined {
  const d = optDate(v, "date_of_birth");
  if (d) {
    const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
    if (d > tomorrow) throw err.validation("date_of_birth cannot be in the future");
  }
  return d;
}
import { isPlainObject, jsonSize, optDate, optText, parseJsonText, reqText, requireUuid } from "../_shared/util.ts";

const AVATAR_PRESET_RE = /^avatar:[A-Za-z0-9_-]{1,40}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const CUSTODY = ["gezamenlijk", "een-ouder", "anders", "onbekend"];
// "noodkaart" = which fields the parents put on the emergency card for circle members ({ velden: [], extra }).
const PROFILE_SECTIONS = ["basis", "personen", "school", "gezondheid", "praktisch", "noodkaart"];
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
    // The care schedule and custody are family-level in the app but stored per child: a new child
    // inherits them from a sibling the parent already has, so the family keeps one shared value.
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
        if (sib.care_schedule) inherit.care_schedule = sib.care_schedule;
        if (sib.custody) {
          inherit.custody = sib.custody;
          const meta = (parseJsonText(sib.practical_notes) as Record<string, unknown> | null)?.custody_meta;
          if (meta) inherit.practical_notes = JSON.stringify({ custody_meta: meta });
        }
        if (Object.keys(inherit).length) await db().from("children").update(inherit).eq("id", created.id);
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
      const merged: Record<string, unknown> = { ...(isPlainObject(current.profile) ? current.profile : {}) };
      for (const [section, value] of Object.entries(u.profile)) {
        if (!PROFILE_SECTIONS.includes(section)) throw err.validation(`Unknown profile section "${section}"`);
        if (value === null) delete merged[section];
        else if (typeof value === "object") merged[section] = value;
        else throw err.validation(`profile.${section} must be an object or array`);
      }
      if (jsonSize(merged) > MAX_PROFILE_BYTES) throw err.validation("profile is too large");
      patch.profile = merged;
    }
    const unknown = Object.keys(u).filter(
      (k) => !["name", "date_of_birth", "color_code", "bsn", "profile", ...Object.keys(TEXT_FIELDS)].includes(k),
    );
    if (unknown.length) throw err.validation(`Fields not allowed: ${unknown.join(", ")}`);

    if (Object.keys(patch).length) {
      check(await db().from("children").update(patch).eq("id", childId), "update child");
    }
    return ok({ child: await childOrThrow(me.id, childId) });
  },

  async "set-avatar"(req, body) {
    const me = await requireUser(req);
    const childId = requireUuid(body.child_id, "child_id");
    await assertChildAccess(me.id, childId, { edit: true });
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

  async delete(req, body) {
    const me = await requireUser(req);
    const childId = requireUuid(body.child_id, "child_id");
    const access = await assertChildAccess(me.id, childId);
    if (access.is_creator) {
      const row = check(
        await db().from("children").select("avatar_url").eq("id", childId).single(),
        "load child",
      ) as { avatar_url: string | null };
      await removeStored(row.avatar_url);
      await removeFolder("child-avatars", childId);
      check(await db().from("children").delete().eq("id", childId), "delete child");
    } else {
      // a linked co-parent only removes their own link
      check(
        await db().from("child_parents").delete().eq("child_id", childId).eq("parent_id", me.id),
        "unlink child",
      );
      check(
        await db().from("child_private_notes").delete().eq("child_id", childId).eq("parent_id", me.id),
        "delete own note",
      );
    }
    return ok({});
  },

  async "save-schedule"(req, body) {
    const me = await requireUser(req);
    if (!isPlainObject(body.schedule)) throw err.validation("schedule must be an object");
    if (jsonSize(body.schedule) > MAX_SCHEDULE_BYTES) throw err.validation("schedule is too large");
    const ids = await targetChildIds(me.id, body.child_id);
    if (ids.length) {
      check(
        await db().from("children").update({ care_schedule: JSON.stringify(body.schedule) }).in("id", ids),
        "save schedule",
      );
    }
    return ok({});
  },

  /**
   * Self-reported custody (display only, never grants or removes access). Optional detail:
   * holder "me" | "other" (who has sole custody, for "een-ouder"), detail "voogd" | "anders",
   * deviations (a list of agreed deviations). Every change needs the other parent's confirmation again.
   */
  async "save-custody"(req, body) {
    const me = await requireUser(req);
    if (!CUSTODY.includes(body.custody)) throw err.validation(`custody must be one of ${CUSTODY.join(", ")}`);
    if (body.holder !== undefined && body.holder !== null && !["me", "other"].includes(body.holder)) throw err.validation("holder must be me or other");
    if (body.detail !== undefined && body.detail !== null && !CUSTODY_DETAIL.includes(body.detail)) throw err.validation("detail is invalid");
    if (body.deviations !== undefined && (!Array.isArray(body.deviations) || body.deviations.some((d: unknown) => !CUSTODY_DEVIATIONS.includes(d as string)))) {
      throw err.validation("deviations is invalid");
    }
    const ids = await targetChildIds(me.id, body.child_id);
    if (!ids.length) return ok({});
    const rows = (check(
      await db().from("children").select("id, practical_notes, created_by").in("id", ids),
      "load practical notes",
    ) ?? []) as Array<{ id: string; practical_notes: string | null; created_by: string }>;
    const links = (check(
      await db().from("child_parents").select("child_id, parent_id").in("child_id", ids),
      "load custody parents",
    ) ?? []) as Array<{ child_id: string; parent_id: string }>;
    const now = new Date().toISOString();
    for (const r of rows) {
      const parsed = parseJsonText(r.practical_notes);
      const notes = isPlainObject(parsed) ? parsed : {};
      delete (notes as Record<string, unknown>).private_notes; // never keep private notes on the shared row
      const meta: Record<string, unknown> = { ingevuldDoor: me.id, bevestigdDoorAnder: false, updated_at: now };
      if (body.custody === "een-ouder" && body.holder) {
        // the other parent of THIS child (if linked); otherwise "other" stays a description
        const other = [r.created_by, ...links.filter((l) => l.child_id === r.id).map((l) => l.parent_id)].find((id) => id && id !== me.id);
        meta.houder = body.holder === "me" ? me.id : other ?? "other";
      }
      if (body.custody === "anders" && body.detail) meta.detail = body.detail;
      if (Array.isArray(body.deviations)) meta.afwijkingen = [...new Set(body.deviations)];
      else {
        const prev = isPlainObject((notes as Record<string, any>).custody_meta) ? (notes as Record<string, any>).custody_meta : null;
        if (prev && Array.isArray(prev.afwijkingen)) meta.afwijkingen = prev.afwijkingen;
      }
      notes.custody = body.custody;
      notes.custody_meta = meta;
      check(
        await db()
          .from("children")
          .update({ custody: body.custody, practical_notes: JSON.stringify(notes) })
          .eq("id", r.id),
        "save custody",
      );
    }
    return ok({});
  },

  /** The OTHER parent confirms what was filled in (still self-reported, still display only). */
  async "confirm-custody"(req, body) {
    const me = await requireUser(req);
    const childId = requireUuid(body.child_id, "child_id");
    await assertChildAccess(me.id, childId);
    const row = check(
      await db().from("children").select("custody, practical_notes").eq("id", childId).single(),
      "load custody",
    ) as { custody: string | null; practical_notes: string | null };
    const parsed = parseJsonText(row.practical_notes);
    const notes = isPlainObject(parsed) ? parsed : {};
    const meta = isPlainObject((notes as Record<string, any>).custody_meta) ? { ...(notes as Record<string, any>).custody_meta } : null;
    if (!row.custody || !meta) throw err.validation("Nothing to confirm yet");
    if (meta.ingevuldDoor === me.id) throw err.forbidden("Only the other parent can confirm");
    meta.bevestigdDoorAnder = true;
    meta.bevestigdDoor = me.id;
    meta.bevestigdOp = new Date().toISOString();
    delete (notes as Record<string, unknown>).private_notes;
    notes.custody_meta = meta;
    check(await db().from("children").update({ practical_notes: JSON.stringify(notes) }).eq("id", childId), "confirm custody");
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
}));

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
