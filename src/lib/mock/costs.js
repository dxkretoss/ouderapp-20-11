/**
 * ALLEEN VOOR LOKAAL TESTEN (VITE_API_MOCK=1): nagebootste manage-expenses en manage-still-needed
 * (Phase 2, domein 3). Zelfde acties, velden, statussen en foutcodes als de edge functions.
 * Bijlagen worden als data-URL in de mock-db bewaard en als "url" teruggegeven (echte server: signed URL, 1 uur).
 */
const CATEGORIES = ["School", "Sport", "Kleding", "Zorg", "Opvang", "Activiteiten", "Medisch", "Overig", "Bon", "Algemeen"];
const SPLITS = ["standaard", "50", "anders", "volledig"];
const OPEN_BUDGET = ["wacht", "tegenvoorstel"];
const AGREED_BUDGET = ["akkoord", "uitgegeven"];
const OPEN_SETTLEMENT = ["nog-te-betalen", "betaalverzoek-gedeeld", "wacht-op-ontvanger"];
const MODES = ["alleen", "50", "eigen", "per-uitgave"];
const MOMENTS = ["direct", "week", "maand", "kwartaal", "zelf"];
const HOSTS = ["tikkie.me", "betaalverzoek.rabobank.nl", "www.abnamro.nl", "abnamro.nl"];
const r2 = (n) => Math.round(n * 100) / 100;
export function maak(h) {
    const { Fout, ok, uuid, nu, gebruikerVoor, toegang } = h;
    const V = (m) => new Fout(400, "VALIDATION", m);
    const tabellen = (db) => {
        for (const t of ["expenses", "expense_steps", "expense_attachments", "budget_proposals", "budget_steps", "settlements", "settlement_steps", "recurring_expenses", "cost_agreements", "still_needed_items", "audit_events"])
            db[t] ??= [];
    };
    const partners = (db, me) => [...new Set(db.connections.filter((c) => c.status === "active" && (c.parent_1_id === me || c.parent_2_id === me)).map((c) => (c.parent_1_id === me ? c.parent_2_id : c.parent_1_id)))].sort();
    const fam = (db, me) => { const p = partners(db, me); return { me, partner: p[0] ?? null, partners: p }; };
    const zichtbaar = (me, maker, ander) => maker === me || ander === me;
    const otherOf = (me, maker, ander) => (maker === me ? ander : maker);
    const actief = (f, ander) => { if (!ander || !f.partners.includes(ander)) throw new Fout(403, "FORBIDDEN", "no active connection"); return ander; };
    const geld = (v, veld, nul = false) => { const n = Number(typeof v === "string" ? v.replace(",", ".") : v); if (!Number.isFinite(n) || n < 0 || (!nul && n <= 0) || n > 99999999) throw V(`${veld} must be a positive amount`); return r2(n); };
    const pct = (v, veld) => { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 100) throw V(`${veld} must be 0-100`); return r2(n); };
    const tekst = (v, veld, max, verplicht = false) => { if (v === undefined || v === null || v === "") { if (verplicht) throw V(`${veld} is required`); return null; } if (typeof v !== "string") throw V(`${veld} must be a string`); const t = v.trim(); if (t.length > max) throw V(`${veld} too long`); if (!t && verplicht) throw V(`${veld} is required`); return t || null; };
    const datum = (v) => { if (v === undefined || v === null || v === "") return null; if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw V("date must be YYYY-MM-DD"); return v; };
    const toekomst = (v) => { if (!v) return null; const d = new Date(String(v)); if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now() - 60000 || d.getTime() > Date.now() + 366 * 864e5) throw V("review_at must be a future moment"); return d.toISOString(); };
    const kinderen = (db, me, v) => { if (v === undefined || v === null) return []; if (!Array.isArray(v) || v.length > 20) throw V("child_ids must be an array"); const ids = [...new Set(v.map(String))]; ids.forEach((id) => toegang(db, me, id)); return ids; };
    const bestand = (v) => { if (typeof v !== "string" || !/^data:(image\/(jpeg|jpg|png|webp)|application\/pdf);base64,/i.test(v)) throw V("Only jpeg, png, webp or pdf files are allowed"); if (v.length > Math.ceil((10 * 1024 * 1024 * 4) / 3) + 40) throw V("File is too large (max 10 MB)"); return v; };
    const audit = (db, actor, type, id, action, family, details = {}) => db.audit_events.push({ id: uuid(), actor_id: actor, entity_type: type, entity_id: id, action, details: { ...details, family_ids: family.filter(Boolean) }, created_at: nu() });
    const veiligeLink = (v) => { try { const u = new URL(String(v).trim()); if (u.protocol === "https:" && !u.username && !u.password && !u.port && u.pathname !== "/" && HOSTS.includes(u.hostname)) return u.href; } catch { /* */ } throw V("payment_link is not a recognised payment request link"); };
    const iban = (v) => { const s = String(v ?? "").replace(/\s+/g, "").toUpperCase(); if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) throw V("bank_iban is not a valid IBAN"); let rest = 0; for (const ch of s.slice(4) + s.slice(0, 4)) for (const d of (ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch)) rest = (rest * 10 + Number(d)) % 97; if (rest !== 1) throw V("bank_iban is not a valid IBAN"); return s; };
    // ---------- uitvoer
    const expenseOut = (db, e) => ({
        id: e.id, description: e.description, amount: e.amount, date: e.date, category: e.category, child_ids: e.child_ids, paid_from: e.paid_from, split: e.split_choice,
        payer_id: e.payer_id, payer_pct: e.payer_pct, created_by: e.created_by, other_parent_id: e.other_parent_id, status: e.status,
        turn_to_respond: e.status === "wacht" ? e.turn_to_respond : null, counter_pending: !!e.counter_pending, budget_id: e.budget_id, settlement_id: e.settlement_id,
        confirmed_by: e.confirmed_by ?? null, confirmed_at: e.confirmed_at ?? null, created_at: e.created_at,
        steps: db.expense_steps.filter((s) => s.expense_id === e.id).map((s) => ({ id: s.id, actor_id: s.actor_id, type: s.step_type, amount: s.amount ?? null, payer_pct: s.payer_pct ?? null, note: s.note ?? null, review_at: s.review_at ?? null, created_at: s.created_at })),
        attachments: db.expense_attachments.filter((a) => a.expense_id === e.id).map((a) => ({ id: a.id, kind: a.kind, name: a.file_name, url: a.data, created_at: a.created_at })),
    });
    const budgetOut = (db, b) => ({
        id: b.id, title: b.title, category: b.category ?? null, period: b.period, child_ids: b.child_ids, amount: b.amount, creator_pct: b.creator_pct, created_by: b.created_by,
        other_parent_id: b.other_parent_id, status: b.status, turn_to_respond: OPEN_BUDGET.includes(b.status) ? b.turn_to_respond : null, response_date: b.response_date ?? null,
        note: b.note ?? null, terms: null, valid_from: null, valid_to: null, expense_id: b.expense_id ?? null, created_at: b.created_at,
        steps: db.budget_steps.filter((s) => s.budget_id === b.id).map((s) => ({ id: s.id, actor_id: s.actor_id, type: s.action_type, amount: s.amount ?? null, creator_pct: s.creator_pct ?? null, note: null, review_at: s.review_at ?? null, created_at: s.created_at })),
    });
    const settlementOut = (db, s) => ({ ...s, steps: db.settlement_steps.filter((x) => x.settlement_id === s.id).map((x) => ({ actor_id: x.actor_id, status: x.status, created_at: x.created_at })) });
    const recurringOut = (r) => ({ id: r.id, title: r.title, amount: r.amount, interval: r.interval, child_ids: r.child_ids, creator_pct: r.creator_pct, created_by: r.created_by, other_parent_id: r.other_parent_id, category: r.category ?? "Overig", created_at: r.created_at });
    const agreementOut = (a) => (a ? { id: a.id, proposed_by: a.proposed_by, partner_id: a.partner_id, split_mode: a.split_mode, proposer_pct: a.proposer_pct, settle_moment: a.settle_moment, approval_threshold: a.approval_threshold, status: a.status, decided_by: a.decided_by ?? null, decided_at: a.decided_at ?? null, created_at: a.created_at } : null);
    const agreementState = (db, f) => {
        const rows = db.cost_agreements.filter((r) => (r.proposed_by === f.me && !r.partner_id) || (f.partner && ((r.proposed_by === f.me && r.partner_id === f.partner) || (r.proposed_by === f.partner && r.partner_id === f.me)))).slice().reverse();
        const pair = (r) => !!f.partner && !!r.partner_id;
        const pairCurrent = rows.find((r) => pair(r) && r.status === "bevestigd") ?? null;
        return { current: pairCurrent ?? rows.find((r) => !r.partner_id && r.status === "bevestigd") ?? null, pending: rows.find((r) => pair(r) && r.status === "voorgesteld") ?? null, pairCurrent };
    };
    const agreementPayload = (db, f) => { const s = agreementState(db, f); return { current: agreementOut(s.current), pending: agreementOut(s.pending) }; };
    // ---------- laden
    const expense = (db, me, id) => { const e = db.expenses.find((x) => x.id === id); if (!e || !zichtbaar(me, e.created_by, e.other_parent_id)) throw new Fout(404, "NOT_FOUND", "expense"); return e; };
    const budget = (db, me, id) => { const b = db.budget_proposals.find((x) => x.id === id); if (!b || !zichtbaar(me, b.created_by, b.other_parent_id)) throw new Fout(404, "NOT_FOUND", "budget"); return b; };
    const settlement = (db, me, id) => { const s = db.settlements.find((x) => x.id === id); if (!s || (s.payer_id !== me && s.receiver_id !== me)) throw new Fout(404, "NOT_FOUND", "settlement"); return s; };
    const eStap = (db, e, actor, type, extra = {}) => db.expense_steps.push({ id: uuid(), expense_id: e.id, actor_id: actor, step_type: type, created_at: nu(), ...extra });
    const bStap = (db, b, actor, type, extra = {}) => db.budget_steps.push({ id: uuid(), budget_id: b.id, actor_id: actor, action_type: type, created_at: nu(), ...extra });
    const sStap = (db, s, actor, status) => db.settlement_steps.push({ id: uuid(), settlement_id: s.id, actor_id: actor, status, created_at: nu() });
    const bijlage = (db, me, e, kind, data, naam) => db.expense_attachments.push({ id: uuid(), expense_id: e.id, kind, data: bestand(data), file_name: typeof naam === "string" && naam.trim() ? naam.trim().slice(0, 120) : kind, uploaded_by: me, created_at: nu() });
    const periodKey = (p, d) => (p === "maand" ? d.slice(0, 7) : p === "jaar" ? d.slice(0, 4) : "all");
    const gedekt = (db, e) => {
        const b = e.budget_id && !e.counter_pending ? db.budget_proposals.find((x) => x.id === e.budget_id) : null;
        if (!b || !AGREED_BUDGET.includes(b.status)) return false;
        const pairOk = (b.created_by === e.created_by && b.other_parent_id === e.other_parent_id) || (b.created_by === e.other_parent_id && b.other_parent_id === e.created_by);
        if (!pairOk) return false;
        const k = periodKey(b.period, e.date);
        const lijst = db.expenses.filter((x) => x.budget_id === b.id && ["wacht", "bevestigd", "verrekend"].includes(x.status) && periodKey(b.period, x.date) === k).sort((x, y) => x.date.localeCompare(y.date) || x.created_at.localeCompare(y.created_at));
        let used = 0;
        for (const x of lijst) { used += x.amount; if (x.id === e.id) break; }
        return used <= b.amount + 0.001;
    };
    const verrekenbaar = (db, e, me, partner) => {
        const pair = (e.created_by === me && e.other_parent_id === partner) || (e.created_by === partner && e.other_parent_id === me);
        if (!pair || e.paid_from !== "eigen" || e.settlement_id) return false;
        return e.status === "bevestigd" || (e.status === "wacht" && gedekt(db, e));
    };
    const zetSettlement = (db, me, s, status, patch = {}) => { Object.assign(s, patch, { status }); sStap(db, s, me, status); audit(db, me, "verrekening", s.id, "UPDATED", [s.payer_id, s.receiver_id], { status }); return ok({ settlement: settlementOut(db, s) }); };
    // ---------- still needed
    const itemOut = (i) => ({ id: i.id, user_id: i.user_id, other_parent_id: i.other_parent_id, title: i.title, category: i.category, child_ids: i.child_ids, child_name: null, is_purchased: !!i.is_purchased, purchased_by: i.purchased_by ?? null, purchased_at: i.purchased_at ?? null, budget_id: i.budget_id ?? null, buyer_id: i.buyer_id ?? null, expense_id: null, deadline: i.deadline ?? null, notes: i.notes ?? null, created_at: i.created_at });
    const item = (db, me, id) => { const i = db.still_needed_items.find((x) => x.id === id); if (!i || !zichtbaar(me, i.user_id, i.other_parent_id)) throw new Fout(404, "NOT_FOUND", "item"); return i; };
    const budgetLink = (db, me, v) => { if (v === undefined || v === null || v === "") return null; budget(db, me, v); return v; };
    const metDb = (f) => (db, b, token) => { tabellen(db); const me = gebruikerVoor(db, token).id; return f(db, b ?? {}, me); };
    return {
        "manage-expenses": {
            overview: metDb((db, b, me) => {
                const f = fam(db, me);
                return ok({
                    me, partner_id: f.partner,
                    expenses: db.expenses.filter((e) => zichtbaar(me, e.created_by, e.other_parent_id)).sort((a, c) => c.date.localeCompare(a.date) || c.created_at.localeCompare(a.created_at)).map((e) => expenseOut(db, e)),
                    budgets: db.budget_proposals.filter((x) => zichtbaar(me, x.created_by, x.other_parent_id)).slice().reverse().map((x) => budgetOut(db, x)),
                    settlements: db.settlements.filter((s) => s.payer_id === me || s.receiver_id === me).slice().reverse().map((s) => settlementOut(db, s)),
                    recurring: db.recurring_expenses.filter((r) => zichtbaar(me, r.created_by, r.other_parent_id)).map(recurringOut),
                    agreement: agreementPayload(db, f),
                });
            }),
            "create-expense": metDb((db, b, me) => {
                const f = fam(db, me);
                const x = b.expense ?? {};
                const description = tekst(x.description, "description", 200, true);
                const amount = geld(x.amount, "amount");
                const date = datum(x.date) ?? nu().slice(0, 10);
                const childIds = kinderen(db, me, x.child_ids);
                const paidFrom = x.paid_from === "kindrekening" ? "kindrekening" : "eigen";
                const split = SPLITS.includes(x.split) ? x.split : "standaard";
                let payerPct = split === "50" ? 50 : split === "volledig" ? 100 : pct(x.payer_pct ?? 50, "payer_pct");
                const agr = agreementState(db, f).pairCurrent;
                const grens = agr?.approval_threshold ?? null;
                let bud = null;
                if (x.budget_id) {
                    bud = budget(db, me, x.budget_id);
                    if (!AGREED_BUDGET.includes(bud.status)) throw V("Budget is not agreed");
                    if (!f.partner || otherOf(me, bud.created_by, bud.other_parent_id) !== f.partner) throw V("Budget belongs to another family");
                    payerPct = bud.created_by === me ? bud.creator_pct : r2(100 - bud.creator_pct);
                }
                const heeftBon = typeof b.receipt === "string" && b.receipt.length > 0;
                const gedeeld = !!f.partner && split !== "volledig" && agr?.split_mode !== "alleen";
                if (grens !== null && gedeeld && amount > grens) {
                    if (!bud) throw V("BUDGET_REQUIRED: above the approval threshold a budget proposal comes first");
                    if (!heeftBon) throw V("RECEIPT_REQUIRED: a receipt is required above the approval threshold");
                }
                const status = !f.partner || paidFrom === "kindrekening" || split === "volledig" || agr?.split_mode === "alleen" ? "opgeslagen" : "wacht";
                const e = { id: uuid(), description, amount, date, category: CATEGORIES.includes(x.category) ? x.category : "Overig", child_ids: childIds, paid_from: paidFrom, split_choice: split, payer_id: me, payer_pct: payerPct, created_by: me, other_parent_id: f.partner, status, turn_to_respond: status === "wacht" ? f.partner : null, counter_pending: false, budget_id: bud?.id ?? null, settlement_id: null, created_at: nu() };
                db.expenses.push(e);
                eStap(db, e, me, "toegevoegd", { amount, payer_pct: payerPct });
                const opm = tekst(x.comment, "comment", 1000);
                if (opm) eStap(db, e, me, "opmerking", { note: opm });
                if (heeftBon) bijlage(db, me, e, "bon", b.receipt, b.receipt_name);
                if (typeof b.attachment === "string" && b.attachment) bijlage(db, me, e, "bijlage", b.attachment, b.attachment_name);
                if (bud) {
                    bStap(db, bud, me, "werkelijke_uitgave", { amount });
                    if (bud.period === "eenmalig" && !bud.expense_id) Object.assign(bud, { status: "uitgegeven", expense_id: e.id });
                }
                audit(db, me, "kosten", e.id, "CREATED", [me, f.partner], { label: description, amount, status });
                return ok({ expense: expenseOut(db, e) });
            }),
            "respond-expense": metDb((db, b, me) => {
                const f = fam(db, me);
                const e = expense(db, me, b.expense_id);
                if (e.status !== "wacht" || e.turn_to_respond !== me) throw new Fout(403, "FORBIDDEN", "not your turn");
                const other = actief(f, otherOf(me, e.created_by, e.other_parent_id));
                const r = String(b.response ?? "");
                if (r === "akkoord") {
                    if (e.counter_pending) {
                        const last = db.expense_steps.filter((s) => s.expense_id === e.id && s.step_type === "ander_voorstel").at(-1);
                        if (last?.amount) e.amount = last.amount;
                        if (last?.payer_pct !== null && last?.payer_pct !== undefined) Object.assign(e, { payer_pct: last.payer_pct, split_choice: "anders" });
                    }
                    Object.assign(e, { status: "bevestigd", confirmed_by: me, confirmed_at: nu(), turn_to_respond: null, counter_pending: false });
                    eStap(db, e, me, "akkoord");
                }
                else if (r === "ander_voorstel") {
                    const amount = b.amount === undefined || b.amount === null || b.amount === "" ? null : geld(b.amount, "amount");
                    const payerPct = b.payer_pct === undefined || b.payer_pct === null || b.payer_pct === "" ? null : pct(b.payer_pct, "payer_pct");
                    const note = tekst(b.note, "note", 1000);
                    if (amount === null && payerPct === null && !note) throw V("A different amount, split or note is required");
                    Object.assign(e, { turn_to_respond: other, counter_pending: true });
                    eStap(db, e, me, "ander_voorstel", { amount, payer_pct: payerPct, note });
                }
                else if (r === "niet_akkoord") {
                    Object.assign(e, { status: "betwist", turn_to_respond: null, counter_pending: false });
                    eStap(db, e, me, "niet_akkoord", { note: tekst(b.note, "note", 1000) });
                }
                else if (r === "meer_tijd") eStap(db, e, me, "meer_tijd", { review_at: toekomst(b.review_at) });
                else throw V("response must be akkoord, ander_voorstel, niet_akkoord or meer_tijd");
                audit(db, me, "kosten", e.id, r === "akkoord" ? "ACCEPTED" : r === "niet_akkoord" ? "DECLINED" : "UPDATED", [me, other], { label: e.description, response: r });
                return ok({ expense: expenseOut(db, e) });
            }),
            "comment-expense": metDb((db, b, me) => {
                const e = expense(db, me, b.expense_id);
                eStap(db, e, me, "opmerking", { note: tekst(b.text, "text", 1000, true) });
                return ok({ expense: expenseOut(db, e) });
            }),
            "add-attachment": metDb((db, b, me) => {
                const e = expense(db, me, b.expense_id);
                bijlage(db, me, e, b.kind === "bijlage" ? "bijlage" : "bon", b.file, b.file_name);
                return ok({ expense: expenseOut(db, e) });
            }),
            "create-budget": metDb((db, b, me) => {
                const f = fam(db, me);
                if (!f.partner) throw new Fout(403, "FORBIDDEN", "Invite the other parent first");
                const x = b.budget ?? {};
                const title = tekst(x.title, "title", 200, true);
                const amount = geld(x.amount, "amount");
                const myPct = pct(x.my_pct ?? 50, "my_pct");
                const bud = { id: uuid(), title, amount, creator_pct: myPct, child_ids: kinderen(db, me, x.child_ids), category: CATEGORIES.includes(x.category) ? x.category : null, period: x.period === "maand" || x.period === "jaar" ? x.period : "eenmalig", created_by: me, other_parent_id: f.partner, status: "wacht", turn_to_respond: f.partner, response_date: datum(x.response_date), note: tekst(x.note, "note", 1000), expense_id: null, created_at: nu() };
                db.budget_proposals.push(bud);
                bStap(db, bud, me, "voorstel", { amount, creator_pct: myPct });
                audit(db, me, "budget", bud.id, "CREATED", [me, f.partner], { label: title, amount });
                return ok({ budget: budgetOut(db, bud) });
            }),
            "respond-budget": metDb((db, b, me) => {
                const f = fam(db, me);
                const bud = budget(db, me, b.budget_id);
                if (!OPEN_BUDGET.includes(bud.status) || bud.turn_to_respond !== me) throw new Fout(403, "FORBIDDEN", "not your turn");
                const other = actief(f, otherOf(me, bud.created_by, bud.other_parent_id));
                const stappen = db.budget_steps.filter((s) => s.budget_id === bud.id);
                const wasAkkoord = stappen.some((s) => s.action_type === "akkoord");
                const r = String(b.response ?? "");
                if (r === "ander_voorstel") {
                    const amount = geld(b.amount, "amount");
                    const cp = b.my_pct === undefined || b.my_pct === null ? null : bud.created_by === me ? pct(b.my_pct, "my_pct") : r2(100 - pct(b.my_pct, "my_pct"));
                    Object.assign(bud, { status: "tegenvoorstel", turn_to_respond: other });
                    bStap(db, bud, me, "ander_voorstel", { amount, creator_pct: cp });
                }
                else if (r === "akkoord") {
                    const last = [...stappen].reverse().find((s) => ["voorstel", "ander_voorstel", "wijzigingsvoorstel"].includes(s.action_type) && s.amount !== null && s.amount !== undefined);
                    const lastPct = [...stappen].reverse().find((s) => s.creator_pct !== null && s.creator_pct !== undefined)?.creator_pct;
                    Object.assign(bud, { status: bud.expense_id ? "uitgegeven" : "akkoord", turn_to_respond: null, amount: last ? last.amount : bud.amount, creator_pct: lastPct ?? bud.creator_pct });
                    bStap(db, bud, me, "akkoord");
                }
                else if (r === "niet_akkoord") {
                    Object.assign(bud, { status: wasAkkoord ? (bud.expense_id ? "uitgegeven" : "akkoord") : "geweigerd", turn_to_respond: null });
                    bStap(db, bud, me, "niet_akkoord");
                }
                else if (r === "meer_tijd") bStap(db, bud, me, "meer_tijd", { review_at: toekomst(b.review_at) });
                else throw V("response must be akkoord, ander_voorstel, niet_akkoord or meer_tijd");
                audit(db, me, "budget", bud.id, r === "akkoord" ? "ACCEPTED" : r === "niet_akkoord" ? "DECLINED" : "UPDATED", [me, other], { label: bud.title, response: r });
                return ok({ budget: budgetOut(db, bud) });
            }),
            "change-budget": metDb((db, b, me) => {
                const f = fam(db, me);
                const bud = budget(db, me, b.budget_id);
                if (!AGREED_BUDGET.includes(bud.status)) throw V("Only an agreed budget can be changed");
                const other = actief(f, otherOf(me, bud.created_by, bud.other_parent_id));
                const amount = geld(b.amount, "amount");
                const myPct = pct(b.my_pct ?? (bud.created_by === me ? bud.creator_pct : 100 - bud.creator_pct), "my_pct");
                bStap(db, bud, me, "wijzigingsvoorstel", { amount, creator_pct: bud.created_by === me ? myPct : r2(100 - myPct) });
                Object.assign(bud, { status: "tegenvoorstel", turn_to_respond: other });
                return ok({ budget: budgetOut(db, bud) });
            }),
            "withdraw-budget": metDb((db, b, me) => {
                const bud = budget(db, me, b.budget_id);
                if (!OPEN_BUDGET.includes(bud.status) || bud.turn_to_respond === me) throw new Fout(403, "FORBIDDEN", "only the waiting proposer");
                const wasAkkoord = db.budget_steps.some((s) => s.budget_id === bud.id && s.action_type === "akkoord");
                bStap(db, bud, me, "ingetrokken");
                Object.assign(bud, { status: wasAkkoord ? (bud.expense_id ? "uitgegeven" : "akkoord") : "ingetrokken", turn_to_respond: null });
                return ok({ budget: budgetOut(db, bud) });
            }),
            "remind-budget": metDb((db, b, me) => {
                const f = fam(db, me);
                const bud = budget(db, me, b.budget_id);
                if (!OPEN_BUDGET.includes(bud.status) || bud.turn_to_respond === me) throw new Fout(403, "FORBIDDEN", "only the waiting proposer");
                actief(f, otherOf(me, bud.created_by, bud.other_parent_id));
                const h = db.budget_steps.filter((s) => s.budget_id === bud.id && s.action_type === "herinnering");
                if (h.length >= 2 || (h.at(-1) && Date.now() - new Date(h.at(-1).created_at).getTime() < 864e5)) throw new Fout(429, "RATE_LIMITED", "reminder already sent");
                bStap(db, bud, me, "herinnering");
                return ok({ budget: budgetOut(db, bud) });
            }),
            "start-settlement": metDb((db, b, me) => {
                const f = fam(db, me);
                if (!f.partner) throw new Fout(403, "FORBIDDEN", "Invite the other parent first");
                const ids = Array.isArray(b.expense_ids) ? [...new Set(b.expense_ids.map(String))] : [];
                if (!ids.length) throw V("expense_ids is required");
                const open = db.settlements.find((s) => (s.payer_id === me || s.receiver_id === me) && OPEN_SETTLEMENT.includes(s.status) && s.expense_ids.some((id) => ids.includes(id)));
                if (open) return ok({ settlement: settlementOut(db, open) });
                const lijst = db.expenses.filter((e) => ids.includes(e.id) && verrekenbaar(db, e, me, f.partner));
                if (!lijst.length) throw V("Nothing to settle");
                const net = r2(lijst.reduce((n, e) => { const deel = r2((e.amount * (100 - e.payer_pct)) / 100); return n + (e.payer_id === me ? deel : -deel); }, 0));
                if (Math.abs(net) < 0.01) throw V("Nothing to settle");
                const s = { id: uuid(), created_by: me, payer_id: net > 0 ? f.partner : me, receiver_id: net > 0 ? me : f.partner, amount: Math.abs(net), period: tekst(b.period_label, "period_label", 60) ?? "maand", status: "nog-te-betalen", payment_link: null, description: null, bank_account_name: null, bank_iban: null, reference_code: `OC-${uuid().slice(0, 8).toUpperCase()}`, expense_ids: lijst.map((e) => e.id), created_at: nu(), requested_at: null, paid_at: null, confirmed_at: null, finished_at: null };
                db.settlements.push(s);
                sStap(db, s, me, "nog-te-betalen");
                audit(db, me, "verrekening", s.id, "CREATED", [me, f.partner], { amount: s.amount });
                return ok({ settlement: settlementOut(db, s) });
            }),
            "share-payment-request": metDb((db, b, me) => {
                const s = settlement(db, me, b.settlement_id);
                if (s.receiver_id !== me || !["nog-te-betalen", "betaalverzoek-gedeeld"].includes(s.status)) throw new Fout(403, "FORBIDDEN", "only the receiver");
                const link = b.payment_link ? veiligeLink(b.payment_link) : null;
                const rek = b.bank_iban ? iban(b.bank_iban) : null;
                if (!link && !rek) throw V("payment_link or bank_iban is required");
                return zetSettlement(db, me, s, "betaalverzoek-gedeeld", { payment_link: link ?? s.payment_link, bank_iban: rek ?? s.bank_iban, bank_account_name: tekst(b.bank_account_name, "bank_account_name", 120) ?? s.bank_account_name, description: tekst(b.description, "description", 140) ?? s.description, requested_at: nu() });
            }),
            "indicate-payment": metDb((db, b, me) => {
                const s = settlement(db, me, b.settlement_id);
                if (s.payer_id !== me || !["nog-te-betalen", "betaalverzoek-gedeeld"].includes(s.status)) throw new Fout(403, "FORBIDDEN", "only the payer");
                return zetSettlement(db, me, s, "wacht-op-ontvanger", { paid_at: nu() });
            }),
            "confirm-receipt": metDb((db, b, me) => {
                const s = settlement(db, me, b.settlement_id);
                if (s.receiver_id !== me || !OPEN_SETTLEMENT.includes(s.status)) throw new Fout(403, "FORBIDDEN", "only the receiver");
                const res = zetSettlement(db, me, s, "ontvangst-bevestigd", { confirmed_at: nu() });
                db.expenses.filter((e) => s.expense_ids.includes(e.id) && ["bevestigd", "wacht"].includes(e.status) && !e.settlement_id).forEach((e) => { Object.assign(e, { status: "verrekend", settlement_id: s.id, turn_to_respond: null }); eStap(db, e, me, "verrekend"); });
                return res;
            }),
            "finish-settlement": metDb((db, b, me) => {
                const s = settlement(db, me, b.settlement_id);
                if (s.receiver_id !== me || s.status !== "ontvangst-bevestigd") throw new Fout(403, "FORBIDDEN", "only the receiver after receipt");
                return zetSettlement(db, me, s, "afgerond", { finished_at: nu() });
            }),
            "create-recurring": metDb((db, b, me) => {
                const f = fam(db, me);
                const r = { id: uuid(), title: tekst(b.title, "title", 200, true), amount: geld(b.amount, "amount"), interval: "monthly", child_ids: kinderen(db, me, b.child_ids), creator_pct: pct(b.my_pct ?? 50, "my_pct"), created_by: me, other_parent_id: f.partner, created_at: nu() };
                db.recurring_expenses.push(r);
                return ok({ recurring: recurringOut(r) });
            }),
            "save-agreement": metDb((db, b, me) => {
                const f = fam(db, me);
                if (!MODES.includes(b.split_mode)) throw V("split_mode is invalid");
                const grens = b.approval_threshold === undefined || b.approval_threshold === null || b.approval_threshold === "" ? null : geld(b.approval_threshold, "approval_threshold", true);
                const basis = { id: uuid(), proposed_by: me, split_mode: b.split_mode, proposer_pct: pct(b.my_pct ?? 50, "my_pct"), settle_moment: MOMENTS.includes(b.settle_moment) ? b.settle_moment : "maand", approval_threshold: grens, created_at: nu() };
                if (f.partner) {
                    db.cost_agreements.filter((r) => r.status === "voorgesteld" && ((r.proposed_by === me && r.partner_id === f.partner) || (r.proposed_by === f.partner && r.partner_id === me))).forEach((r) => { r.status = "vervangen"; });
                    db.cost_agreements.push({ ...basis, partner_id: f.partner, status: "voorgesteld" });
                }
                else db.cost_agreements.push({ ...basis, partner_id: null, status: "bevestigd", decided_by: me, decided_at: nu() });
                return ok({ agreement: agreementPayload(db, f) });
            }),
            "respond-agreement": metDb((db, b, me) => {
                const f = fam(db, me);
                const a = db.cost_agreements.find((x) => x.id === b.agreement_id);
                if (!a || (a.proposed_by !== me && a.partner_id !== me)) throw new Fout(404, "NOT_FOUND", "agreement");
                if (a.partner_id !== me || a.status !== "voorgesteld") throw new Fout(403, "FORBIDDEN", "only the other parent");
                actief(f, a.proposed_by);
                if (b.response !== "akkoord" && b.response !== "niet_akkoord") throw V("response must be akkoord or niet_akkoord");
                Object.assign(a, { status: b.response === "akkoord" ? "bevestigd" : "afgewezen", decided_by: me, decided_at: nu() });
                return ok({ agreement: agreementPayload(db, f) });
            }),
        },
        "manage-still-needed": {
            list: metDb((db, b, me) => ok({ items: db.still_needed_items.filter((i) => zichtbaar(me, i.user_id, i.other_parent_id)).slice().reverse().map(itemOut) })),
            create: metDb((db, b, me) => {
                const f = fam(db, me);
                const gekocht = !!b.is_purchased;
                const i = { id: uuid(), user_id: me, other_parent_id: f.partner, title: tekst(b.title, "title", 200, true), category: ["Nodig", "Boodschap"].includes(b.category) ? b.category : "Nodig", child_ids: kinderen(db, me, b.child_ids ?? (b.child_id ? [b.child_id] : [])), is_purchased: gekocht, purchased_by: gekocht ? me : null, purchased_at: gekocht ? nu() : null, budget_id: budgetLink(db, me, b.budget_id), buyer_id: b.buyer === "me" ? me : null, deadline: tekst(b.deadline, "deadline", 40), notes: tekst(b.notes, "notes", 1000), created_at: nu() };
                db.still_needed_items.push(i);
                return ok({ item: itemOut(i) });
            }),
            toggle: metDb((db, b, me) => { const i = item(db, me, b.id); const g = !!b.is_purchased; Object.assign(i, { is_purchased: g, purchased_by: g ? me : null, purchased_at: g ? nu() : null }); return ok({ item: itemOut(i) }); }),
            link_budget: metDb((db, b, me) => { const i = item(db, me, b.id); i.budget_id = budgetLink(db, me, b.budget_id); return ok({ item: itemOut(i) }); }),
            set_buyer: metDb((db, b, me) => { const i = item(db, me, b.id); if (i.buyer_id && i.buyer_id !== me) throw new Fout(403, "FORBIDDEN", "other parent buys"); i.buyer_id = b.buyer === "me" ? me : null; return ok({ item: itemOut(i) }); }),
            update: metDb((db, b, me) => { const i = item(db, me, b.id); if (b.title !== undefined) i.title = tekst(b.title, "title", 200, true); if (b.category !== undefined) i.category = ["Nodig", "Boodschap"].includes(b.category) ? b.category : "Nodig"; if (b.deadline !== undefined) i.deadline = tekst(b.deadline, "deadline", 40); if (b.notes !== undefined) i.notes = tekst(b.notes, "notes", 1000); if (b.child_ids !== undefined) i.child_ids = kinderen(db, me, b.child_ids); return ok({ item: itemOut(i) }); }),
            delete: metDb((db, b, me) => { const i = item(db, me, b.id); db.still_needed_items = db.still_needed_items.filter((x) => x.id !== i.id); return ok({}); }),
        },
    };
}
