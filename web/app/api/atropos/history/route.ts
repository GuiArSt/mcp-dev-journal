import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { z } from "zod";

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  source: z.string().optional(),
  hasChanges: z.enum(["true", "false"]).optional(),
});

interface CorrectionRow {
  id: number;
  user_id: string;
  original_text: string;
  corrected_text: string;
  had_changes: number;
  intent_questions: string;
  source_context: string | null;
  created_at: string;
}

/**
 * GET /api/atropos/history
 * Get correction history with pagination and filtering
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const params = querySchema.parse({
    limit: searchParams.get("limit") || 20,
    offset: searchParams.get("offset") || 0,
    source: searchParams.get("source") || undefined,
    hasChanges: searchParams.get("hasChanges") || undefined,
  });

  const db = getDatabase();
  const userId = "default";

  // Build query with optional filters
  let query = "SELECT * FROM atropos_corrections WHERE user_id = ?";
  const queryParams: (string | number)[] = [userId];

  if (params.source) {
    query += " AND source_context LIKE ?";
    queryParams.push(`%${params.source}%`);
  }

  if (params.hasChanges !== undefined) {
    query += " AND had_changes = ?";
    queryParams.push(params.hasChanges === "true" ? 1 : 0);
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  queryParams.push(params.limit, params.offset);

  const corrections = db.prepare(query).all(...queryParams) as CorrectionRow[];

  // Get total count
  let countQuery = "SELECT COUNT(*) as count FROM atropos_corrections WHERE user_id = ?";
  const countParams: (string | number)[] = [userId];

  if (params.source) {
    countQuery += " AND source_context LIKE ?";
    countParams.push(`%${params.source}%`);
  }

  if (params.hasChanges !== undefined) {
    countQuery += " AND had_changes = ?";
    countParams.push(params.hasChanges === "true" ? 1 : 0);
  }

  const { count: total } = db.prepare(countQuery).get(...countParams) as { count: number };

  // Format response
  const formattedCorrections = corrections.map((c) => ({
    id: c.id,
    originalText: c.original_text,
    correctedText: c.corrected_text,
    hadChanges: c.had_changes === 1,
    intentQuestions: JSON.parse(c.intent_questions || "[]"),
    sourceContext: c.source_context,
    createdAt: c.created_at,
    // Include a diff preview (first 200 chars)
    preview: c.original_text.substring(0, 200) + (c.original_text.length > 200 ? "..." : ""),
  }));

  return NextResponse.json({
    corrections: formattedCorrections,
    total,
    limit: params.limit,
    offset: params.offset,
    hasMore: params.offset + corrections.length < total,
  });
});

/**
 * DELETE /api/atropos/history
 * Clear correction history (optionally by date range)
 */
export const DELETE = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before"); // ISO date string

  const db = getDatabase();
  const userId = "default";

  let result;
  if (before) {
    result = db
      .prepare("DELETE FROM atropos_corrections WHERE user_id = ? AND created_at < ?")
      .run(userId, before);
  } else {
    result = db.prepare("DELETE FROM atropos_corrections WHERE user_id = ?").run(userId);
  }

  return NextResponse.json({
    success: true,
    deleted: result.changes,
  });
});
