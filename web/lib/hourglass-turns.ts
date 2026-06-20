/**
 * Pure turn reconstruction from useChat UIMessages.
 * Completed turns are committed only while idle; live streaming uses extractLiveTail.
 */

import type { UIMessage } from "ai";
import type { ToolCallSummary, Turn } from "@/components/chat/hourglass/types";

export function messageToText(m: UIMessage): string {
  if (!m.parts) return "";
  const out: string[] = [];
  for (const part of m.parts) {
    if (part.type === "text") out.push(part.text ?? "");
    else if (part.type === "file") {
      const filePart = part as unknown as { filename?: string; mediaType?: string };
      if (filePart.mediaType?.startsWith("image/")) {
        out.push(`[image attached${filePart.filename ? `: ${filePart.filename}` : ""}]`);
      } else if (filePart.mediaType === "application/pdf") {
        out.push(`[PDF attached${filePart.filename ? `: ${filePart.filename}` : ""}]`);
      }
    } else if ((part as unknown as { type?: string }).type === "image") {
      out.push("[image attached]");
    }
  }
  return out.join("");
}

export function messageToolCalls(m: UIMessage): ToolCallSummary[] {
  const calls: ToolCallSummary[] = [];
  if (!m.parts) return calls;
  for (const part of m.parts) {
    if (part.type?.startsWith("tool-")) {
      const p = part as unknown as { toolName?: string; state?: string };
      const name = p.toolName ?? part.type.slice(5);
      const state = p.state === "output-available" ? "done" : p.state === "output-error" ? "error" : "pending";
      calls.push({ name, status: state });
    }
  }
  return calls;
}

export function assistantHasPendingToolCalls(m: UIMessage): boolean {
  if (m.role !== "assistant" || !m.parts) return false;
  for (const part of m.parts) {
    if (!part.type?.startsWith("tool-")) continue;
    const p = part as unknown as { state?: string };
    if (p.state !== "output-available" && p.state !== "output-error") return true;
  }
  return false;
}

/** True when idle messages are safe to freeze into completedTurns (no in-flight tools). */
export function shouldCommitCompletedTurns(messages: UIMessage[]): boolean {
  const last = messages.at(-1);
  if (last?.role === "assistant" && assistantHasPendingToolCalls(last)) return false;
  return true;
}

/** Build completed user↔assistant pairs from a full message list. */
export function buildTurnsFromMessages(messages: UIMessage[]): Turn[] {
  const out: Turn[] = [];
  let pendingUser: UIMessage | null = null;
  let idx = 0;
  for (const m of messages) {
    if (m.role === "user") {
      pendingUser = m;
    } else if (m.role === "assistant" && pendingUser) {
      idx += 1;
      out.push({
        id: m.id,
        index: idx,
        userMessageId: pendingUser.id,
        assistantMessageId: m.id,
        startedAt: (m as unknown as { createdAt?: Date }).createdAt?.getTime?.() ?? Date.now(),
        userText: messageToText(pendingUser).trim(),
        assistantText: messageToText(m).trim(),
        toolCalls: messageToolCalls(m),
      });
      pendingUser = null;
    }
  }
  return out;
}

export interface LiveTurnTail {
  userText: string;
  assistantText: string;
  toolCalls: ToolCallSummary[];
}

/** In-flight user message + partial assistant (while streaming or thinking). */
export function extractLiveTail(messages: UIMessage[], active: boolean): LiveTurnTail | null {
  if (!active || messages.length === 0) return null;

  let userMsg: UIMessage | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userMsg = messages[i];
      break;
    }
  }
  if (!userMsg) return null;

  const userText = messageToText(userMsg).trim();
  const last = messages[messages.length - 1];
  if (last.role === "assistant") {
    return {
      userText,
      assistantText: messageToText(last),
      toolCalls: messageToolCalls(last),
    };
  }
  return { userText, assistantText: "", toolCalls: [] };
}
