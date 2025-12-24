import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import {
  getDefaultAtroposMemory,
  AtroposMemory,
  AtroposMemoryEntry,
  buildMemoryInjection,
} from "@/lib/ai/atropos";

interface AtroposMemoryRow {
  id: number;
  user_id: string;
  custom_dictionary: string;
  memories: string;
  total_checks: number;
  total_corrections: number;
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

    // Load current memory
    const db = getDatabase();
    let memoryRow = db
      .prepare("SELECT * FROM atropos_memory WHERE user_id = ?")
      .get("default") as AtroposMemoryRow | undefined;

    if (!memoryRow) {
      const defaultMemory = getDefaultAtroposMemory();
      db.prepare(
        `INSERT INTO atropos_memory (user_id, custom_dictionary, memories)
         VALUES (?, ?, ?)`
      ).run(
        "default",
        JSON.stringify(defaultMemory.customDictionary),
        JSON.stringify(defaultMemory.memories)
      );
      memoryRow = db
        .prepare("SELECT * FROM atropos_memory WHERE user_id = ?")
        .get("default") as AtroposMemoryRow;
    }

    const memory: AtroposMemory = {
      customDictionary: JSON.parse(memoryRow.custom_dictionary || "[]"),
      memories: JSON.parse(memoryRow.memories || "[]"),
      totalChecks: memoryRow.total_checks,
      totalCorrections: memoryRow.total_corrections,
    };

    // Build context with current memory state
    const memoryContext = buildMemoryInjection(memory);

    // Format memories with indices for reference
    const memoriesWithIndices = memory.memories
      .slice()
      .reverse()
      .map((m, idx) => `[${idx}] ${m.content} (tags: ${m.tags.join(", ") || "none"})`)
      .join("\n");

    const systemPrompt = `You are Atropos, the fate that corrects. You manage your memory of the user's writing patterns.

## Current Memory State

**Dictionary Words (${memory.customDictionary.length}):**
${memory.customDictionary.join(", ") || "(empty)"}

**Memories (${memory.memories.length}, most recent first):**
${memoriesWithIndices || "(none)"}

## Your Task

The user wants to modify your memory. Interpret their request and determine:
1. What action to take (add/edit/remove a memory, or add/remove a dictionary word)
2. The specific content or target

Be helpful and interpret the user's intent. If they say "remember that I prefer..." add a new memory. If they reference a specific memory, use its index. If they want to protect a word, add it to the dictionary.`;

    // Call Atropos to interpret the request
    const { object: response } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: MemoryEditResponseSchema,
      system: systemPrompt,
      prompt: userMessage,
    });

    // Apply the action
    let customDictionary = [...memory.customDictionary];
    let memories: AtroposMemoryEntry[] = [...memory.memories];
    let actionTaken = response.action;

    switch (response.action) {
      case "add_memory":
        if (response.memoryContent) {
          memories.push({
            content: response.memoryContent,
            tags: response.memoryTags || [],
            createdAt: new Date().toISOString(),
          });
        }
        break;

      case "edit_memory":
        if (response.targetMemoryIndex !== undefined && response.memoryContent) {
          // Index is from most recent, so convert to actual array index
          const actualIndex = memories.length - 1 - response.targetMemoryIndex;
          if (actualIndex >= 0 && actualIndex < memories.length) {
            memories[actualIndex] = {
              ...memories[actualIndex],
              content: response.memoryContent,
              tags: response.memoryTags || memories[actualIndex].tags,
            };
          }
        }
        break;

      case "remove_memory":
        if (response.targetMemoryIndex !== undefined) {
          const actualIndex = memories.length - 1 - response.targetMemoryIndex;
          if (actualIndex >= 0 && actualIndex < memories.length) {
            memories.splice(actualIndex, 1);
          }
        }
        break;

      case "add_word":
        if (response.word && !customDictionary.includes(response.word)) {
          customDictionary.push(response.word);
        }
        break;

      case "remove_word":
        if (response.word) {
          const idx = customDictionary.indexOf(response.word);
          if (idx > -1) {
            customDictionary.splice(idx, 1);
          }
        }
        break;

      case "no_change":
        // Do nothing
        break;
    }

    // Save updated memory
    db.prepare(
      `UPDATE atropos_memory
       SET custom_dictionary = ?,
           memories = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`
    ).run(JSON.stringify(customDictionary), JSON.stringify(memories), "default");

    return NextResponse.json({
      success: true,
      action: actionTaken,
      explanation: response.explanation,
      memory: {
        customDictionary,
        memories,
        totalChecks: memory.totalChecks,
        totalCorrections: memory.totalCorrections,
      },
      stats: {
        dictionaryWords: customDictionary.length,
        memoryEntries: memories.length,
      },
    });
  } catch (error: any) {
    console.error("[Atropos Memory Edit] Error:", error);
    return NextResponse.json(
      { error: error.message || "Memory edit failed" },
      { status: 500 }
    );
  }
}
