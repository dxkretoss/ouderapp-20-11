import i18n from "@/i18n";
import { supabase } from "@/lib/supabase";
/**
 * Eén ingang naar de server: `api(functie, actie, velden)` → edge function `functie` met body
 * `{ action, lang, ...velden }` en de sessie in de header `x-session-token`.
 * Fouten komen terug als `ApiFout` met een `code` (VALIDATION, EMAIL_TAKEN, …); de UI vertaalt
 * die via `foutTekst(code)`. Bij UNAUTHORIZED vervalt de sessie (auth-store luistert via `bijOnbevoegd`).
 * Met VITE_API_MOCK=1 (alleen lokaal) beantwoordt src/lib/api-mock.js alles in de browser.
 */
export const TOKEN_SLEUTEL = "onzeapp-sessie-token";
/** Codes waarvoor een vertaling bestaat; al het andere toont de algemene fout. */
export const FOUT_CODES = ["VALIDATION", "WEAK_PASSWORD", "EMAIL_TAKEN", "INVALID_CREDENTIALS", "NOT_VERIFIED", "CODE_INVALID", "CODE_EXPIRED", "TOO_MANY_ATTEMPTS", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "INVITE_EXPIRED", "INVITE_USED", "INVITE_CANCELLED", "INVITE_DECLINED", "INVITE_OWN", "INVITE_EMAIL_MISMATCH", "CHILD_LIMIT", "RATE_LIMITED", "SERVER", "NETWORK", "NOT_CONFIGURED", "GONE"];
export class ApiFout extends Error {
    constructor(code, bericht, status) {
        super(bericht || code);
        this.name = "ApiFout";
        this.code = code;
        this.status = status;
    }
}
/** Vertaalde, rustige foutmelding bij een code (of een ApiFout). */
export function foutTekst(fout) {
    const code = typeof fout === "string" ? fout : fout?.code;
    return i18n.t(`lib.api.fout.${FOUT_CODES.includes(code) ? code : "SERVER"}`);
}
export function leesToken() {
    try {
        return localStorage.getItem(TOKEN_SLEUTEL);
    }
    catch {
        return null;
    }
}
export function zetToken(token) {
    try {
        if (token)
            localStorage.setItem(TOKEN_SLEUTEL, token);
        else
            localStorage.removeItem(TOKEN_SLEUTEL);
    }
    catch { /* privémodus */ }
}
const onbevoegdLuisteraars = new Set();
/** auth-store meldt zich hier aan: bij UNAUTHORIZED wordt de sessie gewist en gaat de app naar /welkom. */
export function bijOnbevoegd(f) {
    onbevoegdLuisteraars.add(f);
    return () => onbevoegdLuisteraars.delete(f);
}
// Alleen met VITE_API_MOCK=1: Vite vervangt de vergelijking door een constante, zodat de mock
// in een productiebuild volledig wegvalt.
const mockModule = typeof import.meta.env !== "undefined" && import.meta.env.VITE_API_MOCK === "1" ? import("./api-mock.js") : null;
export const isMock = mockModule !== null;
async function roepAan(functie, body, token) {
    if (mockModule)
        return (await mockModule).roepAan(functie, body, token);
    if (!supabase)
        return { status: 0, data: { success: false, code: "NOT_CONFIGURED", message: "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing" } };
    const { data, error } = await supabase.functions.invoke(functie, { body, headers: token ? { "x-session-token": token } : {} });
    if (!error)
        return { status: 200, data };
    // Fout-antwoord van de function: lees de JSON-body voor de code.
    const antwoord = error.context;
    if (antwoord && typeof antwoord.json === "function") {
        let inhoud = null;
        try {
            inhoud = await antwoord.clone().json();
        }
        catch { /* geen JSON */ }
        return { status: antwoord.status ?? 500, data: inhoud ?? { success: false, code: "SERVER" } };
    }
    return { status: 0, data: { success: false, code: error.name === "FunctionsFetchError" ? "NETWORK" : "SERVER", message: error.message } };
}
export async function api(functie, actie, velden = {}) {
    const token = leesToken();
    const body = { action: actie, lang: i18n.resolvedLanguage === "en" ? "en" : "nl", ...velden };
    let res;
    try {
        res = await roepAan(functie, body, token);
    }
    catch (e) {
        throw new ApiFout("NETWORK", e?.message);
    }
    const data = res?.data;
    if (data && data.success !== false && res.status < 400)
        return data;
    const code = data?.code || "SERVER";
    if (code === "UNAUTHORIZED" && token)
        onbevoegdLuisteraars.forEach((f) => f());
    throw new ApiFout(code, data?.message, res?.status);
}
