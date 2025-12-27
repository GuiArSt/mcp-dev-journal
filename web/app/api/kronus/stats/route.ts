import { NextResponse } from "next/server";
import {
  getDrizzleDb,
  documents,
  portfolioProjects,
  skills,
  workExperience,
  education,
} from "@/lib/db/drizzle";
import { eq, count } from "drizzle-orm";

/**
 * GET /api/kronus/stats
 * Returns counts for each repository section for the Soul Config UI
 */
export async function GET() {
  try {
    const db = getDrizzleDb();

    // Count writings (documents with type='writing')
    const writingsResult = db
      .select({ count: count() })
      .from(documents)
      .where(eq(documents.type, "writing"))
      .get();

    // Count portfolio projects
    const projectsResult = db
      .select({ count: count() })
      .from(portfolioProjects)
      .get();

    // Count skills
    const skillsResult = db
      .select({ count: count() })
      .from(skills)
      .get();

    // Count work experience
    const experienceResult = db
      .select({ count: count() })
      .from(workExperience)
      .get();

    // Count education
    const educationResult = db
      .select({ count: count() })
      .from(education)
      .get();

    // Rough token estimate (based on current data patterns)
    const writingsCount = writingsResult?.count || 0;
    const projectsCount = projectsResult?.count || 0;
    const skillsCount = skillsResult?.count || 0;
    const experienceCount = experienceResult?.count || 0;
    const educationCount = educationResult?.count || 0;

    // Token estimates per item (rough averages)
    const tokenEstimates = {
      writingsPerItem: 1400,
      projectsPerItem: 230,
      skillsPerItem: 45,
      experiencePerItem: 190,
      educationPerItem: 170,
      base: 6000, // Soul.xml + tool definitions
    };

    const totalTokens =
      tokenEstimates.base +
      writingsCount * tokenEstimates.writingsPerItem +
      projectsCount * tokenEstimates.projectsPerItem +
      skillsCount * tokenEstimates.skillsPerItem +
      experienceCount * tokenEstimates.experiencePerItem +
      educationCount * tokenEstimates.educationPerItem;

    return NextResponse.json({
      writings: writingsCount,
      portfolioProjects: projectsCount,
      skills: skillsCount,
      workExperience: experienceCount,
      education: educationCount,
      totalTokens,
    });
  } catch (error: any) {
    console.error("Failed to fetch Kronus stats:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
