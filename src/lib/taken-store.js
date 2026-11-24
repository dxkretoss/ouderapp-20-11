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
 * Spullen: { id, naam, kind, type: mee|vast|dubbel|terug, plek (profiel-id of vrije tekst), wie, klaar }.
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
        door: r.created_by,
    };
}
export function spulVanServer(r) {
    return { id: r.id, naam: r.name, kind: r.child_id, type: r.item_type, ...(r.location_parent_id || r.location_text ? { plek: r.location_parent_id ?? r.location_text } : {}), ...(r.responsible_id ? { wie: r.responsible_id } : {}), klaar: !!r.is_done, door: r.created_by };
}
const sync = serverBron({
    laad: async () => {
        const r = await api("manage-tasks", "list");
        zet({ taken: (r.tasks ?? []).map(taakVanServer), spullen: (r.belongings ?? []).map(spulVanServer), geladen: true });
    },
    wis: () => { tijdelijk.clear(); zet(leegState()); },
});
export const takenState = () => { sync.zorg(); return state; };
export function useTaken() {
    sync.zorg();
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
/** Tijdelijke id (optimistisch) → echte server-id, zodat aanroepers met de teruggegeven id kunnen blijven werken. */
const tijdelijk = new Map();
const echt = (id) => tijdelijk.get(id) ?? id;
const vervangTaak = (id, r) => zet({ taken: state.taken.map((x) => (x.id === id ? taakVanServer(r) : x)) });
async function taakActie(id, actie, body, optimistischPatch) {
    const echteId = echt(id);
    const vorig = state.taken.find((x) => x.id === id || x.id === echteId);
    if (!vorig)
        return;
    if (optimistischPatch)
        zet({ taken: state.taken.map((x) => (x === vorig ? { ...x, ...optimistischPatch(x) } : x)) });
    // Zonder sessie (alleen tests): lokaal blijven, zoals voorheen.
    if (zonderSessie())
        return;
    try {
        if (echteId.startsWith("tmp-"))
            throw new Error("not saved yet");
        const r = await api("manage-tasks", actie, { task_id: echteId, ...body });
        vervangTaak(vorig.id, r.task);
        verversAudit();
    }
    catch (e) {
        zet({ taken: state.taken.map((x) => (x.id === vorig.id ? vorig : x)) });
        meldFout(e, "taken-fout");
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
    const bestaand = t.berichtId ? state.taken.find((x) => x.berichtId === t.berichtId && x.gesprekId === t.gesprekId) : undefined;
    if (bestaand)
        return bestaand.id;
    if (zonderSessie()) {
        // Alleen in tests (geen ingelogde ouder): lokaal en met de rollen zoals aangeleverd.
        const id = `t${Date.now()}-${state.taken.length}`;
        zet({ taken: [{ ...t, id, klaar: false }, ...state.taken] });
        return id;
    }
    const ik = mijnId();
    const wie = persoonId(t.wie);
    const naar = persoonId(t.overdragenAan);
    const assign = naar && naar !== ik ? "other" : wie && wie === ik ? "me" : naar === ik ? "me" : "none";
    const id = `tmp-${Date.now().toString(36)}-${state.taken.length}`;
    const lokaal = { ...t, id, wie: assign === "me" ? ik : "", ...(assign === "other" ? { overdragenAan: naar, gevraagdDoor: ik } : { overdragenAan: undefined }), klaar: false, herhaling: t.herhaling ?? "eenmalig" };
    zet({ taken: [lokaal, ...state.taken] });
    const body = {
        title: t.tekst, child_ids: kindIds(t.kind), assign, deadline: t.deadline || null, recurrence: t.herhaling ?? "eenmalig",
        recurrence_text: t.herhalingTekst ?? null, reminder_days: t.herinnerDagen ?? 0, contact_status: t.contactStatus ?? null,
        source: { bericht_id: t.berichtId, gesprek_id: t.gesprekId, afspraak_id: t.afspraakId },
    };
    api("manage-tasks", "create", body).then((r) => {
        tijdelijk.set(id, r.task.id);
        const echteTaak = taakVanServer(r.task);
        zet({ taken: [echteTaak, ...state.taken.filter((x) => x.id !== id && x.id !== r.task.id)] });
        verversAudit();
    }).catch((e) => {
        zet({ taken: state.taken.filter((x) => x.id !== id) });
        meldFout(e, "taken-fout");
    });
    return id;
}
export function toggleTaak(id) {
    const t = state.taken.find((x) => x.id === id || x.id === echt(id));
    if (!t || t.overdragenAan)
        return;
    const klaar = !t.klaar;
    taakActie(t.id, "toggle", { done: klaar }, () => ({ klaar, ...(t.contactStatus ? { contactStatus: klaar ? "afgerond" : "nog-te-regelen" } : {}) }));
}
/** Werk de contactstatus van een taak bij; "afgerond" zet de taak ook op klaar. */
export function zetContactStatus(id, contactStatus) {
    const t = state.taken.find((x) => x.id === id || x.id === echt(id));
    if (!t || t.overdragenAan)
        return;
    taakActie(t.id, "set-contact-status", { contact_status: contactStatus }, () => ({ contactStatus, klaar: contactStatus === "afgerond" }));
}
/** Overdragen aan de andere ouder is een verzoek dat die eerst accepteert; naar jezelf = "Ik doe het". */
export function vraagOverdracht(id, aan) {
    const naar = persoonId(aan);
    if (!naar || naar === mijnId())
        return neemTaakOp(id);
    taakActie(id, "request", {}, () => ({ overdragenAan: naar, gevraagdDoor: mijnId() }));
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
    const vorig = state.spullen.find((x) => x.id === id);
    if (!vorig)
        return;
    zet({ spullen: state.spullen.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
    try {
        if (id.startsWith("tmp-"))
            throw new Error("not saved yet");
        const r = await api("manage-tasks", "belonging-update", { belonging_id: id, ...body });
        zet({ spullen: state.spullen.map((x) => (x.id === id ? spulVanServer(r.belonging) : x)) });
        verversAudit();
    }
    catch (e) {
        zet({ spullen: state.spullen.map((x) => (x.id === id ? vorig : x)) });
        meldFout(e, "spullen-fout");
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
    const patch = { ...p, ...(p.plek !== undefined ? { plek: persoonId(p.plek) } : {}) };
    spulActie(id, body, patch);
}
/** "Ik regel dit": één spul, één verantwoordelijke — hetzelfde model als bij taken (altijd jijzelf). */
export function regelSpul(id) {
    spulActie(id, { responsible: "me" }, { wie: mijnId() });
}
export function voegSpulToe(s) {
    const id = `tmp-${Date.now().toString(36)}-${state.spullen.length}`;
    const plek = s.plek !== undefined ? persoonId(s.plek) : undefined;
    zet({ spullen: [...state.spullen, { ...s, id, ...(plek !== undefined ? { plek } : {}), klaar: false }] });
    api("manage-tasks", "belonging-create", { child_id: s.kind, name: s.naam, item_type: s.type ?? "mee", location: plekNaarServer(s.plek) ?? null }).then((r) => {
        zet({ spullen: state.spullen.map((x) => (x.id === id ? spulVanServer(r.belonging) : x)) });
        verversAudit();
    }).catch((e) => {
        zet({ spullen: state.spullen.filter((x) => x.id !== id) });
        meldFout(e, "spullen-fout");
    });
    return id;
}
/**
 * Slimme overdrachtslijst: wat bij dit moment hoort + spullen die standaard meewisselen.
 * Vaste-plek en dubbel aanwezige spullen komen er niet op. Ouders kunnen items toevoegen of weghalen.
 */
export function meeLijst(m) {
    const auto = state.spullen.filter((s) => s.type === "mee" && m.kindIds.includes(s.kind)).map((s) => s.naam);
    const weg = state.weg[m.id] ?? [];
    return [...new Set([...(m.mee ?? []), ...auto, ...(state.extraMee[m.id] ?? [])])].filter((x) => !weg.includes(x));
}
export const voegMeeToe = (momentId, item) => zet({ extraMee: { ...state.extraMee, [momentId]: [...(state.extraMee[momentId] ?? []), item] }, weg: { ...state.weg, [momentId]: (state.weg[momentId] ?? []).filter((x) => x !== item) } });
export const haalMeeWeg = (momentId, item) => zet({ weg: { ...state.weg, [momentId]: [...(state.weg[momentId] ?? []), item] } });
/* ---------- hulpverzoeken aan de kring (nog lokaal: kringleden hebben nog geen takenrecht op de server) ---------- */
let hulp = [];
const hulpLuisteraars = new Set();
const zetHulp = (l) => { hulp = l; hulpLuisteraars.forEach((f) => f()); };
export const hulpState = () => hulp;
export function useHulpVerzoeken() {
    return useSyncExternalStore((l) => { hulpLuisteraars.add(l); return () => hulpLuisteraars.delete(l); }, () => hulp, () => hulp);
}
/** Alleen actieve kringpersonen met recht op wisselmomenten of taken voor (alle) betrokken kinderen. */
export function hulpKandidaten(kind) {
    const kids = kind === "beide" || kind === "alle" ? startState().kinderen.map((k) => k.id) : [kind];
    return kringState().personen.filter((p) => !p.ingetrokken && kids.every((k) => mag(p, k, "wissel") || mag(p, k, "taken")));
}
export function vraagHulp(v) {
    const toegestaan = new Set(hulpKandidaten(v.kind).map((p) => p.id));
    const ontvangers = v.ontvangers.filter((id) => toegestaan.has(id));
    if (!v.wat.trim() || !ontvangers.length)
        return null;
    const id = `h${Date.now()}`;
    zetHulp([{ ...v, ontvangers, id, status: "open" }, ...hulp]);
    return id;
}
/** Eerste ontvanger wint; een tweede acceptatie wordt geweigerd. */
export function accepteerHulp(id, wie) {
    const v = hulp.find((x) => x.id === id);
    if (!v || v.status !== "open" || !v.ontvangers.includes(wie))
        return false;
    const taakId = `t${Date.now()}`;
    zet({ taken: [{ id: taakId, tekst: `${v.wat} (${v.datum} ${v.tijd})`, kind: v.kind, wie, klaar: false, herhaling: "eenmalig", deadline: v.datum, lokaal: true }, ...state.taken] });
    zetHulp(hulp.map((x) => (x.id === id ? { ...x, status: "geaccepteerd", geaccepteerdDoor: wie, taakId } : x)));
    return true;
}
export function trekHulpIn(id) {
    zetHulp(hulp.map((x) => (x.id === id && x.status === "open" ? { ...x, status: "ingetrokken" } : x)));
}
export const resetHulpVoorTest = () => zetHulp([]);
