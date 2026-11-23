<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- `/meer` links to existing flows.
- "Aanwezigheid afstemmen" lives in `src/lib/aanwezigheid-store.ts` with UI in `src/components/AanwezigheidAfstemmen.tsx`; one current proposal per appointment, contact tasks reuse taken-store (ContactStatus) — so attendance coordination never becomes a second task or proposal system.
- Afrekenen reuses existing settlement/cost sources with participant-specific transitions and no bank-data persistence until secure shared accounts exist — so manual payment declarations are never receipt evidence.
- Nog nodig links existing list items to budget-store by ID, never copied amounts or automatic costs; read src/lib/AGENTS.md for the source rules — so purchase completion cannot imply payment.
- Read nested AGENTS.md before edits; pro communication stays unavailable until protected sources exist — no simulated consent.
- Professional components have their own `src/components/pro/AGENTS.md`; read it before changes. Safety/signaling is isolated session-only fiction, never family-store, AI, export or screening data — so demonstration cannot grant access or imply monitoring.
- Shared AppLogo; keep device-storage keys on renames to retain family data.
- kring-store persists people by child IDs with stable SSR snapshots; permissions are per person/child/section/period, default none, separate for professionals; roles never grant rights — so reloads cannot duplicate or leak contacts.
- Caregivers get their own simplified UI (`/verzorger`) built from their permissions, never the parent app with locked items.
- Dossier PDF is generated client-side with jsPDF from shared parent data only; never include professional notes, personal safety notes, private moments or circle data.
- Export and on-screen visibility of shared family data go through `src/lib/export-rechten.ts` (one central check for parents and professionals) — so export can never reveal more than the normal interface.
- Contextual creation menus use one shared `ContextToevoegen` sheet and route into existing flows with search context, so Home is never the only entry point and data paths are not duplicated.
- /veranderd routes daily situations into existing stores; taken-store owns tasks/travelling items and reuses kring people/rights — so situations need no duplicate modules.
- AI uses src/lib/*.functions.ts, never writes; users confirm in existing flows. EvenMeedenken reuses verhaal/coach with session-only state and consented static demo context, never live chat; own-family AI is unavailable — no silent sending or draft replacement.
- Kring people carry three separate things: practical role (label), legal role (gezag, default none, never derived) and app access (only when uitgenodigd and confirmed via login at `/uitnodiging`; contact-only entries are an address book reused by pickers) — so neither a role nor a link grants rights.
- Shared agenda edits/deletions become pending proposals applied only on acceptance; personal items change directly — so nothing shared changes silently.
- Assistant intents are one registry array in src/lib/assistent.functions.ts mapped to existing routes; ambiguity returns a clarify intent — so new intents need no new action system.
- Functional icons: AppIcon only, one icon/token per function, never emoji.
- "Nu afstemmen" (time-sensitive practical issues, not emergency help) lives in `src/lib/nu-afstemmen-store.ts` with one shared card/start sheet in `src/components/NuAfstemmen.tsx`; replies are audited and never change planning — so urgency never causes silent changes. Ordinary unread messages show only as the Berichten nav badge.
- start-store owns onboarding; Home uses EersteHome for eigen, otherwise demo Dashboard — so demo data never appears as real.
- Handover uses child audit and travelling items — no stale/private notes. Health in demo-data is reactive, with caregiver field permissions.
- Schoolbrief uses tasks/budget, no payments; parties use Planning/Tasks; legal grids never grant access.
- "Edit this information" is always the shared `BewerkPotlood` (ui-kit) at top-right, opening the existing edit flow, only where data is editable.
- Payment UI reuses the existing cost/history store; user declarations are never provider verification — so simplification preserves accounting.
- Simulated other-parent replies stay behind `import.meta.env.DEV` — never in the parent UI.
- Send never waits on AI; feedback requires exact-input tone plus alignment and successful send. Seeded schedules are not verified context — to avoid false consent.
- Home/Agenda use agenda-datum local recurrence helpers; proposal links carry source ID/child — so dates match.
- VoorstelIntrekken shares confirmation across stores; withdrawal is final and retains history, never deletion or reapproval.
- Communication suggestions use ephemeral local rules and one CommunicatieSuggestie; separate preferences, no consent inference or writes, existing Agenda/care forms only — so hints never create commitments.
- Message requests use existing task forms and source IDs for deduplication; other-person assignment stays pending — so extraction never implies consent.
- Task completion updates contactStatus, not school outcomes; Agenda reads that source — so completion cannot imply agreement.

