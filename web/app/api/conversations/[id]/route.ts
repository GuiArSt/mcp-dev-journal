import { NextRequest, NextResponse } from "next/server";
import {
  getConversation,
  updateConversation,
  deleteConversation,
  initConversationsTable,
} from "@/lib/db-conversations";
import { withErrorHandler } from "@/lib/api-handler";
import { requireParams } from "@/lib/validations";
import { idParamSchema, saveConversationSchema } from "@/lib/validations/schemas";
import { NotFoundError } from "@/lib/errors";

/**
 * GET /api/conversations/[id]
 *
 * Get a conversation by ID.
 */
export const GET = withErrorHandler(async (
  _request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  initConversationsTable();
  const resolvedParams = await context?.params;
  const { id } = requireParams(idParamSchema, resolvedParams);

  const conversation = getConversation(id);
  if (!conversation) {
    throw new NotFoundError("Conversation", String(id));
  }

  return NextResponse.json(conversation);
});

/**
 * PATCH /api/conversations/[id]
 *
 * Update a conversation.
 * Note: Also handles sendBeacon requests which send as text/plain.
 */
export const PATCH = withErrorHandler(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  initConversationsTable();
  const resolvedParams = await context?.params;
  const { id } = requireParams(idParamSchema, resolvedParams);

  // Handle both JSON and text/plain (from sendBeacon)
  const contentType = request.headers.get("content-type") || "";
  let body: unknown;

  if (contentType.includes("text/plain")) {
    const text = await request.text();
    body = JSON.parse(text);
  } else {
    body = await request.json();
  }

  const { title, messages } = saveConversationSchema.parse(body);
  updateConversation(id, title, messages);

  return NextResponse.json({
    message: "Conversation updated successfully",
  });
});

/**
 * DELETE /api/conversations/[id]
 *
 * Delete a conversation.
 */
export const DELETE = withErrorHandler(async (
  _request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  initConversationsTable();
  const resolvedParams = await context?.params;
  const { id } = requireParams(idParamSchema, resolvedParams);

  const deleted = deleteConversation(id);
  if (!deleted) {
    throw new NotFoundError("Conversation", String(id));
  }

  return NextResponse.json({
    message: "Conversation deleted successfully",
  });
});
