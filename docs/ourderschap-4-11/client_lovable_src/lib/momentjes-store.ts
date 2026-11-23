import { useSyncExternalStore } from "react";

export type Moment = "vooraf" | "tijdens" | "na" | "geen";
export type Momentje = {
  id: string;
  kindId: string;
  van: "sanne" | "joris" | "kring";
  /** Kringlid dat het momentje plaatste (alleen bij van: "kring"). */
  auteurId?: string | undefined;
  /** Kringleden met wie dit momentje is gedeeld (naast de andere ouder). */
  kringIds?: string[] | undefined;
  tekst: string;
  foto?: string | undefined;
  wanneer: string;
  /** ISO-datum voor betrouwbare kalenderherinneringen. */
  datum?: string | undefined;
  moment: Moment;
  mijlpaal?: string | undefined;
  prive: boolean;
  reactie?: string | undefined;
  reactieTekst?: string | undefined;
};

export const mijlpalen = [
  "Eerste stapjes", "Eerste woordje", "Eerste schooldag", "Eerste tand", "Zwemdiploma",
  "Verjaardag", "Sportprestatie", "Rapport", "Iets bijzonders",
];
export const reacties = [
  { e: "❤️", l: "Leuk" }, { e: "🥰", l: "Lief" }, { e: "🎉", l: "Trots" }, { e: "👏", l: "Wat goed!" },
];
export const momentLabel: Record<Moment, string> = {
  vooraf: "Vooraf", tijdens: "Tijdens", na: "Na afloop", geen: "",
};

type State = {
  lijst: Momentje[];
  herinnering: boolean;
  professionals: boolean;
};

let state: State = {
  herinnering: true,
  professionals: false,
  lijst: [
    { id: "m1", kindId: "noah", van: "joris", tekst: "Hij scoorde vanmiddag twee keer bij voetbal ⚽", wanneer: "Za 8 maart · 11:20 uur", moment: "tijdens", mijlpaal: "Sportprestatie", prive: false, reactie: "🎉", kringIds: ["marja", "peter"] },
    { id: "m0", kindId: "emma", van: "kring", auteurId: "marja", tekst: "Vanmiddag samen koekjes gebakken 🍪", wanneer: "Do 13 maart · 16:10 uur", moment: "geen", prive: false, kringIds: [] },
    { id: "m2", kindId: "emma", van: "sanne", tekst: "Ze heeft vandaag voor het eerst zelf gefietst zonder zijwieltjes! 🚲", wanneer: "Di 11 maart · 17:45 uur", moment: "geen", prive: false, mijlpaal: "Iets bijzonders", kringIds: ["marja"] },
    { id: "m3", kindId: "emma", van: "joris", tekst: "We zijn naar de kinderboerderij geweest 🐐 Emma wilde alle geitjes aaien.", wanneer: "Zo 9 maart · 15:10 uur", moment: "na", prive: false, reactie: "🥰", reactieTekst: "Wat leuk!" },
    { id: "m4", kindId: "noah", van: "sanne", tekst: "Hij was supertrots op zijn tekening van school.", wanneer: "Wo 12 maart · 13:05 uur", moment: "vooraf", prive: false },
  ],
};
const listeners = new Set<() => void>();
function zet(p: Partial<State>) {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}

export const voegMomentjeToe = (m: Momentje) => zet({ lijst: [m, ...state.lijst] });
export const reageer = (id: string, p: Partial<Momentje>) =>
  zet({ lijst: state.lijst.map((m) => (m.id === id ? { ...m, ...p } : m)) });
export const setHerinnering = (v: boolean) => zet({ herinnering: v });
export const setProfessionals = (v: boolean) => zet({ professionals: v });

export function useMomentjes() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
    () => state,
  );
}
