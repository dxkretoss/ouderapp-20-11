import i18n from "@/i18n";
import { createServerFn } from "@/lib/server-fn";
import { aiAanroep } from "@/lib/ai-aanroep";
import { z } from "zod";
/**
 * Gesprek samenvatten (Berichten). Sinds Phase 2 server-side (edge function `ai-tools`, actie `summarize`).
 * Met `gesprekId` (server-uuid) leest de server zelf de berichten, met dezelfde toegangsregel als
 * manage-messages; anders gaan de meegegeven `berichten` mee. Geeft alleen tekst terug; slaat niets op.
 */
const NS = "lib.samenvattingFunctions";
const Input = z.object({
    gesprekId: z.string().uuid().optional(),
    berichten: z.array(z.object({ van: z.string().max(40), tekst: z.string().max(2000) })).max(200).optional(),
}).refine((d) => d.gesprekId || d.berichten?.length);
export const vatGesprekSamen = createServerFn({ method: "POST" })
    .inputValidator((d) => Input.parse(d))
    .handler(async ({ data }) => {
    const velden = data.gesprekId ? { conversation_id: data.gesprekId } : { berichten: data.berichten };
    const r = await aiAanroep("ai-tools", "summarize", velden, NS, { druk: "druk", nietIngesteld: "nietIngesteld", anders: "luktNiet" });
    const tekst = String(r?.samenvatting ?? "").trim();
    if (!tekst)
        throw new Error(i18n.t(`${NS}.fout.geenAntwoord`));
    return tekst;
});
