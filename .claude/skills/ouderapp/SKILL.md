---
name: ouderapp
description: Working knowledge for the Ouderschap & Co co-parenting app (React 19 + Vite SPA, TanStack Router, Dutch + English UI via i18next). Use whenever adding, changing, debugging or explaining any screen, store, proposal flow, cost/budget logic, AI ("Co") feature, demo-vs-own-family behavior, or the professionals portal in this repo.
---

# Ouderschap & Co — working on this codebase

Dutch co-parenting app: shared agenda + care split, messages with AI writing help, costs/budgets/settlement, practical lists, versioned agreements, append-only history/PDF export, and a professional (mediator) cockpit. Mobile-first, no backend, all data on device.

**Full per-screen documentation:** `docs/PLATFORM_FEATURES.md` (every route's features, stores, AI usage, navigation, workflows, known gaps). Read the relevant section before changing a screen.
**Architecture decision log:** `src/lib/AGENTS.md` — binding rules; read before touching any store. (It still says `.ts/.tsx`; real files are `.js/.jsx`.)

## Quick map

| Need | Look in |
|---|---|
| A screen | `src/routes/<route>.jsx` (dynamic: `kinderen.$kindId.jsx`, `kring.$kindId.jsx`, `vakantie.$id.jsx`) |
| Page chrome | `src/components/AppShell.jsx` — `AppShell`, `PageHeader`, `BackButton`, `Card`; bottom nav + `meerPaden` |
| Global overlays | `src/routes/__root.jsx` → `AppSlot`, `SpoedScherm`, `Toaster` |
| Demo family | `src/lib/demo-data.js` (Sanne = viewer, Joris = other parent, Emma 9, Noah 6) |
| Own family | `src/lib/start-store.js` (`eigen`, `kinderen`, `regeling`, `agenda`, `kosten`, `gezag`, `uitgenodigd`) |
| Preferences | `src/lib/voorkeuren-store.js` (`onzeapp-voorkeuren`) |
| Care schedule & proposals | `zorg-store.js`, `agenda-zorg.js`, `afstemming.js`, `openstaande-voorstellen.js`, `herinneringen.js` |
| Agreements | `afspraken-store.js` (single source), `/afspraken` |
| History | `audit-store.js` (`leg(...)`, append-only, frozen) → `/tijdlijn`, `/exporteren` |
| Costs | `kosten-store.js`, `kosten-akkoord.js` (`beoordeelKosten`), `verrekening.js`, `budget-store.js`, `vaste-lasten-store.js`, `geld-invoer.js` |
| Professionals | `pro-journaal-store.js` (`voorOudersVan`, `trekToegangIn`, `legIntakeVast`), `src/components/pro/*`, `/professionals` |
| AI | `src/lib/*.functions.js` via `createServerFn` shim in `src/lib/server-fn.js` |
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
Persisted stores add a lazy `laad()` guarded by `typeof window === "undefined"` and wrap `localStorage` in `try/catch` (private mode). Key prefix: `onzeapp-…` or `<naam>-v1`.

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
2. **Shared changes are proposals.** Only acceptance changes planning. Final statuses (`geaccepteerd`, `afgewezen`, `alternatief`, `ingetrokken`) are frozen and can't transition. Response dates are requests; expiry never auto-changes anything. Exception: personal items, or own family while `uitgenodigd` is false, apply directly.
3. **Audit is append-only.** Log via `leg(soort, itemId, itemNaam, actie, wijziging, door, extra)`; never edit/delete events; never copy agreement history into audit. Private items (`gedeeld=false`) are never logged.
4. **Money is never guessed.** Budget coverage only via `beoordeelKosten`; unknown → uncertain. A budget/"Nog nodig" item never becomes an expense until the existing "Uitgave toevoegen" flow runs. Payment declarations don't prove receipt. Reuse `GeldInvoer` for amounts.
5. **Demo never looks real.** Every screen must branch on `useStart().eigen`: own family reads `start-store` and shows `EigenLeeg` empty states; never render demo seeds for an own family, and never mix the two.
6. **Privacy.** Professionals default to no visibility; parents see only `voorOudersVan`, never internal notes. Linking e-mail grants no app access. Self-reported gezag is display-only.
7. **AI ("Co") never acts.** It only picks an intent / returns text and opens an existing flow prefilled for the parent to confirm. Use only provided context, never judge the other parent, send only the minimal GEZIN line (speaker name + children names/ages). New assistant intent = one entry in `intents` (`assistent.functions.js`) plus a navigation rule in `Assistent.jsx`. Conflict-coaching knowledge lives only in `co-conflictcoaching.js`.
8. **Every visible string is translated (Dutch + English).** No hard-coded UI text: add the key to BOTH `src/locales/nl.json` and `src/locales/en.json` under the file's namespace (`routes.<file>`, `components.<File>`, `pro.<File>`, `lib.<file>`; shared words in `common.*`). Components use `const { t } = useTranslation()`; route `head()` and `src/lib` use `i18n.t()` at call time — module-level data uses getters (`get label() { return i18n.t(...) }`), never `i18n.t` at module load. Plurals `_one`/`_other`, variables `{{x}}`, inline markup `<Trans>`. Dates/money via `taalLocale()` / `datumLocale()`, never `"nl-NL"`. Values that logic compares or parses stay Dutch ids and are translated only for display. AI prompts stay Dutch but append the language rule so output follows the UI language; keyword/insult/deadline detection lists need both Dutch and English words. Use the English feature names listed in docs §0.12.
9. **Icons are lucide, never text glyphs or emoji.** Use `@/components/Tekens` (`Chevron`, `MetChevron`, `Vinkje`, `MetVinkje`, `Kruis`, `Pijl`), `AppIcon functie="…"` for semantic icons, or a direct `lucide-react` import. Never put `› ‹ ⌄ ✓ ✕ ▶` or emoji in JSX, data (`icoon:` fields hold AppIcon function names) or translation strings. Every back action uses `TerugKnop` / `BackButton` from AppShell; `BackButton` hides itself on bottom-tab pages (`TAB_PADEN`), which get no back button.
10. **Session = account.** `src/lib/auth-store.js` (custom auth via edge function `custom-auth`, token `onzeapp-sessie-token`, status `laden|uit|onboarding|aan`); `sessie-store.js` keeps its old API derived from it (`eigen` | `uit`). `__root.jsx` sends every non-public route to `/welkom` without a session or while onboarding is unfinished (public: `/welkom`, `/inloggen`, `/registreren`, `/verifieren`, `/wachtwoord-vergeten`, `/uitnodiging`). Server calls only via `api()` in `src/lib/api.js`; local testing with `VITE_API_MOCK=1`. Sign-out (`AfmeldenRij`) revokes the session and clears `onzeapp-*` family caches.
11. **Calm UX.** One toast via `bevestig()`; "Geregeld!" only for definitive confirmations; max 3 smart suggestions; Living Home effects are `pointer-events-none` and never move content; holidays (`bijzondere-dagen.js`) are display-only.

When you make a decision of this kind, append a one-line rule to `src/lib/AGENTS.md` in the same style ("… — so …").

## Checklist for any change

- [ ] Read the screen's section in `docs/PLATFORM_FEATURES.md` and relevant `AGENTS.md` lines.
- [ ] Demo and own-family branches both handled.
- [ ] No duplicated source; derived views stay read-only.
- [ ] Shared mutations go through proposals + `leg(...)` audit.
- [ ] Persisted state uses guarded `localStorage`; know whether the store is memory-only (most are).
- [ ] New route registered in `routeTree.gen.js` (and `meerPaden`/`/meer` if applicable).
- [ ] Dutch UI copy, calm tone, "de andere ouder" rather than names in labels.
- [ ] All new/changed text goes through `t()` / `i18n.t()` with keys in both `nl.json` and `en.json` (same structure); check the screen in both languages via Settings → "Taal · Language".
- [ ] Update `docs/PLATFORM_FEATURES.md` for the affected screen.
- [ ] Run tests with `bun test` (tests import `bun:test`; there is no npm test script). Build with `npm run build`.

## Known pitfalls

- `index.html` pre-paint theme script reads `ouderapp_voorkeuren`, but the store key is `onzeapp-voorkeuren` (correct script: `themaScript` in `voorkeuren-store.js`).
- AI key is read client-side (`VITE_LOVABLE_API_KEY`) — don't ship a real key in a `VITE_` var; needs a server proxy.
- Demo agenda is frozen at 2025-03-12 (`DEMO_VANDAAG`); own family uses the real date.
- Most stores reset on reload; the "other parent" only responds via dev-only demo buttons.
- See `docs/PLATFORM_FEATURES.md` §6 for the full list of dead code and gaps.
