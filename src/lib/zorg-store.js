import { useSyncExternalStore } from "react";
import i18n from "@/i18n";
import { leg } from "@/lib/audit-store";
import { wijzigMoment } from "@/lib/kring-store";
import { dt } from "@/lib/agenda-datum";
export const kindNamen = { emma: "Emma", noah: "Noah" };
const ander = (o) => (o === "sanne" ? "joris" : "sanne");
const bereik = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
let state = {
    basis: [
        { id: "b-emma-1", kind: "emma", vanafDag: 1, eersteOuder: "joris", get omschrijving() { return i18n.t("lib.zorgStore.seed.weekOpWeekAf"); } },
        { id: "b-noah-1", kind: "noah", vanafDag: 1, eersteOuder: "joris", get omschrijving() { return i18n.t("lib.zorgStore.seed.weekOpWeekAf"); } },
    ],
    uitz: [
        ...["emma", "noah"].flatMap((kind) => bereik(28, 31).map((dag) => ({ id: `u-${kind}-${dag}`, kind, dag, ouder: "joris", get reden() { return i18n.t("lib.zorgStore.seed.voorjaarsvakantie"); } }))),
        { id: "u-emma-25", kind: "emma", dag: 25, ouder: "sanne", get reden() { return i18n.t("lib.zorgStore.seed.verjaardagEmma"); } },
    ],
    voorstellen: [
        { id: "v1", van: "Joris", soort: "eenmalig", kinderen: ["emma", "noah"], get tekst() { return i18n.t("lib.zorgStore.seed.v1.tekst"); }, get datumLabel() { return i18n.t("lib.zorgStore.seed.v1.datumLabel"); }, dagen: [21], naarOuder: "sanne", aanleiding: "ruil", status: "open" },
        { id: "v2", van: "Sanne", soort: "eenmalig", kinderen: ["emma", "noah"], get tekst() { return i18n.t("lib.zorgStore.seed.v2.tekst"); }, get datumLabel() { return i18n.t("lib.zorgStore.seed.v2.datumLabel"); }, dagen: [], naarOuder: "sanne", status: "geaccepteerd" },
        { id: "v3", van: "Joris", soort: "eenmalig", kinderen: ["noah"], get tekst() { return i18n.t("lib.zorgStore.seed.v3.tekst"); }, get datumLabel() { return i18n.t("lib.zorgStore.seed.v3.datumLabel"); }, dagen: [26], naarOuder: "sanne", aanleiding: "nachtje", status: "open" },
    ],
};
const listeners = new Set();
const zet = (s) => { state = s; listeners.forEach((l) => l()); };
/** Bij wie is dit kind op deze dag? Uitzondering gaat voor; anders de basisversie die op die dag geldt. */
export function zorgDag(s, kind, dag) {
    const u = [...s.uitz].reverse().find((x) => x.kind === kind && x.dag === dag);
    if (u)
        return { ouder: u.ouder, uitzondering: u.reden };
    const v = [...s.basis].filter((b) => b.kind === kind && b.vanafDag <= dag).pop();
    const week = Math.floor(dag / 7); // demo maart 2025: wissel op vrijdag 7, 14, 21, 28
    return { ouder: week % 2 === 0 ? v.eersteOuder : ander(v.eersteOuder) };
}
export const huidigeBasis = (s, kind) => [...s.basis].filter((b) => b.kind === kind).pop();
/** Date-based reading of the same care source, with legacy exceptions confined to demo March. */
export function zorgOp(s, kind, datum) {
    const uitzondering = [...s.uitz].reverse().find((u) => u.kind === kind && (u.datum ? u.datum === datum : datum === `2025-03-${String(u.dag).padStart(2, "0")}`));
    const basis = s.basis.filter((b) => b.kind === kind && (b.vanafDatum ?? `2025-03-${String(b.vanafDag).padStart(2, "0")}`) <= datum).at(-1) ?? s.basis.find((b) => b.kind === kind);
    if (!basis)
        return { ouder: "sanne", tijd: "" };
    const anchor = basis.vanafDatum ?? "2025-03-07";
    const weken = Math.floor(Math.round((dt(datum).getTime() - dt(anchor).getTime()) / 86400000) / 7);
    const ouder = basis.vanafDatum ? (weken % 2 === 0 ? basis.eersteOuder : ander(basis.eersteOuder)) : (Math.abs(weken + 1) % 2 === 0 ? basis.eersteOuder : ander(basis.eersteOuder));
    return { ouder: uitzondering?.ouder ?? ouder, ...(uitzondering ? { uitzondering: uitzondering.reden } : {}), tijd: basis.wisseltijd ?? "14:30", plek: basis.plek };
}
export const zorgState = () => state;
const kindLabels = (k) => k.map((x) => kindNamen[x]);
export function dienVoorstelIn(v) {
    const nieuw = Object.freeze({ ...v, id: `v${Date.now()}-${crypto.randomUUID().slice(0, 6)}`, van: "Sanne", status: "open" });
    leg("schema", nieuw.id, nieuw.tekst, "CREATED", undefined, "Sanne", { kinderen: kindLabels(nieuw.kinderen), meta: { soort: nieuw.soort === "eenmalig" ? i18n.t("lib.zorgStore.eenmaligeWijziging") : i18n.t("lib.zorgStore.structureleWijziging"), betreft: nieuw.datumLabel } });
    zet({ ...state, voorstellen: [...state.voorstellen, nieuw] });
    return nieuw.id;
}
function sluit(id, status, door, alternatief) {
    const v = state.voorstellen.find((x) => x.id === id);
    if (!v || v.status !== "open")
        return false;
    // Alleen de ander reageert; de indiener kan zijn eigen voorstel alleen intrekken.
    if ((status === "ingetrokken") !== (door === v.van))
        return false; // definitieve status kan niet stilletjes terug of opnieuw
    const code = status === "geaccepteerd" ? "ACCEPTED" : status === "ingetrokken" ? "CANCELLED" : "DECLINED";
    let { basis, uitz } = state;
    if (status === "geaccepteerd" && v.moment)
        wijzigMoment(v.moment.id, { ...(v.moment.tijd ? { tijd: v.moment.tijd } : {}), ...(v.moment.plek ? { plek: v.moment.plek } : {}) }, door);
    if (status === "geaccepteerd") {
        if (v.soort === "eenmalig" && v.naarOuder) {
            const ouder = v.naarOuder;
            uitz = [...uitz, ...v.kinderen.flatMap((kind) => v.datums?.length ? v.datums.map((datum) => ({ id: `u-${v.id}-${kind}-${datum}`, kind, datum, dag: dt(datum).getDate(), ouder, get reden() { return i18n.t("lib.zorgStore.eenmaligeWijziging"); }, voorstelId: v.id })) : v.dagen.map((dag) => ({ id: `u-${v.id}-${kind}-${dag}`, kind, dag, ouder, get reden() { return i18n.t("lib.zorgStore.eenmaligeWijziging"); }, voorstelId: v.id })))];
        }
        else if (v.soort === "structureel" && v.naarOuder && v.dagen[0]) {
            const eersteOuder = v.naarOuder, vanafDag = v.dagen[0];
            basis = [...basis, ...v.kinderen.map((kind) => ({ id: `b-${v.id}-${kind}`, kind, vanafDag, eersteOuder, omschrijving: v.tekst, voorstelId: v.id, ...(v.datums?.[0] ? { vanafDatum: v.datums[0] } : {}), ...(v.wisseltijd ? { wisseltijd: v.wisseltijd } : {}), ...(v.plek ? { plek: v.plek } : {}) }))];
        }
    }
    leg("schema", v.id, v.tekst, code, { veld: "status", oud: "open", nieuw: status }, door, { kinderen: kindLabels(v.kinderen), meta: { soort: v.soort === "eenmalig" ? i18n.t("lib.zorgStore.eenmaligeWijziging") : i18n.t("lib.zorgStore.structureleWijziging"), betreft: v.datumLabel, ...(alternatief ? { alternatief } : {}) } });
    zet({ basis, uitz, voorstellen: state.voorstellen.map((x) => (x.id === id ? Object.freeze({ ...x, status, ...(alternatief ? { alternatief } : {}) }) : x)) });
    return true;
}
/** Reageren kan alleen op een voorstel van de ander. */
const reageerder = (id) => (state.voorstellen.find((x) => x.id === id)?.van === "Joris" ? "Sanne" : "Joris");
export const accepteer = (id, door = reageerder(id)) => sluit(id, "geaccepteerd", door);
export const wijsAf = (id, door = reageerder(id)) => sluit(id, "afgewezen", door);
export const stelAlternatiefVoor = (id, tekst, door = reageerder(id)) => sluit(id, "alternatief", door, tekst);
/** Intrekken kan alleen door de indiener, zolang het voorstel nog open is. */
export function trekIn(id) {
    const v = state.voorstellen.find((x) => x.id === id);
    if (!v || v.van !== "Sanne")
        return false;
    return sluit(id, "ingetrokken", "Sanne");
}
/** Meer tijd vragen: alleen de ontvanger, alleen bij een open voorstel. Geen instemming, geen verplichting; het voorstel blijft open. */
export function vraagMeerTijd(id, tot, door = reageerder(id)) {
    const v = state.voorstellen.find((x) => x.id === id);
    if (!v || v.status !== "open" || door === v.van)
        return false;
    leg("schema", v.id, v.tekst, "UPDATED", { veld: "reactie", oud: "open", nieuw: tot ? i18n.t("lib.zorgStore.audit.meerTijdTot", { tot }) : i18n.t("lib.zorgStore.audit.meerTijd") }, door, { kinderen: kindLabels(v.kinderen) });
    zet({ ...state, voorstellen: state.voorstellen.map((x) => (x.id === id ? Object.freeze({ ...x, meerTijd: { door, datum: new Date().toISOString().slice(0, 10), ...(tot ? { tot } : {}) } }) : x)) });
    return true;
}
/** Vriendelijke herinnering: alleen de indiener, alleen bij een open voorstel. Vastgelegd in de historie; begrensd via herinneringen.ts. */
export function stuurHerinnering(id, door = "Sanne") {
    const v = state.voorstellen.find((x) => x.id === id);
    if (!v || v.status !== "open" || v.van !== door)
        return false;
    const nu = new Date().toISOString().slice(0, 10);
    leg("schema", v.id, v.tekst, "UPDATED", { veld: "herinnering", oud: "", nieuw: i18n.t("lib.zorgStore.audit.herinnering") }, door, { kinderen: kindLabels(v.kinderen) });
    zet({ ...state, voorstellen: state.voorstellen.map((x) => (x.id === id ? Object.freeze({ ...x, herinneringen: [...(x.herinneringen ?? []), nu] }) : x)) });
    return true;
}
export function useZorg() {
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
