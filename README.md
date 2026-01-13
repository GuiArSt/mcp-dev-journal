# Developer Journal Workspace

A dual-interface platform (MCP server + web app) that transforms git commits into structured, AI-powered developer journals.

## What This Is

1. **MCP Server** - Tools for AI agents (Claude, Cursor, etc.) to create and query journal entries
2. **Tartarus Web App** - Dark-themed dashboard for browsing, chatting with Kronus, and managing your journal

### Key Features

- **Structured journal entries** from commits via MCP
- **Kronus Chat** - AI conversations powered by Gemini 3 Pro (1M context) or Claude Sonnet 4.5
- **Atropos Spellchecker** - AI text correction with diff view
- **Project summaries** - High-level architecture documentation
- **Attachments** - Images, diagrams, PDFs linked to entries
- **Linear integration** - Link entries to Linear issues

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Copy environment file and add your API keys
cp .env.example .env
# Edit .env with your GOOGLE_GENERATIVE_AI_API_KEY or ANTHROPIC_API_KEY

# Run
docker compose up -d

# Access at http://localhost:3777
```

### Option 2: Local Development

```bash
# Install and build MCP server
npm install
npm run build

# Install and run web app
cd web
npm install

# Set environment variables
export JOURNAL_DB_PATH="/path/to/Developer Journal Workspace/data/journal.db"
export GOOGLE_GENERATIVE_AI_API_KEY="your-key"

npm run dev
# Access at http://localhost:3000
```

## Configuration

### Environment Variables

Create `.env` in project root:

```bash
# AI Provider (at least one required)
GOOGLE_GENERATIVE_AI_API_KEY=your-key  # Preferred - Gemini 3 Pro (1M context)
ANTHROPIC_API_KEY=your-key              # Fallback - Claude Sonnet 4.5 (200K context)

# Database (optional - defaults to ./data/journal.db)
JOURNAL_DB_PATH=/path/to/journal.db

# Soul.xml (optional - defaults to ./Soul.xml)
SOUL_XML_PATH=/path/to/Soul.xml

# Optional integrations
LINEAR_API_KEY=lin_api_...
PERPLEXITY_API_KEY=pplx-...
```

### MCP Client Setup

Add to your MCP client config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "developer-journal": {
      "command": "node",
      "args": ["/path/to/Developer Journal Workspace/dist/index.js"]
    }
  }
}
```

## AI Models

The web app uses this priority:
1. **Gemini 3 Pro** (`gemini-3-pro-preview`) - 1M token context, default
2. **Claude Sonnet 4.5** (`claude-sonnet-4-5-20250929`) - 200K context, fallback
3. **GPT-4o** - Fallback if no Google/Anthropic keys

Override with `GOOGLE_MODEL` or `ANTHROPIC_MODEL` env vars.

## Project Structure

```
Developer Journal Workspace/
├── data/                 # Database (journal.db)
├── dist/                 # Built MCP server
├── src/                  # MCP server source
├── web/                  # Tartarus Next.js app
├── Soul.xml              # Kronus persona definition
├── docker-compose.yml    # Docker setup
└── .env                  # Your API keys
```

## MCP Tools (10)

- `journal_create_entry` - Create entry with AI analysis
- `journal_get_entry` - Get entry by commit hash
- `journal_list_by_repository` - List entries for a repo
- `journal_list_by_branch` - List entries for a branch
- `journal_list_repositories` - List all repos
- `journal_list_branches` - List branches for a repo
- `journal_get_project_summary` - Get project summary
- `journal_list_project_summaries` - List all summaries
- `journal_list_attachments` - List entry attachments
- `journal_get_attachment` - Get attachment data

## Development

```bash
# MCP server
npm run build      # Build
npm run dev        # Watch mode

# Web app
cd web
npm run dev        # Dev server on :3000
npm run build      # Production build

# Docker
docker compose up -d --build    # Build and run
docker compose logs -f tartarus # View logs
```

## License

MIT
