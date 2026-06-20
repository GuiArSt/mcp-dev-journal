/**
 * AI Summarize Endpoint - Generate dense 3-sentence summaries for Kronus indexing
 *
 * Uses AI SDK 6.0 generateText with Output.object() for structured outputs
 * Model: Gemini 3.5 Flash (default summarizer)
 */

import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { NextResponse } from "next/server";
import { registerRequest, deregisterRequest } from "@/lib/request-registry";
import { traceAI } from "@/lib/observability";
import { DEFAULT_CHAT_MODEL, getChatModelEntry, resolveChatModelId } from "@/lib/ai/model-catalog";
import { getPrompt } from "@/lib/ai/prompt-store";
import { TARTARUS_MASTER_SUMMARY_DEFAULT } from "@/lib/ai/prompt-defaults";

const SUMMARY_MODEL_KEY = DEFAULT_CHAT_MODEL;
const SUMMARY_MODEL_ID = resolveChatModelId(getChatModelEntry(SUMMARY_MODEL_KEY), process.env);

/**
 * Input schema for summary generation
 */
const SummarizeInputSchema = z.object({
  type: z
    .enum([
      "journal_entry",
      "project_summary",
      "document",
      "linear_issue",
      "linear_project",
      "attachment",
      "media",
      "skill",
      "work_experience",
      "education",
      "portfolio_project",
      "slite_note",
    ])
    .describe("Type of content being summarized"),
  content: z.string().min(1).describe("The full content to summarize"),
  title: z.string().optional().describe("Optional title for context"),
  metadata: z
    .record(z.string(), z.any())
    .optional()
    .describe("Additional context (file type, mime, etc.)"),
});

/**
 * Output schema - just the summary
 */
const SummaryOutputSchema = z.object({
  summary: z.string().describe("3-sentence dense summary for AI retrieval indexing"),
});

/**
 * Generate a precise 3-sentence summary for indexing purposes
 */
export async function POST(req: Request) {
  const controller = new AbortController();
  let registryId: string | null = null;

  try {
    const body = await req.json();

    // Validate input
    const input = SummarizeInputSchema.parse(body);

    registryId = registerRequest({
      controller,
      endpoint: "summarize",
      mode: input.type,
      model: SUMMARY_MODEL_ID,
      startedAt: new Date(),
      metadata: {
        type: input.type,
        title: input.title ?? null,
        contentLength: input.content.length,
      },
    });

    // Use the configured default summarizer model.
    const model = google(SUMMARY_MODEL_ID);

    // Build context string from metadata if available
    let metadataContext = "";
    if (input.metadata) {
      const metaEntries = Object.entries(input.metadata)
        .filter(([_, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join("\n");
      if (metaEntries) {
        metadataContext = `\nMetadata:\n${metaEntries}`;
      }
    }

    const systemPrompt = getPrompt("tartarus-master-summary", TARTARUS_MASTER_SUMMARY_DEFAULT);

    const result = await traceAI(
      `summarize:${input.type}`,
      SUMMARY_MODEL_ID,
      () => generateText({
        model,
        abortSignal: controller.signal,
        output: Output.object({ schema: SummaryOutputSchema }),
      system: systemPrompt,
      prompt: `Generate a 3-sentence retrieval summary.

SUMMARY_MODE: ${input.type}

${input.title ? `Title: ${input.title}` : ""}${metadataContext}

${input.type === "document" && input.metadata?.purpose ? `Purpose: ${input.metadata.purpose}\n` : ""}${input.type === "document" && input.metadata?.role ? `Role: ${input.metadata.role}\n` : ""}

Content:
${input.content}`,
      }),
      { type: input.type, title: input.title ?? null },
      input.content,
      "/api/ai/summarize",
    );

    const parsed = result.output;

    if (!parsed || !parsed.summary) {
      throw new Error("AI generation returned no summary");
    }

    return NextResponse.json({
      summary: parsed.summary,
      type: input.type,
    });
  } catch (error: any) {
    console.error("Summarization error:", error);

    // Handle Zod validation errors
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Invalid input", details: error.errors }, { status: 400 });
    }

    return NextResponse.json(
      { error: error.message || "Failed to generate summary" },
      { status: 500 }
    );
  } finally {
    if (registryId) deregisterRequest(registryId);
  }
}
