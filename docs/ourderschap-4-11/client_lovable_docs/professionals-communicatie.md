# Professional Communication: Integration Requirements

## Existing and Now Added
- Maintain one existing professional route, dossier workspace, professional permissions, journal, private notes, and task source.
- AI writing assistance exists, but does not produce reliable, permanent intervention events with a legal basis for professionals. Parent conversations are not securely linked to professional accounts.
- The existing overview now features active sample dossiers, missing communication metrics, and missing AI counts at the top. Unknown is never zero.
- One shared shielded communication component opens the existing dossier workspace from Home. It displays no messages, trends, snippets, diagnoses, or fictional signals.
- Consent information is available; no request is sent, no consent is simulated, and no local access right is added.
- Legacy hardcoded pressure metrics are no longer forwarded to the cockpit/dossier. Existing professional messages and work functions are retained; these are not inter-parent conversations.

## Blocking Integrations
There is no online account/parent linking or server authorization. The current environment remains an explicitly marked sample environment; existing local permissions provide no security for real client data.

1. Authenticate two separate parents and the specific professional. Verify family membership and active professional authorization on every server call. Roles are labels, not permissions. Reuse existing child/family relationships: do not create a second dossier registration.
2. Store consent requests server-side, with professional ID, organization, family ID, exact conversation IDs, history range, purpose, effective/end date, and separate recorded parent decisions. No pre-checked consent. Both valid consents AND active professional authorization are required. Rejection, withdrawal, or expiration blocks read access; re-requesting requires new explicit decisions.
3. Statistics and AI signals require separate purpose-specific authorization and a legal basis; access to content must not implicitly grant this. Do not load sensitive sources before the server check succeeds. No previews, exports, search results, summaries, or caches via side channels.
4. On every content, statistic, or export call, the server re-verifies scope, identity, decisions, and time window. URL or ID changes must never yield access to other families. Use RLS (Row-Level Security) plus handler checks. Invalidate revoked sessions for already opened views and caches; do not allow new data retrieval or reopening.
5. Use existing sent messages, in chronological order with sender and verified timestamp, read-only. Do not store or share drafts, original private versions, professional notes, or AI prompts for signaling purposes.
6. Add minimal metadata to the existing AI flow after the legal structure has been assessed: opaque intervention ID, family/conversation ID, timestamp, event (offered, viewed, modified, originally sent, verification unavailable). Count unique offered intervention IDs; viewed, opened, or repeated loads must not be counted again. No text hash as a derivable draft copy; no private text fields. A modification is not evidence that AI suggestions were adopted; record confirmed actions only.
7. Calculate communication metrics solely from actual sent, scoped messages with genuine dates. No trend without two complete, comparable periods. Repeated open coordination queries must only derive from existing reliable source statuses. Explicitly configure and evaluate any thresholds; no thresholds or diagnoses are currently added.
8. Secure, append-only consent and access logs with server clock and real actor identity. Professional follow-up and brief internal notes must use the existing pro journal store/actions, not a new list. Without available signals, do not display a fictional follow-up status.
9. Legal assessment prior to real-world deployment: GDPR (AVG), professional secrecy / confidentiality, legal ground per purpose, validity of consent in professional care contexts, retention schedules, duty to inform, deletion/retention, processor agreements, and risk of false-positive signals.

## Test Status
Browser verification pertains exclusively to the explicitly marked sample interface; this is not a security test with real accounts.
Not executable without the integrations outlined above: two independent parent consents, refusal, immediate revocation, unauthorized/direct URL tampering against server data, secure access logging, and deduplication of real AI events. No AI calls have been made for this dashboard.
Existing tests for internal notes and parent projections are rerun. The new component receives only dossier ID and name, with no sensitive content or signal source.