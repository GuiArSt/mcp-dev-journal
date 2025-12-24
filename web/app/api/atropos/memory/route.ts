import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { ValidationError, NotFoundError } from "@/lib/errors";
import { getDefaultAtroposMemory, AtroposMemory } from "@/lib/ai/atropos";

interface AtroposMemoryItem {
  id: number;
  content: string;
  tags: string;
  frequency: number;
  updated_at: string;
}

interface AtroposDictionaryTerm {
  id: number;
  term: string;
}

interface AtroposStatsRow {
  total_checks: number;
  total_corrections: number;
  total_characters_corrected: number;
  updated_at: string;
}

/**
 * GET /api/atropos/memory
 * Retrieve user's Atropos memory from normalized tables
 */
export const GET = withErrorHandler(async () => {
  const db = getDatabase();
  const userId = "default";

  // Get memories from normalized table
  const memories = db
    .prepare("SELECT id, content, tags, frequency, updated_at FROM atropos_memories WHERE user_id = ? ORDER BY frequency DESC, updated_at DESC")
    .all(userId) as AtroposMemoryItem[];

  // Get dictionary from normalized table
  const dictTerms = db
    .prepare("SELECT id, term FROM atropos_dictionary WHERE user_id = ?")
    .all(userId) as AtroposDictionaryTerm[];

  // Get stats
  const stats = db
    .prepare("SELECT total_checks, total_corrections, total_characters_corrected, updated_at FROM atropos_stats WHERE user_id = ?")
    .get(userId) as AtroposStatsRow | undefined;

  // Build response
  const memory: AtroposMemory = {
    customDictionary: dictTerms.map((t) => t.term),
    memories: memories.map((m) => ({
      content: m.content,
      tags: JSON.parse(m.tags || "[]"),
    })),
    totalChecks: stats?.total_checks || 0,
    totalCorrections: stats?.total_corrections || 0,
  };

  return NextResponse.json({
    memory,
    stats: {
      totalChecks: stats?.total_checks || 0,
      totalCorrections: stats?.total_corrections || 0,
      totalCharactersCorrected: stats?.total_characters_corrected || 0,
      dictionaryWords: dictTerms.length,
      memoryEntries: memories.length,
    },
    updatedAt: stats?.updated_at || null,
  });
});

/**
 * POST /api/atropos/memory
 * Save confirmed learnings to memory (normalized tables)
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const { patterns, dictionaryWords, label } = await request.json();

  const db = getDatabase();
  const userId = "default";

  let addedMemories = 0;
  let addedTerms = 0;

  // Add new dictionary words
  if (dictionaryWords && Array.isArray(dictionaryWords)) {
    const insertTerm = db.prepare(
      "INSERT OR IGNORE INTO atropos_dictionary (user_id, term) VALUES (?, ?)"
    );
    for (const word of dictionaryWords) {
      const result = insertTerm.run(userId, word);
      if (result.changes > 0) addedTerms++;
    }
  }

  // Add new patterns as memory entries
  if (patterns && Array.isArray(patterns)) {
    const insertMemory = db.prepare(
      `INSERT INTO atropos_memories (user_id, content, tags) VALUES (?, ?, ?)
       ON CONFLICT(user_id, content) DO UPDATE SET
         frequency = frequency + 1,
         updated_at = CURRENT_TIMESTAMP`
    );
    const tags = label ? JSON.stringify([label]) : "[]";
    for (const pattern of patterns) {
      insertMemory.run(userId, pattern, tags);
      addedMemories++;
    }
  }

  // Get updated counts
  const { count: memoryCount } = db
    .prepare("SELECT COUNT(*) as count FROM atropos_memories WHERE user_id = ?")
    .get(userId) as { count: number };
  const { count: dictCount } = db
    .prepare("SELECT COUNT(*) as count FROM atropos_dictionary WHERE user_id = ?")
    .get(userId) as { count: number };

  return NextResponse.json({
    success: true,
    added: {
      memories: addedMemories,
      dictionaryWords: addedTerms,
    },
    stats: {
      dictionaryWords: dictCount,
      memoryEntries: memoryCount,
    },
  });
});

/**
 * PATCH /api/atropos/memory
 * Update specific parts of memory (add/remove dictionary words)
 */
export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const { action, word } = await request.json();

  if (!word || typeof word !== "string") {
    throw new ValidationError("Word is required");
  }

  const db = getDatabase();
  const userId = "default";

  if (action === "add") {
    db.prepare(
      "INSERT OR IGNORE INTO atropos_dictionary (user_id, term) VALUES (?, ?)"
    ).run(userId, word);
  } else if (action === "remove") {
    db.prepare(
      "DELETE FROM atropos_dictionary WHERE user_id = ? AND term = ?"
    ).run(userId, word);
  } else {
    throw new ValidationError("Invalid action. Use 'add' or 'remove'");
  }

  // Get updated dictionary
  const dictTerms = db
    .prepare("SELECT term FROM atropos_dictionary WHERE user_id = ?")
    .all(userId) as { term: string }[];

  return NextResponse.json({
    success: true,
    customDictionary: dictTerms.map((t) => t.term),
  });
});

/**
 * DELETE /api/atropos/memory
 * Reset memory to defaults
 */
export const DELETE = withErrorHandler(async () => {
  const db = getDatabase();
  const userId = "default";
  const defaultMemory = getDefaultAtroposMemory();

  // Clear all normalized tables for this user
  db.prepare("DELETE FROM atropos_memories WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM atropos_dictionary WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM atropos_stats WHERE user_id = ?").run(userId);

  // Re-insert default dictionary terms
  const insertTerm = db.prepare(
    "INSERT INTO atropos_dictionary (user_id, term) VALUES (?, ?)"
  );
  for (const term of defaultMemory.customDictionary) {
    insertTerm.run(userId, term);
  }

  // Re-insert default memories
  const insertMemory = db.prepare(
    "INSERT INTO atropos_memories (user_id, content, tags) VALUES (?, ?, '[]')"
  );
  for (const memory of defaultMemory.memories) {
    insertMemory.run(userId, memory.content);
  }

  // Initialize stats
  db.prepare(
    "INSERT INTO atropos_stats (user_id, total_checks, total_corrections) VALUES (?, 0, 0)"
  ).run(userId);

  return NextResponse.json({
    success: true,
    message: "Memory reset to defaults",
  });
});
