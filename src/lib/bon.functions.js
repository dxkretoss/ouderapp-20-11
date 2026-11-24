import i18n from "@/i18n";
import { createServerFn } from "@/lib/server-fn";
import { aiAanroep } from "@/lib/ai-aanroep";
import { z } from "zod";
/**
 * Kassabon uitlezen (BonScanner). Sinds Phase 2 server-side (edge function `ai-tools`, actie `receipt`).
 * Herkent alleen; de ouder controleert en past aan vóór opslaan in de bestaande kostenflow.
 */
const NS = "lib.bonFunctions";
const Input = z.object({ foto: z.string().startsWith("data:image/").max(6_000_000) });
const Uit = z.object({ winkel: z.string().max(80), datum: z.string().max(10), bedrag: z.number().min(0).max(100000).nullable(), omschrijving: z.string().max(80) });
export const leesBon = createServerFn({ method: "POST" })
    .inputValidator((d) => Input.parse(d))
    .handler(async ({ data }) => {
    const r = await aiAanroep("ai-tools", "receipt", { foto: data.foto }, NS, { druk: "druk", nietIngesteld: "nietIngesteld", onleesbaar: "onleesbaar", anders: "mislukt" });
    const p = Uit.safeParse(r?.result);
    if (!p.success)
        throw new Error(i18n.t(`${NS}.fout.onleesbaar`));
    return p.data;
});
