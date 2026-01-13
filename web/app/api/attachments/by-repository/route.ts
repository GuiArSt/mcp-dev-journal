import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireQuery } from "@/lib/validations";
import { z } from "zod";

const byRepoQuerySchema = z.object({
  repository: z.string().min(1, "Repository parameter is required"),
});

/**
 * GET /api/attachments/by-repository
 *
 * List attachments for a specific repository.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const db = getDatabase();
  const { repository } = requireQuery(byRepoQuerySchema, request);

  const attachments = db.prepare(`
    SELECT
      ea.id,
      ea.commit_hash,
      ea.filename,
      ea.mime_type,
      ea.description,
      ea.file_size as size,
      ea.uploaded_at as created_at,
      je.repository,
      je.branch
    FROM entry_attachments ea
    JOIN journal_entries je ON ea.commit_hash = je.commit_hash
    WHERE je.repository = ?
    ORDER BY ea.uploaded_at DESC
  `).all(repository);

  return NextResponse.json({
    attachments,
    total: attachments.length,
  });
});
