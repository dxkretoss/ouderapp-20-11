import { useEffect, useMemo, useSyncExternalStore } from "react";
import i18n from "@/i18n";
import { zetMomenten } from "@/lib/kring-store";
import { iso, plusDagen, voorkomens } from "@/lib/agenda-datum";
import { wisselMomenten } from "@/lib/agenda-zorg";
import { useStart } from "@/lib/start-store";
import { useVakanties } from "@/lib/vakantie-store";
import { useZorg } from "@/lib/zorg-store";
import { api } from "@/lib/api";
import { agendaState, laadOokBij, meldFout, online, startAgendaSync } from "@/lib/agenda-store";
import { gezinState } from "@/lib/gezin";
/**
 * Overdracht van het eigen gezin (bron: manage-handover): de paklijst "Mee met de wissel" per wisselmoment
 * (moment-id = datum), vaste spullen per kind en de overdrachtsnotitie voor de andere ouder.
 * Beide ouders zien en vullen de lijst; de ontvangende ouder bevestigt wat meekwam; niet meegekomen spullen
 * gaan mee naar de volgende wissel. Een notitie die nog niet gedeeld is (concept) staat als privé concept op
 * de server (alleen voor jou, manage-handover save-draft), niet meer op dit apparaat.
 * Notities en concepten zijn per wisselmoment ÉN per andere ouder (kind 1 met ouder A, kind 2 met ouder B:
 * twee notities op dezelfde datum). Sleutel in `concept`: conceptSleutel(momentId, kindIds) = "datum|paar".
 * "Is alles meegekomen?" mag alleen de ontvangende ouder na het wisselmoment (de server controleert dat ook).
 */
export const legeInhoud = (voor = "samen") => ({ voor, gezondheid: [], gezondheidNotitie: "", slaap: [], school: [], schoolNotitie: "", gevoel: {}, mooi: "", vraag: "" });
const OUDE_SLEUTEL = "overdracht-v1";
const LEEG = { gedeeld: [], ontvangen: [], concept: {}, items: [], routines: [], opties: [], wegVast: [], geladen: false };
let staat = LEEG;
/** De andere ouder van deze kinderen ("" = Solo, geen kinderen of kinderen van verschillende ouders), zoals de server (pair_key). */
export function paarVan(kindIds = []) {
    const ids = [...new Set(kindIds ?? [])].filter(Boolean);
    return ids.length ? gezinState().anderVoor(ids)?.id ?? "" : "";
}
const sleutel = (momentId, paar) => `${momentId}|${paar ?? ""}`;
/** Sleutel van het concept voor dit moment en deze kinderen. */
export const conceptSleutel = (momentId, kindIds) => sleutel(momentId, paarVan(kindIds));
/** Concept voor dit moment en deze kinderen; een oud concept zonder paar telt alleen bij één andere ouder. */
export function conceptVoor(s, momentId, kindIds) {
    const paar = paarVan(kindIds);
    return s.concept[sleutel(momentId, paar)] ?? (paar && gezinState().coOuders.length <= 1 ? s.concept[sleutel(momentId, "")] : undefined);
}
/** De gedeelde notitie van mij voor dit moment en het paar van deze kinderen. */
export const gedeeldVoor = (s, momentId, kindIds) => {
    const paar = paarVan(kindIds);
    return s.gedeeld.find((o) => o.momentId === momentId && paarVan(o.kindIds) === paar);
};
const luisteraars = new Set();
function zet(p) {
    staat = { ...staat, ...p };
    luisteraars.forEach((l) => l());
}
/** Oude concepten van dit apparaat (vóór server-concepten) één keer naar de server en dan weg. */
let oudeOvergezet = false;
function zetOudeConceptenOver() {
    if (oudeOvergezet || typeof window === "undefined")
        return;
    oudeOvergezet = true;
    let oud = {};
    try {
        oud = JSON.parse(localStorage.getItem(OUDE_SLEUTEL) || "{}").concept ?? {};
    }
    catch { /* niets */ }
    const lijst = Object.entries(oud).filter(([m, i]) => /^\d{4}-\d{2}-\d{2}$/.test(m) && i && typeof i === "object");
    Promise.all(lijst.filter(([m]) => !(sleutel(m, "") in staat.concept)).map(([m, i]) => api("manage-handover", "save-draft", { moment_id: m, inhoud: i }).then(() => { zet({ concept: { ...staat.concept, [sleutel(m, "")]: i } }); })))
        .then(() => { try {
        localStorage.removeItem(OUDE_SLEUTEL);
    }
    catch { /* niets */ } }, () => { oudeOvergezet = false; });
}
const itemVanServer = (r) => ({ id: r.id, momentId: r.moment_id, naam: r.naam, kindIds: r.kind_ids ?? [], bron: r.bron, bronRef: r.bron_ref ?? undefined, door: r.door, ingepakt: !!r.ingepakt, ingepaktDoor: r.ingepakt_door ?? undefined, ontvangen: r.ontvangen ?? undefined });
const logVanServer = (r) => ({ id: r.id, momentId: r.moment_id, van: r.van, aan: r.aan, kindIds: r.kind_ids ?? [], inhoud: r.inhoud ?? legeInhoud(), gedeeldOp: r.gedeeld_op });
export async function laadOverdracht() {
    if (!online())
        return;
    try {
        const r = await api("manage-handover", "list");
        const logs = (r.logs ?? []).map(logVanServer);
        // Items die nog onderweg zijn (tmp-…) blijven staan tot de server ze terugstuurt.
        const onderweg = staat.items.filter((i) => String(i.id).startsWith("tmp-"));
        // Een concept dat hier net is aangepast en nog wordt bewaard, gaat voor wat de server had.
        // Eén concept per datum en andere ouder (other_parent_id; null = Solo of oud concept zonder paar).
        const concept = Object.fromEntries((r.drafts ?? []).map((d) => [sleutel(d.moment_id, d.other_parent_id ?? (d.kind_ids?.length ? paarVan(d.kind_ids) : "")), d.inhoud]));
        for (const k of teBewaren.keys())
            if (staat.concept[k])
                concept[k] = staat.concept[k];
        zet({ geladen: true, items: [...(r.items ?? []).map(itemVanServer), ...onderweg], routines: r.routines ?? [], opties: r.options ?? [], wegVast: (r.removed_fixed ?? []).map((x) => `${x.moment_id}|${x.ref}`), gedeeld: logs.filter((l) => l.van === "ik"), ontvangen: logs.filter((l) => l.van !== "ik"), concept });
        zetOudeConceptenOver();
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
    return useSyncExternalStore((l) => { luisteraars.add(l); return () => luisteraars.delete(l); }, () => staat, () => LEEG);
}
export const overdrachtState = () => staat;
/* ---------- overdrachtsnotitie ---------- */
/** Concept bewaren (per moment en andere ouder): meteen zichtbaar, na een korte pauze in typen privé op de server. */
const teBewaren = new Map();
export function bewaarConcept(momentId, kindIds, inhoud) {
    const k = conceptSleutel(momentId, kindIds);
    zet({ concept: { ...staat.concept, [k]: inhoud } });
    if (!online())
        return;
    clearTimeout(teBewaren.get(k));
    teBewaren.set(k, setTimeout(() => {
        teBewaren.delete(k);
        api("manage-handover", "save-draft", { moment_id: momentId, kind_ids: kindIds ?? [], inhoud }, { stil: true }).catch((e) => meldFout(e));
    }, 800));
}
/** Concept(en) van dit paar uit de lokale staat halen (ook een oud concept zonder paar bij één andere ouder). */
function zonderConcept(momentId, paar) {
    const weg = new Set([sleutel(momentId, paar)]);
    if (paar && gezinState().coOuders.length <= 1)
        weg.add(sleutel(momentId, ""));
    weg.forEach((k) => { clearTimeout(teBewaren.get(k)); teBewaren.delete(k); });
    return Object.fromEntries(Object.entries(staat.concept).filter(([k]) => !weg.has(k)));
}
export function deelOverdracht(momentId, aan, inhoud, kindIds = []) {
    const paar = paarVan(kindIds);
    // alleen de notitie voor dezelfde andere ouder wordt vervangen
    const rest = staat.gedeeld.filter((o) => !(o.momentId === momentId && paarVan(o.kindIds) === paar));
    zet({ gedeeld: [{ momentId, van: "ik", aan, gedeeldOp: new Date().toISOString(), inhoud, kindIds }, ...rest], concept: zonderConcept(momentId, paar) });
    // de server verwijdert het concept bij delen; mislukt delen, dan komt het concept terug bij herladen
    stuur("share-log", { moment_id: momentId, kind_ids: kindIds, inhoud }).then((r) => { if (!r)
        zet({ concept: { ...staat.concept, [sleutel(momentId, paar)]: inhoud } }); });
}
/** Een gedeelde notitie terugnemen om aan te passen (op log-id; een net gedeelde zonder id op kind_ids). */
export function wijzigOverdracht(log) {
    if (!log)
        return;
    const paar = paarVan(log.kindIds);
    zet({ gedeeld: staat.gedeeld.filter((x) => x !== log && !(log.id && x.id === log.id)), concept: { ...staat.concept, [sleutel(log.momentId, paar)]: log.inhoud } });
    stuur("unshare-log", log.id ? { moment_id: log.momentId, log_id: log.id } : { moment_id: log.momentId, kind_ids: log.kindIds ?? [] });
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
/** Vinkjes / weghalen op een item dat nog onderweg is (tmp-…): uitgevoerd zodra het echte id bekend is. */
const wachtend = new Map();
export function voegItemsToe(momentId, namen, kindIds, bron = "toegevoegd", bronRef) {
    const nieuw = namen.map((naam) => ({ id: `tmp-${crypto.randomUUID()}`, momentId, naam, kindIds, bron, bronRef, door: "ik", ingepakt: false }));
    zet({ items: [...staat.items, ...nieuw] });
    if (!online())
        return Promise.resolve(null);
    const tmpIds = new Set(nieuw.map((i) => i.id));
    return api("manage-handover", "add-items", { moment_id: momentId, namen, kind_ids: kindIds, bron, bron_ref: bronRef ?? null }).then(async (r) => {
        const opgeslagen = r.items ?? [];
        // tmp → echt id (op naam); wat er intussen met het tijdelijke item gebeurde, nu op de server
        const vervolg = [];
        const echteItems = [];
        for (const t of nieuw) {
            const echt = opgeslagen.find((x) => x.naam.toLowerCase() === t.naam.toLowerCase());
            const actie = wachtend.get(t.id);
            wachtend.delete(t.id);
            if (!echt)
                continue;
            if (actie?.weg) {
                vervolg.push(api("manage-handover", "remove-item", { id: echt.id }));
                continue;
            }
            const item = itemVanServer(echt);
            if (actie && actie.ingepakt !== item.ingepakt) {
                vervolg.push(api("manage-handover", "set-packed", { id: echt.id, packed: actie.ingepakt }));
                item.ingepakt = actie.ingepakt;
                item.ingepaktDoor = actie.ingepakt ? "ik" : undefined;
            }
            echteItems.push(item);
        }
        zet({ items: [...staat.items.filter((i) => !tmpIds.has(i.id) && !echteItems.some((e) => e.id === i.id)), ...echteItems] });
        const uitkomst = await Promise.allSettled(vervolg);
        if (uitkomst.some((u) => u.status === "rejected"))
            meldFout(uitkomst.find((u) => u.status === "rejected").reason);
        await laadOverdracht();
        return r;
    }, (e) => {
        meldFout(e);
        nieuw.forEach((t) => wachtend.delete(t.id));
        zet({ items: staat.items.filter((i) => !tmpIds.has(i.id)) });
        laadOverdracht();
        return null;
    });
}
export function zetIngepakt(id, ingepakt) {
    zet({ items: staat.items.map((i) => (i.id === id ? { ...i, ingepakt, ingepaktDoor: ingepakt ? "ik" : undefined } : i)) });
    if (String(id).startsWith("tmp-"))
        wachtend.set(id, { ingepakt });
    else
        stuur("set-packed", { id, packed: ingepakt });
}
export function haalItemWeg(id) {
    zet({ items: staat.items.filter((i) => i.id !== id) });
    if (String(id).startsWith("tmp-"))
        wachtend.set(id, { weg: true });
    else
        stuur("remove-item", { id });
}
/** Ontvangende ouder: wat kwam (niet) mee. Niet meegekomen → op de lijst van de volgende wissel. */
export function bevestigOntvangen(momentId, ontvangen, volgendeMomentId) {
    zet({ items: staat.items.map((i) => (i.id in ontvangen ? { ...i, ontvangen: ontvangen[i.id] } : i)) });
    return stuur("confirm-received", { moment_id: momentId, received: ontvangen, next_moment_id: volgendeMomentId ?? null });
}
/**
 * Vaste spullen die nog niet op de lijst van dit moment staan, komen er (eenmalig) op met bron "vast"
 * (de server voegt ze ook 48 uur vooraf toe en houdt elk vast item één keer per wissel). Daarnaast de
 * "Neem mee"-spullen van gedeelde afspraken tussen deze wissel en de volgende (bron "afspraak").
 */
let aanvullen = new Set();
let aanvullenAfspraak = new Set();
const WEEKDAG = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
/** Weekdagen (namen) van `van` tot (niet t/m) `tot`, max. 14 dagen; zonder `tot` één week. */
function dagenTussen(van, tot) {
    const d = new Date(`${van}T12:00:00`);
    const eind = tot ? new Date(`${tot}T12:00:00`) : new Date(d.getTime() + 7 * 864e5);
    const uit = new Set();
    for (let i = 0; i < 14 && d < eind; i++, d.setDate(d.getDate() + 1))
        uit.add(WEEKDAG[d.getDay()]);
    if (!uit.size)
        uit.add(WEEKDAG[new Date(`${van}T12:00:00`).getDay()]);
    return uit;
}
export function vulVasteSpullenAan(moment, daarna) {
    if (!online() || !staat.geladen || aanvullen.has(moment.id))
        return;
    const lijst = itemsVoor(staat, moment.id);
    // Alleen routines voor een dag waarop het kind tot de volgende wissel bij de andere ouder is,
    // en niet wat een ouder eerder bij deze wissel heeft weggehaald.
    const dagen = moment.datum ? dagenTussen(moment.datum, daarna?.datum) : null;
    const weg = new Set(staat.wegVast ?? []);
    const nodig = staat.routines.filter((r) => moment.kindIds.includes(r.kind)
        && !String(r.id).startsWith("tmp-")
        && (!dagen || !r.dag || !WEEKDAG.includes(String(r.dag).toLowerCase()) || dagen.has(String(r.dag).toLowerCase()))
        && !weg.has(`${moment.id}|${r.id}`)
        && !lijst.some((i) => i.bron === "vast" && i.bronRef === r.id));
    aanvullen.add(moment.id);
    for (const r of nodig)
        voegItemsToe(moment.id, [r.item], [r.kind], "vast", r.id);
}
/** bron_ref van een afspraak-item: "afspraak:<afspraak-id>:<datum>" (het label komt uit de agenda). */
export const afspraakRef = (id, datum) => `afspraak:${id}:${datum}`;
export function leesAfspraakRef(ref) {
    const m = /^afspraak:(.+):(\d{4}-\d{2}-\d{2})$/.exec(ref ?? "");
    return m ? { id: m[1], datum: m[2] } : null;
}
export function vulAfspraakSpullenAan(moment, daarna) {
    const ag = agendaState();
    if (!online() || !staat.geladen || !ag.geladen || !moment.datum || aanvullenAfspraak.has(moment.id))
        return;
    aanvullenAfspraak.add(moment.id);
    const tot = plusDagen(daarna?.datum ?? plusDagen(moment.datum, 7), -1);
    const lijst = itemsVoor(staat, moment.id);
    const gezin = gezinState();
    for (const a of ag.events) {
        // Alleen gedeelde afspraken (een privé-afspraak hoort niet op de gezamenlijke lijst) met "Neem mee".
        if (a.gedeeld === false || !a.neemMee?.length)
            continue;
        const kids = (a.kindIds ?? []).filter((k) => moment.kindIds.includes(k));
        if (!kids.length)
            continue;
        for (const datum of voorkomens(a, moment.datum, tot)) {
            const ref = afspraakRef(a.id, datum);
            const namen = a.neemMee.filter((n) => !lijst.some((i) => i.bron === "afspraak" && i.bronRef === ref && i.naam.toLowerCase() === String(n).toLowerCase()));
            if (!namen.length)
                continue;
            // Kinderen van verschillende andere ouders kunnen niet samen op één item.
            const groepen = gezin.gemengd(kids) ? kids.map((k) => [k]) : [kids];
            for (const g of groepen)
                voegItemsToe(moment.id, namen, g, "afspraak", ref);
        }
    }
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
/** Wisselmomenten van `terug` dagen terug (standaard een week) tot `dagen` dagen vooruit; id = datum. */
export function useWisselMomenten(dagen = 42, terug = 7) {
    const zorg = useZorg(), vak = useVakanties(), st = useStart();
    const van = iso(new Date());
    return useMemo(() => wisselMomenten(zorg, vak, st, plusDagen(van, -terug), dagen + terug), [zorg, vak, st, van, dagen, terug]);
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
