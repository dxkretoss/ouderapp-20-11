import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { leg as legAudit } from "@/lib/audit-store";
import { api, foutTekst } from "@/lib/api";
import { authState, opAuth } from "@/lib/auth-store";
import { start, startState } from "@/lib/start-store";
import { gezinState, isIk, naamVan } from "@/lib/gezin";
import i18n, { taalLocale } from "@/i18n";
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
export const geenRechten = () => ({ wissel: "geen", momentjes: "geen", taken: "geen", spullen: "geen", agenda: "geen", nood: "geen", documenten: "geen" });
/**
 * De kring rond de kinderen komt van de server (manage-caregivers): beide ouders zien dezelfde personen
 * van hun gedeelde kinderen. Rechten zijn per kind en per onderdeel, standaard "geen", en gelden pas na
 * een geaccepteerde uitnodiging (inloggen + bevestigen). De server handhaaft dezelfde regels.
 * `momenten`/`wie`/`bevestigd` (ophalen en brengen) worden gevoed door het agenda-domein via zetMomenten;
 * er staan hier geen voorbeeldmomenten meer.
 */
const leeg = { personen: [], momenten: [], wie: {}, bevestigd: {}, meeKlaar: {}, takenKlaar: {}, noodkaart: {}, noodExtra: {}, gedeeldeDocs: {}, geladen: false, voor: null };
let state = leeg;
const listeners = new Set();
const zet = (p) => {
    state = { ...state, ...p };
    listeners.forEach((l) => l());
};
/* ---------- server ↔ store ---------- */
const isUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
const periodeVan = (m) => (m.valid_from && m.valid_to ? { type: "periode", start: m.valid_from, eind: m.valid_to } : m.valid_to ? { type: "tot", eind: m.valid_to } : m.valid_from ? { type: "periode", start: m.valid_from, eind: m.valid_from } : { type: "doorlopend" });
const periodeNaar = (p) => (!p || p.type === "doorlopend" ? { valid_from: null, valid_to: null } : p.type === "tot" ? { valid_from: null, valid_to: p.eind || null } : { valid_from: p.start || null, valid_to: p.eind || null });
/** Server-lid → de vorm die de schermen al gebruiken. */
export function persoonVanServer(m) {
    return {
        id: m.id, naam: m.name, rol: m.role, contact: m.phone || m.email || "", telefoon: m.phone || undefined, email: m.email || undefined, adres: m.address || undefined, foto: m.photo || undefined,
        noodcontact: !!m.is_emergency_contact, periode: periodeVan(m), ingetrokken: m.status === "revoked", sleutel: m.invite_token || undefined,
        uitgenodigd: m.status !== "contact_only", ...(m.status === "invited" ? { bevestigd: false } : m.status === "active" ? { bevestigd: true } : {}),
        rechten: Object.fromEntries((m.child_ids ?? []).map((k) => [k, { ...geenRechten(), ...(m.permissions?.[k] ?? {}) }])),
        status: m.status, heeftAccount: !!m.has_account, toegevoegdDoor: m.created_by, doorMij: !!m.added_by_me, toegevoegdDoorNaam: m.added_by_name || "",
    };
}
const rechtenNaar = (rechten) => Object.fromEntries(Object.entries(rechten ?? {}).filter(([k]) => isUuid(k)).map(([k, r]) => [k, Object.fromEntries(Object.entries(r ?? {}).filter(([, n]) => n && n !== "geen"))]));
function velden(p) {
    const v = {};
    if (p.naam !== undefined)
        v.name = p.naam;
    if (p.rol !== undefined)
        v.role = p.rol;
    if (p.telefoon !== undefined || p.contact !== undefined)
        v.phone = p.telefoon ?? (p.contact && !p.contact.includes("@") ? p.contact : null) ?? null;
    if (p.email !== undefined || (p.contact && p.contact.includes("@")))
        v.email = p.email ?? (p.contact?.includes("@") ? p.contact : null) ?? null;
    if (p.adres !== undefined)
        v.address = p.adres || null;
    if (p.noodcontact !== undefined)
        v.is_emergency_contact = !!p.noodcontact;
    if (p.periode !== undefined)
        Object.assign(v, periodeNaar(p.periode));
    if (p.foto !== undefined && typeof p.foto === "string" && p.foto.startsWith("data:"))
        v.image_base64 = p.foto;
    return v;
}
function noodkaartUitKinderen() {
    const kaart = {}, extra = {};
    for (const k of startState().kinderen ?? []) {
        const n = k.profiel?.noodkaart;
        if (n) {
            kaart[k.id] = Array.isArray(n.velden) ? n.velden : [];
            if (n.extra)
                extra[k.id] = n.extra;
        }
    }
    return { noodkaart: kaart, noodExtra: extra };
}
function meldFout(e) {
    if (e?.code === "UNAUTHORIZED")
        return;
    toast.error(foutTekst(e), { id: "kring-fout" });
}
let bezig = null;
/** Kring van de server halen (na inloggen, bij terugkeer naar het venster, of handmatig). */
export function laadKring() {
    const a = authState();
    if (a.status !== "aan" || !a.gebruiker)
        return Promise.resolve();
    if (bezig)
        return bezig;
    bezig = api("manage-caregivers", "list")
        .then((r) => zet({ personen: (r.members ?? []).map(persoonVanServer), ...noodkaartUitKinderen(), geladen: true, voor: a.gebruiker.id }))
        .catch(meldFout)
        .finally(() => { bezig = null; });
    return bezig;
}
let gekoppeld = false;
function koppel() {
    if (gekoppeld || typeof window === "undefined")
        return;
    gekoppeld = true;
    const volg = () => {
        const a = authState();
        if (a.status !== "aan") {
            if (state.voor)
                state = leeg;
            return;
        }
        if (state.voor !== a.gebruiker?.id)
            laadKring();
    };
    opAuth(volg);
    queueMicrotask(volg);
    window.addEventListener("focus", () => { if (authState().status === "aan")
        laadKring(); });
}
export function useKring() {
    return useSyncExternalStore((l) => { koppel(); listeners.add(l); return () => listeners.delete(l); }, () => state, () => leeg);
}
export const kringState = () => { koppel(); return state; };
/** Toegang vervalt automatisch na de einddatum; geen handmatige actie nodig. */
export function isActief(p, nu = new Date()) {
    if (p.ingetrokken)
        return false;
    const dag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(nu);
    if (p.periode.type === "tot")
        return dag <= p.periode.eind;
    if (p.periode.type === "periode")
        return dag >= p.periode.start && dag <= p.periode.eind;
    return true;
}
/** Effectief niveau: altijd "geen" als toegang niet actief is, nog niet bevestigd, of kind niet gedeeld. */
export function niveau(p, kindId, o) {
    if (!isActief(p) || p.uitgenodigd === false || p.bevestigd === false)
        return "geen";
    return p.rechten[kindId]?.[o] ?? "geen";
}
export const mag = (p, kindId, o, min = "bekijken") => {
    const n = niveau(p, kindId, o);
    return min === "bekijken" ? n !== "geen" : n === "bijdragen";
};
const vervang = (id, nieuw) => zet({ personen: state.personen.map((x) => (x.id === id ? nieuw : x)) });
/**
 * Persoon toevoegen (contact of uitnodiging). Geeft de server-persoon terug (met uitnodigingssleutel),
 * of undefined bij een fout (dan staat er al een melding).
 */
export async function maakPersoon(p) {
    const kinderen = Object.keys(p.rechten ?? {}).filter(isUuid);
    const tijdelijk = { ...p, id: `tmp-${Date.now()}`, ingetrokken: false, ...(p.uitgenodigd ? { bevestigd: false } : {}) };
    zet({ personen: [...state.personen, tijdelijk] });
    try {
        const r = await api("manage-caregivers", "create", { ...velden(p), child_ids: kinderen, invite: !!p.uitgenodigd, ...(p.uitgenodigd ? { permissions: rechtenNaar(p.rechten) } : {}) });
        const nieuw = persoonVanServer(r.member);
        vervang(tijdelijk.id, nieuw);
        return nieuw;
    }
    catch (e) {
        zet({ personen: state.personen.filter((x) => x.id !== tijdelijk.id) });
        meldFout(e);
        return undefined;
    }
}
/** Zelfde als maakPersoon, maar meteen (optimistisch) zichtbaar voor schermen die niet wachten. */
export const voegPersoonToe = (p) => {
    const tijdelijk = { ...p, id: `tmp-${Date.now()}`, ingetrokken: false };
    maakPersoon(p);
    return tijdelijk;
};
/** Wijzigen (contact, noodcontact, rechten, periode, of van contact naar uitnodiging). Optimistisch. */
export async function wijzigPersoon(id, p) {
    const vorig = state.personen.find((x) => x.id === id);
    if (!vorig || !isUuid(id))
        return undefined;
    const lokaal = { ...vorig, ...p, ...(p.uitgenodigd && vorig.uitgenodigd === false ? { bevestigd: false } : {}) };
    vervang(id, lokaal);
    try {
        const body = { caregiver_id: id, ...velden(p) };
        if (p.uitgenodigd === true && vorig.uitgenodigd === false)
            body.invite = true;
        if (p.rechten !== undefined)
            body.permissions = rechtenNaar(p.rechten);
        if (p.foto === null)
            body.photo = null;
        const r = await api("manage-caregivers", "update", body);
        const nieuw = persoonVanServer(r.member);
        vervang(id, nieuw);
        return nieuw;
    }
    catch (e) {
        vervang(id, vorig);
        meldFout(e);
        return undefined;
    }
}
/** Toegang intrekken: werkt meteen, ook op open schermen van de verzorger; de geschiedenis blijft. */
export async function trekIn(id) {
    const vorig = state.personen.find((x) => x.id === id);
    if (!vorig)
        return;
    vervang(id, { ...vorig, ingetrokken: true, sleutel: undefined });
    try {
        const r = await api("manage-caregivers", "revoke", { caregiver_id: id });
        vervang(id, persoonVanServer(r.member));
    }
    catch (e) {
        vervang(id, vorig);
        meldFout(e);
    }
}
/** Uitnodiging per e-mail laten versturen door de server (alleen bij een open uitnodiging met e-mailadres). */
export const mailUitnodiging = (id) => api("manage-caregivers", "send-invite-email", { caregiver_id: id, redirect_origin: typeof window !== "undefined" ? window.location.origin : undefined });
/** Wat dit kringlid ziet, precies zoals de server het aan hem/haar zou geven (voorbeeld voor ouders). */
export const bekijkAls = (id) => api("manage-caregivers", "view-as", { caregiver_id: id }).then((r) => r.view);
/** Als verzorger ingelogd: de kringen waar dit account nu toegang toe heeft. */
export const mijnKringen = () => api("manage-caregivers", "get-for-user").then((r) => r.views ?? []);
/** Ophaal-/brengmomenten (bron: agenda-domein). Alleen weergave; kiezen is nooit automatisch akkoord. */
export const zetMomenten = (momenten) => zet({ momenten: Array.isArray(momenten) ? momenten : [] });
const ikNaam = () => gezinState().ik?.naam || t("common.jij");
export const zetWie = (momentId, wie) => {
    const m = state.momenten.find((x) => x.id === momentId);
    if (m && state.wie[momentId] !== wie)
        legAudit("afspraak", momentId, m.titel, "UPDATED", { veld: t("lib.kringStore.veld.verantwoordelijke"), oud: wieNaam(state.wie[momentId]), nieuw: wieNaam(wie) }, ikNaam(), { kinderen: m.kindIds.map((k) => startState().kinderen.find((x) => x.id === k)?.naam ?? "") });
    const bevestigd = { ...state.bevestigd };
    delete bevestigd[momentId];
    zet({ wie: { ...state.wie, [momentId]: wie }, bevestigd });
};
export const bevestig = (momentId, v) => zet({ bevestigd: { ...state.bevestigd, [momentId]: v } });
export const toggleMee = (momentId, item) => {
    const l = state.meeKlaar[momentId] ?? [];
    zet({ meeKlaar: { ...state.meeKlaar, [momentId]: l.includes(item) ? l.filter((x) => x !== item) : [...l, item] } });
};
/** Noodkaart per kind = profielsectie "noodkaart" van het kind (gedeeld door beide ouders). */
export function toggleNoodVeld(kindId, v) {
    const vorig = state.noodkaart[kindId] ?? [];
    const nieuw = vorig.includes(v) ? vorig.filter((x) => x !== v) : [...vorig, v];
    return zetNoodkaart(kindId, nieuw, state.noodExtra[kindId] ?? "");
}
export async function zetNoodkaart(kindId, velden, extra) {
    const vorig = { noodkaart: state.noodkaart, noodExtra: state.noodExtra };
    zet({ noodkaart: { ...state.noodkaart, [kindId]: velden }, noodExtra: { ...state.noodExtra, [kindId]: extra } });
    try {
        await api("manage-children", "update", { child_id: kindId, updates: { profile: { noodkaart: { velden, extra: extra || "" } } } });
        // start-store spiegelt de kindprofielen; zo leest een volgende kringlading dezelfde noodkaart.
        start.hydrateer();
    }
    catch (e) {
        zet(vorig);
        meldFout(e);
    }
}
export const persoonLabel = (p) => (["Opa", "Oma"].includes(p.rol) ? t("lib.kringStore.persoonLabel", { rol: rolNaam(p.rol), naam: p.naam }) : p.naam);
export function wieNaam(id) {
    if (!id)
        return t("lib.kringStore.nogNiemand");
    if (isIk(id))
        return t("common.jij");
    const ouder = naamVan(id);
    if (ouder)
        return gezinState().ander?.id === id ? t("common.deAndereOuder") : ouder;
    const p = state.personen.find((x) => x.id === id);
    return p ? persoonLabel(p) : t("lib.kringStore.onbekend");
}
export function periodeTekst(p) {
    const f = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(taalLocale(), { day: "numeric", month: "long", year: "numeric" });
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
export const adresboek = (kindId) => state.personen.filter((p) => !p.ingetrokken && p.rechten[kindId]);
export const noodcontacten = (kindId) => adresboek(kindId).filter((p) => p.noodcontact);
/** Contacten zonder app die een ouder wél kan registreren als ophaler (zonder digitale bevestiging). */
export const contactKandidaten = (m) => state.personen.filter((p) => !p.ingetrokken && p.uitgenodigd === false && m.kindIds.every((k) => p.rechten[k]));
export const heeftApp = (id) => state.personen.find((p) => p.id === id)?.uitgenodigd !== false;
/** Generiek: wie mag dit moment regelen? Ouders altijd; kringleden alleen met toegang voor álle betrokken kinderen. */
export function kandidatenVoor(m) {
    const o = m.soort === "wissel" ? "wissel" : "agenda";
    return state.personen.filter((p) => isActief(p) && m.kindIds.every((k) => niveau(p, k, o) !== "geen"));
}
/** Is dit id een ouder (ik of de andere ouder)? */
const isOuder = (id) => isIk(id) || (!!id && gezinState().ander?.id === id);
/** Wie regelt dit — met bevestigingsstatus. Kiezen is nooit automatisch akkoord van een kringlid. */
export function regelStatus(momentId) {
    const wie = state.wie[momentId];
    if (!wie)
        return null;
    if (isIk(wie))
        return { wie, tekst: t("lib.kringStore.regel.jij"), bevestigd: true };
    if (isOuder(wie))
        return { wie, tekst: t("lib.kringStore.regel.andereOuder"), bevestigd: true };
    if (!heeftApp(wie))
        return { wie, tekst: t("lib.kringStore.regel.geregistreerd", { naam: wieNaam(wie) }), bevestigd: false };
    const b = state.bevestigd[momentId];
    return { wie, tekst: b ? t("lib.kringStore.regel.bevestigd", { naam: wieNaam(wie) }) : t("lib.kringStore.regel.gevraagd", { naam: wieNaam(wie) }), bevestigd: !!b };
}
export { isOuder };
/** Tijd of plek van een afspraak definitief aanpassen (wisselmomenten lopen via een voorstel). */
export function wijzigMoment(id, p, door = ikNaam()) {
    const m = state.momenten.find((x) => x.id === id);
    if (!m)
        return;
    const kids = m.kindIds.map((k) => startState().kinderen.find((x) => x.id === k)?.naam ?? "");
    if (p.tijd && p.tijd !== m.tijd)
        legAudit("afspraak", id, m.titel, "UPDATED", { veld: t("lib.kringStore.veld.tijdstip"), oud: `${m.dag} ${m.tijd}`, nieuw: `${m.dag} ${p.tijd}` }, door, { kinderen: kids });
    if (p.plek && p.plek !== m.plek)
        legAudit("afspraak", id, m.titel, "UPDATED", { veld: t("lib.kringStore.veld.locatie"), oud: m.plek, nieuw: p.plek }, door, { kinderen: kids });
    zet({ momenten: state.momenten.map((x) => (x.id === id ? { ...x, ...p } : x)) });
}
/** Alleen voor tests: kringpersonen direct zetten (de echte bron is de server). */
export const zetPersonenVoorTest = (personen) => zet({ personen });
