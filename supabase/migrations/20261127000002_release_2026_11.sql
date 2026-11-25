-- ==============================================================================
-- RELEASE November 2026 — ALL database changes in one script (run once, in the SQL Editor).
-- Combines these migrations, in order:
--   1. (was) 20261125000001_hardening.sql
--   2. (was) 20261125000002_per_child_pairs.sql
--   3. (was) 20261126000001_circle_pickups.sql
--   4. (was) 20261126000002_personal_and_drafts.sql
--   5. (was) 20261126000004_costs_pots_edit.sql
--   6. (was) 20261126000005_child_access_handover.sql
--   7. (was) 20261127000001_review_fixes.sql
-- Runs as ONE transaction: if any statement fails, NOTHING is applied (fix and re-run).
-- Safe to run twice. Make a database backup first.
-- Deploy the edge functions AFTER this script succeeded.
-- ==============================================================================
BEGIN;


-- ############################################################################
-- ### 20261125000001_hardening.sql
-- ############################################################################
-- ==============================================================================
-- Hardening after the Milestone 1-2 security audit (25 Nov 2026).
-- One transaction, additive, safe to run twice. Run after the Phase 2 migrations.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Atomic code attempts (verify / reset codes).
--    The edge function claims an attempt BEFORE comparing the code, so parallel
--    guesses cannot get past the 5-attempt cap.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_code_attempt(p_id uuid, p_purpose text, p_max int)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH upd AS (
    UPDATE public.profiles
    SET code_attempts = COALESCE(code_attempts, 0) + 1
    WHERE id = p_id
      AND code_purpose = p_purpose
      AND COALESCE(code_attempts, 0) < p_max
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM upd);
$$;
REVOKE ALL ON FUNCTION public.claim_code_attempt(uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_code_attempt(uuid, text, int) TO service_role;

-- ------------------------------------------------------------------------------
-- 2. GoTrue mirror: never copy the app's password hash into auth.users.
--    The app uses its own auth; a mirrored hash kept old passwords working on
--    /auth/v1/token after a reset. Always store a random, unusable password.
-- ------------------------------------------------------------------------------
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
        extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf', 10)),
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

-- Scramble every password hash that was already mirrored.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    UPDATE auth.users u
    SET encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf', 10))
    FROM public.profiles p
    WHERE p.id = u.id;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Could not scramble auth.users passwords (insufficient privilege). Do it manually, see DEPLOY-HARDENING.md.';
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Account deletion.
--    Append-only step tables blocked the FK "ON DELETE SET NULL" (which is an UPDATE),
--    so deleting an account with cost history failed. Allow exactly that: an update
--    whose only changes are columns becoming NULL. Everything else stays forbidden.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.costs_forbid_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  only_nulled boolean;
BEGIN
  SELECT COALESCE(bool_and(n.value = 'null'::jsonb), false)
  INTO only_nulled
  FROM jsonb_each(to_jsonb(NEW)) n
  JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
  WHERE n.value IS DISTINCT FROM o.value;
  IF only_nulled THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'append-only table %: rows cannot be changed', TG_TABLE_NAME;
END $$;
REVOKE ALL ON FUNCTION public.costs_forbid_update() FROM anon, authenticated, PUBLIC;

-- budget_steps keep the shared history; the actor is anonymised instead of deleted.
ALTER TABLE public.budget_steps ALTER COLUMN actor_id DROP NOT NULL;

-- Deleting a profile must not wipe the other parent's messages: the conversation stays,
-- only the creator reference becomes NULL.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'public.conversations'::regclass
      AND con.contype = 'f'
      AND a.attname = 'created_by'
  LOOP
    EXECUTE format('ALTER TABLE public.conversations DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.conversations
    ADD CONSTRAINT conversations_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Old rate-limit rows are pruned by the functions; index for that delete.
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_auth_rate_events_created_at ON public.auth_rate_events (created_at);


-- ############################################################################
-- ### 20261125000002_per_child_pairs.sql
-- ############################################################################
-- ==============================================================================
-- Per-child co-parents (25 Nov 2026).
-- A parent can share child 1 with father A and child 2 with father B. Every shared record is
-- addressed to exactly ONE other parent (other_parent_id) and is only visible to that parent when
-- every child of the record is linked to both parents (enforced in the edge functions).
--
-- Client rules applied to EXISTING data (approved 25 Nov 2026):
--  * Items made while Solo (before the parents connected) stay private until the user shares them.
--  * Items without a child, or with children of different co-parents, become private.
-- Every row that changes visibility is written to public.per_child_backfill_log.
-- One transaction, safe to run twice (the backfill only touches rows not handled before).
-- Run after 20261125000001_hardening.sql.
-- ==============================================================================

-- ------------------------------------------------------------------ 1. columns
ALTER TABLE public.tasks             ADD COLUMN IF NOT EXISTS other_parent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.belongings        ADD COLUMN IF NOT EXISTS other_parent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.documents         ADD COLUMN IF NOT EXISTS other_parent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.shared_moments    ADD COLUMN IF NOT EXISTS other_parent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS other_parent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_other_parent             ON public.tasks (other_parent_id);
CREATE INDEX IF NOT EXISTS idx_belongings_other_parent        ON public.belongings (other_parent_id);
CREATE INDEX IF NOT EXISTS idx_documents_other_parent         ON public.documents (other_parent_id);
CREATE INDEX IF NOT EXISTS idx_shared_moments_other_parent    ON public.shared_moments (other_parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_agreements_other_parent ON public.parent_agreements (other_parent_id);

-- ------------------------------------------------------------------ 2. backfill log
CREATE TABLE IF NOT EXISTS public.per_child_backfill_log (
  id         bigserial PRIMARY KEY,
  table_name text NOT NULL,
  row_id     uuid NOT NULL,
  change     text NOT NULL,          -- 'addressed' | 'private' | 'unaddressed'
  other_parent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_name, row_id)
);
ALTER TABLE public.per_child_backfill_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.per_child_backfill_log FROM anon, authenticated, PUBLIC;
REVOKE ALL ON SEQUENCE public.per_child_backfill_log_id_seq FROM anon, authenticated, PUBLIC;

-- ------------------------------------------------------------------ 3. helper
-- The one co-parent who (a) was actively connected with `owner` at time `at` and (b) is linked to
-- EVERY child in `kids`. NULL when there is none or more than one, or when kids is empty.
CREATE OR REPLACE FUNCTION public.per_child_pair(owner uuid, kids uuid[], at timestamptz)
RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  found uuid[];
BEGIN
  IF owner IS NULL OR kids IS NULL OR coalesce(array_length(kids, 1), 0) = 0 THEN
    RETURN NULL;
  END IF;
  SELECT array_agg(DISTINCT x.other) INTO found
  FROM (
    SELECT CASE WHEN pc.parent_1_id = owner THEN pc.parent_2_id ELSE pc.parent_1_id END AS other
    FROM public.parent_connections pc
    WHERE (pc.parent_1_id = owner OR pc.parent_2_id = owner)
      AND pc.status IN ('active', 'connected')
      AND pc.created_at <= coalesce(at, now())
  ) x
  WHERE x.other IS NOT NULL AND x.other <> owner
    AND NOT EXISTS (
      SELECT 1 FROM unnest(kids) k
      WHERE NOT EXISTS (SELECT 1 FROM public.child_parents cp WHERE cp.child_id = k AND cp.parent_id = x.other)
        AND NOT EXISTS (SELECT 1 FROM public.children c WHERE c.id = k AND c.created_by = x.other)
    );
  IF found IS NULL OR array_length(found, 1) <> 1 THEN
    RETURN NULL;
  END IF;
  RETURN found[1];
END;
$$;
REVOKE ALL ON FUNCTION public.per_child_pair(uuid, uuid[], timestamptz) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------ 4. backfill: practical tables
-- Only shared, not-yet-handled rows. A row that gets no pair simply stays private (other_parent_id NULL).

-- tasks (user_id, child_ids)
WITH c AS (
  SELECT t.id, public.per_child_pair(t.user_id, coalesce(t.child_ids, CASE WHEN t.child_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[t.child_id] END), t.created_at) AS p
  FROM public.tasks t
  WHERE t.other_parent_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.per_child_backfill_log l WHERE l.table_name = 'tasks' AND l.row_id = t.id)
), u AS (
  UPDATE public.tasks t SET other_parent_id = c.p FROM c WHERE t.id = c.id AND c.p IS NOT NULL RETURNING t.id, t.other_parent_id
)
INSERT INTO public.per_child_backfill_log (table_name, row_id, change, other_parent_id)
SELECT 'tasks', c.id, CASE WHEN c.p IS NULL THEN 'private' ELSE 'addressed' END, c.p FROM c
ON CONFLICT DO NOTHING;

-- belongings (created_by, child_id)
WITH c AS (
  SELECT b.id, public.per_child_pair(b.created_by, ARRAY[b.child_id], b.created_at) AS p
  FROM public.belongings b
  WHERE b.other_parent_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.per_child_backfill_log l WHERE l.table_name = 'belongings' AND l.row_id = b.id)
), u AS (
  UPDATE public.belongings b SET other_parent_id = c.p FROM c WHERE b.id = c.id AND c.p IS NOT NULL RETURNING b.id
)
INSERT INTO public.per_child_backfill_log (table_name, row_id, change, other_parent_id)
SELECT 'belongings', c.id, CASE WHEN c.p IS NULL THEN 'private' ELSE 'addressed' END, c.p FROM c
ON CONFLICT DO NOTHING;

-- documents (user_id, child_id, is_shared): private documents stay private
WITH c AS (
  SELECT d.id, CASE WHEN d.is_shared IS DISTINCT FROM false AND d.child_id IS NOT NULL
               THEN public.per_child_pair(d.user_id, ARRAY[d.child_id], d.created_at) END AS p
  FROM public.documents d
  WHERE d.other_parent_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.per_child_backfill_log l WHERE l.table_name = 'documents' AND l.row_id = d.id)
), u AS (
  UPDATE public.documents d SET other_parent_id = c.p FROM c WHERE d.id = c.id AND c.p IS NOT NULL RETURNING d.id
)
INSERT INTO public.per_child_backfill_log (table_name, row_id, change, other_parent_id)
SELECT 'documents', c.id, CASE WHEN c.p IS NULL THEN 'private' ELSE 'addressed' END, c.p FROM c
ON CONFLICT DO NOTHING;

-- shared_moments (user_id, child_id, visibility / is_private)
WITH c AS (
  SELECT m.id, CASE WHEN coalesce(m.visibility, '') <> 'private' AND NOT coalesce(m.is_private, false) AND m.child_id IS NOT NULL
               THEN public.per_child_pair(m.user_id, ARRAY[m.child_id], m.created_at) END AS p
  FROM public.shared_moments m
  WHERE m.other_parent_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.per_child_backfill_log l WHERE l.table_name = 'shared_moments' AND l.row_id = m.id)
), u AS (
  UPDATE public.shared_moments m SET other_parent_id = c.p FROM c WHERE m.id = c.id AND c.p IS NOT NULL RETURNING m.id
)
INSERT INTO public.per_child_backfill_log (table_name, row_id, change, other_parent_id)
SELECT 'shared_moments', c.id, CASE WHEN c.p IS NULL THEN 'private' ELSE 'addressed' END, c.p FROM c
ON CONFLICT DO NOTHING;

-- parent_agreements (user_id, child_ids): agreements and decisions
WITH c AS (
  SELECT a.id, public.per_child_pair(a.user_id, coalesce(a.child_ids, CASE WHEN a.child_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[a.child_id] END), a.created_at) AS p
  FROM public.parent_agreements a
  WHERE a.other_parent_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.per_child_backfill_log l WHERE l.table_name = 'parent_agreements' AND l.row_id = a.id)
), u AS (
  UPDATE public.parent_agreements a SET other_parent_id = c.p FROM c WHERE a.id = c.id AND c.p IS NOT NULL RETURNING a.id
)
INSERT INTO public.per_child_backfill_log (table_name, row_id, change, other_parent_id)
SELECT 'parent_agreements', c.id, CASE WHEN c.p IS NULL THEN 'private' ELSE 'addressed' END, c.p FROM c
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------ 5. backfill: agenda
-- Appointments made while Solo (no pair at creation time) become private.
WITH c AS (
  SELECT e.id FROM public.calendar_events e
  WHERE e.is_shared IS DISTINCT FROM false AND e.deleted_at IS NULL
    AND public.per_child_pair(e.created_by, coalesce(e.child_ids, '{}'::uuid[]), e.created_at) IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.per_child_backfill_log l WHERE l.table_name = 'calendar_events' AND l.row_id = e.id)
), u AS (
  UPDATE public.calendar_events e SET is_shared = false FROM c WHERE e.id = c.id RETURNING e.id
)
INSERT INTO public.per_child_backfill_log (table_name, row_id, change)
SELECT 'calendar_events', u.id, 'private' FROM u
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------ 6. costs: wrong pair (old "first co-parent" rule)
-- A cost record addressed to a co-parent who is not linked to all of its children is taken back
-- to its creator (private). Records already settled are left alone.
WITH c AS (
  SELECT x.id FROM public.expenses x
  WHERE x.other_parent_id IS NOT NULL AND coalesce(array_length(x.child_ids, 1), 0) > 0
    AND x.settlement_id IS NULL AND x.status NOT IN ('verrekend')
    AND EXISTS (
      SELECT 1 FROM unnest(x.child_ids) k
      WHERE NOT EXISTS (SELECT 1 FROM public.child_parents cp WHERE cp.child_id = k AND cp.parent_id = x.other_parent_id)
        AND NOT EXISTS (SELECT 1 FROM public.children ch WHERE ch.id = k AND ch.created_by = x.other_parent_id))
    AND NOT EXISTS (SELECT 1 FROM public.per_child_backfill_log l WHERE l.table_name = 'expenses' AND l.row_id = x.id)
), u AS (
  UPDATE public.expenses x SET other_parent_id = NULL, turn_to_respond = NULL,
    status = CASE WHEN x.status = 'wacht' THEN 'opgeslagen' ELSE x.status END
  FROM c WHERE x.id = c.id RETURNING x.id
)
INSERT INTO public.per_child_backfill_log (table_name, row_id, change)
SELECT 'expenses', u.id, 'unaddressed' FROM u
ON CONFLICT DO NOTHING;

WITH c AS (
  SELECT x.id FROM public.still_needed_items x
  WHERE x.other_parent_id IS NOT NULL AND coalesce(array_length(x.child_ids, 1), 0) > 0
    AND EXISTS (
      SELECT 1 FROM unnest(x.child_ids) k
      WHERE NOT EXISTS (SELECT 1 FROM public.child_parents cp WHERE cp.child_id = k AND cp.parent_id = x.other_parent_id)
        AND NOT EXISTS (SELECT 1 FROM public.children ch WHERE ch.id = k AND ch.created_by = x.other_parent_id))
    AND NOT EXISTS (SELECT 1 FROM public.per_child_backfill_log l WHERE l.table_name = 'still_needed_items' AND l.row_id = x.id)
), u AS (
  UPDATE public.still_needed_items x SET other_parent_id = NULL FROM c WHERE x.id = c.id RETURNING x.id
)
INSERT INTO public.per_child_backfill_log (table_name, row_id, change)
SELECT 'still_needed_items', u.id, 'unaddressed' FROM u
ON CONFLICT DO NOTHING;


-- ############################################################################
-- ### 20261126000001_circle_pickups.sql
-- ############################################################################
-- ==============================================================================
-- Circle, pick-ups and help requests (26 Nov 2026) — used by manage-pickups.
--  * pickup_assignments: who picks up / drops off at a handover or appointment moment
--    (a parent, the other parent, a circle member with the app, or a contact without the app),
--    with the assignee's answer (requested/accepted/declined), "onderweg"/arrival and packed items.
--  * pickup_checkins: "Ik ben onderweg" / arrival confirmations of a parent per moment.
--  * help_requests + help_request_recipients: "Hulp vragen" to chosen circle members.
-- Moments are derived in the app (moment_key = date for handovers, "<event>|<date>" for appointments);
-- a snapshot of date/time/place/title is stored so a caregiver sees the assignment itself.
-- Per-child co-parents: every row stores other_parent_id (the one other parent of its children, or
-- NULL for Solo children); visibility is enforced in the edge function.
-- Additive and idempotent. RLS on, no policies: only the service role (edge functions) has access.
-- ==============================================================================

-- ------------------------------------------------------------------ 1. pick-up assignments
CREATE TABLE IF NOT EXISTS public.pickup_assignments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  other_parent_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  moment_key         text NOT NULL CHECK (char_length(moment_key) BETWEEN 1 AND 120),
  moment_type        text NOT NULL DEFAULT 'wissel' CHECK (moment_type IN ('wissel','afspraak')),
  moment_date        date NOT NULL,
  moment_time        text CHECK (moment_time IS NULL OR moment_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  place              text CHECK (place IS NULL OR char_length(place) <= 200),
  title              text CHECK (title IS NULL OR char_length(title) <= 200),
  child_ids          uuid[] NOT NULL CHECK (cardinality(child_ids) BETWEEN 1 AND 20),
  assignee_type      text NOT NULL CHECK (assignee_type IN ('parent','caregiver','contact')),
  assignee_parent_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  caregiver_id       uuid REFERENCES public.family_caregivers(id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','declined','withdrawn','done')),
  responded_at       timestamptz,
  reason             text CHECK (reason IS NULL OR char_length(reason) <= 300),
  packed_items       text[] NOT NULL DEFAULT '{}',
  on_the_way_at      timestamptz,
  arrived_at         timestamptz,
  withdrawn_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  withdrawn_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pickup_assignments_assignee_check CHECK (
    (assignee_type = 'parent' AND assignee_parent_id IS NOT NULL AND caregiver_id IS NULL)
    OR (assignee_type IN ('caregiver','contact') AND caregiver_id IS NOT NULL AND assignee_parent_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_pickup_assignments_created_by   ON public.pickup_assignments (created_by);
CREATE INDEX IF NOT EXISTS idx_pickup_assignments_other_parent ON public.pickup_assignments (other_parent_id);
CREATE INDEX IF NOT EXISTS idx_pickup_assignments_caregiver    ON public.pickup_assignments (caregiver_id);
CREATE INDEX IF NOT EXISTS idx_pickup_assignments_moment       ON public.pickup_assignments (moment_key, moment_date);
CREATE INDEX IF NOT EXISTS idx_pickup_assignments_child_ids    ON public.pickup_assignments USING gin (child_ids);
ALTER TABLE public.pickup_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pickup_assignments FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.pickup_assignments TO service_role;

-- ------------------------------------------------------------------ 2. parent check-ins
CREATE TABLE IF NOT EXISTS public.pickup_checkins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  other_parent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  moment_key      text NOT NULL CHECK (char_length(moment_key) BETWEEN 1 AND 120),
  moment_date     date NOT NULL,
  moment_time     text CHECK (moment_time IS NULL OR moment_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  child_ids       uuid[] NOT NULL CHECK (cardinality(child_ids) BETWEEN 1 AND 20),
  kind            text NOT NULL CHECK (kind IN ('onderweg','aangekomen')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- once per parent, moment, kind and other parent (children of different co-parents get one each)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pickup_checkins_once
  ON public.pickup_checkins (user_id, moment_key, kind, coalesce(other_parent_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_pickup_checkins_other_parent ON public.pickup_checkins (other_parent_id);
CREATE INDEX IF NOT EXISTS idx_pickup_checkins_moment       ON public.pickup_checkins (moment_key, moment_date);
ALTER TABLE public.pickup_checkins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pickup_checkins FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.pickup_checkins TO service_role;

-- ------------------------------------------------------------------ 3. help requests to the circle
CREATE TABLE IF NOT EXISTS public.help_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  other_parent_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  child_ids             uuid[] NOT NULL CHECK (cardinality(child_ids) BETWEEN 1 AND 20),
  what                  text NOT NULL CHECK (char_length(what) BETWEEN 1 AND 200),
  req_date              date NOT NULL,
  req_time              text CHECK (req_time IS NULL OR req_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','declined','withdrawn')),
  accepted_caregiver_id uuid REFERENCES public.family_caregivers(id) ON DELETE SET NULL,
  accepted_at           timestamptz,
  withdrawn_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_help_requests_created_by   ON public.help_requests (created_by);
CREATE INDEX IF NOT EXISTS idx_help_requests_other_parent ON public.help_requests (other_parent_id);
CREATE INDEX IF NOT EXISTS idx_help_requests_date         ON public.help_requests (req_date);
ALTER TABLE public.help_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.help_requests FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.help_requests TO service_role;

CREATE TABLE IF NOT EXISTS public.help_request_recipients (
  request_id   uuid NOT NULL REFERENCES public.help_requests(id) ON DELETE CASCADE,
  caregiver_id uuid NOT NULL REFERENCES public.family_caregivers(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','declined','closed')),
  responded_at timestamptz,
  reason       text CHECK (reason IS NULL OR char_length(reason) <= 300),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, caregiver_id)
);
CREATE INDEX IF NOT EXISTS idx_help_request_recipients_caregiver ON public.help_request_recipients (caregiver_id);
ALTER TABLE public.help_request_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.help_request_recipients FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.help_request_recipients TO service_role;


-- ############################################################################
-- ### 20261126000002_personal_and_drafts.sql
-- ############################################################################
-- ==============================================================================
-- WP2 (26 Nov 2026): personal data, message drafts and chat agreements.
--  * conversation_reads.draft: the user's own unsent text per conversation (private; only the
--    owner of the read row ever sees it, through manage-messages save-draft / list).
--  * message_agreements: "Akkoord geven" on a question in a conversation. Messages are append-only,
--    so the agreement is its own row (one per message); both parents of the conversation see it.
--  * personal_entries: owner-only personal data (Mijn houvast, wissel-log, solo logbook, safety
--    reports, the saved Co conversation). Never shared, never read by another user; manage-personal
--    only ever filters on the session user.
-- One transaction, idempotent. No policies: only the edge functions (service role) read these tables.
-- ==============================================================================

-- ------------------------------------------------------------------ 1. drafts
ALTER TABLE public.conversation_reads ADD COLUMN IF NOT EXISTS draft text;
ALTER TABLE public.conversation_reads ADD COLUMN IF NOT EXISTS draft_updated_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_reads_draft_len') THEN
    ALTER TABLE public.conversation_reads
      ADD CONSTRAINT conversation_reads_draft_len CHECK (draft IS NULL OR char_length(draft) <= 4000);
  END IF;
END $$;

-- ------------------------------------------------------------------ 2. agreements in a conversation
CREATE TABLE IF NOT EXISTS public.message_agreements (
  message_id uuid PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  agreed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  event_id uuid REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  confirmation_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_agreements_conversation ON public.message_agreements (conversation_id);
ALTER TABLE public.message_agreements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.message_agreements FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.message_agreements TO service_role;

-- ------------------------------------------------------------------ 3. personal (owner-only) entries
CREATE TABLE IF NOT EXISTS public.personal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('houvast_zin','houvast_moment','wissel_log','solo_note','safety_report','co_chat')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object' AND pg_column_size(data) <= 131072),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_personal_entries_user_kind ON public.personal_entries (user_id, kind, created_at);
-- At most one saved Co conversation per user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_entries_co_chat ON public.personal_entries (user_id) WHERE kind = 'co_chat';

DROP TRIGGER IF EXISTS trg_personal_entries_updated_at ON public.personal_entries;
CREATE TRIGGER trg_personal_entries_updated_at
  BEFORE UPDATE ON public.personal_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.personal_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.personal_entries FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.personal_entries TO service_role;


-- ############################################################################
-- ### 20261126000004_costs_pots_edit.sql
-- ############################################################################
-- ==============================================================================
-- WP4 Kosten (26 Nov 2026): expense edit / withdraw / share / reminder steps, and savings pots
-- ("Spaarpotjes") with deposits, per child, per pair (other_parent_id) or private (NULL).
-- Additive and idempotent. Run after 20261125000002_per_child_pairs.sql.
-- All tables are reached only through the manage-expenses edge function (service role):
-- RLS on, no policies, no grants for anon/authenticated.
-- ==============================================================================

-- ------------------------------------------------------------------ 1. expense steps: new step types
-- 'gewijzigd' (creator edited before the other parent responded), 'ingetrokken' (withdrawn),
-- 'gedeeld' (a private expense was shared later), 'herinnering' (reminder sent).
ALTER TABLE public.expense_steps DROP CONSTRAINT IF EXISTS expense_steps_step_type_check;
ALTER TABLE public.expense_steps ADD CONSTRAINT expense_steps_step_type_check CHECK (step_type IN (
  'toegevoegd', 'akkoord', 'ander_voorstel', 'niet_akkoord', 'meer_tijd', 'opmerking', 'verrekend',
  'gewijzigd', 'ingetrokken', 'gedeeld', 'herinnering'
));

-- ------------------------------------------------------------------ 2. savings pots
CREATE TABLE IF NOT EXISTS public.savings_pots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  child_id uuid REFERENCES public.children(id) ON DELETE SET NULL,
  title text NOT NULL,
  target_amount numeric(10, 2) NOT NULL DEFAULT 0.00,
  current_amount numeric(10, 2) NOT NULL DEFAULT 0.00,
  account_name text,
  iban text,
  color text DEFAULT '#3C6E71',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Pair of a shared pot (NULL = "Alleen jij") and its children.
ALTER TABLE public.savings_pots ADD COLUMN IF NOT EXISTS other_parent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.savings_pots ADD COLUMN IF NOT EXISTS child_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.savings_pots ADD COLUMN IF NOT EXISTS note text;
UPDATE public.savings_pots SET child_ids = ARRAY[child_id] WHERE child_id IS NOT NULL AND cardinality(child_ids) = 0;
-- iban / account_name are legacy columns: the app neither reads nor writes them.

CREATE INDEX IF NOT EXISTS idx_savings_pots_child ON public.savings_pots (child_id);
CREATE INDEX IF NOT EXISTS idx_savings_pots_created_by ON public.savings_pots (created_by);
CREATE INDEX IF NOT EXISTS idx_savings_pots_other_parent ON public.savings_pots (other_parent_id);

-- Deposits: append/delete only (no edits); the pot's current_amount is kept equal to their sum.
CREATE TABLE IF NOT EXISTS public.savings_pot_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pot_id uuid NOT NULL REFERENCES public.savings_pots(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  amount numeric(10, 2) NOT NULL CHECK (amount > 0),
  date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_savings_pot_deposits_pot ON public.savings_pot_deposits (pot_id);

-- Legacy pots with a balance but no deposits get one opening deposit (idempotent).
INSERT INTO public.savings_pot_deposits (pot_id, created_by, amount, date, note)
SELECT p.id, p.created_by, p.current_amount, p.created_at::date, 'start'
FROM public.savings_pots p
WHERE p.current_amount > 0
  AND NOT EXISTS (SELECT 1 FROM public.savings_pot_deposits d WHERE d.pot_id = p.id);

-- ------------------------------------------------------------------ 3. lockdown
-- schema.sql once created savings_pots with a public policy and grants: remove them.
DROP POLICY IF EXISTS "Public savings_pots all" ON public.savings_pots;
ALTER TABLE public.savings_pots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.savings_pots FROM anon, authenticated, PUBLIC;
ALTER TABLE public.savings_pot_deposits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.savings_pot_deposits FROM anon, authenticated, PUBLIC;
-- The edge functions use the service role (uuid keys: no sequences to grant).
GRANT ALL ON TABLE public.savings_pots, public.savings_pot_deposits TO service_role;


-- ############################################################################
-- ### 20261126000005_child_access_handover.sql
-- ############################################################################
-- ==============================================================================
-- WP5 (26 Nov 2026): per-child parent access ("Gezag en toegang"), custody provenance,
-- per-child schedule confirmation, handover drafts + timed handover notifications.
--
-- Product decision (approved): the DEFAULT stays exactly what the app allowed before this migration.
-- Every linked parent of a child gets a `legacy_baseline` row with view/propose/edit for every section.
-- Self-reported custody (gezag) NEVER grants or removes access. Changes to another parent's access
-- only become effective after that parent's response (child_permission_requests); see
-- supabase/functions/_shared/parent-permissions.ts for the full rule.
--
-- Additive and idempotent. One transaction. Run after 20261125000002_per_child_pairs.sql.
-- All access goes through edge functions with the service role (RLS on, no policies).
-- ==============================================================================

-- ------------------------------------------------------------------ 1. effective access per child / parent / section
CREATE TABLE IF NOT EXISTS public.child_parent_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  section     text NOT NULL CHECK (char_length(section) BETWEEN 1 AND 40),
  can_view    boolean NOT NULL DEFAULT true,
  can_propose boolean NOT NULL DEFAULT true,
  can_edit    boolean NOT NULL DEFAULT true,
  granted_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- legacy_baseline = default (same as before); self_restriction = the parent limited their own access;
  -- agreed = changed after the affected parent / the other parent agreed (child_permission_requests);
  -- reviewed = set by an approved legal/privacy review procedure (never by the app itself).
  basis       text NOT NULL DEFAULT 'legacy_baseline' CHECK (basis IN ('legacy_baseline','self_restriction','agreed','reviewed')),
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_id, parent_id, section),
  -- seeing nothing means proposing/editing nothing
  CHECK (can_view OR (NOT can_propose AND NOT can_edit))
);
CREATE INDEX IF NOT EXISTS idx_child_parent_permissions_parent ON public.child_parent_permissions (parent_id);
ALTER TABLE public.child_parent_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.child_parent_permissions FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.child_parent_permissions TO service_role;

-- Pending changes: never effective until answered by the parent who must agree.
CREATE TABLE IF NOT EXISTS public.child_permission_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  target_parent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  approver_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  section         text NOT NULL CHECK (char_length(section) BETWEEN 1 AND 40),
  can_view        boolean NOT NULL,
  can_propose     boolean NOT NULL,
  can_edit        boolean NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','withdrawn','expired')),
  responded_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_child_permission_requests_child ON public.child_permission_requests (child_id, status);
CREATE INDEX IF NOT EXISTS idx_child_permission_requests_approver ON public.child_permission_requests (approver_id, status);
-- at most one open request per child / target / section
CREATE UNIQUE INDEX IF NOT EXISTS uq_child_permission_requests_open
  ON public.child_permission_requests (child_id, target_parent_id, section) WHERE status = 'pending';
ALTER TABLE public.child_permission_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.child_permission_requests FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.child_permission_requests TO service_role;

-- Baseline backfill: every linked parent (child_parents + creator) x every section, full rights.
-- Keep in sync with SECTIONS in _shared/parent-permissions.ts.
WITH parents AS (
  SELECT cp.child_id, cp.parent_id FROM public.child_parents cp
  UNION
  SELECT c.id, c.created_by FROM public.children c WHERE c.created_by IS NOT NULL
), sections(section) AS (
  VALUES ('basis'), ('school'), ('gezondheid'), ('praktisch'), ('personen'), ('noodkaart'),
         ('agenda'), ('overdracht'), ('kosten'), ('documenten'), ('momentjes'), ('beslissingen'), ('berichten')
)
INSERT INTO public.child_parent_permissions (child_id, parent_id, section, can_view, can_propose, can_edit, granted_by, basis)
SELECT p.child_id, p.parent_id, s.section, true, true, true, NULL, 'legacy_baseline'
FROM parents p CROSS JOIN sections s
ON CONFLICT (child_id, parent_id, section) DO NOTHING;

-- ------------------------------------------------------------------ 2. custody provenance per parent-child relationship
-- Display information only: reported (by one parent) / acknowledged (by the other parent) /
-- verified (independent review, never set by the app) / disputed (the other parent said it is not right).
ALTER TABLE public.child_parents ADD COLUMN IF NOT EXISTS gezag_status text;
ALTER TABLE public.child_parents ADD COLUMN IF NOT EXISTS gezag_provenance text;
ALTER TABLE public.child_parents ADD COLUMN IF NOT EXISTS reported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.child_parents ADD COLUMN IF NOT EXISTS reported_at timestamptz;
ALTER TABLE public.child_parents ADD COLUMN IF NOT EXISTS acknowledged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.child_parents ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
ALTER TABLE public.child_parents ADD COLUMN IF NOT EXISTS restrictions_note text;
DO $$ BEGIN
  ALTER TABLE public.child_parents ADD CONSTRAINT child_parents_gezag_status_check
    CHECK (gezag_status IS NULL OR gezag_status IN ('gezamenlijk','eenhoofdig','geen','voogd','anders','onbekend'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.child_parents ADD CONSTRAINT child_parents_gezag_provenance_check
    CHECK (gezag_provenance IS NULL OR gezag_provenance IN ('reported','acknowledged','verified','disputed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.child_parents ADD CONSTRAINT child_parents_restrictions_note_len
    CHECK (restrictions_note IS NULL OR char_length(restrictions_note) <= 2000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill from children.custody + practical_notes.custody_meta (text JSON; invalid JSON is skipped).
DO $$
DECLARE
  r record;
  meta jsonb;
  holder text;
  rep uuid;
  status_for text;
  rep_at timestamptz;
BEGIN
  FOR r IN
    SELECT cp.id AS link_id, cp.parent_id, c.custody, c.practical_notes
    FROM public.child_parents cp JOIN public.children c ON c.id = cp.child_id
    WHERE c.custody IS NOT NULL AND cp.gezag_provenance IS NULL
  LOOP
    meta := NULL;
    rep_at := now();
    BEGIN
      meta := (r.practical_notes::jsonb) -> 'custody_meta';
      rep_at := coalesce((meta ->> 'updated_at')::timestamptz, now());
    EXCEPTION WHEN others THEN rep_at := now();
    END;
    holder := meta ->> 'houder';
    rep := NULL;
    IF (meta ->> 'ingevuldDoor') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      rep := (meta ->> 'ingevuldDoor')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = rep) THEN rep := NULL; END IF;
    END IF;
    status_for := CASE
      WHEN r.custody = 'gezamenlijk' THEN 'gezamenlijk'
      WHEN r.custody = 'een-ouder' AND holder = r.parent_id::text THEN 'eenhoofdig'
      WHEN r.custody = 'een-ouder' AND holder ~* '^[0-9a-f-]{36}$' THEN 'geen'
      WHEN r.custody = 'anders' AND meta ->> 'detail' = 'voogd' THEN 'voogd'
      WHEN r.custody = 'anders' THEN 'anders'
      ELSE 'onbekend' END;
    UPDATE public.child_parents SET
      gezag_status = status_for,
      gezag_provenance = CASE WHEN coalesce(meta ->> 'bevestigdDoorAnder', '') = 'true' THEN 'acknowledged' ELSE 'reported' END,
      reported_by = rep,
      reported_at = rep_at
    WHERE id = r.link_id;
  END LOOP;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'custody backfill skipped: %', SQLERRM;
END $$;

-- ------------------------------------------------------------------ 3. handover: unshared note drafts (author only)
CREATE TABLE IF NOT EXISTS public.handover_note_drafts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  moment_id  text NOT NULL CHECK (moment_id ~ '^\d{4}-\d{2}-\d{2}$'),
  content    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, moment_id)
);
ALTER TABLE public.handover_note_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.handover_note_drafts FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.handover_note_drafts TO service_role;

-- ------------------------------------------------------------------ 4. handover: one fixed item per routine per handover
-- Remove duplicate "vast" rows (same handover, same routine), keeping the packed one or else the oldest.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY moment_id, source_ref ORDER BY is_packed DESC, removed DESC, created_at ASC, id ASC) AS n
  FROM public.handover_checklist_items
  WHERE source = 'vast' AND source_ref IS NOT NULL
)
DELETE FROM public.handover_checklist_items h USING ranked r WHERE h.id = r.id AND r.n > 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_handover_items_vast
  ON public.handover_checklist_items (moment_id, source_ref) WHERE source = 'vast' AND source_ref IS NOT NULL;

-- ------------------------------------------------------------------ 5. handover: sent-log for timed notifications
-- handover-reminders inserts a row BEFORE sending; the unique key makes every notification at-most-once.
CREATE TABLE IF NOT EXISTS public.handover_notification_log (
  id           bigserial PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('list_ready','evening','received_check')),
  moment_id    text NOT NULL,
  child_key    text NOT NULL,            -- sorted child ids joined with ','
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, moment_id, child_key, recipient_id)
);
CREATE INDEX IF NOT EXISTS idx_handover_notification_log_sent ON public.handover_notification_log (sent_at);
ALTER TABLE public.handover_notification_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.handover_notification_log FROM anon, authenticated, PUBLIC;
REVOKE ALL ON SEQUENCE public.handover_notification_log_id_seq FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.handover_notification_log TO service_role;
GRANT ALL ON SEQUENCE public.handover_notification_log_id_seq TO service_role;


-- ############################################################################
-- ### 20261127000001_review_fixes.sql
-- ############################################################################
-- ==============================================================================
-- Review fixes (27 Nov 2026). One transaction, additive, safe to run twice.
-- Run after 20261126000005_child_access_handover.sql and BEFORE deploying the changed functions
-- (custom-auth, manage-expenses and manage-handover use what is created here).
--   1. start_settlement(): atomic start of a settlement (no duplicates on a double tap / parallel calls).
--   2. handover_note_drafts: one draft per author, handover date AND pair (a parent with two co-parents
--      no longer overwrites the note for the other family).
--   3. profiles.password_must_be_set: set when verify-email ran without a password (the stored,
--      possibly attacker-chosen, pre-registration password was replaced by an unusable one).
-- Everything is reached only through the edge functions (service role).
-- ==============================================================================

-- ------------------------------------------------------------------ 1. atomic settlement start
-- Serialises starts per pair (transaction advisory lock), returns an open settlement that already holds
-- one of these expenses instead of inserting a second one, refuses expenses that are settled already,
-- and writes the first settlement step in the same transaction.
CREATE OR REPLACE FUNCTION public.start_settlement(
  p_created_by  uuid,
  p_payer       uuid,
  p_receiver    uuid,
  p_amount      numeric,
  p_period      text,
  p_expense_ids uuid[],
  p_reference   text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_payer IS NULL OR p_receiver IS NULL OR p_payer = p_receiver THEN
    RAISE EXCEPTION 'start_settlement: invalid pair' USING ERRCODE = '22023';
  END IF;
  IF p_expense_ids IS NULL OR cardinality(p_expense_ids) = 0 THEN
    RAISE EXCEPTION 'start_settlement: no expenses' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(
    'settlement:' || least(p_payer, p_receiver)::text || ':' || greatest(p_payer, p_receiver)::text
  ));

  SELECT s.id INTO v_id
  FROM public.settlements s
  WHERE s.status IN ('open', 'nog-te-betalen', 'betaalverzoek-gedeeld', 'aangegeven', 'wacht-op-ontvanger')
    AND s.expense_ids && p_expense_ids
  ORDER BY s.created_at
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_id, 'created', false);
  END IF;

  IF EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = ANY (p_expense_ids) AND e.settlement_id IS NOT NULL) THEN
    RAISE EXCEPTION 'start_settlement: an expense is already settled' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.settlements (created_by, payer_id, receiver_id, amount, period, status, expense_ids, reference_code)
  VALUES (p_created_by, p_payer, p_receiver, p_amount, COALESCE(p_period, 'maand'), 'nog-te-betalen', p_expense_ids, p_reference)
  RETURNING id INTO v_id;

  INSERT INTO public.settlement_steps (settlement_id, actor_id, status)
  VALUES (v_id, p_created_by, 'nog-te-betalen');

  RETURN jsonb_build_object('id', v_id, 'created', true);
END;
$$;
REVOKE ALL ON FUNCTION public.start_settlement(uuid, uuid, uuid, numeric, text, uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_settlement(uuid, uuid, uuid, numeric, text, uuid[], text) TO service_role;

-- ------------------------------------------------------------------ 2. handover note drafts per pair
-- pair_key = the other parent of the note's children ('' = Solo / older app versions); child_ids lets the
-- app show the draft with the right children.
ALTER TABLE public.handover_note_drafts ADD COLUMN IF NOT EXISTS pair_key text NOT NULL DEFAULT '';
ALTER TABLE public.handover_note_drafts ADD COLUMN IF NOT EXISTS child_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.handover_note_drafts DROP CONSTRAINT IF EXISTS handover_note_drafts_user_id_moment_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_handover_note_drafts_pair
  ON public.handover_note_drafts (user_id, moment_id, pair_key);
ALTER TABLE public.handover_note_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.handover_note_drafts FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.handover_note_drafts TO service_role;

-- ------------------------------------------------------------------ 3. password must be set
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_must_be_set boolean NOT NULL DEFAULT false;


COMMIT;
