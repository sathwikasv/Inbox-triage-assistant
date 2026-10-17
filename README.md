# Triagedesk: unified inbox with a careful assistant

One inbox for Gmail, Outlook and Yahoo Mail. Every email is sorted into a category with a priority, a reason and a next step. Deadlines become tasks, meeting requests become calendar events, and reply drafts are written for you to review. **Nothing is sent, scheduled or archived without your confirmation.**

Built for the Fynd × NMIMS case C16 (inbox triage and reply drafts). The plan, roles and timeline are in [C16_PLAN.md](./C16_PLAN.md).

## What it does
- **Unified inbox.** Accounts from several providers in one list with account filters, search across accounts, read/unread, star, attachments, conversation view, and Drafts / Sent / Archive / Spam.
- **Categories.** Urgent · Requires action · To delegate · Meetings · Waiting for response · Follow-up · Important · FYI · Promotions · Spam or suspicious. Each shows its reason, and you can override it.
  - Newsletters are never treated as spam.
  - Phishing and instruction-like emails are quarantined.
- **Tasks.** Deadlines read from the email ("Monday at 4 PM" → 19 Oct 16:00 in the sender's zone), with the owner when stated.
  - Ambiguous dates ("end of day") are flagged for you to confirm, never invented.
  - Old deadlines in quoted text are ignored.
  - A task joins your list only when you add it.
- **Calendar.**
  - Detection: meeting requests, invitations, confirmations, reschedules and cancellations, with date, time, zone, duration, participants, location and meeting link.
  - Clashes with existing events are shown.
  - Accept (after editing if needed), set a reminder, or decline.
- **Follow-ups.** Unanswered important mail, replies you are waiting for, promises (theirs and yours) and deadlines. Done, snooze or dismiss.
- **Replies.**
  - Recipients, CC, subject and four tones (Standard, Formal, Friendly, Brief), built only from facts in the conversation.
  - Regenerate (AI when the server has a model key, otherwise the next template tone), edit, save or discard.
  - A claims check blocks invented attachments, payments, approvals and wrong dates.
  - Dates and commitments need an Approver.
  - Money, legal terms and personal data need an extra confirmation at send time.
- **Dashboard.** Unread, urgent, pending tasks, deadlines, today's meetings, follow-ups, mailboxes and recent activity.

## Demo and connected mode
- **Demo mode** (on by default): three labelled demo accounts (Gmail, Outlook, Yahoo) with 26 fictional emails, including the 12 C16 case emails, and a demo calendar. Sends and calendar changes in demo mode are simulated and say so. Turn it off in Settings → Accounts.
- **Connected mode:** real mailboxes after you add the provider app IDs (below).
  - Mail is read-only until you allow sending for that account.
  - Calendars are connected separately from mail.

## Run locally
```
pnpm install
pnpm --filter @c16/core build
pnpm dev:web                      # http://localhost:5173  (demo mode works with nothing else)
pnpm dev:db & pnpm dev:api        # optional: http://localhost:4000 (Yahoo and AI replies)
pnpm test                         # unit and API tests
pnpm --filter web build && pnpm --filter web test:e2e   # end-to-end (PW_CHANNEL=msedge to reuse Edge)
```

## Configuration
Web app (build-time, or entered in Settings → Integrations; OAuth client IDs are not secrets):

| Variable | Used for |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Gmail and Google Calendar sign-in |
| `VITE_MS_CLIENT_ID` | Outlook mail and calendar sign-in |
| `VITE_API_URL` | The server, for Yahoo Mail and AI replies |

Server (`apps/api/.env`; never commit it):

| Variable | Used for |
|---|---|
| `WEB_ORIGIN`, `CORS_ORIGIN` | The web app's URL (credentialed CORS, Yahoo popup) |
| `SESSION_SECRET` | Encrypts provider tokens held in server memory |
| `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET`, `YAHOO_REDIRECT_URI` | Yahoo Mail over IMAP/SMTP with OAuth 2.0 |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Optional AI type check and AI reply drafts |
| `MONGODB_URI` | The case-evaluation API (`/runs`) |

Step-by-step provider setup: [docs/providers.md](docs/providers.md). Deployment: [docs/deploy.md](docs/deploy.md).

## How it is built
- **Monorepo** (pnpm, TypeScript), three packages:
  - `packages/core`: the rules engine and the mailbox model as pure, tested functions:
    - content threading, type and urgency rules, injection guard, date/owner/tracker extraction, correction and resolution handling
    - categories, tasks, meeting proposals, follow-ups
    - reply templates, the claims check and the send gate
  - `apps/web`: React + Vite + Tailwind. Provider clients for Gmail (Google Identity Services), Outlook (Microsoft MSAL) and Yahoo (via the server), each behind one interface. Gmail and Outlook tokens stay in the tab's memory.
  - `apps/api`: Express. Yahoo OAuth with IMAP and SMTP, AI reply drafts checked by the same claims rules, and the case-evaluation API with MongoDB.
- **AI:** classification and drafting are rules-first. The optional Gemini model only proposes a type or rewrites a draft. Its output is validated and checked, and the app labels which one produced each result.

## Evidence
- Results against the brief's checks, expected vs actual: [docs/evaluation.md](docs/evaluation.md).
- Email-type accuracy (held-out set): [docs/accuracy.md](docs/accuracy.md).
- Known limits: [docs/known_limits.md](docs/known_limits.md).

## Git rules
Read [GIT_RULES.md](./GIT_RULES.md) before your first commit, then run `git config core.hooksPath .githooks`.
