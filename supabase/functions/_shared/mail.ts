// One e-mail helper for all functions: SMTP (nodemailer) first, Resend HTTP API as fallback.
// Env (names unchanged from the old backend): SMTP_HOST|EMAIL_HOST, SMTP_PORT|EMAIL_PORT,
// SMTP_USER|EMAIL_USER, SMTP_PASS|EMAIL_PASS, SMTP_FROM|EMAIL_FROM, RESEND_API_KEY.
import nodemailer from "npm:nodemailer@6.9.10";
import { CODE_TTL_MINUTES } from "./codes.ts";
import { escapeHtml } from "./util.ts";

export const INVITE_TTL_DAYS = 14;

function env(...names: string[]): string {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  return "";
}

function maskEmail(to: string): string {
  const [local, domain] = to.split("@");
  return `${(local || "").slice(0, 1)}***@${domain || ""}`;
}

/** Sends an e-mail. Never throws; returns whether a transport accepted the message. */
export async function sendEmail(msg: { to: string; subject: string; html: string }): Promise<boolean> {
  const host = env("SMTP_HOST", "EMAIL_HOST");
  const port = Number(env("SMTP_PORT", "EMAIL_PORT") || "587");
  const user = env("SMTP_USER", "EMAIL_USER");
  const pass = env("SMTP_PASS", "EMAIL_PASS").replace(/^["']|["']$/g, "").trim();
  const isGmail = host.toLowerCase().includes("gmail");
  const isResendSmtp = host.toLowerCase().includes("resend");
  const from =
    env("SMTP_FROM", "EMAIL_FROM") ||
    (isResendSmtp
      ? "Ouderschap & Co <onboarding@resend.dev>"
      : user.includes("@")
      ? `Ouderschap & Co <${user}>`
      : "Ouderschap & Co <onboarding@resend.dev>");

  if (host && pass) {
    try {
      const transporter = isGmail
        ? nodemailer.createTransport({ service: "gmail", auth: { user, pass } })
        : nodemailer.createTransport({
          host,
          port: isResendSmtp && !port ? 465 : port,
          secure: port === 465,
          auth: { user: isResendSmtp ? "resend" : user, pass },
        });
      await transporter.sendMail({ from, to: msg.to, subject: msg.subject, html: msg.html });
      console.log(`[mail] sent to ${maskEmail(msg.to)} via SMTP`);
      return true;
    } catch (e) {
      console.error("[mail] SMTP delivery failed:", e);
    }
  }

  const resendKey = env("RESEND_API_KEY") || (pass.startsWith("re_") ? pass : "");
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html }),
      });
      if (res.ok) {
        console.log(`[mail] sent to ${maskEmail(msg.to)} via Resend`);
        return true;
      }
      console.error("[mail] Resend error:", res.status, await res.text());
    } catch (e) {
      console.error("[mail] Resend delivery failed:", e);
    }
  }

  console.warn(`[mail] no working e-mail transport for ${maskEmail(msg.to)}`);
  return false;
}

// ---------------------------------------------------------------------------
// Templates (NL/EN)
// ---------------------------------------------------------------------------

function wrap(headerSub: string, content: string, isEn: boolean): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin:0;padding:32px 16px;background-color:#f7f5f2;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <div style="max-width:540px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e7e2d9;box-shadow:0 4px 20px -2px rgba(44,74,62,0.06);">
      <div style="background:linear-gradient(135deg,#2c4a3e 0%,#1e332b 100%);padding:32px 28px;text-align:center;">
        <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;font-weight:600;color:#ffffff;">Ouderschap &amp; Co.</h1>
        <p style="margin:6px 0 0;color:#d4e4dc;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">${headerSub}</p>
      </div>
      <div style="padding:32px 28px;">${content}</div>
      <div style="background-color:#faf8f5;border-top:1px solid #e7e2d9;padding:18px 28px;text-align:center;font-size:12px;color:#9ca3af;">
        &copy; ${new Date().getFullYear()} Ouderschap &amp; Co. ${isEn ? "All rights reserved." : "Alle rechten voorbehouden."}
      </div>
    </div>
  </body>
</html>`;
}

function codeBlock(label: string, code: string, color: string, bg: string): string {
  return `<div style="text-align:center;margin:24px 0;padding:20px 16px;background:${bg};border-radius:14px;border:1px dashed ${color};">
  <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:${color};font-weight:700;margin-bottom:6px;">${label}</div>
  <div style="font-family:monospace;font-size:34px;font-weight:800;letter-spacing:8px;color:${color};padding-left:8px;">${escapeHtml(code)}</div>
</div>`;
}

export function verificationEmail(code: string, isEn: boolean): { subject: string; html: string } {
  return {
    subject: isEn ? "Your verification code - Ouderschap & Co" : "Je verificatiecode - Ouderschap & Co",
    html: wrap(
      isEn ? "Account verification" : "Account verificatie",
      `<h2 style="margin:0 0 14px;font-size:20px;font-weight:700;color:#2c4a3e;">${isEn ? "Welcome to Ouderschap &amp; Co." : "Welkom bij Ouderschap &amp; Co."}</h2>
<p style="margin:0 0 20px;color:#4b5563;font-size:14.5px;line-height:1.6;">${
        isEn
          ? "Use the 6-digit code below to confirm your e-mail address:"
          : "Gebruik onderstaande 6-cijferige code om je e-mailadres te bevestigen:"
      }</p>
${codeBlock(isEn ? "Your verification code" : "Jouw verificatiecode", code, "#2c4a3e", "#f4f8f6")}
<p style="margin:0;color:#9ca3af;font-size:12px;">${
        isEn
          ? `This code is valid for ${CODE_TTL_MINUTES} minutes. Never share it with anyone. Did you not sign up? Then you can ignore this e-mail.`
          : `Deze code is ${CODE_TTL_MINUTES} minuten geldig. Deel hem nooit met anderen. Heb je je niet aangemeld? Dan kun je deze e-mail negeren.`
      }</p>`,
      isEn,
    ),
  };
}

export function resetEmail(code: string, isEn: boolean): { subject: string; html: string } {
  return {
    subject: isEn ? "Password reset code - Ouderschap & Co" : "Herstelcode voor je wachtwoord - Ouderschap & Co",
    html: wrap(
      isEn ? "Password reset" : "Wachtwoord herstellen",
      `<h2 style="margin:0 0 14px;font-size:20px;font-weight:700;color:#2c4a3e;">${isEn ? "Reset password" : "Wachtwoord herstellen"}</h2>
<p style="margin:0 0 20px;color:#4b5563;font-size:14.5px;line-height:1.6;">${
        isEn
          ? "We received a request to change the password of your account. Enter the 6-digit code below:"
          : "We hebben een verzoek ontvangen om het wachtwoord van je account te wijzigen. Voer onderstaande 6-cijferige code in:"
      }</p>
${codeBlock(isEn ? "Your recovery code" : "Jouw herstelcode", code, "#C46A4A", "#fdf5f2")}
<p style="margin:0;color:#9ca3af;font-size:12px;">${
        isEn
          ? `This code is valid for ${CODE_TTL_MINUTES} minutes. Did you not request this? You can safely ignore this e-mail; your password stays the same.`
          : `Deze code is ${CODE_TTL_MINUTES} minuten geldig. Heb je dit niet aangevraagd? Negeer deze e-mail gerust; je wachtwoord blijft hetzelfde.`
      }</p>`,
      isEn,
    ),
  };
}

export function invitationEmail(opts: {
  senderName: string;
  inviteLink: string;
  childrenNames: string[];
  isEn: boolean;
}): { subject: string; html: string } {
  const { isEn } = opts;
  const sender = escapeHtml(opts.senderName || (isEn ? "A parent" : "Een ouder"));
  const link = escapeHtml(opts.inviteLink);
  const children = opts.childrenNames.length
    ? `<div style="background:#f4f8f6;border-radius:14px;padding:18px 20px;margin:24px 0;border:1px solid #d4e4dc;">
  <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;color:#2c4a3e;">${isEn ? "Shared children" : "Gedeelde kinderen"}</p>
  <div style="font-size:16px;font-weight:700;color:#1e332b;">${opts.childrenNames.map((n) => `&bull; ${escapeHtml(n)}`).join("<br>")}</div>
</div>`
    : "";
  const t = isEn
    ? {
      subject: `${opts.senderName || "A parent"} invited you to Ouderschap & Co`,
      head: "Co-parenting invitation",
      greeting: `Hi! ${sender} invited you`,
      intro: `<strong>${sender}</strong> would like to connect with you on <strong>Ouderschap &amp; Co</strong>, so you can coordinate the care schedule, calendar and agreements for the children together.`,
      cta: "View invitation",
      fallback: "Button not working? Copy and open this link in your browser:",
      privacy: "Your own private notes stay visible to you only.",
      expiry: `This invitation is valid for ${INVITE_TTL_DAYS} days. Sign in (or create an account) with this e-mail address to accept it.`,
    }
    : {
      subject: `${opts.senderName || "Een ouder"} heeft je uitgenodigd voor Ouderschap & Co`,
      head: "Uitnodiging co-ouderschap",
      greeting: `Hoi! ${sender} heeft je uitgenodigd`,
      intro: `<strong>${sender}</strong> wil graag met jou verbinden op <strong>Ouderschap &amp; Co</strong>, zodat jullie samen rustig de zorgregeling, agenda en afspraken voor de kinderen kunnen afstemmen.`,
      cta: "Bekijk uitnodiging",
      fallback: "Werkt de knop niet? Kopieer en open deze link in je browser:",
      privacy: "Je eigen privénotities blijven alleen voor jou zichtbaar.",
      expiry: `Deze uitnodiging is ${INVITE_TTL_DAYS} dagen geldig. Log in (of maak een account) met dit e-mailadres om hem te accepteren.`,
    };
  return {
    subject: t.subject,
    html: wrap(
      t.head,
      `<h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#2c4a3e;">${t.greeting}</h2>
<p style="margin:0 0 18px;color:#4b5563;font-size:15px;line-height:1.6;">${t.intro}</p>
${children}
<div style="text-align:center;margin:34px 0 28px;">
  <a href="${link}" style="display:inline-block;background-color:#2c4a3e;color:#ffffff;padding:15px 36px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">${t.cta}</a>
</div>
<div style="background:#faf8f5;border-radius:12px;padding:14px 16px;margin:24px 0;border:1px dashed #d5cfc5;font-size:12px;color:#6b7280;line-height:1.5;">
  ${t.fallback}<br><a href="${link}" style="color:#2c4a3e;font-weight:600;word-break:break-all;">${link}</a>
</div>
<p style="margin:0 0 6px;color:#9ca3af;font-size:12px;line-height:1.5;">${t.privacy}</p>
<p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">${t.expiry}</p>`,
      isEn,
    ),
  };
}
