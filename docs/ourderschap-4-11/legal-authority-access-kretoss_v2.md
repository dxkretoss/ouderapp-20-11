# Legal authority and access control — handover for Kretoss

Date: 29 October 2026

Revision 2: parent-facing requirements and an explicit product/legal decision register added. This remains the single handover specification; earlier downloadable copies are superseded.

## Purpose and scope

Implement secure access for parents, caregivers and professionals without rebuilding existing family records or creating a second permission system. This document describes required work, not a completed security implementation. No backend or application behaviour was changed for this handover.

**Current gap:** the parent branch of the shared visibility helper allows both demo parents to see all shared family information. It does not restrict a parent based on legal authority. Local UI checks are not protection for real family data.

## Existing code to reuse

| Source | Current responsibility / limitation |
| --- | --- |
| `src/lib/gezag-store.ts` | Demo legal-authority information per child, including a `bevestigd` flag. Neither demo values nor that flag are proof of legally verified authority. |
| `src/lib/start-store.ts` | Own-family records and self-reported authority. Self-reporting must not grant access. |
| `src/lib/kring-store.ts` | Existing people, child links, invitation/access distinction and scoped permissions. Practical role, legal role and app access are separate concepts. |
| `src/lib/export-rechten.ts` | Shared visibility/export policy entry point. `magBron()` currently returns `true` for parents; `magKind()` also permits parents without child filtering and `vroegste()` has no parent date restriction. Replace these blanket assumptions with authenticated, scoped decisions. |
| `/uitnodiging` and `/verzorger` | Existing invitation flow and simplified caregiver interface. A contact record or invitation link alone must never grant access. |
| Existing professional permissions and journal | Separate professional access and private notes; do not replace them with parent or circle permissions. |

The shared helper currently covers selected shared data sources, not a complete production authorisation layer. Audit every screen and data path, including health information and photos; do not assume changing one helper secures the whole app.

## 1. Establish the policy before enabling real access

Legal authority (`gezag`) is not the same as parenting, contact arrangements, information rights or permission to use this app.

- Do not implement either blanket rule: “parent = access to everything” or “no authority = access to nothing”.
- A parent without authority may still have information rights. Have the product owner and a qualified Dutch legal/privacy adviser approve the policy and any applicable restrictions before implementation. Do not let one parent's self-reported choice settle this.
- Approve a matrix per child and data section that distinguishes **read**, **create/propose**, **edit**, **consent/approve** and **export**. Seeing information does not imply authority to decide.
- Cover joint authority, sole authority, guardianship, unknown/unverified authority, disputed records and relevant legal restrictions.
- Unknown or disputed authority must not create new privileges. Use an authorised review process; preserve only access that already has an independently valid basis.

The product decision about exactly what a parent without authority can see has **not yet been made**. This document does not prescribe automatic exclusion from medical information or any other section.

### Decision ownership — Kretoss must not determine legal entitlements

The product owner defines the proposed policy and obtains qualified Dutch legal/privacy review. Kretoss implements the approved policy, flags ambiguities and documents technical constraints; it must not choose which rights a parent without authority receives. Neither a developer-selected default nor an access profile is a legal determination.

Record each decision against the existing section/action scope with: proposed rule, legal basis/restrictions, approval owner, reviewer, approval date, policy version, effective period and implementation/test reference. The questions below are **open**, not permission grants. No section-specific legal outcome is approved by this document.

### Open product/legal decisions

| Topic | Decision required before implementation | Status |
| --- | --- | --- |
| School information | May a parent without authority view school appointments, reports, messages and attachments? Which fields, children and history periods are permitted, and who may propose changes? | Open — product decision and legal/privacy review |
| Health information | Which medical details, medication, emergency information and health attachments may each parent view? What lawful limits apply, including confidentiality and applicable age-related rules without creating child accounts? | Open — product decision and legal/privacy review |
| Medical decisions | Who may propose, record or approve a medical decision in each authority situation? Is one or more approval required, how are guardians/restrictions handled, and when is an in-app response insufficient evidence of legally valid consent? | Open — product decision and legal/privacy review |
| Planning and contact arrangements | What schedule, handover and attendance information may a parent without authority see or propose? Which changes require agreement and from whom? Contact arrangements must not imply authority. | Open — product decision and legal/privacy review |
| Costs and budgets | Who may view expenses/receipts, propose allocations, approve budget agreements or export financial details? Distinguish app approval from an existing payment obligation. | Open — product decision and legal/privacy review |
| Documents and child images | Which document types and images can be viewed, uploaded, edited or downloaded, and over which periods? Who may authorise sharing? | Open — product decision and legal/privacy review |
| Parent communication | Which existing conversations and history are accessible, including after a changed relationship or permission? Keep private drafts and Co conversations separate. | Open — product decision and legal/privacy review |
| Authority verification/disputes | Who may report, acknowledge, independently verify, correct and review authority? What evidence is necessary, who may inspect it, and what happens while a dispute is reviewed? | Open — product decision and legal/privacy review |
| Access changes and transparency | Who may request, approve, restrict or restore access, with what notification and review/appeal process? Which permission metadata about the other parent can safely be shown? Define any lawful urgent restriction procedure explicitly. | Open — product decision and legal/privacy review |
| History, exports and retention | What past information remains accessible after a change, what may be exported, and what retention periods apply to evidence and access logs? Downloads already received cannot be recalled. | Open — product decision and legal/privacy review |
| Profiles and future sections | Approve the concrete section/action matrix for each proposed profile and define who reviews new features before granting access. | Open — product decision and legal/privacy review |

Apply the register per child, not just per family. A rule approved for one child or purpose does not automatically apply to another child, section, export or professional.

## Parent-facing experience — proposed additions, not implemented

### “Gezag en toegang” / Parental Authority & Access

Proposed navigation: **Menu → Kinderen → [Child] → Gezag en toegang**. Integrate with the existing child and authority flows; do not create a second child profile or relationship record.

For the selected child, parents should be able to see:

- The declared authority situation: joint authority, sole authority, guardianship, unknown/unverified authority, disputed authority, or relevant legal restrictions/exceptional arrangements.
- Separate provenance labels: **reported by a parent**, **acknowledged by both parents**, **independently verified**; dispute/review status is explicit. Acknowledgement is not independent legal verification.
- Their own effective access, the approved-to-display access summary for the linked co-parent, validity periods and pending changes. This summary must not disclose restricted content, confidential evidence or protected restriction details.
- A plain-language distinction between legal authority, app permissions and authority to approve a decision. An app status is not proof of legal consent.

Show sections in a compact access overview with the relevant actions: **No access / View / Create or propose / Edit / Consent or approve / Export**. These are separate capabilities, not an ascending access ladder: view does not imply edit, approve or export. Keep detailed checks in the existing policy model; the parent screen is only a readable projection of effective server decisions.

### Suggested profiles — for review and customisation only

| Proposed profile | Purpose | Permission status |
| --- | --- | --- |
| Joint parental authority | Review the appropriate arrangement for parents with joint authority. | No section/action defaults approved |
| Sole authority with a co-parent who has contact arrangements | Review information access and practical coordination separately from decision-making authority. | No section/action defaults approved |
| Limited access arrangement | Review precisely scoped children, sections, actions, dates and applicable restrictions. | No section/action defaults approved |
| Custom access | Review a tailored arrangement using the same existing permission dimensions. | No section/action defaults approved |

Profiles are proposed review aids, not automatic legal entitlements. Do not populate or activate them with invented rights. Their exact matrices must be approved through the decision register. Applying a reviewed profile must use existing scoped grants, not a separate profile-based authorisation engine.

### Changes, notification and review

- Let parents report authority information and request corrections/access changes through the existing family/child relationships. Do not equate a request with an effective change or verified evidence.
- Show current effective rights separately from a pending request, its review status and the outcome. Notify only authorised recipients with safe metadata; notification content must not leak legal evidence or protected details.
- Define the approved reviewer and escalation route before activation. Self-reporting never grants extra access or removes another person's existing legitimate access. One parent's acknowledgement alone is not sufficient to determine another's legal entitlements.
- Activate changes only through the approved policy and review procedure, with an effective date and protected audit event. Preserve the established revocation/expiry protections and any separately approved urgent restriction process.
- Shared history contains only information approved for that audience, never sensitive legal evidence, private notes or confidential review material.

### New functionality

Every new feature/data section must be mapped to the same existing access-control model, reviewed in the decision register and tested before release. New sections must not automatically become visible to all linked parents or inherit rights merely because a role/profile exists. Unreviewed sections grant no new access.

## Delivery status — distinguish existing, specified and proposed

| Category | Scope | Status |
| --- | --- | --- |
| Already present in the Lovable prototype | Authority display/self-report, child/person relationships, local circle rights, invitation demo, caregiver interface, professional scopes and shared visibility/export helper listed above. | Source-inspected prototype; not verified production security. |
| Previously specified, requires backend implementation | Authenticated family links, scoped server checks, verified invitation acceptance, protected storage, file delivery, revocation and audit/testing requirements in this handover. | Requirements documented; implementation/deployment not verified. Local UI behaviour is not server enforcement. |
| New clarifications/proposed additions in revision 2 | Per-child “Gezag en toegang” screen, transparent capability overview, provenance/review labels, suggested profiles, change-review experience and future-section gate. | Handover proposals only; no screen, profile or review workflow built in this revision. |
| Legal/privacy decisions requiring approval | All questions in the open decision register, concrete permission matrices, lawful restrictions, verification, review ownership and retention. | Open; product owner and qualified reviewer must approve. Kretoss must not decide these. |

Use the concrete source references above as integration points. The handover extends existing functionality and its policy boundary, not a request for a new permission system. Backend implementation may require extending the existing relationships and grants; it must not copy child-parent records or maintain competing sources of truth.

## 2. Authenticate and verify relationships

- Use real, distinct accounts and verify membership of the specific family and relationship to the specific child on the server.
- Reuse existing family, child, person and invitation relationships. Map demo identifiers to authenticated identities; never trust a browser-supplied parent ID.
- Bind invitation acceptance to the intended authenticated person. Check expiry, withdrawal and replay; acceptance is not an automatic grant of every section.
- Store legal-authority provenance and verification status against the existing person–child relationship: who reported it, when, the approved verification outcome, effective dates and applicable restrictions. Use minimal protected evidence if needed, with a reviewed retention policy.
- Keep self-reported, jointly acknowledged and legally verified states distinct. No one may grant themselves rights by editing a profile, role, local storage or authority field.

## 3. Enforce one scoped access policy server-side

- Extend the existing permission model instead of introducing a parallel “parents without authority” list or copied family records.
- Evaluate authenticated identity, family, child, section, action, validity period, approved legal basis and relevant restrictions. No matching valid grant means denial of that request.
- Enforce decisions in database access rules and every server read/write/export/file endpoint. UI hiding is only presentation; the browser must never receive forbidden data first.
- Check record ownership and scope on every request, including direct URLs and changed IDs. Never use a privileged database client to bypass ordinary user permissions.
- Update the shared `export-rechten.ts` integration so normal views and exports use the same effective permissions. A PDF, search result or summary must not reveal more than its viewer can normally access.
- Apply policy to lists, details, counts, previews, notifications, reminders, history, attachments, health fields, child images, search, realtime subscriptions, caches and AI context. Return only authorised fields; even titles and counts can disclose information.
- Secure files in private storage. Issue short-lived file access only after checking current permission; remove public URLs and ensure withdrawn access cannot obtain renewed links. Previously downloaded information cannot be recalled.
- Re-evaluate access after expiry, verified authority changes or revocation. Invalidate open views and cached data, unsubscribe from protected updates and stop future reads/writes/exports. Do not silently delete history or alter agreements, schedules or payments.

## 4. Preserve existing privacy boundaries

- Personal agenda details, private drafts, private moments, personal safety notes and professional private notes stay outside shared access and exports.
- Caregivers keep their own simplified, permission-based interface; practical roles never grant rights.
- Professional access remains separate, scoped to family, child, section and period. Access to a factual coordination overview must not imply access to message content or Co conversations.
- Professional access to parent conversations remains unavailable until its protected sources and required separate consents are implemented. Follow the existing communication handover; do not simulate consent or add pattern analysis.
- Co must receive only context explicitly authorised for that caller and purpose. Authority or professional status does not automatically authorise AI use or sending message content.
- No child accounts. No new safety/signalling or MASIC demonstration.

## 5. Audit and acceptance tests

Maintain protected, append-only records of verified authority changes, grants, revocations and sensitive access/export actions using server time and authenticated actors. Do not put private content or legal evidence into shared family history. Define retention and who can review these logs.

Before release, test with distinct authenticated accounts and actual server responses:

1. Two parents with joint authority receive only their approved shared access; neither sees the other's private data.
2. A parent without authority can read precisely the sections approved in the matrix, and cannot approve decisions or edit sections without the separate required permission.
3. Self-reporting or changing an authority/role field cannot escalate access.
4. Unknown/disputed authority creates no new rights; the approved review flow is used.
5. Expired, withdrawn, replayed or unaccepted invitations provide no protected access.
6. A caregiver sees only authorised children, sections, fields and periods.
7. A professional sees only the authorised scope, never private notes belonging to others or parent conversations without their separate conditions.
8. Changing family/child/record IDs, requesting files directly, or calling read/write/export endpoints outside the UI cannot bypass restrictions.
9. Revocation/expiry blocks new access, realtime delivery, exports and file-link renewal, including in an already-open session.
10. Screen, search, notification, history, PDF and AI-context access agree. Denied content is absent from network responses and caches, not merely hidden visually.
11. Permission changes do not silently approve proposals, change schedules, remove expenses or mark payments received.
12. The proposed parent access overview matches actual server permissions for each child, section and action, without exposing restricted evidence or private content.
13. Reported, acknowledged, verified, disputed and pending states are distinct; a pending change cannot modify effective rights by itself.
14. Profiles cannot activate unapproved rights, and a newly added section grants no access until its explicit policy is approved and implemented.

## Delivery gates and current verification

- **Product/legal prerequisite:** an approved section/action matrix, verification procedure, handling of disputes/restrictions and retention rules.
- **Kretoss implementation:** authenticated relationships, protected shared storage, server-enforced access, private file delivery, revocation and audit records.
- **Release prerequisite:** passing cross-account, cross-family and private-data security tests against the deployed implementation.

This handover is based on source inspection. No production account settings, hosted access rules, legal documents or two-account security flows were verified, and no backend changes were made. Do not treat the demo as safe for sensitive real family data until these gates are met.

Related handovers: `docs/open-proposals-kretoss-backend.md` (proposals and reminders) and `docs/professionals-communicatie.md` (additional professional communication conditions, currently in Dutch).