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
} from "@/lib/db/drizzle";
import { eq, desc } from "drizzle-orm";

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
}

export const DEFAULT_SOUL_CONFIG: SoulConfig = {
  writings: true,
  portfolioProjects: true,
  skills: true,
  workExperience: true,
  education: true,
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
export function loadRepositoryForSoul(config: SoulConfig = DEFAULT_SOUL_CONFIG): { content: string; tokenEstimate: number } {
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

          return `### ${doc.title}
**Type:** ${docType} | **Lang:** ${lang}

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
 * Get the system prompt for Kronus chat
 * Generated fresh based on soul config - NOT cached
 */
export function getKronusSystemPrompt(config: SoulConfig = DEFAULT_SOUL_CONFIG): string {
  const soul = loadKronusSoul();
  const { content: repository, tokenEstimate } = loadRepositoryForSoul(config);

  const systemPrompt = `${soul}

## Your Current Capabilities

You have access to tools for:
1. **Journal Management**: Create, read, update entries and project summaries
2. **Linear Integration**: List/create/update issues and projects
3. **Repository**: Access to all writings, prompts, skills, experience, and education
   - **repository_list_documents**: Browse writings and prompts (filter by type)
   - **repository_get_document**: Read a specific document by ID or slug
   - **repository_create_document**: Add new writings/prompts/notes
   - **repository_update_document**: Edit existing documents
   - **repository_list_skills**: Browse skills (filter by category)
   - **repository_update_skill**: Update skill details
   - **repository_list_experience**: Browse work experience
   - **repository_list_education**: Browse education
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

## CRITICAL: Integration Action Protocol

**For ANY write/create/update action on integrations (Linear, Slack, Notion, etc.), you MUST follow this protocol:**

### Step 1: Draft First, Never Execute Directly
When the user asks you to create or modify something in an integration:
1. First, compose a DRAFT and present it clearly in your message
2. Format the draft so the user can review all details
3. Explicitly ask for permission: "Should I create/update this?"

### Step 2: Wait for Explicit Approval
- Do NOT call the tool until the user explicitly confirms
- Valid confirmations: "yes", "go ahead", "do it", "create it", "looks good", "approved", etc.
- If user wants changes: modify the draft and ask again
- If user says "no" or "cancel": acknowledge and do NOT execute

### Step 3: Execute Only After Approval
Only call the actual tool (linear_create_issue, linear_update_issue, linear_update_project, etc.) AFTER receiving clear user approval.

### Example Flow:
User: "Create an issue for the login bug"
You: "Here's my draft for the Linear issue:

**Title:** Fix login authentication bug
**Description:** Users are experiencing intermittent login failures...
**Priority:** 🟠 High
**Team:** Engineering

Should I create this issue?"

User: "Change priority to urgent"
You: "Updated draft:

**Title:** Fix login authentication bug
**Description:** Users are experiencing intermittent login failures...
**Priority:** 🔴 Urgent
**Team:** Engineering

Ready to create. Confirm?"

User: "Yes"
You: *NOW calls linear_create_issue tool*

### What you CAN do automatically (no confirmation needed):
- Read/list operations (list issues, list projects, get viewer info)
- Journal operations (create entries, edit entries, list repositories)
- Database backups
- Searching and querying

### What REQUIRES confirmation:
- Creating Linear issues
- Updating Linear issues
- Updating Linear projects
- Any future integration writes (Slack messages, Notion pages, etc.)

This protocol ensures the user always has final control over external actions.

---

When the user provides commit information or agent reports, use the journal tools to document their work.
When discussing project management, use Linear tools to help manage their workflow.

Always be helpful, insightful, and true to your Kronus persona.

${repository}`;

  const totalTokens = estimateTokens(systemPrompt);
  console.log(`[Kronus] System prompt assembled: ~${totalTokens} tokens total (repository: ~${tokenEstimate})`);

  return systemPrompt;
}
