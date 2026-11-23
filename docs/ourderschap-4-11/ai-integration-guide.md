# Ouderschap & Co — AI Integration Guide

> **Document Version**: 1.0.0  
> **Status**: Operational (Dual Mode: Live Supabase Edge Functions + Interactive Demo Fallback)  
> **Target Audience**: Developers, Backend Engineers, QA Testers, and Product Managers  
> **Supported Platforms**: Web SPA (React + Vite), iOS (Native / React Native / Flutter), Android  

---

## 1. Executive Summary & Philosophy

Ouderschap & Co integrates Artificial Intelligence specifically tailored for the sensitive context of Dutch co-parenting. The AI is designed with three inviolable principles:

1. **Constructive & Child-Centric**: The AI never takes sides, never judges either parent, and always de-escalates conflict by refocusing discussions on the child's schedule and well-being.
2. **Non-Binding (Zero Silent Actions)**: AI never executes binding actions, never alters care schedules, and never sends messages automatically. The parent must explicitly review, adjust, and confirm every suggestion.
3. **Strict Privacy & GDPR Isolation**: Private parent notes, personal safety data, and confidential professional journal entries are strictly excluded from AI prompts. API keys are kept entirely server-side in Supabase Edge Functions.

---

## 2. Overview of the 5 AI Features in the Code

| Feature | User Goal | Frontend UI Entry Point | Logic / Bridge File | Supabase Edge Function |
|---|---|---|---|---|
| **1. Communicatie Coach** | Rewrites emotional or accusatory drafts into calm, constructive messages before sending | `src/routes/berichten.jsx`<br>`src/components/EmailGesprek.jsx` | `src/lib/coach.functions.js` | `supabase/functions/ai-coach/` |
| **2. Slimme Assistent** | Natural language voice & text assistant to navigate, plan events, or propose changes | `src/components/Assistent.jsx`<br>*(Mic & search bar in page header)* | `src/lib/assistent.functions.js` | `supabase/functions/ai-assistant/` |
| **3. Gesprekssamenvatting** | Summarizes lengthy chat threads into neutral agreed points and open action items | `src/routes/berichten.jsx`<br>*(Top bar "Samenvatting" button)* | `src/lib/samenvatting.functions.js` | `supabase/functions/ai-summarize/` |
| **4. Ouderschapsplan Import** | Extracts care schedule rules, holidays, and cost splits from PDF/text agreements | `src/components/OuderschapsplanImport.jsx` | `src/lib/ouderschapsplan.functions.js` | `supabase/functions/ai-parenting-plan/` |
| **5. Schoolinfo Uitlezen** | Scans school letters and newsletters for parent-teacher days, field trips, and holidays | `src/components/SchoolinfoUitlezen.jsx` | `src/lib/schoolinfo.functions.js` | `supabase/functions/ai-school-info/` |

---

## 3. Detailed How-It-Works Breakdown

### A. Communicatie Coach (`ai-coach`)
When typing a message in `Berichten`, a parent can click the Coach button.

1. **Escalation Analysis**:
   - The AI evaluates the draft message against 4 escalation tiers:
     - `geen`: Objective, calm, practical.
     - `licht`: Slightly accusatory, sharp words (*"alweer"*, *"altijd"*), punctuation irritation (*"?!"*).
     - `escalerend`: Demeaning phrasing, shouting (all-caps), personal attacks.
     - `dreigend`: Language implying severe harm or intimidation.
2. **5 Rephrasing Styles**:
   - **Rustiger**: Calms emotional spikes and removes passive-aggressive phrasing while keeping the core question.
   - **Korter**: Cuts venting and distills the draft to the direct practical question.
   - **Neutraler**: Objective, factual tone suited for legal/formal neutrality.
   - **Duidelijker**: Turns vague frustration into an actionable request with dates and times.
   - **Meer kindgericht**: Centers the message on what the child needs (e.g. *"For Emma's peace of mind, could we agree on the pickup time?"*).
3. **User Action**: The parent sees the original vs. rewritten proposal side-by-side, can edit it, apply it with one click, or discard it.

---

### B. Slimme Co-ouderschap Assistent (`ai-assistant`)
Located in the header on every page, accessible via voice recording or text typing.

1. **Context Building**:
   - Builds dynamic context strictly from data the parent is authorized to view (children names, current week schedule, school vacation dates, shared belongings).
   - Never injects private safety notes or professional dossiers.
2. **Intent Classification & Routing Registry**:
   Maps natural Dutch speech to 1 of 16 specific co-parenting action flows:
   - `afspraak_toevoegen`: New doctor, dentist, swimming lesson event.
   - `wissel_ruil`: Propose switching days with the other parent.
   - `kosten`: Enter a new shared child expense.
   - `taak_toevoegen`: Assign packing or care tasks between homes.
   - `vakantie`: Check or divide school vacation periods.
   - `document_zoeken`: Locate custody agreement or passport scans.
   - `ziek`: Report child sickness and notify other parent.
3. **Execution**: The assistant opens the appropriate sheet or screen with prefilled fields (child name, date, title) for the parent to confirm.

---

### C. Gesprekssamenvatting (`ai-summarize`)
- In `Berichten`, long threads can create cognitive overload or anxiety.
- Clicking **"Vat gesprek samen"** generates maximum 4 factual bullet points:
  - What was asked.
  - What was agreed upon.
  - What remains open/pending.
- Explicitly instructed to avoid personal critiques, psychological analysis, or assigning blame.

---

### D. Ouderschapsplan & Schoolinfo Scanners
- **Ouderschapsplan Import**: Uses vision/OCR + structured JSON completion to parse Dutch legal custody agreements (*ouderschapsplannen*), extracting cycle schedules (e.g., 5-5-2-2 or birdnesting), handover locations, and expense split ratios (e.g., 50/50 or income-proportionate).
- **Schoolinfo Uitlezen**: Takes school letters or PDFs, extracts dates of parent-teacher evenings, study days (*studiemiddagen*), and swimming days, and creates one-click calendar events.

---

## 4. What Is Required to Activate the AI (Setup Guide)

The application supports a **two-tier execution model**:

```
                       User Action (e.g. Coach Click)
                                     │
                                     ▼
                      Is Supabase configured in .env?
                                ╱         ╲
                             YES           NO
                             ╱               ╲
               Call Edge Function         Execute Local Demo
             (supabase/functions/...)     Fallback NLP Engine
                       │                  (Interactive simulation
           Calls OpenAI API with Secret     with realistic Dutch
            (gpt-4o-mini / gpt-4o)          co-parenting rewrites)
```

### Step 1: Obtain an OpenAI API Key
- Go to [platform.openai.com](https://platform.openai.com) and create an API key (`sk-...`).
- Recommended model: `gpt-4o-mini` (fast, highly capable in Dutch, very cost-effective).

### Step 2: Configure Supabase Backend Secrets
The OpenAI key is **never placed in the frontend `.env`**. It is stored securely in your Supabase project's secret vault:

#### Option A: Via Supabase CLI (Recommended)
```bash
# Link to your Supabase project
supabase link --project-ref <your-project-ref>

# Set the OpenAI key for Edge Functions
supabase secrets set OPENAI_API_KEY=sk-proj-your-openai-api-key-here
```

#### Option B: Via Supabase Dashboard
1. Open your Supabase Project Dashboard.
2. Navigate to **Project Settings** ➔ **Edge Functions**.
3. Under **Secrets**, add a new secret:
   - **Name**: `OPENAI_API_KEY`
   - **Value**: `sk-proj-...`

---

### Step 3: Deploy the Edge Functions
Deploy the functions to your Supabase project:

```bash
# Deploy all Edge Functions
supabase functions deploy

# Or deploy specific AI functions
supabase functions deploy ai-coach
supabase functions deploy ai-assistant
```

---

### Step 4: Configure Frontend `.env`
In `D:\ouderapp_react\.env`, configure your Supabase URL and Anon Key:

```env
VITE_SUPABASE_URL=https://hbimbzwcdmhnxxdbbugw.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Once these variables are set, the application automatically routes all AI requests to the live Supabase Edge Functions with OpenAI!

---

## 5. Security & GDPR Compliance

- **No Training on Co-parenting Data**: When using OpenAI API keys with paid tier accounts, data sent to the API is not used for model training.
- **Client-Side Secret Isolation**: Mobile and Web bundles only contain `VITE_SUPABASE_ANON_KEY`. The `OPENAI_API_KEY` lives strictly inside the Deno runtime of Supabase Edge Functions.
- **Prompt Sanitization**: Prompts only include essential context (e.g. child first name, event date). Sensitive personal identifiers (BSN numbers, bank account numbers, medical diagnoses) are stripped out.

---

## 6. Native Mobile App Integration (iOS & Android)

Native mobile apps (React Native, Flutter, Swift, Kotlin) call the exact same Edge Functions via the Supabase Client SDK:

### React Native / Expo Example
```javascript
import { supabase } from '../services/supabase';

// Invoke AI Coach before sending a chat message
export async function getCoachAdvice(draftMessage, style = 'Rustiger') {
  const { data, error } = await supabase.functions.invoke('ai-coach', {
    body: { text: draftMessage, style: style },
  });

  if (error) {
    console.error('AI Coach error:', error);
    return null;
  }

  // data = { rewritten: "...", original: "...", niveau: "licht" }
  return data;
}
```

### Flutter Example
```dart
import 'package:supabase_flutter/supabase_flutter.dart';

Future<Map<String, dynamic>?> getCoachAdvice(String text, String style) async {
  final res = await Supabase.instance.client.functions.invoke(
    'ai-coach',
    body: {'text': text, 'style': style},
  );
  return res.data as Map<String, dynamic>?;
}
```

---

## 7. Testing Checklist

| Test Case | How to Test | Expected Behavior |
|---|---|---|
| **Coach - Sharp message** | In `Berichten`, type: *"Je bent alweer te laat met de spullen!"* and click Coach. | Flags level as `licht` or `escalerend`. Suggests calm rewrite asking when pickup will occur. |
| **Coach - 5 Styles** | Toggle between *Rustiger*, *Korter*, *Neutraler*, *Duidelijker*, *Meer kindgericht*. | Each generates a distinct Dutch variation according to the selected style. |
| **Assistant - Voice/Text** | Click header search/mic icon and say: *"Voeg zwemles toe op woensdag"*. | Classifies as `afspraak_toevoegen` and opens Agenda sheet with event prefilled. |
| **Summarization** | In `Berichten`, open conversation and click "Vat gesprek samen". | Returns 3–4 concise bullet points summarizing agreements and pending tasks. |
| **Offline / Demo Fallback** | Disconnect internet or clear `.env` keys. | Continues to provide realistic Dutch fallback responses without application crashes. |
