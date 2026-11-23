import { useSyncExternalStore } from "react";
import { zorgweek } from "@/lib/demo-data";

/** Demo: "vandaag" is woensdag 12 maart. */
export const VANDAAG = 12;
export const isOverdrachtsdag = (datum = VANDAAG) => zorgweek.some((d) => d.datum === datum && d.wissel);

/** Dagelijkse check-in bij het openen van de app. */
type State = { aan: boolean; getoond: boolean; voorbeeld: boolean };
let state: State = { aan: true, getoond: false, voorbeeld: false };
const listeners = new Set<() => void>();

function zet(p: Partial<State>) {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}

export const setCheckinAan = (aan: boolean) => zet({ aan });
export const markeerCheckinGetoond = () => zet({ getoond: true, voorbeeld: false });
/** Laat de check-in zien zoals op een overdrachtsdag (voor de demo). */
export const toonVoorbeeld = () => zet({ voorbeeld: true, getoond: false });

export function useCheckin() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
