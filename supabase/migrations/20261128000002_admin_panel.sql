-- =====================================================================
-- Super admin panel (separate project: ouderapp_admin_react)
--
-- 1. profiles.disabled_at / disabled_reason: an admin can disable an account.
--    A disabled account cannot log in and every session is refused (see _shared/session.ts).
-- 2. admin_sessions: admin panel sessions, SEPARATE from user_sessions.
--    Short-lived (8 h absolute, 30 min idle; enforced in admin-api), only the sha256 of the token is stored.
--    A normal app token never works in the admin panel and an admin token never works in the app.
-- 3. admin_audit_log: every admin action (login, logout, view user, disable, enable, revoke sessions…).
--
-- Like every other table: RLS on, no policies, no grants for anon/authenticated.
-- Only the service role (edge function admin-api) can read or write.
--
-- Run BEFORE deploying the updated edge functions (session.ts selects profiles.disabled_at).
-- =====================================================================

-- 1. Disable accounts -------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS disabled_reason text;
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_last_login ON public.profiles (last_login_at DESC);

-- 2. Admin sessions ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  ip           text,
  user_agent   text
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON public.admin_sessions (admin_id);
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

-- 3. Admin audit log --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id         bigserial PRIMARY KEY,
  admin_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action     text NOT NULL,
  target_id  uuid,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON public.admin_audit_log (target_id);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Browser roles: nothing. Service role: everything.
REVOKE ALL ON TABLE public.admin_sessions, public.admin_audit_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.admin_audit_log_id_seq FROM anon, authenticated;
GRANT ALL ON TABLE public.admin_sessions, public.admin_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.admin_audit_log_id_seq TO service_role;

-- The super admin never uses the parent app: revoke any app sessions it may still have.
UPDATE public.user_sessions s
   SET revoked_at = now()
  FROM public.profiles p
 WHERE p.id = s.user_id AND p.role = 'superadmin' AND s.revoked_at IS NULL;
