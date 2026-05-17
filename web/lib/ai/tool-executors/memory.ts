import type { ToolExecutor } from "./types";

interface ChatIndexConversation {
  id: number;
  uuid?: string | null;
  title?: string | null;
  summary?: string | null;
  updatedAt?: string | null;
  messageCount?: number | null;
}

interface ChatIndexApiResponse {
  conversations?: ChatIndexConversation[];
  total?: number;
  missingSummaryCount?: number;
  offset?: number;
}

function formatIndexResponse(data: ChatIndexApiResponse): string {
  const conversations = data.conversations || [];
  if (conversations.length === 0) {
    const missing = data.missingSummaryCount || 0;
    return missing > 0
      ? `No summarized chats found. ${missing} conversation(s) need manual summary generation.`
      : "No summarized chats found.";
  }

  const rows = conversations.map((c) => {
    const ref = c.uuid ? `uuid:${c.uuid}` : `id:${c.id}`;
    return `- **${c.title || "Untitled"}** (${c.messageCount || 0} messages, updated ${c.updatedAt})\n  ${ref}\n  ${c.summary || "No summary"}`;
  });

  const footer = [
    `Found ${data.total} summarized chat(s).`,
    (data.missingSummaryCount || 0) > 0
      ? `${data.missingSummaryCount} conversation(s) have no summary; summarize manually when needed.`
      : null,
    (data.offset || 0) + conversations.length < (data.total || 0)
      ? `Use offset=${(data.offset || 0) + conversations.length} for older chats.`
      : null,
  ].filter(Boolean);

  return `${rows.join("\n\n")}\n\n${footer.join(" ")}`;
}

export const memoryExecutors: Record<string, ToolExecutor> = {
  memory_list_chat_index: async (args) => {
    const params = new URLSearchParams();
    if (args.query) params.set("query", String(args.query));
    if (args.limit) params.set("limit", String(args.limit));
    if (args.offset) params.set("offset", String(args.offset));

    const res = await fetch(`/api/memory/chats?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch chat index");

    return { output: formatIndexResponse(data) };
  },

  memory_fetch_chat: async (args) => {
    const params = new URLSearchParams();
    if (args.uuid) params.set("uuid", String(args.uuid));
    if (args.id) params.set("id", String(args.id));
    if (args.maxChars) params.set("maxChars", String(args.maxChars));

    const res = await fetch(`/api/memory/chats?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch chat");

    const c = data.conversation as {
      id: number;
      uuid?: string | null;
      title: string;
      summary?: string | null;
      createdAt: string;
      updatedAt: string;
      messageCount: number;
      content?: string;
      truncated?: boolean;
    };
    const ref = c.uuid ? `UUID: ${c.uuid}` : `ID: ${c.id}`;
    const meta = [
      `# ${c.title}`,
      ref,
      `Created: ${c.createdAt}`,
      `Updated: ${c.updatedAt}`,
      `Messages: ${c.messageCount}`,
      c.summary ? `Summary: ${c.summary}` : null,
      c.truncated ? "Content was truncated by maxChars. Increase maxChars if needed." : null,
    ].filter(Boolean);

    return { output: `${meta.join("\n")}\n\n---\n\n${c.content || "[No readable messages]"}` };
  },
};
