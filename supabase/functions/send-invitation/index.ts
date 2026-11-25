// send-invitation — invite a co-parent by e-mail for one or more children. Session required.
import { db } from "../_shared/db.ts";
import { check, err, HttpError, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { assertChildAccess, parentCount } from "../_shared/access.ts";
import { countRateEvents, recordRateEvent } from "../_shared/codes.ts";
import { INVITE_TTL_DAYS, invitationEmail, sendEmail } from "../_shared/mail.ts";
import { appOrigin } from "../_shared/origin.ts";
import { OPEN_INVITE_STATUSES, toApiInvitation } from "../_shared/invitations.ts";
import { normalizeEmail, randomHex, requireUuid } from "../_shared/util.ts";

const OPEN_STATUSES = OPEN_INVITE_STATUSES;
const INVITES_PER_HOUR = 10;

async function send(req: Request, body: Record<string, any>, isEn: boolean) {
  const me = await requireUser(req);
  const toEmail = normalizeEmail(body.to_email);
  if (toEmail === me.email.toLowerCase()) throw new HttpError(400, "INVITE_OWN", "You cannot invite yourself");

  if (!Array.isArray(body.child_ids) || body.child_ids.length === 0) {
    throw err.validation("child_ids must contain at least one child");
  }
  if (body.child_ids.length > 20) throw err.validation("Too many children");
  const childIds = [...new Set(body.child_ids.map((id: unknown) => requireUuid(id, "child_ids[]")))] as string[];

  // recipient may already have an account (then they do not count towards the limit)
  const recipient = check(
    await db().from("profiles").select("id").eq("email", toEmail).limit(1),
    "find recipient",
  ) as Array<{ id: string }>;
  const recipientId = recipient?.[0]?.id;

  const names: string[] = [];
  for (const childId of childIds) {
    const access = await assertChildAccess(me.id, childId, { edit: true });
    if ((await parentCount(childId, access.created_by, recipientId)) >= 2) {
      throw new HttpError(409, "CHILD_LIMIT", "A child can have at most two parents");
    }
    const c = check(await db().from("children").select("name").eq("id", childId).single(), "child name") as {
      name: string;
    };
    names.push(c.name);
  }

  // The link must be buildable BEFORE anything is stored: otherwise an invitation would show as
  // "waiting for a reply" while no e-mail was ever sent.
  const origin = appOrigin(body.redirect_origin);

  if ((await countRateEvents(me.email.toLowerCase(), "invite", 60)) >= INVITES_PER_HOUR) {
    throw new HttpError(429, "RATE_LIMITED", "Too many invitations, try again later");
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  const open = check(
    await db()
      .from("invitations")
      .select("*")
      .eq("from_parent_id", me.id)
      .eq("to_email", toEmail)
      .in("status", OPEN_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1),
    "find open invitation",
  ) as Record<string, any>[];

  let invitation: Record<string, any>;
  if (open?.length) {
    invitation = check(
      await db()
        .from("invitations")
        .update({ child_ids: childIds, expires_at: expiresAt, to_email: toEmail })
        .eq("id", open[0].id)
        .select("*")
        .single(),
      "refresh invitation",
    ) as Record<string, any>;
  } else {
    invitation = check(
      await db()
        .from("invitations")
        .insert({
          from_parent_id: me.id,
          to_email: toEmail,
          token: randomHex(32),
          status: "sent",
          child_ids: childIds,
          role: "parent",
          expires_at: expiresAt,
        })
        .select("*")
        .single(),
      "create invitation",
    ) as Record<string, any>;
  }

  await recordRateEvent(me.email.toLowerCase(), "invite");
  const { row, inviteLink, emailSent } = await deliver(invitation, me, origin, names, isEn);
  return ok({ invitation: toApiInvitation(row), invite_link: inviteLink, email_sent: emailSent });
}

/** Sends the invitation e-mail and records the outcome on the invitation (shown in the app). */
async function deliver(invitation: Record<string, any>, me: { name: string }, origin: string, names: string[], isEn: boolean) {
  const inviteLink = `${origin}/uitnodiging?token=${encodeURIComponent(invitation.token)}`;
  const mail = invitationEmail({ senderName: me.name, inviteLink, childrenNames: names, isEn });
  let emailSent = false;
  try {
    emailSent = await sendEmail({ to: invitation.to_email, ...mail });
  } catch (e) {
    console.error("[send-invitation] e-mail failed:", (e as Error)?.message ?? e);
  }
  const patch: Record<string, unknown> = {
    email_status: emailSent ? "sent" : "failed",
    email_attempts: (Number(invitation.email_attempts) || 0) + 1,
    ...(emailSent ? { email_sent_at: new Date().toISOString() } : {}),
  };
  const { data, error } = await db().from("invitations").update(patch).eq("id", invitation.id).select("*").single();
  if (error) console.warn("[send-invitation] status update failed:", error.code ?? error.message);
  return { row: (data as Record<string, any>) ?? { ...invitation, ...patch }, inviteLink, emailSent };
}

/** "Opnieuw versturen": the inviter re-sends the e-mail of an open invitation (new validity period). */
async function resend(req: Request, body: Record<string, any>, isEn: boolean) {
  const me = await requireUser(req);
  const id = requireUuid(body.invitation_id, "invitation_id");
  const inv = check(
    await db().from("invitations").select("*").eq("id", id).maybeSingle(),
    "load invitation",
  ) as Record<string, any> | null;
  if (!inv || inv.from_parent_id !== me.id) throw err.notFound();
  if (!OPEN_STATUSES.includes(inv.status)) throw new HttpError(409, "INVITE_USED", "This invitation is no longer open");
  const origin = appOrigin(body.redirect_origin);
  if ((await countRateEvents(me.email.toLowerCase(), "invite", 60)) >= INVITES_PER_HOUR) {
    throw new HttpError(429, "RATE_LIMITED", "Too many invitations, try again later");
  }
  // The children must still be the caller's (access may have changed since the first send).
  const childIds = (Array.isArray(inv.child_ids) ? inv.child_ids : []) as string[];
  const names: string[] = [];
  for (const childId of childIds) {
    await assertChildAccess(me.id, childId, { edit: true });
    const c = check(await db().from("children").select("name").eq("id", childId).single(), "child name") as { name: string };
    names.push(c.name);
  }
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  const fresh = check(
    await db().from("invitations").update({ expires_at: expiresAt, status: "sent" }).eq("id", inv.id).select("*").single(),
    "refresh invitation",
  ) as Record<string, any>;
  await recordRateEvent(me.email.toLowerCase(), "invite");
  const { row, inviteLink, emailSent } = await deliver(fresh, me, origin, names, isEn);
  return ok({ invitation: toApiInvitation(row), invite_link: inviteLink, email_sent: emailSent });
}

Deno.serve(serveActions("send-invitation", {
  send: (req, body, { isEn }) => send(req, body, isEn),
  resend: (req, body, { isEn }) => resend(req, body, isEn),
}, "send"));
