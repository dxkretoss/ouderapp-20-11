// custom-auth — registration, e-mail verification, login, password reset, session restore, logout.
// Public function (deployed with --no-verify-jwt). Only `me` and `logout` use the x-session-token header.
import { db } from "../_shared/db.ts";
import { check, HttpError, ok, serveActions } from "../_shared/respond.ts";
import { assertPasswordPolicy, hashPassword, verifyPassword } from "../_shared/password.ts";
import {
  assertCodeRateLimit,
  checkCode,
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
      // unverified account: whoever proves the mailbox owns it -> overwrite
      check(
        await db().from("profiles").update({ password: passwordHash, name }).eq("id", existing.id),
        "update unverified profile",
      );
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
    const email = normalizeEmail(body.email);
    const profile = await findProfileByEmailWithSecrets(email);
    await checkCode(profile as any, "verify", body.code, true);
    check(
      await db().from("profiles").update({ is_verified: true, last_login_at: new Date().toISOString() }).eq(
        "id",
        profile!.id,
      ),
      "mark verified",
    );
    return ok(await sessionPayload(profile!.id, req));
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
    const eligible = profile && (purpose === "reset" || !profile.is_verified);
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
    const profile = await findProfileByEmailWithSecrets(email);
    const valid = await verifyPassword(body.password, profile?.password);
    if (!profile || !valid) {
      await recordRateEvent(email, "login_fail");
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid e-mail or password");
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
    const profile = await findProfileByEmailWithSecrets(email);
    if (profile) {
      await sendCode(profile.id, profile.email, "reset", isEn);
    } else {
      await recordRateEvent(email, "reset");
    }
    return ok({ sent: true });
  },

  // -------------------------------------------------------------------------
  async "verify-reset-code"(_req, body) {
    const email = normalizeEmail(body.email);
    const profile = await findProfileByEmailWithSecrets(email);
    await checkCode(profile as any, "reset", body.code, false);
    return ok({ valid: true });
  },

  // -------------------------------------------------------------------------
  async "reset-password"(req, body) {
    const email = normalizeEmail(body.email);
    const password = assertPasswordPolicy(body.password);
    const profile = await findProfileByEmailWithSecrets(email);
    await checkCode(profile as any, "reset", body.code, true);
    check(
      await db()
        .from("profiles")
        .update({
          password: await hashPassword(password),
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

