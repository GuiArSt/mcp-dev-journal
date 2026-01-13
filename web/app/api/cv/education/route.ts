import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody } from "@/lib/validations";
import { createEducationSchema } from "@/lib/validations/schemas";
import { ConflictError } from "@/lib/errors";

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
  return NextResponse.json({
    ...edu,
    focusAreas: JSON.parse(edu.focusAreas || "[]"),
    achievements: JSON.parse(edu.achievements || "[]"),
  });
});
