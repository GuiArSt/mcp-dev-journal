import { z } from 'zod';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConfigurationError } from '../shared/errors.js';
import { UnifiedConfig } from '../shared/types.js';
import { logger } from '../shared/logger.js';

// Calculate MCP server installation directory
// Use import.meta.url to find where the code is located, not where it's executed from
// This ensures database/backups are always in the MCP server's directory, not the agent's working directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Walk up from dist/config/env.js or dist/index.js to find project root (where package.json is)
let PROJECT_ROOT = __dirname;
for (let i = 0; i < 5; i++) {
  if (path.basename(PROJECT_ROOT) === 'Developer Journal Workspace' && 
      (fs.existsSync(path.join(PROJECT_ROOT, 'package.json')) || 
       fs.existsSync(path.join(PROJECT_ROOT, 'Soul.xml')))) {
    break;
  }
  const parent = path.dirname(PROJECT_ROOT);
  if (parent === PROJECT_ROOT) break; // Reached filesystem root
  PROJECT_ROOT = parent;
}

// Fallback: if we can't find Developer Journal Workspace, look for package.json
if (!fs.existsSync(path.join(PROJECT_ROOT, 'package.json')) && 
    !fs.existsSync(path.join(PROJECT_ROOT, 'Soul.xml'))) {
  let currentDir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(currentDir, 'package.json')) || 
        fs.existsSync(path.join(currentDir, 'Soul.xml'))) {
      PROJECT_ROOT = currentDir;
      break;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
}

/**
 * Environment variable schema
 */
const envSchema = z.object({
  // Linear (optional)
  LINEAR_API_KEY: z.string().optional(),
  LINEAR_USER_ID: z.string().optional(),

  // AI Providers (at least one required for journal)
  // Priority: Anthropic (preferred) → OpenAI → Google (first one found)
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),

  // Optional settings
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  SOUL_XML_PATH: z.string().optional(), // Path to Soul.xml (default: Soul.xml in project root)
  TARTARUS_URL: z.string().optional(), // Base URL for Tartarus web app (e.g., http://localhost:3001)
  MCP_API_KEY: z.string().optional(), // API key for MCP to access Tartarus repository endpoints
});

/**
 * Load and validate environment configuration
 */
export function loadConfig(): UnifiedConfig {
  const env = envSchema.parse(process.env);
  const config: UnifiedConfig = {
    logLevel: env.LOG_LEVEL || 'info',
  };

  // Configure Linear if credentials present
  if (env.LINEAR_API_KEY) {
    config.linear = {
      apiKey: env.LINEAR_API_KEY,
      userId: env.LINEAR_USER_ID, // Optional: defaults to null, can be set via env var
    };
    logger.info('Linear module enabled');
  }

  // Configure Journal if AI provider available
  // Priority: Anthropic (preferred) → OpenAI → Google (first one found)
  // Models are hardcoded: claude-opus-4-5, gpt-5.1, gemini-3.0
  if (env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.GOOGLE_API_KEY) {
    let aiProvider: 'anthropic' | 'openai' | 'google';
    let aiApiKey: string;

    // Prefer Anthropic if available, otherwise use first found
    if (env.ANTHROPIC_API_KEY) {
      aiProvider = 'anthropic';
      aiApiKey = env.ANTHROPIC_API_KEY;
    } else if (env.OPENAI_API_KEY) {
      aiProvider = 'openai';
      aiApiKey = env.OPENAI_API_KEY;
    } else {
      aiProvider = 'google';
      aiApiKey = env.GOOGLE_API_KEY!;
    }

    // Database path: data directory (data/journal.db)
    // Allows JOURNAL_DB_PATH override for Docker/custom deployments
    const defaultDbPath = env.JOURNAL_DB_PATH || path.join(PROJECT_ROOT, 'data', 'journal.db');
    
    config.journal = {
      dbPath: defaultDbPath,
      aiProvider,
      aiApiKey,
      tartarusUrl: env.TARTARUS_URL,
      mcpApiKey: env.MCP_API_KEY,
    };
    logger.info(`Journal module enabled (AI provider: ${aiProvider})${env.TARTARUS_URL ? `, Tartarus: ${env.TARTARUS_URL}` : ''}`);
  }

  // Validate at least one module is configured
  if (!config.linear && !config.journal) {
    throw new ConfigurationError(
      'No modules configured. Please set environment variables for at least one module (Linear or Journal).'
    );
  }

  return config;
}
