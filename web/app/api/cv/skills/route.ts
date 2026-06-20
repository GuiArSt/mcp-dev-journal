import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody } from "@/lib/validations";
import { createSkillSchema } from "@/lib/validations/schemas";
import { ConflictError } from "@/lib/errors";

/**
 * Generate AI summary for a skill (async, non-blocking)
 */
async function generateSkillSummary(skillId: string, skill: any): Promise<void> {
  try {
    const content = `
Skill: ${skill.name}
Category: ${skill.category}
Proficiency: ${skill.magnitude}/5
Description: ${skill.description}
${skill.tags?.length ? `Tags: ${JSON.parse(skill.tags || "[]").join(", ")}` : ""}
${skill.firstUsed ? `First used: ${skill.firstUsed}` : ""}
${skill.lastUsed ? `Last used: ${skill.lastUsed}` : ""}
    `.trim();

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3005"}/api/ai/summarize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "skill",
          title: skill.name,
          content,
          metadata: { category: skill.category, magnitude: skill.magnitude },
        }),
      }
    );

    if (response.ok) {
      const { summary } = await response.json();
      const db = getDatabase();
      db.prepare("UPDATE skills SET summary = ?, summary_updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(summary, skillId);
    }
  } catch (error) {
    console.error("Failed to generate skill summary:", error);
  }
}

/**
 * GET /api/cv/skills
 *
 * List all skills.
 */
export const GET = withErrorHandler(async () => {
  const db = getDatabase();
  const skills = db.prepare("SELECT * FROM skills ORDER BY category, name").all() as any[];
  const skillsParsed = skills.map((s) => ({
    ...s,
    tags: JSON.parse(s.tags || "[]"),
  }));
  return NextResponse.json(skillsParsed);
});

/**
 * POST /api/cv/skills
 *
 * Create a new skill.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const db = getDatabase();
  const body = await requireBody(createSkillSchema, request);

  try {
    db.prepare(
      `INSERT INTO skills (id, name, category, magnitude, description, icon, color, url, tags, firstUsed, lastUsed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      body.id,
      body.name,
      body.category,
      body.magnitude,
      body.description,
      body.icon || null,
      body.color || null,
      body.url || null,
      JSON.stringify(body.tags),
      body.firstUsed || null,
      body.lastUsed || null
    );
  } catch (error: any) {
    if (error.message?.includes("UNIQUE constraint")) {
      throw new ConflictError("Skill with this ID already exists");
    }
    throw error;
  }

  const skill = db.prepare("SELECT * FROM skills WHERE id = ?").get(body.id) as any;

  // Generate summary asynchronously (don't block response)
  generateSkillSummary(body.id, skill).catch(console.error);

  try {
    const { registerObject } = await import("@/lib/object-registry");
    registerObject({ type: 'skill', sourceTable: 'skills', sourceId: body.id, title: body.name });
  } catch { /* registry is non-critical */ }

  const { markContextMetricsStale } = await import("@/lib/mark-context-metrics-stale");
  markContextMetricsStale();

  return NextResponse.json({
    ...skill,
    tags: JSON.parse(skill.tags || "[]"),
  });
});
