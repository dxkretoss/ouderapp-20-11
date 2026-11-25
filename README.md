# Ouderschap & Co

Dutch co-parenting app ("De app die ouders verbindt"): parents, a co-parent per child and a family circle
share an agenda and weekly schedule, handovers, messages with AI writing help, costs and settlements,
practical lists, agreements and history. Mobile-first React 19 + Vite SPA on Supabase (edge functions with
custom session auth; the browser never touches the database directly). Dutch and English UI.

## Documentation

- **[docs/PROJECT_HANDOVER.md](docs/PROJECT_HANDOVER.md)** — the complete handover guide: product scope,
  architecture, business rules, every edge function and action, every table, secrets, routes, stores,
  workflows, deployment, testing checklist, known gaps and a Dutch → English glossary. Start here.
- **[supabase/DEPLOY-RELEASE-2026-11.md](supabase/DEPLOY-RELEASE-2026-11.md)** — deploy guide for the
  current release (earlier releases: `supabase/DEPLOY-PHASE1.md`, `supabase/DEPLOY-PHASE2.md`).
- `src/lib/AGENTS.md` — binding architecture rules; `.claude/skills/ouderapp/SKILL.md` — guide for AI agents.
- `docs/PLATFORM_FEATURES.md` — older per-screen reference (the handover guide wins where they differ).

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`. For a purely local in-browser mock
backend use `VITE_API_MOCK=1` (development only, never in a deployed build). Never put secrets in `VITE_*`
variables; server secrets are Supabase function secrets (see the handover guide, §7).
