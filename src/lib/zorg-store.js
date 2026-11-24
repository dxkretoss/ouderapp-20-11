import { useSyncExternalStore } from "react";
import i18n from "@/i18n";
import { api } from "@/lib/api";
import { dt } from "@/lib/agenda-datum";
import { geldigeRegeling, maandagVan, plekOp, startState } from "@/lib/start-store";
import { herlaad, meldFout, online, opAgendaLijst, startAgendaSync } from "@/lib/agenda-store";
/**
 * Zorgverdeling van het eigen gezin: wijzigingsvoorstellen ("Alleen deze keer" / "Vanaf nu"), geaccepteerde
 * uitzonderingen per kind/datum en nieuwe versies van de basisregeling. Bron: manage-agenda (server).
 * De basisregeling zelf staat per kind op de server (manage-children save-schedule) en in start-store.
 * Alleen een geaccepteerd voorstel verandert de planning; definitieve statussen veranderen nooit meer;
 * een reactiedatum is alleen een verzoek. Zonder gekoppelde andere ouder past de server de wijziging direct toe.
 *
 * Kijker-relatieve waarden (zoals elders in de app): "sanne"/"Sanne" = de ingelogde ouder, "joris"/"Joris" =
 * de andere ouder. Dit zijn geen namen en worden nooit getoond; de server bewaart profiel-id's.
 */
const IK = "sanne", ANDER = "joris";
const leeg = { basis: [], uitz: [], versies: [], voorstellen: [] };
let state = leeg;
const listeners = new Set();
const zet = (s) => { state = s; listeners.forEach((l) => l()); };
/** Naam van een kind (server-id) voor weergave; onbekend → het id zelf. */
export const kindNamen = new Proxy({}, { get: (_, k) => (typeof k === "string" ? startState().kinderen.find((x) => x.id === k)?.naam ?? k : undefined) });
const relNaarOuder = (r) => (r === "ik" ? IK : r === "ander" ? ANDER : undefined);
const ouderNaarRel = (o) => (o === IK ? "ik" : o === ANDER ? "ander" : o);
const voorstelVanServer = (v) => Object.freeze({
    id: v.id, van: v.mine ? "Sanne" : "Joris", vanMij: !!v.mine, soort: v.soort, kinderen: v.kind_ids ?? [], tekst: v.tekst ?? "",
    datumLabel: v.datum_label ?? v.datums?.[0] ?? "", datums: v.datums ?? [], dagen: (v.datums ?? []).map((d) => dt(d).getDate()),
    naarOuder: relNaarOuder(v.naar), wisseltijd: v.wisseltijd ?? undefined, plek: v.plek ?? undefined, aanleiding: v.aanleiding ?? undefined,
    reactieDatum: v.reactie_datum ?? undefined, herinneringen: v.herinneringen ?? [], alternatief: v.alternatief ?? undefined,
    meerTijd: v.meer_tijd ? { door: v.meer_tijd.mine ? "Sanne" : "Joris", datum: v.meer_tijd.datum, ...(v.meer_tijd.tot ? { tot: v.meer_tijd.tot } : {}) } : undefined,
    moment: v.moment ?? undefined, reden: v.reden ?? undefined, status: v.status ?? "open", aangemaakt: v.created_at,
});
opAgendaLijst((r) => {
    if (!r)
        return zet(leeg);
    zet({
        basis: [],
        uitz: (r.care_exceptions ?? []).map((u) => ({ id: u.id, kind: u.kind_id, datum: u.datum, dag: dt(u.datum).getDate(), ouder: relNaarOuder(u.ouder), reden: u.reden ?? undefined, voorstelId: u.proposal_id })),
        versies: (r.care_versions ?? []).map((v) => ({ id: v.id, kind: v.kind_id, vanaf: v.vanaf, regeling: v.regeling, voorstelId: v.proposal_id })),
        voorstellen: (r.care_proposals ?? []).map(voorstelVanServer),
    });
});
const reden = () => i18n.t("lib.zorgStore.eenmaligeWijziging");
/** De regeling die op deze datum voor dit kind geldt: de laatste geaccepteerde versie, anders de basisregeling. */
export function regelingOp(s, kind, datum) {
    const v = s.versies.filter((x) => x.kind === kind && x.vanaf <= datum).at(-1);
    const r = v?.regeling ?? startState().regeling;
    return geldigeRegeling(r) ? r : null;
}
/** Bij wie is dit kind op deze datum? Uitzondering gaat voor; anders de regeling die dan geldt. */
export function zorgOp(s, kind, datum) {
    const u = s.uitz.filter((x) => x.kind === kind && (x.datum ? x.datum === datum : false)).at(-1);
    const r = regelingOp(s, kind, datum);
    const basis = r ? (plekOp(r, dt(datum)) === "ik" ? IK : ANDER) : undefined;
    return { ouder: u?.ouder ?? basis, ...(u ? { uitzondering: u.reden ?? reden() } : {}), tijd: r?.wisseltijd ?? "", plek: r?.plek };
}
/** Oude dag-nummerweergave (maart van de voorbeeldagenda); bestaat alleen nog voor de oude planningsonderdelen. */
export function zorgDag(s, kind, dag) {
    const u = [...s.uitz].reverse().find((x) => x.kind === kind && x.dag === dag && !x.datum);
    return u ? { ouder: u.ouder, uitzondering: u.reden } : { ouder: undefined };
}
/** Nieuwe versie bij een "Vanaf nu"-voorstel: hetzelfde ritme, opnieuw gestart in de week van `vanaf`, met de kinderen bij `naar` op die dag (zelfde regel als de server). */
export function nieuweVersie(s, kind, vanaf, naar, wisseltijd, plek) {
    const r = regelingOp(s, kind, vanaf) ?? { dagen: [...Array(7).fill("ik"), ...Array(7).fill("ander")], wisseltijd: "14:30" };
    const nieuw = { ...r, startMaandag: maandagVan(dt(vanaf)) };
    const doel = naar === IK ? "ik" : "ander";
    const dagen = plekOp(nieuw, dt(vanaf)) === doel ? nieuw.dagen : nieuw.dagen.map((d) => (d === "ik" ? "ander" : "ik"));
    return { ...nieuw, dagen, ...(wisseltijd ? { wisseltijd } : {}), ...(plek ? { plek } : {}) };
}
/** Voorbeeld van een "Vanaf nu"-voorstel voor de vergelijkingstabel. */
export function structureelOp(s, kind, vanaf, naar, datum) {
    return datum < vanaf ? zorgOp(s, kind, datum).ouder : plekOp(nieuweVersie(s, kind, vanaf, naar), dt(datum)) === "ik" ? IK : ANDER;
}
export const huidigeBasis = (s, kind) => s.versies.filter((b) => b.kind === kind).at(-1);
export const zorgState = () => state;
/* ---------- acties: lokaal meteen zichtbaar, daarna de server (die is leidend) ---------- */
function naarServer(actie, body) {
    startAgendaSync();
    if (!online())
        return;
    api("manage-agenda", actie, body).then(() => herlaad(), (e) => { meldFout(e); herlaad(); });
}
const vervang = (id, f) => zet({ ...state, voorstellen: state.voorstellen.map((x) => (x.id === id ? Object.freeze({ ...x, ...f(x) }) : x)) });
/** Nieuw voorstel. `alternatiefVoor` = het voorstel van de ander waarop dit "Ander voorstel" het antwoord is. */
export function dienVoorstelIn(v, alternatiefVoor) {
    if (alternatiefVoor && !sluit(alternatiefVoor, "alternatief", { alternatief: v.tekst }))
        return null;
    const id = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nieuw = Object.freeze({ ...v, id, van: "Sanne", vanMij: true, status: "open", herinneringen: [] });
    zet({ ...state, voorstellen: [...state.voorstellen, nieuw] });
    naarServer("propose-care", {
        ...(alternatiefVoor ? { counter_of: alternatiefVoor } : {}),
        proposal: { soort: v.soort, kind_ids: v.kinderen, tekst: v.tekst, naar: ouderNaarRel(v.naarOuder ?? IK), datums: v.datums ?? [], wisseltijd: v.wisseltijd || null, plek: v.plek || null, datum_label: v.datumLabel, aanleiding: v.aanleiding ?? null, reactie_datum: v.reactieDatum ?? null, moment: v.moment ?? null, reden: v.reden ?? null },
    });
    return id;
}
/** Alleen de ander reageert; de indiener kan zijn eigen voorstel alleen intrekken. Definitief blijft definitief. */
function sluit(id, status, extra = {}) {
    const v = state.voorstellen.find((x) => x.id === id);
    if (!v || v.status !== "open" || (status === "ingetrokken") !== v.vanMij)
        return false;
    let uitz = state.uitz;
    if (status === "geaccepteerd" && v.soort === "eenmalig" && v.naarOuder)
        uitz = [...uitz, ...v.kinderen.flatMap((kind) => (v.datums ?? []).map((datum) => ({ id: `u-${v.id}-${kind}-${datum}`, kind, datum, dag: dt(datum).getDate(), ouder: v.naarOuder, voorstelId: v.id })))];
    let versies = state.versies;
    if (status === "geaccepteerd" && v.soort === "structureel" && v.naarOuder && v.datums?.[0])
        versies = [...versies, ...v.kinderen.map((kind) => ({ id: `b-${v.id}-${kind}`, kind, vanaf: v.datums[0], regeling: nieuweVersie(state, kind, v.datums[0], v.naarOuder, v.wisseltijd, v.plek), voorstelId: v.id }))].sort((a, b) => a.vanaf.localeCompare(b.vanaf));
    zet({ ...state, uitz, versies, voorstellen: state.voorstellen.map((x) => (x.id === id ? Object.freeze({ ...x, status, ...extra }) : x)) });
    return true;
}
const antwoord = (id, response, extra = {}) => naarServer("respond-care", { proposal_id: id, response, ...extra });
export function accepteer(id) {
    const ok = sluit(id, "geaccepteerd");
    if (ok)
        antwoord(id, "akkoord");
    return ok;
}
export function wijsAf(id) {
    const ok = sluit(id, "afgewezen");
    if (ok)
        antwoord(id, "niet-akkoord");
    return ok;
}
/** "Ander voorstel" zonder nieuw formulier: het voorstel sluit met de tekst als alternatief. */
export function stelAlternatiefVoor(id, tekst) {
    const ok = sluit(id, "alternatief", tekst ? { alternatief: tekst } : {});
    if (ok)
        antwoord(id, "ander-voorstel", { alternative: tekst || null });
    return ok;
}
/** Intrekken kan alleen door de indiener, zolang het voorstel nog open is. */
export function trekIn(id) {
    const ok = sluit(id, "ingetrokken");
    if (ok)
        naarServer("withdraw-care", { proposal_id: id });
    return ok;
}
/** Meer tijd vragen: alleen de ontvanger, alleen bij een open voorstel. Geen instemming; het voorstel blijft open. */
export function vraagMeerTijd(id, tot) {
    const v = state.voorstellen.find((x) => x.id === id);
    if (!v || v.status !== "open" || v.vanMij)
        return false;
    vervang(id, () => ({ meerTijd: { door: "Sanne", datum: new Date().toISOString().slice(0, 10), ...(tot ? { tot } : {}) } }));
    antwoord(id, "meer-tijd", tot ? { until: tot } : {});
    return true;
}
/** Vriendelijke herinnering: alleen de indiener, alleen bij een open voorstel. De server begrenst (herinneringen.ts-regels). */
export function stuurHerinnering(id) {
    const v = state.voorstellen.find((x) => x.id === id);
    if (!v || v.status !== "open" || !v.vanMij)
        return false;
    vervang(id, (x) => ({ herinneringen: [...(x.herinneringen ?? []), new Date().toISOString().slice(0, 10)] }));
    naarServer("remind-care", { proposal_id: id });
    return true;
}
export function useZorg() {
    startAgendaSync();
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
export const uitzonderingenVan = (s, kind) => s.uitz.filter((u) => u.kind === kind);
export const statusLabel = {
    get open() { return i18n.t("lib.zorgStore.status.open"); },
    get geaccepteerd() { return i18n.t("lib.zorgStore.status.geaccepteerd"); },
    get afgewezen() { return i18n.t("lib.zorgStore.status.afgewezen"); },
    get ingetrokken() { return i18n.t("lib.zorgStore.status.ingetrokken"); },
    get alternatief() { return i18n.t("lib.zorgStore.status.alternatief"); },
};
/** Alleen voor tests: zet de bron direct. */
export const zetZorgVoorTest = (s) => zet({ ...leeg, ...s });
