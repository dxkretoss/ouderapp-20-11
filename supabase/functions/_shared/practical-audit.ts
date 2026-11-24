// Shared, append-only family history + in-app notifications. Usable by EVERY domain's functions:
//
//   import { logAudit, notify } from "../_shared/practical-audit.ts";
//   const auditId = await logAudit({ actorId: user.id, section: "kosten", entityId: row.id,
//     label: row.description, action: "UPDATED", changes: [{ veld: "status", oud: "wacht", nieuw: "akkoord" }],
//     childIds: [row.child_id] });
//   await notify({ to: otherParentIds, actorId: user.id, type: "cost", category: "wijziging",
//     key: "kostAkkoord", params: { titel: row.description }, link: "/kosten", auditId, childIds: [row.child_id] });
//
// Rules
// - actorId is ALWAYS the session user (requireUser), never a body field.
// - Family scope is derived when reading (see log-audit "list"): the actor + the actor's active
//   co-parents who share one of childIds (or every co-parent when childIds is empty).
// - Private items (private agenda items, private moments, solo notes, Co chats) are never logged:
//   pass private: true (or simply don't call logAudit).
// - Never put private content, legal evidence or health details into label/changes/meta.
// - Agreements (parent_agreements) keep their own history; do not copy it into the audit.
// - Both helpers are best-effort: a failure is logged and never fails the caller's request.
import { db } from "./db.ts";

/** `section` values the client understands (labels in lib.auditStore.soort / lib.activiteiten.audit). */
export type AuditSection =
  | "afspraak" // agenda appointment
  | "schema" // care schedule / proposals
  | "besluit" // decision
  | "kosten"
  | "taak"
  | "spul"
  | "document"
  | "dossier" // export / profile records (not shown in Activities)
  | string;

export type AuditAction = "CREATED" | "UPDATED" | "DELETED" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPORTED";

export interface AuditChange {
  /** field id (translated by the client when it knows it) or a readable label */
  veld: string;
  oud?: string | null;
  nieuw?: string | null;
}

export interface AuditInput {
  actorId: string;
  section: AuditSection;
  entityId?: string | null;
  label?: string | null;
  action: AuditAction;
  changes?: AuditChange[];
  childIds?: string[];
  meta?: Record<string, string | number | boolean | null>;
  origin?: "server" | "client";
  private?: boolean;
}

const clip = (v: unknown, n: number) => (v === undefined || v === null ? null : String(v).slice(0, n));

/** Appends one event. Returns its id, or null when nothing was written (private / failure). */
export async function logAudit(e: AuditInput): Promise<string | null> {
  if (e.private || !e.actorId) return null;
  const changes = (e.changes ?? []).slice(0, 20).map((c) => ({ veld: clip(c.veld, 80) ?? "", oud: clip(c.oud, 500), nieuw: clip(c.nieuw, 500) }));
  if (changes.length && changes.every((c) => c.oud === c.nieuw)) return null;
  try {
    const { data, error } = await db()
      .from("audit_events")
      .insert({
        actor_id: e.actorId,
        entity_type: clip(e.section, 40),
        entity_id: clip(e.entityId, 120),
        action: e.action,
        item_label: clip(e.label, 300),
        changes,
        child_ids: [...new Set(e.childIds ?? [])],
        meta: e.meta ?? {},
        origin: e.origin ?? "server",
        // same shape as the agenda/costs helpers write, for readers of `details`
        details: { item_naam: clip(e.label, 300), kinderen: [...new Set(e.childIds ?? [])], ...(changes.length === 1 ? { wijziging: changes[0] } : changes.length ? { wijzigingen: changes } : {}), meta: e.meta ?? {} },
      })
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  } catch (err) {
    console.error("[audit] logAudit failed:", err);
    return null;
  }
}

export type NotifyCategory = "actie" | "wijziging" | "info";

export interface NotifyInput {
  to: string | string[];
  actorId: string;
  /** notifications.type (task, agreement, decision, moment, document, belonging, cost, care, vacation, budget, attendance, ...) */
  type: string;
  /** actie = requires a response, wijziging = something changed, info = informational */
  category: NotifyCategory;
  /** i18n key under lib.meldingen.<key> (titel/uitleg) — the client renders the text */
  key: string;
  /** short, non-sensitive values for the text (e.g. titel) */
  params?: Record<string, string | number>;
  link?: string;
  entityType?: string;
  entityId?: string;
  childIds?: string[];
  /** the audit event this notification belongs to (Activities shows only one of the two) */
  auditId?: string | null;
}

/** Creates an in-app notification for each recipient (never the actor). Best-effort. */
export async function notify(n: NotifyInput): Promise<void> {
  const to = [...new Set((Array.isArray(n.to) ? n.to : [n.to]).filter((x) => x && x !== n.actorId))];
  if (!to.length) return;
  const params = Object.fromEntries(Object.entries(n.params ?? {}).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 200) : v]));
  try {
    const { error } = await db().from("notifications").insert(
      to.map((user_id) => ({
        user_id,
        actor_id: n.actorId,
        type: n.type,
        category: n.category,
        title: n.key.slice(0, 80),
        message: "",
        link: n.link ?? null,
        entity_type: n.entityType ?? null,
        entity_id: n.entityId ?? null,
        child_ids: n.childIds ?? [],
        metadata: { params, audit_id: n.auditId ?? null },
      })),
    );
    if (error) throw error;
  } catch (err) {
    console.error("[notify] failed:", err);
  }
}
