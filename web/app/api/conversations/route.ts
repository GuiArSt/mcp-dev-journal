import { NextRequest, NextResponse } from "next/server";
import {
  saveConversation,
  listConversations,
  searchConversations,
  initConversationsTable,
} from "@/lib/db-conversations";
import { withErrorHandler } from "@/lib/api-handler";
import { requireQuery, requireBody } from "@/lib/validations";
import { conversationQuerySchema, saveConversationSchema } from "@/lib/validations/schemas";
import { z } from "zod";

/**
 * GET /api/conversations
 *
 * List or search conversations with pagination.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  initConversationsTable();

  const { query, limit, offset } = requireQuery(conversationQuerySchema, request);

  if (query) {
    const conversations = searchConversations(query, limit);
    return NextResponse.json({ conversations, total: conversations.length });
  }

  const result = listConversations(limit, offset);
  return NextResponse.json(result);
});

/**
 * POST /api/conversations
 *
 * Save a new conversation.
 * Note: Also handles sendBeacon requests which send as text/plain.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  initConversationsTable();

  // Handle both JSON and text/plain (from sendBeacon)
  const contentType = request.headers.get("content-type") || "";
  let body: unknown;

  if (contentType.includes("text/plain")) {
    const text = await request.text();
    body = JSON.parse(text);
  } else {
    body = await request.json();
  }

  // Validate after parsing
  const { title, messages } = saveConversationSchema.parse(body);
  const id = saveConversation(title, messages);

  return NextResponse.json({
    id,
    message: "Conversation saved successfully",
  });
});
