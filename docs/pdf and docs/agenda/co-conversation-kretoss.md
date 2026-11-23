# Co conversation update and secure integration

Co uses the existing verhaal chat and shared coPersoonlijkheid instructions. Modes are conversational preferences; current user intent takes precedence. Respond with brief acknowledgment where appropriate, verified relevant facts, one or two optional next steps and at most one question. Never adopt accusations as facts, decide who is right, diagnose, invent consent, send messages or apply schedule changes.

At most three known action IDs are accepted. Drafts are visible in the chat and open the existing message form for user review. Continue-talking and no-action choices continue the conversation. Source navigation remains in existing screens. No second assistant or proposal storage was added.

Demo context requires explicit consent and excludes messages and private data. Own-family context remains unavailable. Proposal statuses now come from the existing proposal aggregation and active agreements from afspraken-store, not hard-coded response statuses. Agenda events are not supplied: Co must say it cannot inspect them. Secure, relevant per-question context needs authenticated source reads and central export-rechten visibility enforcement in Kretoss. Do not treat device preferences or role labels as authentication or permission.

The existing AI model, streaming transport and request behavior are unchanged. No sensitive live-family testing was performed. No persistence on the server is added; optional device saving and external AI processing remain clearly disclosed. Kretoss must validate provider retention, protected account identity, permission boundaries and source selection before sensitive use.

## Verification

Ten fictional scenarios generated actual AI answers in the browser: changing handover times, venting, unavailable agenda, message drafting, four-week trial proposal, who is right, change from overview to emotional support, another parent's private data, accusations and automatic send. Answers remained neutral, and unavailable data/send abilities were not claimed. Tests ran without app-context consent. These are observations, not guarantees of future model output. Source consent and actual two-account access are not verified. Navigation, draft handoff and correction handling are additionally checked through the existing UI; real notification/correction delivery remains unavailable.