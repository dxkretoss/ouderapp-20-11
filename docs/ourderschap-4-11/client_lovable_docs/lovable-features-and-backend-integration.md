# Lovable Prototype Updates & Backend Integration Specification

This document provides a comprehensive technical overview and backend integration specification based on the latest Lovable prototype updates. It details how the 9 functional areas are structured in the frontend codebase, the architectural rules governing them, and the specific backend deliverables required from the Kretoss backend engineering team.

---

## 1. Executive Summary & Purpose

The Lovable prototype has been updated to refine the digital co-parenting experience around the core ethos: **"Uit elkaar. Samen ouders."** (Separated, but parenting together). 

The app emphasizes calm, neutral, and constructive communication, structured proposal coordination without pressure, strict separation between proposals and financial settlement, and privacy safeguards for both parents and involved professionals.

### Key Architectural Tenets
1. **No Tacit Consent (Geen stilzwijgend akkoord):** Silence or an expired preferred deadline never implies approval or triggers automatic changes to schedules, agreements, or payments.
2. **Strict Human-in-the-Loop:** AI features (Co) are strictly advisory. AI never sends messages, finalizes agreements, or makes decisions autonomously.
3. **Purity of Stores (Single Source of Truth):** New views (such as *Openstaande voorstellen* and the professional *Afstemmingsoverzicht*) are pure read-only derived views over existing data sources, not duplicate data stores.
4. **Separation of Approval & Settlement:** Agreeing to a budget or expense proposal is decoupled from bank settlement, payment proof, or provider verification.
5. **Factual Professional Views:** Professional overviews display objective counts and statuses without psychological labeling or behavioral judgment.

---

## 2. Comprehensive Breakdown of the 9 Updated Areas

### Area 1: AI Assistant — Co
- **Name & Identity:** The AI assistant is named **"Co"** across the entire application (short for co-parenting / companion).
- **Communication Methodology:** Co’s tone and writing assistance are built on two established methods developed by Bill Eddy (High Conflict Institute):
  - **BIFF (Brief, Informative, Friendly, Firm):** Used for message composition and rewrites. Keeps messages concise, focuses on factual information and clear boundaries/requests, removes sarcasm, accusations, and passive aggression, while preserving the parent's actual intent.
  - **EAR (Empathy, Attention, Respect):** Used when acknowledging emotions, frustrations, and difficult situations. Acknowledges feelings without validating accusations or adopting claims as facts.
- **Safety Escalation Protocol:** Co never minimizes threats, coercion, or danger. If signs of domestic threat or violence are detected, Co directs users to **Veilig Thuis (0800-2000)** or emergency services (**112**), avoiding unilateral advice to reconcile.
- **Codebase Mapping:**
  - `src/lib/co-persoonlijkheid.ts`: Central source of truth for Co's personality prompt, tone rules, and safety boundaries.
  - `src/lib/coach.functions.ts`: TanStack Start server functions executing AI coaching (`coachBericht`, `toonBericht`, `vatGesprekSamen`).
  - `src/components/EvenMeedenken.tsx`: In-context AI thinking partner for drafting messages.
  - `src/routes/verhaal.tsx`: Dedicated space for parents to share their thoughts and get structured assistance.

---

### Area 2: AI Communication and Message Moderation
- **Escalation & Hostility Detection:**
  - Evaluates message tone (`geen`, `licht`, `escalerend`, `dreigend`) and coordination alignment (`passend`, `overleg`, `druk`, `onzeker`).
  - `src/lib/belediging.ts`: Instant local check for blatant insults to provide zero-latency warnings without blocking on AI server calls.
  - `src/lib/onveiligheid.ts`: Immediate local detection of physical safety threats.
  - `src/components/Communicatiemeter.tsx`: Real-time feedback bar reflecting message calm/clarity.
- **Constructive Rewriting Suggestions:**
  - Offers rewriting styles: **"Rustiger"** (Calmer), **"Korter"** (Shorter), **"Neutraler"** (More neutral), **"Duidelijker"** (Clearer), **"Meer kindgericht"** (More child-focused), and **"Als voorstel"** (As a proposal).
  - Child-focused rule: In "Meer kindgericht", the child is only the subject of practical, factual information (e.g. pickup times), never an emotional argument against the other parent.
- **Preservation of Meaning & Anti-Hallucination:**
  - `nieuweDetails()` in `src/lib/coach.functions.ts`: Scans rewritten proposals for introduced facts, times, monetary amounts, or locations not present in the draft or conversation. If detected, warnings are displayed to prevent hallucinated commitments.
- **Mandatory Review:** The rewritten text is placed in the input area for parent review, manual editing, and explicit sending. Nothing is dispatched silently.

---

### Area 3: Messaging Improvements
- **Topic-Based Organization:**
  - Conversations are organized strictly by topic (**"Berichten per onderwerp"**) in `src/routes/berichten.tsx`.
  - Parents can initiate urgent coordination via **"Snel iets afstemmen"** (uses `src/lib/nu-afstemmen-store.ts` for time-sensitive logistics like sickness or delay).
- **Topic Lifecycle:**
  - Topics can be pinned (max 3), muted with predefined durations (8 hours, 1 day, 1 week), completed, or archived.
- **Agreement Extraction:**
  - `AfwijkingHint` and `afstemmingNodig` detect when a message implies an alteration to the fixed care schedule or an unconfirmed agreement.
  - Parents receive a prompt: *"Dit lijkt wellicht af te wijken van jullie afspraak. Wil je er een voorstel van maken?"*
  - Links directly to `/zorgregeling` or `/afspraken` to format the request as a structured proposal.
- **Strict Confirmation:** No message or AI suggestion automatically creates or modifies calendar entries or agreements without explicit mutual acceptance.

---

### Area 4: Requests and Proposals — Samen Regelen
- **Unified Aggregated Overview:**
  - Hosted at `/samen-regelen` (`src/routes/samen-regelen.tsx`) and backed by `src/lib/openstaande-voorstellen.ts`.
  - Gathers proposals across 6 domains: care schedule changes (`zorg`), appointments (`afspraken`), budgets (`budgetten`), holidays (`vakanties`), incidental costs (`kosten`), and attendance (`aanwezigheid`).
  - Pure read-only aggregation: no secondary proposal database exists in the frontend.
- **Dual Perspective:**
  - **"Wacht op jouw reactie"** (Awaiting your response): Items where the logged-in parent is designated to act.
  - **"Mijn voorstellen"** (My proposals): Items submitted by the logged-in parent with filters (*Wacht op reactie* / *Reactie ontvangen* / *Afgerond* / *Alle*).
- **Core Response Actions:**
  - **Akkoord** (Agree / Accept)
  - **Niet akkoord** (Disagree / Reject)
  - **Tegenvoorstel** (Counterproposal)
  - **Meer tijd nodig** (Need more time): Keeps the proposal open without agreement.
- **Preferred Response Date (`reactieDatum`):**
  - Optional ISO date request.
  - Crucial legal rule: A request only, never a binding expiry. When passed, the status becomes `reactiedatum-verstreken`, but the proposal remains open and **no automatic change occurs**.
- **Bounded, Friendly Reminders:**
  - Implemented in `src/lib/herinneringen.ts`.
  - Max **1 reminder before** the preferred response date.
  - Max **1 reminder after** the preferred response date has passed.
  - For proposals without a response date: max 1 reminder total.
  - **Pausable via Settings** (`herinneringenGepauzeerd`): e.g. during formal safety arrangements, contact restrictions, or mediation.
  - In-app reminders only: no intrusive push notifications that bypass quiet hours or court-ordered communication buffers.
- **Homepage Status:**
  - The Home dashboard (`src/routes/index.tsx` & `src/components/EersteHome.tsx`) displays **"✓ Alles is afgestemd."** whenever no open actions await the user.

---

### Area 5: Expenses and Budget Proposals
- **Preferred Response Dates for Finances:**
  - Applied to budget proposals (`Budget` in `src/lib/budget-store.ts`) and individual expense declarations (`src/routes/kosten.tsx`).
- **Standardized Proposal Workflow:**
  - Financial proposals are mapped into `OpenVoorstel` via `budgetItem()` and `kostItem()`, appearing in `/samen-regelen`.
- **Decoupling Approval from Payment:**
  - Agreeing to a budget or expense proposal confirms mutual commitment to the expense.
  - Settlement calculation (`src/lib/verrekening.ts`) and payment verification are handled independently. An agreed expense is not marked as paid until settled by the parents.
- **Bidirectional Navigation:**
  - Clicking a budget proposal in `/samen-regelen` navigates directly to `/kosten?budget={id}`.
  - Cost actions link back to `/samen-regelen`.

---

### Area 6: Calendar and Agreements
- **Message-to-Calendar Preparation:**
  - Potential arrangements recognized in conversation can be pre-filled into appointment forms (`/afspraken?nieuw=afspraak`).
- **No Unilateral Alteration:**
  - Existing appointments and custody divisions cannot be modified without mutual approval.
  - Calendar items with pending proposals display proposal badges linked by source ID and child ID.

---

### Area 7: Parent Connections & Shared Information Architecture
- **Connected Multi-Parent Architecture:**
  - The frontend currently supports demo fixtures (Sanne & Joris) and local single-parent onboarding (`start-store.ts`).
  - Production requires connecting these flows to authentic paired parent accounts via Kretoss backend synchronization.
- **Strict Data Segregation:**
  - **Shared Data:** Approved calendar items, finalized care schedules, shared budgets, agreed expenses, mutual messages.
  - **Private Data:** Draft messages, unsent proposals, personal safety notes, private diary entries, private reminders.
  - **Professional Data:** Professional journal notes, internal case notes, and confidential signaling data are never accessible to parents or included in parent PDF exports (`src/lib/export-rechten.ts`).

---

### Area 8: Professional Dashboard (Afstemmingsoverzicht)
- **Factual Overview:**
  - Implemented in `src/components/pro/AfstemmingTab.tsx`.
  - Uses `telling()` from `src/lib/openstaande-voorstellen.ts` to compute strictly factual counts:
    - `ingediend` (Submitted)
    - `beantwoord` (Answered)
    - `zonderReactie` (Awaiting response)
    - `verstreken` (Preferred response date passed)
    - `tegenvoorstellen` (Counterproposals received)
- **Zero Subjective Labeling:**
  - No behavioral scores, hostility metrics, or automated parenting judgments.
  - Strictly presents what parents themselves entered.
- **Permission Scoping:**
  - Professionals only see data for families where they have an active mandate, scoped by child, section, and period (`src/lib/export-rechten.ts`).

---

### Area 9: Technical Documentation (Backend Requirements for Kretoss)
Lovable generated `docs/openstaande-voorstellen-kretoss.md` and `docs/professionals-communicatie.md`. Below is the consolidated technical specification for the Kretoss backend team.

---

## 3. Backend Deliverables & Technical Requirements for Kretoss

### 3.1 Account Pairing & Identity
1. **Dual Parent Authentication:** Authenticate both parents independently. Associate both with a common `family_id` while maintaining separate credentials, notification endpoints, and cryptographic salts.
2. **Invitation Handshake:** Secure token-based invitation flow (`/uitnodiging`) validating parental link before granting access to shared family resources.
3. **Role vs Authorization:** Roles are labels (e.g., biological parent, guardian, caregiver). Actual permissions must be explicitly validated in database Row-Level Security (RLS) policies.

### 3.2 Proposal & State Transition Engine
The backend must implement the state machine defined in `src/lib/openstaande-voorstellen.ts`:
- **State Machine:**
  - `wacht-op-reactie` / `wacht-op-jouw-reactie`
  - `meer-tijd-gevraagd`
  - `tegenvoorstel-ontvangen`
  - `reactiedatum-verstreken`
  - `akkoord`
  - `niet-akkoord`
  - `ingetrokken`
  - `afgerond`
- **Server-Side Invariants:**
  - **No Tacit Consent:** A proposal with `reactiedatum < NOW()` must transition its status indicator to `reactiedatum-verstreken`, but must **NEVER** apply the proposed change to the underlying schedule, appointment, or budget.
  - **Immutable History:** Proposals cannot be deleted from the database. Withdrawals (`ingetrokken`) and rejections (`niet-akkoord`) must persist in the audit log.
  - **Single Active Proposal per Entity:** Prevent race conditions by allowing only one active pending proposal per specific appointment, care day, or budget item.

### 3.3 Reminder Delivery Service
The reminder rules from `src/lib/herinneringen.ts` must be strictly enforced on the server:
1. **Quota Enforcement:**
   - Maximum **1 reminder before** the preferred response date.
   - Maximum **1 reminder after** the preferred response date.
   - Without a response date: maximum **1 reminder total**.
2. **Quiet Hours & Communication Pauses:**
   - Respect parent-configured quiet hours (`rustVan` to `rustTot`).
   - If the family has paused reminders (`herinneringenGepauzeerd` = true), the server must reject reminder requests with HTTP 403 / application error code.
3. **Delivery Channel:** In-app notification records only; no external push bypass.

### 3.4 Professional Access Control & Audit Logging
1. **Explicit Dual Consent:** Professional access to family coordination data requires explicit, recorded consent from both parents. Pre-checked consent or simulated approval is prohibited.
2. **RLS & Handler Re-Verification:** Every API request must verify identity, current family membership, and unexpired professional authorization.
3. **Factual Views Only:** Ensure backend endpoints for professionals (`/api/pro/afstemming`) return only aggregated status counts and proposal metadata, never raw message bodies, drafts, or private journal entries.
4. **Append-Only Access Logs:** Log every professional read access with server timestamp, professional ID, and target family ID.

---

## 4. Codebase Reference Map

| Functional Area | Key Frontend Files |
|---|---|
| **Co AI Assistant** | [`src/lib/co-persoonlijkheid.ts`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/lib/co-persoonlijkheid.ts)<br>[`src/lib/coach.functions.ts`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/lib/coach.functions.ts)<br>[`src/routes/verhaal.tsx`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/routes/verhaal.tsx) |
| **Moderation & Meter** | [`src/lib/belediging.ts`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/lib/belediging.ts)<br>[`src/lib/onveiligheid.ts`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/lib/onveiligheid.ts)<br>[`src/components/Communicatiemeter.tsx`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/components/Communicatiemeter.tsx) |
| **Messaging & Topics** | [`src/routes/berichten.tsx`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/routes/berichten.tsx)<br>[`src/lib/nu-afstemmen-store.ts`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/lib/nu-afstemmen-store.ts) |
| **Proposals Engine** | [`src/lib/openstaande-voorstellen.ts`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/lib/openstaande-voorstellen.ts)<br>[`src/routes/samen-regelen.tsx`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/routes/samen-regelen.tsx) |
| **Reminders** | [`src/lib/herinneringen.ts`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/lib/herinneringen.ts)<br>[`src/lib/voorkeuren-store.ts`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/lib/voorkeuren-store.ts) |
| **Expenses & Budgets** | [`src/lib/budget-store.ts`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/lib/budget-store.ts)<br>[`src/routes/kosten.tsx`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/routes/kosten.tsx)<br>[`src/lib/verrekening.ts`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/lib/verrekening.ts) |
| **Calendar & Agreements** | [`src/lib/afspraken-store.ts`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/lib/afspraken-store.ts)<br>[`src/lib/zorg-store.ts`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/lib/zorg-store.ts)<br>[`src/routes/agenda.tsx`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/routes/agenda.tsx) |
| **Professional Dashboard** | [`src/components/pro/AfstemmingTab.tsx`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/components/pro/AfstemmingTab.tsx)<br>[`src/routes/professionals.tsx`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/routes/professionals.tsx) |
| **Permissions & Isolation** | [`src/lib/export-rechten.ts`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/lib/export-rechten.ts)<br>[`src/lib/kring-store.ts`](file:///c:/Users/BAPS/Downloads/samen-ouders-nu-main%20%284%29/samen-ouders-nu-main/src/lib/kring-store.ts) |
