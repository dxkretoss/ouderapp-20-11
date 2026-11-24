/**
 * ALLEEN VOOR LOKAAL TESTEN (VITE_API_MOCK=1): domein 1 (gezin) — manage-caregivers en de uitbreidingen
 * van manage-children (profielsectie "noodkaart", gezag met detail + bevestigen). Zelfde velden, statussen
 * en foutcodes als supabase/functions/manage-caregivers en manage-children.
 */
const SECTIES = { wissel: ["bekijken"], momentjes: ["bekijken", "bijdragen"], taken: ["bekijken", "bijdragen"], spullen: ["bekijken", "bijdragen"], agenda: ["bekijken", "bijdragen"], nood: ["bekijken"], documenten: ["bekijken"] };
const PROFIEL_SECTIES = ["basis", "personen", "school", "gezondheid", "praktisch", "noodkaart"];
const TEKSTVELDEN = ["last_name", "description", "school", "daycare", "doctor", "medical_notes", "allergies", "dietary_notes", "clothes_size", "shoe_size"];
const NOOD = ["geboortedatum", "contacten", "huisarts", "allergieen", "medicatie", "extra"];
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const vandaag = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export function maak(hulp) {
    const { Fout, ok, uuid, nu, gebruikerVoor, toegang, kindUit, kindIdsVoor, koppelingen } = hulp;
    const status = (r) => (r.revoked_at || r.status === "revoked" ? "revoked" : r.status);
    const inPeriode = (r, d = vandaag()) => status(r) !== "revoked" && !(r.valid_from && d < r.valid_from) && !(r.valid_to && d > r.valid_to);
    const live = (r) => r.status === "active" && !!r.connected_user_id && inPeriode(r);
    const tekst = (v, veld, max, verplicht) => {
        if (v === undefined)
            return undefined;
        if (v === null || v === "") {
            if (verplicht)
                throw new Fout(400, "VALIDATION", `${veld} is required`);
            return null;
        }
        if (typeof v !== "string" || v.trim().length > max)
            throw new Fout(400, "VALIDATION", veld);
        const t = v.trim();
        if (!t && verplicht)
            throw new Fout(400, "VALIDATION", `${veld} is required`);
        return t || null;
    };
    const datum = (v, veld) => { if (v === undefined) return undefined; if (v === null || v === "") return null; if (!DATUM.test(v)) throw new Fout(400, "VALIDATION", veld); return v; };
    const leden = (db) => (db.family_caregivers ??= []);
    const rechten = (db) => (db.caregiver_permissions ??= []);
    const laadLid = (db, id) => { const r = leden(db).find((x) => x.id === id); if (!r) throw new Fout(404, "NOT_FOUND", "member"); return r; };
    const permsVan = (db, id) => { const p = {}; rechten(db).filter((x) => x.caregiver_id === id).forEach((x) => { (p[x.child_id] ??= {})[x.section] = x.permission_level; }); return p; };
    const zichtbareKinderen = (db, r, uid) => { const mijn = new Set(kindIdsVoor(db, uid)); return (r.child_ids ?? []).filter((c) => mijn.has(c)); };
    const eisLid = (db, uid, r) => { const z = zichtbareKinderen(db, r, uid); if (r.created_by !== uid && !z.length) throw new Fout(404, "NOT_FOUND", "member"); return z; };
    const audit = (db, uid, id, action, details) => { (db.audit_events ??= []).push({ id: uuid(), actor_id: uid, entity_type: "caregiver", entity_id: id, action, details, created_at: nu() }); };
    function lidUit(db, uid, r) {
        const kids = zichtbareKinderen(db, r, uid);
        const p = permsVan(db, r.id);
        const st = status(r);
        return { id: r.id, name: r.name, role: r.role, phone: r.phone ?? null, email: r.email ?? null, address: r.address ?? null, photo: r.photo_url ?? null, is_emergency_contact: !!r.is_emergency_contact, status: st, child_ids: kids, permissions: Object.fromEntries(kids.map((k) => [k, p[k] ?? {}])), valid_from: r.valid_from ?? null, valid_to: r.valid_to ?? null, has_account: !!r.connected_user_id, live: live(r), created_by: r.created_by, added_by_me: r.created_by === uid, added_by_name: db.profiles.find((x) => x.id === r.created_by)?.name ?? null, invite_token: st === "invited" ? r.invite_token : null, invited_at: r.invited_at ?? null, accepted_at: r.accepted_at ?? null, created_at: r.created_at };
    }
    function parsePerms(input, kids) {
        if (input === undefined || input === null)
            return {};
        if (!isObject(input))
            throw new Fout(400, "VALIDATION", "permissions");
        const uit = {};
        for (const [kid, secs] of Object.entries(input)) {
            if (!kids.includes(kid))
                continue;
            if (!isObject(secs))
                throw new Fout(400, "VALIDATION", "permissions");
            for (const [s, n] of Object.entries(secs)) {
                if (!SECTIES[s])
                    throw new Fout(400, "VALIDATION", `Unknown section "${s}"`);
                if (n === "geen" || n === "none" || n === null)
                    continue;
                if (!SECTIES[s].includes(n))
                    throw new Fout(400, "VALIDATION", s);
                (uit[kid] ??= {})[s] = n;
            }
        }
        return uit;
    }
    const schrijfPerms = (db, id, kids, perms) => {
        db.caregiver_permissions = rechten(db).filter((x) => !(x.caregiver_id === id && kids.includes(x.child_id)));
        kids.forEach((k) => Object.entries(perms[k] ?? {}).forEach(([section, permission_level]) => db.caregiver_permissions.push({ caregiver_id: id, child_id: k, section, permission_level })));
    };
    const kindIds = (v) => {
        if (!Array.isArray(v) || !v.length || v.length > 20 || v.some((x) => !UUID.test(String(x))))
            throw new Fout(400, "VALIDATION", "child_ids");
        return [...new Set(v.map((x) => String(x).toLowerCase()))];
    };
    function contactVelden(b, deels) {
        const f = {};
        if (!deels || b.name !== undefined)
            f.name = tekst(b.name, "name", 100, true);
        if (!deels || b.role !== undefined)
            f.role = tekst(b.role, "role", 60, true);
        const tel = tekst(b.phone, "phone", 40);
        if (tel !== undefined)
            f.phone = tel;
        if (b.email !== undefined) {
            if (b.email === null || b.email === "")
                f.email = null;
            else if (typeof b.email === "string" && EMAIL.test(b.email.trim()))
                f.email = b.email.trim().toLowerCase();
            else
                throw new Fout(400, "VALIDATION", "email");
        }
        const adres = tekst(b.address, "address", 300);
        if (adres !== undefined)
            f.address = adres;
        if (b.is_emergency_contact !== undefined)
            f.is_emergency_contact = b.is_emergency_contact === true;
        return f;
    }
    function periode(b) {
        const from = datum(b.valid_from, "valid_from"), to = datum(b.valid_to, "valid_to");
        if (from && to && from > to)
            throw new Fout(400, "VALIDATION", "period");
        return { from, to };
    }
    function bouwView(db, r) {
        const perms = permsVan(db, r.id);
        const kidIds = (r.child_ids ?? []).filter((c) => Object.keys(perms[c] ?? {}).length);
        const kids = db.children.filter((c) => kidIds.includes(c.id));
        const ouderIds = new Set(kids.flatMap((k) => [k.created_by, ...koppelingen(db, null, k.id).map((x) => x.parent_id)]));
        const ouders = db.profiles.filter((p) => ouderIds.has(p.id));
        return {
            caregiver: { id: r.id, name: r.name, role: r.role, status: status(r), valid_from: r.valid_from ?? null, valid_to: r.valid_to ?? null },
            permissions: Object.fromEntries(kidIds.map((c) => [c, perms[c]])),
            children: kids.map((k) => {
                const basis = { id: k.id, name: k.name, color_code: k.color_code ?? null, avatar: k.avatar ?? null };
                if (!perms[k.id]?.nood)
                    return basis;
                const profiel = isObject(k.profile) ? k.profile : {};
                const kaart = isObject(profiel.noodkaart) ? profiel.noodkaart : {};
                const velden = (Array.isArray(kaart.velden) ? kaart.velden : []).filter((v) => NOOD.includes(v));
                const g = isObject(profiel.gezondheid) ? profiel.gezondheid : {};
                const e = {};
                if (velden.includes("geboortedatum"))
                    e.date_of_birth = k.date_of_birth ?? null;
                if (velden.includes("huisarts"))
                    e.doctor = k.doctor ?? null;
                if (velden.includes("allergieen"))
                    e.allergies = k.allergies ?? null;
                if (velden.includes("medicatie"))
                    e.medication = typeof g.medicatie === "string" ? g.medicatie : null;
                if (velden.includes("extra"))
                    e.extra = typeof kaart.extra === "string" ? kaart.extra : null;
                if (velden.includes("contacten")) {
                    const eigen = new Set([k.created_by, ...koppelingen(db, null, k.id).map((x) => x.parent_id)]);
                    e.contacts = [
                        ...ouders.filter((p) => eigen.has(p.id)).map((p) => ({ name: p.name, role: "ouder", phone: null })),
                        ...(Array.isArray(profiel.personen) ? profiel.personen : []).filter((x) => x?.nood && typeof x.naam === "string").map((x) => ({ name: x.naam, role: x.rol ?? "", phone: x.telefoon ?? null })),
                        ...leden(db).filter((c) => c.id !== r.id && c.is_emergency_contact && (c.child_ids ?? []).includes(k.id) && status(c) !== "revoked").map((c) => ({ name: c.name, role: c.role, phone: c.phone ?? null })),
                    ];
                }
                return { ...basis, emergency: e };
            }),
            parents: ouders.map((p) => ({ id: p.id, name: p.name })),
        };
    }
    function rijVoorToken(db, token) {
        if (typeof token !== "string" || !UUID.test(token))
            throw new Fout(400, "VALIDATION", "token");
        const r = leden(db).find((x) => x.invite_token === token.toLowerCase());
        if (!r)
            throw new Fout(404, "NOT_FOUND", "invite");
        const st = status(r);
        if (st === "revoked")
            throw new Fout(410, "INVITE_CANCELLED", "withdrawn");
        if (st === "active")
            throw new Fout(409, "INVITE_USED", "used");
        if (st !== "invited")
            throw new Fout(404, "NOT_FOUND", "invite");
        if (r.valid_to && vandaag() > r.valid_to)
            throw new Fout(410, "INVITE_EXPIRED", "period");
        return r;
    }
    const mail = (db, r) => { console.info(`[api-mock] kring-uitnodiging voor ${r.email}: ${location.origin}/uitnodiging?t=${r.invite_token}`); return true; };
    const bewerkbaar = (db, uid, kid) => { try { toegang(db, uid, kid, true); return true; } catch { return false; } };
    const custodyMeta = (c) => c.custody_meta ?? null;
    return {
        "manage-caregivers": {
            list(db, b, token) {
                const p = gebruikerVoor(db, token);
                const mijn = new Set(kindIdsVoor(db, p.id));
                const rijen = leden(db).filter((r) => r.created_by === p.id || (r.child_ids ?? []).some((c) => mijn.has(c))).sort((a, z) => a.created_at.localeCompare(z.created_at));
                return ok({ members: rijen.map((r) => lidUit(db, p.id, r)) });
            },
            create(db, b, token) {
                const p = gebruikerVoor(db, token);
                const kids = kindIds(b.child_ids);
                kids.forEach((k) => toegang(db, p.id, k, true));
                const f = contactVelden(b, false);
                const uitnodigen = b.invite === true;
                if (uitnodigen && !f.phone && !f.email)
                    throw new Fout(400, "VALIDATION", "contact needed");
                const { from, to } = periode(b);
                const perms = uitnodigen ? parsePerms(b.permissions, kids) : {};
                const r = { id: uuid(), ...f, created_by: p.id, updated_by: p.id, child_ids: kids, status: uitnodigen ? "invited" : "contact_only", invited_at: uitnodigen ? nu() : null, valid_from: from ?? null, valid_to: to ?? null, invite_token: uuid(), connected_user_id: null, photo_url: null, created_at: nu() };
                if (b.image_base64)
                    r.photo_url = b.image_base64;
                leden(db).push(r);
                schrijfPerms(db, r.id, kids, perms);
                audit(db, p.id, r.id, uitnodigen ? "INVITED" : "CREATED", { child_ids: kids, role: f.role, permissions: perms });
                const verstuurd = uitnodigen && f.email && b.send_email === true ? mail(db, r) : false;
                return ok({ member: lidUit(db, p.id, r), email_sent: verstuurd });
            },
            update(db, b, token) {
                const p = gebruikerVoor(db, token);
                const r = laadLid(db, b.caregiver_id);
                eisLid(db, p.id, r);
                if (status(r) === "revoked")
                    throw new Fout(400, "VALIDATION", "revoked");
                const patch = contactVelden(b, true);
                let kids = r.child_ids ?? [];
                if (b.child_ids !== undefined) {
                    const nieuw = kindIds(b.child_ids);
                    [...nieuw.filter((c) => !kids.includes(c)), ...kids.filter((c) => !nieuw.includes(c))].forEach((c) => toegang(db, p.id, c, true));
                    const weg = kids.filter((c) => !nieuw.includes(c));
                    db.caregiver_permissions = rechten(db).filter((x) => !(x.caregiver_id === r.id && weg.includes(x.child_id)));
                    kids = nieuw;
                    patch.child_ids = nieuw;
                }
                if (b.valid_from !== undefined || b.valid_to !== undefined) {
                    const { from, to } = periode({ valid_from: b.valid_from ?? r.valid_from ?? null, valid_to: b.valid_to ?? r.valid_to ?? null });
                    patch.valid_from = from ?? null;
                    patch.valid_to = to ?? null;
                }
                const wordtUitnodiging = b.invite === true && status(r) === "contact_only";
                if (wordtUitnodiging) {
                    if (!(patch.phone ?? r.phone) && !(patch.email ?? r.email))
                        throw new Fout(400, "VALIDATION", "contact needed");
                    Object.assign(patch, { status: "invited", invited_at: nu(), invite_token: uuid() });
                }
                if (b.image_base64)
                    patch.photo_url = b.image_base64;
                else if (b.photo === null)
                    patch.photo_url = null;
                Object.assign(r, patch, { updated_by: p.id });
                if (b.permissions !== undefined) {
                    if (status(r) === "contact_only")
                        throw new Fout(400, "VALIDATION", "contact only");
                    const mijn = new Set(kindIdsVoor(db, p.id));
                    const mag = kids.filter((k) => mijn.has(k) && bewerkbaar(db, p.id, k));
                    schrijfPerms(db, r.id, mag, parsePerms(b.permissions, mag));
                }
                audit(db, p.id, r.id, wordtUitnodiging ? "INVITED" : "UPDATED", { fields: Object.keys(patch), child_ids: kids });
                const verstuurd = wordtUitnodiging && b.send_email === true && r.email ? mail(db, r) : false;
                return ok({ member: lidUit(db, p.id, r), email_sent: verstuurd });
            },
            revoke(db, b, token) {
                const p = gebruikerVoor(db, token);
                const r = laadLid(db, b.caregiver_id);
                const z = eisLid(db, p.id, r);
                if (r.created_by !== p.id)
                    z.forEach((k) => toegang(db, p.id, k, true));
                if (status(r) !== "revoked") {
                    Object.assign(r, { status: "revoked", revoked_at: nu(), revoked_by: p.id, invite_token: uuid() });
                    audit(db, p.id, r.id, "REVOKED", { child_ids: r.child_ids });
                }
                return ok({ member: lidUit(db, p.id, r) });
            },
            delete(db, b, token) {
                const p = gebruikerVoor(db, token);
                const r = laadLid(db, b.caregiver_id);
                if (r.created_by !== p.id)
                    throw new Fout(403, "FORBIDDEN", "only creator");
                db.family_caregivers = leden(db).filter((x) => x.id !== r.id);
                db.caregiver_permissions = rechten(db).filter((x) => x.caregiver_id !== r.id);
                audit(db, p.id, r.id, "DELETED", { child_ids: r.child_ids, name: r.name });
                return ok();
            },
            "send-invite-email"(db, b, token) {
                const p = gebruikerVoor(db, token);
                const r = laadLid(db, b.caregiver_id);
                eisLid(db, p.id, r);
                if (status(r) !== "invited" || !r.email)
                    throw new Fout(400, "VALIDATION", "not invited / no email");
                return ok({ email_sent: mail(db, r) });
            },
            "view-as"(db, b, token) {
                const p = gebruikerVoor(db, token);
                const r = laadLid(db, b.caregiver_id);
                eisLid(db, p.id, r);
                if (status(r) === "contact_only" || !inPeriode(r))
                    return ok({ view: null });
                return ok({ view: bouwView(db, r) });
            },
            "get-for-user"(db, b, token) {
                const p = gebruikerVoor(db, token);
                return ok({ views: leden(db).filter((r) => r.connected_user_id === p.id && live(r)).map((r) => bouwView(db, r)) });
            },
            "get-by-token"(db, b) {
                const r = rijVoorToken(db, b.token);
                const van = db.profiles.find((x) => x.id === r.created_by);
                return ok({ invitation: { name: r.name, role: r.role, from_parent: { name: van?.name ?? "" }, children: (r.child_ids ?? []).map((c) => db.children.find((k) => k.id === c)).filter(Boolean).map((k) => ({ id: k.id, name: k.name })), permissions: permsVan(db, r.id), valid_from: r.valid_from ?? null, valid_to: r.valid_to ?? null } });
            },
            accept(db, b, token) {
                const p = gebruikerVoor(db, token);
                const r = rijVoorToken(db, b.token);
                if (r.email && r.email.toLowerCase() !== p.email.toLowerCase())
                    throw new Fout(403, "INVITE_EMAIL_MISMATCH", "email");
                const mijn = new Set(kindIdsVoor(db, p.id));
                if (r.created_by === p.id || (r.child_ids ?? []).some((c) => mijn.has(c)))
                    throw new Fout(400, "INVITE_OWN", "own");
                Object.assign(r, { status: "active", connected_user_id: p.id, accepted_at: nu(), invite_token: uuid() });
                audit(db, p.id, r.id, "ACCEPTED", { child_ids: r.child_ids });
                return ok({ view: bouwView(db, r) });
            },
        },
        "manage-children": {
            update(db, b, token) {
                const p = gebruikerVoor(db, token);
                if (!isObject(b.updates))
                    throw new Fout(400, "VALIDATION", "updates");
                const c = toegang(db, p.id, b.child_id, true);
                const u = b.updates;
                const mag = ["name", "date_of_birth", "color_code", "bsn", "profile", ...TEKSTVELDEN];
                const onbekend = Object.keys(u).filter((k) => !mag.includes(k));
                if (onbekend.length)
                    throw new Fout(400, "VALIDATION", `Fields not allowed: ${onbekend.join(", ")}`);
                const patch = {};
                if (u.name !== undefined)
                    patch.name = tekst(u.name, "name", 100, true);
                for (const k of TEKSTVELDEN)
                    if (u[k] !== undefined)
                        patch[k] = tekst(u[k], k, k === "medical_notes" ? 4000 : 2000);
                if (u.date_of_birth !== undefined)
                    patch.date_of_birth = datum(u.date_of_birth, "date_of_birth");
                if (u.color_code !== undefined) {
                    if (u.color_code && !/^#[0-9a-fA-F]{6}$/.test(u.color_code))
                        throw new Fout(400, "VALIDATION", "color_code");
                    patch.color_code = u.color_code || null;
                }
                if (u.bsn !== undefined)
                    patch.bsn = u.bsn || null;
                if (u.profile !== undefined) {
                    if (!isObject(u.profile))
                        throw new Fout(400, "VALIDATION", "profile");
                    const profiel = { ...(c.profile ?? {}) };
                    for (const [s, w] of Object.entries(u.profile)) {
                        if (!PROFIEL_SECTIES.includes(s))
                            throw new Fout(400, "VALIDATION", `Unknown profile section "${s}"`);
                        if (w === null)
                            delete profiel[s];
                        else if (typeof w === "object")
                            profiel[s] = w;
                        else
                            throw new Fout(400, "VALIDATION", `profile.${s}`);
                    }
                    if (JSON.stringify(profiel).length > 64 * 1024)
                        throw new Fout(400, "VALIDATION", "profile is too large");
                    patch.profile = profiel;
                }
                Object.assign(c, patch);
                return ok({ child: kindUit(db, c, p.id) });
            },
            "save-custody"(db, b, token) {
                const p = gebruikerVoor(db, token);
                if (!["gezamenlijk", "een-ouder", "anders", "onbekend"].includes(b.custody))
                    throw new Fout(400, "VALIDATION", "custody");
                if (b.holder != null && !["me", "other"].includes(b.holder))
                    throw new Fout(400, "VALIDATION", "holder");
                if (b.detail != null && !["voogd", "anders"].includes(b.detail))
                    throw new Fout(400, "VALIDATION", "detail");
                const AFW = ["aangepast", "informatie", "beperkteInfo", "begeleid", "geenOmgang", "communicatie", "anders"];
                if (b.deviations !== undefined && (!Array.isArray(b.deviations) || b.deviations.some((d) => !AFW.includes(d))))
                    throw new Fout(400, "VALIDATION", "deviations");
                const ids = b.child_id && b.child_id !== "all" ? [toegang(db, p.id, b.child_id, true).id] : kindIdsVoor(db, p.id).filter((id) => kindUit(db, db.children.find((c) => c.id === id), p.id).can_edit);
                db.children.filter((c) => ids.includes(c.id)).forEach((c) => {
                    const meta = { ingevuldDoor: p.id, bevestigdDoorAnder: false, updated_at: nu() };
                    if (b.custody === "een-ouder" && b.holder) {
                        const ander = [c.created_by, ...koppelingen(db, null, c.id).map((x) => x.parent_id)].find((id) => id && id !== p.id);
                        meta.houder = b.holder === "me" ? p.id : ander ?? "other";
                    }
                    if (b.custody === "anders" && b.detail)
                        meta.detail = b.detail;
                    const vorig = custodyMeta(c);
                    if (Array.isArray(b.deviations))
                        meta.afwijkingen = [...new Set(b.deviations)];
                    else if (vorig && Array.isArray(vorig.afwijkingen))
                        meta.afwijkingen = vorig.afwijkingen;
                    c.custody = b.custody;
                    c.custody_meta = meta;
                });
                return ok();
            },
            "confirm-custody"(db, b, token) {
                const p = gebruikerVoor(db, token);
                const c = toegang(db, p.id, b.child_id);
                const meta = custodyMeta(c);
                if (!c.custody || !meta)
                    throw new Fout(400, "VALIDATION", "nothing to confirm");
                if (meta.ingevuldDoor === p.id)
                    throw new Fout(403, "FORBIDDEN", "only the other parent");
                c.custody_meta = { ...meta, bevestigdDoorAnder: true, bevestigdDoor: p.id, bevestigdOp: nu() };
                return ok({ child: kindUit(db, c, p.id) });
            },
        },
    };
}
