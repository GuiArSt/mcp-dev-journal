/**
 * Conversation Storage for Kronus Chat
 * Only accessible via webapp - MCP cannot access this
 * Used for audit/safety - saving agent interactions
 */

import { getDatabase } from "./db";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  parts?: any[];
  toolInvocations?: Array<{
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    result?: string;
  }>;
  createdAt?: string;
}

export interface Conversation {
  id: number;
  title: string;
  messages: ChatMessage[];
  /** JSON string of ChatSessionSnapshotV1 — restored in ChatInterface on load */
  session_config?: string | null;
  /** JSON string of ArtifactRef[] — Hourglass artifact shelf */
  artifact_refs?: string | null;
  /** JSON string of ChatLogEntry[] — Hourglass append-only event log */
  chat_log?: string | null;
  /** Running cost (USD) — Kronus + Muse + tools, all sources. */
  cost_usd?: number | null;
  /** Actual API input tokens summed across all traces tied to this chat. */
  actual_input_tokens?: number | null;
  /** Actual API output tokens summed across all traces tied to this chat. */
  actual_output_tokens?: number | null;
  summary?: string | null;
  summary_updated_at?: string | null;
  tags?: string | null;
  importance?: number | null;
  message_count?: number | null;
  estimated_tokens?: number | null;
  created_at: string;
  updated_at: string;
}

// Initialize conversations table (call on app startup)
export function initConversationsTable(): void {
  const db = getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      messages TEXT NOT NULL,
      summary TEXT,
      summary_updated_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: Add summary columns if they don't exist
  try {
    db.prepare("SELECT summary FROM chat_conversations LIMIT 1").get();
  } catch (error: any) {
    if (error.message?.includes("no such column")) {
      db.exec(`
        ALTER TABLE chat_conversations ADD COLUMN summary TEXT;
        ALTER TABLE chat_conversations ADD COLUMN summary_updated_at TEXT;
      `);
    }
  }

  // Migration: Add metadata columns (tags, importance, message_count, estimated_tokens)
  try {
    db.prepare("SELECT estimated_tokens FROM chat_conversations LIMIT 1").get();
  } catch (error: any) {
    if (error.message?.includes("no such column")) {
      db.exec(`
        ALTER TABLE chat_conversations ADD COLUMN tags TEXT DEFAULT '[]';
        ALTER TABLE chat_conversations ADD COLUMN importance INTEGER DEFAULT 0;
        ALTER TABLE chat_conversations ADD COLUMN message_count INTEGER DEFAULT 0;
        ALTER TABLE chat_conversations ADD COLUMN estimated_tokens INTEGER DEFAULT 0;
      `);
    }
  }

  // Migration: Kronus UI snapshot (model, soul, tools, skills, format)
  try {
    db.prepare("SELECT session_config FROM chat_conversations LIMIT 1").get();
  } catch (error: any) {
    if (error.message?.includes("no such column")) {
      db.exec(`ALTER TABLE chat_conversations ADD COLUMN session_config TEXT`);
    }
  }

  // Migration 014: Hourglass artifact shelf refs
  try {
    db.prepare("SELECT artifact_refs FROM chat_conversations LIMIT 1").get();
  } catch (error: any) {
    if (error.message?.includes("no such column")) {
      db.exec(`ALTER TABLE chat_conversations ADD COLUMN artifact_refs TEXT DEFAULT '[]'`);
    }
  }

  // Migration 015: Hourglass append-only chat log (events: messages, tool calls, shelf adds, muse proposals, paints, session resumes)
  try {
    db.prepare("SELECT chat_log FROM chat_conversations LIMIT 1").get();
  } catch (error: any) {
    if (error.message?.includes("no such column")) {
      db.exec(`ALTER TABLE chat_conversations ADD COLUMN chat_log TEXT DEFAULT '[]'`);
    }
  }

  // Migration 016: per-chat running cost (Kronus + Muse + tools, all sources).
  // Updated by observability.recomputeConversationCost() after every traced span.
  try {
    db.prepare("SELECT cost_usd FROM chat_conversations LIMIT 1").get();
  } catch (error: any) {
    if (error.message?.includes("no such column")) {
      db.exec(`ALTER TABLE chat_conversations ADD COLUMN cost_usd REAL DEFAULT 0`);
      db.exec(`ALTER TABLE chat_conversations ADD COLUMN actual_input_tokens INTEGER DEFAULT 0`);
      db.exec(`ALTER TABLE chat_conversations ADD COLUMN actual_output_tokens INTEGER DEFAULT 0`);
    }
  }
}

/**
 * Estimate token count for a messages array (~4 chars per token).
 * Only counts user + assistant text content, not tool invocations or system messages.
 */
function estimateMessageTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const msg of messages) {
    if (msg.role === "user" || msg.role === "assistant") {
      chars += (msg.content || "").length;
      const parts = (msg as any).parts;
      if (Array.isArray(parts)) {
        chars += parts
          .filter((part) => part?.type === "text" && typeof part.text === "string")
          .map((part) => part.text.length)
          .reduce((sum, len) => sum + len, 0);
      }
    }
  }
  return Math.ceil(chars / 4);
}

// Save a new conversation
export function saveConversation(
  title: string,
  messages: ChatMessage[],
  sessionConfigJson?: string | null,
  artifactRefsJson?: string | null,
  chatLogJson?: string | null
): number {
  const db = getDatabase();
  initConversationsTable();
  const messageCount = messages.length;
  const estimatedTokens = estimateMessageTokens(messages);

  const result = db
    .prepare(
      `
    INSERT INTO chat_conversations (title, messages, session_config, artifact_refs, chat_log, message_count, estimated_tokens, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `
    )
    .run(title, JSON.stringify(messages), sessionConfigJson ?? null, artifactRefsJson ?? "[]", chatLogJson ?? "[]", messageCount, estimatedTokens);

  const id = result.lastInsertRowid as number;

  // Register in object registry
  try {
    const { registerObject } = require("./object-registry");
    registerObject({ type: "conversation", sourceTable: "chat_conversations", sourceId: String(id), title, estimatedTokens });
  } catch { /* registry is non-critical */ }

  return id;
}

// Update an existing conversation.
// Pass `undefined` to leave a column unchanged in DB.
export function updateConversation(
  id: number,
  title: string,
  messages: ChatMessage[],
  sessionConfigJson?: string | null | undefined,
  artifactRefsJson?: string | null | undefined,
  chatLogJson?: string | null | undefined
): void {
  const db = getDatabase();
  initConversationsTable();
  const messageCount = messages.length;
  const estimatedTokens = estimateMessageTokens(messages);

  // Build an UPDATE that touches only provided columns.
  const sets: string[] = [
    "title = ?",
    "messages = ?",
    "message_count = ?",
    "estimated_tokens = ?",
    "updated_at = CURRENT_TIMESTAMP",
  ];
  const params: unknown[] = [title, JSON.stringify(messages), messageCount, estimatedTokens];
  if (sessionConfigJson !== undefined) {
    sets.push("session_config = ?");
    params.push(sessionConfigJson);
  }
  if (artifactRefsJson !== undefined) {
    sets.push("artifact_refs = ?");
    params.push(artifactRefsJson);
  }
  if (chatLogJson !== undefined) {
    sets.push("chat_log = ?");
    params.push(chatLogJson);
  }
  params.push(id);

  db.prepare(`UPDATE chat_conversations SET ${sets.join(", ")} WHERE id = ?`).run(...params);

  // Update registry
  try {
    const { registerObject } = require("./object-registry");
    registerObject({ type: "conversation", sourceTable: "chat_conversations", sourceId: String(id), title, estimatedTokens });
  } catch { /* registry is non-critical */ }
}

// Update only the title without touching updated_at (for summary generation)
export function updateConversationTitle(id: number, title: string): void {
  const db = getDatabase();
  initConversationsTable();

  db.prepare(
    `
    UPDATE chat_conversations
    SET title = ?
    WHERE id = ?
  `
  ).run(title, id);

  try {
    const { registerObject } = require("./object-registry");
    registerObject({ type: "conversation", sourceTable: "chat_conversations", sourceId: String(id), title });
  } catch { /* registry is non-critical */ }
}

// Get a conversation by ID
export function getConversation(id: number): Conversation | null {
  const db = getDatabase();
  initConversationsTable();

  const row = db.prepare("SELECT * FROM chat_conversations WHERE id = ?").get(id) as any;

  if (!row) return null;

  return {
    ...row,
    messages: JSON.parse(row.messages),
    session_config: row.session_config ?? null,
    artifact_refs: row.artifact_refs ?? "[]",
    chat_log: row.chat_log ?? "[]",
  };
}

// List all conversations (most recent first)
export function listConversations(
  limit = 50,
  offset = 0
): { conversations: Omit<Conversation, "messages">[]; total: number } {
  const db = getDatabase();
  initConversationsTable();

  const total = (db.prepare("SELECT COUNT(*) as count FROM chat_conversations").get() as any).count;

  const rows = db
    .prepare(
      `
    SELECT id, title, summary, summary_updated_at, created_at, updated_at,
           message_count, estimated_tokens,
           cost_usd, actual_input_tokens, actual_output_tokens,
           artifact_refs
    FROM chat_conversations
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `
    )
    .all(limit, offset) as any[];

  // Derive a thumbnail + artifact_count from artifact_refs without
  // exposing the full JSON blob to the client.
  const conversations = rows.map((row) => {
    let latestThumbUrl: string | null = null;
    let artifactCount = 0;
    try {
      const refs = JSON.parse(row.artifact_refs ?? "[]") as Array<{ kind?: string; thumbUrl?: string }>;
      artifactCount = refs.length;
      // Walk from newest backward and pick the first ref with a thumb.
      for (let i = refs.length - 1; i >= 0; i--) {
        if (refs[i]?.thumbUrl) { latestThumbUrl = refs[i].thumbUrl ?? null; break; }
      }
    } catch { /* ignore */ }
    return {
      ...row,
      latest_thumb_url: latestThumbUrl,
      artifact_count: artifactCount,
      // Strip the heavy artifact_refs blob — only summary fields go to the client.
      artifact_refs: undefined,
    };
  });

  return {
    conversations,
    total,
  };
}

// Delete a conversation
export function deleteConversation(id: number): boolean {
  const db = getDatabase();
  initConversationsTable();

  const result = db.prepare("DELETE FROM chat_conversations WHERE id = ?").run(id);
  return result.changes > 0;
}

// Search conversations by title or content
export function searchConversations(query: string, limit = 20): Omit<Conversation, "messages">[] {
  const db = getDatabase();
  initConversationsTable();

  const rows = db
    .prepare(
      `
    SELECT id, title, summary, summary_updated_at, created_at, updated_at
    FROM chat_conversations
    WHERE title LIKE ? OR messages LIKE ?
    ORDER BY updated_at DESC
    LIMIT ?
  `
    )
    .all(`%${query}%`, `%${query}%`, limit) as any[];

  return rows;
}

// Update conversation summary
export function updateConversationSummary(id: number, summary: string): boolean {
  const db = getDatabase();
  initConversationsTable();

  const result = db
    .prepare(
      `
    UPDATE chat_conversations
    SET summary = ?, summary_updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `
    )
    .run(summary, id);

  if (result.changes > 0) {
    try {
      const { lookupBySource, updateObjectSummary } = require("./object-registry");
      const obj = lookupBySource("chat_conversations", String(id));
      if (obj) updateObjectSummary(obj.uuid, summary);
    } catch { /* registry is non-critical */ }
  }

  return result.changes > 0;
}

// Get conversations without summaries (for backfill)
export function getConversationsWithoutSummary(limit = 5): Conversation[] {
  const db = getDatabase();
  initConversationsTable();

  const rows = db
    .prepare(
      `
    SELECT *
    FROM chat_conversations
    WHERE summary IS NULL
    ORDER BY updated_at DESC
    LIMIT ?
  `
    )
    .all(limit) as any[];

  return rows.map((row) => ({
    ...row,
    messages: JSON.parse(row.messages),
  }));
}

// Check if conversation has changes since last summary
export function conversationHasChanges(id: number): boolean {
  const db = getDatabase();
  initConversationsTable();

  const row = db
    .prepare(
      `
    SELECT
      updated_at,
      summary_updated_at
    FROM chat_conversations
    WHERE id = ?
  `
    )
    .get(id) as any;

  if (!row) return false;

  // No summary yet = has changes
  if (!row.summary_updated_at) return true;

  // Compare dates - if updated_at > summary_updated_at, there are changes
  return new Date(row.updated_at) > new Date(row.summary_updated_at);
}
