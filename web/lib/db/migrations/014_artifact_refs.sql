-- Hourglass artifact shelf: list of UUID refs (+ denormalized snapshot) per conversation.
-- Runtime migration also runs in web/lib/db-conversations.ts initConversationsTable().
ALTER TABLE chat_conversations ADD COLUMN artifact_refs TEXT DEFAULT '[]';
