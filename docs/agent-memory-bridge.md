# Agent memory bridge (AI Library integrations)

This document ties the **product vocabulary** (Library, Document, Journal Repository, Kronus Skill, Personal Skill (CV), AI Skill, AI Settings) to the **implementation** that indexes external agent data in Tartarus.

## What is implemented today

| Concept | Where it lives |
|--------|----------------|
| **AI Settings** + **AI Skill** ingest + normalized **log sessions** | [`web/lib/ai-integrations.ts`](../web/lib/ai-integrations.ts) — scans Codex, Claude Code, Gemini CLI, Cursor (and CodeRabbit status). |
| **Registry UUIDs** | [`tartarus_objects`](../web/lib/object-registry.ts) with `source_table` values `ai_integrations`, `ai_artifacts`, `ai_log_sessions`. |
| **SQLite tables** | `ai_integrations`, `ai_artifacts`, `ai_log_sessions`, `ai_log_events`, `ai_proposals` — see migration [`web/lib/db/migrations/017_ai_integrations.sql`](../web/lib/db/migrations/017_ai_integrations.sql). |
| **API** | `GET /api/ai-integrations`, `POST /api/ai-integrations/scan`, artifacts/sessions/proposals sub-routes under [`web/app/api/ai-integrations/`](../web/app/api/ai-integrations/). |
| **Kronus chat tools** | `ai_integrations_list`, `ai_artifacts_list`, `ai_log_sessions_list` in [`web/lib/ai/tools.ts`](../web/lib/ai/tools.ts) + executors in [`web/lib/ai/tool-executors/ai-integrations.ts`](../web/lib/ai/tool-executors/ai-integrations.ts). |
| **MCP (journal server)** | Same surface exposed from [`src/modules/journal/tools.ts`](../src/modules/journal/tools.ts) for parity. |
| **Library UI** | Tab **AI integrations** on [`web/app/(dashboard)/library/page.tsx`](../web/app/(dashboard)/library/page.tsx). |

## On-disk roots (defaults)

Paths use `~` for the home directory. Override per agent via optional config (below).

| Agent | Config (AI Settings) | Sessions / transcripts | AI Skills |
|-------|--------------------|-------------------------|-----------|
| Codex | `~/.codex/config.toml` | `~/.codex/sessions` (rollout `*.jsonl`) | `~/.codex/skills` |
| Claude Code | `~/.claude.json`, `~/.claude/settings.json` | `~/.claude/projects` (`*.jsonl`) | `~/.claude/skills` |
| Gemini CLI | `~/.gemini/settings.json` | `~/.gemini/tmp/**/chats/session-*.json` | — |
| Cursor | `~/.cursor/mcp.json` | `~/.cursor/projects/**/agent-transcripts/*.jsonl` | `~/.cursor/skills-cursor/**/SKILL.md` |

Secrets in config files are **redacted** before persistence (`redactSecrets` in `ai-integrations.ts`).

## Optional path overrides: `TARTARUS_AGENT_SOURCES`

Set the environment variable to an **absolute path** to a **JSON** file (not YAML — no extra dependency). Tartarus merges overrides into the built-in integration definitions at **scan** time.

Example file: [`docs/examples/agent-sources.json`](examples/agent-sources.json).

Fields:

- **`integrations`** — optional keys: `codex`, `claude_code`, `gemini_cli`, `cursor`, `coderabbit`. Each value may include `sessionRoots`, `skillRoots`, `configPaths` (arrays of strings; `~` allowed).
- **`workspaces`** — optional list of `{ "pathPrefix": "/absolute/path/to/repo", "repository": "tartarus-workspace" }`. When a session file path starts with `pathPrefix`, the scan stores `journalRepository` on that session’s metadata for filtering and Kronus context.

Restart the Next dev server after changing env vars.

## How to run a scan

1. Start the web app (`cd web && npm run dev`, default port **3005**).
2. `POST /api/ai-integrations/scan` (no body) — from curl, the Library UI, or automation.
3. Inspect **Library → AI integrations** or use the **`ai_*`** chat tools / MCP tools.

## Journal Repository vs Library

- **Journal Repository** — the `repository` string on journal entries and Entry 0 (`repository_overviews`): which **codebase / product** the work belongs to.
- **Library** — the umbrella for all Tartarus-stored knowledge, including this AI index. It is **not** the same word as journal `repository`.

## Roadmap (from plan; not all shipped here)

- Hourly cron / secured job calling scan.
- Unifying **ingested agent chats** with `chat_conversations` / `memory_*` tools if you want one list UX.
- **Library** route cleanup: legacy `/repository` deep links may still exist; prefer `/library`.

## MCP wiring (operators)

See [`.claude/skills/agentic-management/SKILL.md`](../.claude/skills/agentic-management/SKILL.md) for Claude Code, Codex, and Gemini MCP entries pointing at `dist/index.js`.
