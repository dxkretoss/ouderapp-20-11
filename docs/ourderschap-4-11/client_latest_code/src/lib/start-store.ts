import { useSyncExternalStore } from "react";

/**
 * Eigen start (Living Onboarding): naam, gebruiksvorm, eigen kinderen en een basispatroon.
 * Zolang `eigen` false is, toont de app het voorbeeldgezin. Bewaard op dit apparaat.
 */
export type Patroon = "om-de-week" | "weekenden" | "2-2-3" | "2-2-5-5" | "vaste-dagen" | "een-weekend" | "wisselend" | "zelf";
export type Plek = "ik" | "ander";
export type Regeling = { patroon: Patroon; dagen: Plek[]; wisseltijd: string; plek?: string | undefined; startMaandag: string };
export type StartKind = { id: string; naam: string; geboortedatum?: string | undefined; kleur?: string | undefined; /** Profielbeeld: "avatar:n", foto (data-URL) of leeg = initiaal. */ beeld?: string | undefined };

/** Zachte kleuren per kind (uit het iconenpalet). Zelf aan te passen in het kindprofiel. */
export const kindKleuren = [
  { id: "salie", hex: "#6F7F68" },
  { id: "klei", hex: "#C07B5C" },
  { id: "blauw", hex: "#6B7F99" },
  { id: "lavendel", hex: "#8A7CA8" },
  { id: "honing", hex: "#B8923E" },
  { id: "taupe", hex: "#8A7E72" },
] as const;
/** Standaardkleur voor een kind op plek i (wisselt af over het palet). */
export const standaardKindKleur = (i: number) => kindKleuren[i % kindKleuren.length]!.hex;

/** Leeftijd uit de geboortedatum: maanden onder 1 jaar, jaren daarna. Geen datum → null (niets verzinnen). */
export function leeftijdTekst(geboortedatum?: string, nu = new Date()): string | null {
  if (!geboortedatum) return null;
  const geb = new Date(geboortedatum);
  if (Number.isNaN(geb.getTime()) || geb > nu) return null;
  let jaren = nu.getFullYear() - geb.getFullYear();
  let maanden = nu.getMonth() - geb.getMonth();
  if (nu.getDate() < geb.getDate()) maanden -= 1;
  if (maanden < 0) { jaren -= 1; maanden += 12; }
  if (jaren < 1) {
    const totaal = Math.max(1, jaren * 12 + maanden);
    return totaal === 1 ? "1 maand" : `${totaal} maanden`;
  }
  return `${jaren} jaar`;
}
/** Zelf opgegeven gezag. Alleen informatie: kent nooit rechten of toegang toe. */
export type EigenGezag = { situatie: "gezamenlijk" | "een-ouder" | "anders" | "onbekend"; ingevuldDoor: string; bevestigdDoorAnder: false };
export const gezagKeuzes: { id: EigenGezag["situatie"]; naam: string }[] = [
  { id: "gezamenlijk", naam: "Gezamenlijk gezag" },
  { id: "een-ouder", naam: "Eén ouder heeft gezag" },
  { id: "anders", naam: "Anders geregeld" },
  { id: "onbekend", naam: "Nog onbekend" },
];
/** Basis klaar = naam, kind, verdeling en gezag. Uitnodigen is optioneel en telt niet mee. */
export function basisStappen(s: Pick<StartState, "naam" | "kinderen" | "regeling" | "gezag">) {
  return [
    { klaar: !!s.naam, label: "Naam ingevuld" },
    { klaar: s.kinderen.length > 0, label: "Kind toegevoegd" },
    { klaar: !!s.regeling, label: "Verdeling van de week ingesteld" },
    { klaar: !!s.gezag, label: "Gezag vastgelegd" },
  ];
}
export type StartState = {
  gezag: EigenGezag | null;
  eigen: boolean;
  naam: string;
  /** Profielbeeld van de ouder zelf; leeg = initiaal. */
  beeld?: string | undefined;
  gebruik: "samen" | "zelf";
  kinderen: StartKind[];
  regeling: Regeling | "later" | null;
  uitgenodigd: boolean;
  afspraakToegevoegd: boolean;
  voortgangVerborgen: boolean;
  /** Agenda-afspraken van het eigen gezin (de Agenda bepaalt de vorm). Los van het voorbeeldgezin. */
  agenda: unknown[];
  /** Berichtonderwerpen van het eigen gezin, alvast voorbereid; er is nog niets verzonden. */
  onderwerpen: { id: string; naam: string }[];
  /** Uitgaven van het eigen gezin (zelfde vorm als een kost); los van de voorbeeldkosten. */
  kosten: EigenKost[];
  /** Voorlopige kostenafspraak; pas wederzijds na koppeling van de andere ouder. Niet verplicht. */
  kostenAfspraak: KostenAfspraak;
};
export type EigenKost = { id: string; omschrijving: string; categorie: string; kind: string; datum: string; bedrag: number; pctIk: number | null; bon?: string | undefined };
export type KostenWijze = "alleen" | "50" | "eigen" | "per-uitgave";
export type KostenMoment = "direct" | "week" | "maand" | "kwartaal" | "zelf";
export type KostenAfspraak = { wijze: KostenWijze; pctIk: number; moment: KostenMoment };
export const kostenWijzen: { id: KostenWijze; naam: string; uitleg: string }[] = [
  { id: "alleen", naam: "Alleen kosten bijhouden", uitleg: "Overzicht van wat je uitgeeft, zonder verrekening." },
  { id: "50", naam: "Standaard 50/50 verdelen", uitleg: "Iedere uitgave wordt gelijk verdeeld." },
  { id: "eigen", naam: "Een eigen percentage", uitleg: "Bijvoorbeeld 60/40, voor iedere uitgave." },
  { id: "per-uitgave", naam: "Per uitgave bepalen", uitleg: "Bij iedere uitgave kies je de verdeling." },
];
export const kostenMomenten: { id: KostenMoment; naam: string }[] = [
  { id: "direct", naam: "Na iedere uitgave" },
  { id: "week", naam: "Wekelijks" },
  { id: "maand", naam: "Maandelijks" },
  { id: "kwartaal", naam: "Per kwartaal" },
  { id: "zelf", naam: "Zelf bepalen" },
];
/** Percentage voor jou bij een nieuwe uitgave; null = alleen bijgehouden. */
export function standaardPct(a: KostenAfspraak): number | null {
  return a.wijze === "alleen" ? null : a.wijze === "50" ? 50 : a.wijze === "eigen" ? a.pctIk : 50;
}

const SLEUTEL = "onzeapp-eigen-start";
const leeg: StartState = { gezag: null, eigen: false, naam: "", gebruik: "samen", kinderen: [], regeling: null, uitgenodigd: false, afspraakToegevoegd: false, voortgangVerborgen: false, agenda: [], onderwerpen: [], kosten: [], kostenAfspraak: { wijze: "alleen", pctIk: 50, moment: "maand" } };
let state: StartState = leeg;
let geladen = false;
const luisteraars = new Set<() => void>();

function laad() {
  if (geladen || typeof window === "undefined") return;
  geladen = true;
  try {
    const r = localStorage.getItem(SLEUTEL);
    if (r) state = { ...leeg, ...JSON.parse(r) };
  } catch { /* geen opslag */ }
}
function zet(p: Partial<StartState>) {
  state = { ...state, ...p };
  try { localStorage.setItem(SLEUTEL, JSON.stringify(state)); } catch { /* geen opslag */ }
  luisteraars.forEach((l) => l());
}

/** Huidige start-state zonder hook (voor andere stores). */
export function startState(): StartState {
  laad();
  return state;
}

export function useStart(): StartState {
  return useSyncExternalStore(
    (l) => { laad(); luisteraars.add(l); queueMicrotask(l); return () => luisteraars.delete(l); },
    () => { laad(); return state; },
    () => leeg,
  );
}

export const start = {
  begin: (naam: string, gebruik: "samen" | "zelf") => zet({ ...leeg, eigen: true, naam: naam.trim(), gebruik }),
  kindToevoegen: (naam: string, geboortedatum?: string, beeld?: string) =>
    zet({ kinderen: [...state.kinderen, { id: `k-${Date.now()}`, naam: naam.trim(), geboortedatum: geboortedatum || undefined, kleur: standaardKindKleur(state.kinderen.length), beeld }] }),
  /** Alleen de eigen ouder van dit gezin beheert de kindafbeelding; andere personen hebben hier geen invoer. */
  zetKindBeeld: (id: string, beeld: string | undefined) =>
    zet({ kinderen: state.kinderen.map((k) => (k.id === id ? { ...k, beeld } : k)) }),
  zetOuderBeeld: (beeld: string | undefined) => zet({ beeld }),
  zetKindKleur: (id: string, kleur: string) =>
    zet({ kinderen: state.kinderen.map((k) => (k.id === id ? { ...k, kleur } : k)) }),
  zetGezag: (situatie: EigenGezag["situatie"]) => zet({ gezag: { situatie, ingevuldDoor: state.naam || "jij", bevestigdDoorAnder: false } }),
  regeling: (r: Regeling | "later") => zet({ regeling: r }),
  markeer: (p: Partial<Pick<StartState, "uitgenodigd" | "afspraakToegevoegd" | "voortgangVerborgen">>) => zet(p),
  zetAgenda: (f: (l: unknown[]) => unknown[]) => zet({ agenda: f(state.agenda) }),
  onderwerpToevoegen: (naam: string) => { const id = `eigen-${Date.now()}`; zet({ onderwerpen: [{ id, naam: naam.trim() }, ...state.onderwerpen] }); return id; },
  kostToevoegen: (k: EigenKost) => zet({ kosten: [k, ...state.kosten] }),
  zetKostenAfspraak: (p: Partial<KostenAfspraak>) => zet({ kostenAfspraak: { ...state.kostenAfspraak, ...p } }),
  naarVoorbeeld: () => zet({ eigen: false }),
  terugNaarEigen: () => zet({ eigen: true }),
};

const I: Plek = "ik", A: Plek = "ander";
/** 14 dagen, maandag t/m zondag, twee weken. Neutrale startpunten — iedere regeling is gelijkwaardig. */
export const patronen: { id: Patroon; naam: string; uitleg: string; dagen: Plek[] | null }[] = [
  { id: "om-de-week", naam: "Om de week", uitleg: "De ene week bij de ene ouder, de volgende week bij de andere.", dagen: [I, I, I, I, I, I, I, A, A, A, A, A, A, A] },
  { id: "weekenden", naam: "Weekenden afwisselen", uitleg: "Doordeweeks op één plek. Om het weekend van vrijdag tot en met zondag bij de andere ouder (wissel op vrijdag).", dagen: [I, I, I, I, A, A, A, I, I, I, I, I, I, I] },
  { id: "2-2-3", naam: "2-2-3", uitleg: "Een terugkerend schema met korte blokken gedurende de week.", dagen: [I, I, A, A, I, I, I, A, A, I, I, A, A, A] },
  { id: "2-2-5-5", naam: "2-2-5-5", uitleg: "Vaste weekdagen met afwisselende langere periodes.", dagen: [I, I, A, A, I, I, I, I, I, A, A, A, A, A] },
  { id: "vaste-dagen", naam: "Vaste dagen per week", uitleg: "Dezelfde dagen zijn iedere week verdeeld.", dagen: [I, I, I, A, A, A, A, I, I, I, A, A, A, A] },
  { id: "een-weekend", naam: "Eén weekend per twee weken", uitleg: "Vooral op één plek. Eens per twee weken alleen zaterdag en zondag bij de andere ouder (wissel op zaterdag).", dagen: [I, I, I, I, I, I, I, I, I, I, I, I, A, A] },
  { id: "wisselend", naam: "Wisselende regeling", uitleg: "De planning verschilt regelmatig en volgt geen vast weekschema.", dagen: null },
  { id: "zelf", naam: "Zelf instellen", uitleg: "Maak een eigen verdeling.", dagen: [I, I, I, I, I, I, I, A, A, A, A, A, A, A] },
];

export function maandagVan(d: Date): string {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}

/** Is een opgeslagen regeling bruikbaar? Oudere of onvolledige opslag mag de app nooit laten crashen. */
export function geldigeRegeling(r: unknown): r is Regeling {
  const g = r as Regeling | null;
  return !!g && Array.isArray(g.dagen) && g.dagen.length === 14 && typeof g.startMaandag === "string" && /^\d{4}-\d{2}-\d{2}$/.test(g.startMaandag);
}

/** Op welke plek is het kind op datum d volgens de eigen regeling? */
export function plekOp(r: Regeling, d: Date): Plek {
  return r.dagen[dagIndex(r, d)] ?? "ik";
}

const dagIndex = (r: Regeling, d: Date) => {
  const [j, mm, dd] = (geldigeRegeling(r) ? r.startMaandag : maandagVan(d)).split("-").map(Number);
  const s = new Date(j!, mm! - 1, dd!);
  const n = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - s.getTime()) / 86400000);
  return ((n % 14) + 14) % 14;
};

/** Waar is het kind vandaag, en wanneer is het volgende wisselmoment (eerste dag met een andere plek)? */
export function vandaagVolgens(r: Regeling, nu: Date): { plek: Plek; volgende: Date; naar: Plek } {
  const i = dagIndex(r, nu);
  const plek = r.dagen[i]!;
  for (let s = 1; s <= 14; s++) {
    const p = r.dagen[(i + s) % 14]!;
    if (p !== plek) { const d = new Date(nu); d.setDate(d.getDate() + s); return { plek, volgende: d, naar: p }; }
  }
  const d = new Date(nu); d.setDate(d.getDate() + 14);
  return { plek, volgende: d, naar: plek };
}

/** De twee weken vanaf de maandag van deze week (week 0 = deze week), afgeleid van dezelfde regeling — alleen voor weergave. */
export function tweeWekenVanaf(r: Regeling, nu: Date): Plek[] {
  const m = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return Array.from({ length: 14 }, (_, i) => { const d = new Date(m); d.setDate(m.getDate() + i); return plekOp(r, d); });
}
