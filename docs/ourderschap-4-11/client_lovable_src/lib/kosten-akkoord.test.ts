import { describe, expect, test } from "bun:test";
import { berekenSaldo } from "./verrekening";
import { NIET_AKKOORD_STATUS, beoordeelKosten, wachtOpJouwAkkoord } from "./kosten-akkoord";
import type { Budget } from "./budget-store";

const sport = { id: "bs", wat: "Sportkosten", kind: "Noah", max: 100, pctSanne: 50, door: "Joris", categorie: "Sport", periode: "maand", geldigVan: "2025-01-01", geldigTot: "2025-06-30", status: "akkoord", aanZet: "Sanne", stappen: [] } as unknown as Budget;
const kamp = { id: "b2", wat: "Schoolkamp groep 6", kind: "Emma", max: 95, pctSanne: 50, door: "Sanne", categorie: "School", periode: "eenmalig", status: "akkoord", aanZet: "Sanne", stappen: [] } as unknown as Budget;
const k = (o: Record<string, unknown>) => ({ id: "x", omschrijving: "Zwemles", categorie: "Sport", kind: "Noah", datum: "10 maart", bedrag: 40, status: "wacht", betaaldDoor: "joris", ...o });

describe("budgetherkenning", () => {
  test("A: volledig binnen bevestigd budget vraagt geen akkoord", () => {
    const b = beoordeelKosten([k({ omschrijving: "Schoolkamp Emma", categorie: "School", kind: "Emma", bedrag: 90 })], [kamp]).get("x");
    expect(b?.soort).toBe("gedekt");
  });
  test("B: €60 + €30 + €40 in één maand → derde boven rest van €10", () => {
    const m = beoordeelKosten([k({ id: "c", omschrijving: "Extra sportles", datum: "12 maart" }), k({ id: "b", omschrijving: "Sportmateriaal", bedrag: 30, datum: "5 maart" }), k({ id: "a", bedrag: 60, datum: "2 maart" })], [sport]);
    expect(m.get("a")?.soort).toBe("gedekt");
    expect(m.get("b")).toMatchObject({ soort: "gedekt", rest: 10 });
    expect(m.get("c")).toMatchObject({ soort: "boven", rest: 10 });
    expect(wachtOpJouwAkkoord(k({ id: "c" }), m.get("c"))).toBe(true);
  });
  test("C: buiten geldigheid geen dekking", () => {
    expect(beoordeelKosten([k({ datum: "10 augustus" })], [sport]).get("x")).toBeNull();
  });
  test("D: ander kind geen dekking", () => {
    expect(beoordeelKosten([k({ kind: "Emma" })], [sport]).get("x")).toBeNull();
  });
  test("E: dubbel ingevoerde uitgave wordt gemarkeerd", () => {
    const m = beoordeelKosten([k({ id: "n" }), k({ id: "o" })], [sport]);
    expect(m.get("n")?.soort).toBe("dubbel");
  });
  test("onbekende datum → onzeker, nooit automatisch gedekt", () => {
    expect(beoordeelKosten([k({ datum: "binnenkort" })], [sport]).get("x")?.soort).toBe("onzeker");
  });
  test("F: na tegenvoorstel wacht de uitgave op de ander", () => {
    expect(wachtOpJouwAkkoord(k({ aanZet: "joris" }), null)).toBe(false);
  });
  test("H: niet akkoord telt niet mee in de afrekening", () => {
    const post = { ...k({}), icoon: "", verdeling: "50 / 50", aandeelSanne: 20, status: NIET_AKKOORD_STATUS } as never;
    expect(berekenSaldo([post]).netto).toBe(0);
  });
});
