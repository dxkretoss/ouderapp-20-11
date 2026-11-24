// ai-assistant — the search & arrange assistant in every page header + speech to text (server-side since Phase 2).
// actions:
//   ask        { vraag (1..1000), context (<= 12000, only data the parent can see in the app) } -> { result }
//              result = { antwoord, actie (intent id), samenvatting[], opties[], kind (child id | ""), titel, datum, tijd, rol, herhaling }
//   transcribe { audio: base64 (<= 10 MB), type: mime }  -> { tekst }
// The assistant only picks an intent and prefills fields; the parent opens the existing flow and confirms.
import {
  base64Bytes,
  chatJson,
  childrenForAi,
  requireAiUser,
  str,
  transcribe,
} from "../_shared/ai-openai.ts";
import { assistentSchema, assistentSysteem, assistentTaalRegel } from "../_shared/ai-tools-prompts.js";
import { ok, serveActions } from "../_shared/respond.ts";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

Deno.serve(serveActions("ai-assistant", {
  async ask(req, body, { isEn }) {
    const user = await requireAiUser(req, "assistant");
    const vraag = str(body.vraag, "vraag", 1000, { min: 1 });
    const context = str(body.context, "context", 12000, { optional: true });
    const kids = await childrenForAi(user.id);
    const vandaag = new Date().toISOString().slice(0, 10);
    const system = `${assistentSysteem(user.name || "", kids)}${assistentTaalRegel(isEn)}\n\nVandaag: ${vandaag}.\n\nCONTEXT (alleen gegevens waar deze ouder toegang toe heeft):\n${context || "(geen)"}`;
    const result = await chatJson<Record<string, any>>({
      name: "assistent",
      schema: assistentSchema(kids.map((k) => k.id)),
      temperature: 0.2,
      maxTokens: 600,
      messages: [{ role: "system", content: system }, { role: "user", content: vraag }],
    });
    return ok({ result });
  },

  async transcribe(req, body, { isEn }) {
    await requireAiUser(req, "transcribe");
    const audio = str(body.audio, "audio", 14_000_000, { min: 1 });
    const type = str(body.type, "type", 100, { optional: true }) || "audio/webm";
    const bytes = base64Bytes(audio, MAX_AUDIO_BYTES);
    const tekst = await transcribe(bytes, type, isEn ? "en" : "nl");
    return ok({ tekst });
  },
}));
