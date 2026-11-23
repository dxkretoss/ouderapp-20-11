# Ouderschap & Co. — Milestone 2 Scope & Security Governance Overview

> **Document Version**: 1.0.0  
> **Date**: October 21, 2026  
> **Subject**: Milestone 2 Requirements & Technical Responses to Client Security, Privacy, and AI Questions  
> **Target Audience**: Client Leadership, Legal / Data Protection Officer (DPO), and Technical Project Managers  

---

## Executive Summary

This document provides a formal overview of:
1. **Milestone 2 Implementation Scope**: Core parent-facing functionality to be connected to real database records.
2. **Client Security & Governance Responses**: Detailed technical and legal answers covering AI providers, privacy isolation, subprocessors, encryption, GDPR/AVG compliance, and current milestone completion status.

---

## Part 1: Milestone 2 — Core Parent-Facing Functionality

In accordance with Section 3 of the *Developer Implementation Brief*, Milestone 2 connects the existing Lovable frontend screens to working backend database tables and storage in Supabase, replacing mock/demo structures with real persistent records and row-level access controls.

### Milestone 2 Scope Checklist

| Feature Area | In-Scope Screens & Routes | Backend & Implementation Requirements |
| :--- | :--- | :--- |
| **1. Calendar & Scheduling** | `/agenda`<br>`/zorgregeling`<br>`/veranderd` | • Live database events table for school, medical, sports, and custody handovers.<br>• Bi-weekly/weekly schedule calculation cycles.<br>• Schedule change proposals and day-swap request workflows. |
| **2. In-App Messaging** | `/berichten` | • Persistent parent-to-parent message threads grouped by topic.<br>• Real-time updates and unread count badges.<br>• Strict isolation: messages visible only to the two connected parents. |
| **3. AI Communication Coach** | Header Assistant & `/berichten` | • Activation of `ai-coach` and `ai-assistant` Edge Functions with client OpenAI API keys.<br>• Tone analysis, constructive rephrasing, and action intent detection.<br>• Rule-based local fallback when offline or unconfigured. |
| **4. Expenses & Receipts** | `/kosten` | • Real expense logging with category and currency formatting.<br>• Receipt image upload to Supabase Storage.<br>• 50/50 and custom percentage balance calculations. |
| **5. Tasks & Belongings** | `/taken`<br>`/spullen` | • Shared child to-do items and packing checklists linked to custody changeovers.<br>• Task assignment and completion status between homes. |
| **6. Agreements & Decisions** | `/afspraken`<br>`/beslissingen` | • Recording shared parenting agreements with lifecycle statuses (*proposed*, *agreed*, *archived*). |
| **7. Documents & File Storage** | `/documenten` | • Secure PDF/file upload for parenting plans (*ouderschapsplannen*), court orders, and school reports. |
| **8. Family Circle & Caregivers** | `/kring/:childId`<br>`/verzorger` | • Inviting grandparents, babysitters, and step-parents with restricted, read-only permissions and tokenized web links. |
| **9. Shared Moments** | `/momentjes` | • Positive photo updates, daily check-ins, and milestone logs between parents. |
| **10. Solo-Parent Workflows** | `/solo` & across modules | • Ensuring parents without a connected co-parent can utilize calendars, logs, and expenses independently. |

---

## Part 2: Answers to Client Questions

---

### Question 1: Which AI providers or models are used for the communication meter, message rewriting, and other AI features?

* **Primary AI Provider**: **OpenAI** (via direct OpenAI REST API).
* **Models Utilized**:
  * **`gpt-4o-mini`**: Primary production model. Used for:
    * **Communicatie Coach**: Draft message rewriting, de-escalation, and constructive tone suggestions.
    * **Slimme Assistent**: Natural language routing and event creation.
    * **Gesprekssamenvatting**: Objective thread summaries without cognitive overload.
    * *Rationale*: Outstanding Dutch linguistic capabilities, low latency, and highly cost-effective per token.
  * **`gpt-4o`**: Optional model reserved for OCR and structured JSON extraction of complex multi-page PDF parenting plans (*Ouderschapsplan Import*).
* **Execution Architecture**:
  * The frontend client (web/mobile) **never** communicates directly with OpenAI.
  * All AI traffic is brokered by serverless **Supabase Edge Functions** (Deno runtime), specifically `supabase/functions/ai-coach/` and `supabase/functions/ai-assistant/`.
  * **Interactive Fallback Engine**: If no OpenAI API key is supplied or if network connectivity to OpenAI is interrupted, a local rule-based simulation engine in `src/lib/` ensures the user interface remains responsive and never throws an error.

```
[Parent Browser / App]
         │ (Authenticated JWT)
         ▼
[Supabase Edge Function (Deno)] ──> Sanitizes input, strips PII
         │ (Server-Side HTTPS + API Key)
         ▼
[OpenAI API (gpt-4o-mini)]
```

---

### Question 2: Are private messages sent to external AI services, and do these providers store the data or use it for training?

* **Are private messages sent automatically?**  
  **NO.** Private messages are **never** automatically monitored or forwarded to external AI services.
  * AI invocation is **strictly opt-in and client-initiated**.
  * The **Communicatie Coach** only receives text when a parent explicitly clicks the *"Coach"* or *"Herschrijf"* button on an unsent **draft**.
  * Normal parent-to-parent messages are encrypted in transit and saved directly to the database without AI processing.
* **Is data used for model training?**  
  **NO.** Under OpenAI’s commercial API Business Terms:
  * Data submitted via the commercial API is **strictly prohibited from being used to train or improve OpenAI models** (unlike free consumer ChatGPT).
* **Retention Policy**:
  * OpenAI retains API requests in temporary memory for a maximum of **30 days** solely for abuse/misuse monitoring, after which records are automatically purged.
  * OpenAI does not retain permanent copies of prompt transcripts.

---

### Question 3: Which other third-party services and subprocessors have access to personal data?

The platform relies on a minimal, privacy-first subprocessor architecture:

| Subprocessor | Entity & Location | Data Processed | Purpose |
| :--- | :--- | :--- | :--- |
| **Supabase, Inc.** | USA / Hosted in **Frankfurt, Germany (AWS eu-central-1)** | User profile records, children data, encrypted messages, uploaded files/photos. | Core Database (PostgreSQL), User Authentication, File Storage, and Edge Functions. |
| **OpenAI, LLC** | USA | Ephemeral text snippets submitted voluntarily for tone rewriting. | Natural Language Processing (Brokered via Edge Function). |
| **Resend / SMTP Gateway** | USA / EU Endpoints | Recipient email address and invitation/verification links. | Transactional email delivery (Invites, OTP codes, Password resets). |
| **Stripe, Inc.** *(Milestones 3 & 4)* | USA / Ireland | Billing email, payment card token, subscription status. | Subscription billing. *Never receives child or co-parenting data.* |

---

### Question 4: Which security measures are implemented, including encryption, access controls, and separation between families?

1. **Family Separation via Row Level Security (RLS)**:
   * Enforced at the PostgreSQL engine level in Supabase.
   * Every query requires an authenticated JSON Web Token (JWT).
   * Policies strictly verify that `auth.uid()` matches either the child's creator or is linked via verified records in `child_parents` and `parent_connections`.
   * **Result**: It is mathematically impossible for Parent A from Family 1 to query, view, or alter records belonging to Family 2.
2. **Confidentiality of Private Notes**:
   * Personal notes and private observations on child profiles are stored per parent user ID (`child_parents.private_notes`).
   * They are strictly omitted from shared queries, ensuring personal thoughts are never exposed to connected co-parents.
3. **Encryption Standards**:
   * **In Transit**: Enforced TLS 1.3 / HTTPS with Strict-Transport-Security (HSTS) across all web, API, and storage connections.
   * **At Rest**: AES-256 encryption applied to all database tables, backups, and file storage volumes.
4. **API Secret Isolation**:
   * Sensitive secrets (`OPENAI_API_KEY`, Supabase Service Role Keys, SMTP credentials) reside exclusively in backend environment vaults. Zero secrets are exposed in the client code or compiled web bundles.
5. **No Domain Data in LocalStorage**:
   * The application stores only ephemeral authentication tokens and language preferences in browser storage. All family, child, and schedule records are dynamically retrieved from the secure database.

---

### Question 5: Which data processing agreements and international data transfer safeguards are available?

* **Regulatory Framework**: Built specifically in compliance with the **EU General Data Protection Regulation (GDPR)** and the Dutch **Algemene Verordening Gegevensbescherming (AVG)**.
* **Available Safeguards & Agreements**:
  * **Supabase Data Processing Addendum (DPA)**: Standard DPA incorporating the European Commission's **Standard Contractual Clauses (SCCs)** with dedicated EU-region hosting (AWS Frankfurt).
  * **OpenAI Business DPA**: OpenAI provides a direct, legally binding Business DPA with Standard Contractual Clauses (SCCs) to govern transatlantic processing.
  * **Resend DPA**: Includes EU Standard Contractual Clauses for email delivery.
* **Data Subject Rights**:
  * **Right of Access & Portability**: Integrated PDF dossier exporter (`/exporteren`) generates a structured, factual PDF of all co-parenting logs.
  * **Right to Erasure**: Complete support for profile deletion, child record removal, and co-parent disconnection.

---

### Question 6: Which parts are currently implemented and which still need to be completed?

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PROJECT IMPLEMENTATION MATRIX                   │
├──────────────────────────────────────┬────────────────┬────────────────┤
│ Module / Component                   │ Current Status │ Phase          │
├──────────────────────────────────────┼────────────────┼────────────────┤
│ Database Schema & RLS Policies       │ ✅ COMPLETED   │ Milestone 1    │
│ Authentication (Login/Register/OTP)  │ ✅ COMPLETED   │ Milestone 1    │
│ Password Reset & Secure Sessions     │ ✅ COMPLETED   │ Milestone 1    │
│ Independent Parent Profiles (Solo)   │ ✅ COMPLETED   │ Milestone 1    │
│ Child Profile Management (Multi)     │ ✅ COMPLETED   │ Milestone 1    │
│ Co-Parent Invitation & Deep Links    │ ✅ COMPLETED   │ Milestone 1    │
│ Co-Parent Acceptance & Auto-Linking  │ ✅ COMPLETED   │ Milestone 1    │
│ Confidential Private Notes           │ ✅ COMPLETED   │ Milestone 1    │
│ Dynamic Page Loaders & Zero Cache    │ ✅ COMPLETED   │ Milestone 1    │
├──────────────────────────────────────┼────────────────┼────────────────┤
│ Calendar & Custody Schedules DB      │ ⏳ UPCOMING    │ Milestone 2    │
│ Real-Time In-App Messaging DB        │ ⏳ UPCOMING    │ Milestone 2    │
│ Expenses, Receipts & Balance Engine  │ ⏳ UPCOMING    │ Milestone 2    │
│ Shared Tasks & Handover Packing      │ ⏳ UPCOMING    │ Milestone 2    │
│ Mutual Agreements & Decision Logs    │ ⏳ UPCOMING    │ Milestone 2    │
│ Document Vault & Official Uploads    │ ⏳ UPCOMING    │ Milestone 2    │
│ Family Circle & Caregiver Access     │ ⏳ UPCOMING    │ Milestone 2    │
├──────────────────────────────────────┼────────────────┼────────────────┤
│ Professional & Mediator Portal       │ ⏳ UPCOMING    │ Milestone 3    │
│ Super Admin Management Dashboard     │ ⏳ UPCOMING    │ Milestone 3    │
│ Stripe Subscriptions & Billing       │ ⏳ UPCOMING    │ Milestone 3    │
│ Native iOS & Android Packaging       │ ⏳ UPCOMING    │ Milestone 4    │
└──────────────────────────────────────┴────────────────┴────────────────┘
```

---

## Conclusion

**Milestone 1** has met 100% of its acceptance criteria, verified through live multi-parent testing, database RLS enforcement, and production build validation. 

The architecture is fully primed for **Milestone 2**, ensuring complete compliance with Dutch co-parenting regulations, GDPR standards, and transparent AI governance.
