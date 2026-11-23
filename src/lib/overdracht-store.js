import { useSyncExternalStore } from "react";
export const legeInhoud = (voor = "samen") => ({ voor, gezondheid: [], gezondheidNotitie: "", slaap: [], school: [], schoolNotitie: "", gevoel: {}, mooi: "", vraag: "" });
const SLEUTEL = "overdracht-v1";
let staat = { gedeeld: [], concept: {} };
let geladen = false;
const luisteraars = new Set();
function laad() {
    if (geladen || typeof window === "undefined")
        return;
    geladen = true;
    try {
        const r = localStorage.getItem(SLEUTEL);
        if (r)
            staat = { ...staat, ...JSON.parse(r) };
    }
    catch { /* leeg beginnen */ }
}
function zet(s) {
    staat = s;
    try {
        localStorage.setItem(SLEUTEL, JSON.stringify(s));
    }
    catch { /* alleen voor deze sessie */ }
    luisteraars.forEach((l) => l());
}
const LEEG = { gedeeld: [], concept: {} };
export function useOverdracht() {
    return useSyncExternalStore((l) => { laad(); luisteraars.add(l); return () => luisteraars.delete(l); }, () => { laad(); return staat; }, () => LEEG);
}
export function bewaarConcept(momentId, inhoud) { zet({ ...staat, concept: { ...staat.concept, [momentId]: inhoud } }); }
export function deelOverdracht(momentId, aan, inhoud) {
    const rest = staat.gedeeld.filter((o) => o.momentId !== momentId);
    const { [momentId]: _weg, ...concept } = staat.concept;
    zet({ gedeeld: [{ momentId, aan, gedeeldOp: new Date().toISOString(), inhoud }, ...rest], concept });
}
export function wijzigOverdracht(momentId) {
    const o = staat.gedeeld.find((x) => x.momentId === momentId);
    if (!o)
        return;
    zet({ gedeeld: staat.gedeeld.filter((x) => x.momentId !== momentId), concept: { ...staat.concept, [momentId]: o.inhoud } });
}
export const isGedeeld = (s, momentId) => s.gedeeld.some((o) => o.momentId === momentId);
/** Herinnering: 24 uur (of minder) vóór de wissel en nog niet gedeeld. */
export const overdrachtHerinnering = (urenTotWissel, gedeeld) => !gedeeld && urenTotWissel > 0 && urenTotWissel <= 24;
/** Voorbeeldgezin: uren tot de wissel volgens de demo-week (vandaag = woensdag 12, wissel 14:30). */
export function demoUrenTotWissel(wisselDatum, vandaag = 12, nu = new Date()) {
    if (wisselDatum == null)
        return 999;
    const uurNu = nu.getHours() + nu.getMinutes() / 60;
    return (wisselDatum - vandaag) * 24 + (14.5 - uurNu);
}
