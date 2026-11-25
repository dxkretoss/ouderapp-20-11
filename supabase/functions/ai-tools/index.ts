// ai-tools — the smaller AI tasks of Co, server-side (Phase 2; OPENAI_API_KEY is a function secret).
// actions:
//   summarize      { conversation_id } (preferred: messages are loaded with the same access rule as
//                  manage-messages) or { berichten: [{ van, tekst }] (1..200) }        -> { samenvatting: string }
//   receipt        { foto: "data:image/...;base64,..." (<= 6 MB) }                      -> { result: { winkel, datum, bedrag, omschrijving } }
//   school-letter  { tekst (10..8000), vandaag }                                         -> { items: [{ titel, datum, tijd, kind, zeker, bedrag, taak, voorbereiding }] }
//   school-message { afspraak, kind?, verzoek, toelichting? }                            -> { result: { concept } }
//   parenting-plan { naam, type, data: base64 (<= 10 MB; PDF or text) }                  -> { items: [{ onderdeel, samenvatting, voorstel, bron, zeker, categorie }] }
// Everything only recognises or drafts; the parent checks the result in the existing flow before anything is saved.
import { base64Bytes, chatJson, chatText, childrenForAi, oneOf, requireAiUser, str } from "../_shared/ai-openai.ts";
import {
  bonSchema,
  bonSysteem,
  bonTaalRegel,
  planSchema,
  planSysteem,
  planTaalRegel,
  samenvattingSysteem,
  samenvattingTaalRegel,
  SCHOOL_VERZOEKEN,
  schoolberichtSchema,
  schoolberichtSysteem,
  schoolberichtTaalRegel,
  schoolinfoSchema,
  schoolinfoSysteem,
  schoolinfoTaalRegel,
  verzoekTekst,
} from "../_shared/ai-tools-prompts.js";
import { db } from "../_shared/db.ts";
import { loadConversationFor } from "../_shared/messages-access.ts";
import { check, err, ok, serveActions } from "../_shared/respond.ts";
import { requireUuid } from "../_shared/util.ts";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const IMAGE_RE = /^data:image\/(jpeg|jpg|png|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/;

Deno.serve(serveActions("ai-tools", {
  async summarize(req, body, { isEn }) {
    const user = await requireAiUser(req, "summary");
    let regels: string[];
    if (body.conversation_id !== undefined && body.conversation_id !== null) {
      const c = await loadConversationFor(user.id, requireUuid(body.conversation_id, "conversation_id"));
      const rows = ((check(
        await db()
          .from("messages")
          .select("sender_id, content, created_at")
          .eq("conversation_id", c.id)
          .order("created_at", { ascending: false })
          .limit(200),
        "load messages for summary",
      ) ?? []) as Array<{ sender_id: string; content: string }>).reverse();
      regels = rows.map((m) => `${m.sender_id === user.id ? "Ik" : "Andere ouder"}: ${String(m.content).slice(0, 2000)}`);
    } else {
      if (!Array.isArray(body.berichten) || body.berichten.length > 200) throw err.validation("berichten is invalid");
      regels = body.berichten.map((b: any, i: number) => `${str(b?.van, `berichten[${i}].van`, 40)}: ${str(b?.tekst, `berichten[${i}].tekst`, 2000)}`);
    }
    if (!regels.length) throw err.validation("Nothing to summarise");
    const samenvatting = await chatText({ lang: isEn ? "en" : "nl",
      temperature: 0.2,
      maxTokens: 400,
      messages: [
        { role: "system", content: samenvattingSysteem + samenvattingTaalRegel(isEn) },
        { role: "user", content: regels.join("\n") },
      ],
    });
    return ok({ samenvatting });
  },

  async receipt(req, body, { isEn }) {
    await requireAiUser(req, "receipt");
    const foto = str(body.foto, "foto", 6_000_000, { min: 1 });
    const m = IMAGE_RE.exec(foto);
    if (!m) throw err.validation("foto must be a data:image URL");
    base64Bytes(m[2], 4_500_000); // size + format check
    const r = await chatJson<{ winkel: string; datum: string; bedrag: number | null; omschrijving: string }>({ lang: isEn ? "en" : "nl",
      name: "bon",
      schema: bonSchema,
      temperature: 0,
      maxTokens: 200,
      messages: [
        { role: "system", content: bonSysteem + bonTaalRegel(isEn) },
        { role: "user", content: [{ type: "text", text: "Lees deze bon uit." }, { type: "image_url", image_url: { url: foto } }] },
      ],
    });
    const bedrag = typeof r.bedrag === "number" && Number.isFinite(r.bedrag) && r.bedrag >= 0 && r.bedrag <= 100000 ? r.bedrag : null;
    return ok({
      result: {
        winkel: String(r.winkel ?? "").slice(0, 80),
        datum: /^\d{4}-\d{2}-\d{2}$/.test(String(r.datum ?? "")) ? r.datum : "",
        bedrag,
        omschrijving: String(r.omschrijving ?? "").slice(0, 80),
      },
    });
  },

  async "school-letter"(req, body, { isEn }) {
    const user = await requireAiUser(req, "school-letter");
    const tekst = str(body.tekst, "tekst", 8000, { min: 10 });
    const vandaag = str(body.vandaag, "vandaag", 20, { optional: true }) || new Date().toISOString().slice(0, 10);
    const kids = await childrenForAi(user.id);
    const r = await chatJson<{ items: Array<Record<string, any>> }>({ lang: isEn ? "en" : "nl",
      name: "schoolinfo",
      schema: schoolinfoSchema(kids.map((k) => k.id)),
      temperature: 0,
      maxTokens: 1500,
      messages: [
        { role: "system", content: schoolinfoSysteem() + schoolinfoTaalRegel(isEn) },
        {
          role: "user",
          content: `Vandaag: ${vandaag}. Kinderen: ${kids.length ? kids.map((k) => `${k.naam} (${k.id})`).join(", ") : "(geen)"}.\n\n${tekst}`,
        },
      ],
    });
    const ids = new Set(kids.map((k) => k.id));
    const items = (Array.isArray(r.items) ? r.items : []).slice(0, 10).map((it) => ({
      titel: String(it.titel ?? "").slice(0, 160),
      datum: String(it.datum ?? ""),
      tijd: String(it.tijd ?? ""),
      kind: ids.has(it.kind) ? it.kind : "",
      kindNaam: kids.find((k) => k.id === it.kind)?.naam ?? "",
      zeker: !!it.zeker,
      bedrag: typeof it.bedrag === "number" && it.bedrag > 0 && it.bedrag <= 100000 ? it.bedrag : null,
      taak: String(it.taak ?? "").slice(0, 300),
      voorbereiding: String(it.voorbereiding ?? "").slice(0, 300),
    }));
    return ok({ items });
  },

  async "school-message"(req, body, { isEn }) {
    await requireAiUser(req, "school-message");
    const afspraak = str(body.afspraak, "afspraak", 200, { min: 1 });
    const kind = str(body.kind, "kind", 120, { optional: true });
    const verzoek = oneOf(body.verzoek, "verzoek", SCHOOL_VERZOEKEN as string[]);
    const toelichting = str(body.toelichting, "toelichting", 500, { optional: true });
    const input = `Afspraak: ${afspraak}${kind ? `\nKind: ${kind}` : ""}\nVerzoek: ${(verzoekTekst as Record<string, string>)[verzoek]}${toelichting ? `\nExtra context van de ouder: ${toelichting}` : ""}`;
    const r = await chatJson<{ concept: string }>({ lang: isEn ? "en" : "nl",
      name: "schoolbericht",
      schema: schoolberichtSchema,
      temperature: 0.3,
      maxTokens: 400,
      messages: [
        { role: "system", content: schoolberichtSysteem + schoolberichtTaalRegel(isEn) },
        { role: "user", content: input },
      ],
    });
    return ok({ result: { concept: String(r.concept ?? "") } });
  },

  async "parenting-plan"(req, body, { isEn }) {
    await requireAiUser(req, "parenting-plan");
    const naam = str(body.naam, "naam", 200, { optional: true }) || "ouderschapsplan.pdf";
    const type = (str(body.type, "type", 100, { optional: true }) || "application/pdf").toLowerCase();
    const data = str(body.data, "data", 14_000_000, { min: 1 });
    const bytes = base64Bytes(data, MAX_FILE_BYTES);
    let inhoud: Array<{ type: "text"; text: string } | { type: "file"; file: { filename: string; file_data: string } }>;
    if (type.startsWith("text/")) {
      inhoud = [{ type: "text", text: new TextDecoder().decode(bytes).slice(0, 200_000) }];
    } else if (type === "application/pdf") {
      inhoud = [{ type: "file", file: { filename: naam.replace(/[^\w.\- ]/g, "_"), file_data: `data:application/pdf;base64,${data.replace(/\s/g, "")}` } }];
    } else {
      throw err.validation("Only PDF or text files can be read");
    }
    const r = await chatJson<{ items: Array<Record<string, any>> }>({ lang: isEn ? "en" : "nl",
      name: "ouderschapsplan",
      schema: planSchema,
      temperature: 0,
      maxTokens: 3000,
      messages: [
        { role: "system", content: planSysteem + planTaalRegel(isEn) },
        { role: "user", content: [...inhoud, { type: "text", text: "Welke afspraken staan in dit ouderschapsplan?" }] },
      ],
    });
    return ok({ items: (Array.isArray(r.items) ? r.items : []).slice(0, 12) });
  },
}));
