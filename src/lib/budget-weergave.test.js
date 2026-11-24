import { expect, test } from "bun:test";
import { bevestigdBudget, gekoppeldBudget } from "./budget-weergave";
import { kostenGezin } from "./kosten-testhulp";
import { budgetVan } from "./kosten-store";
const leesBudgetten = (g) => g.kosten("A", "overview").budgets.map((b) => budgetVan(b, g.A, []));
test("ander voorstel wordt pas bevestigd na reactie van vereiste ouder", () => {
    const g = kostenGezin();
    const id = g.kosten("A", "create-budget", { budget: { title: "Laarzen", amount: 40, my_pct: 50 } }).budget.id;
    g.kosten("B", "respond-budget", { budget_id: id, response: "ander_voorstel", amount: 60 });
    expect(gekoppeldBudget(id, leesBudgetten(g))).toBeUndefined();
    g.kosten("A", "respond-budget", { budget_id: id, response: "akkoord" });
    expect(gekoppeldBudget(id, leesBudgetten(g))?.max).toBe(60);
});
test("afwijzing bewaart originele bedrag en historie en wordt geen akkoord of uitgave", () => {
    const g = kostenGezin();
    const id = g.kosten("A", "create-budget", { budget: { title: "Helm", amount: 35, my_pct: 50 } }).budget.id;
    g.kosten("B", "respond-budget", { budget_id: id, response: "niet_akkoord" });
    const bron = leesBudgetten(g).find((b) => b.id === id);
    expect(bron?.status).toBe("geweigerd");
    expect(bron?.max).toBe(35);
    expect(bron?.kostId).toBeUndefined();
    expect(bron?.stappen.map((s) => s.wat)).toEqual(["Voorstel", "Niet akkoord"]);
    expect(gekoppeldBudget(id, leesBudgetten(g))).toBeUndefined();
    expect(g.kosten("A", "overview").expenses).toHaveLength(0);
});
const budget = { id: "b-test", wat: "Laarzen", kind: "Noah", max: 40, pctIk: 50, door: "ik", status: "akkoord", aanZet: "ander", stappen: [{ wie: "ander", wat: "Akkoord", moment: "2026-10-20" }] };
test("alleen expliciet gekoppeld bevestigd budget verschijnt bij een taak", () => {
    expect(gekoppeldBudget(budget.id, [budget])?.max).toBe(40);
    expect(gekoppeldBudget(undefined, [budget])).toBeUndefined();
});
test("onbevestigd voorstel verschijnt niet als afgesproken bedrag", () => {
    expect(bevestigdBudget({ ...budget, status: "wacht", stappen: [] })).toBeUndefined();
});
test("een voorgestelde wijziging vervangt het bevestigde bedrag niet", () => {
    expect(bevestigdBudget({ ...budget, status: "tegenvoorstel", stappen: [...budget.stappen, { wie: "ik", wat: "Ander voorstel", bedrag: 60, moment: "2026-10-21" }] })?.max).toBe(40);
});
test("na bevestigde wijziging wordt het actuele bedrag gelezen", () => {
    expect(gekoppeldBudget(budget.id, [{ ...budget, max: 60 }])?.max).toBe(60);
});
