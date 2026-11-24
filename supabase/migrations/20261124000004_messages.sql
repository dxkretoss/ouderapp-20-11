-- Phase 2 / domain 4: messages between the two connected parents + server-side AI.
-- Additive and idempotent: never drops data, keeps every old column.
--  * conversations: a conversation belongs to its creator and (once connected) the other parent.
--    other_parent_id IS NULL = a prepared topic ("onderwerp") of a parent without a connected co-parent;
--    manage-messages attaches it to the co-parent once one is connected.
--  * conversation_reads: per-user read marker, pin and mute (so unread counts and preferences follow the account).
--  * messages: append-only (no UPDATE); client_id makes a retried send idempotent.
--  * ai_requests: per-user rate limit for the AI edge functions (only timestamps + feature name, never content).
BEGIN;

-- ---------------------------------------------------------------- conversations
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_message_sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON public.conversations (created_by);
CREATE INDEX IF NOT EXISTS idx_conversations_other_parent ON public.conversations (other_parent_id);

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON public.conversations;
CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Fill the new column for existing conversations from their latest message.
UPDATE public.conversations c
SET last_message_sender_id = m.sender_id
FROM (
  SELECT DISTINCT ON (conversation_id) conversation_id, sender_id
  FROM public.messages
  ORDER BY conversation_id, created_at DESC
) m
WHERE m.conversation_id = c.id
  AND c.last_message_sender_id IS NULL;

-- ---------------------------------------------------------------- messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS client_id TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages (conversation_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_client_id
  ON public.messages (conversation_id, sender_id, client_id)
  WHERE client_id IS NOT NULL;

-- Messages are history: once written they never change (deleting only happens through cascades,
-- e.g. when an account is deleted).
CREATE OR REPLACE FUNCTION public.messages_no_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'messages are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_no_update ON public.messages;
CREATE TRIGGER trg_messages_no_update
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_no_update();

-- ---------------------------------------------------------------- per-user state
CREATE TABLE IF NOT EXISTS public.conversation_reads (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ,
  pinned BOOLEAN NOT NULL DEFAULT false,
  muted_until TIMESTAMPTZ,
  archived BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_conversation_reads_user ON public.conversation_reads (user_id);

DROP TRIGGER IF EXISTS trg_conversation_reads_updated_at ON public.conversation_reads;
CREATE TRIGGER trg_conversation_reads_updated_at
  BEFORE UPDATE ON public.conversation_reads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The old shared is_pinned flag becomes the creator's own pin (the other parent never chose it).
INSERT INTO public.conversation_reads (conversation_id, user_id, pinned, archived, last_read_at)
SELECT c.id, c.created_by, c.is_pinned, c.is_archived, now()
FROM public.conversations c
WHERE c.created_by IS NOT NULL
  AND (c.is_pinned OR c.is_archived)
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- ---------------------------------------------------------------- AI rate limit
CREATE TABLE IF NOT EXISTS public.ai_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_requests_user_time ON public.ai_requests (user_id, created_at DESC);

-- ---------------------------------------------------------------- lock down (same as Phase 1)
ALTER TABLE public.conversation_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversation_reads FROM anon, authenticated, public;
REVOKE ALL ON public.ai_requests FROM anon, authenticated, public;
REVOKE ALL ON SEQUENCE public.ai_requests_id_seq FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.messages_no_update() FROM anon, authenticated, public;
GRANT ALL ON public.conversation_reads TO service_role;
GRANT ALL ON public.ai_requests TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ai_requests_id_seq TO service_role;

COMMIT;
