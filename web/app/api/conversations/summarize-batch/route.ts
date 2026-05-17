/**
 * POST /api/conversations/summarize-batch
 *
 * Batch-summarize conversations using flash-lite.
 * Dynamic token budget: accumulates conversations until hitting a ceiling.
 * Writes summary, tags, importance back to tartarus_objects registry.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { getDatabase } from "@/lib/db";
import { cleanConversationToPlainText, estimateTokens } from "@/lib/chat-text-cleaner";
import { updateObjectSummary, lookupBySource, registerObject } from "@/lib/object-registry";
import { getPrompt } from "@/lib/ai/prompt-store";
import { CONVERSATION_BATCH_SUMMARY_DEFAULT } from "@/lib/ai/prompt-defaults";

const MAX_TOTAL_TOKENS = 24_000; // flash-lite context budget for all conversations
const MAX_TOKENS_PER_CONVERSATION = 6_000; // truncate individual conversations

const BatchSummarySchema = z.object({
  title: z.string().describe("Short title, 3-6 words, title case"),
  summary: z.string().describe("2-3 sentence summary of what was discussed"),
  tags: z.array(z.string()).describe("3-7 topic tags like 'database', 'debugging', 'authentication'"),
  importance: z.number().min(1).max(5).describe("1=trivial, 2=minor, 3=normal, 4=important, 5=critical"),
});

const RequestSchema = z.object({
  ids: z.array(z.number()).min(1).max(50),
  force: z.boolean().optional().default(false),
});

interface ConversationRow {
  id: number;
  title: string;
  messages: string;
  summary: string | null;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const body = await request.json();
  const { ids, force } = RequestSchema.parse(body);

  const googleApiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!googleApiKey) {
    throw new ValidationError("Google API key not configured");
  }

  const db = getDatabase();

  // Load conversations
  const placeholders = ids.map(() => "?").join(",");
  const conversations = db
    .prepare(`SELECT id, title, messages, summary FROM chat_conversations WHERE id IN (${placeholders})`)
    .all(...ids) as ConversationRow[];

  if (conversations.length === 0) {
    return NextResponse.json({ processed: 0, results: [], skipped: 0 });
  }

  // Dynamic token budget — accumulate until ceiling
  let totalTokens = 0;
  const toProcess: { conv: ConversationRow; cleanedText: string; tokens: number }[] = [];
  const skipped: number[] = [];

  for (const conv of conversations) {
    // Skip if already summarized and not forcing
    if (conv.summary && !force) {
      skipped.push(conv.id);
      continue;
    }

    let messages;
    try {
      messages = JSON.parse(conv.messages);
    } catch {
      skipped.push(conv.id);
      continue;
    }

    const cleaned = cleanConversationToPlainText(messages);
    if (!cleaned.trim()) {
      skipped.push(conv.id);
      continue;
    }

    const tokens = estimateTokens(cleaned);
    const truncatedText = tokens > MAX_TOKENS_PER_CONVERSATION
      ? cleaned.substring(0, MAX_TOKENS_PER_CONVERSATION * 4) + "\n\n[...truncated]"
      : cleaned;
    const truncatedTokens = Math.min(tokens, MAX_TOKENS_PER_CONVERSATION);

    // Check budget
    if (totalTokens + truncatedTokens > MAX_TOTAL_TOKENS && toProcess.length > 0) {
      // Budget exceeded — stop adding more
      break;
    }

    totalTokens += truncatedTokens;
    toProcess.push({ conv, cleanedText: truncatedText, tokens: truncatedTokens });
  }

  // Set Google API key
  const originalKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = googleApiKey;

  const results: Array<{
    id: number;
    success: boolean;
    title?: string;
    summary?: string;
    tags?: string[];
    importance?: number;
    error?: string;
  }> = [];

  try {
    // Process sequentially to manage rate limits
    for (const { conv, cleanedText } of toProcess) {
      try {
        const result = await generateText({
          model: google("gemini-3.1-flash-lite-preview"),
          output: Output.object({ schema: BatchSummarySchema }),
          system: getPrompt("conversation-batch-summary", CONVERSATION_BATCH_SUMMARY_DEFAULT),
          prompt: `Summarize this conversation:\n\n${cleanedText}`,
        });

        const output = result.output;
        if (!output) {
          results.push({ id: conv.id, success: false, error: "No output from model" });
          continue;
        }

        // Update conversation title + summary in DB
        db.prepare(`
          UPDATE chat_conversations
          SET title = ?, summary = ?, summary_updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(output.title, output.summary, conv.id);

        // Update registry
        try {
          registerObject({
            type: "conversation",
            sourceTable: "chat_conversations",
            sourceId: String(conv.id),
            title: output.title,
            summary: output.summary,
            tags: output.tags,
            importance: output.importance,
          });
          const obj = lookupBySource("chat_conversations", String(conv.id));
          if (obj) {
            updateObjectSummary(obj.uuid, output.summary, output.tags, output.importance);
          }
        } catch { /* registry non-critical */ }

        results.push({
          id: conv.id,
          success: true,
          title: output.title,
          summary: output.summary,
          tags: output.tags,
          importance: output.importance,
        });
      } catch (err: any) {
        results.push({ id: conv.id, success: false, error: err.message });
      }
    }
  } finally {
    if (originalKey !== undefined) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalKey;
    } else {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    }
  }

  return NextResponse.json({
    processed: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    skipped: skipped.length,
    tokenBudgetUsed: totalTokens,
    tokenBudgetMax: MAX_TOTAL_TOKENS,
    results,
  });
});
