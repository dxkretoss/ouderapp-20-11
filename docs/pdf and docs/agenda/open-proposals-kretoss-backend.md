# Open proposals — what the Kretoss backend still has to deliver

English translation of `docs/openstaande-voorstellen-kretoss.md`. This file is the
authoritative one for the development team; the Dutch file stays for the product owner.

The frontend already shows the "Open proposals / Waiting for a reply" overview, fully
derived from the existing sources (care plan, appointments, budgets, holidays, one-off
costs, attendance). No second proposal system was built and no backend changes were made.

## What the frontend already does
- One overview on "Samen regelen" (co-ordination page): "Waiting for your reply" and
  "My proposals", with filters (Waiting for a reply / Reply received / Finished / All).
- Statuses: Waiting for a reply, More time requested, Counter-proposal received,
  Reply date passed, Agreed, Not agreed, Withdrawn, Finished.
- An optional, non-binding requested reply date on care and budget proposals
  (a request only; a passed date never changes anything automatically).
- A "More time needed" reply on care and budget proposals; the proposal stays open
  and no consent is implied.
- Friendly reminders, rate limited: at most 1 before and at most 1 after the reply date;
  can be paused in Settings (for example for safety or contact arrangements).
  Reminders are in-app only, not push notifications.
- Home shows "Everything is settled." when nothing is open.
- Professionals: a factual coordination overview (counts and statuses only, never a
  judgement about behaviour), visible only inside existing permissions (agenda / care plan).

## What Kretoss must build (not available yet)
1. **Two linked parent accounts**: replies, counter-proposals and reminders must really
   travel between two accounts. Today everything is demo/local only.
2. **Reminder delivery**: enforce the rate limit server side (max 1 before / 1 after the
   reply date), respect quiet hours, enforce the per-family pause for safety or contact
   arrangements, and write an audit log entry for every reminder.
3. **Access control**: professionals see the coordination overview only inside their
   own permissions per family / section / period. Never message content or private notes.
4. **Immutable history**: withdrawals, rejections and reminders stay visible. Nothing is
   deleted or silently overwritten.
5. **No silent agreement**: the backend must never change an appointment, a payment or a
   care plan because a reply date passed or because nobody replied.

## Where the data currently lives (frontend, device storage)
| Source | Module | Notes |
| --- | --- | --- |
| Care plan proposals | `src/lib/zorg-store.ts` | `reactieDatum?`, `meerTijd?`, `herinneringen?` added |
| Budget proposals | `src/lib/budget-store.ts` | `reactieDatum?`, `vraagMeerTijdBudget()`, `stuurBudgetHerinnering()` |
| One-off costs | `src/lib/kosten-akkoord.ts` | Akkoord / Ander voorstel / Niet akkoord, no auto payment |
| Attendance | `src/lib/aanwezigheid-store.ts` | one current proposal per appointment |
| Derived overview | `src/lib/openstaande-voorstellen.ts` | `verzamelVoorstellen()`, status mapping, `telling()` |
| Reminder rules | `src/lib/herinneringen.ts` | `magHerinnering()`, `herinneringTekst()` |
| Pause preference | `src/lib/voorkeuren-store.ts` | `herinneringenGepauzeerd` |

The derived overview is read-only: it never writes back to a source.

## Terminology (Dutch UI → English)
- Samen regelen → co-ordination page (`/samen-regelen`)
- Wacht op jouw reactie → Waiting for your reply
- Wacht op reactie → Waiting for a reply
- Reactie ontvangen → Reply received
- Afgerond → Finished
- Meer tijd nodig → More time needed
- Herinnering sturen → Send a reminder
- Rustig regelen → Calm coordination (the structured-reply feature)
- Zorgregeling → care plan
- Spaarpotjes → savings pots
- Noodkaart / Gezondheid → emergency card / health (one section)
