import { useSyncExternalStore } from "react";
import i18n, { taalLocale } from "@/i18n";
import { api } from "@/lib/api";
import { herlaad, meldFout, online, opAgendaLijst } from "@/lib/agenda-store";
import { voegTaakToe, zetContactStatus as zetTaakContactStatus } from "./taken-store";
export const keuzeLabel = {
    get samen() { return i18n.t("lib.aanwezigheidStore.keuze.samen"); },
    get een() { return i18n.t("lib.aanwezigheidStore.keuze.een"); },
    get afzonderlijk() { return i18n.t("lib.aanwezigheidStore.keuze.afzonderlijk"); },
    get later() { return i18n.t("lib.aanwezigheidStore.keuze.later"); },
    get halen() { return i18n.t("lib.aanwezigheidStore.keuze.halen"); },
    get brengen() { return i18n.t("lib.aanwezigheidStore.keuze.brengen"); },
};
/**
 * Aanwezigheid afstemmen per gedeelde afspraak (bron: manage-agenda). Eén actueel voorstel per afspraak;
 * een nieuw voorstel vervangt het vorige, de geschiedenis blijft. Alleen de andere ouder reageert.
 * Kijker-relatief zoals elders in de app: "sanne" = jij, "joris" = de andere ouder (geen namen).
 * De gekoppelde contacttaak blijft in taken-store (contactTaakId alleen op dit apparaat).
 */
const vandaag = () => new Date().toLocaleDateString(taalLocale(), { day: "numeric", month: "long", year: "numeric" });
const datumTekst = (d) => { const x = new Date(`${d}T12:00:00`); return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString(taalLocale(), { day: "numeric", month: "long", year: "numeric" }); };
export const wieNaamKort = (w) => (w === "sanne" ? i18n.t("lib.aanwezigheidStore.wie.jij") : i18n.t("lib.aanwezigheidStore.wie.ander"));
let lijst = [];
const taakVan = new Map();
const ls = new Set();
const zet = (f) => { lijst = f(lijst); ls.forEach((l) => l()); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rel = (r) => (r === "ik" ? "sanne" : r === "ander" ? "joris" : r ?? undefined);
const naarRel = (w) => (w === "sanne" ? "ik" : w === "joris" ? "ander" : w ?? null);
const beschrijving = (a) => a.keuze === "samen" ? i18n.t("lib.aanwezigheidStore.beschrijving.samen")
    : a.keuze === "een" ? (a.wieGaat && a.wieGaat !== "onbekend" ? i18n.t("lib.aanwezigheidStore.beschrijving.eenWie", { wie: wieNaamKort(a.wieGaat).toLowerCase() }) : i18n.t("lib.aanwezigheidStore.beschrijving.een"))
        : a.keuze === "halen" || a.keuze === "brengen" ? (a.wieGaat && a.wieGaat !== "onbekend" ? i18n.t(`lib.aanwezigheidStore.beschrijving.${a.keuze}Wie`, { wie: wieNaamKort(a.wieGaat).toLowerCase() }) : i18n.t(`lib.aanwezigheidStore.beschrijving.${a.keuze}`))
        : a.keuze === "afzonderlijk" ? i18n.t("lib.aanwezigheidStore.beschrijving.afzonderlijk")
            : i18n.t("lib.aanwezigheidStore.beschrijving.later");
const UITKOMST = { mogelijk: "mogelijk", "wacht-op-school": "wachtOpSchool", "niet-mogelijk": "nietMogelijk", "contact-opgenomen": "vastgelegd" };
/** Gestructureerde servergeschiedenis → tekst vanuit deze kijker (zo klopt "jij" voor beide ouders). */
function regel(g) {
    const door = rel(g.door), wieGaat = rel(g.wie_gaat), contactWie = rel(g.contact_wie);
    const tekst = () => {
        if (g.soort === "voorstel")
            return `${i18n.t("lib.aanwezigheidStore.geschiedenis.steldeVoor", { wie: wieNaamKort(door), wat: beschrijving({ keuze: g.keuze, wieGaat, contactWie }) })}${g.vervangt ? i18n.t("lib.aanwezigheidStore.geschiedenis.vervangt") : ""}`;
        if (g.soort === "afgestemd")
            return i18n.t("lib.aanwezigheidStore.geschiedenis.afgestemd", { wat: beschrijving({ keuze: g.keuze, wieGaat }) });
        if (g.soort === "nietSamen")
            return i18n.t("lib.aanwezigheidStore.geschiedenis.nietSamen");
        if (g.soort === "luktNiet")
            return i18n.t("lib.aanwezigheidStore.geschiedenis.luktNiet");
        if (g.soort === "puntenGedeeld")
            return i18n.t("lib.aanwezigheidStore.geschiedenis.puntenGedeeld");
        if (String(g.soort).startsWith("uitkomst:"))
            return i18n.t(`lib.aanwezigheidStore.uitkomst.${UITKOMST[g.soort.slice(9)] ?? "vastgelegd"}`);
        return "";
    };
    return { datum: datumTekst(g.datum), get tekst() { return tekst(); } };
}
const vanServer = (a) => ({
    afspraakId: a.event_id, keuze: a.keuze, fase: a.fase, door: rel(a.door), wieGaat: rel(a.wie_gaat), contactWie: rel(a.contact_wie),
    contactTaakId: taakVan.get(a.event_id), uitkomst: a.uitkomst ?? undefined, uitkomstToelichting: a.uitkomst_toelichting ?? undefined,
    nabespreking: a.nabespreking ? { besproken: a.nabespreking.besproken ?? "", afspraken: a.nabespreking.afspraken ?? "", door: rel(a.nabespreking.door), datum: datumTekst(a.nabespreking.datum) } : undefined,
    geschiedenis: (a.geschiedenis ?? []).map(regel),
});
opAgendaLijst((r) => zet(() => (r ? (r.attendance ?? []).map(vanServer) : [])));
function stuur(afspraakId, actie, body) {
    if (!online() || !UUID.test(afspraakId))
        return;
    api("manage-agenda", actie, { event_id: afspraakId, ...body }).then(() => herlaad(), (e) => { meldFout(e); herlaad(); });
}
export const aanwezigheidState = () => lijst;
export const aanwezigVoor = (afspraakId) => lijst.find((a) => a.afspraakId === afspraakId) ?? null;
export function useAanwezigheid() {
    return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => lijst, () => lijst);
}
/**
 * Start of vervang het actuele voorstel voor deze afspraak. "later" zet geen voorstel klaar maar markeert
 * de afstemming als open; "ik neem contact op" is een eigen toezegging en is direct geregeld.
 */
export function startAfstemming(afspraakId, keuze, door, opties) {
    const bestaand = aanwezigVoor(afspraakId);
    const fase = keuze === "later" || (keuze === "afzonderlijk" && (!opties.contactWie || opties.contactWie === "nog")) ? "open"
        : keuze === "afzonderlijk" && opties.contactWie === door ? "afgestemd" : "voorstel";
    const voorgesteld = i18n.t("lib.aanwezigheidStore.geschiedenis.steldeVoor", { wie: wieNaamKort(door), wat: beschrijving({ keuze, wieGaat: opties.wieGaat, contactWie: opties.contactWie }) });
    const basis = {
        afspraakId, keuze, fase, door,
        wieGaat: opties.wieGaat, contactWie: opties.contactWie,
        contactTaakId: bestaand?.contactTaakId, uitkomst: bestaand?.uitkomst, uitkomstToelichting: bestaand?.uitkomstToelichting,
        nabespreking: bestaand?.nabespreking,
        geschiedenis: [{ datum: vandaag(), tekst: `${voorgesteld}${bestaand ? i18n.t("lib.aanwezigheidStore.geschiedenis.vervangt") : ""}` }, ...(bestaand?.geschiedenis ?? [])],
    };
    // Contacttaak: alleen aanmaken als er nog geen is en iemand contact gaat opnemen.
    if (keuze === "afzonderlijk" && opties.contactWie && opties.contactWie !== "nog" && !basis.contactTaakId) {
        const taakId = voegTaakToe({ tekst: i18n.t("lib.aanwezigheidStore.contactTaak", { titel: opties.afspraakTitel }), kind: opties.kind, wie: opties.contactWie === door ? door : "", herhaling: "eenmalig", afspraakId, contactStatus: "nog-te-regelen", ...(opties.contactWie !== door ? { overdragenAan: opties.contactWie } : {}) });
        basis.contactTaakId = taakId;
        taakVan.set(afspraakId, taakId);
        basis.geschiedenis = [{ datum: vandaag(), tekst: opties.contactWie === "sanne" ? i18n.t("lib.aanwezigheidStore.geschiedenis.jijContact") : i18n.t("lib.aanwezigheidStore.geschiedenis.anderContact") }, ...basis.geschiedenis];
    }
    zet((l) => [basis, ...l.filter((a) => a.afspraakId !== afspraakId)]);
    stuur(afspraakId, "set-attendance", { keuze, wie_gaat: naarRel(opties.wieGaat), contact_wie: naarRel(opties.contactWie) });
    return basis;
}
/** Welke reacties passen bij het huidige voorstel? */
export function reactiesVoor(a) {
    if (a.fase !== "voorstel")
        return [];
    const akkoord = { id: "akkoord", label: i18n.t("common.akkoord") };
    const ander = { id: "ander", label: i18n.t("common.anderVoorstel") };
    if (a.keuze === "samen")
        return [akkoord, ander, { id: "liever-niet-samen", label: i18n.t("lib.aanwezigheidStore.reactie.lieverNietSamen") }];
    if (a.keuze === "een")
        return [{ id: "dat-lukt", label: i18n.t("lib.aanwezigheidStore.reactie.datLukt") }, { id: "dat-lukt-niet", label: i18n.t("lib.aanwezigheidStore.reactie.datLuktNiet") }, ander];
    return [akkoord, ander];
}
/** Verwerk een reactie op het actuele voorstel ("ander" doet de aanroeper via startAfstemming). Geen schuldtaal. */
export function reageer(afspraakId, reactie, door) {
    const a = aanwezigVoor(afspraakId);
    if (!a || a.fase !== "voorstel" || door === a.door)
        return false;
    const d = vandaag();
    const goed = reactie === "akkoord" || reactie === "dat-lukt";
    const tekst = goed ? i18n.t("lib.aanwezigheidStore.geschiedenis.afgestemd", { wat: beschrijving(a) }) : reactie === "liever-niet-samen" ? i18n.t("lib.aanwezigheidStore.geschiedenis.nietSamen") : i18n.t("lib.aanwezigheidStore.geschiedenis.luktNiet");
    zet((l) => l.map((x) => (x.afspraakId === afspraakId ? { ...x, fase: goed ? "afgestemd" : "open", geschiedenis: [{ datum: d, tekst }, ...x.geschiedenis] } : x)));
    stuur(afspraakId, "respond-attendance", { reactie });
    return true;
}
/** Leg de uitkomst van het contact met school/organisatie vast; werkt de gekoppelde taak bij. */
export function zetUitkomst(afspraakId, uitkomst, toelichting) {
    const a = aanwezigVoor(afspraakId);
    if (!a)
        return;
    const status = uitkomst === "mogelijk" ? "afgerond" : uitkomst === "wacht-op-school" ? "wacht-op-reactie" : uitkomst === "niet-mogelijk" ? "niet-mogelijk" : "contact-opgenomen";
    if (a.contactTaakId)
        zetTaakContactStatus(a.contactTaakId, status);
    const tekst = i18n.t(`lib.aanwezigheidStore.uitkomst.${UITKOMST[uitkomst] ?? "vastgelegd"}`);
    zet((l) => l.map((x) => (x.afspraakId === afspraakId ? { ...x, uitkomst, uitkomstToelichting: toelichting?.trim() || undefined, fase: uitkomst === "mogelijk" ? "afgestemd" : x.fase, geschiedenis: [{ datum: vandaag(), tekst }, ...x.geschiedenis] } : x)));
    stuur(afspraakId, "attendance-outcome", { uitkomst, toelichting: toelichting?.trim() || null });
}
/** Markeer in de gekoppelde taak dat contact is opgenomen (nog zonder uitkomst). */
export function markeerContactOpgenomen(afspraakId) {
    const a = aanwezigVoor(afspraakId);
    if (a?.contactTaakId)
        zetTaakContactStatus(a.contactTaakId, "contact-opgenomen");
}
/** Na afloop: belangrijkste punten delen. Toegevoegd door één ouder; geen automatische bevestiging. */
export function deelNabespreking(afspraakId, besproken, afspraken, door) {
    if (!besproken.trim() && !afspraken.trim())
        return;
    const bestaand = aanwezigVoor(afspraakId);
    const nabespreking = { besproken: besproken.trim(), afspraken: afspraken.trim(), door, datum: vandaag() };
    zet((l) => bestaand
        ? l.map((x) => (x.afspraakId === afspraakId ? { ...x, nabespreking, geschiedenis: [{ datum: vandaag(), tekst: i18n.t("lib.aanwezigheidStore.geschiedenis.puntenGedeeld") }, ...x.geschiedenis] } : x))
        : [{ afspraakId, keuze: "later", fase: "open", door, nabespreking, geschiedenis: [{ datum: vandaag(), tekst: i18n.t("lib.aanwezigheidStore.geschiedenis.puntenGedeeld") }] }, ...l]);
    stuur(afspraakId, "attendance-debrief", { besproken: besproken.trim(), afspraken: afspraken.trim() });
}
/** Eén korte statusregel voor op de agendakaart. */
export function statusRegel(a, taakStatus) {
    if (!a)
        return null;
    // Bij afzonderlijk deelnemen vertelt de contacttaak de actuele stand; die gaat vóór op de algemene fase.
    if (a.keuze === "afzonderlijk") {
        if (taakStatus === "afgerond" && !a.uitkomst)
            return i18n.t("lib.aanwezigheidStore.status.contactAfgerond");
        if (a.uitkomst === "mogelijk")
            return i18n.t("lib.aanwezigheidStore.status.afzonderlijkAfgestemd");
        if (a.uitkomst === "niet-mogelijk")
            return i18n.t("lib.aanwezigheidStore.status.nietMogelijk");
        if (taakStatus === "wacht-op-reactie")
            return i18n.t("lib.aanwezigheidStore.status.aangevraagd");
        if (a.contactWie === "sanne" && taakStatus !== "afgerond")
            return i18n.t("lib.aanwezigheidStore.status.jijContact");
        if (a.contactWie && a.contactWie !== "sanne" && a.contactWie !== "nog")
            return a.fase === "afgestemd" ? i18n.t("lib.aanwezigheidStore.status.anderContact") : i18n.t("lib.aanwezigheidStore.status.anderGevraagd");
    }
    if (a.fase === "afgestemd") {
        if (a.keuze === "samen")
            return i18n.t("lib.aanwezigheidStore.status.samenAfgestemd");
        if (a.keuze === "een")
            return a.wieGaat && a.wieGaat !== "onbekend" ? i18n.t("lib.aanwezigheidStore.status.eenWieAfgestemd", { wie: wieNaamKort(a.wieGaat).toLowerCase() }) : i18n.t("lib.aanwezigheidStore.status.eenAfgestemd");
        return i18n.t("lib.aanwezigheidStore.status.afgestemd");
    }
    if (a.fase === "voorstel")
        return a.door === "sanne" ? i18n.t("lib.aanwezigheidStore.status.eigenVoorstel", { wat: beschrijving(a) }) : i18n.t("lib.aanwezigheidStore.status.voorstelReageren");
    return i18n.t("lib.aanwezigheidStore.status.nogAfstemmen");
}
/** Alleen voor tests. */
export const resetAanwezigheid = () => zet(() => []);
