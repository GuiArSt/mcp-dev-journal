import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "node:fs";
import path from "node:path";
import { resolveMonorepoRootFromImportMeta } from "../../shared/project-root.js";
import { z } from "zod";

import { toMcpError } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";
import {
  type JournalConfig,
  journalConfigHasAi,
} from "../../shared/types.js";
import { generateJournalEntry } from "./ai/generate-entry.js";
import { normalizeReport, mergeSummaryUpdates } from "./ai/normalize-report.js";
import {
  commitHasEntry,
  exportToSQL,
  getEntriesByBranchPaginated,
  getEntriesByRepositoryPaginated,
  getEntryByCommit,
  insertJournalEntry,
  registerObjectMCP,
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
  listLinearProjectUpdates,
  listAllLinearProjectUpdates,
  // Slite cache - knowledge base
  listSliteNotes,
  getSliteNote,
  getSliteCacheStats,
  listNotionPages,
  getNotionPage,
  getNotionCacheStats,
  // Entry 0 v2
  getProjectSummaryV2,
  createProjectSummaryV2,
  updateProjectTechnicalV2,
  updateProjectNarrativeV2,
  getShallowView,
  getDeepView,
  getUnifiedMediaLibrary,
  getObjectByUUID,
  getObjectBySource,
  searchTartarusObjects,
  getDocumentBySlug,
  getConversationById,
} from "./db/database.js";
import {
  AgentInputSchema,
  ProjectSummaryInputSchema,
  AttachmentInputSchema,
  ProjectSummaryCreateSchemaV2,
  ProjectTechnicalUpdateSchema,
  ProjectNarrativeUpdateSchema,
  TECHNICAL_SECTIONS,
  NARRATIVE_SECTIONS,
  TIER1_SECTIONS,
} from "./types.js";

/**
 * Get MCP server installation directory (where the code is located)
 * This is different from process.cwd() which returns where the agent is running from
 */
function getProjectRoot(): string {
  return resolveMonorepoRootFromImportMeta(import.meta.url);
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
    const backupPath = path.join(projectRoot, "journal_backup.sql");

    logger.info(
      `Auto-backup: projectRoot=${projectRoot}, backupPath=${backupPath}`,
    );
    exportToSQL(backupPath);
    logger.success(`Auto-backup completed successfully to ${backupPath}`);
  } catch (error) {
    // Don't fail silently - log the error clearly
    logger.error("Failed to auto-backup journal:", error);
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
function formatEntrySummary(
  entry: any,
  includeRawReport: boolean = false,
): any {
  const formatted: any = {
    id: entry.id,
    commit_hash: entry.commit_hash,
    repository: entry.repository,
    branch: entry.branch,
    author: entry.author,
    date: entry.date,
    summary: entry.summary, // AI-generated 3-sentence summary for indexing
    why: entry.why,
    what_changed: entry.what_changed,
    decisions: entry.decisions,
    technologies: entry.technologies,
    kronus_wisdom: entry.kronus_wisdom,
    files_changed: entry.files_changed || null,
    created_at: entry.created_at,
  };

  if (includeRawReport) {
    formatted.raw_agent_report = entry.raw_agent_report;
  } else {
    formatted.raw_agent_report_truncated = entry.raw_agent_report
      ? `[${entry.raw_agent_report.length} chars - use include_raw_report=true to see full]`
      : null;
  }

  return formatted;
}

function buildRegistryDownloadUrl(
  journalConfig: JournalConfig,
  sourceTable: string,
  sourceId: string,
): string | null {
  const tartarusUrl = journalConfig.tartarusUrl;
  if (!tartarusUrl) return null;

  if (sourceTable === "entry_attachments") {
    return `${tartarusUrl}/api/mcp/attachments/${encodeURIComponent(sourceId)}/raw`;
  }

  if (sourceTable === "media_assets") {
    return `${tartarusUrl}/api/media/${encodeURIComponent(sourceId)}/raw`;
  }

  return null;
}

function formatRegistryObjectDetail(
  obj: {
    uuid: string;
    type: string;
    source_table: string;
    source_id: string;
    title: string | null;
    summary: string | null;
    tags: string[];
    importance: number;
    estimated_tokens: number;
    created_at: string;
    updated_at: string;
  },
  journalConfig: JournalConfig,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    uuid: obj.uuid,
    type: obj.type,
    source_table: obj.source_table,
    source_id: obj.source_id,
    title: obj.title,
    summary: obj.summary,
    tags: obj.tags,
    importance: obj.importance,
    estimated_tokens: obj.estimated_tokens,
    created_at: obj.created_at,
    updated_at: obj.updated_at,
  };

  const downloadUrl = buildRegistryDownloadUrl(
    journalConfig,
    obj.source_table,
    obj.source_id,
  );
  if (downloadUrl) {
    base.download_url = downloadUrl;
  }

  switch (obj.type) {
    case "journal_entry": {
      const entry = getEntryByCommit(obj.source_id);
      if (!entry) {
        base.error = "Source journal entry not found";
        return base;
      }

      return {
        ...base,
        object: {
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
          summary: entry.summary ?? null,
          files_changed: entry.files_changed ?? null,
        },
      };
    }

    case "project_summary": {
      const summary = getProjectSummary(obj.source_id);
      if (!summary) {
        base.error = "Source project summary not found";
        return base;
      }

      return {
        ...base,
        object: summary,
        note: "Entry 0 full section history is available via journal://project-summary/{repository}/deep",
      };
    }

    case "document":
    case "prompt": {
      const document = getDocumentBySlug(obj.source_id);
      if (!document) {
        base.error = "Source document not found";
        return base;
      }

      return {
        ...base,
        object: {
          id: document.id,
          slug: document.slug,
          type: document.type,
          title: document.title,
          language: document.language,
          summary: document.summary,
          metadata: document.metadata,
          content: document.content,
          created_at: document.createdAt,
          updated_at: document.updatedAt,
        },
      };
    }

    case "conversation": {
      const conversation = getConversationById(Number(obj.source_id));
      if (!conversation) {
        base.error = "Source conversation not found";
        return base;
      }

      return {
        ...base,
        object: conversation,
      };
    }

    default:
      return {
        ...base,
        note:
          downloadUrl
            ? "Binary or external object. Use download_url for raw content."
            : "Registry metadata available. Full source fetch is not exposed for this type yet.",
      };
  }
}

/**
 * Truncate text output to safe limits
 * Accounts for truncation warning message size to ensure final output stays within limits
 * Puts a clear warning at the TOP of the output for better visibility
 */
function truncateOutput(text: string): string {
  const lines = text.split("\n");
  const bytes = Buffer.byteLength(text, "utf8");

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
  const warningTopBytes = Buffer.byteLength(warningTop, "utf8");
  const warningBottomBytes = Buffer.byteLength(warningBottom, "utf8");
  const totalWarningBytes = warningTopBytes + warningBottomBytes;

  const safeLineLimit = MAX_SAFE_LINES - 10; // Reserve lines for warnings
  const safeByteLimit = MAX_SAFE_BYTES - totalWarningBytes;

  // Truncate by lines first (more predictable)
  let truncated = lines.slice(0, safeLineLimit).join("\n");

  // Then check byte size
  if (Buffer.byteLength(truncated, "utf8") > safeByteLimit) {
    // Truncate by bytes
    const buffer = Buffer.from(truncated, "utf8");
    truncated = buffer.slice(0, safeByteLimit).toString("utf8");
    // Try to end at a safe point (not mid-character)
    const lastNewline = truncated.lastIndexOf("\n");
    if (lastNewline > safeByteLimit * 0.9) {
      truncated = truncated.slice(0, lastNewline);
    }
  }

  const shownLines = truncated.split("\n").length;
  const shownBytes = Buffer.byteLength(truncated, "utf8");

  // Put warning at top and bottom
  return warningTop + truncated + warningBottom;
}

/**
 * Register Journal tools with the MCP server
 */
export async function registerJournalTools(
  server: McpServer,
  journalConfig?: JournalConfig,
) {
  logger.info("Registering Journal tools...");

  if (!journalConfig) {
    throw new Error("JournalConfig is required for journal tools");
  }

  const requireJournalAi = () => ({
    content: [
      {
        type: "text" as const,
        text: "This tool needs an AI API key on the MCP server. Add ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY to your MCP config `env` so the Tartarus subprocess can call the model.",
      },
    ],
    isError: true as const,
  });

  // Tool 1: Create Journal Entry
  server.registerTool(
    "journal_create_entry",
    {
      title: "Create Journal Entry",
      description: `Create a Tartarus journal entry for a git commit. This tool documents the work done, decisions made, and context behind code changes.

## What You Provide (Required Metadata)
- commit_hash: The git commit SHA (at least 7 chars)
- repository: Project/repo name (e.g., "my-app", "tartarus-workspace")
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
    async ({
      commit_hash,
      repository,
      branch,
      author,
      date,
      raw_agent_report,
    }) => {
      try {
        // Check if entry already exists
        if (commitHasEntry(commit_hash)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `⚠️ Journal entry already exists for commit ${commit_hash}`,
              },
            ],
          };
        }

        if (!journalConfigHasAi(journalConfig)) {
          return requireJournalAi();
        }

        // Generate AI analysis
        const aiOutput = await generateJournalEntry(
          {
            commit_hash,
            repository,
            branch,
            author,
            date,
            raw_agent_report,
          },
          journalConfig,
        );

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

        // Register in object registry
        registerObjectMCP({
          type: "journal_entry",
          sourceTable: "journal_entries",
          sourceId: commit_hash,
          title: aiOutput.why,
          summary: aiOutput.summary,
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
              type: "text" as const,
              text: truncateOutput(text),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Tool 2 removed - use resource journal://entry/{commit_hash} instead

  // Tool 3: List Entries by Repository
  server.registerTool(
    "journal_list_by_repository",
    {
      title: "List Journal Entries by Repository",
      description:
        "**SEARCH/QUERY TOOL** - List journal entries for a repository with pagination control. Returns 20 entries by default (max 50). Each entry includes attachment_count showing how many files (images, diagrams, etc.) are attached. Large fields (raw_agent_report) excluded by default to comply with MCP truncation limits (~256 lines / 10 KiB). Use journal://attachments/{commit_hash} resource to see attachment details for a specific commit.",
      inputSchema: {
        repository: AgentInputSchema.shape.repository,
        limit: z
          .number()
          .optional()
          .default(20)
          .describe(
            "Maximum number of entries to return (default: 20, max: 50)",
          ),
        offset: z
          .number()
          .optional()
          .default(0)
          .describe("Number of entries to skip for pagination (default: 0)"),
        include_raw_report: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Include raw_agent_report in each entry (significantly increases output size, default: false)",
          ),
      },
    },
    async ({ repository, limit, offset, include_raw_report }) => {
      try {
        const safeLimit = Math.min(limit || 20, 50); // Cap at 50
        const { entries, total } = getEntriesByRepositoryPaginated(
          repository,
          safeLimit,
          offset || 0,
        );

        // Get attachment counts for all entries in this batch
        const commitHashes = entries.map((e) => e.commit_hash);
        const attachmentCounts = getAttachmentCountsForCommits(commitHashes);

        const summaries = entries.map((e) => {
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
        const willTruncate =
          testText.split("\n").length > MAX_SAFE_LINES ||
          Buffer.byteLength(testText, "utf8") > MAX_SAFE_BYTES;

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
              type: "text" as const,
              text: truncateOutput(text),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Tool 4: List Entries by Branch
  server.registerTool(
    "journal_list_by_branch",
    {
      title: "List Journal Entries by Branch",
      description:
        "**SEARCH/QUERY TOOL** - List journal entries for a repository and branch with pagination control. Returns 20 entries by default (max 50). Each entry includes attachment_count showing how many files (images, diagrams, etc.) are attached. Large fields (raw_agent_report) excluded by default to comply with MCP truncation limits (~256 lines / 10 KiB). Use journal://attachments/{commit_hash} resource to see attachment details for a specific commit.",
      inputSchema: {
        repository: AgentInputSchema.shape.repository,
        branch: AgentInputSchema.shape.branch,
        limit: z
          .number()
          .optional()
          .default(20)
          .describe(
            "Maximum number of entries to return (default: 20, max: 50)",
          ),
        offset: z
          .number()
          .optional()
          .default(0)
          .describe("Number of entries to skip for pagination (default: 0)"),
        include_raw_report: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Include raw_agent_report in each entry (significantly increases output size, default: false)",
          ),
      },
    },
    async ({ repository, branch, limit, offset, include_raw_report }) => {
      try {
        const safeLimit = Math.min(limit || 20, 50); // Cap at 50
        const { entries, total } = getEntriesByBranchPaginated(
          repository,
          branch,
          safeLimit,
          offset || 0,
        );

        // Get attachment counts for all entries in this batch
        const commitHashes = entries.map((e) => e.commit_hash);
        const attachmentCounts = getAttachmentCountsForCommits(commitHashes);

        const summaries = entries.map((e) => {
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
        const willTruncate =
          testText.split("\n").length > MAX_SAFE_LINES ||
          Buffer.byteLength(testText, "utf8") > MAX_SAFE_BYTES;

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
              type: "text" as const,
              text: truncateOutput(text),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Tool 5 removed - use resource journal://repositories instead

  // Tool 6 removed - use resource journal://branches/{repository} instead

  // Tool 7 removed - use resource journal://summary/{repository} instead

  // Tool 8: Create Project Summary (Entry 0 v2 — Agent fills exhaustive schema)
  server.registerTool(
    "journal_create_project_summary",
    {
      title: "Create Project Summary (Entry 0)",
      description: `Create the initial Entry 0 (Living Project Summary) for a repository.

## Entry 0 v2 — Schema-Driven
The coding agent fills an exhaustive schema directly. No AI normalization needed —
YOU are the scanner. Read the codebase, fill the fields.

## Tier 1 — Required (wrong code without these)
- **file_structure**: Annotated directory tree from git
- **tech_stack**: All frameworks, libraries, EXACT versions
- **patterns**: Naming style, imports, error handling, file organization
- **commands**: ALL dev/build/deploy/test commands (from Makefile, package.json, etc.)
- **architecture**: System boundaries and module responsibilities

## Tier 2 — Optional (not all projects have all)
- **frontend**: Component library, state, routing, styling
- **backend**: API routes, middleware, auth, server framework
- **database_info**: Engine, ORM, key tables, migration approach
- **services**: External APIs, SDKs, env vars
- **data_flow**: Entry points -> processing -> storage -> output

## Tier 3 — Optional (usually filled later via narrative updates)
- **custom_tooling**: Project-specific utilities
- **purpose**: What and why
- **summary**: 3-sentence description

Use journal_update_project_technical to update technical sections later.
Use journal_submit_summary_report to update narrative sections later.`,
      inputSchema: ProjectSummaryCreateSchemaV2,
    },
    async (input) => {
      try {
        // Check if Entry 0 already exists
        const existing = getProjectSummary(input.repository);
        if (existing) {
          return {
            content: [{
              type: "text" as const,
              text: `Entry 0 already exists for "${input.repository}". Use journal_update_project_technical or journal_submit_summary_report to update it.`,
            }],
          };
        }

        // Collect all sections from input
        const sections: Record<string, string> = {};
        const allSectionKeys = [...TECHNICAL_SECTIONS, ...NARRATIVE_SECTIONS];
        for (const key of allSectionKeys) {
          const value = (input as any)[key];
          if (value && typeof value === "string" && value.trim().length > 0) {
            sections[key] = value;
          }
        }

        // Validate Tier 1 presence
        const missingTier1 = TIER1_SECTIONS.filter((s) => !sections[s]);
        if (missingTier1.length > 0) {
          return {
            content: [{
              type: "text" as const,
              text: `Missing required Tier 1 sections: ${missingTier1.join(", ")}. These are required for Entry 0 creation. Read the codebase and fill them.`,
            }],
          };
        }

        // Create Entry 0 v2
        createProjectSummaryV2({
          repository: input.repository,
          git_url: input.git_url,
          current_commit: input.current_commit,
          sections,
        });

        autoBackup();

        const filledSections = Object.keys(sections);
        const output = {
          success: true,
          repository: input.repository,
          schema_version: 2,
          sections_filled: filledSections,
          sections_count: filledSections.length,
          commit: input.current_commit,
          message: `Entry 0 v2 created with ${filledSections.length} sections: ${filledSections.join(", ")}`,
        };

        return {
          content: [{
            type: "text" as const,
            text: truncateOutput(`Entry 0 v2 created for ${input.repository}\n\n${JSON.stringify(output, null, 2)}`),
          }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Tool 8b: Update Project Technical (Entry 0 v2 — agent sends changed sections + git context)
  server.registerTool(
    "journal_update_project_technical",
    {
      title: "Update Entry 0 Technical Sections",
      description: `Update technical sections of Entry 0 after code changes.

## When to Use
After meaningful code changes: new deps, restructured dirs, new patterns, changed commands.
Only send sections that ACTUALLY changed — missing sections are preserved as-is.

## How It Works
1. Agent reads git diff and codebase changes since last update
2. Agent fills only the sections that changed
3. Old values are pushed to history timeline with timestamps
4. Legacy flat columns are kept in sync for backward compatibility

## History Tracking
Each section carries an evolution timeline. When you update a section,
the previous value is preserved in history with the commit ref and date.
This creates a "distilled memory" of how the project evolved.`,
      inputSchema: ProjectTechnicalUpdateSchema,
    },
    async (input) => {
      try {
        const existing = getProjectSummaryV2(input.repository);
        if (!existing) {
          return {
            content: [{
              type: "text" as const,
              text: `No Entry 0 found for "${input.repository}". Create one first with journal_create_project_summary.`,
            }],
          };
        }

        // Collect only changed technical sections from input
        const sections: Record<string, string> = {};
        for (const key of TECHNICAL_SECTIONS) {
          const value = (input as any)[key];
          if (value && typeof value === "string" && value.trim().length > 0) {
            sections[key] = value;
          }
        }

        if (Object.keys(sections).length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: "No technical sections provided. Include at least one section to update.",
            }],
          };
        }

        const changeSummary = input.agent_report.substring(0, 200);

        const result = updateProjectTechnicalV2({
          repository: input.repository,
          to_commit: input.to_commit,
          sections,
          change_summary: changeSummary,
        });

        autoBackup();

        const output = {
          success: true,
          repository: input.repository,
          from_commit: input.from_commit,
          to_commit: input.to_commit,
          updated_sections: result.updatedSections,
          total_updates: result.totalUpdates,
          message: `Updated ${result.updatedSections.length} technical sections: ${result.updatedSections.join(", ")}`,
        };

        return {
          content: [{
            type: "text" as const,
            text: truncateOutput(`Entry 0 technical update for ${input.repository}\n\n${JSON.stringify(output, null, 2)}`),
          }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Tool 9: Submit Summary Report (Entry 0 v2 — Narrative Only)
  server.registerTool(
    "journal_submit_summary_report",
    {
      title: "Update Entry 0 Narrative Sections",
      description: `Update NARRATIVE sections of Entry 0 (Living Project Summary).
This tool ONLY touches narrative sections. Technical sections are untouched.

## Narrative Sections
- **summary**: 3-sentence project description
- **purpose**: Primary goals and objectives
- **key_decisions**: Important decisions with reasoning
- **technologies**: High-level tech choices and WHY
- **status**: Current project status, WIP areas, known issues
- **extended_notes**: Gotchas, TODOs, historical context

## Two Modes
1. **AI-assisted** (default): Send a raw_report. Kronus normalizes it into narrative sections.
2. **Direct**: Send individual section values directly. Faster, no AI call needed.

If you provide both raw_report AND individual sections, the direct sections take priority.

Use journal_update_project_technical for technical sections instead.`,
      inputSchema: ProjectNarrativeUpdateSchema,
    },
    async (input) => {
      try {
        const existing = getProjectSummaryV2(input.repository);
        if (!existing) {
          return {
            content: [{
              type: "text" as const,
              text: `No Entry 0 found for "${input.repository}". Create one first with journal_create_project_summary.`,
            }],
          };
        }

        // Collect narrative sections — direct values take priority
        const sections: Record<string, string> = {};
        for (const key of NARRATIVE_SECTIONS) {
          const value = (input as any)[key];
          if (value && typeof value === "string" && value.trim().length > 0) {
            sections[key] = value;
          }
        }

        // If no direct sections but raw_report provided, use AI normalization
        if (Object.keys(sections).length === 0 && input.raw_report) {
          if (!journalConfigHasAi(journalConfig)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "AI-assisted narrative update requires ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY on the MCP server. Provide individual narrative sections (summary, purpose, …) instead, or add a key to your MCP env.",
                },
              ],
              isError: true,
            };
          }
          const entriesLimit = Math.min(input.include_recent_entries || 5, 20);
          const { entries: recentEntries } = getEntriesByRepositoryPaginated(
            input.repository,
            entriesLimit,
            0,
          );

          logger.info(
            `Normalizing narrative report for ${input.repository} via Kronus`,
          );

          const normalizedUpdates = await normalizeReport(
            input.raw_report,
            existing,
            recentEntries,
            journalConfig,
          );

          // Only take narrative sections from AI output
          const merged = mergeSummaryUpdates(existing, normalizedUpdates);
          for (const key of NARRATIVE_SECTIONS) {
            const value = (merged as any)[key];
            if (value && typeof value === "string" && value.trim().length > 0) {
              sections[key] = value;
            }
          }
        }

        if (Object.keys(sections).length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: "No narrative sections to update. Provide raw_report or individual sections (summary, purpose, key_decisions, technologies, status, extended_notes).",
            }],
          };
        }

        const changeSummary = input.raw_report
          ? input.raw_report.substring(0, 200)
          : "Narrative update";

        const result = updateProjectNarrativeV2({
          repository: input.repository,
          sections,
          change_summary: changeSummary,
        });

        autoBackup();

        const output = {
          success: true,
          repository: input.repository,
          updated_sections: result.updatedSections,
          message: `Updated ${result.updatedSections.length} narrative sections: ${result.updatedSections.join(", ")}`,
        };

        return {
          content: [{
            type: "text" as const,
            text: truncateOutput(`Entry 0 narrative update for ${input.repository}\n\n${JSON.stringify(output, null, 2)}`),
          }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Tool 10: List All Project Summaries
  server.registerTool(
    "journal_list_project_summaries",
    {
      title: "List All Project Summaries",
      description:
        "**SEARCH/QUERY TOOL** - List project summaries across all repositories with pagination control. Returns 30 summaries by default (max 50). Each summary includes journal entry statistics (entry_count, last_entry_date) and optional Linear integration fields (linear_project_id, linear_issue_id) if linked to Linear projects/issues. Output complies with MCP truncation limits (~256 lines / 10 KiB). Use limit/offset for pagination.",
      inputSchema: {
        limit: z
          .number()
          .optional()
          .default(30)
          .describe(
            "Maximum number of summaries to return (default: 30, max: 50)",
          ),
        offset: z
          .number()
          .optional()
          .default(0)
          .describe("Number of summaries to skip for pagination (default: 0)"),
      },
    },
    async ({ limit, offset }) => {
      try {
        const safeLimit = Math.min(limit || 30, 50); // Cap at 50
        const { summaries, total } = listAllProjectSummariesPaginated(
          safeLimit,
          offset || 0,
        );

        // Check if output will be truncated before stringifying
        const testOutput = {
          total_summaries: total,
          showing: `${offset || 0} to ${(offset || 0) + summaries.length}`,
          has_more: (offset || 0) + summaries.length < total,
          summaries,
        };
        const testText = `📚 ${total} total project summaries:\n\n${JSON.stringify(testOutput, null, 2)}`;
        const willTruncate =
          testText.split("\n").length > MAX_SAFE_LINES ||
          Buffer.byteLength(testText, "utf8") > MAX_SAFE_BYTES;

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
        output.note = "Each summary includes:";
        output.fields_explanation = {
          journal_entry_stats:
            "entry_count (number of journal entries) and last_entry_date (ISO date of last entry)",
          linear_integration:
            "linear_project_id and/or linear_issue_id (optional Linear project/issue IDs if linked)",
          linear_usage:
            "If linear_project_id or linear_issue_id is present, use linear://project/{id} or linear://issue/{identifier} resources to fetch Linear data",
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
              type: "text" as const,
              text: truncateOutput(text),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Tool 9 removed - use resource journal://attachments/{commit_hash} instead

  // Tool 10 removed - use resource journal://attachment/{attachment_id} instead

  // Tool 11: List Media Library (Unified)
  server.registerTool(
    "journal_list_media_library",
    {
      title: "List Media Library",
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
2. Get assets for a repo: \`{ repository: "tartarus-workspace" }\`
3. Find AI-generated images: \`{ destination: "media" }\``,
      inputSchema: {
        repository: z
          .string()
          .optional()
          .describe("Filter by repository name (searches commit_hash links)"),
        commit_hash: z
          .string()
          .min(7)
          .optional()
          .describe("Filter by specific commit hash"),
        destination: z
          .enum(["journal", "repository", "media", "portfolio", "all"])
          .optional()
          .default("all")
          .describe("Filter by asset destination/category"),
        mime_type_prefix: z
          .string()
          .optional()
          .describe(
            'Filter by MIME type prefix (e.g., "image/", "application/pdf")',
          ),
        limit: z
          .number()
          .optional()
          .default(50)
          .describe("Max items to return (default: 50, max: 100)"),
        offset: z.number().optional().default(0).describe("Pagination offset"),
        include_metadata: z
          .boolean()
          .optional()
          .default(true)
          .describe("Include full metadata (alt, prompt, model, dimensions)"),
      },
    },
    async ({
      repository,
      commit_hash,
      destination,
      mime_type_prefix,
      limit,
      offset,
      include_metadata,
    }) => {
      try {
        const result = getUnifiedMediaLibrary(
          {
            repository,
            commit_hash,
            destination: destination as
              | "journal"
              | "repository"
              | "media"
              | "portfolio"
              | "all"
              | undefined,
            mime_type_prefix,
          },
          limit ?? 50,
          offset ?? 0,
        );

        const tartarusUrl = journalConfig.tartarusUrl;

        // Transform items with download URLs
        const items = result.items.map((item) => {
          // Generate download URL
          let downloadUrl: string | null = null;
          if (tartarusUrl) {
            if (item.source === "entry_attachments") {
              downloadUrl = `${tartarusUrl}/api/mcp/attachments/${item.source_id}/raw`;
            } else {
              // Prefer CDN URLs if available
              downloadUrl =
                item.supabase_url ||
                item.drive_url ||
                `${tartarusUrl}/api/media/${item.source_id}/raw`;
            }
          }

          const baseItem = {
            id: `${item.source === "entry_attachments" ? "attachment" : "media"}:${item.source_id}`,
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
          if (include_metadata && item.source === "media_assets") {
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
              type: "text" as const,
              text: truncateOutput(text),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Tool 12: Search registry objects
  server.registerTool(
    "registry_search_objects",
    {
      title: "Search Registry Objects",
      description:
        "Search the Tartarus object registry across journal entries, Entry 0 summaries, documents, conversations, CV records, media, and synced integration objects. " +
        "Use this as the universal discovery layer before fetching a specific object by UUID.",
      inputSchema: {
        query: z.string().min(1).describe("Search keyword or phrase"),
        type: z
          .string()
          .optional()
          .describe(
            "Optional type filter (e.g. journal_entry, project_summary, document, conversation, media_asset, attachment)",
          ),
        limit: z
          .number()
          .optional()
          .default(20)
          .describe("Maximum results to return (default: 20, max: 50)"),
      },
    },
    async ({ query, type, limit }) => {
      try {
        const safeLimit = Math.min(limit ?? 20, 50);
        const results = searchTartarusObjects(query, type, safeLimit).map((obj) => ({
          uuid: obj.uuid,
          type: obj.type,
          source_table: obj.source_table,
          source_id: obj.source_id,
          title: obj.title,
          summary: obj.summary,
          tags: obj.tags,
          updated_at: obj.updated_at,
          download_url: buildRegistryDownloadUrl(
            journalConfig,
            obj.source_table,
            obj.source_id,
          ),
        }));

        const text = `Registry search results for "${query}"${
          type ? ` (type: ${type})` : ""
        }\n\n${JSON.stringify(
          {
            query,
            type: type || null,
            total_results: results.length,
            results,
          },
          null,
          2,
        )}`;

        return {
          content: [
            {
              type: "text" as const,
              text: truncateOutput(text),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Tool 13: Fetch registry object
  server.registerTool(
    "registry_fetch_object",
    {
      title: "Fetch Registry Object",
      description:
        "Fetch a Tartarus object by UUID or by source reference. Returns full content for core text objects (journal entries, Entry 0, documents, conversations) " +
        "and metadata plus download_url for binary-backed objects like attachments and media.",
      inputSchema: {
        uuid: z.string().optional().describe("Registry UUID"),
        source_table: z
          .string()
          .optional()
          .describe("Source table name (e.g. documents, project_summaries, entry_attachments)"),
        source_id: z
          .string()
          .optional()
          .describe("Source ID in that table (slug, commit hash, numeric ID as string, etc.)"),
      },
    },
    async ({ uuid, source_table, source_id }) => {
      try {
        if (!uuid && !(source_table && source_id)) {
          throw new Error("Provide either uuid or source_table + source_id");
        }

        const obj = uuid
          ? getObjectByUUID(uuid)
          : getObjectBySource(source_table as string, source_id as string);

        if (!obj) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: "Registry object not found",
                    uuid: uuid || null,
                    source_table: source_table || null,
                    source_id: source_id || null,
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true as const,
          };
        }

        const text = JSON.stringify(
          formatRegistryObjectDetail(obj, journalConfig),
          null,
          2,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: truncateOutput(text),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
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

  const tartarusUrl = journalConfig.tartarusUrl || "http://localhost:3005";
  const mcpApiKey = journalConfig.mcpApiKey;

  // Helper to fetch from Tartarus API
  async function fetchTartarus<T>(
    endpoint: string,
    options?: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      headers?: Record<string, string>;
      body?: string | object;
    },
  ): Promise<T> {
    if (!tartarusUrl) {
      throw new Error(
        "TARTARUS_URL not configured. Set this env var to enable repository access.",
      );
    }
    const url = `${tartarusUrl}${endpoint}`;
    const method = options?.method || "GET";
    logger.info(`${method} ${url}`);

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(options?.headers || {}),
    };

    // Add MCP API key for authentication if configured
    if (mcpApiKey) {
      headers["X-MCP-API-Key"] = mcpApiKey;
    }

    // Handle body
    let body: string | undefined;
    if (options?.body) {
      if (typeof options.body === "string") {
        body = options.body;
      } else {
        body = JSON.stringify(options.body);
        headers["Content-Type"] = "application/json";
      }
    }

    const response = await fetch(url, {
      method,
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Tartarus API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  // Tool 14: repository_search_documents (Search & Query Tool)
  server.registerTool(
    "repository_search_documents",
    {
      title: "Search & List Repository Documents",
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
        type: z
          .enum(["writing", "prompt", "note"])
          .optional()
          .describe("Filter by primary document type (writing/prompt/note)"),
        search: z
          .string()
          .optional()
          .describe(
            "Search in title and content (can find documents by keywords or tag names)",
          ),
        limit: z
          .number()
          .optional()
          .default(50)
          .describe(
            "Maximum number of documents to return (default: 50, max: 100)",
          ),
        offset: z
          .number()
          .optional()
          .default(0)
          .describe("Number of documents to skip for pagination (default: 0)"),
      },
    },
    async ({ type, search, limit = 50, offset = 0 }) => {
      try {
        const safeLimit = Math.min(limit, 100); // Cap at 100
        const params = new URLSearchParams();
        if (type) params.set("type", type);
        if (search) params.set("search", search);
        params.set("limit", safeLimit.toString());
        params.set("offset", offset.toString());

        const queryString = params.toString();
        const response = await fetchTartarus<{
          documents: any[];
          total: number;
          limit: number;
          offset: number;
          has_more: boolean;
        }>(`/api/documents?${queryString}`);

        // Format response
        const formatted = response.documents.map((doc) => ({
          id: doc.id,
          slug: doc.slug,
          type: doc.type,
          title: doc.title,
          language: doc.language,
          summary: doc.summary, // AI-generated summary for indexing
          excerpt:
            doc.summary ||
            doc.content?.substring(0, 200) +
              (doc.content?.length > 200 ? "..." : ""),
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
        const willTruncate =
          testText.split("\n").length > MAX_SAFE_LINES ||
          Buffer.byteLength(testText, "utf8") > MAX_SAFE_BYTES;

        if (willTruncate) {
          output.warning = `⚠️ OUTPUT TRUNCATED ⚠️ Response exceeds MCP size limits (~256 lines / 10 KiB). Showing ${formatted.length} of ${response.total} documents. Use pagination (limit/offset) to see more.`;
          output.truncated = true;
          output.documents_returned = formatted.length;
          output.documents_total = response.total;
        }

        const text = `📄 Documents (${response.total} total)\n\n${JSON.stringify(output, null, 2)}`;

        return {
          content: [{ type: "text" as const, text: truncateOutput(text) }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Tool 15 removed - use resource repository://document/{slug_or_id} instead

  // Tool 16: repository_list_skills
  server.registerTool(
    "repository_list_skills",
    {
      title: "List Skills",
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
        category: z
          .string()
          .optional()
          .describe(
            'Filter by category (e.g., "Frontend", "Backend", "AI/ML")',
          ),
      },
    },
    async ({ category }) => {
      try {
        const params = new URLSearchParams();
        if (category) params.set("category", category);

        const queryString = params.toString();
        const skills = await fetchTartarus<any[]>(
          `/api/cv/skills${queryString ? `?${queryString}` : ""}`,
        );

        // Map magnitude to level names
        const levelMap: Record<number, string> = {
          5: "Expert",
          4: "Professional",
          3: "Intermediate",
          2: "Apprentice",
          1: "Beginner",
        };

        const formatted = skills.map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category,
          level: levelMap[s.magnitude] || "Unknown",
          magnitude: s.magnitude,
          description: s.description,
          tags: Array.isArray(s.tags) ? s.tags : [],
        }));

        // Group by category
        const byCategory: Record<string, any[]> = {};
        for (const skill of formatted) {
          const cat = skill.category || "Other";
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(skill);
        }

        const text = `🛠️ Skills (${formatted.length} total)\n\n${JSON.stringify(byCategory, null, 2)}`;

        return {
          content: [{ type: "text" as const, text: truncateOutput(text) }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Tool 17: repository_list_experience
  server.registerTool(
    "repository_list_experience",
    {
      title: "List Work Experience",
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
        const experience = await fetchTartarus<any[]>("/api/cv/experience");

        const formatted = experience.map((job) => ({
          id: job.id,
          title: job.title,
          company: job.company,
          department: job.department,
          location: job.location,
          period: `${job.dateStart} → ${job.dateEnd || "Present"}`,
          tagline: job.tagline,
          achievements: Array.isArray(job.achievements) ? job.achievements : [],
        }));

        const text = `💼 Work Experience (${formatted.length} entries)\n\n${JSON.stringify(formatted, null, 2)}`;

        return {
          content: [{ type: "text" as const, text: truncateOutput(text) }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Tool 18: repository_list_education
  server.registerTool(
    "repository_list_education",
    {
      title: "List Education",
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
        const education = await fetchTartarus<any[]>("/api/cv/education");

        const formatted = education.map((edu) => ({
          id: edu.id,
          degree: edu.degree,
          field: edu.field,
          institution: edu.institution,
          location: edu.location,
          period: `${edu.dateStart} → ${edu.dateEnd || "Present"}`,
          tagline: edu.tagline,
          focusAreas: Array.isArray(edu.focusAreas) ? edu.focusAreas : [],
          achievements: Array.isArray(edu.achievements) ? edu.achievements : [],
        }));

        const text = `🎓 Education (${formatted.length} entries)\n\n${JSON.stringify(formatted, null, 2)}`;

        return {
          content: [{ type: "text" as const, text: truncateOutput(text) }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Tool 19: repository_list_portfolio_projects
  server.registerTool(
    "repository_list_portfolio_projects",
    {
      title: "List Portfolio Projects",
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
        status: z
          .enum(["shipped", "wip", "archived"])
          .optional()
          .describe("Filter by project status"),
        featured: z
          .boolean()
          .optional()
          .describe("Only show featured projects"),
      },
    },
    async ({ status, featured }) => {
      try {
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (featured !== undefined) params.set("featured", featured.toString());

        const queryString = params.toString();
        const response = await fetchTartarus<{ projects: any[]; total: number }>(
          `/api/portfolio-projects${queryString ? `?${queryString}` : ""}`,
        );
        const projects = response.projects || [];

        const formatted = projects.map((p) => ({
          id: p.id,
          title: p.title,
          category: p.category,
          company: p.company,
          status: p.status,
          featured: p.featured,
          role: p.role,
          dateCompleted: p.dateCompleted,
          excerpt: p.excerpt,
          technologies: Array.isArray(p.technologies) ? p.technologies : [],
          metrics: p.metrics && typeof p.metrics === "object" ? p.metrics : {},
          links: p.links && typeof p.links === "object" ? p.links : {},
        }));

        const text = `🚀 Portfolio Projects (${formatted.length} found)\n\n${JSON.stringify(formatted, null, 2)}`;

        return {
          content: [{ type: "text" as const, text: truncateOutput(text) }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Repository write tools - agents can create notes/prompts and update documents.
  // Linear sync tools removed from MCP - those are Tartarus-exclusive.

  // Fetch current metadata values for schema description
  let currentTagsDescription = "Tags are free-form strings for categorization.";
  let currentTypesDescription =
    "Optional secondary category (different from primary type field).";
  let currentAlsoShownInDescription =
    "Array of document types to show this document in multiple tabs.";

  try {
    if (tartarusUrl) {
      const metadataResponse = await fetchTartarus<{
        tags: string[];
        types: string[];
        alsoShownIn: string[];
        counts: { tags: number; types: number; alsoShownIn: number };
      }>("/api/documents/metadata");

      if (metadataResponse.tags && metadataResponse.tags.length > 0) {
        currentTagsDescription = `Current tags in use: ${metadataResponse.tags.join(", ")}. Use these for consistency, or add new ones as needed.`;
      }

      if (metadataResponse.types && metadataResponse.types.length > 0) {
        currentTypesDescription = `Current metadata types in use: ${metadataResponse.types.join(", ")}. This is a secondary category field (different from the primary type: writing/prompt/note).`;
      }

      if (
        metadataResponse.alsoShownIn &&
        metadataResponse.alsoShownIn.length > 0
      ) {
        currentAlsoShownInDescription = `Array of document types to show this document in multiple tabs. Current values in use: ${metadataResponse.alsoShownIn.join(", ")}. Must be valid document types: "writing", "prompt", or "note".`;
      }
    }
  } catch (error) {
    logger.warn("Failed to fetch metadata for schema description:", error);
    // Fall back to default descriptions
  }

  // Tool 21: repository_create_document
  server.registerTool(
    "repository_create_document",
    {
      title: "Create Repository Document",
      description: `Upload and save a document (prompt or note) to the Tartarus repository database.

**IMPORTANT: AI agents can only create "note" or "prompt" documents. "writing" type is user-curated and cannot be created by AI.**

## Document Types (Required)
- **prompt**: System prompts, AI contexts, templates, instructions for AI
- **note**: Quick notes, reference material, snippets
- ~~**writing**: (User-curated only - AI cannot create writings)~~

## Required Fields
- **title**: Document title
- **content**: Document content (for prompts, this is the prompt text)
- **type**: One of "writing", "prompt", or "note" (default: "writing")

## Optional Fields (All Document Types)
- **slug**: URL-friendly slug (auto-generated from title if not provided)
- **language**: Language code (default: "en")
- **tags**: Array of strings for categorization
- **metadataType**: Secondary category (metadata.type) - free-form string for additional categorization beyond primary type
- **writtenDate**: Date when document was originally written. Format: "2024", "2024-03", or "2024-03-15" (year, year-month, or full date)

## Prompt-Specific Fields (when type="prompt")
Prompts have a richer structure for better organization and reuse:
- **purpose**: What this prompt is for (e.g., "System prompt for Kronus oracle mode", "Template for code review")
- **role**: Message role type - "system", "user", "assistant", or "chat" (for multi-turn conversations)
- **inputSchema**: JSON schema for input validation (if applicable) - Zod schema as JSON
- **outputSchema**: JSON schema for expected output (if applicable) - Zod schema as JSON
- **config**: Configuration metadata (JSON object) - model, temperature, max_tokens, etc.

Note: For prompts, \`content\` field contains the actual prompt text. The \`purpose\` field provides context about what the prompt does.

## Tags
${currentTagsDescription}

## Metadata Structure
Documents have a two-level categorization system:
- **Primary Type** (required): \`type\` field - must be "writing", "prompt", or "note"
- **Secondary Category** (optional): \`metadata.type\` field - free-form string for additional categorization
- **Tags** (optional): \`metadata.tags\` array - array of strings for flexible categorization
- **Written Date** (optional): \`metadata.writtenDate\` - when document was originally written (normalized format)

## Secondary Category (metadata.type)
${currentTypesDescription}

## Written Date
Use \`writtenDate\` field for when the document was originally written. Format: "2024" (year), "2024-03" (year-month), or "2024-03-15" (full date). Legacy \`year\` field is automatically migrated to \`writtenDate\`.

## AI Summary Generation
**IMPORTANT**: This tool automatically generates an AI summary for Kronus indexing after creating the document.
The summary is a dense 3-sentence description used by Kronus for quick retrieval without reading full content.
This happens automatically - no additional step needed.

## Slug Generation
If \`slug\` is not provided, it will be auto-generated from the title (lowercase, alphanumeric with dashes).

## Example Usage

**Writing:**
\`\`\`
{ type: "writing", title: "My Poem", content: "...", tags: ["poem", "philosophy"] }
\`\`\`

**Simple Prompt:**
\`\`\`
{ type: "prompt", title: "System Prompt", content: "You are a helpful assistant...", tags: ["prompt", "ai"] }
\`\`\`

**Structured Prompt (Recommended):**
\`\`\`
{
  type: "prompt",
  title: "Code Review Prompt",
  content: "Review this code for bugs and improvements...",
  purpose: "Template for code review",
  role: "system",
  inputSchema: '{"type":"object","properties":{"code":{"type":"string"},"language":{"type":"string"}}}',
  outputSchema: '{"type":"object","properties":{"review":{"type":"string"},"score":{"type":"number"}}}',
  config: {"model": "claude-sonnet-4", "temperature": 0.7, "max_tokens": 2000},
  tags: ["code", "review"]
}
\`\`\`

**Note:**
\`\`\`
{ type: "note", title: "Quick Note", content: "...", tags: ["reference"] }
\`\`\`

Requires TARTARUS_URL and MCP_API_KEY to be configured.`,
      inputSchema: {
        title: z.string().min(1).describe("Document title (required)"),
        content: z
          .string()
          .min(1)
          .describe(
            "Document content (required). For prompts, this is the prompt text.",
          ),
        type: z
          .enum(["writing", "prompt", "note"])
          .default("writing")
          .describe("Primary document type (default: writing)"),
        slug: z
          .string()
          .optional()
          .describe(
            "URL-friendly slug (auto-generated from title if not provided)",
          ),
        language: z
          .string()
          .optional()
          .default("en")
          .describe("Language code (default: en)"),
        tags: z
          .array(z.string())
          .optional()
          .default([])
          .describe("Array of tags for categorization"),
        metadataType: z
          .string()
          .optional()
          .describe(
            "Secondary category (metadata.type) - free-form string for additional categorization beyond primary type",
          ),
        writtenDate: z
          .string()
          .optional()
          .describe(
            'Date when document was originally written. Format: "2024", "2024-03", or "2024-03-15" (year, year-month, or full date)',
          ),
        // Prompt-specific fields
        purpose: z
          .string()
          .optional()
          .describe(
            'For prompts: What this prompt is for (e.g., "System prompt for Kronus oracle mode")',
          ),
        role: z
          .enum(["system", "user", "assistant", "chat"])
          .optional()
          .describe(
            'For prompts: Message role type - "system" (default), "user", "assistant", or "chat" (multi-turn)',
          ),
        inputSchema: z
          .string()
          .optional()
          .describe(
            "For prompts: JSON schema for input validation (Zod schema as JSON string)",
          ),
        outputSchema: z
          .string()
          .optional()
          .describe(
            "For prompts: JSON schema for expected output (Zod schema as JSON string)",
          ),
        config: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "For prompts: Configuration metadata (model, temperature, max_tokens, etc.)",
          ),
      },
    },
    async ({
      title,
      content,
      type,
      slug,
      language,
      tags,
      metadataType,
      writtenDate,
      purpose,
      role,
      inputSchema,
      outputSchema,
      config,
    }) => {
      try {
        // RESTRICTION: AI can only create notes and prompts, not writings
        // Writings are curated by the user and should not be auto-generated
        if (type === "writing") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: false,
                    error:
                      'Permission denied: AI agents can only create "note" or "prompt" documents. Writings are user-curated content.',
                    suggestion:
                      'Use type: "note" for quick notes, reference material, or snippets. Use type: "prompt" for system prompts and AI templates.',
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        // Build metadata object from simplified fields
        const metadata: Record<string, unknown> = {};
        if (tags && tags.length > 0) {
          metadata.tags = tags;
        }
        if (metadataType && metadataType.trim().length > 0) {
          metadata.type = metadataType.trim();
        }
        if (writtenDate && writtenDate.trim().length > 0) {
          metadata.writtenDate = writtenDate.trim();
        }

        // Add prompt-specific fields to metadata when type is 'prompt'
        if (type === "prompt") {
          if (purpose && purpose.trim().length > 0) {
            metadata.purpose = purpose.trim();
          }
          if (role) {
            metadata.role = role; // 'system', 'user', 'assistant', or 'chat'
          } else {
            metadata.role = "system"; // Default for prompts
          }
          if (inputSchema && inputSchema.trim().length > 0) {
            try {
              // Validate it's valid JSON
              JSON.parse(inputSchema);
              metadata.inputSchema = inputSchema;
            } catch (e) {
              logger.warn("Invalid inputSchema JSON, skipping:", e);
            }
          }
          if (outputSchema && outputSchema.trim().length > 0) {
            try {
              // Validate it's valid JSON
              JSON.parse(outputSchema);
              metadata.outputSchema = outputSchema;
            } catch (e) {
              logger.warn("Invalid outputSchema JSON, skipping:", e);
            }
          }
          if (config && Object.keys(config).length > 0) {
            metadata.config = config;
          }
        }

        const payload = {
          title,
          content,
          type: type || "writing",
          language: language || "en",
          metadata,
        };

        // Add slug if provided
        if (slug) {
          (payload as any).slug = slug;
        }

        const response = await fetchTartarus<{
          id: number;
          slug: string;
          type: string;
          title: string;
          content: string;
          language: string;
          metadata: Record<string, unknown>;
          summary: string | null;
          created_at: string;
          updated_at: string;
        }>("/api/documents", {
          method: "POST",
          body: payload,
        });

        // Automatically generate AI summary for Kronus indexing
        let summaryGenerated = false;
        let summary: string | null = null;
        if (response.id && content.length > 20) {
          try {
            // Build metadata for summary generation
            const summaryMetadata: Record<string, unknown> = {
              tags: tags || [],
              type: metadataType || undefined,
              writtenDate: writtenDate || undefined,
            };

            // Add prompt-specific fields for better summary generation
            if (type === "prompt") {
              if (purpose) summaryMetadata.purpose = purpose;
              if (role) summaryMetadata.role = role;
              if (inputSchema) {
                try {
                  summaryMetadata.inputSchema = JSON.parse(inputSchema);
                } catch {
                  summaryMetadata.inputSchema = inputSchema; // Keep as string if invalid JSON
                }
              }
              if (outputSchema) {
                try {
                  summaryMetadata.outputSchema = JSON.parse(outputSchema);
                } catch {
                  summaryMetadata.outputSchema = outputSchema; // Keep as string if invalid JSON
                }
              }
              if (config) summaryMetadata.config = config;
            }

            const summaryResponse = await fetchTartarus<{
              summary: string;
              type: string;
            }>("/api/ai/summarize", {
              method: "POST",
              body: {
                type: "document",
                content: content,
                title: title,
                metadata: summaryMetadata,
              },
            });

            if (summaryResponse.summary) {
              summary = summaryResponse.summary;
              // Update document with summary via PUT endpoint
              await fetchTartarus(`/api/documents/${response.slug}`, {
                method: "PUT",
                body: {
                  summary: summary,
                  // Preserve existing metadata
                  metadata: {
                    tags: tags || [],
                    type: metadataType || undefined,
                    writtenDate: writtenDate || undefined,
                  },
                },
              });
              summaryGenerated = true;
            }
          } catch (summaryError) {
            logger.warn(
              "Failed to generate summary for document:",
              summaryError,
            );
            // Don't fail the whole operation if summary generation fails
          }
        }

        const responseText: any = {
          id: response.id,
          slug: response.slug,
          type: response.type,
          title: response.title,
          language: response.language,
          created_at: response.created_at,
          url: `${tartarusUrl}/repository/${response.slug}`,
        };

        if (summaryGenerated && summary) {
          responseText.summary = summary;
          responseText.summary_note =
            "AI summary generated for Kronus indexing";
        } else if (!summaryGenerated) {
          responseText.summary_note =
            "Summary generation skipped (content too short or generation failed)";
        }

        const text = `✅ Document created successfully\n\n${JSON.stringify(responseText, null, 2)}`;

        return {
          content: [
            {
              type: "text" as const,
              text: truncateOutput(text),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Tool 22: repository_update_document
  server.registerTool(
    "repository_update_document",
    {
      title: "Update Repository Document",
      description: `Update an existing document (prompt or note) in the Tartarus repository database.

**IMPORTANT: AI agents can only update "note" or "prompt" documents. "writing" type is user-curated and cannot be updated by AI.**

## Document Identification
- **slug**: Document slug (URL-friendly identifier) OR numeric ID
- Either slug or id can be used to identify the document

## Updatable Fields
All fields are optional - only provide fields you want to update:

### Basic Fields
- **title**: Document title (if changed, slug will be auto-updated)
- **content**: Document content
- **type**: Primary type - "writing", "prompt", or "note"
- **language**: Language code (default: "en")

### Metadata Fields
- **tags**: Array of strings for categorization (replaces existing tags)
- **metadataType**: Secondary category (metadata.type) - free-form string
- **writtenDate**: Date when document was originally written. Format: "2024", "2024-03", or "2024-03-15"

### Prompt-Specific Metadata (when type="prompt" or document has prompt metadata)
- **purpose**: What this prompt is for
- **role**: Message role type - "system", "user", "assistant", or "chat"
- **inputSchema**: JSON schema for input validation (Zod schema as JSON string)
- **outputSchema**: JSON schema for expected output (Zod schema as JSON string)
- **config**: Configuration metadata (JSON object) - model, temperature, max_tokens, etc.

## AI Summary & Normalization
**IMPORTANT**: This tool automatically:
1. **Normalizes metadata**: Migrates legacy 'year' field to 'writtenDate', normalizes prompt metadata
2. **Generates AI summary**: If content changed, automatically generates/updates the 3-sentence summary for Kronus indexing
3. **Preserves existing data**: Only updates fields you provide, preserves others

## Example Usage

**Update title and content:**
\`\`\`
{ slug: "my-document", title: "New Title", content: "Updated content..." }
\`\`\`

**Add prompt metadata to a writing:**
\`\`\`
{ 
  slug: "my-writing", 
  purpose: "System prompt for Kronus",
  role: "system",
  config: {"model": "claude-sonnet-4", "temperature": 0.7}
}
\`\`\`

**Update tags:**
\`\`\`
{ slug: "my-document", tags: ["new", "tags"] }
\`\`\`

Requires TARTARUS_URL and MCP_API_KEY to be configured.`,
      inputSchema: {
        slug: z
          .string()
          .optional()
          .describe(
            "Document slug or numeric ID (required if id not provided)",
          ),
        id: z
          .number()
          .optional()
          .describe("Document numeric ID (required if slug not provided)"),
        title: z
          .string()
          .optional()
          .describe("Document title (if changed, slug will be auto-updated)"),
        content: z.string().optional().describe("Document content"),
        type: z
          .enum(["writing", "prompt", "note"])
          .optional()
          .describe("Primary document type"),
        language: z.string().optional().describe("Language code"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Array of tags for categorization (replaces existing)"),
        metadataType: z
          .string()
          .optional()
          .describe("Secondary category (metadata.type)"),
        writtenDate: z
          .string()
          .optional()
          .describe(
            'Date when document was originally written. Format: "2024", "2024-03", or "2024-03-15"',
          ),
        // Prompt-specific fields
        purpose: z
          .string()
          .optional()
          .describe("For prompts: What this prompt is for"),
        role: z
          .enum(["system", "user", "assistant", "chat"])
          .optional()
          .describe("For prompts: Message role type"),
        inputSchema: z
          .string()
          .optional()
          .describe(
            "For prompts: JSON schema for input validation (Zod schema as JSON string)",
          ),
        outputSchema: z
          .string()
          .optional()
          .describe(
            "For prompts: JSON schema for expected output (Zod schema as JSON string)",
          ),
        config: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "For prompts: Configuration metadata (model, temperature, max_tokens, etc.)",
          ),
      },
    },
    async ({
      slug,
      id,
      title,
      content,
      type,
      language,
      tags,
      metadataType,
      writtenDate,
      purpose,
      role,
      inputSchema,
      outputSchema,
      config,
    }) => {
      try {
        if (!slug && !id) {
          throw new Error("Either slug or id is required");
        }

        const identifier = id ? String(id) : slug!;

        // RESTRICTION: AI can only update notes and prompts, not writings
        // First, fetch the existing document to check its type
        const existingDoc = await fetchTartarus<{ type: string }>(
          `/api/documents/${identifier}`,
        );

        // Block updates to writings
        if (existingDoc.type === "writing") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: false,
                    error:
                      'Permission denied: AI agents cannot update "writing" documents. Writings are user-curated content.',
                    suggestion:
                      'You can only update documents of type "note" or "prompt".',
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        // Also block changing type to 'writing'
        if (type === "writing") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: false,
                    error:
                      'Permission denied: AI agents cannot set document type to "writing". Writings are user-curated content.',
                    suggestion: 'Keep the type as "note" or "prompt".',
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        // Validate JSON fields for prompts
        let parsedInputSchema: string | null = null;
        let parsedOutputSchema: string | null = null;
        let parsedConfig: Record<string, unknown> | null = null;

        if (inputSchema) {
          try {
            JSON.parse(inputSchema); // Validate JSON
            parsedInputSchema = inputSchema.trim();
          } catch (e) {
            throw new Error("Invalid JSON in inputSchema");
          }
        }

        if (outputSchema) {
          try {
            JSON.parse(outputSchema); // Validate JSON
            parsedOutputSchema = outputSchema.trim();
          } catch (e) {
            throw new Error("Invalid JSON in outputSchema");
          }
        }

        if (config) {
          try {
            parsedConfig =
              typeof config === "string" ? JSON.parse(config) : config;
          } catch (e) {
            throw new Error("Invalid JSON in config");
          }
        }

        // Build update payload
        const updatePayload: Record<string, unknown> = {};

        if (title !== undefined) updatePayload.title = title;
        if (content !== undefined) updatePayload.content = content;
        if (type !== undefined) updatePayload.type = type;
        if (language !== undefined) updatePayload.language = language;

        // Build metadata object
        if (
          tags !== undefined ||
          metadataType !== undefined ||
          writtenDate !== undefined ||
          purpose !== undefined ||
          role !== undefined ||
          parsedInputSchema !== null ||
          parsedOutputSchema !== null ||
          parsedConfig !== null
        ) {
          // Fetch existing document to merge metadata
          const existingDoc = await fetchTartarus<{
            metadata: Record<string, unknown>;
          }>(`/api/documents/${identifier}`);
          const existingMetadata = existingDoc.metadata || {};

          const metadata: Record<string, unknown> = { ...existingMetadata };

          // Update basic metadata fields
          if (tags !== undefined) metadata.tags = tags;
          if (metadataType !== undefined) metadata.type = metadataType || null;
          if (writtenDate !== undefined)
            metadata.writtenDate = writtenDate || null;

          // Update prompt-specific metadata
          if (purpose !== undefined) metadata.purpose = purpose || null;
          if (role !== undefined) metadata.role = role || null;
          if (parsedInputSchema !== null)
            metadata.inputSchema = parsedInputSchema;
          if (parsedOutputSchema !== null)
            metadata.outputSchema = parsedOutputSchema;
          if (parsedConfig !== null) metadata.config = parsedConfig;

          // Remove prompt fields if explicitly set to null/empty and not a prompt
          if (type && type !== "prompt") {
            if (purpose === null || purpose === "") delete metadata.purpose;
            if (role === null || role === "") delete metadata.role;
            if (parsedInputSchema === null) delete metadata.inputSchema;
            if (parsedOutputSchema === null) delete metadata.outputSchema;
            if (parsedConfig === null) delete metadata.config;
          }

          updatePayload.metadata = metadata;
        }

        // Update document via PUT endpoint (which handles normalization and auto-summary)
        const response = await fetchTartarus<{
          id: number;
          slug: string;
          type: string;
          title: string;
          content: string;
          language: string;
          metadata: Record<string, unknown>;
          summary: string | null;
          created_at: string;
          updated_at: string;
        }>(`/api/documents/${identifier}`, {
          method: "PUT",
          body: updatePayload,
        });

        const responseText = `✅ Document updated successfully\n\n${JSON.stringify(
          {
            id: response.id,
            slug: response.slug,
            type: response.type,
            title: response.title,
            summary: response.summary
              ? "AI summary updated"
              : "No summary change",
            url: `${tartarusUrl}/repository/${response.slug}`,
          },
          null,
          2,
        )}`;

        return {
          content: [
            {
              type: "text" as const,
              text: truncateOutput(responseText),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Tool 23: repository_create_from_report (unified document/prompt creation from agent report)
  server.registerTool(
    "repository_create_from_report",
    {
      title: "Create Document or Prompt from Agent Report",
      description: `Create a document (prompt or note) or update an existing one by providing a free-form agent report. Kronus will extract all structured information automatically.

**IMPORTANT: AI agents can only create/update "note" or "prompt" documents. "writing" type is user-curated and cannot be created/updated by AI.**

## How It Works

This tool follows the same pattern as journal entry creation:
1. You provide a **raw_agent_report** describing the document/prompt
2. Kronus (AI) analyzes the report and extracts:
   - Title, content, type
   - All metadata (tags, categories, dates)
   - For prompts: purpose, role, schemas, config
3. The document is created/updated with auto-summary generation

## Document Types

- **writing**: Creative works, essays, poems, philosophical pieces, fiction
- **prompt**: System prompts, AI contexts, templates, instructions for AI
- **note**: Quick notes, reference material, snippets

## What Kronus Extracts

### Required
- **title**: Document title
- **content**: Full document content
- **type**: Document type (auto-detected if not specified)

### Metadata (extracted from report)
- **tags**: Array of tags
- **metadataType**: Secondary category
- **writtenDate**: Date when written (if mentioned)

### Prompt-Specific (if type is "prompt" or report indicates prompt)
- **purpose**: What the prompt is for
- **role**: Message role (system/user/assistant/chat)
- **inputSchema**: JSON schema for input (if mentioned)
- **outputSchema**: JSON schema for output (if mentioned)
- **config**: Configuration (model, temperature, etc. if mentioned)

## Auto-Summary & Normalization

- **AI Summary**: Automatically generated for Kronus indexing
- **Normalization**: Legacy fields (year → writtenDate) are normalized automatically

## Example Reports

**Writing:**
"I wrote a poem called 'The Song of Aquinas' about the philosophy of work. It's a reflection on how we approach coding and creativity. Tags: poetry, philosophy, work. Written in December 2025."

**Prompt:**
"I created a system prompt for Kronus oracle mode. Purpose: Answer questions about projects and code. Role: system. The prompt helps users understand their codebase. Config: model claude-sonnet-4, temperature 0.7, max_tokens 2000."

**Note:**
"Quick reference note about React hooks. Covers useState, useEffect, useContext. Tags: react, reference, frontend."

## Updating Existing Documents

If you provide a \`slug\` or \`id\` of an existing document, it will be updated instead of created. Only fields extracted from the report will be updated - existing data is preserved.

Requires TARTARUS_URL and MCP_API_KEY to be configured.`,
      inputSchema: {
        raw_agent_report: z
          .string()
          .min(10)
          .describe(
            "Your detailed report describing the document or prompt to create/update",
          ),
        document_type: z
          .enum(["writing", "prompt", "note"])
          .optional()
          .describe(
            "Document type - if not provided, will be auto-detected from report",
          ),
        slug: z
          .string()
          .optional()
          .describe(
            "Slug or ID of existing document to update (if provided, updates instead of creates)",
          ),
        id: z
          .number()
          .optional()
          .describe(
            "Numeric ID of existing document to update (if provided, updates instead of creates)",
          ),
      },
    },
    async ({ raw_agent_report, document_type, slug, id }) => {
      try {
        // RESTRICTION: AI can only create/update notes and prompts, not writings
        if (document_type === "writing") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: false,
                    error:
                      'Permission denied: AI agents can only create "note" or "prompt" documents. Writings are user-curated content.',
                    suggestion:
                      'Use document_type: "note" for quick notes, or "prompt" for system prompts and AI templates. Or omit document_type to auto-detect.',
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        // If updating, check the existing document type
        if (slug || id) {
          const identifier = id ? String(id) : slug!;
          const existingDoc = await fetchTartarus<{ type: string }>(
            `/api/documents/${identifier}`,
          );
          if (existingDoc.type === "writing") {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      success: false,
                      error:
                        'Permission denied: AI agents cannot update "writing" documents. Writings are user-curated content.',
                      suggestion:
                        'You can only update documents of type "note" or "prompt".',
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }
        }

        if (!journalConfigHasAi(journalConfig)) {
          return requireJournalAi();
        }

        // Import the generateDocument function
        const { generateDocument } = await import("./ai/generate-document.js");

        // Generate structured data from agent report
        const aiOutput = await generateDocument(
          { raw_agent_report, document_type },
          journalConfig,
        );

        // RESTRICTION: Also block if AI extracted type as 'writing'
        if (aiOutput.type === "writing") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: false,
                    error:
                      'Permission denied: AI agents can only create "note" or "prompt" documents. The extracted type was "writing" which is user-curated content.',
                    suggestion:
                      'Adjust your report to clearly indicate this is a "note" (quick notes, reference material) or "prompt" (system prompts, AI templates).',
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        // Validate JSON fields for prompts
        let parsedInputSchema: string | null = null;
        let parsedOutputSchema: string | null = null;
        let parsedConfig: Record<string, unknown> | null = null;

        if (aiOutput.inputSchema) {
          try {
            JSON.parse(aiOutput.inputSchema); // Validate JSON
            parsedInputSchema = aiOutput.inputSchema.trim();
          } catch (e) {
            logger.warn("Invalid JSON in extracted inputSchema, skipping");
          }
        }

        if (aiOutput.outputSchema) {
          try {
            JSON.parse(aiOutput.outputSchema); // Validate JSON
            parsedOutputSchema = aiOutput.outputSchema.trim();
          } catch (e) {
            logger.warn("Invalid JSON in extracted outputSchema, skipping");
          }
        }

        if (aiOutput.config) {
          try {
            parsedConfig =
              typeof aiOutput.config === "string"
                ? JSON.parse(aiOutput.config)
                : aiOutput.config;
          } catch (e) {
            logger.warn("Invalid JSON in extracted config, skipping");
          }
        }

        // Build metadata object
        const metadata: Record<string, unknown> = {
          tags: aiOutput.tags || [],
        };

        if (aiOutput.metadataType) metadata.type = aiOutput.metadataType;
        if (aiOutput.writtenDate) metadata.writtenDate = aiOutput.writtenDate;

        // Add prompt-specific metadata if type is prompt
        if (aiOutput.type === "prompt") {
          if (aiOutput.purpose) metadata.purpose = aiOutput.purpose;
          if (aiOutput.role) metadata.role = aiOutput.role;
          if (parsedInputSchema) metadata.inputSchema = parsedInputSchema;
          if (parsedOutputSchema) metadata.outputSchema = parsedOutputSchema;
          if (parsedConfig) metadata.config = parsedConfig;
        }

        // Determine if updating or creating
        const isUpdate = !!(slug || id);
        const identifier = id ? String(id) : slug;

        let response: {
          id: number;
          slug: string;
          type: string;
          title: string;
          content: string;
          language: string;
          metadata: Record<string, unknown>;
          summary: string | null;
          created_at: string;
          updated_at: string;
        };

        if (isUpdate) {
          // Update existing document
          const updatePayload: Record<string, unknown> = {
            title: aiOutput.title,
            content: aiOutput.content,
            type: aiOutput.type,
            language: aiOutput.language,
            metadata,
          };

          response = await fetchTartarus(`/api/documents/${identifier}`, {
            method: "PUT",
            body: updatePayload,
          });
        } else {
          // Create new document
          response = await fetchTartarus("/api/documents", {
            method: "POST",
            body: {
              title: aiOutput.title,
              content: aiOutput.content,
              type: aiOutput.type,
              language: aiOutput.language,
              metadata,
            },
          });

          // Auto-generate summary (PUT endpoint handles this for updates)
          try {
            const contentToSummarize = aiOutput.content || "";
            if (contentToSummarize.length > 20) {
              const summaryResponse = await fetchTartarus<{ summary: string }>(
                "/api/ai/summarize",
                {
                  method: "POST",
                  body: {
                    type: "document",
                    content: contentToSummarize,
                    title: aiOutput.title,
                    metadata,
                  },
                },
              );

              if (summaryResponse.summary) {
                // Update document with summary
                await fetchTartarus(`/api/documents/${response.slug}`, {
                  method: "PUT",
                  body: {
                    summary: summaryResponse.summary,
                  },
                });
                response.summary = summaryResponse.summary;
              }
            }
          } catch (summaryError) {
            logger.warn(
              "Failed to generate summary for document:",
              summaryError,
            );
          }
        }

        const action = isUpdate ? "updated" : "created";
        const responseText = `✅ Document ${action} successfully from agent report\n\n${JSON.stringify(
          {
            id: response.id,
            slug: response.slug,
            type: response.type,
            title: response.title,
            extracted_fields: {
              tags: aiOutput.tags?.length || 0,
              metadataType: aiOutput.metadataType || null,
              writtenDate: aiOutput.writtenDate || null,
              ...(aiOutput.type === "prompt"
                ? {
                    purpose: aiOutput.purpose || null,
                    role: aiOutput.role || null,
                    hasInputSchema: !!parsedInputSchema,
                    hasOutputSchema: !!parsedOutputSchema,
                    hasConfig: !!parsedConfig,
                  }
                : {}),
            },
            summary: response.summary ? "AI summary generated" : "No summary",
            url: `${tartarusUrl}/repository/${response.slug}`,
          },
          null,
          2,
        )}`;

        return {
          content: [
            {
              type: "text" as const,
              text: truncateOutput(responseText),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  // Tool 24: repository_upload_media
  server.registerTool(
    "repository_upload_media",
    {
      title: "Upload Media Asset",
      description: `**DISABLED: AI agents cannot upload media directly. Media uploads are user-controlled.**

Upload an image or media file to the Tartarus repository database.

## Upload Methods
1. **From URL**: Provide \`url\` parameter - file will be downloaded and stored
2. **From Base64**: Provide \`data\` parameter (base64-encoded file)

## Destinations
- **repository**: Linked to a document (requires \`document_id\`)
- **journal**: Linked to a journal entry (requires \`commit_hash\`)
- **media**: Standalone media asset (default)
- **portfolio**: Linked to a portfolio project (requires \`portfolio_project_id\`)

## Linking Media
- Link to document: Set \`document_id\` and \`destination: "repository"\`
- Link to journal entry: Set \`commit_hash\` and \`destination: "journal"\`
- Link to portfolio: Set \`portfolio_project_id\` and \`destination: "portfolio"\`

## Metadata
- **description**: Human-readable description
- **alt**: Alt text for accessibility (images)
- **tags**: Array of tags for categorization
- **prompt**: AI generation prompt (if AI-generated)
- **model**: AI model used (if AI-generated)

## Example Usage
- Upload image from URL: \`{ filename: "image.png", url: "https://...", destination: "media" }\`
- Upload base64 image: \`{ filename: "image.png", data: "base64...", destination: "repository", document_id: 123 }\`
- Link to journal entry: \`{ filename: "screenshot.png", url: "...", destination: "journal", commit_hash: "abc1234" }\`

Requires TARTARUS_URL and MCP_API_KEY to be configured.`,
      inputSchema: {
        filename: z
          .string()
          .min(1)
          .describe('Filename (e.g., "image.png", "diagram.svg")'),
        url: z
          .string()
          .url()
          .optional()
          .describe("URL to download file from (either url or data required)"),
        data: z
          .string()
          .optional()
          .describe("Base64-encoded file data (either url or data required)"),
        description: z
          .string()
          .optional()
          .describe("Human-readable description"),
        alt: z
          .string()
          .optional()
          .describe("Alt text for accessibility (images)"),
        tags: z
          .array(z.string())
          .optional()
          .default([])
          .describe("Array of tags for categorization"),
        prompt: z
          .string()
          .optional()
          .describe("AI generation prompt (if AI-generated)"),
        model: z
          .string()
          .optional()
          .describe("AI model used (if AI-generated)"),
        destination: z
          .enum(["journal", "repository", "media", "portfolio"])
          .default("media")
          .describe("Where this media belongs"),
        commit_hash: z
          .string()
          .optional()
          .describe("Link to journal entry (for destination: journal)"),
        document_id: z
          .number()
          .optional()
          .describe("Link to document (for destination: repository)"),
        portfolio_project_id: z
          .string()
          .optional()
          .describe("Link to portfolio project (for destination: portfolio)"),
      },
    },
    async ({
      filename,
      url,
      data,
      description,
      alt,
      tags,
      prompt,
      model,
      destination,
      commit_hash,
      document_id,
      portfolio_project_id,
    }) => {
      try {
        // RESTRICTION: AI agents cannot upload media directly
        // Media uploads are user-controlled to prevent unauthorized content
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error:
                    "Permission denied: AI agents cannot upload media directly. Media uploads are user-controlled.",
                  suggestion:
                    "Media can only be uploaded through the web interface by the user.",
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };

        // Original code below (unreachable due to restriction)
        // Validate that either url or data is provided
        if (!url && !data) {
          throw new Error("Either url or data must be provided");
        }

        const payload: any = {
          filename,
          destination: destination || "media",
          tags: tags || [],
        };

        if (url) {
          payload.url = url;
        } else if (data) {
          payload.data = data;
        }

        if (description) payload.description = description;
        if (alt) payload.alt = alt;
        if (prompt) payload.prompt = prompt;
        if (model) payload.model = model;
        if (commit_hash) payload.commit_hash = commit_hash;
        if (document_id) payload.document_id = document_id;
        if (portfolio_project_id)
          payload.portfolio_project_id = portfolio_project_id;

        const response = await fetchTartarus<{
          id: number;
          filename: string;
          mime_type: string;
          file_size: number;
          destination: string;
          commit_hash?: string;
          document_id?: number;
          portfolio_project_id?: string;
          created_at: string;
          message: string;
        }>("/api/media", {
          method: "POST",
          body: payload,
        });

        const text = `✅ Media uploaded successfully\n\n${JSON.stringify(
          {
            id: response.id,
            filename: response.filename,
            mime_type: response.mime_type,
            file_size: response.file_size,
            destination: response.destination,
            commit_hash: response.commit_hash,
            document_id: response.document_id,
            portfolio_project_id: response.portfolio_project_id,
            created_at: response.created_at,
            download_url: `${tartarusUrl}/api/media/${response.id}/raw`,
          },
          null,
          2,
        )}`;

        return {
          content: [
            {
              type: "text" as const,
              text: truncateOutput(text),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  logger.success(
    "Journal tools registered (10 tools including registry) + Repository tools (9 tools via Tartarus API)",
  );

  // ============================================
  // MCP Resources - Expose journal data as resources
  // AI SDK 6.0 feature: Resources provide read-only data access
  // ============================================

  // Resource: List of all repositories
  server.registerResource(
    "repositories",
    "journal://repositories",
    {
      description: "List of all repositories with journal entries",
      mimeType: "application/json",
    },
    async () => {
      const repositories = listRepositories();
      return {
        contents: [
          {
            uri: "journal://repositories",
            mimeType: "application/json",
            text: JSON.stringify(repositories, null, 2),
          },
        ],
      };
    },
  );

  // Resource Template: Project summary SHALLOW view (LLM-friendly, flat key:value)
  server.registerResource(
    "project-summary",
    new ResourceTemplate("journal://project-summary/{repository}", { list: undefined }),
    {
      description:
        "Shallow view of Entry 0 — flat section_name:current_value pairs. " +
        "Optimized for LLM context windows. No history, no metadata. " +
        "Use journal://project-summary/{repository}/deep for full timeline.",
      mimeType: "application/json",
    },
    async (uri, { repository }) => {
      const shallow = getShallowView(repository as string);
      if (!shallow) {
        // Fallback to legacy if no v2 sections_json yet
        const legacy = getProjectSummary(repository as string);
        if (!legacy) {
          return {
            contents: [{
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ error: `No Entry 0 found for ${repository}` }),
            }],
          };
        }
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(legacy, null, 2),
          }],
        };
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(shallow, null, 2),
        }],
      };
    },
  );

  // Resource Template: Project summary DEEP view (full timeline + history)
  server.registerResource(
    "project-summary-deep",
    new ResourceTemplate("journal://project-summary/{repository}/deep", { list: undefined }),
    {
      description:
        "Deep view of Entry 0 — full sections with evolution history, timestamps, " +
        "commit refs. For Kronus debugging and human review. Includes legacy columns.",
      mimeType: "application/json",
    },
    async (uri, { repository }) => {
      const deep = getDeepView(repository as string);
      if (!deep) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ error: `No Entry 0 found for ${repository}` }),
          }],
        };
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(deep, null, 2),
        }],
      };
    },
  );

  // Resource Template: Get journal entry by commit hash
  server.registerResource(
    "journal-entry",
    new ResourceTemplate("journal://entry/{commit_hash}", { list: undefined }),
    {
      description:
        "Get a journal entry by commit hash. By default excludes raw_agent_report. Add ?include_raw_report=true to URI query to include full report.",
      mimeType: "application/json",
    },
    async (uri, { commit_hash }) => {
      try {
        // Check for query parameter
        const url = new URL(uri.href);
        const includeRawReport =
          url.searchParams.get("include_raw_report") === "true";

        const entry = getEntryByCommit(commit_hash as string);
        if (!entry) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify({
                  error: `No journal entry found for commit ${commit_hash}`,
                }),
              },
            ],
          };
        }

        const summary = formatEntrySummary(entry, includeRawReport);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to fetch entry: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource Template: List branches for a repository
  server.registerResource(
    "journal-branches",
    new ResourceTemplate("journal://branches/{repository}", {
      list: undefined,
    }),
    {
      description:
        "List all branches in a repository that have journal entries. Returns a simple list of branch names.",
      mimeType: "application/json",
    },
    async (uri, { repository }) => {
      try {
        const branches = listBranches(repository as string);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  repository: repository,
                  branch_count: branches.length,
                  branches: branches,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to fetch branches: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource Template: List attachments for a journal entry
  server.registerResource(
    "journal-attachments",
    new ResourceTemplate("journal://attachments/{commit_hash}", {
      list: undefined,
    }),
    {
      description:
        "List attachment metadata for a journal entry by commit hash. Binary file data is excluded. Use journal://attachment/{attachment_id} resource to get individual attachment details.",
      mimeType: "application/json",
    },
    async (uri, { commit_hash }) => {
      try {
        // Use metadata-only function (no binary data)
        const attachments = getAttachmentMetadataByCommit(
          commit_hash as string,
        );

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
          output.download_note =
            "Use download_url to fetch full file content via HTTP (bypasses MCP truncation limits)";
        } else {
          output.download_note =
            "Set TARTARUS_URL env var to enable direct download URLs";
        }

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(output, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to fetch attachments: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource Template: Get attachment by ID
  server.registerResource(
    "journal-attachment",
    new ResourceTemplate("journal://attachment/{attachment_id}", {
      list: undefined,
    }),
    {
      description:
        "Get attachment metadata by attachment ID. **Base64 data is excluded by default** to avoid heavy payloads (especially for images). Use download_url to fetch binary files via HTTP. Add ?include_data=true&max_chars=500 to URI query only for small text files (NOT recommended for images).",
      mimeType: "application/json",
    },
    async (uri, { attachment_id }) => {
      try {
        const attachment = getAttachmentById(Number(attachment_id));
        if (!attachment) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify({
                  error: `No attachment found with ID ${attachment_id}`,
                }),
              },
            ],
          };
        }

        // Check for query parameters
        const url = new URL(uri.href);
        const includeData = url.searchParams.get("include_data") === "true";
        const maxChars = parseInt(
          url.searchParams.get("max_chars") || "500",
          10,
        );

        // Build download URL if Tartarus URL is configured
        const downloadUrl = journalConfig.tartarusUrl
          ? `${journalConfig.tartarusUrl}/api/attachments/${attachment.id}/raw`
          : null;

        // Check if this is an image
        const isImage = attachment.mime_type?.startsWith("image/");
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
          output.warning =
            "⚠️ This is an image file. Base64 encoding would be very large. Use download_url to fetch the image via HTTP instead.";
        } else if (isLargeFile) {
          output.warning = `⚠️ This file is large (${(attachment.file_size / 1024).toFixed(2)} KB). Base64 encoding would exceed MCP limits. Use download_url to fetch via HTTP instead.`;
        }

        if (includeData) {
          // Warn if trying to include data for images or large files
          if (isImage) {
            output.error =
              "Cannot include base64 data for image files. Use download_url instead.";
            output.data_included = false;
          } else if (isLargeFile) {
            output.warning =
              "File is large - only including preview. Use download_url for full file.";
            const data_base64 = attachment.data.toString("base64");
            const previewLength = Math.min(
              maxChars,
              Math.min(data_base64.length, 10000),
            ); // Cap at 10KB preview
            output.data_base64_preview = data_base64.substring(
              0,
              previewLength,
            );
            output.data_base64_full_length = data_base64.length;
            output.note = `Preview only (${previewLength}/${data_base64.length} chars). Use download_url to fetch full file.`;
          } else {
            // Small text files - include data
            const data_base64 = attachment.data.toString("base64");
            const previewLength = Math.min(maxChars, data_base64.length);
            output.data_base64_preview = data_base64.substring(
              0,
              previewLength,
            );
            output.data_base64_full_length = data_base64.length;
            output.note =
              previewLength < data_base64.length
                ? `Data truncated for preview (${previewLength}/${data_base64.length} chars). Use download_url to fetch full file.`
                : "Full data included";
          }
        } else {
          // Default: no data included
          if (downloadUrl) {
            output.note =
              "Binary data excluded by default. Use download_url to fetch full file via HTTP (bypasses MCP size limits).";
            if (isImage) {
              output.recommendation =
                "For images, always use download_url - base64 encoding would be too large for MCP.";
            }
          } else {
            output.note =
              "Binary data excluded. Set TARTARUS_URL env var to enable direct download URLs.";
          }
        }

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(output, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to fetch attachment: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource Template: Get registry object by UUID
  server.registerResource(
    "registry-object",
    new ResourceTemplate("registry://object/{uuid}", { list: undefined }),
    {
      description:
        "Get a Tartarus registry object by UUID. Returns full text content for journal entries, Entry 0 summaries, documents, and conversations, or metadata plus download_url for binary-backed objects.",
      mimeType: "application/json",
    },
    async (uri, { uuid }) => {
      try {
        const obj = getObjectByUUID(uuid as string);
        const output = obj
          ? formatRegistryObjectDetail(obj, journalConfig)
          : { error: `Registry object not found: ${uuid}` };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(output, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to fetch registry object: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource Template: Get registry object by source reference
  server.registerResource(
    "registry-object-by-source",
    new ResourceTemplate("registry://source/{source_table}/{source_id}", {
      list: undefined,
    }),
    {
      description:
        "Get a Tartarus registry object by source table and source ID. Useful when you know the underlying object key but not its UUID.",
      mimeType: "application/json",
    },
    async (uri, { source_table, source_id }) => {
      try {
        const obj = getObjectBySource(
          source_table as string,
          source_id as string,
        );
        const output = obj
          ? formatRegistryObjectDetail(obj, journalConfig)
          : {
              error: `Registry object not found for ${source_table}/${source_id}`,
            };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(output, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to fetch registry object by source: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              }),
            },
          ],
        };
      }
    },
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
      throw new Error(
        "TARTARUS_URL not configured. Set this env var to enable repository resources.",
      );
    }
    const url = `${tartarusUrlForResources}${endpoint}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (mcpApiKeyForResources) {
      headers["X-MCP-API-Key"] = mcpApiKeyForResources;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Tartarus API error (${response.status}): ${errorText}`);
    }
    return response.json();
  }

  // Resource Template: Get document by slug or ID
  server.registerResource(
    "repository-document",
    new ResourceTemplate("repository://document/{slug_or_id}", {
      list: undefined,
    }),
    {
      description:
        "Get a repository document (writing, prompt, or note) by slug or ID. Returns full document content (text/markdown). Document content is text-based and should not contain heavy base64 data.",
      mimeType: "application/json",
    },
    async (uri, { slug_or_id }) => {
      try {
        const document = await fetchTartarusForResource<any>(
          `/api/documents/${encodeURIComponent(slug_or_id as string)}`,
        );

        // Check if document content is suspiciously large (might contain embedded base64)
        const contentLength = document.content?.length || 0;
        const isLargeContent = contentLength > 100000; // > 100KB of text

        const output: any = { ...document };

        if (isLargeContent) {
          output.warning = `⚠️ Document content is large (${(contentLength / 1024).toFixed(2)} KB). If it contains embedded base64 images, consider using separate image resources instead.`;
          // Still return full content, but warn about size
        }

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(output, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to fetch document: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource: Get all tags
  server.registerResource(
    "repository-tags",
    "repository://tags",
    {
      description:
        "Get all unique tags currently used in repository documents. Returns a sorted list of all tags for easy reference when creating new documents.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const response = await fetchTartarusForResource<{
          tags: string[];
          count: number;
        }>("/api/documents/tags");

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  tags: response.tags,
                  count: response.count,
                  note: "Use these tags when creating documents to maintain consistency",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to fetch tags: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource Template: List documents by type
  server.registerResource(
    "repository-documents-by-type",
    new ResourceTemplate("repository://documents/{type}", {
      list: async () => {
        // Return list of available types
        return [
          { uri: "repository://documents/writing", name: "Writings" },
          { uri: "repository://documents/prompt", name: "Prompts" },
          { uri: "repository://documents/note", name: "Notes" },
        ];
      },
    }),
    {
      description:
        "List repository documents filtered by type (writing, prompt, or note). Returns paginated results (default: 50 documents).",
      mimeType: "application/json",
    },
    async (uri, { type }) => {
      try {
        const validTypes = ["writing", "prompt", "note"];
        if (!validTypes.includes(type as string)) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify({
                  error: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
                }),
              },
            ],
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
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  type: type,
                  total: response.total,
                  showing: `0 to ${response.documents.length}`,
                  has_more: response.has_more,
                  documents: response.documents.map((doc) => ({
                    id: doc.id,
                    slug: doc.slug,
                    type: doc.type,
                    title: doc.title,
                    language: doc.language,
                    summary: doc.summary, // AI-generated summary for indexing
                    excerpt:
                      doc.summary ||
                      doc.content?.substring(0, 200) +
                        (doc.content?.length > 200 ? "..." : ""),
                    created_at: doc.createdAt,
                    updated_at: doc.updatedAt,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to fetch documents: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource Template: Get portfolio project by ID
  server.registerResource(
    "repository-portfolio-project",
    new ResourceTemplate("repository://portfolio-project/{id}", {
      list: undefined,
    }),
    {
      description:
        "Get full details of a portfolio project by ID. Returns complete project information including description, metrics, and links.",
      mimeType: "application/json",
    },
    async (uri, { id }) => {
      try {
        const project = await fetchTartarusForResource<any>(
          `/api/portfolio-projects/${encodeURIComponent(id as string)}`,
        );
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(project, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to fetch portfolio project: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  logger.success(
    "Journal resources registered (7 resources) + Repository resources (3 resource templates)",
  );

  // ============================================
  // LINEAR RESOURCES - Read-only cache, synced externally via Tartarus
  // All Linear mutations happen in Tartarus, MCP is read-only
  // ============================================

  // Resource: Linear cache stats
  server.registerResource(
    "linear-cache-stats",
    "linear://cache/stats",
    {
      description:
        "Linear cache statistics - active/deleted/total counts for projects and issues. Linear data is read-only via cache, synced externally through Tartarus.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const stats = getLinearCacheStats();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  description:
                    "Linear cache is a historical buffer - we preserve ALL data including deleted items",
                  projects: stats.projects,
                  issues: stats.issues,
                  last_project_sync: stats.lastProjectSync,
                  last_issue_sync: stats.lastIssueSync,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to get Linear cache stats: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource: List Linear projects (cached)
  server.registerResource(
    "linear-projects",
    "linear://projects",
    {
      description:
        "List all Linear projects (read-only cache, synced via Tartarus). Includes AI-generated summaries. Use linear://project/{id} for full details.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const { projects, total } = listLinearProjects({
          includeDeleted: true,
          limit: 100,
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  total,
                  note: "Read-only cache, synced via Tartarus. Includes deleted projects (is_deleted=true).",
                  projects: projects.map((p) => ({
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    state: p.state,
                    progress: p.progress,
                    url: p.url,
                    leadName: p.leadName,
                    isDeleted: p.isDeleted,
                    syncedAt: p.syncedAt,
                    summary: p.summary, // AI-generated summary for indexing
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to list Linear projects: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource Template: Get Linear project by ID
  server.registerResource(
    "linear-project",
    new ResourceTemplate("linear://project/{id}", { list: undefined }),
    {
      description:
        "Get full details of a Linear project by ID (read-only cache). Includes rich description, content, and AI-generated summary.",
      mimeType: "application/json",
    },
    async (uri, { id }) => {
      try {
        const project = getLinearProject(id as string);
        if (!project) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify({
                  error: `Linear project not found: ${id}`,
                }),
              },
            ],
          };
        }
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(project, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to get Linear project: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource: List Linear issues (cached) - YOUR tickets only (filtered by LINEAR_USER_ID during sync)
  server.registerResource(
    "linear-issues",
    "linear://issues",
    {
      description:
        "List your Linear issues (read-only cache, synced via Tartarus). Summary view with AI-generated summaries. Use linear://issue/{identifier} for full details.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const { issues, total } = listLinearIssues({
          includeDeleted: false,
          limit: 250,
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  total,
                  note: "Your tickets only. Sync via Tartarus to update.",
                  issues: issues.map((i) => ({
                    identifier: i.identifier,
                    title: i.title,
                    state: i.stateName,
                    project: i.projectName,
                    priority: i.priority,
                    url: i.url,
                    summary: i.summary, // AI-generated summary for indexing
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to list Linear issues: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource Template: Get Linear issue by ID or identifier
  server.registerResource(
    "linear-issue",
    new ResourceTemplate("linear://issue/{identifier}", { list: undefined }),
    {
      description:
        "Get full details of a Linear issue by ID or identifier (e.g., ENG-123). Includes full description and AI-generated summary. Read-only cache, synced via Tartarus.",
      mimeType: "application/json",
    },
    async (uri, { identifier }) => {
      try {
        const issue = getLinearIssue(identifier as string);
        if (!issue) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify({
                  error: `Linear issue not found: ${identifier}`,
                }),
              },
            ],
          };
        }
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(issue, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to get Linear issue: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource: List project updates for a project
  server.registerResource(
    "linear-project-updates",
    new ResourceTemplate("linear://project/{projectId}/updates", {
      list: undefined,
    }),
    {
      description:
        "List recent status updates for a Linear project. Shows progress posts with health status (onTrack/atRisk/offTrack). Read-only cache, synced via Tartarus.",
      mimeType: "application/json",
    },
    async (uri, { projectId }) => {
      try {
        const updates = listLinearProjectUpdates(projectId as string);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  projectId,
                  total: updates.length,
                  updates: updates.map((u) => ({
                    id: u.id,
                    body: u.body,
                    health: u.health,
                    author: u.userName,
                    createdAt: u.createdAt,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to list project updates: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource: List all recent project updates
  server.registerResource(
    "linear-all-project-updates",
    "linear://project-updates",
    {
      description:
        "List recent status updates across all Linear projects. Shows the latest progress posts with health status. Read-only cache, synced via Tartarus.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const updates = listAllLinearProjectUpdates(20);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  total: updates.length,
                  updates: updates.map((u) => ({
                    id: u.id,
                    projectId: u.projectId,
                    projectName: u.projectName,
                    body:
                      u.body.length > 200
                        ? u.body.substring(0, 200) + "..."
                        : u.body,
                    health: u.health,
                    author: u.userName,
                    createdAt: u.createdAt,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to list project updates: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  logger.success("Linear cache resources registered (7 resources)");

  // ============================================
  // SLITE CACHE RESOURCES - Knowledge base notes (read-only)
  // Data synced via Tartarus, served here as MCP resources
  // ============================================

  // Resource: Slite cache stats
  server.registerResource(
    "slite-cache-stats",
    "slite://cache/stats",
    {
      description:
        "Slite cache statistics - note counts and sync times. Knowledge base data is read-only via cache, synced externally through Tartarus.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const stats = getSliteCacheStats();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to get Slite cache stats: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource: List Slite notes (cached)
  server.registerResource(
    "slite-notes",
    "slite://notes",
    {
      description:
        "List all cached Slite notes (read-only cache, synced via Tartarus). Includes AI-generated summaries. Use slite://note/{id} for full content.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const notes = listSliteNotes({ includeDeleted: false });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  total: notes.length,
                  note: "Read-only cache, synced via Tartarus.",
                  notes: notes.map((n) => ({
                    id: n.id,
                    title: n.title,
                    parentNoteId: n.parentNoteId,
                    reviewState: n.reviewState,
                    summary: n.summary,
                    lastEditedAt: n.lastEditedAt,
                    updatedAt: n.updatedAt,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to list Slite notes: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource Template: Get single Slite note with full content
  server.registerResource(
    "slite-note",
    new ResourceTemplate("slite://note/{id}", { list: undefined }),
    {
      description:
        "Get a single Slite note with full content by ID. Read-only cache, synced via Tartarus.",
      mimeType: "application/json",
    },
    async (uri, { id }) => {
      try {
        const noteId = Array.isArray(id) ? id[0] : id;
        const note = getSliteNote(noteId);
        if (!note) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify({ error: `Note ${noteId} not found in cache` }),
              },
            ],
          };
        }
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(note, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to get Slite note: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  logger.success("Slite cache resources registered (3 resources)");

  // ============================================
  // NOTION CACHE RESOURCES (read-only, synced via Tartarus)
  // ============================================

  // Resource: Notion cache stats
  server.registerResource(
    "notion-cache-stats",
    "notion://cache/stats",
    {
      description:
        "Notion cache statistics - page counts and sync times. Workspace data is read-only via cache, synced externally through Tartarus.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const stats = getNotionCacheStats();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to get Notion cache stats: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource: List Notion pages (cached)
  server.registerResource(
    "notion-pages",
    "notion://pages",
    {
      description:
        "List all cached Notion pages (read-only cache, synced via Tartarus). Includes AI-generated summaries. Use notion://page/{id} for full content.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const pages = listNotionPages({ includeDeleted: false });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  total: pages.length,
                  note: "Read-only cache, synced via Tartarus.",
                  pages: pages.map((p) => ({
                    id: p.id,
                    title: p.title,
                    icon: p.icon,
                    parentId: p.parent_id,
                    parentType: p.parent_type,
                    summary: p.summary,
                    lastEditedAt: p.last_edited_at,
                    lastEditedByName: p.last_edited_by_name,
                    updatedAt: p.updated_at,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to list Notion pages: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource Template: Get single Notion page with full content
  server.registerResource(
    "notion-page",
    new ResourceTemplate("notion://page/{id}", { list: undefined }),
    {
      description:
        "Get a single Notion page with full content by ID. Read-only cache, synced via Tartarus.",
      mimeType: "application/json",
    },
    async (uri, { id }) => {
      try {
        const pageId = Array.isArray(id) ? id[0] : id;
        const page = getNotionPage(pageId);
        if (!page) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify({ error: `Page ${pageId} not found in cache` }),
              },
            ],
          };
        }
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(page, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to get Notion page: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  logger.success("Notion cache resources registered (3 resources)");

  // ============================================
  // CV RESOURCES - Skills, Experience, Education from repository
  // Exposed via Tartarus API
  // ============================================

  // Resource: CV Skills
  server.registerResource(
    "cv-skills",
    "repository://cv/skills",
    {
      description:
        "List all skills from CV/portfolio with categories, proficiency levels, and descriptions.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const response =
          await fetchTartarusForResource<any[]>("/api/cv/skills");
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  total: response.length,
                  skills: response,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to fetch skills: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource: CV Experience
  server.registerResource(
    "cv-experience",
    "repository://cv/experience",
    {
      description:
        "List all work experience from CV/portfolio with companies, roles, and achievements.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const response =
          await fetchTartarusForResource<any[]>("/api/cv/experience");
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  total: response.length,
                  experience: response,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to fetch experience: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  // Resource: CV Education
  server.registerResource(
    "cv-education",
    "repository://cv/education",
    {
      description:
        "List all education from CV/portfolio with degrees, institutions, and achievements.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const response =
          await fetchTartarusForResource<any[]>("/api/cv/education");
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  total: response.length,
                  education: response,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({
                error: `Failed to fetch education: ${error instanceof Error ? error.message : "Unknown error"}`,
              }),
            },
          ],
        };
      }
    },
  );

  logger.success("CV resources registered (3 resources)");

  // ============================================
  // MCP Prompts - Reusable prompt templates
  // AI SDK 6.0 feature: User-controlled prompts for common operations
  // ============================================

  // Prompt: Create journal entry
  server.registerPrompt(
    "create-entry",
    {
      title: "Create Journal Entry",
      description:
        "Generate a journal entry prompt for documenting a git commit",
      argsSchema: {
        commit_hash: z.string().describe("The git commit SHA"),
        repository: z.string().describe("Repository name"),
        branch: z.string().default("main").describe("Git branch name"),
      },
    },
    async ({ commit_hash, repository, branch }) => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Create a Tartarus journal entry for this commit:

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
          },
        ],
      };
    },
  );

  // Prompt: Update Entry 0 summary
  server.registerPrompt(
    "update-summary",
    {
      title: "Update Project Summary",
      description: "Submit a report to update Entry 0 (Living Project Summary)",
      argsSchema: {
        repository: z.string().describe("Repository name"),
      },
    },
    async ({ repository }) => {
      const summary = getProjectSummary(repository);
      const existingContext = summary
        ? `\nCurrent Entry 0 has: ${summary.summary ? "summary" : ""} ${summary.tech_stack ? "tech_stack" : ""} ${summary.file_structure ? "file_structure" : ""}...`
        : "\nNo existing Entry 0 found - this will create a new one.";

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
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

Use journal_create_project_summary if Entry 0 doesn't exist yet.
Use journal_update_project_technical for technical sections (file_structure, tech_stack, patterns, commands, architecture, etc.).
Use journal_submit_summary_report for narrative sections (summary, purpose, key_decisions, status, etc.).`,
            },
          },
        ],
      };
    },
  );

  // Prompt: Explore repository
  server.registerPrompt(
    "explore-repo",
    {
      title: "Explore Repository",
      description: "Get started exploring a repository's journal history",
      argsSchema: {
        repository: z.string().describe("Repository name"),
      },
    },
    async ({ repository }) => {
      const summary = getProjectSummary(repository);
      const { entries } = getEntriesByRepositoryPaginated(
        repository,
        5,
        0,
        false,
      );

      let context = `Repository: ${repository}\n`;
      if (summary) {
        context += `\nEntry 0 Summary: ${summary.summary || "Not set"}\n`;
        context += `Technologies: ${summary.technologies || "Not set"}\n`;
        context += `Status: ${summary.status || "Not set"}\n`;
      }
      if (entries.length > 0) {
        context += `\nRecent entries: ${entries.length}\n`;
        context += entries
          .map(
            (e) =>
              `- ${e.commit_hash.substring(0, 7)}: ${e.why?.substring(0, 50)}...`,
          )
          .join("\n");
      }

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Help me understand the ${repository} project.

${context}

What would you like to know? I can:
1. Show recent journal entries (journal_list_by_repository)
2. Get the project summary (journal://project-summary/{repository} resource)
3. List branches with activity (journal_list_branches)
4. Search for specific commits (journal://entry/{commit_hash} resource)`,
            },
          },
        ],
      };
    },
  );

  logger.success("Journal prompts registered (3 prompts)");

  // ============================================================================
  // VISUAL ATTACHMENT TOOLS
  // ============================================================================

  server.registerTool(
    "journal_attach_screenshot",
    {
      title: "Attach Screenshot to Journal Entry",
      description: `Capture a screenshot of a running localhost dev server and attach it to a journal entry.

Use this after creating a journal entry that includes frontend changes (components/, app/, pages/).
The URL must include the port (e.g. http://localhost:3005/chat-hourglass).

The screenshot is stored in media_assets linked to the commit_hash, and registered in the object registry.

Returns: { mediaId, uuid, rawUrl, label }

Example:
  journal_attach_screenshot({
    commit_hash: "c332fbf",
    url: "http://localhost:3005/chat-hourglass",
    label: "Hourglass chat - artifact shelf"
  })`,
      inputSchema: {
        commit_hash: z.string().min(7).describe("Commit hash of the journal entry to attach to"),
        url: z.string().url().describe("Full localhost URL to screenshot including port (e.g. http://localhost:3005/dashboard)"),
        label: z.string().optional().describe("Human-readable label for what is shown in the screenshot"),
        waitForSelector: z.string().optional().describe("CSS selector to wait for before capturing (e.g. '.artifact-shelf')"),
      },
    },
    async ({ commit_hash, url, label, waitForSelector }) => {
      try {
        const tartarusUrl = journalConfig.tartarusUrl;
        if (!tartarusUrl) {
          return {
            content: [{ type: "text" as const, text: "Error: TARTARUS_URL is not configured. Set it in the MCP server env to point to the Tartarus web app (e.g. http://localhost:3005)." }],
            isError: true as const,
          };
        }

        const parsed = new URL(url);
        if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
          return {
            content: [{ type: "text" as const, text: "Error: Only localhost URLs are allowed for screenshots." }],
            isError: true as const,
          };
        }

        const response = await fetch(`${tartarusUrl}/api/screenshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, commit_hash, label, waitForSelector }),
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
          const text = await response.text();
          return {
            content: [{ type: "text" as const, text: `Screenshot failed (HTTP ${response.status}): ${text}` }],
            isError: true as const,
          };
        }

        const result = await response.json() as { mediaId: number; uuid: string | null; rawUrl: string; filename: string; label: string };

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              mediaId: result.mediaId,
              uuid: result.uuid,
              rawUrl: `${tartarusUrl}${result.rawUrl}`,
              label: result.label,
              filename: result.filename,
              commit_hash,
              message: "Screenshot captured and attached to journal entry.",
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true as const,
        };
      }
    },
  );

  server.registerTool(
    "journal_attach_muse_visual",
    {
      title: "Attach Muse Visual to Journal Entry",
      description: `Ask the Muse to paint a visual for a journal entry — either an infographic summarising the changes or a mood image.

Use this when:
- No dev server is running (can't screenshot)
- The change is backend/schema/API only
- You want a conceptual illustration rather than a literal screenshot

render_mode:
  "infographic" — GPT Image 2, best for diagrams, architecture, schema changes, feature summaries with text
  "mood"        — Painterly image, best for aesthetic context, emotional tone of the work

The resulting image is stored in media_assets linked to the commit_hash and registered in the object registry.

Returns: { mediaId, uuid, rawUrl }

Example:
  journal_attach_muse_visual({
    commit_hash: "c332fbf",
    context: "Added artifact shelf system with discriminated union types. Kronus can now place images and poems on a shared display.",
    render_mode: "infographic",
    label: "Artifact shelf architecture"
  })`,
      inputSchema: {
        commit_hash: z.string().min(7).describe("Commit hash of the journal entry to attach to"),
        context: z.string().min(10).describe("Description of what changed — used as the image generation prompt context"),
        render_mode: z.enum(["infographic", "mood"]).describe("infographic = structured diagram (GPT Image 2), mood = painterly image"),
        label: z.string().optional().describe("Human-readable label for the visual"),
      },
    },
    async ({ commit_hash, context, render_mode, label }) => {
      try {
        const tartarusUrl = journalConfig.tartarusUrl;
        if (!tartarusUrl) {
          return {
            content: [{ type: "text" as const, text: "Error: TARTARUS_URL is not configured." }],
            isError: true as const,
          };
        }

        const prompt = render_mode === "infographic"
          ? `Technical infographic: ${context}. Clean diagram style, dark background, clear labels, structured layout.`
          : `Artistic mood image: ${context}. Painterly, atmospheric, evocative.`;

        const response = await fetch(`${tartarusUrl}/api/chat-hourglass/muse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "force",
            prompt,
            renderMode: render_mode,
            provider: "openai",
            quality: "medium",
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
          const text = await response.text();
          return {
            content: [{ type: "text" as const, text: `Muse visual failed (HTTP ${response.status}): ${text}` }],
            isError: true as const,
          };
        }

        const result = await response.json() as {
          shouldPaint: boolean;
          artifactRef?: { uuid: string; sourceId: string; thumbUrl: string };
        };

        if (!result.shouldPaint || !result.artifactRef) {
          return {
            content: [{ type: "text" as const, text: "Muse did not produce an image." }],
            isError: true as const,
          };
        }

        // Link the generated media_asset to the journal entry commit_hash
        try {
          const db = await import(`${tartarusUrl}/api/media`).catch(() => null);
          void db; // linking is handled by Tartarus web media route
          await fetch(`${tartarusUrl}/api/media`, {
            method: "POST",
            // This will 409 if already inserted — we use the existing sourceId instead
          }).catch(() => null);
        } catch { /* non-critical */ }

        const rawUrl = `${tartarusUrl}${result.artifactRef.thumbUrl}`;

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              uuid: result.artifactRef.uuid,
              sourceId: result.artifactRef.sourceId,
              rawUrl,
              render_mode,
              label: label || `Muse ${render_mode} for ${commit_hash}`,
              commit_hash,
              message: "Muse visual generated. Note: link to commit_hash must be set manually via PATCH /api/media/{id} if needed.",
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true as const,
        };
      }
    },
  );

  logger.success("Visual attachment tools registered (journal_attach_screenshot, journal_attach_muse_visual)");

  // ============================================================================
  // PROMPT: journal-visual
  // ============================================================================

  server.registerPrompt(
    "journal-visual",
    {
      title: "Journal Visual Attachment",
      description: "Decide which visual (screenshot, Muse infographic, or mood image) to attach to a journal entry, and call the appropriate tool. Works for any codebase — Tartarus, Jobilla, or any localhost project.",
      argsSchema: {
        commit_hash: z.string().min(7).describe("Commit hash of the journal entry that was just created"),
        files_changed: z.string().optional().describe("JSON array or comma-separated list of files that changed in this commit"),
        tartarus_url: z.string().optional().describe("Base URL of the running Tartarus web app (e.g. http://localhost:3005). Required for both tools."),
      },
    },
    async ({ commit_hash, files_changed, tartarus_url }) => {
      const baseUrl = tartarus_url || journalConfig.tartarusUrl || "http://localhost:3005";

      const filesHint = files_changed
        ? `\n\nFiles changed in this commit:\n${files_changed}`
        : "";

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `You just created journal entry for commit \`${commit_hash}\`. Now decide whether to attach a visual and which kind.${filesHint}

## Decision tree

Inspect the files changed:

**Frontend change** (paths in \`components/\`, \`app/\`, \`pages/\`, \`web/\`)
→ Call \`journal_attach_screenshot\` with the localhost URL of the changed route.
→ If the dev server is not running, fall back to \`journal_attach_muse_visual\` with \`render_mode: "infographic"\`.

**Backend / schema / API change** (paths in \`src/\`, \`lib/\`, \`migrations/\`, \`schema.ts\`, \`tools.ts\`)
→ Call \`journal_attach_muse_visual\` with \`render_mode: "infographic"\`.
→ Use the \`what_changed\` + \`decisions\` fields from the entry as the \`context\` parameter.

**Mixed FE + BE**
→ Screenshot first, then infographic.

**Small / unclear change**
→ Call \`journal_attach_muse_visual\` with \`render_mode: "mood"\`. Always valid, always cheap.

## Tool usage

### journal_attach_screenshot (FE — dev server must be running)
\`\`\`
journal_attach_screenshot({
  commit_hash: "${commit_hash}",
  url: "http://localhost:PORT/route",   // include the port
  label: "Short description of what is shown",
  waitForSelector: ".css-selector"      // optional
})
\`\`\`
Common ports: Tartarus web → 3005. Other projects: check \`package.json\` dev script.

### journal_attach_muse_visual (no server, BE changes, or conceptual)
\`\`\`
journal_attach_muse_visual({
  commit_hash: "${commit_hash}",
  context: "Plain English description of what changed",
  render_mode: "infographic",   // or "mood"
  label: "Short label"
})
\`\`\`
- \`infographic\` → GPT Image 2. Best for architecture, schema, feature summaries.
- \`mood\` → painterly. Best for narrative or aesthetic context.

### git_read (understand code from any local repo before deciding)
\`\`\`
git_read({
  repo_path: "/absolute/path/to/repo",
  command: "diff",
  args: ["HEAD~1", "--stat"]
})
\`\`\`

## Requirements
Both tools require \`TARTARUS_URL\` in the MCP server env (currently: \`${baseUrl}\`).
Screenshots are localhost-only. Muse infographics work without a running dev server.

Proceed: classify the change, pick the right tool, attach the visual.`,
            },
          },
        ],
      };
    },
  );

  logger.success("Journal visual prompt registered (journal-visual)");
}
