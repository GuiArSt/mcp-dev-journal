-- Migration: Hourglass append-only chat log
-- Date: 2026-04-15
-- Description: Append-only chronological event stream attached to a conversation.
--              Captures user/assistant messages, tool calls, shelf adds, muse
--              proposals & paints, and session resumes. Used by the Muse to
--              inform its propose decisions and by Kronus to see what's actually
--              happened in the room beyond the message transcript.
--
-- This SQL file is reference documentation. The actual migration runs inline in
-- web/lib/db-conversations.ts (initConversationsTable) — try `SELECT chat_log`,
-- if it errors with "no such column" run the ALTER below.

ALTER TABLE chat_conversations ADD COLUMN chat_log TEXT DEFAULT '[]';
