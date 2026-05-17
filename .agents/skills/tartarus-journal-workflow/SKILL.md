---
name: tartarus-journal-workflow
description: Use when working inside the Tartarus repo and the task touches commits, journal entries, Entry 0 project summaries, MCP workflows, registry access, or repository documents. This skill aligns the repo's actual workflow: journal entries document commits, Entry 0 is the living project summary, repository holds documents, and registry is the universal discovery layer.
---

# Tartarus Journal Workflow

**Claude Code (`.claude/skills/`):** For the expanded playbook — Kronus vs Cursor roles, auto mode direction, chat log, infographics, and full MCP tool map — use **`tartarus-journal-mcp`** at `.claude/skills/tartarus-journal-mcp/SKILL.md`. This agents skill stays the **short four-layer model**; keep both aligned when behavior changes.

Use this skill when the user is asking about how work should be documented in Tartarus, how to update project memory after code changes, how commits relate to journal entries, or how MCP tools/resources should be used in this repo.

## Core model

Treat Tartarus as four related layers:

1. `journal entry`
   A commit-scoped record of what changed, why, decisions, technologies, and optional files changed.

2. `Entry 0 / project summary`
   The living project document for a repository. This is the canonical project memory.

3. `repository`
   Documents, prompts, notes, CV, portfolio, and media. These are content objects, not Entry 0.

4. `registry`
   The universal discovery index across journal entries, project summaries, repository documents, conversations, media, CV items, and synced external objects.

Do not collapse `repository` and `registry` into one concept.
- `repository` is where content lives.
- `registry` is how objects are discovered and fetched across the whole system.

## Entry 0 rules

Entry 0 is the "living, breathing" project summary.

Use:
- `journal_create_project_summary` when a repository has no Entry 0 yet.
- `journal_update_project_technical` when technical reality changed.
- `journal_submit_summary_report` when narrative/project-state sections changed.

Technical sections are things like:
- `file_structure`
- `tech_stack`
- `patterns`
- `commands`
- `architecture`
- `frontend`
- `backend`
- `database_info`
- `services`
- `data_flow`
- `custom_tooling`

Narrative sections are things like:
- `summary`
- `purpose`
- `key_decisions`
- `technologies`
- `status`
- `extended_notes`

Do not use repository document tools as a substitute for Entry 0.
`repository_create_from_report` is for `note` and `prompt` documents, not for project summaries.

## Commit and journal workflow

When work in this repo is being documented:

1. Inspect the actual code change or commit context.
2. Determine whether the change should produce:
   - a new journal entry
   - an Entry 0 technical update
   - an Entry 0 narrative update
   - a repository document update
3. Prefer updating Entry 0 when the project's technical map changed materially.
4. Prefer a journal entry when documenting a specific unit of work tied to a commit.

Typical pattern:
- commit or meaningful code change happens
- create `journal_create_entry`
- if architecture / commands / stack / structure changed, also run `journal_update_project_technical`
- if status / purpose / high-level framing changed, also run `journal_submit_summary_report`

## MCP tool selection

Use these tools/resources intentionally:

### Journal
- `journal_create_entry`
- `journal_list_by_repository`
- `journal_list_by_branch`
- `journal_create_project_summary`
- `journal_update_project_technical`
- `journal_submit_summary_report`
- `journal_list_project_summaries`
- `journal://entry/{commit_hash}`
- `journal://project-summary/{repository}`
- `journal://project-summary/{repository}/deep`

### Repository
- `repository_search_documents`
- `repository://document/{slug_or_id}`
- `repository_create_document`
- `repository_update_document`
- `repository_create_from_report`

### Registry
- `registry_search_objects`
- `registry_fetch_object`
- `registry://object/{uuid}`
- `registry://source/{source_table}/{source_id}`

Use registry when the user wants:
- universal search across Tartarus
- to find an object without knowing which subsystem it belongs to
- a UUID-driven fetch flow

Use repository tools/resources when the user already knows they want a document/CV/portfolio object specifically.

## File and binary access

For attachments and media:
- fetch metadata through MCP tools/resources
- use `download_url` for raw file access
- do not try to inline large binary data into normal MCP responses

If an object is binary-backed, prefer:
- registry fetch for discovery/metadata
- `download_url` for bytes

## Repository-specific expectations

Inside the Tartarus repo, preserve these distinctions:
- `journal entry` documents a change
- `Entry 0` captures project state over time
- `repository` stores durable content objects
- `registry` unifies discovery over all of it

When explaining the system to the user, state these distinctions plainly instead of speaking abstractly.

When updating docs or prompts, keep the MCP surface aligned with the actual code. If the README, skill text, and registered tools disagree, trust the code first and fix the docs.
