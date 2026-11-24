-- ==============================================================================
-- Ouderschap & Co — Phase 2, domain 5: practical & agreements
-- Tasks, belongings, moments (+ reactions), documents, agreements/decisions,
-- family-scoped append-only audit, notifications + activity read-marks, evaluations.
-- ==============================================================================
-- Additive only (new columns / tables / indexes), never drops data. Idempotent.
-- All access goes through edge functions with the service role (RLS on, no policies).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Tasks
-- ------------------------------------------------------------------------------
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS child_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS requested_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurrence_text text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS contact_status text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS source jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_contact_status_check
    CHECK (contact_status IS NULL OR contact_status IN ('nog-te-regelen','contact-opgenomen','wacht-op-reactie','afgerond','niet-mogelijk'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: single child_id -> child_ids; assigned_to/transfer_to that hold a profile uuid.
UPDATE public.tasks SET child_ids = ARRAY[child_id]
 WHERE child_id IS NOT NULL AND (child_ids IS NULL OR child_ids = '{}');
UPDATE public.tasks t SET assignee_id = p.id
  FROM public.profiles p
 WHERE t.assignee_id IS NULL AND t.assigned_to ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND p.id = t.assigned_to::uuid;
UPDATE public.tasks SET assignee_id = user_id
 WHERE assignee_id IS NULL AND assigned_to = 'self';
UPDATE public.tasks t SET requested_to = p.id, requested_by = t.user_id
  FROM public.profiles p
 WHERE t.requested_to IS NULL AND t.transfer_to ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND p.id = t.transfer_to::uuid AND NOT t.is_completed;

CREATE INDEX IF NOT EXISTS idx_tasks_child_ids ON public.tasks USING gin (child_ids);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON public.tasks (assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_requested_to ON public.tasks (requested_to);

-- ------------------------------------------------------------------------------
-- 2. Belongings (Spullen): items per child that travel along, have a fixed place,
--    exist in both homes, or must go back to the other home ("Niet vergeten").
--    Separate from handover_checklist_items (per-handover packing list, domain 2).
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.belongings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  item_type text NOT NULL DEFAULT 'mee' CHECK (item_type IN ('mee','vast','dubbel','terug')),
  location_parent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  location_text text,
  responsible_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_done boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_belongings_child ON public.belongings (child_id);
CREATE INDEX IF NOT EXISTS idx_belongings_created_by ON public.belongings (created_by);
ALTER TABLE public.belongings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.belongings FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.belongings TO service_role;

-- ------------------------------------------------------------------------------
-- 3. Moments + reactions
-- ------------------------------------------------------------------------------
ALTER TABLE public.shared_moments ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'parents';
ALTER TABLE public.shared_moments ADD COLUMN IF NOT EXISTS circle_ids text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.shared_moments ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'geen';
ALTER TABLE public.shared_moments ADD COLUMN IF NOT EXISTS milestone text;
ALTER TABLE public.shared_moments ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT 'moment';
ALTER TABLE public.shared_moments ADD COLUMN IF NOT EXISTS happened_on date;
ALTER TABLE public.shared_moments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
DO $$ BEGIN
  ALTER TABLE public.shared_moments ADD CONSTRAINT shared_moments_visibility_check CHECK (visibility IN ('private','parents','circle'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.shared_moments ADD CONSTRAINT shared_moments_phase_check CHECK (phase IN ('geen','vooraf','tijdens','na'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.shared_moments ADD CONSTRAINT shared_moments_entry_kind_check CHECK (entry_kind IN ('moment','mijlpaal'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Old rows: is_private decides the visibility.
UPDATE public.shared_moments SET visibility = 'private' WHERE is_private AND visibility <> 'private';
UPDATE public.shared_moments SET happened_on = created_at::date WHERE happened_on IS NULL;

CREATE TABLE IF NOT EXISTS public.moment_reactions (
  moment_id uuid NOT NULL REFERENCES public.shared_moments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('leuk','lief','trots','watGoed','tekst','duim')),
  reaction_text text CHECK (reaction_text IS NULL OR char_length(reaction_text) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (moment_id, user_id)
);
ALTER TABLE public.moment_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.moment_reactions FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.moment_reactions TO service_role;

-- ------------------------------------------------------------------------------
-- 4. Documents
-- ------------------------------------------------------------------------------
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'upload';
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
DO $$ BEGIN
  ALTER TABLE public.documents ADD CONSTRAINT documents_source_check CHECK (source IN ('upload','ouderschapsplan','bon','school'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Allow the formats the upload UI offers (pdf, images, Word, plain text) in the private bucket.
UPDATE storage.buckets
   SET public = false,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf','text/plain',
                                  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
 WHERE id = 'documents';
UPDATE storage.buckets SET public = false WHERE id = 'moments';

-- ------------------------------------------------------------------------------
-- 5. Agreements & decisions (one source: parent_agreements, agreement_type agreement|decision)
-- ------------------------------------------------------------------------------
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS child_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS proposal jsonb;
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS versions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS agreed_by uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS agreed_at timestamptz;
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS valid_from timestamptz;
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS stopped_at timestamptz;
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS source jsonb;
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS is_safety boolean NOT NULL DEFAULT false;
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS is_formal boolean NOT NULL DEFAULT false;
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS evaluation_date date;
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS link_note text;
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS revision int NOT NULL DEFAULT 1;
-- decisions: kind (Schoolkeuze/Medisch/...), mode (goedkeuring/mening/informatie), responses {profile_id: akkoord|niet}
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS decision_kind text;
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS decision_mode text;
ALTER TABLE public.parent_agreements ADD COLUMN IF NOT EXISTS responses jsonb NOT NULL DEFAULT '{}'::jsonb;
DO $$ BEGIN
  ALTER TABLE public.parent_agreements ADD CONSTRAINT parent_agreements_decision_mode_check
    CHECK (decision_mode IS NULL OR decision_mode IN ('goedkeuring','mening','informatie'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE public.parent_agreements SET child_ids = ARRAY[child_id]
 WHERE child_id IS NOT NULL AND (child_ids IS NULL OR child_ids = '{}');
CREATE INDEX IF NOT EXISTS idx_parent_agreements_type ON public.parent_agreements (agreement_type);
CREATE INDEX IF NOT EXISTS idx_parent_agreements_child_ids ON public.parent_agreements USING gin (child_ids);

-- ------------------------------------------------------------------------------
-- 6. Audit: family-scoped, append-only
--    Scope = actor + child_ids: visible to the actor, and to the actor's active
--    co-parents when child_ids is empty or overlaps the children they share.
-- ------------------------------------------------------------------------------
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS child_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS item_label text;
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS changes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'server';
DO $$ BEGIN
  ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_origin_check CHECK (origin IN ('server','client'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_created ON public.audit_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_child_ids ON public.audit_events USING gin (child_ids);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON public.audit_events (entity_type, entity_id);

-- Append-only: no DELETE; the only UPDATE allowed is the FK clearing actor_id on profile deletion.
CREATE OR REPLACE FUNCTION public.audit_events_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_events is append-only';
  END IF;
  IF NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL
     AND NEW.id = OLD.id AND NEW.entity_type = OLD.entity_type AND NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id
     AND NEW.action = OLD.action AND NEW.details IS NOT DISTINCT FROM OLD.details AND NEW.created_at = OLD.created_at
     AND NEW.child_ids = OLD.child_ids AND NEW.item_label IS NOT DISTINCT FROM OLD.item_label
     AND NEW.changes = OLD.changes AND NEW.meta = OLD.meta AND NEW.origin = OLD.origin THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only';
END $$;
REVOKE ALL ON FUNCTION public.audit_events_append_only() FROM anon, authenticated, PUBLIC;
DROP TRIGGER IF EXISTS audit_events_append_only ON public.audit_events;
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_append_only();

-- ------------------------------------------------------------------------------
-- 7. Notifications (server-created when the other parent acts) + activity read-marks
-- ------------------------------------------------------------------------------
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'info';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_id text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS child_ids uuid[] NOT NULL DEFAULT '{}';
DO $$ BEGIN
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_category_check CHECK (category IN ('actie','wijziging','info'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Widen the type list (additive): keep the old values, add the practical sources.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'reminder','appointment','message','proposal','cost','handover','system',
  'task','belonging','moment','document','agreement','decision','evaluation','care','vacation','budget','attendance'));
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.activity_reads (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id text NOT NULL CHECK (char_length(item_id) BETWEEN 1 AND 300),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
ALTER TABLE public.activity_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.activity_reads FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.activity_reads TO service_role;

-- ------------------------------------------------------------------------------
-- 8. Evaluations (half-yearly). The content is private to its author; the date
--    drives the "time for an evaluation" reminder.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  evaluated_on date NOT NULL DEFAULT current_date,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evaluations_user ON public.evaluations (user_id, evaluated_on DESC);
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.evaluations FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.evaluations TO service_role;

-- updated_at triggers (function from the Phase 1 migration)
DROP TRIGGER IF EXISTS set_updated_at ON public.belongings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.belongings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lock down again (tables created above) — browser roles never touch tables directly.
REVOKE ALL ON public.tasks, public.documents, public.shared_moments, public.parent_agreements,
              public.audit_events, public.notifications FROM anon, authenticated, PUBLIC;

COMMIT;
