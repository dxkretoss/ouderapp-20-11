// manage-expenses — costs of the signed-in parent's family (Phase 2, domain 3).
// Expenses (+ receipts, responses), budget proposals (+ append-only steps), settlements /
// payment requests, fixed costs and the shared family cost agreement.
// Every action: session user only; records are visible to the pair (creator + other_parent_id) only.
import { db } from "../_shared/db.ts";
import { check, err, ok, serveActions } from "../_shared/respond.ts";
import { requireUser } from "../_shared/session.ts";
import { HttpError } from "../_shared/respond.ts";
import { optDate, optText, reqText, requireUuid } from "../_shared/util.ts";
import { notify, NotifyCategory } from "../_shared/practical-audit.ts";
import { coParentsByChild, pairOf } from "../_shared/access.ts";

/**
 * The co-parent a pair-level action (cost agreement, settlement) is about: `partner_id` from the body
 * (must be an active co-parent), or the only co-parent. Several co-parents and none chosen → VALIDATION.
 */
function partnerIn(fam: Family, requested: unknown, required = true): string | null {
  if (typeof requested === "string" && requested) {
    if (!fam.partners.includes(requested)) throw err.notFound();
    return requested;
  }
  if (fam.partners.length === 1) return fam.partners[0];
  if (fam.partners.length > 1 && required) throw err.validation("Choose the other parent this is for");
  return null;
}
import {
  assertActivePartner, assertVisible, audit, childIdsInput, costPair, familyOf, Family, money, optFuture, otherOf,
  pairFilter, pct, r2, RECEIPTS_BUCKET, safePaymentLink, signReceipts, storeAttachment, validIban, visibleRows,
} from "../_shared/costs-family.ts";

type Row = Record<string, any>;

const CATEGORIES = ["School", "Sport", "Kleding", "Zorg", "Opvang", "Activiteiten", "Medisch", "Overig", "Bon", "Algemeen"];
const EXPENSE_STATUSES = ["wacht", "bevestigd", "betwist", "opgeslagen", "verrekend", "ingetrokken"];
const BUDGET_STATUS_OUT: Record<string, string> = {
  pending: "wacht", wacht: "wacht",
  counterproposal: "tegenvoorstel", tegenvoorstel: "tegenvoorstel",
  agreed: "akkoord", akkoord: "akkoord", afgesproken: "akkoord",
  rejected: "geweigerd", afgewezen: "geweigerd",
  spent: "uitgegeven", uitgegeven: "uitgegeven",
  withdrawn: "ingetrokken",
};
const PERIOD_OUT: Record<string, string> = { one_time: "eenmalig", monthly: "maand", yearly: "jaar" };
const OPEN_BUDGET = ["pending", "counterproposal", "wacht", "tegenvoorstel"];
const AGREED_BUDGET = ["agreed", "spent", "akkoord", "afgesproken", "uitgegeven"];
const OPEN_SETTLEMENT = ["open", "nog-te-betalen", "betaalverzoek-gedeeld", "aangegeven", "wacht-op-ontvanger"];
const SPLITS = ["standaard", "50", "anders", "volledig"];
const AGREEMENT_MODES = ["alleen", "50", "eigen", "per-uitgave"];
const SETTLE_MOMENTS = ["direct", "week", "maand", "kwartaal", "zelf"];

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const nowIso = () => new Date().toISOString();

// ------------------------------------------------------------------ loading + output shapes

async function loadExpense(me: string, id: unknown): Promise<Row> {
  const row = check(await db().from("expenses").select("*").eq("id", requireUuid(id, "expense_id")).maybeSingle(), "load expense") as Row | null;
  if (!row) throw err.notFound("Expense not found");
  await assertVisible(me, row.created_by ?? row.payer_id, row.other_parent_id, row.child_ids);
  return row;
}

async function loadBudget(me: string, id: unknown): Promise<Row> {
  const row = check(await db().from("budget_proposals").select("*").eq("id", requireUuid(id, "budget_id")).maybeSingle(), "load budget") as Row | null;
  if (!row) throw err.notFound("Budget not found");
  await assertVisible(me, row.created_by, row.other_parent_id, row.child_ids);
  return row;
}

async function loadSettlement(me: string, id: unknown): Promise<Row> {
  const row = check(await db().from("settlements").select("*").eq("id", requireUuid(id, "settlement_id")).maybeSingle(), "load settlement") as Row | null;
  if (!row || (row.payer_id !== me && row.receiver_id !== me)) throw err.notFound("Settlement not found");
  return row;
}

function expenseStatus(r: Row): string {
  if (EXPENSE_STATUSES.includes(r.status)) return r.status;
  return r.status === "draft" || r.is_draft ? "concept" : "opgeslagen";
}

async function expensesOut(rows: Row[]): Promise<Row[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [steps, atts] = await Promise.all([
    db().from("expense_steps").select("id, expense_id, actor_id, step_type, amount, payer_pct, note, review_at, created_at").in("expense_id", ids).order("created_at"),
    db().from("expense_attachments").select("id, expense_id, kind, storage_path, file_name, created_at").in("expense_id", ids).order("created_at"),
  ]);
  const stepRows = (check(steps, "expense steps") ?? []) as Row[];
  const attRows = (check(atts, "expense attachments") ?? []) as Row[];
  const urls = await signReceipts(attRows.map((a) => a.storage_path));
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    amount: Number(r.amount),
    date: r.date,
    category: r.category,
    child_ids: r.child_ids ?? [],
    paid_from: r.paid_from ?? "eigen",
    split: r.split_choice ?? null,
    payer_id: r.payer_id,
    payer_pct: Number(r.payer_share_percent ?? 50),
    created_by: r.created_by ?? r.payer_id,
    other_parent_id: r.other_parent_id ?? null,
    status: expenseStatus(r),
    turn_to_respond: r.status === "wacht" ? r.turn_to_respond ?? null : null,
    counter_pending: !!r.counter_pending,
    budget_id: r.budget_id ?? null,
    settlement_id: r.settlement_id ?? null,
    confirmed_by: r.confirmed_by ?? null,
    confirmed_at: r.confirmed_at ?? null,
    created_at: r.created_at,
    steps: stepRows.filter((s) => s.expense_id === r.id).map((s) => ({
      id: s.id, actor_id: s.actor_id, type: s.step_type, amount: num(s.amount), payer_pct: num(s.payer_pct), note: s.note ?? null, review_at: s.review_at ?? null, created_at: s.created_at,
    })),
    attachments: attRows.filter((a) => a.expense_id === r.id).map((a) => ({
      id: a.id, kind: a.kind, name: a.file_name, url: urls.get(a.storage_path) ?? null, created_at: a.created_at,
    })),
  }));
}

async function budgetsOut(rows: Row[]): Promise<Row[]> {
  if (!rows.length) return [];
  const steps = (check(
    await db().from("budget_steps").select("id, budget_id, actor_id, action_type, amount, creator_pct, note, review_at, created_at").in("budget_id", rows.map((r) => r.id)).order("created_at"),
    "budget steps",
  ) ?? []) as Row[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category && r.category !== "General" ? r.category : null,
    period: PERIOD_OUT[r.period] ?? "eenmalig",
    child_ids: r.child_ids ?? [],
    amount: Number(r.max_amount),
    creator_pct: Number(r.payer_share_percent ?? 50),
    created_by: r.created_by,
    other_parent_id: r.other_parent_id ?? null,
    status: BUDGET_STATUS_OUT[r.status] ?? "wacht",
    turn_to_respond: OPEN_BUDGET.includes(r.status) ? r.turn_to_respond ?? null : null,
    response_date: r.preferred_response_date ?? null,
    note: r.notes ?? null,
    terms: r.terms ?? null,
    valid_from: r.valid_from ?? null,
    valid_to: r.valid_to ?? null,
    expense_id: r.expense_id ?? null,
    created_at: r.created_at,
    steps: steps.filter((s) => s.budget_id === r.id).map((s) => ({
      id: s.id, actor_id: s.actor_id, type: s.action_type, amount: num(s.amount), creator_pct: num(s.creator_pct), note: s.note ?? null, review_at: s.review_at ?? null, created_at: s.created_at,
    })),
  }));
}

async function settlementsOut(rows: Row[]): Promise<Row[]> {
  if (!rows.length) return [];
  const steps = (check(
    await db().from("settlement_steps").select("settlement_id, actor_id, status, created_at").in("settlement_id", rows.map((r) => r.id)).order("created_at"),
    "settlement steps",
  ) ?? []) as Row[];
  return rows.map((r) => ({
    id: r.id,
    created_by: r.created_by,
    payer_id: r.payer_id,
    receiver_id: r.receiver_id,
    amount: Number(r.amount),
    period: r.period,
    status: r.status,
    payment_link: r.payment_link ?? null,
    description: r.description ?? null,
    bank_account_name: r.bank_account_name ?? null,
    bank_iban: r.bank_iban ?? null,
    reference_code: r.reference_code ?? null,
    expense_ids: r.expense_ids ?? [],
    created_at: r.created_at,
    requested_at: r.requested_at ?? null,
    paid_at: r.paid_at ?? null,
    confirmed_at: r.confirmed_at ?? null,
    finished_at: r.finished_at ?? null,
    steps: steps.filter((s) => s.settlement_id === r.id).map((s) => ({ actor_id: s.actor_id, status: s.status, created_at: s.created_at })),
  }));
}

function recurringOut(r: Row): Row {
  return {
    id: r.id, title: r.title, amount: Number(r.amount), interval: r.interval, child_ids: r.child_ids ?? [],
    creator_pct: Number(r.split_ratio ?? 50), created_by: r.created_by, other_parent_id: r.other_parent_id ?? null,
    shared: !!r.other_parent_id, category: r.category, created_at: r.created_at, updated_at: r.updated_at ?? null,
  };
}

async function potsOut(rows: Row[]): Promise<Row[]> {
  if (!rows.length) return [];
  const deps = (check(
    await db().from("savings_pot_deposits").select("id, pot_id, created_by, amount, date, note, created_at").in("pot_id", rows.map((r) => r.id)).order("date", { ascending: false }).order("created_at", { ascending: false }),
    "pot deposits",
  ) ?? []) as Row[];
  return rows.map((r) => {
    const mine = deps.filter((d) => d.pot_id === r.id);
    return {
      id: r.id, title: r.title, target_amount: Number(r.target_amount ?? 0),
      saved: r2(mine.reduce((n, d) => n + Number(d.amount), 0)),
      child_ids: r.child_ids ?? (r.child_id ? [r.child_id] : []),
      created_by: r.created_by, other_parent_id: r.other_parent_id ?? null, shared: !!r.other_parent_id,
      color: r.color ?? null, note: r.note ?? null, created_at: r.created_at, updated_at: r.updated_at ?? null,
      deposits: mine.map((d) => ({ id: d.id, amount: Number(d.amount), date: d.date, note: d.note === "start" ? null : d.note ?? null, created_by: d.created_by, created_at: d.created_at })),
    };
  });
}

function agreementOut(r: Row | null): Row | null {
  if (!r) return null;
  return {
    id: r.id, proposed_by: r.proposed_by, partner_id: r.partner_id ?? null, split_mode: r.split_mode, proposer_pct: Number(r.proposer_pct),
    settle_moment: r.settle_moment, approval_threshold: num(r.approval_threshold), status: r.status, decided_by: r.decided_by ?? null,
    decided_at: r.decided_at ?? null, created_at: r.created_at,
  };
}

/** Agreement rows of this family: the pair's rows, plus my own solo rows. Newest first. */
async function agreementRows(fam: Family, partner: string | null): Promise<Row[]> {
  const filters = [`and(proposed_by.eq.${fam.me},partner_id.is.null)`];
  if (partner) {
    filters.push(`and(proposed_by.eq.${fam.me},partner_id.eq.${partner})`, `and(proposed_by.eq.${partner},partner_id.eq.${fam.me})`);
  }
  return (check(
    await db().from("cost_agreements").select("*").or(filters.join(",")).order("created_at", { ascending: false }).limit(50),
    "load agreements",
  ) ?? []) as Row[];
}

/** The cost agreement with one co-parent (per pair: child 1 with A can have another split than child 2 with B). */
async function agreementState(fam: Family, partner: string | null = fam.partner): Promise<{ current: Row | null; pending: Row | null; pairCurrent: Row | null }> {
  const rows = await agreementRows(fam, partner);
  const pair = (r: Row) => !!partner && !!r.partner_id;
  const pairCurrent = rows.find((r) => pair(r) && r.status === "bevestigd") ?? null;
  const current = pairCurrent ?? rows.find((r) => !r.partner_id && r.status === "bevestigd") ?? null;
  const pending = rows.find((r) => pair(r) && r.status === "voorgesteld") ?? null;
  return { current, pending, pairCurrent };
}

// ------------------------------------------------------------------ budget coverage (server side of beoordeelKosten)

const periodKey = (period: string, date: string) => (period === "monthly" ? date.slice(0, 7) : period === "yearly" ? date.slice(0, 4) : "all");

/**
 * A waiting expense counts without a separate confirmation only when it is explicitly linked to an
 * agreed budget of the same pair and the linked expenses (oldest first, up to and including this one)
 * stay within the budget for that period. No guessing by subject on the server.
 */
async function coveredByBudget(e: Row, budgetCache: Map<string, Row | null>): Promise<boolean> {
  if (!e.budget_id || e.counter_pending) return false;
  if (!budgetCache.has(e.budget_id)) {
    budgetCache.set(e.budget_id, check(await db().from("budget_proposals").select("*").eq("id", e.budget_id).maybeSingle(), "coverage budget") as Row | null);
  }
  const b = budgetCache.get(e.budget_id);
  if (!b || !AGREED_BUDGET.includes(b.status)) return false;
  const pairOk = (b.created_by === e.created_by && b.other_parent_id === e.other_parent_id) || (b.created_by === e.other_parent_id && b.other_parent_id === e.created_by);
  if (!pairOk) return false;
  if ((b.valid_from && e.date < b.valid_from) || (b.valid_to && e.date > b.valid_to)) return false;
  const linked = (check(
    await db().from("expenses").select("id, amount, date, created_at, status").eq("budget_id", b.id).in("status", ["wacht", "bevestigd", "verrekend"]),
    "coverage linked",
  ) ?? []) as Row[];
  const key = periodKey(b.period, e.date);
  const before = linked
    .filter((x) => periodKey(b.period, x.date) === key)
    .sort((x, y) => String(x.date).localeCompare(String(y.date)) || String(x.created_at).localeCompare(String(y.created_at)));
  let used = 0;
  for (const x of before) {
    used += Number(x.amount);
    if (x.id === e.id) break;
  }
  return used <= Number(b.max_amount) + 0.001;
}

async function eligibleForSettlement(e: Row, me: string, partner: string, cache: Map<string, Row | null>): Promise<boolean> {
  const pair = (e.created_by === me && e.other_parent_id === partner) || (e.created_by === partner && e.other_parent_id === me);
  if (!pair || (e.paid_from ?? "eigen") !== "eigen" || e.settlement_id) return false;
  if (e.status === "bevestigd") return true;
  return e.status === "wacht" && await coveredByBudget(e, cache);
}

// ------------------------------------------------------------------ actions

async function overview(me: string): Promise<Row> {
  const fam = await familyOf(me);
  const [exp, bud, set, rec, agr, pots] = await Promise.all([
    db().from("expenses").select("*").or(pairFilter(me)).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
    db().from("budget_proposals").select("*").or(pairFilter(me)).order("created_at", { ascending: false }).limit(500),
    db().from("settlements").select("*").or(`payer_id.eq.${me},receiver_id.eq.${me}`).order("created_at", { ascending: false }).limit(200),
    db().from("recurring_expenses").select("*").or(pairFilter(me)).order("created_at").limit(200),
    agreementState(fam),
    db().from("savings_pots").select("*").or(pairFilter(me)).order("created_at").limit(200),
  ]);
  // One entry per co-parent: which of my children are shared with them and our agreement.
  const byChild = await coParentsByChild(me);
  const pairs = await Promise.all(fam.partners.map(async (p) => {
    const st = await agreementState(fam, p);
    return {
      partner_id: p,
      child_ids: [...byChild.entries()].filter(([, ps]) => ps.includes(p)).map(([c]) => c),
      agreement: { current: agreementOut(st.current), pending: agreementOut(st.pending) },
    };
  }));
  return {
    me,
    partner_id: fam.partner,
    partner_ids: fam.partners,
    pairs,
    // Per child: the other parent only sees records whose children are all still shared with them.
    expenses: await expensesOut(await visibleRows(me, ((check(exp, "list expenses") ?? []) as Row[]).filter((r) => !r.is_draft), (r) => r.created_by ?? r.payer_id)),
    budgets: await budgetsOut(await visibleRows(me, (check(bud, "list budgets") ?? []) as Row[])),
    settlements: await settlementsOut((check(set, "list settlements") ?? []) as Row[]),
    recurring: (await visibleRows(me, (check(rec, "list recurring") ?? []) as Row[])).map(recurringOut),
    pots: await potsOut(await visibleRows(me, ((check(pots, "list pots") ?? []) as Row[]).map((r) => ({ ...r, child_ids: r.child_ids ?? (r.child_id ? [r.child_id] : []) })))),
    agreement: { current: agreementOut(agr.current), pending: agreementOut(agr.pending) },
  };
}

async function addExpenseStep(expenseId: string, actor: string, type: string, extra: Row = {}): Promise<void> {
  check(await db().from("expense_steps").insert({ expense_id: expenseId, actor_id: actor, step_type: type, ...extra }), "insert expense step");
}

async function addBudgetStep(budgetId: string, actor: string, type: string, extra: Row = {}): Promise<void> {
  check(await db().from("budget_steps").insert({ budget_id: budgetId, actor_id: actor, action_type: type, ...extra }), "insert budget step");
}

async function createExpense(me: string, body: Row): Promise<Row> {
  const fam = await familyOf(me);
  const x = body.expense && typeof body.expense === "object" ? body.expense : {};
  const description = reqText(x.description, "description", 200);
  const amount = money(x.amount, "amount");
  const date = optDate(x.date, "date") ?? new Date().toISOString().slice(0, 10);
  const childIds = await childIdsInput(me, x.child_ids);
  const category = CATEGORIES.includes(x.category) ? x.category : "Overig";
  const paidFrom = x.paid_from === "kindrekening" ? "kindrekening" : "eigen";
  const split = SPLITS.includes(x.split) ? x.split : "standaard";
  let payerPct = split === "50" ? 50 : split === "volledig" ? 100 : pct(x.payer_pct ?? 50, "payer_pct");
  const comment = optText(x.comment, "comment", 1000);
  // "Alleen jij" (shared: false) stays with me; otherwise the other parent of these children.
  // shared undefined = older app version: shared when the children have another parent.
  // An expense against an agreed budget belongs to that budget's pair.
  const viaBudget = x.budget_id ? await loadBudget(me, x.budget_id) : null;
  const partner = viaBudget
    ? otherOf(me, viaBudget.created_by, viaBudget.other_parent_id)
    : await costPair(me, childIds, x.shared, x.other_parent_id);
  const agr = (await agreementState(fam, partner)).pairCurrent;
  const threshold = agr?.approval_threshold === null || agr?.approval_threshold === undefined ? null : Number(agr.approval_threshold);

  let budget: Row | null = null;
  if (x.budget_id) {
    budget = viaBudget as Row;
    if (!AGREED_BUDGET.includes(budget.status)) throw err.validation("Budget is not agreed");
    if (!partner) throw err.validation("Budget belongs to another family");
    // The children must belong to this budget (and to this pair): an expense for a child of another
    // co-parent can never be booked against this pair's budget.
    const budgetKids = (budget.child_ids ?? (budget.child_id ? [budget.child_id] : [])) as string[];
    if (budgetKids.length && childIds.some((c) => !budgetKids.includes(c))) {
      throw new HttpError(400, "MIXED_CHILDREN", "These children are not part of this budget");
    }
    if (childIds.length && (await pairOf(me, childIds, partner)) !== partner) {
      throw new HttpError(400, "MIXED_CHILDREN", "These children are not shared with this parent");
    }
    // The split comes from the budget.
    const creatorPct = Number(budget.payer_share_percent ?? 50);
    payerPct = budget.created_by === me ? creatorPct : 100 - creatorPct;
  }
  const hasReceipt = typeof body.receipt === "string" && body.receipt.length > 0;
  const shared = !!partner && split !== "volledig" && agr?.split_mode !== "alleen";
  if (threshold !== null && shared && amount > threshold) {
    if (!budget) throw new HttpError(400, "VALIDATION", "BUDGET_REQUIRED: above the approval threshold a budget proposal comes first");
    if (!hasReceipt) throw new HttpError(400, "VALIDATION", "RECEIPT_REQUIRED: a receipt is required above the approval threshold");
  }
  const status = !partner || paidFrom === "kindrekening" || split === "volledig" || agr?.split_mode === "alleen" ? "opgeslagen" : "wacht";

  const row = check(
    await db().from("expenses").insert({
      description, amount, date, category, child_ids: childIds, child_id: childIds[0] ?? null,
      payer_id: me, created_by: me, other_parent_id: partner,
      paid_from: paidFrom, split_choice: split,
      split_type: payerPct === 100 ? "sole_payer" : payerPct === 50 ? "50_50" : "custom",
      payer_share_percent: payerPct, other_share_percent: r2(100 - payerPct),
      budget_id: budget?.id ?? null,
      status, approval_status: status === "wacht" ? "pending" : "agreed",
      turn_to_respond: status === "wacht" ? partner : null,
      is_draft: false,
    }).select("*").single(),
    "insert expense",
  ) as Row;
  await addExpenseStep(row.id, me, "toegevoegd", { amount, payer_pct: payerPct });
  if (comment) await addExpenseStep(row.id, me, "opmerking", { note: comment });
  if (hasReceipt) await storeAttachment(me, row.id, "bon", body.receipt, body.receipt_name);
  if (typeof body.attachment === "string" && body.attachment) await storeAttachment(me, row.id, "bijlage", body.attachment, body.attachment_name);
  if (budget) {
    await addBudgetStep(budget.id, me, "werkelijke_uitgave", { amount });
    if ((budget.period ?? "one_time") === "one_time" && !budget.expense_id) {
      check(await db().from("budget_proposals").update({ status: "spent", expense_id: row.id, updated_at: nowIso() }).eq("id", budget.id), "budget spent");
    }
  }
  await audit(me, "kosten", row.id, "CREATED", [me, partner], { label: description, amount, status });
  return (await expensesOut([row]))[0];
}

async function respondExpense(me: string, body: Row): Promise<Row> {
  const fam = await familyOf(me);
  const e = await loadExpense(me, body.expense_id);
  if (e.status !== "wacht" || e.turn_to_respond !== me) throw err.forbidden("Not your turn to respond");
  const other = assertActivePartner(fam, otherOf(me, e.created_by, e.other_parent_id));
  const r = String(body.response ?? "");
  const patch: Row = { updated_at: nowIso() };
  if (r === "akkoord") {
    if (e.counter_pending) {
      const last = (check(
        await db().from("expense_steps").select("amount, payer_pct").eq("expense_id", e.id).eq("step_type", "ander_voorstel").order("created_at", { ascending: false }).limit(1),
        "last counter",
      ) ?? [])[0] as Row | undefined;
      if (last?.amount) patch.amount = Number(last.amount);
      if (last?.payer_pct !== null && last?.payer_pct !== undefined) {
        patch.payer_share_percent = Number(last.payer_pct);
        patch.other_share_percent = r2(100 - Number(last.payer_pct));
        patch.split_choice = "anders";
      }
    }
    Object.assign(patch, { status: "bevestigd", approval_status: "agreed", confirmed_by: me, confirmed_at: nowIso(), turn_to_respond: null, counter_pending: false });
    await addExpenseStep(e.id, me, "akkoord");
  } else if (r === "ander_voorstel") {
    const amount = body.amount === undefined || body.amount === null || body.amount === "" ? null : money(body.amount, "amount");
    const payerPct = body.payer_pct === undefined || body.payer_pct === null || body.payer_pct === "" ? null : pct(body.payer_pct, "payer_pct");
    const note = optText(body.note, "note", 1000) ?? null;
    if (amount === null && payerPct === null && !note) throw err.validation("A different amount, split or note is required");
    Object.assign(patch, { turn_to_respond: other, counter_pending: true, approval_status: "counterproposal" });
    await addExpenseStep(e.id, me, "ander_voorstel", { amount, payer_pct: payerPct, note });
  } else if (r === "niet_akkoord") {
    Object.assign(patch, { status: "betwist", approval_status: "rejected", turn_to_respond: null, counter_pending: false });
    await addExpenseStep(e.id, me, "niet_akkoord", { note: optText(body.note, "note", 1000) ?? null });
  } else if (r === "meer_tijd") {
    await addExpenseStep(e.id, me, "meer_tijd", { review_at: optFuture(body.review_at, "review_at") });
  } else throw err.validation("response must be akkoord, ander_voorstel, niet_akkoord or meer_tijd");
  const row = check(await db().from("expenses").update(patch).eq("id", e.id).select("*").single(), "update expense") as Row;
  await audit(me, "kosten", e.id, r === "akkoord" ? "ACCEPTED" : r === "niet_akkoord" ? "DECLINED" : "UPDATED", [me, other], { label: e.description, response: r });
  return (await expensesOut([row]))[0];
}

async function createBudget(me: string, body: Row): Promise<Row> {
  const x = body.budget && typeof body.budget === "object" ? body.budget : {};
  const title = reqText(x.title, "title", 200);
  const amount = money(x.amount, "amount");
  const myPct = pct(x.my_pct ?? 50, "my_pct");
  const childIds = await childIdsInput(me, x.child_ids);
  // A budget is always a proposal to the other parent of these children.
  const partner = await costPair(me, childIds, true, x.other_parent_id);
  if (!partner) throw err.forbidden("Invite the other parent first");
  const period = x.period === "maand" ? "monthly" : x.period === "jaar" ? "yearly" : "one_time";
  const row = check(
    await db().from("budget_proposals").insert({
      created_by: me, other_parent_id: partner, title, max_amount: amount,
      payer_share_percent: myPct, other_share_percent: r2(100 - myPct),
      child_ids: childIds, child_id: childIds[0] ?? null,
      category: CATEGORIES.includes(x.category) ? x.category : "General", period,
      status: "pending", turn_to_respond: partner,
      preferred_response_date: optDate(x.response_date, "response_date") ?? null,
      notes: optText(x.note, "note", 1000) ?? null,
    }).select("*").single(),
    "insert budget",
  ) as Row;
  await addBudgetStep(row.id, me, "voorstel", { amount, creator_pct: myPct });
  await audit(me, "budget", row.id, "CREATED", [me, partner], { label: title, amount });
  return (await budgetsOut([row]))[0];
}

const lastProposal = (steps: Row[]) => [...steps].reverse().find((s) => ["voorstel", "ander_voorstel", "wijzigingsvoorstel"].includes(s.action_type) && s.amount !== null);

async function budgetSteps(id: string): Promise<Row[]> {
  return (check(await db().from("budget_steps").select("*").eq("budget_id", id).order("created_at"), "budget steps") ?? []) as Row[];
}

async function respondBudget(me: string, body: Row): Promise<Row> {
  const fam = await familyOf(me);
  const b = await loadBudget(me, body.budget_id);
  if (!OPEN_BUDGET.includes(b.status) || b.turn_to_respond !== me) throw err.forbidden("Not your turn to respond");
  const other = assertActivePartner(fam, otherOf(me, b.created_by, b.other_parent_id));
  const steps = await budgetSteps(b.id);
  const wasAgreed = steps.some((s) => s.action_type === "akkoord");
  const r = String(body.response ?? "");
  const patch: Row = { updated_at: nowIso() };
  if (r === "ander_voorstel") {
    const amount = money(body.amount, "amount");
    const creatorPct = body.my_pct === undefined || body.my_pct === null ? null : (b.created_by === me ? pct(body.my_pct, "my_pct") : r2(100 - pct(body.my_pct, "my_pct")));
    Object.assign(patch, { status: "counterproposal", turn_to_respond: other });
    await addBudgetStep(b.id, me, "ander_voorstel", { amount, creator_pct: creatorPct });
  } else if (r === "akkoord") {
    const last = lastProposal(steps);
    const lastPct = [...steps].reverse().find((s) => s.creator_pct !== null && s.creator_pct !== undefined)?.creator_pct;
    const creatorPct = lastPct === undefined || lastPct === null ? Number(b.payer_share_percent) : Number(lastPct);
    Object.assign(patch, {
      status: b.expense_id ? "spent" : "agreed", turn_to_respond: null,
      max_amount: last ? Number(last.amount) : Number(b.max_amount),
      payer_share_percent: creatorPct, other_share_percent: r2(100 - creatorPct),
    });
    await addBudgetStep(b.id, me, "akkoord");
  } else if (r === "niet_akkoord") {
    Object.assign(patch, { status: wasAgreed ? (b.expense_id ? "spent" : "agreed") : "rejected", turn_to_respond: null });
    await addBudgetStep(b.id, me, "niet_akkoord");
  } else if (r === "meer_tijd") {
    await addBudgetStep(b.id, me, "meer_tijd", { review_at: optFuture(body.review_at, "review_at") });
  } else throw err.validation("response must be akkoord, ander_voorstel, niet_akkoord or meer_tijd");
  const row = check(await db().from("budget_proposals").update(patch).eq("id", b.id).select("*").single(), "update budget") as Row;
  await audit(me, "budget", b.id, r === "akkoord" ? "ACCEPTED" : r === "niet_akkoord" ? "DECLINED" : "UPDATED", [me, other], { label: b.title, response: r });
  return (await budgetsOut([row]))[0];
}

async function changeBudget(me: string, body: Row): Promise<Row> {
  const fam = await familyOf(me);
  const b = await loadBudget(me, body.budget_id);
  if (!AGREED_BUDGET.includes(b.status)) throw err.validation("Only an agreed budget can be changed");
  const other = assertActivePartner(fam, otherOf(me, b.created_by, b.other_parent_id));
  const amount = money(body.amount, "amount");
  const myPct = pct(body.my_pct ?? (b.created_by === me ? b.payer_share_percent : 100 - Number(b.payer_share_percent)), "my_pct");
  const creatorPct = b.created_by === me ? myPct : r2(100 - myPct);
  // The agreed amount and split stay in force until the other parent accepts.
  await addBudgetStep(b.id, me, "wijzigingsvoorstel", { amount, creator_pct: creatorPct });
  const row = check(await db().from("budget_proposals").update({ status: "counterproposal", turn_to_respond: other, updated_at: nowIso() }).eq("id", b.id).select("*").single(), "change budget") as Row;
  await audit(me, "budget", b.id, "UPDATED", [me, other], { label: b.title, change: amount });
  return (await budgetsOut([row]))[0];
}

async function withdrawBudget(me: string, body: Row): Promise<Row> {
  const b = await loadBudget(me, body.budget_id);
  if (!OPEN_BUDGET.includes(b.status) || b.turn_to_respond === me) throw err.forbidden("Only the waiting proposer can withdraw");
  const steps = await budgetSteps(b.id);
  const wasAgreed = steps.some((s) => s.action_type === "akkoord");
  await addBudgetStep(b.id, me, "ingetrokken");
  const row = check(
    await db().from("budget_proposals").update({ status: wasAgreed ? (b.expense_id ? "spent" : "agreed") : "withdrawn", turn_to_respond: null, updated_at: nowIso() }).eq("id", b.id).select("*").single(),
    "withdraw budget",
  ) as Row;
  await audit(me, "budget", b.id, "CANCELLED", [me, otherOf(me, b.created_by, b.other_parent_id)], { label: b.title });
  return (await budgetsOut([row]))[0];
}

async function remindBudget(me: string, body: Row): Promise<Row> {
  const fam = await familyOf(me);
  const b = await loadBudget(me, body.budget_id);
  if (!OPEN_BUDGET.includes(b.status) || b.turn_to_respond === me) throw err.forbidden("Only the waiting proposer can send a reminder");
  assertActivePartner(fam, otherOf(me, b.created_by, b.other_parent_id));
  const reminders = (await budgetSteps(b.id)).filter((s) => s.action_type === "herinnering");
  const last = reminders.at(-1);
  if (reminders.length >= 2 || (last && Date.now() - new Date(last.created_at).getTime() < 24 * 3600 * 1000)) {
    throw new HttpError(429, "RATE_LIMITED", "Reminder already sent");
  }
  await addBudgetStep(b.id, me, "herinnering");
  return (await budgetsOut([b]))[0];
}

async function startSettlement(me: string, body: Row): Promise<{ settlement: Row; created: boolean }> {
  const fam = await familyOf(me);
  // Settling is per co-parent: only expenses of this pair are included (eligibleForSettlement).
  const partner = partnerIn(fam, body.partner_id, false);
  if (!partner) throw err.forbidden(fam.partners.length ? "Choose the other parent this is for" : "Invite the other parent first");
  const ids = Array.isArray(body.expense_ids) ? [...new Set(body.expense_ids.map((v: unknown) => requireUuid(v, "expense_ids")))] : [];
  if (!ids.length || ids.length > 500) throw err.validation("expense_ids is required");
  // An open settlement that already reserves one of these expenses is returned instead of a duplicate.
  const open = (check(
    await db().from("settlements").select("*").or(`payer_id.eq.${me},receiver_id.eq.${me}`).in("status", OPEN_SETTLEMENT).overlaps("expense_ids", ids),
    "open settlements",
  ) ?? []) as Row[];
  if (open.length) return { settlement: (await settlementsOut([open[0]]))[0], created: false };
  const rows = await visibleRows(me, (check(await db().from("expenses").select("*").in("id", ids), "settlement expenses") ?? []) as Row[], (r) => r.created_by ?? r.payer_id);
  const cache = new Map<string, Row | null>();
  const eligible: Row[] = [];
  for (const e of rows) if (await eligibleForSettlement(e, me, partner, cache)) eligible.push(e);
  if (!eligible.length) throw err.validation("Nothing to settle");
  let net = 0; // > 0: the partner owes me
  for (const e of eligible) {
    const payerPct = Number(e.payer_share_percent ?? 50);
    const otherShare = r2((Number(e.amount) * (100 - payerPct)) / 100);
    net += e.payer_id === me ? otherShare : -otherShare;
  }
  net = r2(net);
  if (Math.abs(net) < 0.01) throw err.validation("Nothing to settle");
  // Atomic: one start per pair at a time (advisory lock in SQL); an open settlement that already holds
  // one of these expenses (e.g. a parallel double tap) is returned instead of a duplicate.
  const res = check(
    await db().rpc("start_settlement", {
      p_created_by: me,
      p_payer: net > 0 ? partner : me,
      p_receiver: net > 0 ? me : partner,
      p_amount: Math.abs(net),
      p_period: optText(body.period_label, "period_label", 60) ?? "maand",
      p_expense_ids: eligible.map((e) => e.id),
      p_reference: `OC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    }),
    "start settlement",
  ) as { id: string; created: boolean } | null;
  if (!res?.id) throw err.server("Settlement could not be started");
  const row = check(await db().from("settlements").select("*").eq("id", res.id).single(), "load new settlement") as Row;
  if (res.created) await audit(me, "verrekening", row.id, "CREATED", [me, partner], { amount: Math.abs(net), expense_ids: row.expense_ids });
  return { settlement: (await settlementsOut([row]))[0], created: !!res.created };
}

async function moveSettlement(me: string, s: Row, status: string, patch: Row = {}): Promise<Row> {
  const row = check(await db().from("settlements").update({ ...patch, status, updated_at: nowIso() }).eq("id", s.id).eq("status", s.status).select("*").maybeSingle(), "update settlement") as Row | null;
  if (!row) throw err.validation("Settlement changed in the meantime");
  check(await db().from("settlement_steps").insert({ settlement_id: s.id, actor_id: me, status }), "settlement step");
  await audit(me, "verrekening", s.id, "UPDATED", [s.payer_id, s.receiver_id], { status });
  return (await settlementsOut([row]))[0];
}

async function saveAgreement(me: string, body: Row): Promise<Row> {
  const fam = await familyOf(me);
  const mode = AGREEMENT_MODES.includes(body.split_mode) ? body.split_mode : null;
  if (!mode) throw err.validation("split_mode is invalid");
  const moment = SETTLE_MOMENTS.includes(body.settle_moment) ? body.settle_moment : "maand";
  const threshold = body.approval_threshold === undefined || body.approval_threshold === null || body.approval_threshold === "" ? null : money(body.approval_threshold, "approval_threshold", { allowZero: true });
  const base = { proposed_by: me, split_mode: mode, proposer_pct: pct(body.my_pct ?? 50, "my_pct"), settle_moment: moment, approval_threshold: threshold };
  // Per co-parent; with no co-parent (or `solo: true`) it is my own agreement for my Solo children.
  const partner = body.solo === true ? null : partnerIn(fam, body.partner_id);
  if (partner) {
    // One open proposal per pair: an earlier open proposal (from either parent) is replaced.
    check(
      await db().from("cost_agreements").update({ status: "vervangen" }).eq("status", "voorgesteld")
        .or(`and(proposed_by.eq.${me},partner_id.eq.${partner}),and(proposed_by.eq.${partner},partner_id.eq.${me})`),
      "replace agreement proposal",
    );
    check(await db().from("cost_agreements").insert({ ...base, partner_id: partner, status: "voorgesteld" }), "insert agreement");
  } else {
    check(await db().from("cost_agreements").insert({ ...base, partner_id: null, status: "bevestigd", decided_by: me, decided_at: nowIso() }), "insert agreement");
  }
  await audit(me, "kostenafspraak", me, partner ? "CREATED" : "UPDATED", [me, partner], { split_mode: mode, settle_moment: moment, approval_threshold: threshold });
  const st = await agreementState(fam, partner);
  return { current: agreementOut(st.current), pending: agreementOut(st.pending) };
}

async function respondAgreement(me: string, body: Row): Promise<Row> {
  const fam = await familyOf(me);
  const row = check(await db().from("cost_agreements").select("*").eq("id", requireUuid(body.agreement_id, "agreement_id")).maybeSingle(), "load agreement") as Row | null;
  if (!row || (row.proposed_by !== me && row.partner_id !== me)) throw err.notFound();
  if (row.partner_id !== me || row.status !== "voorgesteld") throw err.forbidden("Only the other parent can answer an open proposal");
  assertActivePartner(fam, row.proposed_by);
  const r = String(body.response ?? "");
  if (r !== "akkoord" && r !== "niet_akkoord") throw err.validation("response must be akkoord or niet_akkoord");
  check(
    await db().from("cost_agreements").update({ status: r === "akkoord" ? "bevestigd" : "afgewezen", decided_by: me, decided_at: nowIso() }).eq("id", row.id).eq("status", "voorgesteld"),
    "answer agreement",
  );
  await audit(me, "kostenafspraak", row.id, r === "akkoord" ? "ACCEPTED" : "DECLINED", [me, row.proposed_by]);
  const st = await agreementState(fam, row.proposed_by);
  return { current: agreementOut(st.current), pending: agreementOut(st.pending) };
}

// ------------------------------------------------------------------ expense edit / withdraw / delete / share / remind

const RESPONSE_STEPS = ["akkoord", "ander_voorstel", "niet_akkoord"];

/** Has the other parent of this expense already answered it (Akkoord / Ander voorstel / Niet akkoord)? */
async function otherResponded(e: Row): Promise<boolean> {
  const creator = e.created_by ?? e.payer_id;
  const rows = (check(
    await db().from("expense_steps").select("id, actor_id").eq("expense_id", e.id).in("step_type", RESPONSE_STEPS),
    "expense responses",
  ) ?? []) as Row[];
  return rows.some((s) => s.actor_id && s.actor_id !== creator);
}

/** Is this expense reserved by an open settlement (not finished yet)? */
async function reservedBySettlement(id: string): Promise<boolean> {
  const rows = (check(
    await db().from("settlements").select("id").in("status", OPEN_SETTLEMENT).contains("expense_ids", [id]).limit(1),
    "reserved expense",
  ) ?? []) as Row[];
  return rows.length > 0;
}

function assertCreator(me: string, e: Row): void {
  if ((e.created_by ?? e.payer_id) !== me) throw err.forbidden("Only the parent who added this expense can do this");
}

/** Status of a shared expense: needs the other parent's answer ("wacht") unless nothing is settled. */
function sharedStatus(partner: string | null, paidFrom: string, split: string, agr: Row | null): "wacht" | "opgeslagen" {
  return !partner || paidFrom === "kindrekening" || split === "volledig" || agr?.split_mode === "alleen" ? "opgeslagen" : "wacht";
}

/** A one-time budget that pointed at this expense becomes an agreed (unspent) budget again. */
async function releaseBudget(e: Row): Promise<void> {
  if (!e.budget_id) return;
  check(
    await db().from("budget_proposals").update({ status: "agreed", expense_id: null, updated_at: nowIso() }).eq("id", e.budget_id).eq("expense_id", e.id).in("status", ["spent", "uitgegeven"]),
    "release budget",
  );
}

/**
 * Edit by the creator. Private ("Alleen jij") expenses can always be fixed until settled; shared ones
 * only while the other parent has not answered and no settlement holds them.
 */
async function updateExpense(me: string, body: Row): Promise<Row> {
  const e = await loadExpense(me, body.expense_id);
  assertCreator(me, e);
  if (e.status === "verrekend" || e.settlement_id) throw err.forbidden("A settled expense cannot be changed");
  if (await reservedBySettlement(e.id)) throw err.forbidden("This expense is part of an open settlement");
  if (e.other_parent_id) {
    if (!["wacht", "opgeslagen"].includes(e.status)) throw err.forbidden("The other parent already responded");
    if (await otherResponded(e)) throw err.forbidden("The other parent already responded");
  }
  const x = body.expense && typeof body.expense === "object" ? body.expense : {};
  const description = x.description === undefined ? e.description : reqText(x.description, "description", 200);
  const amount = x.amount === undefined ? Number(e.amount) : money(x.amount, "amount");
  const date = x.date === undefined ? e.date : optDate(x.date, "date") ?? e.date;
  const category = x.category === undefined ? e.category : CATEGORIES.includes(x.category) ? x.category : "Overig";
  const paidFrom = x.paid_from === undefined ? (e.paid_from ?? "eigen") : x.paid_from === "kindrekening" ? "kindrekening" : "eigen";
  const childIds = x.child_ids === undefined ? (e.child_ids ?? []) as string[] : await childIdsInput(me, x.child_ids);
  let partner: string | null = e.other_parent_id ?? null;
  if (partner && x.child_ids !== undefined) {
    // A shared expense stays with the same other parent: the new children must be theirs too.
    const p = await costPair(me, childIds, true, partner);
    if (p !== partner) throw err.validation("These children are not shared with this parent");
  }
  let split = e.split_choice ?? "standaard";
  let payerPct = Number(e.payer_share_percent ?? 50);
  if (!e.budget_id && (x.split !== undefined || x.payer_pct !== undefined)) {
    split = SPLITS.includes(x.split) ? x.split : split;
    payerPct = split === "50" ? 50 : split === "volledig" ? 100 : pct(x.payer_pct ?? payerPct, "payer_pct");
  }
  const agr = partner ? (await agreementState(await familyOf(me), partner)).pairCurrent : null;
  const threshold = agr?.approval_threshold === null || agr?.approval_threshold === undefined ? null : Number(agr.approval_threshold);
  const shared = !!partner && split !== "volledig" && agr?.split_mode !== "alleen";
  if (threshold !== null && shared && amount > threshold && !e.budget_id) {
    throw new HttpError(400, "VALIDATION", "BUDGET_REQUIRED: above the approval threshold a budget proposal comes first");
  }
  const status = partner ? sharedStatus(partner, paidFrom, split, agr) : (e.status === "ingetrokken" ? "opgeslagen" : e.status);
  const row = check(
    await db().from("expenses").update({
      description, amount, date, category, child_ids: childIds, child_id: childIds[0] ?? null,
      paid_from: paidFrom, split_choice: split,
      split_type: payerPct === 100 ? "sole_payer" : payerPct === 50 ? "50_50" : "custom",
      payer_share_percent: payerPct, other_share_percent: r2(100 - payerPct),
      status, approval_status: status === "wacht" ? "pending" : "agreed",
      turn_to_respond: status === "wacht" ? partner : null, counter_pending: false, updated_at: nowIso(),
    }).eq("id", e.id).select("*").single(),
    "update expense",
  ) as Row;
  await addExpenseStep(e.id, me, "gewijzigd", { amount, payer_pct: payerPct });
  await audit(me, "kosten", e.id, "UPDATED", [me, partner], { label: description, amount, status });
  return (await expensesOut([row]))[0];
}

/** The creator withdraws a shared expense (claim) that is not settled and not in an open settlement. */
async function withdrawExpense(me: string, body: Row): Promise<Row> {
  const e = await loadExpense(me, body.expense_id);
  assertCreator(me, e);
  if (!e.other_parent_id) throw err.validation("Only a shared expense can be withdrawn");
  if (!["wacht", "bevestigd", "opgeslagen", "betwist"].includes(e.status) || e.settlement_id) throw err.forbidden("This expense can no longer be withdrawn");
  if (await reservedBySettlement(e.id)) throw err.forbidden("This expense is part of an open settlement");
  const row = check(
    await db().from("expenses").update({ status: "ingetrokken", approval_status: "withdrawn", turn_to_respond: null, counter_pending: false, updated_at: nowIso() })
      .eq("id", e.id).select("*").single(),
    "withdraw expense",
  ) as Row;
  await releaseBudget(e);
  await addExpenseStep(e.id, me, "ingetrokken");
  await audit(me, "kosten", e.id, "CANCELLED", [me, e.other_parent_id], { label: e.description });
  return (await expensesOut([row]))[0];
}

/**
 * Delete by the creator: a private expense (not settled), or a shared one that is withdrawn or that
 * the other parent has not answered yet. Receipts are removed from storage. Returns the deleted row.
 */
async function deleteExpense(me: string, body: Row): Promise<Row> {
  const e = await loadExpense(me, body.expense_id);
  assertCreator(me, e);
  if (e.status === "verrekend" || e.settlement_id) throw err.forbidden("A settled expense cannot be deleted");
  if (await reservedBySettlement(e.id)) throw err.forbidden("This expense is part of an open settlement");
  if (e.other_parent_id && e.status !== "ingetrokken") {
    if (!["wacht", "opgeslagen"].includes(e.status) || await otherResponded(e)) throw err.forbidden("Withdraw this expense first");
  }
  const atts = (check(await db().from("expense_attachments").select("storage_path").eq("expense_id", e.id), "delete attachments") ?? []) as Row[];
  await releaseBudget(e);
  check(await db().from("expenses").delete().eq("id", e.id), "delete expense");
  if (atts.length) {
    const { error } = await db().storage.from(RECEIPTS_BUCKET).remove(atts.map((a) => a.storage_path));
    if (error) console.warn("[manage-expenses] receipt cleanup failed:", error);
  }
  await audit(me, "kosten", e.id, "DELETED", [me, e.other_parent_id], { label: e.description, amount: Number(e.amount) });
  return e;
}

/** A private expense is shared later with the other parent of its children (status "wacht" when approval applies). */
async function shareExpense(me: string, body: Row): Promise<Row> {
  const fam = await familyOf(me);
  const e = await loadExpense(me, body.expense_id);
  assertCreator(me, e);
  if (e.other_parent_id) throw err.validation("This expense is already shared");
  if (e.status === "verrekend" || e.settlement_id) throw err.forbidden("A settled expense cannot be shared");
  const partner = await costPair(me, (e.child_ids ?? []) as string[], true, body.other_parent_id);
  if (!partner) throw err.forbidden("These children have no other parent in the app yet");
  assertActivePartner(fam, partner);
  const agr = (await agreementState(fam, partner)).pairCurrent;
  let split = e.split_choice ?? "standaard";
  let payerPct = Number(e.payer_share_percent ?? 50);
  if (body.split !== undefined || body.payer_pct !== undefined) {
    split = SPLITS.includes(body.split) ? body.split : split;
    payerPct = split === "50" ? 50 : split === "volledig" ? 100 : pct(body.payer_pct ?? payerPct, "payer_pct");
  }
  const paidFrom = e.paid_from ?? "eigen";
  const status = sharedStatus(partner, paidFrom, split, agr);
  const row = check(
    await db().from("expenses").update({
      other_parent_id: partner, split_choice: split,
      split_type: payerPct === 100 ? "sole_payer" : payerPct === 50 ? "50_50" : "custom",
      payer_share_percent: payerPct, other_share_percent: r2(100 - payerPct),
      status, approval_status: status === "wacht" ? "pending" : "agreed",
      turn_to_respond: status === "wacht" ? partner : null, counter_pending: false, updated_at: nowIso(),
    }).eq("id", e.id).is("other_parent_id", null).select("*").maybeSingle(),
    "share expense",
  ) as Row | null;
  if (!row) throw err.validation("Expense changed in the meantime");
  await addExpenseStep(e.id, me, "gedeeld", { amount: Number(e.amount), payer_pct: payerPct });
  await audit(me, "kosten", e.id, "UPDATED", [me, partner], { label: e.description, shared: true, status });
  return (await expensesOut([row]))[0];
}

/** Friendly reminder from the parent who waits for the other parent's answer (max 2, 24 h apart). */
async function remindExpense(me: string, body: Row): Promise<Row> {
  const fam = await familyOf(me);
  const e = await loadExpense(me, body.expense_id);
  if (e.status !== "wacht" || !e.turn_to_respond || e.turn_to_respond === me) throw err.forbidden("Nothing to remind");
  assertActivePartner(fam, otherOf(me, e.created_by ?? e.payer_id, e.other_parent_id));
  const reminders = (check(
    await db().from("expense_steps").select("created_at").eq("expense_id", e.id).eq("step_type", "herinnering").order("created_at"),
    "expense reminders",
  ) ?? []) as Row[];
  const last = reminders.at(-1);
  if (reminders.length >= 2 || (last && Date.now() - new Date(last.created_at).getTime() < 24 * 3600 * 1000)) {
    throw new HttpError(429, "RATE_LIMITED", "Reminder already sent");
  }
  await addExpenseStep(e.id, me, "herinnering");
  return (await expensesOut([e]))[0];
}

// ------------------------------------------------------------------ fixed costs (vaste lasten)

const INTERVALS = ["weekly", "monthly", "quarterly", "yearly"];

async function loadRecurring(me: string, id: unknown): Promise<Row> {
  const row = check(await db().from("recurring_expenses").select("*").eq("id", requireUuid(id, "recurring_id")).maybeSingle(), "load recurring") as Row | null;
  if (!row) throw err.notFound();
  await assertVisible(me, row.created_by, row.other_parent_id, row.child_ids);
  return row;
}

async function createRecurring(me: string, body: Row): Promise<Row> {
  const childIds = await childIdsInput(me, body.child_ids);
  // New app versions always send `shared`; private ("Alleen jij") is the default there.
  const partner = await costPair(me, childIds, body.shared, body.other_parent_id);
  const row = check(
    await db().from("recurring_expenses").insert({
      created_by: me, other_parent_id: partner, payer_id: me,
      title: reqText(body.title, "title", 200), amount: money(body.amount, "amount"),
      interval: INTERVALS.includes(body.interval) ? body.interval : "monthly",
      child_ids: childIds, child_id: childIds[0] ?? null, split_ratio: pct(body.my_pct ?? 50, "my_pct"),
      category: CATEGORIES.includes(body.category) ? body.category : "Overig",
    }).select("*").single(),
    "insert recurring",
  ) as Row;
  await audit(me, "vaste_last", row.id, "CREATED", [me, partner], { label: row.title });
  return recurringOut(row);
}

async function updateRecurring(me: string, body: Row): Promise<{ row: Row; wasShared: boolean }> {
  const r = await loadRecurring(me, body.recurring_id);
  if (r.created_by !== me) throw err.forbidden("Only the parent who added this can change it");
  const childIds = body.child_ids === undefined ? (r.child_ids ?? []) as string[] : await childIdsInput(me, body.child_ids);
  let partner: string | null = r.other_parent_id ?? null;
  if (body.shared === false) partner = null;
  else if (body.shared === true || (partner && body.child_ids !== undefined)) partner = await costPair(me, childIds, true, body.other_parent_id ?? partner ?? undefined);
  const patch: Row = { child_ids: childIds, child_id: childIds[0] ?? null, other_parent_id: partner, updated_at: nowIso() };
  if (body.title !== undefined) patch.title = reqText(body.title, "title", 200);
  if (body.amount !== undefined) patch.amount = money(body.amount, "amount");
  if (body.my_pct !== undefined) patch.split_ratio = pct(body.my_pct, "my_pct");
  if (body.interval !== undefined) patch.interval = INTERVALS.includes(body.interval) ? body.interval : "monthly";
  if (body.category !== undefined) patch.category = CATEGORIES.includes(body.category) ? body.category : "Overig";
  const row = check(await db().from("recurring_expenses").update(patch).eq("id", r.id).select("*").single(), "update recurring") as Row;
  await audit(me, "vaste_last", r.id, "UPDATED", [me, partner ?? r.other_parent_id], { label: row.title });
  return { row: recurringOut(row), wasShared: !!r.other_parent_id };
}

async function deleteRecurring(me: string, body: Row): Promise<Row> {
  const r = await loadRecurring(me, body.recurring_id);
  if (r.created_by !== me) throw err.forbidden("Only the parent who added this can delete it");
  check(await db().from("recurring_expenses").delete().eq("id", r.id), "delete recurring");
  await audit(me, "vaste_last", r.id, "DELETED", [me, r.other_parent_id], { label: r.title });
  return r;
}

// ------------------------------------------------------------------ savings pots (spaarpotjes)

async function loadPot(me: string, id: unknown): Promise<Row> {
  const row = check(await db().from("savings_pots").select("*").eq("id", requireUuid(id, "pot_id")).maybeSingle(), "load pot") as Row | null;
  if (!row) throw err.notFound();
  await assertVisible(me, row.created_by, row.other_parent_id, row.child_ids ?? (row.child_id ? [row.child_id] : []));
  return row;
}

async function potById(id: string): Promise<Row> {
  const row = check(await db().from("savings_pots").select("*").eq("id", id).single(), "reload pot") as Row;
  return (await potsOut([row]))[0];
}

/** Keeps savings_pots.current_amount equal to the sum of the deposits (for exports and old readers). */
async function syncPotAmount(potId: string): Promise<void> {
  const deps = (check(await db().from("savings_pot_deposits").select("amount").eq("pot_id", potId), "pot sum") ?? []) as Row[];
  const sum = r2(deps.reduce((n, d) => n + Number(d.amount), 0));
  check(await db().from("savings_pots").update({ current_amount: sum, updated_at: nowIso() }).eq("id", potId), "pot amount");
}

async function createPot(me: string, body: Row): Promise<Row> {
  const x = body.pot && typeof body.pot === "object" ? body.pot : body;
  const childIds = await childIdsInput(me, x.child_ids);
  // Private unless explicitly shared; shared = the other parent of these children.
  const partner = await costPair(me, childIds, x.shared === true, x.other_parent_id);
  const target = x.target_amount === undefined || x.target_amount === null || x.target_amount === "" ? 0 : money(x.target_amount, "target_amount", { allowZero: true });
  const row = check(
    await db().from("savings_pots").insert({
      created_by: me, other_parent_id: partner, title: reqText(x.title, "title", 120), target_amount: target,
      child_ids: childIds, child_id: childIds[0] ?? null, note: optText(x.note, "note", 500) ?? null,
      color: typeof x.color === "string" && /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : null,
    }).select("*").single(),
    "insert pot",
  ) as Row;
  const start = x.start_amount === undefined || x.start_amount === null || x.start_amount === "" ? 0 : money(x.start_amount, "start_amount", { allowZero: true });
  if (start > 0) {
    check(await db().from("savings_pot_deposits").insert({ pot_id: row.id, created_by: me, amount: start }), "start deposit");
    await syncPotAmount(row.id);
  }
  await audit(me, "spaarpot", row.id, "CREATED", [me, partner], { label: row.title, target });
  return await potById(row.id);
}

async function updatePot(me: string, body: Row): Promise<{ pot: Row; wasShared: boolean }> {
  const p = await loadPot(me, body.pot_id);
  if (p.created_by !== me) throw err.forbidden("Only the parent who made this pot can change it");
  const x = body.pot && typeof body.pot === "object" ? body.pot : body;
  const childIds = x.child_ids === undefined ? (p.child_ids ?? []) as string[] : await childIdsInput(me, x.child_ids);
  let partner: string | null = p.other_parent_id ?? null;
  if (x.shared === false) partner = null;
  else if (x.shared === true || (partner && x.child_ids !== undefined)) partner = await costPair(me, childIds, true, x.other_parent_id ?? partner ?? undefined);
  const patch: Row = { child_ids: childIds, child_id: childIds[0] ?? null, other_parent_id: partner, updated_at: nowIso() };
  if (x.title !== undefined) patch.title = reqText(x.title, "title", 120);
  if (x.target_amount !== undefined) patch.target_amount = x.target_amount === null || x.target_amount === "" ? 0 : money(x.target_amount, "target_amount", { allowZero: true });
  if (x.note !== undefined) patch.note = optText(x.note, "note", 500) ?? null;
  check(await db().from("savings_pots").update(patch).eq("id", p.id), "update pot");
  await audit(me, "spaarpot", p.id, "UPDATED", [me, partner ?? p.other_parent_id], { label: patch.title ?? p.title });
  return { pot: await potById(p.id), wasShared: !!p.other_parent_id };
}

async function deletePot(me: string, body: Row): Promise<Row> {
  const p = await loadPot(me, body.pot_id);
  if (p.created_by !== me) throw err.forbidden("Only the parent who made this pot can delete it");
  check(await db().from("savings_pots").delete().eq("id", p.id), "delete pot");
  await audit(me, "spaarpot", p.id, "DELETED", [me, p.other_parent_id], { label: p.title });
  return p;
}

async function addDeposit(me: string, body: Row): Promise<{ pot: Row; amount: number }> {
  const p = await loadPot(me, body.pot_id);
  if (p.other_parent_id && p.created_by !== me) assertActivePartner(await familyOf(me), p.created_by);
  const amount = money(body.amount, "amount");
  check(
    await db().from("savings_pot_deposits").insert({
      pot_id: p.id, created_by: me, amount,
      date: optDate(body.date, "date") ?? new Date().toISOString().slice(0, 10),
      note: optText(body.note, "note", 200) ?? null,
    }),
    "insert deposit",
  );
  await syncPotAmount(p.id);
  await audit(me, "spaarpot", p.id, "UPDATED", [p.created_by, p.other_parent_id], { label: p.title, deposit: amount });
  return { pot: await potById(p.id), amount };
}

async function removeDeposit(me: string, body: Row): Promise<Row> {
  const d = check(await db().from("savings_pot_deposits").select("*").eq("id", requireUuid(body.deposit_id, "deposit_id")).maybeSingle(), "load deposit") as Row | null;
  if (!d) throw err.notFound();
  const p = await loadPot(me, d.pot_id);
  // The parent who made the deposit removes it (the pot owner may also clean up their own pot).
  if (d.created_by !== me && p.created_by !== me) throw err.forbidden("Only the parent who made this deposit can remove it");
  check(await db().from("savings_pot_deposits").delete().eq("id", d.id), "delete deposit");
  await syncPotAmount(p.id);
  await audit(me, "spaarpot", p.id, "UPDATED", [p.created_by, p.other_parent_id], { label: p.title, deposit_removed: Number(d.amount) });
  return await potById(p.id);
}

/* ---------- notifications to the other parent of the pair (shared records only) ---------- */
// [creator column, other column, label column, amount column]
const PAIR_COLS: Record<string, [string, string, string, string | null]> = {
  expenses: ["created_by", "other_parent_id", "description", "amount"],
  budget_proposals: ["created_by", "other_parent_id", "title", "max_amount"],
  settlements: ["payer_id", "receiver_id", "description", "amount"],
  cost_agreements: ["proposed_by", "partner_id", "split_mode", null],
  recurring_expenses: ["created_by", "other_parent_id", "title", "amount"],
  savings_pots: ["created_by", "other_parent_id", "title", "target_amount"],
};
const euroText = (n: number) => `€ ${Number(n).toFixed(2).replace(".", ",")}`;
/**
 * Best-effort in-app notification for the other parent of a cost record (an already loaded row, e.g.
 * one that was just deleted). A record without the other parent (private / solo, "Alleen jij") never
 * notifies anyone. Never fails the action.
 */
async function tellAbout(me: string, table: keyof typeof PAIR_COLS, row: Row | null, key: string, category: NotifyCategory, type = "cost", extra: Record<string, string> = {}) {
  if (!row?.id) return;
  try {
    const [a, b, label, amount] = PAIR_COLS[table];
    const to = row[a] === me ? row[b] : row[a];
    if (!to || to === me) return;
    const params: Record<string, string> = {};
    if (row[label]) params.titel = String(row[label]).slice(0, 80);
    if (amount && row[amount] !== null && row[amount] !== undefined) params.bedrag = euroText(Number(row[amount]));
    const kids = Array.isArray(row.child_ids) ? row.child_ids : [];
    if (kids.length) {
      const { data: names } = await db().from("children").select("name").in("id", kids);
      params.kind = ((names ?? []) as Row[]).map((c) => String(c.name)).join(" & ").slice(0, 80);
    }
    await notify({
      to, actorId: me, type, category, key, params: { ...params, ...extra }, link: "/kosten",
      entityType: table, entityId: row.id, childIds: kids,
    });
  } catch (e) {
    console.warn("[manage-expenses] notify failed:", (e as Error)?.message ?? e);
  }
}

/** Same as tellAbout, for a record that still exists (read fresh after the change). */
async function tellOther(me: string, table: keyof typeof PAIR_COLS, id: unknown, key: string, category: NotifyCategory, type = "cost", extra: Record<string, string> = {}) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return;
  const { data, error } = await db().from(table).select("*").eq("id", id).maybeSingle();
  if (error || !data) return;
  await tellAbout(me, table, data as Row, key, category, type, extra);
}

Deno.serve(serveActions("manage-expenses", {
  async overview(req) {
    const me = await requireUser(req);
    return ok(await overview(me.id));
  },

  async "create-expense"(req, body) {
    const me = await requireUser(req);
    const expense = await createExpense(me.id, body);
    await tellOther(me.id, "expenses", expense?.id, expense?.status === "wacht" ? "kostAkkoordGevraagd" : "kostToegevoegd", expense?.status === "wacht" ? "actie" : "info");
    return ok({ expense });
  },

  async "respond-expense"(req, body) {
    const me = await requireUser(req);
    const expense = await respondExpense(me.id, body);
    await tellOther(me.id, "expenses", expense?.id, "kostReactie", "wijziging");
    return ok({ expense });
  },

  async "comment-expense"(req, body) {
    const me = await requireUser(req);
    const e = await loadExpense(me.id, body.expense_id);
    // The other parent only acts while still connected (the creator may always annotate their own record).
    if ((e.created_by ?? e.payer_id) !== me.id) assertActivePartner(await familyOf(me.id), e.created_by ?? e.payer_id);
    await addExpenseStep(e.id, me.id, "opmerking", { note: reqText(body.text, "text", 1000) });
    await audit(me.id, "kosten", e.id, "UPDATED", [e.created_by, e.other_parent_id], { label: e.description, comment: true });
    await tellOther(me.id, "expenses", e.id, "kostOpmerking", "info");
    return ok({ expense: (await expensesOut([e]))[0] });
  },

  async "add-attachment"(req, body) {
    const me = await requireUser(req);
    const e = await loadExpense(me.id, body.expense_id);
    if ((e.created_by ?? e.payer_id) !== me.id) assertActivePartner(await familyOf(me.id), e.created_by ?? e.payer_id);
    await storeAttachment(me.id, e.id, body.kind === "bijlage" ? "bijlage" : "bon", body.file, body.file_name);
    await audit(me.id, "kosten", e.id, "UPDATED", [e.created_by, e.other_parent_id], { label: e.description, attachment: body.kind === "bijlage" ? "bijlage" : "bon" });
    const fresh = check(await db().from("expenses").select("*").eq("id", e.id).single(), "reload expense") as Row;
    return ok({ expense: (await expensesOut([fresh]))[0] });
  },

  async "create-budget"(req, body) {
    const me = await requireUser(req);
    const budget = await createBudget(me.id, body);
    await tellOther(me.id, "budget_proposals", budget?.id, "budgetVoorstel", "actie", "budget");
    return ok({ budget });
  },

  async "respond-budget"(req, body) {
    const me = await requireUser(req);
    const budget = await respondBudget(me.id, body);
    await tellOther(me.id, "budget_proposals", budget?.id, "budgetReactie", "wijziging", "budget");
    return ok({ budget });
  },

  async "change-budget"(req, body) {
    const me = await requireUser(req);
    const budget = await changeBudget(me.id, body);
    await tellOther(me.id, "budget_proposals", budget?.id, "budgetGewijzigd", "actie", "budget");
    return ok({ budget });
  },

  async "withdraw-budget"(req, body) {
    const me = await requireUser(req);
    const budget = await withdrawBudget(me.id, body);
    await tellOther(me.id, "budget_proposals", budget?.id, "budgetIngetrokken", "info", "budget");
    return ok({ budget });
  },

  async "remind-budget"(req, body) {
    const me = await requireUser(req);
    const budget = await remindBudget(me.id, body);
    await tellOther(me.id, "budget_proposals", budget?.id, "budgetHerinnering", "actie", "budget");
    return ok({ budget });
  },

  async "start-settlement"(req, body) {
    const me = await requireUser(req);
    const { settlement, created } = await startSettlement(me.id, body);
    if (created) await tellOther(me.id, "settlements", settlement?.id, "verrekeningGestart", "actie");
    return ok({ settlement });
  },

  /** Only the receiving parent adds a payment link and/or their bank details. */
  async "share-payment-request"(req, body) {
    const me = await requireUser(req);
    const s = await loadSettlement(me.id, body.settlement_id);
    if (s.receiver_id !== me.id || !["nog-te-betalen", "betaalverzoek-gedeeld"].includes(s.status)) throw err.forbidden("Only the receiving parent can share a payment request");
    const link = body.payment_link ? safePaymentLink(body.payment_link) : null;
    const iban = body.bank_iban ? validIban(body.bank_iban) : null;
    if (!link && !iban) throw err.validation("payment_link or bank_iban is required");
    const patch: Row = {
      payment_link: link ?? s.payment_link ?? null,
      bank_iban: iban ?? s.bank_iban ?? null,
      bank_account_name: optText(body.bank_account_name, "bank_account_name", 120) ?? s.bank_account_name ?? null,
      description: optText(body.description, "description", 140) ?? s.description ?? null,
      requested_at: nowIso(),
    };
    const settlement = await moveSettlement(me.id, s, "betaalverzoek-gedeeld", patch);
    await tellOther(me.id, "settlements", s.id, "betaalverzoek", "actie");
    return ok({ settlement });
  },

  /** The paying parent reports a payment. This is never proof of receipt. */
  async "indicate-payment"(req, body) {
    const me = await requireUser(req);
    const s = await loadSettlement(me.id, body.settlement_id);
    if (s.payer_id !== me.id || !["nog-te-betalen", "betaalverzoek-gedeeld"].includes(s.status)) throw err.forbidden("Only the paying parent can report a payment");
    const settlement = await moveSettlement(me.id, s, "wacht-op-ontvanger", { paid_at: nowIso() });
    await tellOther(me.id, "settlements", s.id, "betalingGemeld", "actie");
    return ok({ settlement });
  },

  /** Only the receiving parent confirms receipt; then the linked expenses are settled (once). */
  async "confirm-receipt"(req, body) {
    const me = await requireUser(req);
    const s = await loadSettlement(me.id, body.settlement_id);
    if (s.receiver_id !== me.id || !["nog-te-betalen", "betaalverzoek-gedeeld", "wacht-op-ontvanger"].includes(s.status)) throw err.forbidden("Only the receiving parent can confirm receipt");
    const out = await moveSettlement(me.id, s, "ontvangst-bevestigd", { confirmed_at: nowIso() });
    const ids = (s.expense_ids ?? []) as string[];
    if (ids.length) {
      const settled = (check(
        await db().from("expenses").update({ status: "verrekend", settlement_id: s.id, settled: true, settled_at: nowIso(), turn_to_respond: null, updated_at: nowIso() })
          .in("id", ids).in("status", ["bevestigd", "wacht"]).is("settlement_id", null).select("id"),
        "settle expenses",
      ) ?? []) as Row[];
      if (settled.length) check(await db().from("expense_steps").insert(settled.map((e) => ({ expense_id: e.id, actor_id: me.id, step_type: "verrekend" }))), "settled steps");
    }
    await tellOther(me.id, "settlements", s.id, "ontvangstBevestigd", "info");
    return ok({ settlement: out });
  },

  async "finish-settlement"(req, body) {
    const me = await requireUser(req);
    const s = await loadSettlement(me.id, body.settlement_id);
    if (s.receiver_id !== me.id || s.status !== "ontvangst-bevestigd") throw err.forbidden("Only the receiving parent can finish after confirming receipt");
    // Bank details are kept only for the duration of this settlement: wiped when it is finished.
    const settlement = await moveSettlement(me.id, s, "afgerond", { finished_at: nowIso(), bank_iban: null, bank_account_name: null });
    await tellOther(me.id, "settlements", s.id, "verrekeningAfgerond", "info");
    return ok({ settlement });
  },

  async "update-expense"(req, body) {
    const me = await requireUser(req);
    const expense = await updateExpense(me.id, body);
    await tellOther(me.id, "expenses", expense?.id, "kostGewijzigd", expense?.status === "wacht" ? "actie" : "wijziging");
    return ok({ expense });
  },

  async "withdraw-expense"(req, body) {
    const me = await requireUser(req);
    const expense = await withdrawExpense(me.id, body);
    await tellOther(me.id, "expenses", expense?.id, "kostIngetrokken", "info");
    return ok({ expense });
  },

  async "delete-expense"(req, body) {
    const me = await requireUser(req);
    const row = await deleteExpense(me.id, body);
    // Only a shared expense the other parent could see was ever announced to them.
    if (row.other_parent_id && row.status !== "ingetrokken") await tellAbout(me.id, "expenses", row, "kostVerwijderd", "info");
    return ok({ deleted: row.id });
  },

  async "share-expense"(req, body) {
    const me = await requireUser(req);
    const expense = await shareExpense(me.id, body);
    await tellOther(me.id, "expenses", expense?.id, expense?.status === "wacht" ? "kostAkkoordGevraagd" : "kostToegevoegd", expense?.status === "wacht" ? "actie" : "info");
    return ok({ expense });
  },

  async "remind-expense"(req, body) {
    const me = await requireUser(req);
    const expense = await remindExpense(me.id, body);
    await tellOther(me.id, "expenses", expense?.id, "kostHerinnering", "actie");
    return ok({ expense });
  },

  /** Fixed costs are display-only; they never become expenses or enter the balance. */
  async "create-recurring"(req, body) {
    const me = await requireUser(req);
    const recurring = await createRecurring(me.id, body);
    if (recurring.shared) await tellOther(me.id, "recurring_expenses", recurring.id, "vasteLastToegevoegd", "info");
    return ok({ recurring });
  },

  async "update-recurring"(req, body) {
    const me = await requireUser(req);
    const { row, wasShared } = await updateRecurring(me.id, body);
    if (row.shared) await tellOther(me.id, "recurring_expenses", row.id, wasShared ? "vasteLastGewijzigd" : "vasteLastToegevoegd", "info");
    return ok({ recurring: row });
  },

  async "delete-recurring"(req, body) {
    const me = await requireUser(req);
    const row = await deleteRecurring(me.id, body);
    await tellAbout(me.id, "recurring_expenses", row, "vasteLastVerwijderd", "info");
    return ok({ deleted: row.id });
  },

  async "create-pot"(req, body) {
    const me = await requireUser(req);
    const pot = await createPot(me.id, body);
    if (pot.shared) await tellOther(me.id, "savings_pots", pot.id, "potToegevoegd", "info");
    return ok({ pot });
  },

  async "update-pot"(req, body) {
    const me = await requireUser(req);
    const { pot, wasShared } = await updatePot(me.id, body);
    if (pot.shared) await tellOther(me.id, "savings_pots", pot.id, wasShared ? "potGewijzigd" : "potToegevoegd", "info");
    return ok({ pot });
  },

  async "delete-pot"(req, body) {
    const me = await requireUser(req);
    const row = await deletePot(me.id, body);
    await tellAbout(me.id, "savings_pots", row, "potVerwijderd", "info");
    return ok({ deleted: row.id });
  },

  async "add-deposit"(req, body) {
    const me = await requireUser(req);
    const { pot, amount } = await addDeposit(me.id, body);
    if (pot.shared) await tellOther(me.id, "savings_pots", pot.id, "potStorting", "info", "cost", { storting: euroText(amount) });
    return ok({ pot });
  },

  async "remove-deposit"(req, body) {
    const me = await requireUser(req);
    const pot = await removeDeposit(me.id, body);
    if (pot.shared) await tellOther(me.id, "savings_pots", pot.id, "potStortingVerwijderd", "info");
    return ok({ pot });
  },

  async "save-agreement"(req, body) {
    const me = await requireUser(req);
    const agreement = await saveAgreement(me.id, body);
    await tellOther(me.id, "cost_agreements", agreement?.pending?.id ?? agreement?.current?.id, "kostenAfspraakVoorstel", "actie");
    return ok({ agreement });
  },

  async "respond-agreement"(req, body) {
    const me = await requireUser(req);
    const agreement = await respondAgreement(me.id, body);
    await tellOther(me.id, "cost_agreements", body.agreement_id, "kostenAfspraakReactie", "wijziging");
    return ok({ agreement });
  },
}));
