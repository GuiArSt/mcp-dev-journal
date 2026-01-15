import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config/env.js';
import { logger } from './shared/logger.js';
import type { UnifiedConfig } from './shared/types.js';

// Module imports
import { initDatabase } from './modules/journal/db/database.js';
import { registerJournalTools } from './modules/journal/tools.js';

/**
 * Developer Journal MCP Server
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
        name: 'developer-journal-mcp',
        version: '2.0.0',
      },
      {
        capabilities: {
          resources: {},
          prompts: {},
        },
      }
    );

    this.config = loadConfig();
  }

  async initialize() {
    logger.info('Initializing Developer Journal MCP Server...');

    // Initialize Journal module if configured
    if (this.config.journal) {
      initDatabase(this.config.journal.dbPath);
      registerJournalTools(this.server, this.config.journal);
    } else {
      logger.warn('No journal configuration found. Set JOURNAL_DB_PATH or ANTHROPIC_API_KEY.');
    }

    logger.success('Developer Journal MCP Server initialized (12 tools, 18 resources, 3 prompts)');
  }

  async connect() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.success('Developer Journal MCP Server connected via stdio');
  }
}
