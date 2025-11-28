# Developer Journal Workspace

**An MCP server that transforms your git commits into structured, AI-powered developer journals.**

Capture the *why* behind your code, document decisions, track technologies, and preserve the wisdom that emerges from your work—all automatically analyzed and stored for future reference.

## 🎯 What We're Building

This is a **Model Context Protocol (MCP) server** that enables any AI agent to create structured developer journals from git commits. Instead of losing context in commit messages or scattered notes, you get:

- **Structured documentation** of every commit
- **AI-powered analysis** that extracts meaning, decisions, and insights
- **Knowledge preservation** that survives beyond your memory
- **Rich attachments** for diagrams, images, and documentation
- **Project summaries** that capture high-level architecture and decisions

### The Problem It Solves

When you look back at code from 6 months ago, you often ask:
- *Why did we make this change?*
- *What problem were we solving?*
- *What alternatives did we consider?*
- *What technologies did we evaluate?*

Traditional commit messages rarely capture this context. This journal system uses AI to extract and structure this information automatically, creating a searchable knowledge base of your development journey.

## 🧠 How the Journal Works

### The Workflow

1. **Your AI agent** (Claude, ChatGPT, Cursor, etc.) completes a task and makes a commit
2. **The agent calls** `journal_create_entry` with:
   - Git metadata (commit hash, repository, branch, author, date)
   - A raw report of what was done (the agent's own summary)
3. **Kronus analyzes** the commit using Claude Haiku 4.5 with a specialized persona
4. **Structured data is extracted**:
   - **Why**: The motivation and problem being solved
   - **What Changed**: Concrete modifications made
   - **Decisions**: Key decisions and their reasoning
   - **Technologies**: Tech stack, frameworks, or tools discussed/used
   - **Kronus Wisdom**: Optional philosophical reflection or insight (when genuine)
5. **Everything is stored** in SQLite with automatic backups

### Kronus: The AI Analyst

Kronus is an empathetic AI persona designed to understand code changes not just as technical modifications, but as human decisions with context, trade-offs, and meaning. It:

- Extracts the *why* behind changes, not just the *what*
- Identifies key decisions and their reasoning
- Recognizes when genuine insight emerges (Kronus Wisdom)
- Maintains consistency across entries while adapting to each project's context

The persona is defined in `Soul.xml` and guides the AI's analysis to be both technically accurate and contextually aware.

### Structured Data Model

Each journal entry contains:

```typescript
{
  commit_hash: string;        // Unique identifier
  repository: string;          // Project name
  branch: string;              // Git branch
  author: string;              // Committer
  date: string;                // ISO timestamp
  
  // AI-extracted fields:
  why: string;                 // Motivation and problem
  what_changed: string;        // Concrete changes
  decisions: string;            // Key decisions and reasoning
  technologies: string;         // Tech stack discussed/used
  kronus_wisdom: string | null; // Optional insight/reflection
  
  // Raw context:
  raw_agent_report: string;     // Original agent summary
  
  // Metadata:
  created_at: string;           // Entry creation timestamp
}
```

### Project Summaries: "Entry 0"

Beyond individual commits, you can create **project summaries** that capture:
- High-level architecture
- Core purpose and goals
- Major architectural decisions
- Technology choices
- Current project status

These serve as the "entry 0" for each repository—the overview that contextualizes all subsequent commits.

### Attachments: Rich Media Support

Attach files to any journal entry:
- **Images**: Screenshots, diagrams, architecture visuals
- **Mermaid diagrams**: System architecture, flowcharts
- **PDFs**: Documentation, research papers
- **Any file**: With descriptions explaining their purpose

Each attachment includes:
- Filename and MIME type
- Description (what it shows/explains)
- Base64-encoded data
- File size and upload timestamp

## 🚀 Features

### 📝 Developer Journal (16 Tools)

- **Entry Management**: Create, retrieve, list, and edit journal entries
- **AI Analysis**: Kronus-powered structured extraction from commit reports
- **Project Summaries**: High-level project documentation
- **Attachments**: Rich media support with descriptions
- **Repository Management**: List repositories, branches, rename repositories
- **Pagination**: All list operations support pagination for large datasets
- **MCP Truncation Compliant**: All tools respect common MCP limits (~256 lines / 10 KiB)

### 💬 Slack Integration (4 Tools)

- List channels with pagination
- Post messages to channels
- Reply to message threads
- Read channel history

### 📋 Linear Integration (5 Tools)

- Get your user info and teams
- List issues with powerful filtering
- Create issues with full field support
- Update issues (status, description, priority, assignee)

## 📦 Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Server

```bash
npm run build
```

### 3. Configure Environment

Copy `.env.example` to `.env` and configure at least one module:

```bash
cp .env.example .env
# Edit .env with your credentials
```

**Required for Journal module:** At least one AI provider (Anthropic, OpenAI, or Google)

### 4. Add to Your MCP Client Configuration

The configuration format depends on your MCP client. Here are examples for common clients:

**Cursor** (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "developer-journal": {
      "command": "node",
      "args": ["/absolute/path/to/Developer Journal Workspace/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "LINEAR_API_KEY": "lin_api_...",
        "SLACK_BOT_TOKEN": "xoxb-..."
      }
    }
  }
}
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):
```json
{
  "mcpServers": {
    "developer-journal": {
      "command": "node",
      "args": ["/absolute/path/to/Developer Journal Workspace/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "LINEAR_API_KEY": "lin_api_...",
        "SLACK_BOT_TOKEN": "xoxb-..."
      }
    }
  }
}
```

Replace `/absolute/path/to/` with your actual installation path.

## 🔧 Module Setup

### Slack Setup

1. Visit [Slack Apps](https://api.slack.com/apps)
2. Create New App → "From scratch"
3. Add Bot Scopes: `channels:read`, `channels:history`, `chat:write`, `users:read`
4. Install to Workspace
5. Copy Bot Token (`xoxb-...`) and Team ID

### Linear Setup

1. Go to Linear → Personal Settings → API → Personal API Keys
2. Create new key
3. Copy the key (`lin_api_...`)
4. **(Optional)** Set `LINEAR_USER_ID` to your Linear user ID for default assignee filtering in `list_issues`. Use the `linear_get_viewer` tool to find your user ID.

### Journal Setup

The Journal module requires at least one AI provider:

- **Anthropic (Recommended)**: Get API key from [console.anthropic.com](https://console.anthropic.com)
- **OpenAI**: Get API key from [platform.openai.com](https://platform.openai.com)
- **Google**: Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

## 📚 Usage Examples

### Create a Journal Entry

When your AI agent completes a task, it can create a journal entry:

```json
{
  "tool": "journal_create_entry",
  "arguments": {
    "commit_hash": "abc123def456",
    "repository": "my-awesome-project",
    "branch": "main",
    "author": "John Doe",
    "date": "2025-01-15T10:00:00Z",
    "raw_agent_report": "Added pagination to API endpoints. Implemented cursor-based pagination for better performance. Decided against offset-based pagination due to consistency issues with concurrent writes. Used PostgreSQL's LIMIT/OFFSET with cursor tracking."
  }
}
```

Kronus will analyze this and extract:
- **Why**: Need for better API performance and consistency
- **What Changed**: Cursor-based pagination implementation
- **Decisions**: Chose cursor over offset for consistency
- **Technologies**: PostgreSQL, cursor-based pagination
- **Kronus Wisdom**: (Optional insight if one emerges)

### List Entries with Pagination

```json
{
  "tool": "journal_list_by_repository",
  "arguments": {
    "repository": "my-awesome-project",
    "limit": 20,
    "offset": 0
  }
}
```

Each entry includes `attachment_count` showing how many files are attached.

### Attach a File to an Entry

```json
{
  "tool": "journal_attach_file",
  "arguments": {
    "commit_hash": "abc123def456",
    "filename": "architecture.mmd",
    "mime_type": "text/plain",
    "description": "System architecture diagram showing the new pagination flow",
    "data_base64": "base64-encoded-mermaid-content..."
  }
}
```

### Create a Project Summary

```json
{
  "tool": "journal_upsert_project_summary",
  "arguments": {
    "repository": "my-awesome-project",
    "git_url": "https://github.com/user/my-awesome-project",
    "summary": "A high-performance API service for real-time data processing",
    "purpose": "Provide low-latency data access with strong consistency guarantees",
    "architecture": "Microservices architecture with PostgreSQL backend, Redis caching, and GraphQL API",
    "key_decisions": "Chose PostgreSQL for ACID guarantees, GraphQL for flexible queries, Redis for caching",
    "technologies": "Node.js, TypeScript, PostgreSQL, Redis, GraphQL, Docker",
    "status": "Active development, v1.2.0"
  }
}
```

## 🗄️ Database & Backups

- **Database**: SQLite stored at `journal.db` in project root by default (configurable via `JOURNAL_DB_PATH` env var)
- **Auto-backup**: Automatically backs up to `journal_backup.sql` in project root after any database change
- **Export**: All entries, project summaries, and attachment metadata are included in backups
- **Backup location**: `journal_backup.sql` in the project root directory (self-contained)

The database is self-contained in your project root, making it easy to:
- Version control the backup SQL file
- Share your journal with team members
- Restore from backup if needed
- Migrate to a different system

## 🛠️ Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Run
npm start
```

## 📊 Tool Count

- **Slack**: 4 tools
- **Linear**: 5 tools
- **Journal**: 16 tools
- **Total**: 25 tools

## 🔒 MCP Truncation Compliance

All tools comply with common MCP truncation limits used by many AI agents:
- **~256 lines** per tool output
- **~10 KiB** per tool output

Tools use pagination, field exclusion, and truncation warnings to stay within limits, ensuring reliable output regardless of which MCP client you use.

## 💡 Philosophy

### Why Structured Journaling?

Code tells you *what* happened. Commit messages sometimes tell you *what* changed. But rarely do they capture:

- **The problem** you were solving
- **The alternatives** you considered
- **The reasoning** behind decisions
- **The context** that made those decisions right at that time

This journal system bridges that gap by using AI to extract and structure this context automatically.

### The Kronus Approach

Kronus isn't just extracting data—it's understanding context. It recognizes:
- When a change is routine vs. when it represents a significant decision
- When technical choices reflect deeper architectural thinking
- When genuine insight emerges from the work (Kronus Wisdom)

This creates a journal that's not just a log, but a **knowledge base** that grows more valuable over time.

### Knowledge Preservation

As projects evolve, context is lost. Team members leave, memories fade, and decisions become mysterious. This journal system:

- **Preserves context** at the moment decisions are made
- **Makes knowledge searchable** through structured fields
- **Captures wisdom** that emerges from the work
- **Enables onboarding** by providing project history and reasoning

## 📝 License

MIT

## 🤝 Contributing

This is a public release of a developer journaling system. Feel free to fork, customize, and adapt it to your needs!

---

**Built with**: TypeScript, Node.js, SQLite, Claude Haiku 4.5, Model Context Protocol
