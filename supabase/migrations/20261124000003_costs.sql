-- Phase 2 / domain 3 (Costs): expenses, receipts, budgets + steps, settlements, fixed costs,
-- still-needed items and the shared family cost agreement.
-- Additive and idempotent: only new columns/tables/indexes/triggers; no data is dropped.
-- Family scope for cost records is the PAIR of parents: `created_by` (or legacy payer/user) and
-- `other_parent_id` (the connected co-parent at creation time; NULL = only for the creator).
BEGIN;

-- ---------------------------------------------------------------- expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS other_parent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS child_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS paid_from text NOT NULL DEFAULT 'eigen';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS split_choice text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS turn_to_respond uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS counter_pending boolean NOT NULL DEFAULT false;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS settlement_id uuid REFERENCES public.settlements(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS over_budget_amount numeric(10, 2);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS over_budget_approved boolean;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_paid_from_check') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_paid_from_check CHECK (paid_from IN ('eigen', 'kindrekening'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_split_choice_check') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_split_choice_check CHECK (split_choice IS NULL OR split_choice IN ('standaard', '50', 'anders', 'volledig'));
  END IF;
END $$;

-- Legacy rows: the payer created them; a single child becomes the child list.
UPDATE public.expenses SET created_by = payer_id WHERE created_by IS NULL AND payer_id IS NOT NULL;
UPDATE public.expenses SET child_ids = ARRAY[child_id] WHERE child_id IS NOT NULL AND cardinality(child_ids) = 0;

CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON public.expenses (created_by);
CREATE INDEX IF NOT EXISTS idx_expenses_other_parent ON public.expenses (other_parent_id);
CREATE INDEX IF NOT EXISTS idx_expenses_budget ON public.expenses (budget_id);
CREATE INDEX IF NOT EXISTS idx_expenses_settlement ON public.expenses (settlement_id);

-- Append-only response/comment history per expense.
CREATE TABLE IF NOT EXISTS public.expense_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  step_type text NOT NULL CHECK (step_type IN ('toegevoegd', 'akkoord', 'ander_voorstel', 'niet_akkoord', 'meer_tijd', 'opmerking', 'verrekend')),
  amount numeric(10, 2),
  payer_pct numeric(5, 2),
  note text,
  review_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expense_steps_expense ON public.expense_steps (expense_id);

-- Receipts / attachments in the private `receipts` bucket (served as 1 h signed URLs).
CREATE TABLE IF NOT EXISTS public.expense_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'bon' CHECK (kind IN ('bon', 'bijlage')),
  storage_path text NOT NULL,
  file_name text,
  mime text,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense ON public.expense_attachments (expense_id);

-- ---------------------------------------------------------------- budgets
ALTER TABLE public.budget_proposals ADD COLUMN IF NOT EXISTS other_parent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.budget_proposals ADD COLUMN IF NOT EXISTS child_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.budget_proposals ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;
UPDATE public.budget_proposals SET child_ids = ARRAY[child_id] WHERE child_id IS NOT NULL AND cardinality(child_ids) = 0;
CREATE INDEX IF NOT EXISTS idx_budget_proposals_other_parent ON public.budget_proposals (other_parent_id);

ALTER TABLE public.budget_steps ADD COLUMN IF NOT EXISTS creator_pct numeric(5, 2);
ALTER TABLE public.budget_steps ADD COLUMN IF NOT EXISTS review_at timestamptz;

-- ---------------------------------------------------------------- settlements
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS bank_account_name text;
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS bank_iban text;
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS requested_at timestamptz;
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS finished_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_settlements_created_by ON public.settlements (created_by);

CREATE TABLE IF NOT EXISTS public.settlement_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_settlement_steps_settlement ON public.settlement_steps (settlement_id);

-- ---------------------------------------------------------------- fixed costs / still needed
ALTER TABLE public.recurring_expenses ADD COLUMN IF NOT EXISTS other_parent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.recurring_expenses ADD COLUMN IF NOT EXISTS child_ids uuid[] NOT NULL DEFAULT '{}';
UPDATE public.recurring_expenses SET child_ids = ARRAY[child_id] WHERE child_id IS NOT NULL AND cardinality(child_ids) = 0;
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_created_by ON public.recurring_expenses (created_by);

ALTER TABLE public.still_needed_items ADD COLUMN IF NOT EXISTS other_parent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.still_needed_items ADD COLUMN IF NOT EXISTS child_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.still_needed_items ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.still_needed_items ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;
UPDATE public.still_needed_items SET child_ids = ARRAY[child_id] WHERE child_id IS NOT NULL AND cardinality(child_ids) = 0;
CREATE INDEX IF NOT EXISTS idx_still_needed_items_other_parent ON public.still_needed_items (other_parent_id);

-- ---------------------------------------------------------------- family cost agreement
-- Versioned: every save is a new row. Solo (no co-parent) applies directly ('bevestigd');
-- with a co-parent it is 'voorgesteld' until the partner confirms. Percentages are the proposer's share.
CREATE TABLE IF NOT EXISTS public.cost_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  partner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  split_mode text NOT NULL DEFAULT 'alleen' CHECK (split_mode IN ('alleen', '50', 'eigen', 'per-uitgave')),
  proposer_pct numeric(5, 2) NOT NULL DEFAULT 50 CHECK (proposer_pct >= 0 AND proposer_pct <= 100),
  settle_moment text NOT NULL DEFAULT 'maand' CHECK (settle_moment IN ('direct', 'week', 'maand', 'kwartaal', 'zelf')),
  approval_threshold numeric(10, 2) CHECK (approval_threshold IS NULL OR approval_threshold >= 0),
  status text NOT NULL DEFAULT 'voorgesteld' CHECK (status IN ('voorgesteld', 'bevestigd', 'afgewezen', 'vervangen')),
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cost_agreements_proposed_by ON public.cost_agreements (proposed_by);
CREATE INDEX IF NOT EXISTS idx_cost_agreements_partner ON public.cost_agreements (partner_id);

-- ---------------------------------------------------------------- append-only guards
CREATE OR REPLACE FUNCTION public.costs_forbid_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only table %: rows cannot be changed', TG_TABLE_NAME;
END $$;

DROP TRIGGER IF EXISTS expense_steps_append_only ON public.expense_steps;
CREATE TRIGGER expense_steps_append_only BEFORE UPDATE ON public.expense_steps FOR EACH ROW EXECUTE FUNCTION public.costs_forbid_update();
DROP TRIGGER IF EXISTS budget_steps_append_only ON public.budget_steps;
CREATE TRIGGER budget_steps_append_only BEFORE UPDATE ON public.budget_steps FOR EACH ROW EXECUTE FUNCTION public.costs_forbid_update();
DROP TRIGGER IF EXISTS settlement_steps_append_only ON public.settlement_steps;
CREATE TRIGGER settlement_steps_append_only BEFORE UPDATE ON public.settlement_steps FOR EACH ROW EXECUTE FUNCTION public.costs_forbid_update();

-- ---------------------------------------------------------------- lockdown for the new tables
ALTER TABLE public.expense_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_agreements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.expense_steps, public.expense_attachments, public.settlement_steps, public.cost_agreements FROM anon, authenticated, public;
GRANT ALL ON TABLE public.expense_steps, public.expense_attachments, public.settlement_steps, public.cost_agreements TO service_role;
REVOKE ALL ON FUNCTION public.costs_forbid_update() FROM anon, authenticated, public;

COMMIT;
