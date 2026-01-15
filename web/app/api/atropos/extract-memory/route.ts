/**
 * Atropos Extract Memory - Learn from User Correction Edits
 *
 * Uses AI SDK 6.0 generateText with Output.object() for structured outputs
 * (generateObject is deprecated in AI SDK 6.0)
 */

import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import {
  MemoryExtractionSchema,
  buildExtractionUserPrompt,
} from "@/lib/ai/atropos";

const EXTRACTION_SYSTEM_PROMPT = `You are Atropos, the fate that corrects.
You are analyzing the differences between your AI-corrected draft and the user's final version.
Your task is to understand what the user changed and why, to learn their writing patterns.

Be specific and observant. Notice:
- Words they changed back or modified differently
- Tone adjustments (more formal, more casual)
- Punctuation preferences
- Technical terms they use that should be protected
- Patterns in their style (active vs passive voice, sentence length, etc.)

This analysis will help you correct their writing better in the future.`;

/**
 * POST /api/atropos/extract-memory
 * Analyze differences between AI draft and user's final to extract learnings
 */
export async function POST(request: NextRequest) {
  try {
    const { aiDraft, userFinal } = await request.json();

    if (!aiDraft || typeof aiDraft !== "string") {
      return NextResponse.json(
        { error: "aiDraft is required" },
        { status: 400 }
      );
    }

    if (!userFinal || typeof userFinal !== "string") {
      return NextResponse.json(
        { error: "userFinal is required" },
        { status: 400 }
      );
    }

    // Check API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 }
      );
    }

    // Build the extraction prompt
    const userPrompt = buildExtractionUserPrompt(aiDraft, userFinal);

    // AI SDK 6.0 pattern: generateText with Output.object() (generateObject is deprecated)
    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      output: Output.object({ schema: MemoryExtractionSchema }),
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt: userPrompt,
    });

    const extraction = result.output;

    if (!extraction) {
      throw new Error("AI generation returned no structured output");
    }

    return NextResponse.json({
      mainChanges: extraction.mainChanges,
      newPatterns: extraction.newPatterns,
      suggestedLabel: extraction.suggestedLabel,
      newDictionaryWords: extraction.newDictionaryWords,
    });
  } catch (error: any) {
    console.error("[Atropos Extract Memory] Error:", error);
    return NextResponse.json(
      { error: error.message || "Memory extraction failed" },
      { status: 500 }
    );
  }
}
