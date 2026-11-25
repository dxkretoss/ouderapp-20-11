---
name: ouderapp
description: Working knowledge for the Ouderschap & Co co-parenting app (React 19 + Vite SPA, TanStack Router, Dutch + English UI via i18next, Supabase edge functions with custom session auth). Use whenever adding, changing, debugging, deploying or explaining any screen, store, edge function, migration, proposal flow, per-child co-parent rule, cost/budget/settlement logic, family-circle (caregiver) feature, notification/audit, or AI ("Co") feature in this repo.
---

# Ouderschap & Co — operational guide for AI agents

Dutch co-parenting app (Milestones 1–2): parents, a co-parent **per child**, a family circle of caregivers,
shared agenda + weekly care schedule + handovers, messages with AI writing help, costs (expenses, budgets,
settlements, fixed costs, savings pots), practical lists, agreements/decisions, history and PDF export.
Mobile-first SPA; every read/write goes through Supabase edge functions with a custom session.

**Full detail:** `docs/PROJECT_HANDOVER.md` (authoritative: every function/action, table, env var, route,
store, workflow, deploy steps, known gaps). Older per-screen UI detail: `docs/PLATFORM_FEATURES.md`
(partly outdated). Binding decision log: `src/lib/AGENTS.md`. Deploy guides: `supabase/DEPLOY-*.md`.

## Where things live

| Need | Look in |
|---|---|
| A screen | `src/routes/<route>.jsx` (dynamic: `kinderen.$kindId.jsx`, `kring.$kindId.jsx`, `vakantie.$id.jsx`); auth/phase gate in `src/routes/__root.jsx` |
| Route registration | `src/routeTree.gen.js` — hand-maintained (no router plugin in `vite.config.js`) |
| Page chrome | `src/components/AppShell.jsx` (`AppShell`, `PageHeader`, `BackButton`, `TAB_PADEN`, `meerPaden`) |
| Server calls | `src/lib/api.js` → `api(fn, action, body)`; dev mock `src/lib/api-mock.js` + `src/lib/mock/*` |
| Session | `src/lib/auth-store.js` (token `onzeapp-sessie-token`, status `laden|uit|onboarding|aan`), `sessie-store.js` |
| Own family / who is who | `src/lib/start-store.js` (children = server uuids, `coOuders`), `src/lib/gezin.js` (`useGezin`, `anderVoor`, `isSamen`, `gemengd`) |
| Store helpers | `src/lib/praktisch-sync.js` (`serverBron`, `optimistisch`, `meldFout`), `src/components/Laden.jsx` (`laadWeergave`, `LaadFout`) |
| Preferences | `src/lib/voorkeuren-store.js` → `profiles.preferences.app` (only theme + app lock stay on the device) |
| Phase gating | `src/lib/fase.js` (`NIET_IN_DEZE_FASE`, `emailKoppelingAan`, `professionalsAan`) |
| Edge functions | `supabase/functions/<name>/index.ts` (31 folders: 24 with actions, `handover-reminders` cron, 6 retired 410 stubs) |
| Shared server helpers | `supabase/functions/_shared/` — `respond.ts`, `session.ts`, `access.ts` (`pairOf`), `practical-scope.ts` (`canSee`, `addressFor`), `costs-family.ts` (`costPair`, `pairSees`), `agenda-family.ts` (`assertOnePair`), `family-caregivers.ts` (`caregiverMay`), `parent-permissions.ts` (`parentMay`), `practical-audit.ts` (`logAudit`, `notify`), `storage.ts`, `mail.ts`, `origin.ts`, `ai-*.js/ts` |
| Database | `supabase/migrations/*.sql` (9, in name order). `supabase/schema.sql` = historical baseline, **never run** |
| Texts | `src/locales/nl.json` + `src/locales/en.json` (identical key sets); `src/i18n.js` |
| AI | `src/lib/*.functions.js` → `ai-aanroep.js` → `ai-assistant`, `ai-coach`, `ai-tools`, `co-assistant`; prompts only in `supabase/functions/_shared/ai-*.js` |

Domain → function → store:
- Children, schedule, custody, access: `manage-children` → `start-store`, `kindprofiel-store`, `gezag-store`
- Invitations: `send-invitation`, `accept-invitation` → `start-store`, `CoOuderUitnodiging.jsx`
- Circle: `manage-caregivers`, `manage-pickups` → `kring-store`, `hulp-store`
- Agenda/care/attendance/Nu afstemmen: `manage-agenda` → `agenda-store` (load hub), `zorg-store`, `aanwezigheid-store`, `nu-afstemmen-store`
- Holidays: `manage-vacations` → `vakantie-store`; handovers: `manage-handover` (+ cron `handover-reminders`) → `overdracht-store`
- Costs: `manage-expenses` → `kosten-store` (one source; `budget-store`, `vaste-lasten-store` are thin layers); `manage-still-needed` → `nog-nodig-store`
- Messages: `manage-messages` → `berichten-store` (polls every 25 s while open)
- Tasks + belongings: `manage-tasks` → `taken-store`; moments: `manage-moments`; documents: `manage-documents`
- Agreements, decisions, evaluations: `manage-agreements` → `afspraken-store`, `evaluatie-store`
- Personal owner-only data: `manage-personal` → `persoonlijk-store`
- History: `log-audit` → `audit-store`; notifications: `send-notification` → `meldingen-store`, `Activiteiten.jsx`

## Binding rules (never break these)

1. **Never query tables, RPCs or storage from the browser.** Only `api()` → edge function. RLS is on for
   every table with **no policies** and no `anon`/`authenticated` grants. Never add a policy, grant, public
   bucket or `VITE_*` secret. Never weaken RLS.
2. **Derive the user from the session** (`requireUser(req)` / `requireAiUser`), never from body fields.
   The service-role `db()` bypasses RLS, so every handler checks access itself.
3. **Per-child pairing.** A parent can have a different co-parent per child. Every shared record stores
   `other_parent_id` (from `pairOf` / `addressFor` / `costPair`) and is visible to that parent only while
   **every** child of the record is linked to both. Children of different co-parents in one shared record →
   `MIXED_CHILDREN`. Without children and with several co-parents, the user must choose. **Never reintroduce
   a "the one co-parent" restriction** (`partner` is only set when there is exactly one).
4. **Private by default.** New items are "Alleen jij"; "Gedeeld" is a deliberate choice (`DeelKeuze` /
   `DelenKeuze`). Items made while Solo stay private after linking. Private items are never audited or
   notified.
5. **Uniform not-found.** Anything the caller may not see → `404 NOT_FOUND` (UI: "Deze pagina is niet
   beschikbaar voor jou."), identical to "does not exist". `FORBIDDEN` only when the caller can see it but
   may not do this action.
6. **Shared changes are proposals** answered by the OTHER parent (`akkoord`, `ander-voorstel`,
   `niet-akkoord`, `meer-tijd`); the proposer may withdraw; final statuses are frozen; reply dates never
   auto-change anything. The server decides when a change applies directly (private, or nobody else
   connected for those children).
7. **One source per concept.** No second list/store for agreements, proposals, budgets, agenda or costs.
   Overviews (Activities, open proposals, cost overview) are derived read-only projections.
8. **Audit is append-only and server-side**: `logAudit()` in the function (actor = session user, `childIds`,
   `familyIds` for child-less records). Client `leg()` only for events no function logs. Never copy
   agreement history into audit.
9. **Notifications only via `notify()`** with an i18n key under `lib.meldingen.<key>` (add it to both
   locale files) and short params; never notify the actor; best-effort.
10. **Money is never guessed.** Budget coverage only via `beoordeelKosten` (`src/lib/kosten-akkoord.js`);
    a budget or "Nog nodig" item never becomes an expense by itself; a payment declaration is not proof —
    only the receiver's "Ontvangen" settles. Amounts via `GeldInvoer`.
11. **Caregivers**: access only after accepting while signed in, per child and per section, default none,
    period enforced on the server (`caregiverMay`). A link, role label or client flag never grants access.
12. **Self-reported custody (gezag) is display-only**; per-child parent access lives in
    `child_parent_permissions` (default `legacy_baseline` = full access; restricting another parent needs
    their acceptance). Today only `manage-children` enforces `parentMay`.
13. **AI ("Co") never acts**: it returns text/intent and opens an existing flow prefilled for the parent to
    confirm. Keys only in function secrets.
14. **Keep the client's design.** Reuse existing components (`AppShell`, `PageHeader`, sheets from
    `@/components/ui/sheet`, `EigenLeeg`, `Laden`, `AfspraakFormulier`, `DelenKeuze`), Tailwind theme tokens
    (`text-ink`, `bg-brand`, …), calm tone, one toast via `bevestig()`; "Geregeld!" only for definitive
    confirmations. Do not restyle screens or invent new navigation.
15. **i18n in both languages.** Every visible string through `t()` / `i18n.t()` with the key in BOTH
    `nl.json` and `en.json` (namespaces `routes.<route>`, `components.<File>`, `lib.<file>`, `common.*`).
    Module-level labels use getters. Stored/compared values stay Dutch ids. Dates/money via `taalLocale()`
    / `datumLocale()`. `standaard.*` keys are the client's texts for screens not built yet — use them when
    building those screens; don't delete them.
16. **No emoji and no text glyphs** (`› ✓ ✕ ▶` …) in JSX, data or translations; icons only via lucide
    (`Tekens.jsx`, `AppIcon`).
17. **Wording: "de andere ouder"** ("the other parent") in labels, never a name; never render demo names
    (Sanne, Joris, Emma, Noah …) or import `demo-data.js` in own-family screens.
18. **Hidden this phase** (`fase.js`): `/gesprekken`, `/abonnement`, `/professionals`,
    `/begeleider-gesprek`, e-mail linking, professional role. Don't expose them.

## Idioms

Server action (pattern used by every `manage-*` function):
```ts
Deno.serve(serveActions("manage-x", {
  async "create-thing"(req, body) {
    const me = await requireUser(req);                       // user from the session only
    const f = await familyFor(me.id);                        // or familyScope / familyOf per domain
    const childIds = assertChildren(f, body.child_ids);      // NOT_FOUND for foreign children
    const other = addressFor(f, childIds, body.shared !== true, body.other_parent_id); // null = private
    const row = check(await db().from("things").insert({ created_by: me.id, other_parent_id: other, child_ids: childIds, /*…*/ }).select("*").single(), "create thing");
    const auditId = other ? await logAudit({ actorId: me.id, section: "taak", entityId: row.id, label: row.title, action: "CREATED", childIds, familyIds: [me.id, other] }) : null;
    if (other) await notify({ to: other, actorId: me.id, type: "thing", category: "info", key: "thingNew", params: { titel: row.title }, link: "/things", entityType: "thing", entityId: row.id, childIds, auditId });
    return ok({ thing: row });
  },
}));
```
Responses are `{ success: true, ...payload }` or `{ success: false, code, message }`; the client shows
`foutTekst(code)` → `lib.api.fout.<CODE>`.

Client store (pattern of the server-backed stores):
```js
let state = { lijst: [] };
const luisteraars = new Set();
const zet = (p) => { state = { ...state, ...p }; luisteraars.forEach((l) => l()); };
const bron = serverBron({ laad: async () => zet({ lijst: (await api("manage-x", "list")).things }), wis: () => zet({ lijst: [] }) });
export const useDingen = () => { bron.zorg(); return useSyncExternalStore((l) => { luisteraars.add(l); return () => luisteraars.delete(l); }, () => state, () => state); };
export const useDingenStatus = () => bron.useStatus();
export const voegToe = (x) => optimistisch(() => { const oud = state.lijst; zet({ lijst: [x, ...oud] }); return () => zet({ lijst: oud }); },
  () => api("manage-x", "create-thing", x).then(() => bron.ververs()), "x-fout");
```

## Adding a feature end-to-end

1. **Migration** — new file `supabase/migrations/<yyyymmddhhmmss>_<name>.sql`: one `BEGIN … COMMIT`,
   additive and idempotent (`IF NOT EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object`), `ENABLE ROW LEVEL
   SECURITY`, `REVOKE ALL … FROM anon, authenticated`, no policies. Shared records get `created_by`,
   `other_parent_id`, `child_ids`. Append-only history = a trigger like `costs_forbid_update`. Never edit
   an applied migration; never touch `schema.sql`.
2. **Function action** — in `supabase/functions/<fn>/index.ts` add a handler to the `serveActions` object:
   `const me = await requireUser(req)`; validate with `_shared/util.ts` (`requireUuid`, `optText`, …);
   scope with the domain helper (`familyFor`/`canSee`/`addressFor`, `pairOf`/`costPair`,
   `familyScope`/`assertOnePair`); throw `err.notFound()` for anything not visible; return `ok({...})`.
   New function folder → add `[functions.<name>] verify_jwt = false` to `supabase/config.toml`.
3. **Audit + notification** — `logAudit({ actorId: me.id, section, entityId, label, action, changes,
   childIds, familyIds })`; `notify({ to: other, actorId: me.id, type, category: "actie"|"wijziging"|"info",
   key, params, link, entityType, entityId, childIds, auditId })`; add `lib.meldingen.<key>.titel/uitleg`
   (match existing entries) to both locale files.
4. **Store** — in `src/lib/<domain>-store.js`: `serverBron({ laad, wis })` (or subscribe to auth like
   start-store), `optimistisch(doe, () => api(fn, action, body), foutId)`, keep existing export names and
   shapes, expose `useStatus()` for loading/error. Mirror the action in `src/lib/api-mock.js` /
   `src/lib/mock/<domain>.js` if the domain is mocked.
5. **UI** — use the store hook; `laadWeergave(status, ververs)` for loading/error, `EigenLeeg` for empty,
   `DelenKeuze`/`DeelKeuze` for sharing, a Sheet for forms; handle `MIXED_CHILDREN` and the
   choose-the-other-parent case. New route → register in `routeTree.gen.js` (import, `update({ id, path,
   getParentRoute })`, `rootRouteChildren`) and, if under Menu, `meerPaden` + an item in `/meer`.
6. **i18n** — keys in both `nl.json` and `en.json`, same structure.
7. **Docs** — update `docs/PROJECT_HANDOVER.md` (function/action/table/route lists) and add a one-line rule
   to `src/lib/AGENTS.md` for any new architectural decision ("… — so …").

## Verifying a change

- `npm run build` must succeed (Vite; catches broken imports/JSX). There is no lint and no `npm test`.
- Check imports resolve (`@/` = `src/`), and that every new `t("…")` key exists in both locale files
  (a quick Python/JSON diff of flattened keys works).
- There is **no Deno and no Bun locally**: edge functions cannot be type-checked or run here, and the
  37 `*.test.js` files (they import `bun:test`) don't run as-is. Read server changes carefully: imports
  from `../_shared/*.ts`, `requireUser` in every non-public action, `check()` around every DB call.
- Try UI flows with `VITE_API_MOCK=1 npx vite` (mock lacks `manage-pickups` and `manage-personal`), or
  against a dev project with two/three browser profiles (mother + father A + father B) to check per-child
  separation from both sides.
- Never commit `.env*` files; never copy secret values into docs.

## Deploy (summary — details in docs/PROJECT_HANDOVER.md §10)

Backup (`npx supabase db dump --linked …`) → run new SQL files in order (never `schema.sql`) → secrets
(`PUBLIC_APP_URL`, `APP_ORIGINS`, SMTP/Resend, `OPENAI_API_KEY`, `HANDOVER_CRON_SECRET`, …) → deploy **all**
functions: `npx supabase functions deploy --project-ref <ref> --no-verify-jwt --use-api` → cron
`handover-reminders` every 15 min with header `x-cron-secret` → `npm run build` with only
`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. A `403` on deploy usually means the CLI is logged into the
wrong Supabase account (`npx supabase logout && npx supabase login`).

## Known pitfalls

- `routeTree.gen.js` is not regenerated; `src/routes/README.md` is stale (TanStack Start/`.tsx`).
- Old ids `"sanne"`/`"joris"` in agenda/care code are viewer-relative ids (me / the other parent), never shown.
- Parent references in agenda tables are absolute tokens (`is:<uuid>` / `not:<uuid>`) returned viewer-relative.
- No realtime: stores refresh on window focus; messages poll while open.
- Missing `PUBLIC_APP_URL` → invitations fail with `NOT_CONFIGURED` before anything is stored.
- `manage-still-needed` uses underscore actions (`link_budget`, `set_buyer`).
- `/ondersteuning` still shows local demo data (see handover §12).
