/**
 * ALLEEN VOOR LOKAAL TESTEN (VITE_API_MOCK=1) — domein 4: manage-messages en de AI-functies
 * (ai-coach, co-assistant, ai-assistant, ai-tools). Zelfde acties, velden en foutcodes als de echte
 * edge functions. De AI-antwoorden zijn vaste, voorspelbare teksten zodat de UI-flows te testen zijn;
 * er wordt nooit een echte AI aangeroepen.
 */
import { nieuweDetails } from "../../../supabase/functions/_shared/ai-coach-prompts.js";
const MAX_PINS = 3;
const TONEN = ["geen", "licht", "escalerend", "dreigend"];
export function maak(hulp) {
    const { Fout, ok, uuid, nu, gebruikerVoor, kindIdsVoor } = hulp;
    const tabellen = (db) => {
        db.conversations ??= [];
        db.messages ??= [];
        db.conversation_reads ??= [];
        db.ai_requests ??= [];
    };
    const coOuderIds = (db, uid) => (db.connections ?? []).filter((c) => c.status === "active" && (c.parent_1_id === uid || c.parent_2_id === uid)).map((c) => (c.parent_1_id === uid ? c.parent_2_id : c.parent_1_id));
    const verbonden = (db, a, b) => coOuderIds(db, a).includes(b);
    const profiel = (db, id) => db.profiles.find((p) => p.id === id);
    const coOuders = (db, uid) => coOuderIds(db, uid).map((id) => profiel(db, id)).filter(Boolean).map((p) => ({ id: p.id, name: p.name ?? "", avatar: p.avatar ?? null }));
    const isUuid = (v) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
    const eisUuid = (v, veld) => { if (!isUuid(v)) throw new Fout(400, "VALIDATION", `${veld} must be a UUID`); return v; };
    const andere = (c, uid) => (c.created_by === uid ? c.other_parent_id : c.created_by);
    const lees = (db, cid, uid) => db.conversation_reads.find((r) => r.conversation_id === cid && r.user_id === uid);
    const zetLees = (db, cid, uid, p) => {
        let r = lees(db, cid, uid);
        if (!r) {
            r = { conversation_id: cid, user_id: uid, last_read_at: null, pinned: false, muted_until: null, archived: false };
            db.conversation_reads.push(r);
        }
        Object.assign(r, p);
    };
    function laad(db, uid, cid) {
        const c = db.conversations.find((x) => x.id === cid);
        if (!c || (c.created_by !== uid && c.other_parent_id !== uid))
            throw new Fout(404, "NOT_FOUND", "Conversation not found");
        return c;
    }
    function ongelezen(db, uid, c) {
        if (!c.other_parent_id)
            return 0;
        const r = lees(db, c.id, uid);
        return db.messages.filter((m) => m.conversation_id === c.id && m.sender_id !== uid && (!r?.last_read_at || m.created_at > r.last_read_at)).length;
    }
    function uit(db, uid, c) {
        const ander = andere(c, uid);
        const p = ander ? profiel(db, ander) : null;
        const r = lees(db, c.id, uid);
        return {
            id: c.id, title: c.title, related_child_id: c.related_child_id && kindIdsVoor(db, uid).includes(c.related_child_id) ? c.related_child_id : null,
            created_by: c.created_by, other_parent_id: c.other_parent_id,
            other_parent: ander ? { id: ander, name: p?.name ?? "", avatar: verbonden(db, uid, ander) ? p?.avatar ?? null : null } : null,
            draft: !c.other_parent_id, can_send: !!ander && verbonden(db, uid, ander),
            last_message_text: c.last_message_text, last_message_at: c.last_message_at, last_message_sender_id: c.last_message_sender_id,
            created_at: c.created_at, updated_at: c.updated_at, unread: ongelezen(db, uid, c),
            pinned: !!r?.pinned, muted_until: r?.muted_until && r.muted_until > nu() ? r.muted_until : null, archived: !!r?.archived,
        };
    }
    const berichtUit = (m) => ({ id: m.id, conversation_id: m.conversation_id, sender_id: m.sender_id, content: m.content, tone_level: m.tone_level, is_system: false, created_at: m.created_at, client_id: m.client_id ?? null });
    const inhoud = (v) => {
        if (typeof v !== "string" || !v.trim())
            throw new Fout(400, "VALIDATION", "content is required");
        if (v.trim().length > 4000)
            throw new Fout(400, "VALIDATION", "content is too long");
        return v.trim();
    };
    const clientId = (v) => {
        if (v === undefined || v === null || v === "")
            return null;
        if (typeof v !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(v))
            throw new Fout(400, "VALIDATION", "client_id is invalid");
        return v;
    };
    function voegToe(db, uid, c, tekst, toon, cid) {
        if (cid) {
            const al = db.messages.find((m) => m.conversation_id === c.id && m.sender_id === uid && m.client_id === cid);
            if (al)
                return al;
        }
        // strikt oplopende tijden, ook bij twee berichten in dezelfde milliseconde
        const laatste = db.messages.filter((m) => m.conversation_id === c.id).at(-1)?.created_at;
        let at = nu();
        if (laatste && at <= laatste)
            at = new Date(Date.parse(laatste) + 1).toISOString();
        const m = { id: uuid(), conversation_id: c.id, sender_id: uid, content: tekst, tone_level: TONEN.includes(toon) ? toon : "geen", created_at: at, client_id: cid };
        db.messages.push(m);
        Object.assign(c, { last_message_text: tekst.slice(0, 500), last_message_at: at, last_message_sender_id: uid, updated_at: nu() });
        zetLees(db, c.id, uid, { last_read_at: at });
        return m;
    }
    const sessie = (db, token) => { tabellen(db); return gebruikerVoor(db, token); };
    /* ------------------------------------------------------------ AI (vaste antwoorden) */
    const aiGebruiker = (db, token, soort) => {
        const p = sessie(db, token);
        const minuut = Date.now() - 60000;
        const recent = db.ai_requests.filter((r) => r.user_id === p.id && r.ts > minuut);
        if (recent.length >= 20)
            throw new Fout(429, "RATE_LIMITED", "Too many AI requests");
        db.ai_requests = [...db.ai_requests.filter((r) => r.ts > minuut), { user_id: p.id, feature: soort, ts: Date.now() }];
        return p;
    };
    const en = (b) => String(b?.lang ?? "").startsWith("en");
    const HARD = /\b(altijd|nooit|weer eens|idioot|eikel|sukkel|belachelijk|always|never|again|idiot|ridiculous|stupid)\b/gi;
    const DREIG = /\b(bedreig|ik sla je|je krijgt spijt|ik vermoord|i'll hit you|you'll regret)\b/i;
    function beoordeel(tekst) {
        if (DREIG.test(tekst))
            return { niveau: "dreigend", toon: "escalerend", afstemming: "druk", boodschap: "onzeker" };
        if (/[A-Z]{6,}/.test(tekst) || /\b(idioot|eikel|sukkel|idiot|stupid)\b/i.test(tekst))
            return { niveau: "escalerend", toon: "escalerend", afstemming: "onzeker", boodschap: "onzeker" };
        if (HARD.test(tekst)) {
            HARD.lastIndex = 0;
            return { niveau: "licht", toon: "verwijtend", afstemming: "passend", boodschap: "vraag" };
        }
        HARD.lastIndex = 0;
        if (/\b(ik wil (de kinderen|ze) |voortaan|i want the children|from now on)\b/i.test(tekst))
            return { niveau: "geen", toon: "neutraal", afstemming: "overleg", boodschap: "wens" };
        return { niveau: "geen", toon: "rustig", afstemming: "passend", boodschap: tekst.includes("?") ? "vraag" : "mededeling" };
    }
    const kern = (tekst) => tekst.replace(HARD, "").replace(/[!]{2,}/g, "!").replace(/\s{2,}/g, " ").replace(/\s+([,.?!])/g, "$1").trim().replace(/[.!?]+$/, "");
    function coach(db, b, token) {
        aiGebruiker(db, token, "coach");
        if (typeof b.tekst !== "string" || !b.tekst.trim() || b.tekst.length > 4000)
            throw new Fout(400, "VALIDATION", "tekst is invalid");
        const E = en(b);
        const a = beoordeel(b.tekst);
        const bron = [b.tekst, ...(b.context ?? []).map((c) => c.tekst), ...(b.daarna ?? []).map((c) => c.tekst)].join("\n");
        if (b.stijl === "antwoord") {
            const gedaan = (b.daarna ?? []).some((d) => d.van === "ik");
            const varianten = E
                ? ["Thanks for your message. I'll look into it and let you know.", "Thanks for letting me know. I'll check and get back to you.", "Noted, thank you. I'll let you know."]
                : ["Dank voor je bericht. Ik kijk het even na en laat het je weten.", "Fijn dat je het laat weten. Ik kijk het na en kom erop terug.", "Duidelijk, dank je. Ik laat het je weten."];
            const voorstel = gedaan ? "" : varianten[(b.variant ?? 0) % varianten.length];
            return ok({ result: { ...a, zinvol: !!voorstel, voorstel, methode: "BIFF", reactieNodig: !gedaan && a.niveau !== "dreigend", veranderingen: [], openPunten: b.tekst.includes("?") && !gedaan ? [E ? "The question in the message" : "De vraag in het bericht"] : [], afwijking: false, nieuweDetails: [] } });
        }
        const schoon = kern(b.tekst);
        const nodig = a.niveau !== "geen" || b.stijl === "Korter" || b.alsVoorstel || a.afstemming !== "passend";
        let voorstel = !nodig || !schoon ? "" : b.alsVoorstel ? `${schoon}. ${E ? "Can we talk about this?" : "Kunnen we dat bespreken?"}` : `${schoon}. ${E ? "How do you see it?" : "Hoe zie jij dat?"}`;
        const extra = nieuweDetails(voorstel, bron);
        if (extra.length)
            voorstel = "";
        return ok({ result: { ...a, zinvol: !!voorstel, voorstel, methode: a.niveau === "geen" ? "geen" : "BIFF", reactieNodig: true, veranderingen: voorstel ? (E ? ["Reproachful words removed", "Ends with an open question"] : ["Verwijtende woorden weggelaten", "Eindigt met een open vraag"]) : [], openPunten: [], afwijking: false, nieuweDetails: extra } });
    }
    return {
        "manage-messages": {
            list(db, b, token) {
                const p = sessie(db, token);
                const cps = coOuders(db, p.id);
                if (cps.length === 1)
                    db.conversations.filter((c) => c.created_by === p.id && !c.other_parent_id).forEach((c) => { c.other_parent_id = cps[0].id; });
                const rijen = db.conversations.filter((c) => c.created_by === p.id || c.other_parent_id === p.id).sort((x, y) => String(y.last_message_at).localeCompare(String(x.last_message_at)));
                const conversations = rijen.map((c) => uit(db, p.id, c));
                return ok({ conversations, co_parents: cps, unread_total: conversations.reduce((s, c) => s + (c.archived ? 0 : c.unread), 0) });
            },
            unread(db, b, token) {
                const p = sessie(db, token);
                const tot = db.conversations.filter((c) => c.created_by === p.id || c.other_parent_id === p.id).reduce((s, c) => s + ongelezen(db, p.id, c), 0);
                return ok({ unread_total: tot });
            },
            create(db, b, token) {
                const p = sessie(db, token);
                const titel = typeof b.title === "string" ? b.title.trim() : "";
                if (!titel)
                    throw new Fout(400, "VALIDATION", "title is required");
                if (titel.length > 120)
                    throw new Fout(400, "VALIDATION", "title is too long");
                const cps = coOuderIds(db, p.id);
                let ander = null;
                if (b.other_parent_id !== undefined && b.other_parent_id !== null) {
                    ander = eisUuid(b.other_parent_id, "other_parent_id");
                    if (!cps.includes(ander))
                        throw new Fout(403, "FORBIDDEN", "Not a connected co-parent");
                }
                else if (cps.length === 1)
                    ander = cps[0];
                let kind = null;
                if (b.child_id) {
                    kind = eisUuid(b.child_id, "child_id");
                    if (!kindIdsVoor(db, p.id).includes(kind))
                        throw new Fout(404, "NOT_FOUND", "Child not found");
                }
                const eerste = b.initial_message ? inhoud(b.initial_message) : null;
                if (eerste && !ander)
                    throw new Fout(403, "FORBIDDEN", "Connect the other parent before sending");
                const c = { id: uuid(), title: titel, type: "topic", related_child_id: kind, created_by: p.id, other_parent_id: ander, last_message_text: null, last_message_at: nu(), last_message_sender_id: null, created_at: nu(), updated_at: nu() };
                db.conversations.push(c);
                zetLees(db, c.id, p.id, { last_read_at: c.created_at });
                const m = eerste ? voegToe(db, p.id, c, eerste, b.tone_level, clientId(b.client_id)) : null;
                return ok({ conversation: uit(db, p.id, c), message: m ? berichtUit(m) : null });
            },
            messages(db, b, token) {
                const p = sessie(db, token);
                const c = laad(db, p.id, eisUuid(b.conversation_id, "conversation_id"));
                if (b.since && Number.isNaN(Date.parse(b.since)))
                    throw new Fout(400, "VALIDATION", "since is invalid");
                const since = b.since ? new Date(b.since).toISOString() : null;
                const lijst = db.messages.filter((m) => m.conversation_id === c.id && (!since || m.created_at > since)).sort((x, y) => x.created_at.localeCompare(y.created_at)).slice(-500);
                if (b.mark_read !== false && c.other_parent_id)
                    zetLees(db, c.id, p.id, { last_read_at: nu() > (lijst.at(-1)?.created_at ?? "") ? nu() : lijst.at(-1).created_at });
                return ok({ conversation: uit(db, p.id, c), messages: lijst.map(berichtUit) });
            },
            send(db, b, token) {
                const p = sessie(db, token);
                const c = laad(db, p.id, eisUuid(b.conversation_id, "conversation_id"));
                const tekst = inhoud(b.content);
                const ander = andere(c, p.id);
                if (!ander)
                    throw new Fout(403, "FORBIDDEN", "Connect the other parent before sending");
                if (!verbonden(db, p.id, ander))
                    throw new Fout(403, "FORBIDDEN", "You are no longer connected with this parent");
                const m = voegToe(db, p.id, c, tekst, b.tone_level, clientId(b.client_id));
                return ok({ message: berichtUit(m), conversation: uit(db, p.id, c) });
            },
            "mark-read"(db, b, token) {
                const p = sessie(db, token);
                const c = laad(db, p.id, eisUuid(b.conversation_id, "conversation_id"));
                zetLees(db, c.id, p.id, { last_read_at: nu() });
                return ok({ conversation: uit(db, p.id, c) });
            },
            update(db, b, token) {
                const p = sessie(db, token);
                const c = laad(db, p.id, eisUuid(b.conversation_id, "conversation_id"));
                const patch = {};
                if (b.pinned !== undefined) {
                    if (typeof b.pinned !== "boolean")
                        throw new Fout(400, "VALIDATION", "pinned must be a boolean");
                    if (b.pinned && db.conversation_reads.filter((r) => r.user_id === p.id && r.pinned && r.conversation_id !== c.id).length >= MAX_PINS)
                        throw new Fout(400, "VALIDATION", "PIN_LIMIT");
                    patch.pinned = b.pinned;
                }
                if (b.muted_until !== undefined) {
                    if (b.muted_until === null || b.muted_until === "")
                        patch.muted_until = null;
                    else if (typeof b.muted_until === "string" && !Number.isNaN(Date.parse(b.muted_until)))
                        patch.muted_until = new Date(b.muted_until).toISOString();
                    else
                        throw new Fout(400, "VALIDATION", "muted_until is invalid");
                }
                if (b.archived !== undefined) {
                    if (typeof b.archived !== "boolean")
                        throw new Fout(400, "VALIDATION", "archived must be a boolean");
                    patch.archived = b.archived;
                }
                if (b.title !== undefined) {
                    if (c.created_by !== p.id)
                        throw new Fout(403, "FORBIDDEN", "Only the creator can rename a topic");
                    const titel = typeof b.title === "string" ? b.title.trim() : "";
                    if (!titel || titel.length > 120)
                        throw new Fout(400, "VALIDATION", "title is invalid");
                    c.title = titel;
                }
                if (Object.keys(patch).length)
                    zetLees(db, c.id, p.id, patch);
                return ok({ conversation: uit(db, p.id, c) });
            },
            delete(db, b, token) {
                const p = sessie(db, token);
                const c = laad(db, p.id, eisUuid(b.conversation_id, "conversation_id"));
                if (c.created_by !== p.id)
                    throw new Fout(403, "FORBIDDEN", "Only the creator can remove a topic");
                if (db.messages.some((m) => m.conversation_id === c.id))
                    throw new Fout(403, "FORBIDDEN", "A conversation with messages cannot be removed");
                db.conversations = db.conversations.filter((x) => x.id !== c.id);
                db.conversation_reads = db.conversation_reads.filter((r) => r.conversation_id !== c.id);
                return ok({});
            },
        },
        "ai-coach": {
            coach,
            tone(db, b, token) {
                aiGebruiker(db, token, "tone");
                if (typeof b.tekst !== "string" || !b.tekst.trim())
                    throw new Fout(400, "VALIDATION", "tekst is required");
                return ok({ result: beoordeel(b.tekst) });
            },
        },
        "co-assistant": {
            chat(db, b, token) {
                aiGebruiker(db, token, "co-chat");
                if (!["praten", "overzicht", "doen"].includes(b.modus) || !Array.isArray(b.berichten) || !b.berichten.length || b.berichten.length > 30)
                    throw new Fout(400, "VALIDATION", "invalid");
                const E = en(b);
                const laatste = String(b.berichten.filter((x) => x.rol === "ouder").at(-1)?.tekst ?? "").toLowerCase();
                const wilBericht = /bericht|opstellen|schrijven|message|draft|write/.test(laatste);
                // Eerst erkennen, dan praktische suggesties, dan aanbod om een bericht op te stellen (nooit zelf versturen).
                const antwoord = wilBericht
                    ? (E ? "That sounds like it is weighing on you. Here is a short draft you can change and send yourself." : "Dat klinkt alsof het je bezighoudt. Hier is een kort concept dat je zelf kunt aanpassen en versturen.")
                    : (E ? "That sounds difficult, and it makes sense that it bothers you. One option is to write down what matters most to you first. Shall I help you draft a calm message to the other parent?" : "Dat klinkt lastig, en het is begrijpelijk dat het je bezighoudt. Je kunt eerst opschrijven wat voor jou het belangrijkste is. Zal ik helpen een rustig bericht aan de andere ouder op te stellen?");
                const concept = wilBericht ? (E ? "Hi, I would like to agree on this calmly together. Could we look at it this week? How do you see it?" : "Hoi, ik wil dit graag rustig samen afstemmen. Kunnen we er deze week naar kijken? Hoe zie jij dat?") : "";
                return ok({ result: { antwoord, acties: wilBericht ? ["bericht"] : ["bericht", "praten"], concept } });
            },
        },
        "ai-assistant": {
            ask(db, b, token) {
                const p = aiGebruiker(db, token, "assistant");
                if (typeof b.vraag !== "string" || !b.vraag.trim())
                    throw new Fout(400, "VALIDATION", "vraag is required");
                const E = en(b);
                const v = b.vraag.toLowerCase();
                const kind = kindIdsVoor(db, p.id).find((id) => v.includes(String(db.children.find((c) => c.id === id)?.name ?? "\u0000").toLowerCase())) ?? "";
                const leeg = { samenvatting: [], opties: [], kind, titel: "", datum: "", tijd: "", rol: "", herhaling: "geen" };
                if (/tandarts|dentist|zwemles|swimming|afspraak|appointment/.test(v))
                    return ok({ result: { ...leeg, antwoord: E ? "I'll open a new appointment for you to check." : "Ik open een nieuwe afspraak die je zelf controleert.", actie: "afspraak_toevoegen", titel: /tandarts|dentist/.test(v) ? (E ? "Dentist" : "Tandarts") : (E ? "Appointment" : "Afspraak"), samenvatting: [{ label: E ? "What" : "Wat", waarde: E ? "Appointment" : "Afspraak" }] } });
                if (/kosten|cost|betaal|paid|bon|receipt/.test(v))
                    return ok({ result: { ...leeg, antwoord: E ? "You can add the cost in Costs." : "Je kunt de kosten toevoegen bij Kosten.", actie: "kosten" } });
                if (/ruil|swap|wissel/.test(v))
                    return ok({ result: { ...leeg, antwoord: E ? "I'll open a change proposal for you." : "Ik open een wijzigingsvoorstel voor je.", actie: "wissel_ruil" } });
                return ok({ result: { ...leeg, antwoord: E ? "What would you like to change?" : "Wat wil je veranderen?", actie: "verduidelijk", opties: E ? ["Handover", "Appointment", "Pick-up/drop-off", "Other"] : ["Wisselmoment", "Afspraak", "Ophalen/brengen", "Anders"] } });
            },
            transcribe(db, b, token) {
                aiGebruiker(db, token, "transcribe");
                if (typeof b.audio !== "string" || !b.audio)
                    throw new Fout(400, "VALIDATION", "audio is required");
                return ok({ tekst: en(b) ? "I would like to move the handover on Friday to one hour later." : "Ik wil de wissel van vrijdag een uur later doen." });
            },
        },
        "ai-tools": {
            summarize(db, b, token) {
                const p = aiGebruiker(db, token, "summary");
                let n = 0;
                if (b.conversation_id) {
                    const c = laad(db, p.id, eisUuid(b.conversation_id, "conversation_id"));
                    n = db.messages.filter((m) => m.conversation_id === c.id).length;
                }
                else if (Array.isArray(b.berichten))
                    n = b.berichten.length;
                if (!n)
                    throw new Fout(400, "VALIDATION", "Nothing to summarise");
                return ok({ samenvatting: en(b) ? `- ${n} messages in this conversation\n- A question was asked\n- Nothing has been agreed yet` : `- ${n} berichten in dit gesprek\n- Er is een vraag gesteld\n- Er is nog niets afgesproken` });
            },
            receipt(db, b, token) {
                aiGebruiker(db, token, "receipt");
                if (typeof b.foto !== "string" || !/^data:image\//.test(b.foto))
                    throw new Fout(400, "VALIDATION", "foto must be a data:image URL");
                return ok({ result: { winkel: "", datum: nu().slice(0, 10), bedrag: 12.5, omschrijving: en(b) ? "School supplies" : "Schoolspullen" } });
            },
            "school-letter"(db, b, token) {
                aiGebruiker(db, token, "school-letter");
                if (typeof b.tekst !== "string" || b.tekst.trim().length < 10)
                    throw new Fout(400, "VALIDATION", "tekst is too short");
                const d = new Date();
                d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
                return ok({ items: [{ titel: en(b) ? "Study day" : "Studiedag", datum: d.toISOString().slice(0, 10), tijd: "", kind: "", kindNaam: "", zeker: true, bedrag: null, taak: "", voorbereiding: "" }] });
            },
            "school-message"(db, b, token) {
                aiGebruiker(db, token, "school-message");
                if (typeof b.afspraak !== "string" || !b.afspraak.trim())
                    throw new Fout(400, "VALIDATION", "afspraak is required");
                return ok({ result: { concept: en(b) ? `Good afternoon,\n\nRegarding "${b.afspraak}": could both parents receive the same information?\n\nThank you in advance.` : `Goedemiddag,\n\nOver "${b.afspraak}": kunnen beide ouders dezelfde informatie ontvangen?\n\nAlvast bedankt.` } });
            },
            "parenting-plan"(db, b, token) {
                aiGebruiker(db, token, "parenting-plan");
                const type = String(b.type ?? "").toLowerCase();
                if (!b.data || !(type.startsWith("text/") || type === "application/pdf"))
                    throw new Fout(400, "VALIDATION", "Only PDF or text files can be read");
                return ok({ items: [{ onderdeel: en(b) ? "Handovers" : "Wisselmomenten", samenvatting: en(b) ? "The children change homes every Friday after school." : "De kinderen wisselen elke vrijdag na school.", voorstel: en(b) ? "Week on / week off, handover Friday after school" : "Week op / week af, wissel vrijdag na school", bron: en(b) ? "Article 3" : "Artikel 3", zeker: true, categorie: "Wisselmomenten" }] });
            },
        },
    };
}
