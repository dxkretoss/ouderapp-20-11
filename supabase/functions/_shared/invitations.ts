// Invitation helpers shared by send-invitation and accept-invitation.
export const OPEN_INVITE_STATUSES = ["sent", "pending", "viewed"];

export function isInviteExpired(r: { status: string; expires_at: string | null }): boolean {
  return OPEN_INVITE_STATUSES.includes(r.status) && !!r.expires_at && new Date(r.expires_at).getTime() <= Date.now();
}

/** API "Invitation" shape (never includes the token). */
export function toApiInvitation(r: Record<string, any>) {
  return {
    id: r.id,
    to_email: r.to_email,
    status: isInviteExpired(r as any) ? "expired" : r.status,
    child_ids: Array.isArray(r.child_ids) ? r.child_ids : [],
    created_at: r.created_at,
    expires_at: r.expires_at,
    accepted_at: r.accepted_at ?? null,
    // e-mail delivery: "sent" | "failed" | null (unknown for older invitations)
    email_status: r.email_status ?? null,
    email_sent_at: r.email_sent_at ?? null,
  };
}

/** "anna@gmail.com" -> "a***@gmail.com" */
export function maskEmail(email: string): string {
  const [local, domain] = String(email || "").split("@");
  return `${(local || "").slice(0, 1)}***@${domain || ""}`;
}
