/**
 * ALLEEN VOOR LOKAAL TESTEN (VITE_API_MOCK=1): een nagebootste Phase-1 backend in de browser.
 * Volgt het contract (custom-auth, manage-profile, manage-children, send-invitation, accept-invitation)
 * met dezelfde antwoorden en foutcodes. Gegevens staan in localStorage["ouderapp-mock-db"]; codes
 * (verificatie/herstel) worden naar de console gelogd en in db.codes bewaard, nooit in een antwoord.
 * Wordt via een dynamische import alleen geladen met VITE_API_MOCK=1, dus nooit in productie.
 */
const DB_SLEUTEL = "ouderapp-mock-db";
const leeg = () => ({ profiles: [], sessions: [], children: [], child_parents: [], invitations: [], connections: [], notes: [], codes: {} });
function laad() {
    try {
        return { ...leeg(), ...JSON.parse(localStorage.getItem(DB_SLEUTEL) || "{}") };
    }
    catch {
        return leeg();
    }
}
function bewaar(db) {
    try {
        localStorage.setItem(DB_SLEUTEL, JSON.stringify(db));
    }
    catch { /* vol */ }
}
const uuid = () => crypto.randomUUID();
const nu = () => new Date().toISOString();
const plusMin = (m) => new Date(Date.now() + m * 60000).toISOString();
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
class Fout extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const ok = (p = {}) => ({ status: 200, data: { success: true, ...p } });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const sterk = (p) => typeof p === "string" && p.length >= 8 && /[A-Z]/.test(p) && /[\d\W_]/.test(p);
function gebruikerUit(db, p) {
    return { id: p.id, email: p.email, name: p.name, avatar: p.avatar ?? null, usage_mode: p.usage_mode, is_verified: p.is_verified, onboarding_completed: p.onboarding_completed, preferences: p.preferences ?? {}, role: p.role };
}
/** Rate limit per e-mail + doel (zoals auth_rate_events): max 5 codes per uur, ook voor onbekende adressen. */
function recenteCodes(db, email, purpose) {
    const uur = Date.now() - 3600000;
    db.rate = db.rate ?? {};
    return (db.rate[`${purpose}:${email}`] ?? []).filter((t) => t > uur);
}
const codeLimiet = (db, email, purpose) => recenteCodes(db, email, purpose).length >= 5;
function telCode(db, email, purpose) {
    db.rate[`${purpose}:${email}`] = [...recenteCodes(db, email, purpose), Date.now()];
}
function eisCodeLimiet(db, email, purpose) {
    if (codeLimiet(db, email, purpose))
        throw new Fout(429, "RATE_LIMITED", "too many codes");
}
function nieuweCode(db, email, purpose) {
    telCode(db, email, purpose);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    db.codes[email] = { code, purpose, expires: plusMin(15), attempts: 0 };
    console.info(`[api-mock] ${purpose === "reset" ? "herstelcode" : "verificatiecode"} voor ${email}: ${code}`);
}
function controleerCode(db, email, code, purpose, verbruik) {
    const c = db.codes[email];
    if (!c || c.purpose !== purpose || !c.code || !/^\d{6}$/.test(String(code ?? "").trim())) {
        if (c?.code && c.purpose === purpose)
            c.attempts += 1;
        throw new Fout(400, "CODE_INVALID", "no code");
    }
    if (c.attempts >= 5)
        throw new Fout(429, "TOO_MANY_ATTEMPTS", "attempts");
    if (new Date(c.expires) < new Date())
        throw new Fout(400, "CODE_EXPIRED", "expired");
    if (String(code).trim() !== c.code) {
        c.attempts += 1;
        if (c.attempts >= 5)
            throw new Fout(429, "TOO_MANY_ATTEMPTS", "attempts");
        throw new Fout(400, "CODE_INVALID", "wrong code");
    }
    if (verbruik)
        db.codes[email] = { ...c, code: null };
}
function sessie(db, userId) {
    const token = hex(32);
    db.sessions.push({ id: uuid(), user_id: userId, token, created_at: nu(), expires_at: plusMin(60 * 24 * 30), revoked_at: null });
    return token;
}
function gebruikerVoor(db, token) {
    const s = token && db.sessions.find((x) => x.token === token && !x.revoked_at && new Date(x.expires_at) > new Date());
    const p = s && db.profiles.find((x) => x.id === s.user_id);
    if (!p || !p.is_verified)
        throw new Fout(401, "UNAUTHORIZED", "no session");
    return p;
}
const koppelingen = (db, uid, kid) => db.child_parents.filter((cp) => cp.child_id === kid && (uid ? cp.parent_id === uid : true));
const kindIdsVoor = (db, uid) => db.children.filter((c) => c.created_by === uid || db.child_parents.some((cp) => cp.child_id === c.id && cp.parent_id === uid)).map((c) => c.id);
function toegang(db, uid, kid, bewerken) {
    const c = db.children.find((x) => x.id === kid);
    if (!c)
        throw new Fout(404, "NOT_FOUND", "child");
    const cp = koppelingen(db, uid, kid)[0];
    if (c.created_by !== uid && !cp)
        throw new Fout(404, "NOT_FOUND", "child");
    if (bewerken && c.created_by !== uid && !cp?.can_edit)
        throw new Fout(403, "FORBIDDEN", "no edit");
    return c;
}
function kindUit(db, c, uid) {
    const { bsn: _bsn, ...rest } = c;
    const cp = koppelingen(db, uid, c.id)[0];
    // Zoals buildChildren: maker + gekoppelde ouders, zonder de vrager zelf.
    const ids = new Set([c.created_by, ...koppelingen(db, null, c.id).map((x) => x.parent_id)]);
    ids.delete(uid);
    const ouders = [...ids].map((id) => db.profiles.find((p) => p.id === id)).filter(Boolean);
    return { ...rest, my_role: cp?.role ?? "parent", can_edit: c.created_by === uid || !!cp?.can_edit, linked_parents: ouders.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar ?? null })) };
}
const maskeer = (e) => { const [n, d] = e.split("@"); return `${n.slice(0, 1)}***@${d}`; };
const verlopen = (i) => OPEN.includes(i.status) && new Date(i.expires_at) <= new Date();
function uitnodigingUit(i) {
    return { id: i.id, to_email: i.to_email, status: verlopen(i) ? "expired" : i.status, child_ids: i.child_ids, created_at: i.created_at, expires_at: i.expires_at, accepted_at: i.accepted_at ?? null };
}
const OPEN = ["sent", "pending", "viewed"];
/** Zoals accept-invitation `assertOpen`. */
function eisOpen(i) {
    if (OPEN.includes(i.status))
        return;
    if (i.status === "expired")
        throw new Fout(410, "INVITE_EXPIRED", "expired");
    if (i.status === "cancelled" || i.status === "revoked")
        throw new Fout(410, "INVITE_CANCELLED", "cancelled");
    if (i.status === "declined" || i.status === "rejected")
        throw new Fout(410, "INVITE_DECLINED", "declined");
    throw new Fout(409, "INVITE_USED", "used");
}
function uitnodigingVoorToken(db, token) {
    if (typeof token !== "string" || token.length < 16 || token.length > 200)
        throw new Fout(400, "VALIDATION", "token");
    const i = db.invitations.find((x) => x.token === token);
    if (!i)
        throw new Fout(404, "NOT_FOUND", "invite");
    if (verlopen(i))
        i.status = "expired";
    return i;
}
/** Kinderen van de uitnodiging waar de afzender (nog) bij kan. */
const uitnodigingKinderen = (db, i) => { const mag = kindIdsVoor(db, i.from_parent_id); return i.child_ids.filter((id) => mag.includes(id)); };
/** Aantal ouders (maker + koppelingen) van een kind, eventueel zonder `zonder`. */
const ouderAantal = (db, kid, zonder) => { const c = db.children.find((x) => x.id === kid); const ids = new Set([c?.created_by, ...koppelingen(db, null, kid).map((x) => x.parent_id)].filter(Boolean)); if (zonder) ids.delete(zonder); return ids.size; };
const AVATAR = /^avatar:[A-Za-z0-9_-]{1,40}$/;
const KLEUR = /^#[0-9a-fA-F]{6}$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const SECTIES = ["basis", "personen", "school", "gezondheid", "praktisch"];
const TEKSTVELDEN = ["last_name", "description", "school", "daycare", "doctor", "medical_notes", "allergies", "dietary_notes", "clothes_size", "shoe_size"];
/** Beeld zoals set-avatar: foto (hier als data-URL; de echte server bewaart het bestand en geeft een ondertekende https-URL terug), "avatar:<n>" of null. */
function beeldUit(b) {
    if (b.image_base64 !== undefined && b.image_base64 !== null) {
        if (typeof b.image_base64 !== "string" || !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(b.image_base64) || b.image_base64.length > 2100000)
            throw new Fout(400, "VALIDATION", "image");
        return b.image_base64;
    }
    if (b.avatar === null || (typeof b.avatar === "string" && AVATAR.test(b.avatar)))
        return b.avatar;
    throw new Fout(400, "VALIDATION", "avatar");
}
/** Zoals targetChildIds: één kind (bewerkrecht nodig) of alle kinderen met bewerkrecht. */
function doelKinderen(db, uid, kid) {
    if (kid !== undefined && kid !== null && kid !== "" && kid !== "all")
        return [toegang(db, uid, kid, true).id];
    return kindIdsVoor(db, uid).filter((id) => kindUit(db, db.children.find((c) => c.id === id), uid).can_edit);
}
const handlers = {
    "custom-auth": {
        register(db, b) {
            const email = String(b.email || "").trim().toLowerCase();
            if (!EMAIL.test(email) || !String(b.name || "").trim())
                throw new Fout(400, "VALIDATION", "email/name");
            if (!sterk(b.password))
                throw new Fout(400, "WEAK_PASSWORD", "policy");
            let p = db.profiles.find((x) => x.email === email);
            if (p?.is_verified)
                throw new Fout(409, "EMAIL_TAKEN", "taken");
            eisCodeLimiet(db, email, "verify");
            if (!p) {
                p = { id: uuid(), email, usage_mode: "together", role: "parent", is_verified: false, onboarding_completed: false, preferences: {}, avatar: null, created_at: nu() };
                db.profiles.push(p);
            }
            Object.assign(p, { name: b.name.trim(), password: b.password });
            nieuweCode(db, email, "verify");
            return ok({ needs_verification: true, email, email_sent: true });
        },
        "verify-email"(db, b) {
            const email = String(b.email || "").trim().toLowerCase();
            const p = db.profiles.find((x) => x.email === email);
            if (!p)
                throw new Fout(400, "CODE_INVALID", "unknown");
            controleerCode(db, email, b.code, "verify", true);
            p.is_verified = true;
            return ok({ session_token: sessie(db, p.id), user: gebruikerUit(db, p) });
        },
        "resend-code"(db, b) {
            const email = String(b.email || "").trim().toLowerCase();
            if (b.purpose !== undefined && b.purpose !== "verify" && b.purpose !== "reset")
                throw new Fout(400, "VALIDATION", "purpose");
            const doel = b.purpose === "reset" ? "reset" : "verify";
            eisCodeLimiet(db, email, doel);
            const p = db.profiles.find((x) => x.email === email);
            if (p && (doel === "reset" || !p.is_verified))
                nieuweCode(db, email, doel);
            else
                telCode(db, email, doel);
            return ok({ sent: true });
        },
        login(db, b) {
            const email = String(b.email || "").trim().toLowerCase();
            const p = db.profiles.find((x) => x.email === email);
            if (!p || p.password !== b.password)
                throw new Fout(401, "INVALID_CREDENTIALS", "credentials");
            if (!p.is_verified) {
                if (!codeLimiet(db, email, "verify"))
                    nieuweCode(db, email, "verify");
                throw new Fout(403, "NOT_VERIFIED", "not verified");
            }
            p.last_login_at = nu();
            return ok({ session_token: sessie(db, p.id), user: gebruikerUit(db, p) });
        },
        "request-password-reset"(db, b) {
            const email = String(b.email || "").trim().toLowerCase();
            if (codeLimiet(db, email, "reset"))
                return ok({ sent: true });
            if (db.profiles.some((x) => x.email === email))
                nieuweCode(db, email, "reset");
            else
                telCode(db, email, "reset");
            return ok({ sent: true });
        },
        "verify-reset-code"(db, b) {
            controleerCode(db, String(b.email || "").trim().toLowerCase(), b.code, "reset", false);
            return ok({ valid: true });
        },
        "reset-password"(db, b) {
            const email = String(b.email || "").trim().toLowerCase();
            if (!sterk(b.password))
                throw new Fout(400, "WEAK_PASSWORD", "policy");
            const p = db.profiles.find((x) => x.email === email);
            if (!p)
                throw new Fout(400, "CODE_INVALID", "unknown");
            controleerCode(db, email, b.code, "reset", true);
            p.password = b.password;
            p.is_verified = true;
            db.sessions.filter((s) => s.user_id === p.id).forEach((s) => { s.revoked_at = nu(); });
            return ok({ session_token: sessie(db, p.id), user: gebruikerUit(db, p) });
        },
        me(db, b, token) {
            return ok({ user: gebruikerUit(db, gebruikerVoor(db, token)) });
        },
        logout(db, b, token) {
            const s = db.sessions.find((x) => x.token === token);
            if (s)
                s.revoked_at = nu();
            return ok();
        },
    },
    "manage-profile": {
        get: (db, b, token) => ok({ user: gebruikerUit(db, gebruikerVoor(db, token)) }),
        update(db, b, token) {
            const p = gebruikerVoor(db, token);
            if (b.name !== undefined) {
                if (!String(b.name).trim())
                    throw new Fout(400, "VALIDATION", "name");
                p.name = String(b.name).trim();
            }
            if (b.usage_mode !== undefined) {
                if (!["together", "solo"].includes(b.usage_mode))
                    throw new Fout(400, "VALIDATION", "usage_mode");
                p.usage_mode = b.usage_mode;
            }
            if (b.onboarding_completed !== undefined) {
                if (typeof b.onboarding_completed !== "boolean")
                    throw new Fout(400, "VALIDATION", "onboarding_completed");
                p.onboarding_completed = b.onboarding_completed;
            }
            if (b.preferences !== undefined) {
                if (!isObject(b.preferences))
                    throw new Fout(400, "VALIDATION", "preferences");
                // ondiep samenvoegen; null verwijdert een sleutel
                const samen = { ...(p.preferences ?? {}), ...b.preferences };
                for (const [k, v] of Object.entries(samen))
                    if (v === null)
                        delete samen[k];
                p.preferences = samen;
            }
            return ok({ user: gebruikerUit(db, p) });
        },
        "set-avatar"(db, b, token) {
            const p = gebruikerVoor(db, token);
            p.avatar = beeldUit(b);
            return ok({ user: gebruikerUit(db, p) });
        },
    },
    "manage-children": {
        list(db, b, token) {
            const p = gebruikerVoor(db, token);
            const ids = kindIdsVoor(db, p.id);
            return ok({ children: db.children.filter((c) => ids.includes(c.id)).map((c) => kindUit(db, c, p.id)) });
        },
        get(db, b, token) {
            const p = gebruikerVoor(db, token);
            const c = toegang(db, p.id, b.child_id);
            return ok({ child: { ...kindUit(db, c, p.id), bsn: c.bsn ?? null } });
        },
        create(db, b, token) {
            const p = gebruikerVoor(db, token);
            if (typeof b.name !== "string" || !b.name.trim())
                throw new Fout(400, "VALIDATION", "name");
            if (b.date_of_birth && !DATUM.test(b.date_of_birth))
                throw new Fout(400, "VALIDATION", "date_of_birth");
            if (b.color_code && !KLEUR.test(b.color_code))
                throw new Fout(400, "VALIDATION", "color_code");
            const c = { id: uuid(), name: b.name.trim(), last_name: null, date_of_birth: b.date_of_birth || null, color_code: b.color_code || "#3C6E71", avatar: null, description: b.description ?? null, school: null, daycare: null, doctor: null, medical_notes: null, allergies: null, dietary_notes: null, clothes_size: null, shoe_size: null, profile: {}, care_schedule: null, custody: null, custody_meta: null, created_by: p.id };
            // Zoals de backend: een nieuw kind neemt regeling en gezag over van een broer/zus.
            const zus = db.children.filter((x) => db.child_parents.some((l) => l.child_id === x.id && l.parent_id === p.id) && (x.care_schedule || x.custody))[0];
            if (zus)
                Object.assign(c, { care_schedule: zus.care_schedule ?? null, custody: zus.custody ?? null, custody_meta: zus.custody ? zus.custody_meta : null });
            db.children.push(c);
            db.child_parents.push({ child_id: c.id, parent_id: p.id, role: "parent", can_edit: true });
            return ok({ child: kindUit(db, c, p.id) });
        },
        update(db, b, token) {
            const p = gebruikerVoor(db, token);
            if (!isObject(b.updates))
                throw new Fout(400, "VALIDATION", "updates");
            const c = toegang(db, p.id, b.child_id, true);
            const u = b.updates;
            const mag = ["name", "date_of_birth", "color_code", "bsn", "profile", ...TEKSTVELDEN];
            const patch = {};
            if (u.name !== undefined) {
                if (typeof u.name !== "string" || !u.name.trim())
                    throw new Fout(400, "VALIDATION", "name");
                patch.name = u.name.trim();
            }
            for (const k of TEKSTVELDEN)
                if (u[k] !== undefined) {
                    if (u[k] !== null && typeof u[k] !== "string")
                        throw new Fout(400, "VALIDATION", k);
                    patch[k] = u[k]?.trim() || null;
                }
            if (u.date_of_birth !== undefined) {
                if (u.date_of_birth && !DATUM.test(u.date_of_birth))
                    throw new Fout(400, "VALIDATION", "date_of_birth");
                patch.date_of_birth = u.date_of_birth || null;
            }
            if (u.color_code !== undefined) {
                if (u.color_code && !KLEUR.test(u.color_code))
                    throw new Fout(400, "VALIDATION", "color_code");
                patch.color_code = u.color_code || null;
            }
            if (u.bsn !== undefined)
                patch.bsn = u.bsn || null;
            if (u.profile !== undefined) {
                if (!isObject(u.profile))
                    throw new Fout(400, "VALIDATION", "profile");
                // per sectie vervangen (niet dieper samengevoegd); null verwijdert de sectie
                const profiel = { ...(c.profile ?? {}) };
                for (const [sectie, waarde] of Object.entries(u.profile)) {
                    if (!SECTIES.includes(sectie))
                        throw new Fout(400, "VALIDATION", `Unknown profile section "${sectie}"`);
                    if (waarde === null)
                        delete profiel[sectie];
                    else if (typeof waarde === "object")
                        profiel[sectie] = waarde;
                    else
                        throw new Fout(400, "VALIDATION", `profile.${sectie}`);
                }
                patch.profile = profiel;
            }
            const onbekend = Object.keys(u).filter((k) => !mag.includes(k));
            if (onbekend.length)
                throw new Fout(400, "VALIDATION", `Fields not allowed: ${onbekend.join(", ")}`);
            Object.assign(c, patch);
            return ok({ child: kindUit(db, c, p.id) });
        },
        "set-avatar"(db, b, token) {
            const p = gebruikerVoor(db, token);
            const c = toegang(db, p.id, b.child_id, true);
            c.avatar = beeldUit(b);
            return ok({ child: kindUit(db, c, p.id) });
        },
        delete(db, b, token) {
            const p = gebruikerVoor(db, token);
            const c = toegang(db, p.id, b.child_id);
            if (c.created_by === p.id) {
                db.children = db.children.filter((x) => x.id !== c.id);
                db.child_parents = db.child_parents.filter((x) => x.child_id !== c.id);
            }
            else {
                db.child_parents = db.child_parents.filter((x) => !(x.child_id === c.id && x.parent_id === p.id));
                db.notes = db.notes.filter((n) => !(n.child_id === c.id && n.parent_id === p.id));
            }
            return ok();
        },
        "save-schedule"(db, b, token) {
            const p = gebruikerVoor(db, token);
            if (!isObject(b.schedule))
                throw new Fout(400, "VALIDATION", "schedule must be an object");
            const ids = doelKinderen(db, p.id, b.child_id);
            db.children.filter((c) => ids.includes(c.id)).forEach((c) => { c.care_schedule = b.schedule; });
            return ok();
        },
        "save-custody"(db, b, token) {
            const p = gebruikerVoor(db, token);
            if (!["gezamenlijk", "een-ouder", "anders", "onbekend"].includes(b.custody))
                throw new Fout(400, "VALIDATION", "custody");
            const ids = doelKinderen(db, p.id, b.child_id);
            // ingevuldDoor = profiel-id (zoals de echte server); de app zoekt de naam erbij.
            db.children.filter((c) => ids.includes(c.id)).forEach((c) => { c.custody = b.custody; c.custody_meta = { ingevuldDoor: p.id, bevestigdDoorAnder: false, updated_at: nu() }; });
            return ok();
        },
        "get-private-note"(db, b, token) {
            const p = gebruikerVoor(db, token);
            toegang(db, p.id, b.child_id);
            return ok({ note: db.notes.find((n) => n.child_id === b.child_id && n.parent_id === p.id)?.note ?? "" });
        },
        "save-private-note"(db, b, token) {
            const p = gebruikerVoor(db, token);
            toegang(db, p.id, b.child_id);
            if (typeof b.note !== "string")
                throw new Fout(400, "VALIDATION", "note");
            db.notes = [...db.notes.filter((n) => !(n.child_id === b.child_id && n.parent_id === p.id)), { child_id: b.child_id, parent_id: p.id, note: String(b.note ?? "") }];
            return ok();
        },
    },
    "send-invitation": {
        send(db, b, token) {
            const p = gebruikerVoor(db, token);
            const email = String(b.to_email || "").trim().toLowerCase();
            const ids = Array.isArray(b.child_ids) ? b.child_ids : [];
            if (!EMAIL.test(email) || !ids.length)
                throw new Fout(400, "VALIDATION", "email/children");
            if (email === p.email)
                throw new Fout(400, "INVITE_OWN", "own email");
            const ander = db.profiles.find((x) => x.email === email);
            for (const kid of ids) {
                toegang(db, p.id, kid, true);
                if (ouderAantal(db, kid, ander?.id) >= 2)
                    throw new Fout(409, "CHILD_LIMIT", "two parents");
            }
            let i = db.invitations.find((x) => x.from_parent_id === p.id && x.to_email === email && OPEN.includes(x.status));
            if (i)
                Object.assign(i, { child_ids: ids, expires_at: plusMin(60 * 24 * 14) });
            else {
                i = { id: uuid(), from_parent_id: p.id, to_email: email, status: "sent", child_ids: ids, token: hex(32), created_at: nu(), expires_at: plusMin(60 * 24 * 14), accepted_at: null };
                db.invitations.push(i);
            }
            const link = `${b.redirect_origin || location.origin}/uitnodiging?token=${i.token}`;
            console.info(`[api-mock] uitnodiging voor ${email}: ${link}`);
            return ok({ invitation: uitnodigingUit(i), invite_link: link, email_sent: true });
        },
    },
    "accept-invitation": {
        inspect(db, b) {
            const i = uitnodigingVoorToken(db, b.token);
            if (i.status === "sent" || i.status === "pending")
                i.status = "viewed";
            const van = db.profiles.find((x) => x.id === i.from_parent_id);
            const kids = uitnodigingKinderen(db, i);
            return ok({ invitation: { status: i.status, expires_at: i.expires_at, to_email_masked: maskeer(i.to_email), from_parent: { name: van?.name ?? "", avatar: van?.avatar ?? null }, children: db.children.filter((c) => kids.includes(c.id)).map((c) => ({ id: c.id, name: c.name, color_code: c.color_code, avatar: c.avatar ?? null })) } });
        },
        accept(db, b, token) {
            const p = gebruikerVoor(db, token);
            const i = uitnodigingVoorToken(db, b.token);
            eisOpen(i);
            if (i.from_parent_id === p.id)
                throw new Fout(400, "INVITE_OWN", "own");
            if (i.to_email !== p.email)
                throw new Fout(403, "INVITE_EMAIL_MISMATCH", "email");
            const kids = uitnodigingKinderen(db, i);
            for (const kid of kids)
                if (ouderAantal(db, kid, p.id) >= 2)
                    throw new Fout(409, "CHILD_LIMIT", "two parents");
            for (const kid of kids)
                if (!koppelingen(db, p.id, kid).length)
                    db.child_parents.push({ child_id: kid, parent_id: p.id, role: "parent", can_edit: true });
            let c = db.connections.find((x) => [x.parent_1_id, x.parent_2_id].sort().join() === [p.id, i.from_parent_id].sort().join());
            if (c)
                Object.assign(c, { status: "active", connected_at: nu() });
            else {
                c = { id: uuid(), parent_1_id: i.from_parent_id, parent_2_id: p.id, status: "active", connected_at: nu() };
                db.connections.push(c);
            }
            Object.assign(i, { status: "accepted", accepted_at: nu(), to_parent_id: p.id });
            const van = db.profiles.find((x) => x.id === i.from_parent_id);
            p.usage_mode = "together";
            if (van)
                van.usage_mode = "together";
            return ok({ connection: { id: c.id, status: c.status, connected_at: c.connected_at }, co_parent: { id: van.id, name: van.name, avatar: van.avatar ?? null }, children: db.children.filter((x) => kids.includes(x.id)).map((x) => kindUit(db, x, p.id)) });
        },
        decline(db, b) {
            const i = uitnodigingVoorToken(db, b.token);
            if (i.status === "declined" || i.status === "rejected")
                return ok();
            eisOpen(i);
            i.status = "declined";
            return ok();
        },
        "list-sent"(db, b, token) {
            const p = gebruikerVoor(db, token);
            return ok({ invitations: db.invitations.filter((x) => x.from_parent_id === p.id).sort((a, z) => z.created_at.localeCompare(a.created_at)).map(uitnodigingUit) });
        },
        cancel(db, b, token) {
            const p = gebruikerVoor(db, token);
            const i = db.invitations.find((x) => x.id === b.invitation_id);
            if (!i || i.from_parent_id !== p.id)
                throw new Fout(404, "NOT_FOUND", "invite");
            if (i.status === "revoked" || i.status === "cancelled")
                return ok();
            if (i.status === "accepted")
                throw new Fout(409, "INVITE_USED", "accepted");
            i.status = "revoked";
            return ok();
        },
        "list-connected"(db, b, token) {
            const p = gebruikerVoor(db, token);
            const mijn = kindIdsVoor(db, p.id);
            const lijst = db.connections.filter((c) => c.status === "active" && (c.parent_1_id === p.id || c.parent_2_id === p.id)).map((c) => {
                const ander = db.profiles.find((x) => x.id === (c.parent_1_id === p.id ? c.parent_2_id : c.parent_1_id));
                return ander ? { id: ander.id, name: ander.name, avatar: ander.avatar ?? null, connected_at: c.connected_at, child_ids: mijn.filter((k) => kindIdsVoor(db, ander.id).includes(k)) } : null;
            }).filter(Boolean);
            return ok({ co_parents: lijst });
        },
        disconnect(db, b, token) {
            const p = gebruikerVoor(db, token);
            const c = db.connections.find((x) => x.status === "active" && [x.parent_1_id, x.parent_2_id].includes(p.id) && [x.parent_1_id, x.parent_2_id].includes(b.co_parent_id));
            if (!c)
                throw new Fout(404, "NOT_FOUND", "connection");
            c.status = "disconnected";
            db.invitations.filter((x) => x.status === "accepted" && [x.from_parent_id, x.to_parent_id].includes(p.id) && [x.from_parent_id, x.to_parent_id].includes(b.co_parent_id)).forEach((x) => { x.status = "disconnected"; });
            db.child_parents = db.child_parents.filter((cp) => {
                const kind = db.children.find((k) => k.id === cp.child_id);
                return !((kind?.created_by === p.id && cp.parent_id === b.co_parent_id) || (kind?.created_by === b.co_parent_id && cp.parent_id === p.id));
            });
            for (const uid of [p.id, b.co_parent_id]) {
                const prof = db.profiles.find((x) => x.id === uid);
                if (prof && prof.usage_mode !== "caregiver" && !db.connections.some((x) => x.status === "active" && [x.parent_1_id, x.parent_2_id].includes(uid)))
                    prof.usage_mode = "solo";
            }
            return ok();
        },
    },
};
/**
 * Uitbreidingen per domein (Phase 2): elk bestand in ./mock/ exporteert `maak(hulp)` en geeft
 * `{ "<functie>": { "<actie>": (db, body, token) => antwoord } }` terug. Ze krijgen de hulpfuncties
 * mee (geen import terug naar dit bestand → geen kringverwijzing). Hun tabellen staan in dezelfde db.
 */
const hulp = { Fout, ok, uuid, nu, gebruikerVoor, toegang, kindUit, kindIdsVoor, koppelingen };
for (const mod of Object.values(import.meta.glob("./mock/*.js", { eager: true }))) {
    const extra = typeof mod.maak === "function" ? mod.maak(hulp) : {};
    for (const [functie, acties] of Object.entries(extra))
        handlers[functie] = { ...(handlers[functie] ?? {}), ...acties };
}
/** Zelfde vorm als een echte aanroep: { status, data }. */
export async function roepAan(functie, body, token) {
    await new Promise((r) => setTimeout(r, 120));
    const db = laad();
    const actie = body?.action || (functie === "send-invitation" ? "send" : "");
    const h = handlers[functie]?.[actie];
    try {
        if (!h)
            throw new Fout(400, "VALIDATION", `unknown ${functie}/${actie}`);
        const res = await h(db, body ?? {}, token);
        bewaar(db);
        return JSON.parse(JSON.stringify(res));
    }
    catch (e) {
        bewaar(db);
        if (e instanceof Fout)
            return { status: e.status, data: { success: false, code: e.code, message: e.message } };
        console.error("[api-mock]", e);
        return { status: 500, data: { success: false, code: "SERVER", message: String(e?.message ?? e) } };
    }
}
