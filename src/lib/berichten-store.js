import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import i18n, { taalLocale } from "@/i18n";
import { api, foutTekst } from "@/lib/api";
import { authState, opAuth } from "@/lib/auth-store";
import { start, startState } from "@/lib/start-store";
import { useVoorkeuren } from "@/lib/voorkeuren-store";
import { bijTerugkeer } from "@/lib/terugkeer";
/**
 * Berichten tussen de twee gekoppelde ouders (Phase 2): één bron, gespiegeld van edge function
 * `manage-messages`. Gesprekken per onderwerp, berichten, ongelezen-tellers en de eigen
 * vastzet-/demp-voorkeuren per gesprek komen van de server; niets wordt lokaal verzonnen.
 * - Zonder gekoppelde andere ouder is een onderwerp een voorbereid concept (alleen zichtbaar voor jou);
 *   zodra er één andere ouder gekoppeld is, maakt de server er een echt gesprek van.
 * - Geen realtime: verversen bij focus en elke 25 s zolang Berichten open staat (`usePeilBerichten`).
 * - Versturen is optimistisch met een client_id (dubbel versturen bij opnieuw proberen kan niet).
 * Vorm van een gesprek (zoals de schermen al kenden): { id, onderwerp, icoon, laatste, laatsteTijd, ongelezen, ... }.
 * Vorm van een bericht: { id, van: "ik" | "ander", afzender, tekst, tijd, at, toon, systeem, wacht?, mislukt? }.
 * - Concept per gesprek (`mijnConcept`) staat op de server (save-draft) en is alleen voor jou.
 * - Akkoorden in een gesprek (`akkoorden[gesprekId][berichtId]`) komen van de server: beide ouders zien ze.
 * - "Even pauze" (voorkeur `berichtenPauzeTot`): zolang die loopt telt de badge geen ongelezen berichten.
 */
const NS = "lib.berichtenStore";
const PEIL_MS = 25_000;
const MAX_VAST = 3;
const leeg = { status: "leeg", gesprekken: [], coOuders: [], ongelezen: 0, berichten: {}, akkoorden: {}, laatsteLading: 0, gebruikerId: null };
const MAX_CONCEPT = 4000;
let state = leeg;
const luisteraars = new Set();
function zet(p) {
    state = { ...state, ...p };
    luisteraars.forEach((l) => l());
}
export const berichtenState = () => state;
const mijnId = () => authState().gebruiker?.id ?? null;
function meldFout(e) {
    if (e?.code === "UNAUTHORIZED")
        return;
    toast.error(foutTekst(e), { id: "berichten-fout" });
}
/* ---------------------------------------------------------------- weergave */
const dagSleutel = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
/** "Vandaag" / "Gisteren" / datum — voor dagscheiders in een gesprek. */
export function dagLabel(iso) {
    if (!iso)
        return "";
    const d = new Date(iso), nu = new Date();
    const gisteren = new Date(nu);
    gisteren.setDate(nu.getDate() - 1);
    if (dagSleutel(d) === dagSleutel(nu))
        return i18n.t("common.vandaag");
    if (dagSleutel(d) === dagSleutel(gisteren))
        return i18n.t("common.gisteren");
    return d.toLocaleDateString(taalLocale(), { weekday: "short", day: "numeric", month: "long", ...(d.getFullYear() !== nu.getFullYear() ? { year: "numeric" } : {}) });
}
export const tijdVan = (iso) => (iso ? new Date(iso).toLocaleTimeString(taalLocale(), { hour: "2-digit", minute: "2-digit" }) : "");
/** Tijd in het overzicht: vandaag de tijd, anders "Gisteren" of de datum. */
function lijstTijd(iso) {
    if (!iso)
        return "";
    const d = new Date(iso);
    return dagSleutel(d) === dagSleutel(new Date()) ? tijdVan(iso) : dagLabel(iso);
}
function gesprekUit(c) {
    return {
        id: c.id,
        onderwerp: c.title || i18n.t(`${NS}.zonderTitel`),
        icoon: "berichten",
        laatste: c.last_message_text ?? "",
        laatsteAt: c.last_message_text ? c.last_message_at : null,
        get laatsteTijd() { return lijstTijd(this.laatsteAt ?? this.aangemaakt); },
        aangemaakt: c.created_at,
        ongelezen: c.unread ?? 0,
        vastgezet: !!c.pinned,
        gedemptTot: c.muted_until ?? null,
        concept: !!c.draft,
        kanVersturen: !!c.can_send,
        kindId: c.related_child_id ?? null,
        anderId: c.other_parent?.id ?? null,
        anderNaam: c.other_parent?.name ?? "",
        gearchiveerd: !!c.archived,
        mijnConcept: c.my_draft ?? "",
        berichten: state.berichten[c.id] ?? [],
    };
}
function berichtUit(m) {
    return {
        id: m.id,
        van: m.sender_id === mijnId() ? "ik" : "ander",
        afzender: m.sender_id,
        tekst: m.content,
        at: m.created_at,
        get tijd() { return tijdVan(this.at); },
        toon: m.tone_level ?? "geen",
        systeem: !!m.is_system,
        clientId: m.client_id ?? null,
    };
}
/** Volgorde in het overzicht: vastgezet eerst, dan het laatste bericht. */
function sorteer(lijst) {
    return [...lijst].sort((a, b) => Number(b.vastgezet) - Number(a.vastgezet) || String(b.laatsteAt ?? b.aangemaakt).localeCompare(String(a.laatsteAt ?? a.aangemaakt)));
}
function vervangGesprek(c) {
    const g = gesprekUit(c);
    const bestaat = state.gesprekken.some((x) => x.id === g.id);
    const gesprekken = sorteer(bestaat ? state.gesprekken.map((x) => (x.id === g.id ? g : x)) : [g, ...state.gesprekken]);
    zet({ gesprekken, ongelezen: telOngelezen(gesprekken) });
    return g;
}
const telOngelezen = (lijst) => lijst.reduce((s, g) => s + (g.gearchiveerd ? 0 : g.ongelezen), 0);
function patchGesprek(id, p) {
    const gesprekken = sorteer(state.gesprekken.map((g) => (g.id === id ? { ...g, ...p, get laatsteTijd() { return lijstTijd(this.laatsteAt ?? this.aangemaakt); } } : g)));
    zet({ gesprekken, ongelezen: telOngelezen(gesprekken) });
}
function zetBerichten(id, lijst) {
    zet({ berichten: { ...state.berichten, [id]: lijst } });
    patchGesprek(id, { berichten: lijst });
}
/* ---------------------------------------------------------------- laden */
let bezig = null;
/** Oude, op dit apparaat voorbereide onderwerpen (vóór Phase 2) gaan één keer naar de server. */
async function zetOudeOnderwerpenOver() {
    const oud = startState().onderwerpen ?? [];
    if (!oud.length)
        return;
    const klaar = [];
    for (const o of oud) {
        try {
            const r = await api("manage-messages", "create", { title: String(o.naam ?? "").slice(0, 120) || i18n.t(`${NS}.zonderTitel`) });
            const c = leesOudConcept(o.id);
            if (c) {
                await api("manage-messages", "save-draft", { conversation_id: r.conversation.id, draft: c.slice(0, MAX_CONCEPT) }, { stil: true });
                wisOudConcept(o.id);
            }
            klaar.push(o.id);
        }
        catch { /* volgende keer opnieuw */ }
    }
    if (klaar.length)
        start.wisOnderwerpen?.(klaar);
}
/** Haalt alle gesprekken (en het totaal ongelezen) opnieuw op. */
export function laadGesprekken() {
    if (!mijnId())
        return Promise.resolve();
    if (bezig)
        return bezig;
    if (state.status === "leeg")
        zet({ status: "laden" });
    bezig = (async () => {
        try {
            await zetOudeOnderwerpenOver();
            // Na de eerste lading is verversen achtergrondwerk: geen laadbalk.
            const r = await api("manage-messages", "list", {}, { stil: state.status === "klaar" });
            const gesprekken = sorteer((r.conversations ?? []).map(gesprekUit));
            zet({ status: "klaar", gesprekken, coOuders: r.co_parents ?? [], ongelezen: telOngelezen(gesprekken), laatsteLading: Date.now(), gebruikerId: mijnId() });
        }
        catch (e) {
            zet({ status: state.status === "klaar" ? "klaar" : "fout" });
            meldFout(e);
        }
        finally {
            bezig = null;
        }
    })();
    return bezig;
}
const berichtenBezig = new Map();
/** Berichten van één gesprek; daarna alleen nieuwe (since). Markeert het gesprek als gelezen. */
export function laadBerichten(id) {
    if (!id || !mijnId())
        return Promise.resolve();
    if (berichtenBezig.has(id))
        return berichtenBezig.get(id);
    const p = (async () => {
        const huidig = state.berichten[id];
        const echt = (huidig ?? []).filter((b) => !b.wacht && !b.mislukt);
        const since = huidig ? echt.at(-1)?.at : undefined;
        try {
            const r = await api("manage-messages", "messages", { conversation_id: id, ...(since ? { since } : {}) }, { stil: !!since });
            const nieuw = (r.messages ?? []).map(berichtUit);
            const nu = state.berichten[id] ?? [];
            const bekend = new Set(nu.map((b) => b.id));
            const clientIds = new Set(nieuw.map((b) => b.clientId).filter(Boolean));
            // vervang optimistische berichten die intussen echt zijn opgeslagen
            const samen = [...nu.filter((b) => !(b.wacht && clientIds.has(b.clientId))), ...nieuw.filter((b) => !bekend.has(b.id))];
            samen.sort((a, b) => Number(!!a.wacht || !!a.mislukt) - Number(!!b.wacht || !!b.mislukt) || String(a.at).localeCompare(String(b.at)));
            zet({ berichten: { ...state.berichten, [id]: samen }, akkoorden: { ...state.akkoorden, [id]: akkoordenUit(r.agreements) } });
            vervangGesprek(r.conversation);
        }
        catch (e) {
            if (e?.code === "NOT_FOUND")
                zet({ gesprekken: state.gesprekken.filter((g) => g.id !== id) });
            else
                meldFout(e);
        }
        finally {
            berichtenBezig.delete(id);
        }
    })();
    berichtenBezig.set(id, p);
    return p;
}
const nieuwClientId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
/** Optimistisch versturen; bij een fout blijft het bericht zichtbaar als "niet verstuurd" (opnieuw proberen kan). */
export async function verstuurBericht(id, tekst, toon = "geen", bestaandClientId) {
    const inhoud = tekst.trim();
    if (!inhoud)
        return false;
    const clientId = bestaandClientId ?? nieuwClientId();
    const voorlopig = { id: `tmp-${clientId}`, van: "ik", afzender: mijnId(), tekst: inhoud, at: new Date().toISOString(), get tijd() { return tijdVan(this.at); }, toon, clientId, wacht: true };
    const zonder = (state.berichten[id] ?? []).filter((b) => b.clientId !== clientId);
    zetBerichten(id, [...zonder, voorlopig]);
    try {
        const r = await api("manage-messages", "send", { conversation_id: id, content: inhoud, tone_level: toon, client_id: clientId });
        const echt = berichtUit(r.message);
        const lijst = (state.berichten[id] ?? []).filter((b) => b.clientId !== clientId && b.id !== echt.id);
        zet({ berichten: { ...state.berichten, [id]: [...lijst, echt] } });
        vervangGesprek(r.conversation);
        return true;
    }
    catch (e) {
        zetBerichten(id, (state.berichten[id] ?? []).map((b) => (b.clientId === clientId ? { ...b, wacht: false, mislukt: true } : b)));
        meldFout(e);
        return false;
    }
}
/** Een niet verstuurd bericht opnieuw proberen (zelfde client_id). */
export function probeerOpnieuw(id, bericht) {
    return verstuurBericht(id, bericht.tekst, bericht.toon, bericht.clientId);
}
/** Nieuw onderwerp; zonder gekoppelde andere ouder wordt het een voorbereid concept. Geeft het id of null. */
export async function maakGesprek({ titel, kindId, eersteBericht } = {}) {
    try {
        const r = await api("manage-messages", "create", { title: titel.trim(), ...(kindId ? { child_id: kindId } : {}), ...(eersteBericht?.trim() ? { initial_message: eersteBericht.trim(), client_id: nieuwClientId() } : {}) });
        if (r.message)
            zet({ berichten: { ...state.berichten, [r.conversation.id]: [berichtUit(r.message)] } });
        else
            zet({ berichten: { ...state.berichten, [r.conversation.id]: [] } });
        vervangGesprek(r.conversation);
        return r.conversation.id;
    }
    catch (e) {
        meldFout(e);
        return null;
    }
}
async function voorkeur(id, velden, optimistischPatch) {
    const vorig = state.gesprekken.find((g) => g.id === id);
    if (!vorig)
        return false;
    patchGesprek(id, optimistischPatch);
    try {
        const r = await api("manage-messages", "update", { conversation_id: id, ...velden });
        vervangGesprek(r.conversation);
        return true;
    }
    catch (e) {
        patchGesprek(id, { vastgezet: vorig.vastgezet, gedemptTot: vorig.gedemptTot });
        meldFout(e);
        return false;
    }
}
/** Vastzetten (max 3) of losmaken. Geeft false bij het maximum, zodat het scherm de bestaande melding toont. */
export function wisselVastgezet(id) {
    const g = state.gesprekken.find((x) => x.id === id);
    if (!g)
        return false;
    if (!g.vastgezet && state.gesprekken.filter((x) => x.vastgezet).length >= MAX_VAST)
        return false;
    void voorkeur(id, { pinned: !g.vastgezet }, { vastgezet: !g.vastgezet });
    return true;
}
/** Meldingen dempen voor `uren`, of weer aanzetten met null. */
export function dempGesprek(id, uren) {
    const tot = uren ? new Date(Date.now() + uren * 3600_000).toISOString() : null;
    return voorkeur(id, { muted_until: tot }, { gedemptTot: tot });
}
export const isGedempt = (g) => !!g?.gedemptTot && new Date(g.gedemptTot).getTime() > Date.now();
/* ---------------------------------------------------------------- concepten (alleen voor jou, op de server) */
/** Oud concept van vóór de serveropslag (alleen nog om één keer over te zetten). */
export function leesOudConcept(id) {
    try {
        return localStorage.getItem(`onzeapp-concept-${id}`) ?? "";
    }
    catch {
        return "";
    }
}
export function wisOudConcept(id) {
    try {
        localStorage.removeItem(`onzeapp-concept-${id}`);
    }
    catch { /* geen opslag */ }
}
const conceptWacht = new Map();
const conceptVan = (id) => state.gesprekken.find((g) => g.id === id)?.mijnConcept ?? "";
async function stuurConcept(id, tekst) {
    conceptWacht.delete(id);
    const vorig = conceptVan(id);
    if (tekst === vorig || !state.gesprekken.some((g) => g.id === id))
        return true;
    patchGesprek(id, { mijnConcept: tekst });
    try {
        if (tekst.trim())
            await api("manage-messages", "save-draft", { conversation_id: id, draft: tekst }, { stil: true });
        else
            await api("manage-messages", "clear-draft", { conversation_id: id }, { stil: true });
        return true;
    }
    catch (e) {
        if (conceptVan(id) === tekst)
            patchGesprek(id, { mijnConcept: vorig });
        if (e?.code !== "UNAUTHORIZED")
            toast.error(foutTekst(e), { id: "concept-fout" });
        return false;
    }
}
/**
 * Concept bewaren (privé, per gesprek). Gewoon typen wordt gebundeld (na 1,2 s stilte één aanroep);
 * `direct` slaat meteen op en geeft true/false terug.
 */
export function bewaarConcept(id, tekst, { direct = false } = {}) {
    if (!id || !mijnId())
        return Promise.resolve(false);
    const inhoud = String(tekst ?? "").slice(0, MAX_CONCEPT);
    clearTimeout(conceptWacht.get(id)?.timer);
    if (direct)
        return stuurConcept(id, inhoud);
    if (inhoud === conceptVan(id)) {
        conceptWacht.delete(id);
        return Promise.resolve(true);
    }
    conceptWacht.set(id, { tekst: inhoud, timer: setTimeout(() => void stuurConcept(id, inhoud), 1200) });
    return Promise.resolve(true);
}
/** Openstaand concept meteen versturen (bij het verlaten van een gesprek). */
export function spoelConcept(id) {
    const w = conceptWacht.get(id);
    if (!w)
        return;
    clearTimeout(w.timer);
    void stuurConcept(id, w.tekst);
}
/** Openstaand concept vergeten (na versturen: de server wist het concept zelf). */
export function vergeetConcept(id) {
    clearTimeout(conceptWacht.get(id)?.timer);
    conceptWacht.delete(id);
    patchGesprek(id, { mijnConcept: "" });
}
/* ---------------------------------------------------------------- akkoord in een gesprek */
function akkoordenUit(lijst) {
    return Object.fromEntries((lijst ?? []).map((a) => [a.message_id, { label: a.label, mijn: !!a.mine, inAgenda: !!a.in_agenda, eventId: a.event_id ?? null, at: a.created_at }]));
}
/**
 * Akkoord op een vraag van de andere ouder: de server legt het vast, zet een bevestiging in het gesprek
 * (en `notitie` als gewoon bericht) en koppelt de afspraak die al in de gedeelde agenda is gezet.
 * Geeft true bij succes; bij een fout een melding en false (er verandert dan niets).
 */
export async function geefAkkoord(id, berichtId, { label, eventId = null, notitie = "" } = {}) {
    try {
        const r = await api("manage-messages", "agree", { conversation_id: id, message_id: berichtId, label: String(label ?? "").trim().slice(0, 200), ...(eventId ? { event_id: eventId } : {}), ...(notitie.trim() ? { note: notitie.trim(), client_id: nieuwClientId() } : {}) });
        const nieuw = (r.messages ?? []).map(berichtUit);
        const nu = state.berichten[id] ?? [];
        const bekend = new Set(nu.map((b) => b.id));
        const a = r.agreement;
        zet({
            berichten: { ...state.berichten, [id]: [...nu, ...nieuw.filter((b) => !bekend.has(b.id))] },
            akkoorden: { ...state.akkoorden, [id]: { ...(state.akkoorden[id] ?? {}), [a.message_id]: { label: a.label, mijn: !!a.mine, inAgenda: !!a.in_agenda, eventId: a.event_id ?? null, at: a.created_at } } },
        });
        vervangGesprek(r.conversation);
        return true;
    }
    catch (e) {
        meldFout(e);
        return false;
    }
}
/* ---------------------------------------------------------------- even pauze */
/** Loopt er een berichtenpauze (voorkeur `berichtenPauzeTot`, ISO)? */
export const pauzeLoopt = (vk) => !!vk?.berichtenPauzeTot && Date.parse(vk.berichtenPauzeTot) > Date.now();
/* ---------------------------------------------------------------- account, focus en peilen */
let gekoppeld = false;
function koppel() {
    if (gekoppeld || typeof window === "undefined")
        return;
    gekoppeld = true;
    opAuth(() => {
        const id = mijnId();
        if (!id) {
            if (state !== leeg)
                zet(leeg);
            return;
        }
        if (state.gebruikerId && state.gebruikerId !== id)
            zet(leeg);
        if (state.status === "leeg")
            void laadGesprekken();
    });
    bijTerugkeer("berichten", () => { if (mijnId() && Date.now() - state.laatsteLading > 10_000)
        return laadGesprekken(); }, { minMs: 15_000 });
    queueMicrotask(() => { if (mijnId() && state.status === "leeg")
        void laadGesprekken(); });
}
export function useBerichten() {
    return useSyncExternalStore((l) => { koppel(); luisteraars.add(l); return () => luisteraars.delete(l); }, () => state, () => leeg);
}
/** Totaal ongelezen voor de badge in de onderste balk; ververst hooguit elke 60 s bij het openen van een pagina. */
export function useOngelezenTotaal() {
    const s = useBerichten();
    const vk = useVoorkeuren();
    useEffect(() => {
        if (mijnId() && s.status !== "laden" && Date.now() - s.laatsteLading > 60_000)
            void laadGesprekken();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    // Even pauze: berichten komen binnen, maar de badge blijft stil tot de pauze voorbij is.
    return pauzeLoopt(vk) ? 0 : s.ongelezen;
}
/** Zolang Berichten open staat: elke 25 s verversen (en het open gesprek), plus bij terugkeren naar het venster. */
export function usePeilBerichten(actiefId) {
    useEffect(() => {
        void laadGesprekken();
        if (actiefId)
            void laadBerichten(actiefId);
        const ververs = () => {
            if (typeof document !== "undefined" && document.visibilityState === "hidden")
                return;
            void laadGesprekken();
            if (actiefId)
                void laadBerichten(actiefId);
        };
        const t = setInterval(ververs, PEIL_MS);
        const af = actiefId ? bijTerugkeer("berichten-open", () => laadBerichten(actiefId), { minMs: 15_000 }) : () => { };
        return () => { clearInterval(t); af(); };
    }, [actiefId]);
}
