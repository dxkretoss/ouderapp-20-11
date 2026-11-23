import { useSyncExternalStore } from "react";
import i18n from "@/i18n";
const t = (k) => i18n.t(`lib.gezagStore.${k}`);
// Sleutels zijn opgeslagen waarden; labels worden bij het lezen vertaald.
export const gezagLabels = {
    get gezamenlijk() { return t("label.gezamenlijk"); },
    get ouder1() { return t("label.ouder1"); },
    get ouder2() { return t("label.ouder2"); },
    get voogd() { return t("label.voogd"); },
    get anders() { return t("label.anders"); },
    get onbekend() { return t("label.onbekend"); },
};
let state = {
    gezag: { emma: "gezamenlijk", noah: "gezamenlijk" },
    bevestigd: { emma: true, noah: false },
    afwijkend: false,
    extraSteun: false,
    gebruikt: [],
};
const listeners = new Set();
export function setGezagState(patch) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
}
export function useGezagState() {
    return useSyncExternalStore((l) => {
        listeners.add(l);
        return () => listeners.delete(l);
    }, () => state, () => state);
}
/** Zorgregeling bij gezamenlijk gezag, anders omgangsregeling. */
export function regelingNaam(g) {
    return g === "gezamenlijk" ? t("regeling.zorg") : t("regeling.omgang");
}
/** Onthoud dat een extra hulpmiddel is gebruikt, zodat het later makkelijk bereikbaar is. */
export function markeerGebruikt(pad) {
    if (!state.gebruikt.includes(pad))
        setGezagState({ gebruikt: [...state.gebruikt, pad] });
}
