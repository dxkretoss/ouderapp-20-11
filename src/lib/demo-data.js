import avatarSanne from "@/assets/avatar-sanne.jpg";
import avatarJoris from "@/assets/avatar-joris.jpg";
import avatarEmma from "@/assets/avatar-emma.jpg";
import avatarNoah from "@/assets/avatar-noah.jpg";
import { useSyncExternalStore } from "react";
import { leg } from "@/lib/audit-store";
import i18n, { tLijst } from "@/i18n";
/** Weergavetekst van het voorbeeldgezin; wordt pas bij het lezen vertaald (getters). */
const t = (sleutel, opties) => i18n.t(sleutel, opties);
/** Vertaalde velden die de app later mag overschrijven (bijv. het laatste bericht van een gesprek). */
const eigenWaarden = new WeakMap();
const overschrijfbaar = (obj, velden) => {
    for (const [veld, sleutel] of Object.entries(velden)) {
        Object.defineProperty(obj, veld, {
            enumerable: true,
            configurable: true,
            get() { return eigenWaarden.get(this)?.[veld] ?? t(sleutel); },
            set(v) { eigenWaarden.set(this, { ...eigenWaarden.get(this), [veld]: v }); },
        });
    }
    return obj;
};
const NL_MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
/**
 * Demo-datums staan als Nederlandse tekst ("14 april 2016") omdat andere onderdelen ze zo lezen.
 * Voor weergave: zet de maandnaam om naar de huidige taal (Nederlands blijft gelijk).
 */
export const datumWeergave = (s) => (typeof s === "string"
    ? s.replace(new RegExp(`(\\d{1,2}) (${NL_MAANDEN.join("|")})`, "g"), (_, d, m) => `${d} ${tLijst("common.maanden")[NL_MAANDEN.indexOf(m)] ?? m}`)
    : s);
export const parents = {
    sanne: {
        id: "sanne",
        naam: "Sanne",
        volledigeNaam: "Sanne de Vries",
        get rol() { return t("lib.demoData.ouders.sanne.rol"); },
        avatar: avatarSanne,
        kleur: "brand",
    },
    joris: {
        id: "joris",
        naam: "Joris",
        volledigeNaam: "Joris Bakker",
        get rol() { return t("lib.demoData.ouders.joris.rol"); },
        avatar: avatarJoris,
        kleur: "accent",
    },
};
export const kinderen = [
    {
        id: "emma",
        naam: "Emma",
        achternaam: "Bakker de Vries",
        leeftijd: 9,
        // Blijft Nederlandse tekst: wordt elders als datum gelezen. Weergave via datumWeergave().
        geboortedatum: "14 april 2016",
        avatar: avatarEmma,
        kleur: "#C77D8C",
        get school() { return t("lib.demoData.kinderen.emma.school"); },
        get opvang() { return t("lib.demoData.kinderen.emma.opvang"); },
        get huisarts() { return t("lib.demoData.kinderen.huisarts"); },
        get medisch() { return t("lib.demoData.kinderen.emma.medisch"); },
        get praktisch() { return t("lib.demoData.kinderen.emma.praktisch"); },
        contacten: [
            { get naam() { return t("lib.demoData.kinderen.emma.contacten.marieke.naam"); }, get rol() { return t("lib.demoData.kinderen.emma.contacten.marieke.rol"); }, telefoon: "030 - 111 22 33" },
            { get naam() { return t("lib.demoData.kinderen.emma.contacten.riet.naam"); }, get rol() { return t("lib.demoData.kinderen.emma.contacten.riet.rol"); }, telefoon: "06 - 12 34 56 78" },
        ],
    },
    {
        id: "noah",
        naam: "Noah",
        achternaam: "Bakker de Vries",
        leeftijd: 6,
        geboortedatum: "2 september 2019",
        avatar: avatarNoah,
        kleur: "#5A80A8",
        get school() { return t("lib.demoData.kinderen.noah.school"); },
        get opvang() { return t("lib.demoData.kinderen.noah.opvang"); },
        get huisarts() { return t("lib.demoData.kinderen.huisarts"); },
        get medisch() { return t("lib.demoData.kinderen.noah.medisch"); },
        get praktisch() { return t("lib.demoData.kinderen.noah.praktisch"); },
        contacten: [
            { get naam() { return t("lib.demoData.kinderen.noah.contacten.sam.naam"); }, get rol() { return t("lib.demoData.kinderen.noah.contacten.sam.rol"); }, telefoon: "030 - 111 22 44" },
            { get naam() { return t("lib.demoData.kinderen.noah.contacten.kees.naam"); }, get rol() { return t("lib.demoData.kinderen.noah.contacten.kees.rol"); }, telefoon: "06 - 87 65 43 21" },
        ],
    },
];
/** Kindkleur in het voorbeeldgezin (stijl A6): Emma oudroze, Noah stoffig blauw. */
export const kleurVanKind = (naam) => kinderen.find((k) => k.naam === naam || k.id === naam)?.kleur ?? "#8A7E72";
export const categorieMeta = {
    school: { get label() { return t("lib.demoData.categorie.school"); }, icoon: "school" },
    opvang: { get label() { return t("lib.demoData.categorie.opvang"); }, icoon: "opvang" },
    sport: { get label() { return t("lib.demoData.categorie.sport"); }, icoon: "sport" },
    medisch: { get label() { return t("lib.demoData.categorie.medisch"); }, icoon: "medisch" },
    verjaardag: { get label() { return t("lib.demoData.categorie.verjaardag"); }, icoon: "verjaardag" },
    vakantie: { get label() { return t("lib.demoData.categorie.vakantie"); }, icoon: "vakantie" },
    wissel: { get label() { return t("lib.demoData.categorie.wissel"); }, icoon: "wissel" },
    overig: { get label() { return t("lib.demoData.categorie.overig"); }, icoon: "overig" },
};
export const afspraken = [
    {
        id: "a1",
        get titel() { return t("lib.demoData.afspraken.a1.titel"); },
        categorie: "school",
        kind: "Emma",
        dag: 12,
        get datumLabel() { return t("lib.demoData.afspraken.a1.datumLabel"); },
        tijd: "19:00",
        locatie: "Basisschool De Boomgaard",
        ouder: "sanne",
    },
    {
        id: "a2",
        get titel() { return t("lib.demoData.afspraken.a2.titel"); },
        categorie: "sport",
        kind: "Noah",
        dag: 13,
        get datumLabel() { return t("lib.demoData.afspraken.a2.datumLabel"); },
        tijd: "17:00",
        locatie: "SV Hoograven",
        ouder: "joris",
    },
    {
        id: "a3",
        get titel() { return t("lib.demoData.afspraken.a3.titel"); },
        categorie: "wissel",
        kind: "Emma & Noah",
        dag: 14,
        get datumLabel() { return t("lib.demoData.afspraken.a3.datumLabel"); },
        tijd: "14:30",
        locatie: "Basisschool De Boomgaard",
        ouder: "joris",
    },
    {
        id: "a4",
        get titel() { return t("lib.demoData.afspraken.a4.titel"); },
        categorie: "medisch",
        kind: "Noah",
        dag: 15,
        get datumLabel() { return t("lib.demoData.afspraken.a4.datumLabel"); },
        tijd: "10:30",
        get locatie() { return t("lib.demoData.afspraken.a4.locatie"); },
        ouder: "joris",
    },
    {
        id: "a5",
        get titel() { return t("lib.demoData.afspraken.a5.titel"); },
        categorie: "sport",
        kind: "Emma",
        dag: 18,
        get datumLabel() { return t("lib.demoData.afspraken.a5.datumLabel"); },
        tijd: "16:15",
        get locatie() { return t("lib.demoData.afspraken.a5.locatie"); },
        ouder: "joris",
    },
    {
        id: "a6",
        get titel() { return t("lib.demoData.afspraken.a6.titel"); },
        categorie: "opvang",
        kind: "Noah",
        dag: 20,
        get datumLabel() { return t("lib.demoData.afspraken.a6.datumLabel"); },
        tijd: "14:00",
        get locatie() { return t("lib.demoData.afspraken.a6.titel"); },
        ouder: "sanne",
    },
    {
        id: "a7",
        get titel() { return t("lib.demoData.afspraken.a7.titel"); },
        categorie: "verjaardag",
        kind: "Emma",
        dag: 25,
        get datumLabel() { return t("lib.demoData.afspraken.a7.datumLabel"); },
        get tijd() { return t("lib.demoData.afspraken.heleDag"); },
        get locatie() { return t("lib.demoData.afspraken.a7.locatie"); },
        ouder: "sanne",
    },
    {
        id: "a8",
        get titel() { return t("lib.demoData.afspraken.a8.titel"); },
        categorie: "vakantie",
        kind: "Emma & Noah",
        dag: 28,
        get datumLabel() { return t("lib.demoData.afspraken.a8.datumLabel"); },
        get tijd() { return t("lib.demoData.afspraken.heleWeek"); },
        get locatie() { return t("lib.demoData.afspraken.a8.locatie"); },
        ouder: "joris",
    },
];
const dagKort = (i) => tLijst("lib.demoData.dagenKort")[i];
// Zorgregeling maart: week op / week af, met een paar uitzonderingen
export const zorgweek = [
    { get dag() { return dagKort(0); }, datum: 10, ouder: "sanne" },
    { get dag() { return dagKort(1); }, datum: 11, ouder: "sanne" },
    { get dag() { return dagKort(2); }, datum: 12, ouder: "sanne" },
    { get dag() { return dagKort(3); }, datum: 13, ouder: "sanne" },
    { get dag() { return dagKort(4); }, datum: 14, ouder: "joris", wissel: true },
    { get dag() { return dagKort(5); }, datum: 15, ouder: "joris" },
    { get dag() { return dagKort(6); }, datum: 16, ouder: "joris" },
];
export const zorgmaand = Array.from({ length: 31 }, (_, i) => {
    const datum = i + 1;
    const weekIndex = Math.floor((datum + 2) / 7);
    let ouder = weekIndex % 2 === 0 ? "joris" : "sanne";
    let uitzondering;
    if (datum >= 28) {
        ouder = "joris";
        uitzondering = "lib.demoData.afspraken.a8.titel";
    }
    if (datum === 25) {
        ouder = "sanne";
        uitzondering = "lib.demoData.afspraken.a7.titel";
    }
    const sleutel = uitzondering;
    return { datum, ouder, get uitzondering() { return sleutel ? t(sleutel) : undefined; } };
});
export const gesprekken = [
    overschrijfbaar({
        id: "algemeen",
        get onderwerp() { return t("lib.demoData.gesprekken.algemeen.onderwerp"); },
        icoon: "berichten",
        ongelezen: 2,
        laatsteTijd: "09:12",
        berichten: [
            { id: "b1", van: "joris", get tekst() { return t("lib.demoData.gesprekken.algemeen.b1"); }, tijd: "08:40" },
            { id: "b2", van: "sanne", get tekst() { return t("lib.demoData.gesprekken.algemeen.b2"); }, tijd: "08:52" },
            { id: "b3", van: "joris", get tekst() { return t("lib.demoData.gesprekken.algemeen.b3"); }, tijd: "09:12" },
        ],
    }, { laatste: "lib.demoData.gesprekken.algemeen.laatste" }),
    overschrijfbaar({
        id: "school",
        get onderwerp() { return t("lib.demoData.gesprekken.school.onderwerp"); },
        icoon: "school",
        ongelezen: 0,
        berichten: [
            { id: "b4", van: "sanne", get tekst() { return t("lib.demoData.gesprekken.school.b4"); }, get tijd() { return t("lib.demoData.gesprekken.tijdMa", { tijd: "19:02" }); } },
            { id: "b5", van: "joris", get tekst() { return t("lib.demoData.gesprekken.school.b5"); }, get tijd() { return t("lib.demoData.gesprekken.tijdMa", { tijd: "19:30" }); } },
            { id: "b6", van: "sanne", get tekst() { return t("lib.demoData.gesprekken.school.laatste"); }, get tijd() { return t("lib.demoData.gesprekken.gisteren"); } },
        ],
    }, { laatste: "lib.demoData.gesprekken.school.laatste", laatsteTijd: "lib.demoData.gesprekken.gisteren" }),
    overschrijfbaar({
        id: "vakantie",
        get onderwerp() { return t("lib.demoData.gesprekken.vakantie.onderwerp"); },
        icoon: "vakantie",
        ongelezen: 0,
        berichten: [
            { id: "b7", van: "joris", get tekst() { return t("lib.demoData.gesprekken.vakantie.laatste"); }, get tijd() { return t("lib.demoData.gesprekken.tijdMa", { tijd: "20:15" }); } },
        ],
    }, { laatste: "lib.demoData.gesprekken.vakantie.laatste", laatsteTijd: "lib.demoData.gesprekken.vakantie.laatsteTijd" }),
    overschrijfbaar({
        id: "kosten",
        get onderwerp() { return t("lib.demoData.gesprekken.kosten.onderwerp"); },
        icoon: "kosten",
        ongelezen: 0,
        berichten: [
            { id: "b8", van: "joris", get tekst() { return t("lib.demoData.gesprekken.kosten.laatste"); }, get tijd() { return t("lib.demoData.gesprekken.tijdZa", { tijd: "11:04" }); } },
        ],
    }, { laatste: "lib.demoData.gesprekken.kosten.laatste", laatsteTijd: "lib.demoData.gesprekken.kosten.laatsteTijd" }),
];
// categorie, datum en status blijven Nederlandse waarden: ze worden elders vergeleken en als datum gelezen.
export const kosten = [
    { id: "k-zwem", get omschrijving() { return t("lib.demoData.kosten.kZwem"); }, categorie: "Sport", icoon: "zwemmen", kind: "Noah", datum: "10 maart", bedrag: 40, betaaldDoor: "joris", verdeling: "50 / 50", aandeelSanne: 20, status: "wacht" },
    { id: "k-kamp", get omschrijving() { return t("lib.demoData.kosten.kKamp"); }, categorie: "School", icoon: "school", kind: "Emma", datum: "11 maart", bedrag: 90, betaaldDoor: "joris", verdeling: "50 / 50", aandeelSanne: 45, status: "wacht" },
    {
        id: "k1",
        get omschrijving() { return t("lib.demoData.kosten.k1"); },
        categorie: "Sport",
        icoon: "sport",
        kind: "Noah",
        datum: "8 maart",
        bedrag: 64.95,
        betaaldDoor: "joris",
        verdeling: "50 / 50",
        aandeelSanne: 32.48,
        status: "openstaand",
    },
    {
        id: "k2",
        get omschrijving() { return t("lib.demoData.kosten.k2"); },
        categorie: "School",
        icoon: "school",
        kind: "Emma",
        datum: "5 maart",
        bedrag: 42.0,
        betaaldDoor: "sanne",
        verdeling: "50 / 50",
        aandeelSanne: 21.0,
        status: "openstaand",
    },
    {
        id: "k3",
        get omschrijving() { return t("lib.demoData.kosten.k3"); },
        categorie: "Kleding",
        icoon: "kleding",
        kind: "Emma",
        datum: "2 maart",
        bedrag: 79.99,
        betaaldDoor: "sanne",
        verdeling: "60 / 40",
        aandeelSanne: 48.0,
        status: "betaald",
    },
    {
        id: "k4",
        get omschrijving() { return t("lib.demoData.kosten.k4"); },
        categorie: "Medisch",
        icoon: "medisch",
        kind: "Noah",
        datum: "28 februari",
        bedrag: 38.5,
        betaaldDoor: "joris",
        verdeling: "50 / 50",
        aandeelSanne: 19.25,
        status: "betaald",
    },
    {
        id: "k5",
        get omschrijving() { return t("lib.demoData.kosten.k5"); },
        categorie: "Sport",
        icoon: "zwemmen",
        kind: "Emma",
        datum: "1 maart",
        bedrag: 52.0,
        betaaldDoor: "sanne",
        verdeling: "50 / 50",
        aandeelSanne: 26.0,
        status: "betaald",
    },
];
const DOCUMENT_CATEGORIE = { "Officiële afspraken": "officieleAfspraken", School: "school", Medisch: "medisch", Verzekeringen: "verzekeringen", Overig: "overig", Bonnen: "bonnen" };
/** Weergavenaam van een documentcategorie (de categorie zelf blijft een vaste Nederlandse waarde). */
export const documentCategorieLabel = (c) => (DOCUMENT_CATEGORIE[c] ? t(`lib.demoData.documentCategorie.${DOCUMENT_CATEGORIE[c]}`) : c);
// categorie en gewijzigd blijven Nederlandse waarden (vergeleken en als datum gelezen); weergave via documentCategorieLabel / datumWeergave.
export const documenten = [
    {
        id: "d1",
        get naam() { return t("lib.demoData.documenten.d1.naam"); },
        categorie: "Officiële afspraken",
        kind: "Emma & Noah",
        gewijzigd: "8 maart",
        get grootte() { return t("lib.demoData.documenten.d1.grootte"); },
        icoon: "documenten",
    },
    {
        id: "d2",
        get naam() { return t("lib.demoData.documenten.d2.naam"); },
        categorie: "School",
        kind: "Emma",
        gewijzigd: "1 maart",
        grootte: "480 kB",
        icoon: "school",
    },
    {
        id: "d3",
        get naam() { return t("lib.demoData.documenten.d3.naam"); },
        categorie: "Medisch",
        kind: "Noah",
        gewijzigd: "12 februari",
        grootte: "220 kB",
        icoon: "medisch",
    },
    {
        id: "d4",
        get naam() { return t("lib.demoData.documenten.d4.naam"); },
        categorie: "Verzekeringen",
        kind: "Emma & Noah",
        gewijzigd: "4 januari",
        grootte: "760 kB",
        icoon: "veiligheid",
    },
    {
        id: "d5",
        get naam() { return t("lib.demoData.documenten.d5.naam"); },
        categorie: "Overig",
        kind: "Emma & Noah",
        gewijzigd: "20 december",
        get grootte() { return t("lib.demoData.documenten.d5.grootte"); },
        icoon: "identiteit",
    },
];
const onderlingeAfspraak = (id, icoon) => ({
    id,
    get titel() { return t(`lib.demoData.onderlingeAfspraken.${id}.titel`); },
    icoon,
    get tekst() { return t(`lib.demoData.onderlingeAfspraken.${id}.tekst`); },
    get gewijzigd() { return t(`lib.demoData.onderlingeAfspraken.${id}.gewijzigd`); },
    get doorWie() { return t("lib.demoData.onderlingeAfspraken.doorWie"); },
});
export const onderlingeAfspraken = [
    onderlingeAfspraak("o1", "telefoon"),
    onderlingeAfspraak("o2", "slapen"),
    onderlingeAfspraak("o3", "auto"),
    onderlingeAfspraak("o4", "overdracht"),
    onderlingeAfspraak("o5", "vakantie"),
    onderlingeAfspraak("o6", "medisch"),
];
export const professionals = [
    {
        id: "p1",
        naam: "Marloes Jansen",
        get rol() { return t("lib.demoData.professionals.p1.rol"); },
        organisatie: "Mediationpraktijk Midden",
        // statusId is de vaste waarde voor logica; status is de weergavetekst.
        statusId: "actief",
        get status() { return t("lib.demoData.professionals.p1.status"); },
        initialen: "MJ",
        rechten: {
            Agenda: "bekijken",
            Zorgregeling: "bekijken",
            Berichten: "geen",
            Kosten: "geen",
            Documenten: "bijdragen",
            Afspraken: "bijdragen",
        },
    },
    {
        id: "p2",
        naam: "Ruben Smit",
        get rol() { return t("lib.demoData.professionals.p2.rol"); },
        organisatie: "Buurtteam Utrecht",
        statusId: "uitgenodigd",
        get status() { return t("lib.demoData.professionals.p2.status"); },
        initialen: "RS",
        rechten: {
            Agenda: "bekijken",
            Zorgregeling: "geen",
            Berichten: "geen",
            Kosten: "geen",
            Documenten: "geen",
            Afspraken: "bekijken",
        },
    },
];
// Centrale kindbank: aanvullende gegevens per kind, gedeeld door alle onderdelen.
const huishoudens = () => [t("lib.demoData.kindbank.huishoudens.sanne"), t("lib.demoData.kindbank.huishoudens.joris")];
export const kindbank = {
    emma: {
        get huishoudens() { return huishoudens(); },
        get klas() { return t("lib.demoData.kindbank.emma.klas"); },
        get schoolInfo() { return t("lib.demoData.kindbank.emma.schoolInfo"); },
        get tandarts() { return t("lib.demoData.kindbank.tandarts"); },
        get apotheek() { return t("lib.demoData.kindbank.apotheek"); },
        get allergieen() { return t("lib.demoData.kindbank.emma.allergieen"); },
        get medicatie() { return t("lib.demoData.kindbank.emma.medicatie"); },
        maten: { kleding: "140", schoen: "34", get sport() { return t("lib.demoData.kindbank.emma.matenSport"); }, get gewijzigd() { return t("lib.demoData.kindbank.emma.matenGewijzigd"); } },
        activiteiten: [
            { icoon: "zwemmen", get naam() { return t("lib.demoData.afspraken.a5.titel"); }, get wanneer() { return t("lib.demoData.kindbank.emma.zwemlesWanneer"); } },
            { icoon: "muziek", get naam() { return t("lib.demoData.kindbank.emma.piano"); }, get wanneer() { return t("lib.demoData.kindbank.emma.pianoWanneer"); } },
        ],
        get verzekering() { return t("lib.demoData.kindbank.emma.verzekering"); },
    },
    noah: {
        get huishoudens() { return huishoudens(); },
        get klas() { return t("lib.demoData.kindbank.noah.klas"); },
        get schoolInfo() { return t("lib.demoData.kindbank.noah.schoolInfo"); },
        get tandarts() { return t("lib.demoData.kindbank.tandarts"); },
        get apotheek() { return t("lib.demoData.kindbank.apotheek"); },
        get allergieen() { return t("lib.demoData.kindbank.noah.allergieen"); },
        get medicatie() { return t("lib.demoData.kindbank.noah.medicatie"); },
        maten: { kleding: "122", schoen: "30", get sport() { return t("lib.demoData.kindbank.noah.matenSport"); }, get gewijzigd() { return t("lib.demoData.kindbank.noah.matenGewijzigd"); } },
        activiteiten: [{ icoon: "sport", get naam() { return t("lib.demoData.kindbank.noah.voetbal"); }, get wanneer() { return t("lib.demoData.kindbank.noah.voetbalWanneer"); } }],
        get verzekering() { return t("lib.demoData.kindbank.noah.verzekering"); },
        trainer: { get naam() { return t("lib.demoData.kindbank.noah.trainer.naam"); }, get rol() { return t("lib.demoData.kindbank.noah.trainer.rol"); }, telefoon: "06 - 11 22 33 44" },
    },
};
// Gezondheid: begint met de (vertaalde) voorbeeldgegevens; wat een ouder opslaat blijft zoals ingevoerd.
let gezondheidEigen = {};
let gezondheidStart = { taal: null, data: {} };
function gezondheidVan(kindId) {
    if (gezondheidEigen[kindId])
        return gezondheidEigen[kindId];
    const taal = i18n.resolvedLanguage;
    if (gezondheidStart.taal !== taal) {
        gezondheidStart = { taal, data: Object.fromEntries(kinderen.map((k) => {
                const b = kindbank[k.id];
                return [k.id, { huisarts: k.huisarts, tandarts: b?.tandarts ?? "", apotheek: b?.apotheek ?? "", allergieen: b?.allergieen ?? "", medicatie: b?.medicatie ?? "", verzekering: b?.verzekering ?? "", bijzonderheden: k.medisch }];
            })) };
    }
    return gezondheidStart.data[kindId];
}
const gezondheidLuisteraars = new Set();
export function useGezondheid(kindId) {
    return useSyncExternalStore((l) => { gezondheidLuisteraars.add(l); return () => gezondheidLuisteraars.delete(l); }, () => gezondheidVan(kindId), () => gezondheidVan(kindId));
}
const GEZONDHEID_VELDEN = ["huisarts", "tandarts", "apotheek", "allergieen", "medicatie", "verzekering", "bijzonderheden"];
/** Label van een gezondheidsveld in de huidige taal. */
export const gezondheidLabel = (veld) => t(`lib.demoData.gezondheidVeld.${veld}`);
export function bewaarGezondheid(kindId, nieuw) {
    const oud = gezondheidVan(kindId);
    const kind = kinderen.find((k) => k.id === kindId);
    if (!oud || !kind)
        return;
    const velden = GEZONDHEID_VELDEN;
    if (!velden.some((v) => oud[v] !== nieuw[v]))
        return;
    gezondheidEigen = { ...gezondheidEigen, [kindId]: { ...nieuw } };
    for (const veld of velden) {
        if (oud[veld] === nieuw[veld])
            continue;
        const label = gezondheidLabel(veld);
        leg("dossier", `gezondheid-${kindId}-${veld}`, `${label} · ${kind.naam}`, "UPDATED", { veld: label, oud: oud[veld], nieuw: nieuw[veld] }, "Sanne", { kinderen: [kind.naam], meta: { type: t("lib.demoData.gezondheidType") } });
    }
    gezondheidLuisteraars.forEach((l) => l());
}
