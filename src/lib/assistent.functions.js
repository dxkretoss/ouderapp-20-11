import i18n from "@/i18n";
import { createServerFn } from "@/lib/server-fn";
import { aiAanroep } from "@/lib/ai-aanroep";
import { z } from "zod";
/**
 * Zoek- en regelassistent + spraak naar tekst. Sinds Phase 2 server-side (edge function `ai-assistant`):
 * het intent-register, de prompt en de OpenAI-sleutel staan op de server (supabase/functions/_shared/ai-tools-prompts.js).
 * De AI kiest alleen een intent en vult velden voor; de ouder opent de bestaande flow en bevestigt zelf.
 * `kind` in het antwoord is een kind-id van de server (of "").
 */
const NS = "lib.assistentFunctions";
export const vraagAssistent = createServerFn({ method: "POST" })
    .inputValidator((d) => z.object({ vraag: z.string().min(1).max(1000), context: z.string().max(12000) }).parse(d))
    .handler(async ({ data }) => {
    const r = await aiAanroep("ai-assistant", "ask", { vraag: data.vraag, context: data.context }, NS, { druk: "druk", nietIngesteld: "nietIngesteld", anders: "nietBereikbaar", opties: { wat: i18n.t(`${NS}.wie.assistent`) } });
    if (!r?.result)
        throw new Error(i18n.t(`${NS}.fout.onbruikbaar`));
    return r.result;
});
export const zetSpraakOm = createServerFn({ method: "POST" })
    .inputValidator((d) => z.object({ audio: z.string().min(1).max(14_000_000), type: z.string() }).parse(d))
    .handler(async ({ data }) => {
    const r = await aiAanroep("ai-assistant", "transcribe", { audio: data.audio, type: data.type }, NS, { druk: "druk", nietIngesteld: "nietIngesteld", anders: "nietBereikbaar", opties: { wat: i18n.t(`${NS}.wie.spraak`) } });
    return { tekst: String(r?.tekst ?? "").trim() };
});
