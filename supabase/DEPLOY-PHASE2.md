# Phase 2 (Milestone 2) — deploy guide

Phase 2 moves every own-family module onto the server: family/circle, agenda & care, costs, messages + all AI, and the practical modules (tasks, belongings, moments, documents, agreements, history, notifications). It adds five migrations and rewrites/adds edge functions. **Phase 1 (`DEPLOY-PHASE1.md`) must already be live.** Do the steps in this order. Nothing in this repo runs against your project automatically.

Placeholders: `<PROJECT_REF>` (Dashboard → Project Settings → General), `<ANON_KEY>` (Project Settings → API), `<APP_URL>` (public URL of the web app).

---

## 0. Before you start

- Supabase CLI logged in and linked (`supabase link --project-ref <PROJECT_REF>`, inside `D:\ouderapp_react 20-11`).
- Deploy the **functions and the web app together** right after the migrations: the new web app needs the new actions (e.g. `manage-agenda`, `manage-expenses overview`), and the old web app does not understand the new response shapes.
- **Never run `supabase/schema.sql`** against the live project (historical baseline only).

## 1. Back up the database

`supabase db dump --linked -f backup-before-phase2.sql` and `supabase db dump --linked --data-only -f backup-before-phase2-data.sql` (keep them safe — personal data), and/or check Dashboard → Database → Backups.

## 2. Run the migrations

Files, **in this order**. Each is one transaction, additive (new columns/tables/indexes/triggers only, old columns kept, no data dropped) and safe to run twice.

| # | File | What it does |
|---|---|---|
| 1 | `migrations/20261124000001_family.sql` | Circle / caregivers: `family_caregivers` gets `child_ids`, `address`, `photo_url`, `valid_from`/`valid_to` (access period, inclusive dates), `invited_at`, `accepted_at`, `revoked_at`/`revoked_by`, `updated_by`. Backfills `child_ids` from `caregiver_permissions` and `valid_to` from `valid_until`. **Rotates the `invite_token` of every member that is not in status `invited`** (old e-mail links and the old "caregiver id as token" shortcut stop working; open invitations keep their link). Indexes, `updated_at` triggers, keeps both tables locked down. |
| 2 | `migrations/20261124000002_agenda.sql` | Agenda & care: `calendar_events` gets `child_ids`, `category_key`, `take_along`, `meta`, soft delete; new `calendar_event_proposals` (one open proposal per appointment) and `appointment_attendance`; `care_schedule_proposals` gets the proposal fields (`soort`, `dates`, `naar`, `wisseltijd`, `plek`, `reply_by`, `more_time`, `reminders`, `alternative`, …); new `care_schedule_exceptions` (one-off changes) and `care_schedule_versions` (structural changes from a date); `vacations` gets `fields`, `confirmed`, `history`, `response`; handover checklist/log columns (`source`, `packed_by/at`, `received`, `removed`, `moment_id`, `content`, `to_parent`); new `urgent_requests` (Nu afstemmen). Parent references are stored as absolute tokens (`is:<uuid>` / `not:<uuid>`). Trigger `agenda_final_status_guard` freezes final statuses of appointment and care proposals. RLS on + no grants for the new tables. |
| 3 | `migrations/20261124000003_costs.sql` | Costs: `expenses` gets `created_by`, `other_parent_id` (the parent pair), `child_ids`, `paid_from`, `split_choice`, `turn_to_respond`, `counter_pending`, `confirmed_by/at`, `settlement_id`, over-budget fields; backfills `created_by` from `payer_id`. New `expense_steps` (append-only responses/comments), `expense_attachments` (receipts in the private `receipts` bucket), `settlement_steps` (append-only), `cost_agreements` (versioned family agreement: split, settle moment, approval limit). `budget_proposals`/`budget_steps`, `settlements` (bank details, payment request), `recurring_expenses`, `still_needed_items` get the new columns. Trigger `costs_forbid_update` makes the three step tables append-only. |
| 4 | `migrations/20261124000004_messages.sql` | Messages + AI: `conversations` gets `last_message_sender_id` (+ indexes on creator / other parent); `messages` gets `client_id` (idempotent retries, unique per sender) and trigger `messages_no_update` (append-only). New `conversation_reads` (per-user read marker, pin, mute, archive — the old shared `is_pinned`/`is_archived` become the creator's own flags) and `ai_requests` (per-user AI rate limit: user, feature, time — never content). |
| 5 | `migrations/20261124000005_practical.sql` | Practical & agreements: `tasks` gets `child_ids`, `assignee_id`, `requested_to/by`, `contact_status`, completion and soft delete (backfilled from the old text fields); new `belongings`; `shared_moments` gets `visibility`, `circle_ids`, `phase`, `milestone`, `entry_kind`, `happened_on`; new `moment_reactions`; `documents` gets `source`, `file_name`, soft delete and the `documents` bucket allows pdf/images/Word/txt (buckets stay private); `parent_agreements` gets versioning/proposal/decision columns; `audit_events` gets `child_ids`, `item_label`, `changes`, `meta`, `origin` and trigger `audit_events_append_only`; `notifications` gets `category`, `read_at`, `entity_type/id`, `child_ids`; new `activity_reads` and `evaluations`. |

**SQL editor (recommended):** Dashboard → SQL Editor → paste file 1 → Run, then files 2–5 one by one. Each must end without errors. **CLI alternative:** `supabase db push` (applies the files not yet in the migration history, in name order).

### 2.1 Verify (SQL editor)

```sql
-- 1. new tables exist (all non-null)
select to_regclass('public.calendar_event_proposals'), to_regclass('public.appointment_attendance'),
       to_regclass('public.care_schedule_exceptions'), to_regclass('public.care_schedule_versions'),
       to_regclass('public.urgent_requests'), to_regclass('public.expense_steps'),
       to_regclass('public.expense_attachments'), to_regclass('public.settlement_steps'),
       to_regclass('public.cost_agreements'), to_regclass('public.conversation_reads'),
       to_regclass('public.ai_requests'), to_regclass('public.belongings'),
       to_regclass('public.moment_reactions'), to_regclass('public.activity_reads'),
       to_regclass('public.evaluations');

-- 2. key new columns exist (expect 12 rows)
select table_name, column_name from information_schema.columns
where table_schema = 'public' and (table_name, column_name) in (
  ('family_caregivers','child_ids'), ('family_caregivers','valid_to'),
  ('calendar_events','child_ids'), ('care_schedule_proposals','soort'),
  ('expenses','created_by'), ('expenses','other_parent_id'), ('expenses','turn_to_respond'),
  ('messages','client_id'), ('tasks','assignee_id'), ('shared_moments','visibility'),
  ('audit_events','child_ids'), ('notifications','read_at'))
order by 1, 2;

-- 3. still locked down: must return 0 rows (no policies, no browser grants)
select tablename, policyname from pg_policies where schemaname = 'public';
select grantee, table_name from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated');

-- 4. RLS is on for every public table: must return 0 rows
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 5. append-only / final-status triggers exist (expect 7 rows)
select event_object_table, trigger_name from information_schema.triggers
where trigger_schema = 'public' and trigger_name in (
  'trg_event_proposals_final','trg_care_proposals_final','expense_steps_append_only',
  'budget_steps_append_only','settlement_steps_append_only','trg_messages_no_update',
  'audit_events_append_only')
group by 1, 2 order by 1;

-- 6. buckets still private (all false)
select id, public from storage.buckets;

-- 7. backfills: expect 0 (every legacy expense has an owner)
select count(*) from public.expenses where created_by is null and payer_id is not null;
```

If query 4 lists tables, they were not covered by Phase 1 either — run `alter table public.<name> enable row level security;` for each (the functions use the service role and are not affected).

## 3. Function secrets

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically. The Phase 1 secrets (SMTP/Resend, `PUBLIC_APP_URL`, `APP_ORIGINS`) stay as they are; the circle invitation e-mail (`manage-caregivers send-invite-email`) uses them too.

AI now runs only in the edge functions (`_shared/ai-openai.ts`):

```bash
supabase secrets set OPENAI_API_KEY=sk-...            # required for every AI feature
# optional (defaults in brackets)
supabase secrets set OPENAI_MODEL=gpt-4o-mini          # chat / structured output model [gpt-4o-mini]
supabase secrets set OPENAI_TRANSCRIBE_MODEL=whisper-1 # speech input in the assistant [whisper-1]
supabase secrets set AI_RATE_PER_MINUTE=20             # AI calls per user per minute [20]
supabase secrets set AI_RATE_PER_DAY=300               # AI calls per user per day [300]
```

Without `OPENAI_API_KEY` the AI actions fail with a calm "not available" message; nothing else is affected. `VITE_OPENAI_API_KEY` / `VITE_LOVABLE_API_KEY` are no longer read anywhere and were already removed from the `.env` files — make sure they are also absent from the hosting provider's build variables (any `VITE_*` value ends up in the browser bundle). `supabase secrets list` shows the names.

## 4. Deploy the functions

Every function checks the custom session itself, so all are deployed **without** gateway JWT verification (`supabase/config.toml` sets `verify_jwt = false` for every function folder, including the new `manage-agenda` and `ai-tools`).

Rewritten or new in Phase 2 (deploy all 18):

```bash
# family
supabase functions deploy manage-caregivers --no-verify-jwt
supabase functions deploy manage-children --no-verify-jwt
# agenda & care
supabase functions deploy manage-agenda --no-verify-jwt        # NEW
supabase functions deploy manage-vacations --no-verify-jwt
supabase functions deploy manage-handover --no-verify-jwt
# costs
supabase functions deploy manage-expenses --no-verify-jwt
supabase functions deploy manage-still-needed --no-verify-jwt
# messages & AI
supabase functions deploy manage-messages --no-verify-jwt
supabase functions deploy ai-assistant --no-verify-jwt
supabase functions deploy ai-coach --no-verify-jwt
supabase functions deploy co-assistant --no-verify-jwt
supabase functions deploy ai-tools --no-verify-jwt             # NEW
# practical & agreements
supabase functions deploy manage-tasks --no-verify-jwt
supabase functions deploy manage-moments --no-verify-jwt
supabase functions deploy manage-documents --no-verify-jwt
supabase functions deploy manage-agreements --no-verify-jwt
supabase functions deploy log-audit --no-verify-jwt
supabase functions deploy send-notification --no-verify-jwt
```

No existing `_shared` file changed in Phase 2 (only new domain-prefixed helpers were added, used by the functions above), so the Phase 1 functions (`custom-auth`, `manage-profile`, `send-invitation`, `accept-invitation`) need no redeploy. The retired functions from Phase 1 §5 stay deleted (or `410 GONE` stubs).

Then build and publish the web app (`npm run build`) with only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set — **never** `VITE_API_MOCK`.

## 5. Manual smoke test (two accounts)

Use two fresh accounts in two browsers (or one normal + one private window): **A** (`you+a@…`) and **B** (`you+b@…`). Do it once in Dutch and spot-check in English (Settings → Taal · Language). In every step: no error toast, no raw translation keys, no example names (Sanne, Joris, Emma, Noah …), and B sees A's change after switching back to the tab (refresh on focus).

**Setup**
- [ ] A registers, verifies the e-mail code, finishes onboarding, adds two children.
- [ ] A invites B (Menu → invite the other parent); B registers with the invited address, opens the link and accepts. Both see each other as connected and both children appear for B.

**Family**
- [ ] A opens a child profile, fills a section (e.g. school, health) — B sees it; A's private note is not visible to B.
- [ ] Gezag: A fills it in, B confirms. "Connected persons" lists B for A and A for B.
- [ ] Circle: A adds a caregiver (e.g. grandmother) for one child with a permission; sends the invite; a third account accepts the link → lands on `/verzorger` and only sees the allowed section for that child. A withdraws access → the caregiver loses it.

**Agenda & care**
- [ ] A adds a private appointment → B never sees it. A adds a shared appointment → B sees it.
- [ ] A changes the shared appointment → B gets a proposal and answers Akkoord / Ander voorstel / Niet akkoord; A sees the result; a final status cannot be changed again.
- [ ] A proposes a care change (swap/extra night) → B answers; after Akkoord the week view changes for both; A can withdraw an open proposal.
- [ ] Holiday: A proposes a split → B answers. Handover: packing list items are shared; "received" is confirmed by the other parent. Nu afstemmen: A starts one, B answers.

**Costs**
- [ ] A adds a shared expense with a receipt (opens via signed link) → B sees "Wacht op jou" (also on Home) and answers; try Ander voorstel → the turn goes back to A.
- [ ] Budget: A proposes → B answers; A cannot answer their own proposal; reminder works at most twice.
- [ ] Cost agreement: A proposes split + limit → B confirms. Settlement: start, receiver adds IBAN/link, payer "Ik heb betaald", receiver "Ontvangen" → expenses become settled.
- [ ] Solo account (not connected): expenses are only tracked, no settlement offered.

**Messages & AI**
- [ ] A starts a topic and sends a message → B sees it within ~25 s with an unread badge; reading clears the badge; messages cannot be edited.
- [ ] Writing help, tone meter, summary, Sparren met Co, the assistant (also speech) and receipt / school-letter / parenting-plan reading return answers; repeated rapid use eventually returns the calm rate-limit message.

**Practical & agreements**
- [ ] Tasks: A asks B to take a task → B accepts or declines; completing logs history.
- [ ] Belongings, moments (photo, "Alleen voor mij" not visible to B, B reacts), documents (upload, open via signed link, delete).
- [ ] Agreements: A proposes → B agrees; decisions and evaluations save.
- [ ] Timeline and "Bekijk geschiedenis" show the events with the right actor; Export produces a PDF with the chosen parts; Activities shows B's responses to A and read-marks persist across devices.

**Security spot checks**
- [ ] `curl "https://<PROJECT_REF>.supabase.co/rest/v1/expenses?select=*" -H "apikey: <ANON_KEY>"` → permission denied.
- [ ] Any function call without `x-session-token` → 401 `UNAUTHORIZED`; a third, unrelated account sees none of A/B's records.
