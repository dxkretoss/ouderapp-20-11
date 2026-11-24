import i18n from "@/i18n";
import { createServerFn } from "@/lib/server-fn";
import { aiAanroep } from "@/lib/ai-aanroep";
import { z } from "zod";
/**
 * Ouderschapsplan herkennen (OuderschapsplanImport). Sinds Phase 2 server-side (edge function `ai-tools`,
 * actie `parenting-plan`; PDF of tekst). Herkent alleen: de ouder kiest zelf wat in Afspraken komt.
 */
const NS = "lib.ouderschapsplanFunctions";
export const herkenAfspraken = createServerFn({ method: "POST" })
    .inputValidator((d) => z.object({ naam: z.string().max(200), type: z.string().max(100), data: z.string().min(1).max(14_000_000) }).parse(d))
    .handler(async ({ data }) => {
    const r = await aiAanroep("ai-tools", "parenting-plan", { naam: data.naam, type: data.type, data: data.data }, NS, { druk: "druk", nietIngesteld: "nietIngesteld", onleesbaar: "onleesbaar", anders: "onbereikbaar" });
    if (!Array.isArray(r?.items))
        throw new Error(i18n.t(`${NS}.fout.geenResultaat`));
    return r.items.slice(0, 12);
});
