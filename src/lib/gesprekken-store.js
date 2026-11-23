import { useSyncExternalStore } from "react";
import i18n, { tLijst } from "@/i18n";
const module_ = (id, icoon) => ({ icoon, get t() { return i18n.t(`lib.gesprekkenStore.module.${id}.t`); }, get u() { return i18n.t(`lib.gesprekkenStore.module.${id}.u`); } });
export const moduleLabels = {
    gps: module_("gps", "locatie"),
    audio: module_("audio", "bellen"),
    video: module_("video", "video"),
    opname: module_("opname", "opname"),
    transcriptie: module_("transcriptie", "notitie"),
    samenvatting: module_("samenvatting", "slim"),
    acties: module_("acties", "akkoord"),
};
/** Ids (ook sleutels in state.bewaar); toon ze met bewaarLabel(). */
export const bewaarOnderdelen = ["Aankomstbevestigingen", "Belgegevens", "Opnames", "Transcripties", "Samenvattingen", "Toestemmingen"];
export const bewaarLabel = (id) => i18n.t(`lib.gesprekkenStore.bewaar.${id}`);
/** Bewaartermijnen: de waarde blijft de Nederlandse id, de weergave via termijnLabel(). */
export const bewaarTermijnen = ["30 dagen", "3 maanden", "1 jaar", "Tot ik verwijder"];
const TERMIJN_SLEUTEL = { "30 dagen": "dagen30", "3 maanden": "maanden3", "1 jaar": "jaar1", "Tot ik verwijder": "totVerwijderen" };
export const termijnLabel = (id) => i18n.t(`lib.gesprekkenStore.termijn.${TERMIJN_SLEUTEL[id] ?? "maanden3"}`);
const transcriptDemo = () => tLijst("lib.gesprekkenStore.transcript");
let state = {
    aan: { gps: false, audio: true, video: true, opname: false, transcriptie: false, samenvatting: false, acties: false },
    bewaar: Object.fromEntries(bewaarOnderdelen.map((b) => [b, b === "Aankomstbevestigingen" ? "30 dagen" : "3 maanden"])),
    onderweg: {},
    onderwegMeldingen: [],
    checkins: [{ id: 1, wie: "Joris", get moment() { return i18n.t("lib.gesprekkenStore.seed.checkinMoment"); }, get datum() { return i18n.t("lib.gesprekkenStore.seed.datum7"); }, tijd: "16:57" }],
    gesprekken: [
        { id: 3, soort: "audio", get datum() { return i18n.t("lib.gesprekkenStore.seed.datum10"); }, begin: "20:05", eind: "20:17", duur: "12 min", status: "Beantwoord",
            opname: { aangevraagd: "Joris", akkoord: [{ wie: "Joris", get wanneer() { return i18n.t("lib.gesprekkenStore.seed.wanneer10"); } }, { wie: "Sanne", get wanneer() { return i18n.t("lib.gesprekkenStore.seed.wanneer10"); } }], start: "20:06", eind: "20:17", kind: "Noah", get transcript() { return transcriptDemo(); } } },
        { id: 2, soort: "video", get datum() { return i18n.t("lib.gesprekkenStore.seed.datum8"); }, begin: "18:30", eind: "18:39", duur: "9 min", status: "Beantwoord" },
        { id: 1, soort: "audio", get datum() { return i18n.t("lib.gesprekkenStore.seed.datum5"); }, begin: "12:14", eind: "12:14", duur: "—", status: "Gemist" },
    ],
};
const listeners = new Set();
const zet = (p) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export const zetOnderweg = (momentId, wie, tijd) => {
    const o = { ...state.onderweg };
    if (wie)
        o[momentId] = wie;
    else
        delete o[momentId];
    const alGemeld = state.onderwegMeldingen.some((m) => m.momentId === momentId);
    const meldingen = wie && !alGemeld ? [...state.onderwegMeldingen, { momentId, tekst: tijd ? i18n.t("lib.gesprekkenStore.onderwegTijd", { wie, tijd }) : i18n.t("lib.gesprekkenStore.onderweg", { wie }) }] : state.onderwegMeldingen;
    zet({ onderweg: o, onderwegMeldingen: meldingen });
};
export const zetModule = (m, v) => zet({ aan: { ...state.aan, [m]: v } });
export const zetBewaar = (k, v) => zet({ bewaar: { ...state.bewaar, [k]: v } });
export const voegCheckInToe = (c) => zet({ checkins: [c, ...state.checkins] });
export const verwijderCheckIn = (id) => zet({ checkins: state.checkins.filter((c) => c.id !== id) });
export const voegGesprekToe = (g) => zet({ gesprekken: [g, ...state.gesprekken] });
export const werkOpnameBij = (id, p) => zet({ gesprekken: state.gesprekken.map((g) => (g.id === id && g.opname ? { ...g, opname: { ...g.opname, ...p } } : g)) });
export const demoTranscript = transcriptDemo;
export function useGesprekken() {
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
let meldingen = [];
const mListeners = new Set();
export const voegMeldingToe = (m) => { meldingen = [m, ...meldingen]; mListeners.forEach((l) => l()); };
export function useMeldingen() {
    return useSyncExternalStore((l) => { mListeners.add(l); return () => mListeners.delete(l); }, () => meldingen, () => meldingen);
}
