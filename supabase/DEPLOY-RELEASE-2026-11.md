# Release November 2026 (Milestones 1–2 complete): deploy guide

This guide covers every change since Phase 2 (`DEPLOY-PHASE2.md`), which must already be live. Nothing in this repo runs against your project automatically.

The release does the following:
- **Security:** hardens login, sessions and the database.
- **Separation per child:** each child can be shared with a different other parent, and every record is kept separate per child.
- **No browser-only data:** all remaining in-browser data moves to Supabase. That covers pick-ups, help requests, check-ins, drafts, personal notes, safety reports, savings pots and settings.
- **Workflows:** completes the Kosten, handover and appointment workflows.
- **Texts:** applies the client's standard texts.

## 0. Before you start

- The Supabase CLI is logged in and linked to the project.
- **Back up the database first:**

  ```bash
  supabase db dump --linked -f backup-before-release.sql
  supabase db dump --linked --data-only -f backup-before-release-data.sql
  ```

  Keep both files safe; they contain personal data.
- Never run `supabase/schema.sql`. It is a historical baseline only.
- Deploy in this order:
  1. migrations;
  2. secrets;
  3. **all** edge functions;
  4. scheduled job;
  5. web app.

  The new functions need the new database objects, and the new web app needs the new functions.

## 1. Migration: one file

Run `supabase/migrations/20261127000002_release_2026_11.sql` once: paste the whole file into the SQL Editor and Run, or use `supabase db push`. It is one transaction, so if anything fails nothing is applied. It is also safe to run twice. It contains, in order:

| # | Part | What it does |
|---|---|---|
| 1 | hardening | <ul><li>Atomic verify/reset code attempts.</li><li>No password hashes in the Supabase Auth mirror (existing ones are scrambled).</li><li>Account deletion works again.</li><li>Rate-limit index.</li></ul> |
| 2 | per_child_pairs | <ul><li>`other_parent_id` on tasks, belongings, documents, moments and agreements.</li><li>Backfill (client rule): Solo-era, child-less and mixed items become private; logged in `per_child_backfill_log`.</li></ul> |
| 3 | circle_pickups | Pick-up assignments with accept/decline, check-ins, help requests. |
| 4 | personal_and_drafts | <ul><li>Message drafts.</li><li>Chat agreements.</li><li>Owner-only personal entries.</li></ul> |
| 5 | costs_pots_edit | <ul><li>Savings pots and deposits.</li><li>Extra expense step types.</li></ul> |
| 6 | child_access_handover | <ul><li>Per-child access.</li><li>Access requests.</li><li>Custody info.</li><li>Handover drafts, dedupe and notification log.</li></ul> |
| 7 | review_fixes | <ul><li>Atomic `start_settlement()`.</li><li>Handover drafts per co-parent.</li><li>`profiles.password_must_be_set`.</li></ul> |

If part 1 warns that it could not scramble `auth.users` passwords (insufficient privilege), run its `UPDATE auth.users …` block as the `postgres` role.

### Verify (SQL editor)

```sql
-- every public table has RLS on (expect 0 rows)
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- no browser grants and no policies (expect 0 rows each)
select grantee, table_name from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated');
select tablename, policyname from pg_policies where schemaname = 'public';

-- new objects exist (all non-null)
select to_regclass('public.pickup_assignments'), to_regclass('public.help_requests'),
       to_regclass('public.personal_entries'), to_regclass('public.message_agreements'),
       to_regclass('public.savings_pot_deposits'), to_regclass('public.child_parent_permissions'),
       to_regclass('public.handover_note_drafts'), to_regclass('public.handover_notification_log'),
       to_regprocedure('public.start_settlement(uuid,uuid,uuid,numeric,text,uuid[],text)');

-- what the per-child backfill changed (explain these to testers if something "disappeared")
select table_name, change, count(*) from public.per_child_backfill_log group by 1, 2 order by 1, 2;
```

Recommended (Dashboard → Authentication → Providers): disable Supabase Auth e-mail sign-ins and sign-ups. The app uses its own auth.

## 2. Secrets

These are kept from earlier phases: SMTP/Resend, `PUBLIC_APP_URL`, `APP_ORIGINS`, `OPENAI_API_KEY`, and the optional `OPENAI_MODEL`, `AI_RATE_PER_MINUTE`, `AI_RATE_PER_DAY`.

New:

```bash
supabase secrets set HANDOVER_CRON_SECRET=<random string, at least 32 characters>
supabase secrets set SUPPORT_EMAIL=<support address shown in e-mails>   # optional; the sentence is left out when unset
supabase secrets set HANDOVER_EVENING_TIME=19:00                        # optional, Europe/Amsterdam
```

## 3. Edge functions: deploy all of them

Shared helpers in `_shared/` changed, so redeploy every function. Do not deploy only the ones you think changed.

```bash
supabase functions deploy --no-verify-jwt
```

New functions (already listed in `config.toml` with `verify_jwt = false`):

| Function | Purpose |
|---|---|
| `manage-pickups` | Pick-ups, check-ins, help requests |
| `manage-personal` | Owner-only personal data |
| `handover-reminders` | Scheduled job, protected by `x-cron-secret` |

## 4. Schedule the handover reminders (every 15 minutes)

Use a Dashboard cron job that calls `handover-reminders` with header `x-cron-secret: <HANDOVER_CRON_SECRET>`. Alternatively, use pg_cron + pg_net, with the secret stored in Vault as `handover_cron_secret`:

```sql
select cron.schedule('handover-reminders', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/handover-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'handover_cron_secret')),
    body := '{}'::jsonb) $$);
```

The job is safe to run as often as you like; nothing is sent twice. It sends:

| When | To | Message |
|---|---|---|
| About 48 h before a handover | Parent who hands over | "list ready" |
| The evening before | Parent who hands over | Reminder |
| About 1 h after the handover | Receiving parent | "Is alles meegekomen?" |

Reminders go only to the parents of those children, and are held during a parent's rest mode or night-time muting.

## 5. Web app

Build and publish (`npm run build`) with only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never set `VITE_API_MOCK` or any `VITE_*` secret.

## 6. What testers will notice

- **A different other parent per child:**
  - Each other parent sees only what concerns their own child(ren).
  - One item can't be shared with two other parents at once; the app explains this.
  - Kosten, Contact and agreements let you choose the other parent when there are several.
- **New items are private ("Alleen jij") by default:**
  - "Gedeeld" shares them with the other parent of that child.
  - The label is shown on every item.
  - Items made while Solo stay private after the other parent joins.
- **Every module has edit/delete and loading/error states.** That covers tasks, belongings, moments, documents, the shopping list, expenses, fixed costs and savings pots.
- **Appointments:**
  - Multiple days, all day, start and end time, "Alleen voor mezelf", no category, "Neem mee" items.
  - Attendance includes pick-up/drop-off.
  - Home's "+" opens the same form.
- **Weekly schedule:**
  - Change requests sit above the calendar ("Ja, is goed / Ander voorstel doen / Afwijzen").
  - The proposal form is a pop-up.
  - Tapping a day offers a proposal for that day.
- **Kosten:**
  - Totaal openstaand is always visible.
  - Four quick actions.
  - Inline "Wacht op jou".
  - Savings pots.
  - Settlement totals per period.
  - A payment request can be asked for by the paying parent.
  - The IBAN is deleted when a settlement is finished.
- **Family circle:**
  - Caregivers accept or decline pick-ups and help requests, and parents see the status.
  - Caregiver-only accounts only see their own page.
- **Children:**
  - "Gezag en toegang" per child: restrictions need the other parent's agreement; self-reported custody never changes access.
  - Deleting a shared child unlinks it instead.
  - Per-child schedules, which the other parent confirms ("Klopt / Klopt niet").
- **Handover:** only the receiving parent answers "Is alles meegekomen?", and only after the handover time.
- **Login:** verifying an e-mail on another device or after a reload asks the user to choose a password, which closes a pre-registration takeover.
- **Hidden until built (Milestone 3 or excluded):** calls and recordings, subscriptions, the professionals portal, e-mail linking. Direct links go to Home. The menu says "Professionals".
- **Settings** are stored on the account. Only the theme and app lock stay per device.

## 7. Rollback

Restore the backup from step 0 and redeploy the previous functions and web app from git. The migrations are additive, except the per-child backfill, which changes visibility (see `per_child_backfill_log`).
