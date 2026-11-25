// co-assistant — "Sparren met Co" (/verhaal and the Co sheet in Messages), server-side since Phase 2.
// action chat { modus: "praten"|"overzicht"|"doen", context?: string (<= 6000, only data the parent chose
//   to share), berichten: [{ rol: "ouder"|"ai", tekst }] (1..30) } -> { result: { antwoord, acties[], concept } }
// The GEZIN line (speaking parent's name + children's names/ages) is built here from the session —
// never taken from the client and never more than that. Co acknowledges feelings first, then offers
// practical suggestions and can draft a respectful message; it never sends or changes anything.
import { childrenForAi, chatJson, familyLine, oneOf, requireAiUser, str } from "../_shared/ai-openai.ts";
import { bouwVerhaalInstructies, VERHAAL_ACTIES, VERHAAL_MODI, verhaalSchema } from "../_shared/ai-verhaal-prompts.js";
import { err, ok, serveActions } from "../_shared/respond.ts";

Deno.serve(serveActions("co-assistant", {
  async chat(req, body, { isEn }) {
    const user = await requireAiUser(req, "co-chat");
    const modus = oneOf(body.modus, "modus", VERHAAL_MODI as string[]);
    const context = str(body.context, "context", 6000, { optional: true });
    if (!Array.isArray(body.berichten) || body.berichten.length < 1 || body.berichten.length > 30) {
      throw err.validation("berichten is invalid");
    }
    const berichten = body.berichten.map((b: any, i: number) => ({
      rol: oneOf(b?.rol, `berichten[${i}].rol`, ["ouder", "ai"] as const),
      tekst: str(b?.tekst, `berichten[${i}].tekst`, 3000, { min: 1 }),
    }));
    const gezin = familyLine(user, await childrenForAi(user.id), isEn);
    const r = await chatJson<{ antwoord: string; acties: string[]; concept: string }>({ lang: isEn ? "en" : "nl",
      name: "verhaal",
      schema: verhaalSchema,
      temperature: 0.5,
      maxTokens: 700,
      messages: [
        { role: "system", content: bouwVerhaalInstructies({ modus, context, gezin, berichten, isEn }) },
        ...berichten.slice(-12).map((b) => ({ role: b.rol === "ouder" ? "user" as const : "assistant" as const, content: b.tekst })),
      ],
    });
    const acties = [...new Set((Array.isArray(r.acties) ? r.acties : []).filter((a) => VERHAAL_ACTIES.includes(a)))].slice(0, 3);
    return ok({
      result: {
        antwoord: String(r.antwoord ?? ""),
        acties,
        // a draft only belongs to the "bericht" action; the parent reviews and sends it in Messages
        concept: acties.includes("bericht") ? String(r.concept ?? "") : "",
      },
    });
  },
}));
