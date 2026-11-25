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
// Templates (NL/EN): the client's standard e-mail texts (standaard.email.* in the app's locale files).
// Every variable is HTML-escaped; subjects are plain text without line breaks.
// ---------------------------------------------------------------------------

const P = "margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;";
const SMALL = "margin:0 0 12px;color:#6b7280;font-size:13px;line-height:1.5;";

/** Plain-text subject: no line breaks (header safety). */
export const subjectLine = (s: string): string => s.replace(/[\r\n]+/g, " ").trim();

/** "Emma", "Emma en Noor", "Emma, Noor en Sam" (EN: "and"). Plain text, escape before use in HTML. */
export function joinNames(names: string[], isEn: boolean): string {
  const list = names.map((n) => String(n ?? "").trim()).filter(Boolean);
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} ${isEn ? "and" : "en"} ${list[list.length - 1]}`;
}

/** Support address for the footer (env SUPPORT_EMAIL); empty = the "Questions?" sentence is left out. */
function supportEmail(): string {
  const v = env("SUPPORT_EMAIL").trim();
  return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(v) ? v : "";
}

/** Footer line of every e-mail (sheet row 131). */
function footerLine(isEn: boolean): string {
  const base = isEn
    ? "You are receiving this message because an account or invitation was created with this email address."
    : "Je ontvangt dit bericht omdat er een account of uitnodiging is aangemaakt met dit e-mailadres.";
  const support = supportEmail();
  if (!support) return base;
  const a = `<a href="mailto:${escapeHtml(support)}" style="color:#6b7280;">${escapeHtml(support)}</a>`;
  return `${base} ${isEn ? `Questions? Email ${a}.` : `Vragen? Mail ${a}.`}`;
}

/** Shared layout of all e-mails (header, content, footer line). */
export function emailLayout(headerSub: string, content: string, isEn: boolean): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin:0;padding:32px 16px;background-color:#f7f5f2;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <div style="max-width:540px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e7e2d9;box-shadow:0 4px 20px -2px rgba(44,74,62,0.06);">
      <div style="background:linear-gradient(135deg,#2c4a3e 0%,#1e332b 100%);padding:32px 28px;text-align:center;">
        <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;font-weight:600;color:#ffffff;">Ouderschap &amp; Co</h1>
        <p style="margin:6px 0 0;color:#d4e4dc;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">${escapeHtml(headerSub)}</p>
      </div>
      <div style="padding:32px 28px;">${content}</div>
      <div style="background-color:#faf8f5;border-top:1px solid #e7e2d9;padding:18px 28px;text-align:center;font-size:12px;line-height:1.5;color:#9ca3af;">
        ${footerLine(isEn)}<br>&copy; ${new Date().getFullYear()} Ouderschap &amp; Co
      </div>
    </div>
  </body>
</html>`;
}

/** "Hoi," / "Hi," */
export const greeting = (isEn: boolean): string => `<p style="${P}">${isEn ? "Hi," : "Hoi,"}</p>`;
/** "Groet, Ouderschap & Co" / "Kind regards, Ouderschap & Co" */
export const signOff = (isEn: boolean): string =>
  `<p style="margin:24px 0 0;color:#4b5563;font-size:15px;line-height:1.6;">${isEn ? "Kind regards," : "Groet,"}<br>Ouderschap &amp; Co</p>`;
export const paragraph = (html: string): string => `<p style="${P}">${html}</p>`;
export const smallPrint = (html: string): string => `<p style="${SMALL}">${html}</p>`;

/** Button plus the "Button not working? Copy this link" line. `href` is escaped here. */
export function buttonWithFallback(label: string, href: string, isEn: boolean): string {
  const link = escapeHtml(href);
  return `<div style="text-align:center;margin:28px 0 22px;">
  <a href="${link}" style="display:inline-block;background-color:#2c4a3e;color:#ffffff;padding:15px 36px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">${escapeHtml(label)}</a>
</div>
<p style="${SMALL}">${isEn ? "Button not working? Copy this link:" : "Werkt de knop niet? Kopieer dan deze link:"}<br><a href="${link}" style="color:#2c4a3e;font-weight:600;word-break:break-all;">${link}</a></p>`;
}

/** "Not meant for you? You can ignore this message." */
export const notForYou = (isEn: boolean): string =>
  smallPrint(isEn ? "Not meant for you? You can ignore this message." : "Hoort dit bericht niet bij jou? Dan kun je het negeren.");

function codeBlock(label: string, code: string): string {
  return `<div style="text-align:center;margin:24px 0;padding:20px 16px;background:#f4f8f6;border-radius:14px;border:1px dashed #2c4a3e;">
  <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#2c4a3e;font-weight:700;margin-bottom:6px;">${escapeHtml(label)}</div>
  <div style="font-family:monospace;font-size:34px;font-weight:800;letter-spacing:8px;color:#2c4a3e;padding-left:8px;">${escapeHtml(code)}</div>
</div>`;
}

const validity = (isEn: boolean): string => (isEn ? `${CODE_TTL_MINUTES} minutes` : `${CODE_TTL_MINUTES} minuten`);

/**
 * "Bevestig je e-mailadres" (sheet rows 129–130). The sheet assumes a link button; the app confirms with a
 * 6-digit code, so the code is shown instead of the button and the link line.
 */
export function verificationEmail(code: string, isEn: boolean): { subject: string; html: string } {
  const subject = isEn ? "Confirm your email address" : "Bevestig je e-mailadres";
  return {
    subject,
    html: emailLayout(
      subject,
      `${greeting(isEn)}
${paragraph(isEn ? "Confirm your email address to finish your account. Enter this code in the app:" : "Bevestig je e-mailadres om je account af te maken. Vul deze code in de app in:")}
${codeBlock(isEn ? "Your code" : "Je code", code)}
${smallPrint(isEn ? `The code is valid for ${validity(isEn)}. Never share it with anyone.` : `De code is ${validity(isEn)} geldig. Deel hem met niemand.`)}
${smallPrint(isEn ? "Didn't create an account? You can ignore this message." : "Geen account aangemaakt? Dan kun je dit bericht negeren.")}
${signOff(isEn)}`,
      isEn,
    ),
  };
}

/**
 * "Nieuw wachtwoord instellen" (sheet rows 127–128). Code-based like the app's flow: the code replaces the
 * sheet's link button; {geldigheid} is the code's validity.
 */
export function resetEmail(code: string, isEn: boolean): { subject: string; html: string } {
  const subject = isEn ? "Set a new password" : "Nieuw wachtwoord instellen";
  return {
    subject,
    html: emailLayout(
      subject,
      `${greeting(isEn)}
${paragraph(isEn
        ? `You asked for a new password. Enter this code in the app and then choose your new password. The code is valid for ${validity(isEn)}.`
        : `Je hebt gevraagd om een nieuw wachtwoord. Vul deze code in de app in en kies daarna je nieuwe wachtwoord. De code is ${validity(isEn)} geldig.`)}
${codeBlock(isEn ? "Your code" : "Je code", code)}
${smallPrint(isEn ? "Didn't ask for this? You don't need to do anything. Your password stays the same." : "Heb je dit niet gevraagd? Dan hoef je niets te doen. Je wachtwoord blijft hetzelfde.")}
${signOff(isEn)}`,
      isEn,
    ),
  };
}

/** Invitation for the other parent (sheet rows 121–122). */
export function invitationEmail(opts: {
  senderName: string;
  inviteLink: string;
  childrenNames: string[];
  isEn: boolean;
}): { subject: string; html: string } {
  const { isEn } = opts;
  const naam = (opts.senderName || "").trim() || (isEn ? "A parent" : "Een ouder");
  const kinderen = joinNames(opts.childrenNames, isEn) || (isEn ? "the children" : "de kinderen");
  const n = escapeHtml(naam), k = escapeHtml(kinderen);
  return {
    subject: subjectLine(isEn ? `${naam} invites you to Ouderschap & Co` : `${naam} nodigt je uit voor Ouderschap & Co`),
    html: emailLayout(
      isEn ? "Invitation" : "Uitnodiging",
      `${greeting(isEn)}
${paragraph(isEn
        ? `${n} invites you to Ouderschap &amp; Co, to arrange together what's needed for ${k}. Create an account and start at your own pace.`
        : `${n} nodigt je uit voor Ouderschap &amp; Co, om samen te regelen wat er voor ${k} nodig is. Maak een account en begin rustig.`)}
${paragraph(isEn
        ? "With Ouderschap &amp; Co you see your calendar, expenses and messages in one place. You choose what you share."
        : "Met Ouderschap &amp; Co zie je agenda, kosten en berichten op één plek. Jij kiest zelf wat je deelt.")}
${buttonWithFallback(isEn ? "Create account" : "Account maken", opts.inviteLink, isEn)}
${smallPrint(isEn ? `This invitation is valid for ${INVITE_TTL_DAYS} days.` : `Deze uitnodiging is ${INVITE_TTL_DAYS} dagen geldig.`)}
${notForYou(isEn)}
${signOff(isEn)}`,
      isEn,
    ),
  };
}
