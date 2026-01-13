import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { startTrace, startSpan, endSpan, endTrace } from "@/lib/observability";

/**
 * Entry 0 Analysis - Living Project Summary
 *
 * POST /api/project-summaries/analyze
 *
 * Analyzes recent journal entries to update the Living Project Summary (Entry 0).
 * Uses Sonnet 4.5 to extract patterns, tech stack, and insights.
 */

// Zod schema for Entry 0 sections
// Using empty string "" instead of null to avoid too many conditional branches in Anthropic's grammar
const SummaryUpdateSchema = z.object({
  summary: z.string().describe('High-level project overview. Empty string if no update.'),
  purpose: z.string().describe('Why this project exists. Empty string if no update.'),
  architecture: z.string().describe('Overall structure and organization. Empty string if no update.'),
  key_decisions: z.string().describe('Major architectural decisions. Empty string if no update.'),
  technologies: z.string().describe('Core technologies used. Empty string if no update.'),
  status: z.string().describe('Current project status. Empty string if no update.'),
  file_structure: z.string().describe('Git-style file tree with summaries. Empty string if no update.'),
  tech_stack: z.string().describe('Frameworks, libraries, versions. Empty string if no update.'),
  frontend: z.string().describe('FE patterns, components, state management. Empty string if no update.'),
  backend: z.string().describe('BE routes, middleware, auth patterns. Empty string if no update.'),
  database_info: z.string().describe('Schema, ORM patterns, migrations. Empty string if no update.'),
  services: z.string().describe('External APIs, integrations. Empty string if no update.'),
  custom_tooling: z.string().describe('Project-specific utilities. Empty string if no update.'),
  data_flow: z.string().describe('How data is processed. Empty string if no update.'),
  patterns: z.string().describe('Naming conventions, code style. Empty string if no update.'),
  commands: z.string().describe('Dev, deploy, make commands. Empty string if no update.'),
  extended_notes: z.string().describe('Gotchas, TODOs, historical context. Empty string if no update.'),
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
    return 'No recent journal entries available.';
  }

  return entries.map(e => `
### ${e.commit_hash.substring(0, 7)} (${e.date})
- **Why:** ${e.why}
- **Changed:** ${e.what_changed}
- **Decisions:** ${e.decisions}
- **Tech:** ${e.technologies}
${e.kronus_wisdom ? `- **Wisdom:** ${e.kronus_wisdom}` : ''}
${e.files_changed ? `- **Files:** ${e.files_changed}` : ''}`).join('\n');
}

function formatExistingSummary(summary: ProjectSummary): string {
  return `
## Existing Entry 0 Sections

**Summary:** ${summary.summary || 'Not set'}
**Purpose:** ${summary.purpose || 'Not set'}
**Architecture:** ${summary.architecture || 'Not set'}
**Key Decisions:** ${summary.key_decisions || 'Not set'}
**Technologies:** ${summary.technologies || 'Not set'}
**Status:** ${summary.status || 'Not set'}

### Living Summary Fields
**File Structure:** ${summary.file_structure || 'Not set'}
**Tech Stack:** ${summary.tech_stack || 'Not set'}
**Frontend:** ${summary.frontend || 'Not set'}
**Backend:** ${summary.backend || 'Not set'}
**Database:** ${summary.database_info || 'Not set'}
**Services:** ${summary.services || 'Not set'}
**Custom Tooling:** ${summary.custom_tooling || 'Not set'}
**Data Flow:** ${summary.data_flow || 'Not set'}
**Patterns:** ${summary.patterns || 'Not set'}
**Commands:** ${summary.commands || 'Not set'}
**Extended Notes:** ${summary.extended_notes || 'Not set'}
`;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { repository, entries_to_analyze = 10 } = await request.json();

  if (!repository) {
    return NextResponse.json({ error: "Repository is required" }, { status: 400 });
  }

  const db = getDatabase();

  // Get existing project summary or create one if it doesn't exist
  let existingSummary = db
    .prepare(`SELECT * FROM project_summaries WHERE repository = ?`)
    .get(repository) as ProjectSummary | undefined;

  if (!existingSummary) {
    // Auto-create a project summary for repositories that only have journal entries
    db.prepare(`
      INSERT INTO project_summaries (repository, summary, updated_at)
      VALUES (?, 'Auto-generated summary - pending analysis.', datetime('now'))
    `).run(repository);

    existingSummary = db
      .prepare(`SELECT * FROM project_summaries WHERE repository = ?`)
      .get(repository) as ProjectSummary;
  }

  // Get recent journal entries
  const entries = db
    .prepare(`
      SELECT commit_hash, date, why, what_changed, decisions, technologies, kronus_wisdom, files_changed
      FROM journal_entries
      WHERE repository = ?
      ORDER BY date DESC
      LIMIT ?
    `)
    .all(repository, Math.min(entries_to_analyze, 20)) as JournalEntry[];

  if (entries.length === 0) {
    return NextResponse.json(
      { error: "No journal entries found to analyze" },
      { status: 400 }
    );
  }

  // Build the AI prompt
  const systemPrompt = `You are Kronus, an empathetic AI analyzing developer work with wisdom and care.

## Task: Analyze Journal Entries to Update Entry 0 (Living Project Summary)

You are updating the Living Project Summary (Entry 0) based on recent journal entries.
This is NOT a journal entry - this is the persistent project knowledge base that evolves over time.

${formatExistingSummary(existingSummary)}

## Recent Journal Entries to Analyze
${formatEntriesForContext(entries)}

## Instructions

1. **Extract structured information** from the journal entries
2. **Preserve existing accurate information** - only update sections with meaningful new info
3. **Merge intelligently** - don't overwrite good existing content with worse new content
4. **Return empty string "" for sections** that have no updates or where existing content is better

### Section Guidelines

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

  // Start observability trace
  startTrace(`entry0-analyze:${repository}`);
  const aiSpanId = startSpan("sonnet-4.5-analyze", {
    type: "generation",
    model: "claude-sonnet-4-5-20250929",
    input: { repository, entries_count: entries.length, prompt_length: systemPrompt.length },
  });

  let updates: SummaryUpdate;
  try {
    // Call Sonnet 4.5 for analysis
    const result = await generateText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      experimental_output: Output.object({
        schema: SummaryUpdateSchema,
      }),
      prompt: systemPrompt,
      temperature: 0.7,
    });

    updates = result.experimental_output as SummaryUpdate;

    // End span with token usage from result
    endSpan(aiSpanId, {
      output: { fields_extracted: Object.keys(updates).filter(k => updates[k as keyof SummaryUpdate]).length },
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    });
  } catch (error) {
    endSpan(aiSpanId, { error: error instanceof Error ? error : String(error) });
    endTrace({ error: error instanceof Error ? error : String(error) });
    throw error;
  }

  // Merge updates with existing summary (only non-empty fields)
  const fieldsToUpdate: string[] = [];
  const values: (string | number | null)[] = [];

  const updateFields: (keyof SummaryUpdate)[] = [
    'summary', 'purpose', 'architecture', 'key_decisions', 'technologies', 'status',
    'file_structure', 'tech_stack', 'frontend', 'backend', 'database_info',
    'services', 'custom_tooling', 'data_flow', 'patterns', 'commands', 'extended_notes'
  ];

  for (const field of updateFields) {
    // Only update if non-empty string (empty string means no update)
    if (updates[field] && updates[field].trim() !== '') {
      fieldsToUpdate.push(`${field} = ?`);
      values.push(updates[field]);
    }
  }

  // Track sync metadata
  fieldsToUpdate.push('last_synced_entry = ?');
  values.push(entries[0].commit_hash);

  fieldsToUpdate.push('entries_synced = ?');
  values.push((existingSummary.entries_synced || 0) + entries.length);

  fieldsToUpdate.push("updated_at = datetime('now')");

  // Update the database
  if (fieldsToUpdate.length > 0) {
    values.push(repository);
    db.prepare(`
      UPDATE project_summaries
      SET ${fieldsToUpdate.join(', ')}
      WHERE repository = ?
    `).run(...values);
  }

  // Get updated summary
  const updatedSummary = db
    .prepare(`SELECT * FROM project_summaries WHERE repository = ?`)
    .get(repository);

  // End observability trace
  endTrace();

  return NextResponse.json({
    success: true,
    message: `Analyzed ${entries.length} entries and updated Entry 0`,
    entries_analyzed: entries.length,
    fields_updated: fieldsToUpdate.filter(f => !f.includes('last_synced') && !f.includes('entries_synced') && !f.includes('updated_at')).length,
    summary: updatedSummary,
  });
});
