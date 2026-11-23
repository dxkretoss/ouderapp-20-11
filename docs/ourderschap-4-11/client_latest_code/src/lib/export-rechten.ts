/**
 * Eén centrale rechtencheck voor gedeelde gezinsinformatie.
 * Gebruikt door: schermweergave, dossierpreview, PDF-generatie en professionele export.
 * Regel: export geeft nooit méér dan wat de kijker in de normale interface mag zien.
 * Professionele privénotities en persoonlijke veiligheidsnotities zijn GEEN bron in dit model
 * en kunnen dus nooit via preview, PDF of geschiedenis bij ouders terechtkomen.
 */
import type { AuditSoort } from "./audit-store";

export type ProOnderdeel =
  | "Planning" | "Zorgregeling" | "Communicatie" | "Afspraken" | "Besluiten"
  | "Documenten" | "Kosten" | "Overdracht" | "Gesprekken" | "Opnames" | "Momentjes";

/** Bron van een gegeven. */
export type Bron = "agenda" | "verzoek" | "besluit" | "bericht" | "kost" | "document";

export type Kijker =
  | { type: "ouder"; id: "sanne" | "joris" }
  | { type: "professional"; dossierId: string; naam: string; toegang: readonly ProOnderdeel[]; kinderen: readonly string[]; vanaf: string };

/** Toegang van de mediator tot het dossier van dit gezin (enige bron; ook gebruikt door het professional-dashboard). */
export const proToegangBakker: ProOnderdeel[] = ["Planning", "Zorgregeling", "Documenten", "Afspraken"];
export const proKijkers: Record<string, Extract<Kijker, { type: "professional" }>> = {
  bakker: { type: "professional", dossierId: "bakker", naam: "Mediator", toegang: proToegangBakker, kinderen: ["Emma", "Noah"], vanaf: "2026-03-01" },
};

const bronNaarPro: Record<Bron, ProOnderdeel[]> = {
  agenda: ["Planning", "Afspraken", "Zorgregeling"],
  verzoek: ["Zorgregeling"],
  besluit: ["Besluiten"],
  bericht: ["Communicatie"],
  kost: ["Kosten"],
  document: ["Documenten"],
};
export const auditBron: Record<AuditSoort, Bron | null> = { afspraak: "agenda", schema: "verzoek", besluit: "besluit", kosten: "kost", dossier: null, taak: null, spul: null };

export function magBron(k: Kijker, bron: Bron): boolean {
  if (k.type === "ouder") return true; // beide ouders zien alle gedeelde gezinsinformatie
  return bronNaarPro[bron].some((o) => k.toegang.includes(o));
}
export function magAudit(k: Kijker, soort: AuditSoort): boolean {
  const b = auditBron[soort];
  if (!b) return k.type === "ouder"; // exportlog alleen voor ouders (accountbeveiliging)
  return magBron(k, b);
}
export const magKind = (k: Kijker, kind: string) => k.type === "ouder" || k.kinderen.includes(kind);
/** Vroegste datum die de kijker mag zien. */
export const vroegste = (k: Kijker) => (k.type === "ouder" ? null : new Date(`${k.vanaf}T00:00`));
