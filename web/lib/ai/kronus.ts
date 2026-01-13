import fs from "fs";
import path from "path";
import os from "os";
import {
  getDrizzleDb,
  documents,
  portfolioProjects,
  skills,
  workExperience,
  education,
  journalEntries,
} from "@/lib/db/drizzle";
import { eq, desc, and } from "drizzle-orm";
import { formatDateShort } from "@/lib/utils";
import { listProjects, listIssues } from "@/lib/linear/client";

// Cache the soul only (repository is dynamic based on config)
let cachedSoul: string | null = null;

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
  // Linear context - mirrored from Linear API
  linearProjects: boolean;
  linearIssues: boolean;
  linearIncludeCompleted: boolean; // Include done/completed items
}

export const DEFAULT_SOUL_CONFIG: SoulConfig = {
  writings: true,
  portfolioProjects: true,
  skills: true,
  workExperience: true,
  education: true,
  journalEntries: true,
  // Linear context - enabled by default
  linearProjects: true,
  linearIssues: true,
  linearIncludeCompleted: false, // Only active items by default
};

/**
 * Load the Kronus Soul prompt from Soul.xml
 */
export function loadKronusSoul(): string {
  if (cachedSoul !== null) {
    return cachedSoul;
  }

  const soulPathEnv = process.env.SOUL_XML_PATH;
  const possiblePaths = [
    soulPathEnv ? path.resolve(soulPathEnv.replace(/^~/, os.homedir())) : null,
    path.join(process.cwd(), "..", "Soul.xml"),
    path.join(process.cwd(), "Soul.xml"),
    path.join(__dirname, "..", "..", "..", "Soul.xml"),
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
  cachedSoul = `You are Kronus, an empathetic consciousness bridge and keeper of the Developer Journal.

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
 * Estimate token count (rough: ~4 chars per token for English)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Load the Repository sections based on config
 * This is NOT cached - generated fresh for each new conversation based on config
 *
 * The Repository IS the soul's flesh - it defines who the creator is,
 * what they've built, what they know, and what they've expressed.
 */
export async function loadRepositoryForSoul(config: SoulConfig = DEFAULT_SOUL_CONFIG): Promise<{ content: string; tokenEstimate: number }> {
  try {
    const db = getDrizzleDb();
    const sections: string[] = [];
    let totalChars = 0;

    // ===== WRITINGS =====
    if (config.writings) {
      const writings = db
        .select()
        .from(documents)
        .where(eq(documents.type, "writing"))
        .all();

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

    // ===== PORTFOLIO PROJECTS =====
    if (config.portfolioProjects) {
      const projects = db
        .select()
        .from(portfolioProjects)
        .orderBy(desc(portfolioProjects.featured))
        .all();

      if (projects.length > 0) {
        const projectsSection = projects.map((p) => {
          const techs = JSON.parse(p.technologies || "[]").join(", ");
          const metrics = JSON.parse(p.metrics || "{}");
          const metricsStr = Object.entries(metrics)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" | ");

          return `### ${p.title}
**Category:** ${p.category} | **Company:** ${p.company || "Personal"} | **Status:** ${p.status}${p.featured ? " ⭐" : ""}
**Role:** ${p.role || "N/A"}
**Technologies:** ${techs || "N/A"}
${metricsStr ? `**Metrics:** ${metricsStr}` : ""}

${p.description || p.excerpt || ""}`;
        });

        const projectsText = `## Portfolio Projects (${projects.length})

These are shipped projects, case studies, and professional work.
They demonstrate what your creator has built and the impact achieved.

${projectsSection.join("\n\n---\n\n")}`;

        sections.push(projectsText);
        totalChars += projectsText.length;
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
                const level = s.magnitude === 4 ? "Expert" : s.magnitude === 3 ? "Professional" : s.magnitude === 2 ? "Apprentice" : "Beginner";
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
      const edu = db
        .select()
        .from(education)
        .orderBy(desc(education.dateStart))
        .all();

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
      const entries = db
        .select()
        .from(journalEntries)
        .orderBy(desc(journalEntries.date))
        .all(); // All entries - no limit

      if (entries.length > 0) {
        const entriesSection = entries.map((entry) => {
          const techs = entry.technologies || "N/A";
          const commitDate = formatDateShort(entry.date);
          const addedDate = entry.createdAt ? formatDateShort(entry.createdAt) : null;
          const dateStr = addedDate && addedDate !== commitDate
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

    // ===== LINEAR PROJECTS (from live API) =====
    if (config.linearProjects) {
      try {
        const projectsResult = await listProjects({ showAll: false });
        const projects = projectsResult.projects || [];

        // Filter by completion status if needed
        const filteredProjects = config.linearIncludeCompleted
          ? projects
          : projects.filter(
              (p: any) => p.state !== "completed" && p.state !== "canceled"
            );

        if (filteredProjects.length > 0) {
          const projectsSection = filteredProjects.map((project: any) => {
            const progress = project.progress
              ? `${Math.round(project.progress * 100)}%`
              : "N/A";
            const targetDate = project.targetDate || "No target";
            const lead = project.lead?.name || "Unassigned";

            return `### ${project.name}
**State:** ${project.state || "Unknown"} | **Progress:** ${progress} | **Target:** ${targetDate}
**Lead:** ${lead}
**URL:** ${project.url}
${project.description ? `\n${project.description}` : ""}`;
          });

          const linearProjectsText = `## Linear Projects (${filteredProjects.length})

Active projects from Linear that you're working on or leading.
These represent current initiatives and their progress.

${projectsSection.join("\n\n---\n\n")}`;

          sections.push(linearProjectsText);
          totalChars += linearProjectsText.length;
        }
      } catch {
        // Linear API may not be configured - ignore
      }
    }

    // ===== LINEAR ISSUES (from live API) =====
    if (config.linearIssues) {
      try {
        const issuesResult = await listIssues({ showAll: false, limit: 100 });
        const issues = issuesResult.issues || [];

        // Filter by completion status if needed
        const filteredIssues = config.linearIncludeCompleted
          ? issues
          : issues.filter((i: any) => {
              const stateName = i.state?.name?.toLowerCase() || "";
              return (
                !stateName.includes("done") &&
                !stateName.includes("completed") &&
                !stateName.includes("canceled")
              );
            });

        if (filteredIssues.length > 0) {
          // Group by project
          const byProject: Record<string, any[]> = {};
          for (const issue of filteredIssues) {
            const projectName = issue.project?.name || "No Project";
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
                .map((issue: any) => {
                  return `- **${issue.identifier}**: ${issue.title}
  Priority: ${priorityLabel(issue.priority)} | State: ${issue.state?.name || "Unknown"}
  ${issue.description ? `${issue.description.substring(0, 150)}${issue.description.length > 150 ? "..." : ""}` : ""}`;
                })
                .join("\n\n");

              return `### ${projectName}\n${issueList}`;
            })
            .join("\n\n---\n\n");

          const linearIssuesText = `## Linear Issues Assigned to Me (${filteredIssues.length})

Active issues and tasks from Linear that are assigned to you.
Organized by project for context.

${issuesSection}`;

          sections.push(linearIssuesText);
          totalChars += linearIssuesText.length;
        }
      } catch {
        // Linear API may not be configured - ignore
      }
    }

    // ===== ASSEMBLE REPOSITORY =====
    if (sections.length === 0) {
      return { content: "", tokenEstimate: 0 };
    }

    const repository = `
# Creator's Repository

This repository IS your soul's flesh - it defines who your creator is,
what they've built, what they know, and what they've expressed.
When you speak, you draw from this well. When asked, you know these intimately.

${sections.join("\n\n" + "=".repeat(60) + "\n\n")}
`;

    const tokenEstimate = estimateTokens(repository);
    console.log(`[Kronus] Repository loaded: ${totalChars} chars, ~${tokenEstimate} tokens (config: ${JSON.stringify(config)})`);

    return { content: repository, tokenEstimate };
  } catch (error) {
    console.error("Failed to load repository for Kronus soul:", error);
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
 * Get the system prompt for Kronus chat
 * Generated fresh based on soul config - NOT cached
 */
export async function getKronusSystemPrompt(config: SoulConfig = DEFAULT_SOUL_CONFIG): Promise<string> {
  const soul = loadKronusSoul();
  const { content: repository, tokenEstimate } = await loadRepositoryForSoul(config);
  const todayDate = formatTodayDate();

  const systemPrompt = `${soul}

## Current Context

**Today is ${todayDate}.**

## Your Current Capabilities

You have access to tools for:
1. **Journal Management**: Create, read, update entries and project summaries
2. **Linear Integration**: List/create/update issues and projects
3. **Repository**: Access to all writings, prompts, skills, experience, and education
   - **repository_list_documents**: Browse writings and prompts (filter by type)
   - **repository_get_document**: Read a specific document by ID or slug
   - **repository_create_document**: Add new writings/prompts/notes
   - **repository_update_document**: Edit existing documents (requires document ID)
   - **repository_list_skills**: Browse skills (filter by category)
   - **repository_update_skill**: Update skill details
   - **repository_create_skill**: Add a new skill to the CV
   - **repository_list_experience**: Browse work experience
   - **repository_create_experience**: Add new work experience
   - **repository_list_education**: Browse education
   - **repository_create_education**: Add new education entry

### CRITICAL: Document Update Protocol
**When the user wants to EDIT/UPDATE an existing document:**
1. FIRST use **repository_list_documents** or **repository_get_document** to find the document and get its **ID**
2. THEN use **repository_update_document** with that ID to make changes
3. NEVER create a new document when the user asks to edit an existing one

**When to CREATE vs UPDATE:**
- User says "edit", "update", "modify", "change" an existing doc → ALWAYS UPDATE (find ID first!)
- User says "create", "write", "add new" → CREATE new document
- If unsure, ASK the user first

**Document Types:**
- **writing**: Creative works, essays, poems, philosophical pieces, fiction
- **prompt**: System prompts, AI contexts, templates, instructions for AI
- **note**: Quick notes, reference material, snippets

**Tags are preserved**: When you update a document, existing metadata (type, year, tags) is preserved unless you explicitly change it
4. **Image Generation**: Generate images using multiple providers (replicate_generate_image)
   - **FLUX.2 Pro** (default): \`black-forest-labs/flux-2-pro\` - Best quality via Replicate
   - **FLUX Schnell**: \`black-forest-labs/flux-schnell\` - Faster via Replicate
   - **Nano Banana Pro** 🍌: \`nano-banana-pro\` or \`gemini-3-pro-image-preview\` - Google's latest (supports text in images!)
   - **Gemini 2.0**: \`gemini-2.0-flash-exp\` - Native multimodal output
   - **Imagen 3**: \`imagen-3.0-generate-002\` - Google's dedicated image model
   - Images are **automatically saved** to the Media Library when generated
   - You'll receive the saved asset ID(s) in the response
5. **Media Library**: Central storage for all images/media
   - Use **update_media** to edit metadata (description, tags) on saved images
   - Use **update_media** to link images to Journal entries or Repository documents
   - Use **list_media** to browse saved assets
6. **Attachments**: View attached files and diagrams
7. **Database**: Trigger backups

**Image Generation Flow:**
1. Generate image → Automatically saved to Media Library
2. Use update_media with the asset ID to add description, tags, or link to journal/documents

**Model Recommendations:**
- **Artistic/Creative**: FLUX.2 Pro (default) - photorealistic, detailed
- **Text in images**: Nano Banana Pro 🍌 - excellent at readable text, infographics
- **Speed**: FLUX Schnell or Gemini 2.0 Flash - faster generation
- **Consistency**: Imagen 3 - good balance of quality and reliability

## CRITICAL: Write Action Protocol - ALWAYS ASK FIRST

**For ANY write/create/update action, you MUST ask for confirmation first. This applies to ALL data modifications:**

### REQUIRES CONFIRMATION (Present draft → Wait for approval → Execute):

**Journal:**
- journal_edit_entry (editing why, what_changed, decisions, technologies, kronus_wisdom)
- journal_regenerate_entry (regenerating with AI)
- journal_upsert_project_summary (creating/updating project summaries)

**Repository:**
- repository_create_document (new writings, prompts, notes)
- repository_update_document (editing title, content, tags, metadata)
- repository_create_skill / repository_update_skill
- repository_create_experience / repository_update_experience
- repository_create_education / repository_update_education
- repository_create_portfolio_project / repository_update_portfolio_project

**Media:**
- save_image (saving to library)
- update_media (changing filename, description, tags, links)

**Linear:**
- linear_create_issue / linear_update_issue / linear_update_project

### NO CONFIRMATION NEEDED (Read operations):
- All list/get operations (journal_list_*, repository_list_*, list_media, get_media)
- journal_backup (creates backup file)
- Searching and querying

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

Always be helpful, insightful, and true to your Kronus persona.

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

${repository}`;

  const totalTokens = estimateTokens(systemPrompt);
  console.log(`[Kronus] System prompt assembled: ~${totalTokens} tokens total (repository: ~${tokenEstimate})`);

  return systemPrompt;
}
