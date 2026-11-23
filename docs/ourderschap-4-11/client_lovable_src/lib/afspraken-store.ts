import { useSyncExternalStore } from "react";
import { onderlingeAfspraken } from "./demo-data";

/* ---------- model: één afspraak = één bronobject met versies en gebeurtenissen ---------- */
export const ONDERWERPEN = [
  ["Halen & brengen", "Halen & brengen"], ["Planning & wijzigingen", "Planning & wijzigingen"], ["Contact tussen ouders", "Contact"],
  ["Kinderen", "Kinderen"], ["School & opvang", "School & opvang"], ["Gezondheid", "Gezondheid"], ["Kosten", "Kosten"],
  ["Vakanties & bijzondere dagen", "Vakanties"], ["Anders", "Overig"],
] as const;
export type Onderwerp = (typeof ONDERWERPEN)[number][1];
export type Ouder = "Sanne" | "Joris";
export const IK: Ouder = "Sanne";
export const ANDER: Ouder = "Joris";
export const PRO = "Lotte Jansen";
export const PRO_LABEL = "Lotte Jansen · gezinscoach";

export type Bron = { soort: "professional" | "document"; label: string; datum?: string; document?: boolean };
export type Voorstel = { soort: "nieuw" | "wijziging" | "stoppen"; door: string; tekst?: string | undefined; datum: string; akkoord: Partial<Record<Ouder, true>> };
export type Gebeurtenis = { datum: string; tekst: string };
export type Afspraak = {
  id: string; titel: string; tekst: string; onderwerp: Onderwerp; kind: string; veiligheid?: boolean; formeel?: boolean;
  status: "Actief" | "Voorstel" | "Gestopt" | "Niet doorgegaan" | "Ingetrokken";
  afgesprokenOp?: string | undefined; geldtVanaf?: string | undefined; afgesprokenDoor?: string | undefined; bron?: Bron | undefined; evaluatie?: string | undefined; gestoptOp?: string | undefined;
  koppeling?: string | undefined; voorstel?: Voorstel | undefined; versies: { tekst: string; tot: string }[]; geschiedenis: Gebeurtenis[];
};

export const vandaag = () => new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
export const metPro = { soort: "professional", label: PRO_LABEL } as const;

// Demo-gegevens. Herkomst en datums alleen waar bekend; "Overdracht blijft praktisch" heeft een voorbeeldvoorstel van Joris.
const start: Afspraak[] = [
  { id: "a1", titel: "Overdracht via school", tekst: "Wisselen via school zodat ouders elkaar niet hoeven te ontmoeten.", onderwerp: "Halen & brengen", kind: "Emma & Noah", status: "Actief", afgesprokenOp: "1 oktober 2025", geldtVanaf: "1 oktober 2025", afgesprokenDoor: "Sanne & Joris", koppeling: "Agenda gebruikt school als overdrachtsplek.", versies: [], geschiedenis: [{ datum: "1 oktober 2025", tekst: "Afspraak gemaakt door Sanne & Joris." }] },
  { id: "a3", titel: "Overdracht blijft praktisch", tekst: "Geen inhoudelijke discussie tijdens de overdracht.", onderwerp: "Halen & brengen", kind: "Emma & Noah", status: "Actief", afgesprokenOp: "12 april 2026", geldtVanaf: "12 april 2026", afgesprokenDoor: "Sanne & Joris", versies: [],
    voorstel: { soort: "wijziging", door: ANDER, tekst: "Geen inhoudelijke discussie tijdens de overdracht. Andere onderwerpen bespreken we via de app.", datum: "5 oktober 2026", akkoord: { Joris: true } },
    geschiedenis: [{ datum: "5 oktober 2026", tekst: "Joris stelde een wijziging voor." }, { datum: "12 april 2026", tekst: "Afspraak gemaakt." }] },
  { id: "v1", titel: "Overdracht op neutrale plek", veiligheid: true, tekst: "Overdracht zondag 18:00 uur op een neutrale locatie (bibliotheek).", onderwerp: "Halen & brengen", kind: "Emma & Noah", status: "Actief", afgesprokenOp: "2 juni 2026", geldtVanaf: "2 juni 2026", bron: metPro, evaluatie: "15 oktober 2026", versies: [],
    voorstel: { soort: "wijziging", door: PRO, tekst: "Overdracht zondag 17:00 uur op een neutrale locatie (bibliotheek).", datum: "25 september 2026", akkoord: { Sanne: true } },
    geschiedenis: [{ datum: "25 september 2026", tekst: "Sanne ging akkoord met de wijziging." }, { datum: "25 september 2026", tekst: "Lotte Jansen stelde een wijziging voor tijdens het evaluatiegesprek." }, { datum: "2 juni 2026", tekst: "Afspraak vastgelegd met Lotte Jansen." }] },
  { id: "a2", titel: "Wijzigingen op tijd vragen", tekst: "Wijzigingen minimaal 48 uur vooraf aanvragen.", onderwerp: "Planning & wijzigingen", kind: "Emma & Noah", status: "Actief", afgesprokenOp: "3 maart 2026", geldtVanaf: "3 maart 2026", bron: metPro, evaluatie: "15 oktober 2026", koppeling: "Bij een laat wijzigingsverzoek toont de app een rustige herinnering.", versies: [], geschiedenis: [{ datum: "3 maart 2026", tekst: "Afspraak vastgelegd met Lotte Jansen." }] },
  { id: "f1", titel: "Omgangsregeling", formeel: true, tekst: "Om het weekend vrijdag 15:00 uur t/m zondag 18:00 uur.", onderwerp: "Planning & wijzigingen", kind: "Emma & Noah", status: "Actief", geldtVanaf: "14 november 2025", bron: { soort: "document", label: "Beschikking rechtbank", datum: "14 november 2025", document: true }, versies: [], geschiedenis: [{ datum: "14 november 2025", tekst: "Overgenomen uit de beschikking van de rechtbank." }] },
  { id: "a4", titel: "Geen boodschappen via de kinderen", tekst: "Het kind brengt geen boodschappen over tussen ouders.", onderwerp: "Contact", kind: "Emma & Noah", status: "Actief", afgesprokenOp: "12 april 2026", geldtVanaf: "12 april 2026", afgesprokenDoor: "Sanne & Joris", versies: [], geschiedenis: [{ datum: "12 april 2026", tekst: "Afspraak gemaakt." }] },
  { id: "v2", titel: "Lastige onderwerpen begeleid bespreken", veiligheid: true, tekst: "Lastige onderwerpen worden alleen in een begeleid gesprek besproken.", onderwerp: "Contact", kind: "Emma & Noah", status: "Actief", afgesprokenOp: "2 juni 2026", geldtVanaf: "2 juni 2026", bron: metPro, evaluatie: "1 december 2026", versies: [], geschiedenis: [{ datum: "2 juni 2026", tekst: "Afspraak vastgelegd met Lotte Jansen." }] },
];

// Onderlinge afspraken uit de vroegere lijst "Onze afspraken" — nu in deze ene bron.
const onderwerpVan: Record<string, Onderwerp> = { o1: "Kinderen", o2: "Kinderen", o3: "Halen & brengen", o4: "Kinderen", o5: "Vakanties", o6: "Gezondheid" };
const onderling: Afspraak[] = [
  ...onderlingeAfspraken.map((a) => ({ id: a.id, titel: a.titel, tekst: a.tekst, onderwerp: onderwerpVan[a.id] ?? "Overig", kind: "Emma & Noah", status: "Actief" as const,
    afgesprokenDoor: "Sanne & Joris", versies: [], geschiedenis: [{ datum: a.gewijzigd.replace("Bijgewerkt op ", ""), tekst: "Afspraak bijgewerkt." }, { datum: "12 september 2025", tekst: "Afspraak gemaakt door Sanne & Joris." }] })),
  { id: "x2", titel: "Gymspullen reizen mee", tekst: "De gymtas gaat altijd mee in de wisseltas.", onderwerp: "Kinderen", kind: "Emma", status: "Actief", afgesprokenOp: "20 februari 2026", geldtVanaf: "20 februari 2026", afgesprokenDoor: "Sanne & Joris", versies: [], geschiedenis: [{ datum: "20 februari 2026", tekst: "Joris stelde voor, Sanne ging akkoord." }] },
  { id: "x3", titel: "Voetbal op zaterdag", tekst: "Wie Noah in het weekend heeft, brengt hem naar voetbal.", onderwerp: "Halen & brengen", kind: "Noah", status: "Actief", afgesprokenOp: "3 januari 2026", geldtVanaf: "3 januari 2026", afgesprokenDoor: "Sanne & Joris", versies: [], geschiedenis: [{ datum: "3 januari 2026", tekst: "Afspraak gemaakt door Sanne & Joris." }] },
];

/** Wie moet nog instemmen? Een professional telt nooit als akkoord van ouders. */
export const nodig = (v: Voorstel): Ouder[] => ([IK, ANDER] as Ouder[]).filter((o) => !v.akkoord[o]);
export const wachtOpMij = (a: Afspraak) => !!a.voorstel && nodig(a.voorstel).includes(IK);
export const naam = (wie: string) => (wie === IK ? "Jij" : wie === PRO ? "Lotte" : wie);
export const zin = (v: Voorstel) => v.soort === "nieuw" ? "stelt een nieuwe afspraak voor" : v.soort === "stoppen" ? "wil deze afspraak stoppen" : "wil deze afspraak aanpassen";

export function voerUit(a: Afspraak): Afspraak {
  const v = a.voorstel;
  if (!v || nodig(v).length) return a;
  const d = vandaag();
  if (v.soort === "nieuw") return { ...a, tekst: v.tekst ?? a.tekst, status: "Actief", voorstel: undefined, afgesprokenOp: d, geldtVanaf: d, afgesprokenDoor: v.door === PRO ? undefined : "Sanne & Joris", geschiedenis: [{ datum: d, tekst: "Afspraak gaat in." }, ...a.geschiedenis] };
  if (v.soort === "stoppen") return { ...a, status: "Gestopt", gestoptOp: d, voorstel: undefined, geschiedenis: [{ datum: d, tekst: "Afspraak gestopt." }, ...a.geschiedenis] };
  if (!v.tekst) return a;
  return { ...a, tekst: v.tekst, voorstel: undefined, geldtVanaf: d, versies: [{ tekst: a.tekst, tot: d }, ...a.versies], geschiedenis: [{ datum: d, tekst: `Nieuwe versie ingegaan. Tekst gewijzigd van ‘${a.tekst}’ naar ‘${v.tekst}’.` }, ...a.geschiedenis] };
}


/** Eén bron voor alle afspraken; elk object heeft een versienummer om gelijktijdige wijzigingen te herkennen. */
let lijst: (Afspraak & { versie: number })[] = [...start, ...onderling].map((a) => ({ ...a, versie: 1 }));
const ls = new Set<() => void>();
export const afsprakenState = () => lijst;
/** Only the author can withdraw a pending proposal; the existing agreement is retained. */
export function trekAfspraakIn(id: string, door: string = IK): boolean {
  const a = lijst.find((x) => x.id === id);
  const v = a?.voorstel;
  if (!a || !v || v.door !== door || !nodig(v).length) return false;
  zetAfspraken((l) => l.map((x) => x.id === id ? { ...x, voorstel: undefined, status: v.soort === "nieuw" ? "Ingetrokken" : x.status,
    geschiedenis: [{ datum: vandaag(), tekst: `${door} trok het voorstel in. Ingetrokken · ${v.tekst ?? x.tekst}. De huidige afspraken blijven gelden.` }, ...x.geschiedenis] } : x));
  return true;
}
export function zetAfspraken(f: (l: Afspraak[]) => Afspraak[]) {
  const oud = new Map(lijst.map((a) => [a.id, a]));
  lijst = f(lijst).map((a) => { const o = oud.get(a.id); return o === a ? o : { ...a, versie: (o?.versie ?? 0) + 1 }; });
  ls.forEach((l) => l());
}
export function useAfspraken() {
  return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => lijst, () => lijst);
}

/** Eigen voorstellen die nog op de ander wachten (Home: "Afstemming loopt"). */
export const eigenOpenVoorstellen = (l: readonly Afspraak[]) => l.filter((a) => a.voorstel && a.voorstel.door === IK && nodig(a.voorstel).length > 0);

const maandNamen = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
/** "5 oktober 2026" → Date; zonder jaartal of onbekend → null (lezers verzinnen dan geen datum). */
export function geschiedenisDatum(t: string): Date | null {
  const m = /^(\d{1,2}) ([a-z]+) (\d{4})$/.exec(t.trim());
  const i = m ? maandNamen.indexOf(m[2]!) : -1;
  return m && i >= 0 ? new Date(Number(m[3]), i, Number(m[1]), 12) : null;
}
