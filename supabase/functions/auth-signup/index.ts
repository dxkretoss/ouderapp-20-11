// RETIRED in Phase 1 (Milestone 1). Kept only as a 410 stub so old app versions fail safely.
// Delete this function from the Supabase project (see supabase/DEPLOY-PHASE1.md).
import { goneHandler } from "../_shared/respond.ts";

Deno.serve(goneHandler("auth-signup"));
