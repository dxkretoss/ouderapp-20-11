import { useSyncExternalStore } from "react";
import { voegTaakToe, zetContactStatus as zetTaakContactStatus, type ContactStatus } from "./taken-store";

/**
 * Aanwezigheid afstemmen bij een gedeelde afspraak (ouderavond, schoolgesprek, medisch, sport).
 * Eén actueel voorstel per afspraak; een tegenvoorstel vervangt het vorige, de geschiedenis blijft.
 * Geen reactie is nooit een akkoord. De app bepaalt nooit wie ergens naartoe "mag":
 * dit gaat alleen over de praktische afstemming tussen ouders.
 */
export type Wie = "sanne" | "joris";
export type AanwezigKeuze = "samen" | "een" | "afzonderlijk" | "later";
export type AanwezigFase = "open" | "voorstel" | "afgestemd";

export type Aanwezigheid = {
  afspraakId: string;
  keuze: AanwezigKeuze;
  /** open = nog niet afgestemd; voorstel = wacht op antwoord van de andere ouder; afgestemd = praktisch geregeld. */
  fase: AanwezigFase;
  /** Wie het huidige voorstel deed. */
  door: Wie;
  /** Bij "een": wie zou gaan ("onbekend" = nog niet bekend). */
  wieGaat?: Wie | "onbekend" | undefined;
  /** Bij "afzonderlijk": wie neemt contact op met school/organisatie ("nog" = nog afstemmen). */
  contactWie?: Wie | "nog" | undefined;
  /** Koppeling naar de bestaande taak in het takenoverzicht. */
  contactTaakId?: string | undefined;
  /** Uitkomst ná contact met school/organisatie. */
  uitkomst?: "mogelijk" | "wacht-op-school" | "niet-mogelijk" | "anders" | undefined;
  uitkomstToelichting?: string | undefined;
  /** Na afloop gedeelde punten; toegevoegd door één ouder, niet automatisch bevestigd door de ander. */
  nabespreking?: { besproken: string; afspraken: string; door: Wie; datum: string } | undefined;
  geschiedenis: { datum: string; tekst: string }[];
};

export const keuzeLabel: Record<AanwezigKeuze, string> = {
  samen: "Samen gaan",
  een: "Eén van ons gaat",
  afzonderlijk: "Afzonderlijk deelnemen",
  later: "Later afstemmen",
};

const vandaag = () => new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
export const wieNaamKort = (w: Wie) => (w === "sanne" ? "Jij" : "De andere ouder");

let lijst: Aanwezigheid[] = [];
const ls = new Set<() => void>();
const zet = (f: (l: Aanwezigheid[]) => Aanwezigheid[]) => { lijst = f(lijst); ls.forEach((l) => l()); };
export const aanwezigheidState = () => lijst;
export const aanwezigVoor = (afspraakId: string) => lijst.find((a) => a.afspraakId === afspraakId) ?? null;
export function useAanwezigheid() {
  return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => lijst, () => lijst);
}

const beschrijving = (a: Pick<Aanwezigheid, "keuze" | "wieGaat" | "contactWie">) =>
  a.keuze === "samen" ? "samen gaan"
    : a.keuze === "een" ? `één van jullie gaat${a.wieGaat && a.wieGaat !== "onbekend" ? ` (${wieNaamKort(a.wieGaat).toLowerCase()})` : ""}`
    : a.keuze === "afzonderlijk" ? "afzonderlijk deelnemen"
    : "later afstemmen";

/**
 * Start of vervang het actuele voorstel voor deze afspraak. Eén actueel voorstel per onderwerp;
 * een nieuw voorstel vervangt het vorige, de geschiedenis blijft bewaard.
 * "later" zet geen voorstel klaar maar markeert de afstemming als open.
 */
export function startAfstemming(afspraakId: string, keuze: AanwezigKeuze, door: Wie, opties: { wieGaat?: Wie | "onbekend"; contactWie?: Wie | "nog"; kind: string; afspraakTitel: string }): Aanwezigheid {
  const bestaand = aanwezigVoor(afspraakId);
  // "later" en "nog afstemmen" zetten geen voorstel klaar; "ik neem contact op" is een eigen toezegging en is direct geregeld.
  const fase: AanwezigFase = keuze === "later" || (keuze === "afzonderlijk" && (!opties.contactWie || opties.contactWie === "nog")) ? "open"
    : keuze === "afzonderlijk" && opties.contactWie === door ? "afgestemd" : "voorstel";
  const basis: Aanwezigheid = {
    afspraakId, keuze, fase, door,
    wieGaat: opties.wieGaat, contactWie: opties.contactWie,
    contactTaakId: bestaand?.contactTaakId, uitkomst: bestaand?.uitkomst, uitkomstToelichting: bestaand?.uitkomstToelichting,
    nabespreking: bestaand?.nabespreking,
    geschiedenis: [{ datum: vandaag(), tekst: `${wieNaamKort(door)} stelde voor: ${beschrijving({ keuze, wieGaat: opties.wieGaat, contactWie: opties.contactWie })}.${bestaand ? " Dit vervangt het vorige voorstel." : ""}` }, ...(bestaand?.geschiedenis ?? [])],
  };
  // Contacttaak: alleen aanmaken als er nog geen is en iemand contact gaat opnemen.
  if (keuze === "afzonderlijk" && opties.contactWie && opties.contactWie !== "nog" && !basis.contactTaakId) {
    const taakId = voegTaakToe({ tekst: `Afzonderlijk gesprek aanvragen bij school (${opties.afspraakTitel})`, kind: opties.kind, wie: opties.contactWie === door ? door : "", herhaling: "eenmalig", afspraakId, contactStatus: "nog-te-regelen", ...(opties.contactWie !== door ? { overdragenAan: opties.contactWie } : {}) });
    basis.contactTaakId = taakId;
    basis.geschiedenis = [{ datum: vandaag(), tekst: opties.contactWie === "sanne" ? "Jij neemt contact op met school. Dit is een eigen toezegging." : "De andere ouder wordt gevraagd contact op te nemen. De taak is pas van die ouder na bevestiging." }, ...basis.geschiedenis];
  }
  zet((l) => [basis, ...l.filter((a) => a.afspraakId !== afspraakId)]);
  return basis;
}

export type Reactie = "akkoord" | "liever-niet-samen" | "dat-lukt" | "dat-lukt-niet";

/** Welke reacties passen bij het huidige voorstel? */
export function reactiesVoor(a: Aanwezigheid): { id: Reactie | "ander"; label: string }[] {
  if (a.fase !== "voorstel") return [];
  if (a.keuze === "samen") return [{ id: "akkoord", label: "Akkoord" }, { id: "ander", label: "Ander voorstel" }, { id: "liever-niet-samen", label: "Liever niet samen" }];
  if (a.keuze === "een") return [{ id: "dat-lukt", label: "Dat lukt" }, { id: "dat-lukt-niet", label: "Dat lukt niet" }, { id: "ander", label: "Ander voorstel" }];
  return [{ id: "akkoord", label: "Akkoord" }, { id: "ander", label: "Ander voorstel" }];
}

/**
 * Verwerk een reactie op het actuele voorstel. "ander" doet de aanroeper zelf via startAfstemming.
 * Geen schuldtaal: een afwijzing is een feitelijke status, zonder verplichte uitleg.
 */
export function reageer(afspraakId: string, reactie: Reactie, door: Wie): boolean {
  const a = aanwezigVoor(afspraakId);
  if (!a || a.fase !== "voorstel" || door === a.door) return false;
  const d = vandaag();
  if (reactie === "akkoord" || reactie === "dat-lukt") {
    zet((l) => l.map((x) => x.afspraakId === afspraakId ? { ...x, fase: "afgestemd" as const, geschiedenis: [{ datum: d, tekst: `Afgestemd: ${beschrijving(x)}.` }, ...x.geschiedenis] } : x));
    return true;
  }
  if (reactie === "liever-niet-samen") {
    zet((l) => l.map((x) => x.afspraakId === afspraakId ? { ...x, fase: "open" as const, geschiedenis: [{ datum: d, tekst: "Samen gaan is niet afgesproken. Jullie kunnen een andere mogelijkheid kiezen." }, ...x.geschiedenis] } : x));
    return true;
  }
  // "dat-lukt-niet": voorstel vervalt, afstemming blijft open.
  zet((l) => l.map((x) => x.afspraakId === afspraakId ? { ...x, fase: "open" as const, geschiedenis: [{ datum: d, tekst: "Dit voorstel lukt niet. De afstemming blijft open." }, ...x.geschiedenis] } : x));
  return true;
}

/** Leg de uitkomst van het contact met school/organisatie vast; werkt de gekoppelde taak bij. */
export function zetUitkomst(afspraakId: string, uitkomst: NonNullable<Aanwezigheid["uitkomst"]>, toelichting?: string) {
  const a = aanwezigVoor(afspraakId);
  if (!a) return;
  const status: ContactStatus = uitkomst === "mogelijk" ? "afgerond" : uitkomst === "wacht-op-school" ? "wacht-op-reactie" : uitkomst === "niet-mogelijk" ? "niet-mogelijk" : "contact-opgenomen";
  if (a.contactTaakId) zetTaakContactStatus(a.contactTaakId, status);
  const tekst = uitkomst === "mogelijk" ? "Afzonderlijke gesprekken zijn mogelijk." : uitkomst === "wacht-op-school" ? "School komt hierop terug." : uitkomst === "niet-mogelijk" ? "Afzonderlijke gesprekken zijn niet mogelijk." : "Uitkomst vastgelegd.";
  zet((l) => l.map((x) => x.afspraakId === afspraakId ? { ...x, uitkomst, uitkomstToelichting: toelichting?.trim() || undefined, fase: uitkomst === "mogelijk" ? "afgestemd" as const : x.fase, geschiedenis: [{ datum: vandaag(), tekst }, ...x.geschiedenis] } : x));
}

/** Markeer in de gekoppelde taak dat contact is opgenomen (nog zonder uitkomst). */
export function markeerContactOpgenomen(afspraakId: string) {
  const a = aanwezigVoor(afspraakId);
  if (a?.contactTaakId) zetTaakContactStatus(a.contactTaakId, "contact-opgenomen");
}

/** Na afloop: belangrijkste punten delen. Toegevoegd door één ouder; geen automatische bevestiging. */
export function deelNabespreking(afspraakId: string, besproken: string, afspraken: string, door: Wie) {
  if (!besproken.trim() && !afspraken.trim()) return;
  const bestaand = aanwezigVoor(afspraakId);
  const nabespreking = { besproken: besproken.trim(), afspraken: afspraken.trim(), door, datum: vandaag() };
  zet((l) => bestaand
    ? l.map((x) => x.afspraakId === afspraakId ? { ...x, nabespreking, geschiedenis: [{ datum: vandaag(), tekst: "Belangrijkste punten gedeeld." }, ...x.geschiedenis] } : x)
    : [{ afspraakId, keuze: "later" as const, fase: "open" as const, door, nabespreking, geschiedenis: [{ datum: vandaag(), tekst: "Belangrijkste punten gedeeld." }] }, ...l]);
}

/** Eén korte statusregel voor op de agendakaart. */
export function statusRegel(a: Aanwezigheid | null, taakStatus?: ContactStatus | undefined): string | null {
  if (!a) return null;
  // Bij afzonderlijk deelnemen vertelt de contacttaak de actuele stand; die gaat vóór op de algemene fase.
  if (a.keuze === "afzonderlijk") {
    if (taakStatus === "afgerond" && !a.uitkomst) return "Contacttaak afgerond — uitkomst nog vastleggen";
    if (a.uitkomst === "mogelijk") return "Afzonderlijk deelnemen — afgestemd";
    if (a.uitkomst === "niet-mogelijk") return "Afzonderlijke gesprekken zijn niet mogelijk";
    if (taakStatus === "wacht-op-reactie") return "Afzonderlijke gesprekken aangevraagd — wacht op school";
    if (a.contactWie === "sanne" && taakStatus !== "afgerond") return "Jij neemt contact op met school";
    if (a.contactWie && a.contactWie !== "sanne" && a.contactWie !== "nog") return a.fase === "afgestemd" ? "De andere ouder neemt contact op" : "De andere ouder wordt gevraagd contact op te nemen";
  }
  if (a.fase === "afgestemd") {
    if (a.keuze === "samen") return "Samen gaan — afgestemd";
    if (a.keuze === "een") return `Eén ouder gaat${a.wieGaat && a.wieGaat !== "onbekend" ? ` (${wieNaamKort(a.wieGaat).toLowerCase()})` : ""} — afgestemd`;
    return "Aanwezigheid afgestemd";
  }
  if (a.fase === "voorstel") return a.door === "sanne" ? `Voorstel: ${beschrijving(a)} — wacht op antwoord` : "Voorstel over aanwezigheid — reageren";
  return "Aanwezigheid nog afstemmen";
}

/** Alleen voor tests. */
export const resetAanwezigheid = () => zet(() => []);
