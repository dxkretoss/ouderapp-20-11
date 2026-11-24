import i18n from "@/i18n";
import { createServerFn } from "@/lib/server-fn";
import { aiAanroep } from "@/lib/ai-aanroep";
import { z } from "zod";
/**
 * Kort, neutraal conceptbericht aan school of een andere organisatie (AanwezigheidAfstemmen).
 * Sinds Phase 2 server-side (edge function `ai-tools`, actie `school-message`). Alleen een concept: de ouder verstuurt zelf.
 */
const NS = "lib.schoolberichtFunctions";
const Input = z.object({
    afspraak: z.string().min(1).max(200),
    kind: z.string().max(120).optional(),
    verzoek: z.enum(["afzonderlijk", "verzetten", "telefonisch", "zelfde-informatie", "tweede-tijdstip", "bevestigen", "anders"]),
    toelichting: z.string().max(500).optional(),
});
export const schoolBericht = createServerFn({ method: "POST" })
    .inputValidator((d) => Input.parse(d))
    .handler(async ({ data }) => {
    const r = await aiAanroep("ai-tools", "school-message", data, NS, { druk: "druk", nietIngesteld: "nietIngesteld", anders: "nietBereikbaar" });
    if (typeof r?.result?.concept !== "string")
        throw new Error(i18n.t(`${NS}.fout.onbruikbaar`));
    return r.result;
});
