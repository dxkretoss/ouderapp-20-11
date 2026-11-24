// log-audit — the family's append-only change history ("Terugkijken", Activities, PDF export).
// Session required. Events are written server-side by every domain's functions through
// _shared/practical-audit.ts (logAudit). This function reads them family-scoped and accepts
// client-reported events from stores that have no server function yet (origin "client";
// actor = session user, children checked). Nothing can be edited or deleted (DB trigger too).
import { db } from "../_shared/db.ts";
import { check, err, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { optText, reqText } from "../_shared/util.ts";
import { assertChildren, canSee, familyFor, familyMembers, namesFor } from "../_shared/practical-scope.ts";
import { logAudit } from "../_shared/practical-audit.ts";

const ACTIONS = ["CREATED", "UPDATED", "DELETED", "ACCEPTED", "DECLINED", "CANCELLED", "EXPORTED"];
const SECTIONS = ["afspraak", "schema", "besluit", "kosten", "taak", "spul", "spullen", "document", "dossier", "vakantie", "overdracht", "kring"];
const COLS = "id, actor_id, entity_type, entity_id, action, item_label, changes, child_ids, meta, origin, details, created_at";

type Row = Record<string, any>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * One shape for every writer: logAudit() fills the columns (item_label, changes, child_ids, meta); other domains'
 * helpers write `details` ({ item_naam, kinderen: child_ids, wijziging, meta, family_ids }). Columns win when set.
 */
export function normalize(r: Row): Row {
  const d = r.details && typeof r.details === "object" ? r.details : {};
  const kids = (r.child_ids ?? []).length ? r.child_ids : Array.isArray(d.kinderen) ? d.kinderen.filter((x: unknown) => typeof x === "string" && UUID_RE.test(x)) : [];
  const w = Array.isArray(r.changes) && r.changes.length ? r.changes : Array.isArray(d.wijzigingen) ? d.wijzigingen : d.wijziging && typeof d.wijziging === "object" ? [d.wijziging] : [];
  const meta = r.meta && Object.keys(r.meta).length ? r.meta : d.meta && typeof d.meta === "object" ? d.meta : {};
  return {
    ...r,
    child_ids: kids,
    item_label: r.item_label ?? d.item_naam ?? d.label ?? null,
    changes: w.map((c: Row) => ({ veld: String(c?.veld ?? ""), oud: c?.oud == null ? null : String(c.oud), nieuw: c?.nieuw == null ? null : String(c.nieuw) })),
    meta: Object.fromEntries(Object.entries(meta).filter(([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v))),
    family_ids: Array.isArray(d.family_ids) ? d.family_ids : null,
  };
}

function out(r: Row, names: Record<string, string>) {
  return {
    id: r.id,
    actor_id: r.actor_id,
    actor_name: names[r.actor_id] ?? "",
    section: r.entity_type,
    entity_id: r.entity_id ?? null,
    label: r.item_label ?? r.details?.label ?? "",
    action: r.action,
    changes: Array.isArray(r.changes) ? r.changes : [],
    child_ids: r.child_ids ?? [],
    meta: r.meta ?? {},
    origin: r.origin ?? "server",
    created_at: r.created_at,
  };
}

function cleanMeta(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const outp: Record<string, string> = {};
  for (const [k, x] of Object.entries(v as Row).slice(0, 12)) {
    if (x === null || x === undefined) continue;
    if (!["string", "number", "boolean"].includes(typeof x)) continue;
    outp[String(k).slice(0, 40)] = String(x).slice(0, 300);
  }
  return outp;
}

Deno.serve(serveActions("log-audit", {
  async list(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 1000);
    let q = db().from("audit_events").select(COLS).in("actor_id", familyMembers(f)).order("created_at", { ascending: false }).limit(limit);
    if (typeof body.since === "string" && !Number.isNaN(Date.parse(body.since))) q = q.gte("created_at", body.since);
    const rows = ((check(await q, "list audit") ?? []) as Row[]).map(normalize).filter((r) =>
      canSee(f, r.actor_id, r.child_ids) && (r.child_ids ?? []).every((id: string) => f.childIds.includes(id) || r.actor_id === me.id) &&
      // cost events carry their parent pair: only those two parents see them
      (!r.family_ids || r.family_ids.includes(me.id)));
    const names = await namesFor(rows.map((r) => r.actor_id));
    return ok({ events: rows.map((r) => out(r, names)) });
  },

  /** Client-reported event (stores without their own server function yet). */
  async log(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const section = String(body.section ?? "");
    if (!SECTIONS.includes(section)) throw err.validation("section is invalid");
    // `audit_action` (the body field `action` selects the function action)
    if (!ACTIONS.includes(body.audit_action)) throw err.validation("audit_action is invalid");
    const childIds = assertChildren(f, body.child_ids);
    const changes = Array.isArray(body.changes)
      ? body.changes.slice(0, 20).map((c: Row) => ({ veld: reqText(c?.veld, "changes.veld", 80), oud: optText(c?.oud === undefined ? null : String(c.oud), "changes.oud", 500) ?? null, nieuw: optText(c?.nieuw === undefined ? null : String(c.nieuw), "changes.nieuw", 500) ?? null }))
      : [];
    const id = await logAudit({
      actorId: me.id,
      section,
      entityId: optText(body.item_id, "item_id", 120) ?? null,
      label: optText(body.item_label, "item_label", 300) ?? null,
      action: body.audit_action,
      changes,
      childIds,
      meta: cleanMeta(body.meta),
      origin: "client",
    });
    if (!id) return ok({ event: null });
    const row = check(await db().from("audit_events").select(COLS).eq("id", id).single(), "load audit") as Row;
    return ok({ event: out(normalize(row), { [me.id]: me.name }) });
  },
}));
