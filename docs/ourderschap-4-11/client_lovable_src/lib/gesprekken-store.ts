import { useSyncExternalStore } from "react";

export type Module = "gps" | "audio" | "video" | "opname" | "transcriptie" | "samenvatting" | "acties";
export const moduleLabels: Record<Module, { t: string; u: string }> = {
  gps: { t: "Aankomst bevestigen bij overdracht", u: "Alleen als jij bewust op de knop drukt" },
  audio: { t: "📞 Audiobellen", u: "Elkaar bellen vanuit de app" },
  video: { t: "🎥 Videobellen", u: "Beeldbellen vanuit de app" },
  opname: { t: "🔴 Opnameverzoeken", u: "Opnemen kan alleen als iedereen akkoord geeft" },
  transcriptie: { t: "📝 Gesprek uitschrijven", u: "Automatisch transcript van een opname" },
  samenvatting: { t: "✨ Samenvatting", u: "Neutrale, praktische samenvatting" },
  acties: { t: "✅ Van gesprek naar actie", u: "Voorstellen voor agenda, taken en afspraken" },
};

export type Bewaar = "30 dagen" | "3 maanden" | "1 jaar" | "Tot ik verwijder";
export const bewaarOnderdelen = ["Aankomstbevestigingen", "Belgegevens", "Opnames", "Transcripties", "Samenvattingen", "Toestemmingen"] as const;

export type CheckIn = { id: number; wie: string; moment: string; datum: string; tijd: string; /** Overdracht (kring-moment) waar deze bevestiging bij hoort. */ momentId?: string };
export type Gesprek = { id: number; soort: "audio" | "video"; datum: string; begin: string; eind: string; duur: string; status: "Beantwoord" | "Gemist"; opname?: Opname };
export type Opname = {
  aangevraagd: string; akkoord: { wie: string; wanneer: string }[]; start: string; eind: string; kind?: string;
  transcript?: string[]; samenvatting?: string[];
};

type State = {
  aan: Record<Module, boolean>;
  bewaar: Record<string, Bewaar>;
  checkins: CheckIn[];
  gesprekken: Gesprek[];
  /** Tijdelijke status 'onderweg' per overdracht (momentId → wie). Geen locatie, route of ETA. */
  onderweg: Record<string, string>;
  /** Rustige meldingen voor de andere ouder; per overdracht maximaal één. */
  onderwegMeldingen: { momentId: string; tekst: string }[];
};

const transcriptDemo = [
  "Joris: Zal ik Noah vrijdag om 17:00 uur ophalen bij de BSO?",
  "Sanne: Prima. Ik bel maandag de tandarts voor Emma.",
  "Joris: En de zwemles, zullen we die voortaan 50/50 doen?",
  "Sanne: Goed. De voetbalschoenen liggen trouwens bij jou.",
  "Joris: Klopt. De zomervakantie bespreken we volgende week verder.",
];

let state: State = {
  aan: { gps: false, audio: true, video: true, opname: false, transcriptie: false, samenvatting: false, acties: false },
  bewaar: Object.fromEntries(bewaarOnderdelen.map((b) => [b, b === "Aankomstbevestigingen" ? "30 dagen" : "3 maanden"])) as Record<string, Bewaar>,
  onderweg: {},
  onderwegMeldingen: [],
  checkins: [{ id: 1, wie: "Joris", moment: "Overdracht vr 7 maart", datum: "7 maart", tijd: "16:57" }],
  gesprekken: [
    { id: 3, soort: "audio", datum: "10 maart", begin: "20:05", eind: "20:17", duur: "12 min", status: "Beantwoord",
      opname: { aangevraagd: "Joris", akkoord: [{ wie: "Joris", wanneer: "10 maart 20:06" }, { wie: "Sanne", wanneer: "10 maart 20:06" }], start: "20:06", eind: "20:17", kind: "Noah", transcript: transcriptDemo } },
    { id: 2, soort: "video", datum: "8 maart", begin: "18:30", eind: "18:39", duur: "9 min", status: "Beantwoord" },
    { id: 1, soort: "audio", datum: "5 maart", begin: "12:14", eind: "12:14", duur: "—", status: "Gemist" },
  ],
};
const listeners = new Set<() => void>();
const zet = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };

export const zetOnderweg = (momentId: string, wie: string | null, tijd?: string) => {
  const o = { ...state.onderweg };
  if (wie) o[momentId] = wie; else delete o[momentId];
  const alGemeld = state.onderwegMeldingen.some((m) => m.momentId === momentId);
  const meldingen = wie && !alGemeld ? [...state.onderwegMeldingen, { momentId, tekst: `${wie} is onderweg${tijd ? ` voor de overdracht van ${tijd} uur` : ""}.` }] : state.onderwegMeldingen;
  zet({ onderweg: o, onderwegMeldingen: meldingen });
};
export const zetModule = (m: Module, v: boolean) => zet({ aan: { ...state.aan, [m]: v } });
export const zetBewaar = (k: string, v: Bewaar) => zet({ bewaar: { ...state.bewaar, [k]: v } });
export const voegCheckInToe = (c: CheckIn) => zet({ checkins: [c, ...state.checkins] });
export const verwijderCheckIn = (id: number) => zet({ checkins: state.checkins.filter((c) => c.id !== id) });
export const voegGesprekToe = (g: Gesprek) => zet({ gesprekken: [g, ...state.gesprekken] });
export const werkOpnameBij = (id: number, p: Partial<Opname>) =>
  zet({ gesprekken: state.gesprekken.map((g) => (g.id === id && g.opname ? { ...g, opname: { ...g.opname, ...p } } : g)) });
export const demoTranscript = transcriptDemo;

export function useGesprekken() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}

/** Persoonlijk veiligheidslogboek — alleen zichtbaar voor jezelf. */
export type Melding = { id: number; datum: string; tijd: string; gesprek?: string; notitie: string };
let meldingen: Melding[] = [];
const mListeners = new Set<() => void>();
export const voegMeldingToe = (m: Melding) => { meldingen = [m, ...meldingen]; mListeners.forEach((l) => l()); };
export function useMeldingen() {
  return useSyncExternalStore((l) => { mListeners.add(l); return () => mListeners.delete(l); }, () => meldingen, () => meldingen);
}
