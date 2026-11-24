-- Phase 2 · Domain 2 (Agenda & care): appointments with proposals, care-schedule change proposals with
-- exceptions/versions, holidays as proposals, handover packing list / notes / routines, attendance and
-- "Nu afstemmen". Additive and idempotent: only new columns/tables/indexes, never drops data.
--
-- Parent references inside agenda records are stored as ABSOLUTE tokens so they stay correct for both
-- parents and survive a later connection of a second parent:
--   'is:<profile uuid>'  = that parent
--   'not:<profile uuid>' = the other parent of that profile (used while no second parent is linked)
--   'samen' / 'open'     = together / not decided
-- The edge functions translate these to viewer-relative values ('ik' / 'ander') per request.
BEGIN;

-- ---------------------------------------------------------------- appointments
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS child_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS category_key TEXT;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS take_along JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
-- old single child column → array (keeps the old column)
UPDATE public.calendar_events SET child_ids = ARRAY[child_id]
  WHERE child_id IS NOT NULL AND (child_ids IS NULL OR cardinality(child_ids) = 0);
CREATE INDEX IF NOT EXISTS idx_calendar_child_ids ON public.calendar_events USING GIN (child_ids);

-- Proposed changes to shared appointments (create / update / delete). Final statuses are immutable.
CREATE TABLE IF NOT EXISTS public.calendar_event_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('create', 'update', 'delete')),
  scope TEXT NOT NULL DEFAULT 'reeks' CHECK (scope IN ('alleen', 'toekomst', 'reeks')),
  occurrence_date DATE,
  child_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'geaccepteerd', 'afgewezen', 'alternatief', 'ingetrokken')),
  reply_by DATE,
  more_time JSONB,
  reminders JSONB NOT NULL DEFAULT '[]'::jsonb,
  response_note TEXT,
  responded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_proposals_event ON public.calendar_event_proposals (event_id);
CREATE INDEX IF NOT EXISTS idx_event_proposals_child_ids ON public.calendar_event_proposals USING GIN (child_ids);
CREATE INDEX IF NOT EXISTS idx_event_proposals_created_by ON public.calendar_event_proposals (created_by);
-- one open proposal per appointment (R-6)
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_proposals_open ON public.calendar_event_proposals (event_id)
  WHERE status = 'open' AND event_id IS NOT NULL;

-- Attendance coordination: one current state per appointment, history kept inside the row (append-only list).
CREATE TABLE IF NOT EXISTS public.appointment_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  proposed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  keuze TEXT NOT NULL CHECK (keuze IN ('samen', 'een', 'afzonderlijk', 'later')),
  fase TEXT NOT NULL CHECK (fase IN ('open', 'voorstel', 'afgestemd')),
  wie_gaat TEXT,
  contact_wie TEXT,
  uitkomst TEXT,
  uitkomst_toelichting TEXT,
  nabespreking JSONB,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- care schedule
ALTER TABLE public.care_schedule_proposals DROP CONSTRAINT IF EXISTS care_schedule_proposals_status_check;
ALTER TABLE public.care_schedule_proposals ADD CONSTRAINT care_schedule_proposals_status_check
  CHECK (status IN ('pending', 'accepted', 'counterproposal', 'declined', 'withdrawn'));
ALTER TABLE public.care_schedule_proposals ADD COLUMN IF NOT EXISTS soort TEXT;
ALTER TABLE public.care_schedule_proposals ADD COLUMN IF NOT EXISTS dates DATE[] NOT NULL DEFAULT ARRAY[]::DATE[];
ALTER TABLE public.care_schedule_proposals ADD COLUMN IF NOT EXISTS naar TEXT;
ALTER TABLE public.care_schedule_proposals ADD COLUMN IF NOT EXISTS wisseltijd TEXT;
ALTER TABLE public.care_schedule_proposals ADD COLUMN IF NOT EXISTS plek TEXT;
ALTER TABLE public.care_schedule_proposals ADD COLUMN IF NOT EXISTS aanleiding TEXT;
ALTER TABLE public.care_schedule_proposals ADD COLUMN IF NOT EXISTS datum_label TEXT;
ALTER TABLE public.care_schedule_proposals ADD COLUMN IF NOT EXISTS reply_by DATE;
ALTER TABLE public.care_schedule_proposals ADD COLUMN IF NOT EXISTS more_time JSONB;
ALTER TABLE public.care_schedule_proposals ADD COLUMN IF NOT EXISTS reminders JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.care_schedule_proposals ADD COLUMN IF NOT EXISTS alternative TEXT;
ALTER TABLE public.care_schedule_proposals ADD COLUMN IF NOT EXISTS moment JSONB;
ALTER TABLE public.care_schedule_proposals ADD COLUMN IF NOT EXISTS reason TEXT;
CREATE INDEX IF NOT EXISTS idx_care_proposals_child_ids ON public.care_schedule_proposals USING GIN (child_ids);

-- Accepted one-off changes: exact-date exceptions, append-only (the newest row for a child/date wins).
CREATE TABLE IF NOT EXISTS public.care_schedule_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  parent TEXT NOT NULL,
  reason TEXT,
  proposal_id UUID REFERENCES public.care_schedule_proposals(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_care_exceptions_child_date ON public.care_schedule_exceptions (child_id, date);

-- Accepted structural changes: a new version of the base schedule from a date on (base schedule never deleted).
CREATE TABLE IF NOT EXISTS public.care_schedule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  valid_from DATE NOT NULL,
  schedule JSONB NOT NULL,
  proposal_id UUID REFERENCES public.care_schedule_proposals(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_care_versions_child ON public.care_schedule_versions (child_id, valid_from);

-- ---------------------------------------------------------------- holidays & special days
ALTER TABLE public.vacations DROP CONSTRAINT IF EXISTS vacations_status_check;
ALTER TABLE public.vacations ADD CONSTRAINT vacations_status_check
  CHECK (status IN ('open', 'voorstel', 'afgesproken', 'ingetrokken'));
ALTER TABLE public.vacations ADD COLUMN IF NOT EXISTS child_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE public.vacations ADD COLUMN IF NOT EXISTS fields JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.vacations ADD COLUMN IF NOT EXISTS confirmed JSONB;
ALTER TABLE public.vacations ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.vacations ADD COLUMN IF NOT EXISTS reply_by DATE;
ALTER TABLE public.vacations ADD COLUMN IF NOT EXISTS response TEXT;
ALTER TABLE public.vacations ADD COLUMN IF NOT EXISTS more_time JSONB;
CREATE INDEX IF NOT EXISTS idx_vacations_child_ids ON public.vacations USING GIN (child_ids);

-- ---------------------------------------------------------------- handover
ALTER TABLE public.handover_checklist_items ADD COLUMN IF NOT EXISTS child_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE public.handover_checklist_items ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'toegevoegd';
ALTER TABLE public.handover_checklist_items ADD COLUMN IF NOT EXISTS source_ref TEXT;
ALTER TABLE public.handover_checklist_items ADD COLUMN IF NOT EXISTS packed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.handover_checklist_items ADD COLUMN IF NOT EXISTS packed_at TIMESTAMPTZ;
ALTER TABLE public.handover_checklist_items ADD COLUMN IF NOT EXISTS received BOOLEAN;
ALTER TABLE public.handover_checklist_items ADD COLUMN IF NOT EXISTS removed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.handover_checklist_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
UPDATE public.handover_checklist_items SET child_ids = ARRAY[child_id]
  WHERE child_id IS NOT NULL AND cardinality(child_ids) = 0;
CREATE INDEX IF NOT EXISTS idx_handover_checklist_child_ids ON public.handover_checklist_items USING GIN (child_ids);

ALTER TABLE public.handover_logs ADD COLUMN IF NOT EXISTS moment_id TEXT;
ALTER TABLE public.handover_logs ADD COLUMN IF NOT EXISTS content JSONB;
ALTER TABLE public.handover_logs ADD COLUMN IF NOT EXISTS to_parent TEXT;
ALTER TABLE public.handover_logs ADD COLUMN IF NOT EXISTS child_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE public.handover_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE public.handover_logs SET child_ids = ARRAY[child_id]
  WHERE child_id IS NOT NULL AND cardinality(child_ids) = 0;

-- ---------------------------------------------------------------- Nu afstemmen (same-day urgent)
CREATE TABLE IF NOT EXISTS public.urgent_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  child_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  categorie TEXT NOT NULL,
  titel TEXT NOT NULL,
  toelichting TEXT,
  reactie_gewenst TEXT,
  old_time TEXT,
  new_time TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'opgelost')),
  antwoord TEXT,
  answered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_urgent_child_ids ON public.urgent_requests USING GIN (child_ids);

-- ---------------------------------------------------------------- lock-down (same as Phase 1)
ALTER TABLE public.calendar_event_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_schedule_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_schedule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urgent_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calendar_event_proposals, public.appointment_attendance, public.care_schedule_exceptions,
  public.care_schedule_versions, public.urgent_requests FROM anon, authenticated, public;
GRANT ALL ON public.calendar_event_proposals, public.appointment_attendance, public.care_schedule_exceptions,
  public.care_schedule_versions, public.urgent_requests TO service_role;

DROP TRIGGER IF EXISTS trg_event_proposals_updated ON public.calendar_event_proposals;
CREATE TRIGGER trg_event_proposals_updated BEFORE UPDATE ON public.calendar_event_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_attendance_updated ON public.appointment_attendance;
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON public.appointment_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Final statuses never change again (also enforced in the edge functions).
CREATE OR REPLACE FUNCTION public.agenda_final_status_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = ANY (TG_ARGV) AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'final status % cannot change', OLD.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_event_proposals_final ON public.calendar_event_proposals;
CREATE TRIGGER trg_event_proposals_final BEFORE UPDATE ON public.calendar_event_proposals
  FOR EACH ROW EXECUTE FUNCTION public.agenda_final_status_guard('geaccepteerd', 'afgewezen', 'alternatief', 'ingetrokken');
DROP TRIGGER IF EXISTS trg_care_proposals_final ON public.care_schedule_proposals;
CREATE TRIGGER trg_care_proposals_final BEFORE UPDATE ON public.care_schedule_proposals
  FOR EACH ROW EXECUTE FUNCTION public.agenda_final_status_guard('accepted', 'declined', 'counterproposal', 'withdrawn');
REVOKE ALL ON FUNCTION public.agenda_final_status_guard() FROM anon, authenticated, public;

COMMIT;
