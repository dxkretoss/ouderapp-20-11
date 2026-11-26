import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { leg as legAudit } from "@/lib/audit-store";
import { api, foutTekst } from "@/lib/api";
import { authState, opAuth } from "@/lib/auth-store";
import { start, startState } from "@/lib/start-store";
import { gezinState, isIk, naamVan } from "@/lib/gezin";
import { serverBron } from "@/lib/praktisch-sync";
import i18n, { taalLocale } from "@/i18n";
import { bijTerugkeer } from "@/lib/terugkeer";
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
const leeg = { personen: [], momenten: [], meeKlaar: {}, takenKlaar: {}, noodkaart: {}, noodExtra: {}, gedeeldeDocs: {}, geladen: false, voor: null };
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
let laatstGeladen = 0;
/** Kring van de server. Zonder `forceer` niet opnieuw als het minder dan 30 s geleden al geladen is (schermen roepen dit bij openen aan). */
export function laadKring(forceer = false) {
    const a = authState();
    if (a.status !== "aan" || !a.gebruiker)
        return Promise.resolve();
    if (bezig)
        return bezig;
    if (!forceer && state.geladen && state.voor === a.gebruiker.id && Date.now() - laatstGeladen < 30_000)
        return Promise.resolve();
    bezig = api("manage-caregivers", "list")
        .then((r) => { laatstGeladen = Date.now(); zet({ personen: (r.members ?? []).map(persoonVanServer), ...noodkaartUitKinderen(), geladen: true, voor: a.gebruiker.id }); })
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
            alsVerzorger = leegVerzorger;
            rol = { voor: null, rol: null };
            return;
        }
        if (state.voor !== a.gebruiker?.id)
            laadKring();
    };
    opAuth(volg);
    queueMicrotask(volg);
    bijTerugkeer("kring", () => (authState().status === "aan" ? laadKring(true) : undefined));
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
/* ---------- wie haalt of brengt (server: manage-pickups) ----------
 * Een ouder kiest per moment wie haalt of brengt: jij, de andere ouder van die kinderen, iemand uit de kring
 * met de app (die accepteert of weigert) of een contact zonder app (alleen geregistreerd). Beide ouders van
 * die kinderen zien de status; per kind kan dat een andere andere ouder zijn.
 */
const ACTIEF = ["requested", "accepted", "declined"];
export const toewijzingVanServer = (a) => ({
    id: a.id, momentId: a.moment_key, soort: a.moment_type, datum: a.date, tijd: a.time ?? "", plek: a.place ?? "", titel: a.title ?? "",
    kindIds: a.child_ids ?? [], wieSoort: a.assignee_type, wie: a.assignee_id, wieNaam: a.assignee_name ?? "", wieRol: a.assignee_role ?? null,
    status: a.status, reden: a.reason ?? "", reactieOp: a.responded_at, ingepakt: a.packed_items ?? [], mee: a.mee ?? [],
    onderwegOp: a.on_the_way_at, aangekomenOp: a.arrived_at, doorMij: !!a.by_me, checkins: a.checkins ?? [],
});
const checkinVanServer = (c) => ({ id: c.id, momentId: c.moment_key, datum: c.date, tijd: c.time ?? "", kindIds: c.child_ids ?? [], soort: c.kind, wie: c.user_id, naam: c.name ?? "", mijn: !!c.mine, op: c.at });
export const hulpVanServer = (h) => ({
    id: h.id, kindIds: h.child_ids ?? [], wat: h.what, datum: h.date, tijd: h.time ?? "", status: h.status, geaccepteerdDoor: h.accepted_by, geaccepteerdNaam: h.accepted_by_name ?? "",
    doorMij: !!h.by_me, ontvangers: (h.recipients ?? []).map((r) => ({ id: r.caregiver_id, naam: r.name ?? "", status: r.status, reden: r.reason ?? "" })),
});
let ophalen = { toewijzingen: [], checkins: [], hulp: [] };
const ophalenLuisteraars = new Set();
const zetOphalen = (p) => { ophalen = { ...ophalen, ...p }; ophalenLuisteraars.forEach((l) => l()); };
export const ophalenBron = serverBron({
    laad: async () => {
        const r = await api("manage-pickups", "list", {}, { stil: true });
        zetOphalen({ toewijzingen: (r.assignments ?? []).map(toewijzingVanServer), checkins: (r.checkins ?? []).map(checkinVanServer), hulp: (r.help ?? []).map(hulpVanServer) });
    },
    wis: () => zetOphalen({ toewijzingen: [], checkins: [], hulp: [] }),
});
let ververser = null;
function startVerversen() {
    if (ververser || typeof window === "undefined")
        return;
    // Live genoeg voor een overdracht: elke minuut opnieuw, maar alleen zolang een scherm met ophalen open staat
    // (er is een abonnee) en het venster zichtbaar is. Anders geen verkeer.
    ververser = window.setInterval(() => { if (ophalenLuisteraars.size > 0 && document.visibilityState === "visible" && ophalenBron.isEigen())
        ophalenBron.ververs(); }, 60_000);
}
/** Toewijzingen, check-ins en hulpverzoeken (ouderkant). */
export function useOphalen() {
    ophalenBron.zorg();
    startVerversen();
    return useSyncExternalStore((l) => { ophalenLuisteraars.add(l); return () => ophalenLuisteraars.delete(l); }, () => ophalen, () => ophalen);
}
export const ophalenState = () => { ophalenBron.zorg(); return ophalen; };
/** Alleen voor hulp-store: de lijst hulpverzoeken bijwerken (optimistisch of na een serverantwoord). */
export const zetHulpLijst = (hulp) => zetOphalen({ hulp });
const ikNaam = () => gezinState().ik?.naam || t("common.jij");
/** De ene andere ouder van een kind (gekoppeld en actief), of null (Solo). */
function anderVanKind(kindId) {
    const actief = new Set((gezinState().coOuders ?? []).map((c) => c.id));
    return (startState().kinderen.find((k) => k.id === kindId)?.ouders ?? []).map((o) => o.id).find((id) => actief.has(id)) ?? null;
}
/** Kinderen per andere ouder: [[kind…] per paar]; Solo-kinderen samen. Eén gedeeld item kan maar naar één ouder. */
export function groepeerPerPaar(kindIds) {
    const groepen = new Map();
    for (const k of kindIds ?? []) {
        const sleutel = anderVanKind(k) ?? "solo";
        groepen.set(sleutel, [...(groepen.get(sleutel) ?? []), k]);
    }
    return [...groepen.entries()].map(([ander, kids]) => ({ ander: ander === "solo" ? null : ander, kids }));
}
/** De actieve toewijzing van een moment (voor één kind, of voor het moment als geheel). */
export function toewijzingVoor(momentId, kindId, s = ophalen) {
    return s.toewijzingen.filter((a) => a.momentId === momentId && ACTIEF.includes(a.status) && (!kindId || a.kindIds.includes(kindId))).at(-1) ?? null;
}
/** Wie haalt/brengt: { wie, wieSoort, status, … } of undefined. */
export const wieVoor = (momentId, kindId) => toewijzingVoor(momentId, kindId)?.wie;
/**
 * Kies wie haalt of brengt. `moment` is een moment-object (of een id uit kring.momenten); `basisKind` beperkt
 * de keuze tot de kinderen met dezelfde andere ouder als dat kind (kringpagina per kind).
 * Optimistisch; bij een fout terug en een melding. Geeft true bij succes.
 */
export async function zetWie(moment, wie, basisKind) {
    const m = typeof moment === "string" ? state.momenten.find((x) => x.id === moment) : moment;
    if (!m || !wie || !m.datum)
        return false;
    let groepen = groepeerPerPaar(m.kindIds ?? []);
    if (basisKind)
        groepen = groepen.filter((g) => g.kids.includes(basisKind));
    const ouder = isIk(wie) || groepen.some((g) => g.ander === wie);
    if (ouder && !isIk(wie))
        groepen = groepen.filter((g) => g.ander === wie);
    if (!groepen.length)
        return false;
    const vorig = ophalen.toewijzingen;
    const geraakt = (a) => a.momentId === m.id && ACTIEF.includes(a.status) && a.kindIds.some((k) => groepen.some((g) => g.kids.includes(k)));
    const p = state.personen.find((x) => x.id === wie);
    const tijdelijk = groepen.map((g, i) => ({ id: `tmp-${Date.now()}-${i}`, momentId: m.id, soort: m.soort === "afspraak" ? "afspraak" : "wissel", datum: m.datum, tijd: m.tijd ?? "", plek: m.plek ?? "", titel: m.titel ?? "",
        kindIds: g.kids, wieSoort: ouder ? "parent" : p?.uitgenodigd === false ? "contact" : "caregiver", wie, wieNaam: p?.naam ?? naamVan(wie) ?? "", status: ouder || p?.uitgenodigd === false ? "accepted" : "requested", reden: "", ingepakt: [], mee: [], doorMij: true, checkins: [] }));
    zetOphalen({ toewijzingen: [...vorig.filter((a) => !geraakt(a)), ...tijdelijk] });
    try {
        const uit = [];
        for (const g of groepen) {
            const r = await api("manage-pickups", "assign", {
                moment_key: m.id, moment_type: m.soort === "afspraak" ? "afspraak" : "wissel", date: m.datum, time: m.tijd || null, place: m.plek || null,
                title: m.soort === "afspraak" ? (m.titel || null) : null, child_ids: g.kids, assignee_type: ouder ? "parent" : "caregiver", assignee_id: wie,
            });
            uit.push(toewijzingVanServer(r.assignment));
        }
        zetOphalen({ toewijzingen: [...ophalen.toewijzingen.filter((a) => !tijdelijk.some((x) => x.id === a.id) && !uit.some((x) => x.id === a.id)), ...uit] });
        return true;
    }
    catch (e) {
        zetOphalen({ toewijzingen: vorig });
        meldFout(e);
        ophalenBron.ververs();
        return false;
    }
}
/** Een toewijzing intrekken (ook om een "kan niet" op te ruimen). */
export async function trekToewijzingIn(id) {
    const vorig = ophalen.toewijzingen;
    if (String(id).startsWith("tmp-"))
        return;
    zetOphalen({ toewijzingen: vorig.filter((a) => a.id !== id) });
    try {
        await api("manage-pickups", "withdraw", { id });
        return true;
    }
    catch (e) {
        zetOphalen({ toewijzingen: vorig });
        meldFout(e);
        return false;
    }
}
/* ---------- "ik ben onderweg" / aankomst (ouder) ---------- */
/** Onderweg of aangekomen melden voor een moment; per andere ouder een eigen melding. */
export async function meldCheckIn(moment, soort) {
    if (!moment?.datum)
        return false;
    const vorig = ophalen.checkins;
    const groepen = groepeerPerPaar(moment.kindIds ?? []);
    const gebruiker = authState().gebruiker;
    zetOphalen({ checkins: [...vorig, ...groepen.map((g, i) => ({ id: `tmp-${Date.now()}-${i}`, momentId: moment.id, datum: moment.datum, tijd: moment.tijd ?? "", kindIds: g.kids, soort, wie: gebruiker?.id, naam: gebruiker?.name ?? "", mijn: true, op: new Date().toISOString() }))] });
    try {
        const uit = [];
        for (const g of groepen) {
            const r = await api("manage-pickups", "checkin", { moment_key: moment.id, date: moment.datum, time: moment.tijd || null, child_ids: g.kids, kind: soort });
            uit.push(checkinVanServer(r.checkin));
        }
        zetOphalen({ checkins: [...vorig.filter((c) => !uit.some((x) => x.id === c.id)), ...uit] });
        return true;
    }
    catch (e) {
        zetOphalen({ checkins: vorig });
        meldFout(e);
        return false;
    }
}
/** Mijn eigen check-in van deze soort voor dit moment (of undefined). */
export const mijnCheckIn = (momentId, soort, s = ophalen) => s.checkins.find((c) => c.momentId === momentId && c.soort === soort && c.mijn);
/**
 * Wie is nu onderweg voor dit moment (zolang die nog niet is aangekomen): { soort: "ik"|"ander"|"kring", naam }.
 * Alleen "onderweg", nooit locatie, route of aankomsttijd.
 */
export function onderwegVoor(momentId, s = ophalen) {
    const aangekomen = (wie) => s.checkins.some((c) => c.momentId === momentId && c.soort === "aangekomen" && c.wie === wie);
    const c = s.checkins.find((x) => x.momentId === momentId && x.soort === "onderweg" && !aangekomen(x.wie));
    if (c)
        return { soort: c.mijn ? "ik" : "ander", naam: c.naam };
    const a = s.toewijzingen.find((x) => x.momentId === momentId && x.wieSoort === "caregiver" && x.status === "accepted" && x.onderwegOp && !x.aangekomenOp);
    if (a) {
        const p = state.personen.find((x) => x.id === a.wie);
        return { soort: "kring", naam: p ? persoonLabel(p) : a.wieNaam };
    }
    return null;
}
/* ---------- als kringlid (verzorger): eigen toewijzingen en hulpverzoeken ---------- */
const leegVerzorger = { toewijzingen: [], hulp: [], kinderen: {}, geladen: false, fout: null, voor: null };
let alsVerzorger = leegVerzorger;
const verzorgerLuisteraars = new Set();
const zetVerzorger = (p) => { alsVerzorger = { ...alsVerzorger, ...p }; verzorgerLuisteraars.forEach((l) => l()); };
let verzorgerBezig = null;
/** Laadt wat dit account als kringlid moet doen. Gooit niet; de fout staat in de state (scherm toont "opnieuw"). */
export function laadAlsVerzorger() {
    const a = authState();
    if (a.status !== "aan" || !a.gebruiker)
        return Promise.resolve();
    if (verzorgerBezig)
        return verzorgerBezig;
    verzorgerBezig = api("manage-pickups", "mine", {}, { stil: alsVerzorger.geladen })
        .then((r) => zetVerzorger({ toewijzingen: (r.assignments ?? []).map(toewijzingVanServer), hulp: (r.help ?? []).map(hulpVanServer), kinderen: r.children ?? {}, geladen: true, fout: null, voor: a.gebruiker.id }))
        .catch((e) => { if (alsVerzorger.voor !== a.gebruiker.id || !alsVerzorger.geladen)
        zetVerzorger({ fout: e, voor: a.gebruiker.id });
    else
        meldFout(e); })
        .finally(() => { verzorgerBezig = null; });
    return verzorgerBezig;
}
export function useAlsVerzorger() {
    return useSyncExternalStore((l) => { koppel(); verzorgerLuisteraars.add(l); return () => verzorgerLuisteraars.delete(l); }, () => alsVerzorger, () => leegVerzorger);
}
export const alsVerzorgerState = () => alsVerzorger;
export const zetAlsVerzorger = zetVerzorger;
const vervangVerzorger = (a) => zetVerzorger({ toewijzingen: alsVerzorger.toewijzingen.map((x) => (x.id === a.id ? { ...x, ...a, mee: a.mee?.length ? a.mee : x.mee, checkins: x.checkins } : x)) });
async function verzorgerActie(id, actie, velden, optimistischVeld) {
    const vorig = alsVerzorger.toewijzingen;
    if (optimistischVeld)
        zetVerzorger({ toewijzingen: vorig.map((x) => (x.id === id ? { ...x, ...optimistischVeld } : x)) });
    try {
        const r = await api("manage-pickups", actie, { id, ...velden });
        vervangVerzorger(toewijzingVanServer(r.assignment));
        return true;
    }
    catch (e) {
        zetVerzorger({ toewijzingen: vorig });
        meldFout(e);
        if (e?.code === "NOT_OPEN" || e?.code === "NOT_FOUND")
            laadAlsVerzorger();
        return false;
    }
}
/** Kringlid: "Ik regel dit" (accept) of "Kan niet" (decline, met optionele reden). */
export const reageerOphalen = (id, antwoord, reden) => verzorgerActie(id, "respond", { answer: antwoord, ...(antwoord === "decline" && reden ? { reason: reden } : {}) }, { status: antwoord === "accept" ? "accepted" : "declined", reden: reden ?? "" });
export const meldOnderwegKring = (id) => verzorgerActie(id, "on-the-way", {}, { onderwegOp: new Date().toISOString() });
export const meldAangekomenKring = (id) => verzorgerActie(id, "arrived", {}, { aangekomenOp: new Date().toISOString() });
/** Kringlid: een spul van de paklijst afvinken. */
export function toggleIngepakt(id, item) {
    const a = alsVerzorger.toewijzingen.find((x) => x.id === id);
    if (!a)
        return Promise.resolve(false);
    const aan = !a.ingepakt.includes(item);
    return verzorgerActie(id, "packed", { item, packed: aan }, { ingepakt: aan ? [...a.ingepakt, item] : a.ingepakt.filter((x) => x !== item) });
}
/* ---------- rol: alleen kringlid? ---------- */
let rol = { voor: null, rol: null };
const rolLuisteraars = new Set();
let rolBezig = null;
/** Vraagt de server of dit account alleen kringlid is (geen eigen kinderen of gekoppelde ouder). */
export function laadRol(opnieuw = false) {
    const a = authState();
    if (a.status !== "aan" || !a.gebruiker)
        return Promise.resolve(null);
    if (!opnieuw && rol.voor === a.gebruiker.id)
        return Promise.resolve(rol.rol);
    if (rolBezig)
        return rolBezig;
    const id = a.gebruiker.id;
    rolBezig = api("manage-caregivers", "role", {}, { stil: true })
        .then((r) => r.role === "caregiver" ? "verzorger" : "ouder", () => "ouder")
        .then((w) => { rol = { voor: id, rol: w }; rolLuisteraars.forEach((l) => l()); return w; })
        .finally(() => { rolBezig = null; });
    return rolBezig;
}
export function useRol() {
    return useSyncExternalStore((l) => { koppel(); rolLuisteraars.add(l); return () => rolLuisteraars.delete(l); }, () => rol, () => rol);
}
/* ---------- oud: lokale paklijst op Home (index.jsx, slimme-hulp) ---------- */
/** Alleen op dit apparaat; de echte paklijst staat in overdracht-store (manage-handover). */
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
        return t("common.deAndereOuder");
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
/** Generiek: wie mag dit moment regelen? Kringleden met de app: actieve, bevestigde toegang tot wisselmomenten of agenda van álle betrokken kinderen (zelfde regel als de server). */
export function kandidatenVoor(m, kindIds = m.kindIds) {
    return state.personen.filter((p) => isActief(p) && p.uitgenodigd !== false && p.bevestigd !== false && kindIds.every((k) => niveau(p, k, "wissel") !== "geen" || niveau(p, k, "agenda") !== "geen"));
}
/** Is dit id een ouder (ik of een gekoppelde andere ouder)? */
const isOuder = (id) => isIk(id) || (!!id && (gezinState().coOuders ?? []).some((c) => c.id === id));
/** Wie regelt dit — met bevestigingsstatus. Kiezen is nooit automatisch akkoord van een kringlid. */
export function regelStatus(momentId, kindId) {
    const a = toewijzingVoor(momentId, kindId);
    if (!a)
        return null;
    const basis = { wie: a.wie, wieSoort: a.wieSoort, status: a.status, id: a.id, reden: a.reden, toewijzing: a };
    if (a.wieSoort === "parent")
        return { ...basis, tekst: isIk(a.wie) ? t("lib.kringStore.regel.jij") : t("lib.kringStore.regel.andereOuder"), bevestigd: true };
    const naam = wieNaam(a.wie) === t("lib.kringStore.onbekend") ? a.wieNaam || t("lib.kringStore.onbekend") : wieNaam(a.wie);
    if (a.wieSoort === "contact")
        return { ...basis, tekst: t("lib.kringStore.regel.geregistreerd", { naam }), bevestigd: false };
    if (a.status === "declined")
        return { ...basis, tekst: a.reden ? t("lib.kringStore.regel.kanNietReden", { naam, reden: a.reden }) : t("lib.kringStore.regel.kanNiet", { naam }), bevestigd: false };
    if (a.aangekomenOp)
        return { ...basis, tekst: t("lib.kringStore.regel.isEr", { naam }), bevestigd: true };
    if (a.status === "accepted")
        return { ...basis, tekst: a.onderwegOp ? t("lib.kringStore.regel.onderweg", { naam }) : t("lib.kringStore.regel.bevestigd", { naam }), bevestigd: true };
    return { ...basis, tekst: t("lib.kringStore.regel.gevraagd", { naam }), bevestigd: false };
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
