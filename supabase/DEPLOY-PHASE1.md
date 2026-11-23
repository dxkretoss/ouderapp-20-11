# Phase 1 (Milestone 1) — deploy guide

This release locks the database down (the browser can no longer read or write any table, RPC or storage file directly), replaces the auth backend and rewrites the profile/children/invitation functions. Do the steps **in this order**. Nothing in this repo is ever run against your project automatically.

Placeholders used below:

| placeholder | meaning |
|---|---|
| `<PROJECT_REF>` | your Supabase project ref (Dashboard → Project Settings → General) |
| `<ANON_KEY>` | the project's anon/public key (Project Settings → API) |
| `<APP_URL>` | the public URL of the web app, e.g. `https://app.example.nl` |

---

## 0. Before you start

- Install / update the Supabase CLI and log in: `supabase login`, then link this repo once: `supabase link --project-ref <PROJECT_REF>` (run inside `D:\ouderapp_react 20-11`).
- Plan a short maintenance window: from step 2 on, **old app versions stop working** (see §7).
- **Never run `supabase/schema.sql` against the live project again.** It is only the historical baseline. Among other things it deletes every profile without an `auth.users` row and re-creates the old open policies.

## 1. Back up the database

Pick one (both is better):

- Dashboard → Database → Backups: check that a recent backup exists (paid plans), or
- `supabase db dump --linked -f backup-before-phase1.sql` and `supabase db dump --linked --data-only -f backup-before-phase1-data.sql` — keep these files somewhere safe (they contain personal data).

## 2. Run the migration

Files, **in this order** (each is one transaction and safe to run twice):
1. `supabase/migrations/20261123000001_phase1_lockdown.sql`
2. `supabase/migrations/20261123000002_custody_default.sql` — drops the misleading `children.custody` default (`'gezamenlijk'`): existing children keep the old app's real choice from `practical_notes.custody`, otherwise custody becomes empty until a parent fills it in.

**Option A — SQL editor (recommended):** Dashboard → SQL Editor → New query → paste file 1 → Run; then the same for file 2. It must end without errors. `WARNING` lines mean a step needs a manual follow-up (see §2.1).

**Option B — CLI:** `supabase db push`. The project has no migration history yet, so the CLI will apply both files in order. (The file contains its own `BEGIN/COMMIT`; that is fine in the SQL editor. With `db push` you may see a "transaction already in progress" notice — harmless.)

What it does: removes all `USING (true)` policies and every anon/authenticated grant on `public`; makes the buckets `avatars, child-avatars, receipts, documents, moments` private and drops their storage policies; adds `user_sessions`, hashed one-time codes (+ `auth_rate_events` for rate limiting), `profiles.preferences`, `children.description/profile`, `child_private_notes` (moves the private notes out of the shared child row); re-hashes every plaintext password with bcrypt; removes the admin backdoor password; lower-cases all e-mail addresses; allows invitation status `revoked`; dedupes `parent_connections` and adds a unique undirected pair index; adds `updated_at` triggers.

### 2.1 Verify (SQL editor)

```sql
-- must return 0 rows: no policies left on public tables
select tablename, policyname from pg_policies where schemaname = 'public';
-- must return 0 rows: no storage policies for the app buckets
select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and (coalesce(qual,'') || coalesce(with_check,'')) ~ '(avatars|child-avatars|receipts|documents|moments)';
-- all false
select id, public from storage.buckets;
-- must return 0 rows: no plaintext passwords
select email from public.profiles where password is not null and password !~ '^\$2[aby]\$';
-- must return 0 rows: browser roles have no table rights
select grantee, table_name from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated');
```

If a storage-policy query still returns rows (the migration printed a WARNING because of storage ownership): delete those policies in Dashboard → Storage → Policies. If the migration warned that it could not scramble the admin's `auth.users` password: Dashboard → Authentication → Users → `ouderschap@admin.com` → delete the user (or set a long random password).

### 2.2 Supabase Auth (GoTrue) settings

The app does not use Supabase Auth. Dashboard → Authentication → Sign In / Providers: **disable "Allow new users to sign up"** (keeps people from creating `auth.users` rows — which the old trigger mirrors into `profiles` — through the public Auth API).

## 3. Set the function secrets

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically — do not set them.

```bash
# e-mail (same names as before; SMTP is tried first, Resend API is the fallback)
supabase secrets set SMTP_HOST=... SMTP_PORT=... SMTP_USER=... SMTP_PASS=... SMTP_FROM="Ouderschap & Co <noreply@your-domain>"
# and/or
supabase secrets set RESEND_API_KEY=...

# links in e-mails
supabase secrets set PUBLIC_APP_URL=<APP_URL>
# origins a client may ask for in send-invitation.redirect_origin (comma-separated, exact origins)
supabase secrets set APP_ORIGINS="<APP_URL>,http://localhost:5173"

# AI functions (server-side only)
supabase secrets set OPENAI_API_KEY=...

# no longer used — remove if present
supabase secrets unset JWT_SECRET
```

Also **remove `VITE_OPENAI_API_KEY`** from every `.env*` file and from the hosting provider's build variables: any `VITE_*` value can end up in the browser bundle. The web app only needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

`supabase secrets list` shows names only — check that the ones above are there.

## 4. Deploy the functions

All functions verify the custom session themselves, so all are deployed **without** gateway JWT verification (`supabase/config.toml` sets `verify_jwt = false` for each; the flag below makes it explicit).

Phase 1 functions (rewritten):

```bash
supabase functions deploy custom-auth --no-verify-jwt
supabase functions deploy manage-profile --no-verify-jwt
supabase functions deploy manage-children --no-verify-jwt
supabase functions deploy send-invitation --no-verify-jwt
supabase functions deploy accept-invitation --no-verify-jwt
```

Phase 2 functions (not rewritten, but now require a valid session and ignore user ids in the body — see §8):

```bash
supabase functions deploy manage-expenses --no-verify-jwt
supabase functions deploy manage-messages --no-verify-jwt
supabase functions deploy manage-handover --no-verify-jwt
supabase functions deploy manage-tasks --no-verify-jwt
supabase functions deploy manage-documents --no-verify-jwt
supabase functions deploy manage-moments --no-verify-jwt
supabase functions deploy manage-still-needed --no-verify-jwt
supabase functions deploy manage-vacations --no-verify-jwt
supabase functions deploy manage-agreements --no-verify-jwt
supabase functions deploy manage-caregivers --no-verify-jwt
supabase functions deploy log-audit --no-verify-jwt
supabase functions deploy send-notification --no-verify-jwt
supabase functions deploy ai-assistant --no-verify-jwt
supabase functions deploy ai-coach --no-verify-jwt
supabase functions deploy co-assistant --no-verify-jwt
```

## 5. Remove the retired functions

These are replaced by `custom-auth` (and `manage-admin` returns in Milestone 3). Their folders in this repo only contain a `410 GONE` stub. Either delete them right away:

```bash
supabase functions delete auth-login
supabase functions delete auth-signup
supabase functions delete auth-reset-password
supabase functions delete send-verification-email
supabase functions delete create-profile
supabase functions delete manage-admin
```

…or, if old app versions are still out there for a while, first deploy the stubs (`supabase functions deploy auth-login --no-verify-jwt`, etc.) so they get a clean `410 {"success":false,"code":"GONE"}`, and delete them later. **Do not leave the old versions deployed** — `manage-admin` accepts `{"email":"ouderschap@admin.com"}` as admin proof and `send-verification-email` leaks codes.

## 6. Smoke test (manual)

```bash
BASE=https://<PROJECT_REF>.supabase.co/functions/v1
H=(-H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" -H "Content-Type: application/json")
```

1. **Database is closed** — must return an error / `[]`-with-401, never rows:
   `curl "https://<PROJECT_REF>.supabase.co/rest/v1/profiles?select=*" -H "apikey: <ANON_KEY>"` → `permission denied` (401/403).
2. **Register:** `curl "${H[@]}" $BASE/custom-auth -d '{"action":"register","email":"you+test1@example.com","password":"Testwacht1!","name":"Test","lang":"nl"}'` → `{"success":true,"needs_verification":true,...}` and an e-mail with a 6-digit code. The response must **not** contain the code.
3. **Weak password:** same with `"password":"abc"` → 400 `WEAK_PASSWORD`.
4. **Wrong code:** `{"action":"verify-email","email":"you+test1@example.com","code":"000000"}` → 400 `CODE_INVALID` (after 5 wrong tries: 429 `TOO_MANY_ATTEMPTS`).
5. **Verify:** with the real code → `{"session_token":"<64 hex>","user":{...}}`. Save it as `TOKEN`.
6. **Session:** `curl "${H[@]}" -H "x-session-token: $TOKEN" $BASE/custom-auth -d '{"action":"me"}'` → your user. Without the header → 401 `UNAUTHORIZED`.
7. **Login:** `{"action":"login","email":"you+test1@example.com","password":"Testwacht1!"}` → new session; wrong password → 401 `INVALID_CREDENTIALS`.
8. **Existing user with an old plaintext password** can log in with that same password (it was re-hashed).
9. **Admin backdoor closed:** login as `ouderschap@admin.com` with the old password → 401 `INVALID_CREDENTIALS`; `curl "${H[@]}" $BASE/manage-admin -d '{"email":"ouderschap@admin.com","action":"stats"}'` → 410 or 404 (deleted).
10. **Children:** `{"action":"create","name":"Testkind"}` on `manage-children` with `x-session-token` → `{"child":{...}}`; `{"action":"list"}` → contains it, without `bsn`; `{"action":"get","child_id":"<id>"}` → includes `bsn`. With another user's token → 404 `NOT_FOUND`.
11. **Private note:** `save-private-note` then `get-private-note` as the same user → note; as the co-parent → empty string.
12. **Avatar:** `manage-profile` `{"action":"set-avatar","image_base64":"data:image/jpeg;base64,..."}` → `user.avatar` is a signed URL that opens in a browser for ~1 h; the file is not reachable via `/storage/v1/object/public/avatars/...`.
13. **Invitation:** `send-invitation` `{"to_email":"you+test2@example.com","child_ids":["<id>"]}` → `invite_link` + e-mail. `accept-invitation` `{"action":"inspect","token":"<token>"}` (no session) → masked e-mail, inviter name, children. Accept with a session of a **different** e-mail → 403 `INVITE_EMAIL_MISMATCH`; with test2's session → connection + children. `{"action":"list-connected"}` → the co-parent; `{"action":"disconnect","co_parent_id":"<id>"}` → `{}`.
14. **Password reset:** `request-password-reset` → e-mail; `verify-reset-code` → `{"valid":true}`; `reset-password` → new session, and the old `TOKEN` now gives 401.
15. **Logout:** `{"action":"logout"}` with `x-session-token` → `{}`; the token gives 401 afterwards.
16. **Phase 2 gate:** `curl "${H[@]}" $BASE/manage-expenses -d '{"action":"list-expenses"}'` without a session → 401 `UNAUTHORIZED`.
17. Delete the test accounts: `manage-profile` `{"action":"delete-account","password":"..."}`.

## 7. Consequences (tell your users / testers)

- **Everybody is logged out.** All old session tokens (`profiles.session_token`, self-signed JWTs) are invalid; users log in again with their e-mail and password.
- **Old app versions stop working**: they read tables and storage directly with the anon key and call the retired functions/RPCs. Only the new web app works after this release.
- **Users with legacy state:**
  - plaintext passwords were re-hashed — the same password still works;
  - users who never verified their e-mail get `NOT_VERIFIED` on login and receive a fresh code;
  - pending verification/reset codes sent before the migration are void — request a new one;
  - accounts without a password (e.g. created through the old Supabase-Auth path) can only get in via "forgot password".
- **Admin account disabled** until Milestone 3 rebuilds the admin area (no password, `manage-admin` retired).
- **Images:** all buckets are private now. Existing avatar URLs are converted to signed URLs by the Phase 1 functions automatically. Phase 2 functions that still hand out *public* URLs (receipts, moments) return links that no longer open — see §8.
- **Realtime:** subscriptions with the anon key no longer receive table changes (no policies). Phase 2 will add server-side alternatives.
- Invitations now expire after 14 days and must be accepted by an account with **the same e-mail address** they were sent to.

## 8. Phase 2: to secure

These functions now require a valid session and their `user_id/userId/parent_id/actor_id/actorId` body fields are overwritten with the session user (`_shared/phase2-guard.ts`). They still lack **object-level** checks — any signed-in user can act on records of other families if they know/guess the id. Rewrite each with `requireUser` + `access.ts` in Phase 2:

| function | remaining problems |
|---|---|
| `manage-expenses` | `list-expenses`, `list-settlements`, `list-budget-proposals`, `list-recurring-expenses`, `list-savings-pots` return **all families' data**; create/update/delete take raw rows and ids without ownership checks; `upload-receipt` returns a public URL (bucket is private now → broken link). |
| `manage-messages` | `get_messages`, `send_message`, `update_topic`, `delete_topic` have no participant check. |
| `manage-handover` | update/toggle/delete item and delete routine by bare id. |
| `manage-tasks`, `manage-still-needed`, `manage-vacations`, `manage-agreements` | toggle/update/delete by bare id without ownership check; "connected parents" still derived from accepted invitations. |
| `manage-documents` | delete by id without ownership check; `is_shared=false` ignored; no signed-URL download. |
| `manage-moments` | delete by id; `upload-photo` returns a public URL (bucket private → broken link). |
| `manage-caregivers` | `get-by-token` / `accept` are public by design (caregiver link `?t=`) and accept the **caregiver id** as token; returns `invite_token` in lists; update/delete by id without ownership check; e-mail link origin taken from the body. |
| `log-audit` | `list` returns the latest 100 events of **all** users. |
| `send-notification` | stub; any signed-in user may call it. |
| `ai-assistant`, `ai-coach`, `co-assistant` | session required now, but no per-user rate limit (OpenAI cost); `co-assistant` passes client-supplied history (incl. `system` messages) to OpenAI. |
| database | old `custom_*` RPCs and the auth-sync triggers still exist (no grants for the browser); drop them in Phase 2. `children.bsn` is stored in plaintext. |
