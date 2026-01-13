import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireParams, requireBody } from "@/lib/validations";
import { stringIdParamSchema } from "@/lib/validations/schemas";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/errors";
import { z } from "zod";

const updateDocumentTypeSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().optional(),
});

/**
 * GET /api/document-types/[id]
 *
 * Get a document type by ID.
 */
export const GET = withErrorHandler(async (
  _request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(stringIdParamSchema, resolvedParams);
  const db = getDatabase();

  const docType = db.prepare("SELECT * FROM document_types WHERE id = ?").get(id);
  if (!docType) {
    throw new NotFoundError("Document type", id);
  }

  return NextResponse.json(docType);
});

/**
 * PUT /api/document-types/[id]
 *
 * Update a document type.
 */
export const PUT = withErrorHandler(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(stringIdParamSchema, resolvedParams);
  const db = getDatabase();
  const body = await requireBody(updateDocumentTypeSchema, request);

  const existing = db.prepare("SELECT * FROM document_types WHERE id = ?").get(id) as any;
  if (!existing) {
    throw new NotFoundError("Document type", id);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (body.name !== undefined) { updates.push("name = ?"); values.push(body.name); }
  if (body.description !== undefined) { updates.push("description = ?"); values.push(body.description); }
  if (body.color !== undefined) { updates.push("color = ?"); values.push(body.color); }
  if (body.icon !== undefined) { updates.push("icon = ?"); values.push(body.icon); }
  if (body.sortOrder !== undefined) { updates.push("sortOrder = ?"); values.push(body.sortOrder); }

  if (updates.length === 0) {
    throw new ValidationError("No fields to update");
  }

  values.push(id);

  try {
    db.prepare(`UPDATE document_types SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  } catch (error: any) {
    if (error.message?.includes("UNIQUE constraint")) {
      throw new ConflictError("Document type with this name already exists");
    }
    throw error;
  }

  // If name changed, update all documents with this type
  if (body.name !== undefined && body.name !== existing.name) {
    const docs = db.prepare("SELECT id, metadata FROM documents WHERE json_extract(metadata, '$.type') = ?").all(existing.name) as any[];
    const updateDoc = db.prepare("UPDATE documents SET metadata = ? WHERE id = ?");
    for (const doc of docs) {
      const meta = JSON.parse(doc.metadata || "{}");
      meta.type = body.name;
      updateDoc.run(JSON.stringify(meta), doc.id);
    }
  }

  const updated = db.prepare("SELECT * FROM document_types WHERE id = ?").get(id);
  return NextResponse.json(updated);
});

/**
 * DELETE /api/document-types/[id]
 *
 * Delete a document type.
 */
export const DELETE = withErrorHandler(async (
  _request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(stringIdParamSchema, resolvedParams);
  const db = getDatabase();

  const existing = db.prepare("SELECT * FROM document_types WHERE id = ?").get(id) as any;
  if (!existing) {
    throw new NotFoundError("Document type", id);
  }

  // Check if there are documents using this type
  const docsUsingType = db.prepare("SELECT COUNT(*) as count FROM documents WHERE json_extract(metadata, '$.type') = ?").get(existing.name) as { count: number };
  if (docsUsingType.count > 0) {
    throw new ValidationError(
      `Cannot delete type with ${docsUsingType.count} documents. Reassign documents first.`
    );
  }

  db.prepare("DELETE FROM document_types WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
});
