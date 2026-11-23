/**
 * Abonnementsvormen als configuratie: nieuwe vormen toevoegen = één item erbij.
 * Betaling is nog niet gekoppeld; `start` gaat later via een betaalprovider.
 * Prijzen zijn voorlopige voorbeeldbedragen.
 */
export type Abonnement = {
  id: string;
  naam: string;
  prijsCent: number;
  periode: "maand" | "jaar";
  proefDagen: number;
  toelichting?: string;
};

export const abonnementen: Abonnement[] = [
  { id: "maand", naam: "Maandelijks", prijsCent: 499, periode: "maand", proefDagen: 14 },
  { id: "jaar", naam: "Jaarlijks", prijsCent: 4900, periode: "jaar", proefDagen: 14, toelichting: "Ongeveer 2 maanden voordeliger" },
];

export const inbegrepen = [
  "Gedeelde agenda en verdeling van de week per kind",
  "Berichten per onderwerp met formuleerhulp",
  "Kosten bijhouden en afrekenen",
  "Documenten, taken en spullen",
  "De kring rond je kind",
  "Dossier exporteren en wijzigingsgeschiedenis",
];

export const euro = (cent: number) => (cent / 100).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });

/** Beperkt bewaarabonnement: prijs en voorwaarden zijn configuratie, geen vaste architectuur. */
export const bewaarPlan = {
  naam: "Gegevens bewaren",
  prijsCent: 200,
  periode: "maand" as const,
  bewaartermijnMaanden: 24,
  blijftBewaard: ["Agenda en verdeling van de week", "Berichten", "Kosten en betalingen", "Documenten", "Momentjes", "Wijzigingsgeschiedenis"],
  blijftBeschikbaar: ["Alles bekijken (alleen lezen)", "Dossier exporteren", "Documenten downloaden"],
  gaatUit: ["Nieuwe afspraken, berichten of kosten toevoegen", "Voorstellen doen of beantwoorden", "Assistent en formuleerhulp", "Meldingen en herinneringen"],
};

import { useSyncExternalStore } from "react";
export type AbonnementStatus = "actief" | "opgezegd" | "bewaren" | "verwijderaanvraag";
type AbState = { status: AbonnementStatus; planId: string; verlengdatum: string; betaalmethode: string };
let ab: AbState = { status: "actief", planId: "jaar", verlengdatum: "2027-01-14", betaalmethode: "iDEAL · NL•• INGB •••• 4821" };
const abL = new Set<() => void>();
export const zetAbonnement = (p: Partial<AbState>) => { ab = { ...ab, ...p }; abL.forEach((l) => l()); };
export const useAbonnement = () => useSyncExternalStore((l) => { abL.add(l); return () => abL.delete(l); }, () => ab, () => ab);
