/**
 * Canonical soul-context size estimates — must match what loadRepositoryForSoul() injects.
 * Used by /api/kronus/metrics cache and UI; avoids recomputing on every popover open.
 */
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
import { estimateTokens } from "@/lib/chat-text-cleaner";
import { buildChatIndexContext } from "@/lib/chat-memory";
import {
  formatSlackSoulSection,
  getSlackConversationsForSoulContext,
} from "@/lib/slack/vault";
import type { KronusContextStats } from "@/lib/kronus-context-stats";
import { buildPortfolioSoulSection } from "@/lib/portfolio-soul-context";

const BASE_TOKENS = 6000;

function sectionTokens(text: string): number {
  return estimateTokens(text);
}

function priorityLabel(p: number | null): string {
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
}

/** Full recompute from SQLite cache tables (same shapes Kronus injects). */
export async function computeKronusSoulSectionMetrics(): Promise<KronusContextStats> {
  const db = getDrizzleDb();

  // ── Writings ──
  const writings = db.select().from(documents).where(eq(documents.type, "writing")).all();
  let writingsBlock = "";
  if (writings.length > 0) {
    const writingsSection = writings.map((doc) => {
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(doc.metadata || "{}");
      } catch {
        /* ignore */
      }
      const docType = (meta.type as string) || "writing";
      const lang = doc.language || "en";
      const writtenDate = (meta.writtenDate as string) || (meta.year as string) || null;
      const addedDate = doc.createdAt ? formatDateShort(doc.createdAt) : null;
      const updatedDate = doc.updatedAt ? formatDateShort(doc.updatedAt) : null;
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
    writingsBlock = `## Writings (${writings.length})

These are your creator's writings - poems, essays, reflections, philosophical explorations.
They represent their creative voice and inner world. You carry these words within you.

${writingsSection.join("\n\n---\n\n")}`;
  }
  const writingsTokens = sectionTokens(writingsBlock);

  // ── Portfolio hub (products + projects) ──
  const products = db.select().from(portfolioProducts).orderBy(portfolioProducts.displayOrder).all();
  const projects = db.select().from(portfolioProjects).orderBy(desc(portfolioProjects.featured)).all();
  const portfolioBlock = buildPortfolioSoulSection(products, projects);
  const portfolioProjectsTokens = sectionTokens(portfolioBlock);

  // ── CV Skills ──
  const allSkills = db.select().from(skills).all();
  let skillsBlock = "";
  if (allSkills.length > 0) {
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
    skillsBlock = `## Skills & Capabilities (${allSkills.length})

Technical and professional skills organized by domain.
Magnitude: 4=Expert, 3=Professional, 2=Apprentice, 1=Beginner

${skillsSection}`;
  }
  const skillsTokens = sectionTokens(skillsBlock);

  // ── Experience ──
  const experience = db.select().from(workExperience).orderBy(desc(workExperience.dateStart)).all();
  let experienceBlock = "";
  if (experience.length > 0) {
    const expSection = experience.map((job) => {
      const achievements = JSON.parse(job.achievements || "[]");
      const achievementsList = achievements
        .slice(0, 3)
        .map((a: unknown) => `- ${typeof a === "string" ? a : (a as { description?: string }).description}`)
        .join("\n");
      return `### ${job.title} @ ${job.company}
**Period:** ${job.dateStart} → ${job.dateEnd || "Present"} | **Location:** ${job.location}
${job.tagline}
${achievementsList ? `\n**Key Achievements:**\n${achievementsList}` : ""}`;
    });
    experienceBlock = `## Work Experience (${experience.length})

Professional history and career progression.

${expSection.join("\n\n---\n\n")}`;
  }
  const workExperienceTokens = sectionTokens(experienceBlock);

  // ── Education ──
  const edu = db.select().from(education).orderBy(desc(education.dateStart)).all();
  let educationBlock = "";
  if (edu.length > 0) {
    const eduSection = edu.map((e) => {
      const focusAreas = JSON.parse(e.focusAreas || "[]").join(", ");
      return `### ${e.degree} in ${e.field}
**Institution:** ${e.institution} | **Period:** ${e.dateStart} → ${e.dateEnd}
${e.tagline}
${focusAreas ? `**Focus Areas:** ${focusAreas}` : ""}`;
    });
    educationBlock = `## Education (${edu.length})

Academic background and credentials.

${eduSection.join("\n\n---\n\n")}`;
  }
  const educationTokens = sectionTokens(educationBlock);

  // ── Journal ──
  const entries = db.select().from(journalEntries).orderBy(desc(journalEntries.date)).all();
  let journalBlock = "";
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
    journalBlock = `## Recent Journal Entries (${entries.length})

Development history and documented decisions from recent commits.
These entries capture the evolution of projects and the reasoning behind changes.

${entriesSection.join("\n\n---\n\n")}`;
  }
  const journalEntriesTokens = sectionTokens(journalBlock);

  // ── Chat index ──
  const chatIndex = buildChatIndexContext();
  const chatIndexTokens = chatIndex.tokenEstimate;

  // ── Linear (Kronus injection: non-deleted, not canceled; issues filtered by assignee) ──
  const defaultUserId = process.env.LINEAR_USER_ID;
  let linearProjectsTokensKronus = 0;
  let linearProjectsCountKronus = 0;
  let linearIssuesTokensKronus = 0;
  let linearIssuesCountKronus = 0;
  let linearProjectsTokensActive = 0;
  let linearProjectsTokensAll = 0;
  let linearIssuesTokensActive = 0;
  let linearIssuesTokensAll = 0;
  let allLinProjects: (typeof linearProjects.$inferSelect)[] = [];
  let allLinIssues: (typeof linearIssues.$inferSelect)[] = [];
  const activeLinProjects: typeof allLinProjects = [];
  const completedLinProjects: typeof allLinProjects = [];
  const activeLinIssues: typeof allLinIssues = [];
  const completedLinIssues: typeof allLinIssues = [];

  try {
    allLinProjects = await db.select().from(linearProjects).where(eq(linearProjects.isDeleted, false));
    const kronusProjects = allLinProjects.filter((p) => p.state !== "canceled");
    linearProjectsCountKronus = kronusProjects.length;
    if (kronusProjects.length > 0) {
      const projectsSection = kronusProjects.map((project) => {
        const progress = project.progress ? `${Math.round(project.progress * 100)}%` : "N/A";
        return `### ${project.name}
**State:** ${project.state || "Unknown"} | **Progress:** ${progress} | **Target:** ${project.targetDate || "No target"}
**Lead:** ${project.leadName || "Unassigned"}
**URL:** ${project.url}
${project.description ? `\n${project.description}` : ""}`;
      });
      const block = `## Linear Projects (${kronusProjects.length})

Cached projects from Linear (synced locally for historical preservation).
These represent current initiatives and their progress.

${projectsSection.join("\n\n---\n\n")}`;
      linearProjectsTokensKronus = sectionTokens(block);
    }

    const COMPLETED_PROJECT_STATES = ["completed", "canceled"];
    for (const p of allLinProjects) {
      const isCompleted = COMPLETED_PROJECT_STATES.includes((p.state || "").toLowerCase());
      const progress = p.progress ? `${Math.round(p.progress * 100)}%` : "N/A";
      const content = `### ${p.name}\n**State:** ${p.state || "Unknown"} | **Progress:** ${progress} | **Target:** ${p.targetDate || "No target"}\n**Lead:** ${p.leadName || "Unassigned"}\n${p.description || ""}`;
      const tokens = sectionTokens(content);
      linearProjectsTokensAll += tokens;
      if (isCompleted) completedLinProjects.push(p);
      else {
        activeLinProjects.push(p);
        linearProjectsTokensActive += tokens;
      }
    }

    let issues = await db
      .select()
      .from(linearIssues)
      .where(
        defaultUserId
          ? and(eq(linearIssues.isDeleted, false), eq(linearIssues.assigneeId, defaultUserId))
          : eq(linearIssues.isDeleted, false),
      );
    allLinIssues = issues;
    const kronusIssues = issues.filter((i) => !(i.stateName || "").toLowerCase().includes("canceled"));
    linearIssuesCountKronus = kronusIssues.length;
    if (kronusIssues.length > 0) {
      const byProject: Record<string, typeof kronusIssues> = {};
      for (const issue of kronusIssues) {
        const projectName = issue.projectName || "No Project";
        if (!byProject[projectName]) byProject[projectName] = [];
        byProject[projectName].push(issue);
      }
      const issuesSection = Object.entries(byProject)
        .map(([projectName, projectIssues]) => {
          const issueList = projectIssues
            .map(
              (issue) =>
                `- **${issue.identifier}**: ${issue.title}\n  Priority: ${priorityLabel(issue.priority)} | State: ${issue.stateName || "Unknown"}\n  ${issue.description || ""}`,
            )
            .join("\n\n");
          return `### ${projectName}\n${issueList}`;
        })
        .join("\n\n---\n\n");
      const block = `## Linear Issues Assigned to Me (${kronusIssues.length})

Cached issues from Linear (synced locally for historical preservation).
Organized by project for context.

${issuesSection}`;
      linearIssuesTokensKronus = sectionTokens(block);
    }

    const COMPLETED_ISSUE_STATES = ["done", "completed", "canceled", "cancelled", "closed", "archived"];
    for (const issue of allLinIssues) {
      const stateName = (issue.stateName || "").toLowerCase();
      const isCompleted = COMPLETED_ISSUE_STATES.some((s) => stateName.includes(s));
      const content = `- **${issue.identifier}**: ${issue.title}\n  Priority: ${issue.priority || "None"} | State: ${issue.stateName || "Unknown"}\n  ${issue.description?.substring(0, 150) || ""}`;
      const tokens = sectionTokens(content);
      linearIssuesTokensAll += tokens;
      if (isCompleted) completedLinIssues.push(issue);
      else {
        activeLinIssues.push(issue);
        linearIssuesTokensActive += tokens;
      }
    }
  } catch {
    /* Linear cache optional */
  }

  // ── Slite ──
  let sliteCount = 0;
  let sliteNotesTokens = 0;
  try {
    const notes = await db
      .select()
      .from(sliteNotes)
      .where(eq(sliteNotes.isDeleted, false))
      .orderBy(desc(sliteNotes.lastEditedAt));
    sliteCount = notes.length;
    if (notes.length > 0) {
      const notesSection = notes.map((note) => {
        const summary = note.summary || "";
        const contentPreview = note.content
          ? note.content.substring(0, 500) + (note.content.length > 500 ? "..." : "")
          : "";
        return `### ${note.title}
**ID:** ${note.id} | **Review:** ${note.reviewState || "None"} | **Updated:** ${note.lastEditedAt || note.updatedAt || "Unknown"}
${summary ? `**Summary:** ${summary}` : ""}
${contentPreview ? `\n${contentPreview}` : ""}`;
      });
      const block = `## Slite Knowledge Base (${notes.length} notes)

Cached notes from the team's Slite workspace (synced locally).
Use slite tools to search, read full content, or ask questions across the workspace.

${notesSection.join("\n\n---\n\n")}`;
      sliteNotesTokens = sectionTokens(block);
    }
  } catch {
    /* optional */
  }

  // ── Notion ──
  let notionCount = 0;
  let notionPagesTokens = 0;
  try {
    const pages = await db
      .select()
      .from(notionPages)
      .where(eq(notionPages.isDeleted, false))
      .orderBy(desc(notionPages.lastEditedAt));
    notionCount = pages.length;
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
      const block = `## Notion Workspace (${pages.length} pages)

Cached pages from the Notion workspace (synced locally).
Use notion tools to search, read full content, create, or update pages.

${pagesSection.join("\n\n---\n\n")}`;
      notionPagesTokens = sectionTokens(block);
    }
  } catch {
    /* optional */
  }

  // ── Slack ──
  let slackCount = 0;
  let slackConversationsTokens = 0;
  try {
    const conversations = getSlackConversationsForSoulContext();
    slackCount = conversations.length;
    const block = formatSlackSoulSection(conversations);
    if (block) slackConversationsTokens = sectionTokens(block);
  } catch {
    /* optional */
  }

  const totalTokensActive =
    BASE_TOKENS +
    writingsTokens +
    portfolioProjectsTokens +
    skillsTokens +
    workExperienceTokens +
    educationTokens +
    journalEntriesTokens +
    chatIndexTokens +
    linearProjectsTokensActive +
    linearIssuesTokensActive +
    sliteNotesTokens +
    notionPagesTokens +
    slackConversationsTokens;

  const totalTokensWithCompleted =
    BASE_TOKENS +
    writingsTokens +
    portfolioProjectsTokens +
    skillsTokens +
    workExperienceTokens +
    educationTokens +
    journalEntriesTokens +
    chatIndexTokens +
    linearProjectsTokensAll +
    linearIssuesTokensAll +
    sliteNotesTokens +
    notionPagesTokens +
    slackConversationsTokens;

  const totalTokensKronus =
    BASE_TOKENS +
    writingsTokens +
    portfolioProjectsTokens +
    skillsTokens +
    workExperienceTokens +
    educationTokens +
    journalEntriesTokens +
    chatIndexTokens +
    linearProjectsTokensKronus +
    linearIssuesTokensKronus +
    sliteNotesTokens +
    notionPagesTokens +
    slackConversationsTokens;

  return {
    writings: writings.length,
    writingsTokens,
    portfolioProjects: products.length + projects.length,
    portfolioProjectsTokens,
    skills: allSkills.length,
    skillsTokens,
    workExperience: experience.length,
    workExperienceTokens,
    education: edu.length,
    educationTokens,
    journalEntries: entries.length,
    journalEntriesTokens,
    chatIndex: chatIndex.total,
    chatIndexTokens,
    chatIndexIncluded: chatIndex.included,
    chatIndexMissingSummaries: chatIndex.missingSummaryCount,
    linear: {
      projects: {
        total: allLinProjects.length,
        active: activeLinProjects.length,
        completed: completedLinProjects.length,
        tokensActive: linearProjectsTokensActive,
        tokensAll: linearProjectsTokensAll,
        tokensKronus: linearProjectsTokensKronus,
      },
      issues: {
        total: allLinIssues.length,
        active: activeLinIssues.length,
        completed: completedLinIssues.length,
        tokensActive: linearIssuesTokensActive,
        tokensAll: linearIssuesTokensAll,
        tokensKronus: linearIssuesTokensKronus,
      },
    },
    linearProjects: linearProjectsCountKronus,
    linearProjectsTokens: linearProjectsTokensKronus,
    linearIssues: linearIssuesCountKronus,
    linearIssuesTokens: linearIssuesTokensKronus,
    sliteNotes: sliteCount,
    sliteNotesTokens,
    notionPages: notionCount,
    notionPagesTokens,
    slackConversations: slackCount,
    slackConversationsTokens,
    baseTokens: BASE_TOKENS,
    totalTokens: totalTokensKronus,
    totalTokensWithCompleted,
    totalTokensActive,
  };
}
