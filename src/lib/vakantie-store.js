import { useSyncExternalStore } from "react";
import i18n from "@/i18n";
import { leg } from "@/lib/audit-store";
let lijst = [
    { id: "v1", get naam() { return i18n.t("lib.vakantieStore.seed.v1.naam"); }, get periode() { return i18n.t("lib.vakantieStore.seed.v1.periode"); }, vanDatum: "2026-02-14", totDatum: "2026-02-22", ouder: "Joris", get details() { return i18n.t("lib.vakantieStore.seed.v1.details"); }, buitenland: true, get bestemming() { return i18n.t("lib.vakantieStore.seed.v1.bestemming"); }, status: "afgesproken" },
    { id: "v2", get naam() { return i18n.t("lib.vakantieStore.seed.v2.naam"); }, get periode() { return i18n.t("lib.vakantieStore.seed.v2.periode"); }, vanDatum: "2026-04-05", totDatum: "2026-04-06", soort: "bijzonder", ouder: "Samen", get details() { return i18n.t("lib.vakantieStore.seed.v2.details"); }, status: "afgesproken" },
    { id: "v3", get naam() { return i18n.t("lib.vakantieStore.seed.v3.naam"); }, get periode() { return i18n.t("lib.vakantieStore.seed.v3.periode"); }, vanDatum: "2026-04-25", totDatum: "2026-05-03", ouder: "Sanne", get details() { return i18n.t("lib.vakantieStore.seed.v3.details"); }, status: "afgesproken" },
    { id: "v4", get naam() { return i18n.t("lib.vakantieStore.seed.v4.naam"); }, get periode() { return i18n.t("lib.vakantieStore.seed.v4.periode"); }, vanDatum: "2026-07-18", totDatum: "2026-08-02", ouder: "Nog open", details: "", status: "open" },
    { id: "v5", get naam() { return i18n.t("lib.vakantieStore.seed.v5.naam"); }, get periode() { return i18n.t("lib.vakantieStore.seed.v5.periode"); }, vanDatum: "2026-08-03", totDatum: "2026-08-30", ouder: "Joris", details: "", status: "voorstel", van: "Joris" },
    { id: "v6", get naam() { return i18n.t("lib.vakantieStore.seed.v6.naam"); }, get periode() { return i18n.t("lib.vakantieStore.seed.v6.periode"); }, vanDatum: "2026-12-24", totDatum: "2026-12-26", soort: "bijzonder", ouder: "Nog open", details: "", status: "open" },
];
const ls = new Set();
const zet = (n) => { lijst = n; ls.forEach((l) => l()); };
export function useVakanties() {
    return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => lijst, () => lijst);
}
const veldenVan = (v) => { const { id, status, van, afgesproken, geschiedenis, reactie, ...velden } = v; return velden; };
const historiseer = (v, door, actie) => [...(v.geschiedenis ?? []), { datum: new Date().toISOString(), door, actie, velden: veldenVan(v) }];
export function voegVakantieVoorstelToe(v) {
    const id = `v-${crypto.randomUUID()}`;
    zet([...lijst, { ...v, id, status: "voorstel", van: "Sanne", geschiedenis: [] }]);
    leg("schema", id, v.naam, "CREATED", undefined, "Sanne", { ...(v.kinderen ? { kinderen: v.kinderen } : {}), meta: { betreft: v.periode, type: v.soort ?? "vakantie" } });
    return id;
}
/** A pending revision remains on the original record; its confirmed fields stay effective. */
export function wijzigVakantieVoorstel(id, velden, door = "Sanne") {
    const v = lijst.find((x) => x.id === id);
    if (!v || v.status === "ingetrokken" || (v.status === "voorstel" && v.van === door))
        return false;
    const afgesproken = v.afgesproken ?? (v.status === "afgesproken" ? veldenVan(v) : undefined);
    zet(lijst.map((x) => x.id === id ? { ...x, ...velden, afgesproken, status: "voorstel", van: door, reactie: undefined, geschiedenis: historiseer(v, door, i18n.t("common.anderVoorstel")) } : x));
    leg("schema", id, v.naam, "CREATED", undefined, door, { ...(velden.kinderen ? { kinderen: velden.kinderen } : {}), meta: { betreft: velden.periode, type: i18n.t("lib.vakantieStore.vakantiewijziging") } });
    return true;
}
export const actieveVakantie = (v) => v.status === "afgesproken" && !v.annuleren ? v : v.afgesproken;
export const stelVerdelingVoor = (id, ouder) => zet(lijst.map((v) => (v.id === id && v.status === "open" ? { ...v, ouder, status: "voorstel", van: "Sanne" } : v)));
/** Akkoord: pas nu wordt het "Afgesproken". */
export function accepteerVakantie(id, door = "Joris") {
    const v = lijst.find((x) => x.id === id);
    if (!v || v.status !== "voorstel" || !v.van || v.van === door)
        return false;
    zet(lijst.map((x) => x.id === id ? { ...x, status: "afgesproken", afgesproken: undefined, geschiedenis: historiseer(v, door, v.annuleren ? i18n.t("lib.vakantieStore.actie.annuleringAfgesproken") : i18n.t("lib.vakantieStore.actie.afgesproken")) } : x));
    leg("schema", id, v.naam, "ACCEPTED", undefined, door, { ...(v.kinderen ? { kinderen: v.kinderen } : {}), meta: { betreft: v.periode, type: v.soort ?? "vakantie" } });
    return true;
}
/** Niet akkoord: het voorstel vervalt en de vakantie is weer "nog niet geregeld"; bestaande verdeling blijft gelden. */
export function wijsVakantieAf(id, door = "Sanne") {
    const v = lijst.find((x) => x.id === id);
    if (!v || v.status !== "voorstel" || !v.van || v.van === door)
        return false;
    zet(lijst.map((x) => x.id === id ? { ...(v.afgesproken ?? x), id: x.id, status: v.afgesproken ? "afgesproken" : "open", van: undefined, afgesproken: undefined, reactie: "niet-akkoord", geschiedenis: historiseer(v, door, i18n.t("common.nietAkkoord")) } : x));
    leg("schema", id, v.naam, "DECLINED", undefined, door, { ...(v.kinderen ? { kinderen: v.kinderen } : {}), meta: { betreft: v.periode } });
    return true;
}
/** Withdrawal retains the same source object and is final. */
export function trekVakantieIn(id, door = "Sanne") {
    const v = lijst.find((x) => x.id === id);
    if (!v || v.status !== "voorstel" || v.van !== door)
        return false;
    zet(lijst.map((x) => x.id === id ? { ...x, status: "ingetrokken", geschiedenis: historiseer(v, door, i18n.t("lib.vakantieStore.actie.ingetrokken")) } : x));
    return true;
}
/** Verdeelhulp: telt afgesproken vakanties per ouder en stelt voor open vakanties om-en-om voor, beginnend bij wie het minst heeft. De telling weegt de lengte van een vakantie niet mee, dus ze zegt niets over wat eerlijk of passend is. Alleen een suggestie; niets verandert vanzelf. */
export function verdeelSuggestie(l) {
    const telling = { Sanne: 0, Joris: 0 };
    l.forEach((v) => { if (v.status === "afgesproken" && (v.ouder === "Sanne" || v.ouder === "Joris"))
        telling[v.ouder]++; });
    let volgende = telling.Sanne <= telling.Joris ? "Sanne" : "Joris";
    const voorstel = l.filter((v) => v.status === "open").map((v) => { const o = volgende; volgende = o === "Sanne" ? "Joris" : "Sanne"; return { id: v.id, naam: v.naam, periode: v.periode, ouder: o }; });
    return { telling, voorstel };
}
export const vakantieLijst = () => lijst;
