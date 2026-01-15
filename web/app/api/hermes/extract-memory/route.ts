/**
 * Hermes Extract Memory - Learn from User Translation Edits
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
} from "@/lib/ai/hermes";

const EXTRACTION_SYSTEM_PROMPT = `You are Hermes, the messenger who translates.
You are analyzing the differences between your AI translation and the user's final version.
Your task is to understand what the user changed and why, to learn their translation preferences.

Be specific and observant. Notice:
- Words or phrases they changed to different translations
- Tone adjustments (more formal, more casual, more idiomatic)
- Terms they kept untranslated or in specific forms
- Regional language preferences
- Idiomatic expressions they prefer over literal translations
- Cultural adaptations they made

This analysis will help you translate better for them in the future.`;

/**
 * POST /api/hermes/extract-memory
 * Analyze differences between AI translation and user's final to extract learnings
 */
export async function POST(request: NextRequest) {
  try {
    const { aiTranslation, userFinal, sourceLanguage, targetLanguage } = await request.json();

    if (!aiTranslation || typeof aiTranslation !== "string") {
      return NextResponse.json(
        { error: "aiTranslation is required" },
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
    const userPrompt = buildExtractionUserPrompt(
      aiTranslation,
      userFinal,
      sourceLanguage || "unknown",
      targetLanguage || "unknown"
    );

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
      protectedTerms: extraction.protectedTerms,
    });
  } catch (error: any) {
    console.error("[Hermes Extract Memory] Error:", error);
    return NextResponse.json(
      { error: error.message || "Memory extraction failed" },
      { status: 500 }
    );
  }
}
