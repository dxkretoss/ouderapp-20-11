import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import i18n from "@/i18n";
import { api, foutTekst } from "@/lib/api";
import { authState, opAuth } from "@/lib/auth-store";
import { start } from "@/lib/start-store";
const t = (k) => i18n.t(`lib.gezagStore.${k}`);
// Sleutels zijn opgeslagen waarden; labels worden bij het lezen vertaald.
// ouder1 = jij hebt eenhoofdig gezag, ouder2 = de andere ouder (vanuit de kijker, niet vanuit wie het invulde).
export const gezagLabels = {
    get gezamenlijk() { return t("label.gezamenlijk"); },
    get ouder1() { return t("label.ouder1"); },
    get ouder2() { return t("label.ouder2"); },
    get voogd() { return t("label.voogd"); },
    get anders() { return t("label.anders"); },
    get onbekend() { return t("label.onbekend"); },
};
/**
 * Gezag per kind = children.custody + custody_meta op de server (manage-children). Altijd door ouders zelf
 * ingevuld en alleen informatie: het geeft of ontneemt nooit toegang (dat staat apart per kind in
 * "Gezag en toegang"). "Bevestigd" = de andere ouder heeft bevestigd wat de één invulde (confirm-custody);
 * "Klopt niet" (dispute-custody) zet het op betwist; elke wijziging vraagt opnieuw om bevestiging.
 * Per kind: `afwijkend` (er is een afwijkende regeling, ook zonder gekozen afwijkingen) staat op de server,
 * `samen` zegt of er een andere ouder gekoppeld is (zonder andere ouder valt er niets te bevestigen),
 * `herkomst` = reported | acknowledged | verified | disputed.
 */
const leeg = { gezag: {}, bevestigd: {}, meta: {}, afwijkend: {}, afwijkingen: {}, samen: {}, herkomst: {}, extraSteun: false, gebruikt: [], geladen: false, voor: null };
let state = leeg;
const listeners = new Set();
export function setGezagState(patch) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
}
/** custody + meta (server) → sleutel van gezagLabels, vanuit de ingelogde ouder. */
export function gezagSleutel(custody, meta, mijnId) {
    if (custody === "gezamenlijk")
        return "gezamenlijk";
    if (custody === "een-ouder")
        return meta?.houder && meta.houder === mijnId ? "ouder1" : meta?.houder ? "ouder2" : "anders";
    if (custody === "anders")
        return meta?.detail === "voogd" ? "voogd" : "anders";
    return "onbekend";
}
/** Omgekeerd: sleutel → velden voor save-custody. */
function naarServer(sleutel) {
    if (sleutel === "gezamenlijk")
        return { custody: "gezamenlijk" };
    if (sleutel === "ouder1")
        return { custody: "een-ouder", holder: "me" };
    if (sleutel === "ouder2")
        return { custody: "een-ouder", holder: "other" };
    if (sleutel === "voogd")
        return { custody: "anders", detail: "voogd" };
    if (sleutel === "anders")
        return { custody: "anders", detail: "anders" };
    return { custody: "onbekend" };
}
let bezig = null;
export function laadGezag() {
    const a = authState();
    if (a.status !== "aan" || !a.gebruiker)
        return Promise.resolve();
    if (bezig)
        return bezig;
    bezig = api("manage-children", "list").then((r) => {
        const gezag = {}, bevestigd = {}, meta = {}, afwijkingen = {}, afwijkend = {}, samen = {}, herkomst = {};
        for (const c of r.children ?? []) {
            gezag[c.id] = c.custody ? gezagSleutel(c.custody, c.custody_meta, a.gebruiker.id) : "onbekend";
            bevestigd[c.id] = !!c.custody_meta?.bevestigdDoorAnder;
            meta[c.id] = c.custody ? { ...(c.custody_meta ?? {}), doorMij: c.custody_meta?.ingevuldDoor === a.gebruiker.id } : null;
            afwijkingen[c.id] = Array.isArray(c.custody_meta?.afwijkingen) ? c.custody_meta.afwijkingen : [];
            afwijkend[c.id] = afwijkingen[c.id].length > 0 || c.custody_meta?.afwijkend === true;
            // Samen = er is een andere ouder die kan bevestigen (gekoppeld aan dit kind)
            samen[c.id] = !!c.samen || (c.linked_parents ?? []).length > 0;
            herkomst[c.id] = c.custody_record?.provenance ?? (c.custody ? (c.custody_meta?.bevestigdDoorAnder ? "acknowledged" : c.custody_meta?.betwist ? "disputed" : "reported") : null);
        }
        setGezagState({ gezag, bevestigd, meta, afwijkingen, afwijkend, samen, herkomst, geladen: true, voor: a.gebruiker.id });
    }).catch(meldFout).finally(() => { bezig = null; });
    return bezig;
}
function meldFout(e) {
    if (e?.code === "UNAUTHORIZED")
        return;
    toast.error(foutTekst(e), { id: "gezag-fout" });
}
let gekoppeld = false;
function koppel() {
    if (gekoppeld || typeof window === "undefined")
        return;
    gekoppeld = true;
    const volg = () => {
        const a = authState();
        if (a.status === "aan" && state.voor !== a.gebruiker?.id)
            laadGezag();
    };
    opAuth(volg);
    queueMicrotask(volg);
}
export function useGezagState() {
    return useSyncExternalStore((l) => {
        koppel();
        listeners.add(l);
        return () => listeners.delete(l);
    }, () => state, () => state);
}
/**
 * Gezag van één kind vastleggen (optimistisch). Afwijkingen en de vlag "afwijkend" blijven staan tenzij
 * meegegeven. Geeft true bij succes.
 */
export async function zetGezag(kindId, sleutel, afwijkingen, afwijkend) {
    const vorig = state;
    const vlag = typeof afwijkend === "boolean" ? afwijkend : afwijkingen ? afwijkingen.length > 0 || !!state.afwijkend[kindId] : undefined;
    setGezagState({
        gezag: { ...state.gezag, [kindId]: sleutel },
        bevestigd: { ...state.bevestigd, [kindId]: false },
        herkomst: { ...state.herkomst, [kindId]: "reported" },
        meta: { ...state.meta, [kindId]: { ...(state.meta[kindId] ?? {}), doorMij: true, bevestigdDoorAnder: false, betwist: false } },
        ...(afwijkingen ? { afwijkingen: { ...state.afwijkingen, [kindId]: afwijkingen } } : {}),
        ...(typeof vlag === "boolean" ? { afwijkend: { ...state.afwijkend, [kindId]: vlag } } : {}),
    });
    try {
        await api("manage-children", "save-custody", { child_id: kindId, ...naarServer(sleutel), ...(afwijkingen ? { deviations: afwijkingen } : {}), ...(typeof vlag === "boolean" ? { afwijkend: vlag } : {}) });
        await laadGezag();
        start.hydrateer();
        return true;
    }
    catch (e) {
        setGezagState({ gezag: vorig.gezag, bevestigd: vorig.bevestigd, meta: vorig.meta, afwijkingen: vorig.afwijkingen, afwijkend: vorig.afwijkend, herkomst: vorig.herkomst });
        meldFout(e);
        return false;
    }
}
/** "Er is een afwijkende regeling" aan/uit (op de server per kind). Uit = ook de gekozen afwijkingen weg. */
export function zetAfwijkend(kindId, aan) {
    return zetGezag(kindId, state.gezag[kindId] ?? "onbekend", aan ? state.afwijkingen[kindId] ?? [] : [], aan);
}
/** De andere ouder: wat ingevuld is klopt niet (betwist). Geeft of ontneemt nog steeds geen toegang. */
export async function betwistGezag(kindId) {
    const vorig = state;
    setGezagState({ bevestigd: { ...state.bevestigd, [kindId]: false }, herkomst: { ...state.herkomst, [kindId]: "disputed" } });
    try {
        await api("manage-children", "dispute-custody", { child_id: kindId });
        await laadGezag();
        start.hydrateer();
    }
    catch (e) {
        setGezagState({ bevestigd: vorig.bevestigd, herkomst: vorig.herkomst });
        meldFout(e);
    }
}
/** De andere ouder bevestigt wat ingevuld is (nog steeds zelf opgegeven, alleen informatie). */
export async function bevestigGezag(kindId) {
    const vorig = state;
    setGezagState({ bevestigd: { ...state.bevestigd, [kindId]: true }, herkomst: { ...state.herkomst, [kindId]: "acknowledged" } });
    try {
        await api("manage-children", "confirm-custody", { child_id: kindId });
        await laadGezag();
        start.hydrateer();
    }
    catch (e) {
        setGezagState({ bevestigd: vorig.bevestigd, herkomst: vorig.herkomst });
        meldFout(e);
    }
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
