---
name: release
description: Tartarus release pipeline — builds, tests, simplifies, updates README, and commits a clean milestone. Run before pushing to git.
---

# Release Pipeline

Pre-commit quality gate for Tartarus. Ensures both MCP and web builds are in harmony, all tests pass, code is simplified, and the README reflects the current state.

## Pipeline Steps

Run these IN ORDER. Stop on any failure — do not skip ahead.

### 1. Build Harmony

Both sides must compile cleanly from the same codebase:

```bash
# MCP server (esbuild)
npm run build

# Web app (Next.js)
cd web && npx next build && cd ..
```

**Check:** Both exit 0. If either fails, fix the issue before continuing.

### 2. Test Suite

```bash
npm test
```

This runs:
- `tests/object-registry.test.ts` — 23 unit tests (registry CRUD, search, snapshots, history, constraints)
- `tests/mcp-integration.test.ts` — 20 integration tests (build, DB health, table existence, UUID integrity, env vars)

**Check:** All tests pass. If any fail, fix the issue. Do NOT skip failing tests.

**Rule:** If this release adds new functionality, there MUST be either:
- A new test case covering the feature, OR
- An update to an existing test that validates the change

If neither exists, write the test before continuing.

### 3. Simplify

Run the `/simplify` skill to review changed code for reuse, quality, and efficiency. Fix any issues found.

This catches:
- Dead code
- Duplicated logic
- Overly complex implementations
- Missing error handling at system boundaries

### 4. README Check

Read the current `README.md` and verify it reflects:
- Any new features, tools, or architecture changes
- Updated environment variables (check `.env.example`)
- New or changed API endpoints
- New database tables or migrations
- Updated test instructions

If the README is stale, update it. Every functional change gets a README mention.

Also check `web/README.md` for web-specific changes.

### 5. Git Status & Commit

```bash
git status
git diff --stat
```

Review what's changed. Then commit with a clear message following the project's style:

```
feat: <what was added>
```
or
```
fix: <what was fixed>
```

Include a body if the change is significant. Use the `/commit` pattern.

### 6. Verify Post-Commit

After committing:
```bash
npm run build && npm test
```

One final check that the committed state is clean.

## When to Run

- Before every `git push`
- After completing a feature branch
- Before merging to main
- When asked to "release" or "prepare a commit"

## What This Skill Does NOT Do

- Does NOT push to remote (that's a separate decision)
- Does NOT deploy Docker containers
- Does NOT run the web dev server
- Does NOT modify production data

---

## Deployment

### Website (`website/` submodule → Vercel)

The website is the `website/` git submodule pointing to `GuiArSt/guillermo-portfolio` (private). It deploys automatically on push to `main` — no manual deploy needed. Production alias: `own-portfolio-guillermo-a-stumpfs-projects.vercel.app`.

**Workflow when pushing website changes:**

```bash
# From inside website/ submodule
git push origin main
```

Vercel webhook picks it up. Build typically takes 1–2 min.

**Monitoring / debugging the deploy:**

```bash
# 1. Latest deployment metadata via GitHub API (fast, no auth needed for public repo APIs that the user has token for)
gh api "repos/GuiArSt/guillermo-portfolio/deployments?per_page=3"

# 2. Status of a specific deployment (look for state: success | failure | in_progress)
gh api "repos/GuiArSt/guillermo-portfolio/deployments/<deployment_id>/statuses"

# 3. Full build logs (requires `vercel login` once on the machine)
npx vercel inspect <dpl_id> --logs

# 4. Inspect deployment metadata (status, URL, alias)
npx vercel inspect <dpl_id>

# 5. List recent deployments
npx vercel ls --scope guillermo-a-stumpfs-projects
```

**Common deploy failures and fixes:**

| Symptom | Cause | Fix |
|---|---|---|
| `Module not found: Can't resolve 'fs'` | better-sqlite3 in client bundle | Verify `serverExternalPackages: ['better-sqlite3']` in `next.config.mjs` and that no `'use client'` file imports `lib/db/drizzle` directly. DB-backed accessors live in `lib/data/*` with `'server-only'`. |
| `Vulnerable version of Next.js detected` (build OK but deploy `● Error`) | Vercel blocks deploys of CVE-flagged Next versions | Bump `next` in `website/package.json` to align with `tartarus/web/`. Match React/react-dom versions too. |
| `Cannot find module for page: /_not-found/page` | Missing `app/not-found.tsx` | Add a minimal `app/not-found.tsx` (404 page) — Next 16+ requires it explicitly. |
| `supabaseUrl is required` at build | Supabase env vars missing | Already handled: `lib/supabase.ts` returns null when env missing. If recurring, check `arc-sidebar.tsx` and auth pages still guard against null client. |
| Production page renders fewer projects than DB | Vercel can't reach `tartarus/data/journal.db` (it's local) | Expected until Supabase is wired. `lib/data/portfolio.ts` falls back to `public/data/portfolio-projects.json` automatically. |

**Versioning rules:**

- `website/package.json` `next` must stay current with what Vercel allows (it actively blocks CVE versions).
- Aim to keep `website` and `web/` Next.js majors aligned so we maintain one mental model of the framework.
- React/react-dom should match between `website/` and `web/`.

### Tartarus (`web/` app → cloud)

**Status: TBD.** Currently runs locally only. Possible targets when we move to cloud:

- **Vercel** — same pipeline as website. Would need: external SQLite (Turso) or migration to Postgres (Supabase/Neon) since serverless can't keep `data/journal.db` writable.
- **Fly.io / Render / Railway** — keeps SQLite simple but is single-region.
- **Self-hosted** — `docker compose up -d` is already wired (`make docker-up`).

When this becomes real, extend this section with the chosen path's deploy commands.

## Environment Assumptions

- Local development (not CI/CD)
- `JOURNAL_DB_PATH` set in `.env` pointing to `data/journal.db`
- Node.js 18+ with `npx tsx` available
- All API keys configured in `.env` (Anthropic, Google, etc.)
- For Vercel CLI: run `vercel login` once on the machine; auth persists in `~/Library/Application Support/com.vercel.cli/`
- Future: Doppler for secrets management in production
