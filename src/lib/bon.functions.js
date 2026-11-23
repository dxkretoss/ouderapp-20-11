import { createServerFn } from "@/lib/server-fn";
import { z } from "zod";
import i18n from "@/i18n";
/** De instructie blijft Nederlands; de omschrijving volgt de taal van de app. */
const taalRegel = () => i18n.resolvedLanguage === "en" ? " Schrijf de omschrijving in het Engels (British English), ook al vraagt het schema om een Nederlandse omschrijving." : "";
const Input = z.object({ foto: z.string().startsWith("data:image/").max(6_000_000) });
const Uit = z.object({ winkel: z.string().max(80), datum: z.string().max(10), bedrag: z.number().min(0).max(100000).nullable(), omschrijving: z.string().max(80) });
const schema = {
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
/** Herkent alleen; de ouder controleert en past aan vóór opslaan in de bestaande kostenflow. */
export const leesBon = createServerFn({ method: "POST" })
    .inputValidator((d) => Input.parse(d))
    .handler(async ({ data }) => {
    const key = (typeof process !== "undefined" && process.env?.["LOVABLE_API_KEY"]) || (typeof import.meta !== "undefined" && import.meta.env?.VITE_LOVABLE_API_KEY) || "";
    if (!key)
        throw new Error(i18n.t("lib.bonFunctions.fout.nietIngesteld"));
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
        body: JSON.stringify({
            model: "openai/gpt-6-astra",
            instructions: "Je leest een kassabon of factuur. Haal winkel, datum, totaalbedrag en een korte omschrijving eruit. Verzin niets: laat onleesbare velden leeg of null." + taalRegel(),
            input: [{ role: "user", content: [{ type: "input_text", text: "Lees deze bon uit." }, { type: "input_image", image_url: data.foto }] }],
            store: false,
            stream: true,
            reasoning: { effort: "low" },
            text: { format: { type: "json_schema", name: "bon", strict: true, schema } },
        }),
    });
    if (!res.ok || !res.body) {
        if (res.status === 429)
            throw new Error(i18n.t("lib.bonFunctions.fout.druk"));
        if (res.status === 402)
            throw new Error(i18n.t("lib.bonFunctions.fout.tegoed"));
        throw new Error(i18n.t("lib.bonFunctions.fout.mislukt"));
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", tekst = "";
    for (;;) {
        const { value, done } = await reader.read();
        if (done)
            break;
        buf += dec.decode(value, { stream: true });
        const regels = buf.split("\n");
        buf = regels.pop() ?? "";
        for (const r of regels) {
            if (!r.startsWith("data:"))
                continue;
            try {
                const e = JSON.parse(r.slice(5).trim());
                if (e.type === "response.output_text.delta")
                    tekst += e.delta ?? "";
            }
            catch { /* keep-alive */ }
        }
    }
    try {
        return Uit.parse(JSON.parse(tekst));
    }
    catch {
        throw new Error(i18n.t("lib.bonFunctions.fout.onleesbaar"));
    }
});
