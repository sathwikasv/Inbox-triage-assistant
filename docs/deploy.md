# Deploy

Frontend: AWS Amplify Hosting (static build of `apps/web`). API: Render free web service (Docker, `apps/api`). Database: MongoDB Atlas M0.
Deploy in this order: database → API → frontend → back to the API to set CORS.

## 1. MongoDB Atlas (5 min)
1. Create a free **M0** cluster. Database name: `c16`.
2. Database Access → add a user with a generated password.
3. Network Access → allow `0.0.0.0/0` (hackathon only; Render's free tier has no fixed IP).
4. Connect → Drivers → copy the URI and insert the password and `/c16`:
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/c16?retryWrites=true&w=majority`
5. Keep it out of git. It goes into `apps/api/.env` locally and into the Render dashboard.

## 2. API on Render (10 min)
1. Render → **New → Blueprint** → connect `sathwikasv/Inbox-triage-assistant`. It reads `render.yaml` (Docker, `apps/api/Dockerfile`, health check `/health`, deploys from `main`).
2. When asked, set `MONGODB_URI` (from step 1), `CORS_ORIGIN` and `WEB_ORIGIN` (use `http://localhost:5173` for now). `SESSION_SECRET` is generated. For Yahoo, also set `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET` and `YAHOO_REDIRECT_URI=https://<render-url>/providers/yahoo/callback`.
3. Wait for the deploy, then check:
   ```
   curl https://<render-url>/health
   # {"ok":true,"db":"connected","policy":{"draft_only":true,"auto_send":false}}
   curl -X POST https://<render-url>/runs -H "content-type: application/json" --data @data/fixture/C16/fixture.json
   ```
   In Atlas → Browse Collections you should see `triage_runs`, `decisions`, `drafts`, `audit_events`.

## 3. Frontend on Amplify Hosting (10 min)
1. Amplify console → **Create new app → Host web app** → GitHub → this repo, branch `main`.
2. Tick **"My app is a monorepo"** and set the app root to `apps/web`. Amplify picks up `amplify.yml` from the repo root.
3. Environment variables: `VITE_API_URL=https://<render-url>` (no trailing slash), plus `VITE_GOOGLE_CLIENT_ID` and `VITE_MS_CLIENT_ID` when those providers are set up ([providers.md](providers.md)). They can also be entered later in the app under Settings → Integrations.
4. Hosting → **Rewrites and redirects** → add the single-page-app rule so `/thread/...` links work on reload:
   - Source: `</^[^.]+$|\.(?!(css|js|json|png|svg|ico)$)([^.]+$)/>`
   - Target: `/index.html`, Type: `200 (Rewrite)`
5. Deploy and open the Amplify URL.

## 4. Close the loop
1. Render → Environment → set `CORS_ORIGIN` and `WEB_ORIGIN` to the Amplify URL (comma-separate `CORS_ORIGIN` if you also want localhost). Save; Render redeploys.
1. Add the Amplify URL as an authorised JavaScript origin (Google) and a single-page-application redirect URI (Microsoft).
2. From the hosted URL, on a phone too: Import → Triage → edit a draft → Save → reload. The header must say "Saved to API (MongoDB)".
3. Put both URLs in `README.md` under **Hosted**.

## Judging day
- Render's free tier sleeps after ~15 min idle and takes up to a minute to wake. Open `https://<render-url>/health` 5 minutes before judging. The web app shows "Waking the API…" while it waits.
- If the API is down, the app falls back to "Saved in this browser" and says so on screen. You can also pick that in the header's storage switcher. That fallback is declared in the README.

## Local run without Atlas
```
pnpm install
pnpm --filter @c16/core build
pnpm dev:db                                   # terminal 1: local MongoDB on 27017
cp apps/api/.env.example apps/api/.env        # already points at the local DB
pnpm dev:api                                  # terminal 2: http://localhost:4000/health
echo "VITE_API_URL=http://localhost:4000" > apps/web/.env.local
pnpm dev:web                                  # terminal 3: http://localhost:5173
```
