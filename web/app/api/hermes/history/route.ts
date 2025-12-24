import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { z } from "zod";
import { getLanguageName } from "@/lib/ai/hermes";

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  sourceLanguage: z.string().optional(),
  targetLanguage: z.string().optional(),
  tone: z.enum(["formal", "neutral", "slang"]).optional(),
  source: z.string().optional(),
});

interface TranslationRow {
  id: number;
  user_id: string;
  original_text: string;
  translated_text: string;
  source_language: string;
  target_language: string;
  tone: string;
  had_changes: number;
  clarification_questions: string;
  source_context: string | null;
  created_at: string;
}

/**
 * GET /api/hermes/history
 * Get translation history with pagination and filtering
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const params = querySchema.parse({
    limit: searchParams.get("limit") || 20,
    offset: searchParams.get("offset") || 0,
    sourceLanguage: searchParams.get("sourceLanguage") || undefined,
    targetLanguage: searchParams.get("targetLanguage") || undefined,
    tone: searchParams.get("tone") || undefined,
    source: searchParams.get("source") || undefined,
  });

  const db = getDatabase();
  const userId = "default";

  // Build query with optional filters
  let query = "SELECT * FROM hermes_translations WHERE user_id = ?";
  const queryParams: (string | number)[] = [userId];

  if (params.sourceLanguage) {
    query += " AND source_language = ?";
    queryParams.push(params.sourceLanguage);
  }

  if (params.targetLanguage) {
    query += " AND target_language = ?";
    queryParams.push(params.targetLanguage);
  }

  if (params.tone) {
    query += " AND tone = ?";
    queryParams.push(params.tone);
  }

  if (params.source) {
    query += " AND source_context LIKE ?";
    queryParams.push(`%${params.source}%`);
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  queryParams.push(params.limit, params.offset);

  const translations = db.prepare(query).all(...queryParams) as TranslationRow[];

  // Get total count
  let countQuery = "SELECT COUNT(*) as count FROM hermes_translations WHERE user_id = ?";
  const countParams: (string | number)[] = [userId];

  if (params.sourceLanguage) {
    countQuery += " AND source_language = ?";
    countParams.push(params.sourceLanguage);
  }

  if (params.targetLanguage) {
    countQuery += " AND target_language = ?";
    countParams.push(params.targetLanguage);
  }

  if (params.tone) {
    countQuery += " AND tone = ?";
    countParams.push(params.tone);
  }

  if (params.source) {
    countQuery += " AND source_context LIKE ?";
    countParams.push(`%${params.source}%`);
  }

  const { count: total } = db.prepare(countQuery).get(...countParams) as { count: number };

  // Get unique language pairs for filtering UI
  const languagePairs = db
    .prepare(
      "SELECT DISTINCT source_language, target_language FROM hermes_translations WHERE user_id = ?"
    )
    .all(userId) as { source_language: string; target_language: string }[];

  // Format response
  const formattedTranslations = translations.map((t) => ({
    id: t.id,
    originalText: t.original_text,
    translatedText: t.translated_text,
    sourceLanguage: t.source_language,
    targetLanguage: t.target_language,
    sourceLanguageName: getLanguageName(t.source_language),
    targetLanguageName: getLanguageName(t.target_language),
    tone: t.tone,
    hadChanges: t.had_changes === 1,
    clarificationQuestions: JSON.parse(t.clarification_questions || "[]"),
    sourceContext: t.source_context,
    createdAt: t.created_at,
    // Include a preview (first 200 chars)
    preview: t.original_text.substring(0, 200) + (t.original_text.length > 200 ? "..." : ""),
  }));

  return NextResponse.json({
    translations: formattedTranslations,
    total,
    limit: params.limit,
    offset: params.offset,
    hasMore: params.offset + translations.length < total,
    languagePairs: languagePairs.map((p) => ({
      source: p.source_language,
      target: p.target_language,
      sourceName: getLanguageName(p.source_language),
      targetName: getLanguageName(p.target_language),
      label: `${getLanguageName(p.source_language)} → ${getLanguageName(p.target_language)}`,
    })),
  });
});

/**
 * DELETE /api/hermes/history
 * Clear translation history (optionally by date range or language pair)
 */
export const DELETE = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before"); // ISO date string
  const sourceLanguage = searchParams.get("sourceLanguage");
  const targetLanguage = searchParams.get("targetLanguage");

  const db = getDatabase();
  const userId = "default";

  let query = "DELETE FROM hermes_translations WHERE user_id = ?";
  const queryParams: (string | number)[] = [userId];

  if (before) {
    query += " AND created_at < ?";
    queryParams.push(before);
  }

  if (sourceLanguage) {
    query += " AND source_language = ?";
    queryParams.push(sourceLanguage);
  }

  if (targetLanguage) {
    query += " AND target_language = ?";
    queryParams.push(targetLanguage);
  }

  const result = db.prepare(query).run(...queryParams);

  return NextResponse.json({
    success: true,
    deleted: result.changes,
  });
});
