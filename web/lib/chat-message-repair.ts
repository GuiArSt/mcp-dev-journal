/**
 * Repair persisted / truncated UI message parts before model inference.
 *
 * conversation-persist strips inline file/image bytes and may truncate tool
 * outputs. Those placeholders are valid in storage but break
 * convertToModelMessages() Zod validation unless converted to text summaries.
 */

import type { ChatReasoningProvider } from "@/lib/chat-reasoning-repair";
import { stripIncompatibleReasoningParts } from "@/lib/chat-reasoning-repair";

type LoosePart = Record<string, unknown>;

const NON_MODEL_PART_TYPES = new Set(["step-start"]);

function isBlobUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("blob:");
}

/** UI messages may use `parts` or legacy `content` arrays — normalize to `parts`. */
export function normalizeUiMessageParts<T extends { parts?: unknown; content?: unknown }>(
  message: T,
): T {
  // Prefer `parts`; promote legacy `content` only when parts are missing/empty.
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    if (message.content !== undefined) {
      return { ...message, content: undefined };
    }
    return message;
  }
  if (Array.isArray(message.content)) {
    return { ...message, parts: message.content, content: undefined };
  }
  if (typeof message.content === "string" && message.content.length > 0) {
    return {
      ...message,
      parts: [{ type: "text", text: message.content }],
      content: undefined,
    };
  }
  return message;
}

export function normalizeUiMessagesForModel<T extends { parts?: unknown; content?: unknown }>(
  messages: T[],
): T[] {
  return messages.map(normalizeUiMessageParts);
}

function isToolPart(part: LoosePart): boolean {
  const t = part.type;
  return t === "dynamic-tool" || (typeof t === "string" && t.startsWith("tool-"));
}

function toolNameFromPart(part: LoosePart): string {
  if (typeof part.toolName === "string" && part.toolName.trim()) {
    return part.toolName.trim();
  }
  const t = part.type;
  if (typeof t === "string" && t.startsWith("tool-")) {
    return t.slice("tool-".length);
  }
  return "tool";
}

/** Summarize a tool UI part that cannot be sent to the model as a tool message. */
export function summarizeUnsignedToolPart(part: LoosePart): string | null {
  const toolName = toolNameFromPart(part);
  const input = part.input;
  const output = part.output;

  const inputStr =
    input !== undefined ? JSON.stringify(input).slice(0, 400) : "";
  const outputStr =
    output !== undefined ? JSON.stringify(output).slice(0, 800) : "";

  const lines = [`[Earlier ${toolName} tool call — not replayed to model]`];
  if (inputStr) lines.push(`Input: ${inputStr}`);
  if (outputStr) lines.push(`Output: ${outputStr}`);
  return lines.join("\n");
}

function isBrokenToolPart(part: LoosePart): boolean {
  if (!isToolPart(part)) return false;
  const toolCallId = part.toolCallId;
  if (typeof toolCallId !== "string" || !toolCallId.trim()) return true;
  if (part.persistedToolOutputTruncated === true) return true;
  return false;
}

function repairPartForModel(part: unknown): unknown[] {
  if (!part || typeof part !== "object") return [];

  const p = part as LoosePart;

  if (typeof p.type === "string" && NON_MODEL_PART_TYPES.has(p.type)) {
    return [];
  }

  if (p.type === "file") {
    const url = typeof p.url === "string" ? p.url : "";
    const hasUrl = url.length > 0 && !isBlobUrl(url);
    const hasData = p.data !== undefined && p.data !== null;
    if (p.persistedInlineMedia === true || isBlobUrl(url) || (!hasUrl && !hasData)) {
      const label =
        (typeof p.filename === "string" && p.filename) ||
        (typeof p.mediaType === "string" && p.mediaType) ||
        "attachment";
      return [
        {
          type: "text",
          text: `[Attached file: ${label} — content not available in model context]`,
        },
      ];
    }
  }

  if (p.type === "image") {
    const url = typeof p.url === "string" ? p.url : "";
    const image = typeof p.image === "string" ? p.image : "";
    const hasImage =
      (image.length > 0 && !isBlobUrl(image)) ||
      (url.length > 0 && !isBlobUrl(url));
    if (p.persistedInlineMedia === true || !hasImage) {
      return [
        {
          type: "text",
          text: "[Image attachment — content not available in model context]",
        },
      ];
    }
  }

  if (isBrokenToolPart(p)) {
    const summary = summarizeUnsignedToolPart(p);
    return summary ? [{ type: "text", text: summary }] : [];
  }

  return [part];
}

function partHasVisibleContent(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  const p = part as LoosePart;
  if (p.type === "text") {
    return typeof p.text === "string" && p.text.trim().length > 0;
  }
  return true;
}

/** Convert persisted placeholders into text the model can consume. */
export function repairPartsForModel(parts: unknown[] | undefined): unknown[] {
  if (!Array.isArray(parts)) return [];
  return parts.flatMap(repairPartForModel);
}

/**
 * Same repair as model path — used when reloading conversations into the UI so
 * we do not run sanitizePartsForPersist twice (which strips already-stripped data).
 */
export function restorePartsFromPersist(parts: unknown[] | undefined): unknown[] {
  return repairPartsForModel(parts);
}

export function repairUiMessagesForModel<T extends { role?: string; parts?: unknown[]; content?: unknown }>(
  messages: T[],
): T[] {
  return normalizeUiMessagesForModel(messages)
    .map((msg) => {
      if (!Array.isArray(msg.parts)) return msg;
      const repaired = repairPartsForModel(msg.parts);
      if (repaired === msg.parts || repaired.length === msg.parts.length) {
        let same = true;
        for (let i = 0; i < repaired.length; i++) {
          if (repaired[i] !== msg.parts[i]) {
            same = false;
            break;
          }
        }
        if (same) return msg;
      }
      return { ...msg, parts: repaired, content: undefined };
    })
    .filter((msg) => {
      if (Array.isArray(msg.parts) && msg.parts.length > 0) {
        return msg.parts.some(partHasVisibleContent);
      }
      return typeof msg.content === "string" && msg.content.trim().length > 0;
    });
}

/** Normalize, strip cross-provider reasoning, repair media/tools. */
export function prepareUiMessagesForInference<T extends { role?: string; parts?: unknown; content?: unknown }>(
  messages: T[],
  targetProvider: ChatReasoningProvider,
): { messages: T[]; strippedReasoning: number } {
  const reasoningRepair = stripIncompatibleReasoningParts(
    normalizeUiMessagesForModel(messages),
    targetProvider,
  );
  return {
    messages: repairUiMessagesForModel(reasoningRepair.messages),
    strippedReasoning: reasoningRepair.stripped,
  };
}

type ModelContentPart = Record<string, unknown>;

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasModelImagePayload(part: ModelContentPart): boolean {
  const image = part.image;
  if (image instanceof URL) return true;
  if (typeof image === "string") return image.length > 0 && !isBlobUrl(image);
  return image !== undefined && image !== null;
}

function hasModelFilePayload(part: ModelContentPart): boolean {
  const data = part.data;
  if (data instanceof URL) return true;
  if (typeof data === "string") return data.length > 0 && !isBlobUrl(data);
  return data !== undefined && data !== null;
}

function summarizeModelToolPart(part: ModelContentPart, label: string): string {
  const toolName = nonEmptyString(part.toolName) ? part.toolName : "tool";
  const toolCallId = nonEmptyString(part.toolCallId) ? part.toolCallId : "";
  const lines = [`[${label}: ${toolName}${toolCallId ? ` (${toolCallId})` : ""}]`];
  if (part.input !== undefined) {
    lines.push(`Input: ${JSON.stringify(part.input).slice(0, 400)}`);
  }
  if (part.output !== undefined) {
    lines.push(`Output: ${JSON.stringify(part.output).slice(0, 800)}`);
  }
  return lines.join("\n");
}

function isValidModelToolCallPart(part: ModelContentPart): boolean {
  return (
    part.type === "tool-call" &&
    nonEmptyString(part.toolCallId) &&
    nonEmptyString(part.toolName)
  );
}

function isValidModelToolResultPart(part: ModelContentPart): boolean {
  return (
    part.type === "tool-result" &&
    nonEmptyString(part.toolCallId) &&
    nonEmptyString(part.toolName) &&
    part.output !== undefined
  );
}

function isValidModelToolApprovalResponsePart(part: ModelContentPart): boolean {
  return (
    part.type === "tool-approval-response" &&
    nonEmptyString(part.approvalId) &&
    typeof part.approved === "boolean"
  );
}

function repairModelContentPart(part: ModelContentPart): ModelContentPart[] {
  if (part.type === "file") {
    if (!hasModelFilePayload(part)) {
      const filename =
        (typeof part.filename === "string" && part.filename) ||
        (typeof part.mediaType === "string" && part.mediaType) ||
        "attachment";
      return [
        {
          type: "text",
          text: `[Attached file: ${filename} — content not available in model context]`,
        },
      ];
    }
  }

  if (part.type === "image") {
    if (!hasModelImagePayload(part)) {
      return [
        {
          type: "text",
          text: "[Image attachment — content not available in model context]",
        },
      ];
    }
  }

  if (part.type === "reasoning") {
    const text = typeof part.text === "string" ? part.text.trim() : "";
    const meta = part.providerOptions ?? part.providerMetadata;
    if (!text && !meta) return [];
  }

  if (part.type === "tool-call" && !isValidModelToolCallPart(part)) {
    return [{ type: "text", text: summarizeModelToolPart(part, "Earlier tool call") }];
  }

  if (part.type === "tool-result" && !isValidModelToolResultPart(part)) {
    return [{ type: "text", text: summarizeModelToolPart(part, "Earlier tool result") }];
  }

  if (part.type === "tool-approval-request" && !nonEmptyString(part.approvalId)) {
    return [];
  }

  if (part.type === "tool-approval-response" && !isValidModelToolApprovalResponsePart(part)) {
    return [];
  }

  return [part];
}

function repairModelMessageContent<T extends { role?: string; content?: unknown }>(
  message: T,
): T | null {
  if (message.role === "tool") {
    if (!Array.isArray(message.content)) return null;
    const content = (message.content as ModelContentPart[]).flatMap((part) => {
      if (isValidModelToolResultPart(part) || isValidModelToolApprovalResponsePart(part)) {
        return [part];
      }
      return repairModelContentPart(part);
    });
    if (content.length === 0) return null;
    const onlyToolParts = content.every(
      (part) =>
        isValidModelToolResultPart(part) || isValidModelToolApprovalResponsePart(part),
    );
    if (!onlyToolParts) {
      return {
        ...message,
        role: "user",
        content: content
          .map((part) =>
            part.type === "text" && typeof part.text === "string" ? part.text : "",
          )
          .filter(Boolean)
          .join("\n"),
      } as T;
    }
    return { ...message, content } as T;
  }

  if (typeof message.content === "string") {
    return message.content.trim().length > 0 ? message : null;
  }

  if (!Array.isArray(message.content)) return message;

  const content = (message.content as ModelContentPart[]).flatMap(repairModelContentPart);
  if (content.length === 0) return null;
  return { ...message, content } as T;
}

/** Last-line defense after convertToModelMessages — fixes schema rejects at streamText. */
export function repairModelMessages<T extends { role?: string; content?: unknown }>(
  messages: T[],
): T[] {
  return messages
    .map(repairModelMessageContent)
    .filter((message): message is T => message !== null);
}
