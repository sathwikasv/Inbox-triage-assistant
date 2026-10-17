# Git rules — C16 inbox triage

These rules apply to the whole repository, every branch, every member, for the full event and afterwards. Read them once, set up the hooks (section 9), then follow them.

## 1. No AI attribution anywhere — strict, permanent

Nothing in this repository may credit an AI assistant. Not in commits, not in the contributor graph, not in files.

Never:
- add a `Co-authored-by:` trailer naming any AI assistant, tool, bot or model
- commit as, or with, any identity other than your own GitHub identity (name + the email verified on your GitHub account)
- add an AI tool as a collaborator, app, deploy key or bot on the repository
- mention which AI tool wrote or helped with code in commit messages, PR descriptions, code comments, README, CONTRIBUTIONS.md, CHANGELOG.md or docs
- paste AI-generated commit messages or PR text that carry tool signatures ("Generated with …", "🤖", tool names)

Before every commit verify author, committer and trailers (`git log -1 --format='%an <%ae>%n%cn <%ce>%n%B'`). The `commit-msg` hook in `.githooks/` rejects known trailers, but the hook is a safety net, not the rule.

If you use an AI coding tool locally, turn off its commit attribution before the first commit. For example, tools that add a co-author trailer by default must have that setting disabled in their config. Check with `git log -3 --format=%B` after your first commit.

Only the three team members appear in `CONTRIBUTIONS.md` and in the GitHub contributor list.

## 2. Identity

Remote: `https://github.com/sathwikasv/Inbox-triage-assistant.git` (owned by the lead).

| Member | GitHub account | Machine |
|---|---|---|
| A — final-year, lead | `sathwikasv` | shared Windows laptop |
| B — mid-year | `Mounika-Reddy-0802` | shared Windows laptop |
| C — junior | (own account) | own MacBook |

**Own machine (C):** set once, inside this repo:
```
git config user.name  "<your GitHub username>"
git config user.email "<email verified on your GitHub account>"
```

**Shared laptop (A and B):** the repo-local identity changes every time the person at the keyboard changes. Never set a global identity for this work, and never commit without switching first.
```
# A takes the keyboard
git config user.name  "sathwikasv"
git config user.email "bhanusathvika629@gmail.com"
git remote set-url origin https://sathwikasv@github.com/sathwikasv/Inbox-triage-assistant.git

# B takes the keyboard
git config user.name  "Mounika-Reddy-0802"
git config user.email "sherymounikareddy.2006@gmail.com"
git remote set-url origin https://Mounika-Reddy-0802@github.com/sathwikasv/Inbox-triage-assistant.git
```
The username in the remote URL makes Git Credential Manager pick that member's stored login (or personal access token), so pushes are attributed to the right account. Each member uses only their own token; tokens are never written into the repo, the remote URL or any file under it.

On every machine: verify with `git config --get user.email` before each commit (the `pre-commit` hook prints who you are committing as). A commit with a mismatched or anonymous email does not count toward your contribution score and will be flagged. Commit each component from the account of the member who owns it in `C16_PLAN.md` §6.

## 3. Meaningful commits only

A commit is a completed, working unit: a finished module, a feature with its tests, a real bug fix, a coherent docs update, a milestone. Not a one-line tweak, a formatting pass, an import cleanup or the fifth "fix" for the same thing.

Before committing ask: does this deserve a line in the project history? If not, keep working and fold it into the next meaningful commit.

Fewer, stronger commits beat many small ones. Judges read the log.

## 4. Do not artificially split or merge work

One feature that touches core + api + web + docs is one commit, not four. Two unrelated things are two commits, not one. Aim for commits a reviewer can read as a single idea.

Expected rhythm for this event (guide, not quota): roughly one commit per member per 1–2 hours, each matching a sync point or a finished component from `C16_PLAN.md`. Around 8–15 commits per member over 12 hours is normal; 40 is a smell.

## 5. Commit message style

Short, lowercase, specific, developer-natural, ~50 characters, describing what changed. Optional body only when the why is not obvious.

Good:
```
add fixture schema and sort order
thread emails by content references
add deadline correction reconcile
add draft lint for forbidden claims
add triage page and thread view
add runs api with mongo models
add synthetic email generator
add baseline classifier and eval
connect web to api repository
deploy frontend to amplify
```
Bad: `Implement comprehensive triage architecture`, `Enhance robust pipeline`, `update`, `fix`, `changes`, `wip`, anything with an emoji or a tool name.

## 6. Verify before every commit

```
git status
git diff --staged
```
Check: only intended files; no `.env`, no `MONGODB_URI`, no API keys, no `node_modules`, no `dist`, no `ml/outputs/*.joblib`; tests pass (`pnpm test`) when practical; author/committer are you; no AI trailer. Then commit. Never `git add -A` without reading the status first.

## 7. Branches and merging

Trunk-based with short-lived branches:
- `main` is always runnable. Protected: no direct pushes, no force-push.
- Each member works on a branch named `<initial>/<component>`, e.g. `a/core-reconcile`, `b/thread-page`, `c/ml-baseline`. One branch per component, deleted after merge.
- Merge to `main` by pull request, squash-merge, PR title in commit-message style (it becomes the commit). Another member glances at it; at sync points the lead merges all open PRs.
- Rebase on `main` before opening the PR (`git pull --rebase origin main`). Resolve conflicts locally, never on GitHub's web editor.
- No long-lived branches, no personal "dev" branches, no branches for experiments that will not merge.

Squash-merge is what keeps `main` meaningful even if a working branch has a few small intermediate commits. Do not let intermediate commits carry AI trailers either; the hook runs on every commit.

## 8. Tags and milestones

Only the lead tags, from `main`, after tests pass:
- `v1-mba-baseline` at the Hour-6 sync (state preserved for business-team arrival)
- `v2-final` before submission

Tags are annotated (`git tag -a v1-mba-baseline -m "baseline at mba arrival"`) and pushed (`git push origin --tags`). Never move a tag.

## 9. Hooks setup (every member, once, after cloning)

```
git config core.hooksPath .githooks
chmod +x .githooks/*        # macOS/Linux; not needed on Windows (Git Bash runs the hooks)
```
`commit-msg` rejects AI co-author trailers and tool signatures. `pre-commit` rejects staged `.env` files and obvious secrets. If a hook blocks you, fix the cause; do not use `--no-verify`.

## 10. Push and remote rules

- Push to your own branch after each meaningful commit; do not sit on finished work.
- Never force-push `main` or a tag. Force-push to your own branch only after a rebase you did yourself.
- Do not change the remote repository, do not create a second repository, do not fork for the team's work. (Changing only the username part of the URL when switching seats on the shared laptop, section 2, is expected.)
- One-time exception: the lead pushes the initial scaffold directly to `main`, then enables branch protection. Every later change goes through a pull request.
- Deployment connections (Amplify, Render) read from `main` of this repository only.

## 11. History rewrite (only if ever needed)

If a commit with wrong identity or an AI trailer slips through: tell the lead immediately. The fix preserves content, order, author dates and committer dates, corrects only the metadata, and is force-pushed only to the affected branch by the lead after review. Never rewrite `main` after `v1-mba-baseline` is tagged.

## 12. Priorities, in order

1. No AI attribution anywhere.
2. Only your own verified identity.
3. Meaningful, coherent commits; no filler.
4. `main` always runnable; squash-merge via PR.
5. Verify status and diff before every commit; never commit secrets.
6. Natural, specific commit messages.
7. Push finished work promptly; never force-push shared history.
