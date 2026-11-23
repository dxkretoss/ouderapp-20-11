/**
 * "Even je verhaal kwijt?" — privé gesprek met de AI.
 * Geen eigen kopie van afspraken/berichten: context wordt per vraag uit de bestaande bronnen opgebouwd.
 * Toestemming en (optioneel) bewaarde gesprekken staan alleen op dit apparaat.
 */
export type VerhaalModus = "praten" | "overzicht" | "doen";
export type VerhaalRol = "ouder" | "ai";
export type VerhaalBericht = { rol: VerhaalRol; tekst: string; acties?: VerhaalActie[]; concept?: string };
export const verhaalActies = ["bericht", "vakanties", "samen_regelen", "taken", "afspraken", "agenda", "praten", "niets"] as const;
export type VerhaalActie = (typeof verhaalActies)[number];

export const actieInfo: Record<VerhaalActie, { label: string; to?: string }> = {
  bericht: { label: "Help me een bericht schrijven", to: "/berichten" },
  vakanties: { label: "Bekijk de vakantieplanning", to: "/planning" },
  samen_regelen: { label: "Bekijk de voorstellen", to: "/samen-regelen" },
  taken: { label: "Bekijk de taken", to: "/taken" },
  afspraken: { label: "Bekijk de afspraken", to: "/afspraken" },
  agenda: { label: "Bekijk de agenda", to: "/agenda" },
  praten: { label: "Ik wil nog even praten" },
  niets: { label: "Voor nu niets doen" },
};

/** Maximaal drie acties; in praat-modus nooit ongevraagd een vervolgstap. */
export function kiesActies(acties: readonly string[], modus: VerhaalModus): VerhaalActie[] {
  if (modus === "praten") return [];
  const geldig = acties.filter((a): a is VerhaalActie => (verhaalActies as readonly string[]).includes(a));
  return [...new Set(geldig)].slice(0, 3);
}

/** Lokale herkenning van ernstige zorgen; toont altijd hulpinformatie, ook als de AI faalt. */
export function zorgSignaal(tekst: string): boolean {
  return /\b(sla(at|an)? me|geslagen|mishandel|geweld|bedreig|dreigt|stalk|achtervolg|bang voor (hem|haar)|niet veilig|onveilig|zelfmoord|mezelf (iets )?aan(doen)?|niet meer leven|dood willen|wil dood|zelfbeschadig|snijd mezelf|misbruik)/i.test(tekst);
}

export const contextCategorieen = ["vakanties", "voorstellen", "taken", "afspraken"] as const;
export type ContextCategorie = (typeof contextCategorieen)[number];
export const categorieLabel: Record<ContextCategorie, string> = {
  vakanties: "Vakantieplanning",
  voorstellen: "Open voorstellen",
  taken: "Taken",
  afspraken: "Vastgelegde afspraken",
};

type Bronnen = {
  vakanties: readonly { naam: string; periode: string; ouder: string; status: string; van?: string | undefined }[];
  voorstellen: readonly { titel: string; status: string }[];
  taken: readonly { tekst: string; wie: string; klaar: boolean; overdragenAan?: string | undefined }[];
  afspraken: readonly { titel: string; tekst: string }[];
};

const vakStatus = (s: string, van?: string) =>
  s === "afgesproken" ? "bevestigd (afgesproken)" : s === "voorstel" ? `voorstel van ${van ?? "onbekend"}, nog GEEN akkoord` : s === "open" ? "nog niet geregeld" : "ingetrokken";

/** Bouwt alleen de gekozen, relevante categorieën op. Voorstellen worden nooit als afspraak benoemd. */
export function bouwVerhaalContext(b: Bronnen, kies: readonly ContextCategorie[]): string {
  const delen: string[] = [];
  if (kies.includes("vakanties")) delen.push("VAKANTIES:\n" + b.vakanties.map((v) => `- ${v.naam} (${v.periode}): ${v.ouder} — ${vakStatus(v.status, v.van)}`).join("\n"));
  if (kies.includes("voorstellen")) delen.push("OPEN VOORSTELLEN (geen afspraak tot akkoord):\n" + (b.voorstellen.length ? b.voorstellen.map((v) => `- ${v.titel}: ${v.status}`).join("\n") : "- geen"));
  if (kies.includes("taken")) delen.push("TAKEN:\n" + b.taken.filter((t) => !t.klaar).map((t) => `- ${t.tekst}: ${t.wie ? `regelt ${t.wie}` : "nog niemand"}${t.overdragenAan ? " (overdracht wacht op acceptatie)" : ""}`).join("\n"));
  if (kies.includes("afspraken")) delen.push("VASTGELEGDE AFSPRAKEN:\n" + b.afspraken.map((a) => `- ${a.titel}: ${a.tekst}`).join("\n"));
  return delen.join("\n\n");
}

// --- Apparaatopslag: toestemming en bewaarde gesprekken ---
const TOESTEMMING = "onzeapp-verhaal-toestemming";
const BEWAARD = "onzeapp-verhaal-bewaard";
export type Toestemming = "ja" | "nee" | null;

export function leesToestemming(): Toestemming {
  try { const v = localStorage.getItem(TOESTEMMING); return v === "ja" || v === "nee" ? v : null; } catch { return null; }
}
export function zetToestemming(v: Toestemming) {
  try { if (v) localStorage.setItem(TOESTEMMING, v); else localStorage.removeItem(TOESTEMMING); } catch { /* geen opslag */ }
}
export function leesBewaard(): VerhaalBericht[] {
  try { const r = JSON.parse(localStorage.getItem(BEWAARD) ?? "[]"); return Array.isArray(r) ? r : []; } catch { return []; }
}
export function bewaarGesprek(b: VerhaalBericht[]) {
  try { localStorage.setItem(BEWAARD, JSON.stringify(b.map(({ rol, tekst }) => ({ rol, tekst })))); } catch { /* geen opslag */ }
}
export function verwijderBewaard() {
  try { localStorage.removeItem(BEWAARD); } catch { /* geen opslag */ }
}
