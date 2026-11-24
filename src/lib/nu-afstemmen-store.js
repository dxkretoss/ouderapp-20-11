import i18n from "@/i18n";
import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { herlaad, meldFout, online, opAgendaLijst, startAgendaSync } from "@/lib/agenda-store";
const NS = "lib.nuAfstemmenStore";
/** Labels worden pas bij het lezen vertaald (getters), zodat een taalwissel direct doorwerkt. */
const vertaald = (groep, ids) => Object.defineProperties({}, Object.fromEntries(ids.map((id) => [id, { enumerable: true, get: () => i18n.t(`${NS}.${groep}.${id}`) }])));
export const categorieLabel = vertaald("categorie", ["halen", "ziek", "planning", "vergeten", "anders"]);
export const reactieLabel = vertaald("reactie", ["zsm", "15", "30", "60", "eigen"]);
const optieLijst = (cat) => { const v = i18n.t(`${NS}.opties.${cat}`, { returnObjects: true }); return Array.isArray(v) ? v : []; };
export const standaardOpties = Object.defineProperties({}, Object.fromEntries(["halen", "ziek", "planning", "vergeten", "anders"].map((c) => [c, { enumerable: true, get: () => optieLijst(c) }])));
/**
 * "Nu afstemmen": een vraag voor vandaag aan de andere ouder (bron: manage-agenda, alleen de laatste 14 dagen).
 * Reageren lost de vraag op en wordt vastgelegd; de planning verandert nooit vanzelf.
 * `van`: "jij" (jouw vraag) of "ander" (van de andere ouder), vanuit de ingelogde ouder.
 */
let lijst = [];
const listeners = new Set();
const meld = () => listeners.forEach((l) => l());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const vanServer = (u) => ({ id: u.id, categorie: u.categorie, kindIds: u.kind_ids ?? [], titel: u.titel, toelichting: u.toelichting ?? "", reactieGewenst: u.reactie_gewenst ?? "zsm", van: u.van, status: u.status, antwoord: u.antwoord ?? undefined, get opties() { return standaardOpties[u.categorie] ?? []; }, moment: u.moment, oudeTijd: u.oude_tijd ?? undefined, nieuweTijd: u.nieuwe_tijd ?? undefined });
opAgendaLijst((r) => { lijst = r ? (r.urgent ?? []).map(vanServer) : []; meld(); });
function stuur(actie, body) {
    if (!online())
        return;
    api("manage-agenda", actie, body).then(() => herlaad(), (e) => { meldFout(e); herlaad(); });
}
export function startNuAfstemmen(d) {
    const n = { ...d, id: `tmp-${crypto.randomUUID()}`, van: "jij", status: "open", get opties() { return standaardOpties[d.categorie] ?? []; }, moment: new Date().toISOString() };
    lijst = [n, ...lijst];
    meld();
    stuur("start-urgent", { categorie: d.categorie, kind_ids: (d.kindIds ?? []).filter((k) => UUID.test(k)), titel: d.titel, toelichting: d.toelichting ?? "", reactie_gewenst: d.reactieGewenst ?? "zsm", oude_tijd: d.oudeTijd ?? null, nieuwe_tijd: d.nieuweTijd ?? null });
    return n.id;
}
/** Reageren lost de situatie op; het antwoord wordt vastgelegd, de planning verandert niet vanzelf. Alleen de andere ouder. */
export function reageerNuAfstemmen(id, antwoord) {
    const n = lijst.find((x) => x.id === id);
    if (!n || n.status === "opgelost" || n.van === "jij")
        return;
    lijst = lijst.map((x) => (x.id === id ? { ...x, status: "opgelost", antwoord } : x));
    meld();
    stuur("answer-urgent", { id, antwoord });
}
export function useNuAfstemmen() {
    startAgendaSync();
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => lijst, () => lijst);
}
/** Lezen zonder hook, voor koppelingen uit andere lagen (bijvoorbeeld "Afgestemd" bij een afspraak). */
export const nuLijst = () => lijst;
export const openNuAfstemmen = (l) => l.filter((x) => x.status === "open");
