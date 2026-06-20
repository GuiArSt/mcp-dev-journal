/**
 * Shrink conversation payloads before PATCH/POST — inline data: URLs in
 * composer attachments must not be persisted (images live in media_assets +
 * artifact_refs).
 */

import type { ChatMessage } from "@/lib/db-conversations";

const MAX_REASONING_JSON = 32_000;
const MAX_TOOL_PART_JSON = 64_000;

function isDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:");
}

/** Strip inline binary from a single UI message part. */
export function stripInlineMediaFromPart(part: unknown): unknown {
  if (!part || typeof part !== "object") return part;
  const p = part as Record<string, unknown>;
  const type = p.type;

  if (type === "file" && isDataUrl(p.url)) {
    return {
      type: "file",
      mediaType: p.mediaType,
      filename: p.filename ?? "attachment",
      persistedInlineMedia: true,
    };
  }

  if (type === "image" && isDataUrl(p.image)) {
    return { type: "image", persistedInlineMedia: true };
  }

  if (type === "reasoning") {
    const serialized = JSON.stringify(p);
    if (serialized.length > MAX_REASONING_JSON) {
      return {
        type: "reasoning",
        text: typeof p.text === "string" ? p.text.slice(0, 4_000) : "",
        persistedReasoningTruncated: true,
      };
    }
  }

  if (typeof type === "string" && type.startsWith("tool-")) {
    const serialized = JSON.stringify(p);
    if (serialized.length > MAX_TOOL_PART_JSON) {
      const toolName = typeof p.toolName === "string" ? p.toolName : type.slice(5);
      return {
        type,
        toolCallId: p.toolCallId,
        toolName,
        state: p.state,
        persistedToolOutputTruncated: true,
        output:
          typeof (p as { output?: unknown }).output === "string"
            ? String((p as { output: string }).output).slice(0, 2_000)
            : undefined,
      };
    }
  }

  return part;
}

export function sanitizePartsForPersist(parts: unknown[] | undefined): unknown[] | undefined {
  if (!parts?.length) return parts;
  return parts.map(stripInlineMediaFromPart);
}

export function sanitizeChatMessageForPersist(message: ChatMessage): ChatMessage {
  const parts = sanitizePartsForPersist(message.parts as unknown[] | undefined);
  return parts ? { ...message, parts } : message;
}

export function sanitizeMessagesForPersist(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(sanitizeChatMessageForPersist);
}
