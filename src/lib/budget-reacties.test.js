import { expect, test } from "bun:test";
import { kostenGezin } from "./kosten-testhulp";
import { budgetVan } from "./kosten-store";
import { bevestigdBudget } from "./budget-weergave";
// Twee-accountstests tegen het manage-expenses-contract (mock = zelfde regels als de edge function).
const nieuw = (g, wie = "A", amount = 60) => g.kosten(wie, "create-budget", { budget: { title: "Testbudget", amount, my_pct: 50, child_ids: [g.KIND] } }).budget;
const lees = (g, wie, id) => g.kosten(wie, "overview").budgets.find((b) => b.id === id);
test("meer tijd bewaart gekozen moment zonder akkoord, bedragwijziging of kosten", () => {
    const g = kostenGezin();
    const b = nieuw(g);
    const tot = new Date(Date.now() + 3 * 86400000).toISOString();
    expect(g.kosten("B", "respond-budget", { budget_id: b.id, response: "meer_tijd", review_at: tot }).budget.status).toBe("wacht");
    const v = budgetVan(lees(g, "A", b.id), g.A, []);
    expect(v.stappen.at(-1)?.terugkijkMoment).toBe(tot);
    expect(v.aanZet).toBe("ander");
    expect(v.max).toBe(60);
    expect(v.kostId).toBeUndefined();
    expect(Boolean(bevestigdBudget(v))).toBe(false);
    expect(g.kosten("A", "overview").expenses).toHaveLength(0);
    expect(g.kosten("B", "respond-budget", { budget_id: b.id, response: "akkoord" }).budget.status).toBe("akkoord");
});
test("uitstel in het verleden of door de indiener verandert niets", () => {
    const g = kostenGezin();
    const b = nieuw(g);
    expect(g.kosten("B", "respond-budget", { budget_id: b.id, response: "meer_tijd", review_at: "2020-01-01T20:00:00Z" }).fout).toBe("VALIDATION");
    expect(g.kosten("A", "respond-budget", { budget_id: b.id, response: "meer_tijd" }).fout).toBe("FORBIDDEN");
    expect(lees(g, "A", b.id).steps).toHaveLength(1);
});
test("eigen voorstel goedkeuren wordt geweigerd; een andere familie ziet niets", () => {
    const g = kostenGezin();
    const b = nieuw(g);
    expect(g.kosten("A", "respond-budget", { budget_id: b.id, response: "akkoord" }).fout).toBe("FORBIDDEN");
    expect(g.kosten("C", "respond-budget", { budget_id: b.id, response: "akkoord" }).fout).toBe("NOT_FOUND");
    expect(g.kosten("C", "overview").budgets).toHaveLength(0);
    expect(lees(g, "B", b.id).turn_to_respond).toBe(g.B);
});
test("vier budgetreacties houden één bron en akkoord vereist de andere ouder", () => {
    const g = kostenGezin();
    const b = nieuw(g, "A", 20);
    g.kosten("B", "respond-budget", { budget_id: b.id, response: "meer_tijd" });
    expect(lees(g, "A", b.id).status).toBe("wacht");
    g.kosten("B", "respond-budget", { budget_id: b.id, response: "ander_voorstel", amount: 18 });
    expect(budgetVan(lees(g, "A", b.id), g.A, []).aanZet).toBe("ik");
    expect(lees(g, "A", b.id).amount).toBe(20);
    g.kosten("A", "respond-budget", { budget_id: b.id, response: "akkoord" });
    expect(lees(g, "A", b.id).amount).toBe(18);
    expect(lees(g, "A", b.id).status).toBe("akkoord");
    // Wijziging: het afgesproken bedrag en de verdeling blijven gelden tot akkoord; niet akkoord houdt de oude afspraak.
    expect(g.kosten("A", "change-budget", { budget_id: b.id, amount: 25, my_pct: 60 }).budget.status).toBe("tegenvoorstel");
    expect(lees(g, "A", b.id).amount).toBe(18);
    expect(lees(g, "A", b.id).creator_pct).toBe(50);
    g.kosten("B", "respond-budget", { budget_id: b.id, response: "niet_akkoord" });
    expect(lees(g, "A", b.id).amount).toBe(18);
    expect(lees(g, "A", b.id).status).toBe("akkoord");
    expect(lees(g, "A", b.id).steps.at(-1)?.type).toBe("niet_akkoord");
    g.kosten("A", "change-budget", { budget_id: b.id, amount: 25, my_pct: 60 });
    expect(g.kosten("B", "withdraw-budget", { budget_id: b.id }).fout).toBe("FORBIDDEN");
    expect(g.kosten("A", "withdraw-budget", { budget_id: b.id }).budget.status).toBe("akkoord");
    expect(lees(g, "A", b.id).amount).toBe(18);
    // Stappen zijn append-only: alles staat er nog.
    expect(lees(g, "B", b.id).steps.map((s) => s.type)).toEqual(["voorstel", "meer_tijd", "ander_voorstel", "akkoord", "wijzigingsvoorstel", "niet_akkoord", "wijzigingsvoorstel", "ingetrokken"]);
});
test("een budget wordt nooit een uitgave en telt niet mee in een afrekening", () => {
    const g = kostenGezin();
    const b = nieuw(g);
    g.kosten("B", "respond-budget", { budget_id: b.id, response: "akkoord" });
    expect(g.kosten("A", "overview").expenses).toHaveLength(0);
    expect(g.kosten("A", "start-settlement", { expense_ids: [b.id] }).fout).toBe("VALIDATION");
});
