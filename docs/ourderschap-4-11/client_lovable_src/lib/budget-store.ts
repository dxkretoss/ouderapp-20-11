/**
 * Budgetvoorstellen: afspraken over een TOEKOMSTIGE uitgave. Nooit zelf een kostenpost.
 * Flow: voorstel → reactie → eventueel tegenvoorstel → akkoord ("Afgesproken budget") → later "Uitgave toevoegen" via de bestaande kostenflow.
 * Elke stap wordt als nieuw audit-event vastgelegd; eerdere stappen worden niet overschreven (stappen-array is append-only).
 */
import { useSyncExternalStore } from "react";
import { leg } from "@/lib/audit-store";
import { verwerkActie } from "@/lib/acties-store";

export type BudgetStatus = "wacht" | "tegenvoorstel" | "akkoord" | "geweigerd" | "uitgegeven" | "ingetrokken";
export type BudgetStap = Readonly<{ wie: "Sanne" | "Joris"; wat: string; bedrag?: number; moment: string }>;
export type Budget = {
  id: string; wat: string; kind: string; max: number; pctSanne: number; door: "Sanne" | "Joris";
  toelichting?: string | undefined; bijlage?: string | undefined; status: BudgetStatus;
  /** Wie moet nu reageren. */
  aanZet: "Sanne" | "Joris"; stappen: readonly BudgetStap[]; kostId?: string;
  /** Kostencategorie waarvoor het budget geldt (zoals in de kostenlijst). Ontbreekt: alleen herkenbaar onderwerp. */
  categorie?: string;
  /** Eenmalig (standaard), per maand of per jaar maximaal `max`. */
  periode?: "eenmalig" | "maand" | "jaar";
  /** Geldigheid (ISO-datum), inclusief. */
  geldigVan?: string; geldigTot?: string;
  /** Extra voorwaarden: dan nooit automatisch gedekt. */
  voorwaarden?: string;
  /** Gewenste reactiedatum (ISO) — een verzoek, nooit een bindende termijn. Verstrijken verandert niets automatisch. */
  reactieDatum?: string;
};

const nu = () => new Date().toISOString();
let lijst: Budget[] = [
  { id: "b1", wat: "Nieuwe voetbalschoenen", kind: "Noah", max: 60, pctSanne: 50, door: "Joris", toelichting: "Zijn oude zijn te klein, seizoen loopt nog tot juni.", status: "wacht", aanZet: "Sanne", stappen: [{ wie: "Joris", wat: "Voorstel", bedrag: 60, moment: "2026-10-02T18:00:00Z" }] },
  { id: "b2", wat: "Schoolkamp groep 6", kind: "Emma", max: 95, pctSanne: 50, door: "Sanne", categorie: "School", periode: "eenmalig", status: "akkoord", aanZet: "Sanne", stappen: [{ wie: "Sanne", wat: "Voorstel", bedrag: 95, moment: "2026-09-20T10:00:00Z" }, { wie: "Joris", wat: "Akkoord", moment: "2026-09-21T09:00:00Z" }] },
  { id: "b3", wat: "Sportkosten Noah", kind: "Noah", max: 100, pctSanne: 50, door: "Joris", categorie: "Sport", periode: "maand", geldigVan: "2025-01-01", geldigTot: "2025-12-31", status: "akkoord", aanZet: "Sanne", stappen: [{ wie: "Joris", wat: "Voorstel", bedrag: 100, moment: "2025-01-05T10:00:00Z" }, { wie: "Sanne", wat: "Akkoord", moment: "2025-01-06T09:00:00Z" }] },
];
const listeners = new Set<() => void>();
const zet = (id: string, fn: (b: Budget) => Budget) => { lijst = lijst.map((b) => (b.id === id ? fn(b) : b)); listeners.forEach((l) => l()); };
const stap = (b: Budget, s: Omit<BudgetStap, "moment">) => Object.freeze([...b.stappen, Object.freeze({ ...s, moment: nu() })]);
const verdeling = (pct: number) => `${pct} / ${100 - pct}`;
const ander = (w: "Sanne" | "Joris") => (w === "Sanne" ? "Joris" : "Sanne");

export function nieuwBudget(b: Omit<Budget, "id" | "status" | "aanZet" | "stappen" | "door">) {
  const v: Budget = { ...b, id: `b${Date.now()}`, door: "Sanne", status: "wacht", aanZet: "Joris", stappen: [{ wie: "Sanne", wat: "Voorstel", bedrag: b.max, moment: nu() }] };
  lijst = [v, ...lijst]; listeners.forEach((l) => l());
  leg("kosten", v.id, `Budget: ${v.wat}`, "CREATED", undefined, "Sanne", { meta: { soort: "budgetvoorstel", bedrag: String(v.max), verdeling: verdeling(v.pctSanne) } });
  return v.id;
}
export function reageer(id: string, wie: "Sanne" | "Joris", r: "akkoord" | "geweigerd" | { tegen: number }) {
  const b = lijst.find((x) => x.id === id);
  if (!b || b.aanZet !== wie || (b.status !== "wacht" && b.status !== "tegenvoorstel")) return;
  if (typeof r === "object") {
    zet(id, (x) => ({ ...x, status: "tegenvoorstel", aanZet: ander(wie), stappen: stap(x, { wie, wat: "Tegenvoorstel", bedrag: r.tegen }) }));
    leg("kosten", id, `Budget: ${b.wat}`, "UPDATED", { veld: "budget (tegenvoorstel)", oud: String(b.stappen.at(-1)?.bedrag ?? b.max), nieuw: String(r.tegen) }, wie);
  } else {
    const laatste = [...b.stappen].reverse().find((s) => s.bedrag)?.bedrag ?? b.max;
    zet(id, (x) => ({ ...x, status: r, ...(r === "akkoord" ? { max: laatste } : {}), stappen: stap(x, { wie, wat: r === "akkoord" ? "Akkoord" : "Niet akkoord" }) }));
    leg("kosten", id, `Budget: ${b.wat}`, r === "akkoord" ? "ACCEPTED" : "DECLINED", undefined, wie, { meta: { bedrag: String(laatste) } });
  }
  if (id === "b1") verwerkActie("budget-voetbalschoenen");
}
export function trekBudgetIn(id: string, wie: "Sanne" | "Joris" = "Sanne"): boolean {
  const b = lijst.find((x) => x.id === id);
  if (!b || (b.status !== "wacht" && b.status !== "tegenvoorstel") || b.aanZet === wie) return false;
  zet(id, (x) => ({ ...x, status: "ingetrokken", stappen: stap(x, { wie, wat: "Ingetrokken" }) }));
  leg("kosten", id, `Budget: ${b.wat}`, "CANCELLED", { veld: "status", oud: b.status, nieuw: "ingetrokken" }, wie);
  if (id === "b1") verwerkActie("budget-voetbalschoenen");
  return true;
}
/** Meer tijd vragen: alleen wie aan zet is; het voorstel blijft open, zonder instemming of verplichting. */
export function vraagMeerTijdBudget(id: string, wie: "Sanne" | "Joris", tot?: string): boolean {
  const b = lijst.find((x) => x.id === id);
  if (!b || b.aanZet !== wie || (b.status !== "wacht" && b.status !== "tegenvoorstel")) return false;
  zet(id, (x) => ({ ...x, stappen: stap(x, { wie, wat: tot ? `Meer tijd gevraagd (tot ${tot})` : "Meer tijd gevraagd" }) }));
  leg("kosten", id, `Budget: ${b.wat}`, "UPDATED", { veld: "reactie", oud: "open", nieuw: "meer tijd gevraagd" }, wie);
  return true;
}
/** Vriendelijke herinnering: alleen de verzender (wie níet aan zet is); vastgelegd als stap, begrensd via herinneringen.ts. */
export function stuurBudgetHerinnering(id: string, wie: "Sanne" | "Joris"): boolean {
  const b = lijst.find((x) => x.id === id);
  if (!b || b.aanZet === wie || (b.status !== "wacht" && b.status !== "tegenvoorstel")) return false;
  zet(id, (x) => ({ ...x, stappen: stap(x, { wie, wat: "Herinnering verstuurd" }) }));
  leg("kosten", id, `Budget: ${b.wat}`, "UPDATED", { veld: "herinnering", oud: "", nieuw: "herinnering verstuurd" }, wie);
  return true;
}
export function koppelUitgave(id: string, kostId: string, bedrag: number) {
  const b = lijst.find((x) => x.id === id);
  if (!b || b.status !== "akkoord") return;
  zet(id, (x) => ({ ...x, status: "uitgegeven", kostId, stappen: stap(x, { wie: "Sanne", wat: "Werkelijke uitgave", bedrag }) }));
  leg("kosten", id, `Budget: ${b.wat}`, "UPDATED", { veld: "werkelijke uitgave", oud: `budget ${b.max}`, nieuw: String(bedrag) }, "Sanne", { meta: { kostId } });
}
export function useBudgetten() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => lijst, () => lijst);
}
