# Evaluation: expected vs actual

Measured on 18 October 2026 by the automated suites in this repository: 223 core tests, 38 API tests and 8 end-to-end tests in Edge, all passing. Each row names the test that checks it.

The data is synthetic: the 12 C16 case emails, 14 more fictional demo emails across Gmail, Outlook and Yahoo, and the evaluation sets in `packages/core/tests/fixtures`. Live provider calls were **not** tested, because no OAuth credentials were configured. Provider code is tested against fake provider endpoints.

| # | Check | Expected | Actual | Evidence |
|---|---|---|---|---|
| 1 | Every seeded critical deadline and action is recovered | 7/7 seeded items (E01 owner + due, E02 correction 18→20 Oct, E03 resolved, E05 injection, E06 no owner, E08 resolved + unverified file, E12 already tracked) | 7/7 | `core/tests/metrics.test.ts`, `pipeline.fixture.test.ts` |
| 2 | Classification precision over the other decisions | action-flag precision 1.0 on the fixture; types correct on unseen wording | precision 1.0 and recall 1.0 on the fixture; types 60/60 on held-out v2 (34/60 before tuning), 40/40 on the dev set, 120/120 on member C's synthetic set; unified-inbox categories as listed in the tests | `metrics.test.ts`, `accuracy.test.ts`, `mailbox.test.ts`; [accuracy.md](accuracy.md) |
| 3 | Each reply belongs to the right conversation | the reply answers the newest relevant email of its own thread | duplicate-ticket reply → E02 (the correction); missing IDs → E06; recipients = that email's sender | `reply.test.ts`, `mailbox.test.ts` ("the reply goes to the sender…") |
| 4 | No invented commitments | drafts never claim attachments, payments, approvals, sends or unagreed dates | every template tone lints clean; edits claiming "attached" or the superseded 18 Oct are refused; an AI draft that does so is rejected (422) | `lint.test.ts`, `reply.test.ts`, `api/tests/providers.test.ts` |
| 5 | Malicious instructions cannot bypass permissions | the injected email is quarantined; no reply, no action, policy unchanged | E05 and 6/6 held-out injections quarantined; replies to them blocked; `auto_send` stays false; benign "share the vendor list with Priya" is not flagged | `injection.test.ts`, `mailbox.test.ts`, e2e "quarantined" |
| 6 | Users can edit and preview drafts | edit, tone change, regenerate, save, discard; preview before sending | works; the send dialog previews recipients, subject and text | e2e "a reply with an invented attachment is blocked…" |
| 7 | Sending needs the right confirmation | always a confirmation; an Approver for dates/commitments; an extra tick for money, legal or personal data | as expected; a connected account cannot send until sending is allowed for it | `mailbox.test.ts` (send gate), e2e (legal confirmation) |
| 8 | Calendar events use the right dates and zone | "tomorrow at 3 PM" read against the email's own date and zone; stated zones kept; mismatches flagged | 2026-10-18 15:00 +05:30; "Thursday 22 October 3-4 PM IST" → 15:00–16:00 +05:30, 60 min; sender/user zone mismatch flagged; no time → asks before creating | `mailbox.test.ts` (meetings), e2e (calendar) |
| 9 | Failed provider connections are handled | no fake success; a clear reason | without IDs the Connect buttons are disabled with the reason; a forged OAuth state is refused; mail is not served to a browser that never connected; tokens never appear in responses | `providers.test.ts`, e2e "connecting a provider…" |
| 10 | Changes persist after refresh | categories, tasks, events, drafts and sends survive a reload | as expected (in this browser) | e2e: sent reply and category override after reload; `mailbox.test.ts` (state round trip) |

Assumptions, not measured:
- How the rules behave on real mailboxes beyond these synthetic sets.
- Gmail, Outlook and Yahoo behaviour with live accounts.
