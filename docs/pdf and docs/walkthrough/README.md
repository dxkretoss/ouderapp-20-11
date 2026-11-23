# Ouderschap & Co: Technical Walkthroughs & Architecture Index

This directory contains the definitive technical specifications and architectural walkthroughs for **Ouderschap & Co**, synthesized directly from the three client packages in `docs/ouderapp_docs/`:

---

## 1. Documentation Index & Package Mapping

| Document | Source Package | Core Topic & Contents |
| :--- | :--- | :--- |
| **[catootje11-attachments-analysis.md](file:///d:/ouderapp_new/docs/walkthrough/catootje11-attachments-analysis.md)** | `catootje11-attachments/` | **Visual Design, UI Screens & Card Content:** <br>• Complete walkthrough of all 27 app screens (Screens 001–025, 16b, 17b). <br>• The 10 prioritized features (Must vs. Should). <br>• Complete catalog of all 40 situation cards across 6 topics. <br>• Screen 004 deprecation and Screens 013–025 canonical layout reference. |
| **[catootje11-attachments-1-analysis.md](file:///d:/ouderapp_new/docs/walkthrough/catootje11-attachments-1-analysis.md)** | `catootje11-attachments_1/` | **AI Companion, Calming Tools & Localization:** <br>• `How-Co-talks-to-parents.pdf`: 4 modes, 3-step anatomy, 18 rules, system prompt. <br>• `Co-kalmerende-functies.xlsx`: 5 behavioral tools (*Schrijf het van je af*, delay-send, etc.). <br>• `Co-50-situaties.xlsx`: 50 co-parenting scenarios & BIFF/EAR writing engine. <br>• `Co-testlijsten-moeilijke-vragen.xlsx`: 50 adversarial/family test cases. <br>• `Lastige-momenten-zoekwoorden.xlsx`: 6/3/1 search algorithm & anger triggers. <br>• `Standaardteksten-Ouderschap-en-Co.xlsx`: 230 new November 2026 UI strings. |
| **[catootje11-attachments-2-analysis.md](file:///d:/ouderapp_new/docs/walkthrough/catootje11-attachments-2-analysis.md)** | `catootje11-attachments_2/` | **Final Engineering Answers for Kretoss:** <br>• `Co-and-Lastige-momenten-for-Kretoss.pdf`: Q5 answers, 3 time horizons, pocket haptics. <br>• `Kosten-workflow-Kretoss-v3.pdf`: Q4 answers, 16-step finance flow, no fixed 50/50, external IBAN pay. <br>• `Layout-and-style-guide-Kretoss.pdf`: Style A6 leading tokens, 6 earthy child colors, Nunito & Lora pairing. <br>• `Wisselmoment-workflow-Kretoss-v2.pdf`: 11-step handover cycle & automated 48h packing checklist. |

---

## 2. Core Architectural Pillars

```mermaid
graph TD
    subgraph UI & Design (Style A6)
        Gradient[Sage to Sand Background Gradient]
        Glass[Glass Containers: 62% White, 18px Blur]
        ChildColors[6 Fixed Earthy Child Colors - No Turquoise]
        Nav[Floating Pill Navigation Bar - Height 68px]
    end

    subgraph AI & Behavioral Calming (Co)
        Prompt[Co: Warm Coach Persona - ik/je]
        ThreeStep[Reflect -> 1 Question -> Idea only when asked]
        BIFF[BIFF & EAR Message Rewriting]
        CalmTools[Sensory Breathing & Pocket Haptics]
        Safety[Hardcoded Safety Copy: 112 / 0800-2000 / 113]
    end

    subgraph Operations & Legal Guardrails
        Legal[Het ouderschapsplan blijft leidend]
        Handover[48h Automated Packing Checklist]
        Costs[Kosten: 3 Modes, Grensbedrag, External IBAN Pay]
    end

    Gradient --> Prompt
    Glass --> Handover
    ChildColors --> Costs
    Prompt --> Safety
    Legal --> Handover
    Legal --> Costs
```
