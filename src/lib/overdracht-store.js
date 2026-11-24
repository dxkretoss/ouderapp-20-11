import { useEffect, useMemo, useSyncExternalStore } from "react";
import i18n from "@/i18n";
import { zetMomenten } from "@/lib/kring-store";
import { iso, plusDagen } from "@/lib/agenda-datum";
import { wisselMomenten } from "@/lib/agenda-zorg";
import { useStart } from "@/lib/start-store";
import { useVakanties } from "@/lib/vakantie-store";
import { useZorg } from "@/lib/zorg-store";
import { api } from "@/lib/api";
import { laadOokBij, meldFout, online, startAgendaSync } from "@/lib/agenda-store";
/**
 * Overdracht van het eigen gezin (bron: manage-handover): de paklijst "Mee met de wissel" per wisselmoment
 * (moment-id = datum), vaste spullen per kind en de overdrachtsnotitie voor de andere ouder.
 * Beide ouders zien en vullen de lijst; de ontvangende ouder bevestigt wat meekwam; niet meegekomen spullen
 * gaan mee naar de volgende wissel. Een notitie die nog niet gedeeld is (concept) blijft op dit apparaat.
 */
export const legeInhoud = (voor = "samen") => ({ voor, gezondheid: [], gezondheidNotitie: "", slaap: [], school: [], schoolNotitie: "", gevoel: {}, mooi: "", vraag: "" });
const SLEUTEL = "overdracht-v1";
const LEEG = { gedeeld: [], ontvangen: [], concept: {}, items: [], routines: [], opties: [], geladen: false };
let staat = LEEG;
let geladen = false;
const luisteraars = new Set();
function laadConcept() {
    if (geladen || typeof window === "undefined")
        return;
    geladen = true;
    try {
        const r = JSON.parse(localStorage.getItem(SLEUTEL) || "{}");
        staat = { ...staat, concept: r.concept ?? {} };
    }
    catch { /* leeg beginnen */ }
}
function zet(p) {
    staat = { ...staat, ...p };
    try {
        localStorage.setItem(SLEUTEL, JSON.stringify({ concept: staat.concept }));
    }
    catch { /* alleen voor deze sessie */ }
    luisteraars.forEach((l) => l());
}
const itemVanServer = (r) => ({ id: r.id, momentId: r.moment_id, naam: r.naam, kindIds: r.kind_ids ?? [], bron: r.bron, bronRef: r.bron_ref ?? undefined, door: r.door, ingepakt: !!r.ingepakt, ingepaktDoor: r.ingepakt_door ?? undefined, ontvangen: r.ontvangen ?? undefined });
const logVanServer = (r) => ({ id: r.id, momentId: r.moment_id, van: r.van, aan: r.aan, kindIds: r.kind_ids ?? [], inhoud: r.inhoud ?? legeInhoud(), gedeeldOp: r.gedeeld_op });
export async function laadOverdracht() {
    if (!online())
        return;
    try {
        const r = await api("manage-handover", "list");
        const logs = (r.logs ?? []).map(logVanServer);
        zet({ geladen: true, items: (r.items ?? []).map(itemVanServer), routines: r.routines ?? [], opties: r.options ?? [], gedeeld: logs.filter((l) => l.van === "ik"), ontvangen: logs.filter((l) => l.van !== "ik") });
    }
    catch (e) {
        meldFout(e);
    }
}
laadOokBij(laadOverdracht);
function stuur(actie, body) {
    if (!online())
        return Promise.resolve(null);
    return api("manage-handover", actie, body).then((r) => { laadOverdracht(); return r; }, (e) => { meldFout(e); laadOverdracht(); return null; });
}
export function useOverdracht() {
    startAgendaSync();
    return useSyncExternalStore((l) => { laadConcept(); luisteraars.add(l); return () => luisteraars.delete(l); }, () => { laadConcept(); return staat; }, () => LEEG);
}
export const overdrachtState = () => staat;
/* ---------- overdrachtsnotitie ---------- */
export function bewaarConcept(momentId, inhoud) { zet({ concept: { ...staat.concept, [momentId]: inhoud } }); }
export function deelOverdracht(momentId, aan, inhoud, kindIds = []) {
    const rest = staat.gedeeld.filter((o) => o.momentId !== momentId);
    const { [momentId]: _weg, ...concept } = staat.concept;
    zet({ gedeeld: [{ momentId, van: "ik", aan, gedeeldOp: new Date().toISOString(), inhoud, kindIds }, ...rest], concept });
    stuur("share-log", { moment_id: momentId, kind_ids: kindIds, inhoud });
}
export function wijzigOverdracht(momentId) {
    const o = staat.gedeeld.find((x) => x.momentId === momentId);
    if (!o)
        return;
    zet({ gedeeld: staat.gedeeld.filter((x) => x.momentId !== momentId), concept: { ...staat.concept, [momentId]: o.inhoud } });
    stuur("unshare-log", { moment_id: momentId });
}
export const isGedeeld = (s, momentId) => s.gedeeld.some((o) => o.momentId === momentId);
/** Herinnering: 24 uur (of minder) vóór de wissel en nog niet gedeeld. */
export const overdrachtHerinnering = (urenTotWissel, gedeeld) => !gedeeld && urenTotWissel > 0 && urenTotWissel <= 24;
/** Uren tot een wisselmoment (datum + tijd, lokale tijd); onbekend → 999. */
export function urenTot(datum, tijd, nu = new Date()) {
    if (!datum)
        return 999;
    const t = new Date(`${datum}T${tijd || "12:00"}:00`).getTime();
    return Number.isFinite(t) ? (t - nu.getTime()) / 3600000 : 999;
}
/** Oude naam (Activiteiten): nu een echte berekening vanuit het moment. */
export const demoUrenTotWissel = (datum, _vandaag, nu = new Date()) => (typeof datum === "string" ? urenTot(datum, "14:30", nu) : 999);
/* ---------- paklijst ---------- */
/** De lijst van één wisselmoment: wat op de server staat (vaste spullen worden bij openen aangevuld). */
export const itemsVoor = (s, momentId) => s.items.filter((i) => i.momentId === momentId);
export function voegItemsToe(momentId, namen, kindIds, bron = "toegevoegd", bronRef) {
    const nieuw = namen.map((naam) => ({ id: `tmp-${crypto.randomUUID()}`, momentId, naam, kindIds, bron, bronRef, door: "ik", ingepakt: false }));
    zet({ items: [...staat.items, ...nieuw] });
    return stuur("add-items", { moment_id: momentId, namen, kind_ids: kindIds, bron, bron_ref: bronRef ?? null });
}
export function zetIngepakt(id, ingepakt) {
    zet({ items: staat.items.map((i) => (i.id === id ? { ...i, ingepakt, ingepaktDoor: ingepakt ? "ik" : undefined } : i)) });
    if (!String(id).startsWith("tmp-"))
        stuur("set-packed", { id, packed: ingepakt });
}
export function haalItemWeg(id) {
    zet({ items: staat.items.filter((i) => i.id !== id) });
    if (!String(id).startsWith("tmp-"))
        stuur("remove-item", { id });
}
/** Ontvangende ouder: wat kwam (niet) mee. Niet meegekomen → op de lijst van de volgende wissel. */
export function bevestigOntvangen(momentId, ontvangen, volgendeMomentId) {
    zet({ items: staat.items.map((i) => (i.id in ontvangen ? { ...i, ontvangen: ontvangen[i.id] } : i)) });
    return stuur("confirm-received", { moment_id: momentId, received: ontvangen, next_moment_id: volgendeMomentId ?? null });
}
/** Vaste spullen die nog niet op de lijst van dit moment staan, komen er (eenmalig) op met bron "vast". */
let aanvullen = new Set();
export function vulVasteSpullenAan(moment) {
    if (!online() || !staat.geladen || aanvullen.has(moment.id))
        return;
    const lijst = itemsVoor(staat, moment.id);
    const nodig = staat.routines.filter((r) => moment.kindIds.includes(r.kind) && !lijst.some((i) => i.bron === "vast" && i.bronRef === r.id));
    aanvullen.add(moment.id);
    for (const r of nodig)
        voegItemsToe(moment.id, [r.item], [r.kind], "vast", r.id);
}
/* ---------- vaste spullen per kind ---------- */
export function voegRoutineToe(r) {
    zet({ routines: [...staat.routines, { ...r, id: `tmp-${crypto.randomUUID()}`, door: "ik" }] });
    stuur("add-routine", { kind: r.kind, dag: r.dag, item: r.item, reden: r.reden ?? "" });
}
export function verwijderRoutine(id) {
    zet({ routines: staat.routines.filter((r) => r.id !== id) });
    if (!String(id).startsWith("tmp-"))
        stuur("remove-routine", { id });
}
/* ---------- wisselmomenten (afgeleid uit de zorgverdeling, niet opgeslagen) ---------- */
/** Wisselmomenten van een week terug tot `dagen` dagen vooruit; id = datum. */
export function useWisselMomenten(dagen = 42) {
    const zorg = useZorg(), vak = useVakanties(), st = useStart();
    const van = iso(new Date());
    return useMemo(() => wisselMomenten(zorg, vak, st, plusDagen(van, -7), dagen + 7), [zorg, vak, st, van, dagen]);
}
/**
 * Voedt de ophaal-/brengmomenten van kring-store (Home, Halen & brengen, kring per kind, kringvoorbeeld) met
 * dezelfde afgeleide wisselmomenten: vanaf het eerstvolgende moment (tot twee uur erna) vier weken vooruit.
 * Eén keer aanroepen in een schermkader (AppShell / kringweergave); alleen weergave, niets wordt opgeslagen.
 */
export function useKringMomentenVoeden() {
    const momenten = useWisselMomenten(28);
    useEffect(() => {
        const nu = new Date();
        zetMomenten(momenten.filter((m) => urenTot(m.datum, m.tijd || "23:59", nu) > -2).map((m) => ({
            id: m.id, soort: "wissel", datum: m.datum, tijd: m.tijd, plek: m.plek, kindIds: m.kindIds, mee: [], namen: m.namen, van: m.van, naar: m.naar, naarMij: m.naarMij,
            get dag() { return m.dag; }, get titel() { return i18n.t("lib.overdrachtStore.wisselmoment"); },
        })));
    }, [momenten]);
}
/** Het eerstvolgende wisselmoment (tot twee uur na het tijdstip telt het nog als "nu"), plus het moment daarna. */
export function volgendeVan(momenten, nu = new Date()) {
    const i = momenten.findIndex((m) => urenTot(m.datum, m.tijd, nu) > -2);
    return i < 0 ? { moment: null, daarna: null, vorige: momenten.at(-1) ?? null } : { moment: momenten[i], daarna: momenten[i + 1] ?? null, vorige: momenten[i - 1] ?? null };
}
