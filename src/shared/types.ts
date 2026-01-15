/**
 * Common types shared across all modules
 */

export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}

/**
 * Module-specific configuration interfaces
 */
export interface LinearConfig {
  apiKey: string;
  userId?: string; // Optional user ID for default assignee filtering
}

export interface JournalConfig {
  dbPath: string;
  aiProvider: 'anthropic' | 'openai' | 'google';
  aiApiKey: string;
  tartarusUrl?: string; // Base URL for Tartarus web app (for attachment download URLs)
  mcpApiKey?: string; // API key for MCP to access Tartarus repository endpoints
}

export interface UnifiedConfig {
  linear?: LinearConfig;
  journal?: JournalConfig;
  logLevel?: string;
}
