import i18n from "@/i18n";
/*
 * Lastige momenten: vaste structuur (id, onderwerp, gevoelens, zoekwoorden) staat hier;
 * alle teksten staan in de vertalingen onder lib.lastigeMomenten (nl + en) en worden bij het lezen opgehaald.
 * Aanvulling 17 nov 2026 (wissel via school bij spanning, moment 2 en 3) zit al in die teksten verwerkt.
 */
const NS = "lib.lastigeMomenten";
const LEEG = { vraag: "", kort: "", doen: [], zeg: [], liever: [], onthoud: "", hulp: "", kind: "", kindKort: "" };
/** Teksten van één moment in de huidige taal, of in een vaste taal (lng) voor zoeken. */
function tekstVan(id, lng) {
    const v = i18n.t(`${NS}.momenten.${id}`, lng ? { returnObjects: true, lng } : { returnObjects: true });
    return v && typeof v === "object" ? { ...LEEG, ...v } : LEEG;
}
export const gevoelens = ["boos", "verdrietig", "machteloos", "bezorgd", "schuldig", "moe"].map((id) => ({
    id,
    get label() { return i18n.t(`${NS}.gevoelens.${id}`); },
}));
/** Tegel- en icoonkleur per onderwerp (stijlgids A6, hoofdstuk 11). */
export const onderwerpKleur = [["#DCE3D3", "#3F5747"], ["#EBD9CC", "#6E3A24"], ["#E8D8C6", "#5A4636"], ["#E6DFD3", "#4A443E"], ["#E2E8DC", "#3F5747"], ["#EFE1C9", "#6E5014"]];
/** Onderwerpen op volgorde (index = moment.onderwerp). */
export const onderwerpen = ["overdracht", "kindVertelt", "boos", "praten", "mezelf", "bijzonder"].map((sleutel) => ({
    sleutel,
    get titel() { return i18n.t(`${NS}.onderwerpen.${sleutel}.titel`); },
    get sub() { return i18n.t(`${NS}.onderwerpen.${sleutel}.sub`); },
}));
const MOMENTEN = [
    { id: 1, onderwerp: 0, gevoelens: ["boos"], zoekwoorden: ["discussie","ruzie","overdracht","wissel"] },
    { id: 2, onderwerp: 0, gevoelens: ["boos"], zoekwoorden: ["veilig","bang","zorgen","gevaar","slaan","discussie","ruzie","overdracht","wissel"] },
    { id: 3, onderwerp: 0, gevoelens: ["verdrietig","machteloos"], zoekwoorden: ["huil","klampt","niet mee","wil niet","weigert"] },
    { id: 4, onderwerp: 0, gevoelens: ["boos"], zoekwoorden: ["boos","woede","kwaad","schreeuw","ontplof","gillen","razend","bericht","app","whatsapp","sms","appje","discussie","ruzie","overdracht","wissel"] },
    { id: 5, onderwerp: 1, gevoelens: ["bezorgd"], zoekwoorden: ["veilig","bang","zorgen","gevaar","slaan","negatief","slecht","zegt","vertelt"] },
    { id: 6, onderwerp: 1, gevoelens: ["boos","schuldig"], zoekwoorden: ["negatief","slecht","zegt","vertelt"] },
    { id: 7, onderwerp: 1, gevoelens: ["schuldig"], zoekwoorden: ["schuld","schuldig"] },
    { id: 8, onderwerp: 1, gevoelens: ["verdrietig","bezorgd"], zoekwoorden: ["huil","klampt","niet mee","wil niet","weigert","verdrietig","na de wissel","thuiskomen"] },
    { id: 9, onderwerp: 2, gevoelens: ["boos"], zoekwoorden: ["boos","woede","kwaad","schreeuw","ontplof","gillen","razend"] },
    { id: 10, onderwerp: 2, gevoelens: ["boos","schuldig"], zoekwoorden: ["boos","woede","kwaad","schreeuw","ontplof","gillen","razend","negatief","slecht","zegt","vertelt"] },
    { id: 11, onderwerp: 2, gevoelens: ["boos","moe"], zoekwoorden: ["boos","woede","kwaad","schreeuw","ontplof","gillen","razend"] },
    { id: 12, onderwerp: 2, gevoelens: ["boos"], zoekwoorden: ["bericht","app","whatsapp","sms","appje"] },
    { id: 13, onderwerp: 3, gevoelens: ["bezorgd"], zoekwoorden: [] },
    { id: 14, onderwerp: 3, gevoelens: ["boos","machteloos"], zoekwoorden: ["te laat","laat","niet komen","komt niet","opdagen","wachten","reageert niet","geen antwoord","stil"] },
    { id: 15, onderwerp: 3, gevoelens: ["boos","machteloos"], zoekwoorden: ["gehoord","luistert niet"] },
    { id: 16, onderwerp: 4, gevoelens: ["verdrietig","moe"], zoekwoorden: ["te veel","red het niet","kapot","op"] },
    { id: 17, onderwerp: 0, gevoelens: ["boos"], zoekwoorden: ["te laat","laat","niet komen","komt niet","opdagen","wachten"] },
    { id: 18, onderwerp: 0, gevoelens: ["boos","verdrietig"], zoekwoorden: ["vriend","vriendin","partner","relatie","nieuwe"] },
    { id: 19, onderwerp: 0, gevoelens: ["bezorgd"], zoekwoorden: ["vergeten","medicijn","spullen","tas"] },
    { id: 20, onderwerp: 1, gevoelens: ["verdrietig","schuldig"], zoekwoorden: ["verdrietig","na de wissel","thuiskomen"] },
    { id: 21, onderwerp: 1, gevoelens: ["machteloos","bezorgd"], zoekwoorden: ["huil","klampt","niet mee","wil niet","weigert"] },
    { id: 22, onderwerp: 1, gevoelens: ["machteloos","bezorgd"], zoekwoorden: ["geheim","doorgeven","boodschap"] },
    { id: 23, onderwerp: 1, gevoelens: ["machteloos"], zoekwoorden: ["kiezen","wonen"] },
    { id: 24, onderwerp: 1, gevoelens: ["boos","machteloos"], zoekwoorden: ["uitspelen","mag wel","regels"] },
    { id: 25, onderwerp: 2, gevoelens: ["boos","moe"], zoekwoorden: ["bericht","app","whatsapp","sms","appje"] },
    { id: 26, onderwerp: 2, gevoelens: ["verdrietig"], zoekwoorden: ["vriend","vriendin","partner","relatie","nieuwe"] },
    { id: 27, onderwerp: 3, gevoelens: ["boos","machteloos"], zoekwoorden: ["vakantie","reis","buitenland","kerst","feestdag","sinterklaas","oud en nieuw","nee","akkoord","wijziging","ruilen"] },
    { id: 28, onderwerp: 3, gevoelens: ["boos"], zoekwoorden: ["geld","kosten","alimentatie","betaal","bijdrage","rekening"] },
    { id: 29, onderwerp: 3, gevoelens: ["boos","machteloos"], zoekwoorden: ["geld","kosten","alimentatie","betaal","bijdrage","rekening"] },
    { id: 30, onderwerp: 3, gevoelens: ["bezorgd"], zoekwoorden: ["vakantie","reis","buitenland","school","ouderavond","optreden","rapport"] },
    { id: 31, onderwerp: 4, gevoelens: ["verdrietig","moe"], zoekwoorden: ["alleen","stil","mis","leeg","te veel","red het niet","kapot","op"] },
    { id: 32, onderwerp: 4, gevoelens: ["verdrietig"], zoekwoorden: ["kerst","feestdag","sinterklaas","oud en nieuw","alleen","stil","mis","leeg"] },
    { id: 33, onderwerp: 4, gevoelens: ["schuldig"], zoekwoorden: ["schuld","schuldig"] },
    { id: 34, onderwerp: 5, gevoelens: ["bezorgd"], zoekwoorden: ["vriend","vriendin","partner","relatie","nieuwe"] },
    { id: 35, onderwerp: 5, gevoelens: ["bezorgd"], zoekwoorden: ["vakantie","reis","buitenland"] },
    { id: 36, onderwerp: 5, gevoelens: ["bezorgd"], zoekwoorden: ["verjaardag","jarig","feest"] },
    { id: 37, onderwerp: 5, gevoelens: ["verdrietig"], zoekwoorden: ["verjaardag","jarig","feest","moederdag","vaderdag"] },
    { id: 38, onderwerp: 5, gevoelens: ["bezorgd"], zoekwoorden: ["verhuis","verhuizen","ander huis"] },
    { id: 39, onderwerp: 5, gevoelens: ["bezorgd"], zoekwoorden: ["school","ouderavond","optreden","rapport"] },
    { id: 40, onderwerp: 5, gevoelens: ["bezorgd"], zoekwoorden: ["veilig","bang","zorgen","gevaar","slaan"] },
];
export const momenten = MOMENTEN.map((m) => ({
    ...m,
    /** vraag, kort, doen[], zeg[], liever[], onthoud, hulp ("" = geen), kind, kindKort — in de huidige taal. */
    get tekst() { return tekstVan(m.id); },
    /** Oude naam, blijft werken voor bestaande aanroepen (o.a. verhaal.jsx); geeft ook de huidige taal. */
    get nl() { return tekstVan(m.id); },
}));
/** Synoniemen voor zoeken: Nederlandse woorden plus Engelse equivalenten, zodat zoeken in beide talen werkt. */
export const synoniemen = [
    { woorden: ["boos","woede","kwaad","schreeuw","ontplof","gillen","razend","angry","anger","furious","scream","shout","yell","rage"], momenten: [11,4,9,10] },
    { woorden: ["bericht","app","whatsapp","sms","appje","message","text","email"], momenten: [12,25,4] },
    { woorden: ["te laat","laat","niet komen","komt niet","opdagen","wachten","late","not coming","doesn't show","didn't show","no-show","turn up","waiting"], momenten: [17,14] },
    { woorden: ["huil","klampt","niet mee","wil niet","weigert","cry","crying","cries","cling","won't go","refuses","doesn't want"], momenten: [3,21,8] },
    { woorden: ["vriend","vriendin","partner","relatie","nieuwe","boyfriend","girlfriend","relationship","new"], momenten: [18,26,34] },
    { woorden: ["geld","kosten","alimentatie","betaal","bijdrage","rekening","money","cost","maintenance","child support","pay","contribution","bill"], momenten: [28,29] },
    { woorden: ["vakantie","reis","buitenland","holiday","vacation","trip","abroad"], momenten: [35,27,30] },
    { woorden: ["verjaardag","jarig","feest","birthday","party"], momenten: [36,37] },
    { woorden: ["moederdag","vaderdag","mother's day","father's day","mothers day","fathers day"], momenten: [37] },
    { woorden: ["kerst","feestdag","sinterklaas","oud en nieuw","christmas","festive","new year"], momenten: [32,27] },
    { woorden: ["verhuis","verhuizen","ander huis","moving","move house","relocat"], momenten: [38] },
    { woorden: ["school","ouderavond","optreden","rapport","parents' evening","parents evening","performance","report"], momenten: [39,30] },
    { woorden: ["schuld","schuldig","guilt","blame","fault"], momenten: [7,33] },
    { woorden: ["alleen","stil","mis","leeg","alone","quiet","miss","empty","lonely"], momenten: [31,32] },
    { woorden: ["veilig","bang","zorgen","gevaar","slaan","safe","afraid","scared","worried","worry","danger","abuse"], momenten: [40,5,2] },
    { woorden: ["vergeten","medicijn","spullen","tas","forgot","medicine","medication","inhaler","bag"], momenten: [19] },
    { woorden: ["kiezen","wonen","choose","live with"], momenten: [23] },
    { woorden: ["geheim","doorgeven","boodschap","secret","pass on"], momenten: [22] },
    { woorden: ["negatief","slecht","zegt","vertelt","negative","bad","says","tells"], momenten: [5,6,10] },
    { woorden: ["reageert niet","geen antwoord","stil","doesn't reply","no answer","no reply","ignor","silent"], momenten: [14] },
    { woorden: ["gehoord","luistert niet","heard","doesn't listen","not listening"], momenten: [15] },
    { woorden: ["nee","akkoord","wijziging","ruilen","refuse","agree","change","swap"], momenten: [27] },
    { woorden: ["te veel","red het niet","kapot","op","too much","can't cope","exhausted","overwhelmed"], momenten: [16,31] },
    { woorden: ["uitspelen","mag wel","regels","play off","allowed","rules"], momenten: [24] },
    { woorden: ["discussie","ruzie","overdracht","wissel","argument","argue","fight","handover","changeover"], momenten: [2,1,4] },
    { woorden: ["verdrietig","na de wissel","thuiskomen","sad","after the handover","coming home"], momenten: [8,20] },
];
/** Vult {kind} in met de naam of namen ("Emma en Noah"). */
export function metKind(tekst, namen) {
    const n = namen.length === 0
        ? i18n.t(`${NS}.jeKind`)
        : namen.length === 1 ? namen[0] : i18n.t(`${NS}.namenLijst`, { voor: namen.slice(0, -1).join(", "), laatste: namen[namen.length - 1] });
    return tekst.replaceAll("{kind}", n);
}
/** Zoekt momenten op vraag, uitleg (nl en en), zoekwoorden en synoniemen. Lege zoekterm geeft niets. */
export function zoekMomenten(zoek) {
    const q = zoek.trim().toLowerCase();
    if (q.length < 2)
        return [];
    const woorden = q.split(/[^a-zà-ÿ0-9]+/).filter((w) => w.length >= 3);
    const extra = new Map();
    for (const g of synoniemen)
        if (g.woorden.some((w) => q.includes(w)))
            g.momenten.forEach((id, i) => extra.set(id, (extra.get(id) ?? 0) + 3 - Math.min(i, 2)));
    const score = (m) => {
        const tnl = tekstVan(m.id, "nl"), ten = tekstVan(m.id, "en");
        const t = `${tnl.vraag} ${tnl.kort} ${ten.vraag} ${ten.kort} ${m.zoekwoorden.join(" ")}`.toLowerCase();
        return woorden.reduce((sc, w) => sc + (t.includes(w) ? 1 : 0), 0) + (extra.get(m.id) ?? 0);
    };
    return momenten.map((m) => [m, score(m)]).filter(([, sc]) => sc > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m]) => m);
}
