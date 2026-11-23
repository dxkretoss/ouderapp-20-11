import { createServerFn } from "@/lib/server-fn";
import { z } from "zod";
import i18n from "@/i18n";
/** Systeemprompt blijft Nederlands; in het Engels schrijft de AI het concept in het Engels. */
const taalRegel = () => i18n.resolvedLanguage === "en" ? "\nSchrijf ALLE tekst voor de gebruiker (de berichttekst) in het Engels (British English). Begin dan met \"Good afternoon,\" en eindig met \"Thank you in advance.\"." : "";
const Input = z.object({
    afspraak: z.string().min(1).max(200),
    kind: z.string().max(120).optional(),
    verzoek: z.enum(["afzonderlijk", "verzetten", "telefonisch", "zelfde-informatie", "tweede-tijdstip", "bevestigen", "anders"]),
    toelichting: z.string().max(500).optional(),
});
const verzoekTekst = {
    afzonderlijk: "navragen of de ouders afzonderlijk kunnen deelnemen aan het gesprek",
    verzetten: "vragen of de afspraak verzet kan worden",
    telefonisch: "navragen of een ouder telefonisch kan deelnemen",
    "zelfde-informatie": "vragen of beide ouders dezelfde informatie kunnen ontvangen",
    "tweede-tijdstip": "een tweede tijdstip aanvragen",
    bevestigen: "de afspraak bevestigen",
    anders: "een praktische vraag stellen",
};
/**
 * Kort, neutraal conceptbericht aan school of een andere organisatie.
 * Alleen bekende gegevens; nooit een reden voor de scheiding, beschuldigingen of veiligheidsinformatie verzinnen.
 */
export const schoolBericht = createServerFn({ method: "POST" })
    .inputValidator((d) => Input.parse(d))
    .handler(async ({ data }) => {
    const key = (typeof process !== "undefined" && process.env?.["LOVABLE_API_KEY"]) || (typeof import.meta !== "undefined" && import.meta.env?.VITE_LOVABLE_API_KEY) || "";
    if (!key)
        throw new Error(i18n.t("lib.schoolberichtFunctions.fout.nietIngesteld"));
    const instructions = `Je schrijft een kort, neutraal en vriendelijk conceptbericht van een ouder aan school of een andere organisatie.
Regels:
- Alleen gegevens gebruiken die letterlijk zijn meegegeven. Verzin nooit namen, data, redenen of omstandigheden.
- Noem nooit een scheiding, conflict of veiligheidssituatie; ook niet met zachte woorden.
- Zakelijk en beleefd, maximaal 5 korte zinnen, begin met "Goedemiddag," en eindig met "Alvast bedankt.".
- Geen juridische termen, geen emotie, geen aannames over de organisatie.
- Geef alleen de berichttekst terug.`;
    const input = `Afspraak: ${data.afspraak}${data.kind ? `\nKind: ${data.kind}` : ""}\nVerzoek: ${verzoekTekst[data.verzoek]}${data.toelichting ? `\nExtra context van de ouder: ${data.toelichting}` : ""}`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
        body: JSON.stringify({
            model: "openai/gpt-6-astra", instructions: instructions + taalRegel(), input, stream: true, store: false,
            reasoning: { effort: "low", summary: "auto" }, include: ["reasoning.encrypted_content"],
            text: { format: { type: "json_schema", name: "schoolbericht", strict: true, schema: { type: "object", additionalProperties: false, required: ["concept"], properties: { concept: { type: "string" } } } } },
        }),
    });
    if (!res.ok || !res.body) {
        if (res.status === 429)
            throw new Error(i18n.t("lib.schoolberichtFunctions.fout.druk"));
        if (res.status === 402)
            throw new Error(i18n.t("lib.schoolberichtFunctions.fout.tegoeden"));
        throw new Error(i18n.t("lib.schoolberichtFunctions.fout.nietBereikbaar"));
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
        return JSON.parse(out);
    }
    catch {
        throw new Error(i18n.t("lib.schoolberichtFunctions.fout.onbruikbaar"));
    }
});
