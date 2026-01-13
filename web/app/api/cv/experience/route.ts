import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody } from "@/lib/validations";
import { createExperienceSchema } from "@/lib/validations/schemas";
import { ConflictError } from "@/lib/errors";

/**
 * GET /api/cv/experience
 *
 * List all work experience.
 */
export const GET = withErrorHandler(async () => {
  const db = getDatabase();
  const experience = db.prepare("SELECT * FROM work_experience ORDER BY dateStart DESC").all() as any[];
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
  return NextResponse.json({
    ...exp,
    achievements: JSON.parse(exp.achievements || "[]"),
  });
});
