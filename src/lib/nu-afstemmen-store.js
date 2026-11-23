import i18n from "@/i18n";
import { useSyncExternalStore } from "react";
import { leg } from "@/lib/audit-store";
const NS = "lib.nuAfstemmenStore";
/** Labels worden pas bij het lezen vertaald (getters), zodat een taalwissel direct doorwerkt. */
const vertaald = (groep, ids) => Object.defineProperties({}, Object.fromEntries(ids.map((id) => [id, { enumerable: true, get: () => i18n.t(`${NS}.${groep}.${id}`) }])));
export const categorieLabel = vertaald("categorie", ["halen", "ziek", "planning", "vergeten", "anders"]);
export const reactieLabel = vertaald("reactie", ["zsm", "15", "30", "60", "eigen"]);
const optieLijst = (cat) => { const v = i18n.t(`${NS}.opties.${cat}`, { returnObjects: true }); return Array.isArray(v) ? v : []; };
export const standaardOpties = Object.defineProperties({}, Object.fromEntries(["halen", "ziek", "planning", "vergeten", "anders"].map((c) => [c, { enumerable: true, get: () => optieLijst(c) }])));
let lijst = [
    {
        id: "na-demo", categorie: "halen", kindIds: ["emma"], get titel() { return i18n.t(`${NS}.demo.titel`); },
        get toelichting() { return i18n.t(`${NS}.demo.toelichting`); }, reactieGewenst: "15", van: "ander", status: "opgelost", get antwoord() { return i18n.t(`${NS}.demo.antwoord`); },
        get opties() { const v = i18n.t(`${NS}.demo.opties`, { returnObjects: true }); return Array.isArray(v) ? v : []; }, moment: new Date().toISOString(),
        oudeTijd: "15:00", nieuweTijd: "15:35",
    },
];
const listeners = new Set();
const meld = () => listeners.forEach((l) => l());
export function startNuAfstemmen(d) {
    const n = { ...d, id: crypto.randomUUID(), van: "jij", status: "open", opties: standaardOpties[d.categorie], moment: new Date().toISOString() };
    lijst = [n, ...lijst];
    leg("besluit", n.id, i18n.t(`${NS}.audit`, { titel: n.titel }), "CREATED", undefined, "Sanne", { kinderen: n.kindIds });
    meld();
    return n.id;
}
/** Reageren lost de situatie op; het antwoord wordt vastgelegd, de planning verandert niet vanzelf. */
export function reageerNuAfstemmen(id, antwoord) {
    const n = lijst.find((x) => x.id === id);
    if (!n || n.status === "opgelost")
        return;
    lijst = lijst.map((x) => (x.id === id ? { ...x, status: "opgelost", antwoord } : x));
    leg("besluit", id, i18n.t(`${NS}.audit`, { titel: n.titel }), "UPDATED", { veld: "reactie", oud: "open", nieuw: antwoord }, "Sanne", { kinderen: n.kindIds });
    meld();
}
export function useNuAfstemmen() {
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => lijst, () => lijst);
}
/** Lezen zonder hook, voor koppelingen uit andere lagen (bijvoorbeeld "Afgestemd ✓" bij een afspraak). */
export const nuLijst = () => lijst;
export const openNuAfstemmen = (l) => l.filter((x) => x.status === "open");
