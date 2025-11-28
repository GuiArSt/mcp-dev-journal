import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config/env.js';
import { logger } from './shared/logger.js';
import type { UnifiedConfig } from './shared/types.js';

// Module imports
import { SlackClient } from './modules/slack/client.js';
import { registerSlackTools } from './modules/slack/tools.js';
import { LinearClient } from './modules/linear/client.js';
import { registerLinearTools } from './modules/linear/tools.js';
import { initDatabase } from './modules/journal/db/database.js';
import { registerJournalTools } from './modules/journal/tools.js';

/**
 * Unified MCP Server combining Slack, Linear, and Developer Journal
 */
export class UnifiedMCPServer {
  private server: McpServer;
  private config: UnifiedConfig;

  constructor() {
    this.server = new McpServer({
      name: 'unified-workspace-mcp',
      version: '1.0.0',
    });

    this.config = loadConfig();
  }

  async initialize() {
    logger.info('Initializing Unified MCP Server...');

    // Initialize Slack module if configured
    if (this.config.slack) {
      const slackClient = new SlackClient(
        this.config.slack.botToken,
        this.config.slack.teamId
      );
      registerSlackTools(this.server, slackClient);
    }

    // Initialize Linear module if configured
    if (this.config.linear) {
      const linearClient = new LinearClient(this.config.linear.apiKey);
      registerLinearTools(this.server, linearClient, this.config.linear.userId);
    }

    // Initialize Journal module if configured
    if (this.config.journal) {
      initDatabase(this.config.journal.dbPath);
      registerJournalTools(this.server);
    }

    logger.success('Unified MCP Server initialized');
  }

  async connect() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.success('Unified MCP Server connected via stdio');
  }
}
