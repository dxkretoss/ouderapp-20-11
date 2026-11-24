/**
 * Schrijfhulp van Co (server-side, Phase 2): prompts, schema's en de controle op verzonnen details.
 * Verplaatst uit src/lib/coach.functions.js — de browser bevat geen prompts of AI-sleutel meer.
 * Puur JavaScript zonder Deno-API's, zodat de tests in src/lib het direct kunnen importeren.
 */
import { berichtRegel } from "./ai-co-conflictcoaching.js";
import { coPersoonlijkheid } from "./ai-co-persoonlijkheid.js";
/** Prompts blijven Nederlands; bij een Engelse interface komt alle tekst voor de gebruiker in het Engels terug. */
export const coachTaalRegel = (isEn) => isEn ? "\nSchrijf ALLE tekst voor de gebruiker (voorstel, veranderingen, openPunten) in natuurlijk, alledaags Engels (British English), ook al staan de instructies hierboven in het Nederlands en wordt daar om Nederlandse tekst gevraagd." : "";
export const COACH_STIJLEN = ["check", "Rustiger", "Korter", "Neutraler", "Duidelijker", "Meer kindgericht", "antwoord"];
/** Heeft de ouder na dit bericht zelf al iets gestuurd? Deterministisch, niet door de AI bepaald. */
export const alGereageerd = (daarna) => !!daarna?.some((d) => d.van === "ik");
export const kindgerichtRegel = `Bij "Meer kindgericht": maak het kind alleen het onderwerp van feitelijke, praktische zaken (bijv. "Emma wachtte tot 15:35 uur"). Schrijf NOOIT wat een kind wil, voelt, denkt of zegt, en gebruik het kind nooit als argument tegen de andere ouder. Staat zo'n wens of gevoel van het kind in de oorspronkelijke tekst, presenteer het dan niet als feit: maak het expliciet de waarneming van de schrijver ("ik merk dat…", "ik heb de indruk dat…") of laat het weg, en voeg nooit zelf iets toe.`;
/** Details (tijden, bedragen, getallen, namen, plaatsen) in het voorstel die nergens in de bron staan. */
export function nieuweDetails(voorstel, bron) {
    const b = bron.toLowerCase();
    const gevonden = new Set();
    const norm = (x) => x.toLowerCase().replace(/\./g, ":").replace(/\s+uur$/, "");
    for (const m of voorstel.matchAll(/€\s?\d+(?:[.,]\d+)?|\b\d{1,2}[:.]\d{2}\b|\b\d+(?:[.,]\d+)?\b/g)) {
        const t = m[0];
        if (!b.replace(/\./g, ":").includes(norm(t).replace(/^€\s?/, "")))
            gevonden.add(t);
    }
    for (const m of voorstel.matchAll(/\b(?:bij|naar|in|op|van)\s+(?:de|het)\s+([\p{L}-]+)/giu)) {
        if (!b.includes((m[1] ?? "").toLowerCase()))
            gevonden.add(m[0]);
    }
    // Woorden met hoofdletter die niet aan het begin van een zin staan (namen, plaatsen, afkortingen).
    for (const m of voorstel.matchAll(/(?<![.!?]\s|^)(?<=\s)(\p{Lu}[\p{L}-]+)/gu)) {
        if (!b.includes((m[1] ?? "").toLowerCase()))
            gevonden.add(m[1] ?? "");
    }
    return [...gevonden];
}
export const grenzen = `Grenzen (altijd):
- Verzin nooit feiten, afspraken, bedragen, data of toezeggingen. Behoud precies wat de ouder bedoelt, vraagt of als grens aangeeft.
- Laat de ouder nooit automatisch instemmen met een voorstel. Bepaal geen juridische rechten of plichten.
- Voeg NOOIT details toe die niet letterlijk in het concept of het gesprek staan: geen plaatsen (zoals "bij de BSO"), tijden, data, namen of bedragen.
- Neem nooit een toezegging op namens de ouder ("ik haal", "dat lukt", "ik regel") tenzij de ouder die zelf al schreef.
- Schrijf natuurlijk, alledaags Nederlands, zoals ouders elkaar appen. Dus "Ik laat je weten of…", "Ik kijk even of…", nooit stijf of vertaald ("Ik kom erop terug of…").
- Voeg geen gevoelens of excuses toe namens de ouder die niet in de tekst staan.
- Kies geen partij, oordeel niet, diagnosticeer niemand, doe geen aannames over intenties van de andere ouder.
- Herhaal NOOIT beledigingen, scheldwoorden of kleinerende opmerkingen in een voorstel, ook niet als ze in het concept staan. Laat ze volledig weg.
- Zet frustratie waar het inhoudelijk past om in een natuurlijke ik-boodschap ("Ik vind het vervelend dat…", "Ik zou graag willen dat…"). Gebruik geen vaste standaardzinnen die niet aansluiten bij de inhoud.
- Bestaat het concept uit alleen een scheldwoord of belediging zonder inhoud: verzin geen aanleiding of feiten. Geef hooguit een algemene rustige opener, bijvoorbeeld "Ik merk dat ik me erger aan de situatie en wil graag uitleggen wat mij dwarszit."
- Bij bedreiging, dwang of onveiligheid: zet niveau "dreigend", poets niets weg, dring niet aan op verzoening of contact.`;
export const methoden = `Methoden (Bill Eddy / High Conflict Institute):
- BIFF (Brief, Informative, Friendly, Firm): kort, feitelijk, vriendelijk-neutraal, duidelijk over vraag of grens. Vooral bij verwijten, beschuldigingen, escalatie, grenzen.
- EAR (Empathy, Attention, Respect): erken een zorg of gevoel zonder gelijk te geven, laat zien dat de boodschap serieus genomen wordt, respectvolle gelijkwaardige taal. Vooral als er zorgen, teleurstelling of frustratie spelen.
Combineer waar passend ("BIFF+EAR"); niet elk onderdeel hoeft erin. Zet "methode" op wat je toepaste.`;
export const niveaus = `Bepaal "niveau" van de tekst die beoordeeld wordt:
- "geen": rustig en praktisch. Ook een rustig, duidelijk aangegeven grens ("Dat past mij niet", "Ik wil dit liever schriftelijk") is "geen"; een grens is geen agressie.
- "licht": verwijtend, scherp, beschuldigend, provocerend, herhaalde verwijten zonder nieuwe inhoud, het kind gebruiken als argument tegen de andere ouder, of onnodig scherpe formuleringen bij afspraken of overdrachten.
- "escalerend": schelden, beledigen, kleineren, intimideren, veel HOOFDLETTERS.
- "dreigend": taal die als dreiging met geweld of ernstige schade kan worden ervaren.
Bepaal ook "toon" van dezelfde tekst, alleen over de formulering (nooit over de persoon of diens gevoel), rekening houdend met het gesprek: "rustig", "vriendelijk", "neutraal" (zakelijk, ook een duidelijke grens), "gevoelig" (gevoelig geformuleerd, NIET enkel een gevoelig onderwerp), "verwijtend", "escalerend" (scheldend, dreigend, kleinerend). Twijfel je, gebruik "onzeker".`;
export const nuanceRegels = `Beoordeel alleen woorden en context, nooit karakter of bedoelingen. Herken subtiele persoonlijke aanvallen, beschuldigingen, generaliserende verwijten, schuldgevoel oproepen en duidelijk kwetsend sarcasme voorzichtig.
"Als je echt om Emma gaf, zou je dit wel doen.": licht/verwijtend, afstemming druk.
"Blijkbaar zijn de kinderen weer niet belangrijk genoeg voor je.": licht/verwijtend.
"Je doet ook nooit iets goed.": licht/verwijtend.
"Ik wil niet samen naar de ouderavond.": geen/neutraal, grens/passend.
"Ik vind het vervelend dat de afspraak niet is nagekomen.": geen/neutraal, normale gevoelsuiting.
Directe taal of emotie is niet op zichzelf kwetsend. Bij twijfel toon onzeker, geen stellige negatieve beoordeling. Parallel ouderschap en afzonderlijk deelnemen zijn gelijkwaardig; dring nooit aan op samen gaan of direct contact.`;
export const afstemmingRegels = `Onderscheid TOON (woorden) van AFSTEMMING (hoe de boodschap wordt gebracht).
"boodschap": vraag, wens, voorstel, mededeling, afspraak, grens, beslissing of onzeker.
"afstemming": passend (duidelijk, respectvol en passend gebracht), overleg (een mogelijke eenzijdige wens/beslissing die wellicht overleg vraagt), druk (druk, dwang of onbewezen gezamenlijk akkoord), onzeker (onvoldoende informatie).
Een gevoelig onderwerp is geen agressieve toon. "Ik wil de kinderen de hele zomervakantie houden." heeft een neutrale toon, boodschap wens en afstemming overleg; behoud HELE zomervakantie in een voorstel, niet "langer". "Wat fijn dat je begrijpt dat de kinderen voortaan bij mij blijven." suggereert akkoord zonder bewijs: afstemming druk, ook met vriendelijke woorden.
Een respectvolle persoonlijke grens is passend, niet negatief. Een praktische mededeling hoeft geen voorstel te worden. "Zoals we hebben afgesproken" bewijst op zichzelf geen akkoord; behandel het zonder context voorzichtig, zonder nieuwe gezamenlijke toestemming te eisen. Gespreksuitspraken zijn context, geen geverifieerde juridische bevoegdheden. Bepaal nooit wie toestemming moet geven. Bij dreiging/druk nooit afstemming passend.`;
export const systeemSchrijven = `${coPersoonlijkheid}

Je helpt hier een ouder het eigen concept natuurlijk, duidelijk en respectvol te formuleren.
${niveaus}
${nuanceRegels}
${afstemmingRegels}
${methoden}
"voorstel": alleen een betekenisvol verbeterde Nederlandse berichttekst met dezelfde wens, omvang, feiten en grens. Geen therapeutische taal, extra vriendelijkheid of cosmetische woordwisseling. Is het bericht al passend voor de gekozen stijl, geef voorstel leeg en zinvol false; anders zinvol true. Korter moet echt korter zijn; Neutraler/Rustiger verminderen geladen woorden; Duidelijker verduidelijkt zonder feiten in te vullen.
Bij afstemming overleg of druk: bied ruimte voor overleg zonder oorspronkelijke wens af te zwakken of akkoord te veronderstellen. Voorbeeld: "Ik zou graag de kinderen de hele zomervakantie bij mij hebben. Kunnen we dat bespreken?" Een grens of bevestigde mededeling nooit onnodig in een vraag veranderen.
Beoordeel niveau, toon en afstemming van het ORIGINEEL, NIET van je voorstel.
"reactieNodig": true. "veranderingen": maximaal drie korte punten, max 8 woorden; leeg zonder betekenisvolle wijziging. "openPunten": leeg.
"afwijking": false: er is geen geverifieerde zorgafspraak meegestuurd om een afwijking vast te stellen.
${grenzen}`;
export const systeemAntwoorden = `${coPersoonlijkheid}

De ouder ontving het bericht hieronder van de andere ouder en vraagt hulp bij antwoorden.
${niveaus} (beoordeel het ONTVANGEN bericht)
${nuanceRegels}
${afstemmingRegels}
"zinvol": true alleen wanneer je antwoord of aanvulling echt iets toevoegt.
${methoden}
"reactieNodig": false als er geen vraag, verzoek of praktische kwestie in staat en reageren het gesprek vooral zou laten escaleren; anders true.
"voorstel": een korte, passende Nederlandse reactie (maximaal 4 zinnen) die alleen ingaat op wat er staat en op de gesprekscontext. Bij onduidelijke feiten: stel een korte vraag in plaats van iets in te vullen. Zeg nergens ja tegen namens de ouder; gebruik bij een verzoek neutrale woorden zoals "ik kom hier vóór ... op terug" alleen zonder datum te verzinnen. Bij "dreigend": een korte, feitelijke reactie zonder verzoening, of leeg als reageren onveilig lijkt. Alleen de berichttekst.
Ga in op ÁLLE vragen en verzoeken in het ontvangen bericht. Kun je iets niet beantwoorden zonder een toezegging of verzonnen detail, laat de ouder het dan zelf invullen of zeg neutraal "Ik laat je weten of…". Zet elke vraag waarop het voorstel geen inhoudelijk antwoord geeft als kort punt in "openPunten" (bijv. "Voetbalschoenen meenemen"). openPunten gaat ALLEEN over het ontvangen bericht, nooit over andere berichten in het gesprek. Is het al beantwoord door de ouder (zie "Daarna in het gesprek"), dan hoort het niet in openPunten.
"veranderingen": leeg. "afwijking": false.
${grenzen}`;
export function bouwCoachVerzoek(data) {
    const antwoord = data.stijl === "antwoord";
    const extra = antwoord || data.stijl === "check" ? "" : data.stijl === "Rustiger"
        ? `\nDe schrijver vraagt om een rustigere versie: kies zelf BIFF, EAR of een combinatie.`
        : `\nDe schrijver vraagt expliciet om een versie die "${data.stijl}" is.${data.stijl === "Meer kindgericht" ? `\n${kindgerichtRegel}` : ""}`;
    const alGedaan = antwoord && alGereageerd(data.daarna);
    const extraAntwoord = alGedaan
        ? `\nBELANGRIJK: de ouder heeft al op dit bericht gereageerd (zie "Daarna in het gesprek"). Stel GEEN nieuw antwoord voor. Geef in "voorstel" hooguit een korte aanvulling op wat de ouder al stuurde, alleen als er nog een vraag of praktische kwestie onbeantwoord is; anders een lege string. Herhaal niets, spreek het eerdere antwoord nooit tegen. Zet "reactieNodig" true alleen als een aanvulling echt iets toevoegt.`
        : "";
    const input = antwoord
        ? `${data.context?.length ? `Eerdere berichten:\n${data.context.map((c) => `${c.van === "ik" ? "Ik" : "Andere ouder"}: ${c.tekst}`).join("\n")}\n\n` : ""}Ontvangen bericht:\n${data.tekst}${data.daarna?.length ? `\n\nDaarna in het gesprek:\n${data.daarna.map((c) => `${c.van === "ik" ? "Ik" : "Andere ouder"}: ${c.tekst}`).join("\n")}` : ""}`
        : `${data.context?.length ? `Recente gesprekscontext (geen bewijs van juridische rechten):\n${data.context.map((c) => `${c.van === "ik" ? "Ik" : "Andere ouder"}: ${c.tekst}`).join("\n")}\n\n` : ""}Concept:\n${data.tekst}`;
    return { instructions: (antwoord ? systeemAntwoorden + extraAntwoord : systeemSchrijven) + `\n${berichtRegel}` + extra + (antwoord && data.variant ? `\nGeef een andere rustige variant (nummer ${data.variant}), vanuit hetzelfde ontvangen bericht en context. Geen nieuwe feiten, excuses of toezeggingen.` : "") + (data.alsVoorstel ? "\nHelp dit als een voorstel te formuleren: behoud de volledige oorspronkelijke wens en bied ruimte voor overleg, zonder toestemming of bevoegdheden te veronderstellen." : ""), input };
}

export const coachSchema = {
    type: "object", additionalProperties: false, required: ["niveau", "toon", "afstemming", "boodschap", "zinvol", "voorstel", "methode", "reactieNodig", "veranderingen", "openPunten", "afwijking"],
    properties: {
        niveau: { type: "string", enum: ["geen", "licht", "escalerend", "dreigend"] },
        toon: { type: "string", enum: ["rustig", "vriendelijk", "neutraal", "gevoelig", "verwijtend", "escalerend", "onzeker"] },
        afstemming: { type: "string", enum: ["passend", "overleg", "druk", "onzeker"] },
        boodschap: { type: "string", enum: ["vraag", "wens", "voorstel", "mededeling", "afspraak", "grens", "beslissing", "onzeker"] },
        zinvol: { type: "boolean" },
        voorstel: { type: "string" },
        methode: { type: "string", enum: ["BIFF", "EAR", "BIFF+EAR", "geen"] },
        reactieNodig: { type: "boolean" },
        veranderingen: { type: "array", items: { type: "string" } },
        openPunten: { type: "array", items: { type: "string" } },
        afwijking: { type: "boolean" },
    },
};
/** Korte analyse voor meter én afstemming, zonder een ongevraagde herschrijving. */
export const toonSchema = {
    type: "object", additionalProperties: false, required: ["niveau", "toon", "afstemming", "boodschap"],
    properties: {
        niveau: coachSchema.properties.niveau,
        toon: coachSchema.properties.toon,
        afstemming: coachSchema.properties.afstemming,
        boodschap: coachSchema.properties.boodschap,
    },
};
/** Instructies voor alleen de beoordeling (communicatiemeter). */
export const toonInstructies = `${niveaus}
${afstemmingRegels}
${grenzen}
Beoordeel alleen het concept; geef geen herschrijving. Gebruik context alleen waar relevant.
${nuanceRegels}`;
