import { NextResponse } from "next/server";
import {
  getDrizzleDb,
  documents,
  portfolioProjects,
  skills,
  workExperience,
  education,
  journalEntries,
  linearProjects,
  linearIssues,
} from "@/lib/db/drizzle";
import { eq, desc } from "drizzle-orm";

/**
 * Estimate token count from text (rough: ~4 chars per token for English)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * GET /api/kronus/stats
 * Returns counts AND actual token estimates for each repository section
 * Used by Soul Config UI to show accurate context usage
 */
export async function GET() {
  try {
    const db = getDrizzleDb();

    // ===== WRITINGS =====
    const writings = db
      .select()
      .from(documents)
      .where(eq(documents.type, "writing"))
      .all();

    let writingsTokens = 0;
    for (const doc of writings) {
      // Estimate based on actual content structure used in kronus.ts
      const content = `### ${doc.title}\n**Type:** writing | **Lang:** ${doc.language || "en"}\n${doc.content}`;
      writingsTokens += estimateTokens(content);
    }

    // ===== PORTFOLIO PROJECTS =====
    const projects = db
      .select()
      .from(portfolioProjects)
      .all();

    let projectsTokens = 0;
    for (const p of projects) {
      const techs = JSON.parse(p.technologies || "[]").join(", ");
      const content = `### ${p.title}\n**Category:** ${p.category} | **Company:** ${p.company || "Personal"} | **Status:** ${p.status}\n**Role:** ${p.role || "N/A"}\n**Technologies:** ${techs}\n${p.description || p.excerpt || ""}`;
      projectsTokens += estimateTokens(content);
    }

    // ===== SKILLS =====
    const allSkills = db.select().from(skills).all();

    let skillsTokens = 0;
    for (const s of allSkills) {
      const level = s.magnitude === 4 ? "Expert" : s.magnitude === 3 ? "Professional" : s.magnitude === 2 ? "Apprentice" : "Beginner";
      const content = `- **${s.name}** (${level}): ${s.description}`;
      skillsTokens += estimateTokens(content);
    }

    // ===== WORK EXPERIENCE =====
    const experience = db
      .select()
      .from(workExperience)
      .all();

    let experienceTokens = 0;
    for (const job of experience) {
      const achievements = JSON.parse(job.achievements || "[]");
      const achievementsList = achievements
        .slice(0, 3)
        .map((a: any) => `- ${typeof a === "string" ? a : a.description}`)
        .join("\n");
      const content = `### ${job.title} @ ${job.company}\n**Period:** ${job.dateStart} → ${job.dateEnd || "Present"} | **Location:** ${job.location}\n${job.tagline}\n${achievementsList}`;
      experienceTokens += estimateTokens(content);
    }

    // ===== EDUCATION =====
    const edu = db.select().from(education).all();

    let educationTokens = 0;
    for (const e of edu) {
      const focusAreas = JSON.parse(e.focusAreas || "[]").join(", ");
      const content = `### ${e.degree} in ${e.field}\n**Institution:** ${e.institution} | **Period:** ${e.dateStart} → ${e.dateEnd}\n${e.tagline}\n${focusAreas}`;
      educationTokens += estimateTokens(content);
    }

    // ===== JOURNAL ENTRIES =====
    const entries = db
      .select()
      .from(journalEntries)
      .orderBy(desc(journalEntries.date))
      .all(); // All entries - no limit

    let journalTokens = 0;
    for (const entry of entries) {
      const content = `### ${entry.repository} - ${entry.commitHash.substring(0, 7)}\n**Branch:** ${entry.branch}\n**Author:** ${entry.codeAuthor || entry.author}\n**Why:** ${entry.why || "N/A"}\n**What Changed:** ${entry.whatChanged || "N/A"}\n**Decisions:** ${entry.decisions || "N/A"}\n**Technologies:** ${entry.technologies || "N/A"}`;
      journalTokens += estimateTokens(content);
    }

    // ===== LINEAR PROJECTS (from cached database) =====
    const COMPLETED_PROJECT_STATES = ["completed", "canceled"];

    let allLinProjects: any[] = [];
    let activeLinProjects: any[] = [];
    let completedLinProjects: any[] = [];
    let linearProjectsTokensActive = 0;
    let linearProjectsTokensAll = 0;

    try {
      // Fetch from cached database
      allLinProjects = await db.select().from(linearProjects);

      // Separate active vs completed
      for (const p of allLinProjects) {
        const isCompleted = COMPLETED_PROJECT_STATES.includes((p.state || "").toLowerCase());
        if (isCompleted) {
          completedLinProjects.push(p);
        } else {
          activeLinProjects.push(p);
        }

        // Calculate tokens
        const progress = p.progress ? `${Math.round(p.progress * 100)}%` : "N/A";
        const content = `### ${p.name}\n**State:** ${p.state || "Unknown"} | **Progress:** ${progress} | **Target:** ${p.targetDate || "No target"}\n**Lead:** ${p.leadName || "Unassigned"}\n${p.description || ""}`;
        const tokens = estimateTokens(content);

        linearProjectsTokensAll += tokens;
        if (!isCompleted) {
          linearProjectsTokensActive += tokens;
        }
      }
    } catch {
      // Linear data may not be synced yet - ignore
    }

    // ===== LINEAR ISSUES (from cached database) =====
    const COMPLETED_ISSUE_STATES = ["done", "completed", "canceled", "cancelled", "closed", "archived"];

    let allLinIssues: any[] = [];
    let activeLinIssues: any[] = [];
    let completedLinIssues: any[] = [];
    let linearIssuesTokensActive = 0;
    let linearIssuesTokensAll = 0;

    try {
      // Fetch from cached database
      allLinIssues = await db.select().from(linearIssues).where(eq(linearIssues.isDeleted, false));

      // Separate active vs completed
      for (const issue of allLinIssues) {
        const stateName = (issue.stateName || "").toLowerCase();
        const isCompleted = COMPLETED_ISSUE_STATES.some(s => stateName.includes(s));

        if (isCompleted) {
          completedLinIssues.push(issue);
        } else {
          activeLinIssues.push(issue);
        }

        // Calculate tokens
        const content = `- **${issue.identifier}**: ${issue.title}\n  Priority: ${issue.priority || "None"} | State: ${issue.stateName || "Unknown"}\n  ${issue.description?.substring(0, 150) || ""}`;
        const tokens = estimateTokens(content);

        linearIssuesTokensAll += tokens;
        if (!isCompleted) {
          linearIssuesTokensActive += tokens;
        }
      }
    } catch {
      // Linear data may not be synced yet - ignore
    }

    // Base overhead: Soul.xml + tool definitions + section headers
    const baseTokens = 6000;

    // Calculate totals for both scenarios
    const totalTokensActive =
      baseTokens +
      writingsTokens +
      projectsTokens +
      skillsTokens +
      experienceTokens +
      educationTokens +
      journalTokens +
      linearProjectsTokensActive +
      linearIssuesTokensActive;

    const totalTokensWithCompleted =
      baseTokens +
      writingsTokens +
      projectsTokens +
      skillsTokens +
      experienceTokens +
      educationTokens +
      journalTokens +
      linearProjectsTokensAll +
      linearIssuesTokensAll;

    return NextResponse.json({
      writings: writings.length,
      writingsTokens,
      portfolioProjects: projects.length,
      portfolioProjectsTokens: projectsTokens,
      skills: allSkills.length,
      skillsTokens,
      workExperience: experience.length,
      workExperienceTokens: experienceTokens,
      education: edu.length,
      educationTokens,
      journalEntries: entries.length,
      journalEntriesTokens: journalTokens,
      // Enhanced Linear stats with breakdown
      linear: {
        projects: {
          total: allLinProjects.length,
          active: activeLinProjects.length,
          completed: completedLinProjects.length,
          tokensActive: linearProjectsTokensActive,
          tokensAll: linearProjectsTokensAll,
        },
        issues: {
          total: allLinIssues.length,
          active: activeLinIssues.length,
          completed: completedLinIssues.length,
          tokensActive: linearIssuesTokensActive,
          tokensAll: linearIssuesTokensAll,
        },
      },
      // Legacy fields for backwards compatibility
      linearProjects: allLinProjects.length,
      linearProjectsTokens: linearProjectsTokensActive,
      linearIssues: allLinIssues.length,
      linearIssuesTokens: linearIssuesTokensActive,
      baseTokens,
      // Total tokens depends on include completed setting (client calculates)
      totalTokens: totalTokensActive,
      totalTokensWithCompleted,
    });
  } catch (error: any) {
    console.error("Failed to fetch Kronus stats:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
