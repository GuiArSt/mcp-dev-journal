import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { withTrace, traceAI } from "@/lib/observability";
import { normalizeRepository } from "@/lib/utils";
import { runCursorRepositoryInsight } from "@/lib/cursor-agent-delegate";
import {
  formatProjectListHint,
  loadCursorDelegateProjects,
  resolveCursorProjectForRepository,
} from "@/lib/cursor-delegate-config";

/**
 * POST /api/repository-overviews/analyze
 *
 * Reader-only flow: refresh Repository overview (Entry 0) from recent journal rows, optionally
 * validated against a **local** clone via Cursor delegate (`CURSOR_API_KEY` + delegate repos).
 * Not exposed on MCP.
 */

const SummaryUpdateSchema = z.object({
  summary: z.string().describe("High-level project overview. Empty string if no update."),
  purpose: z.string().describe("Why this project exists. Empty string if no update."),
  architecture: z
    .string()
    .describe("Overall structure and organization. Empty string if no update."),
  key_decisions: z.string().describe("Major architectural decisions. Empty string if no update."),
  technologies: z.string().describe("Core technologies used. Empty string if no update."),
  status: z.string().describe("Current project status. Empty string if no update."),
  file_structure: z
    .string()
    .describe("Git-style file tree with summaries. Empty string if no update."),
  tech_stack: z.string().describe("Frameworks, libraries, versions. Empty string if no update."),
  frontend: z
    .string()
    .describe("FE patterns, components, state management. Empty string if no update."),
  backend: z.string().describe("BE routes, middleware, auth patterns. Empty string if no update."),
  database_info: z
    .string()
    .describe("Schema, ORM patterns, migrations. Empty string if no update."),
  services: z.string().describe("External APIs, integrations. Empty string if no update."),
  custom_tooling: z.string().describe("Project-specific utilities. Empty string if no update."),
  data_flow: z.string().describe("How data is processed. Empty string if no update."),
  patterns: z.string().describe("Naming conventions, code style. Empty string if no update."),
  commands: z.string().describe("Dev, deploy, make commands. Empty string if no update."),
  extended_notes: z
    .string()
    .describe("Gotchas, TODOs, historical context. Empty string if no update."),
});

type SummaryUpdate = z.infer<typeof SummaryUpdateSchema>;

interface JournalEntry {
  commit_hash: string;
  date: string;
  why: string;
  what_changed: string;
  decisions: string;
  technologies: string;
  kronus_wisdom: string | null;
  files_changed: string | null;
}

interface ProjectSummary {
  id: number;
  repository: string;
  git_url: string | null;
  summary: string | null;
  purpose: string | null;
  architecture: string | null;
  key_decisions: string | null;
  technologies: string | null;
  status: string | null;
  file_structure: string | null;
  tech_stack: string | null;
  frontend: string | null;
  backend: string | null;
  database_info: string | null;
  services: string | null;
  custom_tooling: string | null;
  data_flow: string | null;
  patterns: string | null;
  commands: string | null;
  extended_notes: string | null;
  last_synced_entry: string | null;
  entries_synced: number | null;
}

function formatEntriesForContext(entries: JournalEntry[]): string {
  if (entries.length === 0) {
    return "No recent journal entries available.";
  }

  return entries
    .map(
      (e) => `
### ${e.commit_hash.substring(0, 7)} (${e.date})
- **Why:** ${e.why}
- **Changed:** ${e.what_changed}
- **Decisions:** ${e.decisions}
- **Tech:** ${e.technologies}
${e.kronus_wisdom ? `- **Wisdom:** ${e.kronus_wisdom}` : ""}
${e.files_changed ? `- **Files:** ${e.files_changed}` : ""}`
    )
    .join("\n");
}

function clipText(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function buildCursorValidationQuestion(
  repository: string,
  summary: ProjectSummary,
  entriesBlock: string,
): string {
  const overviewDigest = [
    `summary: ${clipText(summary.summary || "(empty)", 2800)}`,
    `purpose: ${clipText(summary.purpose || "(empty)", 2000)}`,
    `architecture: ${clipText(summary.architecture || "(empty)", 2000)}`,
    `key_decisions: ${clipText(summary.key_decisions || "(empty)", 2000)}`,
    `technologies: ${clipText(summary.technologies || "(empty)", 1200)}`,
    `status: ${clipText(summary.status || "(empty)", 400)}`,
    `file_structure (excerpt): ${clipText(summary.file_structure || "(empty)", 2500)}`,
    `tech_stack (excerpt): ${clipText(summary.tech_stack || "(empty)", 2000)}`,
  ].join("\n");

  return `Tartarus journal repository key: "${repository}".

You are validating written **Repository overview** (Entry 0) memory against **this** working tree. Read files as needed (package manifests, app entrypoints, API routes).

### Saved overview (may be wrong or stale)
${overviewDigest}

### Recent journal context (may contain mistakes)
${clipText(entriesBlock, 12_000)}

Reply with markdown sections exactly:
## Contradictions
(Factual conflicts vs the repo — cite paths.)

## Gaps
(Important stack, apps, or directories not reflected above.)

## Confirmed
(Where the write-up matches the tree.)

Be concise. Another model will merge your findings into the overview.`;
}

function formatExistingSummary(summary: ProjectSummary): string {
  return `
## Existing Entry 0 (Repository overview) sections

**Summary:** ${summary.summary || "Not set"}
**Purpose:** ${summary.purpose || "Not set"}
**Architecture:** ${summary.architecture || "Not set"}
**Key Decisions:** ${summary.key_decisions || "Not set"}
**Technologies:** ${summary.technologies || "Not set"}
**Status:** ${summary.status || "Not set"}

### Extended fields
**File Structure:** ${summary.file_structure || "Not set"}
**Tech Stack:** ${summary.tech_stack || "Not set"}
**Frontend:** ${summary.frontend || "Not set"}
**Backend:** ${summary.backend || "Not set"}
**Database:** ${summary.database_info || "Not set"}
**Services:** ${summary.services || "Not set"}
**Custom Tooling:** ${summary.custom_tooling || "Not set"}
**Data Flow:** ${summary.data_flow || "Not set"}
**Patterns:** ${summary.patterns || "Not set"}
**Commands:** ${summary.commands || "Not set"}
**Extended Notes:** ${summary.extended_notes || "Not set"}
`;
}

const ANALYZE_PATH = "/api/repository-overviews/analyze";

export const POST = withErrorHandler(async (request: NextRequest) => {
  const body = await request.json();
  const repository = body.repository ? normalizeRepository(body.repository) : null;
  const entries_to_analyze = body.entries_to_analyze ?? 10;
  /** Skip Cursor delegate even when configured (e.g. smoke tests). */
  const skip_cursor = body.skip_cursor === true;

  if (!repository) {
    return NextResponse.json({ error: "Repository is required" }, { status: 400 });
  }

  const db = getDatabase();

  let existingSummary = db
    .prepare(`SELECT * FROM repository_overviews WHERE repository = ?`)
    .get(repository) as ProjectSummary | undefined;

  if (!existingSummary) {
    db.prepare(
      `
      INSERT INTO repository_overviews (repository, git_url, summary, purpose, architecture, key_decisions, technologies, status, updated_at)
      VALUES (?, NULL, 'Auto-generated summary - pending analysis.', '', '', '', '', 'active', datetime('now'))
    `
    ).run(repository);

    existingSummary = db
      .prepare(`SELECT * FROM repository_overviews WHERE repository = ?`)
      .get(repository) as ProjectSummary;

    try {
      const { registerObject } = await import("@/lib/object-registry");
      registerObject({
        type: "project_summary",
        sourceTable: "repository_overviews",
        sourceId: repository,
        title: repository,
        summary: existingSummary.summary ?? undefined,
      });
    } catch {
      /* registry is non-critical */
    }
  }

  const entries = db
    .prepare(
      `
      SELECT commit_hash, date, why, what_changed, decisions, technologies, kronus_wisdom, files_changed
      FROM journal_entries
      WHERE repository = ?
      ORDER BY date DESC
      LIMIT ?
    `
    )
    .all(repository, Math.min(entries_to_analyze, 20)) as JournalEntry[];

  if (entries.length === 0) {
    return NextResponse.json({ error: "No journal entries found to analyze" }, { status: 400 });
  }

  const entriesBlock = formatEntriesForContext(entries);

  let cursorMeta: { used: boolean; project_id?: string; error?: string } = { used: false };
  let cursorValidationSection = "";

  const projects = loadCursorDelegateProjects();
  const cursorProject =
    !skip_cursor &&
    process.env.CURSOR_API_KEY?.trim() &&
    projects.length > 0
      ? resolveCursorProjectForRepository(projects, repository)
      : undefined;

  if (!skip_cursor) {
    if (process.env.CURSOR_API_KEY?.trim() && projects.length === 0) {
      cursorMeta = { used: false, error: "CURSOR_API_KEY set but no delegate repos configured" };
    } else if (process.env.CURSOR_API_KEY?.trim() && projects.length > 0 && !cursorProject) {
      cursorMeta = {
        used: false,
        error: `No Cursor delegate project matched journal repository "${repository}". ${formatProjectListHint(projects)}`,
      };
    } else if (cursorProject) {
      try {
        const question = buildCursorValidationQuestion(repository, existingSummary, entriesBlock);
        const insight = await runCursorRepositoryInsight(cursorProject.root, question);
        cursorMeta = { used: true, project_id: cursorProject.id };
        const capped = clipText(insight, 28_000);
        cursorValidationSection = `

## Live tree validation (Cursor read-only agent)

Project \`${cursorProject.id}\` at \`${cursorProject.root}\`. Use this to fix factual drift; prefer it over journal text when they conflict.

${capped}
`;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        cursorMeta = { used: false, project_id: cursorProject.id, error: msg };
        cursorValidationSection = `

## Live tree validation (Cursor)

Attempted delegate for project \`${cursorProject.id}\` but it failed: ${msg}
`;
      }
    }
  }

  const systemPrompt = `You are Kronus, an empathetic AI analyzing developer work with wisdom and care.

## Task: Analyze journal entries to update the Repository overview (Entry 0)

You are updating the persistent repository knowledge base that evolves over time — not a single journal entry.

${formatExistingSummary(existingSummary)}

## Recent journal entries to analyze
${entriesBlock}
${cursorValidationSection}
## Instructions

1. **Extract structured information** from the journal entries${cursorMeta.used ? " and reconcile with the live tree validation section when present" : ""}
2. **Preserve existing accurate information** - only update sections with meaningful new info
3. **Merge intelligently** - don't overwrite good existing content with worse new content
4. **Return empty string "" for sections** that have no updates or where existing content is better

### Section guidelines

- **file_structure**: Convert file mentions to git-style tree format (├── └── │). Include brief file summaries.
- **tech_stack**: List frameworks, libraries, versions mentioned.
- **frontend/backend/database_info**: Document patterns, components, routes, schema approaches.
- **services**: External APIs and how they're integrated.
- **custom_tooling**: Project-specific utilities, helpers, wrappers.
- **data_flow**: How data moves through the system.
- **patterns**: Naming conventions, file organization, code style.
- **commands**: Dev commands, deploy scripts mentioned.
- **extended_notes**: Gotchas, historical context, TODOs, anything that doesn't fit elsewhere.

Be thorough but concise. This is reference documentation for engineers.`;

  const { updates } = await withTrace(
    `entry0-analyze`,
    async () => {
      const result = await traceAI(
        "entry0-analyze-generate",
        "claude-sonnet-4-6",
        () =>
          generateText({
            model: anthropic("claude-sonnet-4-6"),
            output: Output.object({ schema: SummaryUpdateSchema }),
            prompt: systemPrompt,
            temperature: 0.7,
          }),
        {
          repository,
          entries_count: entries.length,
          cursor_validated: cursorMeta.used,
          cursor_project_id: cursorMeta.project_id ?? null,
        },
        systemPrompt,
        ANALYZE_PATH,
      );

      if (!result.output) throw new Error("No structured output generated from AI model");
      return { updates: result.output as SummaryUpdate };
    },
    { repository },
    ANALYZE_PATH,
  );

  const fieldsToUpdate: string[] = [];
  const values: (string | number | null)[] = [];

  const updateFields: (keyof SummaryUpdate)[] = [
    "summary",
    "purpose",
    "architecture",
    "key_decisions",
    "technologies",
    "status",
    "file_structure",
    "tech_stack",
    "frontend",
    "backend",
    "database_info",
    "services",
    "custom_tooling",
    "data_flow",
    "patterns",
    "commands",
    "extended_notes",
  ];

  for (const field of updateFields) {
    if (updates[field] && updates[field].trim() !== "") {
      fieldsToUpdate.push(`${field} = ?`);
      values.push(updates[field]);
    }
  }

  fieldsToUpdate.push("last_synced_entry = ?");
  values.push(entries[0].commit_hash);

  fieldsToUpdate.push("entries_synced = ?");
  values.push((existingSummary.entries_synced || 0) + entries.length);

  fieldsToUpdate.push("updated_at = datetime('now')");

  if (fieldsToUpdate.length > 0) {
    values.push(repository);
    db.prepare(
      `
      UPDATE repository_overviews
      SET ${fieldsToUpdate.join(", ")}
      WHERE repository = ?
    `
    ).run(...values);
  }

  const updatedSummary = db
    .prepare(`SELECT * FROM repository_overviews WHERE repository = ?`)
    .get(repository);

  return NextResponse.json({
    success: true,
    message: cursorMeta.used
      ? `Analyzed ${entries.length} entries with Cursor tree validation and updated Repository overview (Entry 0)`
      : `Analyzed ${entries.length} entries and updated Repository overview (Entry 0)`,
    entries_analyzed: entries.length,
    fields_updated: fieldsToUpdate.filter(
      (f) =>
        !f.includes("last_synced") && !f.includes("entries_synced") && !f.includes("updated_at")
    ).length,
    summary: updatedSummary,
    cursor: cursorMeta,
  });
});
