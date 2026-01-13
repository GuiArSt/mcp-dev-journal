import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireQuery } from "@/lib/validations";
import { z } from "zod";

const attachmentQuerySchema = z.object({
  type: z.enum(["image", "mermaid"]).optional(),
});

/**
 * GET /api/attachments
 *
 * List all attachments with optional type filter.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const db = getDatabase();
  const { type } = requireQuery(attachmentQuerySchema, request);

  let query = `
    SELECT
      id,
      commit_hash,
      filename,
      mime_type,
      description,
      file_size as size,
      uploaded_at as created_at
    FROM entry_attachments
  `;

  if (type === "image") {
    query += " WHERE mime_type LIKE 'image/%'";
  } else if (type === "mermaid") {
    query += " WHERE filename LIKE '%.mmd' OR filename LIKE '%.mermaid'";
  }

  query += " ORDER BY uploaded_at DESC";

  const attachments = db.prepare(query).all();

  return NextResponse.json({
    attachments,
    total: attachments.length,
  });
});
