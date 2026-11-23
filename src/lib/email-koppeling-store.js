/**
 * Solo e-mailkoppeling: alleen communicatie met één ingesteld adres van de andere ouder.
 * Privacyregel: filterVoorKoppeling laat uitsluitend berichten van/naar dat adres door —
 * de rest van een mailbox komt nooit in de app. De koppeling geeft de andere ouder géén app-toegang.
 * Originele e-mails zijn bevroren en worden nooit aangepast. Demo: verzenden/ontvangen wordt nagebootst.
 */
import { useSyncExternalStore } from "react";
import i18n from "@/i18n";
const MIJN_ADRES = "sanne@voorbeeld.nl";
const uur = 3600_000;
/** Demo: zo zou een volledige mailbox eruitzien. Alleen het gekoppelde adres wordt doorgelaten. */
function demoMailbox(ouder) {
    const nu = Date.now();
    const t = (k) => i18n.t(`lib.emailKoppelingStore.demo.${k}`);
    const m = (id, richting, ander, onderwerp, tekst, terug, bijlagen = []) => Object.freeze({ id, richting, van: richting === "in" ? ander : MIJN_ADRES, aan: richting === "in" ? MIJN_ADRES : ander, onderwerp, tekst, ts: nu - terug * uur, bijlagen: Object.freeze(bijlagen) });
    return [
        m("e1", "in", ouder, t("e1.onderwerp"), t("e1.tekst"), 50, [{ id: "b1", naam: t("e1.bijlage"), soort: "pdf" }]),
        m("x1", "in", "nieuwsbrief@webshop.nl", t("x1.onderwerp"), t("x1.tekst"), 40),
        m("e2", "uit", ouder, t("e1.onderwerp"), t("e2.tekst"), 30),
        m("x2", "in", "collega@werk.nl", t("x2.onderwerp"), t("x2.tekst"), 20),
        m("e3", "in", ouder, t("e3.onderwerp"), t("e3.tekst"), 3),
        m("x3", "in", "vriendin@mail.nl", t("x3.onderwerp"), t("x3.tekst"), 2),
        m("e4", "in", ouder, t("e4.onderwerp"), t("e4.tekst"), 1, [{ id: "b2", naam: t("e4.bijlage"), soort: "foto" }]),
    ];
}
const norm = (s) => s.trim().toLowerCase();
export function filterVoorKoppeling(mailbox, adres) {
    const a = norm(adres);
    return mailbox.filter((b) => norm(b.van) === a || norm(b.aan) === a);
}
export const geldigEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
let state = { koppeling: null, berichten: [], archief: [] };
const luisteraars = new Set();
const zet = (s) => { state = s; luisteraars.forEach((l) => l()); };
const sub = (l) => { luisteraars.add(l); return () => { luisteraars.delete(l); }; };
export const useEmailKoppeling = () => useSyncExternalStore(sub, () => state, () => state);
export function stelKoppelingIn(email, naam) {
    const adres = norm(email);
    zet({ ...state, koppeling: { email: adres, naam: naam.trim(), sinds: Date.now() }, berichten: filterVoorKoppeling(demoMailbox(adres), adres) });
}
export function wijzigAdres(email) {
    if (!state.koppeling)
        return;
    const adres = norm(email);
    // Eerdere berichten blijven als archief bewaard; nieuw adres start een eigen lijn.
    zet({ koppeling: { ...state.koppeling, email: adres, sinds: Date.now() }, archief: [...state.archief, ...state.berichten], berichten: [] });
}
export function stopKoppeling(bewaren) {
    zet({ koppeling: null, berichten: [], archief: bewaren ? [...state.archief, ...state.berichten] : state.archief });
}
export function verstuurEmail(tekst, bijlagen = []) {
    const k = state.koppeling;
    if (!k || !tekst.trim())
        return;
    const laatste = state.berichten[state.berichten.length - 1];
    const b = Object.freeze({ id: `u${Date.now()}`, richting: "uit", van: MIJN_ADRES, aan: k.email, onderwerp: laatste ? `Re: ${laatste.onderwerp.replace(/^Re: /, "")}` : i18n.t("lib.emailKoppelingStore.overOnsKind"), tekst: tekst.trim(), ts: Date.now(), bijlagen: Object.freeze(bijlagen) });
    zet({ ...state, berichten: [...state.berichten, b] });
}
/** Demo: boots een antwoord per e-mail van de andere ouder na. */
export function demoAntwoord() {
    const k = state.koppeling;
    if (!k)
        return;
    const b = Object.freeze({ id: `i${Date.now()}`, richting: "in", van: k.email, aan: MIJN_ADRES, onderwerp: `Re: ${i18n.t("lib.emailKoppelingStore.demo.e3.onderwerp")}`, tekst: i18n.t("lib.emailKoppelingStore.demo.antwoord"), ts: Date.now(), bijlagen: Object.freeze([]) });
    zet({ ...state, berichten: [...state.berichten, b] });
}
export function bewaarBijDocumenten(berichtId, bijlageId) {
    const upd = (b) => b.id !== berichtId ? b : Object.freeze({ ...b, bijlagen: Object.freeze(b.bijlagen.map((x) => (x.id === bijlageId ? { ...x, inDocumenten: true } : x))) });
    zet({ ...state, berichten: state.berichten.map(upd) });
}
// Herkenning op Nederlandse én Engelse woorden; alleen de getoonde titels worden vertaald.
const maanden = "januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|january|february|march|may|june|july|august|october";
export function herkenSuggesties(tekst) {
    const t = tekst.toLowerCase();
    const uit = [];
    if (/(ophalen|brengen|wissel|in plaats van|pick up|pick (?:her|him|them) up|drop off|swap|handover|instead of)/.test(t) && /\d{1,2}[:.]\d{2}/.test(t))
        uit.push({ soort: "wissel", titel: i18n.t("lib.emailKoppelingStore.suggestie.wisselTitel"), actie: i18n.t("lib.emailKoppelingStore.suggestie.wisselActie") });
    const d = t.match(new RegExp(`(\\d{1,2}) (${maanden})(?:[^\\d]*(\\d{1,2}[:.]\\d{2}))?`));
    if (d && !uit.length) {
        const wat = t.match(/(ouderavond|rapportgesprek|tandarts|huisarts|sportdag|voorstelling|wedstrijd|parents' evening|report meeting|dentist|doctor|sports day|performance|match)/)?.[1];
        uit.push({ soort: "agenda", titel: i18n.t("lib.emailKoppelingStore.suggestie.agendaTitel"), detail: `${wat ? wat.charAt(0).toUpperCase() + wat.slice(1) + " · " : ""}${d[1]} ${d[2]}${d[3] ? " · " + d[3] : ""}`, actie: i18n.t("lib.emailKoppelingStore.suggestie.agendaActie") });
    }
    if (/(€\s?\d|£\s?\d|euro|betaald|kosten|rekening|factuur|paid|cost|bill|invoice|receipt)/.test(t))
        uit.push({ soort: "kosten", titel: i18n.t("lib.emailKoppelingStore.suggestie.kostenTitel"), actie: i18n.t("lib.emailKoppelingStore.suggestie.kostenActie") });
    return uit;
}
