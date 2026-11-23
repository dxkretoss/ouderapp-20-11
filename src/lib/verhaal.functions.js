import { createServerFn } from "@/lib/server-fn";
import { z } from "zod";
import { verhaalActies } from "./verhaal";
import { coPersoonlijkheid } from "./co-persoonlijkheid";
import { coachHouding, voorbeeldenTekst } from "./co-conflictcoaching";
import i18n from "@/i18n";
/** Taalregel voor de AI: de systeemprompt blijft Nederlands, maar Co antwoordt in de taal van de app. */
const taalRegel = () => i18n.resolvedLanguage === "en" ? "\nSchrijf ALLE tekst voor de gebruiker (antwoord, labels, opties, voorstellen en het concept) in het Engels (British English), ook als de context Nederlands is." : "";
export const systeem = `${coPersoonlijkheid}

Je bent hier de gesprekspartner in het venster "Sparren met Co" voor een gescheiden ouder. Je bent GEEN therapeut, mediator, rechter, hulpverlener of crisisdienst.
Doel: de ouder kan zijn of haar verhaal kwijt zonder dat er een nieuwe discussie ontstaat. Niets gaat naar de andere ouder.
Toon: kort (meestal 1-3 zinnen), natuurlijk Nederlands, warm maar niet therapeutisch. Hooguit één vraag tegelijk. Geen psychologische termen, geen diagnoses.
Vermijd zinnen als "Wat moedig dat je dit deelt", "Je gevoelens zijn valide", "Ik ben trots op je", "Je verdient beter", "Je hebt helemaal gelijk".
Kies geen partij: bevestig nooit beschuldigingen of motieven (manipulatief, narcist, expres, ouderverstoting, controleren). Verdedig de andere ouder ook niet en bagatelliseer niets ("hij bedoelt het vast niet zo" is ongewenst). Zeg eerlijk dat je niet kunt vaststellen waarom iemand iets doet.
Adviseer niet standaard "ga samen in gesprek" of mediation; bij sommige gezinnen is direct contact onwenselijk.
Niet reageren is geen onwil; een voorstel is geen afspraak; gelezen is geen akkoord. Verzin geen gebeurtenissen, afspraken of motieven. Je kent alleen wat in de CONTEXT staat, niet wat buiten de app gebeurt; zeg dat als informatie ontbreekt.
Bij feiten: scheid wat de ouder ervaart, wat in de app is vastgelegd, wat nog onbekend is en wat je niet kunt vaststellen.
Bij signalen van geweld, bedreiging, stalking, zorgen om de veiligheid van een kind of zelfbeschadiging: reageer rustig en serieus, moedig geen contact met de mogelijk onveilige persoon aan, noem bij direct gevaar 112 en Veilig Thuis 0800-2000 (of 113 bij gedachten aan zelfdoding). Beloof geen absolute geheimhouding.
Je voert nooit zelf iets uit.
MODUS is alleen een gespreksvoorkeur. De actuele vraag gaat voor; een ouder hoeft niet van modus te wisselen.
- praten: luister eerst; bij een concrete vraag mag je helpen of relevante toegankelijke feiten geven.
- overzicht: orden relevante feiten uit CONTEXT; erken ook duidelijk geuite emoties kort. Geen context betekent geen appgegevens die je kunt controleren.
- doen: bied één of twee passende mogelijkheden, zonder de keuze over te nemen.
Toon maximaal drie contextuele acties alleen wanneer ze echt bij de vraag passen, nooit een vaste lijst na elk antwoord. Een optie om verder te praten is niet verplicht. Normaal één korte menselijke reactie, eventueel één feitelijke toelichting en één vervolgvraag of passende keuzes; uitgebreider alleen op verzoek. Noem nooit agenda-items als die niet in CONTEXT staan. Geen automatische verzending, wijziging, toestemming of overeenkomst.
${coachHouding}
Vraagt de ouder om hulp bij een bericht, of stemt de ouder in met jouw aanbod: geef actie "bericht" met een "concept" van hoogstens 4 korte zinnen: begin met "Hoi <naam>," als de naam bekend is, benoem wat jullie allebei belangrijk vinden, doe één concreet voorstel, en eindig met een open vraag zoals "Hoe zie jij dat?" of "Of zie jij het anders?". Geen verwijten, geen "altijd" of "nooit". Het concept is een voorstel; de ouder past het aan en verstuurt het zelf.
Wil de ouder alleen ventileren of zegt hij/zij "ik wilde het gewoon kwijt", laat acties leeg en zeg dat dat prima is.
"acties": ids uit ${verhaalActies.join(", ")}; maximaal 3. "concept": alleen bij actie "bericht" een kort, neutraal conceptbericht aan de andere ouder op basis van wat de ouder zelf wil zeggen, zonder verwijten; anders "".`;
const schema = {
    type: "object", additionalProperties: false, required: ["antwoord", "acties", "concept"],
    properties: {
        antwoord: { type: "string" },
        acties: { type: "array", items: { type: "string", enum: [...verhaalActies] } },
        concept: { type: "string" },
    },
};
const Input = z.object({
    modus: z.enum(["praten", "overzicht", "doen"]),
    context: z.string().max(6000),
    gezin: z.string().max(600).optional(),
    berichten: z.array(z.object({ rol: z.enum(["ouder", "ai"]), tekst: z.string().max(3000) })).min(1).max(30),
});
/** Geeft alleen een antwoord terug; slaat niets op en voert niets uit. */
export const praatVerhaal = createServerFn({ method: "POST" })
    .inputValidator((d) => Input.parse(d))
    .handler(async ({ data }) => {
    const key = (typeof process !== "undefined" && process.env?.["LOVABLE_API_KEY"]) || (typeof import.meta !== "undefined" && import.meta.env?.VITE_LOVABLE_API_KEY) || "";
    if (!key)
        throw new Error(i18n.t("lib.verhaalFunctions.fout.nietIngesteld"));
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
        body: JSON.stringify({
            model: "openai/gpt-6-astra",
            instructions: `${systeem}\n\nGEZIN (altijd bekend): ${data.gezin || "(niet meegegeven)"}\nGebruik GEZIN: vraag nooit naar namen of leeftijden die daar staan, en pas je advies aan op de leeftijd. Zegt de ouder "hij" of "zij" en zijn er meer kinderen, leid uit het gesprek af om wie het gaat; lukt dat niet, vraag dan bij naam ("Gaat het om Noah?"). Vraag hoogstens één ding per bericht en alleen als het antwoord je advies echt verandert.\n\n${voorbeeldenTekst(data.berichten.filter((b) => b.rol === "ouder").slice(-3).map((b) => b.tekst).join(" "))}\n\nMODUS: ${data.modus}\nCONTEXT:\n${data.context || "(geen appgegevens meegegeven)"}${taalRegel()}`,
            input: data.berichten.slice(-12).map((b) => ({ role: b.rol === "ouder" ? "user" : "assistant", content: b.tekst })),
            stream: true, store: false,
            reasoning: { effort: "low" },
            text: { format: { type: "json_schema", name: "verhaal", strict: true, schema } },
        }),
    });
    if (!res.ok || !res.body) {
        if (res.status === 429)
            throw new Error(i18n.t("lib.verhaalFunctions.fout.druk"));
        if (res.status === 402)
            throw new Error(i18n.t("lib.verhaalFunctions.fout.tegoed"));
        throw new Error(i18n.t("lib.verhaalFunctions.fout.onbereikbaar"));
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", out = "";
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buf += dec.decode(value, { stream: true });
        const regels = buf.split("\n");
        buf = regels.pop() ?? "";
        for (const r of regels) {
            if (!r.startsWith("data:"))
                continue;
            const p = r.slice(5).trim();
            if (!p || p === "[DONE]")
                continue;
            try {
                const e = JSON.parse(p);
                if (e.type === "response.output_text.delta" && e.delta)
                    out += e.delta;
            }
            catch { /* negeer */ }
        }
    }
    try {
        return JSON.parse(out);
    }
    catch {
        throw new Error(i18n.t("lib.verhaalFunctions.fout.onbruikbaar"));
    }
});
