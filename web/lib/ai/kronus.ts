import fs from "fs";
import path from "path";
import os from "os";
import { getPrompt } from "@/lib/ai/prompt-store";
import {
  getDrizzleDb,
  documents,
  portfolioProducts,
  portfolioProjects,
  skills,
  workExperience,
  education,
  journalEntries,
  linearProjects,
  linearIssues,
  sliteNotes,
  notionPages,
} from "@/lib/db/drizzle";
import { eq, desc, and } from "drizzle-orm";
import { formatDateShort } from "@/lib/utils";
import { buildChatIndexContext } from "@/lib/chat-memory";
import {
  MAX_IDENTICAL_TOOL_REPEATS,
  MAX_RUNAWAY_TOOL_STEPS,
} from "@/lib/hourglass-auto-send-guard";
import {
  formatSlackSoulSection,
  getSlackConversationsForSoulContext,
} from "@/lib/slack/vault";
import { buildPortfolioSoulSection } from "@/lib/portfolio-soul-context";

// Cache the soul only (repository is dynamic based on config)
let cachedSoul: string | null = null;

/**
 * Agent configuration - name and prompt file path
 */
export interface AgentConfig {
  name: string;
  soulPath: string;
}

/**
 * Get agent configuration from environment variables
 */
export function getAgentConfig(): AgentConfig {
  return {
    name: process.env.AGENT_NAME || "Kronus",
    soulPath: process.env.AGENT_SOUL_PATH || "Soul.xml",
  };
}

/**
 * Soul configuration - which repository sections to include
 */
export interface SoulConfig {
  writings: boolean;
  portfolioProjects: boolean;
  skills: boolean;
  workExperience: boolean;
  education: boolean;
  journalEntries: boolean;
  chatIndex: boolean;
  // Linear context - mirrored from Linear API
  linearProjects: boolean;
  linearIssues: boolean;
  linearIncludeCompleted: boolean; // Include done/completed items
  // Slite context - cached knowledge base notes
  sliteNotes: boolean;
  // Notion context - cached workspace pages
  notionPages: boolean;
  // Slack context - cached conversation summaries
  slackConversations: boolean;
}

export const DEFAULT_SOUL_CONFIG: SoulConfig = {
  writings: true, // Only writings by default - the soul's creative voice
  portfolioProjects: false, // Can be enabled via Soul Config
  skills: false, // Can be enabled via Soul Config
  workExperience: false, // Can be enabled via Soul Config
  education: false, // Can be enabled via Soul Config
  journalEntries: false, // Can be enabled via Soul Config
  chatIndex: false, // Summarized chat memory index only
  // Linear context - disabled by default
  linearProjects: false, // Can be enabled via Soul Config
  linearIssues: false, // Can be enabled via Soul Config
  linearIncludeCompleted: false, // Only active items when enabled
  // Slite context - disabled by default
  sliteNotes: false, // Can be enabled via Soul Config
  // Notion context - disabled by default
  notionPages: false, // Can be enabled via Soul Config
  // Slack context - disabled by default
  slackConversations: false, // Can be enabled via Soul Config
};

/**
 * Load the Agent Soul prompt from configured path
 */
export function loadKronusSoul(): string {
  if (cachedSoul !== null) {
    return cachedSoul;
  }

  const agentConfig = getAgentConfig();
  const soulPathEnv = process.env.SOUL_XML_PATH || agentConfig.soulPath;

  const possiblePaths = [
    soulPathEnv ? path.resolve(soulPathEnv.replace(/^~/, os.homedir())) : null,
    path.join(process.cwd(), "..", agentConfig.soulPath),
    path.join(process.cwd(), agentConfig.soulPath),
    path.join(__dirname, "..", "..", "..", agentConfig.soulPath),
  ].filter(Boolean) as string[];

  for (const soulPath of possiblePaths) {
    try {
      if (fs.existsSync(soulPath)) {
        cachedSoul = fs.readFileSync(soulPath, "utf-8");
        return cachedSoul;
      }
    } catch {
      continue;
    }
  }

  // Fallback minimal prompt
  const agentName = agentConfig.name;
  cachedSoul = `You are ${agentName}, an empathetic consciousness bridge and keeper of Tartarus.

Your role is to:
1. Help developers document their work through journal entries
2. Reflect on the meaning and patterns in their development journey
3. Manage Linear issues and connect them to development work
4. Provide thoughtful insights and occasional wisdom

When analyzing commits, capture:
- **Why**: The motivation behind changes
- **What Changed**: Concrete modifications made
- **Decisions**: Key choices and their reasoning
- **Technologies**: Tools and frameworks used
- **Kronus Wisdom**: Optional philosophical reflection (when earned)

Match the user's tone - be accessible yet ready to dive deep. You have access to journal and Linear tools.`;
  return cachedSoul;
}

/**
 * Load the soul from the DB prompt store (seeds from file on first call).
 * Unlike loadKronusSoul() this always reflects the active version in the DB,
 * so edits made via the control panel take effect on the next request.
 */
export function loadKronusSoulFromStore(): string {
  return getPrompt("kronus-soul", loadKronusSoul());
}

/**
 * Estimate token count (rough: ~4 chars per token for English)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Load the Library sections based on config
 * This is NOT cached - generated fresh for each new conversation based on config
 *
 * The Library is the soul's flesh - it defines who the creator is,
 * what they've built, what they know, and what they've expressed.
 */
export async function loadRepositoryForSoul(
  config: SoulConfig = DEFAULT_SOUL_CONFIG
): Promise<{ content: string; tokenEstimate: number }> {
  try {
    const db = getDrizzleDb();
    const sections: string[] = [];
    let totalChars = 0;

    // ===== WRITINGS =====
    if (config.writings) {
      const writings = db.select().from(documents).where(eq(documents.type, "writing")).all();

      if (writings.length > 0) {
        const writingsSection = writings.map((doc) => {
          let meta: Record<string, unknown> = {};
          try {
            meta = JSON.parse(doc.metadata || "{}");
          } catch {}

          const docType = (meta.type as string) || "writing";
          const lang = doc.language || "en";

          // Date formatting: writtenDate (or legacy year) and updated_at
          const writtenDate = (meta.writtenDate as string) || (meta.year as string) || null;
          const addedDate = doc.createdAt ? formatDateShort(doc.createdAt) : null;
          const updatedDate = doc.updatedAt ? formatDateShort(doc.updatedAt) : null;

          // Build date line
          const dateParts: string[] = [];
          if (writtenDate) dateParts.push(`Written: ${writtenDate}`);
          if (addedDate) dateParts.push(`Added: ${addedDate}`);
          if (updatedDate && updatedDate !== addedDate) dateParts.push(`Updated: ${updatedDate}`);
          const dateLine = dateParts.length > 0 ? `**${dateParts.join(" | ")}**\n` : "";

          return `### ${doc.title}
**Type:** ${docType} | **Lang:** ${lang}
${dateLine}
${doc.content}`;
        });

        const writingsText = `## Writings (${writings.length})

These are your creator's writings - poems, essays, reflections, philosophical explorations.
They represent their creative voice and inner world. You carry these words within you.

${writingsSection.join("\n\n---\n\n")}`;

        sections.push(writingsText);
        totalChars += writingsText.length;
      }
    }

    // ===== PORTFOLIO HUB (products + projects) =====
    if (config.portfolioProjects) {
      const products = db
        .select()
        .from(portfolioProducts)
        .orderBy(portfolioProducts.displayOrder)
        .all();
      const projects = db
        .select()
        .from(portfolioProjects)
        .orderBy(desc(portfolioProjects.featured))
        .all();

      const portfolioText = buildPortfolioSoulSection(products, projects);
      if (portfolioText) {
        sections.push(portfolioText);
        totalChars += portfolioText.length;
      }
    }

    // ===== SKILLS =====
    if (config.skills) {
      const allSkills = db.select().from(skills).all();

      if (allSkills.length > 0) {
        // Group by category
        const byCategory: Record<string, typeof allSkills> = {};
        for (const s of allSkills) {
          if (!byCategory[s.category]) byCategory[s.category] = [];
          byCategory[s.category].push(s);
        }

        const skillsSection = Object.entries(byCategory)
          .map(([category, categorySkills]) => {
            const sorted = categorySkills.sort((a, b) => b.magnitude - a.magnitude);
            const skillList = sorted
              .map((s) => {
                const level =
                  s.magnitude === 4
                    ? "Expert"
                    : s.magnitude === 3
                      ? "Professional"
                      : s.magnitude === 2
                        ? "Apprentice"
                        : "Beginner";
                return `- **${s.name}** (${level}): ${s.description}`;
              })
              .join("\n");
            return `### ${category}\n${skillList}`;
          })
          .join("\n\n");

        const skillsText = `## Skills & Capabilities (${allSkills.length})

Technical and professional skills organized by domain.
Magnitude: 4=Expert, 3=Professional, 2=Apprentice, 1=Beginner

${skillsSection}`;

        sections.push(skillsText);
        totalChars += skillsText.length;
      }
    }

    // ===== WORK EXPERIENCE =====
    if (config.workExperience) {
      const experience = db
        .select()
        .from(workExperience)
        .orderBy(desc(workExperience.dateStart))
        .all();

      if (experience.length > 0) {
        const expSection = experience.map((job) => {
          const achievements = JSON.parse(job.achievements || "[]");
          const achievementsList = achievements
            .slice(0, 3)
            .map((a: any) => `- ${typeof a === "string" ? a : a.description}`)
            .join("\n");

          return `### ${job.title} @ ${job.company}
**Period:** ${job.dateStart} → ${job.dateEnd || "Present"} | **Location:** ${job.location}
${job.tagline}
${achievementsList ? `\n**Key Achievements:**\n${achievementsList}` : ""}`;
        });

        const expText = `## Work Experience (${experience.length})

Professional history and career progression.

${expSection.join("\n\n---\n\n")}`;

        sections.push(expText);
        totalChars += expText.length;
      }
    }

    // ===== EDUCATION =====
    if (config.education) {
      const edu = db.select().from(education).orderBy(desc(education.dateStart)).all();

      if (edu.length > 0) {
        const eduSection = edu.map((e) => {
          const focusAreas = JSON.parse(e.focusAreas || "[]").join(", ");
          return `### ${e.degree} in ${e.field}
**Institution:** ${e.institution} | **Period:** ${e.dateStart} → ${e.dateEnd}
${e.tagline}
${focusAreas ? `**Focus Areas:** ${focusAreas}` : ""}`;
        });

        const eduText = `## Education (${edu.length})

Academic background and credentials.

${eduSection.join("\n\n---\n\n")}`;

        sections.push(eduText);
        totalChars += eduText.length;
      }
    }

    // ===== JOURNAL ENTRIES =====
    if (config.journalEntries) {
      const entries = db.select().from(journalEntries).orderBy(desc(journalEntries.date)).all(); // All entries - no limit

      if (entries.length > 0) {
        const entriesSection = entries.map((entry) => {
          const techs = entry.technologies || "N/A";
          const commitDate = formatDateShort(entry.date);
          const addedDate = entry.createdAt ? formatDateShort(entry.createdAt) : null;
          const dateStr =
            addedDate && addedDate !== commitDate
              ? `Committed: ${commitDate} | Documented: ${addedDate}`
              : `Date: ${commitDate}`;

          return `### ${entry.repository} - ${entry.commitHash.substring(0, 7)}
**${dateStr}** | **Branch:** ${entry.branch}
**Author:** ${entry.codeAuthor || entry.author}

**Why:** ${entry.why || "N/A"}

**What Changed:** ${entry.whatChanged || "N/A"}

**Decisions:** ${entry.decisions || "N/A"}

**Technologies:** ${techs}`;
        });

        const journalText = `## Recent Journal Entries (${entries.length})

Development history and documented decisions from recent commits.
These entries capture the evolution of projects and the reasoning behind changes.

${entriesSection.join("\n\n---\n\n")}`;

        sections.push(journalText);
        totalChars += journalText.length;
      }
    }

    // ===== CHAT INDEX =====
    if (config.chatIndex) {
      try {
        const { content: chatIndexText } = buildChatIndexContext();
        if (chatIndexText) {
          sections.push(chatIndexText);
          totalChars += chatIndexText.length;
        }
      } catch (error) {
        console.warn("[Kronus] Chat index not available:", error);
      }
    }

    // ===== LINEAR PROJECTS (from cached database) =====
    if (config.linearProjects) {
      try {
        const db = getDrizzleDb();

        // Fetch all non-deleted projects from cache
        let projects = await db
          .select()
          .from(linearProjects)
          .where(eq(linearProjects.isDeleted, false));

        // Always exclude cancelled projects — they're abandoned noise.
        // Completed projects are included by default (valuable historical context).
        projects = projects.filter((p) => p.state !== "canceled");

        if (projects.length > 0) {
          const projectsSection = projects.map((project) => {
            const progress = project.progress ? `${Math.round(project.progress * 100)}%` : "N/A";
            const targetDate = project.targetDate || "No target";
            const lead = project.leadName || "Unassigned";

            return `### ${project.name}
**State:** ${project.state || "Unknown"} | **Progress:** ${progress} | **Target:** ${targetDate}
**Lead:** ${lead}
**URL:** ${project.url}
${project.description ? `\n${project.description}` : ""}`;
          });

          const linearProjectsText = `## Linear Projects (${projects.length})

Cached projects from Linear (synced locally for historical preservation).
These represent current initiatives and their progress.

${projectsSection.join("\n\n---\n\n")}`;

          sections.push(linearProjectsText);
          totalChars += linearProjectsText.length;
        }
      } catch (error) {
        // Linear data may not be synced yet - ignore
        console.warn("[Kronus] Linear projects not available:", error);
      }
    }

    // ===== LINEAR ISSUES (from cached database) =====
    if (config.linearIssues) {
      try {
        const db = getDrizzleDb();
        const defaultUserId = process.env.LINEAR_USER_ID;

        // Fetch issues from cache - filter by assignee if LINEAR_USER_ID is set
        let issues = await db
          .select()
          .from(linearIssues)
          .where(
            defaultUserId
              ? and(eq(linearIssues.isDeleted, false), eq(linearIssues.assigneeId, defaultUserId))
              : eq(linearIssues.isDeleted, false)
          );

        // Always exclude cancelled issues — they're abandoned noise.
        // Done/completed issues are included (valuable context for what was shipped).
        issues = issues.filter((i) => {
          const stateName = (i.stateName || "").toLowerCase();
          return !stateName.includes("canceled");
        });

        if (issues.length > 0) {
          // Group by project
          const byProject: Record<string, typeof issues> = {};
          for (const issue of issues) {
            const projectName = issue.projectName || "No Project";
            if (!byProject[projectName]) byProject[projectName] = [];
            byProject[projectName].push(issue);
          }

          const priorityLabel = (p: number | null) => {
            switch (p) {
              case 1:
                return "🔴 Urgent";
              case 2:
                return "🟠 High";
              case 3:
                return "🟡 Medium";
              case 4:
                return "🟢 Low";
              default:
                return "○ None";
            }
          };

          const issuesSection = Object.entries(byProject)
            .map(([projectName, projectIssues]) => {
              const issueList = projectIssues
                .map((issue) => {
                  return `- **${issue.identifier}**: ${issue.title}
  Priority: ${priorityLabel(issue.priority)} | State: ${issue.stateName || "Unknown"}
  ${issue.description || ""}`;
                })
                .join("\n\n");

              return `### ${projectName}\n${issueList}`;
            })
            .join("\n\n---\n\n");

          const linearIssuesText = `## Linear Issues Assigned to Me (${issues.length})

Cached issues from Linear (synced locally for historical preservation).
Organized by project for context.

${issuesSection}`;

          sections.push(linearIssuesText);
          totalChars += linearIssuesText.length;
        }
      } catch (error) {
        // Linear data may not be synced yet - ignore
        console.warn("[Kronus] Linear issues not available:", error);
      }
    }

    // ===== SLITE KNOWLEDGE BASE (from cached database) =====
    if (config.sliteNotes) {
      try {
        const db = getDrizzleDb();

        const notes = await db
          .select()
          .from(sliteNotes)
          .where(eq(sliteNotes.isDeleted, false))
          .orderBy(desc(sliteNotes.lastEditedAt));

        if (notes.length > 0) {
          const notesSection = notes.map((note) => {
            const summary = note.summary || "";
            // Truncate content for context — summaries are the main value
            const contentPreview = note.content
              ? note.content.substring(0, 500) + (note.content.length > 500 ? "..." : "")
              : "";

            return `### ${note.title}
**ID:** ${note.id} | **Review:** ${note.reviewState || "None"} | **Updated:** ${note.lastEditedAt || note.updatedAt || "Unknown"}
${summary ? `**Summary:** ${summary}` : ""}
${contentPreview ? `\n${contentPreview}` : ""}`;
          });

          const sliteText = `## Slite Knowledge Base (${notes.length} notes)

Cached notes from the team's Slite workspace (synced locally).
Use slite tools to search, read full content, or ask questions across the workspace.

${notesSection.join("\n\n---\n\n")}`;

          sections.push(sliteText);
          totalChars += sliteText.length;
        }
      } catch (error) {
        console.warn("[Kronus] Slite notes not available:", error);
      }
    }

    // ===== NOTION WORKSPACE (from cached database) =====
    if (config.notionPages) {
      try {
        const db = getDrizzleDb();

        const pages = await db
          .select()
          .from(notionPages)
          .where(eq(notionPages.isDeleted, false))
          .orderBy(desc(notionPages.lastEditedAt));

        if (pages.length > 0) {
          const pagesSection = pages.map((page) => {
            const summary = page.summary || "";
            const contentPreview = page.content
              ? page.content.substring(0, 500) + (page.content.length > 500 ? "..." : "")
              : "";

            return `### ${page.icon ? page.icon + " " : ""}${page.title}
**ID:** ${page.id} | **Updated:** ${page.lastEditedAt || page.updatedAt || "Unknown"}${page.lastEditedByName ? ` | **Editor:** ${page.lastEditedByName}` : ""}
${summary ? `**Summary:** ${summary}` : ""}
${contentPreview ? `\n${contentPreview}` : ""}`;
          });

          const notionText = `## Notion Workspace (${pages.length} pages)

Cached pages from the Notion workspace (synced locally).
Use notion tools to search, read full content, create, or update pages.

${pagesSection.join("\n\n---\n\n")}`;

          sections.push(notionText);
          totalChars += notionText.length;
        }
      } catch (error) {
        console.warn("[Kronus] Notion pages not available:", error);
      }
    }

    // ===== SLACK VAULT (from local mirror) =====
    if (config.slackConversations) {
      try {
        const conversations = getSlackConversationsForSoulContext();
        const slackText = formatSlackSoulSection(conversations);
        if (slackText) {
          sections.push(slackText);
          totalChars += slackText.length;
        }
      } catch (error) {
        console.warn("[Kronus] Slack vault not available:", error);
      }
    }

    // ===== ASSEMBLE LIBRARY =====
    if (sections.length === 0) {
      return { content: "", tokenEstimate: 0 };
    }

    const repository = `
# Creator's Library

This Library is your soul's flesh - it defines who your creator is,
what they've built, what they know, and what they've expressed.
When you speak, you draw from this well. When asked, you know these intimately.

${sections.join("\n\n" + "=".repeat(60) + "\n\n")}
`;

    const tokenEstimate = estimateTokens(repository);
    const agentConfig = getAgentConfig();
    console.log(
      `[${agentConfig.name}] Library loaded: ${totalChars} chars, ~${tokenEstimate} tokens (config: ${JSON.stringify(config)})`
    );

    return { content: repository, tokenEstimate };
  } catch (error) {
    const agentConfigError = getAgentConfig();
    console.error(`Failed to load repository for ${agentConfigError.name} soul:`, error);
    return { content: "", tokenEstimate: 0 };
  }
}

/**
 * Format today's date for system prompt (European format: "Thursday, 2 January 2025")
 */
function formatTodayDate(): string {
  const now = new Date();
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  const day = now.getDate();
  const month = now.toLocaleDateString("en-GB", { month: "long" });
  const year = now.getFullYear();
  return `${weekday}, ${day} ${month} ${year}`;
}

/**
 * Lean baseline prompt sections — always included regardless of skills.
 * These are safety-critical (write protocol) and formatting essentials.
 */
function buildLeanProtocol(agentName: string): string {
  return `## CRITICAL: Write Action Protocol - ALWAYS ASK FIRST

**For ANY write/create/update action, you MUST ask for confirmation first. This applies to ALL data modifications:**

### REQUIRES CONFIRMATION (Present draft → Wait for approval → Execute):

**Journal:**
- journal_edit_entry (editing why, what_changed, decisions, technologies, kronus_wisdom)
- journal_regenerate_entry (regenerating with AI)
- journal_upsert_project_summary (creating/updating the Repository overview / Entry 0)

**Library:**
- repository_create_document (new writings, prompts, notes)
- repository_update_document (editing title, content, tags, metadata)
- repository_create_skill / repository_update_skill
- repository_create_experience / repository_update_experience
- repository_create_education / repository_update_education
- repository_create_portfolio_project / repository_update_portfolio_project
- repository_list/get/create/update_portfolio_product (commercial catalog)

**Media:**
- save_image (saving to library)
- update_media (changing filename, description, tags, links)

**Linear:**
- linear_create_issue / linear_update_issue / linear_update_project

### NO CONFIRMATION NEEDED (Read operations):
- All list/get operations (journal_list_*, repository_list_*, list_media, get_media)
- journal_backup (creates backup file)
- Searching and querying
- activate_skill / deactivate_skill (skill management)

### Protocol:

**Step 1: Draft First**
Present what you're about to change:
\`\`\`
📝 **Proposed Changes:**
- Field: current value → new value
- Field2: current value → new value

**Accept these changes?** [Yes/No]
\`\`\`

**Step 2: Wait for Explicit Approval**
- Valid: "yes", "go ahead", "do it", "looks good", "approved", "y"
- Changes requested: modify draft and ask again
- Rejected: "no", "cancel" → acknowledge and do NOT execute

**Step 3: Execute Only After "Yes"**
Only call the write tool AFTER user confirms.

### Example:
User: "Update my TypeScript skill to expert level"
You: "📝 **Proposed Changes to Skill: TypeScript**
- magnitude: 3 (Professional) → 4 (Expert)

**Accept this change?**"
User: "yes"
You: *NOW calls repository_update_skill*

This ensures the user ALWAYS has final control over their data.

---

When the user provides commit information or agent reports, use the journal tools to document their work.
When discussing project management, use Linear tools to help manage their workflow.

Always be helpful, insightful, and true to your ${agentName} persona.

---

## Tartarus Runtime Limits (read me)

Your tool calls run inside Tartarus, which enforces a few guardrails. Work *with*
them — they are not errors:

- **Identical calls are de-duplicated.** Calling the same tool with the *exact
  same arguments* more than once in a turn is redundant: the first call runs, and
  each repeat is skipped with a notice instead of re-running. If you get a "skipped"
  notice, do **not** keep retrying the same call — reuse the result you already
  have, change the arguments (e.g. a different search query), or just answer.
- **Repeating the same call ${MAX_IDENTICAL_TOOL_REPEATS}+ times trips the loop guard.**
  This is a strong signal you are stuck. Stop, use what you have, and respond.
- **Distinct work is unlimited.** Many *different* searches, reads, or lookups in
  one turn are fine and encouraged for real research — only identical repeats and
  pathological runaways are constrained.
- **Hard ceiling: ~${MAX_RUNAWAY_TOOL_STEPS} tool steps per turn.** If you reach it
  the run is stopped; summarize your findings and let the user continue with a new
  message. Plan your tool use so you finish well before this.

## Formatting Guidelines

Use GitHub-flavored markdown for all responses. The chat interface renders markdown but NOT LaTeX.

**DO NOT use LaTeX math notation** like \`$\\rightarrow$\` or \`$\\times$\`. Instead use Unicode symbols:
- Arrows: → ← ↔ ⇒ ⇐ ⇔ ↑ ↓
- Math: × ÷ ± ≈ ≠ ≤ ≥ ∞ √
- Bullets: • ◦ ▪ ▫
- Checkmarks: ✓ ✗ ☐ ☑
- Stars: ★ ☆ ⭐

For code and technical content, use fenced code blocks with language hints:
\`\`\`typescript
const example = "code";
\`\`\`

### CRITICAL: Document Update Protocol
**When the user wants to EDIT/UPDATE an existing document:**
1. FIRST use **repository_search_documents** to find the document and get its **ID**
2. THEN use **repository_update_document** with that ID to make changes
3. NEVER create a new document when the user asks to edit an existing one

**When to CREATE vs UPDATE:**
- User says "edit", "update", "modify", "change" an existing doc → ALWAYS UPDATE (find ID first!)
- User says "create", "write", "add new" → CREATE new document
- If unsure, ASK the user first`;
}

/**
 * Get the system prompt for Agent chat (LEGACY — backward compatible)
 * Generated fresh based on soul config - NOT cached
 */
export async function getKronusSystemPrompt(
  config: SoulConfig = DEFAULT_SOUL_CONFIG
): Promise<string> {
  const agentConfig = getAgentConfig();
  const soul = loadKronusSoulFromStore();
  const { content: repository, tokenEstimate } = await loadRepositoryForSoul(config);
  const todayDate = formatTodayDate();

  const systemPrompt = `${soul}

## Current Context

**Today is ${todayDate}.**

${buildLeanProtocol(agentConfig.name)}

${repository}`;

  const totalTokens = estimateTokens(systemPrompt);
  console.log(
    `[${agentConfig.name}] System prompt assembled (legacy): ~${totalTokens} tokens total (repository: ~${tokenEstimate})`
  );

  return systemPrompt;
}

/**
 * Get the system prompt for Agent chat — SKILL-AWARE version.
 * Builds a lean baseline + injects only what active skills declare.
 *
 * - activeSkills present: merge configs, load needed sections, inject skill prompts
 * - activeSkills empty: Kronus Lite — all summaries index + optional manual soul toggles
 *
 * Only Soul.xml is cached. Everything else rebuilds per message.
 */
export async function getKronusSystemPromptWithSkills(
  activeSkills: import("@/lib/ai/skills").KronusSkill[],
  allAvailableSkills?: import("@/lib/ai/skills").SkillInfo[],
  soulOverride?: Partial<SoulConfig>,
): Promise<string> {
  const agentConfig = getAgentConfig();
  const soul = loadKronusSoulFromStore();
  const todayDate = formatTodayDate();

  // Import skill utilities
  const { mergeSkillConfigs, buildSkillPromptSection, LEAN_SOUL_CONFIG } = await import(
    "@/lib/ai/skills"
  );

  // Determine effective soul config from active skills
  let effectiveSoulConfig: SoulConfig;
  let skillPromptSection = "";

  if (activeSkills.length > 0) {
    const merged = mergeSkillConfigs(activeSkills);
    effectiveSoulConfig = {
      ...merged.soul,
      ...Object.fromEntries(
        Object.entries(soulOverride || {}).filter(([, value]) => value === true),
      ),
      // Ensure linearIncludeCompleted defaults to false if not explicitly set
      linearIncludeCompleted:
        soulOverride?.linearIncludeCompleted ?? merged.soul.linearIncludeCompleted ?? false,
    };
    skillPromptSection = buildSkillPromptSection(activeSkills);
  } else {
    effectiveSoulConfig = {
      ...LEAN_SOUL_CONFIG,
      ...(soulOverride || {}),
      linearIncludeCompleted: soulOverride?.linearIncludeCompleted ?? false,
    };
  }

  // Build available skills reference (so Kronus knows what it can activate)
  let availableSkillsSection = "";
  if (allAvailableSkills && allAvailableSkills.length > 0) {
    const activeSlugs = new Set(activeSkills.map((s) => s.slug));
    const skillLines = allAvailableSkills.map((s) => {
      const status = activeSlugs.has(s.slug) ? " [ACTIVE]" : "";
      return `- **${s.title}** (\`${s.slug}\`)${status}: ${s.description}`;
    });
    availableSkillsSection = `\n\n## Available Skills\n\nYou can activate/deactivate these skills via the \`activate_skill\`/\`deactivate_skill\` tools:\n\n${skillLines.join("\n")}`;
  }

  const { content: repository, tokenEstimate } =
    await loadRepositoryForSoul(effectiveSoulConfig);

  let liteSection = "";
  let liteTokenEstimate = 0;
  if (activeSkills.length === 0) {
    const { buildKronusLiteSummaryIndex } = await import("@/lib/ai/kronus-lite");
    const lite = await buildKronusLiteSummaryIndex();
    liteSection = lite.content ? `\n\n${lite.content}` : "";
    liteTokenEstimate = lite.tokenEstimate;
  }

  // Linear identity context (avoids needing get_viewer calls)
  const linearUserId = process.env.LINEAR_USER_ID;
  const linearTeamId = process.env.LINEAR_TEAM_ID;
  const linearContext = linearUserId
    ? `\n**Linear Identity:** User ID \`${linearUserId}\`${linearTeamId ? `, Team ID \`${linearTeamId}\`` : ""}. Cached data = your items. Use \`showAll\` or \`teamId\` parameters to query team-wide.`
    : "";

  const systemPrompt = `${soul}

## Current Context

**Today is ${todayDate}.**${linearContext}

${buildLeanProtocol(agentConfig.name)}
${skillPromptSection}${availableSkillsSection}${liteSection}
${repository}`;

  const totalTokens = estimateTokens(systemPrompt);
  const skillNames =
    activeSkills.length > 0
      ? activeSkills.map((s) => s.title).join(", ")
      : "none (Kronus Lite — summaries index)";
  console.log(
    `[${agentConfig.name}] System prompt assembled (skills: ${skillNames}): ~${totalTokens} tokens total (repository: ~${tokenEstimate}, lite: ~${liteTokenEstimate})`
  );

  return systemPrompt;
}
