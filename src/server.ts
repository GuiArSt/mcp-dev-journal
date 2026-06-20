import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config/env.js";
import { logger } from "./shared/logger.js";
import type { UnifiedConfig } from "./shared/types.js";

// Module imports
import { initDatabase } from "./modules/journal/db/database.js";
import { registerJournalTools } from "./modules/journal/tools.js";
import { registerKronusTools } from "./modules/kronus/index.js";
import { registerGitTools } from "./modules/git/tools.js";

/**
 * Tartarus MCP Server
 *
 * A lightweight MCP server focused on journal entries:
 * - Create entries with AI-generated summaries (Kronus)
 * - Read entries, repositories, branches, project summaries
 * - View attachments
 *
 * Write/edit operations for entries, project summaries, and attachments
 * are handled by the web app (Tartarus).
 */
export class UnifiedMCPServer {
  private server: McpServer;
  private config: UnifiedConfig;

  constructor() {
    this.server = new McpServer(
      {
        name: "tartarus-mcp",
        version: "2.0.0",
      },
      {
        capabilities: {
          resources: {},
          prompts: {},
        },
        instructions: `Tartarus MCP Server — Guillermo's personal knowledge system.

## Available Resources (read via ReadMcpResourceTool)

IMPORTANT: ListMcpResourcesTool may return empty — this is a client limitation, NOT a missing feature.
Resources ARE available. Use ReadMcpResourceTool with the URIs below to access them directly.

### Journal
- journal://repositories — List all tracked repositories
- journal://project-summary/{repository} — Shallow project overview (LLM-optimized)
- journal://project-summary/{repository}/deep — Full project history with timeline
- journal://entry/{commit_hash} — Single journal entry
- journal://branches/{repository} — Branches for a repository
- journal://attachments/{commit_hash} — Attachments for an entry
- journal://attachment/{attachment_id} — Single attachment

### Linear (read-only cache, synced via Tartarus)
- linear://cache/stats — Cache metadata (counts, last sync time)
- linear://projects — All Linear projects with AI summaries
- linear://project/{id} — Single project details
- linear://issues — Your assigned Linear issues
- linear://issue/{identifier} — Single issue (e.g., ENG-123)
- linear://project/{projectId}/updates — Project status updates
- linear://project-updates — Recent updates across all projects

### Slite (read-only cache)
- slite://cache/stats — Cache metadata
- slite://notes — All cached Slite notes
- slite://note/{id} — Single note

### Repository (documents, CV, portfolio)
- repository://documents/{type} — Documents by type (writing/prompt/note)
- repository://document/{slug_or_id} — Single document
- repository://tags — All tags
- repository://cv/skills — Skills
- repository://cv/experience — Work experience
- repository://cv/education — Education
- repository://portfolio-project/{id} — Portfolio project

### Artemis (read-only job hunt)
- artemis_list_applications — List tracked job applications
- artemis_get_application — Full application detail
- artemis_list_due_followups — Applications needing follow-up
- artemis_search_companies — Company search over tracked applications

## Known Repositories
Before creating a journal entry, load the live repo list — it is injected dynamically into the \`tartarus\` prompt (call it once per session). Do NOT invent repo name variants. Use the exact names from the list.

If working in a codebase not yet tracked: use its directory name in kebab-case and create an Entry 0 first with journal_create_project_summary.

## Write Tools
- Journal entries: journal_create_entry, journal_create_project_summary, journal_update_project_technical, journal_submit_summary_report
- Journal visuals: journal_attach_screenshot (Playwright, localhost only), journal_generate_image (GPT Image 2 infographic or mood, async fire-and-forget)
- Repository: repository_create_document, repository_update_document, repository_create_from_report, repository_upload_media
- Kronus: kronus_ask (query the knowledge oracle)
- Git (read-only, any repo): git_read — log, diff, show, blame, ls-files, status, branch

## Prompts (reusable agent guidance)
- journal-visual — After creating a journal entry, invoke this prompt to decide and attach a visual (screenshot, infographic, or mood image). Works for any codebase.
- tartarus — Complete usage guide: journal entries, visuals, context fetching, library. Load once per session.

## Architecture
- MCP exposes resources (read) and tools (write journal entries + repository documents)
- Linear/Slite sync and all other mutations are handled by Tartarus (web app) — NOT available here
- Data flows: External APIs → Tartarus sync → SQLite → MCP resources`,
      },
    );

    this.config = loadConfig();
  }

  async initialize() {
    logger.info("Initializing Tartarus MCP Server...");

    initDatabase(this.config.journal.dbPath);
    await registerJournalTools(this.server, this.config.journal);
    registerKronusTools(this.server, this.config.journal);
    registerGitTools(this.server);

    logger.success("Tartarus MCP Server initialized");
  }

  async connect() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.success("Tartarus MCP Server connected via stdio");
  }
}
