import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireParams, requireBody } from "@/lib/validations";
import { stringIdParamSchema, updateCategorySchema } from "@/lib/validations/schemas";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/errors";

/**
 * GET /api/cv/categories/[id]
 *
 * Get a skill category by ID.
 */
export const GET = withErrorHandler(async (
  _request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(stringIdParamSchema, resolvedParams);
  const db = getDatabase();

  const category = db.prepare("SELECT * FROM skill_categories WHERE id = ?").get(id);
  if (!category) {
    throw new NotFoundError("Category", id);
  }

  return NextResponse.json(category);
});

/**
 * PUT /api/cv/categories/[id]
 *
 * Update a skill category.
 */
export const PUT = withErrorHandler(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(stringIdParamSchema, resolvedParams);
  const db = getDatabase();
  const body = await requireBody(updateCategorySchema, request);

  const existing = db.prepare("SELECT * FROM skill_categories WHERE id = ?").get(id) as any;
  if (!existing) {
    throw new NotFoundError("Category", id);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (body.name !== undefined) { updates.push("name = ?"); values.push(body.name); }
  if (body.color !== undefined) { updates.push("color = ?"); values.push(body.color); }
  if (body.icon !== undefined) { updates.push("icon = ?"); values.push(body.icon); }
  if (body.sortOrder !== undefined) { updates.push("sortOrder = ?"); values.push(body.sortOrder); }

  if (updates.length === 0) {
    throw new ValidationError("No fields to update");
  }

  values.push(id);

  try {
    db.prepare(`UPDATE skill_categories SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  } catch (error: any) {
    if (error.message?.includes("UNIQUE constraint")) {
      throw new ConflictError("Category with this name already exists");
    }
    throw error;
  }

  // If name changed, update all skills with this category
  if (body.name !== undefined && body.name !== existing.name) {
    db.prepare("UPDATE skills SET category = ? WHERE category = ?").run(body.name, existing.name);
  }

  const updated = db.prepare("SELECT * FROM skill_categories WHERE id = ?").get(id);
  return NextResponse.json(updated);
});

/**
 * DELETE /api/cv/categories/[id]
 *
 * Delete a skill category.
 */
export const DELETE = withErrorHandler(async (
  _request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(stringIdParamSchema, resolvedParams);
  const db = getDatabase();

  const existing = db.prepare("SELECT * FROM skill_categories WHERE id = ?").get(id) as any;
  if (!existing) {
    throw new NotFoundError("Category", id);
  }

  // Check if there are skills using this category
  const skillsUsingCategory = db.prepare("SELECT COUNT(*) as count FROM skills WHERE category = ?").get(existing.name) as { count: number };
  if (skillsUsingCategory.count > 0) {
    throw new ValidationError(
      `Cannot delete category with ${skillsUsingCategory.count} skills. Reassign skills first.`
    );
  }

  db.prepare("DELETE FROM skill_categories WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
});
