import { createClient } from "@supabase/supabase-js";
/**
 * Supabase-client, alleen voor `functions.invoke` (zie api.js). De browser raakt nooit tabellen,
 * RPC's of opslag direct aan; elke aanroep gaat via een edge function die de sessie controleert.
 * De anon-sleutel is publiek; de gebruikerssessie gaat apart mee als `x-session-token`.
 */
// Alleen deze twee namen letterlijk uitlezen: Vite vervangt dan precies deze waarden. Wie
// `import.meta.env` als geheel gebruikt, laat Vite álle VITE_-variabelen in de bundel zetten.
// try/catch: buiten Vite (node-tests) bestaat import.meta.env niet.
const leesUrl = () => { try { return import.meta.env.VITE_SUPABASE_URL; } catch { return undefined; } };
const leesSleutel = () => { try { return import.meta.env.VITE_SUPABASE_ANON_KEY; } catch { return undefined; } };
const url = leesUrl();
const sleutel = leesSleutel();
/** Zijn beide omgevingsvariabelen gezet? Zonder kan de app geen account gebruiken. */
export const isIngesteld = !!url && !!sleutel;
export const supabase = isIngesteld
    ? createClient(url, sleutel, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    : null;
