# Known limits

- **Live providers are untested here.** Gmail, Outlook and Yahoo work through their official APIs, but they were only tested against fake endpoints; no OAuth credentials were available. Each needs its developer-console setup ([providers.md](providers.md)).
  - Google: unverified-app notice and 7-day grants while the app is in Testing; publishing needs Google's verification for `gmail.readonly`.
  - Yahoo: Mail access must be approved by Yahoo, and it needs the server.
- **Where state lives.**
  - Workspace state (categories, tasks, events, drafts, the activity log) is kept in this browser's local storage, not on a server. It does not sync between browsers, and there is no app login or per-user separation on a server yet.
  - Gmail and Outlook tokens are held in tab memory, so connected mail is reloaded after a page refresh.
  - Yahoo tokens live in server memory and are lost when the server restarts.
- **What is stored.** Connected mail is kept in memory only (up to about 30 recent messages per folder) and never stored. Imported files are kept in local storage until removed.
- **Archive and labels** are workspace views; nothing is moved or deleted in the provider's mailbox.
- **Rules first.**
  - Categories, deadlines and owners come from rules. Unusual phrasing may get a "please check the category" flag or a "confirm the date" prompt instead of a confident answer.
  - Our accuracy sets are synthetic and written by the team ([accuracy.md](accuracy.md)).
- **AI is optional.** With `GEMINI_API_KEY` set on the server, Gemini can rewrite a draft, and the claims check still applies. Without it, "Regenerate" cycles template tones and the draft is labelled as a template.
- **No new emails.** Only replies are drafted: there is no compose-new-email screen, and forwarding is not supported.
- **Timezones.**
  - Times are read in the zone stated in the email, else the sender's own timestamp zone.
  - A zone abbreviation like "PST" is taken literally, even in daylight-saving months.
- **The demo clock is fixed** at 17 Oct 2026, 10:00 IST, so the demo mailbox's dates stay meaningful. Connected or imported mail uses the real time.
