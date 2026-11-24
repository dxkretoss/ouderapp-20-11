// E-mail for a circle member (grandparent, babysitter, ...) invited by a parent. Link: <origin>/uitnodiging?t=<token>.
import { escapeHtml } from "./util.ts";

export function caregiverInviteEmail(opts: {
  recipientName: string;
  senderName: string;
  role: string;
  childrenNames: string[];
  inviteLink: string;
  isEn: boolean;
}): { subject: string; html: string } {
  const { isEn } = opts;
  const name = escapeHtml(opts.recipientName);
  const sender = escapeHtml(opts.senderName || (isEn ? "A parent" : "Een ouder"));
  const kids = escapeHtml(opts.childrenNames.join(isEn ? " and " : " en "));
  const link = escapeHtml(opts.inviteLink);
  const t = isEn
    ? {
      subject: `${opts.senderName || "A parent"} invited you to the circle around ${opts.childrenNames.join(" and ")}`,
      head: "Family circle",
      greeting: `Hi ${name}`,
      intro: `<strong>${sender}</strong> invited you to the circle around <strong>${kids}</strong> on Ouderschap &amp; Co.`,
      what: "You only see what the parents chose to share with you. Messages between the parents and their finances always stay private.",
      cta: "View invitation",
      fallback: "Button not working? Copy and open this link in your browser:",
      login: "The link alone gives no access: you sign in (or create an account) and confirm first.",
    }
    : {
      subject: `${opts.senderName || "Een ouder"} heeft je uitgenodigd voor de kring rond ${opts.childrenNames.join(" en ")}`,
      head: "Kring rond de kinderen",
      greeting: `Hoi ${name}`,
      intro: `<strong>${sender}</strong> heeft je uitgenodigd voor de kring rond <strong>${kids}</strong> in Ouderschap &amp; Co.`,
      what: "Je ziet alleen wat de ouders bewust met je delen. Berichten tussen de ouders en hun financiën blijven altijd privé.",
      cta: "Bekijk uitnodiging",
      fallback: "Werkt de knop niet? Kopieer en open deze link in je browser:",
      login: "De link alleen geeft geen toegang: je logt eerst in (of maakt een account) en bevestigt.",
    };
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:32px 16px;background-color:#f7f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <div style="max-width:540px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e7e2d9;">
    <div style="background:linear-gradient(135deg,#2c4a3e 0%,#1e332b 100%);padding:32px 28px;text-align:center;">
      <h1 style="margin:0;font-family:Georgia,serif;font-size:30px;font-weight:600;color:#ffffff;">Ouderschap &amp; Co.</h1>
      <p style="margin:6px 0 0;color:#d4e4dc;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">${t.head}</p>
    </div>
    <div style="padding:32px 28px;">
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#2c4a3e;">${t.greeting}</h2>
      <p style="margin:0 0 14px;color:#4b5563;font-size:15px;line-height:1.6;">${t.intro}</p>
      <p style="margin:0 0 14px;color:#4b5563;font-size:14px;line-height:1.6;">${t.what}</p>
      <div style="text-align:center;margin:30px 0 26px;">
        <a href="${link}" style="display:inline-block;background-color:#2c4a3e;color:#ffffff;padding:15px 36px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">${t.cta}</a>
      </div>
      <div style="background:#faf8f5;border-radius:12px;padding:14px 16px;border:1px dashed #d5cfc5;font-size:12px;color:#6b7280;line-height:1.5;">
        ${t.fallback}<br><a href="${link}" style="color:#2c4a3e;font-weight:600;word-break:break-all;">${link}</a>
      </div>
      <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;line-height:1.5;">${t.login}</p>
    </div>
  </div>
</body></html>`;
  return { subject: t.subject, html };
}
