import i18n from "@/i18n";
import { createServerFn } from "@/lib/server-fn";
import { aiAanroep } from "@/lib/ai-aanroep";
import { z } from "zod";
/**
 * Schrijfhulp van Co (Berichten, e-mailgesprek, Co-concepten). Sinds Phase 2 server-side (edge function
 * `ai-coach`): prompts, schema's en de controle op verzonnen details (nieuweDetails) staan in
 * supabase/functions/_shared/ai-coach-prompts.js; de browser bevat geen prompt of AI-sleutel meer.
 */
const NS = "lib.coachFunctions";
const sleutels = { druk: "druk", nietIngesteld: "nietIngesteld", anders: "nietBereikbaar" };
const Input = z.object({
    tekst: z.string().min(1).max(4000),
    stijl: z.enum(["check", "Rustiger", "Korter", "Neutraler", "Duidelijker", "Meer kindgericht", "antwoord"]),
    alsVoorstel: z.boolean().optional(),
    variant: z.number().int().min(0).max(100).optional(),
    /** Recente relevante berichten van beide ouders (zonder namen). */
    context: z.array(z.object({ van: z.enum(["ik", "ander"]), tekst: z.string().max(2000) })).max(12).optional(),
    /** Alleen bij "antwoord": berichten die ná het ontvangen bericht kwamen, in volgorde. */
    daarna: z.array(z.object({ van: z.enum(["ik", "ander"]), tekst: z.string().max(2000) })).max(8).optional(),
});
/** Heeft de ouder na dit bericht zelf al iets gestuurd? Deterministisch, niet door de AI bepaald. */
export const alGereageerd = (daarna) => !!daarna?.some((d) => d.van === "ik");
/** Resultaat: { niveau, toon, afstemming, boodschap, zinvol, voorstel, methode, reactieNodig, veranderingen, openPunten, afwijking, nieuweDetails }. */
export const coachBericht = createServerFn({ method: "POST" })
    .inputValidator((d) => Input.parse(d))
    .handler(async ({ data }) => {
    const r = await aiAanroep("ai-coach", "coach", data, NS, sleutels);
    if (!r?.result)
        throw new Error(i18n.t(`${NS}.fout.geenAntwoord`));
    return r.result;
});
/** Alleen de beoordeling voor de communicatiemeter ({ niveau, toon, afstemming, boodschap }); geen herschrijving. */
export const toonBericht = createServerFn({ method: "POST" })
    .inputValidator((d) => Input.pick({ tekst: true, context: true }).parse(d))
    .handler(async ({ data }) => {
    const r = await aiAanroep("ai-coach", "tone", data, NS, sleutels);
    if (!r?.result)
        throw new Error(i18n.t(`${NS}.fout.geenAntwoord`));
    return r.result;
});
