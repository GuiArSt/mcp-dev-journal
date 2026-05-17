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

## Environment Assumptions

- Local development (not CI/CD)
- `JOURNAL_DB_PATH` set in `.env` pointing to `data/journal.db`
- Node.js 18+ with `npx tsx` available
- All API keys configured in `.env` (Anthropic, Google, etc.)
- Future: Doppler for secrets management in production
