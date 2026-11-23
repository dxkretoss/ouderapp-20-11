import { useSyncExternalStore } from "react";
import i18n from "@/i18n";
import { leg } from "@/lib/audit-store";
import { kringState, mag, wieNaam } from "@/lib/kring-store";
import { startState } from "@/lib/start-store";
export const contactStatusLabel = {
    get "nog-te-regelen"() { return i18n.t("lib.takenStore.contactStatus.nogTeRegelen"); },
    get "contact-opgenomen"() { return i18n.t("lib.takenStore.contactStatus.contactOpgenomen"); },
    get "wacht-op-reactie"() { return i18n.t("lib.takenStore.contactStatus.wachtOpReactie"); },
    get afgerond() { return i18n.t("lib.takenStore.contactStatus.afgerond"); },
    get "niet-mogelijk"() { return i18n.t("lib.takenStore.contactStatus.nietMogelijk"); },
};
const demo = (k) => i18n.t(`lib.takenStore.demo.${k}`);
let state = {
    taken: [
        { id: "t1", get tekst() { return demo("t1"); }, kind: "beide", wie: "joris", klaar: false, herhaling: "aangepast", get herhalingTekst() { return demo("elkHalfJaar"); } },
        { id: "t2", get tekst() { return demo("t2"); }, kind: "emma", wie: "sanne", klaar: false, herhaling: "jaarlijks", deadline: "2027-04-12", herinnerDagen: 3 },
        { id: "t3", get tekst() { return demo("t3"); }, kind: "noah", wie: "sanne", klaar: true, herhaling: "eenmalig" },
        { id: "t4", get tekst() { return demo("t4"); }, kind: "noah", wie: "", klaar: false, herhaling: "aangepast", get herhalingTekst() { return demo("elkSeizoen"); } },
        { id: "t5", get tekst() { return demo("t5"); }, kind: "noah", wie: "joris", klaar: false, herhaling: "jaarlijks" },
        { id: "t6", get tekst() { return demo("t6"); }, kind: "emma", wie: "sanne", klaar: false, herhaling: "eenmalig", deadline: new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10), herinnerDagen: 3 },
    ],
    spullen: [
        { id: "s1", get naam() { return demo("knuffel"); }, kind: "noah", type: "mee" },
        { id: "s2", get naam() { return demo("schooltablet"); }, kind: "emma", type: "mee" },
        { id: "s3", get naam() { return demo("voetbalschoenen"); }, kind: "noah", type: "vast", plek: "joris" },
        { id: "s4", get naam() { return demo("tandenborstel"); }, kind: "emma", type: "dubbel" },
        { id: "s5", get naam() { return demo("tandenborstel"); }, kind: "noah", type: "dubbel" },
    ],
    extraMee: {},
    weg: {},
};
const listeners = new Set();
const zet = (p) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export const takenState = () => state;
export function useTaken() {
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
/** Namen van betrokken kinderen; bij een eigen gezin komen die uit de start-opslag. */
export const kindNaam = (k) => {
    if (k === "beide")
        return ["Emma", "Noah"];
    if (k === "emma")
        return ["Emma"];
    if (k === "noah")
        return ["Noah"];
    if (k === "alle")
        return startState().kinderen.map((x) => x.naam);
    const eigen = startState().kinderen.find((x) => x.id === k);
    return [eigen ? eigen.naam : k];
};
/** Taken van het eigen gezin (geen voorbeeldtaken). */
export const eigenTaken = () => {
    const ids = new Set([...startState().kinderen.map((k) => k.id), "alle"]);
    return state.taken.filter((t) => ids.has(t.kind));
};
/** Spullen van het eigen gezin. */
export const eigenSpullen = () => {
    const ids = new Set(startState().kinderen.map((k) => k.id));
    return state.spullen.filter((s) => ids.has(s.kind));
};
/** Wie mag een taak krijgen? Ouders altijd; kringleden alleen met recht op "Toegewezen taken" voor het kind. */
export function taakKandidaten(t) {
    const kids = t.kind === "beide" ? ["emma", "noah"] : [t.kind];
    return [
        { id: "sanne", naam: i18n.t("common.jij") },
        { id: "joris", naam: wieNaam("joris") },
        ...kringState().personen.filter((p) => kids.every((k) => mag(p, k, "taken"))).map((p) => ({ id: p.id, naam: wieNaam(p.id) })),
    ];
}
export const taakWieTekst = (wie) => (wie === "sanne" ? i18n.t("lib.takenStore.wie.jij") : wie ? i18n.t("lib.takenStore.wie.ander", { naam: wieNaam(wie) }) : i18n.t("lib.takenStore.wie.niemand"));
export function voegTaakToe(t) {
    const bestaand = t.berichtId ? state.taken.find((x) => x.berichtId === t.berichtId && x.gesprekId === t.gesprekId) : undefined;
    if (bestaand)
        return bestaand.id;
    const id = `t${Date.now()}-${state.taken.length}`;
    zet({ taken: [{ ...t, id, klaar: false }, ...state.taken] });
    return id;
}
export function toggleTaak(id) {
    zet({ taken: state.taken.map((t) => {
            if (t.id !== id || t.overdragenAan)
                return t;
            const klaar = !t.klaar;
            return { ...t, klaar, ...(t.contactStatus ? { contactStatus: klaar ? "afgerond" : "nog-te-regelen" } : {}) };
        }) });
}
/** Werk de contactstatus van een taak bij; "afgerond" zet de taak ook op klaar. */
export function zetContactStatus(id, contactStatus) {
    zet({ taken: state.taken.map((t) => (t.id === id && !t.overdragenAan ? { ...t, contactStatus, klaar: contactStatus === "afgerond" } : t)) });
}
/** Overdragen: naar een ouder of kringlid is een verzoek dat eerst geaccepteerd moet worden (behalve naar jezelf). */
export function vraagOverdracht(id, aan) {
    if (aan === "sanne")
        return wijsTaakToe(id, aan);
    zet({ taken: state.taken.map((t) => (t.id === id ? { ...t, overdragenAan: aan } : t)) });
}
export function annuleerOverdracht(id) {
    zet({ taken: state.taken.map((t) => { if (t.id !== id)
            return t; const { overdragenAan: _x, ...rest } = t; return rest; }) });
}
/** Demo: de ontvanger accepteert → taak wordt definitief opnieuw toegewezen. */
export const accepteerOverdracht = (id) => { const t = state.taken.find((x) => x.id === id); if (t?.overdragenAan)
    wijsTaakToe(id, t.overdragenAan, wieNaam(t.overdragenAan)); };
/** "Ik doe het": jij wordt verantwoordelijk voor een taak die nog bij niemand lag. */
export const neemTaakOp = (id) => wijsTaakToe(id, "sanne");
function wijsTaakToe(id, aan, door = "Sanne") {
    const t = state.taken.find((x) => x.id === id);
    if (!t)
        return;
    leg("taak", id, t.tekst, "UPDATED", { veld: i18n.t("lib.takenStore.audit.verantwoordelijke"), oud: wieNaam(t.wie || undefined), nieuw: wieNaam(aan) }, ["Sanne", "Joris"].includes(door) ? door : "Sanne", { kinderen: kindNaam(t.kind), meta: { type: "Taak opnieuw toegewezen" } });
    zet({ taken: state.taken.map((x) => { if (x.id !== id)
            return x; const { overdragenAan: _x, ...rest } = x; return { ...rest, wie: aan }; }) });
}
export function zetSpul(id, p) {
    const s = state.spullen.find((x) => x.id === id);
    if (!s)
        return;
    const types = { mee: i18n.t("lib.takenStore.audit.type.mee"), vast: i18n.t("lib.takenStore.audit.type.vast"), dubbel: i18n.t("lib.takenStore.audit.type.dubbel") };
    const veldNaam = { naam: i18n.t("lib.takenStore.audit.naam"), type: i18n.t("lib.takenStore.audit.meewisselen"), plek: i18n.t("lib.takenStore.audit.plek") };
    for (const veld of ["naam", "type", "plek"]) {
        if (p[veld] === undefined || p[veld] === s[veld])
            continue;
        leg("spul", id, p.naam ?? s.naam, "UPDATED", { veld: veldNaam[veld], oud: veld === "type" ? types[s.type] : String(s[veld] ?? ""), nieuw: veld === "type" && p.type ? types[p.type] : String(p[veld] ?? "") }, "Sanne", { kinderen: kindNaam(s.kind), meta: { type: "Spul" } });
    }
    zet({ spullen: state.spullen.map((x) => (x.id === id ? { ...x, ...p, id } : x)) });
}
/** "Ik regel dit": één spul, één verantwoordelijke — hetzelfde model als bij taken. */
export function regelSpul(id, wie) {
    const s = state.spullen.find((x) => x.id === id);
    if (!s)
        return;
    leg("spul", id, s.naam, "UPDATED", { veld: i18n.t("lib.takenStore.audit.wieRegelt"), oud: s.wie ? wieNaam(s.wie) : i18n.t("lib.takenStore.audit.nogNiemand"), nieuw: wieNaam(wie) }, "Sanne", { kinderen: [s.kind === "emma" ? "Emma" : "Noah"], meta: { type: "Spul" } });
    zet({ spullen: state.spullen.map((x) => (x.id === id ? { ...x, wie } : x)) });
}
export function voegSpulToe(s) {
    const id = `s${Date.now()}-${state.spullen.length}`;
    leg("spul", id, s.naam, "CREATED", undefined, "Sanne", { kinderen: kindNaam(s.kind), meta: { type: "Spul" } });
    zet({ spullen: [...state.spullen, { ...s, id }] });
}
/**
 * Slimme overdrachtslijst: wat bij dit moment hoort + spullen die standaard meewisselen.
 * Vaste-plek en dubbel aanwezige spullen komen er niet op. Ouders kunnen items toevoegen of weghalen.
 */
export function meeLijst(m) {
    const auto = state.spullen.filter((s) => s.type === "mee" && m.kindIds.includes(s.kind)).map((s) => s.naam);
    const weg = state.weg[m.id] ?? [];
    return [...new Set([...m.mee, ...auto, ...(state.extraMee[m.id] ?? [])])].filter((x) => !weg.includes(x));
}
export const voegMeeToe = (momentId, item) => zet({ extraMee: { ...state.extraMee, [momentId]: [...(state.extraMee[momentId] ?? []), item] }, weg: { ...state.weg, [momentId]: (state.weg[momentId] ?? []).filter((x) => x !== item) } });
export const haalMeeWeg = (momentId, item) => zet({ weg: { ...state.weg, [momentId]: [...(state.weg[momentId] ?? []), item] } });
let hulp = [];
const hulpLuisteraars = new Set();
const zetHulp = (l) => { hulp = l; hulpLuisteraars.forEach((f) => f()); };
export const hulpState = () => hulp;
export function useHulpVerzoeken() {
    return useSyncExternalStore((l) => { hulpLuisteraars.add(l); return () => hulpLuisteraars.delete(l); }, () => hulp, () => hulp);
}
/** Alleen actieve kringpersonen met recht op wisselmomenten of taken voor (alle) betrokken kinderen. */
export function hulpKandidaten(kind) {
    const kids = kind === "beide" ? ["emma", "noah"] : kind === "alle" ? startState().kinderen.map((k) => k.id) : [kind];
    return kringState().personen.filter((p) => !p.ingetrokken && kids.every((k) => mag(p, k, "wissel") || mag(p, k, "taken")));
}
export function vraagHulp(v) {
    const toegestaan = new Set(hulpKandidaten(v.kind).map((p) => p.id));
    const ontvangers = v.ontvangers.filter((id) => toegestaan.has(id));
    if (!v.wat.trim() || !ontvangers.length)
        return null;
    const id = `h${Date.now()}`;
    leg("taak", id, v.wat, "CREATED", undefined, "Sanne", { kinderen: kindNaam(v.kind), meta: { type: "Hulpverzoek", ontvangers: ontvangers.map((o) => wieNaam(o)).join(", ") } });
    zetHulp([{ ...v, ontvangers, id, status: "open" }, ...hulp]);
    return id;
}
/** Eerste ontvanger wint; een tweede acceptatie wordt geweigerd. */
export function accepteerHulp(id, wie) {
    const v = hulp.find((x) => x.id === id);
    if (!v || v.status !== "open" || !v.ontvangers.includes(wie))
        return false;
    const taakId = `t${Date.now()}`;
    zet({ taken: [{ id: taakId, tekst: `${v.wat} (${v.datum} ${v.tijd})`, kind: v.kind, wie, klaar: false, herhaling: "eenmalig", deadline: v.datum }, ...state.taken] });
    leg("taak", id, v.wat, "UPDATED", { veld: i18n.t("lib.takenStore.audit.hulpverzoek"), oud: i18n.t("lib.takenStore.audit.open"), nieuw: i18n.t("lib.takenStore.audit.geaccepteerdDoor", { naam: wieNaam(wie) }) }, "Sanne", { kinderen: kindNaam(v.kind), meta: { type: "Hulpverzoek" } });
    zetHulp(hulp.map((x) => (x.id === id ? { ...x, status: "geaccepteerd", geaccepteerdDoor: wie, taakId } : x)));
    return true;
}
export function trekHulpIn(id) {
    zetHulp(hulp.map((x) => (x.id === id && x.status === "open" ? { ...x, status: "ingetrokken" } : x)));
}
export const resetHulpVoorTest = () => zetHulp([]);
