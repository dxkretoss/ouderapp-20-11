import { createServerFn } from "@/lib/server-fn";
import { aiAanroep } from "@/lib/ai-aanroep";
import { z } from "zod";
/**
 * Schoolbrief uitlezen (SchoolinfoUitlezen). Sinds Phase 2 server-side (edge function `ai-tools`, actie `school-letter`).
 * `kind` is het server-id van een kind van deze ouder (of ""), `kindNaam` de naam voor weergave.
 * Herkent alleen; verwerken gebeurt na controle in de bestaande agenda-flow.
 */
const NS = "lib.schoolinfoFunctions";
const Input = z.object({ tekst: z.string().min(10).max(8000), vandaag: z.string().max(20) });
const Item = z.object({ titel: z.string().max(160), datum: z.string(), tijd: z.string(), kind: z.string(), kindNaam: z.string().default(""), zeker: z.boolean(), bedrag: z.number().positive().max(100000).nullable().default(null), taak: z.string().max(300).default(""), voorbereiding: z.string().max(300).default("") });
export const leesSchoolinfo = createServerFn({ method: "POST" })
    .inputValidator((d) => Input.parse(d))
    .handler(async ({ data }) => {
    const r = await aiAanroep("ai-tools", "school-letter", data, NS, { druk: "druk", nietIngesteld: "nietIngesteld", anders: "mislukt" });
    const p = z.array(Item).max(10).safeParse(r?.items ?? []);
    return p.success ? p.data : [];
});
