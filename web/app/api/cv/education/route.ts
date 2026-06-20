import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody } from "@/lib/validations";
import { createEducationSchema } from "@/lib/validations/schemas";
import { ConflictError } from "@/lib/errors";

/**
 * Generate AI summary for education (async, non-blocking)
 */
async function generateEducationSummary(eduId: string, edu: any): Promise<void> {
  try {
    const focusAreas =
      typeof edu.focusAreas === "string"
        ? JSON.parse(edu.focusAreas || "[]")
        : edu.focusAreas || [];
    const achievements =
      typeof edu.achievements === "string"
        ? JSON.parse(edu.achievements || "[]")
        : edu.achievements || [];
    const content = `
Degree: ${edu.degree} in ${edu.field}
Institution: ${edu.institution}
Location: ${edu.location}
Period: ${edu.dateStart} - ${edu.dateEnd}
Summary: ${edu.tagline}
${edu.note ? `Notes: ${edu.note}` : ""}
${focusAreas.length ? `Focus Areas: ${focusAreas.join(", ")}` : ""}
${achievements.length ? `Achievements:\n${achievements.map((a: string) => `- ${a}`).join("\n")}` : ""}
    `.trim();

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3005"}/api/ai/summarize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "education",
          title: `${edu.degree} in ${edu.field} at ${edu.institution}`,
          content,
          metadata: { institution: edu.institution, degree: edu.degree, field: edu.field },
        }),
      }
    );

    if (response.ok) {
      const { summary } = await response.json();
      const db = getDatabase();
      db.prepare("UPDATE education SET summary = ?, summary_updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(summary, eduId);
    }
  } catch (error) {
    console.error("Failed to generate education summary:", error);
  }
}

/**
 * GET /api/cv/education
 *
 * List all education entries.
 */
export const GET = withErrorHandler(async () => {
  const db = getDatabase();
  const education = db.prepare("SELECT * FROM education ORDER BY dateStart DESC").all() as any[];
  const educationParsed = education.map((e) => ({
    ...e,
    focusAreas: JSON.parse(e.focusAreas || "[]"),
    achievements: JSON.parse(e.achievements || "[]"),
  }));
  return NextResponse.json(educationParsed);
});

/**
 * POST /api/cv/education
 *
 * Create a new education entry.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const db = getDatabase();
  const body = await requireBody(createEducationSchema, request);

  try {
    db.prepare(
      `INSERT INTO education (id, degree, field, institution, location, dateStart, dateEnd, tagline, note, focusAreas, achievements, logo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      body.id,
      body.degree,
      body.field,
      body.institution,
      body.location,
      body.dateStart,
      body.dateEnd,
      body.tagline,
      body.note || null,
      JSON.stringify(body.focusAreas),
      JSON.stringify(body.achievements),
      body.logo || null
    );
  } catch (error: any) {
    if (error.message?.includes("UNIQUE constraint")) {
      throw new ConflictError("Education with this ID already exists");
    }
    throw error;
  }

  const edu = db.prepare("SELECT * FROM education WHERE id = ?").get(body.id) as any;

  // Generate summary asynchronously (don't block response)
  generateEducationSummary(body.id, edu).catch(console.error);

  try {
    const { registerObject } = await import("@/lib/object-registry");
    registerObject({ type: 'education', sourceTable: 'education', sourceId: body.id, title: `${body.degree} in ${body.field}` });
  } catch { /* registry is non-critical */ }

  const { markContextMetricsStale } = await import("@/lib/mark-context-metrics-stale");
  markContextMetricsStale();

  return NextResponse.json({
    ...edu,
    focusAreas: JSON.parse(edu.focusAreas || "[]"),
    achievements: JSON.parse(edu.achievements || "[]"),
  });
});
