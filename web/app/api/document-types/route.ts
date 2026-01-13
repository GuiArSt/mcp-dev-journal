import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody } from "@/lib/validations";
import { ConflictError } from "@/lib/errors";
import { z } from "zod";

const createDocumentTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().default(""),
  color: z.string().default("emerald"),
  icon: z.string().default("file-text"),
});

/**
 * GET /api/document-types
 *
 * List all document types.
 */
export const GET = withErrorHandler(async () => {
  const db = getDatabase();
  const types = db.prepare("SELECT * FROM document_types ORDER BY sortOrder ASC").all();
  return NextResponse.json(types);
});

/**
 * POST /api/document-types
 *
 * Create a new document type.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const db = getDatabase();
  const body = await requireBody(createDocumentTypeSchema, request);

  // Generate ID from name
  const id = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  // Get max sortOrder
  const maxOrder = db.prepare("SELECT MAX(sortOrder) as max FROM document_types").get() as { max: number | null };
  const sortOrder = (maxOrder?.max || 0) + 1;

  try {
    db.prepare("INSERT INTO document_types (id, name, description, color, icon, sortOrder) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, body.name, body.description, body.color, body.icon, sortOrder);
  } catch (error: any) {
    if (error.message?.includes("UNIQUE constraint")) {
      throw new ConflictError("Document type with this name already exists");
    }
    throw error;
  }

  const created = db.prepare("SELECT * FROM document_types WHERE id = ?").get(id);
  return NextResponse.json(created, { status: 201 });
});
