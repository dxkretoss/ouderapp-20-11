import { createServerFn } from "@/lib/server-fn";
import { z } from "zod";
import i18n from "@/i18n";
const Input = z.object({
    berichten: z.array(z.object({ van: z.string().max(40), tekst: z.string().max(2000) })).min(1).max(200),
});
const systeem = `Je vat een gesprek tussen twee ouders in het Nederlands samen in maximaal 4 korte opsommingspunten.
Alleen feiten: wat is gevraagd, wat is afgesproken, wat staat nog open. Geen oordeel over personen, geen advies, geen nieuwe feiten, geen interpretatie van gevoelens.
Begin elk punt met "- ".`;
const taalRegel = () => i18n.resolvedLanguage === "en" ? "\nSchrijf de samenvatting in het Engels (British English) in plaats van in het Nederlands." : "";
/** Geeft alleen tekst terug; slaat niets op en wijzigt niets. */
export const vatGesprekSamen = createServerFn({ method: "POST" })
    .inputValidator((d) => Input.parse(d))
    .handler(async ({ data }) => {
    const key = (typeof process !== "undefined" && process.env?.["LOVABLE_API_KEY"]) || (typeof import.meta !== "undefined" && import.meta.env?.VITE_LOVABLE_API_KEY) || "";
    if (!key)
        throw new Error(i18n.t("lib.samenvattingFunctions.fout.nietIngesteld"));
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
        body: JSON.stringify({
            model: "openai/gpt-6-astra",
            instructions: systeem + taalRegel(),
            input: data.berichten.map((b) => `${b.van}: ${b.tekst}`).join("\n"),
            stream: true,
            store: false,
            reasoning: { effort: "low" },
        }),
    });
    if (!res.ok || !res.body) {
        if (res.status === 429)
            throw new Error(i18n.t("lib.samenvattingFunctions.fout.druk"));
        if (res.status === 402)
            throw new Error(i18n.t("lib.samenvattingFunctions.fout.tegoeden"));
        throw new Error(i18n.t("lib.samenvattingFunctions.fout.luktNiet"));
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", tekst = "";
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
            const d = r.slice(5).trim();
            if (!d || d === "[DONE]")
                continue;
            try {
                const e = JSON.parse(d);
                if (e.type === "response.output_text.delta")
                    tekst += e.delta;
            }
            catch { /* negeer */ }
        }
    }
    if (!tekst.trim())
        throw new Error(i18n.t("lib.samenvattingFunctions.fout.geenAntwoord"));
    return tekst.trim();
});
