import { useSyncExternalStore } from "react";

/** Gedeelde meeneemlijst en overdrachtstatus — gelezen door Wisselassistent, Overdracht en KindKompas. */
export const meeneemLijst = [
  { id: "knuffel", icoon: "🧸", tekst: "Knuffel van Noah moet mee" },
  { id: "medicatie", icoon: "💊", tekst: "Neusspray Emma meenemen" },
  { id: "zwemtas", icoon: "🏊", tekst: "Zaterdag 09:00 uur zwemles → zwemtas (staat bij Sanne)" },
  { id: "gym", icoon: "👟", tekst: "Maandag gym → gymtas Emma" },
  { id: "boek", icoon: "📚", tekst: "Bibliotheekboek terug naar Joris" },
];

type State = { klaar: Set<string>; overdrachtIngevuld: boolean; laatsteOverdracht: Record<string, string> };
let state: State = { klaar: new Set(), overdrachtIngevuld: false, laatsteOverdracht: {} };
const listeners = new Set<() => void>();
const zet = (s: State) => {
  state = s;
  listeners.forEach((l) => l());
};

export function toggleMeeneem(id: string) {
  const klaar = new Set(state.klaar);
  if (klaar.has(id)) klaar.delete(id);
  else klaar.add(id);
  zet({ ...state, klaar });
}

export function beginOverdracht(kindId: string) {
  if (!state.laatsteOverdracht[kindId]) zet({ ...state, laatsteOverdracht: { ...state.laatsteOverdracht, [kindId]: new Date().toISOString() } });
}

export function markeerOverdrachtIngevuld(kindId?: string) {
  zet({ ...state, overdrachtIngevuld: true, laatsteOverdracht: kindId ? { ...state.laatsteOverdracht, [kindId]: new Date().toISOString() } : state.laatsteOverdracht });
}

export function useWissel() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
