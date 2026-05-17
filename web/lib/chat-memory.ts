import { getDatabase } from "@/lib/db";
import { initConversationsTable } from "@/lib/db-conversations";
import { estimateTokens } from "@/lib/chat-text-cleaner";
import { lookupBySource, lookupByUUID } from "@/lib/object-registry";

const CHAT_INDEX_PROMPT_LIMIT = 200;
const DEFAULT_FETCH_MAX_CHARS = 80_000;
const MAX_FETCH_MAX_CHARS = 200_000;

export interface ChatIndexItem {
  id: number;
  uuid: string | null;
  title: string;
  summary: string;
  summaryUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  estimatedTokens: number;
}

export interface ChatIndexResult {
  conversations: ChatIndexItem[];
  total: number;
  missingSummaryCount: number;
  limit: number;
  offset: number;
}

interface TextPart {
  type?: string;
  text?: unknown;
}

interface StoredMessage {
  role: string;
  content?: string;
  parts?: TextPart[];
}

interface ConversationIndexRow {
  id: number;
  title: string;
  summary: string;
  summary_updated_at: string | null;
  created_at: string;
  updated_at: string;
  messageCount: number | null;
  estimatedTokens: number | null;
}

interface ConversationFullRow {
  id: number;
  title: string;
  messages: string;
  summary: string | null;
  summary_updated_at: string | null;
  created_at: string;
  updated_at: string;
  message_count: number | null;
  estimated_tokens: number | null;
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.min(Math.max(Math.floor(value ?? fallback), 1), max);
}

function clampOffset(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 0;
  return Math.max(Math.floor(value ?? 0), 0);
}

function getUuidForConversation(id: number): string | null {
  try {
    return lookupBySource("chat_conversations", String(id))?.uuid ?? null;
  } catch {
    return null;
  }
}

function mapIndexRow(row: ConversationIndexRow): ChatIndexItem {
  return {
    id: row.id,
    uuid: getUuidForConversation(row.id),
    title: row.title || "Untitled Conversation",
    summary: row.summary || "",
    summaryUpdatedAt: row.summary_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.messageCount ?? 0,
    estimatedTokens: row.estimatedTokens ?? 0,
  };
}

export function listChatIndex(options: {
  query?: string;
  limit?: number;
  offset?: number;
} = {}): ChatIndexResult {
  initConversationsTable();
  const db = getDatabase();
  const limit = clampLimit(options.limit, 50, 500);
  const offset = clampOffset(options.offset);
  const query = options.query?.trim();

  const where = ["summary IS NOT NULL", "summary != ''"];
  const params: Array<string | number> = [];

  if (query) {
    where.push("(title LIKE ? OR summary LIKE ?)");
    params.push(`%${query}%`, `%${query}%`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;
  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM chat_conversations ${whereSql}`).get(...params) as {
      count: number;
    }
  ).count;

  const rows = db
    .prepare(
      `
      SELECT
        id,
        title,
        summary,
        summary_updated_at,
        created_at,
        updated_at,
        COALESCE(NULLIF(message_count, 0), json_array_length(messages), 0) as messageCount,
        COALESCE(NULLIF(estimated_tokens, 0), 0) as estimatedTokens
      FROM chat_conversations
      ${whereSql}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `,
    )
    .all(...params, limit, offset) as ConversationIndexRow[];

  const missingSummaryCount = (
    db
      .prepare(
        `
        SELECT COUNT(*) as count
        FROM chat_conversations
        WHERE summary IS NULL OR summary = ''
      `,
      )
      .get() as { count: number }
  ).count;

  return {
    conversations: rows.map(mapIndexRow),
    total,
    missingSummaryCount,
    limit,
    offset,
  };
}

function parseStoredMessages(raw: string): StoredMessage[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function messageText(message: StoredMessage): string {
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => String(part.text))
      .join("\n");
  }
  return "";
}

function formatStoredMessages(messages: StoredMessage[]): string {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message, index) => {
      const label = message.role === "user" ? "User" : "Kronus";
      const text = messageText(message).trim();
      if (!text) return null;
      return `## ${index + 1}. ${label}\n\n${text}`;
    })
    .filter((item): item is string => Boolean(item))
    .join("\n\n---\n\n");
}

function resolveConversationId(ref: { uuid?: string; id?: number }): {
  id: number;
  uuid: string | null;
} {
  if (ref.uuid) {
    const object = lookupByUUID(ref.uuid);
    if (!object) {
      throw new Error(`No Tartarus object found for UUID ${ref.uuid}`);
    }
    if (object.source_table !== "chat_conversations") {
      throw new Error(
        `UUID ${ref.uuid} points to ${object.source_table}, not chat_conversations`,
      );
    }
    return { id: Number(object.source_id), uuid: object.uuid };
  }

  if (ref.id != null && Number.isFinite(ref.id)) {
    return { id: ref.id, uuid: getUuidForConversation(ref.id) };
  }

  throw new Error("Provide either uuid or id");
}

export function fetchChatMemory(ref: {
  uuid?: string;
  id?: number;
  maxChars?: number;
}): {
  id: number;
  uuid: string | null;
  title: string;
  summary: string | null;
  summaryUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  estimatedTokens: number;
  content: string;
  truncated: boolean;
} {
  initConversationsTable();
  const db = getDatabase();
  const resolved = resolveConversationId(ref);
  const row = db
    .prepare(
      `
      SELECT
        id,
        title,
        messages,
        summary,
        summary_updated_at,
        created_at,
        updated_at,
        message_count,
        estimated_tokens
      FROM chat_conversations
      WHERE id = ?
    `,
    )
    .get(resolved.id) as ConversationFullRow | undefined;

  if (!row) {
    throw new Error(`Conversation ${resolved.id} not found`);
  }

  const messages = parseStoredMessages(row.messages);
  const formattedMessages = formatStoredMessages(messages);
  const maxChars = clampLimit(ref.maxChars, DEFAULT_FETCH_MAX_CHARS, MAX_FETCH_MAX_CHARS);
  const truncated = formattedMessages.length > maxChars;
  const content = truncated
    ? `${formattedMessages.slice(0, maxChars)}\n\n[truncated: ${formattedMessages.length - maxChars} characters omitted]`
    : formattedMessages;

  return {
    id: row.id,
    uuid: resolved.uuid,
    title: row.title || "Untitled Conversation",
    summary: row.summary,
    summaryUpdatedAt: row.summary_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count || messages.length,
    estimatedTokens: row.estimated_tokens ?? estimateTokens(formattedMessages),
    content,
    truncated,
  };
}

export function buildChatIndexContext(limit = CHAT_INDEX_PROMPT_LIMIT): {
  content: string;
  tokenEstimate: number;
  total: number;
  included: number;
  missingSummaryCount: number;
} {
  const result = listChatIndex({ limit, offset: 0 });
  if (result.conversations.length === 0) {
    const empty = result.missingSummaryCount > 0
      ? `## Chat Index\n\nNo summarized chats are available yet. ${result.missingSummaryCount} conversation(s) need manual summary generation.`
      : "";
    return {
      content: empty,
      tokenEstimate: estimateTokens(empty),
      total: result.total,
      included: 0,
      missingSummaryCount: result.missingSummaryCount,
    };
  }

  const lines = [
    `## Chat Index (${result.conversations.length}/${result.total} summarized conversations)`,
    "",
    "Compact summaries only. Full chat contents are intentionally omitted from context.",
    "Use `memory_fetch_chat` with a UUID when a specific conversation needs to be read in full.",
  ];

  if (result.missingSummaryCount > 0) {
    lines.push(
      "",
      `${result.missingSummaryCount} conversation(s) do not have summaries yet. Generate them manually when needed; do not auto-backfill during normal chat.`,
    );
  }

  for (const conversation of result.conversations) {
    const uuid = conversation.uuid ? `UUID: \`${conversation.uuid}\`` : `ID: \`${conversation.id}\``;
    lines.push(
      "",
      `### ${conversation.title}`,
      `${uuid} | Messages: ${conversation.messageCount} | Updated: ${conversation.updatedAt}`,
      conversation.summary,
    );
  }

  if (result.total > result.conversations.length) {
    lines.push(
      "",
      `Only the latest ${result.conversations.length} summarized chats are shown. Use \`memory_list_chat_index\` with offset for older summaries.`,
    );
  }

  const content = lines.join("\n");
  return {
    content,
    tokenEstimate: estimateTokens(content),
    total: result.total,
    included: result.conversations.length,
    missingSummaryCount: result.missingSummaryCount,
  };
}
