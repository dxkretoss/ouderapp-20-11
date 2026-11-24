import i18n from "@/i18n";
import { createServerFn } from "@/lib/server-fn";
import { aiAanroep } from "@/lib/ai-aanroep";
import { kiesActies } from "./verhaal";
import { z } from "zod";
/**
 * "Sparren met Co" (/verhaal en EvenMeedenken). Sinds Phase 2 server-side (edge function `co-assistant`, actie `chat`).
 * De systeemprompt (Co-persoonlijkheid, conflictcoaching, voorbeelden) staat in supabase/functions/_shared/ai-verhaal-prompts.js.
 * De GEZIN-regel (naam van de ouder + namen/leeftijden van de kinderen) bouwt de server zelf uit de sessie;
 * `gezin` wordt hier nog geaccepteerd voor bestaande aanroepers maar niet verstuurd.
 * Geeft alleen een antwoord terug; slaat niets op en voert niets uit.
 */
const NS = "lib.verhaalFunctions";
const Input = z.object({
    modus: z.enum(["praten", "overzicht", "doen"]),
    context: z.string().max(6000),
    gezin: z.string().max(600).optional(),
    berichten: z.array(z.object({ rol: z.enum(["ouder", "ai"]), tekst: z.string().max(3000) })).min(1).max(30),
});
export const praatVerhaal = createServerFn({ method: "POST" })
    .inputValidator((d) => Input.parse(d))
    .handler(async ({ data }) => {
    const r = await aiAanroep("co-assistant", "chat", { modus: data.modus, context: data.context, berichten: data.berichten }, NS, { druk: "druk", nietIngesteld: "nietIngesteld", anders: "onbereikbaar" });
    const res = r?.result;
    if (!res || typeof res.antwoord !== "string")
        throw new Error(i18n.t(`${NS}.fout.onbruikbaar`));
    return { antwoord: res.antwoord, acties: kiesActies(Array.isArray(res.acties) ? res.acties : [], data.modus), concept: typeof res.concept === "string" ? res.concept : "" };
});
