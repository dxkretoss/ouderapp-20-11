# Belongings, Handovers, Agreements, Decisions & Proposals: Architecture & Implementation Guide

This document details the technical architecture, data flows, state models, and code locations for core co-parenting systems in **Samen Ouders Nu**:
1. **Belongings & items needed for handovers** (*Spullen meenemen & overdrachtslijsten*)
2. **Handovers and handover execution** (*Overdrachten, wisselmomenten & halen en brengen*)
3. **Agreements, decisions, and proposals with PENDING lifecycle** (*Afspraken, beslissingen, openstaande voorstellen & gezamenlijk gezag*)

---

## 1. Executive Summary

All three feature domains **exist and are actively implemented** in the codebase:
- **Belongings / Items needed for handovers**: Managed through a 3-tier classification model (`mee`, `vast`, `dubbel`) in `src/lib/taken-store.ts`, dynamically generated checklists (`SlimmeMeeLijst.tsx`), smart routine-based predictions (`src/lib/slimme-hulp.ts`), dedicated item inventory pages (`src/routes/spullen.tsx`), and caregiver checklist access (`src/routes/verzorger.tsx`).
- **Handovers and related agreements**: Managed across dedicated handover preparation and execution screens (`src/routes/overdracht.tsx`, `src/routes/wissel.tsx`, `src/routes/halen-brengen.tsx`), backed by custody proposals (`src/lib/zorg-store.ts`) and a formal agreements framework with a dedicated `"Halen & brengen"` category (`src/lib/afspraken-store.ts`).
- **Agreements, Decisions & Proposals (PENDING)**: Implemented as a cross-cutting proposal and consent engine. Proposals span **6 source domains** aggregated via `src/lib/openstaande-voorstellen.ts` with explicit pending states (`wacht-op-jouw-reactie`, `wacht-op-reactie`, `meer-tijd-gevraagd`, `tegenvoorstel-ontvangen`, `reactiedatum-verstreken`), presented in `src/routes/samen-regelen.tsx`, formal co-parenting decisions in `src/routes/beslissingen.tsx` governed by legal authority (`src/lib/gezag-store.ts`), and bilateral agreements in `src/routes/afspraken.tsx`.

---

## 2. Belongings / Items Needed for Handovers

### A. Core Data Model (`taken-store.ts`)
Each item (`Spul`) has a clear lifecycle and ownership model:

```typescript
export type SpulType = "mee" | "vast" | "dubbel";

export type Spul = {
  id: string;
  naam: string;
  kind: string;               // e.g. "emma" | "noah" | custom child ID
  type: SpulType;             // "mee", "vast", or "dubbel"
  plek?: "sanne" | "joris" | string; // location when type === "vast"
  wie?: string;               // person responsible
};
```

#### The 3 Types of Belongings:
1. **`"mee"` (Wisselt mee)**:
   - Items that travel between homes with the child (e.g., cuddly toy `Knuffel`, school tablet, specific medical devices).
   - **Crucial Rule**: Items marked as `"mee"` are automatically populated into the handover packing list (`meeLijst`) for any handover moment involving that child.
2. **`"vast"` (Vaste plek)**:
   - Belongings that remain at a designated place (e.g., football boots kept at Dad's, bicycle at Mom's, school locker items).
   - These do **not** clutter the handover checklist unless an upcoming calendar event indicates they are needed at the other location.
3. **`"dubbel"` (In beide huizen)**:
   - Duplicated items kept in both households (e.g., toothbrush, pyjamas, basic toiletries).
   - Never shown on transfer lists because neither parent needs to pack them.

### B. Dynamic Overdrachtslijst Calculation
The handover packing list is resolved dynamically by `meeLijst(m: Moment)` in `src/lib/taken-store.ts`:

```typescript
export function meeLijst(m: Moment) {
  // 1. Items assigned to this specific handover moment
  // 2. All items of type 'mee' registered for the involved children
  const auto = state.spullen
    .filter((s) => s.type === "mee" && m.kindIds.includes(s.kind))
    .map((s) => s.naam);
  const weg = state.weg[m.id] ?? [];
  return [...new Set([...m.mee, ...auto, ...(state.extraMee[m.id] ?? [])])]
    .filter((x) => !weg.includes(x));
}
```

Parents can dynamically add one-off items (`voegMeeToe`) or dismiss items (`haalMeeWeg`). Toggling items as packed is tracked in `src/lib/kring-store.ts` (`meeKlaar: Record<string, string[]>`) and `src/lib/wissel-store.ts` (`toggleMeeneem`).

### C. Predictive Item Intelligence (`slimme-hulp.ts`)
The function `mogelijkMee(m: Moment)` in `src/lib/slimme-hulp.ts` inspects:
- **Upcoming calendar activities** between the handover moment and the next handover (e.g., Saturday swimming lesson -> swim bag).
- **Weekly recurring routines** (`src/components/VasteRoutines.tsx`), such as Monday gym class -> gym bag.
- **Location mismatches**: If an item is marked as `"vast"` at Sanne's home, but Noah has a soccer match while at Joris's home within 3 days, `regelSpullen` warns the parents proactively.

These items surface in the UI under **"Wellicht nodig"** inside `SlimmeMeeLijst.tsx` with a 1-click **"Toevoegen"** button.

### D. Belongings UI Screens
1. **`/spullen` (`src/routes/spullen.tsx`)**:
   - Grouped lists: *Moet mee*, *Vaste plek*, *In beide huizen*.
   - Item creation and location management modal.
   - Preconfigured packing lists: *Weekend*, *Vakantie*, *Sportdag*, *Schoolreisje*.
   - Return list: *"Niet vergeten: Wat terug moet naar het andere huis"* (e.g., library book, winter coat).
   - Weekly routine belongings overview.
2. **Caregiver Access (`/verzorger`, `src/routes/verzorger.tsx`)**:
   - Grandparents and babysitters with `spullen: "bekijken"` or `spullen: "bijdragen"` permissions see the exact items that need to accompany the child during pickup/dropoff and can check them off.

---

## 3. Handovers & Handover Execution

### A. Handover Execution & Context Sharing (`/overdracht`)
Location: `src/routes/overdracht.tsx`

The handover view allows parents to pass crucial context to the other parent at exchange moments:
- **"Wat is er nieuw voor {kind}?"**: Automatically queries the central audit log (`src/lib/audit-store.ts`) for items updated since the last handover (e.g., changes in medication, new belongings, or modified appointments). The parent can check a box to append them to the handover note.
- **Child Well-being Signals**:
  - Mood (`stemming`): Vrolijk, Rustig, Moe, Wat stil, Verdrietig.
  - Sleep quality (`slaap`): Goed, Wisselend, Onrustig.
  - Focus points (`onderwerpen`):
    - Young children: *Slaap, Voeding, Gezondheid, Medicatie, Spullen mee, Knuffel / troost*.
    - Older children: *School / huiswerk, Spullen mee, Medicatie, Emoties, Sport / hobby, Afspraken*.
- **"Ook het mooie delen"**: Prompts the parent to share positive highlights (e.g., proud moments, fun achievements).
- **"Na het wisselmoment: overgang"**: Records how the transition went for the child (*Soepel*, *Even wennen*, *Lastig*).
- **"Terugblik" Tab**: A private, non-judgmental historical archive showing trends across previous handovers.
- **Embedded Components**:
  - `SlimmeMeeLijst` for items.
  - `OnderwegStatus` for transit broadcast.
  - `IkBenLater` for delay alerts.

### B. Handover Pickup, Dropoff & Arrival Tracking (`/halen-brengen`)
Location: `src/routes/halen-brengen.tsx`

- **Handover Phases (`faseVan`)**:
  - `later` (> 24 hours away)
  - `binnen24` (within 24 hours)
  - `vandaag` (same calendar day)
  - `voorbij` (past)
- **Privacy-First Arrival Confirmation**:
  - Parents tap **"Aankomst bevestigen"**.
  - **No continuous GPS tracking**: Only records the identity, timestamp, and handover event into `checkins`.
- **Transit Broadcasts**:
  - One-tap status updates: *"Sanne is onderweg voor de overdracht van 14:30 uur."*
  - Direct connection to handover agreements: Links directly to `/afspraken` under *"Afspraken over halen en brengen"*.

---

## 4. Handover-Related Agreements

### A. Dedicated Category: `"Halen & brengen"`
Location: `src/lib/afspraken-store.ts`

The app maintains a single source of truth for co-parenting agreements, with `"Halen & brengen"` defined in `ONDERWERPEN`.

### B. Built-In Handover Agreements in Code
The codebase ships with concrete agreements governing handovers and belongings:
- `a1` **Overdracht via school**
- `a3` **Overdracht blijft praktisch**
- `v1` **Overdracht op neutrale plek**
- `a2` **Wijzigingen op tijd vragen**
- `f1` **Omgangsregeling**
- `x2` **Gymspullen reizen mee**
- `x3` **Voetbal op zaterdag**

---

## 5. Agreements, Decisions, and Proposals: The PENDING Lifecycle

The co-parenting application strictly guarantees that **nothing shared ever changes silently or automatically**. Any proposed modification to agreements, care distribution, formal child decisions, or budgets enters a **PENDING** state until both parents have explicitly consented.

### A. Agreements (`Afspraken`) & Pending Proposals
- **Source Store**: `src/lib/afspraken-store.ts`
- **UI Route**: `src/routes/afspraken.tsx`

### B. Formal Decisions (`Beslissingen` / `Besluiten`) & Legal Custody (`Gezag`)
- **Data & Decision Store**: `src/lib/besluiten-data.ts`, `src/lib/gezag-store.ts`
- **UI Route**: `src/routes/beslissingen.tsx`

### C. The Central Proposal Aggregator (`openstaande-voorstellen.ts`)
Location: `src/lib/openstaande-voorstellen.ts`
Queries all **6 proposal sources**:
1. `zorg`: Schedule, swaps, and extra night proposals
2. `afspraak`: Agreement proposals and updates
3. `budget`: Financial allocations and expenditure limits
4. `vakantie`: Holiday and vacation proposals
5. `kost`: Single shared cost declarations
6. `aanwezigheid`: School/event attendance coordination

### D. Central Proposal Hub UI (`/samen-regelen`)
Location: `src/routes/samen-regelen.tsx`

---

## 6. Complete File & Component Directory

| Domain | File Path | Key Functions & Components |
|---|---|---|
| **Belongings Store** | `src/lib/taken-store.ts` | `meeLijst()`, `voegMeeToe()`, `haalMeeWeg()`, `zetSpul()`, `voegSpulToe()`, `SpulType` (`mee`, `vast`, `dubbel`) |
| **Belongings Page** | `src/routes/spullen.tsx` | `Spullen`, `EigenSpullen`, `SpulDetail`, `PlekKeuze`, `NieuwSpul`, `paklijsten` |
| **Smart Checklist** | `src/components/SlimmeMeeLijst.tsx` | `SlimmeMeeLijst` component with `"Wellicht nodig"` predictive section |
| **Predictive Engine** | `src/lib/slimme-hulp.ts` | `mogelijkMee()`, `regelSpullen()` (item location mismatch detection) |
| **Routines** | `src/components/VasteRoutines.tsx` | Weekly recurring items (gym, swimming, library books) |
| **Handover Store** | `src/lib/wissel-store.ts` | `meeneemLijst`, `toggleMeeneem()`, `beginOverdracht()`, `markeerOverdrachtIngevuld()` |
| **Handover Flow** | `src/routes/overdracht.tsx` | `Overdracht` (Meegeven & Terugblik tabs, mood/sleep/topic check-in, audit detection) |
| **Handover Prep** | `src/routes/wissel.tsx` | Packing checklist, day exchange (`ruil`), extra night (`nachtje`) requests |
| **Pickup / Dropoff** | `src/routes/halen-brengen.tsx` | `faseVan`, privacy-friendly `Aankomst bevestigen`, link to handover agreements |
| **Agreements Store** | `src/lib/afspraken-store.ts` | Agreements model, `"Halen & brengen"` topic, agreements `a1`, `a3`, `v1`, `x2`, `x3`, `nodig()`, `wachtOpMij()` |
| **Agreements UI** | `src/routes/afspraken.tsx` | Agreement proposals, `"Jouw aandacht"` section, bilateral acceptance, withdrawal, version history |
| **Decisions Data** | `src/lib/besluiten-data.ts` | Decision models, `start` mock decisions with PENDING (`"In afwachting"`) status |
| **Decisions UI** | `src/routes/beslissingen.tsx` | Major decisions (*Schoolkeuze, Medisch, etc.*), joint approval workflow, decision logbook |
| **Legal Custody** | `src/lib/gezag-store.ts`, `src/routes/gezag.tsx` | Custody settings (`gezamenlijk`, `ouder1`, etc.), right to approve decisions (`magOuder`) |
| **Proposals Engine**| `src/lib/openstaande-voorstellen.ts` | Multi-store aggregator, `AfstemStatus` (all PENDING variations), `datumVerstreken()`, `telling()` |
| **Proposal Hub UI** | `src/routes/samen-regelen.tsx` | Central overview: *"Wacht op jouw reactie"*, *"Mijn voorstellen"*, reminder triggers |
| **Caregiver View** | `src/routes/verzorger.tsx` | Simplified UI for circle members to inspect and check off handover belongings |
| **Professional Tab**| `src/components/pro/AfstemmingTab.tsx` | Objective proposal metrics for family coaches |
| **Withdrawal Modal**| `src/components/VoorstelIntrekken.tsx` | Shared confirmation modal for irreversible proposal cancellation with history retention |

