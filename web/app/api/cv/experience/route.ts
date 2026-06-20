import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody } from "@/lib/validations";
import { createExperienceSchema } from "@/lib/validations/schemas";
import { ConflictError } from "@/lib/errors";

/**
 * Generate AI summary for work experience (async, non-blocking)
 */
async function generateExperienceSummary(expId: string, exp: any): Promise<void> {
  try {
    const achievements =
      typeof exp.achievements === "string"
        ? JSON.parse(exp.achievements || "[]")
        : exp.achievements || [];
    const content = `
Position: ${exp.title} at ${exp.company}
${exp.department ? `Department: ${exp.department}` : ""}
Location: ${exp.location}
Period: ${exp.dateStart} - ${exp.dateEnd || "Present"}
Role Summary: ${exp.tagline}
${exp.note ? `Notes: ${exp.note}` : ""}
${achievements.length ? `Key Achievements:\n${achievements.map((a: string) => `- ${a}`).join("\n")}` : ""}
    `.trim();

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3005"}/api/ai/summarize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "work_experience",
          title: `${exp.title} at ${exp.company}`,
          content,
          metadata: { company: exp.company, dateStart: exp.dateStart, dateEnd: exp.dateEnd },
        }),
      }
    );

    if (response.ok) {
      const { summary } = await response.json();
      const db = getDatabase();
      db.prepare("UPDATE work_experience SET summary = ?, summary_updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(summary, expId);
    }
  } catch (error) {
    console.error("Failed to generate experience summary:", error);
  }
}

/**
 * GET /api/cv/experience
 *
 * List all work experience.
 */
export const GET = withErrorHandler(async () => {
  const db = getDatabase();
  const experience = db
    .prepare("SELECT * FROM work_experience ORDER BY dateStart DESC")
    .all() as any[];
  const experienceParsed = experience.map((e) => ({
    ...e,
    achievements: JSON.parse(e.achievements || "[]"),
  }));
  return NextResponse.json(experienceParsed);
});

/**
 * POST /api/cv/experience
 *
 * Create a new work experience entry.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const db = getDatabase();
  const body = await requireBody(createExperienceSchema, request);

  try {
    db.prepare(
      `INSERT INTO work_experience (id, title, company, department, location, dateStart, dateEnd, tagline, note, achievements, logo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      body.id,
      body.title,
      body.company,
      body.department || null,
      body.location,
      body.dateStart,
      body.dateEnd || null,
      body.tagline,
      body.note || null,
      JSON.stringify(body.achievements),
      body.logo || null
    );
  } catch (error: any) {
    if (error.message?.includes("UNIQUE constraint")) {
      throw new ConflictError("Experience with this ID already exists");
    }
    throw error;
  }

  const exp = db.prepare("SELECT * FROM work_experience WHERE id = ?").get(body.id) as any;

  // Generate summary asynchronously (don't block response)
  generateExperienceSummary(body.id, exp).catch(console.error);

  try {
    const { registerObject } = await import("@/lib/object-registry");
    registerObject({ type: 'work_experience', sourceTable: 'work_experience', sourceId: body.id, title: `${body.title} at ${body.company}` });
  } catch { /* registry is non-critical */ }

  const { markContextMetricsStale } = await import("@/lib/mark-context-metrics-stale");
  markContextMetricsStale();

  return NextResponse.json({
    ...exp,
    achievements: JSON.parse(exp.achievements || "[]"),
  });
});
