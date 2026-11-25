// accept-invitation — inspect/accept/decline co-parent invitations, list and manage connections.
// inspect + decline are public (token only); everything else requires a session.
import { db } from "../_shared/db.ts";
import { check, err, HttpError, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { ACTIVE_CONNECTION, childIdsFor, coParentIdsFor, findConnection, parentCount } from "../_shared/access.ts";
import { buildChildren } from "../_shared/children.ts";
import { resolveAvatar, resolveAvatars } from "../_shared/storage.ts";
import { isInviteExpired, maskEmail, OPEN_INVITE_STATUSES, toApiInvitation } from "../_shared/invitations.ts";
import { isUuid, requireUuid } from "../_shared/util.ts";
import { dropAccess, seedBaseline } from "../_shared/parent-permissions.ts";

async function loadByToken(token: unknown): Promise<Record<string, any>> {
  if (typeof token !== "string" || token.length < 16 || token.length > 200) throw err.validation("token is required");
  const inv = check(
    await db().from("invitations").select("*").eq("token", token).maybeSingle(),
    "load invitation",
  ) as Record<string, any> | null;
  if (!inv) throw err.notFound("Invitation not found");
  if (isInviteExpired(inv as any)) {
    check(await db().from("invitations").update({ status: "expired" }).eq("id", inv.id), "expire invitation");
    inv.status = "expired";
  }
  return inv;
}

/** Throws the matching INVITE_* error unless the invitation is still open. */
function assertOpen(inv: Record<string, any>) {
  if (OPEN_INVITE_STATUSES.includes(inv.status)) return;
  switch (inv.status) {
    case "expired":
      throw new HttpError(410, "INVITE_EXPIRED", "Invitation has expired");
    case "cancelled":
    case "revoked":
      throw new HttpError(410, "INVITE_CANCELLED", "Invitation was cancelled");
    case "declined":
    case "rejected":
      throw new HttpError(410, "INVITE_DECLINED", "Invitation was declined");
    default: // accepted, disconnected
      throw new HttpError(409, "INVITE_USED", "Invitation was already used");
  }
}

function inviteChildIds(inv: Record<string, any>): string[] {
  return (Array.isArray(inv.child_ids) ? inv.child_ids : []).filter(isUuid).map((s: string) => s.toLowerCase());
}

/** Children of the invitation that the inviter can (still) access. */
async function inviterChildIds(inv: Record<string, any>): Promise<string[]> {
  const allowed = new Set(await childIdsFor(inv.from_parent_id));
  return inviteChildIds(inv).filter((id) => allowed.has(id));
}

/**
 * In-app notification for the parent who sent the invitation (best-effort, never fails the action).
 * Declining needs no account, so the actor can be null; the text uses the invited e-mail address.
 */
async function tellInviter(inv: Record<string, any>, key: string, actorId: string | null, category: "wijziging" | "info") {
  try {
    const { error } = await db().from("notifications").insert({
      user_id: inv.from_parent_id,
      actor_id: actorId,
      type: "invitation",
      category,
      title: key,
      message: "",
      link: "/verbonden-personen",
      entity_type: "invitation",
      entity_id: inv.id,
      child_ids: [],
      metadata: { params: { email: String(inv.to_email ?? "").slice(0, 200) }, audit_id: null },
    });
    if (error) throw error;
  } catch (e) {
    console.warn("[accept-invitation] notify inviter failed:", (e as Error)?.message ?? e);
  }
}

Deno.serve(serveActions("accept-invitation", {
  // ---------------------------------------------------------------- public
  async inspect(_req, body) {
    const inv = await loadByToken(body.token);
    if (inv.status === "sent" || inv.status === "pending") {
      check(await db().from("invitations").update({ status: "viewed" }).eq("id", inv.id), "mark viewed");
      inv.status = "viewed";
    }
    // Closed invitations (expired, cancelled, used, declined) reveal no names or children.
    if (!OPEN_INVITE_STATUSES.includes(inv.status)) {
      return ok({
        invitation: {
          status: inv.status,
          expires_at: inv.expires_at,
          to_email_masked: maskEmail(inv.to_email),
          from_parent: { name: "", avatar: null },
          children: [],
        },
      });
    }
    const from = check(
      await db().from("profiles").select("name, avatar_url").eq("id", inv.from_parent_id).maybeSingle(),
      "load inviter",
    ) as { name: string; avatar_url: string | null } | null;
    const ids = await inviterChildIds(inv);
    const kids = ids.length
      ? ((check(
        await db().from("children").select("id, name, color_code, avatar_url").in("id", ids),
        "load invite children",
      ) ?? []) as Array<{ id: string; name: string; color_code: string | null; avatar_url: string | null }>)
      : [];
    const avatars = await resolveAvatars([from?.avatar_url, ...kids.map((k) => k.avatar_url)]);
    return ok({
      invitation: {
        status: inv.status,
        expires_at: inv.expires_at,
        to_email_masked: maskEmail(inv.to_email),
        // Open invitation only: the link was e-mailed to this address, so whoever holds it may see it.
        // The app pre-fills (and locks) the registration e-mail with it, so accepting can't mismatch.
        to_email: String(inv.to_email ?? "").trim().toLowerCase(),
        from_parent: { name: from?.name ?? "", avatar: avatars[0] },
        children: kids.map((k, i) => ({ id: k.id, name: k.name, color_code: k.color_code, avatar: avatars[i + 1] })),
      },
    });
  },

  async decline(_req, body) {
    const inv = await loadByToken(body.token);
    if (inv.status === "declined" || inv.status === "rejected") return ok({});
    assertOpen(inv);
    check(await db().from("invitations").update({ status: "declined" }).eq("id", inv.id), "decline invitation");
    // The inviting parent is told (and the invitation stays visible as "Afgewezen" in their list).
    await tellInviter(inv, "uitnodigingAfgewezen", null, "wijziging");
    return ok({});
  },

  // ---------------------------------------------------------------- session
  async accept(req, body) {
    const me = await requireUser(req);
    const inv = await loadByToken(body.token);
    // Idempotent for the person who accepted it: a retry (e.g. after a failed follow-up step in the app)
    // finishes the same work again instead of answering INVITE_USED.
    const retry = inv.status === "accepted" && inv.to_parent_id === me.id;
    if (!retry) assertOpen(inv);
    if (inv.from_parent_id === me.id) throw new HttpError(400, "INVITE_OWN", "You cannot accept your own invitation");
    if (String(inv.to_email).trim().toLowerCase() !== me.email.trim().toLowerCase()) {
      throw new HttpError(403, "INVITE_EMAIL_MISMATCH", "This invitation was sent to another e-mail address");
    }

    const childIds = await inviterChildIds(inv);
    if (retry) {
      // A retry only finishes missing steps while the invitee is STILL linked to every invited child. After
      // leaving a child (or after a disconnect) an old accepted invitation can never re-link the child or
      // reset the agreed access rights: that needs a new invitation.
      const linked = childIds.length
        ? ((check(
          await db().from("child_parents").select("child_id").eq("parent_id", me.id).in("child_id", childIds),
          "retry links",
        ) ?? []) as Array<{ child_id: string }>).map((r) => r.child_id)
        : [];
      if (childIds.some((id) => !linked.includes(id))) throw new HttpError(409, "INVITE_USED", "Invitation was already used");
      const conn = await findConnection(inv.from_parent_id, me.id);
      if (conn && !ACTIVE_CONNECTION.includes(conn.status)) throw new HttpError(409, "INVITE_USED", "Invitation was already used");
    }
    // check limits first, then link
    const created = childIds.length
      ? ((check(
        await db().from("children").select("id, created_by").in("id", childIds),
        "load children",
      ) ?? []) as Array<{ id: string; created_by: string }>)
      : [];
    for (const c of created) {
      if ((await parentCount(c.id, c.created_by, me.id)) >= 2) {
        throw new HttpError(409, "CHILD_LIMIT", "A child can have at most two parents");
      }
    }
    if (created.length) {
      check(
        await db().from("child_parents").upsert(
          created.map((c) => ({ child_id: c.id, parent_id: me.id, role: "parent", can_edit: true })),
          { onConflict: "child_id,parent_id", ignoreDuplicates: true },
        ),
        "link children",
      );
      // per-child access: the baseline (same rights as before) for exactly the invited children
      await seedBaseline(created.map((c) => c.id), [me.id, inv.from_parent_id]);
    }

    // undirected connection: update the existing pair or create one
    const now = new Date().toISOString();
    let connection = await findConnection(inv.from_parent_id, me.id);
    if (connection) {
      connection = check(
        await db()
          .from("parent_connections")
          .update({ status: "active", invitation_id: inv.id, updated_at: now })
          .eq("id", connection.id)
          .select("*")
          .single(),
        "reactivate connection",
      ) as Record<string, any>;
    } else {
      const ins = await db()
        .from("parent_connections")
        .insert({ parent_1_id: inv.from_parent_id, parent_2_id: me.id, invitation_id: inv.id, status: "active" })
        .select("*")
        .single();
      if (ins.error && (ins.error as { code?: string }).code === "23505") {
        // created concurrently -> update it
        const again = await findConnection(inv.from_parent_id, me.id);
        if (!again) throw err.server("Connection race");
        connection = check(
          await db().from("parent_connections").update({ status: "active", invitation_id: inv.id, updated_at: now })
            .eq("id", again.id).select("*").single(),
          "reactivate connection",
        ) as Record<string, any>;
      } else {
        connection = check(ins, "create connection") as Record<string, any>;
      }
    }

    if (!retry) {
      check(
        await db()
          .from("invitations")
          .update({ status: "accepted", accepted_at: now, to_parent_id: me.id })
          .eq("id", inv.id),
        "mark accepted",
      );
    }
    check(
      await db().from("profiles").update({ usage_mode: "together" }).in("id", [inv.from_parent_id, me.id]),
      "usage mode together",
    );
    if (!retry) await tellInviter(inv, "uitnodigingGeaccepteerd", me.id, "info");

    const coParent = check(
      await db().from("profiles").select("id, name, avatar_url").eq("id", inv.from_parent_id).single(),
      "load co-parent",
    ) as { id: string; name: string; avatar_url: string | null };

    return ok({
      connection: { id: connection.id, status: connection.status, connected_at: connection.updated_at ?? connection.created_at },
      co_parent: { id: coParent.id, name: coParent.name, avatar: await resolveAvatar(coParent.avatar_url) },
      children: await buildChildren(me.id, created.map((c) => c.id)),
    });
  },

  async "list-sent"(req) {
    const me = await requireUser(req);
    const rows = (check(
      await db()
        .from("invitations")
        .select("id, to_email, status, child_ids, created_at, expires_at, accepted_at, email_status, email_sent_at")
        .eq("from_parent_id", me.id)
        .order("created_at", { ascending: false }),
      "list invitations",
    ) ?? []) as Record<string, any>[];
    return ok({ invitations: rows.map(toApiInvitation) });
  },

  async cancel(req, body) {
    const me = await requireUser(req);
    const id = requireUuid(body.invitation_id, "invitation_id");
    const inv = check(
      await db().from("invitations").select("id, from_parent_id, status, expires_at").eq("id", id).maybeSingle(),
      "load invitation",
    ) as Record<string, any> | null;
    if (!inv || inv.from_parent_id !== me.id) throw err.notFound("Invitation not found");
    if (inv.status === "revoked" || inv.status === "cancelled") return ok({});
    if (inv.status === "accepted") throw new HttpError(409, "INVITE_USED", "Invitation was already accepted");
    check(await db().from("invitations").update({ status: "revoked" }).eq("id", id), "revoke invitation");
    return ok({});
  },

  async "list-connected"(req) {
    const me = await requireUser(req);
    const rows = (check(
      await db()
        .from("parent_connections")
        .select("parent_1_id, parent_2_id, created_at, updated_at")
        .or(`parent_1_id.eq.${me.id},parent_2_id.eq.${me.id}`)
        .in("status", ACTIVE_CONNECTION),
      "list connections",
    ) ?? []) as Array<{ parent_1_id: string; parent_2_id: string; created_at: string; updated_at: string | null }>;
    if (!rows.length) return ok({ co_parents: [] });

    const otherIds = rows.map((r) => (r.parent_1_id === me.id ? r.parent_2_id : r.parent_1_id));
    const profiles = (check(
      await db().from("profiles").select("id, name, avatar_url").in("id", otherIds),
      "load co-parents",
    ) ?? []) as Array<{ id: string; name: string; avatar_url: string | null }>;
    const avatars = await resolveAvatars(profiles.map((p) => p.avatar_url));

    const mine = new Set(await childIdsFor(me.id));
    const coParents: Array<Record<string, unknown>> = [];
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      const conn = rows.find((r) => r.parent_1_id === p.id || r.parent_2_id === p.id)!;
      const theirs = await childIdsFor(p.id);
      coParents.push({
        id: p.id,
        name: p.name,
        avatar: avatars[i],
        connected_at: conn.updated_at ?? conn.created_at,
        child_ids: theirs.filter((id) => mine.has(id)),
      });
    }
    return ok({ co_parents: coParents });
  },

  async disconnect(req, body) {
    const me = await requireUser(req);
    const other = requireUuid(body.co_parent_id, "co_parent_id");
    const conn = await findConnection(me.id, other);
    if (!conn || !ACTIVE_CONNECTION.includes(conn.status)) throw err.notFound("Connection not found");
    const now = new Date().toISOString();

    check(
      await db().from("parent_connections").update({ status: "disconnected", updated_at: now }).eq("id", conn.id),
      "disconnect",
    );
    // other functions still derive "connected" from accepted invitations -> close those too
    check(
      await db()
        .from("invitations")
        .update({ status: "disconnected" })
        .eq("status", "accepted")
        .or(`and(from_parent_id.eq.${me.id},to_parent_id.eq.${other}),and(from_parent_id.eq.${other},to_parent_id.eq.${me.id})`),
      "close invitations",
    );

    // remove the co-parent from my children and me from theirs (history rows stay)
    const [mineCreated, theirsCreated] = await Promise.all([
      db().from("children").select("id").eq("created_by", me.id),
      db().from("children").select("id").eq("created_by", other),
    ]);
    const myKids = ((check(mineCreated, "my children") ?? []) as Array<{ id: string }>).map((c) => c.id);
    const theirKids = ((check(theirsCreated, "their children") ?? []) as Array<{ id: string }>).map((c) => c.id);
    if (myKids.length) {
      check(await db().from("child_parents").delete().eq("parent_id", other).in("child_id", myKids), "unlink co-parent");
      await dropAccess(myKids, other);
    }
    if (theirKids.length) {
      check(await db().from("child_parents").delete().eq("parent_id", me.id).in("child_id", theirKids), "unlink me");
      await dropAccess(theirKids, me.id);
    }

    for (const uid of [me.id, other]) {
      if ((await coParentIdsFor(uid)).length === 0) {
        check(await db().from("profiles").update({ usage_mode: "solo" }).eq("id", uid).neq("usage_mode", "caregiver"), "usage solo");
      }
    }
    return ok({});
  },
}));
