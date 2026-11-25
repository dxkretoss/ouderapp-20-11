import i18n from "@/i18n";
import { api, foutTekst } from "@/lib/api";
import { toast } from "sonner";
import { startState } from "@/lib/start-store";
import { alsVerzorgerState, hulpVanServer, isActief, kringState, laadAlsVerzorger, niveau, ophalenBron, ophalenState, useOphalen, zetAlsVerzorger, zetHulpLijst } from "@/lib/kring-store";
/**
 * Hulp vragen aan de kring (server: manage-pickups). Een ouder vraagt gekozen kringleden om iets te regelen
 * voor een kind op een dag en tijd; wie het eerst "Ik regel het" kiest, krijgt het. Een kringlid kan ook
 * "Kan niet" antwoorden. Beide ouders van die kinderen zien de status; de vrager kan intrekken.
 * Item: { id, kindIds, wat, datum, tijd, status: open|accepted|declined|withdrawn, ontvangers: [{ id, naam, status, reden }], geaccepteerdDoor, doorMij }.
 */
const SECTIES = ["wissel", "agenda", "taken"];
function meldFout(e) {
    if (e?.code === "UNAUTHORIZED")
        return;
    toast.error(foutTekst(e), { id: "hulp-fout" });
}
/** "alle"/"beide" = alle eigen kinderen, anders dat ene kind. */
export const kinderenVoor = (kind) => (kind === "alle" || kind === "beide" ? startState().kinderen.map((k) => k.id) : kind ? [kind] : []);
export const kindNamen = (kindIds) => (kindIds ?? []).map((k) => startState().kinderen.find((x) => x.id === k)?.naam).filter(Boolean);
/** Ouderkant: de hulpverzoeken (laden via de ophaal-bron van kring-store). */
export function useHulpVerzoeken() {
    return useOphalen().hulp;
}
export const useHulpStatus = () => ophalenBron.useStatus();
export const verversHulp = () => ophalenBron.ververs();
/** Actieve kringleden met de app die voor álle betrokken kinderen wisselmomenten, agenda of taken mogen zien. */
export function hulpKandidaten(kind) {
    const kids = kinderenVoor(kind);
    if (!kids.length)
        return [];
    return kringState().personen.filter((p) => isActief(p) && p.uitgenodigd !== false && p.bevestigd !== false
        && kids.every((k) => SECTIES.some((o) => niveau(p, k, o) !== "geen")));
}
/** Hulp vragen. Geeft true bij succes (dan is het verzoek verstuurd), anders false (er staat al een melding). */
export async function vraagHulp({ kind, wat, datum, tijd, ontvangers }) {
    const kids = kinderenVoor(kind);
    const toegestaan = new Set(hulpKandidaten(kind).map((p) => p.id));
    const aan = (ontvangers ?? []).filter((id) => toegestaan.has(id));
    const tekst = (wat ?? "").trim();
    if (!tekst || tekst.length > 200 || !datum || !kids.length || !aan.length)
        return false;
    const vorig = ophalenState().hulp;
    const personen = kringState().personen;
    const tijdelijk = { id: `tmp-${Date.now()}`, kindIds: kids, wat: tekst, datum, tijd: tijd ?? "", status: "open", doorMij: true, geaccepteerdDoor: null,
        ontvangers: aan.map((id) => ({ id, naam: personen.find((p) => p.id === id)?.naam ?? "", status: "requested", reden: "" })) };
    zetHulpLijst([tijdelijk, ...vorig]);
    try {
        const r = await api("manage-pickups", "help-ask", { child_ids: kids, what: tekst, date: datum, time: tijd || null, recipients: aan });
        zetHulpLijst([hulpVanServer(r.help), ...ophalenState().hulp.filter((h) => h.id !== tijdelijk.id)]);
        return true;
    }
    catch (e) {
        zetHulpLijst(ophalenState().hulp.filter((h) => h.id !== tijdelijk.id));
        meldFout(e);
        return false;
    }
}
/** De vrager trekt een verzoek in. */
export async function trekHulpIn(id) {
    if (String(id).startsWith("tmp-"))
        return false;
    const vorig = ophalenState().hulp;
    zetHulpLijst(vorig.map((h) => (h.id === id ? { ...h, status: "withdrawn" } : h)));
    try {
        await api("manage-pickups", "help-withdraw", { id });
        return true;
    }
    catch (e) {
        zetHulpLijst(vorig);
        meldFout(e);
        return false;
    }
}
/** Kringlid: "Ik regel het" (accept) of "Kan niet" (decline, optionele reden). */
export async function reageerHulp(id, antwoord, reden) {
    const vorig = alsVerzorgerState().hulp;
    zetAlsVerzorger({ hulp: vorig.map((h) => (h.id === id ? { ...h, status: antwoord === "accept" ? "accepted" : h.status, ontvangers: h.ontvangers.map((o) => ({ ...o, status: antwoord === "accept" ? "accepted" : "declined" })) } : h)) });
    try {
        const r = await api("manage-pickups", "help-respond", { id, answer: antwoord, ...(antwoord === "decline" && reden ? { reason: reden } : {}) });
        const nieuw = hulpVanServer(r.help);
        zetAlsVerzorger({ hulp: alsVerzorgerState().hulp.map((h) => (h.id === id ? nieuw : h)) });
        return true;
    }
    catch (e) {
        zetAlsVerzorger({ hulp: vorig });
        meldFout(e);
        if (e?.code === "NOT_OPEN" || e?.code === "NOT_FOUND")
            laadAlsVerzorger();
        return false;
    }
}
/** Status van een verzoek voor de ouder, als korte tekst. */
export function hulpStatusTekst(h) {
    const t = (k, o) => i18n.t(k, o);
    if (h.status === "accepted")
        return t("components.HulpVragen.regeltDit", { naam: h.ontvangers.find((o) => o.id === h.geaccepteerdDoor)?.naam || h.geaccepteerdNaam || "" });
    if (h.status === "withdrawn")
        return t("components.HulpVragen.ingetrokken");
    if (h.status === "declined")
        return t("components.HulpVragen.niemandKan");
    return t("components.HulpVragen.wacht");
}
