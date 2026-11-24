---
name: ouderapp
description: Working knowledge for the Ouderschap & Co co-parenting app (React 19 + Vite SPA, TanStack Router, Dutch + English UI via i18next). Use whenever adding, changing, debugging or explaining any screen, store, proposal flow, cost/budget logic, AI ("Co") feature, the Supabase edge functions/migrations, or the professionals portal in this repo.
---

# Ouderschap & Co — working on this codebase

Dutch co-parenting app: shared agenda + care split, messages with AI writing help, costs/budgets/settlement, practical lists, versioned agreements, append-only history/PDF export, and a professional (mediator) cockpit. Mobile-first SPA backed by Supabase edge functions (custom session auth; every read/write goes through `api()`; the browser never touches tables or storage). Signed-in users are always their own family — there is no demo family any more.

**Full per-screen documentation:** `docs/PLATFORM_FEATURES.md` (every route's features, stores, AI usage, navigation, workflows, known gaps). Read the relevant section before changing a screen.
**Architecture decision log:** `src/lib/AGENTS.md` — binding rules; read before touching any store. (Older lines still say `.ts/.tsx`; real files are `.js/.jsx`.)
**Backend overview:** `docs/PLATFORM_FEATURES.md` §0.15 (data flow, function per module, session, access rules, mock); deploy steps in `supabase/DEPLOY-PHASE1.md` and `supabase/DEPLOY-PHASE2.md`.

## Quick map

| Need | Look in |
|---|---|
| A screen | `src/routes/<route>.jsx` (dynamic: `kinderen.$kindId.jsx`, `kring.$kindId.jsx`, `vakantie.$id.jsx`) |
| Page chrome | `src/components/AppShell.jsx` — `AppShell`, `PageHeader`, `BackButton`, `Card`; bottom nav + `meerPaden` |
| Global overlays | `src/routes/__root.jsx` → `AppSlot`, `SpoedScherm`, `Toaster` |
| Who is who | `src/lib/gezin.js` (`useGezin()`, `gezinState()`, `isIk(id)`, `naamVan(id)`) — profile uuids; show "de andere ouder" (`common.deAndereOuder`) instead of names |
| Demo data | `src/lib/demo-data.js` — only for out-of-scope Milestone 3–4 screens (professionals, calls); never import it in own-family code |
| Family / session | `src/lib/auth-store.js` (session), `src/lib/start-store.js` (`naam`, `kinderen` = server uuids, `regeling`, `gezag`, `uitgenodigd`, `coOuders`) |
| Server calls | `src/lib/api.js` `api(fn, action, body)`; dev mock `src/lib/api-mock.js` + `src/lib/mock/<domain>.js` (`VITE_API_MOCK=1`); functions in `supabase/functions/<name>/index.ts` |
| Preferences | `src/lib/voorkeuren-store.js` (`onzeapp-voorkeuren`) |
| Agenda | `agenda-store.js` (load hub for `manage-agenda`), `vakantie-store.js`, `overdracht-store.js` |
| Care schedule & proposals | `zorg-store.js`, `agenda-zorg.js`, `afstemming.js`, `openstaande-voorstellen.js`, `herinneringen.js` |
| Agreements | `afspraken-store.js` (single source), `/afspraken` |
| History | server `audit_events` (written by the functions) read via `audit-store.js` (`log-audit list`) → `/tijdlijn`, `/exporteren`, "Bekijk geschiedenis" |
| Messages | `berichten-store.js` (`manage-messages`, polling while open) |
| Costs | `kosten-store.js` (one source, `manage-expenses overview`; viewer-relative "ik"/"ander"), `kosten-akkoord.js` (`beoordeelKosten`), `verrekening.js`, `budget-store.js`, `vaste-lasten-store.js`, `geld-invoer.js` |
| Professionals | `pro-journaal-store.js` (`voorOudersVan`, `trekToegangIn`, `legIntakeVast`), `src/components/pro/*`, `/professionals` |
| AI | `src/lib/*.functions.js` → `ai-aanroep.js` → edge functions `ai-assistant`, `ai-coach`, `co-assistant`, `ai-tools`; prompts in `supabase/functions/_shared/ai-*.js` |
| Toasts | `bevestig()` / `useBevestigPopup()` / `kortePopup()` in `src/lib/feedback.js` |
| Languages (nl/en) | `src/i18n.js`, `src/locales/nl.json` + `en.json`, switcher `src/components/TaalKiezer.jsx` (Settings → Weergave); docs §0.12 |

Domains → docs sections: 1 Home/onboarding/global · 2 Agenda/care · 3 Communication/Co · 4 Costs/practical/menu · 5 Agreements/legal/pro · 6 Known gaps.

## Idioms to follow

**Store** (module state + listeners + `useSyncExternalStore`; exported Dutch verb setters):
```js
import { useSyncExternalStore } from "react";
let state = { lijst: [] };
const listeners = new Set();
function zet(p) {
    state = { ...state, ...p };
    listeners.forEach((l) => l());
}
export const voegToe = (x) => zet({ lijst: [x, ...state.lijst] });
export function useIets() {
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
```
Family data lives on the server: stores load via `api()` after login (subscribe to auth like `start-store` / `kosten-store`), refresh on window focus, apply optimistic updates with rollback + `meldFout` toast, and keep their export names/shapes. Only device preferences use guarded `localStorage` (`try/catch`, key prefix `onzeapp-…`).

**Route:**
```js
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
export const Route = createFileRoute("/pad")({
    head: () => ({ meta: [{ title: "Titel — Ouderschap & Co" }, { name: "description", content: "…" }] }),
    component: Pagina,
});
function Pagina() {
    return (<AppShell><PageHeader titel="Titel" subtitel="…"/>{/* … */}</AppShell>);
}
```
**Adding a route:** `vite.config.js` has no TanStack router plugin, so `src/routeTree.gen.js` is NOT regenerated. Register by hand in three places: the `import { Route as XRouteImport }`, the `const XRoute = XRouteImport.update({ id, path, getParentRoute })`, and the `rootRouteChildren` object. If it belongs under Menu, add its path to `meerPaden` in `AppShell.jsx` and an item in `/meer`.

Code style: Dutch identifiers and comments, compact JS (no TypeScript), `@/` imports, Tailwind classes with theme tokens (`text-ink`, `text-ink-soft`, `bg-brand`, `lora` for titles), shadcn primitives from `@/components/ui/*`, small helpers from `@/components/ui-kit`.

## Non-negotiable rules (from AGENTS.md)

1. **One source per concept.** Never create a second list/store for agreements, proposals, budgets, dossiers or agenda. Overviews (open proposals, activities, cost overview, pro cockpit totals) are *derived read-only projections*.
2. **Shared changes are proposals.** Only acceptance changes planning. Final statuses (`geaccepteerd`, `afgewezen`, `alternatief`, `ingetrokken`) are frozen and can't transition. Response dates are requests; expiry never auto-changes anything. Only the OTHER parent answers (Akkoord / Ander voorstel / Niet akkoord / Meer tijd nodig); the proposer may withdraw. The server decides: personal items, or no connected other parent, apply directly.
3. **Audit is append-only.** The edge functions write `audit_events` (actor = session user, family scope; DB trigger blocks edits/deletes). Client `leg()` only for an event no function logs (posts to `log-audit log`, origin "client") — never double-log. Never copy agreement history into audit. Private items (`gedeeld=false`) are never logged.
4. **Money is never guessed.** Budget coverage only via `beoordeelKosten`; unknown → uncertain. A budget/"Nog nodig" item never becomes an expense until the existing "Uitgave toevoegen" flow runs. Payment declarations don't prove receipt. Reuse `GeldInvoer` for amounts.
5. **Demo never looks real.** There is no demo family for signed-in users (`eigen` is always true). Screens read server-backed stores and show calm empty states; never import `demo-data.js` or render fictional names (Sanne, Joris, Emma, Noah …) in family screens; use `useGezin()` and "de andere ouder".
6. **Privacy.** Professionals default to no visibility; parents see only `voorOudersVan`, never internal notes. Linking e-mail grants no app access. Self-reported gezag is display-only.
7. **AI ("Co") never acts.** It only picks an intent / returns text and opens an existing flow prefilled for the parent to confirm. Use only provided context, never judge the other parent, send only the minimal GEZIN line (speaker name + children names/ages). All AI runs server-side; the browser never holds an AI key. New assistant intent = one entry in `intents` (`supabase/functions/_shared/ai-tools-prompts.js`) plus a navigation rule in `Assistent.jsx`. Conflict-coaching knowledge lives only in `supabase/functions/_shared/ai-co-conflictcoaching.js`.
8. **Every visible string is translated (Dutch + English).** No hard-coded UI text: add the key to BOTH `src/locales/nl.json` and `src/locales/en.json` under the file's namespace (`routes.<file>`, `components.<File>`, `pro.<File>`, `lib.<file>`; shared words in `common.*`). Components use `const { t } = useTranslation()`; route `head()` and `src/lib` use `i18n.t()` at call time — module-level data uses getters (`get label() { return i18n.t(...) }`), never `i18n.t` at module load. Plurals `_one`/`_other`, variables `{{x}}`, inline markup `<Trans>`. Dates/money via `taalLocale()` / `datumLocale()`, never `"nl-NL"`. Values that logic compares or parses stay Dutch ids and are translated only for display. AI prompts stay Dutch but append the language rule so output follows the UI language; keyword/insult/deadline detection lists need both Dutch and English words. Use the English feature names listed in docs §0.12.
9. **Icons are lucide, never text glyphs or emoji.** Use `@/components/Tekens` (`Chevron`, `MetChevron`, `Vinkje`, `MetVinkje`, `Kruis`, `Pijl`), `AppIcon functie="…"` for semantic icons, or a direct `lucide-react` import. Never put `› ‹ ⌄ ✓ ✕ ▶` or emoji in JSX, data (`icoon:` fields hold AppIcon function names) or translation strings. Every back action uses `TerugKnop` / `BackButton` from AppShell; `BackButton` hides itself on bottom-tab pages (`TAB_PADEN`), which get no back button.
10. **Session = account.** `src/lib/auth-store.js` (custom auth via edge function `custom-auth`, token `onzeapp-sessie-token`, status `laden|uit|onboarding|aan`); `sessie-store.js` keeps its old API derived from it (`eigen` | `uit`). `__root.jsx` sends every non-public route to `/welkom` without a session or while onboarding is unfinished (public: `/welkom`, `/inloggen`, `/registreren`, `/verifieren`, `/wachtwoord-vergeten`, `/uitnodiging`). Server calls only via `api()` in `src/lib/api.js`; local testing with `VITE_API_MOCK=1`. Sign-out (`AfmeldenRij`) revokes the session and clears `onzeapp-*` family caches.
11. **Calm UX.** One toast via `bevestig()`; "Geregeld!" only for definitive confirmations; max 3 smart suggestions; Living Home effects are `pointer-events-none` and never move content; holidays (`bijzondere-dagen.js`) are display-only.

When you make a decision of this kind, append a one-line rule to `src/lib/AGENTS.md` in the same style ("… — so …").

## Checklist for any change

- [ ] Read the screen's section in `docs/PLATFORM_FEATURES.md` and relevant `AGENTS.md` lines.
- [ ] Data comes from a server-backed store (no demo data, no device-only family data); both parents' views (proposer / responder) checked.
- [ ] No duplicated source; derived views stay read-only.
- [ ] Shared mutations go through proposals; the edge function authorises via the session and writes `audit_events`.
- [ ] Backend change: action in `supabase/functions/<fn>/index.ts` (`serveActions`, `requireUser`, `_shared/access.ts`), same action in the dev mock, additive idempotent migration.
- [ ] New route registered in `routeTree.gen.js` (and `meerPaden`/`/meer` if applicable).
- [ ] Dutch UI copy, calm tone, "de andere ouder" rather than names in labels.
- [ ] All new/changed text goes through `t()` / `i18n.t()` with keys in both `nl.json` and `en.json` (same structure); check the screen in both languages via Settings → "Taal · Language".
- [ ] Update `docs/PLATFORM_FEATURES.md` for the affected screen.
- [ ] Run the tests with `node --test` plus a `bun:test` shim loader (tests import `bun:test`; there is no npm test script; 4 known failures in `kring-bewaren.test.js`). Build with `npm run build`. Try flows locally with `VITE_API_MOCK=1 npx vite`.

## Known pitfalls

- `index.html` pre-paint theme script reads `ouderapp_voorkeuren`, but the store key is `onzeapp-voorkeuren` (correct script: `themaScript` in `voorkeuren-store.js`).
- Never put a secret in a `VITE_*` variable (it is bundled); the AI key is only the function secret `OPENAI_API_KEY`.
- No realtime (RLS blocks it): stores refresh on window focus; messages poll every 25 s while open. To test both sides, use two browser profiles with two connected accounts (mock or real).
- See `docs/PLATFORM_FEATURES.md` §6 for the full list of dead code and gaps.
