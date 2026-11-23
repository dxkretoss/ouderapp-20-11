import { useSyncExternalStore } from "react";

export type Gezag = "gezamenlijk" | "ouder1" | "ouder2" | "voogd" | "anders" | "onbekend";

export const gezagLabels: Record<Gezag, string> = {
  gezamenlijk: "Beide ouders hebben gezamenlijk gezag",
  ouder1: "Sanne heeft eenhoofdig gezag",
  ouder2: "Joris heeft eenhoofdig gezag",
  voogd: "Er is een voogd",
  anders: "Anders / bijzondere situatie",
  onbekend: "Nog niet ingesteld",
};

type State = {
  gezag: Record<string, Gezag>;
  bevestigd: Record<string, boolean>;
  afwijkend: boolean;
  extraSteun: boolean;
  /** Extra-hulpmiddelen die deze ouder echt heeft gebruikt (paden). */
  gebruikt: string[];
};

let state: State = {
  gezag: { emma: "gezamenlijk", noah: "gezamenlijk" },
  bevestigd: { emma: true, noah: false },
  afwijkend: false,
  extraSteun: false,
  gebruikt: [],
};
const listeners = new Set<() => void>();

export function setGezagState(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useGezagState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

/** Zorgregeling bij gezamenlijk gezag, anders omgangsregeling. */
export function regelingNaam(g: Gezag) {
  return g === "gezamenlijk" ? "zorgregeling" : "omgangsregeling";
}

/** Onthoud dat een extra hulpmiddel is gebruikt, zodat het later makkelijk bereikbaar is. */
export function markeerGebruikt(pad: string) {
  if (!state.gebruikt.includes(pad)) setGezagState({ gebruikt: [...state.gebruikt, pad] });
}
