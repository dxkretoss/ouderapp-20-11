import { useSyncExternalStore } from "react";
import i18n, { taalLocale } from "@/i18n";
import { onderlingeAfspraken } from "./demo-data";
const t = (k, o) => i18n.t(`lib.afsprakenStore.${k}`, o);
/* ---------- model: één afspraak = één bronobject met versies en gebeurtenissen ---------- */
// `groep` is de opgeslagen (Nederlandse) waarde van `onderwerp`; labels worden bij het tonen vertaald.
const onderwerpSleutel = { "Halen & brengen": "halenBrengen", "Planning & wijzigingen": "planning", Contact: "contact", Kinderen: "kinderen", "School & opvang": "school", Gezondheid: "gezondheid", Kosten: "kosten", Vakanties: "vakanties", Overig: "overig" };
export const ONDERWERPEN = [
    ["halenBrengen", "Halen & brengen"], ["planning", "Planning & wijzigingen"], ["contact", "Contact"],
    ["kinderen", "Kinderen"], ["school", "School & opvang"], ["gezondheid", "Gezondheid"], ["kosten", "Kosten"],
    ["vakanties", "Vakanties"], ["overig", "Overig"],
].map(([id, groep]) => ({ id, groep, get label() { return t(`onderwerpKeuze.${id}`); } }));
/** Weergavenaam van een opgeslagen onderwerp. */
export const onderwerpLabel = (g) => (onderwerpSleutel[g] ? t(`onderwerp.${onderwerpSleutel[g]}`) : g);
export const IK = "Sanne";
export const ANDER = "Joris";
export const PRO = "Lotte Jansen";
export const proLabel = () => t("proLabel");
// Opslagwaarde blijft Nederlands ("5 oktober 2026"): geschiedenisDatum leest dit terug. Tonen gaat via toonDatum.
export const vandaag = () => new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
export const metPro = { soort: "professional", get label() { return proLabel(); } };
/** Vertaalde getters op seed-objecten, zodat de tekst pas bij het lezen wordt bepaald. */
function vertaal(obj, sleutel, velden) {
    for (const v of velden)
        Object.defineProperty(obj, v, { get: () => t(`${sleutel}.${v}`), enumerable: true, configurable: true });
    return obj;
}
const seed = (basis, velden = ["titel", "tekst"]) => vertaal(basis, `seed.${basis.id}`, velden);
const gb = (datum, sleutel) => ({ datum, get tekst() { return t(`geschiedenis.${sleutel}`); } });
const seedVoorstel = (id, v) => vertaal(v, `seed.${id}.voorstel`, ["tekst"]);
// Demo-gegevens. Herkomst en datums alleen waar bekend; "Overdracht blijft praktisch" heeft een voorbeeldvoorstel van Joris.
const start = [
    seed({ id: "a1", onderwerp: "Halen & brengen", kind: "Emma & Noah", status: "Actief", afgesprokenOp: "1 oktober 2025", geldtVanaf: "1 oktober 2025", afgesprokenDoor: "Sanne & Joris", versies: [], geschiedenis: [gb("1 oktober 2025", "gemaaktDoorBeiden")] }, ["titel", "tekst", "koppeling"]),
    seed({ id: "a3", onderwerp: "Halen & brengen", kind: "Emma & Noah", status: "Actief", afgesprokenOp: "12 april 2026", geldtVanaf: "12 april 2026", afgesprokenDoor: "Sanne & Joris", versies: [],
        voorstel: seedVoorstel("a3", { soort: "wijziging", door: ANDER, datum: "5 oktober 2026", akkoord: { Joris: true } }),
        geschiedenis: [gb("5 oktober 2026", "jorisWijziging"), gb("12 april 2026", "gemaakt")] }),
    seed({ id: "v1", veiligheid: true, onderwerp: "Halen & brengen", kind: "Emma & Noah", status: "Actief", afgesprokenOp: "2 juni 2026", geldtVanaf: "2 juni 2026", bron: metPro, evaluatie: "15 oktober 2026", versies: [],
        voorstel: seedVoorstel("v1", { soort: "wijziging", door: PRO, datum: "25 september 2026", akkoord: { Sanne: true } }),
        geschiedenis: [gb("25 september 2026", "sanneAkkoordWijziging"), gb("25 september 2026", "lotteWijzigingEvaluatie"), gb("2 juni 2026", "vastgelegdMetLotte")] }),
    seed({ id: "a2", onderwerp: "Planning & wijzigingen", kind: "Emma & Noah", status: "Actief", afgesprokenOp: "3 maart 2026", geldtVanaf: "3 maart 2026", bron: metPro, evaluatie: "15 oktober 2026", versies: [], geschiedenis: [gb("3 maart 2026", "vastgelegdMetLotte")] }, ["titel", "tekst", "koppeling"]),
    seed({ id: "f1", formeel: true, onderwerp: "Planning & wijzigingen", kind: "Emma & Noah", status: "Actief", geldtVanaf: "14 november 2025", bron: { soort: "document", get label() { return t("bronBeschikking"); }, datum: "14 november 2025", document: true }, versies: [], geschiedenis: [gb("14 november 2025", "uitBeschikking")] }),
    seed({ id: "a4", onderwerp: "Contact", kind: "Emma & Noah", status: "Actief", afgesprokenOp: "12 april 2026", geldtVanaf: "12 april 2026", afgesprokenDoor: "Sanne & Joris", versies: [], geschiedenis: [gb("12 april 2026", "gemaakt")] }),
    seed({ id: "v2", veiligheid: true, onderwerp: "Contact", kind: "Emma & Noah", status: "Actief", afgesprokenOp: "2 juni 2026", geldtVanaf: "2 juni 2026", bron: metPro, evaluatie: "1 december 2026", versies: [], geschiedenis: [gb("2 juni 2026", "vastgelegdMetLotte")] }),
];
// Onderlinge afspraken uit de vroegere lijst "Onze afspraken" — nu in deze ene bron.
const onderwerpVan = { o1: "Kinderen", o2: "Kinderen", o3: "Halen & brengen", o4: "Kinderen", o5: "Vakanties", o6: "Gezondheid" };
const onderling = [
    ...onderlingeAfspraken.map((a) => ({ id: a.id, get titel() { return a.titel; }, get tekst() { return a.tekst; }, onderwerp: onderwerpVan[a.id] ?? "Overig", kind: "Emma & Noah", status: "Actief",
        afgesprokenDoor: "Sanne & Joris", versies: [], geschiedenis: [{ get datum() { return a.gewijzigd.replace(/^\D+/, ""); }, get tekst() { return t("geschiedenis.bijgewerkt"); } }, gb("12 september 2025", "gemaaktDoorBeiden")] })),
    seed({ id: "x2", onderwerp: "Kinderen", kind: "Emma", status: "Actief", afgesprokenOp: "20 februari 2026", geldtVanaf: "20 februari 2026", afgesprokenDoor: "Sanne & Joris", versies: [], geschiedenis: [gb("20 februari 2026", "jorisVoorstelSanneAkkoord")] }),
    seed({ id: "x3", onderwerp: "Halen & brengen", kind: "Noah", status: "Actief", afgesprokenOp: "3 januari 2026", geldtVanaf: "3 januari 2026", afgesprokenDoor: "Sanne & Joris", versies: [], geschiedenis: [gb("3 januari 2026", "gemaaktDoorBeiden")] }),
];
/** Wie moet nog instemmen? Een professional telt nooit als akkoord van ouders. */
export const nodig = (v) => [IK, ANDER].filter((o) => !v.akkoord[o]);
export const wachtOpMij = (a) => !!a.voorstel && nodig(a.voorstel).includes(IK);
export const naam = (wie) => (wie === IK ? t("jij") : wie === PRO ? "Lotte" : wie);
const zinSoort = (v) => (v.soort === "nieuw" ? "nieuw" : v.soort === "stoppen" ? "stoppen" : "wijziging");
export const zin = (v) => t(`zin.${zinSoort(v)}`);
/** Volledige zin "<wie> stelt … voor"; `jij` kiest de vervoeging voor de gebruiker zelf. */
export const voorstelZin = (v, wieNaam, jij = false) => t(`${jij ? "regelJij" : "regel"}.${zinSoort(v)}`, { naam: wieNaam });
export function voerUit(a) {
    const v = a.voorstel;
    if (!v || nodig(v).length)
        return a;
    const d = vandaag();
    if (v.soort === "nieuw")
        return { ...a, tekst: v.tekst ?? a.tekst, status: "Actief", voorstel: undefined, afgesprokenOp: d, geldtVanaf: d, afgesprokenDoor: v.door === PRO ? undefined : "Sanne & Joris", geschiedenis: [{ datum: d, tekst: t("geschiedenis.gaatIn") }, ...a.geschiedenis] };
    if (v.soort === "stoppen")
        return { ...a, status: "Gestopt", gestoptOp: d, voorstel: undefined, geschiedenis: [{ datum: d, tekst: t("geschiedenis.gestopt") }, ...a.geschiedenis] };
    if (!v.tekst)
        return a;
    return { ...a, tekst: v.tekst, voorstel: undefined, geldtVanaf: d, versies: [{ tekst: a.tekst, tot: d }, ...a.versies], geschiedenis: [{ datum: d, tekst: t("geschiedenis.nieuweVersie", { oud: a.tekst, nieuw: v.tekst }) }, ...a.geschiedenis] };
}
/** Eén bron voor alle afspraken; elk object heeft een versienummer om gelijktijdige wijzigingen te herkennen. */
// Geen spread: zo blijven de vertaalde getters van de seeds behouden.
let lijst = [...start, ...onderling].map((a) => { a.versie = 1; return a; });
const ls = new Set();
export const afsprakenState = () => lijst;
/** Only the author can withdraw a pending proposal; the existing agreement is retained. */
export function trekAfspraakIn(id, door = IK) {
    const a = lijst.find((x) => x.id === id);
    const v = a?.voorstel;
    if (!a || !v || v.door !== door || !nodig(v).length)
        return false;
    zetAfspraken((l) => l.map((x) => x.id === id ? { ...x, voorstel: undefined, status: v.soort === "nieuw" ? "Ingetrokken" : x.status,
        geschiedenis: [{ datum: vandaag(), tekst: t("geschiedenis.ingetrokken", { door, tekst: v.tekst ?? x.tekst }) }, ...x.geschiedenis] } : x));
    return true;
}
export function zetAfspraken(f) {
    const oud = new Map(lijst.map((a) => [a.id, a]));
    lijst = f(lijst).map((a) => { const o = oud.get(a.id); return o === a ? o : { ...a, versie: (o?.versie ?? 0) + 1 }; });
    ls.forEach((l) => l());
}
export function useAfspraken() {
    return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => lijst, () => lijst);
}
/** Eigen voorstellen die nog op de ander wachten (Home: "Afstemming loopt"). */
export const eigenOpenVoorstellen = (l) => l.filter((a) => a.voorstel && a.voorstel.door === IK && nodig(a.voorstel).length > 0);
// Alleen voor het teruglezen van opgeslagen Nederlandse datums (geen weergave).
const maandNamen = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
/** "5 oktober 2026" → Date; zonder jaartal of onbekend → null (lezers verzinnen dan geen datum). */
export function geschiedenisDatum(t) {
    const m = /^(\d{1,2}) ([a-z]+) (\d{4})$/.exec(t.trim());
    const i = m ? maandNamen.indexOf(m[2]) : -1;
    return m && i >= 0 ? new Date(Number(m[3]), i, Number(m[1]), 12) : null;
}
/** Opgeslagen Nederlandse datum ("5 oktober 2026" of "2 maart") tonen in de taal van de app. Onbekend → ongewijzigd. */
export function toonDatum(tekst, zonderJaar = false) {
    if (!tekst)
        return tekst;
    const d = geschiedenisDatum(tekst);
    if (d)
        return d.toLocaleDateString(taalLocale(), zonderJaar ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
    const m = /^(\d{1,2}) ([a-z]+)$/.exec(tekst.trim());
    const i = m ? maandNamen.indexOf(m[2]) : -1;
    return m && i >= 0 ? new Date(2026, i, Number(m[1]), 12).toLocaleDateString(taalLocale(), { day: "numeric", month: "long" }) : tekst;
}
/** Unchanged demo seeds are not presented as agreements the user entered. Deep links and request sources retain them. */
export function isIngevuldeAfspraak(a) {
    return (a.versie ?? 0) > 1 || ![...start, ...onderling].some((seed) => seed.id === a.id);
}
