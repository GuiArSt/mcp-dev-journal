import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireParams, requireBody } from "@/lib/validations";
import { stringIdParamSchema, updateSkillSchema } from "@/lib/validations/schemas";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * GET /api/cv/skills/[id]
 *
 * Get a skill by ID.
 */
export const GET = withErrorHandler(async (
  _request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(stringIdParamSchema, resolvedParams);
  const db = getDatabase();

  const skill = db.prepare("SELECT * FROM skills WHERE id = ?").get(id) as any;
  if (!skill) {
    throw new NotFoundError("Skill", id);
  }

  return NextResponse.json({
    ...skill,
    tags: JSON.parse(skill.tags || "[]"),
  });
});

/**
 * PUT /api/cv/skills/[id]
 *
 * Update a skill.
 */
export const PUT = withErrorHandler(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(stringIdParamSchema, resolvedParams);
  const db = getDatabase();
  const body = await requireBody(updateSkillSchema, request);

  const existing = db.prepare("SELECT * FROM skills WHERE id = ?").get(id);
  if (!existing) {
    throw new NotFoundError("Skill", id);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (body.name !== undefined) { updates.push("name = ?"); values.push(body.name); }
  if (body.category !== undefined) { updates.push("category = ?"); values.push(body.category); }
  if (body.magnitude !== undefined) { updates.push("magnitude = ?"); values.push(body.magnitude); }
  if (body.description !== undefined) { updates.push("description = ?"); values.push(body.description); }
  if (body.icon !== undefined) { updates.push("icon = ?"); values.push(body.icon || null); }
  if (body.color !== undefined) { updates.push("color = ?"); values.push(body.color || null); }
  if (body.url !== undefined) { updates.push("url = ?"); values.push(body.url || null); }
  if (body.tags !== undefined) { updates.push("tags = ?"); values.push(JSON.stringify(body.tags)); }
  if (body.firstUsed !== undefined) { updates.push("firstUsed = ?"); values.push(body.firstUsed || null); }
  if (body.lastUsed !== undefined) { updates.push("lastUsed = ?"); values.push(body.lastUsed || null); }

  if (updates.length === 0) {
    throw new ValidationError("No fields to update");
  }

  values.push(id);
  db.prepare(`UPDATE skills SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  const updated = db.prepare("SELECT * FROM skills WHERE id = ?").get(id) as any;
  return NextResponse.json({
    ...updated,
    tags: JSON.parse(updated.tags || "[]"),
  });
});

/**
 * DELETE /api/cv/skills/[id]
 *
 * Delete a skill.
 */
export const DELETE = withErrorHandler(async (
  _request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(stringIdParamSchema, resolvedParams);
  const db = getDatabase();

  const result = db.prepare("DELETE FROM skills WHERE id = ?").run(id);
  if (result.changes === 0) {
    throw new NotFoundError("Skill", id);
  }

  return NextResponse.json({ success: true });
});
