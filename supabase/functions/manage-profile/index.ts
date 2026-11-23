// manage-profile — the signed-in user's own profile. Session required for every action.
import { db } from "../_shared/db.ts";
import { check, err, HttpError, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { loadApiUser, loadProfile } from "../_shared/users.ts";
import { verifyPassword } from "../_shared/password.ts";
import { removeFolder, removeStored, uploadImage } from "../_shared/storage.ts";
import { isPlainObject, jsonSize, reqText } from "../_shared/util.ts";

const AVATAR_PRESET_RE = /^avatar:[A-Za-z0-9_-]{1,40}$/;
const MAX_PREFERENCES_BYTES = 16 * 1024;

Deno.serve(serveActions("manage-profile", {
  async get(req) {
    const me = await requireUser(req);
    return ok({ user: await loadApiUser(me.id) });
  },

  async update(req, body) {
    const me = await requireUser(req);
    const patch: Record<string, unknown> = {};

    if (body.name !== undefined) {
      patch.name = reqText(typeof body.name === "string" ? body.name.replace(/[\u0000-\u001f\u007f]+/g, " ") : body.name, "name", 100);
    }
    if (body.usage_mode !== undefined) {
      if (body.usage_mode !== "together" && body.usage_mode !== "solo") {
        throw err.validation('usage_mode must be "together" or "solo"');
      }
      patch.usage_mode = body.usage_mode;
    }
    if (body.onboarding_completed !== undefined) {
      if (typeof body.onboarding_completed !== "boolean") throw err.validation("onboarding_completed must be a boolean");
      patch.onboarding_completed = body.onboarding_completed;
    }
    if (body.preferences !== undefined) {
      if (!isPlainObject(body.preferences)) throw err.validation("preferences must be an object");
      const current = await loadProfile(me.id);
      const merged = { ...(current.preferences || {}), ...body.preferences };
      // a null value removes the key
      for (const [k, v] of Object.entries(merged)) if (v === null) delete merged[k];
      if (jsonSize(merged) > MAX_PREFERENCES_BYTES) throw err.validation("preferences are too large");
      patch.preferences = merged;
    }
    if (Object.keys(patch).length) {
      check(await db().from("profiles").update(patch).eq("id", me.id), "update profile");
    }
    return ok({ user: await loadApiUser(me.id) });
  },

  async "set-avatar"(req, body) {
    const me = await requireUser(req);
    const current = await loadProfile(me.id);
    let next: string | null;
    if (body.image_base64 !== undefined && body.image_base64 !== null) {
      next = await uploadImage("avatars", me.id, body.image_base64);
    } else if (body.avatar === null || (typeof body.avatar === "string" && AVATAR_PRESET_RE.test(body.avatar))) {
      next = body.avatar;
    } else {
      throw err.validation('Provide avatar ("avatar:<n>" or null) or image_base64');
    }
    check(await db().from("profiles").update({ avatar_url: next }).eq("id", me.id), "set avatar");
    if (current.avatar_url && current.avatar_url !== next) await removeStored(current.avatar_url);
    return ok({ user: await loadApiUser(me.id) });
  },

  async "delete-account"(req, body) {
    const me = await requireUser(req);
    const secret = check(
      await db().from("profiles").select("password, avatar_url").eq("id", me.id).single(),
      "load password",
    ) as { password: string | null; avatar_url: string | null };
    if (!(await verifyPassword(body.password, secret.password))) {
      throw new HttpError(403, "INVALID_CREDENTIALS", "Password is incorrect");
    }

    // 1. Children: delete those only this user is linked to; hand the others over.
    const created = (check(
      await db().from("children").select("id, avatar_url").eq("created_by", me.id),
      "load own children",
    ) ?? []) as Array<{ id: string; avatar_url: string | null }>;
    for (const child of created) {
      const others = (check(
        await db()
          .from("child_parents")
          .select("parent_id, created_at")
          .eq("child_id", child.id)
          .neq("parent_id", me.id)
          .order("created_at", { ascending: true }),
        "load other parents",
      ) ?? []) as Array<{ parent_id: string }>;
      if (others.length) {
        // children.created_by cascades on profile delete -> transfer ownership first
        check(
          await db().from("children").update({ created_by: others[0].parent_id }).eq("id", child.id),
          "transfer child",
        );
      } else {
        await removeStored(child.avatar_url);
        await removeFolder("child-avatars", child.id);
        check(await db().from("children").delete().eq("id", child.id), "delete child");
      }
    }

    // 2. References without ON DELETE action would block the delete.
    check(await db().from("budget_proposals").update({ turn_to_respond: null }).eq("turn_to_respond", me.id), "fk budget_proposals");
    check(await db().from("parent_agreements").update({ proposed_by: null }).eq("proposed_by", me.id), "fk parent_agreements");
    check(await db().from("budget_steps").delete().eq("actor_id", me.id), "fk budget_steps");

    // 3. Files.
    await removeStored(secret.avatar_url);
    await removeFolder("avatars", me.id);

    // 4. Profile (cascades sessions, links, notes, ...) and the mirrored GoTrue user.
    check(await db().from("profiles").delete().eq("id", me.id), "delete profile");
    const { error: authErr } = await db().auth.admin.deleteUser(me.id);
    if (authErr) console.warn("[manage-profile] auth user delete:", authErr.message);

    return ok({});
  },
}));
