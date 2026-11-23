/**
 * Professionele werkruimte: contactjournaal, interne notities, acties voor ouders, berichten, gezamenlijke afspraken,
 * veiligheidsafspraken, doelen, dossiergegevens, betrokken professionals en een append-only activiteitenlog.
 * Soorten blijven technisch gescheiden:
 *  - "notitie"  : interne professionele notitie — nooit zichtbaar voor ouders, nooit in Berichten, standaard niet in exports.
 *  - "journaal" : contactjournaal — zichtbaarheid wordt vóór opslaan expliciet gekozen (geen standaard delen).
 *  - "bericht"  : bericht aan één of beide ouders; ouders zien exact dezelfde tekst. Gezien ≠ akkoord.
 *  - wat ouders zien loopt altijd via voorOudersVan(), zodat de "Bekijk als ouder"-weergave en de ouderapp gelijk blijven.
 * Organisaties: elke professional draagt optioneel een organisatieId, zodat later organisatie → medewerkers → dossiers kan.
 */
import { useSyncExternalStore } from "react";
import i18n, { taalLocale } from "@/i18n";
const T = (k, o) => i18n.t(`lib.proJournaalStore.${k}`, o);
/** Opgeslagen waarden blijven Nederlands (logica); weergave via contactTypeLabel(). */
export const contactTypes = ["Gesprek", "Telefonisch", "Videogesprek", "E-mail", "Overleg", "Huisbezoek", "Anders"];
const contactTypeSleutel = { Gesprek: "gesprek", Telefonisch: "telefonisch", Videogesprek: "videogesprek", "E-mail": "email", Overleg: "overleg", Huisbezoek: "huisbezoek", Anders: "anders" };
export const contactTypeLabel = (t) => (contactTypeSleutel[t] ? T(`contactType.${contactTypeSleutel[t]}`) : t);
export const zichtLabel = {
    get professionals() { return T("zicht.professionals"); },
    get ouders() { return T("zicht.ouders"); },
    get aangepast() { return T("zicht.aangepast"); },
};
/** Weergave van een ontvanger/toewijzing: "Beide ouders" is een waarde, namen blijven namen. */
export const ontvangerLabel = (v) => (v === "Beide ouders" ? T("beideOuders") : v);
/** Vaste waarden in betrokkenen/zichtVoor ("Collega", "Professionals met toegang") vertaald tonen. */
export const persoonLabel = (v) => (v === "Collega" ? T("collega") : v === "Professionals met toegang" ? T("professionalsMetToegang") : ontvangerLabel(v));
/** De ingelogde professional in de demo. */
export const IK = "Marloes";
export const alleRechten = ["agenda", "regeling", "communicatie", "berichten", "journaal", "notities", "docBekijken", "docToevoegen", "acties", "veiligBekijken", "veiligBeheren", "export"];
/** Labels worden pas bij het lezen vertaald (getters). */
export const rechtLabel = {};
alleRechten.forEach((r) => Object.defineProperty(rechtLabel, r, { get: () => T(`recht.${r}`), enumerable: true }));
/** Opgeslagen rolwaarden blijven Nederlands; weergave via rolLabel(). */
export const proRollen = ["Mediator", "Gezinscoach", "Jeugdzorgwerker", "Scheidingscoach", "Advocaat / juridisch professional", "Andere professional"];
const rolSleutel = { Mediator: "mediator", Gezinscoach: "gezinscoach", Jeugdzorgwerker: "jeugdzorgwerker", Scheidingscoach: "scheidingscoach", "Advocaat / juridisch professional": "advocaat", "Andere professional": "andere" };
export const rolLabel = (r) => (rolSleutel[r] ? T(`rol.${rolSleutel[r]}`) : r);
const d = (dagen) => { const x = new Date(); x.setDate(x.getDate() + dagen); return x.toISOString().slice(0, 10); };
export const vandaagIso = () => new Date().toISOString().slice(0, 10);
export const dagenTot = (iso) => Math.round((Date.parse(iso) - Date.parse(vandaagIso())) / 86_400_000);
export const datumKort = (iso) => new Date(iso).toLocaleDateString(taalLocale(), { day: "numeric", month: "long" });
export const MAX_PINS = 4;
/** Statuswaarden (Nederlands, voor logica) → weergave. */
const actieStatusSleutel = { Afgerond: "afgerond", Verlopen: "verlopen", Open: "open" };
export const actieStatusLabel = (st) => (actieStatusSleutel[st] ? T(`actieStatus.${actieStatusSleutel[st]}`) : st);
const doelStatusSleutel = { "Te bespreken": "teBespreken", "In uitvoering": "inUitvoering", Afgerond: "afgerond" };
export const doelStatusLabel = (st) => (doelStatusSleutel[st] ? T(`doelStatus.${doelStatusSleutel[st]}`) : st);
const dossierStatusSleutel = { Actief: "actief", Gepauzeerd: "gepauzeerd", Afgerond: "afgerond" };
export const dossierStatusLabel = (st) => (dossierStatusSleutel[st] ? T(`dossierStatus.${dossierStatusSleutel[st]}`) : st);
/** Vastgepinde voorbeeldteksten (seed) vertaald tonen; zelf ingevoerde pins blijven zoals ingevoerd. */
const seedPins = { "Wisselmoment via school": "wisselmomentSchool", "Evaluatie zorgregeling gepland op 18 november": "evaluatieGepland", "Communicatie uitsluitend via de app": "alleenViaApp" };
export const pinLabel = (p) => (seedPins[p] ? T(`seed.pins.${seedPins[p]}`) : p);
const allesBehalveBeheer = ["agenda", "regeling", "communicatie", "berichten", "journaal", "notities", "docBekijken", "docToevoegen", "acties", "veiligBekijken", "export"];
let state = {
    journaal: [
        { id: "j1", dossier: "jansen", moment: "2026-09-22T11:30", type: "Gesprek", betrokkenen: ["Sophie", "Mark"], get onderwerp() { return T("seed.j1.onderwerp"); }, get notitie() { return T("seed.j1.notitie"); }, zicht: "ouders", zichtVoor: [] },
        { id: "j2", dossier: "jansen", moment: "2026-09-29T09:10", type: "Telefonisch", betrokkenen: ["Sophie"], get onderwerp() { return T("seed.j2.onderwerp"); }, get notitie() { return T("seed.j2.notitie"); }, zicht: "professionals", zichtVoor: [] },
        { id: "j3", dossier: "bakker", moment: "2026-09-25T10:00", type: "Gesprek", betrokkenen: ["Sanne", "Joris"], get onderwerp() { return T("seed.j3.onderwerp"); }, get notitie() { return T("seed.j3.notitie"); }, zicht: "ouders", zichtVoor: [] },
    ],
    notities: [{ id: "n1", dossier: "jansen", moment: "2026-09-24T16:10", get tekst() { return T("seed.n1"); } }],
    acties: [
        { id: "a1", dossier: "jansen", get tekst() { return T("seed.a1.tekst"); }, voor: "Beide ouders", deadline: d(-1), prioriteit: "normaal", klaar: false },
        { id: "a2", dossier: "deboer", get tekst() { return T("seed.a2.tekst"); }, voor: "Beide ouders", deadline: d(3), prioriteit: "normaal", klaar: false },
        { id: "a3", dossier: "bakker", get tekst() { return T("seed.a3.tekst"); }, get omschrijving() { return T("seed.a3.omschrijving"); }, voor: "Beide ouders", deadline: d(5), prioriteit: "normaal", klaar: false },
        { id: "a4", dossier: "smit", get tekst() { return T("seed.a4.tekst"); }, voor: "Iris", deadline: d(-2), prioriteit: "hoog", klaar: false },
        { id: "a5", dossier: "jansen", get tekst() { return T("seed.a5.tekst"); }, voor: IK, deadline: d(0), prioriteit: "normaal", klaar: false },
        { id: "a6", dossier: "deboer", get tekst() { return T("seed.a6.tekst"); }, voor: IK, deadline: d(0), prioriteit: "normaal", klaar: false },
        { id: "a7", dossier: "smit", get tekst() { return T("seed.a7.tekst"); }, voor: IK, deadline: d(1), prioriteit: "normaal", klaar: false },
        { id: "a8", dossier: "bakker", get tekst() { return T("seed.a8.tekst"); }, voor: IK, deadline: d(3), prioriteit: "normaal", klaar: false },
    ],
    log: Object.freeze([
        Object.freeze({ id: "l1", dossier: "bakker", moment: "2026-09-25T10:40", get tekst() { return T("seed.l1"); }, door: IK, soort: "contact" }),
        Object.freeze({ id: "l2", dossier: "bakker", moment: "2026-09-28T14:00", get tekst() { return T("seed.l2"); }, door: IK, soort: "veiligheid" }),
        Object.freeze({ id: "l3", dossier: "jansen", moment: "2026-10-01T09:00", get tekst() { return T("seed.l3"); }, door: "Sophie", soort: "wijzigingen" }),
    ]),
    meldingen: { actie: true, document: false, gezamenlijk: true, evaluatie: true, druk: true, wijziging: true },
    berichten: [
        { id: "b1", dossier: "bakker", aan: "Beide ouders", ontvangers: ["Sanne", "Joris"], get onderwerp() { return T("seed.b1.onderwerp"); }, get tekst() { return T("seed.b1.tekst"); }, moment: "2026-09-26T09:15", door: IK, gezien: { Joris: "2026-09-26T12:01" } },
    ],
    gezamenlijk: [
        { id: "g1", dossier: "bakker", get tekst() { return T("seed.g1"); }, moment: "2026-09-25T10:45", verstuurd: true, gezien: { Joris: "2026-09-25T18:00" }, akkoord: { Joris: "2026-09-26T08:30" }, ingepland: "2026-10-16T14:00" },
    ],
    veilig: [
        { id: "v1", dossier: "bakker", get titel() { return T("seed.v1.titel"); }, get context() { return T("seed.v1.context"); }, get afspraak() { return T("seed.v1.afspraak"); }, betrokkenen: ["Sanne", "Joris"], kind: "Emma & Noah", start: "2026-09-28", evaluatie: d(6), zicht: "ouders", status: "actief" },
        { id: "v2", dossier: "jansen", get titel() { return T("seed.v2.titel"); }, get context() { return T("seed.v2.context"); }, get afspraak() { return T("seed.v2.afspraak"); }, betrokkenen: ["Sophie", "Mark"], kind: "Noor & Sem", start: "2026-09-15", evaluatie: d(3), zicht: "ouders", status: "actief" },
    ],
    doelen: [
        { id: "d1", dossier: "bakker", get tekst() { return T("seed.d1"); }, status: "In uitvoering" },
        { id: "d2", dossier: "bakker", get tekst() { return T("seed.d2"); }, status: "Te bespreken" },
        { id: "d3", dossier: "jansen", get tekst() { return T("seed.d3"); }, status: "In uitvoering" },
    ],
    pins: {
        bakker: ["Wisselmoment via school", "Evaluatie zorgregeling gepland op 18 november"],
        jansen: ["Communicatie uitsluitend via de app"],
    },
    gegevens: {
        bakker: { get gezag() { return T("seed.gegevens.gezamenlijk"); }, get regeling() { return T("seed.gegevens.bakkerRegeling"); }, get contactafspraken() { return T("seed.gegevens.bakkerContact"); }, start: "2026-03-01", status: "Actief", get praktisch() { return T("seed.gegevens.bakkerPraktisch"); }, overig: "" },
        jansen: { get gezag() { return T("seed.gegevens.gezamenlijk"); }, get regeling() { return T("seed.gegevens.jansenRegeling"); }, get contactafspraken() { return T("seed.gegevens.jansenContact"); }, start: "2026-09-12", status: "Actief", praktisch: "", overig: "" },
    },
    aanmeldingen: {},
    pros: [
        { id: "p-bakker-1", dossier: "bakker", naam: IK, rol: "Mediator", rechten: [...allesBehalveBeheer, "veiligBeheren"], start: "2026-03-01", actief: true, organisatieId: "org-midden" },
        { id: "p-bakker-2", dossier: "bakker", naam: "Ruben", rol: "Gezinscoach", rechten: ["agenda", "acties"], start: "2026-10-01", actief: true },
        { id: "p-jansen-1", dossier: "jansen", naam: IK, rol: "Mediator", rechten: [...allesBehalveBeheer, "veiligBeheren"], start: "2026-09-12", actief: true, organisatieId: "org-midden" },
        { id: "p-deboer-1", dossier: "deboer", naam: IK, rol: "Mediator", rechten: ["agenda", "communicatie", "berichten", "journaal", "notities", "acties", "veiligBekijken"], start: "2026-07-03", actief: true, organisatieId: "org-midden" },
        { id: "p-smit-1", dossier: "smit", naam: IK, rol: "Mediator", rechten: ["journaal", "notities", "docBekijken", "docToevoegen", "acties", "export"], start: "2026-09-22", actief: true, organisatieId: "org-midden" },
    ],
};
const listeners = new Set();
const zet = (p) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
const logRegel = (dossier, tekst, soort, door = IK) => Object.freeze([...state.log, Object.freeze({ id: crypto.randomUUID(), dossier, moment: new Date().toISOString(), tekst, door, soort })]);
const nuIso = () => new Date().toISOString();
/* ---------- rechten ---------- */
export function mijnRechten(dossier, s = state) {
    return s.pros.find((p) => p.dossier === dossier && p.naam === IK && p.actief)?.rechten ?? [];
}
/* ---------- journaal & notities ---------- */
export function voegJournaalToe(j) {
    if (!j.zicht)
        throw new Error(T("fout.kiesZicht"));
    zet({ journaal: [Object.freeze({ ...j, id: crypto.randomUUID() }), ...state.journaal], log: logRegel(j.dossier, T("log.journaalToegevoegd", { zicht: zichtLabel[j.zicht].toLowerCase() }), "contact") });
}
export function wijzigZicht(id, zicht) {
    const j = state.journaal.find((x) => x.id === id);
    if (!j || j.zicht === zicht)
        return;
    zet({ journaal: state.journaal.map((x) => (x.id === id ? Object.freeze({ ...x, zicht }) : x)), log: logRegel(j.dossier, T("log.zichtGewijzigd", { oud: zichtLabel[j.zicht], nieuw: zichtLabel[zicht] }), "contact") });
}
export function voegNotitieToe(dossier, tekst) {
    zet({ notities: [Object.freeze({ id: crypto.randomUUID(), dossier, moment: nuIso(), tekst }), ...state.notities] });
}
/* ---------- acties ---------- */
export function voegActieToe(dossier, tekst, voor, extra = {}) {
    zet({ acties: [{ id: crypto.randomUUID(), dossier, tekst, voor, klaar: false, prioriteit: "normaal", ...extra }, ...state.acties], log: logRegel(dossier, T("log.actieToegewezen", { voor: ontvangerLabel(voor).toLowerCase(), tekst }), "afspraken") });
}
export function toggleActie(id, door = IK) {
    const a = state.acties.find((x) => x.id === id);
    if (!a)
        return;
    zet({ acties: state.acties.map((x) => (x.id === id ? { ...x, klaar: !x.klaar } : x)), log: logRegel(a.dossier, T(a.klaar ? "log.actieHeropend" : "log.actieAfgerond", { tekst: a.tekst }), "afspraken", door) });
}
export const actieStatus = (a) => (a.klaar ? "Afgerond" : a.deadline && dagenTot(a.deadline) < 0 ? "Verlopen" : "Open");
/** Valt deze actie bij deze ouder? */
export const actieVoor = (a, ouder) => a.voor === "Beide ouders" || a.voor.split(", ").includes(ouder);
/* ---------- berichten (één tekst voor alle ontvangers) ---------- */
export function stuurBericht(dossier, ouders, aan, onderwerp, tekst) {
    const ontvangers = aan === "Beide ouders" ? ouders : [aan];
    zet({ berichten: [{ id: crypto.randomUUID(), dossier, aan, ontvangers, onderwerp, tekst, moment: nuIso(), door: IK, gezien: {} }, ...state.berichten], log: logRegel(dossier, T("log.berichtVerstuurd", { aan: ontvangerLabel(aan).toLowerCase(), onderwerp }), "communicatie") });
}
/* ---------- gesprek ouder ↔ professional: dezelfde berichtenbron ---------- */
/** Gezin van de ouderapp in de professionele omgeving. */
export const GEZIN_DOSSIER = "bakker";
/** Professionals die volgens hun eigen rechten berichten mogen ontvangen in dit dossier, en alleen bij een actief dossier. */
export function bereikbareBegeleiders(dossier, s = state) {
    if (s.gegevens[dossier]?.status !== "Actief")
        return [];
    return s.pros.filter((p) => p.dossier === dossier && p.actief && p.rechten.includes("berichten"));
}
/** Gesprek = dossier + precies deze ouders als lezers (naast de professional). Andere sets zijn een ander gesprek. */
export const zelfdeGesprek = (b, dossier, ouders) => b.dossier === dossier && b.ontvangers.length === ouders.length && ouders.every((o) => b.ontvangers.includes(o));
export function stuurOuderBericht(dossier, door, ouders, tekst) {
    const aan = ouders.length > 1 ? "Beide ouders" : ouders[0] ?? door;
    zet({ berichten: [{ id: crypto.randomUUID(), dossier, aan, ontvangers: ouders, onderwerp: T("gesprekMetBegeleider"), tekst, moment: nuIso(), door, gezien: { [door]: nuIso() } }, ...state.berichten], log: logRegel(dossier, T("log.berichtVanOuder", { door }), "communicatie", door) });
}
export function markeerBerichtGezien(id, ouder) {
    const b = state.berichten.find((x) => x.id === id);
    if (!b || b.gezien[ouder])
        return;
    zet({ berichten: state.berichten.map((x) => (x.id === id ? { ...x, gezien: { ...x.gezien, [ouder]: nuIso() } } : x)), log: logRegel(b.dossier, T("log.berichtGezien", { ouder, onderwerp: b.onderwerp }), "communicatie", ouder) });
}
/* ---------- gezamenlijke afspraken: gezien ≠ akkoord ---------- */
export function legGezamenlijkVast(dossier, tekst, versturen) {
    zet({ gezamenlijk: [{ id: crypto.randomUUID(), dossier, tekst, moment: nuIso(), verstuurd: versturen, gezien: {}, akkoord: {} }, ...state.gezamenlijk], log: logRegel(dossier, T(versturen ? "log.gezamenlijkTerBevestiging" : "log.gezamenlijkVastgelegd", { tekst }), "afspraken") });
}
export function verstuurGezamenlijk(id) {
    const g = state.gezamenlijk.find((x) => x.id === id);
    if (!g || g.verstuurd)
        return;
    zet({ gezamenlijk: state.gezamenlijk.map((x) => (x.id === id ? { ...x, verstuurd: true } : x)), log: logRegel(g.dossier, T("log.gezamenlijkGedeeld", { tekst: g.tekst }), "afspraken") });
}
export function markeerGezamenlijk(id, ouder, wat) {
    const g = state.gezamenlijk.find((x) => x.id === id);
    if (!g || !g.verstuurd || g.akkoord[ouder] || g.nietAkkoord?.[ouder])
        return;
    if (wat === "nietAkkoord") {
        const nieuw = { ...g, nietAkkoord: { ...g.nietAkkoord, [ouder]: nuIso() }, gezien: { ...g.gezien, [ouder]: g.gezien[ouder] ?? nuIso() } };
        zet({ gezamenlijk: state.gezamenlijk.map((x) => (x.id === id ? nieuw : x)), log: logRegel(g.dossier, T("log.geenAkkoord", { ouder, tekst: g.tekst }), "afspraken", ouder) });
        return;
    }
    if (g[wat][ouder])
        return;
    const nieuw = { ...g, [wat]: { ...g[wat], [ouder]: nuIso() }, ...(wat === "akkoord" && !g.gezien[ouder] ? { gezien: { ...g.gezien, [ouder]: nuIso() } } : {}) };
    zet({ gezamenlijk: state.gezamenlijk.map((x) => (x.id === id ? nieuw : x)), log: logRegel(g.dossier, T(wat === "akkoord" ? "log.akkoord" : "log.gezien", { ouder, tekst: g.tekst }), "afspraken", ouder) });
}
/* ---------- veiligheidsafspraken ---------- */
export function voegVeiligToe(v) {
    zet({ veilig: [{ ...v, id: crypto.randomUUID(), status: "actief" }, ...state.veilig], log: logRegel(v.dossier, T("log.veiligToegevoegd", { titel: v.titel }), "veiligheid") });
}
export function evalueerVeilig(id, keuze, waarde) {
    const v = state.veilig.find((x) => x.id === id);
    if (!v)
        return;
    let nieuw = v;
    let tekst = "";
    if (keuze === "beeindigen") {
        nieuw = { ...v, status: "beeindigd", eind: vandaagIso() };
        tekst = T("log.veiligBeeindigd", { titel: v.titel });
    }
    if (keuze === "verlengen" || keuze === "nieuweDatum") {
        const n = waarde ?? d(30);
        nieuw = { ...v, evaluatie: n, eind: keuze === "verlengen" && v.eind ? n : v.eind };
        tekst = T(keuze === "verlengen" ? "log.veiligVerlengd" : "log.veiligNieuweDatum", { titel: v.titel, datum: datumKort(n) });
    }
    if (keuze === "aanpassen" && waarde) {
        nieuw = { ...v, afspraak: waarde };
        tekst = T("log.veiligAangepast", { titel: v.titel, oud: v.afspraak, nieuw: waarde });
    }
    if (!tekst)
        return;
    zet({ veilig: state.veilig.map((x) => (x.id === id ? nieuw : x)), log: logRegel(v.dossier, tekst, "veiligheid") });
}
/* ---------- doelen, pins, gegevens ---------- */
export function voegDoelToe(dossier, tekst) { zet({ doelen: [...state.doelen, { id: crypto.randomUUID(), dossier, tekst, status: "Te bespreken" }] }); }
export function zetDoelStatus(id, status) {
    const dl = state.doelen.find((x) => x.id === id);
    if (!dl || dl.status === status)
        return;
    zet({ doelen: state.doelen.map((x) => (x.id === id ? { ...x, status } : x)), log: logRegel(dl.dossier, T("log.doelStatus", { tekst: dl.tekst, oud: doelStatusLabel(dl.status), nieuw: doelStatusLabel(status) }), "wijzigingen") });
}
export function pin(dossier, tekst) {
    const l = state.pins[dossier] ?? [];
    if (l.length >= MAX_PINS || l.includes(tekst))
        return;
    zet({ pins: { ...state.pins, [dossier]: [...l, tekst] } });
}
export const ontpin = (dossier, tekst) => zet({ pins: { ...state.pins, [dossier]: (state.pins[dossier] ?? []).filter((x) => x !== tekst) } });
export const legeGegevens = { gezag: "", regeling: "", contactafspraken: "", start: "", status: "Actief", praktisch: "", overig: "" };
export const gegevensLabel = {};
Object.keys(legeGegevens).forEach((k) => Object.defineProperty(gegevensLabel, k, { get: () => T(`gegevens.${k}`), enumerable: true }));
export function zetGegevens(dossier, g) {
    const oud = state.gegevens[dossier] ?? legeGegevens;
    const gewijzigd = Object.keys(g).filter((k) => oud[k] !== g[k]);
    if (!gewijzigd.length)
        return;
    zet({ gegevens: { ...state.gegevens, [dossier]: g }, log: logRegel(dossier, T("log.gegevensGewijzigd", { wijzigingen: gewijzigd.map((k) => { const w = (x) => (k === "status" ? dossierStatusLabel(x) : x) || "—"; return `${gegevensLabel[k].toLowerCase()} ${w(oud[k])} → ${w(g[k])}`; }).join(" · ") }), "wijzigingen") });
}
/* ---------- professionals per dossier ---------- */
export function geefToegang(dossier, naam, rol, rechten, start) {
    zet({ pros: [...state.pros, Object.freeze({ id: crypto.randomUUID(), dossier, naam, rol, rechten: Object.freeze([...rechten]), start, actief: true })], log: logRegel(dossier, T("log.toegangGegeven", { ik: IK, naam, rol: rolLabel(rol), datum: datumKort(start), rechten: rechten.map((r) => rechtLabel[r].toLowerCase()).join(", ") || T("log.geenRechten") }), "wijzigingen") });
}
export function wijzigRechten(id, rechten) {
    const p = state.pros.find((x) => x.id === id);
    if (!p)
        return;
    zet({ pros: state.pros.map((x) => (x.id === id ? Object.freeze({ ...x, rechten: Object.freeze([...rechten]) }) : x)), log: logRegel(p.dossier, T("log.rechtenGewijzigd", { naam: p.naam, rechten: rechten.map((r) => rechtLabel[r].toLowerCase()).join(", ") || T("log.geen") }), "wijzigingen") });
}
/** Toegang stoppen verwijdert geen historische dossiergegevens. */
export function duurBetrokkenheid(start, eind) {
    const datum = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso;
    if (!datum(start) || !datum(eind) || eind < start)
        return undefined;
    return Math.round((Date.parse(eind) - Date.parse(start)) / 86_400_000);
}
export function trekToegangIn(id, afsluiting) {
    const p = state.pros.find((x) => x.id === id);
    if (!p || !p.actief)
        return;
    if (afsluiting && (!afsluiting.samenvatting.trim() || duurBetrokkenheid(afsluiting.eind, vandaagIso()) === undefined || (p.start && duurBetrokkenheid(p.start, afsluiting.eind) === undefined)))
        throw new Error(T("fout.controleerAfsluiting"));
    zet({ pros: state.pros.map((x) => (x.id === id ? Object.freeze({ ...x, actief: false, ...(afsluiting ? { afsluiting: Object.freeze({ eind: afsluiting.eind, samenvatting: afsluiting.samenvatting.trim() }) } : {}) }) : x)), log: logRegel(p.dossier, T("log.toegangBeeindigd", { naam: p.naam }), "wijzigingen") });
}
export function logDocument(dossier, naam) { zet({ log: logRegel(dossier, T("log.documentToegevoegd", { naam }), "documenten") }); }
export function logAfspraak(dossier, tekst) { zet({ log: logRegel(dossier, T("log.afspraakGepland", { tekst }), "afspraken") }); }
export const zetMelding = (k, v) => zet({ meldingen: { ...state.meldingen, [k]: v } });
/** Wat ouders van de professional mogen zien. Interne notities nooit; alleen expliciet gedeelde items. */
export function voorOudersVan(s, dossier, ouder) {
    const voorMij = (lijst) => !ouder || lijst.includes(ouder);
    return {
        journaal: s.journaal.filter((j) => j.dossier === dossier && (j.zicht === "ouders" || (j.zicht === "aangepast" && ouder && j.zichtVoor.includes(ouder)))),
        berichten: s.berichten.filter((b) => b.dossier === dossier && voorMij(b.ontvangers)),
        acties: s.acties.filter((a) => a.dossier === dossier && (!ouder || actieVoor(a, ouder))),
        gezamenlijk: s.gezamenlijk.filter((g) => g.dossier === dossier && g.verstuurd),
        veilig: s.veilig.filter((v) => v.dossier === dossier && v.zicht === "ouders"),
    };
}
export const voorOuders = (dossier) => voorOudersVan(state, dossier).journaal;
export function useProWerk() {
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
export const momentKort = (iso) => new Date(iso).toLocaleString(taalLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** Afgeronde intake vastleggen in bestaande bronnen: gegevens (alleen ingevulde velden), doelen (Te bespreken, zonder dubbelen), aanmelding (intern). Geeft geen gezinstoegang. */
export function legIntakeVast(dossier, a, g, doelen, eigen) {
    const oud = state.gegevens[dossier] ?? legeGegevens;
    const nieuw = { ...oud };
    Object.keys(g).forEach((k) => { const v = g[k]?.trim(); if (v)
        nieuw[k] = v; });
    const bekend = new Set(state.doelen.filter((x) => x.dossier === dossier).map((x) => x.tekst.trim().toLowerCase()));
    const extra = doelen.map((t) => t.trim()).filter((t) => t && !bekend.has(t.toLowerCase()) && (bekend.add(t.toLowerCase()), true));
    const heeftIk = state.pros.some((p) => p.dossier === dossier && p.naam === IK && p.actief);
    zet({
        gegevens: { ...state.gegevens, [dossier]: nieuw },
        doelen: [...state.doelen, ...extra.map((tekst) => ({ id: crypto.randomUUID(), dossier, tekst, status: "Te bespreken" }))],
        aanmeldingen: { ...state.aanmeldingen, [dossier]: Object.freeze({ ...a, hulpverleners: Object.freeze([...a.hulpverleners]) }) },
        pros: heeftIk || !eigen ? state.pros : [...state.pros, Object.freeze({ id: crypto.randomUUID(), dossier, naam: IK, rol: eigen.rol, rechten: Object.freeze(["notities", "journaal", "acties"]), start: eigen.start, actief: true })],
        log: logRegel(dossier, extra.length ? T("log.intakeMetDoelen", { n: extra.length }) : T("log.intake"), "wijzigingen"),
    });
}
export const proState = () => state;
