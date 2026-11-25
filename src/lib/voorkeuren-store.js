import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { authState, opAuth } from "@/lib/auth-store";
/**
 * Voorkeuren staan op de server (profiles.preferences.app via manage-profile), zodat ze op elk
 * apparaat gelden. Lokaal blijven alleen: het thema (geen lichte flits bij het opstarten) en de
 * app-vergrendeling (`vergrendelId`, hoort bij dit apparaat).
 */
const SLEUTEL = "onzeapp-voorkeuren";
const ALLEEN_APPARAAT = ["vergrendelId"];
const standaard = { thema: "licht", bijzonderTonen: true, bijzonderHerinneren: false, vergrendelId: null, slimSuggesties: true, weekVooruit: true, overdrachtHulp: true, conflictControle: true, rustmodus: false, bundelen: true, nuAfstemmenAltijd: true, livingHome: true, weerEffecten: true, seizoenEffecten: true, bijzondereMomenten: true, beweging: "automatisch", weerPlaats: "Haarlem", rustVan: "21:00", rustTot: "07:00", vastgezet: [], gedempt: {}, aiSchrijfhulp: true, rustigerCommuniceren: true, communicatieSuggesties: true, verborgenCommunicatieSuggesties: [], gestructureerdAfstemmen: false, herinneringenGepauzeerd: false, extraHouvast: false, extraHouvastTipGezien: false, activiteitGelezen: [], nachtrustAan: false, nachtrustVan: "21:00", nachtrustTot: "08:00", berichtenPauzeTot: null, wisselHulp: false, coToestemming: null, meedenkenToestemming: null, checkinAan: true, slimLater: {}, slimNietMeer: [], slimRoutineNietNodig: [], slimAfstem: {}, laatsteBezoek: null };
let staat = standaard;
let geladen = false;
const luisteraars = new Set();
let voorId = null;
/** Oude, alleen-lokale voorkeuren: één keer naar de server overzetten als daar nog niets staat. */
let oudLokaal = null;
let laatsteServer = null;
const meld = () => luisteraars.forEach((l) => l());
/** Alleen apparaat-gebonden waarden lokaal (thema voor het opstartscript, vergrendeling). */
function bewaarLokaal() {
    try {
        localStorage.setItem(SLEUTEL, JSON.stringify({ thema: staat.thema, vergrendelId: staat.vergrendelId }));
    }
    catch { /* privémodus */ }
}
function vanAccount() {
    const g = authState().gebruiker;
    const id = (authState().status === "aan" || authState().status === "onboarding") && g ? g.id : null;
    const server = id && g.preferences && typeof g.preferences.app === "object" ? g.preferences.app : {};
    const sleutel = `${id}|${JSON.stringify(server)}`;
    // Zelfde account en (nog) dezelfde servergegevens, of er staat een eigen wijziging klaar: niets doen.
    if (sleutel === laatsteServer || (id === voorId && wachtrij))
        return;
    laatsteServer = sleutel;
    voorId = id;
    const apparaat = Object.fromEntries(ALLEEN_APPARAAT.map((k) => [k, staat[k]]));
    const overzetten = id && oudLokaal && !Object.keys(server).length;
    staat = { ...standaard, ...(overzetten ? oudLokaal : server), ...apparaat, ...(id ? {} : { thema: staat.thema }) };
    bewaarLokaal();
    if (overzetten) {
        oudLokaal = null;
        naarServer();
    }
    pasThemaToe();
    meld();
}
function laad() {
    if (geladen || typeof window === "undefined")
        return;
    geladen = true;
    try {
        const opgeslagen = JSON.parse(localStorage.getItem(SLEUTEL) ?? "{}");
        delete opgeslagen.slaapjes;
        if (Object.keys(opgeslagen).some((k) => k !== "thema" && k !== "vergrendelId"))
            oudLokaal = opgeslagen;
        // Alleen thema en vergrendeling komen nog van dit apparaat; de rest van de server.
        staat = { ...standaard, ...(opgeslagen.thema ? { thema: opgeslagen.thema } : {}), vergrendelId: opgeslagen.vergrendelId ?? null };
    }
    catch { /* standaard */ }
    opAuth(vanAccount);
    vanAccount();
}
let wachtrij = null;
/** Bundelt snelle wijzigingen tot één server-aanroep; bij een fout blijft de lokale waarde staan tot de volgende keer. */
function naarServer() {
    if (!voorId)
        return;
    clearTimeout(wachtrij);
    wachtrij = setTimeout(() => {
        wachtrij = null;
        const app = Object.fromEntries(Object.entries(staat).filter(([k]) => !ALLEEN_APPARAAT.includes(k)));
        api("manage-profile", "update", { preferences: { app } }, { stil: true }).catch((e) => console.warn("[voorkeuren] opslaan mislukt", e?.code ?? e));
    }, 600);
}
export function zetVoorkeur(k, v) {
    laad();
    staat = { ...staat, [k]: v };
    bewaarLokaal();
    if (!ALLEEN_APPARAAT.includes(k))
        naarServer();
    if (k === "thema")
        pasThemaToe();
    meld();
}
export function useVoorkeuren() {
    return useSyncExternalStore((l) => { laad(); luisteraars.add(l); l(); return () => luisteraars.delete(l); }, () => { laad(); return staat; }, () => standaard);
}
export function pasThemaToe() {
    if (typeof window === "undefined")
        return;
    laad();
    const donker = staat.thema === "donker" || (staat.thema === "automatisch" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", donker);
}
/** Inline script in <head> zodat er geen lichte flits is bij donker thema. */
export const themaScript = `(function(){try{var v=JSON.parse(localStorage.getItem("${SLEUTEL}")||"{}");var t=v.thema||"licht";if(t==="donker"||(t==="automatisch"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}})()`;
export const MAX_VASTGEZET = 3;
/** Zet vast of maak los; geeft false als er al drie vastgezet zijn. */
export function wisselVastgezet(id) {
    laad();
    const nu = staat.vastgezet;
    if (nu.includes(id)) {
        zetVoorkeur("vastgezet", nu.filter((x) => x !== id));
        return true;
    }
    if (nu.length >= MAX_VASTGEZET)
        return false;
    zetVoorkeur("vastgezet", [...nu, id]);
    return true;
}
/** Dempt gewone meldingen voor één gesprek; spoed (Nu afstemmen) en overdrachten blijven altijd doorkomen. */
export function dempGesprek(id, uren) {
    laad();
    const g = { ...staat.gedempt };
    if (uren === null)
        delete g[id];
    else
        g[id] = Date.now() + uren * 3600_000;
    zetVoorkeur("gedempt", g);
}
export const isGedempt = (v, id) => (v.gedempt[id] ?? 0) > Date.now();
