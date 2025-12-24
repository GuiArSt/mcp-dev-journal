import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import {
  CorrectionResponseSchema,
  getAtroposSystemPrompt,
  buildCorrectionUserPrompt,
  AtroposMemory,
} from "@/lib/ai/atropos";

interface AtroposMemoryItem {
  id: number;
  user_id: string;
  content: string;
  tags: string;
  frequency: number;
}

interface AtroposDictionaryTerm {
  term: string;
}

interface AtroposStatsRow {
  total_checks: number;
  total_corrections: number;
}

/**
 * Load memory from normalized tables
 */
function loadAtroposMemory(db: ReturnType<typeof getDatabase>, userId: string): AtroposMemory {
  // Get memories
  const memories = db
    .prepare("SELECT content, tags FROM atropos_memories WHERE user_id = ? ORDER BY frequency DESC, updated_at DESC")
    .all(userId) as AtroposMemoryItem[];

  // Get dictionary terms
  const dictTerms = db
    .prepare("SELECT term FROM atropos_dictionary WHERE user_id = ?")
    .all(userId) as AtroposDictionaryTerm[];

  // Get stats
  const stats = db
    .prepare("SELECT total_checks, total_corrections FROM atropos_stats WHERE user_id = ?")
    .get(userId) as AtroposStatsRow | undefined;

  return {
    customDictionary: dictTerms.map((t) => t.term),
    memories: memories.map((m) => ({
      content: m.content,
      tags: JSON.parse(m.tags || "[]"),
    })),
    totalChecks: stats?.total_checks || 0,
    totalCorrections: stats?.total_corrections || 0,
  };
}

/**
 * Save correction to history
 */
function saveCorrection(
  db: ReturnType<typeof getDatabase>,
  userId: string,
  originalText: string,
  correctedText: string,
  hadChanges: boolean,
  intentQuestions: string[],
  sourceContext?: string
) {
  db.prepare(
    `INSERT INTO atropos_corrections (user_id, original_text, corrected_text, had_changes, intent_questions, source_context)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId, originalText, correctedText, hadChanges ? 1 : 0, JSON.stringify(intentQuestions), sourceContext || null);
}

/**
 * Update stats in normalized table
 */
function updateStats(db: ReturnType<typeof getDatabase>, userId: string, hadChanges: boolean, charsDiff: number) {
  db.prepare(
    `INSERT INTO atropos_stats (user_id, total_checks, total_corrections, total_characters_corrected)
     VALUES (?, 1, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       total_checks = total_checks + 1,
       total_corrections = total_corrections + ?,
       total_characters_corrected = total_characters_corrected + ?,
       updated_at = CURRENT_TIMESTAMP`
  ).run(userId, hadChanges ? 1 : 0, charsDiff, hadChanges ? 1 : 0, charsDiff);
}

/**
 * POST /api/atropos/correct
 * Correct text using Atropos with structured output
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const { text, answers, sourceContext } = await request.json();

  if (!text || typeof text !== "string") {
    throw new ValidationError("Text is required");
  }

  if (text.length > 50000) {
    throw new ValidationError("Text too long. Maximum 50,000 characters.");
  }

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Anthropic API key not configured");
  }

  const db = getDatabase();
  const userId = "default";

  // Load memory from normalized tables
  const memory = loadAtroposMemory(db, userId);

  // Build prompts
  const systemPrompt = getAtroposSystemPrompt(memory);
  const userPrompt = buildCorrectionUserPrompt(text, answers);

  // Call Haiku 4.5 with structured output
  const { object: response } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: CorrectionResponseSchema,
    system: systemPrompt,
    prompt: userPrompt,
  });

  // Calculate character difference for stats
  const charsDiff = Math.abs(response.correctedText.length - text.length);

  // Save correction to history (async, don't block response)
  try {
    saveCorrection(
      db,
      userId,
      text,
      response.correctedText,
      response.hadChanges,
      (response.intentQuestions || []).map(q => q.question),
      sourceContext
    );
  } catch (e) {
    console.error("[Atropos] Failed to save correction:", e);
  }

  // Update stats (async, don't block response)
  try {
    updateStats(db, userId, response.hadChanges, charsDiff);
  } catch (e) {
    console.error("[Atropos] Failed to update stats:", e);
  }

  return NextResponse.json({
    correctedText: response.correctedText,
    hadChanges: response.hadChanges,
    intentQuestions: response.intentQuestions || [],
  });
});
