---
name: tartarus-journal-mcp
description: Tartarus journaling and living Repository overview memory through MCP and Kronus. Use whenever the user mentions journal entries, Entry 0, Repository overview, documenting a commit, Tartarus MCP, kronus_ask, journal visuals, infographics, screenshots, registry, repository documents, git history in Tartarus, or wants Cursor (local) to validate code against written project memory. Use after commits, before shipping docs, or when consolidating “journal vs overview vs library” confusion. Pairs with the Tartarus MCP server (src/) — skills describe intent; tools execute writes.
---

# Tartarus journal + MCP (unified playbook)

This skill is the **human + agent contract** for how Tartarus memory work should flow. **MCP tools** are the write/read API; this file explains **when to use which** and how it fits **Kronus** (web) vs **Cursor** (local).

## Roles: who decides what

- **Cursor (local)** — Suggests and validates against the **real tree** (read/grep). It is the **adversarial checker**: “does the repo still match what Entry 0 claims?” It does **not** silently become source of truth.
- **Kronus / you** — **Ultimate decider.** Merge suggestions, reject drift, choose when to persist.
- **MCP / DB** — Persistence for journal rows, Repository overviews (Entry 0), registry, backups (see tool list below).

If Cursor and a journal entry disagree, **trust the tree first**, then update narrative or technical sections with explicit tools — never “paper over” without a conscious merge.

## “Auto mode” (target vs today)

**Target (what we are converging on):**

1. After a meaningful **journal entry**, optionally **enqueue** a **Repository overview reconcile** (debounced per repo): feed recent entries + current Entry 0; **Cursor** validates against code; **Kronus/you** approve; one write updates `repository_overviews`.
2. **Empty Entry 0** — bootstrap with a **fixed schema** (technical blocks + narrative summary) so every repo looks the same in the index.
3. **Infographic / mood** — follow **`journal-visual`** (prompt): auto-decide after a journal entry or on demand.

**Today (code as of this skill):** post-journal **automatic** Entry 0 sync is **not** wired end-to-end; Reader **`POST /api/repository-overviews/analyze`** (legacy: `/api/project-summaries/analyze`) and MCP **`journal_update_project_technical` / `journal_submit_summary_report`** are the main **on-demand** paths. **`journal_create_entry`** and **`POST /api/kronus/generate`** inject **Repository overview + prior journal rows on the same branch** into the Kronus prompt. When implementing auto mode, **reuse one internal “sync Repository overview”** callable from MCP, web, and hooks — keep this skill text aligned with that module once it exists.

## Chat log — do we keep tool traffic?

**Yes, in the web Hourglass / chat path (loss reduction).**

- Append-only **`chat_log`** on `chat_conversations`: tool calls, tool results, shelf adds, muse events, session resumes (see `web/lib/chat-log.ts`).
- Kronus can read a **serialized slice** of that log in the next turn (`buildChatLogBlock` in `web/app/api/chat/route.ts`) so “what tools actually ran” is not only in the visible transcript.

**MCP / Claude Code sessions** do not automatically write into `chat_log`; that is **web DB**. For agent work outside the web UI, rely on **journal entries** + **Entry 0** + **registry** as the durable trail, or paste summaries into a conversation you save.

## Four pillars (expand beyond “create journal”)

| Pillar | Intent | Primary MCP / surface |
|--------|--------|------------------------|
| **Create / edit journal entry** | Commit-scoped truth | `journal_create_entry` (+ regenerate flows if you add them). Resource: `journal://entry/{commit_hash}` |
| **Create / edit Repository overview (Entry 0)** | Living repo memory | `journal_create_project_summary`, `journal_update_project_technical`, `journal_submit_summary_report`. Resources: `journal://project-summary/{repo}`, `/deep` |
| **Ask Kronus** | RAG / oracle over Tartarus memory | `kronus_ask` |
| **Create infographic (auto + on demand)** | Visual journal + comms | `journal_generate_image`, `journal_attach_screenshot` (localhost); prompt **`journal-visual`** after entries when a visual helps |

## What else Tartarus MCP gives you (better than “only journal”)

Use these when the task is not just journaling:

- **`kronus_ask`** — Cross-cut questions over journal + docs + summaries.
- **`registry_search_objects` / `registry_fetch_object`** — Find something when you do not know if it is a journal row, document, or media UUID.
- **Repository writes** — `repository_create_document`, `repository_update_document`, `repository_create_from_report`, `repository_upload_media` (CV, prompts, notes, portfolio — **not** a substitute for Entry 0).
- **`git_read`** — Still registered on MCP for generic Tartarus use. For **journal-writing sessions**, prefer **not** leaning on it: the coding agent already has git; keep MCP context **repository-scoped** (journal + Entry 0 + library for that repo only). Product policy may later hide or gate `git_read` for journal-only profiles.
- **Resources** — `journal://…`, `repository://…`, `registry://…`, Linear/Slite caches as listed in MCP `tartarus` prompt (read-heavy workflows).

**Not on MCP (web app):** Linear/Slite/Notion **mutations** and sync apply — plan in `web/`, not MCP.

## Naming: Repository (concept) vs tables

- **Concept:** one **Repository** = canonical **overview** (SQLite / Drizzle: `repository_overviews`, keyed by `repository` string) + **journal entries** (each row has `repository` + **`branch`** per commit) + optional **library** documents keyed separately.
- **Legacy:** MCP tool IDs still use `project_summary` / `journal_*_project_summary` naming; rows and UI say **Repository overview**.

## Target flow (Kronus-led journal + images) — not fully wired yet

**Intent:** When asked to create or edit a journal narrative, **Kronus** sees technical + journal context, decides **create vs edit** an entry, and whether to **attach or refresh** an image (Muse / `generate_image` / `link_artifact` / `update_media` on web). The **coding agent** gets explicit **confirmation** for destructive or ambiguous steps. **Progressive updates** beat “rewrite the whole show” for small edits.

**Web today:** rich tools + `chat_log`; **MCP today:** discrete tools (`journal_create_entry`, etc.) without one orchestrated “journal writer” tool — implement a thin MCP facade or document the exact sequence until then.

## Repository overview (Entry 0) and **main** branch — policy vs code

**Policy you want:** the **Repository overview** (Entry 0 / `repository_overviews`) reflects **`main` only**, updated **manually** after a confirmed merge to `main`, so feature-branch experiments do not rewrite canonical technical truth.

**What the code does today:**

| Area | Reality |
|------|--------|
| `repository_overviews` schema | **No `branch` column** — one row per `repository` string only. |
| `POST /api/repository-overviews/analyze` | Reader **Analyze**: loads recent `journal_entries` (`WHERE repository = ?`, no branch filter) + current overview; optionally runs **Cursor delegate** on a matched local clone (`CURSOR_API_KEY` + delegate repos) then **Sonnet** merges into `repository_overviews`. Body `skip_cursor: true` skips the tree step. |
| MCP Entry 0 tools | Same — they read/update the single summary row for a repo; no branch dimension. |
| Journal rows | Each entry **stores `branch`**; list APIs can filter by branch. |

**Gap to close for your model:** add **`overview_branch`** (default `main`) or filter analyze + auto-sync to **`branch = main`** (or “default branch” config), and/or store **`last_overview_commit_main`** metadata. Until then, **process discipline** (only run analyze / Entry 0 updates after merge) is the guardrail.

## Images and attachments — reality check

- **Journal images:** `entry_attachments` are tied to **`commit_hash`** → `journal_entries` with **`ON DELETE CASCADE`**. Deleting a journal row **would** remove attachment rows today — differs from “never delete bytes, only detach” unless you change schema/triggers.
- **Media library:** `update_media` / `link_artifact` (web tools) support **relinking and metadata updates** for **media_assets**; journal-specific blobs live in `entry_attachments` — unify “edit image in place” story in code before the skill promises one path.

## Skill-creator checklist (this folder)

Followed: YAML `name` + **pushy** `description`, `SKILL.md` body under 500 lines, optional **`evals/evals.json`** with starter prompts, pointer from **`.agents/skills/tartarus-journal-workflow`**.

Not done (full **skill-creator** loop): baseline vs with-skill runs, **`eval-viewer/generate_review.py`**, assertion JSON, description-improver script. Add those when you want measurable trigger quality.

## Minimal workflow cheat sheet

1. Commit with a clear message → **`journal_create_entry`** with paths in `raw_agent_report`.
2. If Entry 0 missing → **`journal_create_project_summary`** (tier-1 sections).
3. If code/layout/stack changed → **`journal_update_project_technical`** (by section).
4. If narrative/status/purpose changed → **`journal_submit_summary_report`**.
5. Optional: **`journal-visual`** prompt → screenshot / infographic / mood.
6. Stuck or exploring? **`registry_search_objects`** then **`kronus_ask`**.

## Consistency with repo docs

- Agent-oriented copy also lives under **`.agents/skills/tartarus-journal-workflow/`** (four-layer model). This `.claude/skills/…` file is the **MCP + Kronus + Cursor** expansion; keep them in sync when behavior changes.

When README, MCP tool descriptions, and this skill disagree, **trust the code**, then update the skill.
