# Pending Proposals — What the Kretoss Backend Still Needs to Deliver

This frontend displays the "Pending proposals / Awaiting response" overview fully derived from existing sources (care schedule, agreements, budgets, holidays, incidental costs, attendance). No second proposal system was built and no backend changes were made.

## What the Frontend Already Does
- One overview under Arranging Together (Samen regelen): "Awaiting your response" and "My proposals" with filters (Awaiting response / Response received / Completed / All).
- Statuses: Awaiting response, More time requested, Counterproposal received, Response deadline passed, Agreed, Not agreed, Withdrawn, Completed.
- Optional preferred response date for care schedule and budget proposals (a request, never binding; expiration never changes anything automatically).
- "Need more time" response for care schedule and budget proposals; the proposal remains open without agreement.
- Friendly, bounded reminders: max 1 before and max 1 after the response date; pausable via Settings (e.g. during safety agreements). Reminders are in-app, not push notifications.
- Home displays "Everything is coordinated." when nothing is pending.
- Professionals: factual Coordination Overview (counts and statuses only, no behavioral judgment), visible within existing permissions (calendar/schedule).

## What Kretoss Needs to Implement (Not Yet Available)
1. **Two linked parent accounts**: responses, counterproposals, and reminders must genuinely travel between two accounts; currently everything is demo/local.
2. **Reminder delivery**: enforce server-side bounds (max 1 before/after response date), respect quiet hours, enforce per-family pause during safety or contact agreements, and audit logging for every reminder.
3. **Access control**: professionals only see the coordination overview within their authorized permissions per family/section/period; never message content or private notes.
4. **Immutable history**: withdrawals, rejections, and reminders remain visible; nothing is deleted or silently overwritten.
5. **No tacit consent / silent agreement**: the backend must never modify an agreement, payment, or care schedule based on an expired response date or lack of response.

