import { useSyncExternalStore } from "react";
import { api, bijOnbevoegd, leesToken, zetToken } from "@/lib/api";
/**
 * Account en sessie (custom auth via edge function `custom-auth`).
 * - token: localStorage["onzeapp-sessie-token"] (alleen het token; nooit wachtwoord of code)
 * - status: "laden" (token wordt gecontroleerd) | "uit" | "onboarding" (wel sessie, welkomstappen nog niet af) | "aan"
 * - gebruiker: { id, email, name, avatar, usage_mode, is_verified, onboarding_completed, needs_password_reset, preferences, role }
 * Gezinsgegevens staan in start-store; die hydrateert zodra de status "onboarding" of "aan" wordt.
 */
const GEBRUIKER_SLEUTEL = "onzeapp-gebruiker";
/** Uitnodigingstoken dat tijdens registreren/inloggen bewaard blijft (alleen deze browsersessie). */
export const UITNODIGING_SLEUTEL = "onzeapp-uitnodiging-token";
let state = { status: "laden", gebruiker: null };
let gestart = false;
const luisteraars = new Set();
function zet(p) {
    state = { ...state, ...p };
    luisteraars.forEach((l) => l());
}
const statusVan = (g) => (g?.onboarding_completed ? "aan" : "onboarding");
function bewaarGebruiker(g) {
    // Alleen voor snel en offline opstarten; de server blijft de bron (me bij elke start).
    try {
        if (g)
            localStorage.setItem(GEBRUIKER_SLEUTEL, JSON.stringify({ id: g.id, email: g.email, name: g.name, avatar: g.avatar?.startsWith("avatar:") ? g.avatar : null, usage_mode: g.usage_mode, onboarding_completed: g.onboarding_completed, needs_password_reset: g.needs_password_reset === true, preferences: g.preferences ?? {} }));
        else
            localStorage.removeItem(GEBRUIKER_SLEUTEL);
    }
    catch { /* geen opslag */ }
}
function bewaardeGebruiker() {
    try {
        return JSON.parse(localStorage.getItem(GEBRUIKER_SLEUTEL) || "null");
    }
    catch {
        return null;
    }
}
function zetGebruiker(g) {
    bewaarGebruiker(g);
    zet({ gebruiker: g, status: statusVan(g) });
}
function zetSessie(token, g) {
    zetToken(token);
    zetGebruiker(g);
}
function wisSessie() {
    zetToken(null);
    bewaarGebruiker(null);
    zet({ status: "uit", gebruiker: null });
}
function start() {
    if (gestart || typeof window === "undefined")
        return;
    gestart = true;
    bijOnbevoegd(wisSessie);
    if (!leesToken()) {
        state = { status: "uit", gebruiker: null };
        return;
    }
    auth.refreshMe();
}
export function authState() {
    start();
    return state;
}
export function useAuth() {
    return useSyncExternalStore((l) => { start(); luisteraars.add(l); return () => luisteraars.delete(l); }, () => { start(); return state; }, () => state);
}
/** Luister buiten React (start-store hydrateert hiermee). */
export function opAuth(f) {
    luisteraars.add(f);
    return () => luisteraars.delete(f);
}
/** Ruimt alle gezinsgegevens op dit apparaat op (bij afmelden); taal, weergave en de lokale mock blijven. */
export function wisGezinsCache() {
    try {
        const blijft = new Set(["onzeapp-taal", "onzeapp-voorkeuren"]);
        const weg = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && ((k.startsWith("onzeapp-") && !blijft.has(k)) || /-v1$/.test(k)))
                weg.push(k);
        }
        weg.forEach((k) => localStorage.removeItem(k));
        const sessieWeg = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k?.startsWith("onzeapp-"))
                sessieWeg.push(k);
        }
        sessieWeg.forEach((k) => sessionStorage.removeItem(k));
    }
    catch { /* geen opslag */ }
}
/**
 * Wachtwoord dat bij registreren (of inloggen op een nog niet bevestigd account) is getypt.
 * Alleen in het geheugen, nooit opgeslagen: verify-email zet precies dit wachtwoord, zodat wie
 * de mailbox bewijst ook het wachtwoord kiest.
 */
let wachtwoordInAfwachting = null;
export const auth = {
    register: async (email, password, name) => {
        const r = await api("custom-auth", "register", { email: email.trim().toLowerCase(), password, name: name.trim() });
        wachtwoordInAfwachting = { email: email.trim().toLowerCase(), password };
        return r;
    },
    verifyEmail: async (email, code) => {
        const e = email.trim().toLowerCase();
        const password = wachtwoordInAfwachting?.email === e ? wachtwoordInAfwachting.password : undefined;
        const r = await api("custom-auth", "verify-email", { email: e, code, password });
        wachtwoordInAfwachting = null;
        // Zonder wachtwoord (bv. bevestigd in een andere browser) is het oude wachtwoord onbruikbaar gemaakt:
        // de gebruiker moet nu eerst een wachtwoord kiezen (setPassword).
        const g = { ...r.user, needs_password_reset: r.needs_password_reset === true || r.user?.needs_password_reset === true };
        zetSessie(r.session_token, g);
        return g;
    },
    /** Eenmalig wachtwoord kiezen na verify-email met needs_password_reset (sessie vereist). */
    setPassword: async (password) => {
        await api("custom-auth", "set-password", { password });
        const g = { ...state.gebruiker, needs_password_reset: false };
        zetGebruiker(g);
        return g;
    },
    resendCode: (email, purpose = "verify") => api("custom-auth", "resend-code", { email: email.trim().toLowerCase(), purpose }),
    login: async (email, password) => {
        let r;
        try {
            r = await api("custom-auth", "login", { email: email.trim().toLowerCase(), password });
        }
        catch (e) {
            if (e?.code === "NOT_VERIFIED")
                wachtwoordInAfwachting = { email: email.trim().toLowerCase(), password };
            throw e;
        }
        zetSessie(r.session_token, r.user);
        return r.user;
    },
    requestReset: (email) => api("custom-auth", "request-password-reset", { email: email.trim().toLowerCase() }),
    verifyResetCode: (email, code) => api("custom-auth", "verify-reset-code", { email: email.trim().toLowerCase(), code }),
    resetPassword: async (email, code, password) => {
        const r = await api("custom-auth", "reset-password", { email: email.trim().toLowerCase(), code, password });
        zetSessie(r.session_token, r.user);
        return r.user;
    },
    /** Server-sessie intrekken en alles op dit apparaat opruimen. Lukt de server niet, dan toch lokaal afmelden. */
    logout: async () => {
        try {
            if (leesToken())
                await api("custom-auth", "logout");
        }
        catch { /* sessie verloopt vanzelf */ }
        wisSessie();
        wisGezinsCache();
    },
    /** Sessie herstellen (bij opstarten en "Doorgaan als …"). */
    refreshMe: async () => {
        if (!leesToken()) {
            wisSessie();
            return null;
        }
        if (!state.gebruiker && state.status !== "laden")
            zet({ status: "laden" });
        try {
            const r = await api("custom-auth", "me");
            zetGebruiker(r.user);
            return r.user;
        }
        catch (e) {
            if (e?.code === "UNAUTHORIZED") {
                wisSessie();
                return null;
            }
            // Geen verbinding: verder met de laatst bekende gegevens, als die er zijn.
            const g = bewaardeGebruiker();
            if (g)
                zet({ gebruiker: g, status: statusVan(g) });
            else
                zet({ status: "uit" });
            return g;
        }
    },
    updateProfile: async (velden) => {
        const r = await api("manage-profile", "update", velden);
        zetGebruiker(r.user);
        return r.user;
    },
    /** beeld: "avatar:n" | data-URL (eigen foto) | null/undefined (verwijderen). */
    setAvatar: async (beeld) => {
        // De server geeft een opgeslagen foto terug als tijdelijke https-URL: ongewijzigd laten.
        if (typeof beeld === "string" && /^https?:\/\//i.test(beeld))
            return state.gebruiker;
        const r = await api("manage-profile", "set-avatar", beeld?.startsWith("data:") ? { image_base64: beeld } : { avatar: beeld || null });
        zetGebruiker(r.user);
        return r.user;
    },
};
/** Uitnodigingstoken bewaren tijdens registreren/verifiëren/inloggen (sessionStorage, deze tab). */
export function bewaarUitnodiging(token) {
    try {
        sessionStorage.setItem(UITNODIGING_SLEUTEL, token);
    }
    catch { /* geen opslag */ }
}
export function leesUitnodiging() {
    try {
        return sessionStorage.getItem(UITNODIGING_SLEUTEL);
    }
    catch {
        return null;
    }
}
/**
 * Het e-mailadres waar de bewaarde uitnodiging naartoe is gestuurd (andere ouder of kring), of null.
 * Registreren vult dit vast in: de uitnodiging hoort bij dat adres (anders lukt accepteren niet).
 */
export async function uitnodigingEmail() {
    const token = leesUitnodiging();
    if (!token)
        return null;
    try {
        const kring = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
        const r = kring
            ? await api("manage-caregivers", "get-by-token", { token }, { stil: true })
            : await api("accept-invitation", "inspect", { token }, { stil: true });
        const adres = kring ? r?.invitation?.email : r?.invitation?.to_email;
        return typeof adres === "string" && adres.includes("@") ? adres : null;
    }
    catch {
        return null; // uitnodiging verlopen/ongeldig: gewoon vrij registreren
    }
}
export function wisUitnodiging() {
    try {
        sessionStorage.removeItem(UITNODIGING_SLEUTEL);
    }
    catch { /* geen opslag */ }
}
/** Waarheen na inloggen/verifiëren/herstellen: eerst een openstaande uitnodiging, dan Home of de welkomstappen. */
export function bestemmingNaInloggen(g) {
    const token = leesUitnodiging();
    if (token)
        return { to: "/uitnodiging", search: { token }, replace: true };
    return { to: g?.onboarding_completed ? "/" : "/welkom", replace: true };
}
/** E-mailadres tussen registreren en verifiëren (zodat /verifieren na verversen nog weet voor wie). */
export const VERIFIEER_SLEUTEL = "onzeapp-verifieer-email";
