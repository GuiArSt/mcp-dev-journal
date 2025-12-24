import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import {
  TranslationResponseSchema,
  getHermesSystemPrompt,
  buildTranslationUserPrompt,
  HermesMemory,
  TranslationTone,
  SUPPORTED_LANGUAGES,
} from "@/lib/ai/hermes";

interface HermesMemoryItem {
  id: number;
  user_id: string;
  content: string;
  source_language: string | null;
  target_language: string | null;
  tags: string;
  frequency: number;
}

interface HermesDictionaryTerm {
  term: string;
  preserve_as: string | null;
  source_language: string | null;
}

interface HermesStatsRow {
  total_translations: number;
  language_pairs_used: string;
}

/**
 * Load memory from normalized tables
 */
function loadHermesMemory(db: ReturnType<typeof getDatabase>, userId: string): HermesMemory {
  // Get memories
  const memories = db
    .prepare("SELECT content, source_language, target_language, tags FROM hermes_memories WHERE user_id = ? ORDER BY frequency DESC, updated_at DESC")
    .all(userId) as HermesMemoryItem[];

  // Get dictionary terms
  const dictTerms = db
    .prepare("SELECT term, preserve_as, source_language FROM hermes_dictionary WHERE user_id = ?")
    .all(userId) as HermesDictionaryTerm[];

  // Get stats
  const stats = db
    .prepare("SELECT total_translations, language_pairs_used FROM hermes_stats WHERE user_id = ?")
    .get(userId) as HermesStatsRow | undefined;

  return {
    protectedTerms: dictTerms.map((t) => ({
      term: t.term,
      preserveAs: t.preserve_as || undefined,
      sourceLanguage: t.source_language || undefined,
    })),
    memories: memories.map((m) => ({
      content: m.content,
      sourceLanguage: m.source_language || undefined,
      targetLanguage: m.target_language || undefined,
      tags: JSON.parse(m.tags || "[]"),
      createdAt: "",
    })),
    totalTranslations: stats?.total_translations || 0,
    languagePairs: JSON.parse(stats?.language_pairs_used || "{}"),
  };
}

/**
 * Save translation to history
 */
function saveTranslation(
  db: ReturnType<typeof getDatabase>,
  userId: string,
  originalText: string,
  translatedText: string,
  sourceLanguage: string,
  targetLanguage: string,
  tone: TranslationTone,
  hadChanges: boolean,
  clarificationQuestions: string[],
  sourceContext?: string
) {
  db.prepare(
    `INSERT INTO hermes_translations (user_id, original_text, translated_text, source_language, target_language, tone, had_changes, clarification_questions, source_context)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, originalText, translatedText, sourceLanguage, targetLanguage, tone, hadChanges ? 1 : 0, JSON.stringify(clarificationQuestions), sourceContext || null);
}

/**
 * Update stats in normalized table
 */
function updateStats(
  db: ReturnType<typeof getDatabase>,
  userId: string,
  sourceLanguage: string,
  targetLanguage: string,
  charsTranslated: number
) {
  const languagePair = `${sourceLanguage}-${targetLanguage}`;

  // Get current stats
  const current = db
    .prepare("SELECT language_pairs_used FROM hermes_stats WHERE user_id = ?")
    .get(userId) as { language_pairs_used: string } | undefined;

  let pairs: Record<string, number> = {};
  if (current) {
    pairs = JSON.parse(current.language_pairs_used || "{}");
  }
  pairs[languagePair] = (pairs[languagePair] || 0) + 1;

  db.prepare(
    `INSERT INTO hermes_stats (user_id, total_translations, total_characters_translated, language_pairs_used)
     VALUES (?, 1, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       total_translations = total_translations + 1,
       total_characters_translated = total_characters_translated + ?,
       language_pairs_used = ?,
       updated_at = CURRENT_TIMESTAMP`
  ).run(userId, charsTranslated, JSON.stringify(pairs), charsTranslated, JSON.stringify(pairs));
}

/**
 * POST /api/hermes/translate
 * Translate text using Hermes with structured output
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const { text, sourceLanguage, targetLanguage, tone = "neutral", answers, sourceContext } = await request.json();

  if (!text || typeof text !== "string") {
    throw new ValidationError("Text is required");
  }

  if (text.length > 50000) {
    throw new ValidationError("Text too long. Maximum 50,000 characters.");
  }

  if (!sourceLanguage || !targetLanguage) {
    throw new ValidationError("Source and target languages are required");
  }

  if (!["formal", "neutral", "slang"].includes(tone)) {
    throw new ValidationError("Tone must be 'formal', 'neutral', or 'slang'");
  }

  // Validate languages
  const validLanguages = Object.keys(SUPPORTED_LANGUAGES);
  if (!validLanguages.includes(sourceLanguage)) {
    throw new ValidationError(`Unsupported source language: ${sourceLanguage}`);
  }
  if (!validLanguages.includes(targetLanguage)) {
    throw new ValidationError(`Unsupported target language: ${targetLanguage}`);
  }

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Anthropic API key not configured");
  }

  const db = getDatabase();
  const userId = "default";

  // Load memory from normalized tables
  const memory = loadHermesMemory(db, userId);

  // Build prompts
  const systemPrompt = getHermesSystemPrompt(memory);
  const userPrompt = buildTranslationUserPrompt(text, sourceLanguage, targetLanguage, tone as TranslationTone, answers);

  // Call Haiku 4.5 with structured output
  const { object: response } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: TranslationResponseSchema,
    system: systemPrompt,
    prompt: userPrompt,
  });

  // Save translation to history (async, don't block response)
  try {
    saveTranslation(
      db,
      userId,
      text,
      response.translatedText,
      sourceLanguage,
      targetLanguage,
      tone as TranslationTone,
      response.hadChanges,
      response.clarificationQuestions?.map(q => q.question) || [],
      sourceContext
    );
  } catch (e) {
    console.error("[Hermes] Failed to save translation:", e);
  }

  // Update stats (async, don't block response)
  try {
    updateStats(db, userId, sourceLanguage, targetLanguage, text.length);
  } catch (e) {
    console.error("[Hermes] Failed to update stats:", e);
  }

  return NextResponse.json({
    translatedText: response.translatedText,
    hadChanges: response.hadChanges,
    clarificationQuestions: response.clarificationQuestions || [],
    notes: response.notes,
  });
});
