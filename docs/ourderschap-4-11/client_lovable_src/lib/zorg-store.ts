import { useSyncExternalStore } from "react";
import { leg } from "@/lib/audit-store";
import type { ParentId } from "@/lib/demo-data";
import { wijzigMoment } from "@/lib/kring-store";

/**
 * Zorgregeling per kind + wijzigingsvoorstellen.
 * - Ieder kind heeft een eigen basisregeling (versies; een structurele wijziging voegt een nieuwe versie toe, oude blijven bewaard).
 * - Eenmalige wijzigingen zijn losse uitzonderingen en raken de basisregeling nooit.
 * - Een voorstel verandert niets tot het geaccepteerd is. Geen reactie = geen akkoord.
 * - Geaccepteerd/afgewezen/ingetrokken is definitief; opnieuw veranderen = nieuw voorstel.
 * Demo-kalender: dagen zijn dagnummers in maart 2026.
 */
export type KindId = "emma" | "noah";
export const kindNamen: Record<KindId, string> = { emma: "Emma", noah: "Noah" };

type BasisVersie = Readonly<{ id: string; kind: KindId; vanafDag: number; eersteOuder: ParentId; omschrijving: string; voorstelId?: string }>;
type Uitzondering = Readonly<{ id: string; kind: KindId; dag: number; ouder: ParentId; reden: string; voorstelId?: string }>;

export type VoorstelSoort = "eenmalig" | "structureel";
export type VoorstelStatus = "open" | "geaccepteerd" | "afgewezen" | "ingetrokken" | "alternatief";
export type Voorstel = Readonly<{
  id: string;
  van: "Sanne" | "Joris";
  soort: VoorstelSoort;
  kinderen: readonly KindId[];
  tekst: string;
  datumLabel: string;
  /** Eenmalig: dagen (maart) die naar `naarOuder` gaan. Structureel: eerste dag van de nieuwe regeling. */
  dagen: readonly number[];
  naarOuder?: ParentId;
  aanleiding?: "ruil" | "nachtje" | "wijziging" | "regeling" | "moment";
  /** Voorstel om tijd/plek van een wisselmoment te wijzigen; pas na akkoord toegepast. */
  moment?: Readonly<{ id: string; tijd?: string; plek?: string }>;
  status: VoorstelStatus;
  alternatief?: string;
  /** Gewenste reactiedatum (ISO) — een verzoek, nooit een bindende termijn. Verstrijken verandert niets automatisch. */
  reactieDatum?: string;
  /** De ontvanger heeft meer tijd gevraagd; het voorstel blijft open, zonder instemming of verplichting. */
  meerTijd?: { door: "Sanne" | "Joris"; datum: string; tot?: string };
  /** ISO-datums van daadwerkelijk verstuurde herinneringen (begrensd via herinneringen.ts). */
  herinneringen?: readonly string[];
}>;

const ander = (o: ParentId): ParentId => (o === "sanne" ? "joris" : "sanne");
const bereik = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

type State = { basis: readonly BasisVersie[]; uitz: readonly Uitzondering[]; voorstellen: readonly Voorstel[] };
let state: State = {
  basis: [
    { id: "b-emma-1", kind: "emma", vanafDag: 1, eersteOuder: "joris", omschrijving: "Week op, week af · wissel op vrijdag" },
    { id: "b-noah-1", kind: "noah", vanafDag: 1, eersteOuder: "joris", omschrijving: "Week op, week af · wissel op vrijdag" },
  ],
  uitz: [
    ...(["emma", "noah"] as KindId[]).flatMap((kind) => bereik(28, 31).map((dag) => ({ id: `u-${kind}-${dag}`, kind, dag, ouder: "joris" as ParentId, reden: "Voorjaarsvakantie" }))),
    { id: "u-emma-25", kind: "emma", dag: 25, ouder: "sanne", reden: "Verjaardag Emma" },
  ],
  voorstellen: [
    { id: "v1", van: "Joris", soort: "eenmalig", kinderen: ["emma", "noah"], tekst: "Kun jij zaterdag 21 maart overnemen? Ik heb een bruiloft.", datumLabel: "Za 21 maart", dagen: [21], naarOuder: "sanne", aanleiding: "ruil", status: "open" },
    { id: "v2", van: "Sanne", soort: "eenmalig", kinderen: ["emma", "noah"], tekst: "Mag ik de kinderen op Koningsdag (27 april) hebben?", datumLabel: "Ma 27 april", dagen: [], naarOuder: "sanne", status: "geaccepteerd" },
    { id: "v3", van: "Joris", soort: "eenmalig", kinderen: ["noah"], tekst: "Kan Noah donderdag 26 maart bij jou slapen?", datumLabel: "Do 26 maart", dagen: [26], naarOuder: "sanne", aanleiding: "nachtje", status: "open" },
  ],
};
const listeners = new Set<() => void>();
const zet = (s: State) => { state = s; listeners.forEach((l) => l()); };

/** Bij wie is dit kind op deze dag? Uitzondering gaat voor; anders de basisversie die op die dag geldt. */
export function zorgDag(s: State, kind: KindId, dag: number): { ouder: ParentId; uitzondering?: string } {
  const u = [...s.uitz].reverse().find((x) => x.kind === kind && x.dag === dag);
  if (u) return { ouder: u.ouder, uitzondering: u.reden };
  const v = [...s.basis].filter((b) => b.kind === kind && b.vanafDag <= dag).pop()!;
  const week = Math.floor(dag / 7); // demo maart 2025: wissel op vrijdag 7, 14, 21, 28
  return { ouder: week % 2 === 0 ? v.eersteOuder : ander(v.eersteOuder) };
}
export const huidigeBasis = (s: State, kind: KindId) => [...s.basis].filter((b) => b.kind === kind).pop()!;

const kindLabels = (k: readonly KindId[]) => k.map((x) => kindNamen[x]);

export function dienVoorstelIn(v: Omit<Voorstel, "id" | "status" | "van">) {
  const nieuw: Voorstel = Object.freeze({ ...v, id: `v${Date.now()}-${crypto.randomUUID().slice(0, 6)}`, van: "Sanne", status: "open" });
  leg("schema", nieuw.id, nieuw.tekst, "CREATED", undefined, "Sanne", { kinderen: kindLabels(nieuw.kinderen), meta: { soort: nieuw.soort === "eenmalig" ? "Eenmalige wijziging" : "Structurele wijziging", betreft: nieuw.datumLabel } });
  zet({ ...state, voorstellen: [...state.voorstellen, nieuw] });
  return nieuw.id;
}

function sluit(id: string, status: Exclude<VoorstelStatus, "open">, door: "Sanne" | "Joris", alternatief?: string) {
  const v = state.voorstellen.find((x) => x.id === id);
  if (!v || v.status !== "open") return false;
  // Alleen de ander reageert; de indiener kan zijn eigen voorstel alleen intrekken.
  if ((status === "ingetrokken") !== (door === v.van)) return false; // definitieve status kan niet stilletjes terug of opnieuw
  const code = status === "geaccepteerd" ? "ACCEPTED" : status === "ingetrokken" ? "CANCELLED" : "DECLINED";
  let { basis, uitz } = state;
  if (status === "geaccepteerd" && v.moment) wijzigMoment(v.moment.id, { ...(v.moment.tijd ? { tijd: v.moment.tijd } : {}), ...(v.moment.plek ? { plek: v.moment.plek } : {}) }, door);
  if (status === "geaccepteerd") {
    if (v.soort === "eenmalig" && v.naarOuder) {
      uitz = [...uitz, ...v.kinderen.flatMap((kind) => v.dagen.map((dag) => ({ id: `u-${v.id}-${kind}-${dag}`, kind, dag, ouder: v.naarOuder!, reden: "Eenmalige wijziging", voorstelId: v.id })))];
    } else if (v.soort === "structureel" && v.naarOuder && v.dagen[0]) {
      basis = [...basis, ...v.kinderen.map((kind) => ({ id: `b-${v.id}-${kind}`, kind, vanafDag: v.dagen[0]!, eersteOuder: v.naarOuder!, omschrijving: v.tekst, voorstelId: v.id }))];
    }
  }
  leg("schema", v.id, v.tekst, code, { veld: "status", oud: "open", nieuw: status }, door, { kinderen: kindLabels(v.kinderen), meta: { soort: v.soort === "eenmalig" ? "Eenmalige wijziging" : "Structurele wijziging", betreft: v.datumLabel, ...(alternatief ? { alternatief } : {}) } });
  zet({ basis, uitz, voorstellen: state.voorstellen.map((x) => (x.id === id ? Object.freeze({ ...x, status, ...(alternatief ? { alternatief } : {}) }) : x)) });
  return true;
}
/** Reageren kan alleen op een voorstel van de ander. */
const reageerder = (id: string): "Sanne" | "Joris" => (state.voorstellen.find((x) => x.id === id)?.van === "Joris" ? "Sanne" : "Joris");
export const accepteer = (id: string, door = reageerder(id)) => sluit(id, "geaccepteerd", door);
export const wijsAf = (id: string, door = reageerder(id)) => sluit(id, "afgewezen", door);
export const stelAlternatiefVoor = (id: string, tekst: string, door = reageerder(id)) => sluit(id, "alternatief", door, tekst);
/** Intrekken kan alleen door de indiener, zolang het voorstel nog open is. */
export function trekIn(id: string) {
  const v = state.voorstellen.find((x) => x.id === id);
  if (!v || v.van !== "Sanne") return false;
  return sluit(id, "ingetrokken", "Sanne");
}

/** Meer tijd vragen: alleen de ontvanger, alleen bij een open voorstel. Geen instemming, geen verplichting; het voorstel blijft open. */
export function vraagMeerTijd(id: string, tot?: string, door: "Sanne" | "Joris" = reageerder(id)): boolean {
  const v = state.voorstellen.find((x) => x.id === id);
  if (!v || v.status !== "open" || door === v.van) return false;
  leg("schema", v.id, v.tekst, "UPDATED", { veld: "reactie", oud: "open", nieuw: tot ? `meer tijd gevraagd tot ${tot}` : "meer tijd gevraagd" }, door, { kinderen: kindLabels(v.kinderen) });
  zet({ ...state, voorstellen: state.voorstellen.map((x) => (x.id === id ? Object.freeze({ ...x, meerTijd: { door, datum: new Date().toISOString().slice(0, 10), ...(tot ? { tot } : {}) } }) : x)) });
  return true;
}

/** Vriendelijke herinnering: alleen de indiener, alleen bij een open voorstel. Vastgelegd in de historie; begrensd via herinneringen.ts. */
export function stuurHerinnering(id: string, door: "Sanne" | "Joris" = "Sanne"): boolean {
  const v = state.voorstellen.find((x) => x.id === id);
  if (!v || v.status !== "open" || v.van !== door) return false;
  const nu = new Date().toISOString().slice(0, 10);
  leg("schema", v.id, v.tekst, "UPDATED", { veld: "herinnering", oud: "", nieuw: "herinnering verstuurd" }, door, { kinderen: kindLabels(v.kinderen) });
  zet({ ...state, voorstellen: state.voorstellen.map((x) => (x.id === id ? Object.freeze({ ...x, herinneringen: [...(x.herinneringen ?? []), nu] }) : x)) });
  return true;
}

export function useZorg() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
export const uitzonderingenVan = (s: State, kind: KindId) => s.uitz.filter((u) => u.kind === kind);
export const statusLabel: Record<VoorstelStatus, string> = {
  open: "Reactie open · huidige planning blijft gelden",
  geaccepteerd: "✓ Geaccepteerd · verwerkt in de planning",
  afgewezen: "Niet doorgegaan · planning ongewijzigd",
  ingetrokken: "Ingetrokken · planning ongewijzigd",
  alternatief: "Alternatief voorgesteld · planning ongewijzigd",
};
