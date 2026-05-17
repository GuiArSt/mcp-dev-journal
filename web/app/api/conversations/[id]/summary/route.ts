import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { traceAI } from "@/lib/observability";
import {
  getConversation,
  updateConversationSummary,
  updateConversationTitle,
  initConversationsTable,
} from "@/lib/db-conversations";
import { withErrorHandler } from "@/lib/api-handler";
import { requireParams } from "@/lib/validations";
import { idParamSchema } from "@/lib/validations/schemas";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getPrompt } from "@/lib/ai/prompt-store";
import { CONVERSATION_SUMMARY_DEFAULT } from "@/lib/ai/prompt-defaults";

const SummarySchema = z.object({
  title: z
    .string()
    .describe(
      "A short, descriptive title for this conversation (3-6 words max). Should capture the main topic or question."
    ),
  summary: z
    .string()
    .describe(
      "A concise 2-3 sentence summary describing what this conversation was about, what was discussed, and key points covered."
    ),
});

/**
 * Generate a title and summary for a conversation using Gemini Flash 3.
 * Hardcoded to use Gemini Flash 3 for cost efficiency and context size.
 */
async function generateConversationSummary(
  messages: Array<{ role: string; content: string }>
): Promise<{ title: string; summary: string }> {
  const googleApiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!googleApiKey) {
    throw new ValidationError(
      "Google API key not configured (GOOGLE_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY)"
    );
  }

  // Build conversation text from messages
  const conversationText = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  if (!conversationText.trim()) {
    throw new ValidationError("No valid messages to summarize");
  }

  // Temporarily set the Google API key for the SDK
  const originalKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = googleApiKey;

  try {
    const model = google("gemini-3-flash-preview");

    const userPrompt = `Generate a title and living summary for this conversation:\n\n${conversationText}`;
    const result = await traceAI(
      "conversation-summary",
      "gemini-3-flash-preview",
      () => generateText({
        model,
        output: Output.object({ schema: SummarySchema }),
        system: getPrompt("conversation-summary", CONVERSATION_SUMMARY_DEFAULT),
        prompt: userPrompt,
      }),
      undefined,
      userPrompt,
      "/api/conversations/[id]/summary",
    );

    const parsed = result.output;
    if (!parsed?.summary || !parsed?.title) {
      throw new ValidationError("Failed to generate title and summary");
    }

    return { title: parsed.title, summary: parsed.summary };
  } finally {
    // Restore original API key
    if (originalKey !== undefined) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalKey;
    } else {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    }
  }
}

/**
 * GET /api/conversations/[id]/summary
 *
 * Get the summary for a conversation.
 */
export const GET = withErrorHandler(
  async (_request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    initConversationsTable();
    const resolvedParams = await context?.params;
    const { id } = requireParams(idParamSchema, resolvedParams);

    const conversation = getConversation(id);
    if (!conversation) {
      throw new NotFoundError("Conversation", String(id));
    }

    return NextResponse.json({
      id: conversation.id,
      summary: conversation.summary,
      summary_updated_at: conversation.summary_updated_at,
    });
  }
);

/**
 * POST /api/conversations/[id]/summary
 *
 * Generate or regenerate summary for a conversation.
 * Uses Gemini Flash 3 (hardcoded for cost efficiency).
 */
export const POST = withErrorHandler(
  async (request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    initConversationsTable();
    const resolvedParams = await context?.params;
    const { id } = requireParams(idParamSchema, resolvedParams);

    const conversation = getConversation(id);
    if (!conversation) {
      throw new NotFoundError("Conversation", String(id));
    }

    // Check if force regeneration is requested
    const body = await request.json().catch(() => ({}));
    const force = body?.force === true;

    // If already has summary and not forcing, return existing
    if (conversation.summary && !force) {
      return NextResponse.json({
        id: conversation.id,
        summary: conversation.summary,
        summary_updated_at: conversation.summary_updated_at,
        regenerated: false,
      });
    }

    // Generate new title and summary
    const { title, summary } = await generateConversationSummary(conversation.messages);

    // Update title in database (without touching updated_at)
    updateConversationTitle(id, title);

    // Update summary in database (sets summary_updated_at to now)
    updateConversationSummary(id, summary);

    return NextResponse.json({
      id: conversation.id,
      title,
      summary,
      summary_updated_at: new Date().toISOString(),
      regenerated: true,
    });
  }
);
