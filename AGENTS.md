# Tartarus Agent Guide

This is the root operating guide for coding agents working in Tartarus. Keep it
small enough to read at the start of a session, but specific enough that agents
do not need to rediscover the same architecture every time.

If this file conflicts with the current source tree, trust the source tree and
update this guide deliberately.

## Mission

Tartarus is an agentic context management system. It stores durable knowledge in
a sovereign SQLite vault, exposes that knowledge through MCP and the web app,
and lets Kronus and other agents act on it with explicit human control.

The product has three simultaneous identities:

- local operator workspace for Guillermo;
- MCP-backed memory and tooling layer for coding agents;
- future hosted-lite/public product with hosted-safe tools only.

Do not blur those modes. Local capabilities are not automatically safe for a
hosted deployment.

## Active Surfaces

Before editing, identify the surface.

- `src/`
  Root TypeScript MCP server. It exposes journal tools, Kronus access,
  repository resources, registry search/fetch, read-only git helpers, and
  integration-facing MCP utilities.
- `web/`
  Main Tartarus operator UI on port `3005`. It contains Kronus, Hourglass,
  Muse, integrations, API routes, SQLite access, AI traces, and confirmation
  flows.
- `website/`
  Public portfolio/site on port `3007`. It is a separate app. Touch it only
  when the request mentions the public site, portfolio, CV, workshop,
  publications, marketing pages, or website deployment.

When the user says "UI" without more detail, assume `web/` first.

## First Moves

1. Run `git status --short`.
2. Preserve unrelated dirty work. This repo often has several agents working at
   once.
3. Read the closest relevant source files before editing.
4. Prefer code over stale docs.
5. Make the smallest coherent change that satisfies the request.

Never revert or format files you did not intentionally touch.

## Source Of Truth

Durable product state belongs in SQLite, accessed through the existing DB,
Drizzle/raw SQLite, API, MCP, or repository helpers.

Important layers:

- journal entry: commit-scoped record of what changed and why;
- Entry 0 / repository overview: living project summary;
- repository documents: notes, prompts, writings, CV, portfolio, media;
- registry: universal object discovery and UUID-based fetch across systems.

Do not use repository documents as a substitute for Entry 0. Do not use registry
as a substitute for domain-specific writes.

## MCP And Agent Config

Tartarus MCP runs as stdio through `dist/index.js`. MCP configs must use **Node 22**
(not bare `node` — your shell may be Node 25 and `better-sqlite3` is a native addon):

```json
"tartarus": {
  "command": "/opt/homebrew/opt/node@22/bin/node",
  "args": ["/Users/guillermo.as/Documents/Software/Laboratory/tartarus/dist/index.js"]
}
```

Known config locations (server name **`tartarus`**):

- Cursor: `~/.cursor/mcp.json` -> `mcpServers.tartarus`
- Claude Code: `~/.claude.json` -> `mcpServers.tartarus`
- Codex: `~/.codex/config.toml` -> `[mcp_servers.tartarus]`
- Gemini: `~/.gemini/settings.json` -> `mcpServers.tartarus`

After `npm install` or a Node upgrade: `npm run rebuild:native` then `npm run build`.

The server loads `.env` from the Tartarus project root. Do not copy secrets into
MCP config blocks.

Smoke test:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' \
  | /opt/homebrew/opt/node@22/bin/node /Users/guillermo.as/Documents/Software/Laboratory/tartarus/dist/index.js
```

If MCP fails with `-32000`, check wrong path, missing `node_modules`, run
`npm run rebuild:native` (Node 22 + better-sqlite3), `npm run build`, and startup
exceptions (smoke test above).

## AI, Prompt, And Model Rules

AI calls should move toward provider abstraction, model catalog routing, cost
tracking, and BYOK.

Current invariants:

- Do not add hardcoded provider/model calls if the model catalog or provider
  abstraction can be used.
- Long prompts should be database-backed or prompt-store backed where the local
  pattern exists.
- AI SDK v6 structured calls are preferred: `generateObject` or `generateText`
  with `Output.object({ schema })`.
- Avoid raw JSON parsing fallbacks for model output.
- Log enough model/provider/prompt/cost context that a future ledger can explain
  how a result was produced.

## Context Budgeting

Kronus should read summaries and indexes before raw archives. Full writings,
journal history, Slack messages, Slite/Notion pages, and other large payloads
should be pulled only when the task needs them.

Heavy binary/base64 payloads should not enter ordinary chat, MCP, or tool
context. Store the asset, then pass metadata, IDs, thumbnails, summaries, or
URLs.

## Write And Approval Rules

Write/destructive operations require explicit human approval through the UI
confirmation flow or an `X-Manual-Action` style server-side guard.

Agents should not delete durable history. Prefer archive, supersede, relink,
summarize, or create lineage records.

High-risk examples:

- deleting documents, portfolio projects, journal entries, or media;
- publishing externally;
- repository mutations;
- credential or provider configuration changes;
- hosted deployment settings.

## UI And Design Rules

For `web/`, use the Tartarus operator aesthetic: dense, legible, ivory/gold/dark
surfaces, and controls built for repeated use. Avoid marketing-page composition
inside operational screens.

Design engineering principles preserved from `emil-design-eng`:

- Animate only when it reduces confusion, provides feedback, or preserves
  spatial continuity.
- Do not animate high-frequency actions heavily.
- Prefer `ease-out` for entering UI and quick feedback; avoid sluggish `ease-in`.
- Keep ordinary UI animations under 300ms.
- Buttons and pressable controls should have subtle active feedback.
- Popovers should originate from their trigger when the component library
  exposes transform-origin variables.
- Text must fit its container at desktop and mobile sizes.
- Avoid nested cards and decorative noise in operational tools.

For website-specific design, check `website/.cursorrules`.

## Skill Creation And Evaluation

Do not lose the skill-creator machinery. The full implementation assets live in:

```text
.claude/skills/skill-creator/
  SKILL.md
  agents/analyzer.md
  agents/comparator.md
  agents/grader.md
  assets/eval_review.html
  eval-viewer/generate_review.py
  eval-viewer/viewer.html
  references/schemas.md
  scripts/aggregate_benchmark.py
  scripts/generate_report.py
  scripts/improve_description.py
  scripts/package_skill.py
  scripts/quick_validate.py
  scripts/run_eval.py
  scripts/run_loop.py
  scripts/utils.py
```

Use that folder as the executable skill-development toolkit. This guide only
summarizes the workflow:

1. Capture intent and triggering conditions.
2. Write `SKILL.md` with YAML `name` and pushy `description`.
3. Keep the skill body lean; move large references/scripts into resources.
4. Add realistic eval prompts in `evals/evals.json`.
5. Run baseline and with-skill comparisons when quality matters.
6. Grade outputs with assertions, aggregate results, and use the eval viewer.
7. Iterate from measured failures, not vibes alone.
8. Optimize the skill description when trigger accuracy matters.

The `.agents/skills/skill-creator/SKILL.md` copy is a lightweight local skill
entry. The `.claude/skills/skill-creator/` copy is the complete toolkit.

## Slack And Integration Doctrine

For external services, mirror first, tool later.

Slack doctrine:

- ingest users, conversations, messages, and replies into the vault;
- classify Slack surfaces as personal conversations, groups, and public forums;
- make backfills paced and resumable;
- do not build one-shot API calls that fight provider rate limits;
- summarize after ingestion, not during rate-limited fetch loops;
- expose summaries/indexes to Kronus before raw messages.

Future integrations should follow the same structure: stable local mirror,
sync state, summaries, then agent tools.

## Validation Commands

Root MCP server:

```bash
npm run build
npm test
npm run test:registry
npm run test:mcp
```

Main web app:

```bash
cd web
npm run dev
npm run typecheck
npm run test:run
npm run check
```

Public website:

```bash
cd website
pnpm build
pnpm lint
pnpm tsc --noEmit
```

Use the narrowest meaningful check. Report what was not run.

## Journal After Work

After meaningful code changes, use Tartarus memory intentionally:

- `journal_create_entry` for commit-scoped changes;
- `journal_update_project_technical` when architecture, commands, stack,
  schema, file structure, or data flow changed;
- `journal_submit_summary_report` when purpose, status, decisions, or narrative
  direction changed;
- `journal_generate_image` or `journal_attach_screenshot` when a visual helps.

Mention all changed file paths in journal reports so Kronus can extract them.

## Legacy Jobilla Context

Jobilla agent docs are historical context, not active Tartarus rules. Preserve
their transferable patterns in the Tartarus library:

- active vs legacy surface routing;
- prompt/model control plane;
- evidence-driven review;
- observability-first debugging;
- narrow tests and low mocking;
- explicit deployment/config discipline.

Do not import Jobilla-specific paths, Doppler commands, GitLab workflow, or
recruitment-domain vocabulary into active Tartarus instructions unless the task
explicitly concerns Jobilla.

## Agent-Specific Mirrors

Claude, Codex, Gemini, and Cursor may need their own entry files, but those
should mirror or point back to this guide. Avoid maintaining independent,
conflicting copies.

Recommended precedence:

1. current source code;
2. this `AGENTS.md`;
3. repo-local skills under `.agents/skills/`;
4. agent-specific mirrors under `.claude/skills/`, `.cursor`, `.gemini`, or
   `~/.codex`;
5. historical library notes.

