import { useSyncExternalStore } from "react";
import i18n from "@/i18n";
import { api } from "@/lib/api";
import { authState } from "@/lib/auth-store";
import { kringState, mag, wieNaam } from "@/lib/kring-store";
import { startState } from "@/lib/start-store";
import { gezinState } from "@/lib/gezin";
import { meldFout, serverBron } from "@/lib/praktisch-sync";
import { verversAudit } from "@/lib/audit-store";
/**
 * Taken en spullen van het eigen gezin — bron: edge function manage-tasks (tabellen tasks, belongings).
 * Taakmodel (ongewijzigd voor de schermen): { id, tekst, kind, wie, overdragenAan, klaar, herhaling, herhalingTekst,
 * deadline, herinnerDagen, contactStatus, berichtId, gesprekId, afspraakId }.
 * - kind: kind-id, of "alle" (meerdere/alle kinderen of het hele gezin)
 * - wie: profiel-id van wie het regelt ("" = nog niemand); overdragenAan: profiel-id van de gevraagde ouder (wacht op antwoord)
 * Iemand anders een taak geven is een verzoek dat die ander eerst accepteert. Elke wijziging komt server-side in de
 * gezinsgeschiedenis (daarom roept deze store `leg` niet aan).
 * Spullen: { id, naam, kind, type: mee|vast|dubbel|terug, plek (profiel-id of vrije tekst), wie, klaar, gedeeld }.
 * Privé of gedeeld: `gedeeld` (er is een andere ouder aan wie het item gericht is, `anderId`); nieuw = standaard privé
 * vanuit de schermen, behalve een taak die je aan de andere ouder vraagt (die is altijd gedeeld).
 * extraMee/weg (aanpassingen per wisselmoment) horen bij de paklijst van de overdracht (domein agenda) en blijven lokaal.
 */
export const contactStatusLabel = {
    get "nog-te-regelen"() { return i18n.t("lib.takenStore.contactStatus.nogTeRegelen"); },
    get "contact-opgenomen"() { return i18n.t("lib.takenStore.contactStatus.contactOpgenomen"); },
    get "wacht-op-reactie"() { return i18n.t("lib.takenStore.contactStatus.wachtOpReactie"); },
    get afgerond() { return i18n.t("lib.takenStore.contactStatus.afgerond"); },
    get "niet-mogelijk"() { return i18n.t("lib.takenStore.contactStatus.nietMogelijk"); },
};
const leegState = () => ({ taken: [], spullen: [], extraMee: {}, weg: {}, geladen: false });
let state = leegState();
const listeners = new Set();
const zet = (p) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
/* ---------- server ↔ store ---------- */
const mijnId = () => authState().gebruiker?.id ?? "";
const zonderSessie = () => !authState().gebruiker;
const anderId = () => gezinState().ander?.id ?? "";
/** Oude aanroepers geven nog "sanne"/"joris": vertaal naar profiel-id's. */
const persoonId = (w) => (w === "sanne" ? mijnId() : w === "joris" ? anderId() : w || "");
const kindVan = (ids) => (ids?.length === 1 ? ids[0] : "alle");
const kindIds = (kind) => {
    if (!kind || kind === "alle" || kind === "beide")
        return startState().kinderen.map((k) => k.id);
    return [kind];
};
export function taakVanServer(r) {
    return {
        id: r.id, tekst: r.title, kind: kindVan(r.child_ids), kindIds: r.child_ids ?? [], wie: r.assignee_id ?? "", ...(r.requested_to ? { overdragenAan: r.requested_to, gevraagdDoor: r.requested_by } : {}),
        klaar: !!r.is_completed, herhaling: r.recurrence || "eenmalig", ...(r.recurrence_text ? { herhalingTekst: r.recurrence_text } : {}),
        ...(r.deadline ? { deadline: r.deadline } : {}), ...(r.reminder_days ? { herinnerDagen: r.reminder_days } : {}), ...(r.contact_status ? { contactStatus: r.contact_status } : {}),
        ...(r.source?.bericht_id ? { berichtId: r.source.bericht_id } : {}), ...(r.source?.gesprek_id ? { gesprekId: r.source.gesprek_id } : {}), ...(r.source?.afspraak_id ? { afspraakId: r.source.afspraak_id } : {}),
        door: r.created_by, gedeeld: !!r.other_parent_id, anderId: r.other_parent_id ?? null,
    };
}
export function spulVanServer(r) {
    return { id: r.id, naam: r.name, kind: r.child_id, type: r.item_type, ...(r.location_parent_id || r.location_text ? { plek: r.location_parent_id ?? r.location_text } : {}), ...(r.responsible_id ? { wie: r.responsible_id } : {}), klaar: !!r.is_done, door: r.created_by, gedeeld: !!r.other_parent_id, anderId: r.other_parent_id ?? null };
}
const sync = serverBron({
    laad: async () => {
        const r = await api("manage-tasks", "list");
        zet({ taken: (r.tasks ?? []).map(taakVanServer), spullen: (r.belongings ?? []).map(spulVanServer), geladen: true });
    },
    wis: () => { tijdelijk.clear(); onderweg.clear(); zet(leegState()); },
});
/** Laadstatus voor de schermen (useStatus / ververs). */
export const takenBron = sync;
export const takenState = () => { sync.zorg(); return state; };
export function useTaken() {
    sync.zorg();
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
/** Tijdelijke id (optimistisch) → echte server-id, zodat aanroepers met de teruggegeven id kunnen blijven werken. */
const tijdelijk = new Map();
/** Tijdelijke id → promise met de echte id (of null als aanmaken mislukte), zolang het aanmaken loopt. */
const onderweg = new Map();
const echt = (id) => tijdelijk.get(id) ?? id;
/** Wacht zo nodig tot een optimistisch item echt is aangemaakt; geeft de server-id of null. */
async function serverId(id) {
    const e = echt(id);
    if (!e.startsWith("tmp-"))
        return e;
    return (await onderweg.get(e)) ?? null;
}
const vervangTaak = (id, r) => zet({ taken: state.taken.map((x) => (x.id === id ? taakVanServer(r) : x)) });
/** Optimistisch bijwerken, dan de server. Geeft (async) true bij succes; bij een fout terugdraaien + melding. */
async function taakActie(id, actie, body, optimistischPatch) {
    const vorig = state.taken.find((x) => x.id === id || x.id === echt(id));
    if (!vorig)
        return false;
    if (optimistischPatch)
        zet({ taken: state.taken.map((x) => (x === vorig ? { ...x, ...optimistischPatch(x) } : x)) });
    // Zonder sessie (alleen tests): lokaal blijven, zoals voorheen.
    if (zonderSessie())
        return true;
    try {
        // Nog niet opgeslagen (net toegevoegd)? Eerst het aanmaken afwachten, dan pas de actie.
        const echteId = await serverId(vorig.id);
        if (!echteId)
            return false; // aanmaken mislukte: die fout is al gemeld en het item is al weg
        const r = await api("manage-tasks", actie, { task_id: echteId, ...body });
        vervangTaak(state.taken.some((x) => x.id === vorig.id) ? vorig.id : echteId, r.task);
        verversAudit();
        return true;
    }
    catch (e) {
        zet({ taken: state.taken.map((x) => (x.id === vorig.id || x.id === echt(vorig.id) ? vorig : x)) });
        meldFout(e, "taken-fout");
        return false;
    }
}
/* ---------- namen en lijsten ---------- */
/** Namen van betrokken kinderen (eigen gezin, server-kinderen). */
export const kindNaam = (k) => {
    const kids = startState().kinderen;
    if (!k || k === "alle" || k === "beide")
        return kids.map((x) => x.naam);
    const eigen = kids.find((x) => x.id === k);
    return [eigen ? eigen.naam : k];
};
/** Taken van het eigen gezin (alles wat de server teruggeeft hoort bij het gezin). */
export const eigenTaken = () => state.taken;
/** Spullen van het eigen gezin. */
export const eigenSpullen = () => state.spullen;
/** Wie mag een taak krijgen? Jij en de gekoppelde andere ouder (kringleden krijgen een hulpverzoek, geen taak). */
export function taakKandidaten() {
    const g = gezinState();
    return [
        ...(g.ik ? [{ id: g.ik.id, naam: i18n.t("common.jij") }] : []),
        ...(g.ander ? [{ id: g.ander.id, naam: g.ander.naam || i18n.t("common.deAndereOuder") }] : []),
    ];
}
/** Naam voor een profiel-id: jij / de andere ouder (naam). */
export function ouderNaam(id) {
    if (!id)
        return "";
    if (id === mijnId())
        return i18n.t("common.jij");
    const a = gezinState().ander;
    if (a && a.id === id)
        return a.naam || i18n.t("common.deAndereOuder");
    return wieNaam(id);
}
export const taakWieTekst = (wie) => (wie && wie === mijnId() ? i18n.t("lib.takenStore.wie.jij") : wie ? i18n.t("lib.takenStore.wie.ander", { naam: ouderNaam(wie) }) : i18n.t("lib.takenStore.wie.niemand"));
/* ---------- taken: acties ---------- */
/**
 * Nieuwe taak. Geeft meteen een (tijdelijke) id terug; de server-id wordt daarna overal gebruikt.
 * `wie` = mijn id (of "sanne") → ik regel het; `overdragenAan` = de andere ouder → verzoek; anders nog niemand.
 */
export function voegTaakToe(t) {
    return maakTaakAan(t).id;
}
/** Als voegTaakToe, maar wacht op de server: geeft de opgeslagen taak terug, of null bij een fout (al gemeld). */
export async function maakTaak(t) {
    const { id, klaar } = maakTaakAan(t);
    const echteId = await klaar;
    return echteId ? state.taken.find((x) => x.id === echteId) ?? state.taken.find((x) => x.id === id) ?? null : null;
}
/**
 * Delen: `gedeeld` (true/false; weggelaten = serverstandaard) en `anderId` (alleen zonder kind, bij meerdere andere
 * ouders). Een taak die je aan de andere ouder vraagt, is altijd gedeeld.
 */
function maakTaakAan(t) {
    const bestaand = t.berichtId ? state.taken.find((x) => x.berichtId === t.berichtId && x.gesprekId === t.gesprekId) : undefined;
    if (bestaand)
        return { id: bestaand.id, klaar: Promise.resolve(echt(bestaand.id)) };
    if (zonderSessie()) {
        // Alleen in tests (geen ingelogde ouder): lokaal en met de rollen zoals aangeleverd.
        const id = `t${Date.now()}-${state.taken.length}`;
        zet({ taken: [{ ...t, id, klaar: false }, ...state.taken] });
        return { id, klaar: Promise.resolve(id) };
    }
    const ik = mijnId();
    const wie = persoonId(t.wie);
    const naar = persoonId(t.overdragenAan);
    const assign = naar && naar !== ik ? "other" : wie && wie === ik ? "me" : naar === ik ? "me" : "none";
    const id = `tmp-${Date.now().toString(36)}-${state.taken.length}`;
    const gedeeld = assign === "other" ? true : t.gedeeld;
    const lokaal = { ...t, id, wie: assign === "me" ? ik : "", ...(assign === "other" ? { overdragenAan: naar, gevraagdDoor: ik } : { overdragenAan: undefined }), klaar: false, herhaling: t.herhaling ?? "eenmalig", gedeeld: gedeeld !== false, door: ik };
    zet({ taken: [lokaal, ...state.taken] });
    const body = {
        title: t.tekst, child_ids: kindIds(t.kind), assign, deadline: t.deadline || null, recurrence: t.herhaling ?? "eenmalig",
        recurrence_text: t.herhalingTekst ?? null, reminder_days: t.herinnerDagen ?? 0, contact_status: t.contactStatus ?? null,
        source: { bericht_id: t.berichtId, gesprek_id: t.gesprekId, afspraak_id: t.afspraakId },
        ...(typeof gedeeld === "boolean" ? { shared: gedeeld } : {}),
        ...(gedeeld !== false && t.anderId ? { other_parent_id: t.anderId } : {}),
    };
    const klaar = api("manage-tasks", "create", body).then((r) => {
        tijdelijk.set(id, r.task.id);
        const echteTaak = taakVanServer(r.task);
        zet({ taken: [echteTaak, ...state.taken.filter((x) => x.id !== id && x.id !== r.task.id)] });
        verversAudit();
        return r.task.id;
    }).catch((e) => {
        zet({ taken: state.taken.filter((x) => x.id !== id) });
        meldFout(e, "taken-fout");
        return null;
    }).finally(() => onderweg.delete(id));
    onderweg.set(id, klaar);
    return { id, klaar };
}
export function toggleTaak(id) {
    const t = state.taken.find((x) => x.id === id || x.id === echt(id));
    if (!t || t.overdragenAan)
        return Promise.resolve(false);
    const klaar = !t.klaar;
    return taakActie(t.id, "toggle", { done: klaar }, () => ({ klaar, ...(t.contactStatus ? { contactStatus: klaar ? "afgerond" : "nog-te-regelen" } : {}) }));
}
/** Werk de contactstatus van een taak bij; "afgerond" zet de taak ook op klaar. */
export function zetContactStatus(id, contactStatus) {
    const t = state.taken.find((x) => x.id === id || x.id === echt(id));
    if (!t || t.overdragenAan)
        return Promise.resolve(false);
    return taakActie(t.id, "set-contact-status", { contact_status: contactStatus }, () => ({ contactStatus, klaar: contactStatus === "afgerond" }));
}
/** Overdragen aan de andere ouder is een verzoek dat die eerst accepteert; naar jezelf = "Ik doe het". */
export function vraagOverdracht(id, aan) {
    const naar = persoonId(aan);
    if (!naar || naar === mijnId())
        return neemTaakOp(id);
    return taakActie(id, "request", {}, () => ({ overdragenAan: naar, gevraagdDoor: mijnId() }));
}
/** Alleen wie het vroeg trekt het verzoek in. */
export const annuleerOverdracht = (id) => taakActie(id, "cancel-request", {}, () => ({ overdragenAan: undefined, gevraagdDoor: undefined }));
/** De gevraagde ouder antwoordt: accepteren (wordt van mij) of liever niet (blijft open). */
export const accepteerOverdracht = (id) => taakActie(id, "respond-request", { accept: true }, () => ({ wie: mijnId(), overdragenAan: undefined, gevraagdDoor: undefined }));
export const weigerOverdracht = (id) => taakActie(id, "respond-request", { accept: false }, () => ({ overdragenAan: undefined, gevraagdDoor: undefined }));
/** "Ik doe het": jij wordt verantwoordelijk voor een taak die nog bij niemand lag. */
export const neemTaakOp = (id) => taakActie(id, "claim", {}, () => ({ wie: mijnId(), overdragenAan: undefined, gevraagdDoor: undefined }));
/** Wacht dit verzoek op mijn antwoord? */
export const vraagAanMij = (t) => !!t.overdragenAan && t.overdragenAan === mijnId();
/** Alleen wie de taak maakte, mag hem wijzigen, delen of verwijderen. Lokale (test)taken zonder maker ook. */
export const magTaakWijzigen = (t) => !!t && !t.lokaal && (!t.door || t.door === mijnId());
/**
 * Taak wijzigen: { tekst, kind, deadline ("" = geen), herhaling, herhalingTekst, herinnerDagen, gedeeld, anderId }.
 * Optimistisch; geeft (async) true bij succes.
 */
export function wijzigTaak(id, w) {
    const body = {};
    const patch = {};
    if (w.tekst !== undefined) { body.title = w.tekst; patch.tekst = w.tekst; }
    if (w.kind !== undefined) { body.child_ids = kindIds(w.kind); patch.kind = w.kind; patch.kindIds = body.child_ids; }
    if (w.deadline !== undefined) { body.deadline = w.deadline || null; patch.deadline = w.deadline || undefined; }
    if (w.herhaling !== undefined) { body.recurrence = w.herhaling; body.recurrence_text = w.herhaling === "aangepast" ? w.herhalingTekst ?? null : null; patch.herhaling = w.herhaling; patch.herhalingTekst = w.herhaling === "aangepast" ? w.herhalingTekst : undefined; }
    if (w.herinnerDagen !== undefined) { body.reminder_days = w.herinnerDagen || 0; patch.herinnerDagen = w.herinnerDagen || undefined; }
    if (typeof w.gedeeld === "boolean") { body.shared = w.gedeeld; patch.gedeeld = w.gedeeld; if (w.gedeeld && w.anderId) body.other_parent_id = w.anderId; }
    return taakActie(id, "update", body, () => patch);
}
/** Verwijderen (alleen de maker). Optimistisch weg; geeft (async) true bij succes. Ongedaan maken: herstelTaak. */
export async function verwijderTaak(id) {
    const vorig = state.taken.find((x) => x.id === id || x.id === echt(id));
    if (!vorig)
        return false;
    const plek = state.taken.indexOf(vorig);
    zet({ taken: state.taken.filter((x) => x !== vorig) });
    if (zonderSessie())
        return true;
    try {
        const echteId = await serverId(vorig.id);
        if (!echteId)
            return false;
        await api("manage-tasks", "delete", { task_id: echteId });
        verversAudit();
        return true;
    }
    catch (e) {
        const l = state.taken.filter((x) => x.id !== vorig.id);
        l.splice(Math.min(plek, l.length), 0, vorig);
        zet({ taken: l });
        meldFout(e, "taken-fout");
        return false;
    }
}
/** Ongedaan maken van verwijderTaak. */
export async function herstelTaak(id) {
    const echteId = echt(id);
    try {
        const r = await api("manage-tasks", "restore", { task_id: echteId });
        zet({ taken: [taakVanServer(r.task), ...state.taken.filter((x) => x.id !== r.task.id)] });
        verversAudit();
        return true;
    }
    catch (e) {
        meldFout(e, "taken-fout");
        return false;
    }
}
/* ---------- spullen ---------- */
const plekNaarServer = (plek) => {
    if (plek === undefined)
        return undefined;
    if (!plek)
        return null;
    const id = persoonId(plek);
    return /^[0-9a-f-]{36}$/i.test(id) ? { parent_id: id } : { text: plek };
};
async function spulActie(id, body, patch) {
    const vorig = state.spullen.find((x) => x.id === id || x.id === echt(id));
    if (!vorig)
        return false;
    zet({ spullen: state.spullen.map((x) => (x === vorig ? { ...x, ...patch } : x)) });
    if (zonderSessie())
        return true;
    try {
        const echteId = await serverId(vorig.id);
        if (!echteId)
            return false;
        const r = await api("manage-tasks", "belonging-update", { belonging_id: echteId, ...body });
        zet({ spullen: state.spullen.map((x) => (x.id === vorig.id || x.id === echteId ? spulVanServer(r.belonging) : x)) });
        verversAudit();
        return true;
    }
    catch (e) {
        zet({ spullen: state.spullen.map((x) => (x.id === vorig.id || x.id === echt(vorig.id) ? vorig : x)) });
        meldFout(e, "spullen-fout");
        return false;
    }
}
export function zetSpul(id, p) {
    const body = {};
    if (p.naam !== undefined)
        body.name = p.naam;
    if (p.type !== undefined)
        body.item_type = p.type;
    if (p.plek !== undefined)
        body.location = plekNaarServer(p.plek);
    if (p.klaar !== undefined)
        body.is_done = p.klaar;
    if (typeof p.gedeeld === "boolean")
        body.shared = p.gedeeld;
    const patch = { ...p, ...(p.plek !== undefined ? { plek: persoonId(p.plek) } : {}) };
    return spulActie(id, body, patch);
}
/** Alleen wie het toevoegde (of de andere ouder bij een gedeeld spul) mag het verwijderen. */
export const magSpulVerwijderen = (s) => !!s && (!s.door || s.door === mijnId() || s.anderId === mijnId());
/** Verwijderen; optimistisch weg. Geeft (async) true bij succes. Ongedaan maken: herstelSpul. */
export async function verwijderSpul(id) {
    const vorig = state.spullen.find((x) => x.id === id || x.id === echt(id));
    if (!vorig)
        return false;
    zet({ spullen: state.spullen.filter((x) => x !== vorig) });
    if (zonderSessie())
        return true;
    try {
        const echteId = await serverId(vorig.id);
        if (!echteId)
            return false;
        await api("manage-tasks", "belonging-delete", { belonging_id: echteId });
        verversAudit();
        return true;
    }
    catch (e) {
        zet({ spullen: [...state.spullen.filter((x) => x.id !== vorig.id), vorig] });
        meldFout(e, "spullen-fout");
        return false;
    }
}
export async function herstelSpul(id) {
    try {
        const r = await api("manage-tasks", "belonging-restore", { belonging_id: echt(id) });
        zet({ spullen: [...state.spullen.filter((x) => x.id !== r.belonging.id), spulVanServer(r.belonging)] });
        verversAudit();
        return true;
    }
    catch (e) {
        meldFout(e, "spullen-fout");
        return false;
    }
}
/** "Ik regel dit": één spul, één verantwoordelijke — hetzelfde model als bij taken (altijd jijzelf). */
export function regelSpul(id) {
    return spulActie(id, { responsible: "me" }, { wie: mijnId() });
}
/** Nieuw spul; `gedeeld` (true/false) bepaalt "Alleen jij" / "Gedeeld". Geeft meteen een (tijdelijke) id. */
export function voegSpulToe(s) {
    return maakSpulAan(s).id;
}
/** Als voegSpulToe, maar wacht op de server: geeft true bij succes (een fout is dan al gemeld). */
export async function maakSpul(s) {
    return !!(await maakSpulAan(s).klaar);
}
function maakSpulAan(s) {
    const id = `tmp-${Date.now().toString(36)}-${state.spullen.length}`;
    const plek = s.plek !== undefined ? persoonId(s.plek) : undefined;
    zet({ spullen: [...state.spullen, { ...s, id, ...(plek !== undefined ? { plek } : {}), klaar: false, gedeeld: s.gedeeld === true, door: mijnId() }] });
    if (zonderSessie())
        return { id, klaar: Promise.resolve(id) };
    const klaar = api("manage-tasks", "belonging-create", { child_id: s.kind, name: s.naam, item_type: s.type ?? "mee", location: plekNaarServer(s.plek) ?? null, ...(typeof s.gedeeld === "boolean" ? { shared: s.gedeeld } : {}) }).then((r) => {
        tijdelijk.set(id, r.belonging.id);
        zet({ spullen: state.spullen.map((x) => (x.id === id ? spulVanServer(r.belonging) : x)) });
        verversAudit();
        return r.belonging.id;
    }).catch((e) => {
        zet({ spullen: state.spullen.filter((x) => x.id !== id) });
        meldFout(e, "spullen-fout");
        return null;
    }).finally(() => onderweg.delete(id));
    onderweg.set(id, klaar);
    return { id, klaar };
}
/**
 * Slimme overdrachtslijst: wat bij dit moment hoort + spullen die standaard meewisselen.
 * Vaste-plek en dubbel aanwezige spullen komen er niet op. Ouders kunnen items toevoegen of weghalen.
 */
/* Hulpverzoeken aan de kring: zie lib/hulp-store.js (server: manage-pickups). */
