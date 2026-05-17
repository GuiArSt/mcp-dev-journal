/**
 * Shared prompt appendix for journal entry generation (MCP + web Kronus).
 * Keeps Repository overview + branch journal thread in sync for the model.
 */

export const JOURNAL_CREATE_CONTEXT_MAX_BRANCH_ENTRIES = 150;

export type BranchEntryForContext = {
  commit_hash: string;
  date: string;
  why: string;
  what_changed: string;
  decisions: string;
  technologies: string;
  kronus_wisdom: string | null;
};

export type OverviewForContext = {
  repository: string;
  summary: string | null;
  purpose: string | null;
  architecture: string | null;
  key_decisions: string | null;
  technologies: string | null;
  status: string | null;
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
};

function clip(s: string | null | undefined, max: number): string {
  if (s == null || s === "") return "";
  const t = String(s).trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Markdown block for Entry 0 / Repository overview (may be empty). */
export function formatRepositoryOverviewForPrompt(
  overview: OverviewForContext | null,
): string {
  if (!overview) {
    return "_No Repository overview (Entry 0) row yet for this repository. Rely on branch entries and the agent report._\n";
  }

  const lines: string[] = [
    `**Repository:** ${overview.repository}`,
    "",
    `**Summary:** ${clip(overview.summary, 4000) || "(empty)"}`,
    `**Purpose:** ${clip(overview.purpose, 3000) || "(empty)"}`,
    `**Architecture:** ${clip(overview.architecture, 3000) || "(empty)"}`,
    `**Key decisions:** ${clip(overview.key_decisions, 3000) || "(empty)"}`,
    `**Technologies:** ${clip(overview.technologies, 2000) || "(empty)"}`,
    `**Status:** ${clip(overview.status, 800) || "(empty)"}`,
  ];

  const extras: [string, string | null | undefined][] = [
    ["File structure", overview.file_structure],
    ["Tech stack", overview.tech_stack],
    ["Frontend", overview.frontend],
    ["Backend", overview.backend],
    ["Database", overview.database_info],
    ["Services", overview.services],
    ["Custom tooling", overview.custom_tooling],
    ["Data flow", overview.data_flow],
    ["Patterns", overview.patterns],
    ["Commands", overview.commands],
    ["Extended notes", overview.extended_notes],
  ];

  for (const [label, val] of extras) {
    const c = clip(val, 2000);
    if (c) lines.push("", `**${label}:**`, c);
  }

  return lines.join("\n");
}

/** One entry line for branch thread (chronological list). */
function formatOneBranchEntry(e: BranchEntryForContext, limits: { why: number; what: number; dec: number }) {
  const hash = e.commit_hash.length >= 7 ? e.commit_hash.substring(0, 7) : e.commit_hash;
  return [
    `### ${hash} (${e.date})`,
    `- **Why:** ${clip(e.why, limits.why)}`,
    `- **What changed:** ${clip(e.what_changed, limits.what)}`,
    `- **Decisions:** ${clip(e.decisions, limits.dec)}`,
    `- **Tech:** ${clip(e.technologies, 600)}`,
    e.kronus_wisdom ? `- **Wisdom:** ${clip(e.kronus_wisdom, 400)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Markdown list of journal entries on the branch (newest last if caller passes ASC order).
 */
export function formatBranchJournalEntriesForPrompt(
  entries: BranchEntryForContext[],
  totalOnBranch: number,
): string {
  if (entries.length === 0) {
    return "_No prior journal entries on this branch yet — this may be the first documented commit here._\n";
  }

  const limits =
    entries.length > 40
      ? { why: 500, what: 700, dec: 400 }
      : { why: 1200, what: 1800, dec: 900 };

  const body = entries.map((e) => formatOneBranchEntry(e, limits)).join("\n\n");
  const truncated = totalOnBranch > entries.length;
  const note = truncated
    ? `\n\n_Showing the **most recent** ${entries.length} of ${totalOnBranch} journal rows on this branch (token cap). Focus on the agent report for this commit._\n`
    : "";

  return `${body}${note}`;
}

/** Full appendix to inject after commit metadata and before the agent report. */
export function buildJournalCreateContextAppendix(
  repository: string,
  branch: string,
  overviewBlock: string,
  branchEntriesBlock: string,
): string {
  return `

## Repository overview (Entry 0)

Canonical memory for **${repository}** (one row per repository, not per branch). Align terminology and facts with it when appropriate.

${overviewBlock}

## Prior journal entries on branch **${branch}**

Chronological thread on this branch (excluding the commit you are writing for, if it already exists). Use for consistency — **do not** copy-paste; synthesize this commit in light of the thread.

${branchEntriesBlock}
`;
}
