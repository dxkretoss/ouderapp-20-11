# Ouderschap & Co — Project handover

> The single, complete guide to the **Ouderschap & Co** platform for a new developer or an AI agent.
> Written 25 November 2026 from a scripted read of this repository (`src/`, `supabase/`). Every list
> below (functions, actions, tables, triggers, env vars, routes, stores) was extracted with scripts and
> cross-checked by hand; see [Appendix A](#appendix-a-how-the-counts-were-derived) for how. Where something
> could not be verified it says **(unverified)**.
>
> Code identifiers and UI texts are Dutch. This guide is English and gives Dutch names with an English
> gloss, e.g. "Wissel" (handover). A [glossary](#13-glossary-dutch--english) is at the end.
>
> Related documents:
> - `src/lib/AGENTS.md` — binding architecture rules (one line per decision). Read before touching a store.
> - `.claude/skills/ouderapp/SKILL.md` (= `.agents/skills/ouderapp/SKILL.md`) — compact operational guide for AI agents.
> - `supabase/DEPLOY-PHASE1.md`, `DEPLOY-PHASE2.md`, `DEPLOY-RELEASE-2026-11.md` — historical deploy guides per release.
> - `docs/PLATFORM_FEATURES.md` — older, very detailed per-screen reference (23 Nov 2026). Useful for UI detail; where it differs from this file, **this file wins**.

## Contents

1. [What the product is](#1-what-the-product-is)
2. [Tech stack, repo layout, running locally](#2-tech-stack-repo-layout-running-locally)
3. [Architecture](#3-architecture)
4. [Core business rules](#4-core-business-rules)
5. [Edge functions](#5-edge-functions)
6. [Database](#6-database)
7. [Secrets and environment variables](#7-secrets-and-environment-variables)
8. [Frontend](#8-frontend)
9. [Main user workflows](#9-main-user-workflows)
10. [Deployment](#10-deployment)
11. [Testing checklist (3 accounts)](#11-testing-checklist-3-accounts)
12. [Known gaps and open decisions](#12-known-gaps-and-open-decisions)
13. [Glossary Dutch → English](#13-glossary-dutch--english)
- [Appendix A: how the counts were derived](#appendix-a-how-the-counts-were-derived)

### Key numbers (derived 25 Nov 2026)

| What | Count |
|---|---|
| Edge function folders | **31** (24 with actions, 1 scheduled job, 6 retired `410 GONE` stubs) |
| Edge function actions | **200** (in the 24 action-dispatching functions) |
| `_shared` helper files | **30** |
| Database tables (`public`) | **59** (29 from the `schema.sql` baseline + 30 created only in migrations) |
| SQL functions (persisted, `public`) | **26** (18 from the baseline, of which 15 legacy `custom_*` RPCs; 8 from migrations) |
| Triggers | **21** |
| Storage buckets | **5**, all private |
| Migrations | **9** files |
| `Deno.env.get` names in functions | **23** (18 distinct settings + 5 `EMAIL_*` aliases) |
| Frontend env vars (`VITE_*`) | **3** |
| Route modules (`src/routes`, excl. `__root.jsx`) | **54** (53 distinct URL patterns) |
| Stores (`src/lib/*-store.js`) | **34** |
| i18n keys | **8,249** in `nl.json` and the same 8,249 in `en.json` |
| Test files | 37 (`*.test.js`, all import `bun:test`; none runnable as-is, see §12) |

---

## 1. What the product is

**Ouderschap & Co** ("De app die ouders verbindt", the app that connects parents) is a Dutch
co-parenting app for separated parents. It is a mobile-first web app (SPA) on a Supabase backend.

**Who uses it**

| Role | What they do |
|---|---|
| **Parent** ("ouder") | Owns an account, adds children, plans, pays, writes. The signed-in parent is always "jij" (you). |
| **Co-parent** ("de andere ouder") | Another parent account linked **per child** through an invitation. A parent can share child 1 with father A and child 2 with father B. A child has at most two parents (`CHILD_LIMIT`). |
| **Family circle / caregiver** ("kring", "verzorger") | Grandparents, babysitters, step-parents, contacts around a child (`family_caregivers`). With an account they get a limited view (`/verzorger`) with per-child, per-section permissions. Contacts without the app are just registered. |
| **Professional** (mediator/coach) | Milestone 3. The portal exists in the UI on demo data but is hidden. |

**Solo / Samen** ("alone" / "together") is a property **per child**: a child is Samen when a connected
other parent is linked to it, otherwise Solo. A parent can use the whole app Solo (no other parent yet).

**Milestone scope**

- **Milestones 1–2 (this codebase, "Release November 2026")**: secure custom auth, own family (children,
  co-parent invitations per child, family circle), agenda + weekly care schedule + holidays + handovers,
  messages with AI writing help, costs (expenses, budgets, settlements, fixed costs, savings pots, cost
  agreement), practical lists (tasks, belongings, still-needed, moments, documents), agreements and
  decisions, history/timeline/PDF export, notifications, settings on the account, English + Dutch UI.
- **Milestone 3–4 / excluded in this phase**: calls and call recordings ("Bellen", `/gesprekken`),
  subscriptions/Stripe (`/abonnement`), the professionals portal (`/professionals`, `/begeleider-gesprek`),
  external e-mail linking in Messages ("e-mailkoppeling"), admin area (`manage-admin` is retired), push
  notifications (`device_tokens` unused).

**How excluded features are hidden** — `src/lib/fase.js`:

```js
export const NIET_IN_DEZE_FASE = ["/gesprekken", "/abonnement", "/professionals", "/begeleider-gesprek"];
export const emailKoppelingAan = false;   // hides e-mail linking in /berichten and /solo
export const professionalsAan = false;    // hides "Professional" role + links in /kring/$kindId and /solo
export const isNietInDezeFase = (pad) => ...
```

`src/routes/__root.jsx` redirects any path for which `isNietInDezeFase(pad)` is true to `/` (Home). The
code of those screens is kept (they still run on `demo-data.js` / local stores) until they are built.

---

## 2. Tech stack, repo layout, running locally

### Stack

| Layer | Technology |
|---|---|
| UI | React 19, Vite 8 (`@vitejs/plugin-react`), Tailwind CSS v4 (`@tailwindcss/vite`), shadcn-style Radix primitives in `src/components/ui/*`, lucide icons, `sonner` toasts, `jspdf` for PDF export |
| Routing | TanStack Router 1.170 (file-style routes, but the route tree is **hand-maintained**, see §8.1) |
| i18n | i18next + react-i18next, `src/locales/nl.json` and `en.json` |
| Backend | Supabase: Postgres (RLS on, no policies), Edge Functions (Deno, TypeScript), private Storage buckets |
| Auth | Custom session auth in edge function `custom-auth` (not Supabase Auth) |
| AI | OpenAI via edge functions only (`_shared/ai-openai.ts`, default model `gpt-4o-mini`) |
| Language | Plain JavaScript (`.js`/`.jsx`) in the frontend, TypeScript in the functions. No TypeScript compiler in the frontend. |

### Repo layout

| Path | What lives there |
|---|---|
| `src/main.jsx`, `src/router.jsx`, `src/routeTree.gen.js` | App entry, router, hand-maintained route tree |
| `src/routes/*.jsx` | One file per screen (54) + `__root.jsx` (auth gate, phase gate, overlays) |
| `src/components/*.jsx` | Shared components (65 files), `ui/` (46 shadcn-style primitives), `pro/` (professionals portal, Milestone 3) |
| `src/lib/*-store.js` | 34 client stores (module state + `useSyncExternalStore`), mirroring server data |
| `src/lib/api.js` | The only server entry point: `api(fn, action, body)` |
| `src/lib/api-mock.js`, `src/lib/mock/*.js` | In-browser mock backend (only with `VITE_API_MOCK=1`, dev only) |
| `src/lib/*.functions.js`, `ai-aanroep.js` | AI client wrappers → AI edge functions |
| `src/lib/fase.js` | Phase gating (what is hidden this phase) |
| `src/lib/AGENTS.md` | Binding architecture decision log |
| `src/locales/nl.json`, `en.json` | All UI text |
| `src/i18n.js` | i18next setup, `taalLocale()`, `datumLocale()`, `tLijst()` |
| `src/styles.css` | Tailwind theme tokens and global styles |
| `supabase/functions/<name>/index.ts` | 31 edge function folders |
| `supabase/functions/_shared/*` | 30 shared helpers (auth, access, scope, audit, mail, AI prompts …) |
| `supabase/migrations/*.sql` | 9 migrations (run in name order) |
| `supabase/schema.sql` | Historical baseline. **Never run it** against a live project (see §6) |
| `supabase/config.toml` | `verify_jwt = false` for every function |
| `supabase/DEPLOY-*.md` | Release deploy guides |
| `public/_redirects` | SPA fallback (`/* /index.html 200`) for Netlify-style hosting |
| `docs/` | This guide, `PLATFORM_FEATURES.md`, and older client/brief material (`ourderschap-4-11/`, `ourdeschap-old/`, `pdf and docs/`) |
| `.claude/skills/ouderapp/SKILL.md`, `.agents/skills/ouderapp/SKILL.md` | AI agent skill (identical copies) |

### Running locally

```bash
npm install
npm run dev        # Vite on http://localhost:5173 (vite.config.js: port 5173)
npm run build      # production build into dist/
npm run preview    # serve the build
```

There is **no** `npm test` script and no lint script.

Frontend environment (in `.env` / `.env.local`, both git-ignored; there is no `.env.example`):

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | Supabase project URL (used only for `functions.invoke`) |
| `VITE_SUPABASE_ANON_KEY` | yes | Public anon key. Without both, every call returns `NOT_CONFIGURED` ("De app is nog niet met de server verbonden.") |
| `VITE_API_MOCK` | no, **local only** | `1` answers every `api()` call in the browser from `src/lib/api-mock.js` (data in `localStorage["ouderapp-mock-db"]`). Tree-shaken from production builds. Never set it in a deployed build. The mock does **not** cover `manage-pickups` or `manage-personal` (see §12). |

`src/lib/supabase.js` reads exactly these two names literally so Vite bundles only them. Never put a
secret in any `VITE_*` variable: everything `VITE_*` ends up in the browser bundle. (The local `.env`
also contains non-`VITE_` names such as `OPENAI_API_KEY` and `SMTP_*`; Vite does not bundle them, and
they belong in Supabase function secrets, not here.)

### i18n

- One translation file per language: `src/locales/nl.json` and `src/locales/en.json`, identical key sets
  (8,249 keys each, verified). Fallback language `nl`; the chosen language is stored in
  `localStorage["onzeapp-taal"]`; switcher `src/components/TaalKiezer.jsx` (Settings).
- Top-level namespaces: `common` (shared words), `routes.<routeName>` (per route file, camelCased, e.g.
  `routes.kinderenKindId`), `components.<ComponentName>`, `lib.<file>` (e.g. `lib.api.fout.*` error texts,
  `lib.meldingen.*` notification texts), `pro.*` (professionals portal), `standaard.*`.
- Components use `const { t } = useTranslation()`. Route `head()` and `src/lib` use `i18n.t()` at call time;
  module-level data uses getters (`get label() { return i18n.t(...) }`), never `i18n.t` at module load.
- Stored/compared values stay Dutch ids (e.g. `"Akkoord"`, `"Gezin/algemeen"`) and are translated only
  for display. Dates/money via `taalLocale()` / `datumLocale()`, never a hard-coded `"nl-NL"`.
- Edge functions receive `lang` in every body (`api()` adds it); `serveActions` derives `isEn` from it for
  e-mail texts. AI prompts stay Dutch with an appended language rule.
- **`standaard.*`** (283 keys, 34 groups such as `standaard.welkom`, `standaard.homeNieuw`,
  `standaard.menuNieuw`, `standaard.sparrenMetCo`) holds the client's **standard texts for screens that
  are not built yet** (November 2026 designs). At the time of writing **no source file references a
  `standaard.*` key** (verified by grep). Use them when those screens are built; do not delete them.

---

## 3. Architecture

### 3.1 Request path

```
Browser (React SPA)
  └─ store / component
       └─ api(fn, action, body)                       src/lib/api.js
            └─ supabase.functions.invoke(fn, { body: { action, lang, ...body },
                                              headers: { "x-session-token": <token> } })
                 └─ Edge Function <fn>                supabase/functions/<fn>/index.ts
                      serveActions(name, handlers)    _shared/respond.ts: POST + JSON body, dispatch on body.action,
                                                      HttpError → { success:false, code, message }
                      requireUser(req)                _shared/session.ts: x-session-token → user_sessions → profiles
                      access / scope checks           _shared/access.ts, practical-scope.ts, costs-family.ts, …
                      db() (service role)             _shared/db.ts — bypasses RLS, so every handler checks access itself
                      logAudit() / notify()           _shared/practical-audit.ts
                 ◄─ { success: true, ...payload }  or  { success: false, code, message }
```

- **The browser never touches tables, RPCs or storage directly.** Every Postgres table has RLS enabled
  and **no policies**, and the `anon`/`authenticated` roles have no grants (Phase 1 migration). Only the
  service role (used inside the functions) can read/write.
- **Gateway JWT verification is off** for all functions (`config.toml` + `--no-verify-jwt`): each function
  authenticates the custom session itself. The anon key is sent by the Supabase client as usual; the user
  session travels separately in `x-session-token`.
- **The user always comes from the session**, never from the body. (Legacy `_shared/phase2-guard.ts`
  `pinIdentity` overwrote body identity fields during Phase 1; it is not imported by any function anymore —
  verified by grep.)
- **Errors** are coded (`ErrorCode` in `_shared/respond.ts`): `VALIDATION`, `NOT_CONFIGURED`,
  `MIXED_CHILDREN`, `NOT_OPEN`, `WEAK_PASSWORD`, `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `NOT_VERIFIED`,
  `CODE_INVALID`, `CODE_EXPIRED`, `TOO_MANY_ATTEMPTS`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
  `INVITE_EXPIRED`, `INVITE_USED`, `INVITE_CANCELLED`, `INVITE_DECLINED`, `INVITE_OWN`,
  `INVITE_EMAIL_MISMATCH`, `CHILD_LIMIT`, `RATE_LIMITED`, `GONE`, `SERVER`. The client translates them via
  `foutTekst(code)` → `lib.api.fout.<CODE>` (plus client-only `NETWORK`). On `UNAUTHORIZED` the session is
  dropped and the app goes to `/welkom`.

### 3.2 Custom session auth

- Sessions: `user_sessions` (random 32-byte hex token handed to the client once; only its sha256 is
  stored; 30-day expiry; `last_seen_at` touched every 5 min; revocable). The token lives in
  `localStorage["onzeapp-sessie-token"]`.
- `requireUser(req)` returns the user or throws 401; it also rejects unverified profiles.
- Passwords: bcrypt (`npm:bcryptjs`), policy ≥ 8 chars, ≥ 1 uppercase, ≥ 1 digit or special character.
- One-time codes (verify / reset): 6 digits, stored only as sha256, 15 min expiry, max 5 attempts claimed
  atomically via SQL `claim_code_attempt()`, max 5 codes per e-mail per hour.
- Rate limits (`auth_rate_events`): login failures 10 per e-mail per 15 min **and** 30 per IP per 15 min;
  code checks 30 per IP per 15 min; invitations 10 per sender per hour; AI calls 20/min and 300/day per user
  (`ai_requests`, configurable).
- Supabase Auth (GoTrue) is not used. A legacy trigger still mirrors `profiles` into `auth.users`
  (`sync_profile_to_auth_user`, since the release migration always with a random unusable password).
  Disable e-mail sign-ups in the Supabase Auth settings.

### 3.3 Store pattern (frontend)

Every store is a module with private state, a listener set and a `useXxx()` hook built on
`useSyncExternalStore`; exported Dutch verb functions mutate it. Rules (see `src/lib/AGENTS.md`):

- **Server-backed.** Family data is loaded after login and refreshed on window focus/visibility (no
  realtime: RLS blocks it). Messages additionally poll every 25 s while `/berichten` is open.
- **`serverBron({ laad, wis })`** in `src/lib/praktisch-sync.js` registers a source: it loads when an
  account signs in, wipes on sign-out/account switch, refreshes on focus (min 4 s apart) and exposes
  `useStatus()` = `"leeg" | "laden" | "klaar" | "fout"`. Used by afspraken, audit, documenten, evaluatie,
  kring, meldingen, momentjes, persoonlijk and taken stores. Other stores (agenda, kosten, start,
  berichten, voorkeuren …) subscribe to `auth-store` themselves with the same behaviour.
- **Optimistic updates**: `optimistisch(doe, aanroep, foutId)` applies the change, calls the server and
  rolls back on error; `meldFout(e, id)` shows one calm translated toast per source (never for
  `UNAUTHORIZED`).
- **Loading/error UI**: `src/components/Laden.jsx` — `laadWeergave(status, onOpnieuw)` returns a skeleton
  while loading and `LaadFout` (with retry) on a first-load failure; `InhoudLaden`, `PaginaSkelet`, `AppLaden`.
- `agenda-store.js` is the load hub of the agenda domain: one `manage-agenda list` feeds the agenda, zorg
  (care), aanwezigheid (attendance) and nu-afstemmen stores.
- `kosten-store.js` is the one client source for costs (`manage-expenses overview`); `budget-store`,
  `vaste-lasten-store` and `nog-nodig-store` are thin layers on it. Records keep profile ids; stores expose
  viewer-relative `"ik"`/`"ander"`.
- Old demo ids `"sanne"/"Sanne"` (= signed-in parent) and `"joris"/"Joris"` (= the other parent) survive in
  the agenda/care code as **viewer-relative ids only**; they are never shown.

### 3.4 Preferences

- Stored on the account: `profiles.preferences.app` (JSON), written via `manage-profile update
  { preferences: { app } }` by `src/lib/voorkeuren-store.js` (debounced 600 ms; `null` values delete keys).
  Includes rest mode/quiet hours (`rustmodus`, `rustVan/rustTot`, `nachtrustAan/Van/Tot`) which
  `handover-reminders` respects, AI toggles, Living Home effects, pinned/muted conversations,
  `activiteitGelezen`, `checkinAan` and more.
- What stays on the device (localStorage, keys prefixed `onzeapp-`):
  - `onzeapp-sessie-token` (session), `onzeapp-gebruiker` (cached user basics);
  - `onzeapp-taal` (language);
  - `onzeapp-voorkeuren` → only `thema` (theme, read by the pre-paint script in `index.html`) and
    `vergrendelId` (app lock, `AppSlot.jsx`);
  - `onzeapp-eigen-start-v2` — a small non-sensitive cache of start-store (account id, names/colours of the
    children, schedule) so the first screen is not empty; never profile sections;
  - transient UI state (e.g. `onzeapp-uitnodiging-token`, `onzeapp-verifieer-email`, `onzeapp-spoed-snooze`).
- Sign-out (`custom-auth logout`) revokes the session and wipes the token and all `onzeapp-*` family caches
  (language and preferences stay), then reloads `/welkom`.

### 3.5 Notifications

- Created **only server-side** by `notify()` in `_shared/practical-audit.ts` (best-effort, never fails the
  request, never notifies the actor). A row in `notifications` holds `type`, `category`
  (`actie` = needs your answer, `wijziging` = something changed, `info`), `title` = **i18n key** under
  `lib.meldingen.<key>`, `metadata.params` (short non-sensitive values), `link`, `entity_type/id`,
  `child_ids`, `metadata.audit_id`.
- 101 notification keys exist in `lib.meldingen` (nl and en identical) and every one is used by a function
  (table in §5.3). `accept-invitation` and `handover-reminders` insert notification rows directly with the
  same shape.
- The client reads them through `send-notification list` (`meldingen-store.js`) and marks them read with
  `send-notification mark-read` (also stores Activities read-marks in `activity_reads`).
- **Activities** (`/activiteiten`, bell on Home; `useActiviteiten` in `src/components/Activiteiten.jsx`,
  `src/lib/activiteiten.js`) merges: open proposals from all domains (only items with server ids), audit
  events by others (skipping ones a notification already covers), shared moments, and notifications.
  Reading never settles anything. No push delivery in Milestone 2.

### 3.6 Audit / history

- `audit_events` is append-only (trigger `audit_events_append_only` blocks UPDATE/DELETE).
- Written server-side with `logAudit()` (`_shared/practical-audit.ts`; agenda and costs use their own
  `audit()` helpers in `agenda-family.ts` / `costs-family.ts` writing the same shape). `actorId` is always
  the session user; `childIds` scope it; `familyIds` ([actor, other_parent_id]) is required for records
  without children (otherwise only the actor sees the event). Private items are never logged.
- Read via `log-audit list` (family-scoped) by `audit-store.js` → `/tijdlijn`, `/exporteren`, every
  "Bekijk geschiedenis" (`GeschiedenisKnop`). Client `leg()` → `log-audit log` (origin `client`) only for
  events no function logs; never double-log.
- Agreements (`parent_agreements`) keep their own append-only `history`; it is never copied into audit.

---

## 4. Core business rules

### 4.1 Per-child pairing and `other_parent_id`

A parent can have a **different co-parent per child**. Every shared record is addressed to exactly one
other parent (`other_parent_id`) and is visible to that parent **only while every child of the record is
linked to both parents**. So father B never sees anything about child 1, which the mother shares with
father A. Never reintroduce a "the one co-parent" assumption.

| Helper | File | Rule |
|---|---|---|
| `coParentsByChild(me)` | `_shared/access.ts` | For each of my children: the linked other parent(s) with an **active** `parent_connections` row. |
| `pairOf(me, childIds, requested?)` | `_shared/access.ts` | The one other parent of these children; `null` for Solo children (record can only be private); `VALIDATION "Choose the other parent this is for"` when there are no children and several co-parents; **`MIXED_CHILDREN`** when the children belong to different other parents. |
| `costPair(me, childIds, shared, requested?)` | `_shared/costs-family.ts` | `null` when `shared === false` ("Alleen jij"), else `pairOf`. |
| `pairSees` / `assertVisible` / `visibleRows` | `_shared/costs-family.ts` | Creator always; the addressed other parent only while every child is still linked to both. |
| `addressFor(f, childIds, isPrivate, requested?)` | `_shared/practical-scope.ts` | `other_parent_id` for a new practical record (same rules as `pairOf`). |
| `canSee(f, owner, childIds, isPrivate, addressedTo?)` | `_shared/practical-scope.ts` | Practical domain visibility (tasks, belongings, documents, moments, agreements). |
| `assertOnePair(scope, childIds)` / `canSee` | `_shared/agenda-family.ts` | Agenda: one shared appointment/proposal may only concern children of ONE co-parent. |

`MIXED_CHILDREN` is shown as "Deze kinderen deel je met verschillende ouders. Maak het apart aan per kind
of per andere ouder." The client mirrors the rule in `src/lib/gezin.js` (`anderVoor(kindIds)`,
`gemengd(kindIds)`, `isSamen(kindId)`).

The release migration added `other_parent_id` to tasks, belongings, documents, shared_moments,
parent_agreements (and savings_pots); costs tables got it in Phase 2. It backfilled existing rows with the
client rule (Solo-era, child-less and mixed items became private) and logged every change in
`per_child_backfill_log`.

### 4.2 "Alleen jij" vs "Gedeeld"

- New items are **private by default** ("Alleen jij", only you). "Gedeeld" (shared) shares with the other
  parent of that child. The label is shown on every item.
- UI: `DeelKeuze` (`src/components/DeelKeuze.jsx`, costs/fixed costs/pots) and `DelenKeuze`
  (`src/components/DelenKeuze.jsx`, practical items: tasks, belongings, still-needed, documents, moments;
  also `kanDelen`, `deelCheck`, `DeelLabel`, `VerwijderDialoog`). For Solo children no choice is shown
  (private by definition); with 2+ co-parents and no child, the user picks which other parent.
- **Items made while Solo stay private after linking**; the user can share them later (e.g.
  `manage-expenses share-expense`, `manage-tasks update { shared }`).
- Private agenda items (`is_shared=false`), private moments, Solo notes and Co chats are never audited
  and never notified.

### 4.3 Uniform not-found

Anything the caller may not see answers `404 NOT_FOUND`, exactly like something that does not exist
("Deze pagina is niet beschikbaar voor jou." / "This page isn't available to you."). Do not leak existence
with `FORBIDDEN` for objects of other families; `FORBIDDEN` is only for "you can see it but may not do
this" (e.g. only the creator may delete).

### 4.4 Proposals ("voorstellen")

Shared changes are proposals the **other** parent answers: Akkoord / Ander voorstel / Niet akkoord / Meer
tijd nodig (server values `akkoord`, `ander-voorstel`, `niet-akkoord`, `meer-tijd`). The proposer may
withdraw while open. Final statuses never change again (SQL trigger `agenda_final_status_guard` for
appointment and care proposals). A reply date is a request, never binding; expiry changes nothing. The
server decides whether a change applies directly: private item, or no connected other parent for those
children → applied directly ("nobody waits on a parent who is not there").

### 4.5 Family circle (caregivers)

- `family_caregivers` rows per member (created by a parent), `child_ids`, optional access period
  `valid_from`/`valid_to` (inclusive, Europe/Amsterdam dates), `status` (`invited`, `active`, `revoked`, …),
  `connected_user_id` once accepted while signed in. The invitation link (`/uitnodiging?t=<token>`) alone
  never grants anything.
- Permissions per child **and section** in `caregiver_permissions`, default none. Sections and levels
  (`_shared/family-caregivers.ts SECTIONS`): `wissel` [bekijken], `momentjes` [bekijken, bijdragen],
  `taken` [bekijken, bijdragen], `spullen` [bekijken, bijdragen], `agenda` [bekijken, bijdragen],
  `nood` [bekijken], `documenten` [bekijken]. ("bekijken" = view, "bijdragen" = contribute.)
- Live access = `status='active'` + connected + in period (`hasLiveAccess`). Functions that serve
  caregiver sessions check `caregiverMay` / `caregiverGrantsFor`: manage-caregivers, manage-documents,
  manage-moments, manage-pickups, manage-tasks, send-notification.
- **Caregiver-only accounts** (no own children, no co-parent, but circle access; `manage-caregivers role`
  → `verzorger`) are routed by `__root.jsx` to `/verzorger` and see only that page (built from the server
  view `get-for-user`).

### 4.6 Per-child parent permissions ("Gezag en toegang")

- Table `child_parent_permissions` (child × parent × section: `can_view`, `can_propose`, `can_edit`,
  `basis`). Sections (`_shared/parent-permissions.ts`): basis, school, gezondheid, praktisch, personen,
  noodkaart, agenda, overdracht, kosten, documenten, momentjes, beslissingen, berichten.
- **Default = `legacy_baseline`**: view + propose + edit on every section, i.e. exactly what the app
  allowed before. A missing row means baseline too. `basis` (name, birth date, colour, photo) is always
  visible.
- Change rule: a parent may lower their **own** access at once (`self_restriction`) and restore it if they
  restricted it themselves; every other change is a **request** (`child_permission_requests`) that only
  takes effect when the affected parent (or, for raising your own access after an agreed restriction, the
  other parent) accepts (`agreed`). `verified`/`reviewed` are never produced by the app.
- **Enforced today only in `manage-children`** (and `_shared/children.ts` when building child payloads):
  `ENFORCED_SECTIONS = basis, school, gezondheid, praktisch, personen, noodkaart`. Only these are offered in
  the UI (`GezagToegang.jsx`). The other sections have rows but no function checks `parentMay` yet.
- **Custody is informational only.** Self-reported custody (`children.custody` + `child_parents.gezag_*`,
  `save-custody` / `confirm-custody` / `dispute-custody`) never grants or removes access.

### 4.7 Invitations

- **Co-parent** (`send-invitation send`): for one or more children the sender may edit; recipient must not
  push a child over two parents (`CHILD_LIMIT`); `INVITE_OWN` for your own address; 14-day expiry; one open
  invitation per sender+address is refreshed instead of duplicated. The link is
  `<origin>/uitnodiging?token=<64 hex>`; origin from `_shared/origin.ts` (`redirect_origin` only if listed
  in `APP_ORIGINS`, else `PUBLIC_APP_URL`, else the first `APP_ORIGINS` entry; none → `500 NOT_CONFIGURED`
  "App URL is not configured (set PUBLIC_APP_URL)"). The origin is resolved **before** anything is stored.
- **E-mail status** (migration `20261128000001`): each send records `email_status` (`sent`/`failed`),
  `email_sent_at`, `email_attempts`. The app shows "Niet verstuurd" and offers "Opnieuw versturen"
  (`send-invitation resend`, which also renews the 14-day validity). The response always includes
  `invite_link` and `email_sent` so the link can be shared manually.
- **Accepting** (`accept-invitation`): `inspect` (public, token only; marks `viewed`; closed invitations
  reveal no names), `accept` (session; the account e-mail must equal the invited address →
  `INVITE_EMAIL_MISMATCH`; idempotent retry only while still linked), `decline` (public; status `declined`;
  the inviter is notified `uitnodigingAfgewezen` and sees "Afgewezen"), `cancel` by the inviter.
  `list-sent`, `list-connected`, `disconnect` manage connections.
- **Circle** (`manage-caregivers create/update { invite, send_email }`, `send-invite-email`): link
  `<origin>/uitnodiging?t=<token>`; `get-by-token` (public) and `accept` (session).

### 4.8 Auth

- **Register** (`custom-auth register`): creates an unverified profile (or, for an existing unverified one,
  never overwrites the password) and e-mails a 6-digit code. `EMAIL_TAKEN` only for verified accounts.
- **Verify** (`verify-email { email, code, password? }`): the code proves mailbox ownership. With a
  password (same browser, from `/registreren`) that password is set. **Without a password** (other device,
  after a reload) the stored password is replaced by an unusable random hash, `password_must_be_set=true`,
  the response has `needs_password_reset: true`, and `__root.jsx` forces `/verifieren` where the user
  chooses a password (`set-password`, allowed once). This closes a pre-registration takeover.
- **Login**: `NOT_VERIFIED` (403) sends a fresh code; rate limits per e-mail and per IP (§3.2).
- **Reset**: `request-password-reset` (always the same answer) → `verify-reset-code` → `reset-password`
  (new session; all other sessions revoked).
- `me` restores the session; `logout` revokes it.

---

## 5. Edge functions

### 5.1 Overview (31 folders)

Every function uses `serveActions` (POST, JSON body, `action` field) except `handover-reminders` (one
handler) and the 6 retired stubs (`goneHandler` → `410 {"code":"GONE"}`). "Session" = every action calls
`requireUser` (AI functions via `requireAiUser`, which also applies the AI rate limit).

| # | Function | Auth | Actions | Purpose | Tables touched | Notifications |
|---|---|---|---|---|---|---|
| 1 | `accept-invitation` | `inspect`, `decline` public; rest session | 7 | Inspect/accept/decline co-parent invitations; list sent/connected; cancel; disconnect | invitations, profiles, children, child_parents, parent_connections, notifications (+ child_parent_permissions via `seedBaseline`) | uitnodigingGeaccepteerd, uitnodigingAfgewezen |
| 2 | `ai-assistant` | session (AI) | 2 | Search & arrange assistant in every page header; speech to text | ai_requests | – |
| 3 | `ai-coach` | session (AI) | 2 | Co writing help in Messages; tone meter | ai_requests | – |
| 4 | `ai-tools` | session (AI) | 5 | Summary, receipt reading, school letter, school message draft, parenting-plan import | messages, conversations (summary), ai_requests | – |
| 5 | `auth-login` | – | 0 | **Retired** (410 stub) | – | – |
| 6 | `auth-reset-password` | – | 0 | **Retired** (410 stub) | – | – |
| 7 | `auth-signup` | – | 0 | **Retired** (410 stub) | – | – |
| 8 | `co-assistant` | session (AI) | 1 | "Sparren met Co" (`/verhaal`, Co sheet in Messages); builds the minimal GEZIN line server-side | children, child_parents, ai_requests | – |
| 9 | `create-profile` | – | 0 | **Retired** (410 stub) | – | – |
| 10 | `custom-auth` | public (only `me` uses the token; `logout` revokes it) | 10 | Register, verify, login, reset, set-password, session restore, logout | profiles, user_sessions, auth_rate_events (`claim_code_attempt`) | – |
| 11 | `handover-reminders` | **`x-cron-secret`** (= `HANDOVER_CRON_SECRET`, ≥ 16 chars) | – (one handler) | **NEW.** Scheduled every 15 min: timed handover notifications + cleanup | children, fixed_routines, handover_checklist_items, handover_note_drafts, handover_notification_log, notifications, profiles (+ care tables via `handover-schedule.ts`) | overdrachtLijstKlaar, overdrachtMorgen, overdrachtAllesMeegekomen |
| 12 | `log-audit` | session | 2 | Family-scoped history read; client-reported events | audit_events | – |
| 13 | `manage-admin` | – | 0 | **Retired** (410 stub; admin returns in Milestone 3) | – | – |
| 14 | `manage-agenda` | session | 16 | Appointments + proposals, care-schedule proposals/exceptions/versions, attendance, Nu afstemmen | calendar_events, calendar_event_proposals, appointment_attendance, care_schedule_proposals, care_schedule_exceptions, care_schedule_versions, urgent_requests, children, audit_events | afspraakNieuw, agenda*, zorg*, aanwezigheid*, nuAfstemmen* |
| 15 | `manage-agreements` | session | 11 | Agreements (versioned proposals), decisions, half-yearly evaluations | parent_agreements, evaluations, audit_events | afspraak*, besluit* |
| 16 | `manage-caregivers` | session; `get-by-token` public | 11 | Family circle members, permissions, invitations, caregiver views, role | family_caregivers, caregiver_permissions, children, child_parents, profiles, pickup_assignments, help_request_recipients, audit_events | – (sends invitation e-mail) |
| 17 | `manage-children` | session | 17 | Children, profile sections, avatar, delete/unlink, schedule + confirmation, custody, private note, per-child access | children, child_parents, child_private_notes, child_parent_permissions, child_permission_requests, invitations, profiles, audit_events | kindOntkoppeld, regeling*, gezag*, toegang* |
| 18 | `manage-documents` | session | 5 | Documents in private bucket `documents`, 1 h signed URLs | documents, audit_events | documentToegevoegd |
| 19 | `manage-expenses` | session | 30 | Expenses, receipts, responses, budgets, settlements, fixed costs, savings pots, cost agreement | expenses, expense_steps, expense_attachments, budget_proposals, budget_steps, settlements, settlement_steps, recurring_expenses, savings_pots, savings_pot_deposits, cost_agreements, children, audit_events (RPC `start_settlement`) | kost*, budget*, verrekening*, betaalverzoek, betalingGemeld, ontvangstBevestigd, vasteLast*, pot*, kostenAfspraak* |
| 20 | `manage-handover` | session | 11 | Packing list ("Mee met de wissel"), fixed items, handover notes + drafts, receiving-parent check | handover_checklist_items, fixed_routines, handover_logs, handover_note_drafts | overdrachtVerzoek, overdrachtAllesOntvangen, overdrachtNietMeegekomen, vasteSpullenGewijzigd |
| 21 | `manage-messages` | session | 11 | Conversations per topic, append-only messages, per-user read/pin/mute/draft, "Akkoord geven" | conversations, messages, conversation_reads, message_agreements, calendar_events, profiles | – (unread is computed) |
| 22 | `manage-moments` | session | 5 | Moments ("Momentjes") and milestones, reactions, visibility; photos in bucket `moments` | shared_moments, moment_reactions | momentReactie |
| 23 | `manage-personal` | session (owner-only) | 6 | **NEW.** The parent's own private data (`personal_entries`) | personal_entries | – (never) |
| 24 | `manage-pickups` | session | 12 | **NEW.** Pick-up/drop-off assignments, check-ins, help requests to the circle | pickup_assignments, pickup_checkins, help_requests, help_request_recipients, family_caregivers, handover_checklist_items, children, audit_events | ophaal*, onderweg, aangekomen, hulp* |
| 25 | `manage-profile` | session | 4 | Own profile, preferences, avatar, account deletion | profiles, children, child_parents, budget_proposals, budget_steps, parent_agreements | – |
| 26 | `manage-still-needed` | session | 7 | "Nog nodig" list (still to buy), optional budget link | still_needed_items, budget_proposals | – |
| 27 | `manage-tasks` | session | 15 | Tasks (with request/accept to the other parent) and belongings ("Spullen") | tasks, belongings, audit_events | taak* |
| 28 | `manage-vacations` | session | 6 | Holidays and special days as proposals | vacations, audit_events | – (none; see §12) |
| 29 | `send-invitation` | session (default action `send`) | 2 | Invite a co-parent by e-mail for children; resend | invitations, children, profiles, auth_rate_events | – |
| 30 | `send-notification` | session | 2 | Read in-app notifications; mark notifications + Activities items read | notifications, activity_reads | – |
| 31 | `send-verification-email` | – | 0 | **Retired** (410 stub) | – | – |

Total actions: 7+2+2+5+1+10+2+16+11+11+17+5+30+11+11+5+6+12+4+7+15+6+2+2 = **200**.

### 5.2 Every action

Inputs are the body fields read by the handler (plus `action` and `lang`). "→" = main response keys.

**accept-invitation**
- `inspect` (public) `{ token }` → `invitation` (status, masked e-mail, inviter name/avatar, children; closed ones reveal nothing).
- `decline` (public) `{ token }` → `{}`; notifies inviter `uitnodigingAfgewezen`.
- `accept` `{ token }` → `connection`; links child_parents, active `parent_connections`, seeds baseline permissions; notifies `uitnodigingGeaccepteerd`.
- `list-sent` → `invitations` (incl. email_status). `cancel` `{ invitation_id }`. `list-connected` → `co_parents`. `disconnect` `{ co_parent_id }`.

**ai-assistant** — `ask { vraag, context }` → `result` (intent id + prefilled fields; never acts); `transcribe { audio, type }` → `tekst`.

**ai-coach** — `coach { tekst, stijl, alsVoorstel?, variant?, context?, daarna? }` → `result`; `tone { tekst, context? }` → `result { niveau, toon, afstemming, boodschap }`.

**ai-tools** — `summarize { conversation_id | berichten }` → `samenvatting`; `receipt { foto }` → `result { winkel, datum, bedrag, omschrijving }`; `school-letter { tekst, vandaag }` → `items`; `school-message { afspraak, kind?, verzoek, toelichting? }` → `result { concept }`; `parenting-plan { naam, type, data }` → `items`.

**co-assistant** — `chat { modus: praten|overzicht|doen, context?, berichten[] }` → `result { antwoord, acties[], concept }`.

**custom-auth** — `register { email, name, password }` → `needs_verification, email, email_sent`; `verify-email { email, code, password? }` → `session_token, user, needs_password_reset`; `resend-code { email, purpose: verify|reset }` → `sent`; `login { email, password }` → `session_token, user`; `request-password-reset { email }` → `sent`; `verify-reset-code { email, code }` → `valid`; `reset-password { email, code, password }` → new session; `set-password { password }` (only when `password_must_be_set`); `me` → `user`; `logout`.

**log-audit** — `list { limit?, since? }` → `events` (family-scoped); `log { section, audit_action, child_ids, changes, item_id, item_label, meta }` → `event` (origin `client`).

**manage-agenda**
- `list` → `events`, event proposals, care proposals, exceptions, versions, attendance, urgent requests (last 14 days) — viewer-relative.
- `create-event { fields, voorstel?, reply_by? }` → `applied` + `event` or `proposal` (`afspraakNieuw` / `agendaVoorstel`).
- `update-event { event_id, fields, scope: alleen|toekomst|reeks, occurrence_date?, reply_by? }` → direct or proposal; only the creator may change children/sharing.
- `delete-event { event_id, scope, occurrence_date? }` → direct or proposal.
- `respond-event-proposal { proposal_id, response, until?, note? }`; `withdraw-event-proposal { proposal_id }`.
- `propose-care { proposal, counter_of? }` (soort `eenmalig` = exception / `structureel` = new version from a date); `respond-care { proposal_id, response, until?, alternative? }`; `withdraw-care { proposal_id }`; `remind-care { proposal_id }` (`zorgHerinnering`).
- `set-attendance { event_id, keuze, wie_gaat, contact_wie }`; `respond-attendance { event_id, reactie }`; `attendance-outcome { event_id, uitkomst, toelichting }`; `attendance-debrief { event_id, besproken, afspraken }`.
- `start-urgent { kind_ids, categorie, titel, toelichting, reactie_gewenst, oude_tijd, nieuwe_tijd }`; `answer-urgent { id, antwoord }` (Nu afstemmen).

**manage-agreements** — `list` → `agreements` (+ decisions); `propose-new { title, text, topic, child_ids, other_parent_id }`; `import { items, document, child_ids, other_parent_id }` (from the parenting-plan reader); `propose-change { agreement_id, kind, text }` (`kind: "stoppen"` = stop proposal, otherwise a change); `respond { agreement_id, response, text }`; `withdraw { agreement_id }`; `decision-create { title, kind, mode, child_id, other_parent_id }`; `decision-withdraw { decision_id }`; `decision-respond { decision_id, response }`; `evaluation-list` → `evaluations`; `evaluation-save { answers }`.

**manage-caregivers** — `list` → `members`; `create { …member, child_ids, permissions, invite?, send_email?, image_base64?, redirect_origin? }`; `update { caregiver_id, … }`; `revoke { caregiver_id }`; `delete { caregiver_id }`; `send-invite-email { caregiver_id, redirect_origin? }` → `email_sent`; `view-as { caregiver_id }` → `view` (what that member sees); `get-for-user` → `views` (caregiver session); `role` → `role: parent|verzorger`; `get-by-token { token }` (public) → `invitation`; `accept { token }` → `view`.

**manage-children** — `list` → `children` (no bsn); `get { child_id }` → `child` with permitted profile sections; `create { name, date_of_birth, color_code, description }`; `update { child_id, updates }` (sections need `edit`); `set-avatar { child_id, image_base64 | avatar }`; `delete { child_id }` → `mode: deleted|unlinked`; `save-schedule { schedule, child_id? }` (asks the other parent to confirm, `regelingBevestigen`); `confirm-schedule { child_id, klopt, opmerking? }`; `save-custody { custody, holder, detail, deviations, afwijkend, restrictions_note, child_id? }`; `confirm-custody { child_id }`; `dispute-custody { child_id }`; `get-private-note { child_id }` / `save-private-note { child_id, note }` (per parent); `access { child_id }` → overview; `request-access { child_id, parent_id, section, view, propose, edit }`; `respond-access { request_id, accept }`; `withdraw-access { request_id }`.

**manage-documents** — `list` → `documents`; `upload { file_base64, file_name, mime_type, title, category, source, child_id, is_shared, other_parent_id }` (≤ 10 MB); `get-url { document_id, download? }` → 1 h signed `url`; `update { document_id, title, category, is_shared, other_parent_id }`; `delete { document_id }`.

**manage-expenses** (30)
- `overview` → everything the cost screens need (expenses, budgets, settlements, recurring, pots, agreements, per co-parent).
- Expenses: `create-expense { expense, receipt?, receipt_name?, attachment?, attachment_name? }`; `respond-expense { expense_id, response, amount?, payer_pct?, note?, review_at? }`; `comment-expense { expense_id, text }`; `add-attachment { expense_id, kind, file, file_name }`; `update-expense { expense_id, expense }`; `withdraw-expense { expense_id }`; `delete-expense { expense_id }`; `share-expense { expense_id, other_parent_id?, split?, payer_pct? }`; `remind-expense { expense_id }` (max 2, 24 h apart).
- Budgets: `create-budget { budget }`; `respond-budget { budget_id, response, amount?, my_pct?, review_at? }`; `change-budget { budget_id, amount, my_pct }`; `withdraw-budget { budget_id }`; `remind-budget { budget_id }`.
- Settlement ("Afrekenen"): `start-settlement { partner_id?, expense_ids, period_label? }` (either parent; server computes amount and direction; atomic via `start_settlement()`); `share-payment-request { settlement_id, payment_link?, bank_iban?, bank_account_name?, description? }` (receiver only); `indicate-payment { settlement_id }` (payer; never proof); `confirm-receipt { settlement_id }` (receiver; settles the expenses); `finish-settlement { settlement_id }` (receiver; wipes IBAN and account name).
- Fixed costs ("Vaste lasten", display only): `create-recurring`, `update-recurring { recurring_id, … }`, `delete-recurring { recurring_id }` (fields `child_ids, shared, other_parent_id, title, amount, interval, my_pct, category`).
- Savings pots ("Spaarpotjes"): `create-pot { pot }`, `update-pot { pot_id, pot }`, `delete-pot { pot_id }`, `add-deposit { pot_id, amount, date, note }`, `remove-deposit { deposit_id }`.
- Cost agreement per co-parent: `save-agreement { split_mode, settle_moment, approval_threshold, my_pct, solo?, partner_id? }`; `respond-agreement { agreement_id, response }`.

**manage-handover** — `list` → `items` (+ routines, logs, drafts); `add-items { moment_id, kind_ids, bron, namen, bron_ref }`; `set-packed { id, packed }`; `remove-item { id }`; `confirm-received { moment_id, next_moment_id, received }` (receiving parent only, after the handover time; missing items carry over); `add-routine { kind, dag, item, reden }`; `remove-routine { id }`; `share-log { moment_id, kind_ids, inhoud }`; `unshare-log { moment_id, log_id, kind_ids }`; `save-draft { moment_id, inhoud, kind_ids }`; `delete-draft { moment_id, kind_ids }`.

**manage-messages** — `list` → `conversations`; `unread` → `unread_total`; `create { title, child_id?, other_parent_id?, initial_message?, tone_level?, client_id? }`; `messages { conversation_id, since?, mark_read? }` (also marks read); `send { conversation_id, content, tone_level, client_id }` (idempotent per `client_id`); `mark-read { conversation_id }`; `update { conversation_id, pinned?, muted_until?, archived?, title?, share?, other_parent_id? }`; `save-draft { conversation_id, draft }` / `clear-draft`; `agree { conversation_id, message_id, label, note?, client_id?, event_id? }` (one agreement per message, posts a confirmation, links the appointment the client created); `delete { conversation_id }` (only an empty prepared topic, by its creator).

**manage-moments** — `list`; `create { child_id, visibility: private|parents|circle, kind, text, photo_base64?, phase, milestone, circle_ids, happened_on }`; `react { moment_id, reaction, text? }` (one per other parent; `momentReactie`); `set-visibility { moment_id, visibility }`; `delete { moment_id }`.

**manage-personal** — kinds `houvast_zin`, `houvast_moment`, `wissel_log`, `solo_note`, `safety_report` (not editable), `co_chat` (singleton). `list { kinds? }`, `add { kind, data }`, `update { id, data }`, `put { kind, data }` (singletons), `delete { id }`, `clear { kind }`.

**manage-pickups** — Parents: `list` → `assignments` (+ check-ins, help requests); `assign { child_ids, moment_key, moment_type: wissel|afspraak, date, time, place, title, assignee_type: parent|caregiver|contact, assignee_id }`; `withdraw { id }`; `checkin { child_ids, kind: onderweg|aangekomen, moment_key, date, time }`; `help-ask { child_ids, what, date, time, recipients }`; `help-withdraw { id }`. Caregivers: `mine`; `respond { id, answer, reason? }` (accept/decline); `packed { id, item, packed }`; `on-the-way { id }`; `arrived { id }` (only on the day, after accepting); `help-respond { id, answer, reason? }` (first to accept gets it).

**manage-profile** — `get` → `user`; `update { name?, usage_mode: together|solo?, onboarding_completed?, preferences? }`; `set-avatar { image_base64 | avatar }`; `delete-account { password }` (deletes/hands over children, nulls FKs, deletes the profile and the `auth.users` mirror).

**manage-still-needed** — `list`; `create { title, category, child_ids|child_id, shared, other_parent_id, budget_id, buyer, deadline, notes, is_purchased }`; `toggle { id, is_purchased }`; `link_budget { id, budget_id }`; `set_buyer { id, buyer }`; `update { id, … }`; `delete { id }`. (Note the underscore action names.)

**manage-tasks** — `list` → `tasks` (+ belongings); `create { title, child_ids, shared, other_parent_id, assign, deadline, recurrence, recurrence_text, reminder_days, contact_status, source }`; `toggle { task_id, done }`; `set-contact-status`; `claim { task_id }`; `request { task_id }` (ask the other parent to take it, `taakGevraagd`); `cancel-request`; `respond-request { task_id, accept }`; `update`; `delete` (soft); `restore`; `belonging-create { child_id, name, item_type, location, shared, other_parent_id }`; `belonging-update { belonging_id, … }`; `belonging-delete`; `belonging-restore`.

**manage-vacations** — `list`; `propose { fields }`; `amend { id, fields }` (pending revision keeps confirmed fields); `set-split { id, ouder }`; `respond { id, response }`; `withdraw { id }`.

**send-invitation** — `send { to_email, child_ids, redirect_origin? }` → `invitation, invite_link, email_sent`; `resend { invitation_id }` (same response).

**send-notification** — `list` → `notifications` (latest 200) + read-marks; `mark-read { item_ids }`.

### 5.3 Notification keys per function (101 keys, all used)

| Function | `lib.meldingen` keys |
|---|---|
| accept-invitation | uitnodigingGeaccepteerd, uitnodigingAfgewezen |
| handover-reminders | overdrachtLijstKlaar, overdrachtMorgen, overdrachtAllesMeegekomen |
| manage-agenda | afspraakNieuw, agendaVoorstel, agendaAkkoord, agendaAnderVoorstel, agendaNietAkkoord, agendaMeerTijd, zorgVoorstel, zorgAkkoord, zorgAnderVoorstel, zorgNietAkkoord, zorgMeerTijd, zorgHerinnering, aanwezigheidVraag, aanwezigheidAkkoord, aanwezigheidNiet, nuAfstemmenVraag, nuAfstemmenAntwoord |
| manage-agreements | afspraakVoorstel, afspraakWijzigVoorstel, afspraakStopVoorstel, afspraakReactie, afspraakAkkoord, afspraakAnderVoorstel, afspraakNietAkkoord, afspraakMeerTijd, afspraakIngetrokken, besluitVoorstel, besluitGedeeld, besluitAkkoord, besluitNietAkkoord, besluitIngetrokken |
| manage-children | kindOntkoppeld, regelingBevestigen, regelingKlopt, regelingKloptNiet, gezagBevestigen, gezagBevestigd, gezagBetwist, toegangVerzoek, toegangAkkoord, toegangNietAkkoord |
| manage-documents | documentToegevoegd |
| manage-expenses | kostToegevoegd, kostAkkoordGevraagd, kostReactie, kostOpmerking, kostGewijzigd, kostIngetrokken, kostVerwijderd, kostHerinnering, budgetVoorstel, budgetReactie, budgetGewijzigd, budgetIngetrokken, budgetHerinnering, verrekeningGestart, betaalverzoek, betalingGemeld, ontvangstBevestigd, verrekeningAfgerond, vasteLastToegevoegd, vasteLastGewijzigd, vasteLastVerwijderd, potToegevoegd, potGewijzigd, potVerwijderd, potStorting, potStortingVerwijderd, kostenAfspraakVoorstel, kostenAfspraakReactie |
| manage-handover | overdrachtVerzoek, overdrachtAllesOntvangen, overdrachtNietMeegekomen, vasteSpullenGewijzigd |
| manage-moments | momentReactie |
| manage-pickups | ophaalToegewezen, ophaalVoorJou, ophaalGevraagd, ophaalGeaccepteerd, ophaalGeweigerd, ophaalIngetrokken, ophaalGewist, onderweg, aangekomen, hulpGevraagd, hulpVerstuurd, hulpGeaccepteerd, hulpAfgewezen, hulpIngetrokken |
| manage-tasks | taakGevraagd, taakGeaccepteerd, taakAfgewezen, taakVerzoekIngetrokken, taakGewijzigd, taakGedeeld, taakVerwijderd |

### 5.4 `_shared` helpers (30 files)

| File | Main exports | Role |
|---|---|---|
| `respond.ts` | `serveActions`, `goneHandler`, `ok`, `fail`, `HttpError`, `err`, `check`, `ErrorCode` | Dispatch, JSON envelope, coded errors |
| `cors.ts` | `corsHeaders`, `handleOptions` | CORS (allows `x-session-token`) |
| `db.ts` | `db()` | Service-role client; no anon fallback |
| `session.ts` | `requireUser`, `optionalUser`, `createSession`, `revokeCurrentSession`, `revokeAllSessions` | Custom sessions |
| `password.ts` | `assertPasswordPolicy`, `hashPassword`, `verifyPassword` | bcrypt + policy |
| `codes.ts` | `issueCode`, `checkCode`, `clearCode`, `assertCodeRateLimit`, `guardCodeCheck`, `assertIpRate`, `recordIpEvent`, `countRateEvents`, `recordRateEvent`, `clientIp`, constants | 6-digit codes, rate limits |
| `users.ts` | `toApiUser`, `loadProfile`, `loadApiUser`, `findProfileByEmailWithSecrets`, `PROFILE_PUBLIC_COLS` | Profile ↔ API user |
| `util.ts` | `isUuid`, `requireUuid`, `normalizeEmail`, `optText`, `reqText`, `optDate`, `isPlainObject`, `jsonSize`, `parseJsonText`, `randomHex`, `sha`/`sha256Hex`, `safeEqual`, `escapeHtml`, `likeExact` | Validation/crypto |
| `access.ts` | `childIdsFor`, `assertChildAccess`, `coParentIdsFor`, `findConnection`, `parentCount`, `coParentsByChild`, `pairOf`, `ACTIVE_CONNECTION` | Children/co-parent access, per-child pairing |
| `children.ts` | `buildChildren`, `buildChild`, `redact`, `CHILD_COLS`, `SECTION_COLUMNS`, `PROFILE_SECTION`, `sectionOfColumn` | API child shape (never bsn/private notes; hides sections not viewable) |
| `parent-permissions.ts` | `parentMay`, `parentMayBatch`, `assertParentMay`, `accessFor`, `accessOfAllParents`, `seedBaseline`, `dropAccess`, `writeAccess`, `publicAccess`, `normaliseFlags`, `isRestriction`, `SECTIONS`, `ENFORCED_SECTIONS` | "Gezag en toegang" |
| `invitations.ts` | `OPEN_INVITE_STATUSES`, `isInviteExpired`, `toApiInvitation`, `maskEmail` | Invitation helpers |
| `origin.ts` | `appOrigin`, `allowedOrigins` | Link origin for e-mails (`PUBLIC_APP_URL`/`APP_ORIGINS`) |
| `mail.ts` | `sendEmail`, `verificationEmail`, `resetEmail`, `invitationEmail`, `emailLayout`, `INVITE_TTL_DAYS` | SMTP (nodemailer) first, Resend API fallback |
| `family-mail.ts` | `caregiverInviteEmail` | Circle invitation e-mail (client texts) |
| `family-caregivers.ts` | `SECTIONS`, `CAREGIVER_COLS`, `todayNl`, `inPeriod`, `hasLiveAccess`, `normLevel`, `liveCaregiverRows`, `rowGrants`, `caregiverGrantsFor`, `grantsAll`, `caregiverMay`, `assertCaregiverMay` | Circle permissions |
| `practical-scope.ts` | `familyFor`, `familyMembers`, `canSee`, `otherParents`, `addressFor`, `assertChildren`, `namesFor`, `caregiverAccess`, `caregiverProfilesFor` | Practical-domain scope |
| `practical-audit.ts` | `logAudit`, `notify` | Audit + notifications |
| `agenda-family.ts` | `familyScope`, `coParentsFor`, `assertOnePair`, `canSee`, `assertResponder`, `childIdsFromBody`, `toAbs`, `toRel`, `RESPONSES`, `response`, `audit`, date/time validators | Agenda scope, viewer-relative tokens (`is:<uuid>` / `not:<uuid>`) |
| `agenda-packing-options.ts` | `PACKING_OPTIONS`, `CHECKLIST_RETENTION_DAYS` | Packing list options |
| `handover-schedule.ts` | `loadSchedules`, `parentOn`, `handoversOn`, `plusDays`, `localInstant`, `localParts`, `TZ` | Server-side derivation of handover moments (same rules as `src/lib/agenda-zorg.js`) |
| `costs-family.ts` | `familyOf`, `costPair`, `pairFilter`, `otherOf`, `assertParticipant`, `childParents`, `pairSees`, `assertVisible`, `visibleRows`, `assertActivePartner`, `storeAttachment`, `signReceipts`, `safePaymentLink`, `validIban`, `money`, `pct`, `audit`, `RECEIPTS_BUCKET` | Cost pair rules, receipts |
| `messages-access.ts` | `loadConversationFor`, `isParticipant`, `isConnected`, `otherOf`, `CONVERSATION_COLS`, `MESSAGE_COLS` | Conversation visibility |
| `storage.ts` | `uploadImage`, `resolveAvatar(s)`, `parseStoredRef`, `removeStored`, `removeFolder`, `AVATAR_BUCKETS` | Private buckets, 1 h signed URLs |
| `ai-openai.ts` | `requireAiUser`, `chatJson`, `chatText`, `transcribe`, `childrenForAi`, `familyLine`, `aiModel`, `ageOf`, `str`, `oneOf` | OpenAI calls + per-user AI rate limit |
| `ai-coach-prompts.js` | `bouwCoachVerzoek`, `coachSchema`, `toonSchema`, `nieuweDetails`, `COACH_STIJLEN`, … | Writing-help prompts |
| `ai-tools-prompts.js` | `intents`, `assistentSysteem`, `assistentSchema`, receipt/school/plan prompts + schemas | Assistant intent register and tool prompts |
| `ai-verhaal-prompts.js` | `systeem`, `verhaalSchema`, `bouwVerhaalInstructies`, `VERHAAL_MODI`, `VERHAAL_ACTIES` | Sparren met Co |
| `ai-co-persoonlijkheid.js` | `coPersoonlijkheid` | Co's fixed personality |
| `ai-co-conflictcoaching.js` | `coachHouding`, `berichtRegel`, `conflictVoorbeelden`, `kiesVoorbeelden`, `voorbeeldenTekst` | Conflict-coaching knowledge (only place) |
| `phase2-guard.ts` | `pinIdentity`, `phase` | **Legacy**, imported by no function |

---

## 6. Database

### 6.1 Ground rules

- **Never run `supabase/schema.sql`.** It is the historical baseline from the old app (47 `CREATE POLICY …
  USING (true)` open policies, public buckets, plaintext-era RPCs). Running it on a live project re-opens
  the database. Migrations are written to run on top of it, in name order.
- Every `public` table has RLS on and **no policies**; `anon`/`authenticated` have no grants. Never add a
  policy or grant: all access goes through the edge functions with the service role.
- Migrations are additive and idempotent (each one transaction, safe to run twice), except the release
  backfill that changed visibility (logged in `per_child_backfill_log`).
- Setting up a brand-new environment from scratch is **(unverified)**: the migrations assume the baseline
  tables exist. The safest route is restoring a schema dump of the existing project
  (`supabase db dump --linked`) rather than running `schema.sql`. If you must use `schema.sql` on an empty
  project, run all 9 migrations immediately after it (the Phase 1 lockdown removes the policies) and verify
  with the queries in `DEPLOY-RELEASE-2026-11.md` §1.

### 6.2 Migrations (9, run in this order)

| # | File | One line |
|---|---|---|
| 1 | `20261123000001_phase1_lockdown.sql` | Phase 1: drops all policies and browser grants, enables RLS everywhere, buckets private, adds `user_sessions`, `auth_rate_events`, `child_private_notes`, hashed codes + `preferences` on profiles, `children.description/profile`, re-hashes passwords, removes admin backdoor, lower-cases e-mails, dedupes `parent_connections`, `set_updated_at` triggers. |
| 2 | `20261123000002_custody_default.sql` | Drops the misleading `children.custody` default `'gezamenlijk'` (keeps real values from `practical_notes.custody`). |
| 3 | `20261124000001_family.sql` | Circle: `family_caregivers` gets `child_ids`, address, photo, `valid_from/valid_to`, invited/accepted/revoked fields; rotates non-open invite tokens; updated_at triggers. |
| 4 | `20261124000002_agenda.sql` | Agenda & care: new `calendar_event_proposals`, `appointment_attendance`, `care_schedule_exceptions`, `care_schedule_versions`, `urgent_requests`; columns on events, care proposals, vacations, handover tables; `agenda_final_status_guard`. |
| 5 | `20261124000003_costs.sql` | Costs: pair columns on expenses (`created_by`, `other_parent_id`, `turn_to_respond` …); new `expense_steps`, `expense_attachments`, `settlement_steps`, `cost_agreements`; `costs_forbid_update` append-only triggers. |
| 6 | `20261124000004_messages.sql` | Messages + AI: `last_message_sender_id`, `messages.client_id`, `messages_no_update`; new `conversation_reads`, `ai_requests`. |
| 7 | `20261124000005_practical.sql` | Practical: task columns, new `belongings`, `moment_reactions`, `activity_reads`, `evaluations`; moment visibility; documents source/soft delete; agreement versioning/decision columns; audit columns + `audit_events_append_only`; notification columns. |
| 8 | `20261127000002_release_2026_11.sql` | **Release November 2026 — combines seven earlier files** in order: (1) `20261125000001_hardening` — `claim_code_attempt()`, no password hashes in the auth mirror, account deletion fix, rate-limit index; (2) `20261125000002_per_child_pairs` — `other_parent_id` on practical tables + backfill + `per_child_backfill_log` + `per_child_pair()`; (3) `20261126000001_circle_pickups` — `pickup_assignments`, `pickup_checkins`, `help_requests`, `help_request_recipients`; (4) `20261126000002_personal_and_drafts` — message drafts, `message_agreements`, `personal_entries`; (5) `20261126000004_costs_pots_edit` — extra expense step types, `savings_pots` + `savings_pot_deposits`; (6) `20261126000005_child_access_handover` — `child_parent_permissions`, `child_permission_requests`, custody provenance on `child_parents`, `handover_note_drafts`, `handover_notification_log`; (7) `20261127000001_review_fixes` — atomic `start_settlement()`, drafts per pair, `profiles.password_must_be_set`. One transaction. |
| 9 | `20261128000001_invitation_email_status.sql` | **Comes after the release file.** `invitations.email_status` (`sent`/`failed`), `email_sent_at`, `email_attempts`. |

### 6.3 Tables (59)

"Baseline" = created in `schema.sql`; otherwise the creating migration is named. "Visibility" is enforced
in the functions (the database itself only allows the service role).

**Identity, sessions, family**

| Table | Origin | Purpose / key columns | Visibility | Used by |
|---|---|---|---|---|
| `profiles` | baseline (+P1: `code_hash`, `code_purpose`, `code_expires_at`, `code_attempts`, `preferences`; +release: `password_must_be_set`) | Accounts: `email` (lower-case), `password` (bcrypt), `name`, `avatar_url`, `usage_mode` (`together`/`solo`), `role`, `is_verified`, `onboarding_completed`, `preferences.app`. Legacy: `verification_code`, `session_token`, `handover_initialized`. | Own row; names/avatars of linked people | custom-auth, manage-profile, most functions (names) |
| `user_sessions` | P1 | `token_hash`, `user_id`, `expires_at`, `revoked_at`, `last_seen_at`, `user_agent` | Server only | `_shared/session.ts` |
| `auth_rate_events` | P1 | `email` (or `ip:<addr>`), `kind`, `created_at` | Server only | `_shared/codes.ts`, send-invitation |
| `children` | baseline (+P1: `description`, `profile` JSON sections) | `name`, `date_of_birth`, `color_code`, `avatar_url`, `care_schedule` (JSON text: base schedule + `ikId` + `bevestiging`), `custody`, `bsn` (plaintext, never returned by `list`), school/doctor/medical/size fields, `created_by` | Creator + linked parents (`child_parents`); sections per `child_parent_permissions` | manage-children, everything child-scoped |
| `child_parents` | baseline (+release: `gezag_status`, `gezag_provenance`, `reported_by/at`, `acknowledged_by/at`, `restrictions_note`) | Link child ↔ parent: `role`, `can_edit` | Parents of the child | access helpers, manage-children, accept-invitation |
| `child_private_notes` | P1 | One private note per child **per parent** | Only that parent | manage-children |
| `child_parent_permissions` | release | Per child × parent × section: `can_view/propose/edit`, `basis` (`legacy_baseline`/`self_restriction`/`agreed`/`reviewed`) | Parents of the child | `_shared/parent-permissions.ts`, manage-children, accept-invitation |
| `child_permission_requests` | release | Requested access change, `approver_id`, `status` | Parents of the child | manage-children |
| `invitations` | baseline (+mig 9: `email_status`, `email_sent_at`, `email_attempts`) | Co-parent invitations: `from_parent_id`, `to_email`, `token`, `status`, `child_ids`, `to_parent_id`, `expires_at` | Inviter; invitee via token | send-invitation, accept-invitation, manage-children |
| `parent_connections` | baseline | Undirected pair `parent_1_id`/`parent_2_id`, `status` (`active`/`connected` = active) | The two parents | access helpers, accept-invitation |
| `family_caregivers` | baseline (+family mig) | Circle members: `name`, `role`, contact fields, `invite_token`, `status`, `connected_user_id`, `child_ids`, `valid_from/to`, invited/accepted/revoked | Parents of the member's children; the member (live access) | manage-caregivers, manage-pickups, practical scope |
| `caregiver_permissions` | baseline | `caregiver_id`, `child_id`, `section`, `permission_level` | Same | manage-caregivers, `family-caregivers.ts` |
| `per_child_backfill_log` | release | Which rows the per-child backfill made private (`table_name`, `row_id`, `change`) | Diagnostics only | **not used by functions** |

**Agenda, care, handover**

| Table | Origin | Purpose / key columns | Visibility | Used by |
|---|---|---|---|---|
| `calendar_events` | baseline (+agenda: `child_ids`, `category_key`, `take_along`, `meta`, `deleted_at/by`) | Appointments: dates/times, `is_all_day`, `is_shared` (false = private), `recurrence`, `skipped_dates`, `attendance_needed` | Creator; co-parent when shared and all children shared | manage-agenda, manage-messages (agree link) |
| `calendar_event_proposals` | agenda | One open proposal per appointment (`kind` create/update/delete, `scope`, `fields`, `status` open/geaccepteerd/afgewezen/alternatief/ingetrokken, `reply_by`) | Pair | manage-agenda |
| `appointment_attendance` | agenda | Who attends (`keuze`, `wie_gaat`, `contact_wie`, `uitkomst`, `nabespreking`, `history`) | Pair | manage-agenda |
| `care_schedule_proposals` | baseline (+agenda: `soort`, `dates`, `naar`, `wisseltijd`, `plek`, `reply_by`, `more_time`, `reminders`, `alternative`, …) | Weekly-schedule change proposals | Pair | manage-agenda |
| `care_schedule_exceptions` | agenda | One-off accepted changes per child/date (`parent` token) | Parents of the child | manage-agenda, handover-schedule |
| `care_schedule_versions` | agenda | Structural changes from `valid_from` (`schedule` JSON) | Parents of the child | manage-agenda, handover-schedule |
| `urgent_requests` | agenda | "Nu afstemmen": `categorie`, `titel`, `old_time/new_time`, `status` open/opgelost, `antwoord` | Pair | manage-agenda |
| `vacations` | baseline (+agenda: `child_ids`, `fields`, `confirmed`, `history`, `reply_by`, `response`, `more_time`) | Holidays/special days as proposals | Pair | manage-vacations, handover-schedule |
| `handover_checklist_items` | baseline (+agenda: `child_ids`, `source`, `packed_by/at`, `received`, `removed`, `deleted_at`) | Packing list per handover date (`moment_id` = YYYY-MM-DD) | Parents of the children | manage-handover, handover-reminders, manage-pickups |
| `fixed_routines` | baseline | Fixed items per child/weekday ("Vaste spullen") | Parents of the child | manage-handover, handover-reminders |
| `handover_logs` | baseline (+agenda: `moment_id`, `content`, `to_parent`, `child_ids`) | Shared handover notes | Pair | manage-handover |
| `handover_note_drafts` | release (+`pair_key`, `child_ids`) | Unshared note drafts per author/date/pair | Author only | manage-handover, handover-reminders (cleanup) |
| `handover_notification_log` | release | Idempotency log for timed reminders (`kind`, `moment_id`, `child_key`, `recipient_id`) | Server only | handover-reminders |
| `pickup_assignments` | release | Who picks up/drops off: `moment_key`, snapshot date/time/place/title, `assignee_type` parent/caregiver/contact, `status` requested/accepted/declined/withdrawn/done, `packed_items`, `on_the_way_at`, `arrived_at`, `other_parent_id` | Creator, other parent, the assignee caregiver | manage-pickups, manage-caregivers |
| `pickup_checkins` | release | Parent "onderweg"/"aangekomen" per moment | Pair | manage-pickups |
| `help_requests` | release | "Hulp vragen" to the circle: `what`, date/time, `status`, `accepted_caregiver_id` | Creator, other parent, recipients | manage-pickups |
| `help_request_recipients` | release | Per recipient: `status`, `reason` | Same | manage-pickups, manage-caregivers |

**Costs**

| Table | Origin | Purpose / key columns | Visibility | Used by |
|---|---|---|---|---|
| `expenses` | baseline (+costs: `created_by`, `other_parent_id`, `child_ids`, `paid_from`, `split_choice`, `turn_to_respond`, `counter_pending`, `confirmed_by/at`, `settlement_id`, over-budget) | Expenses: `amount`, `payer_id`, `payer_share_percent`, `status` (e.g. `wacht`, `bevestigd`, `verrekend`, `ingetrokken`), `budget_id` | Pair rule (`pairSees`) | manage-expenses |
| `expense_steps` | costs | Append-only responses/comments (`step_type`: toegevoegd, akkoord, ander_voorstel, niet_akkoord, meer_tijd, opmerking, verrekend, gewijzigd, ingetrokken, gedeeld, herinnering) | Pair | manage-expenses |
| `expense_attachments` | costs | Receipts in bucket `receipts` (`storage_path`, `mime`) | Pair | manage-expenses |
| `budget_proposals` | baseline (+costs: `other_parent_id`, `child_ids`, `expense_id`) | Budgets for a future expense (never an expense itself) | Pair | manage-expenses, manage-still-needed, manage-profile |
| `budget_steps` | baseline (+costs: `creator_pct`, `review_at`) | Append-only budget history | Pair | manage-expenses, manage-profile |
| `settlements` | baseline (+costs: `description`, `bank_account_name`, `bank_iban`, `requested_at`, `finished_at`) | "Afrekenen": `payer_id`, `receiver_id`, `amount`, `status` (nog-te-betalen → betaalverzoek-gedeeld → wacht-op-ontvanger → ontvangst-bevestigd → afgerond), `expense_ids`, `payment_link`, `reference_code` | Payer + receiver | manage-expenses |
| `settlement_steps` | costs | Append-only status steps | Pair | manage-expenses |
| `recurring_expenses` | baseline (+costs: `other_parent_id`, `child_ids`) | Fixed costs ("Vaste lasten"), display only | Pair or private | manage-expenses |
| `savings_pots` | baseline **and** release (`CREATE TABLE IF NOT EXISTS`; +`other_parent_id`, `child_ids`, `note`) | Savings pots ("Spaarpotjes"), `current_amount` kept = sum of deposits | Pair or private | manage-expenses |
| `savings_pot_deposits` | release | Deposits per pot | Pot visibility | manage-expenses |
| `cost_agreements` | costs | Cost agreement per pair: `split_mode`, `proposer_pct`, `settle_moment`, `approval_threshold`, `status` | Pair | manage-expenses |
| `still_needed_items` | baseline (+costs: `other_parent_id`, `child_ids`, `buyer_id`, `expense_id`) | "Nog nodig" list, optional `budget_id` | Creator; addressed parent while all children shared | manage-still-needed |

**Messages and AI**

| Table | Origin | Purpose / key columns | Visibility | Used by |
|---|---|---|---|---|
| `conversations` | baseline (+messages: `last_message_sender_id`) | One per topic: `title`, `related_child_id`, `created_by`, `other_parent_id` (NULL = prepared topic) | Creator + other parent | manage-messages, ai-tools |
| `messages` | baseline (+messages: `client_id`) | Append-only (`messages_no_update`): `content`, `tone_level`, `is_system` | Participants | manage-messages, ai-tools (summary) |
| `conversation_reads` | messages (+release: `draft`, `draft_updated_at`) | Per user: `last_read_at`, `pinned`, `muted_until`, `archived`, draft | That user | manage-messages |
| `message_agreements` | release | "Akkoord" on a message: `label`, `event_id`, `confirmation_message_id` | Participants | manage-messages |
| `ai_requests` | messages | AI rate limit log: `user_id`, `feature`, `created_at` (never content) | Server only | `_shared/ai-openai.ts` |

**Practical, agreements, history, notifications, personal**

| Table | Origin | Purpose / key columns | Visibility | Used by |
|---|---|---|---|---|
| `tasks` | baseline (+practical: `child_ids`, `assignee_id`, `requested_to/by`, `contact_status`, completion, soft delete; +release: `other_parent_id`) | Tasks ("Taken") | `practical-scope.canSee` | manage-tasks |
| `belongings` | practical (+release `other_parent_id`) | Belongings ("Spullen"): `item_type`, `location_parent_id/text`, `responsible_id` | Same | manage-tasks |
| `shared_moments` | baseline (+practical: `visibility` private/parents/circle, `circle_ids`, `phase`, `milestone`, `entry_kind`, `happened_on`, `deleted_at`; +release `other_parent_id`) | Moments + milestones; photo in bucket `moments` | Author; parents; chosen circle | manage-moments |
| `moment_reactions` | practical | One reaction per user per moment | Moment visibility | manage-moments |
| `documents` | baseline (+practical: `source`, `file_name`, `deleted_at`; +release `other_parent_id`) | Documents in bucket `documents`; `is_shared` | Uploader; addressed parent; circle with grant | manage-documents |
| `parent_agreements` | baseline (+practical: versioning, proposal, `agreed_by/at`, `decision_kind/mode`, `responses`, `revision`, …; +release `other_parent_id`) | Agreements **and** decisions (one table) with append-only `history` | Pair | manage-agreements, manage-profile |
| `evaluations` | practical | Half-yearly review answers per user | Own | manage-agreements |
| `audit_events` | baseline (+practical: `child_ids`, `item_label`, `changes`, `meta`, `origin`) | Append-only family history | Family scope (§3.6) | log-audit, all writers |
| `notifications` | baseline (+practical: `category`, `read_at`, `entity_type/id`, `child_ids`) | In-app notifications (`title` = i18n key) | Recipient | send-notification, notify(), accept-invitation, handover-reminders |
| `activity_reads` | practical | Activities read-marks per user (`item_id`) | Own | send-notification |
| `personal_entries` | release | Owner-only data by `kind` (`data` JSON) | Owner only | manage-personal |
| `device_tokens` | baseline | Push tokens (APNs/FCM) | – | **unused** (push is not in Milestone 2) |

### 6.4 SQL functions (26 persisted) and triggers (21)

Functions from the **baseline** (`schema.sql`, 18): the legacy RPCs `custom_login`, `custom_signup`,
`custom_verify_email`, `custom_resend_verification`, `custom_request_password_reset`,
`custom_verify_reset_otp`, `custom_reset_password`, `custom_get_current_user`, `custom_logout`,
`custom_create_child`, `custom_get_my_children`, `custom_update_child`, `custom_delete_child`,
`custom_update_usage_mode`, `custom_disconnect_coparent` (15; execute revoked from browser roles in Phase 1,
**never dropped**, unused); and `handle_new_user`, `handle_user_delete` (auth.users sync, legacy),
`sync_profile_to_auth_user` (redefined in P1 and in the release so the `auth.users` mirror always gets a
random unusable password).

Functions from **migrations** (8):

| Function | Migration | What it does |
|---|---|---|
| `set_updated_at()` | P1 | Generic `updated_at` trigger function |
| `agenda_final_status_guard()` | agenda | Final statuses of appointment/care proposals cannot change |
| `costs_forbid_update()` | costs (redefined in release) | Step tables append-only; the release version allows only "columns become NULL" so account deletion (`ON DELETE SET NULL`) works |
| `messages_no_update()` | messages | Messages cannot be edited |
| `audit_events_append_only()` | practical | No UPDATE/DELETE on `audit_events` |
| `claim_code_attempt(p_id, p_purpose, p_max)` | release | Atomically claims a code attempt before comparing (5-attempt cap under parallel guesses) |
| `per_child_pair(owner, kids, at)` | release | The one co-parent connected with `owner` at time `at` and linked to every child (used by the backfill) |
| `start_settlement(p_created_by, p_payer, p_receiver, p_amount, p_period, p_expense_ids, p_reference)` | release | Atomic settlement start: advisory lock per pair, returns an existing open settlement holding one of the expenses, refuses already-settled expenses, writes the first step. `SECURITY DEFINER`, executable only by `service_role`. |

(`pg_temp.try_jsonb` and `pg_temp.safe_jsonb` are session-local helpers inside migrations, not persisted.)

Triggers (21):

| Trigger | Table | Origin |
|---|---|---|
| `on_auth_user_created` → `handle_new_user` | `auth.users` | baseline (legacy) |
| `on_auth_user_deleted` → `handle_user_delete` | `auth.users` | baseline (legacy) |
| `trg_sync_profile_to_auth_user` | profiles | baseline |
| `trg_profiles_updated_at`, `trg_children_updated_at`, `trg_child_private_notes_updated_at` | profiles, children, child_private_notes | P1 |
| `trg_family_caregivers_updated_at`, `trg_caregiver_permissions_updated_at` | family_caregivers, caregiver_permissions | family |
| `trg_event_proposals_updated`, `trg_attendance_updated` | calendar_event_proposals, appointment_attendance | agenda |
| `trg_event_proposals_final`, `trg_care_proposals_final` (→ `agenda_final_status_guard`) | calendar_event_proposals, care_schedule_proposals | agenda |
| `expense_steps_append_only`, `budget_steps_append_only`, `settlement_steps_append_only` (→ `costs_forbid_update`) | expense_steps, budget_steps, settlement_steps | costs |
| `trg_conversations_updated_at`, `trg_conversation_reads_updated_at` | conversations, conversation_reads | messages |
| `trg_messages_no_update` | messages | messages |
| `audit_events_append_only` | audit_events | practical |
| `set_updated_at` | belongings | practical |
| `trg_personal_entries_updated_at` | personal_entries | release |

### 6.5 Storage buckets (5, all private)

| Bucket | Used for | Written by |
|---|---|---|
| `avatars` | Parent avatars, circle member photos (`caregivers/<id>`) | manage-profile, manage-caregivers |
| `child-avatars` | Child photos | manage-children |
| `receipts` | Expense receipts/attachments (jpg/png/webp/pdf, ≤ 10 MB) | manage-expenses (`costs-family.ts`) |
| `documents` | Family documents (pdf, images, Word, txt; ≤ 10 MB via the function) | manage-documents |
| `moments` | Moment photos | manage-moments |

The baseline created them public (except `documents`); Phase 1 and the practical migration made all of them
private and removed storage policies. Files are uploaded through the functions (base64) and handed out only
as **1-hour signed URLs** after the access check. Photos are resized client-side (`verkleinFoto`, max
1600 px JPEG, strips EXIF). Preset avatars are stored as `avatar:n` strings, not files.

---

## 7. Secrets and environment variables

### 7.1 Edge function secrets (`Deno.env.get`, 23 names)

| Name | Required | Used in | What breaks without it |
|---|---|---|---|
| `SUPABASE_URL` | provided by Supabase | `_shared/db.ts` | Everything (`db()` throws) |
| `SUPABASE_SERVICE_ROLE_KEY` | provided by Supabase | `_shared/db.ts` | Everything |
| `PUBLIC_APP_URL` | **yes** | `_shared/origin.ts` | Links in e-mails. Without it (and without `APP_ORIGINS`) co-parent and circle invitations fail with `500 NOT_CONFIGURED` "App URL is not configured (set PUBLIC_APP_URL)" before anything is stored |
| `APP_ORIGINS` | recommended | `_shared/origin.ts` | Comma-separated allow-list for `redirect_origin` (e.g. `https://app…,http://localhost:5173`); also fallback for `PUBLIC_APP_URL` |
| `SMTP_HOST` / `EMAIL_HOST` | one transport required | `_shared/mail.ts` | No e-mails (verification codes, reset codes, invitations). `register` still succeeds (`email_sent:false`); invitations get `email_status='failed'` |
| `SMTP_PORT` / `EMAIL_PORT` | optional (default 587) | mail | – |
| `SMTP_USER` / `EMAIL_USER` | with SMTP | mail | – |
| `SMTP_PASS` / `EMAIL_PASS` | with SMTP | mail | SMTP needs host + pass; a `re_…` value is also used as a Resend key |
| `SMTP_FROM` / `EMAIL_FROM` | optional | mail | Default sender "Ouderschap & Co <…>" |
| `RESEND_API_KEY` | alternative transport | mail | Fallback when SMTP fails or is not set |
| `SUPPORT_EMAIL` | optional | mail footer | The "Questions?" sentence is left out |
| `OPENAI_API_KEY` | for AI | `_shared/ai-openai.ts` | All AI actions answer `503 NOT_CONFIGURED`; nothing else affected |
| `OPENAI_MODEL` | optional (`gpt-4o-mini`) | ai-openai | – |
| `OPENAI_TRANSCRIBE_MODEL` | optional (`whisper-1`) | ai-openai | – |
| `AI_RATE_PER_MINUTE` | optional (20) | ai-openai | – |
| `AI_RATE_PER_DAY` | optional (300) | ai-openai | – |
| `HANDOVER_CRON_SECRET` | **yes** for reminders (≥ 16 chars; deploy guide says ≥ 32) | handover-reminders | Every call answers 401; no timed handover reminders |
| `HANDOVER_EVENING_TIME` | optional (`19:00`, Europe/Amsterdam) | handover-reminders | – |

(The `EMAIL_*` names are aliases of the `SMTP_*` names: 18 distinct settings, 23 names.) No longer used,
remove if present: `JWT_SECRET`, `VITE_OPENAI_API_KEY`, `VITE_LOVABLE_API_KEY`.

### 7.2 Frontend (`VITE_*`, 3)

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (required), `VITE_API_MOCK` (local mock only, never in a
deployed build). See §2.

---

## 8. Frontend

### 8.1 Routing

- `vite.config.js` has **no** TanStack router plugin: `src/routeTree.gen.js` is **not** regenerated. To add
  a route, register it by hand in three places in that file: the `import { Route as XRouteImport }`, the
  `const XRoute = XRouteImport.update({ id, path, getParentRoute })`, and `rootRouteChildren`. (The
  `src/routes/README.md` still describes the old TanStack Start/`.tsx` setup; ignore it.)
- `__root.jsx`: public paths (`OPENBARE_PADEN` in `sessie-store.js`): `/welkom`, `/inloggen`, `/registreren`,
  `/verifieren`, `/wachtwoord-vergeten`, `/uitnodiging`. Everything else needs a session with finished
  onboarding, else → `/welkom`. `needs_password_reset` → `/verifieren`. Caregiver-only → `/verzorger`.
  `isNietInDezeFase` → `/`. It also renders `AppSlot` (app lock), `SpoedScherm` (urgent Nu afstemmen
  overlay) and the `Toaster`, and sets `document.title` from the deepest route's `head()`.
- Bottom tabs (`TAB_PADEN` in `AppShell.jsx`): `/`, `/agenda`, `/berichten`, `/kosten` (also active on
  `/boodschappen`), `/meer`. Tab pages get no back button. `meerPaden` lists the paths that highlight the
  Menu tab.

### 8.2 Routes (54 modules, 53 URL patterns)

"Hidden" = redirected to Home this phase. "Redirect" = legacy address that forwards.

| Path | File | Purpose | Main stores / components | Status |
|---|---|---|---|---|
| `/` | index.jsx | Home: today, what needs sorting, upcoming; first-time checklist | start, agenda, zorg, vakantie, kosten, budget, afspraken, taken, kring, overdracht, nu-afstemmen, import, voorkeuren; EersteHome, LivingHome, AfspraakFormulier, NuAfstemmen, Activiteiten | tab |
| `/welkom` | welkom.jsx | Start screen + onboarding steps (name, photo, Samen/Alleen) | auth-store; AuthKader | public |
| `/registreren` | registreren.jsx | Create account | auth-store; AuthKader | public |
| `/verifieren` | verifieren.jsx | Enter 6-digit code; choose password when required | auth-store; AuthKader | public |
| `/inloggen` | inloggen.jsx | Sign in | auth-store; AuthKader | public |
| `/wachtwoord-vergeten` | wachtwoord-vergeten.jsx | Reset password with a code | auth-store; AuthKader | public |
| `/uitnodiging` | uitnodiging.jsx | Accept a co-parent (`?token=`) or circle (`?t=`) invitation | auth-store, kring-store; CoOuderUitnodiging; calls `manage-caregivers get-by-token/accept` | public |
| `/agenda` | agenda.jsx | Shared calendar, weekly schedule ("Verdeling van de week"), holidays, attendance, proposals | agenda, zorg, vakantie, aanwezigheid, nu-afstemmen, taken, budget, start, voorkeuren; AfspraakFormulier, ZorgAfstemmen, AgendaWissels, AgendaVakanties, AanwezigheidAfstemmen, HulpVragen, VoorstelIntrekken | tab |
| `/vakantie/$id` | vakantie.$id.jsx | One holiday: split, travel, preparation | vakantie-store; AgendaVakanties | |
| `/planning` | planning.jsx | Redirects to `/agenda?onderdeel=vakanties` (only `?eerder` shows the earlier planning list) | AgendaVakanties | redirect |
| `/zorgregeling` | zorgregeling.jsx | → `/agenda` (care actions) | – | redirect |
| `/wissel` | wissel.jsx | → `/overdracht`, or `/agenda` for swap/extra night | – | redirect |
| `/overdracht` | overdracht.jsx | Handover: packing list, fixed items, notes, "Is alles meegekomen?", "Ik ben later", on-the-way status | overdracht-store, start; SlimmeMeeLijst, VasteRoutines, OverdrachtFormulier, IkBenLater, OnderwegStatus | |
| `/halen-brengen` | halen-brengen.jsx | Arrange pick-ups/drop-offs | kring-store (manage-pickups), overdracht, gezag; IkBenLater | |
| `/veranderd` | veranderd.jsx | "Nu afstemmen": child ill, pick-up fails, appointment moves | agenda, zorg, overdracht, kring, nu-afstemmen; HulpVragen | |
| `/berichten` | berichten.jsx | Messages per topic, Co writing help, tone meter, summary, drafts, "Akkoord" → agenda | berichten-store (25 s polling), agenda, nu-afstemmen; Communicatiemeter, EvenMeedenken, NuAfstemmen, Onveilig | tab |
| `/verhaal` | verhaal.jsx | "Sparren met Co" (vent / sort thoughts with Co) | persoonlijk-store (co_chat), afspraken, taken, vakantie; CoPrivacy | |
| `/kosten` | kosten.jsx | Costs: totals, quick actions, "Wacht op jou", expenses, budgets, settlement, fixed costs, pots, cost agreement per co-parent | kosten, budget, documenten, start; Afrekenen, BudgetVoorstel, VasteLasten, DeelKeuze, GeldInvoer, BonScanner, EigenLeeg, KostenTabs | tab |
| `/boodschappen` | boodschappen.jsx | "Nog nodig" (still to buy), budget links | nog-nodig, kosten, budget; DelenKeuze, KostenTabs | tab area (Kosten) |
| `/taken` | taken.jsx | Tasks, request to the other parent, help requests | taken-store; DelenKeuze, HulpVragen, GeschiedenisKnop | |
| `/spullen` | spullen.jsx | Belongings and where they are | taken-store, overdracht; DelenKeuze | |
| `/momentjes` | momentjes.jsx | Moments with the other parent/circle | momentjes-store; Momentjes | |
| `/documenten` | documenten.jsx | Documents; AI school letter, parenting-plan import, receipt | documenten-store; DelenKeuze, SchoolinfoUitlezen, OuderschapsplanImport, BonScanner | |
| `/afspraken` | afspraken.jsx | Agreements between parents (one source) | afspraken-store; VoorstelIntrekken | |
| `/afspraken-veiligheid` | afspraken-veiligheid.jsx | → `/afspraken` | – | redirect |
| `/beslissingen` | beslissingen.jsx | Decisions | afspraken-store (decision-*), gezag | |
| `/evaluatie` | evaluatie.jsx | Half-yearly review | evaluatie-store | |
| `/tijdlijn` | tijdlijn.jsx | Look back: chronological history | audit-store, afspraken | |
| `/exporteren` | exporteren.jsx | Build/preview/share a factual PDF | audit, afspraken, agenda, berichten, kosten, documenten, overdracht, vakantie, zorg; `pro-pdf.js` (jspdf) | |
| `/activiteiten` | activiteiten.jsx | Notifications + open proposals ("Wacht op jou") | meldingen-store; Activiteiten, VoorstellenOverzicht | |
| `/samen-regelen` | samen-regelen.jsx | → `/activiteiten?onderdeel=regelen` | – | redirect |
| `/kinderen` | kinderen.jsx | Layout (Outlet) | – | |
| `/kinderen/` | kinderen.index.jsx | Children list | start, kring | |
| `/kinderen/$kindId` | kinderen.$kindId.jsx | Child profile sections, private note, Gezag en toegang, moments, milestones | kindprofiel, start, kring, momentjes; GezagToegang, MedischGezag, Mijlpalen | |
| `/kring/$kindId` | kring.$kindId.jsx | Family circle of a child: members, permissions, period, invitations | kring-store; UitnodigingDelen | |
| `/verzorger` | verzorger.jsx | Caregiver view: allowed sections, pick-ups, help requests | kring-store, hulp-store, momentjes | caregivers |
| `/gezag` | gezag.jsx | Parental authority per child + access | gezag-store, start; GezagToegang | |
| `/verbonden-personen` | verbonden-personen.jsx | Connected people; disconnect (`accept-invitation disconnect`) | start, kring; AndereOuderUitnodigen | |
| `/privacy` | privacy.jsx | Who sees what | start, kring | |
| `/solo` | solo.jsx | Using the app Solo: logbook, invite the other parent | persoonlijk-store (solo_note); AndereOuderUitnodigen | |
| `/lastige-momenten` | lastige-momenten.jsx | Difficult-moment tips + "Mijn houvast" | persoonlijk-store | |
| `/kind-tips` | kind-tips.jsx | Your child and the separation (static content) | start | |
| `/extra-ondersteuning` | extra-ondersteuning.jsx | Extra support hub (groups existing routes) | voorkeuren | |
| `/contact` | contact.jsx | Making contact easier (extra options) | afspraken, gezag, voorkeuren | |
| `/ondersteuning` | ondersteuning.jsx | Support: who helps you and what they see | `pro-journaal-store` (local demo data) | visible, see §12 |
| `/meer` | meer.jsx | Menu | start, evaluatie; MeerLijst, Afmelden | tab |
| `/instellingen` | instellingen.jsx | Settings: profile, language, theme, quiet hours, app lock, sign-out | auth, start, voorkeuren, checkin; TaalKiezer, Afmelden | |
| `/rondleiding` | rondleiding.jsx | Tour | start | |
| `/juridisch` | juridisch.jsx | Legal & privacy texts | `juridische-bronnen.js` | |
| `/juridische-hulp` | juridische-hulp.jsx | External legal sources | `juridische-bronnen.js` | |
| `/gesprekken` | gesprekken.jsx | Calls (excluded) | gesprekken-store (local) | **hidden** |
| `/abonnement` | abonnement.jsx | Subscription (Milestone 3) | `abonnement.js` | **hidden** |
| `/professionals` | professionals.jsx | Professionals portal (Milestone 3) | pro-journaal-store; `components/pro/*` | **hidden** |
| `/begeleider-gesprek` | begeleider-gesprek.jsx | Conversation with counsellor (Milestone 3) | pro-journaal-store | **hidden** |

### 8.3 Stores (34)

| Store | Edge function(s) | Notes |
|---|---|---|
| `auth-store.js` | custom-auth (all 10), manage-profile `update`/`set-avatar`, accept-invitation `inspect`, manage-caregivers `get-by-token`/`update` | Session, status `laden|uit|onboarding|aan`, `opAuth()` |
| `sessie-store.js` | – | Old API derived from auth (`eigen`/`uit`), `OPENBARE_PADEN` |
| `start-store.js` | manage-profile, manage-children (`list`, `create`, `update`, `set-avatar`, `delete`, `save-schedule`, `confirm-schedule`, `save-custody`), send-invitation, accept-invitation (`list-sent`, `cancel`, `list-connected`) | Own family mirror: name, children (server uuids), schedule, invitations, `coOuders` |
| `voorkeuren-store.js` | manage-profile `update` | Preferences on the account (§3.4) |
| `kindprofiel-store.js` | manage-children (`get`, `update`, private note, `access`, `request/respond/withdraw-access`) | Child profile |
| `gezag-store.js` | manage-children (`list`, `save/confirm/dispute-custody`) | Custody, display only |
| `kring-store.js` | manage-caregivers (`list`, `create`, `update`, `revoke`, `send-invite-email`, `view-as`, `get-for-user`, `role`, `accept`), manage-pickups (parent + caregiver actions), manage-children | Circle, pick-ups, caregiver view, `useRol` |
| `hulp-store.js` | manage-pickups (`help-ask`, `help-withdraw`, `help-respond`) | Help requests |
| `agenda-store.js` | manage-agenda (`list`, event actions) | Load hub of the agenda domain |
| `zorg-store.js` | manage-agenda (care actions) | Care proposals, exceptions, versions |
| `aanwezigheid-store.js` | manage-agenda (attendance actions) | Attendance |
| `nu-afstemmen-store.js` | manage-agenda (`start-urgent`, `answer-urgent`) | Nu afstemmen |
| `vakantie-store.js` | manage-vacations (all) | Holidays |
| `overdracht-store.js` | manage-handover (all except `delete-draft`) | Handover lists, routines, notes |
| `berichten-store.js` | manage-messages (`list`, `create`, `messages`, `send`, `update`, `save-draft`, `clear-draft`, `agree`) | Messages, polling |
| `kosten-store.js` | manage-expenses (`overview`, expense + settlement + agreement actions) | One cost source |
| `budget-store.js` | manage-expenses (budget actions) | Thin layer on kosten-store |
| `vaste-lasten-store.js` | manage-expenses (recurring + pots) | Thin layer |
| `nog-nodig-store.js` | manage-still-needed (all) | Still needed |
| `taken-store.js` | manage-tasks (all) | Tasks + belongings |
| `momentjes-store.js` | manage-moments (all) | Moments |
| `documenten-store.js` | manage-documents (all) | Documents |
| `afspraken-store.js` | manage-agreements (agreements + decisions) | One agreements source |
| `evaluatie-store.js` | manage-agreements (`evaluation-list/save`) | Reviews |
| `import-store.js` | – (via afspraken-store `import`) | Parenting-plan import count for Home |
| `audit-store.js` | log-audit (`list`, `log`) | History |
| `meldingen-store.js` | send-notification (`list`, `mark-read`) | Notifications + read-marks |
| `persoonlijk-store.js` | manage-personal (all) | Owner-only personal data |
| `checkin-store.js` | – | Handover-day check-in; on/off is a preference |
| `acties-store.js` | – | UI state of Home's "Actie vereist" list |
| `terug-store.js` | – | Remembers "came from Home overview" |
| `email-koppeling-store.js` | – | E-mail linking (hidden this phase) |
| `gesprekken-store.js` | – | Calls (hidden, local) |
| `pro-journaal-store.js` | – | Professionals portal (local demo data, Milestone 3) |

AI wrappers (`src/lib/*.functions.js` via `ai-aanroep.js`): `assistent` → ai-assistant; `coach` → ai-coach;
`samenvatting`, `bon`, `schoolinfo`, `schoolbericht`, `ouderschapsplan` → ai-tools; `verhaal` →
co-assistant. New assistant intent = one entry in `intents` (`_shared/ai-tools-prompts.js`) + a navigation
rule in `src/components/Assistent.jsx`.

### 8.4 Key shared components

| Component | What it is |
|---|---|
| `AppShell.jsx` | `AppShell` (mobile column + bottom nav), `PageHeader`, `BackButton`/`TerugKnop`, `Card`, `TAB_PADEN`, `meerPaden` |
| `AuthKader.jsx` | Shared layout of all auth screens: `AuthKader`, `AuthFormulier`, `Veld`, `WachtwoordVeld`, `CodeVeld`, `HoofdKnop`, `WachtwoordEisen`, `TaalWissel` |
| `AfspraakFormulier.jsx` | The one "Nieuwe afspraak" form for Agenda **and** Home: multi-day, all-day, start/end time, for a child / all children / "Alleen voor mezelf" (private), optional category, "Neem mee" items, refuses mixed co-parents |
| `DeelKeuze.jsx` / `DelenKeuze.jsx` | "Alleen jij" / "Gedeeld" pickers (§4.2) |
| `Laden.jsx` | Loading/error views (`laadWeergave`, `LaadFout`, skeletons) |
| `EigenLeeg.jsx` | Calm empty state with one clear first step (+ optional add button) |
| `ui/sheet.jsx` | Radix-dialog bottom sheet (used by 28 route/component files) for forms and pickers; keep forms in sheets as the client designed |
| `Geschiedenis.jsx` | `GeschiedenisKnop` — per-item read-only history from the server audit |
| `VoorstelIntrekken.jsx`, `VoorstellenOverzicht.jsx` | Withdraw a proposal; open-proposals overview |
| `Activiteiten.jsx` | `useActiviteiten`, `ActiviteitenBel` |
| `ZorgAfstemmen.jsx`, `AgendaWissels.jsx`, `AanwezigheidAfstemmen.jsx`, `AgendaVakanties.jsx` | Agenda sub-flows |
| `Afrekenen.jsx`, `BudgetVoorstel.jsx`, `VasteLasten.jsx`, `GeldInvoer.jsx`, `KostenTabs.jsx` | Cost sub-flows (`GeldInvoer` for every amount) |
| `OverdrachtFormulier.jsx`, `SlimmeMeeLijst.jsx`, `VasteRoutines.jsx`, `IkBenLater.jsx`, `OnderwegStatus.jsx` | Handover sub-flows |
| `HulpVragen.jsx` | Help-request form reused in Taken, Agenda and handover |
| `GezagToegang.jsx` | Gezag en toegang per child (levels alles / voorstellen / bekijken …) |
| `CoOuderUitnodiging.jsx`, `AndereOuderUitnodigen.jsx`, `UitnodigingDelen.jsx` | Invitations |
| `NuAfstemmen.jsx`, `SpoedScherm.jsx` | Nu afstemmen card / full-screen urgent overlay |
| `Assistent.jsx`, `CoBadge.jsx`, `CoPrivacy.jsx`, `Communicatiemeter.jsx`, `EvenMeedenken.jsx` | Co / AI UI |
| `Tekens.jsx`, `AppIcon.jsx` | Icons (lucide only; no glyphs or emoji) |
| `ProfielBeeld.jsx` | The only renderer for profile images (`avatar:n` presets or photo) |

---

## 9. Main user workflows

Each step names the screen and the server action.

### 9.1 Register, verify, onboarding

1. `/welkom` → "Account maken" → `/registreren`: name, e-mail, password → `custom-auth register`
   (`needs_verification`, code e-mailed).
2. `/verifieren`: 6-digit code → `verify-email { email, code, password }` (same browser) → session.
   Other device / after reload (no password) → `needs_password_reset` → choose a password
   (`set-password`) before anything else.
3. Onboarding on `/welkom` (status `onboarding`): name (if unknown), photo, Samen/Alleen
   (`manage-profile update usage_mode`), children (`manage-children create`), optional weekly schedule;
   finishing sets `onboarding_completed=true` → Home. Home shows a first-time checklist.
4. Wrong code: `CODE_INVALID`; 5 wrong tries: `TOO_MANY_ATTEMPTS`; login before verifying: `NOT_VERIFIED`
   and a fresh code.

### 9.2 Invite a co-parent per child

1. Menu / `/verbonden-personen` / `/solo` → `AndereOuderUitnodigen`: choose the children and the e-mail
   → `send-invitation send`. The response gives `invite_link` (shareable) and `email_sent`.
2. The list (`accept-invitation list-sent`) shows status: waiting, viewed, "Niet verstuurd"
   (`email_status='failed'`, button "Opnieuw versturen" → `resend`), declined ("Afgewezen"), expired.
   The inviter can cancel.
3. The invitee opens `/uitnodiging?token=…` → `inspect`; registers/logs in with **the invited address**
   (pre-filled) → `accept`. Both see each other; the children appear for the invitee; baseline permissions
   are seeded; the inviter gets `uitnodigingGeaccepteerd`. Or `decline` → inviter notified.
4. To share a second child with a **different** parent, send a separate invitation for that child to that
   address. A child can never have more than two parents.

### 9.3 Appointments

1. Agenda "+" or Home "+" → `AfspraakFormulier`: title, one or more days, all day or start/end time, for a
   child / all children / "Alleen voor mezelf", optional category, "Neem mee" (take-along) items.
2. `manage-agenda create-event`: private, or shared with children that have no connected other parent →
   applied directly; shared → applied and the other parent gets `afspraakNieuw` (info). Mixed children of
   different co-parents → `MIXED_CHILDREN`.
3. Changing/deleting a shared appointment of a connected pair becomes a **proposal** (scope: only this
   one / from now on / whole series) the other parent answers; final statuses are frozen; the proposer
   can withdraw.
4. Attendance ("Aanwezigheid afstemmen"): `set-attendance` (who goes, incl. pick-up/drop-off) → other
   parent `respond-attendance` → afterwards `attendance-outcome` / `attendance-debrief`.

### 9.4 Weekly schedule ("Verdeling van de week") and change proposals

1. Base schedule per child in onboarding or the child profile → `manage-children save-schedule`. If the
   child has another parent, they get `regelingBevestigen` and answer "Klopt" / "Klopt niet" + note
   (`confirm-schedule`).
2. Change requests: Agenda shows open requests **above the calendar** ("Ja, is goed / Ander voorstel doen /
   Afwijzen"); the proposal form is a pop-up (from "+" or by tapping a day) → `propose-care`
   (`eenmalig` → exception, `structureel` → new version from a date). The other parent answers
   (`respond-care`); `remind-care` sends a reminder; the proposer can withdraw. Only acceptance changes the
   planning.

### 9.5 Costs

1. **Expense** ("Uitgave toevoegen") → `create-expense`: private by default; shared → addressed to the
   other parent of those children. Above the confirmed approval limit a shared expense needs an agreed
   budget and a receipt. Status `wacht` → the other parent sees "Wacht op jou" (also on Home) and answers
   Akkoord / Ander voorstel / Niet akkoord / Meer tijd (`respond-expense`). The creator can edit while
   unanswered, withdraw, delete, share a private one later, remind (max 2).
2. **Budget** → `create-budget` (always a proposal) → other parent answers; never becomes an expense until
   "Uitgave toevoegen" runs with the budget linked. Coverage decided only by `beoordeelKosten`
   (`src/lib/kosten-akkoord.js`).
3. **Settlement** ("Afrekenen") per co-parent → `start-settlement` (either parent; server computes amount
   and direction) → receiver shares payment link and/or IBAN (`share-payment-request`) → payer "Ik heb
   betaald" (`indicate-payment`, not proof) → receiver "Ontvangen" (`confirm-receipt`, expenses become
   `verrekend`) → `finish-settlement` (IBAN wiped). "Totaal openstaand" is always visible; totals per
   period.
4. **Savings pots** (`create-pot`, deposits) and **fixed costs** (`create-recurring`, display only).
5. **Cost agreement** per co-parent (split, settle moment, approval limit) → `save-agreement` → other parent
   `respond-agreement`. Solo parents record their own.
6. With several co-parents, Kosten, Contact and agreements let the user choose the other parent
   (`partner_id` / `other_parent_id`).

### 9.6 Messages

1. `/berichten`: topics (`create`, optionally with a first message); a topic prepared without a connected
   co-parent is visible only to its creator and attaches to the co-parent once exactly one exists.
2. Write → Co writing help (`ai-coach coach/tone`) → `send` (idempotent `client_id`). Messages cannot be
   edited or deleted. Unread badge from `list`; reading marks read.
3. **Drafts** are per user on the server (`save-draft` / `clear-draft`).
4. **"Akkoord" → agenda**: on a question of the other parent, "Akkoord geven" lets the parent create the
   appointment (`manage-agenda create-event`) and then `agree { message_id, label, event_id }` posts a
   confirmation message; both see the agreement.

### 9.7 Tasks, belongings, moments, documents, still needed

- All private by default; "Gedeeld" shares with the other parent of the child; edit/delete and
  loading/error states everywhere.
- Tasks: asking the other parent to take a task is a **request** (`request` → `respond-request`
  accept/decline); `claim` takes it yourself; deleted tasks can be restored.
- Moments: visibility private / parents / circle; the other parent reacts once.
- Documents: upload ≤ 10 MB, open via 1 h signed link.
- Nog nodig: optional budget link and buyer; buying never creates an expense by itself.

### 9.8 Handover ("Wissel" / "Overdracht")

1. Handover moments are **derived** from the care schedule (id = date), never stored.
2. Packing list ("Mee met de wissel"): fixed items per child/weekday (`add-routine`) + added items
   (`add-items`); `set-packed`. Lists expire one month after the handover.
3. Timed reminders (`handover-reminders`, every 15 min): ~48 h before → handing-over parent "list ready";
   the evening before (`HANDOVER_EVENING_TIME`) → reminder with packed count; ~1 h after → **receiving
   parent** "Is alles meegekomen?" (only when unconfirmed items exist). Held during rest mode/night muting;
   never sent twice.
4. Only the **receiving** parent answers "Is alles meegekomen?", and only after the handover time
   (`confirm-received`); missing items move to the next handover.
5. Handover notes: draft per author/date/pair (`save-draft`), shared with `share-log`.
6. "Ik ben later" (`IkBenLater`): sends a time proposal + a Nu afstemmen question; never changes the
   handover itself.

### 9.9 Family circle

1. `/kring/$kindId`: add a member (role, contact, children, per-section permissions, optional period),
   optionally invite (`manage-caregivers create { invite, send_email }`) → link `/uitnodiging?t=`.
2. The member accepts while signed in → caregiver-only accounts land on `/verzorger`.
3. **Pick-ups**: a parent assigns a pick-up/drop-off for a handover or appointment (`manage-pickups
   assign`) to themselves, the other parent, or a circle member (needs live `wissel`/`agenda` grant for every
   child) or a contact without the app. The caregiver accepts/declines (`respond`), ticks packed items,
   "onderweg" and "aangekomen" on the day; parents see the status. Parents also check in themselves
   (`checkin`).
4. **Help requests** ("Hulp vragen") to chosen members (`help-ask`); the first "Ik regel het" gets it
   (`help-respond`); parents see the result; the asker can withdraw.
5. Withdrawing access (`revoke`) or the period ending removes access immediately (checked on the server
   on every call).

### 9.10 Children

1. `/kinderen/$kindId`: sections basis, personen, school, gezondheid, praktisch, noodkaart (each replaced
   as a whole via `update`), private note per parent, moments/milestones.
2. **Gezag en toegang**: self-reported custody (other parent confirms or disputes) — display only; access
   per section for each parent (§4.6): lowering your own access is immediate, everything else is a request
   the other parent accepts.
3. Per-child schedule confirmation (§9.4).
4. **Delete vs unlink**: `manage-children delete` deletes the child (and photos) only when no other parent
   is linked; otherwise it **unlinks** you (ownership transfers to the other parent if you were the
   creator; accepted invitations for that child are closed; your private note and access rows are removed;
   the other parent gets `kindOntkoppeld`).

---

## 10. Deployment

Nothing in this repo deploys automatically; the client deploys.

### 10.1 Order

1. **Backup** (personal data — keep safe):
   ```bash
   npx supabase db dump --linked -f backup-before-release.sql
   npx supabase db dump --linked --data-only -f backup-before-release-data.sql
   ```
2. **SQL** in the SQL Editor (or `supabase db push`), in name order, only the files not applied yet. From a
   Phase-2 database: `20261127000002_release_2026_11.sql` then `20261128000001_invitation_email_status.sql`.
   Never `schema.sql`. Verify with the queries in `supabase/DEPLOY-RELEASE-2026-11.md` §1 (RLS on for every
   table, no grants, no policies, new objects exist). If part 1 warns it could not scramble `auth.users`
   passwords, run that block as `postgres`.
3. **Secrets** (§7): at least `PUBLIC_APP_URL`, `APP_ORIGINS`, SMTP or `RESEND_API_KEY`, `OPENAI_API_KEY`,
   `HANDOVER_CRON_SECRET`; optional `SUPPORT_EMAIL`, `HANDOVER_EVENING_TIME`, AI limits.
   `npx supabase secrets set NAME=value --project-ref <ref>`; check with `secrets list`.
4. **All functions** (shared helpers changed — never deploy only "the changed ones"):
   ```bash
   npx supabase functions deploy --project-ref <ref> --no-verify-jwt --use-api
   ```
   The retired stubs may be deployed (clean `410 GONE`) or deleted
   (`npx supabase functions delete <name> --project-ref <ref>`); never leave old versions of them live.
5. **Cron** for `handover-reminders` every 15 minutes with header `x-cron-secret: <HANDOVER_CRON_SECRET>`
   (Dashboard cron job, or pg_cron + pg_net with the secret in Vault as `handover_cron_secret`; SQL in
   `DEPLOY-RELEASE-2026-11.md` §4). Safe to run as often as wanted.
6. **Web build**: `npm run build` with only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; publish
   `dist/` (SPA fallback `public/_redirects`). Never set `VITE_API_MOCK` or any secret as `VITE_*`.
7. Supabase Dashboard → Authentication → Providers: disable e-mail sign-ups (the app uses its own auth).

### 10.2 Common failure: `403` on deploy

A `403` from `supabase functions deploy` / `secrets set` almost always means the **Supabase CLI is logged
into a different account** than the one that owns the project. Run `npx supabase logout`, then
`npx supabase login` with the owner account (or set `SUPABASE_ACCESS_TOKEN` of that account), and pass
`--project-ref <ref>` explicitly.

### 10.3 Rollback

Restore the backup and redeploy the previous functions and web build from git. Migrations are additive,
except the per-child backfill, which changed visibility (see `per_child_backfill_log`).

---

## 11. Testing checklist (3 accounts)

Use three accounts in separate browser profiles: **Mother (M)**, **Father A (A)**, **Father B (B)**. M has
child 1 with A and child 2 with B. Test in Dutch and spot-check English (Settings → "Taal · Language").
Every step: no error toast, no raw keys, no example names, the other side sees the change after switching
back to the tab.

**Setup**
- [ ] M registers, verifies (same browser), onboards, adds child 1 and child 2.
- [ ] M invites A for child 1 and B for child 2. With a missing `PUBLIC_APP_URL` the app must show a
  calm error and nothing is stored; with a failing mail transport the invitation shows "Niet verstuurd"
  and "Opnieuw versturen" works.
- [ ] A registers with the invited address and accepts; B declines once (M sees "Afgewezen"), then M
  re-invites and B accepts. Verify on another device without a password → asked to choose one.

**Per-child separation**
- [ ] M creates a shared task, appointment, expense, document and moment for child 1 → A sees them, **B
  sees nothing**. Same for child 2 the other way round.
- [ ] One item for child 1 + child 2 together → `MIXED_CHILDREN` message.
- [ ] Items without a child: M must choose A or B.
- [ ] New items default to "Alleen jij"; a private item is never visible to A/B; items made before linking
  stay private.
- [ ] Opening a URL of an item you may not see → "Deze pagina is niet beschikbaar voor jou."

**Agenda & care**
- [ ] Multi-day, all-day, "Alleen voor mezelf", "Neem mee"; Home "+" opens the same form.
- [ ] A changes a shared appointment → M answers; final status cannot change; withdraw works.
- [ ] Care proposal from "+" and by tapping a day; requests above the calendar; answer all four ways.
- [ ] M saves a base schedule for child 1 → A answers "Klopt" / "Klopt niet".
- [ ] Holiday proposal → answer.

**Costs**
- [ ] Shared expense with receipt → A "Wacht op jou" → Ander voorstel → back to M.
- [ ] Budget, cost agreement per co-parent (different split with A and B), pots, fixed costs.
- [ ] Settlement M↔A: start → receiver IBAN/link → payer "Ik heb betaald" → receiver "Ontvangen" → finish
  (IBAN gone).

**Messages**
- [ ] Topic + message (A sees it within ~25 s); draft survives reload/device; "Akkoord" creates the
  appointment and a confirmation message; Co writing help works.

**Handover**
- [ ] Packing list + fixed items; only the receiving parent sees "Is alles meegekomen?" after the
  handover time; missing items carry over; reminders arrive (call `handover-reminders` with the secret).

**Circle**
- [ ] M adds grandma for child 1 with `wissel` view; a 4th account accepts → lands on `/verzorger`, sees
  only that. Assign a pick-up → grandma accepts/declines, onderweg/aangekomen → M and A see the status.
  Help request → first to accept gets it. Revoke → access gone.

**Children & access**
- [ ] Gezag: M reports, A confirms/disputes. Access: A lowers own access (immediate); M requests a change of
  A's access → only effective after A accepts.
- [ ] M deletes child 1 → unlinked (A keeps it, gets `kindOntkoppeld`); deleting a Solo child deletes it.

**Security spot checks**
- [ ] `curl "https://<ref>.supabase.co/rest/v1/profiles?select=*" -H "apikey: <ANON_KEY>"` → permission denied.
- [ ] Any function without `x-session-token` → 401 `UNAUTHORIZED`; `handover-reminders` without the secret → 401.
- [ ] Hidden routes (`/gesprekken`, `/abonnement`, `/professionals`, `/begeleider-gesprek`) → Home.

---

## 12. Known gaps and open decisions

| # | Gap / decision | Detail |
|---|---|---|
| 1 | **Verification e-mails use codes, the client sheet describes links** | The app sends 6-digit codes for verification and reset (`custom-auth`), while the client's standard texts (`standaard.email.*`) describe e-mail links. Decide which to keep. |
| 2 | **November-2026 new screens not built** | 283 `standaard.*` keys (34 groups: new Home, new Agenda legend, new Menu, Co consent, "Na een heftig moment", Kosten instellen, …) are not referenced by any source file yet. |
| 3 | **`parentMay` only enforced in `manage-children`** | `ENFORCED_SECTIONS` = 6 profile sections. Agenda, overdracht, kosten, documenten, momentjes, beslissingen, berichten have permission rows but no function checks them; the UI only offers the enforced ones. |
| 4 | **No runnable automated tests** | 37 `*.test.js` files under `src/` import `bun:test`; there is no `npm test`, Bun is not installed, and there is no Deno locally, so the edge functions cannot be type-checked or run here. Only `npm run build` (Vite) is a reliable local check. The old skill noted 4 known failures in `kring-bewaren.test.js` (unverified now). |
| 5 | **Mock lags behind** | `src/lib/api-mock.js` + `src/lib/mock/*` do not implement `manage-pickups` or `manage-personal` (verified); circle pick-ups, help requests, Mijn houvast, Solo logbook, safety reports and Co chat history fail under `VITE_API_MOCK=1`. |
| 6 | **No holiday notifications** | `manage-vacations` audits but never calls `notify()`; the other parent sees open holiday proposals only through derived Activities/open-proposal views. |
| 7 | **Account deletion has no reachable UI** | `manage-profile delete-account` exists, but the only "Account verwijderen" button is on `/abonnement`, which is hidden, and no source file calls `delete-account` (verified by grep). |
| 8 | **`/ondersteuning` shows demo data** | It is in the Menu and reads the local `pro-journaal-store` (demo professional "Mediationpraktijk Midden"). Consider hiding it with the other Milestone 3 routes. (Another agent is editing UI files; re-check.) |
| 9 | **Uncalled actions** | Not called by the frontend (grep): `manage-caregivers delete`, `manage-handover delete-draft`, `manage-messages unread`/`mark-read`/`delete` (read-marking happens through `messages`), `manage-profile get`/`delete-account`. |
| 10 | **Legacy database objects** | 15 `custom_*` RPCs, `handle_new_user`/`handle_user_delete` and their `auth.users` triggers, `device_tokens`, legacy profile columns (`verification_code`, `session_token`), `children.bsn` in plaintext. Not reachable from the browser, but should be dropped/encrypted in a later migration. |
| 11 | **Legacy `_shared/phase2-guard.ts`** | Not imported anymore; can be deleted. |
| 12 | **Payment request wording** | `DEPLOY-RELEASE-2026-11.md` says "a payment request can be asked for by the paying parent". In code, **either** parent can start a settlement, and only the **receiver** can share the payment link/IBAN. Confirm the intended UX with the client. |
| 13 | **Fresh-environment setup** | No verified path to build a new database from scratch (§6.1). |
| 14 | **Milestone 3–4** | Professionals portal + admin (`manage-admin` returns), subscriptions (Stripe), calls/recordings, e-mail linking, push notifications (`device_tokens`, APNs/FCM), legal/privacy review procedure (`verified`/`reviewed` access and custody outcomes). |
| 15 | **Stale docs** | `src/routes/README.md` (TanStack Start/`.tsx`), old lines in `src/lib/AGENTS.md` that say `.ts/.tsx`, and parts of `docs/PLATFORM_FEATURES.md`. |
| 16 | **`DEPLOY-PHASE*.md` deploy commands** | Use `supabase functions deploy <name>`; the current recommended command is the all-functions deploy in §10.1. |

---

## 13. Glossary Dutch → English

| Dutch (code/UI) | English | Notes |
|---|---|---|
| ouder, ouders | parent(s) | |
| de andere ouder, co-ouder | the other parent, co-parent | Always say "de andere ouder" in UI, never a name in labels |
| ik / jij / ander | me / you / the other | Viewer-relative ids in stores |
| kind, kinderen | child, children | |
| gezin | family | `useGezin()` |
| Solo / Samen | alone / together | Per child: Samen = a connected other parent is linked |
| Alleen jij / Gedeeld | only you (private) / shared | Default is Alleen jij |
| Alleen voor mezelf | only for me | Private appointment |
| kring | circle | People around a child |
| verzorger, kringlid | caregiver, circle member | |
| bekijken / bijdragen | view / contribute | Circle permission levels |
| oppas, opa, oma, stiefouder / bonusouder | babysitter, grandfather, grandmother, step-parent | Circle roles |
| uitnodiging | invitation | |
| koppelen / ontkoppelen | link / unlink | |
| wissel, wisselmoment | handover, handover moment | When the children move between parents |
| overdracht | handover (notes) | Screen `/overdracht` |
| Mee met de wissel, paklijst | goes along at the handover, packing list | |
| vaste spullen, vaste routines | fixed items | Per child/weekday |
| Is alles meegekomen? | Did everything arrive? | Receiving parent only |
| halen / brengen | pick up / drop off | |
| onderweg / aangekomen | on the way / arrived | Check-ins |
| Hulp vragen | ask for help | To the circle |
| agenda | calendar | |
| afspraak (agenda) | **appointment** | `calendar_events` |
| afspraak (tussen ouders), afspraken | **agreement** between parents | `parent_agreements`, `/afspraken`. Same Dutch word, different thing! |
| besluit, beslissing | decision | Stored in `parent_agreements` (decision columns) |
| voorstel, voorstellen | proposal | |
| Akkoord / Ander voorstel / Niet akkoord / Meer tijd nodig | Agree / Counter-proposal / Disagree / Need more time | Proposal answers |
| intrekken | withdraw | |
| zorgregeling, verdeling (van de week), regeling | care arrangement, weekly schedule | Base schedule per child |
| zorgvoorstel; eenmalig / structureel | care proposal; one-off / from a date on | |
| uitzondering | exception | One-off change |
| aanwezigheid | attendance | Who goes to an appointment |
| Nu afstemmen | coordinate now | Urgent same-day question |
| vakantie, bijzondere dagen | holiday, special days | |
| kosten | costs | |
| uitgave, kostenpost | expense | |
| bon | receipt | |
| budget(voorstel) | budget (proposal) | A future expense agreed in advance |
| verrekening, afrekenen | settlement, settle up | |
| betaalverzoek | payment request | |
| openstaand | outstanding | "Totaal openstaand" |
| potje, spaarpotje | savings pot | |
| vaste lasten | fixed (recurring) costs | Display only |
| kostenafspraak | cost agreement | Split, settle moment, approval limit |
| Wacht op jou | waiting for you | Needs your answer |
| nog nodig, boodschappen | still needed, shopping | `/boodschappen` |
| taak, taken | task(s) | |
| spullen | belongings | |
| momentje(s), mijlpaal | moment(s), milestone | |
| documenten | documents | |
| berichten, onderwerp, gesprek | messages, topic, conversation | |
| concept | draft | |
| Co, Sparren met Co | the AI assistant "Co", thinking things through with Co | |
| schrijfhulp, toon | writing help, tone | |
| gezag (gezamenlijk / eenhoofdig) | parental authority (joint / sole) | Display only |
| Gezag en toegang | authority and access | Per-child permissions |
| toegang | access | |
| noodkaart | emergency card | |
| geschiedenis, terugkijken, tijdlijn | history, look back, timeline | |
| exporteren | export (PDF) | |
| meldingen, activiteiten | notifications, activities | |
| instellingen, voorkeuren | settings, preferences | |
| rustmodus, nachtrust | rest mode, night quiet hours | Hold reminders |
| houvast, Mijn houvast | support/anchor, "my anchors" | Personal sentences and tips |
| lastige momenten | difficult moments | |
| evaluatie | review | Half-yearly |
| professional, begeleider | professional, counsellor | Milestone 3 |
| abonnement | subscription | Milestone 3 |
| gesprekken (bellen) | calls | Excluded |
| welkom, registreren, inloggen, verifiëren, wachtwoord vergeten | welcome, register, sign in, verify, forgot password | |
| Geregeld! | Done! | Only for definitive confirmations |

---

## Appendix A: how the counts were derived

All with Python stdlib scripts and grep, read-only, on 25 Nov 2026:

- **Functions/actions**: for each `supabase/functions/*/index.ts`, a small JS lexer (skipping strings,
  template literals, regex literals and comments, tracking brace and paren depth) found the object passed
  to `serveActions(...)` (or `const handlers = {…}` in manage-messages / manage-personal) and collected the
  keys at depth 1. Cross-checked by hand against `async name(` / `"name":` lines and the header comments.
- **Tables per function**: `.from("<table>")` (and helper calls) in each file and its `_shared` helpers.
- **Notification keys**: every key under `lib.meldingen` in `nl.json` searched as a quoted string in the
  functions; and every `key: "…"` in the functions checked against `lib.meldingen` (only
  `kostAkkoord`, inside a comment example, is not a real key).
- **Tables/columns/SQL functions/triggers**: `CREATE TABLE`, `ALTER TABLE … ADD COLUMN`,
  `CREATE [OR REPLACE] FUNCTION`, `CREATE TRIGGER` parsed from `schema.sql` and the 9 migrations; dynamic SQL
  (`EXECUTE format`) checked by hand (it only drops policies, enables RLS and revokes grants).
- **Env vars**: `Deno.env.get("…")` plus the `env(...)` / `intEnv(...)` wrappers in `mail.ts` and
  `ai-openai.ts`.
- **Routes**: `createFileRoute("…")` in `src/routes/*.jsx`, cross-checked with `src/routeTree.gen.js`.
- **Stores**: `src/lib/*-store.js`; edge-function usage from `api("fn", "action")` calls and action-name
  literals per file.
- **i18n**: flattened key sets of `nl.json` and `en.json` compared (8,249 each, no differences).

Not verifiable locally: anything that needs Deno, a live Supabase project, a running cron, or real e-mail
delivery.
