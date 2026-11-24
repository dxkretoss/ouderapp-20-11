import { expect, test } from "bun:test";
import { kostenGezin } from "./kosten-testhulp";
// Twee-accountstests voor uitgaven en afrekenen tegen het manage-expenses-contract (mock = zelfde regels als de edge function).
const uitgave = (g, wie, x) => g.kosten(wie, "create-expense", { expense: { description: "Laarzen", amount: 20, date: "2026-11-02", child_ids: [g.KIND], split: "50", ...x } }).expense;
function gezinMetBevestigdeKosten() {
    const g = kostenGezin();
    const a = uitgave(g, "A", { amount: 20 }); // B is A 10 schuldig
    const b = uitgave(g, "B", { amount: 22.96, description: "Schoenen" }); // A is B 11,48 schuldig
    g.kosten("B", "respond-expense", { expense_id: a.id, response: "akkoord" });
    g.kosten("A", "respond-expense", { expense_id: b.id, response: "akkoord" });
    return { g, a, b };
}
test("de indiener ziet geen beurt; alleen de andere ouder reageert", () => {
    const g = kostenGezin();
    const e = uitgave(g, "A");
    expect(e.status).toBe("wacht");
    expect(e.turn_to_respond).toBe(g.B);
    expect(g.kosten("A", "respond-expense", { expense_id: e.id, response: "akkoord" }).fout).toBe("FORBIDDEN");
    expect(g.kosten("C", "respond-expense", { expense_id: e.id, response: "akkoord" }).fout).toBe("NOT_FOUND");
    expect(g.kosten("C", "overview").expenses).toHaveLength(0);
    // Ander voorstel: de beurt gaat terug naar de betaler; akkoord past het voorgestelde bedrag toe.
    g.kosten("B", "respond-expense", { expense_id: e.id, response: "ander_voorstel", amount: 16 });
    expect(g.kosten("B", "respond-expense", { expense_id: e.id, response: "akkoord" }).fout).toBe("FORBIDDEN");
    const na = g.kosten("A", "respond-expense", { expense_id: e.id, response: "akkoord" }).expense;
    expect(na.status).toBe("bevestigd");
    expect(na.amount).toBe(16);
});
test("kindrekening en helemaal voor mij worden nooit verrekend; solo-ouder houdt alleen bij", () => {
    const g = kostenGezin();
    expect(uitgave(g, "A", { paid_from: "kindrekening" }).status).toBe("opgeslagen");
    expect(uitgave(g, "A", { split: "volledig" }).status).toBe("opgeslagen");
    expect(uitgave(g, "C", { child_ids: [g.KIND_C] }).status).toBe("opgeslagen");
    expect(g.kosten("A", "start-settlement", { expense_ids: g.kosten("A", "overview").expenses.map((e) => e.id) }).fout).toBe("VALIDATION");
});
test("grensbedrag: daarboven eerst een budget en een bon", () => {
    const g = kostenGezin();
    const a = g.kosten("A", "save-agreement", { split_mode: "eigen", my_pct: 60, settle_moment: "maand", approval_threshold: 50 }).agreement;
    expect(a.pending.status).toBe("voorgesteld");
    expect(g.kosten("A", "respond-agreement", { agreement_id: a.pending.id, response: "akkoord" }).fout).toBe("FORBIDDEN");
    expect(g.kosten("B", "respond-agreement", { agreement_id: a.pending.id, response: "akkoord" }).agreement.current.approval_threshold).toBe(50);
    expect(g.kosten("A", "create-expense", { expense: { description: "Fiets", amount: 120, child_ids: [g.KIND], split: "standaard", payer_pct: 60 } }).fout).toBe("VALIDATION");
    const b = g.kosten("A", "create-budget", { budget: { title: "Fiets", amount: 150, my_pct: 60 } }).budget;
    g.kosten("B", "respond-budget", { budget_id: b.id, response: "akkoord" });
    expect(g.kosten("A", "create-expense", { expense: { description: "Fiets", amount: 120, budget_id: b.id } }).fout).toBe("VALIDATION");
    const e = g.kosten("A", "create-expense", { expense: { description: "Fiets", amount: 120, budget_id: b.id }, receipt: "data:image/png;base64,iVBORw0KGgo=" }).expense;
    expect(e.payer_pct).toBe(60);
    expect(e.attachments).toHaveLength(1);
    // Binnen budget: telt zonder nieuw akkoord mee in de afrekening (B is A 40% van 120 = 48 schuldig).
    expect(g.kosten("A", "start-settlement", { expense_ids: [e.id] }).settlement.amount).toBe(48);
});
test("dezelfde posten krijgen geen tweede verrekening", () => {
    const { g, a, b } = gezinMetBevestigdeKosten();
    const eerste = g.kosten("A", "start-settlement", { expense_ids: [a.id, b.id] }).settlement;
    expect(eerste.amount).toBe(1.48);
    expect(eerste.payer_id).toBe(g.A);
    expect(g.kosten("B", "start-settlement", { expense_ids: [a.id, b.id] }).settlement.id).toBe(eerste.id);
});
test("link delen alleen door ontvanger en verandert kosten niet", () => {
    const { g, a, b } = gezinMetBevestigdeKosten();
    const v = g.kosten("A", "start-settlement", { expense_ids: [a.id, b.id] }).settlement;
    const voor = JSON.stringify(g.kosten("A", "overview").expenses);
    expect(g.kosten("A", "share-payment-request", { settlement_id: v.id, payment_link: "https://tikkie.me/pay/test" }).fout).toBe("FORBIDDEN");
    expect(g.kosten("B", "share-payment-request", { settlement_id: v.id, payment_link: "https://tikkie.me.evil.test/pay/x" }).fout).toBe("VALIDATION");
    expect(g.kosten("B", "share-payment-request", { settlement_id: v.id, bank_iban: "NL00BANK0123456789" }).fout).toBe("VALIDATION");
    const s = g.kosten("B", "share-payment-request", { settlement_id: v.id, payment_link: "https://tikkie.me/pay/test", description: "Gezamenlijke kosten", bank_iban: "NL91 ABNA 0417 1643 00", bank_account_name: "B" }).settlement;
    expect(s.status).toBe("betaalverzoek-gedeeld");
    expect(s.bank_iban).toBe("NL91ABNA0417164300");
    expect(g.kosten("A", "overview").settlements[0].description).toBe("Gezamenlijke kosten");
    expect(g.kosten("C", "overview").settlements).toHaveLength(0);
    expect(JSON.stringify(g.kosten("A", "overview").expenses)).toBe(voor);
});
test("betaalmelding wijzigt geen kosten; ontvangst alleen gekoppelde posten, één keer", () => {
    const { g, a, b } = gezinMetBevestigdeKosten();
    const v = g.kosten("A", "start-settlement", { expense_ids: [a.id, b.id] }).settlement;
    const later = uitgave(g, "B", { description: "Later" });
    g.kosten("A", "respond-expense", { expense_id: later.id, response: "akkoord" });
    const voor = g.kosten("A", "overview").expenses;
    expect(g.kosten("A", "indicate-payment", { settlement_id: v.id }).settlement.status).toBe("wacht-op-ontvanger");
    expect(g.kosten("A", "overview").expenses).toEqual(voor);
    expect(g.kosten("A", "confirm-receipt", { settlement_id: v.id }).fout).toBe("FORBIDDEN");
    expect(g.kosten("B", "confirm-receipt", { settlement_id: v.id }).settlement.status).toBe("ontvangst-bevestigd");
    expect(g.kosten("B", "confirm-receipt", { settlement_id: v.id }).fout).toBe("FORBIDDEN");
    const na = g.kosten("A", "overview").expenses;
    expect(na.filter((e) => v.expense_ids.includes(e.id)).every((e) => e.status === "verrekend")).toBe(true);
    expect(na.find((e) => e.id === later.id).status).toBe("bevestigd");
    expect(g.kosten("B", "finish-settlement", { settlement_id: v.id }).settlement.status).toBe("afgerond");
    expect(g.kosten("B", "finish-settlement", { settlement_id: v.id }).fout).toBe("FORBIDDEN");
});
test("nog nodig: gedeeld met de andere ouder, nooit met een ander gezin; koppelt alleen een budget-id", () => {
    const g = kostenGezin();
    const i = g.nogNodig("A", "create", { title: "Regenlaarzen", child_ids: [g.KIND] }).item;
    expect(g.nogNodig("B", "list").items.map((x) => x.id)).toEqual([i.id]);
    expect(g.nogNodig("C", "list").items).toHaveLength(0);
    expect(g.nogNodig("C", "toggle", { id: i.id, is_purchased: true }).fout).toBe("NOT_FOUND");
    const b = g.kosten("B", "create-budget", { budget: { title: "Laarzen", amount: 30 } }).budget;
    expect(g.nogNodig("A", "link_budget", { id: i.id, budget_id: b.id }).item.budget_id).toBe(b.id);
    expect(g.nogNodig("B", "toggle", { id: i.id, is_purchased: true }).item.is_purchased).toBe(true);
    expect(g.kosten("A", "overview").expenses).toHaveLength(0);
    expect(g.nogNodig("B", "set_buyer", { id: i.id, buyer: "me" }).item.buyer_id).toBe(g.B);
    expect(g.nogNodig("A", "set_buyer", { id: i.id, buyer: "me" }).fout).toBe("FORBIDDEN");
});
