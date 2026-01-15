/**
 * Atropos Memory Edit - AI-Mediated Memory Management
 *
 * Uses AI SDK 6.0 generateText with Output.object() for structured outputs
 * (generateObject is deprecated in AI SDK 6.0)
 */

import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getDatabase } from "@/lib/db";

interface AtroposMemoryRow {
  id: number;
  user_id: string;
  content: string;
  tags: string;
  frequency: number;
  created_at: string;
  updated_at: string;
}

interface AtroposDictionaryRow {
  id: number;
  user_id: string;
  term: string;
  created_at: string;
}

interface AtroposStatsRow {
  id: number;
  user_id: string;
  total_checks: number;
  total_corrections: number;
  total_characters_corrected: number;
  created_at: string;
  updated_at: string;
}

/**
 * Schema for Atropos memory edit response
 */
const MemoryEditResponseSchema = z.object({
  action: z.enum(["add_memory", "edit_memory", "remove_memory", "add_word", "remove_word", "no_change"])
    .describe("The action to perform on memory"),
  memoryContent: z.string().optional()
    .describe("The memory content to add or the edited version"),
  memoryTags: z.array(z.string()).optional()
    .describe("Tags for the memory entry"),
  targetMemoryIndex: z.number().optional()
    .describe("Index of memory to edit or remove (0-based from most recent)"),
  word: z.string().optional()
    .describe("Dictionary word to add or remove"),
  explanation: z.string()
    .describe("Brief explanation of what Atropos understood and did"),
});

/**
 * POST /api/atropos/memory/edit
 * AI-mediated memory editing - Atropos interprets user request and modifies memory
 * Now uses normalized tables: atropos_memories, atropos_dictionary, atropos_stats
 */
export async function POST(request: NextRequest) {
  try {
    const { userMessage } = await request.json();

    if (!userMessage || typeof userMessage !== "string") {
      return NextResponse.json({ error: "userMessage is required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 }
      );
    }

    const db = getDatabase();
    const userId = "default";

    // Load memories from normalized table
    const memoriesRows = db
      .prepare("SELECT * FROM atropos_memories WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId) as AtroposMemoryRow[];

    // Load dictionary from normalized table
    const dictionaryRows = db
      .prepare("SELECT * FROM atropos_dictionary WHERE user_id = ?")
      .all(userId) as AtroposDictionaryRow[];

    // Load stats
    let statsRow = db
      .prepare("SELECT * FROM atropos_stats WHERE user_id = ?")
      .get(userId) as AtroposStatsRow | undefined;

    if (!statsRow) {
      db.prepare(
        `INSERT INTO atropos_stats (user_id, total_checks, total_corrections, total_characters_corrected)
         VALUES (?, 0, 0, 0)`
      ).run(userId);
      statsRow = db
        .prepare("SELECT * FROM atropos_stats WHERE user_id = ?")
        .get(userId) as AtroposStatsRow;
    }

    // Build memory object for AI context
    const memories = memoriesRows.map(m => ({
      id: m.id,
      content: m.content,
      tags: JSON.parse(m.tags || "[]") as string[],
      createdAt: m.created_at,
    }));

    const customDictionary = dictionaryRows.map(d => d.term);

    // Format memories with indices for reference (most recent first, already sorted)
    const memoriesWithIndices = memories
      .map((m, idx) => `[${idx}] (id:${m.id}) ${m.content} (tags: ${m.tags.join(", ") || "none"})`)
      .join("\n");

    const systemPrompt = `You are Atropos, the fate that corrects. You manage your memory of the user's writing patterns.

## Current Memory State

**Dictionary Words (${customDictionary.length}):**
${customDictionary.join(", ") || "(empty)"}

**Memories (${memories.length}, most recent first):**
${memoriesWithIndices || "(none)"}

## Your Task

The user wants to modify your memory. Interpret their request and determine:
1. What action to take (add/edit/remove a memory, or add/remove a dictionary word)
2. The specific content or target

Be helpful and interpret the user's intent. If they say "remember that I prefer..." add a new memory. If they reference a specific memory, use its index. If they want to protect a word, add it to the dictionary.`;

    // AI SDK 6.0 pattern: generateText with Output.object() (generateObject is deprecated)
    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      output: Output.object({ schema: MemoryEditResponseSchema }),
      system: systemPrompt,
      prompt: userMessage,
    });

    const response = result.output;

    if (!response) {
      throw new Error("AI generation returned no structured output");
    }

    // Apply the action to normalized tables
    let actionTaken = response.action;

    switch (response.action) {
      case "add_memory":
        if (response.memoryContent) {
          db.prepare(
            `INSERT INTO atropos_memories (user_id, content, tags)
             VALUES (?, ?, ?)`
          ).run(userId, response.memoryContent, JSON.stringify(response.memoryTags || []));
        }
        break;

      case "edit_memory":
        if (response.targetMemoryIndex !== undefined && response.memoryContent) {
          const targetMemory = memories[response.targetMemoryIndex];
          if (targetMemory) {
            db.prepare(
              `UPDATE atropos_memories
               SET content = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`
            ).run(
              response.memoryContent,
              JSON.stringify(response.memoryTags || []),
              targetMemory.id
            );
          }
        }
        break;

      case "remove_memory":
        if (response.targetMemoryIndex !== undefined) {
          const targetMemory = memories[response.targetMemoryIndex];
          if (targetMemory) {
            db.prepare("DELETE FROM atropos_memories WHERE id = ?").run(targetMemory.id);
          }
        }
        break;

      case "add_word":
        if (response.word) {
          const exists = db
            .prepare("SELECT id FROM atropos_dictionary WHERE user_id = ? AND term = ?")
            .get(userId, response.word);
          if (!exists) {
            db.prepare(
              `INSERT INTO atropos_dictionary (user_id, term) VALUES (?, ?)`
            ).run(userId, response.word);
          }
        }
        break;

      case "remove_word":
        if (response.word) {
          db.prepare(
            "DELETE FROM atropos_dictionary WHERE user_id = ? AND term = ?"
          ).run(userId, response.word);
        }
        break;

      case "no_change":
        // Do nothing
        break;
    }

    // Reload current state after changes
    const updatedMemories = db
      .prepare("SELECT * FROM atropos_memories WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId) as AtroposMemoryRow[];

    const updatedDictionary = db
      .prepare("SELECT term FROM atropos_dictionary WHERE user_id = ?")
      .all(userId) as { term: string }[];

    return NextResponse.json({
      success: true,
      action: actionTaken,
      explanation: response.explanation,
      memory: {
        customDictionary: updatedDictionary.map(d => d.term),
        memories: updatedMemories.map(m => ({
          content: m.content,
          tags: JSON.parse(m.tags || "[]"),
          createdAt: m.created_at,
        })),
        totalChecks: statsRow.total_checks,
        totalCorrections: statsRow.total_corrections,
      },
      stats: {
        dictionaryWords: updatedDictionary.length,
        memoryEntries: updatedMemories.length,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[Atropos Memory Edit] Error:", err);
    return NextResponse.json(
      { error: err.message || "Memory edit failed" },
      { status: 500 }
    );
  }
}
