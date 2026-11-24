-- Phase 2 / domain 1 (family): circle members & caregivers.
-- Additive only: new columns on family_caregivers, indexes and updated_at triggers. No data is dropped.
-- * child_ids: which children a circle member belongs to (also contact-only entries without permissions)
-- * valid_from / valid_to: access period (dates, inclusive), enforced by manage-caregivers
-- * address, photo_url (private bucket "avatars/caregivers/<id>/..."), invited_at, accepted_at, revoked_at/by, updated_by
-- Status values used by the app: contact_only | invited | active | revoked (old rows keep theirs).
BEGIN;

ALTER TABLE public.family_caregivers
  ADD COLUMN IF NOT EXISTS child_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_to date,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Existing members: their children follow from the permission rows they already have.
UPDATE public.family_caregivers f
SET child_ids = sub.ids
FROM (
  SELECT caregiver_id, array_agg(DISTINCT child_id) AS ids
  FROM public.caregiver_permissions
  GROUP BY caregiver_id
) sub
WHERE sub.caregiver_id = f.id
  AND cardinality(f.child_ids) = 0;

-- The old timestamp end becomes the inclusive end date (Dutch calendar day).
UPDATE public.family_caregivers
SET valid_to = (valid_until AT TIME ZONE 'Europe/Amsterdam')::date
WHERE valid_to IS NULL AND valid_until IS NOT NULL;

-- A link only ever works for an invited member: existing tokens of active members are rotated so
-- old e-mail links (and the old "caregiver id as token" shortcut) stop granting anything.
UPDATE public.family_caregivers
SET invite_token = gen_random_uuid()
WHERE status IS DISTINCT FROM 'invited';

CREATE INDEX IF NOT EXISTS idx_family_caregivers_child_ids ON public.family_caregivers USING gin (child_ids);
CREATE INDEX IF NOT EXISTS idx_caregiver_permissions_child ON public.caregiver_permissions (child_id);

DROP TRIGGER IF EXISTS trg_family_caregivers_updated_at ON public.family_caregivers;
CREATE TRIGGER trg_family_caregivers_updated_at
  BEFORE UPDATE ON public.family_caregivers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_caregiver_permissions_updated_at ON public.caregiver_permissions;
CREATE TRIGGER trg_caregiver_permissions_updated_at
  BEFORE UPDATE ON public.caregiver_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Still locked down: only the service role (edge functions) touches these tables.
REVOKE ALL ON TABLE public.family_caregivers FROM anon, authenticated, public;
REVOKE ALL ON TABLE public.caregiver_permissions FROM anon, authenticated, public;

COMMIT;
