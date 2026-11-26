// custom-auth — registration, e-mail verification, login, password reset, session restore, logout.
// Public function (deployed with --no-verify-jwt). Only `me` and `logout` use the x-session-token header.
import { db } from "../_shared/db.ts";
import { check, HttpError, ok, serveActions } from "../_shared/respond.ts";
import { assertPasswordPolicy, hashPassword, verifyPassword } from "../_shared/password.ts";
import {
  assertCodeRateLimit,
  assertIpRate,
  checkCode,
  guardCodeCheck,
  IP_LOGIN_FAILS_PER_15_MIN,
  recordIpEvent,
  CodePurpose,
  countRateEvents,
  isCodeRateLimited,
  issueCode,
  recordRateEvent,
} from "../_shared/codes.ts";
import { resetEmail, sendEmail, verificationEmail } from "../_shared/mail.ts";
import { createSession, requireUser, revokeAllSessions, revokeCurrentSession } from "../_shared/session.ts";
import { findProfileByEmailWithSecrets, loadApiUser } from "../_shared/users.ts";
import { normalizeEmail, reqText } from "../_shared/util.ts";

const LOGIN_FAILS_PER_15_MIN = 10;

/** Profile lookup for the parent app's auth flows: the super admin (admin panel only) counts as unknown here. */
async function appProfileByEmail(email: string): Promise<Record<string, any> | null> {
  const p = await findProfileByEmailWithSecrets(email);
  return p && p.role !== "superadmin" ? p : null;
}

function cleanName(v: unknown): string {
  // single line, no control characters (also ends up in e-mail subjects)
  return reqText(typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ") : v, "name", 100);
}

async function sendCode(userId: string, email: string, purpose: CodePurpose, isEn: boolean): Promise<boolean> {
  const code = await issueCode(userId, email, purpose);
  const mail = purpose === "verify" ? verificationEmail(code, isEn) : resetEmail(code, isEn);
  return await sendEmail({ to: email, ...mail });
}

async function sessionPayload(userId: string, req: Request) {
  const session_token = await createSession(userId, req);
  return { session_token, user: await loadApiUser(userId) };
}

Deno.serve(serveActions("custom-auth", {
  // -------------------------------------------------------------------------
  async register(_req, body, { isEn }) {
    const email = normalizeEmail(body.email);
    const name = cleanName(body.name);
    const password = assertPasswordPolicy(body.password);

    const existing = await findProfileByEmailWithSecrets(email);
    if (existing?.is_verified) throw new HttpError(409, "EMAIL_TAKEN", "An account with this e-mail already exists");
    await assertCodeRateLimit(email, "verify");

    const passwordHash = await hashPassword(password);
    let userId: string;
    if (existing) {
      // Unverified account: never overwrite the password here (anyone could do that before the
      // owner verifies). Just send a new code; verify-email sets the password the mailbox owner
      // typed in their own browser.
      userId = existing.id;
    } else {
      const created = check(
        await db()
          .from("profiles")
          .insert({
            email,
            password: passwordHash,
            name,
            usage_mode: "together",
            role: "parent",
            is_verified: false,
            onboarding_completed: false,
          })
          .select("id")
          .single(),
        "create profile",
      ) as { id: string };
      userId = created.id;
    }
    const emailSent = await sendCode(userId, email, "verify", isEn);
    return ok({ needs_verification: true, email, email_sent: emailSent });
  },

  // -------------------------------------------------------------------------
  async "verify-email"(req, body) {
    await guardCodeCheck(req);
    const email = normalizeEmail(body.email);
    const profile = await appProfileByEmail(email);
    // Validate the new password (if sent) before the code is consumed.
    const newPassword = body.password !== undefined && body.password !== null && body.password !== ""
      ? assertPasswordPolicy(body.password)
      : null;
    await checkCode(profile as any, "verify", body.code, true);
    // The code proves mailbox ownership: the password typed by that person becomes the password,
    // so a password set earlier by someone else (pre-registration) stops working.
    // Without a password (e.g. verified in another browser) we cannot know who chose the stored one: it
    // may be an attacker's pre-registration. It is replaced by an unusable random hash and the user must
    // set a password now (set-password, allowed once with this session).
    const update: Record<string, unknown> = { is_verified: true, last_login_at: new Date().toISOString() };
    if (newPassword) {
      update.password = await hashPassword(newPassword);
      update.password_must_be_set = false;
    } else {
      const random = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
      update.password = await hashPassword(random);
      update.password_must_be_set = true;
    }
    check(
      await db().from("profiles").update(update).eq(
        "id",
        profile!.id,
      ),
      "mark verified",
    );
    return ok({ ...(await sessionPayload(profile!.id, req)), needs_password_reset: !newPassword });
  },

  // -------------------------------------------------------------------------
  async "resend-code"(_req, body, { isEn }) {
    const email = normalizeEmail(body.email);
    const purpose: CodePurpose = body.purpose === "reset" ? "reset" : "verify";
    if (body.purpose !== undefined && body.purpose !== "verify" && body.purpose !== "reset") {
      throw new HttpError(400, "VALIDATION", "purpose must be verify or reset");
    }
    // counted for every e-mail (existing or not) so the response never reveals accounts
    await assertCodeRateLimit(email, purpose);
    const profile = await findProfileByEmailWithSecrets(email);
    // Never e-mail codes to the super admin (no mailbox-based takeover) or to a disabled account.
    const eligible = profile && profile.role !== "superadmin" && !profile.disabled_at && (purpose === "reset" || !profile.is_verified);
    if (eligible) {
      await sendCode(profile.id, profile.email, purpose, isEn);
    } else {
      await recordRateEvent(email, purpose);
    }
    return ok({ sent: true });
  },

  // -------------------------------------------------------------------------
  async login(req, body, { isEn }) {
    const email = normalizeEmail(body.email);
    if ((await countRateEvents(email, "login_fail", 15)) >= LOGIN_FAILS_PER_15_MIN) {
      throw new HttpError(429, "RATE_LIMITED", "Too many failed logins, try again later");
    }
    await assertIpRate(req, "ip_login_fail", IP_LOGIN_FAILS_PER_15_MIN);
    const found = await findProfileByEmailWithSecrets(email);
    // The super admin only signs in through the admin panel (admin-api): here it behaves like an unknown account.
    const profile = found && found.role !== "superadmin" ? found : null;
    const valid = await verifyPassword(body.password, profile?.password);
    if (!profile || !valid) {
      await recordRateEvent(email, "login_fail");
      await recordIpEvent(req, "ip_login_fail");
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid e-mail or password");
    }
    if (profile.disabled_at) {
      throw new HttpError(403, "ACCOUNT_DISABLED", "This account has been disabled");
    }
    if (!profile.is_verified) {
      if (!(await isCodeRateLimited(email, "verify"))) {
        await sendCode(profile.id, profile.email, "verify", isEn);
      }
      throw new HttpError(403, "NOT_VERIFIED", "E-mail address is not verified yet");
    }
    check(
      await db().from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", profile.id),
      "update last login",
    );
    return ok(await sessionPayload(profile.id, req));
  },

  // -------------------------------------------------------------------------
  async "request-password-reset"(_req, body, { isEn }) {
    const email = normalizeEmail(body.email);
    // always the same answer; silently skip when rate limited or unknown
    if (await isCodeRateLimited(email, "reset")) return ok({ sent: true });
    const profile = await appProfileByEmail(email);
    if (profile && !profile.disabled_at) {
      await sendCode(profile.id, profile.email, "reset", isEn);
    } else {
      await recordRateEvent(email, "reset");
    }
    return ok({ sent: true });
  },

  // -------------------------------------------------------------------------
  async "verify-reset-code"(req, body) {
    await guardCodeCheck(req);
    const email = normalizeEmail(body.email);
    const profile = await appProfileByEmail(email);
    await checkCode(profile as any, "reset", body.code, false);
    return ok({ valid: true });
  },

  // -------------------------------------------------------------------------
  async "reset-password"(req, body) {
    await guardCodeCheck(req);
    const email = normalizeEmail(body.email);
    const password = assertPasswordPolicy(body.password);
    const profile = await appProfileByEmail(email);
    await checkCode(profile as any, "reset", body.code, true);
    check(
      await db()
        .from("profiles")
        .update({
          password: await hashPassword(password),
          password_must_be_set: false,
          // the code proved ownership of the mailbox
          is_verified: true,
          last_login_at: new Date().toISOString(),
        })
        .eq("id", profile!.id),
      "set new password",
    );
    await revokeAllSessions(profile!.id);
    return ok(await sessionPayload(profile!.id, req));
  },

  // -------------------------------------------------------------------------
  /**
   * Session required. Sets the password once after verify-email answered needs_password_reset (the stored
   * password was replaced by an unusable one). Every other password change goes through reset-password.
   */
  async "set-password"(req, body) {
    const user = await requireUser(req);
    const password = assertPasswordPolicy(body.password);
    const flag = check(
      await db().from("profiles").select("password_must_be_set").eq("id", user.id).single(),
      "load password flag",
    ) as { password_must_be_set: boolean | null };
    if (!flag.password_must_be_set) throw new HttpError(403, "FORBIDDEN", "Use the password reset to change your password");
    const done = check(
      await db().from("profiles").update({ password: await hashPassword(password), password_must_be_set: false })
        .eq("id", user.id).eq("password_must_be_set", true).select("id"),
      "set password",
    ) as Array<{ id: string }> | null;
    if (!done?.length) throw new HttpError(403, "FORBIDDEN", "Use the password reset to change your password");
    return ok({});
  },

  // -------------------------------------------------------------------------
  async me(req) {
    const user = await requireUser(req);
    return ok({ user: await loadApiUser(user.id) });
  },

  // -------------------------------------------------------------------------
  async logout(req) {
    await revokeCurrentSession(req);
    return ok({});
  },
}));

