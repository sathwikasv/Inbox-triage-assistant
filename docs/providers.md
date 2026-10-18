# Connecting real mailboxes and calendars

Every provider signs in with its own OAuth 2.0 consent screen. The app never asks for an email password. Permissions are requested one at a time, when the feature that needs them is first used.

| Provider | How | Permissions | Where tokens live |
|---|---|---|---|
| Gmail | Google Identity Services (browser) | `gmail.readonly`; `gmail.send` only after "Allow sending" | this tab's memory |
| Google Calendar | same Google client, separate consent | `calendar.events` | this tab's memory |
| Yahoo Mail | the server (IMAP + SMTP, XOAUTH2) | `openid email mail-r`; `mail-w` only after "Allow sending" | server memory, AES-256-GCM encrypted |

Calendar events created by the app never include attendees, so the provider sends no invitations on your behalf.

## Gmail and Google Calendar
1. Open console.cloud.google.com, create a project, then go to APIs and services and enable **Gmail API** and **Google Calendar API**.
2. OAuth consent screen: set it to External and Testing, and add each Gmail address you will connect as a **test user**. Use a spare mailbox.
3. Go to Credentials → Create OAuth client ID → **Web application**. Add **Authorised JavaScript origins** for the app's URL (`http://localhost:5173` locally, the Amplify URL when hosted).
4. Paste the Client ID in Settings → Integrations, or set `VITE_GOOGLE_CLIENT_ID`.

While the app is in Testing, Google shows an "unverified app" notice and grants expire after 7 days. Publishing to all users needs Google's verification, because `gmail.readonly` is a restricted scope.

## Several accounts per provider
Every Gmail / Google Workspace and Yahoo account is its own connection. "Connect other Gmail account" always shows Google's account chooser, so a second or third address (another company, a client, a personal one) is added next to the others, and disconnecting one never touches the rest. Name the company before connecting, or later under Settings → Accounts. When you sign in with Google, the accounts linked to that login reconnect by themselves after a reload.

## Yahoo Mail
Yahoo has no public mail REST API. Mail is read over IMAP and sent over SMTP with OAuth 2.0, which has to run on the server so the client secret stays private.
1. Open developer.yahoo.com → My Apps → Create an App with API permissions **OpenID Connect (email)** and **Mail** (read; write if you want to send). **Yahoo must approve Mail access** for the app before it works for any account.
2. Set the redirect URI to `https://<server>/providers/yahoo/callback`.
3. On the server, set `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET`, `YAHOO_REDIRECT_URI`, `WEB_ORIGIN` (the app's URL), `CORS_ORIGIN` (the same) and `SESSION_SECRET`.
4. In the app, set the server URL in Settings → Integrations, then use Connect Yahoo Mail.

## Where the keys go
Put every value in the repo-root `.env` (copy `.env.example`), run `pnpm check:env` to see which ones are set, then `pnpm dev`.
- `VITE_GOOGLE_CLIENT_ID` is a public client ID and is built into the web app.
- `GEMINI_API_KEY`, `YAHOO_CLIENT_SECRET` and `SESSION_SECRET` are secrets. They are read only by the server, never start with `VITE_`, and never reach the browser.

## Status without credentials
- With no IDs configured, the Connect buttons stay disabled and explain what is missing.
- With IDs configured, failures (popup closed, consent refused, API errors) are shown as messages. No account is shown as connected unless the provider returned real mail.
