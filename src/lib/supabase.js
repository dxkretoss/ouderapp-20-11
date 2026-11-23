import { createClient } from "@supabase/supabase-js";
/**
 * Supabase-client, alleen voor `functions.invoke` (zie api.js). De browser raakt nooit tabellen,
 * RPC's of opslag direct aan; elke aanroep gaat via een edge function die de sessie controleert.
 * De anon-sleutel is publiek; de gebruikerssessie gaat apart mee als `x-session-token`.
 */
// typeof-guard: buiten Vite (node-tests) bestaat import.meta.env niet.
const env = typeof import.meta.env !== "undefined" ? import.meta.env : {};
const url = env.VITE_SUPABASE_URL;
const sleutel = env.VITE_SUPABASE_ANON_KEY;
/** Zijn beide omgevingsvariabelen gezet? Zonder kan de app geen account gebruiken. */
export const isIngesteld = !!url && !!sleutel;
export const supabase = isIngesteld
    ? createClient(url, sleutel, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    : null;
