# Extra houvast: existing UI, account persistence handoff

## November 2026 update: intro, Co and cooperation interface

The same route now shows seven explanatory rows when off and five existing tool links when on, plus a Co shortcut. `onderdeel=intro` keeps the introduction reachable; `onderdeel=afspraken` retains the existing agreement submenu. CoBadge now wraps the single `co` lightbulb in AppIcon. CoPrivacy provides shared explanations in the overview, story helper and chat helper. No backend, AI prompts, access rules or sending behavior were changed.

The separate option “Co mag meedenken bij terugkerende knelpunten” is disabled and false, not stored consent. No event analysis, private-message analysis, automatic suggestion, AI request or notification is triggered by it. Before enabling: reuse authenticated user settings for a distinct opt-in; define lawful permitted structured sources and purpose; enforce child/category/period access server-side; exclude private Co conversations; stop processing on withdrawal; bound suggestion frequency and provide dismissal. Suggested proposals must use existing forms and require explicit submission. No automatic changes, risk labels or parental-fitness judgments.

The existing professional `CommunicatiePatronen` placeholder now includes “Samenwerking & signalen” inside the existing permission-scoped communication tab. All five indicators (communication volume, proposal counts, recurring topics, open proposals, Co use) remain unavailable; no invented counts or family data are supplied. The 7/30/90-day filter changes presentation only. Preserve the existing factual Afstemming tab. Do NOT implement MASIC or safety screening.

For a real professional view, verify authentication, active family relationship and specific rights for child, category and period on every read, with immediate revocation. Reuse existing proposal sources and statuses; rejected is not approved, overdue is not consent, proposed is not an agreement. Compute factual counts from authorized structured events with stable source IDs and timestamps, and compare equal periods. Message-volume statistics need their own lawful access rules; no private concepts or Co messages. Co-use aggregates require a separate lawful, transparent sharing choice and privacy safeguards; default no sharing and never a conflict score. Provide access auditing, retention policy and legal assessment including whether a DPIA is required. Never grant rights from the Extra houvast switch or a local demo permission.

The existing PDF flow, timeline, parent-message filter and accompaniment page are reused unchanged. The accompaniment page still needs verified account links before demo professionals can represent actual authorized people. User-selected export must use the central rights check and exclude private Co data. Sharing a document remains an explicit user action using the existing export flow.

Required acceptance tests: independent A/B preferences across logout/login; B can respond while Extra houvast is off; disabling preserves all source records/history; opt-in alone grants no access; unauthorized professional/category/child/period reads fail; revoked access fails immediately; Co conversations and use statistics are excluded by default; no automatic proposal/send/change/share; dismissed suggestions respect a defined rate limit. These require your protected two-account environment, not this local preview.

### Verification for this update

Browser checked at 390px and 1280px: default intro, all seven rows, enabling, five tool links, intro revisit, agreements submenu, reload retention, disabling, and incoming proposals visible while off. Professional dossier communication view and 7-day placeholder filter checked at both sizes with no horizontal overflow. Current source suite passes; latest count includes the subsequent costs task. The older verification section below describes the previous three-link implementation, not this update. No new AI-generated answer, real authentication, provider retention or protected professional statistics is verified by this presentation-only change. Existing PDF generation and real calls were not rerun.

The existing optional tools are grouped at `/extra-ondersteuning` (public label: Extra houvast). Routes are preserved. The `extraHouvast` boolean in `src/lib/voorkeuren-store.ts` defaults to false and controls presentation only. There are no backend changes.

## Required account integration

The current preference store uses `onzeapp-voorkeuren` in device localStorage. It is NOT authenticated per-user persistence. Do not use a name, child ID, or family ID as an identity substitute. Connect this one preference to your existing authenticated user settings (not family settings), hydrate it after login and retain it across logout/login. One parent's preference must never change another parent's. No additional proposal/permission system is requested.

Disabling the setting must not delete or change records, approvals, rights, notifications, history, or incoming-request delivery. Existing routes remain reachable directly. Home and Samen regelen must continue to show incoming proposals and allow responses regardless of this preference. Gezag & toegang, PDF export and communication remain accessible through Instellingen.

## Existing sources to preserve

- `src/lib/afspraken-store.ts`: versioned agreements, proposals, approvals and history. `isIngevuldeAfspraak` hides unchanged demo seeds in the overview only; deep links and source readers retain them.
- `src/routes/beslissingen.tsx`: existing decision form and consent behavior; only the requested explanatory sentence was changed.
- `src/routes/tijdlijn.tsx`: existing timeline, now labeled Terugkijken.
- `src/routes/exporteren.tsx` and `src/lib/export-rechten.ts`: existing selection, PDF generation and access checks.
- `src/routes/contact.tsx`, `src/routes/halen-brengen.tsx`, `src/routes/gesprekken.tsx`: existing contact/handover/calling flows, unchanged.

## Checks requiring your two-account environment

Authenticate parent A and B separately. Enable for A, leave B off; verify their settings remain independent after logout/login. Share a new agreement or decision from A; B must see it in normal request locations and respond with the setting off. Turn A's setting off; read back all existing records and history unchanged. Verify export and legal-access checks independently of this presentation setting. These real-account checks cannot be claimed from the present device/demo implementation.

## Verified in Lovable

213 source tests pass. At 390px: default off, three links when on, preference retained on reload, creation of an agreement proposal, then disabling via client navigation and reading that proposal in Samen regelen. Existing incoming agreement deep links remain answerable with the setting off. Settings links to legal access, calling and export selection remain available. Desktop 1280px renders without horizontal overflow; no browser runtime errors observed. Agreement records remain session-only as before: this change does not add persistence for agreements. PDF generation, live calls and two-account replies were not end-to-end tested in this task; their existing implementations were retained.
