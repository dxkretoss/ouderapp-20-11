# DEVELOPER IMPLEMENTATION BRIEF

### Ouderschap & Co

### Project scope, milestone priorities, and implementation requirements


## 1. Project objective and working principles

Continue development using the client's existing Lovable source code as the foundation. Reuse the existing code, components, screens, design, branding, colours, and navigation wherever possible.

Do not replace the application with a simplified version. Make the agreed existing functionality operational while preserving the Ouderschap & Co user experience.

Make the application responsive across mobile, tablet, and desktop. Preserve the existing mobile design and adapt larger-screen layouts to use available space effectively, especially in the professional environment.

Use real database-backed functionality and enforce appropriate permissions; do not treat static or hard-coded demo behaviour as completed functionality.

Protect sensitive family and child-related information. Keep private parent information separate from shared information, and do not automatically expose private information when parents connect.


## 2. Milestone 1 — Backend, security, registration, parent linking, and shared child profiles


### Developer checklist

Review the existing Lovable codebase and identify the current frontend, routing, data models, authentication, and integrations before making structural changes.

Set up or complete the backend and database structure required by the agreed application.

Implement user registration, login, logout, password reset, and secure session handling as supported by the agreed authentication flow.

Support independent parent accounts so a parent can use the application without first connecting another parent.


### Implement parent invitation and connection flows, including invitation status and acceptance.

Allow a parent to create and manage child profiles before the other parent joins.

Support multiple child profiles and ensure database constraints do not unintentionally limit a parent or connection to a single child.

Implement explicit access permissions for shared child profiles and shared information.

Keep private notes and personal information separate; never automatically share them simply because a second parent connects.

Ensure connected parents can access only the child profiles and data they are authorized to see.

Implement and verify database access policies, including Supabase Row Level Security (RLS) if Supabase is the selected backend.

Test the full flow: register → create child profile → invite parent → accept invitation → authorize sharing → access permitted shared profile.

Test error states, refresh/re-login behaviour, duplicate invitations, unauthorized access, and multiple children.


### Milestone 1 acceptance checks

A parent can register and use the application independently.

A parent can create and manage child profiles without requiring the other parent to join.

The invitation and parent-connection flow works end-to-end.

After connection, each parent sees only authorized shared child information.

Private notes and private information remain private.

Multiple child profiles work without database uniqueness errors.

The milestone is available for client testing with real persisted data before approval.


## 3. Milestone 2 — Core parent-facing functionality

Implement the existing parent-facing functionality from the Lovable project that falls within the agreed scope. Preserve existing screens, components, design, and navigation wherever possible; connect the UI to working backend functionality.


### Developer checklist

Home dashboard and overview.

Calendar and parenting schedules.

Parent-to-parent in-app messaging.

Existing AI communication assistance included in the agreed project scope, subject to the agreed AI integration plan.

Child profiles and authorized shared information.

Expenses, receipts, and cost management.

Tasks and shared responsibilities.

Belongings/items needed for handovers.

Handovers and related agreements.

Holidays and special occasions.

Agreements, decisions, and proposals.

Documents and file management.

Positive updates and shared moments.

Family members and authorized caregivers.

Notifications and reminders.

Solo-parent workflows and access to functionality that does not require a connected co-parent.

Any other existing parent-facing feature that is part of the mutually agreed scope.


### Milestone 2 implementation and acceptance checks

Review the existing Lovable screens and code before deciding that a feature can be omitted or simplified.

Make each in-scope feature functional with real data, correct create/read/update/delete behaviour where relevant, and appropriate access permissions.

Ensure shared features respect parent-connection and child-sharing permissions.

Ensure private/solo-parent data is not exposed to another parent without authorization.

Check responsive layouts on mobile, tablet, and desktop; desktop should use available screen space rather than simply displaying a narrow mobile layout.

Test main user flows, loading/empty/error states, persistence, and synchronization where applicable.

Provide the milestone for client testing before requesting approval and payment.


## 4. Milestones 3 and 4 — Summary

Professional environment and agreed professional case-management functionality.

Professional Dashboard and Super Admin Dashboard.

Stripe web subscriptions, including plans, payments, and application access management.

Dutch and English language support.

Agreed existing AI functionality and AI integration work not completed in earlier milestones.

Complete integration and delivery of the agreed web, iOS, and Android applications.

Integration testing, bug fixing for agreed functionality, final client testing, and handover.


## 5. AI integration and cost controls

Use the OpenAI API for the agreed existing AI functionality, such as constructive-tone rewriting and communication assistance.

The client prefers to use their own OpenAI account and retain control over usage and costs.

Keep API keys on the backend in secure configuration/secrets storage; never expose keys in frontend code or the browser.

During development, review a cost-effective model, realistic usage assumptions, per-user usage limits, monthly budget controls/alerts, and estimates for 100, 1,000, and 10,000 active users.

Enable the client to monitor usage and costs through their own OpenAI account. Explain that provider budget alerts/limits may not always function as a guaranteed hard spending cap; implement application-level usage limits where agreed and technically supported.

Send only the data needed for the AI task, and review privacy, logging, retention, and consent requirements for sensitive family information.


## 6. Explicit exclusions for the current phase

Audio and video calling.

AI call transcriptions and AI-generated call summaries.

Automatic synchronization of external email replies and attachments into the application's messaging system. Email invitations and notifications are supported; the application will not access or read parents' personal email conversations.


## 7. Delivery and acceptance rules

A milestone is ready for review when its agreed deliverables are implemented, work with real data and appropriate permissions, and are available for client testing.

Raise any suspected out-of-scope existing feature with the project lead/client before excluding it or implementing a reduced version. Do not silently remove or simplify an existing in-scope feature.


### The agreed one-month post-delivery bug-fixing support period begins after final delivery and acceptance. Fixes for bugs in agreed functionality are included; new features and major changes are separate.


## 8. Ownership and handover

The client owns the source code and developed project materials.

The client controls the GitHub repository, Supabase account/database, and hosting accounts; Kretoss Technology receives developer access as needed.

Commit source code regularly to the client's private GitHub repository.

Provide the agreed source code and project handover at completion.


## 9. Developer working rules

Inspect the existing code and current behaviour before refactoring or replacing components.

Preserve working functionality and the existing visual identity unless a change is needed for responsiveness or agreed functionality.

Do not hard-code sample records as production data or claim that a feature is complete without end-to-end testing.

Do not weaken access policies to make a screen work; fix the underlying data relationships and authorization rules.

Document configuration and integration steps needed for the client to manage their own accounts and costs.