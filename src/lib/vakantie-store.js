import { useSyncExternalStore } from "react";
import i18n from "@/i18n";
import { api } from "@/lib/api";
import { laadOokBij, meldFout, online, startAgendaSync } from "@/lib/agenda-store";
/**
 * Vakanties en bijzondere dagen van het eigen gezin (bron: manage-vacations). Een voorstel wordt pas
 * "Afgesproken" na akkoord van de andere ouder; een lopende wijziging bewaart de afgesproken velden op
 * hetzelfde record (`afgesproken`); niet akkoord zet die terug; intrekken is definitief. Zonder gekoppelde
 * andere ouder is een voorstel meteen afgesproken (de server beslist). School- en feestdagen worden in de
 * app berekend en staan hier niet in.
 * Kijker-relatief, zoals elders in de app: ouder/van "Sanne" = jij, "Joris" = de andere ouder (geen namen).
 */
let lijst = [];
let verbonden = false;
let geladen = false;
const ls = new Set();
const zet = (n) => { lijst = n; ls.forEach((l) => l()); };
const OUDER = { ik: "Sanne", ander: "Joris", samen: "Samen", open: "Nog open" };
const naarOuder = (r) => OUDER[r] ?? "Nog open";
const naarRel = (o) => (o === "Sanne" ? "ik" : o === "Joris" ? "ander" : o === "Samen" ? "samen" : "open");
const ACTIE = {
    get voorstel() { return i18n.t("lib.vakantieStore.actie.voorgesteld"); },
    get afgesproken() { return i18n.t("lib.vakantieStore.actie.afgesproken"); },
    get annuleringAfgesproken() { return i18n.t("lib.vakantieStore.actie.annuleringAfgesproken"); },
    get ingetrokken() { return i18n.t("lib.vakantieStore.actie.ingetrokken"); },
    get anderVoorstel() { return i18n.t("common.anderVoorstel"); },
    get nietAkkoord() { return i18n.t("common.nietAkkoord"); },
};
const velden = (f) => (f ? { ...f, ouder: naarOuder(f.ouder), verdeling: (f.verdeling ?? []).map((d) => ({ ...d, ouder: naarOuder(d.ouder) })) } : undefined);
function vanServer(r) {
    return {
        ...velden(r), id: r.id, status: r.status, van: r.van === "ik" ? "Sanne" : r.van === "ander" ? "Joris" : undefined,
        afgesproken: velden(r.afgesproken), reactie: r.reactie ?? undefined, reactieDatum: r.reactieDatum ?? undefined, meerTijd: r.meerTijd ?? undefined,
        geschiedenis: (r.geschiedenis ?? []).map((g) => ({ datum: g.datum, door: g.door === "ik" ? "Sanne" : "Joris", get actie() { return ACTIE[g.actie] ?? g.actie; }, velden: velden(g.velden) ?? {} })),
    };
}
const naarServer = (v) => ({ ...v, ouder: naarRel(v.ouder), verdeling: (v.verdeling ?? []).map((d) => ({ ...d, ouder: naarRel(d.ouder) })) });
export async function laadVakanties() {
    if (!online())
        return;
    try {
        const r = await api("manage-vacations", "list");
        verbonden = !!r.connected;
        geladen = true;
        zet((r.vacations ?? []).map(vanServer));
    }
    catch (e) {
        meldFout(e);
    }
}
laadOokBij(laadVakanties);
function stuur(actie, body) {
    if (!online())
        return;
    api("manage-vacations", actie, body).then(() => laadVakanties(), (e) => { meldFout(e); laadVakanties(); });
}
export function useVakanties() {
    startAgendaSync();
    return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => lijst, () => lijst);
}
const veldenVan = (v) => { const { id, status, van, afgesproken, geschiedenis, reactie, meerTijd, ...rest } = v; return rest; };
export function voegVakantieVoorstelToe(v) {
    const id = `tmp-${crypto.randomUUID()}`;
    zet([...lijst, { ...v, id, status: verbonden ? "voorstel" : "afgesproken", van: verbonden ? "Sanne" : undefined, geschiedenis: [] }]);
    stuur("propose", { fields: naarServer(v) });
    return id;
}
/** Ander voorstel of wijziging van een afgesproken vakantie; de afgesproken velden blijven gelden tot akkoord. */
export function wijzigVakantieVoorstel(id, nieuw) {
    const v = lijst.find((x) => x.id === id);
    if (!v || v.status === "ingetrokken" || (v.status === "voorstel" && v.van === "Sanne"))
        return false;
    const afgesproken = v.afgesproken ?? (v.status === "afgesproken" ? veldenVan(v) : undefined);
    zet(lijst.map((x) => (x.id === id ? { ...x, ...nieuw, afgesproken: verbonden ? afgesproken : undefined, status: verbonden ? "voorstel" : "afgesproken", van: verbonden ? "Sanne" : undefined, reactie: undefined } : x)));
    stuur("amend", { id, fields: naarServer({ ...veldenVan(v), ...nieuw }) });
    return true;
}
export const actieveVakantie = (v) => (v.status === "afgesproken" && !v.annuleren ? v : v.afgesproken);
export function stelVerdelingVoor(id, ouder) {
    const v = lijst.find((x) => x.id === id);
    if (!v || v.status !== "open")
        return false;
    zet(lijst.map((x) => (x.id === id ? { ...x, ouder, status: verbonden ? "voorstel" : "afgesproken", van: verbonden ? "Sanne" : undefined } : x)));
    stuur("set-split", { id, ouder: naarRel(ouder) });
    return true;
}
/** Akkoord: pas nu wordt het "Afgesproken". Alleen de andere ouder. */
export function accepteerVakantie(id) {
    const v = lijst.find((x) => x.id === id);
    if (!v || v.status !== "voorstel" || v.van !== "Joris")
        return false;
    zet(lijst.map((x) => (x.id === id ? { ...x, status: "afgesproken", afgesproken: undefined } : x)));
    stuur("respond", { id, response: "akkoord" });
    return true;
}
/** Niet akkoord: het voorstel vervalt; een eerder afgesproken verdeling blijft gelden. */
export function wijsVakantieAf(id) {
    const v = lijst.find((x) => x.id === id);
    if (!v || v.status !== "voorstel" || v.van !== "Joris")
        return false;
    zet(lijst.map((x) => (x.id === id ? { ...(v.afgesproken ?? x), id: x.id, status: v.afgesproken ? "afgesproken" : "open", van: undefined, afgesproken: undefined, reactie: "niet-akkoord", geschiedenis: x.geschiedenis } : x)));
    stuur("respond", { id, response: "niet-akkoord" });
    return true;
}
/** Meer tijd nodig: het voorstel blijft open, zonder instemming. */
export function vraagMeerTijdVakantie(id) {
    const v = lijst.find((x) => x.id === id);
    if (!v || v.status !== "voorstel" || v.van !== "Joris")
        return false;
    zet(lijst.map((x) => (x.id === id ? { ...x, meerTijd: { mine: true, datum: new Date().toISOString().slice(0, 10) } } : x)));
    stuur("respond", { id, response: "meer-tijd" });
    return true;
}
/** Intrekken door de indiener: definitief, het record blijft bewaard. */
export function trekVakantieIn(id) {
    const v = lijst.find((x) => x.id === id);
    if (!v || v.status !== "voorstel" || v.van !== "Sanne")
        return false;
    zet(lijst.map((x) => (x.id === id ? { ...x, status: "ingetrokken" } : x)));
    stuur("withdraw", { id });
    return true;
}
/** Verdeelhulp: telt afgesproken vakanties per ouder en stelt voor open vakanties om-en-om voor. Alleen een suggestie. */
export function verdeelSuggestie(l) {
    const telling = { Sanne: 0, Joris: 0 };
    l.forEach((v) => { if (v.status === "afgesproken" && (v.ouder === "Sanne" || v.ouder === "Joris"))
        telling[v.ouder]++; });
    let volgende = telling.Sanne <= telling.Joris ? "Sanne" : "Joris";
    const voorstel = l.filter((v) => v.status === "open").map((v) => { const o = volgende; volgende = o === "Sanne" ? "Joris" : "Sanne"; return { id: v.id, naam: v.naam, periode: v.periode, ouder: o }; });
    return { telling, voorstel };
}
export const vakantieLijst = () => lijst;
export const vakantiesVerbonden = () => verbonden;
/** Is de lijst al een keer van de server gekomen? (zo toont een directe link niet te vroeg "niet gevonden") */
export const vakantiesGeladen = () => geladen || !online();
/** Alleen voor tests. */
export const zetVakantiesVoorTest = (l, v = true) => { verbonden = v; zet(l); };
