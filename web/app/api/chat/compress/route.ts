import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody, compressRequestSchema, compressionSummarySchema } from "@/lib/validations";
import { NotFoundError } from "@/lib/errors";

/**
 * POST /api/chat/compress
 *
 * Compresses a conversation using Haiku 4.5 to generate a structured summary.
 * Uses AI SDK's generateObject with Zod schema for type-safe structured output.
 *
 * Flow:
 * 1. Load conversation messages from DB
 * 2. Send to Haiku 4.5 with compressionSummarySchema
 * 3. Store summary in conversation record
 * 4. Mark conversation as compressed
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const { conversationId } = await requireBody(compressRequestSchema, request);
  const db = getDatabase();

  // Load conversation
  const conversation = db
    .prepare("SELECT * FROM chat_conversations WHERE id = ?")
    .get(conversationId) as {
      id: number;
      title: string;
      messages: string;
      soul_config: string | null;
      is_compressed: number;
      message_count: number;
      estimated_tokens: number;
    } | undefined;

  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }

  if (conversation.is_compressed) {
    return NextResponse.json({
      success: false,
      error: "Conversation is already compressed",
    });
  }

  // Parse messages
  const messages = JSON.parse(conversation.messages) as Array<{
    role: "user" | "assistant";
    content: string;
  }>;

  if (messages.length < 2) {
    return NextResponse.json({
      success: false,
      error: "Conversation too short to compress",
    });
  }

  // Format messages for the summarization prompt
  const formattedMessages = messages
    .map((m, i) => `[${m.role.toUpperCase()} ${i + 1}]: ${m.content}`)
    .join("\n\n---\n\n");

  // Use Haiku 4.5 for fast compression
  const model = anthropic("claude-3-5-haiku-20241022");

  const systemPrompt = `You are a conversation summarizer. Your task is to extract structured information from a conversation between a user and Kronus (an AI assistant).

Analyze the conversation and extract:
1. A brief overview of what was discussed
2. Main topics covered
3. Decisions made (with rationale if available)
4. Tasks and their current status
5. Code files created or modified
6. Technical context (technologies, patterns, constraints)
7. User preferences discovered
8. Any open questions or unresolved items

Be concise but thorough. Focus on information that would be useful for continuing this conversation later.`;

  const { object: summary } = await generateObject({
    model,
    schema: compressionSummarySchema,
    system: systemPrompt,
    prompt: `Summarize this conversation:\n\n${formattedMessages}`,
  });

  // Add metadata
  const compressionSummary = {
    ...summary,
    metadata: {
      originalMessageCount: messages.length,
      compressedAt: new Date().toISOString(),
      modelUsed: "claude-3-5-haiku-20241022",
    },
  };

  // Update conversation with compression summary
  db.prepare(`
    UPDATE chat_conversations
    SET
      is_compressed = 1,
      compression_summary = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(JSON.stringify(compressionSummary), conversationId);

  return NextResponse.json({
    success: true,
    summary: compressionSummary,
    conversationId,
  });
});

/**
 * GET /api/chat/compress?conversationId=123
 *
 * Get compression summary for a conversation (if it exists)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 }
    );
  }

  const db = getDatabase();
  const conversation = db
    .prepare("SELECT compression_summary, is_compressed FROM chat_conversations WHERE id = ?")
    .get(parseInt(conversationId)) as {
      compression_summary: string | null;
      is_compressed: number;
    } | undefined;

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  if (!conversation.is_compressed || !conversation.compression_summary) {
    return NextResponse.json({
      isCompressed: false,
      summary: null,
    });
  }

  return NextResponse.json({
    isCompressed: true,
    summary: JSON.parse(conversation.compression_summary),
  });
}
