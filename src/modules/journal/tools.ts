import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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

  // Tool 2: Get Entry by Commit
  server.registerTool(
    'journal_get_entry',
    {
      title: 'Get Journal Entry by Commit',
      description: 'Retrieve a journal entry by its commit hash. By default excludes raw_agent_report to comply with MCP truncation limits (~256 lines / 10 KiB). Use include_raw_report=true to include the full report.',
      inputSchema: {
        commit_hash: AgentInputSchema.shape.commit_hash,
        include_raw_report: z.boolean().optional().default(false).describe('Include full raw_agent_report field (can be very large, default: false)'),
      },
    },
    async ({ commit_hash, include_raw_report }) => {
      try {
        const entry = getEntryByCommit(commit_hash);

        if (!entry) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No journal entry found for commit ${commit_hash}`,
              },
            ],
          };
        }

        const summary = formatEntrySummary(entry, include_raw_report);
        const output = JSON.stringify(summary, null, 2);
        
        return {
          content: [
            {
              type: 'text' as const,
              text: truncateOutput(output),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 3: List Entries by Repository
  server.registerTool(
    'journal_list_by_repository',
    {
      title: 'List Journal Entries by Repository',
      description: 'List journal entries for a repository with pagination. Returns 20 entries by default (max 50). Each entry includes attachment_count showing how many files (images, diagrams, etc.) are attached. Large fields (raw_agent_report) excluded by default to comply with MCP truncation limits (~256 lines / 10 KiB). Use journal_list_attachments to see attachment details for a specific commit.',
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
      description: 'List journal entries for a repository and branch with pagination. Returns 20 entries by default (max 50). Each entry includes attachment_count showing how many files (images, diagrams, etc.) are attached. Large fields (raw_agent_report) excluded by default to comply with MCP truncation limits (~256 lines / 10 KiB). Use journal_list_attachments to see attachment details for a specific commit.',
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

  // Tool 5: List Repositories
  server.registerTool(
    'journal_list_repositories',
    {
      title: 'List All Repositories',
      description: 'List all repositories that have journal entries. Returns a simple list of repository names. Output is truncation-safe and complies with MCP limits.',
      inputSchema: {},
    },
    async () => {
      try {
        const repositories = listRepositories();
        const text = `📚 ${repositories.length} repositories:\n${repositories.join('\n')}`;
        
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

  // Tool 6: List Branches
  server.registerTool(
    'journal_list_branches',
    {
      title: 'List Branches for Repository',
      description: 'List all branches in a repository that have journal entries. Returns a simple list of branch names. Output is truncation-safe and complies with MCP limits.',
      inputSchema: {
        repository: AgentInputSchema.shape.repository,
      },
    },
    async ({ repository }) => {
      try {
        const branches = listBranches(repository);
        const text = `🌿 ${branches.length} branches in ${repository}:\n${branches.join('\n')}`;
        
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

  // Tool 7: Get Project Summary
  server.registerTool(
    'journal_get_project_summary',
    {
      title: 'Get Project Summary',
      description: 'Retrieve the high-level summary for a repository. Includes journal entry statistics (entry_count, last_entry_date) and optional Linear integration fields (linear_project_id, linear_issue_id) if linked to Linear projects/issues.',
      inputSchema: {
        repository: ProjectSummaryInputSchema.shape.repository,
      },
    },
    async ({ repository }) => {
      try {
        const projectSummary = getProjectSummary(repository);

        if (!projectSummary) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No project summary found for ${repository}`,
              },
            ],
          };
        }

        // Build response with explanation
        let responseText = `📋 Project Summary for ${repository}:\n\n`;
        
        // Add Linear integration explanation if present
        if (projectSummary.linear_project_id || projectSummary.linear_issue_id) {
          responseText += `🔗 Linear Integration:\n`;
          if (projectSummary.linear_project_id) {
            responseText += `  • Linear Project ID: ${projectSummary.linear_project_id}\n`;
            responseText += `    → This repository is linked to a Linear project. Use linear_list_projects or linear_get_viewer to fetch project details.\n`;
          }
          if (projectSummary.linear_issue_id) {
            responseText += `  • Linear Issue ID: ${projectSummary.linear_issue_id}\n`;
            responseText += `    → This repository is linked to a Linear issue. Use linear_list_issues to fetch issue details.\n`;
          }
          responseText += `\n`;
        }
        
        // Add journal entry stats explanation
        if (projectSummary.entry_count !== undefined) {
          responseText += `📊 Journal Entry Statistics:\n`;
          responseText += `  • Total entries: ${projectSummary.entry_count}\n`;
          if (projectSummary.last_entry_date) {
            responseText += `  • Last entry date: ${projectSummary.last_entry_date}\n`;
          } else {
            responseText += `  • Last entry date: None\n`;
          }
          responseText += `\n`;
        }
        
        responseText += `📄 Full Project Summary:\n${JSON.stringify(projectSummary, null, 2)}`;

        return {
          content: [
            {
              type: 'text' as const,
              text: responseText,
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 8: Submit Summary Report (Entry 0 Update)
  server.registerTool(
    'journal_submit_summary_report',
    {
      title: 'Submit Project Summary Report',
      description: `Submit a chaotic report about a project to update Entry 0 (Living Project Summary).
Kronus (Sonnet 4.5) normalizes messy observations into structured sections.

Can include:
- File structure discoveries
- Code patterns and conventions
- Tech stack info (frameworks, libraries, versions)
- Dev/deploy commands
- Gotchas and historical context
- Anything relevant to the project

Be as detailed or messy as needed - Kronus will structure it.`,
      inputSchema: {
        repository: z.string().min(1).describe('Repository name (must have an existing project summary)'),
        raw_report: z.string().min(50).describe('Unstructured report - file structure, patterns, stack, commands, gotchas, etc. Be detailed!'),
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
      description: 'List project summaries across all repositories with pagination. Returns 30 summaries by default (max 50). Each summary includes journal entry statistics (entry_count, last_entry_date) and optional Linear integration fields (linear_project_id, linear_issue_id) if linked to Linear projects/issues. Output complies with MCP truncation limits (~256 lines / 10 KiB). Use limit/offset for pagination.',
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

  // Tool 9: List Attachments for Journal Entry
  server.registerTool(
    'journal_list_attachments',
    {
      title: 'List Attachments for Journal Entry',
      description: 'Get attachment metadata (filename, description, size, type) for a journal entry by commit hash. Binary file data is excluded by default to comply with MCP truncation limits (~256 lines / 10 KiB). Use journal_get_attachment with include_data=true to retrieve file contents.',
      inputSchema: {
        commit_hash: AttachmentInputSchema.shape.commit_hash,
      },
    },
    async ({ commit_hash }) => {
      try {
        // Use metadata-only function (no binary data)
        const attachments = getAttachmentMetadataByCommit(commit_hash);

        if (attachments.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No attachments found for commit ${commit_hash}`,
              },
            ],
          };
        }

        const stats = getAttachmentStats(commit_hash);

        // Add download URLs if Tartarus URL is configured
        const attachmentsWithUrls = attachments.map((att: any) => ({
          ...att,
          download_url: journalConfig.tartarusUrl
            ? `${journalConfig.tartarusUrl}/api/attachments/${att.id}/raw`
            : null,
        }));

        const output: any = {
          commit_hash,
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

        const text = `📎 ${attachments.length} attachment(s) for commit ${commit_hash}\n\n${JSON.stringify(output, null, 2)}`;
        
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

  // Tool 10: Get Attachment by ID
  server.registerTool(
    'journal_get_attachment',
    {
      title: 'Get Attachment by ID',
      description: 'Retrieve attachment metadata and optionally file data by attachment ID. Returns metadata only by default (filename, description, size, type). Set include_data=true to get base64-encoded file data (may be truncated for large files to comply with MCP limits). Use this tool to fetch images, diagrams, PDFs, or Mermaid files attached to journal entries.',
      inputSchema: {
        attachment_id: z.number().positive().describe('Attachment ID to retrieve'),
        include_data: z.boolean().optional().default(false).describe('Include base64-encoded file data (can be very large, default: false)'),
        max_data_preview_chars: z.number().optional().default(500).describe('If include_data=true, maximum characters of base64 data to include (default: 500)'),
      },
    },
    async ({ attachment_id, include_data, max_data_preview_chars }) => {
      try {
        const attachment = getAttachmentById(attachment_id);

        if (!attachment) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No attachment found with ID ${attachment_id}`,
              },
            ],
          };
        }

        // Build download URL if Tartarus URL is configured
        const downloadUrl = journalConfig.tartarusUrl
          ? `${journalConfig.tartarusUrl}/api/attachments/${attachment.id}/raw`
          : null;

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

        if (include_data) {
          const data_base64 = attachment.data.toString('base64');
          const previewLength = Math.min(max_data_preview_chars || 500, data_base64.length);
          output.data_base64_preview = data_base64.substring(0, previewLength);
          output.data_base64_full_length = data_base64.length;
          output.note = previewLength < data_base64.length
            ? `Data truncated for preview (${previewLength}/${data_base64.length} chars). Use download_url to fetch full file.`
            : 'Full data included';
        } else {
          output.note = downloadUrl
            ? 'Binary data excluded. Use download_url to fetch full file via HTTP (bypasses MCP limits).'
            : 'Binary data excluded. Set TARTARUS_URL env var to enable direct download URLs.';
        }

        const text = `📄 Attachment ${attachment_id}\n\n${JSON.stringify(output, null, 2)}`;
        
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

  logger.success('Journal tools registered (11 tools)');
}
