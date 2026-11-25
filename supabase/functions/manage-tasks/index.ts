// manage-tasks — shared tasks ("Taken") and belongings ("Spullen") of the signed-in parent's family.
// Session required for every action. Scope: see _shared/practical-scope.ts.
// Assigning a task to the other parent is a REQUEST: it only becomes theirs when they accept.
// Every change is written to the family audit (append-only); requests and answers notify the other parent.
import { db } from "../_shared/db.ts";
import { check, err, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { optDate, optText, reqText, requireUuid } from "../_shared/util.ts";
import { addressFor, assertChildren, caregiverAccess, canSee, Family, familyFor, familyMembers } from "../_shared/practical-scope.ts";
import { logAudit, notify } from "../_shared/practical-audit.ts";

const RECURRENCE = ["eenmalig", "wekelijks", "maandelijks", "jaarlijks", "aangepast"];
const CONTACT = ["nog-te-regelen", "contact-opgenomen", "wacht-op-reactie", "afgerond", "niet-mogelijk"];
const ITEM_TYPES = ["mee", "vast", "dubbel", "terug"];
const TASK_COLS =
  "id, user_id, title, child_ids, assignee_id, requested_to, requested_by, deadline, recurrence, recurrence_text, reminder_days, is_completed, completed_at, completed_by, contact_status, source, other_parent_id, created_at, updated_at, deleted_at";
const BELONGING_COLS =
  "id, created_by, child_id, name, item_type, location_parent_id, location_text, responsible_id, is_done, other_parent_id, created_at, updated_at, deleted_at";

type Row = Record<string, any>;

function taskOut(r: Row) {
  return {
    id: r.id,
    title: r.title,
    child_ids: r.child_ids ?? [],
    created_by: r.user_id,
    assignee_id: r.assignee_id ?? null,
    requested_to: r.requested_to ?? null,
    requested_by: r.requested_by ?? null,
    deadline: r.deadline ?? null,
    recurrence: r.recurrence || "eenmalig",
    recurrence_text: r.recurrence_text ?? null,
    reminder_days: r.reminder_days || 0,
    is_completed: !!r.is_completed,
    completed_at: r.completed_at ?? null,
    completed_by: r.completed_by ?? null,
    contact_status: r.contact_status ?? null,
    source: r.source ?? {},
    other_parent_id: r.other_parent_id ?? null,
    is_shared: !!r.other_parent_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function belongingOut(r: Row) {
  return {
    id: r.id,
    created_by: r.created_by,
    child_id: r.child_id,
    name: r.name,
    item_type: r.item_type,
    location_parent_id: r.location_parent_id ?? null,
    location_text: r.location_text ?? null,
    responsible_id: r.responsible_id ?? null,
    is_done: !!r.is_done,
    other_parent_id: r.other_parent_id ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

async function loadTask(f: Family, id: unknown): Promise<Row> {
  const taskId = requireUuid(id, "task_id");
  const row = check(await db().from("tasks").select(TASK_COLS).eq("id", taskId).maybeSingle(), "load task") as Row | null;
  if (!row || row.deleted_at || !canSee(f, row.user_id, row.child_ids, false, row.other_parent_id ?? null)) throw err.notFound("Task not found");
  return row;
}

async function saveTask(id: string, patch: Row): Promise<Row> {
  return check(
    await db().from("tasks").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select(TASK_COLS).single(),
    "update task",
  ) as Row;
}

/** The other parent a task is shared with (its pair); asking someone else is impossible. */
function otherFor(row: Row): string {
  if (!row.other_parent_id) throw err.validation("NO_CO_PARENT: invite the other parent first");
  return row.other_parent_id;
}

function optSource(v: unknown) {
  if (v === undefined || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw err.validation("source must be an object");
  const s = v as Row;
  const out: Row = {};
  for (const k of ["bericht_id", "gesprek_id", "afspraak_id"]) {
    if (s[k] !== undefined && s[k] !== null && s[k] !== "") out[k] = String(s[k]).slice(0, 120);
  }
  return out;
}

const audit = (me: string, row: Row, action: "CREATED" | "UPDATED" | "DELETED", changes?: Array<{ veld: string; oud?: string | null; nieuw?: string | null }>, meta?: Row) =>
  logAudit({ actorId: me, section: "taak", entityId: row.id, label: row.title, action, changes, childIds: row.child_ids ?? [], familyIds: [row.user_id, row.other_parent_id], meta });

/** A soft-deleted task of the caller (only the creator can bring it back). Same not-found as any other miss. */
async function loadDeletedTask(me: string, id: unknown): Promise<Row> {
  const taskId = requireUuid(id, "task_id");
  const row = check(await db().from("tasks").select(TASK_COLS).eq("id", taskId).maybeSingle(), "load deleted task") as Row | null;
  if (!row || !row.deleted_at || row.user_id !== me) throw err.notFound("Task not found");
  return row;
}

function readRecurrence(v: unknown): string {
  const r = v ?? "eenmalig";
  if (typeof r !== "string" || !RECURRENCE.includes(r)) throw err.validation("recurrence is invalid");
  return r;
}

function readReminder(v: unknown): number {
  const n = v === undefined || v === null ? 0 : Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 60) throw err.validation("reminder_days is invalid");
  return n;
}

async function loadBelonging(f: Family, id: unknown, deleted = false): Promise<Row> {
  const bId = requireUuid(id, "belonging_id");
  const row = check(await db().from("belongings").select(BELONGING_COLS).eq("id", bId).maybeSingle(), "load belonging") as Row | null;
  if (!row || !!row.deleted_at !== deleted || !canSee(f, row.created_by, [row.child_id], false, row.other_parent_id ?? null) || !f.childIds.includes(row.child_id)) {
    throw err.notFound("Belonging not found");
  }
  return row;
}

/** location: { parent_id } (the caller or a co-parent) | { text } | null */
function optLocation(f: Family, v: unknown): { location_parent_id: string | null; location_text: string | null } | undefined {
  if (v === undefined) return undefined;
  if (v === null) return { location_parent_id: null, location_text: null };
  if (typeof v !== "object" || Array.isArray(v)) throw err.validation("location must be an object");
  const l = v as Row;
  if (l.parent_id) {
    const id = requireUuid(l.parent_id, "location.parent_id");
    if (!familyMembers(f).includes(id)) throw err.validation("location.parent_id must be a parent of this family");
    return { location_parent_id: id, location_text: null };
  }
  const text = optText(l.text, "location.text", 120);
  return { location_parent_id: null, location_text: text ?? null };
}

Deno.serve(serveActions("manage-tasks", {
  async list(req) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const members = familyMembers(f);
    const [tasks, belongings] = await Promise.all([
      db().from("tasks").select(TASK_COLS).in("user_id", members).is("deleted_at", null).order("created_at", { ascending: false }).limit(1000),
      f.childIds.length
        ? db().from("belongings").select(BELONGING_COLS).in("child_id", f.childIds).is("deleted_at", null).order("created_at", { ascending: true }).limit(1000)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const t = (check(tasks, "list tasks") ?? []) as Row[];
    const b = (check(belongings, "list belongings") ?? []) as Row[];
    // Caregiver sessions: read-only view of tasks/belongings of the children they were granted ("taken" / "spullen").
    const cg = await caregiverAccess(me.id);
    const cgTaskKids = cg.view("taken").filter((k) => !f.childIds.includes(k));
    const cgItemKids = cg.view("spullen").filter((k) => !f.childIds.includes(k));
    const [ct, cb] = await Promise.all([
      // Only SHARED items (other_parent_id set): private ("Alleen jij") items never reach the circle.
      cgTaskKids.length ? db().from("tasks").select(TASK_COLS).overlaps("child_ids", cgTaskKids).not("other_parent_id", "is", null).is("deleted_at", null).limit(500) : Promise.resolve({ data: [], error: null }),
      cgItemKids.length ? db().from("belongings").select(BELONGING_COLS).in("child_id", cgItemKids).not("other_parent_id", "is", null).is("deleted_at", null).limit(500) : Promise.resolve({ data: [], error: null }),
    ]);
    const circleTasks = ((check(ct, "caregiver tasks") ?? []) as Row[]).filter((r) => !!r.other_parent_id && (r.child_ids ?? []).length && r.child_ids.every((k: string) => cgTaskKids.includes(k)));
    const circleItems = ((check(cb, "caregiver belongings") ?? []) as Row[]).filter((r) => !!r.other_parent_id);
    return ok({
      tasks: [...t.filter((r) => canSee(f, r.user_id, r.child_ids, false, r.other_parent_id ?? null)), ...circleTasks].map(taskOut),
      belongings: [...b.filter((r) => canSee(f, r.created_by, [r.child_id], false, r.other_parent_id ?? null)), ...circleItems].map(belongingOut),
    });
  },

  async create(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const title = reqText(body.title, "title", 300);
    const childIds = assertChildren(f, body.child_ids);
    const source = optSource(body.source);
    // Message-derived tasks are deduplicated by their source ids.
    if (source.bericht_id && source.gesprek_id) {
      const dup = check(
        await db().from("tasks").select(TASK_COLS).in("user_id", familyMembers(f)).is("deleted_at", null)
          .eq("source->>bericht_id", source.bericht_id).eq("source->>gesprek_id", source.gesprek_id).limit(1),
        "dedupe task",
      ) as Row[] | null;
      if (dup?.length && canSee(f, dup[0].user_id, dup[0].child_ids, false, dup[0].other_parent_id ?? null)) return ok({ task: taskOut(dup[0]), duplicate: true });
    }
    const assign = body.assign ?? "me";
    if (!["me", "other", "none"].includes(assign)) throw err.validation("assign must be me, other or none");
    // A task asked of the other parent is always shared with that parent.
    if (assign === "other" && body.shared === false) throw err.validation("A task asked of the other parent must be shared");
    const recurrence = readRecurrence(body.recurrence);
    const reminder = readReminder(body.reminder_days);
    const contact = body.contact_status ?? null;
    if (contact !== null && !CONTACT.includes(contact)) throw err.validation("contact_status is invalid");
    // Shared with the other parent of these children (all of them), unless shared: false ("Alleen jij").
    const pair = addressFor(f, childIds, body.shared === false, body.other_parent_id);
    if (assign === "other" && !pair) throw err.validation("NO_CO_PARENT: invite the other parent first");
    const other = assign === "other" ? pair : null;
    const row = check(
      await db().from("tasks").insert({
        user_id: me.id,
        other_parent_id: pair,
        title,
        child_id: childIds.length === 1 ? childIds[0] : null,
        child_ids: childIds,
        assignee_id: assign === "me" ? me.id : null,
        assigned_to: assign === "me" ? me.id : null,
        requested_to: other,
        requested_by: other ? me.id : null,
        transfer_to: other,
        deadline: optDate(body.deadline, "deadline") ?? null,
        recurrence,
        recurrence_text: recurrence === "aangepast" ? optText(body.recurrence_text, "recurrence_text", 120) ?? null : null,
        reminder_days: reminder,
        contact_status: contact,
        source,
      }).select(TASK_COLS).single(),
      "create task",
    ) as Row;
    const auditId = await audit(me.id, row, "CREATED", undefined, other ? { type: "Taak gevraagd" } : undefined);
    if (other) {
      await notify({ to: other, actorId: me.id, type: "task", category: "actie", key: "taakGevraagd", params: { titel: title }, link: "/taken", entityType: "task", entityId: row.id, childIds, auditId });
    }
    return ok({ task: taskOut(row) });
  },

  async toggle(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadTask(f, body.task_id);
    if (row.requested_to) throw err.validation("Task is waiting for an answer");
    const done = body.done === undefined ? !row.is_completed : !!body.done;
    if (done === !!row.is_completed) return ok({ task: taskOut(row) });
    const patch: Row = { is_completed: done, completed_at: done ? new Date().toISOString() : null, completed_by: done ? me.id : null };
    if (row.contact_status) patch.contact_status = done ? "afgerond" : "nog-te-regelen";
    const upd = await saveTask(row.id, patch);
    await audit(me.id, upd, "UPDATED", [{ veld: "gedaan", oud: row.is_completed ? "ja" : "nee", nieuw: done ? "ja" : "nee" }]);
    return ok({ task: taskOut(upd) });
  },

  async "set-contact-status"(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadTask(f, body.task_id);
    if (row.requested_to) throw err.validation("Task is waiting for an answer");
    if (!CONTACT.includes(body.contact_status)) throw err.validation("contact_status is invalid");
    const done = body.contact_status === "afgerond";
    const upd = await saveTask(row.id, {
      contact_status: body.contact_status,
      is_completed: done,
      completed_at: done ? new Date().toISOString() : null,
      completed_by: done ? me.id : null,
    });
    await audit(me.id, upd, "UPDATED", [{ veld: "contactStatus", oud: row.contact_status, nieuw: body.contact_status }]);
    return ok({ task: taskOut(upd) });
  },

  /** "Ik doe het": take an unowned task, or accept a request addressed to you. */
  async claim(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadTask(f, body.task_id);
    if (row.is_completed) throw err.validation("Task is already done");
    if (row.requested_to && row.requested_to !== me.id) throw err.validation("Task is waiting for the other parent");
    if (row.assignee_id && row.assignee_id !== me.id && !row.requested_to) throw err.validation("Task already has an owner");
    if (row.assignee_id === me.id && !row.requested_to) return ok({ task: taskOut(row) });
    const wasRequest = row.requested_to === me.id;
    const upd = await saveTask(row.id, { assignee_id: me.id, assigned_to: me.id, requested_to: null, requested_by: null, transfer_to: null });
    const auditId = await audit(me.id, upd, "UPDATED", [{ veld: "verantwoordelijke", oud: row.assignee_id, nieuw: me.id }], { type: "Taak opnieuw toegewezen" });
    if (wasRequest && row.requested_by) {
      await notify({ to: row.requested_by, actorId: me.id, type: "task", category: "wijziging", key: "taakGeaccepteerd", params: { titel: row.title }, link: "/taken", entityType: "task", entityId: row.id, childIds: row.child_ids, auditId });
    }
    return ok({ task: taskOut(upd) });
  },

  /** Ask the other parent to take the task. Stays pending until they answer. */
  async request(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadTask(f, body.task_id);
    if (row.is_completed) throw err.validation("Task is already done");
    if (row.requested_to) throw err.validation("A request is already open");
    const other = otherFor(row);
    if (row.assignee_id === other) throw err.validation("Task already belongs to the other parent");
    const upd = await saveTask(row.id, { requested_to: other, requested_by: me.id, transfer_to: other });
    const auditId = await audit(me.id, upd, "UPDATED", [{ veld: "gevraagdAan", oud: null, nieuw: other }], { type: "Taak gevraagd" });
    await notify({ to: other, actorId: me.id, type: "task", category: "actie", key: "taakGevraagd", params: { titel: row.title }, link: "/taken", entityType: "task", entityId: row.id, childIds: row.child_ids, auditId });
    return ok({ task: taskOut(upd) });
  },

  async "cancel-request"(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadTask(f, body.task_id);
    if (!row.requested_to) return ok({ task: taskOut(row) });
    if (row.requested_by !== me.id) throw err.forbidden("Only the parent who asked can withdraw the request");
    const upd = await saveTask(row.id, { requested_to: null, requested_by: null, transfer_to: null });
    const auditId = await audit(me.id, upd, "UPDATED", [{ veld: "gevraagdAan", oud: row.requested_to, nieuw: null }], { type: "Verzoek ingetrokken" });
    await notify({ to: row.requested_to, actorId: me.id, type: "task", category: "info", key: "taakVerzoekIngetrokken", params: { titel: row.title }, link: "/taken", entityType: "task", entityId: row.id, childIds: row.child_ids, auditId });
    return ok({ task: taskOut(upd) });
  },

  /** Only the asked parent answers. accept=true is the same as claim. */
  async "respond-request"(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadTask(f, body.task_id);
    if (row.requested_to !== me.id) throw err.forbidden("This request is not addressed to you");
    if (body.accept) {
      const upd = await saveTask(row.id, { assignee_id: me.id, assigned_to: me.id, requested_to: null, requested_by: null, transfer_to: null });
      const auditId = await audit(me.id, upd, "UPDATED", [{ veld: "verantwoordelijke", oud: row.assignee_id, nieuw: me.id }], { type: "Taak opnieuw toegewezen" });
      await notify({ to: row.requested_by, actorId: me.id, type: "task", category: "wijziging", key: "taakGeaccepteerd", params: { titel: row.title }, link: "/taken", entityType: "task", entityId: row.id, childIds: row.child_ids, auditId });
      return ok({ task: taskOut(upd) });
    }
    const upd = await saveTask(row.id, { requested_to: null, requested_by: null, transfer_to: null });
    const auditId = await audit(me.id, upd, "UPDATED", [{ veld: "gevraagdAan", oud: me.id, nieuw: null }], { type: "Verzoek afgewezen" });
    await notify({ to: row.requested_by, actorId: me.id, type: "task", category: "wijziging", key: "taakAfgewezen", params: { titel: row.title }, link: "/taken", entityType: "task", entityId: row.id, childIds: row.child_ids, auditId });
    return ok({ task: taskOut(upd) });
  },

  /**
   * Edit (creator only): title, children, deadline, recurrence, reminder and "Alleen jij" / "Gedeeld".
   * Sharing goes to the other parent of the children (or the chosen co-parent without children).
   * While the task is asked of / owned by the other parent it must stay shared with that parent.
   */
  async update(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadTask(f, body.task_id);
    if (row.user_id !== me.id) throw err.forbidden("Only the parent who created the task can change it");
    const patch: Row = {};
    const changes: Array<{ veld: string; oud: string | null; nieuw: string | null }> = [];
    if (body.title !== undefined) {
      const title = reqText(body.title, "title", 300);
      if (title !== row.title) { patch.title = title; changes.push({ veld: "titel", oud: row.title, nieuw: title }); }
    }
    let childIds: string[] = row.child_ids ?? [];
    if (body.child_ids !== undefined) {
      childIds = assertChildren(f, body.child_ids);
      const same = childIds.length === (row.child_ids ?? []).length && childIds.every((c) => (row.child_ids ?? []).includes(c));
      if (!same) {
        Object.assign(patch, { child_ids: childIds, child_id: childIds.length === 1 ? childIds[0] : null });
        // Counts only (no ids in the history); a swap of one child for another still registers as a change.
        const oud = String((row.child_ids ?? []).length);
        changes.push({ veld: "kinderen", oud: oud === String(childIds.length) ? null : oud, nieuw: String(childIds.length) });
      }
    }
    if (body.deadline !== undefined) {
      const deadline = optDate(body.deadline, "deadline") ?? null;
      if (deadline !== (row.deadline ?? null)) { patch.deadline = deadline; changes.push({ veld: "deadline", oud: row.deadline ?? null, nieuw: deadline }); }
    }
    if (body.recurrence !== undefined) {
      const recurrence = readRecurrence(body.recurrence);
      const text = recurrence === "aangepast" ? optText(body.recurrence_text, "recurrence_text", 120) ?? null : null;
      if (recurrence !== (row.recurrence || "eenmalig") || text !== (row.recurrence_text ?? null)) {
        Object.assign(patch, { recurrence, recurrence_text: text });
        changes.push({ veld: "herhaling", oud: row.recurrence || "eenmalig", nieuw: recurrence });
      }
    }
    if (body.reminder_days !== undefined) {
      const reminder = readReminder(body.reminder_days);
      if (reminder !== (row.reminder_days || 0)) { patch.reminder_days = reminder; changes.push({ veld: "herinnering", oud: String(row.reminder_days || 0), nieuw: String(reminder) }); }
    }
    // Who the task is shared with follows from (new) children + the sharing choice.
    const wantShared = typeof body.shared === "boolean" ? body.shared : !!row.other_parent_id;
    if (typeof body.shared === "boolean" || patch.child_ids) {
      // Without children the task stays with its current co-parent unless another one is chosen.
      const requested = body.other_parent_id ?? (childIds.length ? undefined : row.other_parent_id ?? undefined);
      const pair = addressFor(f, childIds, !wantShared, requested);
      const bound = row.requested_to || (row.assignee_id && row.assignee_id !== me.id ? row.assignee_id : null);
      if (bound && pair !== bound) throw err.validation("A task asked of or taken by the other parent must stay shared with that parent");
      if (pair !== (row.other_parent_id ?? null)) {
        patch.other_parent_id = pair;
        changes.push({ veld: "zichtbaar", oud: row.other_parent_id ? "gedeeld" : "alleen-jij", nieuw: pair ? "gedeeld" : "alleen-jij" });
      }
    }
    if (!changes.length) return ok({ task: taskOut(row) });
    const upd = await saveTask(row.id, patch);
    const auditId = await audit(me.id, upd, "UPDATED", changes);
    // Only the parent it is (still) shared with hears about it; a task that just became private notifies nobody.
    if (upd.other_parent_id && upd.other_parent_id === row.other_parent_id) {
      await notify({ to: upd.other_parent_id, actorId: me.id, type: "task", category: "wijziging", key: "taakGewijzigd", params: { titel: upd.title }, link: "/taken", entityType: "task", entityId: row.id, childIds: upd.child_ids ?? [], auditId });
    } else if (upd.other_parent_id) {
      await notify({ to: upd.other_parent_id, actorId: me.id, type: "task", category: "info", key: "taakGedeeld", params: { titel: upd.title }, link: "/taken", entityType: "task", entityId: row.id, childIds: upd.child_ids ?? [], auditId });
    }
    return ok({ task: taskOut(upd) });
  },

  /** Soft delete by the creator; an open request is withdrawn with it. `restore` undoes it. */
  async delete(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadTask(f, body.task_id);
    if (row.user_id !== me.id) throw err.forbidden("Only the parent who created the task can remove it");
    const upd = await saveTask(row.id, { deleted_at: new Date().toISOString(), requested_to: null, requested_by: null, transfer_to: null });
    const auditId = await audit(me.id, upd, "DELETED");
    if (row.other_parent_id) {
      await notify({ to: row.other_parent_id, actorId: me.id, type: "task", category: "info", key: "taakVerwijderd", params: { titel: row.title }, link: "/taken", entityType: "task", entityId: row.id, childIds: row.child_ids ?? [], auditId });
    }
    return ok({});
  },

  async restore(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadDeletedTask(me.id, body.task_id);
    // The pair may have changed meanwhile (co-parent disconnected): re-check who it can be shared with.
    let pair: string | null = row.other_parent_id ?? null;
    if (pair && !f.coParents.includes(pair)) pair = null;
    const childIds = (row.child_ids ?? []).filter((c: string) => f.childIds.includes(c));
    const upd = await saveTask(row.id, { deleted_at: null, other_parent_id: pair, child_ids: childIds, child_id: childIds.length === 1 ? childIds[0] : null });
    await audit(me.id, upd, "UPDATED", [{ veld: "verwijderd", oud: "ja", nieuw: "nee" }]);
    return ok({ task: taskOut(upd) });
  },

  // ---------------- belongings ----------------
  async "belonging-create"(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const childId = requireUuid(body.child_id, "child_id");
    if (!f.childIds.includes(childId)) throw err.notFound("Child not found");
    const name = reqText(body.name, "name", 200);
    const type = body.item_type ?? "mee";
    if (!ITEM_TYPES.includes(type)) throw err.validation("item_type is invalid");
    const loc = optLocation(f, body.location) ?? { location_parent_id: null, location_text: null };
    const row = check(
      await db().from("belongings").insert({ created_by: me.id, child_id: childId, name, item_type: type, ...loc, other_parent_id: addressFor(f, [childId], body.shared === false, body.other_parent_id) }).select(BELONGING_COLS).single(),
      "create belonging",
    ) as Row;
    await logAudit({ actorId: me.id, section: "spul", entityId: row.id, label: name, action: "CREATED", childIds: [childId], familyIds: [me.id, row.other_parent_id], meta: { type: "Spul" } });
    return ok({ belonging: belongingOut(row) });
  },

  async "belonging-update"(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadBelonging(f, body.belonging_id);
    const patch: Row = {};
    const changes: Array<{ veld: string; oud: string | null; nieuw: string | null }> = [];
    if (body.name !== undefined) {
      const name = reqText(body.name, "name", 200);
      if (name !== row.name) { patch.name = name; changes.push({ veld: "naam", oud: row.name, nieuw: name }); }
    }
    if (body.item_type !== undefined) {
      if (!ITEM_TYPES.includes(body.item_type)) throw err.validation("item_type is invalid");
      if (body.item_type !== row.item_type) { patch.item_type = body.item_type; changes.push({ veld: "meewisselen", oud: row.item_type, nieuw: body.item_type }); }
    }
    const loc = optLocation(f, body.location);
    if (loc && (loc.location_parent_id !== row.location_parent_id || loc.location_text !== row.location_text)) {
      Object.assign(patch, loc);
      changes.push({ veld: "plek", oud: row.location_parent_id ?? row.location_text, nieuw: loc.location_parent_id ?? loc.location_text });
    }
    if (body.responsible === "me" && row.responsible_id !== me.id) {
      patch.responsible_id = me.id;
      changes.push({ veld: "wieRegelt", oud: row.responsible_id, nieuw: me.id });
    }
    if (body.is_done !== undefined && !!body.is_done !== !!row.is_done) {
      patch.is_done = !!body.is_done;
      changes.push({ veld: "terug", oud: row.is_done ? "ja" : "nee", nieuw: body.is_done ? "ja" : "nee" });
    }
    // "Alleen jij" <-> "Gedeeld": only the creator decides; shared goes to the other parent of the child.
    if (typeof body.shared === "boolean") {
      if (row.created_by !== me.id) throw err.forbidden("Only the parent who added it can change who sees it");
      const pair = addressFor(f, [row.child_id], !body.shared);
      if (pair !== (row.other_parent_id ?? null)) {
        patch.other_parent_id = pair;
        changes.push({ veld: "zichtbaar", oud: row.other_parent_id ? "gedeeld" : "alleen-jij", nieuw: pair ? "gedeeld" : "alleen-jij" });
      }
    }
    if (!changes.length) return ok({ belonging: belongingOut(row) });
    const upd = check(await db().from("belongings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", row.id).select(BELONGING_COLS).single(), "update belonging") as Row;
    await logAudit({ actorId: me.id, section: "spul", entityId: row.id, label: upd.name, action: "UPDATED", changes, childIds: [row.child_id], familyIds: [row.created_by, upd.other_parent_id ?? row.other_parent_id], meta: { type: "Spul" } });
    return ok({ belonging: belongingOut(upd) });
  },

  /** Soft delete: the creator, or the other parent of a shared item (both use the same list). */
  async "belonging-delete"(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadBelonging(f, body.belonging_id);
    if (row.created_by !== me.id && row.other_parent_id !== me.id) throw err.notFound("Belonging not found");
    check(await db().from("belongings").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id), "delete belonging");
    await logAudit({ actorId: me.id, section: "spul", entityId: row.id, label: row.name, action: "DELETED", childIds: [row.child_id], familyIds: [row.created_by, row.other_parent_id], meta: { type: "Spul" } });
    return ok({});
  },

  /** Undo of belonging-delete (same people who could delete it). */
  async "belonging-restore"(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await loadBelonging(f, body.belonging_id, true);
    if (row.created_by !== me.id && row.other_parent_id !== me.id) throw err.notFound("Belonging not found");
    const upd = check(await db().from("belongings").update({ deleted_at: null, updated_at: new Date().toISOString() }).eq("id", row.id).select(BELONGING_COLS).single(), "restore belonging") as Row;
    await logAudit({ actorId: me.id, section: "spul", entityId: row.id, label: row.name, action: "UPDATED", changes: [{ veld: "verwijderd", oud: "ja", nieuw: "nee" }], childIds: [row.child_id], familyIds: [row.created_by, row.other_parent_id], meta: { type: "Spul" } });
    return ok({ belonging: belongingOut(upd) });
  },
}));
