import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody } from "@/lib/validations";
import { createSkillSchema } from "@/lib/validations/schemas";
import { ConflictError } from "@/lib/errors";

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
  return NextResponse.json({
    ...skill,
    tags: JSON.parse(skill.tags || "[]"),
  });
});
