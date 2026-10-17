# Email-type accuracy

How well the engine sorts emails into the ten types the card needs (request, correction, resolution, duplicate, status update, FYI, commitment, question, blocker, injection). Each email is triaged on its own, as a one-email inbox. All sets are synthetic and written by the team; they are **not a benchmark**.

## Rules only (shipped default, no API key needed)

| Set | Emails | Role | Before | After |
|---|---|---|---|---|
| Starter fixture E01–E12 | 12 | judged input | 12/12 | 12/12 (7/7 seeded items, 3/3 checks) |
| `robustness.json` | 70 | tuning set | 32/70 (45.7%) | 70/70 |
| `heldout.json` (v1) | 40 | dev set (seen while tuning) | 10/40 (25.0%) | 40/40 |
| `heldout_v2.json` | 60 | **held out**: committed before tuning, scored once after | 34/60 (56.7%), blind | **60/60 (100%)** |
| junior's `ml/data/synthetic_emails.json` (ml branch) | 120 | written separately by member C | n/a | 120/120 |

How the held-out number was protected:
1. `heldout_v2.json` was committed first (`add held-out v2 email set before tuning`).
2. Its score before tuning was printed as a total only, without looking at which emails failed.
3. The rules were tuned only on the v1 dev-set misses (phrase families such as "X, not Y" corrections, "can't … until …" blockers, chasers, "partially done" progress).
4. Only then was v2 scored in detail, once.

**Limits:**
- The same team wrote the rules and the test emails, so their wording may share habits.
- New phrasing in a real inbox will still miss sometimes. When no rule matches, the email is marked **Needs review** rather than guessed. With the optional AI check on, Gemini proposes a type and any disagreement goes to review.
- Facts (dates, owners, tracker ids, resolutions) always come from the rules, never from a model.

`packages/core/tests/accuracy.test.ts` keeps these at or above 95% so a later rule change cannot silently undo them.

## With the optional AI check

`pnpm --filter api build && pnpm --filter api eval:ai` (needs `GEMINI_API_KEY` in `apps/api/.env`). It scores rules only, Gemini only and the shipped hybrid on each set and writes `docs/accuracy-ai.md`.

_Not run yet: no API key configured._
