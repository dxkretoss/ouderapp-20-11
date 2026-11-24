import { useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { api, foutTekst, leesToken } from "@/lib/api";
import { authState, opAuth } from "@/lib/auth-store";
import { startState, useStart } from "@/lib/start-store";
/**
 * Afspraken van het eigen gezin (één bron: manage-agenda op de server) plus de laadhub voor het hele
 * agendadomein: één `list`-aanroep vult deze store, zorg-store (voorstellen, uitzonderingen, versies),
 * aanwezigheid-store en nu-afstemmen-store; vakanties en overdracht laden hun eigen functie.
 * Privé-afspraken (gedeeld=false) komen alleen terug voor de eigenaar. Gedeelde wijzigingen door een
 * gekoppelde ouder worden voorstellen; de server beslist (direct alleen bij privé of zonder gekoppelde ouder).
 * Verversen: na inloggen, na elke wijziging en wanneer het venster weer focus krijgt (geen realtime).
 */
let state = { geladen: false, laden: false, events: [], voorstellen: [], verbonden: false };
const luisteraars = new Set();
function zet(p) {
    state = { ...state, ...p };
    luisteraars.forEach((l) => l());
}
export const agendaState = () => state;
/** Alleen met een sessie praten we met de server (tests en uitgelogd: alleen lokaal). */
export const online = () => typeof window !== "undefined" && !!leesToken();
export function meldFout(e) {
    if (e?.code === "UNAUTHORIZED")
        return;
    toast.error(foutTekst(e), { id: "agenda-fout" });
}
/* ---------- kinderen: id's ↔ het label dat de schermen al gebruiken ("Emma", "Alle kinderen") ---------- */
export function kindLabel(ids, kinderen = startState().kinderen) {
    if (!ids?.length)
        return "";
    if (kinderen.length > 1 && kinderen.every((k) => ids.includes(k.id)))
        return "Alle kinderen";
    return ids.map((id) => kinderen.find((k) => k.id === id)?.naam).filter(Boolean).join(" & ");
}
export function kindIdsVan(label, kinderen = startState().kinderen) {
    if (!label)
        return [];
    if (/^(alle kinderen|allebei)$/i.test(label))
        return kinderen.map((k) => k.id);
    const delen = label.split(/ & | en |, /);
    const ids = kinderen.filter((k) => delen.includes(k.naam) || k.id === label).map((k) => k.id);
    return ids.length ? ids : kinderen.filter((k) => k.naam.toLowerCase() === label.toLowerCase()).map((k) => k.id);
}
/* ---------- server → app ---------- */
const evVanServer = (e) => ({ id: e.id, titel: e.titel, datum: e.datum, einddatum: e.einddatum ?? undefined, tijd: e.tijd ?? "", eindtijd: e.eindtijd ?? undefined, heleDag: !!e.heleDag, categorie: e.categorie ?? "overig", kindIds: e.kind_ids ?? [], herhaling: e.herhaling ?? undefined, overslaan: e.overslaan ?? [], locatie: e.locatie ?? undefined, toelichting: e.toelichting ?? undefined, herinnering: e.herinnering ?? "geen", gedeeld: e.gedeeld !== false, neemMee: e.neem_mee ?? [], mine: !!e.mine });
const vpVanServer = (p) => ({ id: p.id, eventId: p.event_id, mine: !!p.mine, soort: p.soort, bereik: p.bereik, datum: p.datum ?? undefined, kindIds: p.kind_ids ?? [], velden: p.velden ? { ...p.velden, kindIds: p.velden.kind_ids ?? [] } : null, status: p.status ?? undefined, reactieDatum: p.reactie_datum ?? undefined, meerTijd: p.meer_tijd ?? undefined, toelichting: p.toelichting ?? undefined, aangemaakt: p.created_at });
/** App-velden → wat manage-agenda verwacht (kind-label wordt kind_ids). */
export function veldenNaarServer(v) {
    return { titel: v.titel, datum: v.datum, einddatum: v.einddatum ?? null, tijd: v.tijd || null, eindtijd: v.eindtijd || null, heleDag: !!v.heleDag, categorie: v.categorie, kind_ids: v.kindIds ?? kindIdsVan(v.kind), herhaling: v.herhaling ?? null, locatie: v.locatie ?? null, toelichting: v.toelichting ?? null, herinnering: v.herinnering ?? "geen", gedeeld: v.gedeeld !== false, neem_mee: v.neemMee ?? [] };
}
/* ---------- laden ---------- */
const ontvangers = new Set();
/** Andere stores van dit domein schrijven zich in voor hun deel van de `list`-uitkomst. */
export const opAgendaLijst = (f) => { ontvangers.add(f); return () => ontvangers.delete(f); };
const extraLaders = new Set();
/** Stores met een eigen functie (vakanties, overdracht) laden mee bij hetzelfde moment. */
export const laadOokBij = (f) => { extraLaders.add(f); };
let bezig = null;
export function herlaad() {
    if (!online())
        return Promise.resolve();
    if (bezig)
        return bezig;
    zet({ laden: true });
    bezig = (async () => {
        try {
            const r = await api("manage-agenda", "list");
            zet({ geladen: true, events: (r.events ?? []).map(evVanServer), voorstellen: (r.event_proposals ?? []).map(vpVanServer), verbonden: !!r.connected });
            ontvangers.forEach((f) => f(r));
        }
        catch (e) {
            meldFout(e);
        }
        finally {
            zet({ laden: false });
            bezig = null;
        }
    })();
    return bezig;
}
/** Alles van het agendadomein opnieuw ophalen (na inloggen of bij terugkeer naar de app). */
export const herlaadAlles = () => Promise.all([herlaad(), ...[...extraLaders].map((f) => f())]);
let gekoppeld = false;
let voor = null;
function koppel() {
    if (gekoppeld || typeof window === "undefined")
        return;
    gekoppeld = true;
    const volg = () => {
        const a = authState();
        const id = a.status === "aan" ? a.gebruiker?.id : null;
        if (id === voor)
            return;
        voor = id;
        if (!id) {
            zet({ geladen: false, events: [], voorstellen: [], verbonden: false });
            ontvangers.forEach((f) => f(null));
            return;
        }
        herlaadAlles();
    };
    opAuth(volg);
    queueMicrotask(volg);
    window.addEventListener("focus", () => { if (voor)
        herlaadAlles(); });
}
/** Start het laden bij het eerste gebruik (elke store van dit domein roept dit aan). */
export const startAgendaSync = koppel;
export function useAgenda() {
    koppel();
    const s = useSyncExternalStore((l) => { luisteraars.add(l); return () => luisteraars.delete(l); }, () => state, () => state);
    const { kinderen } = useStart();
    return useMemo(() => ({
        ...s,
        events: s.events.map((e) => ({ ...e, kind: kindLabel(e.kindIds, kinderen) })),
        voorstellen: s.voorstellen.map((p) => ({ ...p, velden: p.velden ? { ...p.velden, kind: kindLabel(p.velden.kindIds, kinderen) } : null })),
    }), [s, kinderen]);
}
/* ---------- acties (de server beslist: direct toepassen of voorstel) ---------- */
async function doe(actie, body) {
    if (!online())
        return null;
    try {
        const r = await api("manage-agenda", actie, body);
        await herlaad();
        return r;
    }
    catch (e) {
        meldFout(e);
        await herlaad();
        return null;
    }
}
/** Nieuwe afspraak. Optimistisch zichtbaar; `voorstel` stuurt een gedeelde afspraak als voorstel naar de andere ouder. */
export function maakAfspraak(velden, { voorstel = false } = {}) {
    const tijdelijk = { ...velden, id: `tmp-${Date.now()}`, kindIds: velden.kindIds ?? kindIdsVan(velden.kind), overslaan: [], mine: true };
    if (!voorstel)
        zet({ events: [...state.events, tijdelijk] });
    return doe("create-event", { fields: veldenNaarServer(velden), voorstel });
}
export const wijzigAfspraak = (id, velden, bereik = "reeks", datum) => doe("update-event", { event_id: id, fields: veldenNaarServer(velden), scope: bereik, occurrence_date: datum ?? null });
export function verwijderAfspraak(id, bereik = "reeks", datum) {
    const a = state.events.find((x) => x.id === id);
    if (a && (a.gedeeld === false || !state.verbonden) && (bereik === "reeks" || !a.herhaling))
        zet({ events: state.events.filter((x) => x.id !== id) });
    return doe("delete-event", { event_id: id, scope: bereik, occurrence_date: datum ?? null });
}
/** Akkoord / Ander voorstel / Niet akkoord / Meer tijd nodig — alleen de andere ouder. */
export const reageerOpAfspraakVoorstel = (id, response, extra = {}) => doe("respond-event-proposal", { proposal_id: id, response, ...extra });
export const trekAfspraakVoorstelIn = (id) => doe("withdraw-event-proposal", { proposal_id: id });
/** Alleen voor tests. */
export const zetAgendaVoorTest = (p) => zet(p);
