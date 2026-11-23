import { useSyncExternalStore } from "react";
import { leg } from "@/lib/audit-store";
import { kringState, mag, wieNaam, type Moment } from "@/lib/kring-store";
import { startState } from "@/lib/start-store";

/**
 * Taken (eenmalig/terugkerend, met herinnering en overdragen) en spullen tussen huizen.
 * Verantwoordelijken komen uit hetzelfde generieke "wie"-model als momenten: "sanne" | "joris" | kringpersoon-id.
 */
export type Herhaling = "eenmalig" | "wekelijks" | "maandelijks" | "jaarlijks" | "aangepast";
/** Status van een contacttaak (bijv. contact opnemen met school). Eén bron: de agenda leest dezelfde taak. */
export type ContactStatus = "nog-te-regelen" | "contact-opgenomen" | "wacht-op-reactie" | "afgerond" | "niet-mogelijk";
export const contactStatusLabel: Record<ContactStatus, string> = {
  "nog-te-regelen": "Nog te regelen",
  "contact-opgenomen": "Contact opgenomen",
  "wacht-op-reactie": "Wacht op reactie",
  afgerond: "Afgerond",
  "niet-mogelijk": "Niet mogelijk",
};
export type Taak = {
  id: string;
  tekst: string;
  /** "emma" | "noah" | "beide" bij het voorbeeldgezin; bij een eigen gezin het eigen kind-id of "alle". */
  kind: string;
  wie: string; // "" = nog niemand
  klaar: boolean;
  herhaling: Herhaling;
  herhalingTekst?: string;
  deadline?: string; // ISO datum
  herinnerDagen?: number;
  /** Lopend overdrachtsverzoek: wordt pas toegewezen na acceptatie. */
  overdragenAan?: string;
  /** Koppeling naar de afspraak waar deze taak bij hoort (bijv. contact opnemen met school). */
  afspraakId?: string;
  /** Alleen bij contacttaken; dezelfde status wordt in de agenda getoond. */
  contactStatus?: ContactStatus;
  /** Verwijzing naar het oorspronkelijke bericht; geen tweede kopie van het gesprek. */
  berichtId?: string | undefined;
  gesprekId?: string | undefined;
};
export type SpulType = "mee" | "vast" | "dubbel";
export type Spul = { id: string; naam: string; /** "emma" | "noah" bij het voorbeeldgezin; bij een eigen gezin het eigen kind-id. */ kind: string; type: SpulType; plek?: "sanne" | "joris" | string; /** Wie pakt dit op; "" of ontbrekend = nog niemand. */ wie?: string };

type State = { taken: Taak[]; spullen: Spul[]; extraMee: Record<string, string[]>; weg: Record<string, string[]> };
let state: State = {
  taken: [
    { id: "t1", tekst: "Tandarts bellen voor controle", kind: "beide", wie: "joris", klaar: false, herhaling: "aangepast", herhalingTekst: "Elk half jaar" },
    { id: "t2", tekst: "Traktatie verjaardag Emma", kind: "emma", wie: "sanne", klaar: false, herhaling: "jaarlijks", deadline: "2027-04-12", herinnerDagen: 3 },
    { id: "t3", tekst: "Inschrijven zwemles B-diploma", kind: "noah", wie: "sanne", klaar: true, herhaling: "eenmalig" },
    { id: "t4", tekst: "Nieuwe schoenen regelen", kind: "noah", wie: "", klaar: false, herhaling: "aangepast", herhalingTekst: "Elk seizoen" },
    { id: "t5", tekst: "Sportcontributie voetbal", kind: "noah", wie: "joris", klaar: false, herhaling: "jaarlijks" },
    { id: "t6", tekst: "Ouderavond inschrijven", kind: "emma", wie: "sanne", klaar: false, herhaling: "eenmalig", deadline: "2026-10-15", herinnerDagen: 3 },
  ],
  spullen: [
    { id: "s1", naam: "Knuffel", kind: "noah", type: "mee" },
    { id: "s2", naam: "Schooltablet", kind: "emma", type: "mee" },
    { id: "s3", naam: "Voetbalschoenen", kind: "noah", type: "vast", plek: "joris" },
    { id: "s4", naam: "Tandenborstel", kind: "emma", type: "dubbel" },
    { id: "s5", naam: "Tandenborstel", kind: "noah", type: "dubbel" },
  ],
  extraMee: {},
  weg: {},
};
const listeners = new Set<() => void>();
const zet = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export const takenState = () => state;
export function useTaken() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}

/** Namen van betrokken kinderen; bij een eigen gezin komen die uit de start-opslag. */
export const kindNaam = (k: Taak["kind"]) => {
  if (k === "beide") return ["Emma", "Noah"];
  if (k === "emma") return ["Emma"];
  if (k === "noah") return ["Noah"];
  if (k === "alle") return startState().kinderen.map((x) => x.naam);
  const eigen = startState().kinderen.find((x) => x.id === k);
  return [eigen ? eigen.naam : k];
};

/** Taken van het eigen gezin (geen voorbeeldtaken). */
export const eigenTaken = () => {
  const ids = new Set([...startState().kinderen.map((k) => k.id), "alle"]);
  return state.taken.filter((t) => ids.has(t.kind));
};
/** Spullen van het eigen gezin. */
export const eigenSpullen = () => {
  const ids = new Set(startState().kinderen.map((k) => k.id));
  return state.spullen.filter((s) => ids.has(s.kind));
};

/** Wie mag een taak krijgen? Ouders altijd; kringleden alleen met recht op "Toegewezen taken" voor het kind. */
export function taakKandidaten(t: Pick<Taak, "kind">) {
  const kids = t.kind === "beide" ? ["emma", "noah"] : [t.kind];
  return [
    { id: "sanne", naam: "Jij" },
    { id: "joris", naam: wieNaam("joris") },
    ...kringState().personen.filter((p) => kids.every((k) => mag(p, k, "taken"))).map((p) => ({ id: p.id, naam: wieNaam(p.id) })),
  ];
}
export const taakWieTekst = (wie: string) => (wie === "sanne" ? "Jij regelt dit" : wie ? `Regelt: ${wieNaam(wie)}` : "Nog niemand");

export function voegTaakToe(t: Omit<Taak, "id" | "klaar">) {
  const bestaand = t.berichtId ? state.taken.find((x) => x.berichtId === t.berichtId && x.gesprekId === t.gesprekId) : undefined;
  if (bestaand) return bestaand.id;
  const id = `t${Date.now()}-${state.taken.length}`;
  zet({ taken: [{ ...t, id, klaar: false }, ...state.taken] });
  return id;
}
export function toggleTaak(id: string) {
  zet({ taken: state.taken.map((t) => {
    if (t.id !== id || t.overdragenAan) return t;
    const klaar = !t.klaar;
    return { ...t, klaar, ...(t.contactStatus ? { contactStatus: klaar ? "afgerond" as const : "nog-te-regelen" as const } : {}) };
  }) });
}
/** Werk de contactstatus van een taak bij; "afgerond" zet de taak ook op klaar. */
export function zetContactStatus(id: string, contactStatus: ContactStatus) {
  zet({ taken: state.taken.map((t) => (t.id === id && !t.overdragenAan ? { ...t, contactStatus, klaar: contactStatus === "afgerond" } : t)) });
}
/** Overdragen: naar een ouder of kringlid is een verzoek dat eerst geaccepteerd moet worden (behalve naar jezelf). */
export function vraagOverdracht(id: string, aan: string) {
  if (aan === "sanne") return wijsTaakToe(id, aan);
  zet({ taken: state.taken.map((t) => (t.id === id ? { ...t, overdragenAan: aan } : t)) });
}
export function annuleerOverdracht(id: string) {
  zet({ taken: state.taken.map((t) => { if (t.id !== id) return t; const { overdragenAan: _x, ...rest } = t; return rest; }) });
}
/** Demo: de ontvanger accepteert → taak wordt definitief opnieuw toegewezen. */
export const accepteerOverdracht = (id: string) => { const t = state.taken.find((x) => x.id === id); if (t?.overdragenAan) wijsTaakToe(id, t.overdragenAan, wieNaam(t.overdragenAan)); };
function wijsTaakToe(id: string, aan: string, door = "Sanne") {
  const t = state.taken.find((x) => x.id === id);
  if (!t) return;
  leg("taak", id, t.tekst, "UPDATED", { veld: "verantwoordelijke", oud: wieNaam(t.wie || undefined), nieuw: wieNaam(aan) }, ["Sanne", "Joris"].includes(door) ? door : "Sanne", { kinderen: kindNaam(t.kind), meta: { type: "Taak opnieuw toegewezen" } });
  zet({ taken: state.taken.map((x) => { if (x.id !== id) return x; const { overdragenAan: _x, ...rest } = x; return { ...rest, wie: aan }; }) });
}

export function zetSpul(id: string, p: Partial<Spul>) {
  const s = state.spullen.find((x) => x.id === id);
  if (!s) return;
  const types = { mee: "Wisselt mee", vast: "Vaste plek", dubbel: "Dubbel aanwezig" };
  for (const veld of ["naam", "type", "plek"] as const) {
    if (p[veld] === undefined || p[veld] === s[veld]) continue;
    leg("spul", id, p.naam ?? s.naam, "UPDATED", { veld: veld === "type" ? "meewisselen" : veld, oud: veld === "type" ? types[s.type] : String(s[veld] ?? ""), nieuw: veld === "type" && p.type ? types[p.type] : String(p[veld] ?? "") }, "Sanne", { kinderen: kindNaam(s.kind), meta: { type: "Spul" } });
  }
  zet({ spullen: state.spullen.map((x) => (x.id === id ? { ...x, ...p, id } : x)) });
}
/** "Ik regel dit": één spul, één verantwoordelijke — hetzelfde model als bij taken. */
export function regelSpul(id: string, wie: string) {
  const s = state.spullen.find((x) => x.id === id);
  if (!s) return;
  leg("spul", id, s.naam, "UPDATED", { veld: "wie regelt dit", oud: s.wie ? wieNaam(s.wie) : "nog niemand", nieuw: wieNaam(wie) }, "Sanne", { kinderen: [s.kind === "emma" ? "Emma" : "Noah"], meta: { type: "Spul" } });
  zet({ spullen: state.spullen.map((x) => (x.id === id ? { ...x, wie } : x)) });
}
export function voegSpulToe(s: Omit<Spul, "id">) {
  const id = `s${Date.now()}-${state.spullen.length}`;
  leg("spul", id, s.naam, "CREATED", undefined, "Sanne", { kinderen: kindNaam(s.kind), meta: { type: "Spul" } });
  zet({ spullen: [...state.spullen, { ...s, id }] });
}

/**
 * Slimme overdrachtslijst: wat bij dit moment hoort + spullen die standaard meewisselen.
 * Vaste-plek en dubbel aanwezige spullen komen er niet op. Ouders kunnen items toevoegen of weghalen.
 */
export function meeLijst(m: Moment) {
  const auto = state.spullen.filter((s) => s.type === "mee" && m.kindIds.includes(s.kind)).map((s) => s.naam);
  const weg = state.weg[m.id] ?? [];
  return [...new Set([...m.mee, ...auto, ...(state.extraMee[m.id] ?? [])])].filter((x) => !weg.includes(x));
}
export const voegMeeToe = (momentId: string, item: string) => zet({ extraMee: { ...state.extraMee, [momentId]: [...(state.extraMee[momentId] ?? []), item] }, weg: { ...state.weg, [momentId]: (state.weg[momentId] ?? []).filter((x) => x !== item) } });
export const haalMeeWeg = (momentId: string, item: string) => zet({ weg: { ...state.weg, [momentId]: [...(state.weg[momentId] ?? []), item] } });

/**
 * Hulp vragen aan je netwerk: één verzoek naar gekozen kringpersonen.
 * Wie het eerst accepteert krijgt het als gewone taak; daarna is het verzoek dicht.
 * Een hulpverzoek wijzigt nooit de zorgregeling.
 */
export type HulpStatus = "open" | "geaccepteerd" | "ingetrokken";
export type HulpVerzoek = { id: string; kind: Taak["kind"]; wat: string; datum: string; tijd: string; ontvangers: string[]; status: HulpStatus; geaccepteerdDoor?: string; taakId?: string };
let hulp: HulpVerzoek[] = [];
const hulpLuisteraars = new Set<() => void>();
const zetHulp = (l: HulpVerzoek[]) => { hulp = l; hulpLuisteraars.forEach((f) => f()); };
export const hulpState = () => hulp;
export function useHulpVerzoeken() {
  return useSyncExternalStore((l) => { hulpLuisteraars.add(l); return () => hulpLuisteraars.delete(l); }, () => hulp, () => hulp);
}
/** Alleen actieve kringpersonen met recht op wisselmomenten of taken voor (alle) betrokken kinderen. */
export function hulpKandidaten(kind: Taak["kind"]) {
  const kids = kind === "beide" ? ["emma", "noah"] : kind === "alle" ? startState().kinderen.map((k) => k.id) : [kind];
  return kringState().personen.filter((p) => !p.ingetrokken && kids.every((k) => mag(p, k, "wissel") || mag(p, k, "taken")));
}
export function vraagHulp(v: Omit<HulpVerzoek, "id" | "status">) {
  const toegestaan = new Set(hulpKandidaten(v.kind).map((p) => p.id));
  const ontvangers = v.ontvangers.filter((id) => toegestaan.has(id));
  if (!v.wat.trim() || !ontvangers.length) return null;
  const id = `h${Date.now()}`;
  leg("taak", id, v.wat, "CREATED", undefined, "Sanne", { kinderen: kindNaam(v.kind), meta: { type: "Hulpverzoek", ontvangers: ontvangers.map((o) => wieNaam(o)).join(", ") } });
  zetHulp([{ ...v, ontvangers, id, status: "open" }, ...hulp]);
  return id;
}
/** Eerste ontvanger wint; een tweede acceptatie wordt geweigerd. */
export function accepteerHulp(id: string, wie: string): boolean {
  const v = hulp.find((x) => x.id === id);
  if (!v || v.status !== "open" || !v.ontvangers.includes(wie)) return false;
  const taakId = `t${Date.now()}`;
  zet({ taken: [{ id: taakId, tekst: `${v.wat} (${v.datum} ${v.tijd})`, kind: v.kind, wie, klaar: false, herhaling: "eenmalig", deadline: v.datum }, ...state.taken] });
  leg("taak", id, v.wat, "UPDATED", { veld: "hulpverzoek", oud: "open", nieuw: `geaccepteerd door ${wieNaam(wie)}` }, "Sanne", { kinderen: kindNaam(v.kind), meta: { type: "Hulpverzoek" } });
  zetHulp(hulp.map((x) => (x.id === id ? { ...x, status: "geaccepteerd", geaccepteerdDoor: wie, taakId } : x)));
  return true;
}
export function trekHulpIn(id: string) {
  zetHulp(hulp.map((x) => (x.id === id && x.status === "open" ? { ...x, status: "ingetrokken" } : x)));
}
export const resetHulpVoorTest = () => zetHulp([]);
