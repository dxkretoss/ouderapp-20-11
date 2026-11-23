import { useSyncExternalStore } from "react";
import { leg as legAudit } from "@/lib/audit-store";
import i18n, { taalLocale, tLijst } from "@/i18n";
const t = (sleutel, opties) => i18n.t(sleutel, opties);
const niv = (id, sleutel) => ({ id, get label() { return t(`lib.kringStore.niveau.${sleutel}`); } });
const onderdeel = (id, niveaus) => ({ id, get titel() { return t(`lib.kringStore.onderdelen.${id}.titel`); }, get uitleg() { return t(`lib.kringStore.onderdelen.${id}.uitleg`); }, niveaus });
export const onderdelen = [
    onderdeel("wissel", [niv("geen", "geen"), niv("bekijken", "bekijken")]),
    onderdeel("momentjes", [niv("geen", "geen"), niv("bekijken", "bekijken"), niv("bijdragen", "bekijkenDelen")]),
    onderdeel("taken", [niv("geen", "geen"), niv("bekijken", "bekijken"), niv("bijdragen", "bekijkenAfvinken")]),
    onderdeel("spullen", [niv("geen", "geen"), niv("bekijken", "bekijken"), niv("bijdragen", "bekijkenAanpassen")]),
    onderdeel("agenda", [niv("geen", "geen"), niv("bekijken", "alleenToegewezen"), niv("bijdragen", "toegewezenBijdragen")]),
    onderdeel("nood", [niv("geen", "geen"), niv("bekijken", "bekijken")]),
    onderdeel("documenten", [niv("geen", "geen"), niv("bekijken", "geselecteerdeDocumenten")]),
];
/** Praktische rol (label). Staat los van gezag (juridisch) en van app-toegang (rechten). */
export const rolOpties = ["Opa", "Oma", "Stiefouder / bonusouder", "Familielid", "Oppas", "Andere verzorger", "Anders"];
/** rol blijft een vaste (Nederlandse) waarde; dit is de weergavenaam. Zelf ingevulde rollen blijven zoals ingevuld. */
const ROL_SLEUTEL = { Opa: "opa", Oma: "oma", "Stiefouder / bonusouder": "stiefouder", Familielid: "familielid", Oppas: "oppas", "Andere verzorger": "andereVerzorger", Anders: "anders", Professional: "professional" };
export const rolNaam = (rol) => (ROL_SLEUTEL[rol] ? t(`lib.kringStore.rol.${ROL_SLEUTEL[rol]}`) : rol);
/** Spullen die mee moeten: weergave in de huidige taal (per taal één vaste lijst, zodat vergelijken blijft werken). */
const lijstCache = new Map();
const gecachet = (id, maak) => {
    const sleutel = `${i18n.resolvedLanguage}|${id}`;
    if (!lijstCache.has(sleutel))
        lijstCache.set(sleutel, maak());
    return lijstCache.get(sleutel);
};
const meeLijst = (id) => gecachet(id, () => tLijst(`lib.kringStore.momenten.${id}.mee`));
export const geenRechten = () => ({ wissel: "geen", momentjes: "geen", taken: "geen", spullen: "geen", agenda: "geen", nood: "geen", documenten: "geen" });
const r = (p) => ({ ...geenRechten(), ...p });
let state = {
    personen: [
        { id: "marja", naam: "Marja", rol: "Oma", contact: "06 - 22 33 44 55", periode: { type: "doorlopend" }, ingetrokken: false, sleutel: "k1",
            rechten: { emma: r({ wissel: "bekijken", momentjes: "bijdragen", taken: "bekijken", spullen: "bekijken", agenda: "bekijken", nood: "bekijken" }), noah: r({ wissel: "bekijken", momentjes: "bekijken" }) } },
        { id: "peter", naam: "Peter", rol: "Opa", contact: "06 - 55 44 33 22", periode: { type: "doorlopend" }, ingetrokken: false, sleutel: "k2",
            rechten: { emma: r({ momentjes: "bekijken" }), noah: r({ momentjes: "bekijken" }) } },
        { id: "lisa", naam: "Lisa", rol: "Oppas", contact: "lisa@voorbeeld.nl", periode: { type: "tot", eind: "2027-07-24" }, ingetrokken: false, sleutel: "k3",
            rechten: { emma: r({ wissel: "bekijken", nood: "bekijken", agenda: "bekijken" }), noah: r({ wissel: "bekijken", nood: "bekijken" }) } },
    ],
    momenten: [
        { id: "w1", kindIds: ["emma", "noah"], soort: "wissel", get titel() { return t("lib.kringStore.momenten.w1.titel"); }, get dag() { return t("lib.kringStore.momenten.w1.dag"); }, tijd: "14:30", datum: "2027-03-12", plek: "Basisschool De Boomgaard", get mee() { return meeLijst("w1"); }, get daarna() { return t("lib.kringStore.momenten.w1.daarna"); } },
        { id: "a1", kindIds: ["emma"], soort: "afspraak", get titel() { return t("lib.kringStore.momenten.a1.titel"); }, get dag() { return t("lib.kringStore.momenten.a1.dag"); }, tijd: "09:00", datum: "2027-03-13", get plek() { return t("lib.kringStore.momenten.a1.plek"); }, get mee() { return meeLijst("a1"); } },
        { id: "w2", kindIds: ["emma", "noah"], soort: "wissel", get titel() { return t("lib.kringStore.momenten.w2.titel"); }, get dag() { return t("lib.kringStore.momenten.w2.dag"); }, tijd: "18:00", datum: "2027-03-14", plek: "Molenstraat 12", get mee() { return meeLijst("w2"); } },
        { id: "w3", kindIds: ["emma", "noah"], soort: "wissel", get titel() { return t("lib.kringStore.momenten.w3.titel"); }, get dag() { return t("lib.kringStore.momenten.w3.dag"); }, tijd: "08:15", datum: "2027-03-15", plek: "Basisschool De Boomgaard", get mee() { return meeLijst("w3"); } },
    ],
    wie: { w1: "marja", a1: "marja", w2: "sanne", w3: "joris" },
    bevestigd: { w1: "regel" },
    // Al klaargezet: Schooltas en Knuffel (dezelfde teksten als in de mee-lijst van w1).
    meeKlaar: { get w1() { return gecachet("w1-klaar", () => { const l = meeLijst("w1"); return [l[0], l[2]]; }); } },
    takenKlaar: {},
    noodkaart: { emma: ["geboortedatum", "contacten", "huisarts", "allergieen", "medicatie"], noah: ["contacten", "huisarts", "allergieen"] },
    noodExtra: { get noah() { return t("lib.kringStore.noodExtraNoah"); } },
    gedeeldeDocs: {},
};
const listeners = new Set();
const serverState = state;
const PERSONEN_SLEUTEL = "onzeapp-kring-personen";
let personenGeladen = false;
function laadPersonen() {
    if (personenGeladen || typeof window === "undefined")
        return;
    personenGeladen = true;
    try {
        const opgeslagen = window.localStorage.getItem(PERSONEN_SLEUTEL);
        if (!opgeslagen)
            return;
        const personen = JSON.parse(opgeslagen);
        if (Array.isArray(personen) && personen.every((p) => p && typeof p.id === "string" && typeof p.naam === "string" && p.rechten && p.periode)) {
            state = { ...state, personen };
        }
    }
    catch { /* Bestaande gegevens blijven intact als opslag niet beschikbaar is. */ }
}
const zet = (p) => {
    laadPersonen();
    if (p.personen && typeof window !== "undefined") {
        // Bewaar dezelfde kringobjecten; geen aparte contactlijst of afgeleide rechten.
        // Bij een opslagfout blijft het formulier open zodat de ouder opnieuw kan proberen.
        window.localStorage.setItem(PERSONEN_SLEUTEL, JSON.stringify(p.personen));
    }
    state = { ...state, ...p };
    listeners.forEach((l) => l());
};
export function useKring() {
    return useSyncExternalStore((l) => { laadPersonen(); listeners.add(l); queueMicrotask(l); return () => listeners.delete(l); }, () => { laadPersonen(); return state; }, () => serverState);
}
export const kringState = () => { laadPersonen(); return state; };
/** Toegang vervalt automatisch na de einddatum; geen handmatige actie nodig. */
export function isActief(p, nu = new Date()) {
    if (p.ingetrokken)
        return false;
    const dag = nu.toISOString().slice(0, 10);
    if (p.periode.type === "tot")
        return dag <= p.periode.eind;
    if (p.periode.type === "periode")
        return dag >= p.periode.start && dag <= p.periode.eind;
    return true;
}
/** Effectief niveau: altijd "geen" als toegang niet actief is of kind niet gedeeld. */
export function niveau(p, kindId, o) {
    if (!isActief(p) || p.uitgenodigd === false || p.bevestigd === false)
        return "geen";
    return p.rechten[kindId]?.[o] ?? "geen";
}
export const mag = (p, kindId, o, min = "bekijken") => {
    const n = niveau(p, kindId, o);
    return min === "bekijken" ? n !== "geen" : n === "bijdragen";
};
export const voegPersoonToe = (p) => {
    laadPersonen();
    const nieuw = { ...p, id: `k${Date.now()}`, sleutel: crypto.randomUUID(), ingetrokken: false, ...(p.uitgenodigd ? { bevestigd: false } : {}) };
    zet({ personen: [...state.personen, nieuw] });
    return nieuw;
};
/** Alleen na inloggen/account aanmaken: de link alleen geeft nooit toegang. Sleutel wordt daarna vernieuwd zodat de link niet hergebruikt kan worden. */
export const bevestigUitnodiging = (sleutel, ingelogd) => {
    const p = state.personen.find((x) => x.sleutel === sleutel);
    if (!p || !ingelogd || p.bevestigd !== false || p.ingetrokken)
        return null;
    wijzigPersoon(p.id, { bevestigd: true });
    return p;
};
export const persoonVoorUitnodiging = (sleutel) => state.personen.find((x) => x.sleutel === sleutel && x.bevestigd === false && !x.ingetrokken);
export const wijzigPersoon = (id, p) => {
    laadPersonen();
    zet({ personen: state.personen.map((x) => (x.id === id ? { ...x, ...p } : x)) });
};
export const trekIn = (id) => wijzigPersoon(id, { ingetrokken: true, sleutel: crypto.randomUUID() });
export const zetWie = (momentId, wie) => {
    const m = state.momenten.find((x) => x.id === momentId);
    if (m && state.wie[momentId] !== wie)
        legAudit("afspraak", momentId, m.titel, "UPDATED", { veld: t("lib.kringStore.veld.verantwoordelijke"), oud: wieNaam(state.wie[momentId]), nieuw: wieNaam(wie) }, "Sanne", { kinderen: m.kindIds.map((k) => k[0].toUpperCase() + k.slice(1)) });
    const bevestigd = { ...state.bevestigd };
    delete bevestigd[momentId];
    zet({ wie: { ...state.wie, [momentId]: wie }, bevestigd });
};
export const bevestig = (momentId, v) => zet({ bevestigd: { ...state.bevestigd, [momentId]: v } });
export const toggleMee = (momentId, item) => {
    const l = state.meeKlaar[momentId] ?? [];
    zet({ meeKlaar: { ...state.meeKlaar, [momentId]: l.includes(item) ? l.filter((x) => x !== item) : [...l, item] } });
};
export const toggleNoodVeld = (kindId, v) => {
    const l = state.noodkaart[kindId] ?? [];
    zet({ noodkaart: { ...state.noodkaart, [kindId]: l.includes(v) ? l.filter((x) => x !== v) : [...l, v] } });
};
export const persoonLabel = (p) => (["Opa", "Oma"].includes(p.rol) ? t("lib.kringStore.persoonLabel", { rol: rolNaam(p.rol), naam: p.naam }) : p.naam);
export function wieNaam(id) {
    if (!id)
        return t("lib.kringStore.nogNiemand");
    if (id === "sanne")
        return "Sanne";
    if (id === "joris")
        return "Joris";
    const p = state.personen.find((x) => x.id === id);
    return p ? persoonLabel(p) : t("lib.kringStore.onbekend");
}
export function periodeTekst(p) {
    const f = (d) => new Date(d).toLocaleDateString(taalLocale(), { day: "numeric", month: "long", year: "numeric" });
    if (p.type === "tot")
        return t("lib.kringStore.periode.tot", { datum: f(p.eind) });
    if (p.type === "periode")
        return t("lib.kringStore.periode.periode", { start: f(p.start), eind: f(p.eind) });
    return t("lib.kringStore.periode.doorlopend");
}
/** Wat een kringlid voor een kind mag zien, in korte woorden. */
export function rechtenSamenvatting(p, kindId) {
    return onderdelen.filter((o) => niveau(p, kindId, o.id) !== "geen").map((o) => o.titel).join(" · ") || t("lib.kringStore.nogNietsGedeeld");
}
/** Adresboek rond een kind: iedereen in de kring (ook contacten zonder app-toegang). */
export const adresboek = (kindId) => { laadPersonen(); return state.personen.filter((p) => !p.ingetrokken && p.rechten[kindId]); };
export const noodcontacten = (kindId) => adresboek(kindId).filter((p) => p.noodcontact);
/** Contacten zonder app die een ouder wél kan registreren als ophaler (zonder digitale bevestiging). */
export const contactKandidaten = (m) => state.personen.filter((p) => !p.ingetrokken && p.uitgenodigd === false && m.kindIds.every((k) => p.rechten[k]));
export const heeftApp = (id) => state.personen.find((p) => p.id === id)?.uitgenodigd !== false;
/** Generiek: wie mag dit moment regelen? Ouders altijd; kringleden alleen met toegang voor álle betrokken kinderen. */
export function kandidatenVoor(m) {
    const o = m.soort === "wissel" ? "wissel" : "agenda";
    return state.personen.filter((p) => isActief(p) && m.kindIds.every((k) => niveau(p, k, o) !== "geen"));
}
/** Wie regelt dit — met bevestigingsstatus. Kiezen is nooit automatisch akkoord van een kringlid. */
export function regelStatus(momentId) {
    const wie = state.wie[momentId];
    if (!wie)
        return null;
    if (wie === "sanne")
        return { wie, tekst: t("lib.kringStore.regel.jij"), bevestigd: true };
    if (wie === "joris")
        return { wie, tekst: t("lib.kringStore.regel.andereOuder"), bevestigd: true };
    if (!heeftApp(wie))
        return { wie, tekst: t("lib.kringStore.regel.geregistreerd", { naam: wieNaam(wie) }), bevestigd: false };
    const b = state.bevestigd[momentId];
    return { wie, tekst: b ? t("lib.kringStore.regel.bevestigd", { naam: wieNaam(wie) }) : t("lib.kringStore.regel.gevraagd", { naam: wieNaam(wie) }), bevestigd: !!b };
}
/** Tijd of plek van een afspraak definitief aanpassen (wisselmomenten lopen via een voorstel). */
export function wijzigMoment(id, p, door = "Sanne") {
    const m = state.momenten.find((x) => x.id === id);
    if (!m)
        return;
    const kids = m.kindIds.map((k) => k[0].toUpperCase() + k.slice(1));
    if (p.tijd && p.tijd !== m.tijd)
        legAudit("afspraak", id, m.titel, "UPDATED", { veld: t("lib.kringStore.veld.tijdstip"), oud: `${m.dag} ${m.tijd}`, nieuw: `${m.dag} ${p.tijd}` }, door, { kinderen: kids });
    if (p.plek && p.plek !== m.plek)
        legAudit("afspraak", id, m.titel, "UPDATED", { veld: t("lib.kringStore.veld.locatie"), oud: m.plek, nieuw: p.plek }, door, { kinderen: kids });
    zet({ momenten: state.momenten.map((x) => (x.id === id ? { ...x, ...p } : x)) });
}
