-- Phase 1 follow-up: custody is only "filled in" once a parent chose it.
-- The old app never wrote children.custody (it stored the choice in practical_notes JSON as "custody"),
-- so existing 'gezamenlijk' values are just the column default. New children are created with
-- custody NULL (manage-children create); this migration fixes existing rows and drops the default.
BEGIN;

ALTER TABLE public.children ALTER COLUMN custody DROP DEFAULT;

CREATE OR REPLACE FUNCTION pg_temp.safe_jsonb(t text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF t IS NULL OR btrim(t) = '' THEN RETURN NULL; END IF;
  RETURN t::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

-- Rows whose custody was never chosen through the new save-custody (no custody_meta):
-- take the old app's choice from practical_notes.custody when present, else clear it.
UPDATE public.children c
SET custody = NULLIF(btrim(pg_temp.safe_jsonb(c.practical_notes) ->> 'custody'), '')
WHERE c.custody IS NOT NULL
  AND (pg_temp.safe_jsonb(c.practical_notes) -> 'custody_meta') IS NULL;

COMMIT;
