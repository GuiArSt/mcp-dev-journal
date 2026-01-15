import { z } from 'zod';

/**
 * Zod schemas for validation
 */

// Input schema: What the agent sends to the MCP
export const AgentInputSchema = z.object({
  commit_hash: z.string().min(7).describe('Git commit SHA (minimum 7 chars)'),
  repository: z.string().min(1).describe('Repository/project name'),
  branch: z.string().min(1).describe('Git branch name'),
  author: z.string().min(1).describe('Git commit author'),
  date: z.string().describe('Commit date (ISO 8601 format)'),
  raw_agent_report: z.string().min(10).describe('Agent\'s full context dump'),
});

// File change schema for tracking what files were modified
export const FileChangeSchema = z.object({
  path: z.string().describe('Full file path'),
  action: z.enum(['created', 'modified', 'deleted', 'renamed']).describe('Type of change'),
  diff_summary: z.string().optional().describe('Brief summary of the change (not full diff)'),
  old_path: z.string().optional().describe('For renames: the previous file path'),
});

// AI output schema: What Kronus generates from the report
export const AIOutputSchema = z.object({
  why: z.string().min(10).describe('Why are we doing this change'),
  what_changed: z.string().min(10).describe('What exactly has been changed'),
  decisions: z.string().min(10).describe('Decisions made and reasoning'),
  technologies: z.string().min(3).describe('Technologies/frameworks discussed'),
  kronus_wisdom: z.string().nullable().optional().describe('Poem, lesson, or wisdom from Kronus'),
  files_changed: z.array(FileChangeSchema).nullable().optional().describe('STRONGLY REQUESTED: List of files that were created, modified, deleted, or renamed. Extract from the agent report.'),
});

// Project summary schema: Overview of the entire repository
export const ProjectSummaryInputSchema = z.object({
  repository: z.string().min(1).describe('Repository/project name'),
  git_url: z.string().url().optional().describe('Git repository URL (optional - for linking to source)'),
  summary: z.string().min(10).describe('High-level project summary'),
  purpose: z.string().min(10).describe('Why this project exists'),
  architecture: z.string().min(10).describe('Overall architecture and structure'),
  key_decisions: z.string().min(10).describe('Major architectural decisions'),
  technologies: z.string().min(3).describe('Core technologies used'),
  status: z.string().min(3).describe('Current project status'),
  linear_project_id: z.string().optional().describe('Optional Linear project ID to link this repository to a Linear project'),
  linear_issue_id: z.string().optional().describe('Optional Linear issue ID to link this repository to a Linear issue'),
});

/**
 * TypeScript types derived from Zod schemas
 */

export type AgentInput = z.infer<typeof AgentInputSchema>;
export type AIOutput = z.infer<typeof AIOutputSchema>;
export type ProjectSummaryInput = z.infer<typeof ProjectSummaryInputSchema>;

/**
 * Database types
 */

/**
 * File change tracking for journal entries
 */
export interface FileChange {
  path: string;           // Full file path (required)
  action: 'created' | 'modified' | 'deleted' | 'renamed';
  diff_summary?: string;  // Brief summary of change (not full diff)
  old_path?: string;      // For renames
}

export interface JournalEntry {
  id: number;
  commit_hash: string;
  repository: string;
  branch: string;
  author: string;
  date: string;
  why: string;
  what_changed: string;
  decisions: string;
  technologies: string;
  kronus_wisdom: string | null;
  raw_agent_report: string;
  created_at: string;
  // File change tracking (JSON array stored as TEXT)
  files_changed?: FileChange[] | null;
}

export interface JournalEntryInsert {
  commit_hash: string;
  repository: string;
  branch: string;
  author: string;
  date: string;
  why: string;
  what_changed: string;
  decisions: string;
  technologies: string;
  kronus_wisdom: string | null;
  raw_agent_report: string;
  files_changed?: FileChange[] | null;
}

export interface ProjectSummary {
  id: number;
  repository: string;
  git_url: string | null;
  summary: string | null;
  purpose: string | null;
  architecture: string | null;
  key_decisions: string | null;
  technologies: string | null;
  status: string | null;
  updated_at: string;
  // Journal entry statistics for this repository
  entry_count?: number; // Number of journal entries
  last_entry_date?: string | null; // Date of the last journal entry (ISO format)
  // Optional Linear integration
  linear_project_id?: string | null; // Linear project ID if linked to a Linear project
  linear_issue_id?: string | null; // Linear issue ID if linked to a Linear issue
  // Living Project Summary (Entry 0) - Enhanced fields
  file_structure?: string | null; // Git-style file tree (agent-provided)
  tech_stack?: string | null; // Frameworks, libraries, versions (indicative)
  frontend?: string | null; // FE patterns, components, state management
  backend?: string | null; // BE routes, middleware, auth patterns
  database_info?: string | null; // Schema, ORM patterns, migrations (renamed to avoid SQL keyword)
  services?: string | null; // External APIs, integrations
  custom_tooling?: string | null; // Project-specific utilities
  data_flow?: string | null; // How data is processed
  patterns?: string | null; // Naming conventions, code style
  commands?: string | null; // Dev, deploy, make commands
  extended_notes?: string | null; // Gotchas, TODOs, historical context
  // Sync tracking
  last_synced_entry?: string | null; // Last journal entry hash used for update
  entries_synced?: number | null; // Count of entries analyzed
}

export interface ProjectSummaryInsert {
  repository: string;
  git_url?: string | null;
  summary?: string | null;
  purpose?: string | null;
  architecture?: string | null;
  key_decisions?: string | null;
  technologies?: string | null;
  status?: string | null;
  linear_project_id?: string | null;
  linear_issue_id?: string | null;
  // Living Project Summary (Entry 0) - Enhanced fields
  file_structure?: string | null;
  tech_stack?: string | null;
  frontend?: string | null;
  backend?: string | null;
  database_info?: string | null;
  services?: string | null;
  custom_tooling?: string | null;
  data_flow?: string | null;
  patterns?: string | null;
  commands?: string | null;
  extended_notes?: string | null;
  last_synced_entry?: string | null;
  entries_synced?: number | null;
}

/**
 * Attachment types for storing files (images, diagrams, etc.)
 */

export interface Attachment {
  id: number;
  commit_hash: string;
  filename: string;
  mime_type: string;
  description: string | null;
  data: Buffer;
  file_size: number;
  uploaded_at: string;
}

export interface AttachmentInsert {
  commit_hash: string;
  filename: string;
  mime_type: string;
  description: string | null;
  data: Buffer;
  file_size: number;
}

/**
 * Zod schema for attachment upload
 */
export const AttachmentInputSchema = z.object({
  commit_hash: z.string().min(7).describe('Git commit SHA (minimum 7 chars)'),
  filename: z.string().min(1).describe('Filename with extension (e.g., diagram.png, architecture.mmd)'),
  mime_type: z.string().min(3).describe('MIME type (e.g., image/png, image/svg+xml, text/plain for Mermaid)'),
  description: z.string().optional().describe('Optional description of what the attachment shows (e.g., "System architecture diagram", "Before/after comparison")'),
  data_base64: z.string().min(1).describe('Base64-encoded file data'),
});

export type AttachmentInput = z.infer<typeof AttachmentInputSchema>;

/**
 * Media Library - Unified access to entry_attachments + media_assets
 */
export const MediaLibraryInputSchema = z.object({
  repository: z.string().optional().describe('Filter by repository name (searches commit_hash links)'),
  commit_hash: z.string().min(7).optional().describe('Filter by specific commit hash'),
  destination: z.enum(['journal', 'repository', 'media', 'portfolio', 'all']).optional().default('all')
    .describe('Filter by asset destination/category'),
  mime_type_prefix: z.string().optional().describe('Filter by MIME type prefix (e.g., "image/", "application/pdf")'),
  tags: z.array(z.string()).optional().describe('Filter by tags (media_assets only)'),
  limit: z.number().optional().default(50).describe('Max items to return (default: 50, max: 100)'),
  offset: z.number().optional().default(0).describe('Pagination offset'),
  include_metadata: z.boolean().optional().default(true).describe('Include full metadata (alt, prompt, model, dimensions)'),
});

export type MediaLibraryInput = z.infer<typeof MediaLibraryInputSchema>;

export interface UnifiedMediaItem {
  source: 'entry_attachments' | 'media_assets';
  source_id: number;
  filename: string;
  mime_type: string;
  file_size: number;
  description: string | null;
  commit_hash: string | null;
  repository: string | null;
  document_id: number | null;
  destination: string | null;
  // Extended metadata (from media_assets)
  alt: string | null;
  prompt: string | null;
  model: string | null;
  tags: string | null; // JSON array
  width: number | null;
  height: number | null;
  drive_url: string | null;
  supabase_url: string | null;
  created_at: string;
}

export interface MediaLibraryResponse {
  total: number;
  showing: string;
  has_more: boolean;
  sources: {
    entry_attachments: number;
    media_assets: number;
  };
  base_url: string | null;
  download_enabled: boolean;
  items: Array<{
    id: string; // "attachment:123" or "media:456"
    source: 'entry_attachments' | 'media_assets';
    source_id: number;
    filename: string;
    mime_type: string;
    file_size: number;
    description: string | null;
    download_url: string | null;
    commit_hash: string | null;
    repository: string | null;
    document_id: number | null;
    destination: string | null;
    metadata?: {
      alt?: string;
      prompt?: string;
      model?: string;
      tags?: string[];
      width?: number;
      height?: number;
      drive_url?: string;
      supabase_url?: string;
    };
    created_at: string;
  }>;
}
