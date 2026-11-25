// ai-coach — writing help of Co in Messages (server-side since Phase 2; OPENAI_API_KEY is a function secret).
// actions:
//   coach { tekst, stijl, alsVoorstel?, variant?, context?, daarna? } -> { result: CoachResult }
//   tone  { tekst, context? }                                          -> { result: { niveau, toon, afstemming, boodschap } }
// Co only returns text and an assessment; it never sends, agrees or changes anything. Proposals that add
// details not present in the parent's own text/conversation are blanked (nieuweDetails).
import {
  bouwCoachVerzoek,
  COACH_STIJLEN,
  coachSchema,
  coachTaalRegel,
  nieuweDetails,
  toonInstructies,
  toonSchema,
} from "../_shared/ai-coach-prompts.js";
import { chatJson, oneOf, requireAiUser, str } from "../_shared/ai-openai.ts";
import { Body, err, ok, serveActions } from "../_shared/respond.ts";

type Turn = { van: "ik" | "ander"; tekst: string };

function turns(v: unknown, field: string, max: number): Turn[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.length > max) throw err.validation(`${field} is invalid`);
  return v.map((x, i) => {
    if (!x || typeof x !== "object") throw err.validation(`${field}[${i}] is invalid`);
    return { van: oneOf((x as any).van, `${field}[${i}].van`, ["ik", "ander"] as const), tekst: str((x as any).tekst, `${field}[${i}].tekst`, 2000) };
  });
}

function coachInput(body: Body) {
  const variant = body.variant === undefined || body.variant === null ? undefined : Number(body.variant);
  if (variant !== undefined && (!Number.isInteger(variant) || variant < 0 || variant > 100)) throw err.validation("variant is invalid");
  if (body.alsVoorstel !== undefined && typeof body.alsVoorstel !== "boolean") throw err.validation("alsVoorstel is invalid");
  return {
    tekst: str(body.tekst, "tekst", 4000, { min: 1 }),
    stijl: oneOf(body.stijl, "stijl", COACH_STIJLEN as string[]),
    alsVoorstel: body.alsVoorstel === true,
    variant,
    context: turns(body.context, "context", 12),
    daarna: turns(body.daarna, "daarna", 8),
  };
}

Deno.serve(serveActions("ai-coach", {
  async coach(req, body, { isEn }) {
    await requireAiUser(req, "coach");
    const data = coachInput(body);
    const { instructions, input } = bouwCoachVerzoek(data);
    const r = await chatJson<Record<string, any>>({ lang: isEn ? "en" : "nl",
      name: "coach",
      schema: coachSchema,
      temperature: 0.3,
      messages: [
        { role: "system", content: instructions + coachTaalRegel(isEn) },
        { role: "user", content: input },
      ],
    });
    const bron = [data.tekst, ...(data.context ?? []).map((c) => c.tekst), ...(data.daarna ?? []).map((c) => c.tekst)].join("\n");
    const voorstel = typeof r.voorstel === "string" ? r.voorstel : "";
    const extra: string[] = nieuweDetails(voorstel, bron);
    return ok({
      result: {
        ...r,
        voorstel: extra.length ? "" : voorstel,
        zinvol: extra.length ? false : !!r.zinvol,
        // never "afwijking": no verified care agreement is ever sent
        afwijking: false,
        veranderingen: (Array.isArray(r.veranderingen) ? r.veranderingen : []).slice(0, 3),
        openPunten: Array.isArray(r.openPunten) ? r.openPunten : [],
        nieuweDetails: extra,
      },
    });
  },

  async tone(req, body, { isEn }) {
    await requireAiUser(req, "tone");
    const data = { tekst: str(body.tekst, "tekst", 4000, { min: 1 }), context: turns(body.context, "context", 12), stijl: "check" };
    const { input } = bouwCoachVerzoek(data);
    const r = await chatJson<Record<string, any>>({ lang: isEn ? "en" : "nl",
      name: "toon",
      schema: toonSchema,
      temperature: 0.2,
      maxTokens: 200,
      messages: [
        { role: "system", content: toonInstructies },
        { role: "user", content: input },
      ],
    });
    return ok({ result: r });
  },
}));
