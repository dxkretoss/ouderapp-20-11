// manage-agreements — the ONE source for agreements between parents (versions, proposals, per-parent
// approval, append-only history), decisions ("Beslissingen") and the half-yearly evaluations.
// Session required for every action.
//
// Agreement lifecycle
// - A new agreement, a change and a stop are PROPOSALS: the proposer approves implicitly; it only takes
//   effect when every party (both parents) approved. Only the other parent answers
//   (akkoord / ander voorstel / niet akkoord / meer tijd); the proposer may withdraw while it is open.
// - One open proposal per agreement. Final statuses (stopped, withdrawn, rejected) never change again.
// - A parent without a connected co-parent (solo) records agreements directly (AGENTS: nobody waits on a
//   parent who is not there).
// - `history` is append-only and never copied into audit_events. Every write bumps `revision`
//   (the client uses it as a stale-version guard).
import { db } from "../_shared/db.ts";
import { check, err, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { optText, reqText, requireUuid } from "../_shared/util.ts";
import { assertChildren, canSee, Family, familyFor, familyMembers, otherParents } from "../_shared/practical-scope.ts";
import { logAudit, notify } from "../_shared/practical-audit.ts";

const TOPICS = ["Halen & brengen", "Planning & wijzigingen", "Contact", "Kinderen", "School & opvang", "Gezondheid", "Kosten", "Vakanties", "Overig"];
const DECISION_KINDS = ["Schoolkeuze", "Medisch", "Verhuizing", "Verdeling van de week", "Opvoeding"];
const DECISION_MODES = ["goedkeuring", "mening", "informatie"];
const COLS =
  "id, user_id, child_ids, title, description, category, agreement_type, status, proposal, versions, agreed_by, agreed_at, valid_from, stopped_at, source, is_safety, is_formal, evaluation_date, link_note, history, revision, decision_kind, decision_mode, responses, created_at, updated_at";

type Row = Record<string, any>;
const now = () => new Date().toISOString();

function out(r: Row) {
  return {
    id: r.id,
    type: r.agreement_type === "decision" ? "decision" : "agreement",
    title: r.title,
    text: r.description,
    topic: r.category,
    child_ids: r.child_ids ?? [],
    status: r.status === "pending" && r.agreement_type !== "decision" ? "pending" : r.status,
    created_by: r.user_id,
    proposal: r.proposal ?? null,
    versions: r.versions ?? [],
    agreed_by: r.agreed_by ?? [],
    agreed_at: r.agreed_at ?? null,
    valid_from: r.valid_from ?? null,
    stopped_at: r.stopped_at ?? null,
    source: r.source ?? null,
    is_safety: !!r.is_safety,
    is_formal: !!r.is_formal,
    evaluation_date: r.evaluation_date ?? null,
    link_note: r.link_note ?? null,
    history: r.history ?? [],
    revision: r.revision ?? 1,
    decision_kind: r.decision_kind ?? null,
    decision_mode: r.decision_mode ?? null,
    responses: r.responses ?? {},
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

async function load(f: Family, id: unknown, type: "agreement" | "decision"): Promise<Row> {
  const rid = requireUuid(id, type === "decision" ? "decision_id" : "agreement_id");
  const row = check(await db().from("parent_agreements").select(COLS).eq("id", rid).maybeSingle(), "load agreement") as Row | null;
  const isDecision = row?.agreement_type === "decision";
  if (!row || isDecision !== (type === "decision") || !canSee(f, row.user_id, row.child_ids)) throw err.notFound("Not found");
  return row;
}

/** Optimistic concurrency: the update only applies when nobody wrote in between. */
async function save(row: Row, patch: Row): Promise<Row> {
  const res = check(
    await db().from("parent_agreements")
      .update({ ...patch, revision: (row.revision ?? 1) + 1, updated_at: now() })
      .eq("id", row.id).eq("revision", row.revision ?? 1)
      .select(COLS),
    "update agreement",
  ) as Row[] | null;
  if (!res?.length) throw err.validation("STALE: the agreement changed in the meantime");
  return res[0];
}

const hist = (row: Row, e: Row) => [...(row.history ?? []), { at: now(), ...e }];

function checkRevision(row: Row, body: Row) {
  if (body.revision !== undefined && Number(body.revision) !== Number(row.revision ?? 1)) {
    throw err.validation("STALE: the agreement changed in the meantime");
  }
}

/** Parents who must agree: the caller + the co-parent(s) sharing the children. */
const partiesFor = (f: Family, childIds: string[]) => [f.userId, ...otherParents(f, childIds)];

/** Applies a fully approved proposal. */
function apply(row: Row, p: Row, by: string): Row {
  const at = now();
  if (p.kind === "nieuw") {
    return { description: p.text ?? row.description, status: "active", proposal: null, agreed_by: p.parties, agreed_at: at, valid_from: at,
      history: hist(row, { by, type: "gaat-in" }) };
  }
  if (p.kind === "stoppen") {
    return { status: "stopped", stopped_at: at, proposal: null, history: hist(row, { by, type: "gestopt" }) };
  }
  return { description: p.text, proposal: null, valid_from: at, agreed_by: p.parties,
    versions: [{ text: row.description, until: at }, ...(row.versions ?? [])],
    history: hist(row, { by, type: "nieuwe-versie", oud: row.description, nieuw: p.text }) };
}

const notifyOthers = (me: string, to: string[], key: string, row: Row, category: "actie" | "wijziging" | "info") =>
  notify({ to, actorId: me, type: "agreement", category, key, params: { titel: row.title }, link: `/afspraken?afspraak=${row.id}`, entityType: "agreement", entityId: row.id, childIds: row.child_ids ?? [] });

function optSourceDoc(v: unknown): Row | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) throw err.validation("source must be an object");
  const s = v as Row;
  return { kind: "document", label: optText(s.label, "source.label", 300) ?? null, document: true };
}

/** Creates a new agreement: a proposal, or directly recorded for a solo parent. */
async function createAgreement(me: string, f: Family, b: { title: string; text: string; topic: string; childIds: string[]; source: Row | null; historyType: string; document?: string | null }) {
  const parties = partiesFor(f, b.childIds);
  const solo = parties.length < 2;
  const at = now();
  const base: Row = {
    user_id: me,
    child_id: b.childIds.length === 1 ? b.childIds[0] : null,
    child_ids: b.childIds,
    title: b.title,
    description: b.text,
    category: b.topic,
    agreement_type: "agreement",
    source: b.source,
    proposed_by: me,
    revision: 1,
  };
  const row = solo
    ? { ...base, status: "active", agreed_by: [me], agreed_at: at, valid_from: at, proposal: null,
        history: [{ at, by: me, type: b.historyType === "geimporteerd" ? "geimporteerd" : "vastgelegd", document: b.document ?? null }] }
    : { ...base, status: "pending", proposal: { kind: "nieuw", by: me, at, text: b.text, parties, approvals: { [me]: true } },
        history: [{ at, by: me, type: b.historyType, document: b.document ?? null }] };
  const ins = check(await db().from("parent_agreements").insert(row).select(COLS).single(), "create agreement") as Row;
  if (!solo) await notifyOthers(me, parties.filter((p) => p !== me), "afspraakVoorstel", ins, "actie");
  return ins;
}

function readTopic(v: unknown): string {
  const t = v ?? "Overig";
  if (typeof t !== "string" || !TOPICS.includes(t)) throw err.validation("topic is invalid");
  return t;
}

Deno.serve(serveActions("manage-agreements", {
  async list(req) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const rows = (check(
      await db().from("parent_agreements").select(COLS).in("user_id", familyMembers(f)).order("created_at", { ascending: true }).limit(1000),
      "list agreements",
    ) ?? []) as Row[];
    const mine = rows.filter((r) => canSee(f, r.user_id, r.child_ids));
    return ok({
      agreements: mine.filter((r) => r.agreement_type !== "decision").map(out),
      decisions: mine.filter((r) => r.agreement_type === "decision").map(out),
    });
  },

  async "propose-new"(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await createAgreement(me.id, f, {
      title: reqText(body.title, "title", 200),
      text: reqText(body.text, "text", 4000),
      topic: readTopic(body.topic),
      childIds: assertChildren(f, body.child_ids),
      source: null,
      historyType: "voorgesteld-nieuw",
    });
    return ok({ agreement: out(row) });
  },

  /** Confirmed items from the parenting-plan import (the original document stays unchanged). */
  async import(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) throw err.validation("items must be a non-empty array (max 50)");
    const document = optText(body.document, "document", 200) ?? null;
    const childIds = assertChildren(f, body.child_ids);
    const created: Row[] = [];
    for (const it of body.items) {
      created.push(await createAgreement(me.id, f, {
        title: reqText(it?.title, "title", 200),
        text: reqText(it?.text, "text", 4000),
        topic: it?.topic && TOPICS.includes(it.topic) ? it.topic : "Overig",
        childIds,
        source: optSourceDoc({ label: [document, it?.source_label].filter(Boolean).join(": ") }),
        historyType: "geimporteerd",
        document,
      }));
    }
    return ok({ agreements: created.map(out) });
  },

  async "propose-change"(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await load(f, body.agreement_id, "agreement");
    checkRevision(row, body);
    if (row.status !== "active") throw err.validation("Only an active agreement can be changed");
    if (row.proposal) throw err.validation("PROPOSAL_OPEN: there is already an open proposal");
    const stop = body.kind === "stoppen";
    const text = stop ? null : reqText(body.text, "text", 4000);
    if (!stop && text === row.description) throw err.validation("The text did not change");
    const parties = partiesFor(f, row.child_ids ?? []);
    const at = now();
    const p = { kind: stop ? "stoppen" : "wijziging", by: me.id, at, text, parties, approvals: { [me.id]: true } };
    const h = hist(row, { by: me.id, type: stop ? "voorgesteld-stoppen" : "voorgesteld-wijziging", tekst: text });
    if (parties.length < 2) {
      const upd = await save(row, { ...apply({ ...row, history: h }, p, me.id) });
      return ok({ agreement: out(upd) });
    }
    const upd = await save(row, { proposal: p, history: h });
    await notifyOthers(me.id, parties.filter((x) => x !== me.id), stop ? "afspraakStopVoorstel" : "afspraakWijzigVoorstel", row, "actie");
    return ok({ agreement: out(upd) });
  },

  /** response: akkoord | ander (text) | niet | meer-tijd. Only a party who is NOT the proposer. */
  async respond(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await load(f, body.agreement_id, "agreement");
    checkRevision(row, body);
    const p = row.proposal as Row | null;
    if (!p) throw err.validation("There is no open proposal");
    if (p.by === me.id) throw err.forbidden("You cannot answer your own proposal");
    if (!(p.parties ?? []).includes(me.id) || p.approvals?.[me.id]) throw err.forbidden("Your answer is not needed");
    const response = body.response;
    let upd: Row;
    if (response === "akkoord") {
      const next: Row = { ...p, approvals: { ...(p.approvals ?? {}), [me.id]: true } };
      const h = hist(row, { by: me.id, type: p.kind === "wijziging" ? "akkoord-wijziging" : "akkoord" });
      const allIn = (next.parties as string[]).every((x) => next.approvals[x]);
      upd = await save(row, allIn ? apply({ ...row, history: h }, next, me.id) : { proposal: next, history: h });
      await notifyOthers(me.id, [p.by], allIn ? "afspraakAkkoord" : "afspraakReactie", row, "wijziging");
    } else if (response === "ander") {
      const alt = reqText(body.text, "text", 4000);
      const next = { kind: p.kind === "stoppen" ? "wijziging" : p.kind, by: me.id, at: now(), text: alt, parties: p.parties, approvals: { [me.id]: true } };
      upd = await save(row, { proposal: next, history: hist(row, { by: me.id, type: "ander-voorstel", alt, origineel: p.text ?? row.description }) });
      await notifyOthers(me.id, [p.by], "afspraakAnderVoorstel", row, "actie");
    } else if (response === "niet") {
      upd = await save(row, { proposal: null, status: p.kind === "nieuw" ? "rejected" : row.status,
        history: hist(row, { by: me.id, type: p.kind === "nieuw" ? "niet-akkoord-nieuw" : "niet-akkoord-wijziging" }) });
      await notifyOthers(me.id, [p.by], "afspraakNietAkkoord", row, "wijziging");
    } else if (response === "meer-tijd") {
      upd = await save(row, { proposal: { ...p, more_time: { by: me.id, at: now() } }, history: hist(row, { by: me.id, type: "meer-tijd" }) });
      await notifyOthers(me.id, [p.by], "afspraakMeerTijd", row, "info");
    } else {
      throw err.validation("response must be akkoord, ander, niet or meer-tijd");
    }
    return ok({ agreement: out(upd) });
  },

  /** Only the proposer, while it is still open. The existing agreement stays as it was. */
  async withdraw(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await load(f, body.agreement_id, "agreement");
    const p = row.proposal as Row | null;
    if (!p) throw err.validation("There is no open proposal");
    if (p.by !== me.id) throw err.forbidden("Only the proposer can withdraw");
    const upd = await save(row, { proposal: null, status: p.kind === "nieuw" ? "withdrawn" : row.status,
      history: hist(row, { by: me.id, type: "ingetrokken", tekst: p.text ?? row.description }) });
    await notifyOthers(me.id, (p.parties ?? []).filter((x: string) => x !== me.id), "afspraakIngetrokken", row, "info");
    return ok({ agreement: out(upd) });
  },

  // ---------------- decisions ----------------
  async "decision-create"(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const title = reqText(body.title, "title", 200);
    if (!DECISION_KINDS.includes(body.kind)) throw err.validation("kind is invalid");
    const mode = body.mode ?? "goedkeuring";
    if (!DECISION_MODES.includes(mode)) throw err.validation("mode is invalid");
    const childIds = assertChildren(f, body.child_id ? [body.child_id] : []);
    if (childIds.length !== 1) throw err.validation("child_id is required");
    const others = otherParents(f, childIds);
    const at = now();
    const row = check(
      await db().from("parent_agreements").insert({
        user_id: me.id, child_id: childIds[0], child_ids: childIds, title, description: title, category: "Kinderen",
        agreement_type: "decision", decision_kind: body.kind, decision_mode: mode,
        status: mode === "goedkeuring" && others.length ? "pending" : "active",
        responses: mode === "goedkeuring" ? { [me.id]: "akkoord" } : {},
        history: [{ at, by: me.id, type: mode === "goedkeuring" ? "voorstel" : "gedeeld" }],
        proposed_by: me.id, revision: 1,
      }).select(COLS).single(),
      "create decision",
    ) as Row;
    const auditId = await logAudit({ actorId: me.id, section: "besluit", entityId: row.id, label: title, action: "CREATED", childIds, meta: { soort: body.kind } });
    await notify({ to: others, actorId: me.id, type: "decision", category: mode === "goedkeuring" ? "actie" : "info", key: mode === "goedkeuring" ? "besluitVoorstel" : "besluitGedeeld",
      params: { titel: title }, link: "/beslissingen", entityType: "decision", entityId: row.id, childIds, auditId });
    return ok({ decision: out(row) });
  },

  /** response: akkoord | niet. Only the other parent, once (final). */
  async "decision-respond"(req, body) {
    const me = await requireUser(req);
    const f = await familyFor(me.id);
    const row = await load(f, body.decision_id, "decision");
    if (row.decision_mode !== "goedkeuring") throw err.validation("This decision does not ask for approval");
    if (row.user_id === me.id) throw err.forbidden("You cannot answer your own decision");
    if ((row.responses ?? {})[me.id]) throw err.validation("You already answered");
    if (!["akkoord", "niet"].includes(body.response)) throw err.validation("response must be akkoord or niet");
    const responses = { ...(row.responses ?? {}), [me.id]: body.response };
    const upd = await save(row, { responses, status: body.response === "akkoord" ? "active" : "rejected", history: hist(row, { by: me.id, type: body.response }) });
    const auditId = await logAudit({ actorId: me.id, section: "besluit", entityId: row.id, label: row.title, action: body.response === "akkoord" ? "ACCEPTED" : "DECLINED",
      changes: [{ veld: "reactie", oud: null, nieuw: body.response }], childIds: row.child_ids ?? [] });
    await notify({ to: row.user_id, actorId: me.id, type: "decision", category: "wijziging", key: body.response === "akkoord" ? "besluitAkkoord" : "besluitNietAkkoord",
      params: { titel: row.title }, link: "/beslissingen", entityType: "decision", entityId: row.id, childIds: row.child_ids ?? [], auditId });
    return ok({ decision: out(upd) });
  },

  // ---------------- evaluations (content private to the author) ----------------
  async "evaluation-list"(req) {
    const me = await requireUser(req);
    const rows = (check(
      await db().from("evaluations").select("id, evaluated_on, answers, created_at").eq("user_id", me.id).order("evaluated_on", { ascending: false }).order("created_at", { ascending: false }).limit(24),
      "list evaluations",
    ) ?? []) as Row[];
    return ok({ evaluations: rows.map((r) => ({ id: r.id, date: r.evaluated_on, answers: r.answers ?? {}, created_at: r.created_at })) });
  },

  async "evaluation-save"(req, body) {
    const me = await requireUser(req);
    const a = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers : {};
    const answers: Row = {};
    for (const k of ["goed", "anders", "nodig", "zelf"]) answers[k] = optText(a[k], k, 2000) ?? "";
    answers.werkt = ["goed", "grotendeels", "niet"].includes(a.werkt) ? a.werkt : "";
    const row = check(
      await db().from("evaluations").insert({ user_id: me.id, answers }).select("id, evaluated_on, answers, created_at").single(),
      "save evaluation",
    ) as Row;
    return ok({ evaluation: { id: row.id, date: row.evaluated_on, answers: row.answers, created_at: row.created_at } });
  },
}));

