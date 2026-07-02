import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";

/** Absolute runaway ceiling — only trips on pathological loops, not normal agent work. */
export const MAX_RUNAWAY_TOOL_STEPS = 64;

/**
 * Block only when the same tool+args repeats this many times in one user turn.
 * A single accidental duplicate (e.g. a reasoning model re-issuing the exact
 * same web_search query) is normal research behavior, not a loop — only a tight
 * repetition of 4+ identical calls is treated as stuck.
 */
export const MAX_IDENTICAL_TOOL_REPEATS = 4;

function isClientToolPart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  const p = part as { type?: string; providerExecuted?: boolean };
  if (p.providerExecuted) return false;
  return p.type === "dynamic-tool" || (typeof p.type === "string" && p.type.startsWith("tool-"));
}

function toolNameFromPart(part: unknown): string | null {
  if (!part || typeof part !== "object") return null;
  const p = part as { type?: string; toolName?: string };
  if (p.type === "dynamic-tool") return p.toolName ?? null;
  if (typeof p.type === "string" && p.type.startsWith("tool-")) {
    return p.type.slice("tool-".length);
  }
  return null;
}

export function toolCallSignature(toolName: string, args: Record<string, unknown>): string {
  return `${toolName}:${JSON.stringify(args ?? {})}`;
}

/** Parts on assistant messages since the last user message. */
function assistantPartsSinceLastUser(messages: UIMessage[]): unknown[] {
  const parts: unknown[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") break;
    if (m.role === "assistant" && Array.isArray(m.parts)) {
      parts.unshift(...m.parts);
    }
  }
  return parts;
}

/** Count tool-round steps in the last assistant message (step-start delimiters + 1). */
export function countAssistantToolSteps(messages: UIMessage[]): number {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant" || !Array.isArray(last.parts)) return 0;

  let stepStarts = 0;
  for (const part of last.parts) {
    if ((part as { type?: string }).type === "step-start") stepStarts += 1;
  }
  return stepStarts + 1;
}

/** Count client-executed tool invocations since the last user message. */
export function countClientToolCallsSinceLastUser(messages: UIMessage[]): number {
  return assistantPartsSinceLastUser(messages).filter(isClientToolPart).length;
}

/** @deprecated use countClientToolCallsSinceLastUser */
export function countAssistantClientToolCalls(messages: UIMessage[]): number {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant" || !Array.isArray(last.parts)) return 0;
  return last.parts.filter(isClientToolPart).length;
}

export type ToolLoopStatus = {
  /** An identical-call repeat or runaway was detected. */
  loopDetected: boolean;
  /**
   * Only true for the absolute runaway-step ceiling. A hard stop halts the run
   * and shows the "agent stopped" banner. Identical-call repeats are soft: the
   * redundant call is skipped with a notice, but the turn continues so the model
   * can read the notice and finish gracefully.
   */
  hardStop: boolean;
  reason?: string;
  steps: number;
  toolCalls: number;
  repeatedSignature?: string;
};

/**
 * Model-facing notice returned in place of a skipped identical tool call.
 * Explains the rule so the agent can recover instead of blindly retrying.
 */
export function identicalToolLimitNotice(toolName: string): string {
  return (
    `Tartarus skipped this \`${toolName}\` call: you already invoked it with these exact ` +
    `arguments earlier this turn, and identical tool calls are de-duplicated to avoid loops ` +
    `(repeating the same call ${MAX_IDENTICAL_TOOL_REPEATS}+ times trips the loop guard). ` +
    `Use the result you already received, change the arguments, or answer the user now if you ` +
    `have enough information.`
  );
}

/** Model-facing notice when the run hits the absolute per-turn step ceiling. */
export function runawayToolNotice(): string {
  return (
    `Tartarus stopped this turn after reaching the ceiling of ${MAX_RUNAWAY_TOOL_STEPS} tool ` +
    `steps. Summarize what you found so far and respond; the user can send another message to continue.`
  );
}

/** Detect identical tool+args called too many times since the last user message. */
export function detectIdenticalToolLoop(messages: UIMessage[]): ToolLoopStatus {
  const steps = countAssistantToolSteps(messages);
  const toolCalls = countClientToolCallsSinceLastUser(messages);

  // The runaway step ceiling is the ONLY hard stop — it's the genuine
  // pathological case where the run must be halted.
  if (steps > MAX_RUNAWAY_TOOL_STEPS) {
    return {
      loopDetected: true,
      hardStop: true,
      reason: `runaway tool steps (>${MAX_RUNAWAY_TOOL_STEPS})`,
      steps,
      toolCalls,
    };
  }

  const sigCounts = new Map<string, number>();
  for (const part of assistantPartsSinceLastUser(messages)) {
    if (!isClientToolPart(part)) continue;
    const name = toolNameFromPart(part) ?? "tool";
    const input = (part as { input?: unknown }).input;
    const args =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const sig = toolCallSignature(name, args);
    sigCounts.set(sig, (sigCounts.get(sig) ?? 0) + 1);
  }

  for (const [sig, count] of sigCounts) {
    if (count >= MAX_IDENTICAL_TOOL_REPEATS) {
      return {
        loopDetected: true,
        hardStop: false,
        reason: `identical tool call repeated ${count}×`,
        steps,
        toolCalls,
        repeatedSignature: sig,
      };
    }
  }

  return { loopDetected: false, hardStop: false, steps, toolCalls };
}

export function wouldRepeatToolLoop(
  messages: UIMessage[],
  toolName: string,
  args: Record<string, unknown>,
): ToolLoopStatus {
  const status = detectIdenticalToolLoop(messages);
  if (status.loopDetected) return status;

  const sig = toolCallSignature(toolName, args);
  let count = 0;
  for (const part of assistantPartsSinceLastUser(messages)) {
    if (!isClientToolPart(part)) continue;
    const name = toolNameFromPart(part) ?? "tool";
    const input = (part as { input?: unknown }).input;
    const partArgs =
      input && typeof input === "object" && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    if (toolCallSignature(name, partArgs) === sig) count += 1;
  }

  if (count >= MAX_IDENTICAL_TOOL_REPEATS - 1) {
    return {
      loopDetected: true,
      hardStop: false,
      reason: `identical tool call would repeat (${count + 1}×)`,
      steps: status.steps,
      toolCalls: status.toolCalls + 1,
      repeatedSignature: sig,
    };
  }

  return { loopDetected: false, hardStop: false, steps: status.steps, toolCalls: status.toolCalls + 1 };
}

/**
 * Gate for Hourglass `sendAutomaticallyWhen`.
 * Allows unlimited distinct tool work. Identical-call repeats are handled
 * gracefully (skipped with a notice, turn continues), so only the runaway
 * step ceiling blocks the auto-send loop here.
 */
export function shouldAutoSendAfterToolCalls({ messages }: { messages: UIMessage[] }): boolean {
  if (!lastAssistantMessageIsCompleteWithToolCalls({ messages })) return false;

  const status = detectIdenticalToolLoop(messages);
  if (status.hardStop) {
    console.warn(
      `[hourglass] stopped auto-send: ${status.reason} (steps=${status.steps}, tools=${status.toolCalls})`,
    );
    return false;
  }

  return true;
}
