import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireParams, requireQuery, requireBody } from "@/lib/validations";
import { idParamSchema } from "@/lib/validations/schemas";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { z } from "zod";

const mediaDetailQuerySchema = z.object({
  include_data: z.coerce.boolean().default(false),
});

const updateMediaSchema = z.object({
  filename: z.string().min(1).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  destination: z.enum(["journal", "repository", "media"]).optional(),
  commit_hash: z.string().optional().nullable(),
  document_id: z.number().optional().nullable(),
});

/**
 * GET /api/media/[id]
 *
 * Get a specific media asset (with or without data).
 */
export const GET = withErrorHandler(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(idParamSchema, resolvedParams);
  const { include_data } = requireQuery(mediaDetailQuerySchema, request);

  const db = getDatabase();
  const columns = include_data
    ? "*"
    : "id, filename, mime_type, file_size, description, prompt, model, tags, destination, commit_hash, document_id, created_at, updated_at";

  const asset = db.prepare(`SELECT ${columns} FROM media_assets WHERE id = ?`).get(id);

  if (!asset) {
    throw new NotFoundError("Media asset", String(id));
  }

  return NextResponse.json(asset);
});

/**
 * PATCH /api/media/[id]
 *
 * Update media asset metadata.
 */
export const PATCH = withErrorHandler(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(idParamSchema, resolvedParams);
  const db = getDatabase();
  const body = await requireBody(updateMediaSchema, request);

  const existing = db.prepare("SELECT id FROM media_assets WHERE id = ?").get(id);
  if (!existing) {
    throw new NotFoundError("Media asset", String(id));
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (body.filename !== undefined) { updates.push("filename = ?"); values.push(body.filename); }
  if (body.description !== undefined) { updates.push("description = ?"); values.push(body.description); }
  if (body.tags !== undefined) { updates.push("tags = ?"); values.push(JSON.stringify(body.tags)); }
  if (body.destination !== undefined) { updates.push("destination = ?"); values.push(body.destination); }
  if (body.commit_hash !== undefined) { updates.push("commit_hash = ?"); values.push(body.commit_hash); }
  if (body.document_id !== undefined) { updates.push("document_id = ?"); values.push(body.document_id); }

  if (updates.length === 0) {
    throw new ValidationError("No fields to update");
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  db.prepare(`UPDATE media_assets SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  return NextResponse.json({ message: "Media asset updated" });
});

/**
 * DELETE /api/media/[id]
 *
 * Delete a media asset.
 */
export const DELETE = withErrorHandler(async (
  _request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(idParamSchema, resolvedParams);
  const db = getDatabase();

  const result = db.prepare("DELETE FROM media_assets WHERE id = ?").run(id);

  if (result.changes === 0) {
    throw new NotFoundError("Media asset", String(id));
  }

  return NextResponse.json({ message: "Media asset deleted" });
});
