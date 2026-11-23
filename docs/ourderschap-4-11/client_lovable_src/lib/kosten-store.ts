import { useSyncExternalStore } from "react";
import { leg, legVerschillen } from "@/lib/audit-store";
import { kosten as startKosten } from "@/lib/demo-data";
import {
  berekenSaldo,
  standaardSleutels,
  type Verdeelsleutels,
  type VerrekenModus,
  type Verrekening,
  type OuderId,
  betaalOvergang,
  veiligeBetaallink,
} from "@/lib/verrekening";

export type Kost = (typeof startKosten)[number];

/** Gedeelde kostenlijst, zodat de homepagina altijd actueel is. */
let alle: Kost[] = [...startKosten];
const listeners = new Set<() => void>();

export function setKosten(fn: (l: Kost[]) => Kost[]) {
  const oud = alle;
  alle = fn(alle);
  // Elke wijziging in de kostenlijst wordt automatisch vastgelegd.
  alle.forEach((k) => {
    const o = oud.find((x) => x.id === k.id);
    if (!o) leg("kosten", k.id, k.omschrijving, "toegevoegd");
    else if (o !== k) legVerschillen("kosten", k.id, k.omschrijving, o, k, { omschrijving: "omschrijving", bedrag: "bedrag", verdeling: "verdeling", status: "status", kind: "kind", datum: "datum" });
  });
  oud.filter((o) => !alle.some((k) => k.id === o.id)).forEach((o) => leg("kosten", o.id, o.omschrijving, "verwijderd"));
  listeners.forEach((l) => l());
}

export function useKosten() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => alle,
    () => alle,
  );
}

/** Positief: Sanne betaalt aan Joris. Negatief: Joris betaalt aan Sanne. */
export function nogTeVerrekenen(lijst: Kost[]) {
  return -berekenSaldo(lijst).netto;
}

// --- Verrekeninstellingen en historie (demo-state) ---

let sleutels: Verdeelsleutels = { ...standaardSleutels };
let modus: VerrekenModus = "direct";
let ontvangerBevestigt = true;
let historie: Verrekening[] = [
  { id: "v1", maand: "Februari 2026", bedrag: 18.25, van: "sanne", aan: "joris", datum: "2 maart 2026", wijze: "Bankoverschrijving", status: "afgerond" },
  { id: "v2", maand: "Januari 2026", bedrag: 0, van: "sanne", aan: "joris", datum: "1 februari 2026", wijze: "Alles onderling verrekend", status: "afgerond" },
];

let instellingenSnapshot: { sleutels: Verdeelsleutels; modus: VerrekenModus; ontvangerBevestigt: boolean; historie: Verrekening[] } = { sleutels, modus, ontvangerBevestigt, historie };
function meldInstellingen() {
  instellingenSnapshot = { sleutels, modus, ontvangerBevestigt, historie };
  listeners.forEach((l) => l());
}

export function useVerrekenInstellingen() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => instellingenSnapshot,
    () => instellingenSnapshot,
  );
}

export function setSleutel(categorie: string, sanne: number) {
  sleutels = { ...sleutels, [categorie]: { sanne, joris: 100 - sanne } };
  meldInstellingen();
}

export function setModus(m: VerrekenModus) {
  modus = m;
  meldInstellingen();
}

export function setOntvangerBevestigt(v: boolean) {
  ontvangerBevestigt = v;
  meldInstellingen();
}

export function voegVerrekeningToe(v: Verrekening) {
  if (historie.some((h) => h.id === v.id || (v.kostIds?.length && h.kostIds?.some((id) => v.kostIds?.includes(id))))) return false;
  historie = [v, ...historie];
  meldInstellingen();
  return true;
}

export function updateVerrekening(id: string, status: Verrekening["status"]) {
  // Compatibility with the existing recipient confirmation, never an unrestricted status setter.
  if (status === "afgerond") return reageerOpVerrekening(id, "sanne", "ontvangen");
  return false;
}

/** Demo source, not a substitute for authenticated shared storage. */
export function startVerrekening(periode: "maand" | "jaar") {
  const huidig = berekenSaldo(alle);
  const ids = [...huidig.jorisAanSanne.posten, ...huidig.sanneAanJoris.posten].map((p) => p.post.id).sort();
  const bestaand = historie.find((v) => v.status !== "afgerond" && v.kostIds?.some((id) => ids.includes(id)));
  if (bestaand) return bestaand;
  if (Math.abs(huidig.netto) < 0.01 || !ids.length) return null;
  const datum = new Date();
  const v: Verrekening = { id: `V-${crypto.randomUUID()}`, maand: datum.toLocaleDateString("nl-NL", periode === "maand" ? { month: "long", year: "numeric" } : { year: "numeric" }), bedrag: Math.abs(huidig.netto), van: huidig.netto >= 0 ? "joris" : "sanne", aan: huidig.netto >= 0 ? "sanne" : "joris", datum: datum.toLocaleDateString("nl-NL"), wijze: "Handmatige afrekening", status: "nog-te-betalen", kostIds: ids };
  return voegVerrekeningToe(v) ? v : null;
}

export function deelBetaalverzoek(id: string, door: OuderId, link: string) {
  const url = veiligeBetaallink(link);
  const v = historie.find((h) => h.id === id);
  if (!url || !v || door !== v.aan || (v.status !== "nog-te-betalen" && v.status !== "betaalverzoek-gedeeld")) return false;
  historie = historie.map((h) => h.id === id ? { ...h, betaalverzoek: url, status: "betaalverzoek-gedeeld", gebeurtenissen: [...(h.gebeurtenissen ?? []), { status: "betaalverzoek-gedeeld", door, moment: new Date().toISOString() }] } : h);
  meldInstellingen();
  return true;
}

export function reageerOpVerrekening(id: string, door: OuderId, actie: "aangegeven" | "ontvangen" | "afronden") {
  const v = historie.find((h) => h.id === id);
  const nieuw = v ? betaalOvergang(v, door, actie) : null;
  if (!nieuw) return false;
  historie = historie.map((h) => h.id === id ? nieuw : h);
  if (actie === "ontvangen") setKosten((l) => l.map((k) => nieuw.kostIds?.includes(k.id) && (k.status === "openstaand" || (k.status as string) === "bevestigd") ? { ...k, status: "betaald" } : k));
  meldInstellingen();
  return true;
}

// --- Bijlagen en opmerkingen per kostenpost (append-only, gelogd in de audit trail) ---
export type Bijlage = Readonly<{ id: string; naam: string; soort: "bon" | "bijlage"; moment: string }>;
export type Opmerking = Readonly<{ id: string; tekst: string; door: string; moment: string }>;
let bijlagen: Record<string, readonly Bijlage[]> = { "1": [Object.freeze({ id: "bj1", naam: "kassabon.jpg", soort: "bon" as const, moment: "2026-03-08T10:00:00Z" })] };
let opmerkingen: Record<string, readonly Opmerking[]> = {};

export function voegBijlageToe(kostId: string, naam: string, soort: Bijlage["soort"], kostNaam: string) {
  const b = Object.freeze({ id: crypto.randomUUID(), naam, soort, moment: new Date().toISOString() });
  bijlagen = { ...bijlagen, [kostId]: Object.freeze([...(bijlagen[kostId] ?? []), b]) };
  leg("kosten", kostId, kostNaam, "UPDATED", { veld: soort === "bon" ? "bon/factuur" : "bijlage", oud: "—", nieuw: naam });
  listeners.forEach((l) => l());
}
export function voegOpmerkingToe(kostId: string, tekst: string, kostNaam: string) {
  const o = Object.freeze({ id: crypto.randomUUID(), tekst, door: "Sanne", moment: new Date().toISOString() });
  opmerkingen = { ...opmerkingen, [kostId]: Object.freeze([...(opmerkingen[kostId] ?? []), o]) };
  leg("kosten", kostId, kostNaam, "UPDATED", { veld: "opmerking", oud: "—", nieuw: tekst });
  listeners.forEach((l) => l());
}
export function useKostExtra(kostId: string) {
  useKosten();
  return { bijlagen: bijlagen[kostId] ?? [], opmerkingen: opmerkingen[kostId] ?? [] };
}
export const heeftBijlagen = (kostId: string) => (bijlagen[kostId]?.length ?? 0) > 0;
