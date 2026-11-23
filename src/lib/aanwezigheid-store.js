import { useSyncExternalStore } from "react";
import i18n, { taalLocale } from "@/i18n";
import { voegTaakToe, zetContactStatus as zetTaakContactStatus } from "./taken-store";
export const keuzeLabel = {
    get samen() { return i18n.t("lib.aanwezigheidStore.keuze.samen"); },
    get een() { return i18n.t("lib.aanwezigheidStore.keuze.een"); },
    get afzonderlijk() { return i18n.t("lib.aanwezigheidStore.keuze.afzonderlijk"); },
    get later() { return i18n.t("lib.aanwezigheidStore.keuze.later"); },
};
const vandaag = () => new Date().toLocaleDateString(taalLocale(), { day: "numeric", month: "long", year: "numeric" });
export const wieNaamKort = (w) => (w === "sanne" ? i18n.t("lib.aanwezigheidStore.wie.jij") : i18n.t("lib.aanwezigheidStore.wie.ander"));
let lijst = [];
const ls = new Set();
const zet = (f) => { lijst = f(lijst); ls.forEach((l) => l()); };
export const aanwezigheidState = () => lijst;
export const aanwezigVoor = (afspraakId) => lijst.find((a) => a.afspraakId === afspraakId) ?? null;
export function useAanwezigheid() {
    return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => lijst, () => lijst);
}
const beschrijving = (a) => a.keuze === "samen" ? i18n.t("lib.aanwezigheidStore.beschrijving.samen")
    : a.keuze === "een" ? (a.wieGaat && a.wieGaat !== "onbekend" ? i18n.t("lib.aanwezigheidStore.beschrijving.eenWie", { wie: wieNaamKort(a.wieGaat).toLowerCase() }) : i18n.t("lib.aanwezigheidStore.beschrijving.een"))
        : a.keuze === "afzonderlijk" ? i18n.t("lib.aanwezigheidStore.beschrijving.afzonderlijk")
            : i18n.t("lib.aanwezigheidStore.beschrijving.later");
/**
 * Start of vervang het actuele voorstel voor deze afspraak. Eén actueel voorstel per onderwerp;
 * een nieuw voorstel vervangt het vorige, de geschiedenis blijft bewaard.
 * "later" zet geen voorstel klaar maar markeert de afstemming als open.
 */
export function startAfstemming(afspraakId, keuze, door, opties) {
    const bestaand = aanwezigVoor(afspraakId);
    // "later" en "nog afstemmen" zetten geen voorstel klaar; "ik neem contact op" is een eigen toezegging en is direct geregeld.
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
        basis.geschiedenis = [{ datum: vandaag(), tekst: opties.contactWie === "sanne" ? i18n.t("lib.aanwezigheidStore.geschiedenis.jijContact") : i18n.t("lib.aanwezigheidStore.geschiedenis.anderContact") }, ...basis.geschiedenis];
    }
    zet((l) => [basis, ...l.filter((a) => a.afspraakId !== afspraakId)]);
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
/**
 * Verwerk een reactie op het actuele voorstel. "ander" doet de aanroeper zelf via startAfstemming.
 * Geen schuldtaal: een afwijzing is een feitelijke status, zonder verplichte uitleg.
 */
export function reageer(afspraakId, reactie, door) {
    const a = aanwezigVoor(afspraakId);
    if (!a || a.fase !== "voorstel" || door === a.door)
        return false;
    const d = vandaag();
    if (reactie === "akkoord" || reactie === "dat-lukt") {
        zet((l) => l.map((x) => x.afspraakId === afspraakId ? { ...x, fase: "afgestemd", geschiedenis: [{ datum: d, tekst: i18n.t("lib.aanwezigheidStore.geschiedenis.afgestemd", { wat: beschrijving(x) }) }, ...x.geschiedenis] } : x));
        return true;
    }
    if (reactie === "liever-niet-samen") {
        zet((l) => l.map((x) => x.afspraakId === afspraakId ? { ...x, fase: "open", geschiedenis: [{ datum: d, tekst: i18n.t("lib.aanwezigheidStore.geschiedenis.nietSamen") }, ...x.geschiedenis] } : x));
        return true;
    }
    // "dat-lukt-niet": voorstel vervalt, afstemming blijft open.
    zet((l) => l.map((x) => x.afspraakId === afspraakId ? { ...x, fase: "open", geschiedenis: [{ datum: d, tekst: i18n.t("lib.aanwezigheidStore.geschiedenis.luktNiet") }, ...x.geschiedenis] } : x));
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
    const tekst = uitkomst === "mogelijk" ? i18n.t("lib.aanwezigheidStore.uitkomst.mogelijk") : uitkomst === "wacht-op-school" ? i18n.t("lib.aanwezigheidStore.uitkomst.wachtOpSchool") : uitkomst === "niet-mogelijk" ? i18n.t("lib.aanwezigheidStore.uitkomst.nietMogelijk") : i18n.t("lib.aanwezigheidStore.uitkomst.vastgelegd");
    zet((l) => l.map((x) => x.afspraakId === afspraakId ? { ...x, uitkomst, uitkomstToelichting: toelichting?.trim() || undefined, fase: uitkomst === "mogelijk" ? "afgestemd" : x.fase, geschiedenis: [{ datum: vandaag(), tekst }, ...x.geschiedenis] } : x));
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
        ? l.map((x) => x.afspraakId === afspraakId ? { ...x, nabespreking, geschiedenis: [{ datum: vandaag(), tekst: i18n.t("lib.aanwezigheidStore.geschiedenis.puntenGedeeld") }, ...x.geschiedenis] } : x)
        : [{ afspraakId, keuze: "later", fase: "open", door, nabespreking, geschiedenis: [{ datum: vandaag(), tekst: i18n.t("lib.aanwezigheidStore.geschiedenis.puntenGedeeld") }] }, ...l]);
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
