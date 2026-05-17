/**
 * AI Summarize Endpoint - Generate dense 3-sentence summaries for Kronus indexing
 *
 * Uses AI SDK 6.0 generateText with Output.object() for structured outputs
 * Model: Gemini 3.1 Flash Lite (fast, cheap)
 */

import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { NextResponse } from "next/server";
import { registerRequest, deregisterRequest } from "@/lib/request-registry";
import { traceAI } from "@/lib/observability";

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
      model: "gemini-3.1-flash-lite-preview",
      startedAt: new Date(),
      metadata: {
        type: input.type,
        title: input.title ?? null,
        contentLength: input.content.length,
      },
    });

    // Use Gemini 3.1 Flash Lite for fast, cost-effective summarization
    const model = google("gemini-3.1-flash-lite-preview");

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

    const result = await traceAI(
      `summarize:${input.type}`,
      "gemini-3.1-flash-lite-preview",
      () => generateText({
        model,
        abortSignal: controller.signal,
        output: Output.object({ schema: SummaryOutputSchema }),
      system: `You are a precise summarization engine for the Tartarus system.
Your task is to generate dense, information-rich 3-sentence summaries for AI retrieval indexing.

## Summary Structure
- Sentence 1: What it is and its primary purpose
- Sentence 2: Key details, components, or changes
- Sentence 3: Current status, impact, or notable aspects

## Guidelines
- Be DENSE with information - pack maximum meaning into minimum words
- NO fluff, NO filler phrases, NO vague descriptions
- Use specific technical terms when relevant
- Include key identifiers (file names, versions, IDs) when present
- This is for AI retrieval - precision and recall matter most

## Type-Specific Guidance
- journal_entry: Focus on what changed, why, and impact
- project_summary: Focus on purpose, architecture, and current state
- document: Focus on topic, key points, and intended use
  - **For prompts**: Include purpose, role (system/user/assistant/chat), and if schemas/config are present
- linear_issue: Focus on problem, status, and assignee/priority
- linear_project: Focus on goals, progress, and timeline
- attachment/media: Focus on what it shows/contains and its context
- skill: Focus on expertise level, key applications, and relevance
- work_experience: Focus on role, key achievements, and impact
- education: Focus on degree, field of study, and key learnings
- portfolio_project: Focus on what was built, technologies used, and outcomes`,
      prompt: `Generate a 3-sentence summary for this ${input.type}:

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
