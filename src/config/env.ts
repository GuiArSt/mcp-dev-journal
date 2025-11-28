import { z } from 'zod';
import path from 'node:path';
import { ConfigurationError } from '../shared/errors.js';
import { UnifiedConfig } from '../shared/types.js';
import { logger } from '../shared/logger.js';

/**
 * Environment variable schema
 */
const envSchema = z.object({
  // Slack (optional)
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_TEAM_ID: z.string().optional(),

  // Linear (optional)
  LINEAR_API_KEY: z.string().optional(),
  LINEAR_USER_ID: z.string().optional(),

  // AI Providers (at least one required for journal)
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),

  // Optional settings
  JOURNAL_DB_PATH: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
});

/**
 * Load and validate environment configuration
 */
export function loadConfig(): UnifiedConfig {
  const env = envSchema.parse(process.env);
  const config: UnifiedConfig = {
    logLevel: env.LOG_LEVEL || 'info',
  };

  // Configure Slack if credentials present
  if (env.SLACK_BOT_TOKEN && env.SLACK_TEAM_ID) {
    config.slack = {
      botToken: env.SLACK_BOT_TOKEN,
      teamId: env.SLACK_TEAM_ID,
    };
    logger.info('Slack module enabled');
  }

  // Configure Linear if credentials present
  if (env.LINEAR_API_KEY) {
    config.linear = {
      apiKey: env.LINEAR_API_KEY,
      userId: env.LINEAR_USER_ID, // Optional: defaults to null, can be set via env var
    };
    logger.info('Linear module enabled');
  }

  // Configure Journal if AI provider available
  if (env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.GOOGLE_API_KEY) {
    const aiProvider = env.ANTHROPIC_API_KEY
      ? 'anthropic'
      : env.OPENAI_API_KEY
      ? 'openai'
      : 'google';

    const aiApiKey =
      env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.GOOGLE_API_KEY!;

    // Default database path: project root (journal.db)
    // Resolves relative to project root where dist/index.js is located
    // Can be overridden with JOURNAL_DB_PATH env var
    const defaultDbPath = env.JOURNAL_DB_PATH 
      ? path.resolve(env.JOURNAL_DB_PATH.replace(/^~/, os.homedir()))
      : path.join(PROJECT_ROOT, 'journal.db');
    
    config.journal = {
      dbPath: defaultDbPath,
      aiProvider,
      aiApiKey,
    };
    logger.info(`Journal module enabled (AI provider: ${aiProvider})`);
  }

  // Validate at least one module is configured
  if (!config.slack && !config.linear && !config.journal) {
    throw new ConfigurationError(
      'No modules configured. Please set environment variables for at least one module (Slack, Linear, or Journal).'
    );
  }

  return config;
}
