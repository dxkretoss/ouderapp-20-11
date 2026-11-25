// E-mail for a circle member (grandparent, babysitter, ...) invited by a parent. Link: <origin>/uitnodiging?t=<token>.
// Texts: the client's standard e-mail texts (sheet rows 123–124; role "professional": rows 125–126).
import { escapeHtml } from "./util.ts";
import { buttonWithFallback, emailLayout, greeting, joinNames, notForYou, paragraph, signOff, smallPrint, subjectLine } from "./mail.ts";

export function caregiverInviteEmail(opts: {
  recipientName: string;
  senderName: string;
  role: string;
  childrenNames: string[];
  inviteLink: string;
  isEn: boolean;
}): { subject: string; html: string } {
  const { isEn } = opts;
  const naam = (opts.senderName || "").trim() || (isEn ? "A parent" : "Een ouder");
  const kinderen = joinNames(opts.childrenNames, isEn) || (isEn ? "the children" : "de kinderen");
  const n = escapeHtml(naam), k = escapeHtml(kinderen);
  const professional = /^\s*professional\s*$/i.test(opts.role ?? "");
  const login = smallPrint(isEn
    ? "The link alone gives no access: you sign in (or create an account) and confirm first."
    : "De link alleen geeft geen toegang: je logt eerst in (of maakt een account) en bevestigt.");

  if (professional) {
    return {
      subject: subjectLine(isEn ? `${naam} invites you as a professional` : `${naam} nodigt je uit als professional`),
      html: emailLayout(
        isEn ? "Invitation" : "Uitnodiging",
        `${greeting(isEn)}
${paragraph(isEn
          ? `${n} invites you as a professional at Ouderschap &amp; Co. You only see what both parents have shared with you.`
          : `${n} nodigt je uit als professional bij Ouderschap &amp; Co. Je ziet alleen wat beide ouders met je hebben gedeeld.`)}
${buttonWithFallback(isEn ? "View invitation" : "Uitnodiging bekijken", opts.inviteLink, isEn)}
${login}
${notForYou(isEn)}
${signOff(isEn)}`,
        isEn,
      ),
    };
  }

  return {
    subject: subjectLine(isEn ? `${naam} would love your help with ${kinderen}` : `${naam} vraagt of je wilt meehelpen met ${kinderen}`),
    html: emailLayout(
      isEn ? "Invitation" : "Uitnodiging",
      `${greeting(isEn)}
${paragraph(isEn
        ? `${n} would love your help with ${k}. You only see what ${n} shares with you.`
        : `${n} vraagt of je wilt meehelpen met ${k}. Je ziet alleen wat ${n} met je deelt.`)}
${buttonWithFallback(isEn ? "View invitation" : "Uitnodiging bekijken", opts.inviteLink, isEn)}
${login}
${notForYou(isEn)}
${signOff(isEn)}`,
      isEn,
    ),
  };
}
