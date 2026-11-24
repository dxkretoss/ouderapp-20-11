/**
 * ALLEEN VOOR LOKAAL TESTEN (VITE_API_MOCK=1): domein 5 (praktisch & afspraken) — manage-tasks,
 * manage-moments, manage-documents, manage-agreements, log-audit en send-notification.
 * Zelfde acties, velden, statussen en foutcodes als supabase/functions/<naam>/index.ts.
 * Verschil: foto's en bestanden blijven data-URL's in de mock-db (echt: privé-bucket + ondertekende URL).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const RECURRENCE = ["eenmalig", "wekelijks", "maandelijks", "jaarlijks", "aangepast"];
const CONTACT = ["nog-te-regelen", "contact-opgenomen", "wacht-op-reactie", "afgerond", "niet-mogelijk"];
const ITEM_TYPES = ["mee", "vast", "dubbel", "terug"];
const VISIBILITY = ["private", "parents", "circle"];
const PHASES = ["geen", "vooraf", "tijdens", "na"];
const MILESTONES = ["Eerste stapjes", "Eerste woordje", "Eerste schooldag", "Eerste tand", "Zwemdiploma", "Verjaardag", "Sportprestatie", "Rapport", "Iets bijzonders"];
const REACTIONS = ["leuk", "lief", "trots", "watGoed", "tekst", "duim"];
const TOPICS = ["Halen & brengen", "Planning & wijzigingen", "Contact", "Kinderen", "School & opvang", "Gezondheid", "Kosten", "Vakanties", "Overig"];
const DECISION_KINDS = ["Schoolkeuze", "Medisch", "Verhuizing", "Verdeling van de week", "Opvoeding"];
const MIME = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "text/plain": "txt", "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx" };
const SECTIONS = ["afspraak", "schema", "besluit", "kosten", "taak", "spul", "spullen", "document", "dossier", "vakantie", "overdracht", "kring"];
const ACTIONS = ["CREATED", "UPDATED", "DELETED", "ACCEPTED", "DECLINED", "CANCELLED", "EXPORTED"];
export function maak(hulp) {
    const { Fout, ok, uuid, nu, gebruikerVoor, kindIdsVoor } = hulp;
    const V = (m) => new Fout(400, "VALIDATION", m);
    const NF = (m = "not found") => new Fout(404, "NOT_FOUND", m);
    const FB = (m = "forbidden") => new Fout(403, "FORBIDDEN", m);
    const T = (db, n) => (db[n] ??= []);
    const tekst = (v, veld, max, verplicht) => {
        if (v === undefined || v === null || v === "") {
            if (verplicht)
                throw V(`${veld} is required`);
            return v === undefined ? undefined : null;
        }
        if (typeof v !== "string")
            throw V(`${veld} must be a string`);
        const t = v.trim();
        if (t.length > max)
            throw V(`${veld} is too long`);
        if (!t && verplicht)
            throw V(`${veld} is required`);
        return t || null;
    };
    const id = (v, veld) => { if (typeof v !== "string" || !UUID.test(v)) throw V(`${veld} must be a UUID`); return v.toLowerCase(); };
    // ---------- familie (zoals _shared/practical-scope.ts) ----------
    function familie(db, uid) {
        const childIds = kindIdsVoor(db, uid);
        const co = [...new Set(db.connections.filter((c) => ["active", "connected"].includes(c.status) && (c.parent_1_id === uid || c.parent_2_id === uid)).map((c) => (c.parent_1_id === uid ? c.parent_2_id : c.parent_1_id)))].filter((x) => x && x !== uid);
        const shared = Object.fromEntries(co.map((c) => [c, childIds.filter((k) => kindIdsVoor(db, c).includes(k))]));
        return { userId: uid, childIds, coParents: co, shared };
    }
    const leden = (f) => [f.userId, ...f.coParents];
    const magZien = (f, eigenaar, kids, prive = false) => {
        if (!eigenaar)
            return false;
        if (eigenaar === f.userId)
            return true;
        if (prive || !f.coParents.includes(eigenaar))
            return false;
        return !(kids ?? []).length || kids.some((k) => f.childIds.includes(k));
    };
    const anderen = (f, kids = []) => (kids.length ? f.coParents.filter((c) => kids.some((k) => (f.shared[c] ?? []).includes(k))) : [...f.coParents]);
    const kinderenUit = (f, v) => {
        if (v === undefined || v === null)
            return [];
        if (!Array.isArray(v))
            throw V("child_ids must be an array");
        const uit = [];
        for (const x of v) {
            const k = id(x, "child_ids");
            if (!f.childIds.includes(k))
                throw NF("Child not found");
            if (!uit.includes(k))
                uit.push(k);
        }
        return uit;
    };
    const namen = (db) => (uid) => db.profiles.find((p) => p.id === uid)?.name ?? "";
    // ---------- audit + meldingen (zoals _shared/practical-audit.ts) ----------
    function logAudit(db, e) {
        if (e.private || !e.actorId)
            return null;
        const changes = (e.changes ?? []).map((c) => ({ veld: String(c.veld ?? ""), oud: c.oud == null ? null : String(c.oud), nieuw: c.nieuw == null ? null : String(c.nieuw) }));
        if (changes.length && changes.every((c) => c.oud === c.nieuw))
            return null;
        const kids = [...new Set(e.childIds ?? [])];
        const r = { id: uuid(), actor_id: e.actorId, entity_type: e.section, entity_id: e.entityId ?? null, action: e.action, item_label: e.label ?? null, changes, child_ids: kids, meta: e.meta ?? {}, origin: e.origin ?? "server", details: { item_naam: e.label ?? null, kinderen: kids, ...(changes.length === 1 ? { wijziging: changes[0] } : changes.length ? { wijzigingen: changes } : {}), meta: e.meta ?? {} }, created_at: nu() };
        T(db, "audit_events").push(r);
        return r.id;
    }
    function notify(db, n) {
        const aan = [...new Set((Array.isArray(n.to) ? n.to : [n.to]).filter((x) => x && x !== n.actorId))];
        for (const user_id of aan)
            T(db, "notifications").push({ id: uuid(), user_id, actor_id: n.actorId, type: n.type, category: n.category, title: n.key, message: "", link: n.link ?? null, entity_type: n.entityType ?? null, entity_id: n.entityId ?? null, child_ids: n.childIds ?? [], metadata: { params: n.params ?? {}, audit_id: n.auditId ?? null }, is_read: false, created_at: nu() });
    }
    const metFam = (db, token) => { const p = gebruikerVoor(db, token); return { p, f: familie(db, p.id) }; };
    // ================= manage-tasks =================
    const taakUit = (r) => ({ id: r.id, title: r.title, child_ids: r.child_ids, created_by: r.user_id, assignee_id: r.assignee_id ?? null, requested_to: r.requested_to ?? null, requested_by: r.requested_by ?? null, deadline: r.deadline ?? null, recurrence: r.recurrence, recurrence_text: r.recurrence_text ?? null, reminder_days: r.reminder_days ?? 0, is_completed: !!r.is_completed, completed_at: r.completed_at ?? null, completed_by: r.completed_by ?? null, contact_status: r.contact_status ?? null, source: r.source ?? {}, created_at: r.created_at, updated_at: r.updated_at });
    const spulUit = (r) => ({ id: r.id, created_by: r.created_by, child_id: r.child_id, name: r.name, item_type: r.item_type, location_parent_id: r.location_parent_id ?? null, location_text: r.location_text ?? null, responsible_id: r.responsible_id ?? null, is_done: !!r.is_done, created_at: r.created_at, updated_at: r.updated_at });
    const laadTaak = (db, f, v) => { const tid = id(v, "task_id"); const r = T(db, "tasks").find((x) => x.id === tid); if (!r || r.deleted_at || !magZien(f, r.user_id, r.child_ids)) throw NF("Task not found"); return r; };
    const zetTaak = (r, p) => Object.assign(r, p, { updated_at: nu() });
    const anderVoor = (f, kids) => { const o = anderen(f, kids); if (!o.length) throw V("NO_CO_PARENT: invite the other parent first"); return o[0]; };
    const taakAudit = (db, me, r, action, changes, meta) => logAudit(db, { actorId: me, section: "taak", entityId: r.id, label: r.title, action, changes, childIds: r.child_ids, meta });
    const tNotify = (db, me, aan, cat, key, r, auditId) => notify(db, { to: aan, actorId: me, type: "task", category: cat, key, params: { titel: r.title }, link: "/taken", entityType: "task", entityId: r.id, childIds: r.child_ids, auditId });
    const laadSpul = (db, f, v) => { const bid = id(v, "belonging_id"); const r = T(db, "belongings").find((x) => x.id === bid); if (!r || r.deleted_at || !magZien(f, r.created_by, [r.child_id]) || !f.childIds.includes(r.child_id)) throw NF("Belonging not found"); return r; };
    const plekUit = (f, v) => {
        if (v === undefined)
            return undefined;
        if (v === null)
            return { location_parent_id: null, location_text: null };
        if (typeof v !== "object" || Array.isArray(v))
            throw V("location must be an object");
        if (v.parent_id) {
            const pid = id(v.parent_id, "location.parent_id");
            if (!leden(f).includes(pid))
                throw V("location.parent_id must be a parent of this family");
            return { location_parent_id: pid, location_text: null };
        }
        return { location_parent_id: null, location_text: tekst(v.text, "location.text", 120) ?? null };
    };
    const tasks = {
        list(db, b, token) {
            const { f } = metFam(db, token);
            return ok({
                tasks: T(db, "tasks").filter((r) => !r.deleted_at && leden(f).includes(r.user_id) && magZien(f, r.user_id, r.child_ids)).sort((a, z) => z.created_at.localeCompare(a.created_at)).map(taakUit),
                belongings: T(db, "belongings").filter((r) => !r.deleted_at && f.childIds.includes(r.child_id) && magZien(f, r.created_by, [r.child_id])).map(spulUit),
            });
        },
        create(db, b, token) {
            const { p, f } = metFam(db, token);
            const title = tekst(b.title, "title", 300, true);
            const kids = kinderenUit(f, b.child_ids);
            const source = {};
            for (const k of ["bericht_id", "gesprek_id", "afspraak_id"])
                if (b.source?.[k])
                    source[k] = String(b.source[k]).slice(0, 120);
            if (source.bericht_id && source.gesprek_id) {
                const dup = T(db, "tasks").find((r) => !r.deleted_at && leden(f).includes(r.user_id) && r.source?.bericht_id === source.bericht_id && r.source?.gesprek_id === source.gesprek_id);
                if (dup)
                    return ok({ task: taakUit(dup), duplicate: true });
            }
            const assign = b.assign ?? "me";
            if (!["me", "other", "none"].includes(assign))
                throw V("assign");
            const recurrence = b.recurrence ?? "eenmalig";
            if (!RECURRENCE.includes(recurrence))
                throw V("recurrence");
            const reminder = b.reminder_days == null ? 0 : Number(b.reminder_days);
            if (!Number.isInteger(reminder) || reminder < 0 || reminder > 60)
                throw V("reminder_days");
            if (b.contact_status != null && !CONTACT.includes(b.contact_status))
                throw V("contact_status");
            if (b.deadline != null && b.deadline !== "" && !DATUM.test(b.deadline))
                throw V("deadline");
            const other = assign === "other" ? anderVoor(f, kids) : null;
            const r = { id: uuid(), user_id: p.id, title, child_ids: kids, assignee_id: assign === "me" ? p.id : null, requested_to: other, requested_by: other ? p.id : null, deadline: b.deadline || null, recurrence, recurrence_text: recurrence === "aangepast" ? tekst(b.recurrence_text, "recurrence_text", 120) ?? null : null, reminder_days: reminder, is_completed: false, contact_status: b.contact_status ?? null, source, created_at: nu(), updated_at: nu() };
            T(db, "tasks").push(r);
            const aid = taakAudit(db, p.id, r, "CREATED", undefined, other ? { type: "Taak gevraagd" } : undefined);
            if (other)
                tNotify(db, p.id, other, "actie", "taakGevraagd", r, aid);
            return ok({ task: taakUit(r) });
        },
        toggle(db, b, token) {
            const { p, f } = metFam(db, token);
            const r = laadTaak(db, f, b.task_id);
            if (r.requested_to)
                throw V("Task is waiting for an answer");
            const done = b.done === undefined ? !r.is_completed : !!b.done;
            if (done === !!r.is_completed)
                return ok({ task: taakUit(r) });
            const oud = r.is_completed;
            zetTaak(r, { is_completed: done, completed_at: done ? nu() : null, completed_by: done ? p.id : null, ...(r.contact_status ? { contact_status: done ? "afgerond" : "nog-te-regelen" } : {}) });
            taakAudit(db, p.id, r, "UPDATED", [{ veld: "gedaan", oud: oud ? "ja" : "nee", nieuw: done ? "ja" : "nee" }]);
            return ok({ task: taakUit(r) });
        },
        "set-contact-status"(db, b, token) {
            const { p, f } = metFam(db, token);
            const r = laadTaak(db, f, b.task_id);
            if (r.requested_to)
                throw V("Task is waiting for an answer");
            if (!CONTACT.includes(b.contact_status))
                throw V("contact_status");
            const oud = r.contact_status;
            const done = b.contact_status === "afgerond";
            zetTaak(r, { contact_status: b.contact_status, is_completed: done, completed_at: done ? nu() : null, completed_by: done ? p.id : null });
            taakAudit(db, p.id, r, "UPDATED", [{ veld: "contactStatus", oud, nieuw: b.contact_status }]);
            return ok({ task: taakUit(r) });
        },
        claim(db, b, token) {
            const { p, f } = metFam(db, token);
            const r = laadTaak(db, f, b.task_id);
            if (r.is_completed)
                throw V("Task is already done");
            if (r.requested_to && r.requested_to !== p.id)
                throw V("Task is waiting for the other parent");
            if (r.assignee_id && r.assignee_id !== p.id && !r.requested_to)
                throw V("Task already has an owner");
            if (r.assignee_id === p.id && !r.requested_to)
                return ok({ task: taakUit(r) });
            const verzoek = r.requested_to === p.id, vrager = r.requested_by, oud = r.assignee_id;
            zetTaak(r, { assignee_id: p.id, requested_to: null, requested_by: null });
            const aid = taakAudit(db, p.id, r, "UPDATED", [{ veld: "verantwoordelijke", oud, nieuw: p.id }], { type: "Taak opnieuw toegewezen" });
            if (verzoek && vrager)
                tNotify(db, p.id, vrager, "wijziging", "taakGeaccepteerd", r, aid);
            return ok({ task: taakUit(r) });
        },
        request(db, b, token) {
            const { p, f } = metFam(db, token);
            const r = laadTaak(db, f, b.task_id);
            if (r.is_completed)
                throw V("Task is already done");
            if (r.requested_to)
                throw V("A request is already open");
            const other = anderVoor(f, r.child_ids);
            if (r.assignee_id === other)
                throw V("Task already belongs to the other parent");
            zetTaak(r, { requested_to: other, requested_by: p.id });
            const aid = taakAudit(db, p.id, r, "UPDATED", [{ veld: "gevraagdAan", oud: null, nieuw: other }], { type: "Taak gevraagd" });
            tNotify(db, p.id, other, "actie", "taakGevraagd", r, aid);
            return ok({ task: taakUit(r) });
        },
        "cancel-request"(db, b, token) {
            const { p, f } = metFam(db, token);
            const r = laadTaak(db, f, b.task_id);
            if (!r.requested_to)
                return ok({ task: taakUit(r) });
            if (r.requested_by !== p.id)
                throw FB("Only the parent who asked can withdraw the request");
            const aan = r.requested_to;
            zetTaak(r, { requested_to: null, requested_by: null });
            const aid = taakAudit(db, p.id, r, "UPDATED", [{ veld: "gevraagdAan", oud: aan, nieuw: null }], { type: "Verzoek ingetrokken" });
            tNotify(db, p.id, aan, "info", "taakVerzoekIngetrokken", r, aid);
            return ok({ task: taakUit(r) });
        },
        "respond-request"(db, b, token) {
            const { p, f } = metFam(db, token);
            const r = laadTaak(db, f, b.task_id);
            if (r.requested_to !== p.id)
                throw FB("This request is not addressed to you");
            const vrager = r.requested_by, oud = r.assignee_id;
            if (b.accept) {
                zetTaak(r, { assignee_id: p.id, requested_to: null, requested_by: null });
                const aid = taakAudit(db, p.id, r, "UPDATED", [{ veld: "verantwoordelijke", oud, nieuw: p.id }], { type: "Taak opnieuw toegewezen" });
                tNotify(db, p.id, vrager, "wijziging", "taakGeaccepteerd", r, aid);
            }
            else {
                zetTaak(r, { requested_to: null, requested_by: null });
                const aid = taakAudit(db, p.id, r, "UPDATED", [{ veld: "gevraagdAan", oud: p.id, nieuw: null }], { type: "Verzoek afgewezen" });
                tNotify(db, p.id, vrager, "wijziging", "taakAfgewezen", r, aid);
            }
            return ok({ task: taakUit(r) });
        },
        "belonging-create"(db, b, token) {
            const { p, f } = metFam(db, token);
            const kid = id(b.child_id, "child_id");
            if (!f.childIds.includes(kid))
                throw NF("Child not found");
            const name = tekst(b.name, "name", 200, true);
            const type = b.item_type ?? "mee";
            if (!ITEM_TYPES.includes(type))
                throw V("item_type");
            const r = { id: uuid(), created_by: p.id, child_id: kid, name, item_type: type, ...(plekUit(f, b.location) ?? { location_parent_id: null, location_text: null }), responsible_id: null, is_done: false, created_at: nu(), updated_at: nu() };
            T(db, "belongings").push(r);
            logAudit(db, { actorId: p.id, section: "spul", entityId: r.id, label: name, action: "CREATED", childIds: [kid], meta: { type: "Spul" } });
            return ok({ belonging: spulUit(r) });
        },
        "belonging-update"(db, b, token) {
            const { p, f } = metFam(db, token);
            const r = laadSpul(db, f, b.belonging_id);
            const patch = {}, changes = [];
            if (b.name !== undefined) {
                const n = tekst(b.name, "name", 200, true);
                if (n !== r.name) {
                    patch.name = n;
                    changes.push({ veld: "naam", oud: r.name, nieuw: n });
                }
            }
            if (b.item_type !== undefined) {
                if (!ITEM_TYPES.includes(b.item_type))
                    throw V("item_type");
                if (b.item_type !== r.item_type) {
                    patch.item_type = b.item_type;
                    changes.push({ veld: "meewisselen", oud: r.item_type, nieuw: b.item_type });
                }
            }
            const l = plekUit(f, b.location);
            if (l && (l.location_parent_id !== (r.location_parent_id ?? null) || l.location_text !== (r.location_text ?? null))) {
                Object.assign(patch, l);
                changes.push({ veld: "plek", oud: r.location_parent_id ?? r.location_text ?? null, nieuw: l.location_parent_id ?? l.location_text });
            }
            if (b.responsible === "me" && r.responsible_id !== p.id) {
                patch.responsible_id = p.id;
                changes.push({ veld: "wieRegelt", oud: r.responsible_id ?? null, nieuw: p.id });
            }
            if (b.is_done !== undefined && !!b.is_done !== !!r.is_done) {
                patch.is_done = !!b.is_done;
                changes.push({ veld: "terug", oud: r.is_done ? "ja" : "nee", nieuw: b.is_done ? "ja" : "nee" });
            }
            if (!changes.length)
                return ok({ belonging: spulUit(r) });
            Object.assign(r, patch, { updated_at: nu() });
            logAudit(db, { actorId: p.id, section: "spul", entityId: r.id, label: r.name, action: "UPDATED", changes, childIds: [r.child_id], meta: { type: "Spul" } });
            return ok({ belonging: spulUit(r) });
        },
    };
    // ---------- kringleden met account (zoals _shared/family-caregivers.ts + practical-scope caregiverAccess) ----------
    const levendeKring = (db, uid) => (db.family_caregivers ?? []).filter((r) => r.connected_user_id === uid && r.status === "active" && !r.revoked_at);
    function kringToegang(db, uid) {
        const rijen = levendeKring(db, uid);
        const grants = (db.caregiver_permissions ?? []).filter((x) => rijen.some((r) => r.id === x.caregiver_id && (r.child_ids ?? []).includes(x.child_id)) && x.permission_level && !["geen", "none"].includes(x.permission_level));
        return {
            view: (sec) => [...new Set(grants.filter((g) => g.section === sec).map((g) => g.child_id))],
            contribute: (sec) => [...new Set(grants.filter((g) => g.section === sec && g.permission_level === "bijdragen").map((g) => g.child_id))],
            caregiverIds: rijen.map((r) => r.id),
        };
    }
    const kringAuteurs = (db, kids) => new Set((db.family_caregivers ?? []).filter((r) => r.connected_user_id && r.status === "active" && !r.revoked_at && (r.child_ids ?? []).some((k) => kids.includes(k))).map((r) => r.connected_user_id));
    // ================= manage-moments =================
    const momentZichtbaar = (f, r) => !r.deleted_at && magZien(f, r.user_id, r.child_id ? [r.child_id] : [], r.visibility === "private");
    const momentUit = (db, f, r) => ({ id: r.id, child_id: r.child_id, author_id: r.user_id, text: r.text, photo_url: r.photo_url ?? null, visibility: r.visibility, circle_ids: r.circle_ids ?? [], phase: r.phase, milestone: r.milestone ?? null, kind: r.kind, happened_on: r.happened_on, created_at: r.created_at,
        reactions: T(db, "moment_reactions").filter((x) => x.moment_id === r.id && leden(f).includes(x.user_id)).map((x) => ({ user_id: x.user_id, reaction: x.reaction, text: x.reaction_text ?? null, created_at: x.created_at })) });
    const laadMoment = (db, f, v) => { const mid = id(v, "moment_id"); const r = T(db, "shared_moments").find((x) => x.id === mid); if (!r || !momentZichtbaar(f, r)) throw NF("Moment not found"); return r; };
    const moments = {
        list(db, b, token) {
            const { f } = metFam(db, token);
            const cg = kringToegang(db, f.userId);
            const auteurs = kringAuteurs(db, f.childIds);
            const mag = (r) => {
                if (r.deleted_at)
                    return false;
                if (r.user_id === f.userId)
                    return true;
                if (r.child_id && f.childIds.includes(r.child_id) && (momentZichtbaar(f, r) || (r.visibility !== "private" && auteurs.has(r.user_id))))
                    return true;
                return r.visibility === "circle" && cg.view("momentjes").includes(r.child_id) && (r.circle_ids ?? []).some((id) => cg.caregiverIds.includes(id));
            };
            return ok({ moments: T(db, "shared_moments").filter(mag).sort((a, z) => z.created_at.localeCompare(a.created_at)).map((r) => momentUit(db, f, r)) });
        },
        create(db, b, token) {
            const { p, f } = metFam(db, token);
            const kid = id(b.child_id, "child_id");
            const alsKring = !f.childIds.includes(kid);
            if (alsKring && !kringToegang(db, p.id).contribute("momentjes").includes(kid))
                throw NF("Child not found");
            if (alsKring)
                b = { ...b, visibility: "parents", kind: "moment" };
            const kind = b.kind ?? "moment";
            if (!["moment", "mijlpaal"].includes(kind))
                throw V("kind");
            const text = tekst(b.text, "text", 2000) ?? null;
            if (!text && !b.photo_base64)
                throw V("text or photo is required");
            const visibility = b.visibility ?? "parents";
            if (!VISIBILITY.includes(visibility))
                throw V("visibility");
            const phase = b.phase ?? "geen";
            if (!PHASES.includes(phase))
                throw V("phase");
            if (b.milestone != null && !MILESTONES.includes(b.milestone))
                throw V("milestone");
            if (b.photo_base64 && (typeof b.photo_base64 !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(b.photo_base64) || b.photo_base64.length > 2.1e6))
                throw V("Only jpeg, png or webp images are allowed");
            const r = { id: uuid(), user_id: p.id, child_id: kid, text, photo_url: b.photo_base64 || null, visibility, circle_ids: visibility === "circle" && Array.isArray(b.circle_ids) ? b.circle_ids.slice(0, 30).map(String) : [], phase, milestone: b.milestone ?? null, kind, happened_on: DATUM.test(b.happened_on ?? "") ? b.happened_on : nu().slice(0, 10), created_at: nu() };
            T(db, "shared_moments").push(r);
            return ok({ moment: momentUit(db, f, r) });
        },
        react(db, b, token) {
            const { p, f } = metFam(db, token);
            const r = laadMoment(db, f, b.moment_id);
            if (r.user_id === p.id)
                throw FB("You cannot react to your own moment");
            if (!REACTIONS.includes(b.reaction))
                throw V("reaction");
            const text = tekst(b.text, "text", 80) ?? null;
            const lijst = T(db, "moment_reactions");
            const bestaand = lijst.find((x) => x.moment_id === r.id && x.user_id === p.id);
            if (bestaand)
                Object.assign(bestaand, { reaction: b.reaction, reaction_text: text, created_at: nu() });
            else
                lijst.push({ moment_id: r.id, user_id: p.id, reaction: b.reaction, reaction_text: text, created_at: nu() });
            notify(db, { to: r.user_id, actorId: p.id, type: "moment", category: "info", key: "momentReactie", link: "/momentjes", entityType: "moment", entityId: r.id, childIds: [r.child_id] });
            return ok({ moment: momentUit(db, f, r) });
        },
        delete(db, b, token) {
            const { p, f } = metFam(db, token);
            const r = laadMoment(db, f, b.moment_id);
            if (r.user_id !== p.id)
                throw FB("Only the author can remove a moment");
            r.deleted_at = nu();
            return ok({});
        },
    };
    // ================= manage-documents =================
    const docZichtbaar = (f, r) => !r.deleted_at && magZien(f, r.user_id, r.child_id ? [r.child_id] : [], r.is_shared === false) && (!r.child_id || f.childIds.includes(r.child_id));
    const docUit = (r) => ({ id: r.id, title: r.title, category: r.category, child_id: r.child_id ?? null, uploaded_by: r.user_id, file_name: r.file_name ?? null, file_size: r.file_size, mime_type: r.mime_type, is_shared: r.is_shared !== false, source: r.source, created_at: r.created_at, updated_at: r.updated_at });
    const laadDoc = (db, f, v) => { const did = id(v, "document_id"); const r = T(db, "documents").find((x) => x.id === did); if (!r || !docZichtbaar(f, r)) throw NF("Document not found"); return r; };
    const documents = {
        list(db, b, token) {
            const { f } = metFam(db, token);
            return ok({ documents: T(db, "documents").filter((r) => leden(f).includes(r.user_id) && docZichtbaar(f, r)).sort((a, z) => z.created_at.localeCompare(a.created_at)).map(docUit) });
        },
        upload(db, b, token) {
            const { p, f } = metFam(db, token);
            const mime = String(b.mime_type ?? "").toLowerCase();
            if (!MIME[mime])
                throw V("Only pdf, images, Word or text files are allowed");
            const title = tekst(b.title, "title", 200, true);
            const category = tekst(b.category, "category", 60) ?? "Overig";
            const source = b.source ?? "upload";
            if (!["upload", "ouderschapsplan", "bon", "school"].includes(source))
                throw V("source");
            let kid = null;
            if (b.child_id) {
                kid = id(b.child_id, "child_id");
                if (!f.childIds.includes(kid))
                    throw NF("Child not found");
            }
            if (typeof b.file_base64 !== "string" || !b.file_base64)
                throw V("file_base64 is required");
            const ruw = b.file_base64.replace(/^data:[^;,]*;base64,/, "");
            const grootte = Math.floor((ruw.length * 3) / 4);
            if (grootte > 10 * 1024 * 1024)
                throw V("File is too large (max 10 MB)");
            const r = { id: uuid(), user_id: p.id, child_id: kid, title, category, file_size: grootte, mime_type: mime, is_shared: b.is_shared !== false, source, file_name: tekst(b.file_name, "file_name", 200) ?? null, created_at: nu(), updated_at: nu() };
            T(db, "documents").push(r);
            // Bestand apart (best effort) zodat de mock-db klein blijft.
            try {
                localStorage.setItem(`ouderapp-mock-file-${r.id}`, `data:${mime};base64,${ruw}`);
            }
            catch { /* vol: alleen metadata */ }
            if (r.is_shared) {
                const aid = logAudit(db, { actorId: p.id, section: "document", entityId: r.id, label: title, action: "CREATED", childIds: kid ? [kid] : [], meta: { categorie: category } });
                notify(db, { to: anderen(f, kid ? [kid] : []), actorId: p.id, type: "document", category: "info", key: "documentToegevoegd", params: { titel: title }, link: "/documenten", entityType: "document", entityId: r.id, childIds: kid ? [kid] : [], auditId: aid });
            }
            return ok({ document: docUit(r) });
        },
        "get-url"(db, b, token) {
            const { f } = metFam(db, token);
            const r = laadDoc(db, f, b.document_id);
            let url = null;
            try {
                url = localStorage.getItem(`ouderapp-mock-file-${r.id}`);
            }
            catch { /* */ }
            if (!url)
                throw NF("File not found");
            return ok({ url, expires_in: 3600 });
        },
        update(db, b, token) {
            const { p, f } = metFam(db, token);
            const r = laadDoc(db, f, b.document_id);
            if (r.user_id !== p.id)
                throw FB("Only the uploader can change a document");
            const oud = { ...r };
            if (b.title !== undefined)
                r.title = tekst(b.title, "title", 200, true);
            if (b.category !== undefined)
                r.category = tekst(b.category, "category", 60) ?? "Overig";
            r.updated_at = nu();
            if (r.is_shared)
                logAudit(db, { actorId: p.id, section: "document", entityId: r.id, label: r.title, action: "UPDATED", changes: [...(b.title !== undefined ? [{ veld: "naam", oud: oud.title, nieuw: r.title }] : []), ...(b.category !== undefined ? [{ veld: "categorie", oud: oud.category, nieuw: r.category }] : [])], childIds: r.child_id ? [r.child_id] : [] });
            return ok({ document: docUit(r) });
        },
        delete(db, b, token) {
            const { p, f } = metFam(db, token);
            const r = laadDoc(db, f, b.document_id);
            if (r.user_id !== p.id)
                throw FB("Only the uploader can remove a document");
            r.deleted_at = nu();
            if (r.is_shared)
                logAudit(db, { actorId: p.id, section: "document", entityId: r.id, label: r.title, action: "DELETED", childIds: r.child_id ? [r.child_id] : [] });
            return ok({});
        },
    };
    // ================= manage-agreements =================
    const afsprUit = (r) => ({ id: r.id, type: r.agreement_type === "decision" ? "decision" : "agreement", title: r.title, text: r.description, topic: r.category, child_ids: r.child_ids ?? [], status: r.status, created_by: r.user_id, proposal: r.proposal ?? null, versions: r.versions ?? [], agreed_by: r.agreed_by ?? [], agreed_at: r.agreed_at ?? null, valid_from: r.valid_from ?? null, stopped_at: r.stopped_at ?? null, source: r.source ?? null, is_safety: !!r.is_safety, is_formal: !!r.is_formal, evaluation_date: r.evaluation_date ?? null, link_note: r.link_note ?? null, history: r.history ?? [], revision: r.revision ?? 1, decision_kind: r.decision_kind ?? null, decision_mode: r.decision_mode ?? null, responses: r.responses ?? {}, created_at: r.created_at, updated_at: r.updated_at });
    const laadAfspr = (db, f, v, type) => { const rid = id(v, type === "decision" ? "decision_id" : "agreement_id"); const r = T(db, "parent_agreements").find((x) => x.id === rid); if (!r || (r.agreement_type === "decision") !== (type === "decision") || !magZien(f, r.user_id, r.child_ids)) throw NF(); return r; };
    const bewaar = (r, p) => Object.assign(r, p, { revision: (r.revision ?? 1) + 1, updated_at: nu() });
    const hist = (r, e) => [...(r.history ?? []), { at: nu(), ...e }];
    const checkRev = (r, b) => { if (b.revision !== undefined && Number(b.revision) !== Number(r.revision ?? 1)) throw V("STALE: the agreement changed in the meantime"); };
    const partijen = (f, kids) => [f.userId, ...anderen(f, kids)];
    function pasToe(r, p, door) {
        const at = nu();
        if (p.kind === "nieuw")
            return { description: p.text ?? r.description, status: "active", proposal: null, agreed_by: p.parties, agreed_at: at, valid_from: at, history: hist(r, { by: door, type: "gaat-in" }) };
        if (p.kind === "stoppen")
            return { status: "stopped", stopped_at: at, proposal: null, history: hist(r, { by: door, type: "gestopt" }) };
        return { description: p.text, proposal: null, valid_from: at, agreed_by: p.parties, versions: [{ text: r.description, until: at }, ...(r.versions ?? [])], history: hist(r, { by: door, type: "nieuwe-versie", oud: r.description, nieuw: p.text }) };
    }
    const aNotify = (db, me, aan, key, r, cat) => notify(db, { to: aan, actorId: me, type: "agreement", category: cat, key, params: { titel: r.title }, link: `/afspraken?afspraak=${r.id}`, entityType: "agreement", entityId: r.id, childIds: r.child_ids ?? [] });
    function maakAfspraak(db, me, f, x) {
        const parties = partijen(f, x.childIds);
        const solo = parties.length < 2;
        const at = nu();
        const basis = { id: uuid(), user_id: me, child_ids: x.childIds, title: x.title, description: x.text, category: x.topic, agreement_type: "agreement", source: x.source, revision: 1, versions: [], responses: {}, created_at: at, updated_at: at };
        const r = solo
            ? { ...basis, status: "active", agreed_by: [me], agreed_at: at, valid_from: at, proposal: null, history: [{ at, by: me, type: x.historyType === "geimporteerd" ? "geimporteerd" : "vastgelegd", document: x.document ?? null }] }
            : { ...basis, status: "pending", agreed_by: [], proposal: { kind: "nieuw", by: me, at, text: x.text, parties, approvals: { [me]: true } }, history: [{ at, by: me, type: x.historyType, document: x.document ?? null }] };
        T(db, "parent_agreements").push(r);
        if (!solo)
            aNotify(db, me, parties.filter((q) => q !== me), "afspraakVoorstel", r, "actie");
        return r;
    }
    const onderwerp = (v) => { const t = v ?? "Overig"; if (!TOPICS.includes(t)) throw V("topic is invalid"); return t; };
    const agreements = {
        list(db, b, token) {
            const { f } = metFam(db, token);
            const mijn = T(db, "parent_agreements").filter((r) => leden(f).includes(r.user_id) && magZien(f, r.user_id, r.child_ids));
            return ok({ agreements: mijn.filter((r) => r.agreement_type !== "decision").map(afsprUit), decisions: mijn.filter((r) => r.agreement_type === "decision").map(afsprUit) });
        },
        "propose-new"(db, b, token) {
            const { p, f } = metFam(db, token);
            const r = maakAfspraak(db, p.id, f, { title: tekst(b.title, "title", 200, true), text: tekst(b.text, "text", 4000, true), topic: onderwerp(b.topic), childIds: kinderenUit(f, b.child_ids), source: null, historyType: "voorgesteld-nieuw" });
            return ok({ agreement: afsprUit(r) });
        },
        import(db, b, token) {
            const { p, f } = metFam(db, token);
            if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50)
                throw V("items");
            const document = tekst(b.document, "document", 200) ?? null;
            const kids = kinderenUit(f, b.child_ids);
            const uit = b.items.map((it) => maakAfspraak(db, p.id, f, { title: tekst(it?.title, "title", 200, true), text: tekst(it?.text, "text", 4000, true), topic: TOPICS.includes(it?.topic) ? it.topic : "Overig", childIds: kids, source: { kind: "document", label: [document, it?.source_label].filter(Boolean).join(": ") || null, document: true }, historyType: "geimporteerd", document }));
            return ok({ agreements: uit.map(afsprUit) });
        },
        "propose-change"(db, b, token) {
            const { p, f } = metFam(db, token);
            const r = laadAfspr(db, f, b.agreement_id, "agreement");
            checkRev(r, b);
            if (r.status !== "active")
                throw V("Only an active agreement can be changed");
            if (r.proposal)
                throw V("PROPOSAL_OPEN: there is already an open proposal");
            const stop = b.kind === "stoppen";
            const text = stop ? null : tekst(b.text, "text", 4000, true);
            if (!stop && text === r.description)
                throw V("The text did not change");
            const parties = partijen(f, r.child_ids ?? []);
            const voorstel = { kind: stop ? "stoppen" : "wijziging", by: p.id, at: nu(), text, parties, approvals: { [p.id]: true } };
            const h = hist(r, { by: p.id, type: stop ? "voorgesteld-stoppen" : "voorgesteld-wijziging", tekst: text });
            if (parties.length < 2) {
                bewaar(r, pasToe({ ...r, history: h }, voorstel, p.id));
                return ok({ agreement: afsprUit(r) });
            }
            bewaar(r, { proposal: voorstel, history: h });
            aNotify(db, p.id, parties.filter((x) => x !== p.id), stop ? "afspraakStopVoorstel" : "afspraakWijzigVoorstel", r, "actie");
            return ok({ agreement: afsprUit(r) });
        },
        respond(db, b, token) {
            const { p, f } = metFam(db, token);
            const r = laadAfspr(db, f, b.agreement_id, "agreement");
            checkRev(r, b);
            const v = r.proposal;
            if (!v)
                throw V("There is no open proposal");
            if (v.by === p.id)
                throw FB("You cannot answer your own proposal");
            if (!(v.parties ?? []).includes(p.id) || v.approvals?.[p.id])
                throw FB("Your answer is not needed");
            if (b.response === "akkoord") {
                const next = { ...v, approvals: { ...(v.approvals ?? {}), [p.id]: true } };
                const h = hist(r, { by: p.id, type: v.kind === "wijziging" ? "akkoord-wijziging" : "akkoord" });
                const alles = next.parties.every((x) => next.approvals[x]);
                bewaar(r, alles ? pasToe({ ...r, history: h }, next, p.id) : { proposal: next, history: h });
                aNotify(db, p.id, [v.by], alles ? "afspraakAkkoord" : "afspraakReactie", r, "wijziging");
            }
            else if (b.response === "ander") {
                const alt = tekst(b.text, "text", 4000, true);
                bewaar(r, { proposal: { kind: v.kind === "stoppen" ? "wijziging" : v.kind, by: p.id, at: nu(), text: alt, parties: v.parties, approvals: { [p.id]: true } }, history: hist(r, { by: p.id, type: "ander-voorstel", alt, origineel: v.text ?? r.description }) });
                aNotify(db, p.id, [v.by], "afspraakAnderVoorstel", r, "actie");
            }
            else if (b.response === "niet") {
                bewaar(r, { proposal: null, status: v.kind === "nieuw" ? "rejected" : r.status, history: hist(r, { by: p.id, type: v.kind === "nieuw" ? "niet-akkoord-nieuw" : "niet-akkoord-wijziging" }) });
                aNotify(db, p.id, [v.by], "afspraakNietAkkoord", r, "wijziging");
            }
            else if (b.response === "meer-tijd") {
                bewaar(r, { proposal: { ...v, more_time: { by: p.id, at: nu() } }, history: hist(r, { by: p.id, type: "meer-tijd" }) });
                aNotify(db, p.id, [v.by], "afspraakMeerTijd", r, "info");
            }
            else
                throw V("response must be akkoord, ander, niet or meer-tijd");
            return ok({ agreement: afsprUit(r) });
        },
        withdraw(db, b, token) {
            const { p, f } = metFam(db, token);
            const r = laadAfspr(db, f, b.agreement_id, "agreement");
            const v = r.proposal;
            if (!v)
                throw V("There is no open proposal");
            if (v.by !== p.id)
                throw FB("Only the proposer can withdraw");
            bewaar(r, { proposal: null, status: v.kind === "nieuw" ? "withdrawn" : r.status, history: hist(r, { by: p.id, type: "ingetrokken", tekst: v.text ?? r.description }) });
            aNotify(db, p.id, (v.parties ?? []).filter((x) => x !== p.id), "afspraakIngetrokken", r, "info");
            return ok({ agreement: afsprUit(r) });
        },
        "decision-create"(db, b, token) {
            const { p, f } = metFam(db, token);
            const title = tekst(b.title, "title", 200, true);
            if (!DECISION_KINDS.includes(b.kind))
                throw V("kind is invalid");
            const mode = b.mode ?? "goedkeuring";
            if (!["goedkeuring", "mening", "informatie"].includes(mode))
                throw V("mode is invalid");
            const kids = kinderenUit(f, b.child_id ? [b.child_id] : []);
            if (kids.length !== 1)
                throw V("child_id is required");
            const others = anderen(f, kids);
            const at = nu();
            const r = { id: uuid(), user_id: p.id, child_ids: kids, title, description: title, category: "Kinderen", agreement_type: "decision", decision_kind: b.kind, decision_mode: mode, status: mode === "goedkeuring" && others.length ? "pending" : "active", responses: mode === "goedkeuring" ? { [p.id]: "akkoord" } : {}, history: [{ at, by: p.id, type: mode === "goedkeuring" ? "voorstel" : "gedeeld" }], revision: 1, versions: [], agreed_by: [], created_at: at, updated_at: at };
            T(db, "parent_agreements").push(r);
            const aid = logAudit(db, { actorId: p.id, section: "besluit", entityId: r.id, label: title, action: "CREATED", childIds: kids, meta: { soort: b.kind } });
            notify(db, { to: others, actorId: p.id, type: "decision", category: mode === "goedkeuring" ? "actie" : "info", key: mode === "goedkeuring" ? "besluitVoorstel" : "besluitGedeeld", params: { titel: title }, link: "/beslissingen", entityType: "decision", entityId: r.id, childIds: kids, auditId: aid });
            return ok({ decision: afsprUit(r) });
        },
        "decision-respond"(db, b, token) {
            const { p, f } = metFam(db, token);
            const r = laadAfspr(db, f, b.decision_id, "decision");
            if (r.decision_mode !== "goedkeuring")
                throw V("This decision does not ask for approval");
            if (r.user_id === p.id)
                throw FB("You cannot answer your own decision");
            if ((r.responses ?? {})[p.id])
                throw V("You already answered");
            if (!["akkoord", "niet"].includes(b.response))
                throw V("response must be akkoord or niet");
            bewaar(r, { responses: { ...(r.responses ?? {}), [p.id]: b.response }, status: b.response === "akkoord" ? "active" : "rejected", history: hist(r, { by: p.id, type: b.response }) });
            const aid = logAudit(db, { actorId: p.id, section: "besluit", entityId: r.id, label: r.title, action: b.response === "akkoord" ? "ACCEPTED" : "DECLINED", changes: [{ veld: "reactie", oud: null, nieuw: b.response }], childIds: r.child_ids });
            notify(db, { to: r.user_id, actorId: p.id, type: "decision", category: "wijziging", key: b.response === "akkoord" ? "besluitAkkoord" : "besluitNietAkkoord", params: { titel: r.title }, link: "/beslissingen", entityType: "decision", entityId: r.id, childIds: r.child_ids, auditId: aid });
            return ok({ decision: afsprUit(r) });
        },
        "evaluation-list"(db, b, token) {
            const p = gebruikerVoor(db, token);
            return ok({ evaluations: T(db, "evaluations").filter((e) => e.user_id === p.id).sort((a, z) => z.date.localeCompare(a.date) || z.created_at.localeCompare(a.created_at)).slice(0, 24).map((e) => ({ id: e.id, date: e.date, answers: e.answers, created_at: e.created_at })) });
        },
        "evaluation-save"(db, b, token) {
            const p = gebruikerVoor(db, token);
            const a = b.answers && typeof b.answers === "object" && !Array.isArray(b.answers) ? b.answers : {};
            const answers = {};
            for (const k of ["goed", "anders", "nodig", "zelf"])
                answers[k] = tekst(a[k], k, 2000) ?? "";
            answers.werkt = ["goed", "grotendeels", "niet"].includes(a.werkt) ? a.werkt : "";
            const e = { id: uuid(), user_id: p.id, date: nu().slice(0, 10), answers, created_at: nu() };
            T(db, "evaluations").push(e);
            return ok({ evaluation: { id: e.id, date: e.date, answers, created_at: e.created_at } });
        },
    };
    // ================= log-audit =================
    // Zelfde normalisatie als log-audit: kolommen van logAudit(), anders `details` van andere domeinen.
    const normaliseer = (r) => {
        const d = r.details && typeof r.details === "object" ? r.details : {};
        const kids = (r.child_ids ?? []).length ? r.child_ids : Array.isArray(d.kinderen) ? d.kinderen.filter((x) => typeof x === "string" && UUID.test(x)) : [];
        const w = Array.isArray(r.changes) && r.changes.length ? r.changes : Array.isArray(d.wijzigingen) ? d.wijzigingen : d.wijziging && typeof d.wijziging === "object" ? [d.wijziging] : [];
        const meta = r.meta && Object.keys(r.meta).length ? r.meta : d.meta && typeof d.meta === "object" ? d.meta : {};
        return { ...r, child_ids: kids, item_label: r.item_label ?? d.item_naam ?? d.label ?? null, changes: w.map((c) => ({ veld: String(c?.veld ?? ""), oud: c?.oud == null ? null : String(c.oud), nieuw: c?.nieuw == null ? null : String(c.nieuw) })), meta: Object.fromEntries(Object.entries(meta).filter(([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v))), family_ids: Array.isArray(d.family_ids) ? d.family_ids : null };
    };
    const eventUit = (db, r) => ({ id: r.id, actor_id: r.actor_id, actor_name: namen(db)(r.actor_id), section: r.entity_type, entity_id: r.entity_id ?? null, label: r.item_label ?? r.details?.label ?? "", action: r.action, changes: Array.isArray(r.changes) ? r.changes : [], child_ids: r.child_ids ?? [], meta: r.meta ?? {}, origin: r.origin ?? "server", created_at: r.created_at });
    const audit = {
        list(db, b, token) {
            const { p, f } = metFam(db, token);
            const limit = Math.min(Math.max(Number(b.limit) || 500, 1), 1000);
            const rijen = T(db, "audit_events").map(normaliseer).filter((r) => leden(f).includes(r.actor_id) && (!b.since || r.created_at >= b.since) && magZien(f, r.actor_id, r.child_ids ?? []) && (r.child_ids ?? []).every((k) => f.childIds.includes(k) || r.actor_id === p.id) && (!r.family_ids || r.family_ids.includes(p.id)))
                .sort((a, z) => z.created_at.localeCompare(a.created_at)).slice(0, limit);
            return ok({ events: rijen.map((r) => eventUit(db, r)) });
        },
        log(db, b, token) {
            const { p, f } = metFam(db, token);
            if (!SECTIONS.includes(String(b.section ?? "")))
                throw V("section is invalid");
            if (!ACTIONS.includes(b.audit_action))
                throw V("audit_action is invalid");
            const kids = kinderenUit(f, b.child_ids);
            const meta = {};
            if (b.meta && typeof b.meta === "object" && !Array.isArray(b.meta))
                for (const [k, x] of Object.entries(b.meta).slice(0, 12))
                    if (x != null && ["string", "number", "boolean"].includes(typeof x))
                        meta[String(k).slice(0, 40)] = String(x).slice(0, 300);
            const changes = Array.isArray(b.changes) ? b.changes.slice(0, 20).map((c) => ({ veld: tekst(c?.veld, "changes.veld", 80, true), oud: c?.oud == null ? null : String(c.oud).slice(0, 500), nieuw: c?.nieuw == null ? null : String(c.nieuw).slice(0, 500) })) : [];
            const aid = logAudit(db, { actorId: p.id, section: b.section, entityId: tekst(b.item_id, "item_id", 120) ?? null, label: tekst(b.item_label, "item_label", 300) ?? null, action: b.audit_action, changes, childIds: kids, meta, origin: "client" });
            const r = aid && T(db, "audit_events").find((x) => x.id === aid);
            return ok({ event: r ? eventUit(db, normaliseer(r)) : null });
        },
    };
    // ================= send-notification =================
    const notifications = {
        list(db, b, token) {
            const { p, f } = metFam(db, token);
            const rijen = T(db, "notifications").filter((x) => x.user_id === p.id && (!x.actor_id || leden(f).includes(x.actor_id)) && (x.child_ids ?? []).every((k) => f.childIds.includes(k)))
                .sort((a, z) => z.created_at.localeCompare(a.created_at)).slice(0, 200);
            return ok({
                notifications: rijen.map((x) => ({ id: x.id, actor_id: x.actor_id ?? null, actor_name: namen(db)(x.actor_id), type: x.type, category: x.category, key: x.title, params: x.metadata?.params ?? {}, audit_id: x.metadata?.audit_id ?? null, link: x.link, entity_type: x.entity_type, entity_id: x.entity_id, child_ids: x.child_ids ?? [], is_read: !!x.is_read, created_at: x.created_at })),
                read_ids: T(db, "activity_reads").filter((x) => x.user_id === p.id).map((x) => x.item_id),
            });
        },
        "mark-read"(db, b, token) {
            const p = gebruikerVoor(db, token);
            if (!Array.isArray(b.item_ids))
                throw V("item_ids must be an array");
            const ids = [...new Set(b.item_ids.filter((x) => typeof x === "string" && x && x.length <= 300))];
            if (ids.length > 500)
                throw V("At most 500 ids");
            const reads = T(db, "activity_reads");
            for (const item_id of ids)
                if (!reads.some((x) => x.user_id === p.id && x.item_id === item_id))
                    reads.push({ user_id: p.id, item_id, read_at: nu() });
            for (const n of T(db, "notifications"))
                if (n.user_id === p.id && ids.includes(`act-notif-${n.id}`))
                    Object.assign(n, { is_read: true, read_at: nu() });
            return ok({});
        },
    };
    return { "manage-tasks": tasks, "manage-moments": moments, "manage-documents": documents, "manage-agreements": agreements, "log-audit": audit, "send-notification": notifications };
}
