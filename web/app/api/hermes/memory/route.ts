import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { getDefaultHermesMemory, HermesMemory } from "@/lib/ai/hermes";

interface HermesMemoryItem {
  id: number;
  content: string;
  source_language: string | null;
  target_language: string | null;
  tags: string;
  frequency: number;
  updated_at: string;
}

interface HermesDictionaryTerm {
  id: number;
  term: string;
  preserve_as: string | null;
  source_language: string | null;
}

interface HermesStatsRow {
  total_translations: number;
  total_characters_translated: number;
  language_pairs_used: string;
  updated_at: string;
}

/**
 * GET /api/hermes/memory
 * Retrieve user's Hermes memory from normalized tables
 */
export const GET = withErrorHandler(async () => {
  const db = getDatabase();
  const userId = "default";

  // Get memories from normalized table
  const memories = db
    .prepare("SELECT id, content, source_language, target_language, tags, frequency, updated_at FROM hermes_memories WHERE user_id = ? ORDER BY frequency DESC, updated_at DESC")
    .all(userId) as HermesMemoryItem[];

  // Get dictionary from normalized table
  const dictTerms = db
    .prepare("SELECT id, term, preserve_as, source_language FROM hermes_dictionary WHERE user_id = ?")
    .all(userId) as HermesDictionaryTerm[];

  // Get stats
  const stats = db
    .prepare("SELECT total_translations, total_characters_translated, language_pairs_used, updated_at FROM hermes_stats WHERE user_id = ?")
    .get(userId) as HermesStatsRow | undefined;

  // Build response
  const memory: HermesMemory = {
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
      createdAt: m.updated_at,
    })),
    totalTranslations: stats?.total_translations || 0,
    languagePairs: JSON.parse(stats?.language_pairs_used || "{}"),
  };

  return NextResponse.json({
    memory,
    stats: {
      totalTranslations: stats?.total_translations || 0,
      totalCharactersTranslated: stats?.total_characters_translated || 0,
      languagePairs: JSON.parse(stats?.language_pairs_used || "{}"),
      protectedTerms: dictTerms.length,
      memoryEntries: memories.length,
    },
    updatedAt: stats?.updated_at || null,
  });
});

/**
 * POST /api/hermes/memory
 * Save confirmed learnings to memory (normalized tables)
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const { patterns, protectedTerms, sourceLanguage, targetLanguage, label } = await request.json();

  const db = getDatabase();
  const userId = "default";

  let addedMemories = 0;
  let addedTerms = 0;

  // Add new protected terms
  if (protectedTerms && Array.isArray(protectedTerms)) {
    const insertTerm = db.prepare(
      "INSERT OR IGNORE INTO hermes_dictionary (user_id, term, preserve_as, source_language) VALUES (?, ?, ?, ?)"
    );
    for (const item of protectedTerms) {
      const term = typeof item === "string" ? item : item.term;
      const preserveAs = typeof item === "string" ? null : item.preserveAs || null;
      const langSource = typeof item === "string" ? sourceLanguage || null : item.sourceLanguage || null;
      const result = insertTerm.run(userId, term, preserveAs, langSource);
      if (result.changes > 0) addedTerms++;
    }
  }

  // Add new patterns as memory entries
  if (patterns && Array.isArray(patterns)) {
    const insertMemory = db.prepare(
      `INSERT INTO hermes_memories (user_id, content, source_language, target_language, tags) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, content) DO UPDATE SET
         frequency = frequency + 1,
         updated_at = CURRENT_TIMESTAMP`
    );
    const tags = label ? JSON.stringify([label]) : "[]";
    for (const pattern of patterns) {
      insertMemory.run(userId, pattern, sourceLanguage || null, targetLanguage || null, tags);
      addedMemories++;
    }
  }

  // Get updated counts
  const { count: memoryCount } = db
    .prepare("SELECT COUNT(*) as count FROM hermes_memories WHERE user_id = ?")
    .get(userId) as { count: number };
  const { count: dictCount } = db
    .prepare("SELECT COUNT(*) as count FROM hermes_dictionary WHERE user_id = ?")
    .get(userId) as { count: number };

  return NextResponse.json({
    success: true,
    added: {
      memories: addedMemories,
      protectedTerms: addedTerms,
    },
    stats: {
      protectedTerms: dictCount,
      memoryEntries: memoryCount,
    },
  });
});

/**
 * PATCH /api/hermes/memory
 * Update specific parts of memory (add/remove protected terms)
 */
export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const { action, term, preserveAs, sourceLanguage } = await request.json();

  if (!term || typeof term !== "string") {
    throw new ValidationError("Term is required");
  }

  const db = getDatabase();
  const userId = "default";

  if (action === "add") {
    db.prepare(
      "INSERT OR IGNORE INTO hermes_dictionary (user_id, term, preserve_as, source_language) VALUES (?, ?, ?, ?)"
    ).run(userId, term, preserveAs || null, sourceLanguage || null);
  } else if (action === "remove") {
    db.prepare(
      "DELETE FROM hermes_dictionary WHERE user_id = ? AND term = ?"
    ).run(userId, term);
  } else {
    throw new ValidationError("Invalid action. Use 'add' or 'remove'");
  }

  // Get updated dictionary
  const dictTerms = db
    .prepare("SELECT term, preserve_as, source_language FROM hermes_dictionary WHERE user_id = ?")
    .all(userId) as { term: string; preserve_as: string | null; source_language: string | null }[];

  return NextResponse.json({
    success: true,
    protectedTerms: dictTerms.map((t) => ({
      term: t.term,
      preserveAs: t.preserve_as || undefined,
      sourceLanguage: t.source_language || undefined,
    })),
  });
});

/**
 * DELETE /api/hermes/memory
 * Reset memory to defaults
 */
export const DELETE = withErrorHandler(async () => {
  const db = getDatabase();
  const userId = "default";
  const defaultMemory = getDefaultHermesMemory();

  // Clear all normalized tables for this user
  db.prepare("DELETE FROM hermes_memories WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM hermes_dictionary WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM hermes_stats WHERE user_id = ?").run(userId);

  // Re-insert default protected terms
  const insertTerm = db.prepare(
    "INSERT INTO hermes_dictionary (user_id, term) VALUES (?, ?)"
  );
  for (const item of defaultMemory.protectedTerms) {
    insertTerm.run(userId, item.term);
  }

  // Initialize stats
  db.prepare(
    "INSERT INTO hermes_stats (user_id, total_translations, language_pairs_used) VALUES (?, 0, '{}')"
  ).run(userId);

  return NextResponse.json({
    success: true,
    message: "Memory reset to defaults",
  });
});
