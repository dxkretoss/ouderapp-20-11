import { createServerFn } from "@/lib/server-fn";
import { z } from "zod";
import i18n from "@/i18n";
const fout = (k) => i18n.t(`lib.ouderschapsplanFunctions.fout.${k}`);
/** De prompt blijft Nederlands; de AI antwoordt in de taal van de app. */
const taalRegel = () => i18n.resolvedLanguage === "en" ? "\nSchrijf ALLE tekst voor de gebruiker (onderdeel, samenvatting, voorstel, bron-uitleg) in het Engels (British English). Laat letterlijke citaten uit het document in de originele taal. Gebruik voor \"categorie\" altijd exact een van de Nederlandse waarden hierboven." : "";
const systeem = `Je leest een Nederlands ouderschapsplan en zoekt afspraken die ouders in een co-ouderschapsapp willen terugzien.
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
const schema = {
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
export const herkenAfspraken = createServerFn({ method: "POST" })
    .inputValidator((d) => z.object({ naam: z.string().max(200), type: z.string().max(100), data: z.string().min(1).max(14_000_000) }).parse(d))
    .handler(async ({ data }) => {
    const key = (typeof process !== "undefined" && process.env?.["LOVABLE_API_KEY"]) || (typeof import.meta !== "undefined" && import.meta.env?.VITE_LOVABLE_API_KEY) || "";
    if (!key)
        throw new Error(fout("nietIngesteld"));
    const isTekst = data.type.startsWith("text/");
    const inhoud = isTekst
        ? [{ type: "input_text", text: new TextDecoder().decode(Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0))) }]
        : [{ type: "input_file", filename: data.naam, file_data: `data:${data.type || "application/pdf"};base64,${data.data}` }];
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
        body: JSON.stringify({
            model: "openai/gpt-6-astra",
            instructions: systeem + taalRegel(),
            input: [{ role: "user", content: [...inhoud, { type: "input_text", text: "Welke afspraken staan in dit ouderschapsplan?" }] }],
            stream: true, store: false,
            reasoning: { effort: "low" },
            text: { format: { type: "json_schema", name: "ouderschapsplan", strict: true, schema } },
        }),
    });
    if (!res.ok || !res.body) {
        if (res.status === 429)
            throw new Error(fout("druk"));
        if (res.status === 402)
            throw new Error(fout("tegoed"));
        if (res.status === 400)
            throw new Error(fout("onleesbaar"));
        throw new Error(fout("onbereikbaar"));
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
                if (e.type === "response.output_text.delta")
                    out += e.delta;
            }
            catch { /* negeer */ }
        }
    }
    try {
        return JSON.parse(out).items.slice(0, 12);
    }
    catch {
        throw new Error(fout("geenResultaat"));
    }
});
