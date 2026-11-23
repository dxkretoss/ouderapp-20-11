# Ouderschap & Co. — AI Architecture, Integration Flow & Feature Analysis

> **Document Version**: 2.0.0  
> **Language**: English  
> **Date**: October 30, 2026  
> **Scope**: Full Workspace Analysis (`src/`, `supabase/functions/`, and `docs/client_lovable_src/`)  
> **Target Audience**: Client Technical Leadership, Product Management, and Engineering Team  

---

## 1. Executive Summary & Core Ethical Principles

Ouderschap & Co. integrates Artificial Intelligence specifically tailored for the sensitive legal, emotional, and practical realities of Dutch co-parenting. The system is engineered to reduce conflict friction, refocus communication on the child's well-being, and ease administrative burden.

The AI implementation adheres strictly to three inviolable architectural tenets:

1. **Strict Human-in-the-Loop (Zero Silent Actions)**:
   - The AI never sends a message on its own.
   - The AI never modifies a custody calendar, changes a care schedule, or approves a financial declaration automatically.
   - All AI output is presented as an advisory suggestion. The parent must explicitly review, adjust, and confirm every action.

2. **De-escalation Grounded in Proven Methodologies**:
   - The AI personality ("Co") is built upon the established co-parenting communication frameworks developed by **Bill Eddy** at the **High Conflict Institute**:
     - **BIFF (Brief, Informative, Friendly, Firm)**: Applied during drafting and rephrasing to produce objective, polite, and fact-focused messages free of accusations or passive aggression.
     - **EAR (Empathy, Attention, Respect)**: Applied when acknowledging parent frustration or difficult situations, validating emotions without verifying accusations as factual or assigning blame to the other parent.

3. **Strict Privacy, GDPR Isolation & Zero Client Secrets**:
   - Private personal notes, safety logs, and confidential professional journal records are strictly excluded from AI prompts.
   - Third-party model providers (OpenAI) do not train on user data submitted via commercial enterprise API tiers.
   - Secret API keys (`OPENAI_API_KEY`) are stored exclusively in the **Supabase Backend Secret Vault**. The frontend web bundle contains no secret AI keys.

---

## 2. End-to-End AI Architecture & Execution Flow

The system employs a dual-tier execution architecture to ensure high availability, zero latency during basic checks, and offline/demo functionality.

```
                                  [ Parent Action in UI ]
                   (e.g., clicks Coach, Header Mic/Search, or Uploads Doc)
                                             │
                                             ▼
                 ┌────────────────────────────────────────────────────────┐
                 │ 1. Instant Client-Side Heuristics & Safety Guardrails  │
                 │    - Rapid regex check for explicit insults            │
                 │    - Immediate check for domestic safety/threat terms  │
                 └───────────────────────────┬────────────────────────────┘
                                             │
                                             ▼
                 ┌────────────────────────────────────────────────────────┐
                 │ 2. Bridge & Sanitized Context Builder (src/lib/*.js)   │
                 │    - Gathers strictly authorized data (child first     │
                 │      name, active calendar events, school holidays)    │
                 │    - Strips BSN, bank credentials, and private notes   │
                 └───────────────────────────┬────────────────────────────┘
                                             │
                             Is Supabase / Edge Function Reachable?
                                         ╱        ╲
                                       YES         NO (Offline / Demo Mode)
                                       ╱             ╲
                                      ▼               ▼
┌─────────────────────────────────────────────────┐ ┌────────────────────────────────┐
│ 3. Supabase Edge Function (Deno Runtime)        │ │ Local Rule-Based Engine        │
│    - Location: supabase/functions/ai-*/         │ │ - Deterministic Dutch rewrites │
│    - Authenticated via Supabase JWT             │ │ - Safe fallback responses      │
│    - Calls OpenAI API (gpt-4o-mini / gpt-4o)    │ │ - Zero application crashes     │
│    - Enforces JSON Schema structured responses  │ └───────────────┬────────────────┘
└────────────────────────┬────────────────────────┘                 │
                         │                                          │
                         └────────────────────┬─────────────────────┘
                                              │
                                              ▼
                 ┌────────────────────────────────────────────────────────┐
                 │ 4. Anti-Hallucination Guardrail Check                  │
                 │    - Compares AI proposal against draft and history    │
                 │    - Flags invented dates, times, amounts, or places   │
                 └───────────────────────────┬────────────────────────────┘
                                             │
                                             ▼
                 ┌────────────────────────────────────────────────────────┐
                 │ 5. Side-by-Side Review & Explicit Parent Confirmation │
                 │    - Side-by-side view (Original vs. Proposed)         │
                 │    - Parent options: Accept, Edit, or Send Original   │
                 └────────────────────────────────────────────────────────┘
```

---

## 3. Comprehensive Breakdown of All 10 AI Features

Across the live platform (`src/` and `supabase/functions/`) and the client specification prototype (`docs/client_lovable_src/`), AI has been incorporated into **10 key functional touchpoints**:

---

### Feature 1: Communication Coach (Message Tone Analysis & Rewriting)
* **Live File Locations**:
  - Frontend UI: `src/routes/messages.jsx`
  - Bridge Function: `src/lib/coach.functions.js`
  - Backend Edge Function: `supabase/functions/ai-coach/index.ts`
  - Prototype Reference: `docs/client_lovable_src/lib/coach.functions.ts`
* **Purpose**: Analyzes message drafts before sending to prevent emotional escalation between co-parents.
* **Escalation Levels**:
  - `geen` (None): Calm, clear, and practical.
  - `licht` (Mild): Mild friction, accusatory adverbs (*"always"*, *"again"*), excessive punctuation (*"?!"*).
  - `escalerend` (Escalating): Demeaning remarks, insults, or all-caps shouting.
  - `dreigend` (Threatening): Severe legal hostility or implied physical intimidation. Triggers safety help resources.
* **5 Constructive Rewriting Styles**:
  - **Rustiger (Calmer)**: Removes emotional spikes while retaining the core practical question.
  - **Korter (Shorter)**: Strips out venting and reduces the draft to the direct, necessary question.
  - **Neutraler (More Neutral)**: Formal, objective language suited for legal or mediation neutrality.
  - **Duidelijker (Clearer)**: Converts vague frustrations into actionable requests with specific dates and times.
  - **Meer kindgericht (Child-Focused)**: Centers the topic on the child's practical schedule (without using the child as an emotional weapon).
* **Anti-Hallucination**: The client prototype includes `nieuweDetails()`, which verifies that the AI does not inject invented pickup times, locations, or financial sums not present in the draft or conversation history.

---

### Feature 2: Smart Header Co-Parenting Assistant ("Co")
* **Live File Locations**:
  - Frontend UI: `src/components/Assistant.jsx` (available via search/mic icon in the universal header)
  - Bridge Function: `src/lib/assistent.functions.js`
  - Backend Edge Function: `supabase/functions/ai-assistant/index.ts`
  - Prototype Reference: `docs/client_lovable_src/components/Assistent.tsx`
* **Purpose**: Voice- and text-driven conversational navigation for planning appointments, dividing costs, or coordinating schedules.
* **How It Works**:
  - Supports speech-to-text audio input and Dutch/English natural language queries.
  - Maps requests to a **16-intent classifier**:
    1. `afspraak_toevoegen` (Add doctor, dentist, or sports event)
    2. `afspraak_wijzigen` (Modify existing calendar appointment)
    3. `tijd_wisselmoment` (Change handover time)
    4. `wissel_ruil` (Propose day swap)
    5. `extra_nacht` (Propose extra day or overnight stay)
    6. `afspraak_maken` (Propose mutual parenting agreement)
    7. `taak_toevoegen` (Add care or packing task)
    8. `momentje` (Share child milestone or photo)
    9. `kosten` (Enter shared child expense)
    10. `vakantie` (Divide school holiday period)
    11. `kring_toevoegen` (Add grandparent or caregiver to family circle)
    12. `document_zoeken` (Locate passport scan or custody agreement)
    13. `bericht` (Start new messaging topic)
    14. `ziek` (Report child illness to co-parent)
    15. `verduidelijk` (Ask 1 clarifying question when intent is ambiguous)
    16. `geen` (Provide direct informational answer)
  - Opens the target workflow with pre-filled fields; never saves or executes actions silently.

---

### Feature 3: Conversation Thread Summarizer
* **Live File Locations**:
  - Frontend UI: `src/routes/messages.jsx` (top bar action: "Vat dit gesprek samen")
  - Bridge Function: `src/lib/samenvatting.functions.js`
  - Prototype Reference: `docs/client_lovable_src/lib/samenvatting.functions.ts`
* **Purpose**: Prevents cognitive overload and emotional anxiety in lengthy chat threads.
* **How It Works**:
  - Reads up to 200 messages in the current conversation thread.
  - Generates a concise summary restricted to a maximum of 4 factual bullet points:
    - What was requested.
    - What was agreed upon.
    - What items remain open or pending.
  - Explicitly instructed to avoid assigning blame, analyzing parent personalities, or judging communication styles.

---

### Feature 4: Parenting Plan Legal Agreement OCR & Parsing (*Ouderschapsplan*)
* **Live File Locations**:
  - Frontend UI: `src/components/ParentingPlanImport.jsx`
  - Bridge Function: `src/lib/ouderschapsplan.functions.js`
  - Prototype Reference: `docs/client_lovable_src/lib/ouderschapsplan.functions.ts`
* **Purpose**: Digitizes Dutch legal custody agreements (*Ouderschapsplan*) from uploaded PDF or text documents.
* **How It Works**:
  - Uses multimodal document parsing to extract:
    - Regular care routines (e.g., week-on/week-off, 5-5-2-2).
    - Handover locations and pickup times.
    - Holiday and vacation rotation schedules.
    - Child expense split ratios (e.g., 50/50 or income-proportional).
  - Categorizes findings into standard platform sections and tags ambiguous items with `zeker: false` (requires manual parent review).

---

### Feature 5: School Letter & Newsletter Scanner (*Schoolinfo*)
* **Live File Locations**:
  - Frontend UI: `src/components/SchoolInfoReader.jsx`
  - Bridge Function: `src/lib/schoolinfo.functions.js`
  - Prototype Reference: `docs/client_lovable_src/lib/schoolinfo.functions.ts`
* **Purpose**: Eliminates missed school activities by extracting dates and requirements from school newsletters.
* **How It Works**:
  - Accepts pasted text or scanned letters from primary schools and daycare centers.
  - Automatically identifies parent-teacher conferences (*ouderavonden*), study days (*studiedagen*), field trips (*schoolreisjes*), and sports days.
  - Extracts deadlines, participation costs, and packing lists (e.g., packed lunch or swim gear) as one-click calendar events.

---

### Feature 6: Receipt & Expense OCR Scanner (*Bon Scanner*)
* **Live File Locations**:
  - Frontend UI: `src/components/ReceiptScanner.jsx`
  - Prototype Reference: `docs/client_lovable_src/components/BonScanner.tsx` and `docs/client_lovable_src/lib/bon.functions.ts`
* **Purpose**: Automates child expense entry from receipts and invoices.
* **How It Works**:
  - Captures or uploads receipt photos, resizing client-side to ensure optimal processing speed.
  - Extracts merchant name (`winkel`), date (`datum`), total amount in Euros (`bedrag`), and item description.
  - Compares the scanned amount against pre-approved budgets in `budget-store.js` to automatically link the receipt to an active agreement.

---

### Feature 7: Communication Pressure & Real-Time Tone Meter (*Communicatiemeter*)
* **Live File Locations**:
  - Frontend Store: `src/lib/communicatiedruk.js`
  - Prototype Reference: `docs/client_lovable_src/components/Communicatiemeter.tsx` and `docs/client_lovable_src/lib/communicatiemeter.ts`
* **Purpose**: Prevents impulsive messaging spirals.
* **How It Works**:
  - **Velocity Analysis**: Monitors the speed and density of message exchanges. Suggests a cool-down pause when rapid back-and-forth messaging is detected.
  - **Tone Indicator**: Evaluates the draft in real time and classifies tone into 4 clear signals:
    - `prettig` (Pleasant)
    - `zakelijk` (Businesslike / Clear)
    - `hard` (Direct / Potentially harsh)
    - `kwetsend` (Potentially hurtful)
  - Uses custom SVG illustrations (no emojis) to maintain a respectful, professional user experience.

---

### Feature 8: Private Sounding Board ("Even je verhaal kwijt bij Co?")
* **Live File Locations**:
  - Prototype Reference: `docs/client_lovable_src/routes/verhaal.tsx` and `docs/client_lovable_src/lib/verhaal.functions.ts`
* **Purpose**: A strictly confidential space where a stressed or frustrated parent can process their thoughts before contacting the other parent.
* **How It Works**:
  - Operates under three selectable modes:
    - **Even praten (Vent / Talk)**: Listens and validates feelings using EAR principles without proposing unsolicited solutions.
    - **Overzicht krijgen (Get Overview)**: Summarizes current agreements and facts from the custody schedule.
    - **Wat kan ik doen? (Next Steps)**: Offers 2–3 practical next steps, always including "do nothing for now" or "take a pause" as safe options.
  - Nothing entered in this section is ever sent or visible to the co-parent.

---

### Feature 9: In-Context Sparring Sheet ("Even meedenken met Co")
* **Live File Locations**:
  - Prototype Reference: `docs/client_lovable_src/components/EvenMeedenken.tsx`
* **Purpose**: A bottom-sheet sheet modal integrated directly into active conversation threads.
* **How It Works**:
  - Allows parents to quickly consult the AI: *"What did we agree on regarding this?"*, *"Help me interpret this message"*, or *"Help me draft a firm, polite boundary"*.
  - Explicitly asks for parent consent before including recent chat history as context for the AI query.

---

### Feature 10: Formal External Message Drafting (*Schoolbericht*)
* **Live File Locations**:
  - Prototype Reference: `docs/client_lovable_src/lib/schoolbericht.functions.ts`
* **Purpose**: Assists parents in drafting neutral letters to schools, sports clubs, or healthcare providers.
* **How It Works**:
  - Covers specific co-parenting requests: asking for separate parent-teacher meeting slots, requesting duplicate school report mailings, or confirming telephone participation.
  - Enforces strict neutrality: excludes details regarding the divorce, legal proceedings, or personal conflicts.

---

## 4. Codebase Comparison: Active Project vs. Client Prototype

| Feature | Active Project (`src/` & `supabase/`) | Latest Client Prototype (`docs/client_lovable_src/`) | Current Implementation Status |
| :--- | :--- | :--- | :--- |
| **Communication Coach** | Implemented with local heuristic fallback + `ai-coach` Edge Function | Enhanced with BIFF/EAR rules and `nieuweDetails` anti-hallucination guardrail | Operational; core logic aligned |
| **Smart Header Assistant** | Implemented in `Assistant.jsx` + `ai-assistant` Edge Function | Implemented in `Assistent.tsx` via Lovable Gateway | Operational via Supabase Edge Function |
| **Chat Summarization** | Fully integrated in `messages.jsx` | Implemented in `berichten.tsx` via `samenvatting.functions.ts` | Operational in both versions |
| **Parenting Plan Import** | Integrated in `ParentingPlanImport.jsx` | Integrated in `OuderschapsplanImport.tsx` | Operational in both versions |
| **School Newsletter Scanner** | Integrated in `SchoolInfoReader.jsx` | Integrated in `SchoolinfoUitlezen.tsx` | Operational in both versions |
| **Receipt OCR Scanner** | Form entry in `ReceiptScanner.jsx` | Automated OCR parsing in `bon.functions.ts` | Vision model ready to link to Edge Function |
| **Private Sounding Board** | Foundation in `verhaal.functions.js` | Dedicated route `/verhaal` and state storage | Ready to promote to main route if requested |
| **Communication Tone Meter** | Velocity tracking in `communicatiedruk.js` | Visual SVG meter in `Communicatiemeter.tsx` | Ready to enhance `/berichten` |

---

## 5. Security, GDPR & Credentials Setup

### Architecture Rule: Backend Vault Only
Under no circumstances are OpenAI API keys (`sk-...`) stored in client-side code, `.env` files, or compiled JavaScript bundles.

```bash
# Link local CLI to Supabase project
npx supabase link --project-ref sykpmnwiseepvistmcze

# Set OpenAI secret key securely in the backend vault
npx supabase secrets set OPENAI_API_KEY=sk-proj-your-openai-key-here
```

### Safety & Compliance Guardrails
- **Commercial API Data Privacy**: OpenAI API enterprise usage terms dictate that data submitted via API endpoints is not used to train foundation models.
- **Data Minimization**: Prompts are stripped of sensitive Dutch national identification numbers (BSN), bank accounts, and private psychological assessments.
- **Emergency Escalation Protocol**: The AI contains hardcoded detection for domestic violence and immediate physical danger, directing parents to **Veilig Thuis (0800-2000)** and emergency services (**112**).

---

## 6. Testing & Quality Assurance Verification

| Test Case | Procedure | Expected Result |
| :--- | :--- | :--- |
| **Coach - Aggressive Message** | In `/berichten`, type: *"Je bent alweer te laat met de spullen!"* and click Coach. | Flags level as `licht` or `escalerend`. Generates a calm rewrite asking for the estimated pickup time. |
| **Coach - Style Toggling** | Switch between *Rustiger*, *Korter*, *Neutraler*, *Duidelijker*, *Meer kindgericht*. | Each generates a distinct phrasing adhering to the requested style rules. |
| **Smart Assistant - Audio / Text** | Click the universal header mic icon and enter: *"Voeg zwemles toe op woensdag"*. | Classifies intent as `afspraak_toevoegen` and opens the calendar appointment sheet pre-filled. |
| **Chat Summarization** | Open an active conversation thread and click *"Vat dit gesprek samen"*. | Returns up to 4 objective bullet points summarizing agreements and pending items. |
| **Offline / Fallback Resilience** | Disconnect network or run without backend keys. | Built-in local rule engines in `src/lib/` continue to return realistic fallback responses without crashing. |

---

*Document compiled and verified against codebase revision on October 30, 2026.*

