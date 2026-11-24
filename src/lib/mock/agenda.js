/**
 * Dev-mock (VITE_API_MOCK=1) voor domein 2: manage-agenda, manage-vacations en manage-handover.
 * Zelfde acties, velden, statussen en foutcodes als de edge functions (supabase/functions/*).
 */
const CATS = ["school", "opvang", "sport", "medisch", "verjaardag", "vakantie", "wissel", "overig"];
const FREQ = ["geen", "wekelijks", "tweewekelijks", "maandelijks", "aangepast"];
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const TIJD = /^([01]\d|2[0-3]):[0-5]\d$/;
const OPTIES = ["Zwemspullen", "Gymtas", "Medicijnen", "Voetbalspullen", "Sportkleding", "Schooltas", "Knuffel", "Pyjama", "Jas", "Oplader", "Tablet", "Huiswerk"];
const CARE_UIT = { pending: "open", accepted: "geaccepteerd", declined: "afgewezen", counterproposal: "alternatief", withdrawn: "ingetrokken" };
export function maak(h) {
    const { Fout, ok, uuid, nu, gebruikerVoor, kindIdsVoor, koppelingen } = h;
    const vandaag = () => new Date().toISOString().slice(0, 10);
    const val = (m) => new Fout(400, "VALIDATION", m);
    const dicht = () => new Fout(409, "VALIDATION", "closed");
    const plus = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    /* ---------- gezin ---------- */
    function scope(db, me) {
        const kids = new Set(kindIdsVoor(db, me));
        const co = [...new Set((db.connections ?? []).filter((c) => c.status === "active" && (c.parent_1_id === me || c.parent_2_id === me)).map((c) => (c.parent_1_id === me ? c.parent_2_id : c.parent_1_id)))];
        const perKind = new Map();
        for (const k of kids) {
            const c = db.children.find((x) => x.id === k);
            const ouders = new Set([c?.created_by, ...koppelingen(db, null, k).map((x) => x.parent_id)]);
            perKind.set(k, new Set(co.filter((p) => ouders.has(p))));
        }
        return { me, kids, co, perKind };
    }
    const coVoor = (s, ids) => [...new Set(ids.flatMap((k) => [...(s.perKind.get(k) ?? [])]))];
    const magZien = (s, r) => r.created_by === s.me || (r.is_shared !== false && (r.child_ids ?? []).some((k) => (s.perKind.get(k) ?? new Set()).has(r.created_by)));
    function eisAntwoorder(s, r) {
        if (r.created_by === s.me)
            throw new Fout(403, "FORBIDDEN", "own proposal");
        if (!magZien(s, r))
            throw new Fout(404, "NOT_FOUND", "proposal");
    }
    function kidsUit(s, v, verplicht) {
        if (v === undefined || v === null) {
            if (verplicht)
                throw val("child_ids");
            return [];
        }
        if (!Array.isArray(v))
            throw val("child_ids");
        const ids = [...new Set(v.map(String))];
        for (const id of ids)
            if (!s.kids.has(id))
                throw new Fout(404, "NOT_FOUND", "child");
        if (verplicht && !ids.length)
            throw val("child_ids");
        return ids;
    }
    const abs = (rel, me) => { if (rel == null || rel === "") return null; if (!["ik", "ander", "samen", "open"].includes(rel)) throw val("parent"); return rel === "ik" ? `is:${me}` : rel === "ander" ? `not:${me}` : rel; };
    const rel = (a, me) => (typeof a !== "string" || !a ? null : a.startsWith("is:") ? (a.slice(3) === me ? "ik" : "ander") : a.startsWith("not:") ? (a.slice(4) === me ? "ander" : "ik") : a);
    const datum = (v, f, verplicht) => { if (v === undefined || v === null || v === "") { if (verplicht) throw val(f); return null; } if (typeof v !== "string" || !DATUM.test(v)) throw val(f); return v; };
    const tijd = (v, f) => { if (v === undefined || v === null || v === "") return null; if (typeof v !== "string" || !TIJD.test(v.slice(0, 5))) throw val(f); return v.slice(0, 5); };
    const tekst = (v, f, max, verplicht) => { if (v === undefined || v === null || v === "") { if (verplicht) throw val(f); return null; } if (typeof v !== "string") throw val(f); const x = v.trim(); if (verplicht && !x) throw val(f); if (x.length > max) throw val(f); return x || null; };
    const RESP = ["akkoord", "ander-voorstel", "niet-akkoord", "meer-tijd"];
    const antwoord = (v) => { if (!RESP.includes(v)) throw val("response"); return v; };
    const audit = (db, actor, type, id, action, details) => { (db.audit_events ??= []).push({ id: uuid(), actor_id: actor, entity_type: type, entity_id: id, action, details, created_at: nu() }); };
    const tabellen = (db) => { db.calendar_events ??= []; db.event_proposals ??= []; db.care_proposals ??= []; db.care_exceptions ??= []; db.care_versions ??= []; db.attendance ??= []; db.urgent ??= []; db.vacations ??= []; db.handover_items ??= []; db.routines ??= []; db.handover_logs ??= []; };
    const sessie = (db, token) => { tabellen(db); const p = gebruikerVoor(db, token); return { p, s: scope(db, p.id) }; };
    /* ---------- afspraken ---------- */
    function velden(s, v) {
        if (!v || typeof v !== "object")
            throw val("fields");
        const gedeeld = v.gedeeld !== false;
        let herhaling = null;
        if (v.herhaling) {
            if (!FREQ.includes(v.herhaling.freq))
                throw val("herhaling");
            if (v.herhaling.freq !== "geen")
                herhaling = { freq: v.herhaling.freq, interval: Number(v.herhaling.interval ?? 1) || 1, eenheid: v.herhaling.eenheid === "maanden" ? "maanden" : "weken", ...(datum(v.herhaling.eind, "eind") ? { eind: v.herhaling.eind } : {}) };
        }
        return {
            titel: tekst(v.titel, "titel", 200, true), datum: datum(v.datum, "datum", true), einddatum: datum(v.einddatum, "einddatum"), tijd: tijd(v.tijd, "tijd"), eindtijd: tijd(v.eindtijd, "eindtijd"),
            heleDag: v.heleDag === true, categorie: CATS.includes(v.categorie) ? v.categorie : "overig", kind_ids: kidsUit(s, v.kind_ids, gedeeld), herhaling,
            locatie: tekst(v.locatie, "locatie", 300), toelichting: tekst(v.toelichting, "toelichting", 2000), herinnering: ["geen", "uur", "dag", "twee"].includes(v.herinnering) ? v.herinnering : "geen",
            gedeeld, neem_mee: Array.isArray(v.neem_mee) ? v.neem_mee.slice(0, 30).map(String) : [],
        };
    }
    const evUit = (e, me) => ({ id: e.id, mine: e.created_by === me, titel: e.titel, datum: e.datum, einddatum: e.einddatum ?? null, tijd: e.tijd ?? "", eindtijd: e.eindtijd ?? null, heleDag: !!e.heleDag, categorie: e.categorie, kind_ids: e.child_ids, herhaling: e.herhaling ?? null, overslaan: e.overslaan ?? [], locatie: e.locatie ?? null, toelichting: e.toelichting ?? null, herinnering: e.herinnering ?? "geen", gedeeld: e.is_shared !== false, neem_mee: e.neem_mee ?? [], created_at: e.created_at, updated_at: e.updated_at });
    const nieuwEv = (db, eigenaar, f) => { const e = { id: uuid(), created_by: eigenaar, ...f, child_ids: f.kind_ids, is_shared: f.gedeeld, overslaan: [], created_at: nu(), updated_at: nu() }; db.calendar_events.push(e); return e; };
    const zetEv = (e, f) => Object.assign(e, { ...f, child_ids: f.kind_ids, is_shared: f.gedeeld, updated_at: nu() });
    const reeks = (e) => !!e.herhaling && e.herhaling.freq !== "geen";
    function pasAan(db, e, f, bereik, occ) {
        if (!reeks(e) || bereik === "reeks" || !occ || (bereik === "toekomst" && occ === e.datum))
            return [zetEv(e, { ...f, datum: reeks(e) && bereik !== "toekomst" ? e.datum : f.datum })];
        if (bereik === "alleen") {
            e.overslaan = [...new Set([...(e.overslaan ?? []), occ])];
            return [e, nieuwEv(db, e.created_by, { ...f, herhaling: null })];
        }
        e.herhaling = { ...e.herhaling, eind: plus(occ, -1) };
        return [e, nieuwEv(db, e.created_by, f)];
    }
    function verwijder(e, bereik, occ, me) {
        if (!reeks(e) || bereik === "reeks" || !occ || (bereik === "toekomst" && occ === e.datum))
            Object.assign(e, { deleted_at: nu(), deleted_by: me });
        else if (bereik === "alleen")
            e.overslaan = [...new Set([...(e.overslaan ?? []), occ])];
        else
            e.herhaling = { ...e.herhaling, eind: plus(occ, -1) };
    }
    const meerTijdUit = (m, me) => (m ? { mine: m.by === me, datum: m.date, ...(m.until ? { tot: m.until } : {}) } : null);
    const epUit = (x, me) => ({ id: x.id, event_id: x.event_id, mine: x.created_by === me, soort: x.kind === "create" ? "nieuw" : x.kind === "delete" ? "verwijder" : "wijzig", bereik: x.scope, datum: x.occurrence_date, kind_ids: x.child_ids, velden: x.kind === "delete" ? null : x.fields, status: x.status === "open" ? null : x.status, reactie_datum: x.reply_by ?? null, meer_tijd: meerTijdUit(x.more_time, me), toelichting: x.response_note ?? null, created_at: x.created_at, responded_at: x.responded_at ?? null });
    const laadEv = (db, s, id) => { const e = db.calendar_events.find((x) => x.id === id && !x.deleted_at); if (!e || !magZien(s, e)) throw new Fout(404, "NOT_FOUND", "event"); return e; };
    function stelVoor(db, s, kind, e, f, bereik, occ, reply) {
        if (e)
            for (const o of db.event_proposals.filter((x) => x.event_id === e.id && x.status === "open")) {
                if (o.created_by !== s.me)
                    throw new Fout(409, "VALIDATION", "other open proposal");
                Object.assign(o, { status: "ingetrokken", responded_at: nu() });
            }
        const x = { id: uuid(), event_id: e?.id ?? null, created_by: s.me, kind, scope: bereik, occurrence_date: occ, child_ids: f?.kind_ids?.length ? f.kind_ids : e?.child_ids ?? [], fields: f ?? {}, status: "open", reply_by: reply, more_time: null, reminders: [], created_at: nu() };
        db.event_proposals.push(x);
        audit(db, s.me, "afspraak", e?.id ?? x.id, "CREATED", { item_naam: f?.titel ?? e?.titel, kinderen: x.child_ids, meta: { voorstel: kind } });
        return x;
    }
    /* ---------- zorg ---------- */
    const careUit = (x, me) => ({ id: x.id, mine: x.created_by === me, soort: x.soort, kind_ids: x.child_ids, tekst: x.note ?? "", naar: rel(x.naar, me), datums: x.dates, wisseltijd: x.wisseltijd ?? null, plek: x.plek ?? null, datum_label: x.datum_label ?? x.dates[0] ?? null, aanleiding: x.aanleiding ?? null, reactie_datum: x.reply_by ?? null, meer_tijd: meerTijdUit(x.more_time, me), herinneringen: x.reminders ?? [], alternatief: x.alternative ?? null, moment: x.moment ?? null, reden: x.reason ?? null, status: CARE_UIT[x.status] ?? "open", created_at: x.created_at, responded_at: x.responded_at ?? null });
    const maandag = (d) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
    const idx = (s, d) => { const n = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${s}T12:00:00Z`)) / 864e5); return ((n % 14) + 14) % 14; };
    function versie(db, kid, van, naar, wisseltijd, plek, actor) {
        const v = db.care_versions.filter((x) => x.child_id === kid && x.valid_from <= van).sort((a, b) => a.valid_from.localeCompare(b.valid_from) || a.created_at.localeCompare(b.created_at)).at(-1);
        const base = v?.schedule ?? db.children.find((c) => c.id === kid)?.care_schedule ?? null;
        const goed = base && Array.isArray(base.dagen) && base.dagen.length === 14;
        const dagen = goed ? [...base.dagen] : [...Array(7).fill("ik"), ...Array(7).fill("ander")];
        const ikId = goed && base.ikId ? base.ikId : actor;
        const start = maandag(van);
        const wie = naar.startsWith("is:") ? naar.slice(3) : null, niet = naar.startsWith("not:") ? naar.slice(4) : null;
        const doel = wie ? (wie === ikId ? "ik" : "ander") : niet ? (niet === ikId ? "ander" : "ik") : "ik";
        const om = dagen[idx(start, van)] === doel ? dagen : dagen.map((d) => (d === "ik" ? "ander" : d === "ander" ? "ik" : d));
        return { ...(goed ? base : { patroonId: "om-de-week" }), dagen: om, startMaandag: start, ikId, wisseltijd: wisseltijd ?? (goed ? base.wisseltijd : "14:30") ?? "14:30", ...(plek ? { plek } : {}) };
    }
    function pasZorgToe(db, x, actor) {
        if (!x.naar || x.aanleiding === "moment")
            return;
        if (x.soort === "eenmalig")
            for (const k of x.child_ids)
                for (const d of x.dates)
                    db.care_exceptions.push({ id: uuid(), child_id: k, date: d, parent: x.naar, reason: null, proposal_id: x.id, created_by: actor, created_at: nu() });
        else
            for (const k of x.child_ids)
                db.care_versions.push({ id: uuid(), child_id: k, valid_from: x.dates[0], schedule: versie(db, k, x.dates[0], x.naar, x.wisseltijd, x.plek, actor), proposal_id: x.id, created_by: actor, created_at: nu() });
    }
    const laadZorg = (db, id) => { const x = db.care_proposals.find((y) => y.id === id); if (!x) throw new Fout(404, "NOT_FOUND", "proposal"); return x; };
    const draai = (r, me) => { if (!r) return null; const { ikId, ...rest } = r; const om = ikId && ikId !== me && Array.isArray(rest.dagen); return { ...rest, patroon: rest.patroon ?? rest.patroonId, ...(om ? { dagen: rest.dagen.map((d) => (d === "ik" ? "ander" : d === "ander" ? "ik" : d)) } : {}) }; };
    /* ---------- aanwezigheid / nu ---------- */
    const relHoud = (v, me) => (v === "nog" || v === "onbekend" ? v : rel(v, me));
    const absHoud = (v, me) => (v === "nog" || v === "onbekend" ? v : abs(v, me));
    const aanUit = (a, me) => ({ event_id: a.event_id, keuze: a.keuze, fase: a.fase, door: a.proposed_by ? (a.proposed_by === me ? "ik" : "ander") : null, wie_gaat: relHoud(a.wie_gaat, me), contact_wie: relHoud(a.contact_wie, me), uitkomst: a.uitkomst ?? null, uitkomst_toelichting: a.uitkomst_toelichting ?? null, nabespreking: a.nabespreking ? { ...a.nabespreking, door: rel(a.nabespreking.door, me) } : null, geschiedenis: (a.history ?? []).map((g) => ({ ...g, door: rel(g.door, me), wie_gaat: relHoud(g.wie_gaat, me), contact_wie: relHoud(g.contact_wie, me) })), updated_at: a.updated_at });
    const nuUit = (u, me) => ({ id: u.id, van: u.created_by === me ? "jij" : "ander", kind_ids: u.child_ids, categorie: u.categorie, titel: u.titel, toelichting: u.toelichting ?? "", reactie_gewenst: u.reactie_gewenst ?? "zsm", status: u.status, antwoord: u.antwoord ?? null, moment: u.created_at, oude_tijd: u.old_time ?? null, nieuwe_tijd: u.new_time ?? null });
    /* ---------- vakanties ---------- */
    function vakVelden(s, f) {
        if (!f || typeof f !== "object")
            throw val("fields");
        const van = datum(f.vanDatum, "vanDatum", true), tot = datum(f.totDatum, "totDatum", true);
        if (tot < van)
            throw val("dates");
        return {
            naam: tekst(f.naam, "naam", 120, true), periode: tekst(f.periode, "periode", 120) ?? `${van} – ${tot}`, vanDatum: van, totDatum: tot, kinderen: kidsUit(s, f.kinderen, true), ouder: abs(f.ouder ?? "open", s.me),
            details: tekst(f.details, "details", 2000) ?? "", soort: f.soort === "bijzonder" ? "bijzonder" : "vakantie", herhaal: ["eenmalig", "jaarlijks", "afwisselend"].includes(f.herhaal) ? f.herhaal : "eenmalig",
            verdeling: (f.verdeling ?? []).map((d) => ({ van: datum(d.van, "van", true), tot: datum(d.tot, "tot", true), ouder: abs(d.ouder ?? "ik", s.me), plek: tekst(d.plek, "plek", 200), wisseltijd: tijd(d.wisseltijd, "wisseltijd"), tijdVan: tijd(d.tijdVan, "tijdVan"), tijdTot: tijd(d.tijdTot, "tijdTot") })),
            buitenland: f.buitenland === true, bestemming: tekst(f.bestemming, "bestemming", 200) ?? "", annuleren: f.annuleren === true,
        };
    }
    const relV = (f, me) => (f ? { ...f, ouder: rel(f.ouder, me) ?? "open", verdeling: (f.verdeling ?? []).map((d) => ({ ...d, ouder: rel(d.ouder, me) })) } : null);
    const vakUit = (r, me) => ({ ...relV(r.fields, me), id: r.id, status: r.status, van: r.proposed_by ? (r.proposed_by === me ? "ik" : "ander") : null, afgesproken: relV(r.confirmed, me), reactie: r.response ?? null, reactieDatum: r.reply_by ?? null, meerTijd: r.more_time ? { mine: r.more_time.by === me, datum: r.more_time.date } : null, geschiedenis: (r.history ?? []).map((g) => ({ datum: g.datum, door: rel(`is:${g.door}`, me), actie: g.actie, velden: relV(g.velden, me) })), created_at: r.created_at, updated_at: r.updated_at });
    const laadVak = (db, s, id) => { const r = db.vacations.find((x) => x.id === id); if (!r || !magZien(s, { created_by: r.created_by, child_ids: r.child_ids })) throw new Fout(404, "NOT_FOUND", "holiday"); return r; };
    const hist = (r, me, actie) => [...(r.history ?? []), { datum: nu(), door: me, actie, velden: r.fields }];
    /* ---------- overdracht ---------- */
    const verloop = (m) => `${plus(m, 31)}T12:00:00.000Z`;
    const itemUit = (r, me) => ({ id: r.id, moment_id: r.moment_id, naam: r.item_name, kind_ids: r.child_ids, bron: r.source, bron_ref: r.source_ref ?? null, door: r.user_id === me ? "ik" : "ander", ingepakt: !!r.is_packed, ingepakt_door: r.packed_by ? (r.packed_by === me ? "ik" : "ander") : null, ingepakt_op: r.packed_at ?? null, ontvangen: r.received ?? null, verwijderd: !!r.removed });
    const eigenItem = (r) => ({ created_by: r.user_id, child_ids: r.child_ids });
    const laadItem = (db, s, id) => { const r = db.handover_items.find((x) => x.id === id); if (!r || !magZien(s, eigenItem(r))) throw new Fout(404, "NOT_FOUND", "item"); return r; };
    const routineUit = (r, me) => ({ id: r.id, kind: r.child_id, dag: r.day_of_week, item: r.item_name, reden: r.reason ?? "", door: r.user_id === me ? "ik" : "ander" });
    const logUit = (r, me) => ({ id: r.id, moment_id: r.moment_id, van: r.user_id === me ? "ik" : "ander", aan: rel(r.to_parent, me), kind_ids: r.child_ids, inhoud: r.content, datum: r.moment_id, gedeeld_op: r.updated_at });
    return {
        "manage-agenda": {
            list(db, b, token) {
                const { p, s } = sessie(db, token);
                const kids = [...s.kids];
                const ev = db.calendar_events.filter((e) => !e.deleted_at && magZien(s, e));
                const zichtbaar = new Set(ev.filter((e) => e.is_shared !== false).map((e) => e.id));
                const grens = new Date(Date.now() - 14 * 864e5).toISOString();
                return ok({
                    events: ev.map((e) => evUit(e, p.id)),
                    event_proposals: db.event_proposals.filter((x) => magZien(s, x)).map((x) => epUit(x, p.id)),
                    care_proposals: db.care_proposals.filter((x) => magZien(s, x)).map((x) => careUit(x, p.id)),
                    care_exceptions: db.care_exceptions.filter((x) => kids.includes(x.child_id)).map((x) => ({ id: x.id, kind_id: x.child_id, datum: x.date, ouder: rel(x.parent, p.id), reden: x.reason ?? null, proposal_id: x.proposal_id })),
                    care_versions: db.care_versions.filter((x) => kids.includes(x.child_id)).sort((a, z) => a.valid_from.localeCompare(z.valid_from) || a.created_at.localeCompare(z.created_at)).map((x) => ({ id: x.id, kind_id: x.child_id, vanaf: x.valid_from, regeling: draai(x.schedule, p.id), proposal_id: x.proposal_id })),
                    attendance: db.attendance.filter((a) => zichtbaar.has(a.event_id)).map((a) => aanUit(a, p.id)),
                    urgent: db.urgent.filter((u) => magZien(s, u) && u.created_at >= grens).sort((a, z) => z.created_at.localeCompare(a.created_at)).map((u) => nuUit(u, p.id)),
                    connected: s.co.length > 0,
                });
            },
            "create-event"(db, b, token) {
                const { p, s } = sessie(db, token);
                const f = velden(s, b.fields);
                if (b.voorstel === true && f.gedeeld && coVoor(s, f.kind_ids).length)
                    return ok({ applied: false, proposal: epUit(stelVoor(db, s, "create", null, f, "reeks", null, datum(b.reply_by, "reply_by")), p.id) });
                const e = nieuwEv(db, p.id, f);
                if (f.gedeeld)
                    audit(db, p.id, "afspraak", e.id, "CREATED", { item_naam: f.titel, kinderen: f.kind_ids });
                return ok({ applied: true, event: evUit(e, p.id) });
            },
            "update-event"(db, b, token) {
                const { p, s } = sessie(db, token);
                const e = laadEv(db, s, b.event_id);
                const f = velden(s, b.fields);
                const bereik = ["alleen", "toekomst", "reeks"].includes(b.scope) ? b.scope : "reeks";
                const occ = datum(b.occurrence_date, "occurrence_date");
                const direct = e.is_shared === false || coVoor(s, [...e.child_ids, ...f.kind_ids]).length === 0;
                if (!direct)
                    return ok({ applied: false, proposal: epUit(stelVoor(db, s, "update", e, f, bereik, occ, datum(b.reply_by, "reply_by")), p.id) });
                const prive = e.is_shared === false;
                const rij = pasAan(db, e, f, bereik, occ);
                if (f.gedeeld)
                    audit(db, p.id, "afspraak", e.id, prive ? "CREATED" : "UPDATED", { item_naam: f.titel, kinderen: f.kind_ids });
                return ok({ applied: true, events: rij.map((x) => evUit(x, p.id)) });
            },
            "delete-event"(db, b, token) {
                const { p, s } = sessie(db, token);
                const e = laadEv(db, s, b.event_id);
                const bereik = ["alleen", "toekomst", "reeks"].includes(b.scope) ? b.scope : "reeks";
                const occ = datum(b.occurrence_date, "occurrence_date");
                if (e.is_shared !== false && coVoor(s, e.child_ids).length)
                    return ok({ applied: false, proposal: epUit(stelVoor(db, s, "delete", e, null, bereik, occ, null), p.id) });
                verwijder(e, bereik, occ, p.id);
                if (e.is_shared !== false)
                    audit(db, p.id, "afspraak", e.id, "DELETED", { item_naam: e.titel, kinderen: e.child_ids });
                return ok({ applied: true });
            },
            "respond-event-proposal"(db, b, token) {
                const { p, s } = sessie(db, token);
                const x = db.event_proposals.find((y) => y.id === b.proposal_id);
                if (!x)
                    throw new Fout(404, "NOT_FOUND", "proposal");
                eisAntwoorder(s, x);
                if (x.status !== "open")
                    throw dicht();
                const r = antwoord(b.response);
                if (r === "meer-tijd") {
                    x.more_time = { by: p.id, date: vandaag(), ...(b.until ? { until: datum(b.until, "until") } : {}) };
                    return ok({ proposal: epUit(x, p.id) });
                }
                const status = r === "akkoord" ? "geaccepteerd" : r === "niet-akkoord" ? "afgewezen" : "alternatief";
                Object.assign(x, { status, responded_by: p.id, responded_at: nu(), response_note: tekst(b.note, "note", 1000) });
                let events = [];
                if (status === "geaccepteerd") {
                    if (x.kind === "create")
                        events = [nieuwEv(db, x.created_by, x.fields)];
                    else {
                        const e = db.calendar_events.find((y) => y.id === x.event_id && !y.deleted_at);
                        if (e && x.kind === "update")
                            events = pasAan(db, e, x.fields, x.scope, x.occurrence_date);
                        if (e && x.kind === "delete")
                            verwijder(e, x.scope, x.occurrence_date, p.id);
                    }
                }
                audit(db, p.id, "afspraak", x.event_id ?? x.id, status === "geaccepteerd" ? "ACCEPTED" : "DECLINED", { item_naam: x.fields?.titel, kinderen: x.child_ids });
                return ok({ proposal: epUit(x, p.id), events: events.map((e) => evUit(e, p.id)) });
            },
            "withdraw-event-proposal"(db, b, token) {
                const { p } = sessie(db, token);
                const x = db.event_proposals.find((y) => y.id === b.proposal_id);
                if (!x)
                    throw new Fout(404, "NOT_FOUND", "proposal");
                if (x.created_by !== p.id)
                    throw new Fout(403, "FORBIDDEN", "not proposer");
                if (x.status !== "open")
                    throw dicht();
                Object.assign(x, { status: "ingetrokken", responded_at: nu() });
                audit(db, p.id, "afspraak", x.event_id ?? x.id, "CANCELLED", { item_naam: x.fields?.titel, kinderen: x.child_ids });
                return ok({ proposal: epUit(x, p.id) });
            },
            "propose-care"(db, b, token) {
                const { p, s } = sessie(db, token);
                const v = b.proposal ?? {};
                const soort = v.soort === "structureel" ? "structureel" : "eenmalig";
                const kids = kidsUit(s, v.kind_ids, true);
                const datums = [...new Set((v.datums ?? []).map((d) => datum(d, "datums", true)))].sort();
                const aanleiding = tekst(v.aanleiding, "aanleiding", 40);
                const moment = v.moment ? { datum: datum(v.moment.datum, "moment.datum"), tijd: tijd(v.moment.tijd, "moment.tijd"), oud: tijd(v.moment.oud, "moment.oud") } : null;
                if (!datums.length && !moment)
                    throw val("datums");
                const naar = aanleiding === "moment" ? null : abs(v.naar ?? "ik", p.id);
                if (naar === "samen" || naar === "open")
                    throw val("naar");
                if (b.counter_of) {
                    const oud = laadZorg(db, b.counter_of);
                    eisAntwoorder(s, oud);
                    if (oud.status !== "pending")
                        throw dicht();
                    Object.assign(oud, { status: "counterproposal", alternative: tekst(v.tekst, "tekst", 1000), responded_by: p.id, responded_at: nu() });
                }
                const verbonden = coVoor(s, kids).length > 0;
                const x = { id: uuid(), created_by: p.id, child_ids: kids, soort, dates: datums, naar, wisseltijd: tijd(v.wisseltijd, "wisseltijd"), plek: tekst(v.plek, "plek", 200), note: tekst(v.tekst, "tekst", 1000, true), aanleiding, datum_label: tekst(v.datum_label, "datum_label", 120), reply_by: datum(v.reactie_datum, "reactie_datum"), moment, reason: tekst(v.reden, "reden", 1000), status: verbonden ? "pending" : "accepted", reminders: [], more_time: null, created_at: nu(), responded_at: verbonden ? null : nu() };
                db.care_proposals.push(x);
                if (!verbonden)
                    pasZorgToe(db, x, p.id);
                audit(db, p.id, "schema", x.id, verbonden ? "CREATED" : "UPDATED", { item_naam: x.note, kinderen: kids, meta: { soort } });
                return ok({ proposal: careUit(x, p.id), applied: !verbonden });
            },
            "respond-care"(db, b, token) {
                const { p, s } = sessie(db, token);
                const x = laadZorg(db, b.proposal_id);
                eisAntwoorder(s, x);
                if (x.status !== "pending")
                    throw dicht();
                const r = antwoord(b.response);
                if (r === "meer-tijd") {
                    x.more_time = { by: p.id, date: vandaag(), ...(b.until ? { until: datum(b.until, "until") } : {}) };
                    return ok({ proposal: careUit(x, p.id) });
                }
                const status = r === "akkoord" ? "accepted" : r === "niet-akkoord" ? "declined" : "counterproposal";
                Object.assign(x, { status, responded_by: p.id, responded_at: nu(), ...(r === "ander-voorstel" ? { alternative: tekst(b.alternative, "alternative", 1000) } : {}) });
                if (status === "accepted")
                    pasZorgToe(db, x, p.id);
                audit(db, p.id, "schema", x.id, status === "accepted" ? "ACCEPTED" : "DECLINED", { item_naam: x.note, kinderen: x.child_ids });
                return ok({ proposal: careUit(x, p.id) });
            },
            "withdraw-care"(db, b, token) {
                const { p } = sessie(db, token);
                const x = laadZorg(db, b.proposal_id);
                if (x.created_by !== p.id)
                    throw new Fout(403, "FORBIDDEN", "not proposer");
                if (x.status !== "pending")
                    throw dicht();
                Object.assign(x, { status: "withdrawn", responded_at: nu() });
                audit(db, p.id, "schema", x.id, "CANCELLED", { item_naam: x.note, kinderen: x.child_ids });
                return ok({ proposal: careUit(x, p.id) });
            },
            "remind-care"(db, b, token) {
                const { p } = sessie(db, token);
                const x = laadZorg(db, b.proposal_id);
                if (x.created_by !== p.id)
                    throw new Fout(403, "FORBIDDEN", "not proposer");
                if (x.status !== "pending")
                    throw dicht();
                const d = vandaag(), l = x.reminders ?? [];
                const mag = !x.reply_by ? l.length === 0 : d <= x.reply_by ? !l.some((y) => y <= x.reply_by) : !l.some((y) => y > x.reply_by);
                if (!mag)
                    throw new Fout(429, "RATE_LIMITED", "reminder limit");
                x.reminders = [...l, d];
                audit(db, p.id, "schema", x.id, "UPDATED", { item_naam: x.note, kinderen: x.child_ids, wijziging: { veld: "herinnering", oud: "", nieuw: d } });
                return ok({ proposal: careUit(x, p.id) });
            },
            "set-attendance"(db, b, token) {
                const { p, s } = sessie(db, token);
                const e = laadEv(db, s, b.event_id);
                if (e.is_shared === false)
                    throw val("private");
                if (!["samen", "een", "afzonderlijk", "later"].includes(b.keuze))
                    throw val("keuze");
                const wie = absHoud(b.wie_gaat, p.id), contact = absHoud(b.contact_wie, p.id);
                const fase = b.keuze === "later" || (b.keuze === "afzonderlijk" && (!contact || contact === "nog")) ? "open" : b.keuze === "afzonderlijk" && contact === `is:${p.id}` ? "afgestemd" : coVoor(s, e.child_ids).length ? "voorstel" : "afgestemd";
                const oud = db.attendance.find((a) => a.event_id === e.id);
                const rij = { id: oud?.id ?? uuid(), event_id: e.id, created_by: oud?.created_by ?? p.id, proposed_by: p.id, keuze: b.keuze, fase, wie_gaat: wie, contact_wie: contact, uitkomst: oud?.uitkomst ?? null, uitkomst_toelichting: oud?.uitkomst_toelichting ?? null, nabespreking: oud?.nabespreking ?? null, history: [{ datum: vandaag(), soort: "voorstel", door: `is:${p.id}`, keuze: b.keuze, wie_gaat: wie, contact_wie: contact, vervangt: !!oud }, ...(oud?.history ?? [])], updated_at: nu() };
                db.attendance = [rij, ...db.attendance.filter((a) => a.event_id !== e.id)];
                return ok({ attendance: aanUit(rij, p.id) });
            },
            "respond-attendance"(db, b, token) {
                const { p, s } = sessie(db, token);
                const e = laadEv(db, s, b.event_id);
                const a = db.attendance.find((x) => x.event_id === e.id);
                if (!a || a.fase !== "voorstel")
                    throw dicht();
                if (a.proposed_by === p.id)
                    throw new Fout(403, "FORBIDDEN", "own proposal");
                if (!["akkoord", "dat-lukt", "liever-niet-samen", "dat-lukt-niet"].includes(b.reactie))
                    throw val("reactie");
                const goed = b.reactie === "akkoord" || b.reactie === "dat-lukt";
                const soort = goed ? "afgestemd" : b.reactie === "liever-niet-samen" ? "nietSamen" : "luktNiet";
                Object.assign(a, { fase: goed ? "afgestemd" : "open", history: [{ datum: vandaag(), soort, door: `is:${p.id}`, keuze: a.keuze, wie_gaat: a.wie_gaat }, ...a.history], updated_at: nu() });
                return ok({ attendance: aanUit(a, p.id) });
            },
            "attendance-outcome"(db, b, token) {
                const { p, s } = sessie(db, token);
                const e = laadEv(db, s, b.event_id);
                const a = db.attendance.find((x) => x.event_id === e.id);
                if (!a)
                    throw new Fout(404, "NOT_FOUND", "attendance");
                if (!["mogelijk", "wacht-op-school", "niet-mogelijk", "contact-opgenomen"].includes(b.uitkomst))
                    throw val("uitkomst");
                Object.assign(a, { uitkomst: b.uitkomst, uitkomst_toelichting: tekst(b.toelichting, "toelichting", 1000), fase: b.uitkomst === "mogelijk" ? "afgestemd" : a.fase, history: [{ datum: vandaag(), soort: `uitkomst:${b.uitkomst}`, door: `is:${p.id}` }, ...a.history], updated_at: nu() });
                return ok({ attendance: aanUit(a, p.id) });
            },
            "attendance-debrief"(db, b, token) {
                const { p, s } = sessie(db, token);
                const e = laadEv(db, s, b.event_id);
                const besproken = tekst(b.besproken, "besproken", 2000) ?? "", afspraken = tekst(b.afspraken, "afspraken", 2000) ?? "";
                if (!besproken && !afspraken)
                    throw val("empty");
                let a = db.attendance.find((x) => x.event_id === e.id);
                if (!a) {
                    a = { id: uuid(), event_id: e.id, created_by: p.id, proposed_by: null, keuze: "later", fase: "open", history: [] };
                    db.attendance.push(a);
                }
                Object.assign(a, { nabespreking: { besproken, afspraken, door: `is:${p.id}`, datum: vandaag() }, history: [{ datum: vandaag(), soort: "puntenGedeeld", door: `is:${p.id}` }, ...a.history], updated_at: nu() });
                return ok({ attendance: aanUit(a, p.id) });
            },
            "start-urgent"(db, b, token) {
                const { p, s } = sessie(db, token);
                const kids = kidsUit(s, b.kind_ids);
                const u = { id: uuid(), created_by: p.id, child_ids: kids.length ? kids : [...s.kids], categorie: ["halen", "ziek", "planning", "vergeten", "anders"].includes(b.categorie) ? b.categorie : "anders", titel: tekst(b.titel, "titel", 300, true), toelichting: tekst(b.toelichting, "toelichting", 2000), reactie_gewenst: ["zsm", "15", "30", "60", "eigen"].includes(b.reactie_gewenst) ? b.reactie_gewenst : "zsm", old_time: tijd(b.oude_tijd, "oude_tijd"), new_time: tijd(b.nieuwe_tijd, "nieuwe_tijd"), status: "open", created_at: nu() };
                db.urgent.push(u);
                audit(db, p.id, "besluit", u.id, "CREATED", { item_naam: u.titel, kinderen: u.child_ids });
                return ok({ request: nuUit(u, p.id) });
            },
            "answer-urgent"(db, b, token) {
                const { p, s } = sessie(db, token);
                const u = db.urgent.find((x) => x.id === b.id);
                if (!u || !magZien(s, u))
                    throw new Fout(404, "NOT_FOUND", "request");
                if (u.created_by === p.id)
                    throw new Fout(403, "FORBIDDEN", "own request");
                if (u.status !== "open")
                    throw dicht();
                Object.assign(u, { status: "opgelost", antwoord: tekst(b.antwoord, "antwoord", 1000, true), answered_by: p.id, answered_at: nu() });
                audit(db, p.id, "besluit", u.id, "UPDATED", { item_naam: u.titel, kinderen: u.child_ids });
                return ok({ request: nuUit(u, p.id) });
            },
        },
        "manage-vacations": {
            list(db, b, token) {
                const { p, s } = sessie(db, token);
                return ok({ vacations: db.vacations.filter((r) => magZien(s, { created_by: r.created_by, child_ids: r.child_ids })).sort((a, z) => a.fields.vanDatum.localeCompare(z.fields.vanDatum)).map((r) => vakUit(r, p.id)), connected: s.co.length > 0 });
            },
            propose(db, b, token) {
                const { p, s } = sessie(db, token);
                const f = vakVelden(s, b.fields);
                const verbonden = coVoor(s, f.kinderen).length > 0;
                const r = { id: uuid(), created_by: p.id, child_ids: f.kinderen, fields: f, confirmed: null, status: verbonden ? "voorstel" : "afgesproken", proposed_by: verbonden ? p.id : null, reply_by: datum(b.fields?.reactieDatum, "reactieDatum"), response: null, more_time: null, history: [{ datum: nu(), door: p.id, actie: verbonden ? "voorstel" : "afgesproken", velden: f }], created_at: nu(), updated_at: nu() };
                db.vacations.push(r);
                audit(db, p.id, "schema", r.id, "CREATED", { item_naam: f.naam, kinderen: f.kinderen });
                return ok({ vacation: vakUit(r, p.id), applied: !verbonden });
            },
            amend(db, b, token) {
                const { p, s } = sessie(db, token);
                const r = laadVak(db, s, b.id);
                if (r.status === "ingetrokken" || (r.status === "voorstel" && r.proposed_by === p.id))
                    throw dicht();
                const f = vakVelden(s, b.fields);
                const verbonden = coVoor(s, f.kinderen).length > 0;
                const bevestigd = r.confirmed ?? (r.status === "afgesproken" ? r.fields : null);
                Object.assign(r, verbonden ? { fields: f, child_ids: f.kinderen, confirmed: bevestigd, status: "voorstel", proposed_by: p.id, response: null, more_time: null, reply_by: datum(b.fields?.reactieDatum, "reactieDatum"), history: hist(r, p.id, "anderVoorstel") } : { fields: f, child_ids: f.kinderen, confirmed: null, status: "afgesproken", proposed_by: null, response: null, history: hist(r, p.id, "afgesproken") }, { updated_at: nu() });
                audit(db, p.id, "schema", r.id, verbonden ? "CREATED" : "UPDATED", { item_naam: f.naam, kinderen: f.kinderen });
                return ok({ vacation: vakUit(r, p.id) });
            },
            "set-split"(db, b, token) {
                const { p, s } = sessie(db, token);
                const r = laadVak(db, s, b.id);
                if (r.status !== "open")
                    throw dicht();
                const verbonden = coVoor(s, r.child_ids).length > 0;
                r.fields = { ...r.fields, ouder: abs(b.ouder, p.id) };
                Object.assign(r, { status: verbonden ? "voorstel" : "afgesproken", proposed_by: verbonden ? p.id : null, history: hist(r, p.id, verbonden ? "voorstel" : "afgesproken"), updated_at: nu() });
                return ok({ vacation: vakUit(r, p.id) });
            },
            respond(db, b, token) {
                const { p, s } = sessie(db, token);
                const r = laadVak(db, s, b.id);
                if (r.status !== "voorstel" || !r.proposed_by)
                    throw dicht();
                eisAntwoorder(s, { created_by: r.proposed_by, child_ids: r.child_ids });
                if (b.response === "meer-tijd") {
                    r.more_time = { by: p.id, date: vandaag() };
                    return ok({ vacation: vakUit(r, p.id) });
                }
                if (b.response === "akkoord") {
                    Object.assign(r, { status: "afgesproken", confirmed: null, response: null, more_time: null, history: hist(r, p.id, r.fields.annuleren ? "annuleringAfgesproken" : "afgesproken"), updated_at: nu() });
                    audit(db, p.id, "schema", r.id, "ACCEPTED", { item_naam: r.fields.naam, kinderen: r.child_ids });
                    return ok({ vacation: vakUit(r, p.id) });
                }
                if (b.response !== "niet-akkoord")
                    throw val("response");
                const terug = r.confirmed;
                Object.assign(r, { ...(terug ? { fields: terug, child_ids: terug.kinderen } : {}), status: terug ? "afgesproken" : "open", proposed_by: null, confirmed: null, response: "niet-akkoord", more_time: null, history: hist(r, p.id, "nietAkkoord"), updated_at: nu() });
                audit(db, p.id, "schema", r.id, "DECLINED", { item_naam: r.fields.naam, kinderen: r.child_ids });
                return ok({ vacation: vakUit(r, p.id) });
            },
            withdraw(db, b, token) {
                const { p, s } = sessie(db, token);
                const r = laadVak(db, s, b.id);
                if (r.status !== "voorstel" || r.proposed_by !== p.id)
                    throw new Fout(403, "FORBIDDEN", "not proposer");
                Object.assign(r, { status: "ingetrokken", history: hist(r, p.id, "ingetrokken"), updated_at: nu() });
                audit(db, p.id, "schema", r.id, "CANCELLED", { item_naam: r.fields.naam, kinderen: r.child_ids });
                return ok({ vacation: vakUit(r, p.id) });
            },
        },
        "manage-handover": {
            list(db, b, token) {
                const { p, s } = sessie(db, token);
                const nuIso = nu();
                const items = db.handover_items.filter((r) => magZien(s, eigenItem(r)) && (!r.deleted_at || r.deleted_at > nuIso));
                const getypt = [...new Set(items.filter((r) => r.source === "toegevoegd" || r.source === "verzoek").map((r) => r.item_name))].filter((n) => !OPTIES.includes(n));
                return ok({
                    items: items.filter((r) => !r.removed).map((r) => itemUit(r, p.id)),
                    routines: db.routines.filter((r) => magZien(s, { created_by: r.user_id, child_ids: [r.child_id] })).map((r) => routineUit(r, p.id)),
                    logs: db.handover_logs.filter((r) => magZien(s, eigenItem(r))).sort((a, z) => z.updated_at.localeCompare(a.updated_at)).map((r) => logUit(r, p.id)),
                    options: [...OPTIES, ...getypt.slice(0, 50)],
                });
            },
            "add-items"(db, b, token) {
                const { p, s } = sessie(db, token);
                const m = datum(b.moment_id, "moment_id", true);
                const kids = kidsUit(s, b.kind_ids, true);
                if (!Array.isArray(b.namen) || !b.namen.length || b.namen.length > 20)
                    throw val("namen");
                const bron = ["vast", "afspraak", "verzoek", "toegevoegd", "niet_meegekomen"].includes(b.bron) ? b.bron : "toegevoegd";
                const rijen = b.namen.map((n) => ({ id: uuid(), user_id: p.id, child_ids: kids, moment_id: m, item_name: tekst(n, "naam", 100, true), source: bron, source_ref: tekst(b.bron_ref, "bron_ref", 200), is_packed: false, received: null, removed: false, deleted_at: verloop(m), created_at: nu() }));
                db.handover_items.push(...rijen);
                return ok({ items: rijen.map((r) => itemUit(r, p.id)) });
            },
            "set-packed"(db, b, token) {
                const { p, s } = sessie(db, token);
                const r = laadItem(db, s, b.id);
                Object.assign(r, { is_packed: b.packed === true, packed_by: b.packed === true ? p.id : null, packed_at: b.packed === true ? nu() : null });
                return ok({ item: itemUit(r, p.id) });
            },
            "remove-item"(db, b, token) {
                const { s } = sessie(db, token);
                laadItem(db, s, b.id).removed = true;
                return ok({});
            },
            "confirm-received"(db, b, token) {
                const { p, s } = sessie(db, token);
                const m = datum(b.moment_id, "moment_id", true);
                const volgende = datum(b.next_moment_id, "next_moment_id");
                const mis = [];
                for (const [id, v] of Object.entries(b.received ?? {})) {
                    const r = laadItem(db, s, id);
                    if (r.moment_id !== m)
                        throw val("moment");
                    r.received = v === true;
                    if (v !== true)
                        mis.push(r);
                }
                const mee = volgende ? mis.map((r) => ({ id: uuid(), user_id: p.id, child_ids: r.child_ids, moment_id: volgende, item_name: r.item_name, source: "niet_meegekomen", source_ref: m, is_packed: false, received: null, removed: false, deleted_at: verloop(volgende), created_at: nu() })) : [];
                db.handover_items.push(...mee);
                return ok({ carried: mee.map((r) => itemUit(r, p.id)) });
            },
            "add-routine"(db, b, token) {
                const { p, s } = sessie(db, token);
                const [kind] = kidsUit(s, [b.kind], true);
                const r = { id: uuid(), user_id: p.id, child_id: kind, day_of_week: ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag", "elke"].includes(b.dag) ? b.dag : "elke", item_name: tekst(b.item, "item", 100, true), reason: tekst(b.reden, "reden", 300), created_at: nu() };
                db.routines.push(r);
                return ok({ routine: routineUit(r, p.id) });
            },
            "remove-routine"(db, b, token) {
                const { s } = sessie(db, token);
                const r = db.routines.find((x) => x.id === b.id);
                if (!r || !magZien(s, { created_by: r.user_id, child_ids: [r.child_id] }))
                    throw new Fout(404, "NOT_FOUND", "routine");
                db.routines = db.routines.filter((x) => x.id !== r.id);
                return ok({});
            },
            "share-log"(db, b, token) {
                const { p, s } = sessie(db, token);
                const m = datum(b.moment_id, "moment_id", true);
                const kids = kidsUit(s, b.kind_ids, true);
                if (!b.inhoud || typeof b.inhoud !== "object")
                    throw val("inhoud");
                let r = db.handover_logs.find((x) => x.user_id === p.id && x.moment_id === m);
                if (!r) {
                    r = { id: uuid(), user_id: p.id, moment_id: m, created_at: nu() };
                    db.handover_logs.push(r);
                }
                Object.assign(r, { child_ids: kids, content: b.inhoud, to_parent: `not:${p.id}`, updated_at: nu() });
                return ok({ log: logUit(r, p.id) });
            },
            "unshare-log"(db, b, token) {
                const { p } = sessie(db, token);
                const m = datum(b.moment_id, "moment_id", true);
                db.handover_logs = db.handover_logs.filter((x) => !(x.user_id === p.id && x.moment_id === m));
                return ok({});
            },
        },
    };
}
