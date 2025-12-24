# Journal Entry Editing Guide

The Developer Journal Workspace uses a **split architecture**:
- **MCP Server**: For AI agents to *create* journal entries and *read* data
- **Tartarus Web App**: For humans to *browse, edit, and enrich* entries

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐
│   AI Agents     │     │    Humans       │
│ (Claude, etc.)  │     │                 │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│   MCP Server    │     │  Tartarus Web   │
│  (10 tools)     │     │     App         │
│                 │     │                 │
│ • Create entry  │     │ • Browse repos  │
│ • List/query    │     │ • Read entries  │
│ • Read data     │     │ • Edit entries  │
│                 │     │ • Kronus chat   │
│                 │     │ • Attachments   │
│                 │     │ • Atropos       │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
            ┌─────────────────┐
            │   SQLite DB     │
            │  (journal.db)   │
            └─────────────────┘
```

## Editing via Tartarus Web App (Recommended)

The web app provides a rich editing experience:

### 1. Inline Editing in Journal Reader

Navigate to any journal entry and click "Edit" to modify:
- **Why** - The motivation behind the change
- **What Changed** - Concrete modifications made
- **Decisions** - Key decisions and reasoning
- **Technologies** - Tags for tech stack (now with add/remove UI!)
- **Kronus Wisdom** - Optional insights

### 2. Kronus Chat

Use the chat interface to have AI conversations about your entries:
- Ask questions about the entry
- Request improvements or clarifications
- Get Kronus to regenerate sections with new context

### 3. Tag Management

Technologies are now editable as interactive tags:
- Click the ✕ on any tag to remove it
- Type a new tag and press Enter or click + to add
- Tags are saved when you click "Save"

## MCP Server Tools (For AI Agents)

The MCP server focuses on **read operations** and **entry creation**:

### Create Entry
```json
{
  "tool": "journal_create_entry",
  "arguments": {
    "commit_hash": "abc123",
    "repository": "my-project",
    "branch": "main",
    "author": "dev@example.com",
    "date": "2025-01-15T10:00:00Z",
    "raw_agent_report": "Your detailed description of what was done..."
  }
}
```

Kronus (Claude Haiku 4.5) will analyze the report and generate structured fields automatically.

### Query Tools
- `journal_get_entry` - Get a single entry
- `journal_list_by_repository` - List entries (paginated)
- `journal_list_by_branch` - List by branch (paginated)
- `journal_list_repositories` - All repositories
- `journal_list_branches` - Branches for a repo
- `journal_get_project_summary` - Project summary
- `journal_list_project_summaries` - All summaries
- `journal_list_attachments` - Entry attachments
- `journal_get_attachment` - Get attachment data

## Database Fields

Both interfaces modify the same fields:

| Field | Description |
|-------|-------------|
| `why` | Motivation and problem being solved |
| `what_changed` | Concrete modifications made |
| `decisions` | Key decisions and their reasoning |
| `technologies` | Comma-separated tech stack tags |
| `kronus_wisdom` | Optional philosophical reflection |
| `raw_agent_report` | Original agent summary (preserved) |

## Running the Web App

```bash
cd web
npm install
npm run dev
# Open http://localhost:3000
```

The web app shares the same database as the MCP server, so changes are immediately reflected in both interfaces.
















