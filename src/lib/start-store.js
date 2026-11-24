import i18n from "@/i18n";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { api, foutTekst } from "@/lib/api";
import { auth, authState, opAuth } from "@/lib/auth-store";
/** Zachte kleuren per kind (uit het iconenpalet). Zelf aan te passen in het kindprofiel. */
const NS = "lib.startStore";
/** Item met een vertaalde naam (en eventueel uitleg), opgezocht bij het lezen. */
const metNaam = (groep, item, uitleg = false) => Object.defineProperties({ ...item }, {
    naam: { enumerable: true, get: () => i18n.t(`${NS}.${groep}.${item.id}.naam`) },
    ...(uitleg ? { uitleg: { enumerable: true, get: () => i18n.t(`${NS}.${groep}.${item.id}.uitleg`) } } : {}),
});
export const kindKleuren = [
    { id: "oudroze", hex: "#C77D8C" },
    { id: "stoffig-blauw", hex: "#5A80A8" },
    { id: "oker", hex: "#C99A3C" },
    { id: "zeegroen", hex: "#3F8A80" },
    { id: "pruim", hex: "#875A86" },
    { id: "terracotta", hex: "#C46A4C" },
].map((k) => metNaam("kindKleur", k));
/** Standaardkleur voor een kind op plek i (wisselt af over het palet). */
export const standaardKindKleur = (i) => kindKleuren[i % kindKleuren.length].hex;
/** Leeftijd uit de geboortedatum: maanden onder 1 jaar, jaren daarna. Geen datum → null (niets verzinnen). */
export function leeftijdTekst(geboortedatum, nu = new Date()) {
    if (!geboortedatum)
        return null;
    const geb = new Date(geboortedatum);
    if (Number.isNaN(geb.getTime()) || geb > nu)
        return null;
    let jaren = nu.getFullYear() - geb.getFullYear();
    let maanden = nu.getMonth() - geb.getMonth();
    if (nu.getDate() < geb.getDate())
        maanden -= 1;
    if (maanden < 0) {
        jaren -= 1;
        maanden += 12;
    }
    if (jaren < 1) {
        const totaal = Math.max(1, jaren * 12 + maanden);
        return i18n.t(`${NS}.leeftijd.maanden`, { count: totaal });
    }
    return i18n.t(`${NS}.leeftijd.jaren`, { count: jaren });
}
export const gezagKeuzes = ["gezamenlijk", "een-ouder", "anders", "onbekend"].map((id) => metNaam("gezag", { id }));
/** Basis klaar = naam, kind, verdeling en gezag. Uitnodigen is optioneel en telt niet mee. */
export function basisStappen(s) {
    return [
        { klaar: !!s.naam, label: i18n.t(`${NS}.basis.naam`) },
        { klaar: s.kinderen.length > 0, label: i18n.t(`${NS}.basis.kind`) },
        { klaar: !!s.regeling, label: i18n.t(`${NS}.basis.regeling`) },
        { klaar: !!s.gezag, label: i18n.t(`${NS}.basis.gezag`) },
    ];
}
export const kostenWijzen = ["alleen", "50", "eigen", "per-uitgave"].map((id) => metNaam("kostenWijze", { id }, true));
export const kostenMomenten = ["direct", "week", "maand", "kwartaal", "zelf"].map((id) => metNaam("kostenMoment", { id }));
/** Percentage voor jou bij een nieuwe uitgave; null = alleen bijgehouden. */
export function standaardPct(a) {
    return a.wijze === "alleen" ? null : a.wijze === "50" ? 50 : a.wijze === "eigen" ? a.pctIk : 50;
}
/**
 * Eigen gezin. Phase 1: naam/beeld/gebruik (profiel), kinderen, regeling, gezag, uitgenodigd en
 * de voorkeuren (voortgangVerborgen, afspraakToegevoegd) komen van de server (manage-profile,
 * manage-children, accept-invitation); deze store is daarvan de lokale spiegel (cache in
 * localStorage, per gebruiker). Kosten en de kostenafspraak staan op de server (kosten-store / manage-expenses).
 * Wijzigingen zijn optimistisch: meteen zichtbaar, bij een serverfout teruggedraaid met een melding.
 */
const SLEUTEL = "onzeapp-eigen-start";
const leeg = { gezag: null, eigen: false, naam: "", gebruik: "samen", kinderen: [], regeling: null, uitgenodigd: false, afspraakToegevoegd: false, voortgangVerborgen: false, onderwerpen: [], uitnodigingen: [], coOuders: [], gebruikerId: null, geladenVoor: null };
let state = leeg;
let geladen = false;
const luisteraars = new Set();
function laad() {
    if (geladen || typeof window === "undefined")
        return;
    geladen = true;
    try {
        const r = localStorage.getItem(SLEUTEL);
        if (r)
            state = { ...leeg, ...JSON.parse(r) };
    }
    catch { /* geen opslag */ }
    koppelAanAccount();
}
function zet(p) {
    state = { ...state, ...p };
    try {
        localStorage.setItem(SLEUTEL, JSON.stringify(state));
    }
    catch { /* geen opslag */ }
    luisteraars.forEach((l) => l());
}
/** Huidige start-state zonder hook (voor andere stores). */
export function startState() {
    laad();
    return state;
}
export function useStart() {
    return useSyncExternalStore((l) => { laad(); luisteraars.add(l); queueMicrotask(l); return () => luisteraars.delete(l); }, () => { laad(); return state; }, () => leeg);
}
/* ---------- server ↔ store ---------- */
const OPEN_UITNODIGING = ["sent", "pending", "viewed"];
export const gebruikNaarServer = (g) => (g === "zelf" || g === "alleen" ? "solo" : "together");
export const gebruikVanServer = (u) => (u === "solo" ? "zelf" : "samen");
/** Server-kind → vorm die de app al gebruikt ({ id, naam, geboortedatum, kleur, beeld, schoolRegio }). */
export function kindVanServer(c, i = 0) {
    return { id: c.id, naam: c.name, geboortedatum: c.date_of_birth || undefined, kleur: c.color_code || standaardKindKleur(i), beeld: c.avatar || undefined, schoolRegio: c.profile?.school?.regio || undefined, profiel: c.profile ?? {}, kanBewerken: c.can_edit !== false, ouders: c.linked_parents ?? [] };
}
/** Regeling en gezag staan per kind op de server; het eigen gezin toont één gezamenlijke waarde. */
/**
 * "ik"/"ander" in de dagen zijn vanuit wie de regeling opsloeg (`ikId`). Voor de andere ouder wordt
 * dat omgedraaid, zodat "bij jou" voor beide ouders klopt.
 */
export function regelingVanServer(kinderen, mijnId) {
    const cs = kinderen.find((c) => c.care_schedule)?.care_schedule;
    if (!cs)
        return null;
    if (cs.later)
        return "later";
    const { ikId, ...r } = cs;
    const omdraaien = ikId && mijnId && ikId !== mijnId && Array.isArray(r.dagen);
    return { ...r, patroon: r.patroon ?? r.patroonId, ...(omdraaien ? { dagen: r.dagen.map((d) => (d === "ik" ? "ander" : d === "ander" ? "ik" : d)) } : {}) };
}
/** custody_meta.ingevuldDoor is het profiel-id van wie het invulde; de app toont een naam. */
export function gezagVanServer(kinderen, mij) {
    const c = kinderen.find((x) => x.custody);
    if (!c)
        return null;
    const door = c.custody_meta?.ingevuldDoor ?? "";
    const naam = !door ? "" : mij && door === mij.id ? mij.name || i18n.t(`${NS}.jij`) : (c.linked_parents ?? []).find((p) => p.id === door)?.name ?? (/^[0-9a-f-]{36}$/i.test(door) ? "" : door);
    return { situatie: c.custody, ingevuldDoor: naam, bevestigdDoorAnder: !!c.custody_meta?.bevestigdDoorAnder };
}
export const isUitgenodigd = (uitnodigingen, coOuders) => coOuders.length > 0 || uitnodigingen.some((u) => OPEN_UITNODIGING.includes(u.status) && new Date(u.expires_at) > new Date());
function profielVan(g) {
    const v = g.preferences ?? {};
    return { eigen: true, gebruikerId: g.id, naam: g.name ?? "", beeld: g.avatar || undefined, gebruik: gebruikVanServer(g.usage_mode), voortgangVerborgen: !!v.voortgangVerborgen, afspraakToegevoegd: !!v.afspraakToegevoegd };
}
let hydratieVoor = null;
let afmelden = null;
/** Volgt het account: na inloggen/verversen profiel overnemen en gezinsgegevens van de server halen. */
function koppelAanAccount() {
    if (afmelden)
        return;
    afmelden = opAuth(() => volgAccount(authState()));
    // Niet tijdens het renderen bijwerken: pas na de huidige taak.
    queueMicrotask(() => volgAccount(authState()));
}
function volgAccount(a) {
    const g = a.gebruiker;
    if (!g || (a.status !== "aan" && a.status !== "onboarding")) {
        hydratieVoor = null;
        return;
    }
    // Ander account dan de cache op dit apparaat: lokale gezinsdata hoort daar niet bij.
    const ander = state.gebruikerId && state.gebruikerId !== g.id;
    const p = profielVan(g);
    if (ander)
        zet({ ...leeg, ...p });
    else if (Object.entries(p).some(([k, v]) => state[k] !== v))
        zet(p);
    if (hydratieVoor !== g.id) {
        hydratieVoor = g.id;
        start.hydrateer();
    }
}
async function haalGezin() {
    const [kids, sent, conn] = await Promise.allSettled([api("manage-children", "list"), api("accept-invitation", "list-sent"), api("accept-invitation", "list-connected")]);
    const p = {};
    if (kids.status === "fulfilled") {
        const lijst = kids.value.children ?? [];
        const concept = authState().gebruiker?.preferences?.regelingConcept;
        // Regeling gekozen vóór er een kind was: staat tijdelijk in de profielvoorkeuren.
        const regeling = regelingVanServer(lijst, authState().gebruiker?.id) ?? (concept ? regelingVanServer([{ care_schedule: concept }], authState().gebruiker?.id) : null);
        Object.assign(p, { kinderen: lijst.map(kindVanServer), regeling, gezag: gezagVanServer(lijst, authState().gebruiker) });
    }
    const uitnodigingen = sent.status === "fulfilled" ? sent.value.invitations ?? [] : state.uitnodigingen;
    const coOuders = conn.status === "fulfilled" ? conn.value.co_parents ?? [] : state.coOuders;
    Object.assign(p, { uitnodigingen, coOuders, uitgenodigd: isUitgenodigd(uitnodigingen, coOuders) });
    const fout = [kids, sent, conn].find((x) => x.status === "rejected");
    return { p, fout: fout?.reason };
}
function meldFout(e) {
    if (e?.code === "UNAUTHORIZED")
        return;
    toast.error(foutTekst(e), { id: "start-fout" });
}
/** Optimistisch: patch meteen tonen; mislukt de serveraanroep, dan precies die velden terugzetten. */
async function optimistisch(patch, aanroep) {
    const vorig = Object.fromEntries(Object.keys(patch).map((k) => [k, state[k]]));
    zet(patch);
    try {
        return await aanroep();
    }
    catch (e) {
        zet(vorig);
        meldFout(e);
        return undefined;
    }
}
const kindPatch = (id, f) => ({ kinderen: state.kinderen.map((k) => (k.id === id ? { ...k, ...f(k) } : k)) });
const vervangKind = (c) => zet({ kinderen: state.kinderen.map((k, i) => (k.id === c.id ? kindVanServer(c, i) : k)) });
/** Een opgeslagen foto komt terug als tijdelijke https-URL; die is geen nieuwe keuze en gaat niet terug naar de server. */
const isServerFoto = (b) => typeof b === "string" && /^https?:\/\//i.test(b);
const beeldVelden = (b) => (b?.startsWith("data:") ? { image_base64: b } : { avatar: b || null });
const regelingNaarServer = (r) => (r === "later" ? { later: true } : { ...r, patroonId: r.patroon, ikId: authState().gebruiker?.id });
export const start = {
    /** Gezinsgegevens van de server ophalen (na inloggen, na accepteren, of handmatig verversen). */
    hydrateer: async () => {
        const { p, fout } = await haalGezin();
        zet({ ...p, geladenVoor: authState().gebruiker?.id ?? state.gebruikerId });
        if (fout)
            meldFout(fout);
    },
    /** Lokaal opnieuw beginnen (alleen apparaatvelden); profiel komt via auth-store. */
    begin: (naam, gebruik) => {
        zet({ ...leeg, gebruikerId: state.gebruikerId, geladenVoor: state.geladenVoor, kinderen: state.kinderen, eigen: true, naam: naam.trim(), gebruik });
        api("manage-profile", "update", { name: naam.trim(), usage_mode: gebruikNaarServer(gebruik) }).catch(meldFout);
    },
    kindToevoegen: async (naam, geboortedatum, beeld) => {
        const tijdelijk = { id: `tmp-${Date.now()}`, naam: naam.trim(), geboortedatum: geboortedatum || undefined, kleur: standaardKindKleur(state.kinderen.length), beeld };
        zet({ kinderen: [...state.kinderen, tijdelijk] });
        try {
            let { child } = await api("manage-children", "create", { name: tijdelijk.naam, date_of_birth: tijdelijk.geboortedatum ?? null, color_code: tijdelijk.kleur });
            if (beeld && !isServerFoto(beeld))
                child = (await api("manage-children", "set-avatar", { child_id: child.id, ...beeldVelden(beeld) })).child;
            // Eerste kind: een eerder gekozen regeling (profielvoorkeur) komt nu op het kind te staan.
            const concept = authState().gebruiker?.preferences?.regelingConcept;
            if (concept && !child.care_schedule) {
                await api("manage-children", "save-schedule", { child_id: child.id, schedule: concept });
                child = { ...child, care_schedule: concept };
                auth.updateProfile({ preferences: { regelingConcept: null } }).catch(() => { });
            }
            zet({ kinderen: state.kinderen.map((k, i) => (k.id === tijdelijk.id ? kindVanServer(child, i) : k)) });
            return child.id;
        }
        catch (e) {
            zet({ kinderen: state.kinderen.filter((k) => k.id !== tijdelijk.id) });
            meldFout(e);
            return undefined;
        }
    },
    /** Alleen de eigen ouder van dit gezin beheert de kindafbeelding; andere personen hebben hier geen invoer. */
    zetKindBeeld: (id, beeld) => isServerFoto(beeld) ? undefined : optimistisch(kindPatch(id, () => ({ beeld })), async () => {
        const { child } = await api("manage-children", "set-avatar", { child_id: id, ...beeldVelden(beeld) });
        vervangKind(child);
    }),
    zetOuderBeeld: (beeld) => optimistisch({ beeld }, () => auth.setAvatar(beeld)),
    zetKindKleur: (id, kleur) => optimistisch(kindPatch(id, () => ({ kleur })), async () => vervangKind((await api("manage-children", "update", { child_id: id, updates: { color_code: kleur } })).child)),
    zetKindRegio: (id, schoolRegio) => {
        const k = state.kinderen.find((x) => x.id === id);
        const profiel = k?.profiel ?? {};
        return optimistisch(kindPatch(id, () => ({ schoolRegio })), async () => vervangKind((await api("manage-children", "update", { child_id: id, updates: { profile: { school: { ...(profiel.school ?? {}), regio: schoolRegio } } } })).child));
    },
    zetGezag: (situatie) => optimistisch({ gezag: { situatie, ingevuldDoor: state.naam || i18n.t(`${NS}.jij`), bevestigdDoorAnder: false } }, () => api("manage-children", "save-custody", { custody: situatie })),
    regeling: (r) => optimistisch({ regeling: r }, () => {
        if (!r)
            return Promise.resolve();
        // Nog geen kind op de server: bewaar de keuze als profielvoorkeur tot het eerste kind er is.
        if (!state.kinderen.some((k) => !String(k.id).startsWith("tmp-")))
            return auth.updateProfile({ preferences: { regelingConcept: regelingNaarServer(r) } });
        return api("manage-children", "save-schedule", { schedule: regelingNaarServer(r) });
    }),
    zetGebruik: (gebruik) => optimistisch({ gebruik }, () => auth.updateProfile({ usage_mode: gebruikNaarServer(gebruik) })),
    /** Voortgangsvlaggen gaan naar de profielvoorkeuren; `uitgenodigd` volgt uit echte uitnodigingen en wordt hier genegeerd. */
    markeer: (p) => {
        const { uitgenodigd: _genegeerd, ...rest } = p;
        const voorkeuren = Object.fromEntries(Object.entries(rest).filter(([k]) => k === "voortgangVerborgen" || k === "afspraakToegevoegd"));
        const lokaal = Object.fromEntries(Object.entries(rest).filter(([k]) => !(k in voorkeuren)));
        if (Object.keys(lokaal).length)
            zet(lokaal);
        if (Object.keys(voorkeuren).length)
            return optimistisch(voorkeuren, () => auth.updateProfile({ preferences: voorkeuren }));
    },
    /**
     * Onderwerpen (Phase 2): voorbereide onderwerpen zijn server-gesprekken zonder andere ouder
     * (berichten-store / manage-messages); `onderwerpen` hier bevat alleen nog oude apparaat-concepten
     * die berichten-store één keer naar de server overzet. Geeft een Promise met het gesprek-id (of null).
     */
    onderwerpToevoegen: (naam) => import("@/lib/berichten-store").then((m) => m.maakGesprek({ titel: naam })),
    wisOnderwerpen: (ids) => zet({ onderwerpen: (state.onderwerpen ?? []).filter((o) => !ids.includes(o.id)) }),
    /** Uitnodiging naar de andere ouder (e-mail + gekozen kinderen). Gooit ApiFout; de UI toont de code. */
    uitnodigen: async (email, kindIds) => {
        const r = await api("send-invitation", "send", { to_email: email.trim().toLowerCase(), child_ids: kindIds, redirect_origin: typeof window !== "undefined" ? window.location.origin : undefined });
        const uitnodigingen = [r.invitation, ...state.uitnodigingen.filter((u) => u.id !== r.invitation.id)];
        zet({ uitnodigingen, uitgenodigd: isUitgenodigd(uitnodigingen, state.coOuders) });
        return r;
    },
    annuleerUitnodiging: (id) => {
        const uitnodigingen = state.uitnodigingen.map((u) => (u.id === id ? { ...u, status: "revoked" } : u));
        return optimistisch({ uitnodigingen, uitgenodigd: isUitgenodigd(uitnodigingen, state.coOuders) }, () => api("accept-invitation", "cancel", { invitation_id: id }));
    },
    /** Het voorbeeldgezin bestaat niet meer: een aangemeld account is altijd het eigen gezin. */
    naarVoorbeeld: () => { },
    terugNaarEigen: () => zet({ eigen: true }),
};
const I = "ik", A = "ander";
/** 14 dagen, maandag t/m zondag, twee weken. Neutrale startpunten — iedere regeling is gelijkwaardig. */
export const patronen = [
    { id: "om-de-week", dagen: [I, I, I, I, I, I, I, A, A, A, A, A, A, A] },
    { id: "weekenden", dagen: [I, I, I, I, A, A, A, I, I, I, I, I, I, I] },
    { id: "2-2-3", dagen: [I, I, A, A, I, I, I, A, A, I, I, A, A, A] },
    { id: "2-2-5-5", dagen: [I, I, A, A, I, I, I, I, I, A, A, A, A, A] },
    { id: "vaste-dagen", dagen: [I, I, I, A, A, A, A, I, I, I, A, A, A, A] },
    { id: "een-weekend", dagen: [I, I, I, I, I, I, I, I, I, I, I, I, A, A] },
    { id: "wisselend", dagen: null },
    { id: "zelf", dagen: [I, I, I, I, I, I, I, A, A, A, A, A, A, A] },
].map((p) => metNaam("patroon", p, true));
export function maandagVan(d) {
    const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
    return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}
/** Is een opgeslagen regeling bruikbaar? Oudere of onvolledige opslag mag de app nooit laten crashen. */
export function geldigeRegeling(r) {
    const g = r;
    return !!g && Array.isArray(g.dagen) && g.dagen.length === 14 && typeof g.startMaandag === "string" && /^\d{4}-\d{2}-\d{2}$/.test(g.startMaandag);
}
/** Op welke plek is het kind op datum d volgens de eigen regeling? */
export function plekOp(r, d) {
    return r.dagen[dagIndex(r, d)] ?? "ik";
}
const dagIndex = (r, d) => {
    const [j, mm, dd] = (geldigeRegeling(r) ? r.startMaandag : maandagVan(d)).split("-").map(Number);
    const s = new Date(j, mm - 1, dd);
    const n = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - s.getTime()) / 86400000);
    return ((n % 14) + 14) % 14;
};
/** Waar is het kind vandaag, en wanneer is het volgende wisselmoment (eerste dag met een andere plek)? */
export function vandaagVolgens(r, nu) {
    const i = dagIndex(r, nu);
    const plek = r.dagen[i];
    for (let s = 1; s <= 14; s++) {
        const p = r.dagen[(i + s) % 14];
        if (p !== plek) {
            const d = new Date(nu);
            d.setDate(d.getDate() + s);
            return { plek, volgende: d, naar: p };
        }
    }
    const d = new Date(nu);
    d.setDate(d.getDate() + 14);
    return { plek, volgende: d, naar: plek };
}
/** De twee weken vanaf de maandag van deze week (week 0 = deze week), afgeleid van dezelfde regeling — alleen voor weergave. */
export function tweeWekenVanaf(r, nu) {
    const m = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
    return Array.from({ length: 14 }, (_, i) => { const d = new Date(m); d.setDate(m.getDate() + i); return plekOp(r, d); });
}
