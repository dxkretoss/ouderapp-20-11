import { useSyncExternalStore } from "react";
import i18n from "@/i18n";
/** Gedeelde meeneemlijst en overdrachtstatus — gelezen door Wisselassistent, Overdracht en KindKompas. */
export const meeneemLijst = [
    { id: "knuffel", icoon: "opvang", get tekst() { return i18n.t("lib.wisselStore.meeneem.knuffel"); } },
    { id: "medicatie", icoon: "medisch", get tekst() { return i18n.t("lib.wisselStore.meeneem.medicatie"); } },
    { id: "zwemtas", icoon: "zwemmen", get tekst() { return i18n.t("lib.wisselStore.meeneem.zwemtas"); } },
    { id: "gym", icoon: "schoenen", get tekst() { return i18n.t("lib.wisselStore.meeneem.gym"); } },
    { id: "boek", icoon: "boek", get tekst() { return i18n.t("lib.wisselStore.meeneem.boek"); } },
];
let state = { klaar: new Set(), overdrachtIngevuld: false, laatsteOverdracht: {} };
const listeners = new Set();
const zet = (s) => {
    state = s;
    listeners.forEach((l) => l());
};
export function toggleMeeneem(id) {
    const klaar = new Set(state.klaar);
    if (klaar.has(id))
        klaar.delete(id);
    else
        klaar.add(id);
    zet({ ...state, klaar });
}
export function beginOverdracht(kindId) {
    if (!state.laatsteOverdracht[kindId])
        zet({ ...state, laatsteOverdracht: { ...state.laatsteOverdracht, [kindId]: new Date().toISOString() } });
}
export function markeerOverdrachtIngevuld(kindId) {
    zet({ ...state, overdrachtIngevuld: true, laatsteOverdracht: kindId ? { ...state.laatsteOverdracht, [kindId]: new Date().toISOString() } : state.laatsteOverdracht });
}
export function useWissel() {
    return useSyncExternalStore((l) => {
        listeners.add(l);
        return () => listeners.delete(l);
    }, () => state, () => state);
}
