# Tartarus

A dual-interface platform (MCP server + web app) for structured, AI-powered journaling, project documentation, and personal knowledge management.

## What This Is

1. **MCP Server** (`src/`) - 22 tools, 26 resources, and 3 prompts for AI agents (Claude Code, Cursor, etc.) to create journal entries, manage project summaries, query documents, and interact with Linear
2. **Tartarus Web App** (`web/`) - Dark-themed dashboard with AI chat (Kronus), journal reader, text correction, translation, and a unified knowledge repository

### Key Features

- **Object Registry** - Universal UUID-based index for every data object. Two generic tools (`search` + `fetch`) give Kronus uniform access to all 1400+ objects across 14 types
- **Agentic Kronus** - Knowledge oracle with tool-calling (AI SDK 6.0 `stepCountIs`). Uses `search`/`fetch` to drill into data instead of static prompts
- **Structured journal entries** linked to git commits with AI-generated summaries
- **Entry 0 v2 (Living Project Summary)** - Schema-driven project documentation with section history tracking and shallow/deep views
- **Kronus Chat** - Multi-model AI conversations (Gemini 3.1 Pro, Claude Opus 4.6/4.7, GPT-5.4) with 85+ integrated tools
- **Kronus Skills** - On-demand context loading (Developer, Writer, Job Hunter, Almighty) — starts lean, loads context when needed
- **Daimon** - Inline polish-before-send writing assistant (Cmd+Enter). Word-level diff, correction history, translation support
- **Atropos** - AI spellchecker and text correction with inline diff view
- **Hermes** - AI translation tool
- **Library** - Unified knowledge base for writings, prompts, notes, CV (skills, experience, education), portfolio projects, and AI integration memory
- **Linear integration** - Synced Linear projects and issues with manual + automated hourly sync
- **Slite integration** - Synced knowledge base notes
- **Notion integration** - Synced workspace pages
- **Google Workspace** - Drive, Gmail, Calendar integration (read + write)
- **Media library** - Images, diagrams, PDFs linked to entries or standalone
- **Git integration** - Read-only GitHub/GitLab repo browsing (file tree, file contents)
- **Observability** - AI usage tracking (traces, tokens, costs, latency)
- **Snapshot History** - Append-only version tracking for all registry objects

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐
│   AI Agents     │     │       Humans         │
│ (Claude, etc.)  │     │                      │
└────────┬────────┘     └──────────┬───────────┘
         │                         │
         ▼                         ▼
┌─────────────────┐     ┌──────────────────────┐
│   MCP Server    │     │   Tartarus Web App   │
│                 │     │                      │
│ • 22 tools      │     │ • Kronus Chat (AI)    │
│ • 26 resources  │     │ • Journal Reader      │
│ • 3 prompts     │     │ • Daimon / Atropos    │
│ • Kronus oracle │     │ • Library Browser     │
│   (agentic,     │     │ • Linear/Slite/Notion │
│    search+fetch)│     │ • Google Workspace    │
└────────┬────────┘     └──────────┬───────────┘
         │                         │
         └───────────┬─────────────┘
                     ▼
       ┌──────────────────────────┐
       │       SQLite DB          │
       │      (journal.db)        │
       │                          │
       │  tartarus_objects (UUID) │
       │  tartarus_object_history │
       │  journal_entries         │
       │  chat_conversations      │
       │  documents / prompts     │
       │  linear / slite / notion │
       │  skills / experience     │
       └──────────────────────────┘
```

**Data flow:** External APIs → Tartarus sync → SQLite → Object Registry (UUID) → MCP resources. Every data object gets a UUID on ingestion and is searchable/fetchable by Kronus.

## Object Registry

Every data object in Tartarus gets a UUID via the `tartarus_objects` table — a universal index that sits alongside existing tables without modifying them.

```
tartarus_objects
  uuid          TEXT PRIMARY KEY
  type          TEXT    (journal_entry, document, conversation, linear_issue, ...)
  source_table  TEXT    (the actual SQLite table)
  source_id     TEXT    (the original ID — commit hash, slug, integer, external ID)
  title         TEXT
  summary       TEXT
  tags          TEXT    (JSON array)
  importance    INTEGER (1-5)
```

**Two generic tools** replace 7+ specific lookup tools:
- **`search(query, type?)`** — Full-text search across title, summary, tags
- **`fetch(uuid)`** — Resolves type → reads from source table → returns full content

**Snapshot history** (`tartarus_object_history`) tracks changes with append-only versioning — each update saves the previous state with `changed_by` and `change_summary`.

**Ingestion hooks** on all pathways: documents, conversations, Linear/Slite/Notion sync, CV data, media, prompts, journal entries. Backfill script for existing data: `npx tsx web/scripts/backfill-object-registry.ts`.

**Batch summarization:** `POST /api/conversations/summarize-batch` — dynamic token budget (24K ceiling), flash-lite model, writes tags + importance back to registry.

## Quick Start

### Option 1: Docker (Recommended)

```bash
cp .env.example .env
# Edit .env with your API keys

docker compose up -d
# Access at http://localhost:3777
```

### Option 2: Local Development

```bash
# MCP server
npm install && npm run build

# Web app
cd web && npm install
export JOURNAL_DB_PATH="/path/to/data/journal.db"
export GOOGLE_GENERATIVE_AI_API_KEY="your-key"
npm run dev
# Access at http://localhost:3005
```

## MCP Server

The MCP server is **read-only** for cached data, with write tools that go through the Tartarus API.

### Tools (22)

**Journal (10):**

| Tool | Description |
|------|-------------|
| `journal_create_entry` | Create journal entry for a git commit |
| `journal_list_by_repository` | List entries with pagination |
| `journal_list_by_branch` | List entries by branch |
| `journal_create_project_summary` | Create Entry 0 — agent fills Tier 1/2/3 schema directly |
| `journal_update_project_technical` | Update technical sections with history tracking |
| `journal_submit_summary_report` | Update narrative sections (AI-assisted or direct) |
| `journal_list_project_summaries` | List all Repository overview (Entry 0) rows |
| `journal_list_media_library` | Query unified media assets |
| `registry_search_objects` | Search the unified Tartarus object registry |
| `registry_fetch_object` | Fetch a registry object by UUID or source reference |

**Library (9):**

| Tool | Description |
|------|-------------|
| `repository_search_documents` | Search documents with filters and pagination |
| `repository_create_document` | Create notes or prompts |
| `repository_update_document` | Update existing documents |
| `repository_create_from_report` | Create document from free-form agent report (AI extracts structure) |
| `repository_list_skills` | List CV skills by category |
| `repository_list_experience` | List work experience |
| `repository_list_education` | List education history |
| `repository_list_portfolio_projects` | List portfolio projects |
| `repository_upload_media` | Upload media assets |

**Kronus (3):**

| Tool | Description |
|------|-------------|
| `kronus_ask` | Ask the knowledge oracle (quick or deep mode) |
| `kronus_history` | Get recent Kronus conversations |
| `kronus_stats` | AI observability stats (traces, tokens, costs) |

### Resources

**Journal (7):**

| URI | Description |
|-----|-------------|
| `journal://repositories` | List all repositories |
| `journal://project-summary/{repository}` | Entry 0 shallow view (flat, token-efficient) |
| `journal://project-summary/{repository}/deep` | Entry 0 deep view (full section history) |
| `journal://entry/{commit_hash}` | Get journal entry |
| `journal://branches/{repository}` | List branches |
| `journal://attachments/{commit_hash}` | List entry attachments |
| `journal://attachment/{id}` | Get attachment metadata |

**Registry (2):**

| URI | Description |
|-----|-------------|
| `registry://object/{uuid}` | Fetch any registry object by UUID |
| `registry://source/{source_table}/{source_id}` | Fetch any registry object by source reference |

**Library (7):**

| URI | Description |
|-----|-------------|
| `repository://document/{slug_or_id}` | Get document content |
| `repository://tags` | List all document tags |
| `repository://documents/{type}` | List documents by type (writing/prompt/note) |
| `repository://portfolio-project/{id}` | Get portfolio project |
| `repository://cv/skills` | Technical skills |
| `repository://cv/experience` | Work history |
| `repository://cv/education` | Education history |

**Linear Cache (7):**

| URI | Description |
|-----|-------------|
| `linear://cache/stats` | Cache statistics |
| `linear://projects` | List cached projects |
| `linear://project/{id}` | Get project details |
| `linear://issues` | List cached issues |
| `linear://issue/{identifier}` | Get issue details |
| `linear://project/{projectId}/updates` | Project status updates |
| `linear://project-updates` | All project updates |

**Observability (3):**

| URI | Description |
|-----|-------------|
| `observability://chats` | Kronus chat history |
| `observability://traces` | AI traces |
| `observability://stats` | AI usage statistics |

### Prompts (3)

| Prompt | Description |
|--------|-------------|
| `create-entry` | Guide for creating journal entries |
| `update-summary` | Guide for updating project summaries (Entry 0 v2) |
| `explore-repo` | Guide for exploring repositories |

## Tartarus Web App

### Pages

| Page | Description |
|------|-------------|
| **Chat** | AI conversations with Kronus — 7 model options, 85+ tools, skills-driven context, Daimon polish (Cmd+Enter) |
| **Reader** | Browse journal entries with filtering, search, attachment viewer, mermaid diagrams |
| **Atropos** | AI text correction with inline diff view and change navigation |
| **Hermes** | AI translation tool |
| **Library** | Unified knowledge base — documents, CV, portfolio, media, AI integrations (tabbed layout) |
| **Prompts** | Prompt management with versioning and project organization |
| **Integrations** | Linear, Slite, Notion sync with preview/approve workflow |
| **Multimedia** | Media library with Mermaid diagram editor |

### Kronus Skills (On-Demand Context)

Kronus starts **lean** (~6k tokens) — just the soul prompt and write protocol. Context and tools are loaded on-demand through Skills, which are stored as documents in the DB (`type="prompt"`, `metadata.type="kronus-skill"`).

Skills stack additively — activating multiple merges their context via OR logic. No conflicts possible.

| Skill | Soul Context | Tools | Use Case |
|-------|-------------|-------|----------|
| **Developer** | Journal, Linear | Linear, Git, Web Search | Coding sessions |
| **Writer** | Writings | Journal, Repo, Media, Image Gen, Web Search | Creative work |
| **Job Hunter** | CV, Portfolio, Journal, Linear | Journal, Repo, Linear, Media, Web Search | Job applications |
| **Almighty** | Everything | Everything | Full access |

New skills can be added to the database — Kronus discovers them dynamically at runtime.

### Chat Models

| Model | Context | Provider | Notes |
|-------|---------|----------|-------|
| Gemini 3.1 Pro | 1M tokens | Google | Default |
| Gemini 3.1 Flash Lite | 1M tokens | Google | Ultra-fast, cheapest |
| Claude Sonnet 4.6 | 1M tokens | Anthropic | Best value |
| Claude Opus 4.6 | 1M tokens | Anthropic | Stable flagship |
| Claude Opus 4.7 | 1M tokens | Anthropic | Latest Opus |
| GPT-5.4 | 400K tokens | OpenAI | Extreme reasoning |
| GPT-5.3 Instant | 400K tokens | OpenAI | Fast chat |

**Kronus MCP (askKronus)** uses flash-lite 3.1 (quick), flash (deep), Opus 4.6 (serious) — optimized for speed and cost.

### Daimon (Writing Assistant)

Inline polish-before-send plugin for the chat input. Merges Atropos (grammar) + Hermes (translation) into one flow:

- **Cmd+Enter** triggers Daimon when enabled (toggle in header bar)
- Shows word-level diff panel with corrections highlighted
- Three actions: **Accept** (edit in place), **Send as-is**, **Send polished**
- Correction history viewer with date and status
- Clean text → no interruption when text has no errors

## Key Concepts

### Entry 0 v2 (Living Project Summary)

A schema-driven, evolving knowledge base for each project. The coding agent IS the scanner — it fills the schema directly, no AI normalization needed.

**Architecture:** Each section carries `current` state + evolution `history[]` with timestamps and commit refs.

**Tier 1 (Required):** `file_structure`, `tech_stack`, `patterns`, `commands`, `architecture`

**Tier 2 (Optional):** `frontend`, `backend`, `database_info`, `services`, `data_flow`

**Tier 3 (Optional):** `custom_tooling`, `purpose`, `summary`

**Narrative sections** (updated via Kronus): `summary`, `purpose`, `key_decisions`, `technologies`, `status`, `extended_notes`

**Two views:**
- **Shallow** (`journal://project-summary/{repo}`) — Flat current values, token-efficient for LLM context
- **Deep** (`journal://project-summary/{repo}/deep`) — Full history timeline per section

### Journal Entry Structure

```
Workspace/project slug (stored in the journal `repository` field, e.g., "my-project")
  └── Branch (e.g., "main")
      └── Entry (commit_hash: "abc1234")
          ├── why, what_changed, decisions
          ├── technologies, kronus_wisdom
          └── files_changed: [{ path, action, diff_summary }]
```

### Document Types

Documents have two-level categorization:
- **Primary Type**: `writing`, `prompt`, `note`
- **Tags**: Additional labels in `metadata.tags`

## Configuration

### Environment Variables

```bash
# AI Providers (at least one required for Kronus chat)
GOOGLE_GENERATIVE_AI_API_KEY=your-key    # Gemini 3 Pro/Flash
ANTHROPIC_API_KEY=your-key                # Claude Opus/Haiku
OPENAI_API_KEY=your-key                   # GPT-5.2

# Database
JOURNAL_DB_PATH=/path/to/journal.db       # Optional, defaults to ./data/journal.db

# Web App URL (for MCP → Tartarus API calls)
TARTARUS_URL=http://localhost:3005

# Optional integrations
LINEAR_API_KEY=lin_api_...                # Linear project management
MCP_API_KEY=your-mcp-key                  # Authenticated MCP requests
GITHUB_TOKEN=ghp_...                      # GitHub repo browsing
GITLAB_TOKEN=glpat-...                    # GitLab repo browsing
GITLAB_HOST=https://gitlab.com            # GitLab instance URL

# Optional integrations (continued)
SLITE_API_KEY=your-slite-key             # Slite knowledge base
NOTION_API_KEY=your-notion-key           # Notion workspace pages
GOOGLE_CLIENT_ID=...                      # Google Workspace (Drive, Gmail, Calendar)
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...

# Optional AI features
REPLICATE_API_TOKEN=r8_...                # Image generation (FLUX, Imagen)
PERPLEXITY_API_KEY=pplx-...              # Web search

# Agent Configuration
AGENT_NAME=Kronus                         # Name of your AI agent (default: "Kronus")
AGENT_SOUL_PATH=Soul.xml                 # Path to agent personality file
```

### MCP Client Setup

**Migrating from Developer Journal:** Update MCP client configs to the key `tartarus`, point `args` at this repo's `dist/index.js` (after `npm run build`), and use the `tartarus` npm binary if you link globally. Ensure root [`package.json`](package.json) **`name`** is `tartarus-workspace` — the MCP server resolves the monorepo root from that field; the legacy name `developer-journal-workspace` is no longer recognized in code.

**Claude Desktop / Cursor / VS Code / Claude Code:**
```json
{
  "mcpServers": {
    "tartarus": {
      "command": "node",
      "args": ["/absolute/path/to/your-clone/dist/index.js"]
    }
  }
}
```

Platform-specific config locations:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Cursor**: `~/.cursor/mcp.json`
- **Claude Code**: `~/.claude/settings.json`

## Agent Configuration

The system supports customizing the AI agent name and personality file.

- `AGENT_NAME`: Name of your AI agent (default: "Kronus")
- `AGENT_SOUL_PATH`: Path to agent prompt file (default: "Soul.xml")

The Soul file defines the agent's personality, communication style, knowledge frameworks, and interaction protocols. The name appears throughout the UI (chat, context selector, API responses).

## Linear Sync

Linear data is synced to a local SQLite cache. Two sync methods:

- **Manual**: "Sync Linear" button in the Skills popover (Advanced Config section)
- **Automated (macOS only)**: A launchd plist at `config/com.tartarus.linear-sync.plist` runs an hourly `curl` against `localhost:3005`. The sync endpoint is accessible without auth from localhost only.

To install the automated sync:

```bash
ln -sf "$(pwd)/config/com.tartarus.linear-sync.plist" ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.tartarus.linear-sync.plist
```

To stop: `launchctl unload ~/Library/LaunchAgents/com.tartarus.linear-sync.plist`

Logs: `/tmp/tartarus-linear-sync.log`

> **Note**: The automated sync requires Tartarus to be running on port 3005. If the server is down, the curl silently fails — no harm done. If you fork this repo, the launchd plist is not installed automatically; use the manual sync button instead.

## Testing

```bash
npm test                    # All tests (43 total)
npm run test:registry       # Object registry unit tests (23)
npm run test:mcp            # MCP integration tests (20)
```

**Registry tests** (`tests/object-registry.test.ts`): register, lookup, search, snapshot/history, constraints, cascading deletes — runs against in-memory SQLite.

**MCP integration tests** (`tests/mcp-integration.test.ts`): build verification, DB health, all table existence, UUID integrity (format + uniqueness), registry population, environment validation.

## Development

```bash
# MCP server
npm run build      # Build (esbuild → dist/index.js)
npm run dev        # Watch mode
npm test           # Run test suite

# Web app
cd web
npm run dev        # Dev server on :3005
npm run build      # Production build

# Both (via Makefile)
make dev           # Start Tartarus dev server
make build         # Build MCP server

# Docker
docker compose up -d --build
docker compose logs -f tartarus

# Object registry backfill (run once after fresh setup)
JOURNAL_DB_PATH=./data/journal.db npx tsx web/scripts/backfill-object-registry.ts
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| MCP Server | TypeScript, MCP SDK, better-sqlite3, esbuild |
| Web App | Next.js 16, React, Tailwind CSS, shadcn/ui |
| AI | Vercel AI SDK 6.0, Google Gemini, Anthropic Claude, OpenAI GPT |
| Database | SQLite (shared between MCP and web), UUID object registry |
| ORM | Drizzle (web), raw SQL (MCP) |
| Integrations | Linear, Slite, Notion, Google Workspace, GitHub, GitLab, Replicate, Perplexity |
| Testing | Node.js assert + tsx (43 tests) |

## License

This project is licensed under the MIT License — see `LICENSE`.

## Attribution

- Created and maintained by **Guillermo Stumpf**
- Organization: **Ouroboros Creative Collective**
- Role: **Founder / solo builder**
- Built in public as an open-source project, co-built with AI tooling

## Third-Party Licenses

Third-party components included in this repository keep their original licenses.

- Anthropic `skill-creator`: `/.claude/skills/skill-creator/LICENSE.txt`
