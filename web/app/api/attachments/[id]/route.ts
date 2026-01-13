import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireParams, requireQuery } from "@/lib/validations";
import { idParamSchema } from "@/lib/validations/schemas";
import { NotFoundError } from "@/lib/errors";
import { z } from "zod";

const attachmentDetailQuerySchema = z.object({
  include_data: z.coerce.boolean().default(false),
});

/**
 * GET /api/attachments/[id]
 *
 * Get attachment metadata, optionally with data.
 */
export const GET = withErrorHandler(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(idParamSchema, resolvedParams);
  const { include_data } = requireQuery(attachmentDetailQuerySchema, request);

  const db = getDatabase();

  const query = include_data
    ? `SELECT id, commit_hash, filename, mime_type, description, file_size as size, uploaded_at as created_at, data
       FROM entry_attachments WHERE id = ?`
    : `SELECT id, commit_hash, filename, mime_type, description, file_size as size, uploaded_at as created_at
       FROM entry_attachments WHERE id = ?`;

  const attachment = db.prepare(query).get(id) as {
    id: number;
    commit_hash: string;
    filename: string;
    mime_type: string;
    description: string | null;
    size: number;
    created_at: string;
    data?: Buffer;
  } | undefined;

  if (!attachment) {
    throw new NotFoundError("Attachment", String(id));
  }

  // Convert data to base64 if included
  const response: Record<string, unknown> = {
    id: attachment.id,
    commit_hash: attachment.commit_hash,
    filename: attachment.filename,
    mime_type: attachment.mime_type,
    description: attachment.description,
    size: attachment.size,
    created_at: attachment.created_at,
  };

  if (include_data && attachment.data) {
    response.data_base64 = Buffer.from(attachment.data).toString("base64");
  }

  return NextResponse.json(response);
});
