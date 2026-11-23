# Ouderschap & Co. — AI Architecture, Messaging Features & Credentials Guide

> **Document Version**: 1.0.0  
> **Date**: October 21, 2026  
> **Topic**: AI Models & Capabilities, Messaging System Status, and Milestone 2 Credentials Setup  
> **Target Audience**: Client Technical Lead, Product Owner, and Development Team  

---

## 1. Overview of Integrated AI Features & Models

Ouderschap & Co. integrates artificial intelligence specifically tailored for Dutch co-parenting. The system de-escalates conflict, keeps conversations focused on the child, and automates administrative burden without ever taking silent or binding actions.

### AI Models & Provider

| Category | Specification | Details |
| :--- | :--- | :--- |
| **Provider** | **OpenAI** (via direct REST API) | Enterprise API with standard commercial data privacy protections. |
| **Primary Model** | **`gpt-4o-mini`** | Used for real-time message rewriting, assistant intent classification, and chat summarization. Chosen for low latency, excellent Dutch comprehension, and cost-effectiveness. |
| **Vision / Doc Model**| **`gpt-4o`** | Reserved for multi-page PDF document OCR and legal parenting plan (*Ouderschapsplan*) parsing. |
| **Execution Gateway** | **Supabase Edge Functions** | The frontend browser never connects to OpenAI directly. All AI requests pass through serverless Edge Functions in `supabase/functions/`. |
| **Offline Fallback** | **Rule-Based Simulation Engine** | A built-in local NLP parser (`src/lib/coach.functions.js`) ensures the UI never breaks or throws errors when offline or if no API key is set. |

---

### The 5 AI Features Built Into the Application

```
                                 ┌───────────────────────────────────────────────────────────┐
                                 │                 OUDERSCHAP & CO. AI ENGINE                │
                                 └─────────────────────────────┬─────────────────────────────┘
                                                               │
         ┌─────────────────────┬───────────────────────────────┼──────────────────────────────┬─────────────────────────────┐
         ▼                     ▼                               ▼                              ▼                             ▼
   1. AI Coach         2. Smart Assistant            3. Chat Summaries           4. Plan Importer            5. School Letter Reader
   (Tone rewriting)    (Natural speech routing)      (Factual thread digest)     (Custody schedule OCR)      (Calendar event extraction)
```

#### 1. Communicatie Coach (`supabase/functions/ai-coach/`)
* **Entry Point**: Available inside every message draft in `/berichten`.
* **Escalation Analysis**: Automatically checks drafts against 4 levels:
  1. `geen`: Objective, calm, practical.
  2. `licht`: Mild friction, accusatory adverbs (*"alweer"*, *"altijd"*), punctuation frustration (*"?!"*).
  3. `escalerend`: Insults, shouting (all-caps), demeaning remarks.
  4. `dreigend`: Language implying severe harm or legal hostility.
* **5 Constructive Rewriting Styles**:
  * **Rustiger**: Removes emotional heat and defensiveness while keeping the core question.
  * **Korter**: Cuts venting and distills the draft to the direct practical question.
  * **Neutraler**: Formal, objective phrasing suitable for legal or mediation neutrality.
  * **Duidelijker**: Turns vague frustration into an actionable request with dates and times.
  * **Meer kindgericht**: Centers the message on what the child needs (e.g. *"For Emma's peace of mind, could we agree on the pickup time?"*).
* **Zero Silent Action**: The parent sees the proposed rewrite side-by-side with an *"Overnemen"* (Accept) button. No message is rewritten or sent without explicit confirmation.

#### 2. Slimme Co-ouderschap Assistent (`supabase/functions/ai-assistant/`)
* **Entry Point**: Search and microphone icon in the header across all screens.
* **Intent Classifier**: Maps voice or text commands to 1 of 16 specific actions:
  * `afspraak_toevoegen` (doctor, dentist, swim lessons).
  * `wissel_ruil` (propose day swaps).
  * `kosten` (log shared child expenses).
  * `taak_toevoegen` (assign packing or care tasks).
  * `vakantie` (divide school holiday periods).
  * `ziek` (report child illness).
* **Execution**: Opens the corresponding modal with prefilled data for parent confirmation.

#### 3. Gesprekssamenvatting (`supabase/functions/ai-summarize/`)
* **Entry Point**: Top bar in `/berichten` (*"Vat gesprek samen"*).
* **Function**: Distills lengthy message threads into a maximum of 4 factual bullet points:
  * What was asked.
  * What was mutually agreed.
  * What remains open or pending.
* **Design Rule**: Explicitly avoids personal critiques, psychological analysis, or assigning blame.

#### 4. Ouderschapsplan Import (`supabase/functions/ai-parenting-plan/`)
* Scans Dutch legal parenting agreements (PDF/text) to extract repeating cycle schedules (e.g. 5-5-2-2 or birdnesting), handover locations, and expense split ratios (e.g. 50/50).

#### 5. Schoolinfo Uitlezen (`supabase/functions/ai-school-info/`)
* Scans school letters and newsletters to detect parent-teacher evenings (*ouderavonden*), study days (*studiemiddagen*), and field trips, creating one-click calendar events.

---

## 2. In-App Messaging: What Is ALREADY Integrated?

The messaging system located at [`/berichten`](file:///d:/ouderapp_react/src/routes/messages.jsx) is fully designed and operational on the frontend with the following features:

### Fully Integrated Features (Frontend & UI Logic)

1. **Topic-Based Organization (Not an Endless Stream)**:
   * Messages are organized into separate topics (e.g., *"Swimming Lessons"*, *"Dentist"*, *"Weekend Swap"*).
   * Prevents important agreements from getting buried in daily chit-chat.
2. **Responsive 2-Column Dashboard**:
   * **Desktop & Tablet**: Split layout showing the conversation list on the left and active thread on the right.
   * **Mobile**: Full-screen conversation list with smooth navigation into individual threads and back buttons.
3. **Communication Pressure Meter (*Communicatiedruk*)**:
   * Evaluates messaging velocity in real-time.
   * If parents send heated messages back-and-forth too quickly, the system suggests a cooling-off pause (*"Take a moment to reflect before responding"*).
4. **Interactive AI Coach Toolbar**:
   * When composing a message, tapping *"Laat AI herformuleren"* displays the 5 style tabs.
   * Shows the proposed revision side-by-side with the original text.
5. **Thread Summarizer Modal**:
   * Generates a 4-bullet point digest of agreed items in the current thread.
6. **External Email Integration View**:
   * Integrated setup screen (`/berichten` ➔ Email tab) for managing email-based communication if preferred.

### What Milestone 2 Adds to Messaging:
* Currently, conversation threads exist in local UI state.
* **Milestone 2 Task**: Connect the existing messaging components to real Supabase tables (`conversations` and `messages`) with Row Level Security (RLS) so messages persist across devices and update between Parent A and Parent B in real time.

---

## 3. Milestone 2 Credentials & Security Architecture

### Strict Security Rule: Zero Client-Side Secret Keys
> **No secret API keys are ever placed in frontend code, `.env` files, or compiled web/mobile bundles.**  
> Exposing an OpenAI secret key or Supabase Service Role key in the browser allows anyone to extract the key and incur unauthorized billing. All private keys are stored exclusively in the **Supabase Backend Vault**.

---

### Credentials Checklist for Milestone 2

| Credential | Where It Lives | Purpose | Status / Action Needed |
| :--- | :--- | :--- | :--- |
| **OpenAI API Key (`OPENAI_API_KEY`)** | **Supabase Backend Secrets** | Powers live AI Coach, Assistant, and chat summaries. | **Client needs to provide their key** *(from platform.openai.com)*. |
| **Supabase URL & Anon Key** | Frontend `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) | Connects frontend clients to database and Edge Functions. | **Already configured and operational** *(Project: `hbimbzwcdmhnxxdbbugw`)*. |
| **Resend / SMTP Credentials** | Supabase Backend Secrets | Transactional email delivery for invitations and OTP verification. | **Already configured and operational**. |
| **Stripe API Keys** | Supabase Backend Secrets | Paid subscription billing. | **Not needed for Milestone 2** *(Scheduled for Milestone 3)*. |

---

### Step-by-Step: How the Client Configures Their OpenAI Key

The client retains full ownership of their OpenAI account, billing limits, and API keys. They do **not** need to email or message their secret key to developers.

#### Option A: Via Supabase Web Dashboard (Easiest)
1. Log in to the [Supabase Dashboard](https://supabase.com/dashboard).
2. Open the project: **`hbimbzwcdmhnxxdbbugw`**.
3. In the left navigation, click on **Project Settings** (gear icon) ➔ **Edge Functions**.
4. Under the **Secrets** section, click **Add new secret**:
   * **Name**: `OPENAI_API_KEY`
   * **Value**: `sk-proj-xxxxxxxxxxxxxxxxxxxx`
5. Click **Save**. The Edge Functions will immediately detect and use the live key.

#### Option B: Via Supabase CLI
```bash
# Link to project
supabase link --project-ref hbimbzwcdmhnxxdbbugw

# Set the OpenAI key in secure backend vault
supabase secrets set OPENAI_API_KEY=sk-proj-your-api-key-here
```

---

## 4. Summary & Verification

* **AI Provider**: OpenAI (`gpt-4o-mini` primary, `gpt-4o` OCR).
* **Privacy Isolation**: Zero training on user data, strict 30-day retention, and prompt sanitization.
* **Messaging State**: Full UI, topics, conflict meter, and coach workflows already built; ready for database table connection in Milestone 2.
* **Client Action Item for Milestone 2**: Add `OPENAI_API_KEY` to the Supabase Backend Vault.
