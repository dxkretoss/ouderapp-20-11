import { useSyncExternalStore } from "react";
import { leg as legAudit } from "@/lib/audit-store";

/**
 * De kring rond het kind — generiek rollen- en rechtenmodel.
 * Rol = alleen een label. Rechten = per persoon, per kind, per onderdeel.
 * Toegangsperiode = los veld. Nooit rechten afleiden uit de rol.
 * Professionals vallen hier bewust buiten (eigen professionele rechtenstructuur).
 */

export type Onderdeel = "wissel" | "momentjes" | "taken" | "spullen" | "agenda" | "nood" | "documenten";
export type Niveau = "geen" | "bekijken" | "bijdragen";
export type Rechten = Record<Onderdeel, Niveau>;

export const onderdelen: { id: Onderdeel; titel: string; uitleg: string; niveaus: { id: Niveau; label: string }[] }[] = [
  { id: "wissel", titel: "Wisselmomenten", uitleg: "Alleen momenten en plek — niet de volledige zorgregeling.", niveaus: [{ id: "geen", label: "Geen toegang" }, { id: "bekijken", label: "Bekijken" }] },
  { id: "momentjes", titel: "Momentjes", uitleg: "Alleen momentjes die met deze persoon gedeeld zijn.", niveaus: [{ id: "geen", label: "Geen toegang" }, { id: "bekijken", label: "Bekijken" }, { id: "bijdragen", label: "Bekijken & delen" }] },
  { id: "taken", titel: "Ophalen/brengen & taken", uitleg: "Alleen ophaalmomenten en taken waarvoor deze persoon is ingezet.", niveaus: [{ id: "geen", label: "Geen toegang" }, { id: "bekijken", label: "Bekijken" }, { id: "bijdragen", label: "Bekijken & afvinken" }] },
  { id: "spullen", titel: "Relevante spullen", uitleg: "Alleen wat er mee moet bij een moment.", niveaus: [{ id: "geen", label: "Geen toegang" }, { id: "bekijken", label: "Bekijken" }, { id: "bijdragen", label: "Bekijken & aanpassen" }] },
  { id: "agenda", titel: "Afspraken waarbij deze persoon betrokken is", uitleg: "Nooit de volledige ouderagenda.", niveaus: [{ id: "geen", label: "Geen toegang" }, { id: "bekijken", label: "Alleen toegewezen afspraken" }, { id: "bijdragen", label: "Toegewezen afspraken & bijdragen" }] },
  { id: "nood", titel: "Beperkte noodinformatie", uitleg: "Alleen wat jij op de noodkaart zet.", niveaus: [{ id: "geen", label: "Geen toegang" }, { id: "bekijken", label: "Bekijken" }] },
  { id: "documenten", titel: "Documenten", uitleg: "Alleen documenten die je los selecteert.", niveaus: [{ id: "geen", label: "Geen toegang" }, { id: "bekijken", label: "Geselecteerde documenten" }] },
];

/** Praktische rol (label). Staat los van gezag (juridisch) en van app-toegang (rechten). */
export const rolOpties = ["Opa", "Oma", "Stiefouder / bonusouder", "Familielid", "Oppas", "Andere verzorger", "Anders"] as const;
/** Juridische/gezagsrol: kringleden hebben standaard geen gezag; dit wordt nooit afgeleid uit de rol. */
export type Gezagsrol = "geen" | "gezag" | "voogdij";

export const geenRechten = (): Rechten => ({ wissel: "geen", momentjes: "geen", taken: "geen", spullen: "geen", agenda: "geen", nood: "geen", documenten: "geen" });

export type Periode =
  | { type: "doorlopend" }
  | { type: "tot"; eind: string }
  | { type: "periode"; start: string; eind: string };

export type KringPersoon = {
  id: string;
  naam: string;
  rol: string;
  /** Korte samenvatting (telefoon of e-mail) voor weergave. */
  contact: string;
  telefoon?: string | undefined;
  email?: string | undefined;
  adres?: string | undefined;
  foto?: string | undefined;
  noodcontact?: boolean;
  /** Juridische rol — los van rol en rechten. */
  gezag?: Gezagsrol;
  /** Alleen een contact (adresboek) of uitgenodigd voor de app. Zonder uitnodiging: nooit toegang. */
  uitgenodigd?: boolean;
  /** Rechten per kind; een kind zonder sleutel = geen toegang. */
  rechten: Record<string, Rechten>;
  periode: Periode;
  ingetrokken: boolean;
  /** false = uitnodiging verstuurd maar nog niet bevestigd na inloggen; zonder bevestiging nooit toegang. */
  bevestigd?: boolean;
  /** Toegangssleutel; wordt vernieuwd bij intrekken zodat oude links ongeldig worden. */
  sleutel: string;
};

export type NoodVeld = "geboortedatum" | "contacten" | "huisarts" | "allergieen" | "medicatie" | "extra";
export type Moment = {
  id: string;
  kindIds: string[];
  soort: "wissel" | "afspraak";
  titel: string;
  dag: string;
  tijd: string;
  datum: string; // ISO
  plek: string;
  mee: string[];
  daarna?: string;
};

type State = {
  personen: KringPersoon[];
  momenten: Moment[];
  /** moment → wie regelt het: "sanne" | "joris" | kringpersoon-id */
  wie: Record<string, string>;
  bevestigd: Record<string, "regel" | "er">;
  meeKlaar: Record<string, string[]>;
  takenKlaar: Record<string, boolean>;
  /** kind → velden die ouders expliciet op de noodkaart delen */
  noodkaart: Record<string, NoodVeld[]>;
  noodExtra: Record<string, string>;
  gedeeldeDocs: Record<string, string[]>; // persoonId → document-ids
};

const r = (p: Partial<Rechten>): Rechten => ({ ...geenRechten(), ...p });

let state: State = {
  personen: [
    { id: "marja", naam: "Marja", rol: "Oma", contact: "06 - 22 33 44 55", periode: { type: "doorlopend" }, ingetrokken: false, sleutel: "k1",
      rechten: { emma: r({ wissel: "bekijken", momentjes: "bijdragen", taken: "bekijken", spullen: "bekijken", agenda: "bekijken", nood: "bekijken" }), noah: r({ wissel: "bekijken", momentjes: "bekijken" }) } },
    { id: "peter", naam: "Peter", rol: "Opa", contact: "06 - 55 44 33 22", periode: { type: "doorlopend" }, ingetrokken: false, sleutel: "k2",
      rechten: { emma: r({ momentjes: "bekijken" }), noah: r({ momentjes: "bekijken" }) } },
    { id: "lisa", naam: "Lisa", rol: "Oppas", contact: "lisa@voorbeeld.nl", periode: { type: "tot", eind: "2027-07-24" }, ingetrokken: false, sleutel: "k3",
      rechten: { emma: r({ wissel: "bekijken", nood: "bekijken", agenda: "bekijken" }), noah: r({ wissel: "bekijken", nood: "bekijken" }) } },
  ],
  momenten: [
    { id: "w1", kindIds: ["emma", "noah"], soort: "wissel", titel: "Ophalen bij school", dag: "Vrijdag", tijd: "14:30", datum: "2027-03-12", plek: "Basisschool De Boomgaard", mee: ["Schooltas", "Winterjas", "Knuffel"], daarna: "17:00 · Zwemles" },
    { id: "a1", kindIds: ["emma"], soort: "afspraak", titel: "Zwemles", dag: "Zaterdag", tijd: "09:00", datum: "2027-03-13", plek: "Zwembad De Kwakel", mee: ["Zwemtas", "Handdoek"] },
    { id: "w2", kindIds: ["emma", "noah"], soort: "wissel", titel: "Wisselmoment", dag: "Zondag", tijd: "18:00", datum: "2027-03-14", plek: "Molenstraat 12", mee: ["Gymtas Emma"] },
    { id: "w3", kindIds: ["emma", "noah"], soort: "wissel", titel: "Brengen naar school", dag: "Maandag", tijd: "08:15", datum: "2027-03-15", plek: "Basisschool De Boomgaard", mee: ["Leesmap Noah"] },
  ],
  wie: { w1: "marja", a1: "marja", w2: "sanne", w3: "joris" },
  bevestigd: { w1: "regel" },
  meeKlaar: { w1: ["Schooltas", "Knuffel"] },
  takenKlaar: {},
  noodkaart: { emma: ["geboortedatum", "contacten", "huisarts", "allergieen", "medicatie"], noah: ["contacten", "huisarts", "allergieen"] },
  noodExtra: { noah: "EpiPen zit in het voorvak van de tas." },
  gedeeldeDocs: {},
};

const listeners = new Set<() => void>();
const serverState = state;
const PERSONEN_SLEUTEL = "onzeapp-kring-personen";
let personenGeladen = false;
function laadPersonen() {
  if (personenGeladen || typeof window === "undefined") return;
  personenGeladen = true;
  try {
    const opgeslagen = window.localStorage.getItem(PERSONEN_SLEUTEL);
    if (!opgeslagen) return;
    const personen: unknown = JSON.parse(opgeslagen);
    if (Array.isArray(personen) && personen.every((p) => p && typeof p.id === "string" && typeof p.naam === "string" && p.rechten && p.periode)) {
      state = { ...state, personen };
    }
  } catch { /* Bestaande gegevens blijven intact als opslag niet beschikbaar is. */ }
}
const zet = (p: Partial<State>) => {
  laadPersonen();
  if (p.personen && typeof window !== "undefined") {
    // Bewaar dezelfde kringobjecten; geen aparte contactlijst of afgeleide rechten.
    // Bij een opslagfout blijft het formulier open zodat de ouder opnieuw kan proberen.
    window.localStorage.setItem(PERSONEN_SLEUTEL, JSON.stringify(p.personen));
  }
  state = { ...state, ...p };
  listeners.forEach((l) => l());
};

export function useKring() {
  return useSyncExternalStore((l) => { laadPersonen(); listeners.add(l); queueMicrotask(l); return () => listeners.delete(l); }, () => { laadPersonen(); return state; }, () => serverState);
}
export const kringState = () => { laadPersonen(); return state; };

/** Toegang vervalt automatisch na de einddatum; geen handmatige actie nodig. */
export function isActief(p: KringPersoon, nu = new Date()) {
  if (p.ingetrokken) return false;
  const dag = nu.toISOString().slice(0, 10);
  if (p.periode.type === "tot") return dag <= p.periode.eind;
  if (p.periode.type === "periode") return dag >= p.periode.start && dag <= p.periode.eind;
  return true;
}
/** Effectief niveau: altijd "geen" als toegang niet actief is of kind niet gedeeld. */
export function niveau(p: KringPersoon, kindId: string, o: Onderdeel): Niveau {
  if (!isActief(p) || p.uitgenodigd === false || p.bevestigd === false) return "geen";
  return p.rechten[kindId]?.[o] ?? "geen";
}
export const mag = (p: KringPersoon, kindId: string, o: Onderdeel, min: Niveau = "bekijken") => {
  const n = niveau(p, kindId, o);
  return min === "bekijken" ? n !== "geen" : n === "bijdragen";
};

export const voegPersoonToe = (p: Omit<KringPersoon, "id" | "sleutel" | "ingetrokken">) => {
  laadPersonen();
  const nieuw: KringPersoon = { ...p, id: `k${Date.now()}`, sleutel: crypto.randomUUID(), ingetrokken: false, ...(p.uitgenodigd ? { bevestigd: false } : {}) };
  zet({ personen: [...state.personen, nieuw] });
  return nieuw;
};
/** Alleen na inloggen/account aanmaken: de link alleen geeft nooit toegang. Sleutel wordt daarna vernieuwd zodat de link niet hergebruikt kan worden. */
export const bevestigUitnodiging = (sleutel: string, ingelogd: boolean) => {
  const p = state.personen.find((x) => x.sleutel === sleutel);
  if (!p || !ingelogd || p.bevestigd !== false || p.ingetrokken) return null;
  wijzigPersoon(p.id, { bevestigd: true });
  return p;
};
export const persoonVoorUitnodiging = (sleutel: string) => state.personen.find((x) => x.sleutel === sleutel && x.bevestigd === false && !x.ingetrokken);
export const wijzigPersoon = (id: string, p: Partial<KringPersoon>) => {
  laadPersonen();
  zet({ personen: state.personen.map((x) => (x.id === id ? { ...x, ...p } : x)) });
};
export const trekIn = (id: string) => wijzigPersoon(id, { ingetrokken: true, sleutel: crypto.randomUUID() });
export const zetWie = (momentId: string, wie: string) => {
  const m = state.momenten.find((x) => x.id === momentId);
  if (m && state.wie[momentId] !== wie) legAudit("afspraak", momentId, m.titel, "UPDATED", { veld: "verantwoordelijke", oud: wieNaam(state.wie[momentId]), nieuw: wieNaam(wie) }, "Sanne", { kinderen: m.kindIds.map((k) => k[0]!.toUpperCase() + k.slice(1)) });
  const bevestigd = { ...state.bevestigd };
  delete bevestigd[momentId];
  zet({ wie: { ...state.wie, [momentId]: wie }, bevestigd });
};
export const bevestig = (momentId: string, v: "regel" | "er") => zet({ bevestigd: { ...state.bevestigd, [momentId]: v } });
export const toggleMee = (momentId: string, item: string) => {
  const l = state.meeKlaar[momentId] ?? [];
  zet({ meeKlaar: { ...state.meeKlaar, [momentId]: l.includes(item) ? l.filter((x) => x !== item) : [...l, item] } });
};
export const toggleNoodVeld = (kindId: string, v: NoodVeld) => {
  const l = state.noodkaart[kindId] ?? [];
  zet({ noodkaart: { ...state.noodkaart, [kindId]: l.includes(v) ? l.filter((x) => x !== v) : [...l, v] } });
};

export const persoonLabel = (p: KringPersoon) => (["Opa", "Oma"].includes(p.rol) ? `${p.rol} ${p.naam}` : p.naam);
export function wieNaam(id: string | undefined) {
  if (!id) return "Nog niemand";
  if (id === "sanne") return "Sanne";
  if (id === "joris") return "Joris";
  const p = state.personen.find((x) => x.id === id);
  return p ? persoonLabel(p) : "Onbekend";
}
export function periodeTekst(p: Periode) {
  const f = (d: string) => new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  if (p.type === "tot") return `Tijdelijk tot ${f(p.eind)}`;
  if (p.type === "periode") return `${f(p.start)} t/m ${f(p.eind)}`;
  return "Doorlopend";
}
/** Wat een kringlid voor een kind mag zien, in korte woorden. */
export function rechtenSamenvatting(p: KringPersoon, kindId: string) {
  return onderdelen.filter((o) => niveau(p, kindId, o.id) !== "geen").map((o) => o.titel).join(" · ") || "Nog niets gedeeld";
}

/** Adresboek rond een kind: iedereen in de kring (ook contacten zonder app-toegang). */
export const adresboek = (kindId: string) => { laadPersonen(); return state.personen.filter((p) => !p.ingetrokken && p.rechten[kindId]); };
export const noodcontacten = (kindId: string) => adresboek(kindId).filter((p) => p.noodcontact);
/** Contacten zonder app die een ouder wél kan registreren als ophaler (zonder digitale bevestiging). */
export const contactKandidaten = (m: Moment) => state.personen.filter((p) => !p.ingetrokken && p.uitgenodigd === false && m.kindIds.every((k) => p.rechten[k]));
export const heeftApp = (id: string) => state.personen.find((p) => p.id === id)?.uitgenodigd !== false;

/** Generiek: wie mag dit moment regelen? Ouders altijd; kringleden alleen met toegang voor álle betrokken kinderen. */
export function kandidatenVoor(m: Moment) {
  const o: Onderdeel = m.soort === "wissel" ? "wissel" : "agenda";
  return state.personen.filter((p) => isActief(p) && m.kindIds.every((k) => niveau(p, k, o) !== "geen"));
}
/** Wie regelt dit — met bevestigingsstatus. Kiezen is nooit automatisch akkoord van een kringlid. */
export function regelStatus(momentId: string): { wie: string; tekst: string; bevestigd: boolean } | null {
  const wie = state.wie[momentId];
  if (!wie) return null;
  if (wie === "sanne") return { wie, tekst: "Jij regelt dit", bevestigd: true };
  if (wie === "joris") return { wie, tekst: "Geregeld door de andere ouder", bevestigd: true };
  if (!heeftApp(wie)) return { wie, tekst: `${wieNaam(wie)} · door jou geregistreerd, geen digitale bevestiging`, bevestigd: false };
  const b = state.bevestigd[momentId];
  return { wie, tekst: b ? `${wieNaam(wie)} heeft bevestigd ✓` : `${wieNaam(wie)} gevraagd · wacht op bevestiging`, bevestigd: !!b };
}
/** Tijd of plek van een afspraak definitief aanpassen (wisselmomenten lopen via een voorstel). */
export function wijzigMoment(id: string, p: Partial<Pick<Moment, "tijd" | "plek">>, door = "Sanne") {
  const m = state.momenten.find((x) => x.id === id);
  if (!m) return;
  const kids = m.kindIds.map((k) => k[0]!.toUpperCase() + k.slice(1));
  if (p.tijd && p.tijd !== m.tijd) legAudit("afspraak", id, m.titel, "UPDATED", { veld: "tijdstip", oud: `${m.dag} ${m.tijd}`, nieuw: `${m.dag} ${p.tijd}` }, door, { kinderen: kids });
  if (p.plek && p.plek !== m.plek) legAudit("afspraak", id, m.titel, "UPDATED", { veld: "locatie", oud: m.plek, nieuw: p.plek }, door, { kinderen: kids });
  zet({ momenten: state.momenten.map((x) => (x.id === id ? { ...x, ...p } : x)) });
}
