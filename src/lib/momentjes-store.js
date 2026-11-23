import { useSyncExternalStore } from "react";
import i18n from "@/i18n";
const t = (sleutel) => i18n.t(sleutel);
/** Vaste mijlpaalwaarden (worden zo bewaard); weergave via mijlpaalLabel. */
export const mijlpalen = [
    "Eerste stapjes", "Eerste woordje", "Eerste schooldag", "Eerste tand", "Zwemdiploma",
    "Verjaardag", "Sportprestatie", "Rapport", "Iets bijzonders",
];
const MIJLPAAL_SLEUTEL = { "Eerste stapjes": "eersteStapjes", "Eerste woordje": "eersteWoordje", "Eerste schooldag": "eersteSchooldag", "Eerste tand": "eersteTand", Zwemdiploma: "zwemdiploma", Verjaardag: "verjaardag", Sportprestatie: "sportprestatie", Rapport: "rapport", "Iets bijzonders": "ietsBijzonders" };
export const mijlpaalLabel = (m) => (MIJLPAAL_SLEUTEL[m] ? t(`lib.momentjesStore.mijlpaal.${MIJLPAAL_SLEUTEL[m]}`) : m);
/** Snelle reacties: bewaard als vaste id; icoon en tekst worden bij de weergave gekozen (zie Momentjes.jsx). */
export const reacties = [
    { id: "leuk", get l() { return t("lib.momentjesStore.reactie.leuk"); } }, { id: "lief", get l() { return t("lib.momentjesStore.reactie.lief"); } }, { id: "trots", get l() { return t("lib.momentjesStore.reactie.trots"); } }, { id: "watGoed", get l() { return t("lib.momentjesStore.reactie.watGoed"); } },
];
export const momentLabel = {
    get vooraf() { return t("lib.momentjesStore.moment.vooraf"); }, get tijdens() { return t("lib.momentjesStore.moment.tijdens"); }, get na() { return t("lib.momentjesStore.moment.na"); }, geen: "",
};
let state = {
    herinnering: true,
    professionals: false,
    lijst: [
        { id: "m1", kindId: "noah", van: "joris", get tekst() { return t("lib.momentjesStore.voorbeeld.m1.tekst"); }, get wanneer() { return t("lib.momentjesStore.voorbeeld.m1.wanneer"); }, moment: "tijdens", mijlpaal: "Sportprestatie", prive: false, reactie: "trots", kringIds: ["marja", "peter"] },
        { id: "m0", kindId: "emma", van: "kring", auteurId: "marja", get tekst() { return t("lib.momentjesStore.voorbeeld.m0.tekst"); }, get wanneer() { return t("lib.momentjesStore.voorbeeld.m0.wanneer"); }, moment: "geen", prive: false, kringIds: [] },
        { id: "m2", kindId: "emma", van: "sanne", get tekst() { return t("lib.momentjesStore.voorbeeld.m2.tekst"); }, get wanneer() { return t("lib.momentjesStore.voorbeeld.m2.wanneer"); }, moment: "geen", prive: false, mijlpaal: "Iets bijzonders", kringIds: ["marja"] },
        { id: "m3", kindId: "emma", van: "joris", get tekst() { return t("lib.momentjesStore.voorbeeld.m3.tekst"); }, get wanneer() { return t("lib.momentjesStore.voorbeeld.m3.wanneer"); }, moment: "na", prive: false, reactie: "lief", get reactieTekst() { return t("lib.momentjesStore.voorbeeld.m3.reactieTekst"); } },
        { id: "m4", kindId: "noah", van: "sanne", get tekst() { return t("lib.momentjesStore.voorbeeld.m4.tekst"); }, get wanneer() { return t("lib.momentjesStore.voorbeeld.m4.wanneer"); }, moment: "vooraf", prive: false },
    ],
};
const listeners = new Set();
function zet(p) {
    state = { ...state, ...p };
    listeners.forEach((l) => l());
}
export const voegMomentjeToe = (m) => zet({ lijst: [m, ...state.lijst] });
export const reageer = (id, p) => zet({ lijst: state.lijst.map((m) => (m.id === id ? { ...m, ...p } : m)) });
export const setHerinnering = (v) => zet({ herinnering: v });
export const setProfessionals = (v) => zet({ professionals: v });
export function useMomentjes() {
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
