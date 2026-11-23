import type { Bericht } from "./demo-data";
import { bevatBelediging } from "./belediging";
import { mogelijkeOnveiligheid } from "./communicatie-suggesties";

export const meedenkKeuzes = ["Even ventileren", "Gesprek begrijpen", "Reactie opstellen", "Wat is afgesproken?"] as const;
export type MeedenkKeuze = typeof meedenkKeuzes[number];

/** Never receive the live composer/conversation: only the selected fictitious source. */
export function voorbeeldContext(berichten: readonly Bericht[], toestemming: boolean, eigen: boolean) {
  if (!toestemming || eigen) return [];
  return berichten.slice(-6).map((b) => ({ van: b.van === "sanne" ? "ik" as const : "ander" as const, tekst: b.tekst.slice(0, 1200) }));
}

export function conceptBruikbaar(tekst: string) {
  return !!tekst.trim() && !bevatBelediging(tekst) && !mogelijkeOnveiligheid(tekst);
}

export function overnameKeuze(huidig: string, concept: string, bevestigd = false): string | null {
  if (!conceptBruikbaar(concept) || (huidig.trim() && !bevestigd)) return null;
  return concept;
}