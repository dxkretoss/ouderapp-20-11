-- ==============================================================================
-- Invitation e-mail delivery status (28 Nov 2026).
-- An invitation row could exist while its e-mail was never sent (e.g. missing PUBLIC_APP_URL or an
-- SMTP error). The app now shows "Niet verstuurd" and offers "Opnieuw versturen".
-- Additive and idempotent. Run after 20261127000002_release_2026_11.sql.
-- ==============================================================================
BEGIN;

ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS email_status text;        -- 'sent' | 'failed' | NULL (unknown, older rows)
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;  -- last successful send
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS email_attempts int NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE public.invitations ADD CONSTRAINT invitations_email_status_check
    CHECK (email_status IS NULL OR email_status IN ('sent', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
