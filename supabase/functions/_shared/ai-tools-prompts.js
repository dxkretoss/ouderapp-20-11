/**
 * Prompts en JSON-schema's van de overige AI-functies (server-side, Phase 2): zoek- en regelassistent,
 * gesprekssamenvatting, kassabon, schoolbrief, bericht aan school en ouderschapsplan.
 * Verplaatst uit src/lib/*.functions.js — de browser bevat geen prompts of AI-sleutel meer.
 * Prompts blijven Nederlands; een taalregel laat de AI in de taal van de app antwoorden.
 * Puur JavaScript zonder Deno-API's (testbaar vanuit src/lib).
 */

/* ---------------------------------------------------------------- assistent */
/** Intent-register: één regel per bedoeling. Nieuwe intent = één item erbij (plus een navigatieregel in Assistent.jsx). */
export const intents = [
    { id: "geen", uitleg: "alleen informatie geven of zoeken" },
    { id: "verduidelijk", uitleg: "de vraag is onduidelijk; stel één korte vraag en geef 2-4 korte keuzes in 'opties'. Nooit gokken." },
    { id: "afspraak_toevoegen", uitleg: "nieuwe agenda-afspraak (bijv. zwemles, tandarts)" },
    { id: "afspraak_wijzigen", uitleg: "bestaande agenda-afspraak wijzigen/verplaatsen/verwijderen" },
    { id: "tijd_wisselmoment", uitleg: "wisselmoment of halen/brengen naar een andere tijd" },
    { id: "wissel_ruil", uitleg: "dag ruilen" },
    { id: "extra_nacht", uitleg: "extra dag of nacht voorstellen" },
    { id: "afspraak_maken", uitleg: "voorstel voor een onderlinge afspraak/regel tussen ouders" },
    { id: "taak_toevoegen", uitleg: "taak toevoegen" },
    { id: "momentje", uitleg: "Momentje toevoegen" },
    { id: "kosten", uitleg: "kosten toevoegen" },
    { id: "vakantie", uitleg: "vakantie plannen of verdelen" },
    { id: "kring_toevoegen", uitleg: "persoon (opa, oma, oppas…) aan De kring toevoegen; zet 'rol'" },
    { id: "document_zoeken", uitleg: "document zoeken" },
    { id: "bericht", uitleg: "bericht starten" },
    { id: "ziek", uitleg: "kind is ziek" },
];
export const acties = intents.map((i) => i.id);

/** Kinderen als { id, naam }; "kind" in het antwoord is altijd een van deze id's of "". */
export function assistentSysteem(ouderNaam, kinderen) {
    const kindRegel = kinderen.length
        ? `"kind": de id van het kind (${kinderen.map((k) => `${k.id} = ${k.naam}`).join(", ")}) of "" (meerdere/onbekend).`
        : `"kind": altijd "" (er zijn nog geen kinderen ingevuld).`;
    return `Je bent de rustige zoek- en regelassistent van een Nederlandse co-ouderschapsapp. Je helpt één ingelogde ouder${ouderNaam ? ` (${ouderNaam})` : ""}.
Gebruik UITSLUITEND de meegegeven context; verzin niets. Weet je iets niet, zeg dat kort en eerlijk.
Je voert NOOIT zelf iets uit. Bij een actie kies je alleen welke bestaande flow geopend moet worden en vul je bekende velden voor; de ouder controleert en bevestigt zelf. Je verstuurt niets en wijzigt geen afspraken, agenda of zorgregeling.
Schrijf "antwoord" in kort, warm Nederlands (max 2 zinnen), zonder te oordelen over de andere ouder en zonder partij te kiezen.
"actie" is één van:
${intents.map((i) => `- ${i.id}: ${i.uitleg}`).join("\n")}
Is niet duidelijk wat er bedoeld wordt (bijv. "Ik wil vrijdag iets veranderen"), kies dan verduidelijk, zet de vraag in "antwoord" (bijv. "Wat wil je vrijdag veranderen?") en keuzes in "opties" (bijv. Wisselmoment, Afspraak, Ophalen/brengen, Anders). Vraag alleen wat echt ontbreekt.
"samenvatting": de vooringevulde gegevens als label/waarde, bijv. {Wat, Wisselmoment}, {Dag, Vrijdag 13 maart}, {Huidig, 14:30}, {Voorstel, 15:30}. Leeg bij geen actie of verduidelijk.
"opties": alleen bij verduidelijk, anders leeg.
${kindRegel} "titel", "datum" (YYYY-MM-DD), "tijd" (HH:MM), "herhaling": vooral voor afspraak_toevoegen, anders lege string / "geen". "rol": bij kring_toevoegen één van Opa, Oma, Stiefouder / bonusouder, Familielid, Oppas, Andere verzorger, anders "".`;
}
export function assistentSchema(kindIds) {
    return {
        type: "object", additionalProperties: false,
        required: ["antwoord", "actie", "samenvatting", "opties", "kind", "titel", "datum", "tijd", "rol", "herhaling"],
        properties: {
            antwoord: { type: "string" },
            actie: { type: "string", enum: [...acties] },
            samenvatting: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "waarde"], properties: { label: { type: "string" }, waarde: { type: "string" } } } },
            opties: { type: "array", items: { type: "string" } },
            kind: { type: "string", enum: [...kindIds, ""] },
            titel: { type: "string" },
            datum: { type: "string" },
            tijd: { type: "string" },
            rol: { type: "string" },
            herhaling: { type: "string", enum: ["geen", "wekelijks", "tweewekelijks", "maandelijks"] },
        },
    };
}
export const assistentTaalRegel = (isEn) => isEn
    ? "\nSchrijf ALLE tekst voor de gebruiker (antwoord, samenvatting-labels en -waarden, opties) in het Engels (British English). De waarden van actie, kind, herhaling en rol blijven exact zoals hierboven gedefinieerd."
    : "";

/* ---------------------------------------------------------------- samenvatting */
export const samenvattingSysteem = `Je vat een gesprek tussen twee ouders in het Nederlands samen in maximaal 4 korte opsommingspunten.
Alleen feiten: wat is gevraagd, wat is afgesproken, wat staat nog open. Geen oordeel over personen, geen advies, geen nieuwe feiten, geen interpretatie van gevoelens. Kies geen partij.
Een voorstel is geen afspraak en gelezen of geen reactie is geen akkoord: noem iets alleen "afgesproken" als beide ouders het in het gesprek bevestigden.
Begin elk punt met "- ".`;
export const samenvattingTaalRegel = (isEn) => isEn ? "\nSchrijf de samenvatting in het Engels (British English) in plaats van in het Nederlands." : "";

/* ---------------------------------------------------------------- kassabon */
export const bonSysteem = "Je leest een kassabon of factuur. Haal winkel, datum, totaalbedrag en een korte omschrijving eruit. Verzin niets: laat onleesbare velden leeg of null.";
export const bonTaalRegel = (isEn) => isEn ? " Schrijf de omschrijving in het Engels (British English), ook al vraagt het schema om een Nederlandse omschrijving." : "";
export const bonSchema = {
    type: "object",
    additionalProperties: false,
    required: ["winkel", "datum", "bedrag", "omschrijving"],
    properties: {
        winkel: { type: "string", description: "Naam van de winkel, leeg als onleesbaar" },
        datum: { type: "string", description: "YYYY-MM-DD, leeg als onleesbaar" },
        bedrag: { type: ["number", "null"], description: "Totaalbedrag in euro, null als onleesbaar" },
        omschrijving: { type: "string", description: "Korte Nederlandse omschrijving van de aankoop, max 6 woorden" },
    },
};

/* ---------------------------------------------------------------- schoolbrief */
export function schoolinfoSysteem() {
    return `Je leest een Nederlandse schoolbrief of nieuwsbrief en haalt alleen concrete activiteiten met een datum eruit (studiedag, ouderavond, schoolreis, vrije dag, sportdag, inleveren van iets).
Houd informatie over dezelfde activiteit bij elkaar. Neem een genoemd bedrag als getal over, een expliciete deadline of actie onder taak, en letterlijk genoemde meeneemspullen onder voorbereiding. Bijvoorbeeld schoolreis vrijdag 09:00, €17,50, lunch meenemen: één item met bedrag 17.5 en voorbereiding Lunch meenemen. Bedrag null en tekst leeg als de brief dit niet noemt. Verzin geen taken, bedragen, kinderen of spullen.
"datum": YYYY-MM-DD. "tijd": HH:MM of leeg. "kind": de id van het genoemde kind uit de lijst, of leeg als de brief geen kind uit de lijst noemt.
Gebruik het opgegeven jaar als het jaar ontbreekt. Zet zeker op false als datum of tijd onduidelijk is. Maximaal 10 items.`;
}
export function schoolinfoSchema(kindIds) {
    return {
        type: "object", additionalProperties: false, required: ["items"],
        properties: {
            items: {
                type: "array",
                items: {
                    type: "object", additionalProperties: false,
                    required: ["titel", "datum", "tijd", "kind", "zeker", "bedrag", "taak", "voorbereiding"],
                    properties: {
                        titel: { type: "string" }, datum: { type: "string" }, tijd: { type: "string" },
                        kind: { type: "string", enum: [...kindIds, ""] }, zeker: { type: "boolean" },
                        bedrag: { type: ["number", "null"] }, taak: { type: "string" }, voorbereiding: { type: "string" },
                    },
                },
            },
        },
    };
}
export const schoolinfoTaalRegel = (isEn) => isEn ? "\nSchrijf ALLE tekst voor de gebruiker (titel, taak, voorbereiding) in het Engels (British English). Laat de JSON-sleutels en de waarden van kind ongewijzigd." : "";

/* ---------------------------------------------------------------- bericht aan school */
export const SCHOOL_VERZOEKEN = ["afzonderlijk", "verzetten", "telefonisch", "zelfde-informatie", "tweede-tijdstip", "bevestigen", "anders"];
export const verzoekTekst = {
    afzonderlijk: "navragen of de ouders afzonderlijk kunnen deelnemen aan het gesprek",
    verzetten: "vragen of de afspraak verzet kan worden",
    telefonisch: "navragen of een ouder telefonisch kan deelnemen",
    "zelfde-informatie": "vragen of beide ouders dezelfde informatie kunnen ontvangen",
    "tweede-tijdstip": "een tweede tijdstip aanvragen",
    bevestigen: "de afspraak bevestigen",
    anders: "een praktische vraag stellen",
};
export const schoolberichtSysteem = `Je schrijft een kort, neutraal en vriendelijk conceptbericht van een ouder aan school of een andere organisatie.
Regels:
- Alleen gegevens gebruiken die letterlijk zijn meegegeven. Verzin nooit namen, data, redenen of omstandigheden.
- Noem nooit een scheiding, conflict of veiligheidssituatie; ook niet met zachte woorden.
- Zakelijk en beleefd, maximaal 5 korte zinnen, begin met "Goedemiddag," en eindig met "Alvast bedankt.".
- Geen juridische termen, geen emotie, geen aannames over de organisatie.
- Het is een concept: de ouder leest het na en verstuurt het zelf.
- Geef alleen de berichttekst terug.`;
export const schoolberichtTaalRegel = (isEn) => isEn ? "\nSchrijf ALLE tekst voor de gebruiker (de berichttekst) in het Engels (British English). Begin dan met \"Good afternoon,\" en eindig met \"Thank you in advance.\"." : "";
export const schoolberichtSchema = { type: "object", additionalProperties: false, required: ["concept"], properties: { concept: { type: "string" } } };

/* ---------------------------------------------------------------- ouderschapsplan */
export const planSysteem = `Je leest een Nederlands ouderschapsplan en zoekt afspraken die ouders in een co-ouderschapsapp willen terugzien.
Onderdelen om te zoeken: zorgregeling, wisselmomenten, vakantieafspraken, feestdagen, halen en brengen, financiële afspraken (kinderkosten), communicatieafspraken, overige belangrijke gezamenlijke afspraken.
Regels:
- Neem alleen op wat echt in het document staat. Verzin niets en vul niets aan.
- Geef geen juridische interpretatie en bepaal niet welke ouder gelijk heeft.
- Is een passage onduidelijk, tegenstrijdig of voor meerdere uitleg vatbaar: zet "zeker" op false.
- "samenvatting": korte, neutrale weergave van wat er staat (max 2 zinnen).
- "voorstel": hoe dit kort in de app kan staan, bijv. "Week op / week af, wissel vrijdag na school".
- "bron": waar het staat (artikel/kopje/pagina) plus een kort letterlijk citaat.
- "categorie": één van Wisselmomenten, Halen en brengen, Vakanties en feestdagen, Bedtijden, Schermtijd, School, Medisch, Overig.
Geef maximaal 12 onderdelen. Is het geen ouderschapsplan of staat er niets bruikbaars in, geef een lege lijst.`;
export const planTaalRegel = (isEn) => isEn ? "\nSchrijf ALLE tekst voor de gebruiker (onderdeel, samenvatting, voorstel, bron-uitleg) in het Engels (British English). Laat letterlijke citaten uit het document in de originele taal. Gebruik voor \"categorie\" altijd exact een van de Nederlandse waarden hierboven." : "";
export const planSchema = {
    type: "object", additionalProperties: false, required: ["items"],
    properties: {
        items: {
            type: "array",
            items: {
                type: "object", additionalProperties: false,
                required: ["onderdeel", "samenvatting", "voorstel", "bron", "zeker", "categorie"],
                properties: {
                    onderdeel: { type: "string" }, samenvatting: { type: "string" }, voorstel: { type: "string" },
                    bron: { type: "string" }, zeker: { type: "boolean" }, categorie: { type: "string" },
                },
            },
        },
    },
};
