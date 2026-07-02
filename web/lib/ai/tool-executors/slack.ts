import type { ToolExecutor } from "./types";

function formatConversationList(data: {
  conversations: Array<Record<string, unknown>>;
  total: number;
  limit: number;
  offset: number;
}) {
  if (!data.conversations.length) {
    return "No Slack conversations matched.";
  }

  const lines = data.conversations.map((conversation, index) => {
    const title = String(conversation.title ?? conversation.id);
    const summary = conversation.summary ? String(conversation.summary) : "(no summary)";
    return `${data.offset + index + 1}. **${title}**
   ID: ${conversation.id} | Vault: ${conversation.vaultType} | Messages: ${conversation.messageCount}
   Summary: ${summary}`;
  });

  return `Found ${data.total} conversation(s); showing ${data.conversations.length} (offset ${data.offset}):

${lines.join("\n\n")}`;
}

function formatConversationDetail(data: {
  conversation: Record<string, unknown>;
  messages: Array<Record<string, unknown>>;
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}) {
  const conversation = data.conversation;
  const header = `## ${conversation.title}
**ID:** ${conversation.id}
**Vault type:** ${conversation.vaultType}
**Messages in vault:** ${conversation.messageCount}
**Summary:** ${conversation.summary || "(none)"}

### Messages (${data.messages.length} of ${data.pagination.total}, offset ${data.pagination.offset})`;

  const body = data.messages
    .map((message) => {
      const author = message.authorName || message.username || message.userId || "unknown";
      const thread = message.threadTs ? ` [thread ${message.threadTs}]` : "";
      const text = String(message.text || "").trim() || "(empty)";
      return `- **${author}** (${message.ts})${thread}: ${text}`;
    })
    .join("\n");

  const footer = data.pagination.hasMore
    ? `\n\n_More messages available — call slack_get_conversation again with messageOffset=${data.pagination.offset + data.messages.length}._`
    : "";

  return `${header}\n\n${body}${footer}`;
}

export const slackExecutors: Record<string, ToolExecutor> = {
  slack_list_conversations: async (args) => {
    const params = new URLSearchParams();
    if (args.query) params.set("query", String(args.query));
    if (args.vaultType) params.set("vaultType", String(args.vaultType));
    if (args.withMessagesOnly === false) params.set("withMessagesOnly", "false");
    if (args.limit) params.set("limit", String(args.limit));
    if (args.offset) params.set("offset", String(args.offset));

    const res = await fetch(`/api/integrations/slack/conversations?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Slack conversation list failed");
    return { output: formatConversationList(data) };
  },

  slack_get_conversation: async (args) => {
    const conversationId = String(args.conversationId);
    const params = new URLSearchParams();
    const messageLimit = Math.min(Math.max(Number(args.messageLimit) || 15, 1), 30);
    params.set("messageLimit", String(messageLimit));
    if (args.messageOffset) params.set("messageOffset", String(args.messageOffset));

    const res = await fetch(
      `/api/integrations/slack/conversations/${encodeURIComponent(conversationId)}?${params}`,
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch Slack conversation");
    let output = formatConversationDetail(data);
    const maxChars = 3500;
    if (output.length > maxChars) {
      output = `${output.slice(0, maxChars)}\n\n…[truncated for context — use narrower messageLimit or offset]`;
    }
    return { output };
  },
};
