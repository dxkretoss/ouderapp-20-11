-- ==============================================================================
-- Ouderschap & Co — Phase 1 (Milestone 1): security lockdown + profile/child model
-- ==============================================================================
-- Baseline: supabase/schema.sql (copied from the old repo, backdoor password removed).
-- Contract: PHASE1-CONTRACT.md §3.
--
-- After this migration the browser (anon / authenticated roles) can no longer read
-- or write ANY table, RPC or storage object directly. Every data call goes through an
-- edge function that verifies the session token and uses the service role.
--
-- Safe to run more than once (idempotent). Runs in a single transaction.
-- ==============================================================================

BEGIN;

-- pgcrypto lives in the "extensions" schema on Supabase.
SET LOCAL search_path = public, extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- Helper (session-local, disappears at the end of the session)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.try_jsonb(t text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  IF t IS NULL OR btrim(t) = '' THEN
    RETURN NULL;
  END IF;
  RETURN t::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- ==============================================================================
-- 0. Normalise e-mail addresses to lower case (functions match with exact equality,
--    never with LIKE patterns). The unique index on lower(email) guarantees no clashes.
-- ==============================================================================
UPDATE public.profiles SET email = lower(btrim(email))
WHERE email IS NOT NULL AND email <> lower(btrim(email));
UPDATE public.invitations SET to_email = lower(btrim(to_email))
WHERE to_email <> lower(btrim(to_email));

-- ==============================================================================
-- 3. Sessions
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at   TIMESTAMPTZ,
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions (user_id);
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- The old single-token column is no longer used: invalidate every old session.
UPDATE public.profiles SET session_token = NULL WHERE session_token IS NOT NULL;

-- ==============================================================================
-- 4. Hashed one-time codes (verify / reset)
-- ==============================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS code_hash TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS code_purpose TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS code_expires_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS code_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_code_purpose_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_code_purpose_check
  CHECK (code_purpose IS NULL OR code_purpose IN ('verify', 'reset'));

-- Stop storing plaintext codes.
UPDATE public.profiles SET verification_code = NULL WHERE verification_code IS NOT NULL;

-- Rate-limit log for e-mail codes and failed logins (used by custom-auth).
-- (Addition to contract §3: needed for "max 5 codes / hour / email".)
CREATE TABLE IF NOT EXISTS public.auth_rate_events (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  kind       TEXT NOT NULL,   -- 'verify' | 'reset' | 'login_fail'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_events_lookup
  ON public.auth_rate_events (email, kind, created_at DESC);
ALTER TABLE public.auth_rate_events ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 5. Passwords: re-hash every non-bcrypt (plaintext / legacy) password
-- ==============================================================================
UPDATE public.profiles
SET password = crypt(password, gen_salt('bf', 10))
WHERE password IS NOT NULL
  AND password !~ '^\$2[aby]\$';

-- ==============================================================================
-- 6. Backdoor removal (seeded super admin with a public plaintext password)
-- ==============================================================================
UPDATE public.profiles
SET password = NULL, code_hash = NULL, code_purpose = NULL, code_expires_at = NULL
WHERE lower(email) = 'ouderschap@admin.com'
  AND (password IS NOT NULL OR code_hash IS NOT NULL);

-- The old custom-auth also created a GoTrue (auth.users) account for the admin with
-- that same public password. Scramble it so it cannot be used to obtain a Supabase JWT.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf', 10))
    WHERE lower(email) = 'ouderschap@admin.com';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Could not scramble the admin password in auth.users (insufficient privilege). Do it manually, see DEPLOY-PHASE1.md.';
END;
$$;

-- The profile -> auth.users sync trigger used a well-known default password
-- ('Password123!') for profiles without a password. Replace it with a random one.
-- (Otherwise identical to the baseline function.)
CREATE OR REPLACE FUNCTION public.sync_profile_to_auth_user()
RETURNS trigger AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.id OR lower(email) = lower(NEW.email)) THEN
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token,
        created_at, updated_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000000'::uuid,
        NEW.id,
        'authenticated',
        'authenticated',
        lower(trim(NEW.email)),
        CASE WHEN NEW.password ~ '^\$2[aby]\$' THEN NEW.password
             ELSE crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf', 10)) END,
        CASE WHEN NEW.is_verified THEN now() ELSE NULL END,
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('name', NEW.name, 'usage_mode', NEW.usage_mode),
        '', '', '', '', '', '', '', '',
        NEW.created_at,
        NEW.updated_at
      );

      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        NEW.id,
        NEW.id,
        jsonb_build_object('sub', NEW.id::text, 'email', lower(trim(NEW.email))),
        'email',
        NEW.id::text,
        now(),
        NEW.created_at,
        NEW.updated_at
      ) ON CONFLICT (provider, provider_id) DO NOTHING;
    ELSE
      UPDATE auth.users
      SET
        email = lower(trim(NEW.email)),
        email_confirmed_at = CASE WHEN NEW.is_verified AND email_confirmed_at IS NULL THEN now() ELSE email_confirmed_at END,
        raw_user_meta_data = jsonb_build_object('name', NEW.name, 'usage_mode', NEW.usage_mode),
        updated_at = now()
      WHERE id = NEW.id OR lower(email) = lower(NEW.email);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth;

-- ==============================================================================
-- 7. Preferences (onboarding flags, later app settings)
-- ==============================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ==============================================================================
-- 8. Child profile
-- ==============================================================================
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ==============================================================================
-- 9. Private notes (were stored on the SHARED child row, readable by the co-parent)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.child_private_notes (
  child_id   UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note       TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, parent_id)
);
CREATE INDEX IF NOT EXISTS idx_child_private_notes_parent ON public.child_private_notes (parent_id);
ALTER TABLE public.child_private_notes ENABLE ROW LEVEL SECURITY;

-- Move practical_notes.private_notes[<parent_id>] into the new table ...
WITH parsed AS (
  SELECT c.id AS child_id, pg_temp.try_jsonb(c.practical_notes) AS j
  FROM public.children c
  WHERE c.practical_notes LIKE '%private_notes%'
),
notes AS (
  SELECT p.child_id,
         CASE WHEN e.key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN e.key::uuid END AS parent_id,
         e.value AS val
  FROM parsed p
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(p.j) = 'object' AND jsonb_typeof(p.j -> 'private_notes') = 'object'
         THEN p.j -> 'private_notes' ELSE '{}'::jsonb END
  ) AS e
)
INSERT INTO public.child_private_notes (child_id, parent_id, note)
SELECT n.child_id,
       n.parent_id,
       CASE WHEN jsonb_typeof(n.val) = 'string' THEN n.val #>> '{}' ELSE n.val::text END
FROM notes n
JOIN public.profiles pr ON pr.id = n.parent_id
WHERE n.parent_id IS NOT NULL
  AND jsonb_typeof(n.val) <> 'null'
ON CONFLICT (child_id, parent_id) DO NOTHING;

-- ... and remove the key from the shared row.
UPDATE public.children c
SET practical_notes = (pg_temp.try_jsonb(c.practical_notes) - 'private_notes')::text
WHERE c.practical_notes LIKE '%private_notes%'
  AND jsonb_typeof(pg_temp.try_jsonb(c.practical_notes)) = 'object'
  AND pg_temp.try_jsonb(c.practical_notes) ? 'private_notes';

-- ==============================================================================
-- 10. Invitations: allow 'revoked', index for lookups by recipient
-- ==============================================================================
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_status_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_status_check
  CHECK (status IN ('pending', 'sent', 'viewed', 'accepted', 'rejected', 'declined',
                    'expired', 'cancelled', 'disconnected', 'revoked'));
CREATE INDEX IF NOT EXISTS idx_invitations_to_email_status
  ON public.invitations (lower(to_email), status);
CREATE INDEX IF NOT EXISTS idx_invitations_from_parent
  ON public.invitations (from_parent_id);

-- ==============================================================================
-- 11. parent_connections is undirected: dedupe (keep most recent) + unique pair
-- ==============================================================================
DELETE FROM public.parent_connections pc
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY least(parent_1_id, parent_2_id), greatest(parent_1_id, parent_2_id)
           ORDER BY COALESCE(updated_at, created_at) DESC, created_at DESC, id DESC
         ) AS rn
  FROM public.parent_connections
) d
WHERE pc.id = d.id
  AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parent_connections_pair
  ON public.parent_connections (least(parent_1_id, parent_2_id), greatest(parent_1_id, parent_2_id));

-- ==============================================================================
-- 12. updated_at triggers
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_children_updated_at ON public.children;
CREATE TRIGGER trg_children_updated_at
  BEFORE UPDATE ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_child_private_notes_updated_at ON public.child_private_notes;
CREATE TRIGGER trg_child_private_notes_updated_at
  BEFORE UPDATE ON public.child_private_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 2. Storage: all app buckets private, no anon/public storage policies
--    (files are served through signed URLs created by edge functions)
-- ==============================================================================
DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets
    SET public = false
    WHERE id IN ('avatars', 'child-avatars', 'receipts', 'documents', 'moments')
      AND public IS DISTINCT FROM false;
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL THEN
    FOR r IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND (
          policyname IN (
            'Public child-avatars access', 'Authenticated users upload child-avatars',
            'Authenticated users update child-avatars', 'Users delete child-avatars',
            'Public avatars access', 'Users upload avatars', 'Users update avatars', 'Users delete avatars',
            'Public receipts access', 'Users upload receipts', 'Users update receipts', 'Users delete receipts',
            'Public moments access', 'Users upload moments', 'Users update moments', 'Users delete moments'
          )
          OR COALESCE(qual, '') || ' ' || COALESCE(with_check, '')
             ~ '(avatars|child-avatars|receipts|documents|moments)'
        )
    LOOP
      BEGIN
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE WARNING 'Could not drop storage policy "%" (insufficient privilege) - delete it in Dashboard > Storage > Policies.', r.policyname;
      END;
    END LOOP;
  END IF;
END;
$$;

-- ==============================================================================
-- 1. LOCK DOWN (runs last so it also covers the tables created above)
-- ==============================================================================

-- a) Drop every policy on public tables (all of them were USING (true)).
--    No policies + RLS enabled = deny for anon/authenticated; service_role bypasses RLS.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;

  -- b) Make sure RLS is on for every public table.
  FOR r IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
  END LOOP;
END;
$$;

-- c) Revoke all direct access from the browser roles.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, PUBLIC;

-- d) Explicitly revoke the old custom_* RPCs (covered by c), kept for clarity/robustness).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'custom\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, PUBLIC', r.sig);
  END LOOP;
END;
$$;

-- e) service_role keeps full access (edge functions).
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- f) Future tables/functions created by this role are not auto-granted to the browser roles.
DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, PUBLIC;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Could not change default privileges: % - new tables must be revoked manually.', SQLERRM;
END;
$$;

COMMIT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
