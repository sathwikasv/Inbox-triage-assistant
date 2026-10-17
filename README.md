# C16 — Inbox Triage and Reply Draft Assistant

Fynd × NMIMS Hyderabad simulation, case C16. Draft-only inbox triage over a synthetic 12-email fixture.
Full plan, roles and timeline: [C16_PLAN.md](./C16_PLAN.md).

## Run locally
```
pnpm install
cp apps/api/.env.example apps/api/.env   # fill MONGODB_URI
pnpm --filter @c16/core build
pnpm dev:api        # http://localhost:4000/health
pnpm dev:web        # http://localhost:5173
pnpm test
```

## Hosted
- Frontend (Amplify Hosting): TODO
- API (Render): TODO

## Known limits
See docs/known_limits.md.

## Git rules
Read [GIT_RULES.md](./GIT_RULES.md) before your first commit, then run `git config core.hooksPath .githooks`.
