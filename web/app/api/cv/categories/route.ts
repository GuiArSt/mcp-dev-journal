import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody } from "@/lib/validations";
import { createCategorySchema } from "@/lib/validations/schemas";
import { ConflictError } from "@/lib/errors";

/**
 * GET /api/cv/categories
 *
 * List all skill categories.
 */
export const GET = withErrorHandler(async () => {
  const db = getDatabase();
  const categories = db
    .prepare("SELECT * FROM skill_categories ORDER BY sortOrder ASC")
    .all() as any[];

  return NextResponse.json(categories);
});

/**
 * POST /api/cv/categories
 *
 * Create a new skill category.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const db = getDatabase();
  const body = await requireBody(createCategorySchema, request);

  // Generate ID from name
  const id = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  // Get max sortOrder
  const maxOrder = db.prepare("SELECT MAX(sortOrder) as max FROM skill_categories").get() as { max: number | null };
  const sortOrder = (maxOrder.max || 0) + 1;

  try {
    db.prepare(
      "INSERT INTO skill_categories (id, name, color, icon, sortOrder) VALUES (?, ?, ?, ?, ?)"
    ).run(id, body.name, body.color, body.icon, sortOrder);
  } catch (error: any) {
    if (error.message?.includes("UNIQUE constraint")) {
      throw new ConflictError("Category with this name already exists");
    }
    throw error;
  }

  const created = db.prepare("SELECT * FROM skill_categories WHERE id = ?").get(id);
  return NextResponse.json(created, { status: 201 });
});
