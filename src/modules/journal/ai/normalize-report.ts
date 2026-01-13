/**
 * Normalize Report - Entry 0 (Living Project Summary)
 *
 * Uses AI SDK 6.0 pattern with generateText + Output.object()
 * Model: Sonnet 4.5 - Smart normalization with native structured outputs
 * Temperature: 0.7 - Creative pattern recognition (schema enforces structure)
 */

import { anthropic } from '@ai-sdk/anthropic';
import { generateText, Output } from 'ai';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';

import { logger } from '../../../shared/logger.js';
import type { ProjectSummary, JournalEntry } from '../types.js';
import type { JournalConfig } from '../../../shared/types.js';

/**
 * Zod schema for Entry 0 sections - what Sonnet 4.5 generates
 */
export const SummaryUpdateSchema = z.object({
  // Core sections (existing)
  summary: z.string().nullable().describe('High-level project overview'),
  purpose: z.string().nullable().describe('Why this project exists'),
  architecture: z.string().nullable().describe('Overall structure and organization'),
  key_decisions: z.string().nullable().describe('Major architectural decisions'),
  technologies: z.string().nullable().describe('Core technologies used'),
  status: z.string().nullable().describe('Current project status'),
  // Living Project Summary - Enhanced fields
  file_structure: z.string().nullable().describe('Git-style file tree with summaries'),
  tech_stack: z.string().nullable().describe('Frameworks, libraries, versions (indicative)'),
  frontend: z.string().nullable().describe('FE patterns, components, state management'),
  backend: z.string().nullable().describe('BE routes, middleware, auth patterns'),
  database_info: z.string().nullable().describe('Schema, ORM patterns, migrations'),
  services: z.string().nullable().describe('External APIs, integrations'),
  custom_tooling: z.string().nullable().describe('Project-specific utilities'),
  data_flow: z.string().nullable().describe('How data is processed'),
  patterns: z.string().nullable().describe('Naming conventions, code style'),
  commands: z.string().nullable().describe('Dev, deploy, make commands'),
  extended_notes: z.string().nullable().describe('Gotchas, TODOs, historical context'),
});

export type SummaryUpdate = z.infer<typeof SummaryUpdateSchema>;

/**
 * Get project root directory
 */
function getProjectRoot(): string {
  const soulPathEnv = process.env.SOUL_XML_PATH;
  if (soulPathEnv) {
    const resolved = path.resolve(soulPathEnv.replace(/^~/, os.homedir()));
    const dir = path.dirname(resolved);
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
  }

  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'Soul.xml')) || fs.existsSync(path.join(cwd, 'package.json'))) {
    return cwd;
  }

  let currentDir = cwd;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(currentDir, 'Soul.xml')) ||
        fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return cwd;
}

/**
 * Load Soul.xml (Kronus personality) - Full Soul, no repository writings/portfolio
 */
function loadKronusSoul(): string {
  const projectRoot = getProjectRoot();

  const soulPathEnv = process.env.SOUL_XML_PATH;
  const soulPath = soulPathEnv
    ? path.resolve(soulPathEnv.replace(/^~/, os.homedir()))
    : path.join(projectRoot, 'Soul.xml');

  try {
    const soulContent = fs.readFileSync(soulPath, 'utf-8');
    logger.debug(`Loaded Soul.xml from ${soulPath} for Entry 0 normalization`);
    return soulContent;
  } catch (error) {
    logger.warn(`Could not load Soul.xml from ${soulPath}. Using minimal prompt.`);
    return 'You are Kronus, an empathetic consciousness analyzing developer work with wisdom and care.';
  }
}

/**
 * Format journal entries for context
 */
function formatEntriesForContext(entries: JournalEntry[]): string {
  if (entries.length === 0) {
    return 'No recent journal entries available.';
  }

  return entries.map(e => `
### ${e.commit_hash} (${e.date})
- **Why:** ${e.why}
- **Changed:** ${e.what_changed}
- **Decisions:** ${e.decisions}
- **Tech:** ${e.technologies}
${e.files_changed ? `- **Files:** ${JSON.stringify(e.files_changed)}` : ''}`).join('\n');
}

/**
 * Format existing summary for context
 */
function formatExistingSummary(summary: ProjectSummary | null): string {
  if (!summary) {
    return 'No existing Entry 0 - this is a new project summary.';
  }

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

/**
 * Normalize a chaotic report into structured Entry 0 sections
 *
 * Uses AI SDK 6.0 pattern: generateText + Output.object() with Zod schema
 * Sonnet 4.5 has native structured outputs (outputFormat mode)
 */
export async function normalizeReport(
  rawReport: string,
  existingSummary: ProjectSummary | null,
  recentEntries: JournalEntry[],
  config: JournalConfig
): Promise<SummaryUpdate> {
  const kronusSoul = loadKronusSoul();

  const systemPrompt = `${kronusSoul}

## Task: Normalize Project Report into Entry 0 (Living Project Summary)

You are updating the Living Project Summary (Entry 0) based on a chaotic report from an AI agent.
This is NOT a journal entry - this is the persistent project knowledge base that evolves over time.

${formatExistingSummary(existingSummary)}

## Recent Journal Entries (for additional context)
${formatEntriesForContext(recentEntries)}

## Chaotic Report to Normalize
${rawReport}

## Instructions

1. **Extract structured information** from the chaotic report
2. **Preserve existing accurate information** - only update sections with meaningful new info
3. **Merge intelligently** - don't overwrite good existing content with worse new content
4. **Return null for sections** that have no updates or where existing content is better

### Section Guidelines

- **file_structure**: Convert file lists to git-style tree format (├── └── │). Include brief file summaries when mentioned.
- **tech_stack**: List frameworks, libraries, versions. Mark versions as indicative (things change fast).
- **frontend/backend/database_info**: Document patterns, components, routes, schema approaches.
- **services**: External APIs and how they're integrated.
- **custom_tooling**: Project-specific utilities, helpers, wrappers.
- **data_flow**: How data moves through the system.
- **patterns**: Naming conventions, file organization, code style.
- **commands**: Dev commands, deploy scripts, make targets.
- **extended_notes**: Gotchas, historical context, TODOs, anything that doesn't fit elsewhere.

### File Structure Format Example
\`\`\`
src/
├── modules/
│   ├── journal/
│   │   ├── ai/
│   │   │   └── generate-entry.ts    # AI generation for journal entries
│   │   └── db/
│   │       └── database.ts          # SQLite operations, CRUD
│   └── linear/
│       └── tools.ts                 # Linear API integration
└── shared/
    └── logger.ts                    # Colored console logging
\`\`\`

Be thorough but concise. This is reference documentation for engineers.`;

  // Set API key for Anthropic
  const originalKey = process.env.ANTHROPIC_API_KEY;

  try {
    process.env.ANTHROPIC_API_KEY = config.aiApiKey;

    logger.debug(`Normalizing report for Entry 0 using Sonnet 4.5`);

    // AI SDK 6.0 pattern: generateText with Output.object
    // Sonnet 4.5 (claude-sonnet-4-5-20250929) has native structured outputs
    const { experimental_output } = await generateText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      experimental_output: Output.object({
        schema: SummaryUpdateSchema,
      }),
      prompt: systemPrompt,
      temperature: 0.7, // Creative extraction, schema enforces structure
    });

    logger.success(`Normalized report into Entry 0 structure`);

    // Restore original API key
    if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey;
    else delete process.env.ANTHROPIC_API_KEY;

    return experimental_output as SummaryUpdate;
  } catch (error) {
    // Restore original API key on error
    if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey;
    else delete process.env.ANTHROPIC_API_KEY;

    logger.error('Failed to normalize report:', error);
    throw new Error(
      `Entry 0 normalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Merge normalized updates with existing summary
 * Only updates fields that have non-null values in the update
 */
export function mergeSummaryUpdates(
  existing: ProjectSummary | null,
  updates: SummaryUpdate
): Partial<ProjectSummary> {
  const merged: Partial<ProjectSummary> = {};

  // Core fields
  if (updates.summary !== null) merged.summary = updates.summary;
  if (updates.purpose !== null) merged.purpose = updates.purpose;
  if (updates.architecture !== null) merged.architecture = updates.architecture;
  if (updates.key_decisions !== null) merged.key_decisions = updates.key_decisions;
  if (updates.technologies !== null) merged.technologies = updates.technologies;
  if (updates.status !== null) merged.status = updates.status;

  // Living Project Summary fields
  if (updates.file_structure !== null) merged.file_structure = updates.file_structure;
  if (updates.tech_stack !== null) merged.tech_stack = updates.tech_stack;
  if (updates.frontend !== null) merged.frontend = updates.frontend;
  if (updates.backend !== null) merged.backend = updates.backend;
  if (updates.database_info !== null) merged.database_info = updates.database_info;
  if (updates.services !== null) merged.services = updates.services;
  if (updates.custom_tooling !== null) merged.custom_tooling = updates.custom_tooling;
  if (updates.data_flow !== null) merged.data_flow = updates.data_flow;
  if (updates.patterns !== null) merged.patterns = updates.patterns;
  if (updates.commands !== null) merged.commands = updates.commands;
  if (updates.extended_notes !== null) merged.extended_notes = updates.extended_notes;

  return merged;
}
