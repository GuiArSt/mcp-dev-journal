import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireParams, requireBody } from "@/lib/validations";
import { stringIdParamSchema, updateEducationSchema } from "@/lib/validations/schemas";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * GET /api/cv/education/[id]
 *
 * Get an education entry by ID.
 */
export const GET = withErrorHandler(async (
  _request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(stringIdParamSchema, resolvedParams);
  const db = getDatabase();

  const edu = db.prepare("SELECT * FROM education WHERE id = ?").get(id) as any;
  if (!edu) {
    throw new NotFoundError("Education", id);
  }

  return NextResponse.json({
    ...edu,
    focusAreas: JSON.parse(edu.focusAreas || "[]"),
    achievements: JSON.parse(edu.achievements || "[]"),
  });
});

/**
 * PUT /api/cv/education/[id]
 *
 * Update an education entry.
 */
export const PUT = withErrorHandler(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(stringIdParamSchema, resolvedParams);
  const db = getDatabase();
  const body = await requireBody(updateEducationSchema, request);

  const existing = db.prepare("SELECT * FROM education WHERE id = ?").get(id);
  if (!existing) {
    throw new NotFoundError("Education", id);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (body.degree !== undefined) { updates.push("degree = ?"); values.push(body.degree); }
  if (body.field !== undefined) { updates.push("field = ?"); values.push(body.field); }
  if (body.institution !== undefined) { updates.push("institution = ?"); values.push(body.institution); }
  if (body.location !== undefined) { updates.push("location = ?"); values.push(body.location); }
  if (body.dateStart !== undefined) { updates.push("dateStart = ?"); values.push(body.dateStart); }
  if (body.dateEnd !== undefined) { updates.push("dateEnd = ?"); values.push(body.dateEnd); }
  if (body.tagline !== undefined) { updates.push("tagline = ?"); values.push(body.tagline); }
  if (body.note !== undefined) { updates.push("note = ?"); values.push(body.note || null); }
  if (body.focusAreas !== undefined) { updates.push("focusAreas = ?"); values.push(JSON.stringify(body.focusAreas)); }
  if (body.achievements !== undefined) { updates.push("achievements = ?"); values.push(JSON.stringify(body.achievements)); }
  if (body.logo !== undefined) { updates.push("logo = ?"); values.push(body.logo || null); }

  if (updates.length === 0) {
    throw new ValidationError("No fields to update");
  }

  values.push(id);
  db.prepare(`UPDATE education SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  const updated = db.prepare("SELECT * FROM education WHERE id = ?").get(id) as any;
  return NextResponse.json({
    ...updated,
    focusAreas: JSON.parse(updated.focusAreas || "[]"),
    achievements: JSON.parse(updated.achievements || "[]"),
  });
});

/**
 * DELETE /api/cv/education/[id]
 *
 * Delete an education entry.
 */
export const DELETE = withErrorHandler(async (
  _request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(stringIdParamSchema, resolvedParams);
  const db = getDatabase();

  const result = db.prepare("DELETE FROM education WHERE id = ?").run(id);
  if (result.changes === 0) {
    throw new NotFoundError("Education", id);
  }

  return NextResponse.json({ success: true });
});
