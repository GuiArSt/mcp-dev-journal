import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { toMcpError } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';
import type { JournalConfig } from '../../shared/types.js';
import { generateJournalEntry } from './ai/generate-entry.js';
import { normalizeReport, mergeSummaryUpdates } from './ai/normalize-report.js';
import {
  commitHasEntry,
  exportToSQL,
  getEntriesByBranchPaginated,
  getEntriesByRepositoryPaginated,
  getEntryByCommit,
  insertJournalEntry,
  listBranches,
  listRepositories,
  getProjectSummary,
  upsertProjectSummary,
  listAllProjectSummariesPaginated,
  getAttachmentMetadataByCommit,
  getAttachmentById,
  getAttachmentStats,
  getAttachmentCountsForCommits,
  initDatabase,
  // Linear cache - historical buffer
  listLinearProjects,
  getLinearProject,
  listLinearIssues,
  getLinearIssue,
  getLinearCacheStats,
} from './db/database.js';
import { AgentInputSchema, ProjectSummaryInputSchema, AttachmentInputSchema } from './types.js';

/**
 * Get MCP server installation directory (where the code is located)
 * This is different from process.cwd() which returns where the agent is running from
 */
function getProjectRoot(): string {
  // Use import.meta.url to find where this module is located
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  // Walk up from dist/modules/journal/tools.js to find project root
  let currentDir = __dirname;
  for (let i = 0; i < 5; i++) {
    // Look for Developer Journal Workspace directory with package.json or Soul.xml
    if (path.basename(currentDir) === 'Developer Journal Workspace' && 
        (fs.existsSync(path.join(currentDir, 'package.json')) || 
         fs.existsSync(path.join(currentDir, 'Soul.xml')))) {
      return currentDir;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break; // Reached filesystem root
    currentDir = parent;
  }
  
  // Fallback: if we can't find it, use __dirname and walk up to find package.json
  currentDir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(currentDir, 'package.json')) || 
        fs.existsSync(path.join(currentDir, 'Soul.xml'))) {
      return currentDir;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
  
  // Last resort: return __dirname (shouldn't happen)
  return currentDir;
}

/**
 * Auto-backup to SQL file after any database change
 * Always backs up to project root (journal_backup.sql)
 */
function autoBackup() {
  try {
    // Ensure database is initialized before backing up
    // Database is always at project root now
    initDatabase();
    
    const projectRoot = getProjectRoot();
    // Always backup to project root
    const backupPath = path.join(projectRoot, 'journal_backup.sql');
    
    logger.info(`Auto-backup: projectRoot=${projectRoot}, backupPath=${backupPath}`);
    exportToSQL(backupPath);
    logger.success(`Auto-backup completed successfully to ${backupPath}`);
  } catch (error) {
    // Don't fail silently - log the error clearly
    logger.error('Failed to auto-backup journal:', error);
    if (error instanceof Error) {
      logger.error(`Backup error: ${error.message}`);
      if (error.stack) {
        logger.error(`Stack trace: ${error.stack}`);
      }
    } else {
      logger.error(`Unknown backup error: ${JSON.stringify(error)}`);
    }
  }
}

/**
 * MCP truncation limits: ~256 lines or ~10 KiB per tool output
 * Many MCP clients enforce these limits, so we ensure outputs stay within safe bounds
 */
const MAX_SAFE_LINES = 200; // Conservative limit (256 - buffer)
const MAX_SAFE_BYTES = 9000; // Conservative limit (10 KiB - buffer)

/**
 * Format entry for display, optionally excluding large fields
 */
function formatEntrySummary(entry: any, includeRawReport: boolean = false): any {
  const summary: any = {
    id: entry.id,
    commit_hash: entry.commit_hash,
    repository: entry.repository,
    branch: entry.branch,
    author: entry.author,
    date: entry.date,
    why: entry.why,
    what_changed: entry.what_changed,
    decisions: entry.decisions,
    technologies: entry.technologies,
    kronus_wisdom: entry.kronus_wisdom,
    files_changed: entry.files_changed || null,
    created_at: entry.created_at,
  };

  if (includeRawReport) {
    summary.raw_agent_report = entry.raw_agent_report;
  } else {
    summary.raw_agent_report_truncated = entry.raw_agent_report
      ? `[${entry.raw_agent_report.length} chars - use include_raw_report=true to see full]`
      : null;
  }

  return summary;
}

/**
 * Truncate text output to safe limits
 * Accounts for truncation warning message size to ensure final output stays within limits
 * Puts a clear warning at the TOP of the output for better visibility
 */
function truncateOutput(text: string): string {
  const lines = text.split('\n');
  const bytes = Buffer.byteLength(text, 'utf8');
  
  // If already within limits, return as-is
  if (lines.length <= MAX_SAFE_LINES && bytes <= MAX_SAFE_BYTES) {
    return text;
  }
  
  const totalLines = lines.length;
  const totalBytes = bytes;
  
  // Create warning message (will be at top and bottom)
  const warningTop = `⚠️ OUTPUT TRUNCATED ⚠️\nShowing partial results due to MCP size limits (~256 lines / 10 KiB).\nTotal: ${totalLines} lines, ${(totalBytes / 1024).toFixed(2)} KiB\n\nUse pagination (limit/offset) or specific filters to see more.\n────────────────────────────────────────\n\n`;
  const warningBottom = `\n\n────────────────────────────────────────\n⚠️ END OF TRUNCATED OUTPUT ⚠️\nShowing ${totalLines} total lines, ${(totalBytes / 1024).toFixed(2)} KiB total. Use pagination to see more.`;
  
  // Reserve space for warnings (top + bottom)
  const warningTopBytes = Buffer.byteLength(warningTop, 'utf8');
  const warningBottomBytes = Buffer.byteLength(warningBottom, 'utf8');
  const totalWarningBytes = warningTopBytes + warningBottomBytes;
  
  const safeLineLimit = MAX_SAFE_LINES - 10; // Reserve lines for warnings
  const safeByteLimit = MAX_SAFE_BYTES - totalWarningBytes;
  
  // Truncate by lines first (more predictable)
  let truncated = lines.slice(0, safeLineLimit).join('\n');
  
  // Then check byte size
  if (Buffer.byteLength(truncated, 'utf8') > safeByteLimit) {
    // Truncate by bytes
    const buffer = Buffer.from(truncated, 'utf8');
    truncated = buffer.slice(0, safeByteLimit).toString('utf8');
    // Try to end at a safe point (not mid-character)
    const lastNewline = truncated.lastIndexOf('\n');
    if (lastNewline > safeByteLimit * 0.9) {
      truncated = truncated.slice(0, lastNewline);
    }
  }
  
  const shownLines = truncated.split('\n').length;
  const shownBytes = Buffer.byteLength(truncated, 'utf8');
  
  // Put warning at top and bottom
  return warningTop + truncated + warningBottom;
}

/**
 * Register Journal tools with the MCP server
 */
export function registerJournalTools(server: McpServer, journalConfig?: JournalConfig) {
  logger.info('Registering Journal tools...');
  
  if (!journalConfig) {
    throw new Error('JournalConfig is required for journal tools');
  }

  // Tool 1: Create Journal Entry
  server.registerTool(
    'journal_create_entry',
    {
      title: 'Create Journal Entry',
      description: `Create a developer journal entry for a git commit. This tool documents the work done, decisions made, and context behind code changes.

## What You Provide (Required Metadata)
- commit_hash: The git commit SHA (at least 7 chars)
- repository: Project/repo name (e.g., "my-app", "Developer Journal Workspace")
- branch: Git branch name (e.g., "main", "feature/auth")
- author: Commit author name
- date: Commit date in ISO 8601 format (e.g., "2026-01-12T10:30:00Z")
- raw_agent_report: Your detailed report of what was done (see below)

## What Kronus Generates From Your Report
Kronus (AI) analyzes your raw_agent_report and extracts:
- **why**: Motivation behind the change
- **what_changed**: Concrete changes made
- **decisions**: Key decisions and reasoning
- **technologies**: Tech stack involved
- **kronus_wisdom**: Optional philosophical reflection
- **files_changed**: Structured list of file modifications

## IMPORTANT: Include File Paths!
Your raw_agent_report should mention ALL files created, modified, deleted, or renamed.
Kronus extracts these into a structured files_changed array.

Example file mentions in report:
- "Created src/components/Button.tsx with click handler"
- "Modified lib/utils.ts to add parseDate helper"
- "Deleted old/deprecated-file.js (no longer needed)"
- "Renamed config.json to config.yaml for YAML support"`,
      inputSchema: {
        commit_hash: AgentInputSchema.shape.commit_hash,
        repository: AgentInputSchema.shape.repository,
        branch: AgentInputSchema.shape.branch,
        author: AgentInputSchema.shape.author,
        date: AgentInputSchema.shape.date,
        raw_agent_report: AgentInputSchema.shape.raw_agent_report,
      },
    },
    async ({ commit_hash, repository, branch, author, date, raw_agent_report }) => {
      try {
        // Check if entry already exists
        if (commitHasEntry(commit_hash)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `⚠️ Journal entry already exists for commit ${commit_hash}`,
              },
            ],
          };
        }

        // Generate AI analysis
        const aiOutput = await generateJournalEntry({
          commit_hash,
          repository,
          branch,
          author,
          date,
          raw_agent_report,
        }, journalConfig);

        // Insert into database
        const entryId = insertJournalEntry({
          commit_hash,
          repository,
          branch,
          author,
          date,
          why: aiOutput.why,
          what_changed: aiOutput.what_changed,
          decisions: aiOutput.decisions,
          technologies: aiOutput.technologies,
          kronus_wisdom: aiOutput.kronus_wisdom ?? null,
          raw_agent_report,
          files_changed: aiOutput.files_changed ?? null,
        });

        // Auto-backup to SQL
        autoBackup();

        const summary = {
          success: true,
          entry_id: entryId,
          commit_hash,
          repository,
          branch,
          why: aiOutput.why,
          what_changed: aiOutput.what_changed,
          decisions: aiOutput.decisions,
          technologies: aiOutput.technologies,
          kronus_wisdom: aiOutput.kronus_wisdom || null,
          files_changed: aiOutput.files_changed || null,
        };

        const text = `✅ Journal entry created for ${repository}/${branch} (${commit_hash})\n\n${JSON.stringify(summary, null, 2)}`;
        
        return {
          content: [
            {
              type: 'text' as const,
              text: truncateOutput(text),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 2 removed - use resource journal://entry/{commit_hash} instead

  // Tool 3: List Entries by Repository
  server.registerTool(
    'journal_list_by_repository',
    {
      title: 'List Journal Entries by Repository',
      description: '**SEARCH/QUERY TOOL** - List journal entries for a repository with pagination control. Returns 20 entries by default (max 50). Each entry includes attachment_count showing how many files (images, diagrams, etc.) are attached. Large fields (raw_agent_report) excluded by default to comply with MCP truncation limits (~256 lines / 10 KiB). Use journal://attachments/{commit_hash} resource to see attachment details for a specific commit.',
      inputSchema: {
        repository: AgentInputSchema.shape.repository,
        limit: z.number().optional().default(20).describe('Maximum number of entries to return (default: 20, max: 50)'),
        offset: z.number().optional().default(0).describe('Number of entries to skip for pagination (default: 0)'),
        include_raw_report: z.boolean().optional().default(false).describe('Include raw_agent_report in each entry (significantly increases output size, default: false)'),
      },
    },
    async ({ repository, limit, offset, include_raw_report }) => {
      try {
        const safeLimit = Math.min(limit || 20, 50); // Cap at 50
        const { entries, total } = getEntriesByRepositoryPaginated(repository, safeLimit, offset || 0);
        
        // Get attachment counts for all entries in this batch
        const commitHashes = entries.map(e => e.commit_hash);
        const attachmentCounts = getAttachmentCountsForCommits(commitHashes);
        
        const summaries = entries.map(e => {
          const summary = formatEntrySummary(e, include_raw_report);
          const attachmentCount = attachmentCounts.get(e.commit_hash) || 0;
          return {
            ...summary,
            attachment_count: attachmentCount,
            has_attachments: attachmentCount > 0,
          };
        });
        
        // Check if output will be truncated before stringifying
        const testOutput = {
          repository,
          total_entries: total,
          showing: `${offset || 0} to ${(offset || 0) + summaries.length}`,
          has_more: (offset || 0) + summaries.length < total,
          entries: summaries,
        };
        const testText = `Found ${total} total entries for ${repository}:\n\n${JSON.stringify(testOutput, null, 2)}`;
        const willTruncate = testText.split('\n').length > MAX_SAFE_LINES || Buffer.byteLength(testText, 'utf8') > MAX_SAFE_BYTES;
        
        // Build output object with warning FIRST if truncated (JavaScript preserves insertion order)
        const output: any = {};
        
        // Add clear truncation warning at top of JSON FIRST if needed
        if (willTruncate) {
          output.warning = `⚠️ OUTPUT TRUNCATED ⚠️ Response exceeds MCP size limits (~256 lines / 10 KiB). Showing ${summaries.length} of ${total} entries. Use pagination (limit/offset) to see more entries.`;
          output.truncated = true;
          output.entries_returned = summaries.length;
          output.entries_total = total;
        }
        
        // Then add the rest of the fields
        output.repository = repository;
        output.total_entries = total;
        output.showing = `${offset || 0} to ${(offset || 0) + summaries.length}`;
        output.has_more = (offset || 0) + summaries.length < total;
        output.entries = summaries;
        
        const text = `Found ${total} total entries for ${repository}:\n\n${JSON.stringify(output, null, 2)}`;
        
        return {
          content: [
            {
              type: 'text' as const,
              text: truncateOutput(text),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 4: List Entries by Branch
  server.registerTool(
    'journal_list_by_branch',
    {
      title: 'List Journal Entries by Branch',
      description: '**SEARCH/QUERY TOOL** - List journal entries for a repository and branch with pagination control. Returns 20 entries by default (max 50). Each entry includes attachment_count showing how many files (images, diagrams, etc.) are attached. Large fields (raw_agent_report) excluded by default to comply with MCP truncation limits (~256 lines / 10 KiB). Use journal://attachments/{commit_hash} resource to see attachment details for a specific commit.',
      inputSchema: {
        repository: AgentInputSchema.shape.repository,
        branch: AgentInputSchema.shape.branch,
        limit: z.number().optional().default(20).describe('Maximum number of entries to return (default: 20, max: 50)'),
        offset: z.number().optional().default(0).describe('Number of entries to skip for pagination (default: 0)'),
        include_raw_report: z.boolean().optional().default(false).describe('Include raw_agent_report in each entry (significantly increases output size, default: false)'),
      },
    },
    async ({ repository, branch, limit, offset, include_raw_report }) => {
      try {
        const safeLimit = Math.min(limit || 20, 50); // Cap at 50
        const { entries, total } = getEntriesByBranchPaginated(repository, branch, safeLimit, offset || 0);
        
        // Get attachment counts for all entries in this batch
        const commitHashes = entries.map(e => e.commit_hash);
        const attachmentCounts = getAttachmentCountsForCommits(commitHashes);
        
        const summaries = entries.map(e => {
          const summary = formatEntrySummary(e, include_raw_report);
          const attachmentCount = attachmentCounts.get(e.commit_hash) || 0;
          return {
            ...summary,
            attachment_count: attachmentCount,
            has_attachments: attachmentCount > 0,
          };
        });
        
        // Check if output will be truncated before stringifying
        const testOutput = {
          repository,
          branch,
          total_entries: total,
          showing: `${offset || 0} to ${(offset || 0) + summaries.length}`,
          has_more: (offset || 0) + summaries.length < total,
          entries: summaries,
        };
        const testText = `Found ${total} total entries for ${repository}/${branch}:\n\n${JSON.stringify(testOutput, null, 2)}`;
        const willTruncate = testText.split('\n').length > MAX_SAFE_LINES || Buffer.byteLength(testText, 'utf8') > MAX_SAFE_BYTES;
        
        // Build output object with warning FIRST if truncated (JavaScript preserves insertion order)
        const output: any = {};
        
        // Add clear truncation warning at top of JSON FIRST if needed
        if (willTruncate) {
          output.warning = `⚠️ OUTPUT TRUNCATED ⚠️ Response exceeds MCP size limits (~256 lines / 10 KiB). Showing ${summaries.length} of ${total} entries. Use pagination (limit/offset) to see more entries.`;
          output.truncated = true;
          output.entries_returned = summaries.length;
          output.entries_total = total;
        }
        
        // Then add the rest of the fields
        output.repository = repository;
        output.branch = branch;
        output.total_entries = total;
        output.showing = `${offset || 0} to ${(offset || 0) + summaries.length}`;
        output.has_more = (offset || 0) + summaries.length < total;
        output.entries = summaries;
        
        const text = `Found ${total} total entries for ${repository}/${branch}:\n\n${JSON.stringify(output, null, 2)}`;
        
        return {
          content: [
            {
              type: 'text' as const,
              text: truncateOutput(text),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 5 removed - use resource journal://repositories instead

  // Tool 6 removed - use resource journal://branches/{repository} instead

  // Tool 7 removed - use resource journal://summary/{repository} instead

  // Tool 8: Create Project Summary (Entry 0 Initial Creation)
  server.registerTool(
    'journal_create_project_summary',
    {
      title: 'Create Project Summary (Entry 0)',
      description: `Create the initial Entry 0 (Living Project Summary) for a repository.
Entry 0 is synthesized from TWO sources:
1. **Your raw_report** - The primary source, your free-form observations about the project
2. **Recent journal entries** - Additional context from existing journal entries (if any exist)

Kronus normalizes both sources into structured Entry 0 sections.

## When to Use This Tool
Use this tool when a repository has NO Entry 0 yet. If Entry 0 already exists, use journal_submit_summary_report instead to update it.

## How Entry 0 is Created
Entry 0 combines:
- **Your report** (raw_report parameter) - Your observations, discoveries, and narrative
- **Recent journal entries** (if they exist) - Historical context from past work

Kronus analyzes both sources to extract structured information and create a comprehensive project summary.

## Your Report = The Primary Source
The raw_report is YOUR space to write freely. This is where you capture:
- The narrative and story of what you're building
- The WHY behind decisions, not just the what
- The spirit and essence of the project
- Context, journey, struggles, breakthroughs
- Non-technical aspects: goals, vision, personality
- Technical discoveries (file paths, patterns, versions)

Write like you're journaling - be messy, be expressive, be you.
Kronus extracts technical details into structured sections below,
but your narrative is preserved and valued as the project's soul.

## Entry 0 Sections (extracted from your report)
Kronus will parse your report and populate these structured sections:
- **summary**: High-level project description
- **purpose**: Primary goals and objectives
- **architecture**: System design and structure
- **key_decisions**: Important architectural/design decisions
- **technologies**: Tech stack summary
- **status**: Current project status
- **file_structure**: Directory tree, what lives where
- **tech_stack**: Frameworks, libraries, versions
- **frontend**: UI patterns, components, state management
- **backend**: API routes, middleware, auth patterns
- **database_info**: Schema structure, ORM patterns
- **services**: External APIs and integrations
- **custom_tooling**: Project-specific utilities
- **data_flow**: How data moves through the system
- **patterns**: Naming conventions, code style
- **commands**: Dev, deploy, build commands
- **extended_notes**: Gotchas, TODOs, historical context

## What To Include In Your Report
- Technical discoveries (file paths, patterns, versions)
- Non-technical context (why this approach, what problem it solves)
- The journey (what you tried, what worked, what didn't)
- Gotchas and "future me will thank me" notes
- Anything that makes this project THIS project

## Example Report
"Building a developer journal system to track my coding journey. The soul of this
project is capturing not just what I code, but WHY - the decisions, the learning,
the growth. Using Next.js 16 with App Router, SQLite for portability (no server
needed), and Kronus (Claude) to help me reflect on my work. Structure: src/ for
MCP server, web/ for Next.js app. Important: dates are European (dd/mm/yyyy).
The file_structure discovery: modules/journal/ handles entries, ai/ does the magic."`,
      inputSchema: {
        repository: z.string().min(1).describe('Repository name (must NOT have an existing project summary)'),
        git_url: z.string().optional().describe('Optional Git repository URL (e.g., "https://github.com/user/repo")'),
        raw_report: z.string().min(50).describe('Your free-form report - the PRIMARY source for Entry 0. Include technical discoveries, narrative, context, file structure, tech stack, patterns, etc. Kronus will also analyze recent journal entries (if any exist) to enrich this report.'),
        include_recent_entries: z.number().optional().default(5).describe('Number of recent journal entries to analyze for ADDITIONAL context when creating Entry 0. These entries complement your raw_report (default: 5, max: 20).'),
      },
    },
    async ({ repository, git_url, raw_report, include_recent_entries }) => {
      try {
        // 1. Check if Entry 0 already exists
        const existingSummary = getProjectSummary(repository);

        if (existingSummary) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `⚠️ Project summary (Entry 0) already exists for "${repository}". Use journal_submit_summary_report to update it instead.`,
              },
            ],
          };
        }

        // 2. Get recent journal entries for additional context (if any exist)
        // Entry 0 is synthesized from: raw_report (primary) + recentEntries (additional context)
        const entriesLimit = Math.min(include_recent_entries || 5, 20); // Cap at 20
        const { entries: recentEntries } = getEntriesByRepositoryPaginated(repository, entriesLimit, 0);

        logger.info(`Creating Entry 0 for ${repository} from agent report + ${recentEntries.length} recent journal entries`);

        // 3. Call Kronus to normalize the report and journal entries into structured Entry 0
        // normalizeReport combines: raw_report (agent's observations) + recentEntries (historical context)
        const normalizedUpdates = await normalizeReport(
          raw_report, // Primary source: agent's free-form report
          null, // No existing summary - this is initial creation
          recentEntries, // Additional context: recent journal entries
          journalConfig
        );

        // 4. Merge updates (will just return the updates since there's no existing summary)
        const mergedUpdates = mergeSummaryUpdates(null, normalizedUpdates);

        // 5. Create initial Entry 0
        upsertProjectSummary({
          repository,
          git_url: git_url || null,
          summary: mergedUpdates.summary || 'Project summary',
          purpose: mergedUpdates.purpose || 'To be documented',
          architecture: mergedUpdates.architecture || 'To be documented',
          key_decisions: mergedUpdates.key_decisions || 'To be documented',
          technologies: mergedUpdates.technologies || 'To be documented',
          status: mergedUpdates.status || 'In development',
          linear_project_id: null,
          linear_issue_id: null,
          // Living Project Summary fields
          file_structure: mergedUpdates.file_structure || null,
          tech_stack: mergedUpdates.tech_stack || null,
          frontend: mergedUpdates.frontend || null,
          backend: mergedUpdates.backend || null,
          database_info: mergedUpdates.database_info || null,
          services: mergedUpdates.services || null,
          custom_tooling: mergedUpdates.custom_tooling || null,
          data_flow: mergedUpdates.data_flow || null,
          patterns: mergedUpdates.patterns || null,
          commands: mergedUpdates.commands || null,
          extended_notes: mergedUpdates.extended_notes || null,
          last_synced_entry: recentEntries.length > 0 ? recentEntries[0].commit_hash : null,
          entries_synced: recentEntries.length,
        });

        // Auto-backup
        autoBackup();

        // 6. Track what fields were created
        const createdFields: string[] = [];
        for (const [key, value] of Object.entries(mergedUpdates)) {
          if (value !== null && value !== undefined && String(value).trim().length > 0) {
            createdFields.push(key);
          }
        }

        const output = {
          success: true,
          repository,
          created_fields: createdFields,
          fields_count: createdFields.length,
          entries_analyzed: recentEntries.length,
          message: `Entry 0 (Living Project Summary) created for ${repository} with ${createdFields.length} field(s): ${createdFields.join(', ')}`,
        };

        const text = `✅ Entry 0 (Living Project Summary) created for ${repository}\n\n${JSON.stringify(output, null, 2)}`;

        return {
          content: [
            {
              type: 'text' as const,
              text: truncateOutput(text),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 9: Submit Summary Report (Entry 0 Update)
  server.registerTool(
    'journal_submit_summary_report',
    {
      title: 'Submit Project Summary Report',
      description: `Submit a chaotic report about a project to update Entry 0 (Living Project Summary).
Kronus (Sonnet 4.5) normalizes messy observations into structured sections.

## Your Report = The Soul of the Project
The raw_report is YOUR space to write freely. This is where you capture:
- The narrative and story of what you're building
- The WHY behind decisions, not just the what
- The spirit and essence of the project
- Context, journey, struggles, breakthroughs
- Non-technical aspects: goals, vision, personality

Write like you're journaling - be messy, be expressive, be you.
Kronus extracts technical details into structured sections below,
but your narrative is preserved and valued as the project's soul.

## Entry 0 Sections (extracted from your report)
Kronus will parse your report and populate these structured sections:
- **file_structure**: Directory tree, what lives where
- **tech_stack**: Frameworks, libraries, versions
- **frontend**: UI patterns, components, state management
- **backend**: API routes, middleware, auth patterns
- **database_info**: Schema structure, ORM patterns
- **services**: External APIs and integrations
- **custom_tooling**: Project-specific utilities
- **data_flow**: How data moves through the system
- **patterns**: Naming conventions, code style
- **commands**: Dev, deploy, build commands
- **extended_notes**: Gotchas, TODOs, historical context

## What To Include In Your Report
- Technical discoveries (file paths, patterns, versions)
- Non-technical context (why this approach, what problem it solves)
- The journey (what you tried, what worked, what didn't)
- Gotchas and "future me will thank me" notes
- Anything that makes this project THIS project

## Example Report
"Building a developer journal system to track my coding journey. The soul of this
project is capturing not just what I code, but WHY - the decisions, the learning,
the growth. Using Next.js 16 with App Router, SQLite for portability (no server
needed), and Kronus (Claude) to help me reflect on my work. Structure: src/ for
MCP server, web/ for Next.js app. Important: dates are European (dd/mm/yyyy).
The file_structure discovery: modules/journal/ handles entries, ai/ does the magic."`,
      inputSchema: {
        repository: z.string().min(1).describe('Repository name (must have an existing project summary)'),
        raw_report: z.string().min(50).describe('Your free-form report - the soul/spirit of the project, technical discoveries, narrative, context. Write freely, Kronus extracts structure.'),
        include_recent_entries: z.number().optional().default(5).describe('Also analyze N recent journal entries for additional context (default: 5)'),
      },
    },
    async ({ repository, raw_report, include_recent_entries }) => {
      try {
        // 1. Get existing Entry 0 (project summary)
        const existingSummary = getProjectSummary(repository);

        if (!existingSummary) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `❌ No project summary found for "${repository}". Create a project summary first using the web UI or API before submitting Entry 0 reports.`,
              },
            ],
          };
        }

        // 2. Get recent journal entries for context
        const entriesLimit = Math.min(include_recent_entries || 5, 20); // Cap at 20
        const { entries: recentEntries } = getEntriesByRepositoryPaginated(repository, entriesLimit, 0);

        logger.info(`Normalizing report for ${repository} (${recentEntries.length} recent entries for context)`);

        // 3. Call Kronus (Sonnet 4.5) to normalize the chaotic report
        const normalizedUpdates = await normalizeReport(
          raw_report,
          existingSummary,
          recentEntries,
          journalConfig
        );

        // 4. Merge updates with existing summary
        const mergedUpdates = mergeSummaryUpdates(existingSummary, normalizedUpdates);

        // 5. Track what fields were updated
        const updatedFields: string[] = [];
        for (const [key, value] of Object.entries(mergedUpdates)) {
          if (value !== null && value !== undefined) {
            updatedFields.push(key);
          }
        }

        // 6. Save updated Entry 0
        const latestCommitHash = recentEntries.length > 0 ? recentEntries[0].commit_hash : null;

        upsertProjectSummary({
          repository: existingSummary.repository,
          git_url: existingSummary.git_url,
          summary: mergedUpdates.summary || existingSummary.summary,
          purpose: mergedUpdates.purpose || existingSummary.purpose,
          architecture: mergedUpdates.architecture || existingSummary.architecture,
          key_decisions: mergedUpdates.key_decisions || existingSummary.key_decisions,
          technologies: mergedUpdates.technologies || existingSummary.technologies,
          status: mergedUpdates.status || existingSummary.status,
          linear_project_id: existingSummary.linear_project_id,
          linear_issue_id: existingSummary.linear_issue_id,
          // Living Project Summary fields
          file_structure: mergedUpdates.file_structure || existingSummary.file_structure,
          tech_stack: mergedUpdates.tech_stack || existingSummary.tech_stack,
          frontend: mergedUpdates.frontend || existingSummary.frontend,
          backend: mergedUpdates.backend || existingSummary.backend,
          database_info: mergedUpdates.database_info || existingSummary.database_info,
          services: mergedUpdates.services || existingSummary.services,
          custom_tooling: mergedUpdates.custom_tooling || existingSummary.custom_tooling,
          data_flow: mergedUpdates.data_flow || existingSummary.data_flow,
          patterns: mergedUpdates.patterns || existingSummary.patterns,
          commands: mergedUpdates.commands || existingSummary.commands,
          extended_notes: mergedUpdates.extended_notes || existingSummary.extended_notes,
          last_synced_entry: latestCommitHash,
          entries_synced: (existingSummary.entries_synced || 0) + recentEntries.length,
        });

        // Auto-backup
        autoBackup();

        // 7. Return summary of what changed
        const output = {
          success: true,
          repository,
          updated_fields: updatedFields,
          fields_count: updatedFields.length,
          entries_analyzed: recentEntries.length,
          last_synced_entry: latestCommitHash,
          message: updatedFields.length > 0
            ? `Entry 0 updated with ${updatedFields.length} field(s): ${updatedFields.join(', ')}`
            : 'No fields were updated (existing content was better or no new info)',
        };

        const text = `✅ Entry 0 (Living Project Summary) processed for ${repository}\n\n${JSON.stringify(output, null, 2)}`;

        return {
          content: [
            {
              type: 'text' as const,
              text: truncateOutput(text),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 9: List All Project Summaries
  server.registerTool(
    'journal_list_project_summaries',
    {
      title: 'List All Project Summaries',
      description: '**SEARCH/QUERY TOOL** - List project summaries across all repositories with pagination control. Returns 30 summaries by default (max 50). Each summary includes journal entry statistics (entry_count, last_entry_date) and optional Linear integration fields (linear_project_id, linear_issue_id) if linked to Linear projects/issues. Output complies with MCP truncation limits (~256 lines / 10 KiB). Use limit/offset for pagination.',
      inputSchema: {
        limit: z.number().optional().default(30).describe('Maximum number of summaries to return (default: 30, max: 50)'),
        offset: z.number().optional().default(0).describe('Number of summaries to skip for pagination (default: 0)'),
      },
    },
    async ({ limit, offset }) => {
      try {
        const safeLimit = Math.min(limit || 30, 50); // Cap at 50
        const { summaries, total } = listAllProjectSummariesPaginated(safeLimit, offset || 0);
        
        // Check if output will be truncated before stringifying
        const testOutput = {
          total_summaries: total,
          showing: `${offset || 0} to ${(offset || 0) + summaries.length}`,
          has_more: (offset || 0) + summaries.length < total,
          summaries,
        };
        const testText = `📚 ${total} total project summaries:\n\n${JSON.stringify(testOutput, null, 2)}`;
        const willTruncate = testText.split('\n').length > MAX_SAFE_LINES || Buffer.byteLength(testText, 'utf8') > MAX_SAFE_BYTES;
        
        // Build output object with warning FIRST if truncated (JavaScript preserves insertion order)
        const output: any = {};
        
        // Add clear truncation warning at top of JSON FIRST if needed
        if (willTruncate) {
          output.warning = `⚠️ OUTPUT TRUNCATED ⚠️ Response exceeds MCP size limits (~256 lines / 10 KiB). Showing ${summaries.length} of ${total} summaries. Use pagination (limit/offset) to see more.`;
          output.truncated = true;
          output.summaries_returned = summaries.length;
          output.summaries_total = total;
        }
        
        // Add explanation about fields
        output.note = 'Each summary includes:';
        output.fields_explanation = {
          journal_entry_stats: 'entry_count (number of journal entries) and last_entry_date (ISO date of last entry)',
          linear_integration: 'linear_project_id and/or linear_issue_id (optional Linear project/issue IDs if linked)',
          linear_usage: 'If linear_project_id or linear_issue_id is present, use linear_list_projects or linear_list_issues to fetch Linear data',
        };
        
        // Then add the rest of the fields
        output.total_summaries = total;
        output.showing = `${offset || 0} to ${(offset || 0) + summaries.length}`;
        output.has_more = (offset || 0) + summaries.length < total;
        output.summaries = summaries;
        
        const text = `📚 ${total} total project summaries:\n\n${JSON.stringify(output, null, 2)}`;
        
        return {
          content: [
            {
              type: 'text' as const,
              text: truncateOutput(text),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 9 removed - use resource journal://attachments/{commit_hash} instead

  // Tool 10 removed - use resource journal://attachment/{attachment_id} instead

  // Tool 11: List Media Library (Unified)
  server.registerTool(
    'journal_list_media_library',
    {
      title: 'List Media Library',
      description: `**SEARCH/QUERY TOOL** - Query media assets from the unified library (merges entry_attachments and media_assets tables) with advanced filtering and pagination.

Returns a paginated index with download URLs that models can fetch directly, avoiding MCP truncation limits.

## Sources
- **entry_attachments**: Binary files attached to journal entries (images, diagrams, PDFs)
- **media_assets**: Media from web app (AI-generated images, portfolio assets, documents)

## Query Features
- Multiple filters: repository, commit, destination, MIME type
- Pagination control: limit/offset
- Extended metadata (AI prompts, dimensions, CDN URLs)
- Direct download URLs (requires TARTARUS_URL configuration)

## Example Usage
1. List all images: \`{ mime_type_prefix: "image/" }\`
2. Get assets for a repo: \`{ repository: "Developer Journal Workspace" }\`
3. Find AI-generated images: \`{ destination: "media" }\``,
      inputSchema: {
        repository: z.string().optional().describe('Filter by repository name (searches commit_hash links)'),
        commit_hash: z.string().min(7).optional().describe('Filter by specific commit hash'),
        destination: z.enum(['journal', 'repository', 'media', 'portfolio', 'all']).optional().default('all')
          .describe('Filter by asset destination/category'),
        mime_type_prefix: z.string().optional().describe('Filter by MIME type prefix (e.g., "image/", "application/pdf")'),
        limit: z.number().optional().default(50).describe('Max items to return (default: 50, max: 100)'),
        offset: z.number().optional().default(0).describe('Pagination offset'),
        include_metadata: z.boolean().optional().default(true).describe('Include full metadata (alt, prompt, model, dimensions)'),
      },
    },
    async ({ repository, commit_hash, destination, mime_type_prefix, limit, offset, include_metadata }) => {
      try {
        const result = getUnifiedMediaLibrary(
          {
            repository,
            commit_hash,
            destination: destination as 'journal' | 'repository' | 'media' | 'portfolio' | 'all' | undefined,
            mime_type_prefix,
          },
          limit ?? 50,
          offset ?? 0
        );

        const tartarusUrl = journalConfig.tartarusUrl;

        // Transform items with download URLs
        const items = result.items.map(item => {
          // Generate download URL
          let downloadUrl: string | null = null;
          if (tartarusUrl) {
            if (item.source === 'entry_attachments') {
              downloadUrl = `${tartarusUrl}/api/mcp/attachments/${item.source_id}/raw`;
            } else {
              // Prefer CDN URLs if available
              downloadUrl = item.supabase_url || item.drive_url || `${tartarusUrl}/api/media/${item.source_id}/raw`;
            }
          }

          const baseItem = {
            id: `${item.source === 'entry_attachments' ? 'attachment' : 'media'}:${item.source_id}`,
            source: item.source,
            source_id: item.source_id,
            filename: item.filename,
            mime_type: item.mime_type,
            file_size: item.file_size,
            description: item.description,
            download_url: downloadUrl,
            commit_hash: item.commit_hash,
            repository: item.repository,
            document_id: item.document_id,
            destination: item.destination,
            created_at: item.created_at,
          };

          // Add metadata if requested
          if (include_metadata && item.source === 'media_assets') {
            return {
              ...baseItem,
              metadata: {
                alt: item.alt || undefined,
                prompt: item.prompt || undefined,
                model: item.model || undefined,
                tags: item.tags ? JSON.parse(item.tags) : undefined,
                width: item.width || undefined,
                height: item.height || undefined,
                drive_url: item.drive_url || undefined,
                supabase_url: item.supabase_url || undefined,
              },
            };
          }

          return baseItem;
        });

        const response = {
          total: result.total,
          showing: `${offset} to ${offset + items.length}`,
          has_more: offset + items.length < result.total,
          sources: result.sources,
          base_url: tartarusUrl || null,
          download_enabled: !!tartarusUrl,
          items,
        };

        const text = `📚 Media Library (${result.total} items)\n\n${JSON.stringify(response, null, 2)}`;

        return {
          content: [
            {
              type: 'text' as const,
              text: truncateOutput(text),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // ============================================
  // REPOSITORY TOOLS - Fetch from Tartarus API
  // These tools fetch repository data (documents, skills, experience, etc.)
  // from the Tartarus web app via HTTP API
  // ============================================
  //
  // REPOSITORY STRUCTURE OVERVIEW:
  // The repository contains multiple distinct parts:
  //
  // 1. JOURNAL ENTRIES (git commit-based)
  //    - Created via journal_create_entry
  //    - Linked to git commits, branches, repositories
  //    - Contains: why, what_changed, decisions, technologies, files_changed
  //
  // 2. DOCUMENTS (writings, prompts, notes)
  //    - Types: 'writing', 'prompt', 'note' (primary categorization)
  //    - Labels/Tags: Stored in metadata.tags array (e.g., "poems", "prompts", "skills", "manifesto", "essay")
  //    - Documents can have BOTH a type AND multiple labels
  //    - Example: A document with type="writing" might have tags=["poem", "philosophy"]
  //    - Filter by type OR search by content/title
  //
  // 3. SKILLS (CV/portfolio)
  //    - Technical capabilities with proficiency levels (magnitude 1-5)
  //    - Organized by categories (Frontend, Backend, AI/ML, etc.)
  //
  // 4. WORK EXPERIENCE (CV)
  //    - Job history with companies, roles, achievements
  //
  // 5. EDUCATION (CV)
  //    - Academic background, degrees, institutions
  //
  // 6. PORTFOLIO PROJECTS
  //    - Showcased deliverables, case studies, shipped work
  //    - Distinct from journal project_summaries (which are living docs)
  //
  // NOTE: Documents have a two-level categorization:
  //   - Primary: type field ('writing', 'prompt', 'note')
  //   - Secondary: metadata.tags array (custom labels like 'poem', 'prompt', 'skill', etc.)
  //   - Use type filter for broad categories, search for specific labels/content

  const tartarusUrl = journalConfig.tartarusUrl;
  const mcpApiKey = journalConfig.mcpApiKey;

  // Helper to fetch from Tartarus API
  async function fetchTartarus<T>(endpoint: string): Promise<T> {
    if (!tartarusUrl) {
      throw new Error('TARTARUS_URL not configured. Set this env var to enable repository access.');
    }
    const url = `${tartarusUrl}${endpoint}`;
    logger.info(`Fetching from Tartarus: ${url}`);

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    // Add MCP API key for authentication if configured
    if (mcpApiKey) {
      headers['X-MCP-API-Key'] = mcpApiKey;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Tartarus API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  // Tool 14: repository_search_documents (Search & Query Tool)
  server.registerTool(
    'repository_search_documents',
    {
      title: 'Search & List Repository Documents',
      description: `Search and query documents from the repository (writings, prompts, notes) with advanced filtering and pagination.

**This is a SEARCH TOOL** - Use this when you need to:
- Search documents by keywords in title/content
- Filter by type AND search simultaneously
- Control pagination (limit/offset)
- Get pagination metadata

For simple direct access, use resources instead:
- Get specific document: \`repository://document/{slug_or_id}\` resource
- List by type only: \`repository://documents/{type}\` resource

## Repository Structure: Documents
Documents are organized with TWO levels of categorization:

1. **Primary Type** (required field):
   - \`writing\`: Creative works, essays, poems, philosophical pieces, fiction
   - \`prompt\`: System prompts, AI contexts, templates, instructions for AI
   - \`note\`: Quick notes, reference material, snippets

2. **Labels/Tags** (in metadata.tags array):
   - Additional categorization like "poems", "prompts", "skills", "manifesto", "essay", "reflection", etc.
   - Documents can have multiple tags
   - Example: A document with type="writing" might have tags=["poem", "philosophy"]

## Search & Filtering Capabilities
- **Search**: Search in title and content (finds documents by keywords, including tag names)
- **Type filter**: Filter by broad category (writing/prompt/note)
- **Combined**: Use both \`type\` and \`search\` together for precise queries
- Documents can appear in multiple categories via metadata.alsoShownIn

## Pagination Control
- \`limit\`: Maximum documents to return (default: 50, max: 100)
- \`offset\`: Number of documents to skip (default: 0)
- Returns pagination metadata: total, showing range, has_more flag

## Returns
Document metadata including: id, slug, type, title, language, excerpt, dates.
Full document content available via \`repository://document/{slug_or_id}\` resource.

Requires TARTARUS_URL to be configured.`,
      inputSchema: {
        type: z.enum(['writing', 'prompt', 'note']).optional().describe('Filter by primary document type (writing/prompt/note)'),
        search: z.string().optional().describe('Search in title and content (can find documents by keywords or tag names)'),
        limit: z.number().optional().default(50).describe('Maximum number of documents to return (default: 50, max: 100)'),
        offset: z.number().optional().default(0).describe('Number of documents to skip for pagination (default: 0)'),
      },
    },
    async ({ type, search, limit = 50, offset = 0 }) => {
      try {
        const safeLimit = Math.min(limit, 100); // Cap at 100
        const params = new URLSearchParams();
        if (type) params.set('type', type);
        if (search) params.set('search', search);
        params.set('limit', safeLimit.toString());
        params.set('offset', offset.toString());

        const queryString = params.toString();
        const response = await fetchTartarus<{
          documents: any[];
          total: number;
          limit: number;
          offset: number;
          has_more: boolean;
        }>(`/api/documents?${queryString}`);

        // Format response
        const formatted = response.documents.map(doc => ({
          id: doc.id,
          slug: doc.slug,
          type: doc.type,
          title: doc.title,
          language: doc.language,
          excerpt: doc.content?.substring(0, 200) + (doc.content?.length > 200 ? '...' : ''),
          created_at: doc.createdAt,
          updated_at: doc.updatedAt,
        }));

        // Build output with pagination info (similar to journal tools)
        const output: any = {
          total_documents: response.total,
          showing: `${offset} to ${offset + formatted.length}`,
          has_more: response.has_more,
          documents: formatted,
        };

        // Check if output will be truncated
        const testText = `📄 Documents (${response.total} total)\n\n${JSON.stringify(output, null, 2)}`;
        const willTruncate = testText.split('\n').length > MAX_SAFE_LINES || Buffer.byteLength(testText, 'utf8') > MAX_SAFE_BYTES;

        if (willTruncate) {
          output.warning = `⚠️ OUTPUT TRUNCATED ⚠️ Response exceeds MCP size limits (~256 lines / 10 KiB). Showing ${formatted.length} of ${response.total} documents. Use pagination (limit/offset) to see more.`;
          output.truncated = true;
          output.documents_returned = formatted.length;
          output.documents_total = response.total;
        }

        const text = `📄 Documents (${response.total} total)\n\n${JSON.stringify(output, null, 2)}`;

        return {
          content: [{ type: 'text' as const, text: truncateOutput(text) }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 15 removed - use resource repository://document/{slug_or_id} instead

  // Tool 16: repository_list_skills
  server.registerTool(
    'repository_list_skills',
    {
      title: 'List Skills',
      description: `List all skills from the CV/portfolio section of the repository.

## Repository Structure: Skills
Skills represent technical capabilities and expertise areas:
- Organized by categories (Frontend, Backend, AI/ML, Design, etc.)
- Proficiency levels: magnitude 1-5 (1=Beginner, 5=Expert)
- Includes descriptions and tags

## Returns
Skills grouped by category with:
- Name, category, proficiency level (magnitude + human-readable level)
- Description, tags
- Useful for understanding technical capabilities and expertise areas.`,
      inputSchema: {
        category: z.string().optional().describe('Filter by category (e.g., "Frontend", "Backend", "AI/ML")'),
      },
    },
    async ({ category }) => {
      try {
        const params = new URLSearchParams();
        if (category) params.set('category', category);

        const queryString = params.toString();
        const skills = await fetchTartarus<any[]>(`/api/cv/skills${queryString ? `?${queryString}` : ''}`);

        // Map magnitude to level names
        const levelMap: Record<number, string> = {
          5: 'Expert',
          4: 'Professional',
          3: 'Intermediate',
          2: 'Apprentice',
          1: 'Beginner',
        };

        const formatted = skills.map(s => ({
          id: s.id,
          name: s.name,
          category: s.category,
          level: levelMap[s.magnitude] || 'Unknown',
          magnitude: s.magnitude,
          description: s.description,
          tags: s.tags ? JSON.parse(s.tags) : [],
        }));

        // Group by category
        const byCategory: Record<string, any[]> = {};
        for (const skill of formatted) {
          const cat = skill.category || 'Other';
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(skill);
        }

        const text = `🛠️ Skills (${formatted.length} total)\n\n${JSON.stringify(byCategory, null, 2)}`;

        return {
          content: [{ type: 'text' as const, text: truncateOutput(text) }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 17: repository_list_experience
  server.registerTool(
    'repository_list_experience',
    {
      title: 'List Work Experience',
      description: `List work experience history from the CV section of the repository.

## Repository Structure: Work Experience
Professional job history including:
- Company, title, department, location
- Date ranges (start → end or Present)
- Tagline/description
- Achievements (array of accomplishments)

Useful for understanding professional background and career history.`,
      inputSchema: {},
    },
    async () => {
      try {
        const experience = await fetchTartarus<any[]>('/api/cv/experience');

        const formatted = experience.map(job => ({
          id: job.id,
          title: job.title,
          company: job.company,
          department: job.department,
          location: job.location,
          period: `${job.dateStart} → ${job.dateEnd || 'Present'}`,
          tagline: job.tagline,
          achievements: job.achievements ? JSON.parse(job.achievements) : [],
        }));

        const text = `💼 Work Experience (${formatted.length} entries)\n\n${JSON.stringify(formatted, null, 2)}`;

        return {
          content: [{ type: 'text' as const, text: truncateOutput(text) }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 18: repository_list_education
  server.registerTool(
    'repository_list_education',
    {
      title: 'List Education',
      description: `List education history from the CV section of the repository.

## Repository Structure: Education
Academic background including:
- Degree, field of study, institution, location
- Date ranges (start → end or Present)
- Tagline/description
- Focus areas and achievements

Useful for understanding academic background and qualifications.`,
      inputSchema: {},
    },
    async () => {
      try {
        const education = await fetchTartarus<any[]>('/api/cv/education');

        const formatted = education.map(edu => ({
          id: edu.id,
          degree: edu.degree,
          field: edu.field,
          institution: edu.institution,
          location: edu.location,
          period: `${edu.dateStart} → ${edu.dateEnd || 'Present'}`,
          tagline: edu.tagline,
          focusAreas: edu.focusAreas ? JSON.parse(edu.focusAreas) : [],
          achievements: edu.achievements ? JSON.parse(edu.achievements) : [],
        }));

        const text = `🎓 Education (${formatted.length} entries)\n\n${JSON.stringify(formatted, null, 2)}`;

        return {
          content: [{ type: 'text' as const, text: truncateOutput(text) }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 19: repository_list_portfolio_projects
  server.registerTool(
    'repository_list_portfolio_projects',
    {
      title: 'List Portfolio Projects',
      description: `List portfolio projects (shipped work, case studies) from the repository.

## Repository Structure: Portfolio Projects
Showcased deliverables and case studies:
- Projects with titles, categories, companies, roles
- Status: shipped, wip (work in progress), archived
- Technologies used, metrics, links
- Featured flag for highlighting

## Important Distinction
These are DISTINCT from journal project_summaries:
- **Portfolio Projects**: Showcased deliverables, case studies, shipped work
- **Journal Project Summaries (Entry 0)**: Living documentation of active projects (created via journal_create_project_summary)

Returns projects with titles, categories, technologies, and metrics.`,
      inputSchema: {
        status: z.enum(['shipped', 'wip', 'archived']).optional().describe('Filter by project status'),
        featured: z.boolean().optional().describe('Only show featured projects'),
      },
    },
    async ({ status, featured }) => {
      try {
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        if (featured !== undefined) params.set('featured', featured.toString());

        const queryString = params.toString();
        const projects = await fetchTartarus<any[]>(`/api/portfolio-projects${queryString ? `?${queryString}` : ''}`);

        const formatted = projects.map(p => ({
          id: p.id,
          title: p.title,
          category: p.category,
          company: p.company,
          status: p.status,
          featured: p.featured,
          role: p.role,
          dateCompleted: p.dateCompleted,
          excerpt: p.excerpt,
          technologies: p.technologies ? JSON.parse(p.technologies) : [],
          metrics: p.metrics ? JSON.parse(p.metrics) : {},
          links: p.links ? JSON.parse(p.links) : {},
        }));

        const text = `🚀 Portfolio Projects (${formatted.length} found)\n\n${JSON.stringify(formatted, null, 2)}`;

        return {
          content: [{ type: 'text' as const, text: truncateOutput(text) }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 20 removed - use resource repository://portfolio-project/{id} instead

  logger.success('Journal tools registered (7 tools) + Repository tools (5 tools via Tartarus API)');

  // ============================================
  // MCP Resources - Expose journal data as resources
  // AI SDK 6.0 feature: Resources provide read-only data access
  // ============================================

  // Resource: List of all repositories
  server.registerResource(
    'repositories',
    'journal://repositories',
    {
      description: 'List of all repositories with journal entries',
      mimeType: 'application/json',
    },
    async () => {
      const repositories = listRepositories();
      return {
        contents: [{
          uri: 'journal://repositories',
          mimeType: 'application/json',
          text: JSON.stringify(repositories, null, 2),
        }],
      };
    }
  );

  // Resource Template: Project summary by repository
  server.registerResource(
    'project-summary',
    new ResourceTemplate('journal://summary/{repository}', { list: undefined }),
    {
      description: 'Get Entry 0 (Living Project Summary) for a repository',
      mimeType: 'application/json',
    },
    async (uri, { repository }) => {
      const summary = getProjectSummary(repository as string);
      if (!summary) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: `No project summary found for ${repository}` }),
          }],
        };
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(summary, null, 2),
        }],
      };
    }
  );

  // Resource Template: Get journal entry by commit hash
  server.registerResource(
    'journal-entry',
    new ResourceTemplate('journal://entry/{commit_hash}', { list: undefined }),
    {
      description: 'Get a journal entry by commit hash. By default excludes raw_agent_report. Add ?include_raw_report=true to URI query to include full report.',
      mimeType: 'application/json',
    },
    async (uri, { commit_hash }) => {
      try {
        // Check for query parameter
        const url = new URL(uri.href);
        const includeRawReport = url.searchParams.get('include_raw_report') === 'true';

        const entry = getEntryByCommit(commit_hash as string);
        if (!entry) {
          return {
            contents: [{
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: `No journal entry found for commit ${commit_hash}` }),
            }],
          };
        }

        const summary = formatEntrySummary(entry, includeRawReport);
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(summary, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ 
              error: `Failed to fetch entry: ${error instanceof Error ? error.message : 'Unknown error'}` 
            }),
          }],
        };
      }
    }
  );

  // Resource Template: List branches for a repository
  server.registerResource(
    'journal-branches',
    new ResourceTemplate('journal://branches/{repository}', { list: undefined }),
    {
      description: 'List all branches in a repository that have journal entries. Returns a simple list of branch names.',
      mimeType: 'application/json',
    },
    async (uri, { repository }) => {
      try {
        const branches = listBranches(repository as string);
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              repository: repository,
              branch_count: branches.length,
              branches: branches,
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ 
              error: `Failed to fetch branches: ${error instanceof Error ? error.message : 'Unknown error'}` 
            }),
          }],
        };
      }
    }
  );

  // Resource Template: List attachments for a journal entry
  server.registerResource(
    'journal-attachments',
    new ResourceTemplate('journal://attachments/{commit_hash}', { list: undefined }),
    {
      description: 'List attachment metadata for a journal entry by commit hash. Binary file data is excluded. Use journal://attachment/{attachment_id} resource to get individual attachment details.',
      mimeType: 'application/json',
    },
    async (uri, { commit_hash }) => {
      try {
        // Use metadata-only function (no binary data)
        const attachments = getAttachmentMetadataByCommit(commit_hash as string);

        const stats = getAttachmentStats(commit_hash as string);

        // Add download URLs if Tartarus URL is configured
        const attachmentsWithUrls = attachments.map((att: any) => ({
          ...att,
          download_url: journalConfig.tartarusUrl
            ? `${journalConfig.tartarusUrl}/api/attachments/${att.id}/raw`
            : null,
        }));

        const output: any = {
          commit_hash: commit_hash,
          attachment_count: attachments.length,
          total_size_bytes: stats.total_size,
          total_size_kb: (stats.total_size / 1024).toFixed(2),
          attachments: attachmentsWithUrls,
        };

        // Add helpful note about download URLs
        if (journalConfig.tartarusUrl) {
          output.download_note = 'Use download_url to fetch full file content via HTTP (bypasses MCP truncation limits)';
        } else {
          output.download_note = 'Set TARTARUS_URL env var to enable direct download URLs';
        }

        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(output, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ 
              error: `Failed to fetch attachments: ${error instanceof Error ? error.message : 'Unknown error'}` 
            }),
          }],
        };
      }
    }
  );

  // Resource Template: Get attachment by ID
  server.registerResource(
    'journal-attachment',
    new ResourceTemplate('journal://attachment/{attachment_id}', { list: undefined }),
    {
      description: 'Get attachment metadata by attachment ID. **Base64 data is excluded by default** to avoid heavy payloads (especially for images). Use download_url to fetch binary files via HTTP. Add ?include_data=true&max_chars=500 to URI query only for small text files (NOT recommended for images).',
      mimeType: 'application/json',
    },
    async (uri, { attachment_id }) => {
      try {
        const attachment = getAttachmentById(Number(attachment_id));
        if (!attachment) {
          return {
            contents: [{
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: `No attachment found with ID ${attachment_id}` }),
            }],
          };
        }

        // Check for query parameters
        const url = new URL(uri.href);
        const includeData = url.searchParams.get('include_data') === 'true';
        const maxChars = parseInt(url.searchParams.get('max_chars') || '500', 10);

        // Build download URL if Tartarus URL is configured
        const downloadUrl = journalConfig.tartarusUrl
          ? `${journalConfig.tartarusUrl}/api/attachments/${attachment.id}/raw`
          : null;

        // Check if this is an image
        const isImage = attachment.mime_type?.startsWith('image/');
        const isLargeFile = attachment.file_size > 100 * 1024; // > 100KB

        const output: any = {
          id: attachment.id,
          filename: attachment.filename,
          mime_type: attachment.mime_type,
          description: attachment.description || null,
          file_size_bytes: attachment.file_size,
          file_size_kb: (attachment.file_size / 1024).toFixed(2),
          commit_hash: attachment.commit_hash,
          uploaded_at: attachment.uploaded_at,
          download_url: downloadUrl,
        };

        // Add warnings for images/large files
        if (isImage) {
          output.warning = '⚠️ This is an image file. Base64 encoding would be very large. Use download_url to fetch the image via HTTP instead.';
        } else if (isLargeFile) {
          output.warning = `⚠️ This file is large (${(attachment.file_size / 1024).toFixed(2)} KB). Base64 encoding would exceed MCP limits. Use download_url to fetch via HTTP instead.`;
        }

        if (includeData) {
          // Warn if trying to include data for images or large files
          if (isImage) {
            output.error = 'Cannot include base64 data for image files. Use download_url instead.';
            output.data_included = false;
          } else if (isLargeFile) {
            output.warning = 'File is large - only including preview. Use download_url for full file.';
            const data_base64 = attachment.data.toString('base64');
            const previewLength = Math.min(maxChars, Math.min(data_base64.length, 10000)); // Cap at 10KB preview
            output.data_base64_preview = data_base64.substring(0, previewLength);
            output.data_base64_full_length = data_base64.length;
            output.note = `Preview only (${previewLength}/${data_base64.length} chars). Use download_url to fetch full file.`;
          } else {
            // Small text files - include data
            const data_base64 = attachment.data.toString('base64');
            const previewLength = Math.min(maxChars, data_base64.length);
            output.data_base64_preview = data_base64.substring(0, previewLength);
            output.data_base64_full_length = data_base64.length;
            output.note = previewLength < data_base64.length
              ? `Data truncated for preview (${previewLength}/${data_base64.length} chars). Use download_url to fetch full file.`
              : 'Full data included';
          }
        } else {
          // Default: no data included
          if (downloadUrl) {
            output.note = 'Binary data excluded by default. Use download_url to fetch full file via HTTP (bypasses MCP size limits).';
            if (isImage) {
              output.recommendation = 'For images, always use download_url - base64 encoding would be too large for MCP.';
            }
          } else {
            output.note = 'Binary data excluded. Set TARTARUS_URL env var to enable direct download URLs.';
          }
        }

        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(output, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ 
              error: `Failed to fetch attachment: ${error instanceof Error ? error.message : 'Unknown error'}` 
            }),
          }],
        };
      }
    }
  );

  // ============================================
  // REPOSITORY RESOURCES - Expose repository documents as resources
  // Resources provide read-only data access via URIs
  // ============================================

  const tartarusUrlForResources = journalConfig.tartarusUrl;
  const mcpApiKeyForResources = journalConfig.mcpApiKey;

  // Helper to fetch from Tartarus API (for resources)
  async function fetchTartarusForResource<T>(endpoint: string): Promise<T> {
    if (!tartarusUrlForResources) {
      throw new Error('TARTARUS_URL not configured. Set this env var to enable repository resources.');
    }
    const url = `${tartarusUrlForResources}${endpoint}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (mcpApiKeyForResources) {
      headers['X-MCP-API-Key'] = mcpApiKeyForResources;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Tartarus API error (${response.status}): ${errorText}`);
    }
    return response.json();
  }

  // Resource Template: Get document by slug or ID
  server.registerResource(
    'repository-document',
    new ResourceTemplate('repository://document/{slug_or_id}', { list: undefined }),
    {
      description: 'Get a repository document (writing, prompt, or note) by slug or ID. Returns full document content (text/markdown). Document content is text-based and should not contain heavy base64 data.',
      mimeType: 'application/json',
    },
    async (uri, { slug_or_id }) => {
      try {
        const document = await fetchTartarusForResource<any>(`/api/documents/${encodeURIComponent(slug_or_id as string)}`);
        
        // Check if document content is suspiciously large (might contain embedded base64)
        const contentLength = document.content?.length || 0;
        const isLargeContent = contentLength > 100000; // > 100KB of text
        
        const output: any = { ...document };
        
        if (isLargeContent) {
          output.warning = `⚠️ Document content is large (${(contentLength / 1024).toFixed(2)} KB). If it contains embedded base64 images, consider using separate image resources instead.`;
          // Still return full content, but warn about size
        }
        
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(output, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ 
              error: `Failed to fetch document: ${error instanceof Error ? error.message : 'Unknown error'}` 
            }),
          }],
        };
      }
    }
  );

  // Resource Template: List documents by type
  server.registerResource(
    'repository-documents-by-type',
    new ResourceTemplate('repository://documents/{type}', { 
      list: async () => {
        // Return list of available types
        return [
          { uri: 'repository://documents/writing', name: 'Writings' },
          { uri: 'repository://documents/prompt', name: 'Prompts' },
          { uri: 'repository://documents/note', name: 'Notes' },
        ];
      }
    }),
    {
      description: 'List repository documents filtered by type (writing, prompt, or note). Returns paginated results (default: 50 documents).',
      mimeType: 'application/json',
    },
    async (uri, { type }) => {
      try {
        const validTypes = ['writing', 'prompt', 'note'];
        if (!validTypes.includes(type as string)) {
          return {
            contents: [{
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ 
                error: `Invalid type. Must be one of: ${validTypes.join(', ')}` 
              }),
            }],
          };
        }

        const response = await fetchTartarusForResource<{
          documents: any[];
          total: number;
          limit: number;
          offset: number;
          has_more: boolean;
        }>(`/api/documents?type=${type}&limit=50&offset=0`);

        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              type: type,
              total: response.total,
              showing: `0 to ${response.documents.length}`,
              has_more: response.has_more,
              documents: response.documents.map(doc => ({
                id: doc.id,
                slug: doc.slug,
                type: doc.type,
                title: doc.title,
                language: doc.language,
                excerpt: doc.content?.substring(0, 200) + (doc.content?.length > 200 ? '...' : ''),
                created_at: doc.createdAt,
                updated_at: doc.updatedAt,
              })),
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ 
              error: `Failed to fetch documents: ${error instanceof Error ? error.message : 'Unknown error'}` 
            }),
          }],
        };
      }
    }
  );

  // Resource Template: Get portfolio project by ID
  server.registerResource(
    'repository-portfolio-project',
    new ResourceTemplate('repository://portfolio-project/{id}', { list: undefined }),
    {
      description: 'Get full details of a portfolio project by ID. Returns complete project information including description, metrics, and links.',
      mimeType: 'application/json',
    },
    async (uri, { id }) => {
      try {
        const project = await fetchTartarusForResource<any>(`/api/portfolio-projects/${encodeURIComponent(id as string)}`);
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(project, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ 
              error: `Failed to fetch portfolio project: ${error instanceof Error ? error.message : 'Unknown error'}` 
            }),
          }],
        };
      }
    }
  );

  logger.success('Journal resources registered (7 resources) + Repository resources (3 resource templates)');

  // ============================================
  // LINEAR CACHE RESOURCES - Historical buffer of Linear data
  // Data is cached locally, includes deleted items for history
  // ============================================

  // Resource: Linear cache stats
  server.registerResource(
    'linear-cache-stats',
    'linear://cache/stats',
    {
      description: 'Get Linear cache statistics - shows active/deleted/total counts for projects and issues. The cache is a HISTORICAL BUFFER that preserves data even after Linear deletes it.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const stats = getLinearCacheStats();
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              description: 'Linear cache is a historical buffer - we preserve ALL data including deleted items',
              projects: stats.projects,
              issues: stats.issues,
              last_project_sync: stats.lastProjectSync,
              last_issue_sync: stats.lastIssueSync,
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: `Failed to get Linear cache stats: ${error instanceof Error ? error.message : 'Unknown error'}` }),
          }],
        };
      }
    }
  );

  // Resource: List Linear projects (cached)
  server.registerResource(
    'linear-projects',
    'linear://projects',
    {
      description: 'List all cached Linear projects (historical buffer - includes deleted projects). Rich descriptions preserved for AI context.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const { projects, total } = listLinearProjects({ includeDeleted: true, limit: 100 });
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              total,
              note: 'Historical buffer - includes deleted projects (is_deleted=true)',
              projects: projects.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description,
                state: p.state,
                progress: p.progress,
                url: p.url,
                lead_name: p.lead_name,
                is_deleted: p.is_deleted,
                synced_at: p.synced_at,
              })),
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: `Failed to list Linear projects: ${error instanceof Error ? error.message : 'Unknown error'}` }),
          }],
        };
      }
    }
  );

  // Resource Template: Get Linear project by ID
  server.registerResource(
    'linear-project',
    new ResourceTemplate('linear://project/{id}', { list: undefined }),
    {
      description: 'Get full details of a cached Linear project by ID. Includes rich description and content preserved in our historical buffer.',
      mimeType: 'application/json',
    },
    async (uri, { id }) => {
      try {
        const project = getLinearProject(id as string);
        if (!project) {
          return {
            contents: [{
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: `Linear project not found: ${id}` }),
            }],
          };
        }
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(project, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: `Failed to get Linear project: ${error instanceof Error ? error.message : 'Unknown error'}` }),
          }],
        };
      }
    }
  );

  // Resource: List Linear issues (cached)
  server.registerResource(
    'linear-issues',
    'linear://issues',
    {
      description: 'List all cached Linear issues (historical buffer - includes deleted issues). Rich descriptions and context preserved for AI.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const { issues, total } = listLinearIssues({ includeDeleted: true, limit: 100 });
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              total,
              note: 'Historical buffer - includes deleted issues (is_deleted=true)',
              issues: issues.map(i => ({
                id: i.id,
                identifier: i.identifier,
                title: i.title,
                description: i.description?.substring(0, 500) + (i.description && i.description.length > 500 ? '...' : ''),
                state_name: i.state_name,
                assignee_name: i.assignee_name,
                project_name: i.project_name,
                url: i.url,
                priority: i.priority,
                is_deleted: i.is_deleted,
                synced_at: i.synced_at,
              })),
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: `Failed to list Linear issues: ${error instanceof Error ? error.message : 'Unknown error'}` }),
          }],
        };
      }
    }
  );

  // Resource Template: Get Linear issue by ID or identifier
  server.registerResource(
    'linear-issue',
    new ResourceTemplate('linear://issue/{identifier}', { list: undefined }),
    {
      description: 'Get full details of a cached Linear issue by ID or identifier (e.g., DEV-123). Includes full description preserved in historical buffer.',
      mimeType: 'application/json',
    },
    async (uri, { identifier }) => {
      try {
        const issue = getLinearIssue(identifier as string);
        if (!issue) {
          return {
            contents: [{
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: `Linear issue not found: ${identifier}` }),
            }],
          };
        }
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(issue, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: `Failed to get Linear issue: ${error instanceof Error ? error.message : 'Unknown error'}` }),
          }],
        };
      }
    }
  );

  logger.success('Linear cache resources registered (5 resources)');

  // ============================================
  // CV RESOURCES - Skills, Experience, Education from repository
  // Exposed via Tartarus API
  // ============================================

  // Resource: CV Skills
  server.registerResource(
    'cv-skills',
    'repository://cv/skills',
    {
      description: 'List all skills from CV/portfolio with categories, proficiency levels, and descriptions.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const response = await fetchTartarusForResource<any[]>('/api/cv/skills');
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              total: response.length,
              skills: response,
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: `Failed to fetch skills: ${error instanceof Error ? error.message : 'Unknown error'}` }),
          }],
        };
      }
    }
  );

  // Resource: CV Experience
  server.registerResource(
    'cv-experience',
    'repository://cv/experience',
    {
      description: 'List all work experience from CV/portfolio with companies, roles, and achievements.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const response = await fetchTartarusForResource<any[]>('/api/cv/experience');
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              total: response.length,
              experience: response,
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: `Failed to fetch experience: ${error instanceof Error ? error.message : 'Unknown error'}` }),
          }],
        };
      }
    }
  );

  // Resource: CV Education
  server.registerResource(
    'cv-education',
    'repository://cv/education',
    {
      description: 'List all education from CV/portfolio with degrees, institutions, and achievements.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const response = await fetchTartarusForResource<any[]>('/api/cv/education');
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              total: response.length,
              education: response,
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: `Failed to fetch education: ${error instanceof Error ? error.message : 'Unknown error'}` }),
          }],
        };
      }
    }
  );

  logger.success('CV resources registered (3 resources)');

  // ============================================
  // MCP Prompts - Reusable prompt templates
  // AI SDK 6.0 feature: User-controlled prompts for common operations
  // ============================================

  // Prompt: Create journal entry
  server.registerPrompt(
    'create-entry',
    {
      title: 'Create Journal Entry',
      description: 'Generate a journal entry prompt for documenting a git commit',
      argsSchema: {
        commit_hash: z.string().describe('The git commit SHA'),
        repository: z.string().describe('Repository name'),
        branch: z.string().default('main').describe('Git branch name'),
      },
    },
    async ({ commit_hash, repository, branch }) => {
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Create a developer journal entry for this commit:

Repository: ${repository}
Branch: ${branch}
Commit: ${commit_hash}

Please analyze the commit and provide a detailed report including:
1. Why these changes were made (motivation)
2. What specifically changed (technical details)
3. Key decisions made and their reasoning
4. Technologies used

Use the journal_create_entry tool with your analysis.`,
          },
        }],
      };
    }
  );

  // Prompt: Update Entry 0 summary
  server.registerPrompt(
    'update-summary',
    {
      title: 'Update Project Summary',
      description: 'Submit a report to update Entry 0 (Living Project Summary)',
      argsSchema: {
        repository: z.string().describe('Repository name'),
      },
    },
    async ({ repository }) => {
      const summary = getProjectSummary(repository);
      const existingContext = summary
        ? `\nCurrent Entry 0 has: ${summary.summary ? 'summary' : ''} ${summary.tech_stack ? 'tech_stack' : ''} ${summary.file_structure ? 'file_structure' : ''}...`
        : '\nNo existing Entry 0 found - this will create a new one.';

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Update the Living Project Summary (Entry 0) for: ${repository}
${existingContext}

Please provide a chaotic report with any of the following you've discovered:
- File structure and organization
- Tech stack (frameworks, libraries, versions)
- Frontend/backend patterns
- Database schema and ORM patterns
- External services and integrations
- Development commands
- Gotchas and notes

Use journal_create_project_summary if Entry 0 doesn't exist yet, or journal_submit_summary_report to update an existing Entry 0.`,
          },
        }],
      };
    }
  );

  // Prompt: Explore repository
  server.registerPrompt(
    'explore-repo',
    {
      title: 'Explore Repository',
      description: 'Get started exploring a repository\'s journal history',
      argsSchema: {
        repository: z.string().describe('Repository name'),
      },
    },
    async ({ repository }) => {
      const summary = getProjectSummary(repository);
      const entries = getEntriesByRepositoryPaginated(repository, 5, 0, false);

      let context = `Repository: ${repository}\n`;
      if (summary) {
        context += `\nEntry 0 Summary: ${summary.summary || 'Not set'}\n`;
        context += `Technologies: ${summary.technologies || 'Not set'}\n`;
        context += `Status: ${summary.status || 'Not set'}\n`;
      }
      if (entries.length > 0) {
        context += `\nRecent entries: ${entries.length}\n`;
        context += entries.map(e => `- ${e.commit_hash.substring(0, 7)}: ${e.why?.substring(0, 50)}...`).join('\n');
      }

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Help me understand the ${repository} project.

${context}

What would you like to know? I can:
1. Show recent journal entries (journal_list_by_repository)
2. Get the full project summary (journal://summary/{repository} resource)
3. List branches with activity (journal_list_branches)
4. Search for specific commits (journal://entry/{commit_hash} resource)`,
          },
        }],
      };
    }
  );

  logger.success('Journal prompts registered (3 prompts)');
}
