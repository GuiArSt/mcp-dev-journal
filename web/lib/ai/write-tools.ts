/**
 * Write Tools Configuration
 *
 * Defines which tools require user confirmation before execution.
 * This creates a Claude Code/Cursor-like experience where changes
 * are staged and require explicit approval.
 */

// Tools that modify data and require confirmation
export const WRITE_TOOLS = new Set([
  // Journal write operations
  "journal_create_entry",
  "journal_edit_entry",
  "journal_regenerate_entry",
  "journal_upsert_project_summary",

  // Repository document operations
  "repository_create_document",
  "repository_update_document",

  // Repository CV operations
  "repository_create_skill",
  "repository_update_skill",
  "repository_create_experience",
  "repository_update_experience",
  "repository_create_education",
  "repository_update_education",

  // Portfolio projects
  "repository_create_portfolio_project",
  "repository_update_portfolio_project",

  // Media write operations
  "save_image",
  "update_media",

  // Linear write operations
  "linear_create_issue",
  "linear_update_issue",
  "linear_create_project",
  "linear_update_project",
]);

// Tools that are read-only (no confirmation needed)
export const READ_TOOLS = new Set([
  // Journal read operations
  "journal_get_entry",
  "journal_list_by_repository",
  "journal_list_by_branch",
  "journal_list_repositories",
  "journal_list_branches",
  "journal_get_project_summary",
  "journal_list_project_summaries",
  "journal_list_attachments",
  "journal_backup", // This is actually a backup, but we'll treat as safe

  // Repository read operations
  "repository_list_documents",
  "repository_get_document",
  "repository_list_skills",
  "repository_list_experience",
  "repository_list_education",
  "repository_list_portfolio_projects",
  "repository_get_portfolio_project",

  // Media read operations
  "list_media",
  "get_media",

  // Linear read operations
  "linear_get_viewer",
  "linear_list_issues",
  "linear_list_projects",

  // Web search (read-only by nature)
  "perplexity_search",
  "perplexity_ask",
  "perplexity_research",
  "perplexity_reason",

  // Image generation (creates externally, doesn't modify our DB)
  "replicate_generate_image",
]);

/**
 * Check if a tool requires confirmation
 */
export function requiresConfirmation(toolName: string): boolean {
  return WRITE_TOOLS.has(toolName);
}

/**
 * Get a human-readable description of what the tool will do
 */
export function getToolActionDescription(toolName: string, args: Record<string, any>): string {
  switch (toolName) {
    // Journal
    case "journal_create_entry":
      return `Create journal entry for commit ${args.commit_hash?.substring(0, 7)} in ${args.repository}`;
    case "journal_edit_entry":
      return `Edit journal entry ${args.commit_hash?.substring(0, 7)}`;
    case "journal_regenerate_entry":
      return `Regenerate journal entry ${args.commit_hash?.substring(0, 7)} with AI`;
    case "journal_upsert_project_summary":
      return `Update project summary for ${args.repository}`;

    // Documents
    case "repository_create_document":
      return `Create new ${args.type || "document"}: "${args.title}"`;
    case "repository_update_document":
      return `Update document #${args.id}${args.title ? `: "${args.title}"` : ""}`;

    // Skills
    case "repository_create_skill":
      return `Add new skill: ${args.name} (${args.category})`;
    case "repository_update_skill":
      return `Update skill: ${args.id}`;

    // Experience
    case "repository_create_experience":
      return `Add work experience: ${args.title} at ${args.company}`;
    case "repository_update_experience":
      return `Update experience: ${args.id}`;

    // Education
    case "repository_create_education":
      return `Add education: ${args.degree} at ${args.institution}`;
    case "repository_update_education":
      return `Update education: ${args.id}`;

    // Portfolio
    case "repository_create_portfolio_project":
      return `Create portfolio project: "${args.title}"`;
    case "repository_update_portfolio_project":
      return `Update portfolio project #${args.id}`;

    // Media
    case "save_image":
      return `Save image: ${args.filename}`;
    case "update_media":
      return `Update media #${args.id}`;

    // Linear
    case "linear_create_issue":
      return `Create Linear issue: "${args.title}"`;
    case "linear_update_issue":
      return `Update Linear issue ${args.issueId}`;
    case "linear_create_project":
      return `Create Linear project: "${args.name}"`;
    case "linear_update_project":
      return `Update Linear project ${args.projectId}`;

    default:
      return `Execute ${toolName}`;
  }
}

/**
 * Format tool arguments for display in confirmation UI
 */
export function formatToolArgsForDisplay(toolName: string, args: Record<string, any>): Record<string, string> {
  const display: Record<string, string> = {};

  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;

    // Format arrays
    if (Array.isArray(value)) {
      display[key] = value.length > 3
        ? `[${value.slice(0, 3).join(", ")}...+${value.length - 3}]`
        : `[${value.join(", ")}]`;
      continue;
    }

    // Format long strings
    if (typeof value === "string") {
      if (value.length > 200) {
        display[key] = value.substring(0, 200) + "...";
      } else {
        display[key] = value;
      }
      continue;
    }

    // Format objects
    if (typeof value === "object") {
      display[key] = JSON.stringify(value).substring(0, 100);
      continue;
    }

    // Default
    display[key] = String(value);
  }

  return display;
}

/**
 * Pending action that requires confirmation
 */
export interface PendingToolAction {
  id: string;
  toolName: string;
  args: Record<string, any>;
  description: string;
  formattedArgs: Record<string, string>;
  timestamp: number;
}

/**
 * Create a pending action from a tool call
 */
export function createPendingAction(toolName: string, args: Record<string, any>): PendingToolAction {
  return {
    id: `${toolName}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    toolName,
    args,
    description: getToolActionDescription(toolName, args),
    formattedArgs: formatToolArgsForDisplay(toolName, args),
    timestamp: Date.now(),
  };
}

/**
 * Fields that typically contain long-form content suitable for diff view
 */
const DIFFABLE_FIELDS = new Set([
  "content",
  "description",
  "body",
  "summary",
  "notes",
  "raw_agent_report",
  "context",
  "text",
  "markdown",
]);

/**
 * Extract diffable content from tool args for display
 * Returns the main content field that would benefit from diff visualization
 */
export function getDiffableContent(toolName: string, args: Record<string, any>): string | null {
  // For documents, the content/body is the main diffable field
  if (toolName.includes("document")) {
    return args.content || args.body || null;
  }

  // For journal entries
  if (toolName.includes("journal")) {
    return args.raw_agent_report || args.summary || args.description || null;
  }

  // For portfolio projects
  if (toolName.includes("portfolio")) {
    return args.description || null;
  }

  // For experience/education
  if (toolName.includes("experience") || toolName.includes("education")) {
    return args.description || null;
  }

  // For Linear issues
  if (toolName.includes("linear")) {
    return args.description || args.body || null;
  }

  // Generic fallback: look for common content fields
  for (const field of DIFFABLE_FIELDS) {
    if (args[field] && typeof args[field] === "string" && args[field].length > 50) {
      return args[field];
    }
  }

  return null;
}

/**
 * Format tool args as a pseudo-code/JSON-like structure for diff view
 * This creates a structured view that's easier to read than raw JSON
 */
export function formatArgsForDiffView(toolName: string, args: Record<string, any>): string {
  const lines: string[] = [];
  const indent = "  ";

  // Add operation type header
  const isCreate = toolName.includes("create");
  const isUpdate = toolName.includes("update") || toolName.includes("edit");
  lines.push(`// ${isCreate ? "CREATE" : isUpdate ? "UPDATE" : "EXECUTE"}: ${toolName}`);
  lines.push("");

  // Format each argument
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else if (typeof value[0] === "object") {
        lines.push(`${key}: [`);
        value.forEach((item, i) => {
          lines.push(`${indent}${JSON.stringify(item)}${i < value.length - 1 ? "," : ""}`);
        });
        lines.push(`]`);
      } else {
        lines.push(`${key}: [${value.map(v => JSON.stringify(v)).join(", ")}]`);
      }
    } else if (typeof value === "object") {
      lines.push(`${key}: ${JSON.stringify(value, null, 2).split("\n").join("\n" + indent)}`);
    } else if (typeof value === "string" && value.length > 100) {
      // Long strings - show with line breaks preserved
      lines.push(`${key}: """`);
      lines.push(value);
      lines.push(`"""`);
    } else if (typeof value === "string") {
      lines.push(`${key}: "${value}"`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  return lines.join("\n");
}
