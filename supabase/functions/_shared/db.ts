import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

let client: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS, so every caller MUST derive the user from the
 * session (see session.ts) and check access (see access.ts) before using it.
 * There is deliberately NO fallback to the anon key.
 */
export function db(): SupabaseClient {
  if (client) return client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured");
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
