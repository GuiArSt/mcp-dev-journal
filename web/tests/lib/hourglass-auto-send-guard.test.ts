import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  countClientToolCallsSinceLastUser,
  countAssistantToolSteps,
  MAX_RUNAWAY_TOOL_STEPS,
  MAX_IDENTICAL_TOOL_REPEATS,
  detectIdenticalToolLoop,
  shouldAutoSendAfterToolCalls,
  wouldRepeatToolLoop,
} from "@/lib/hourglass-auto-send-guard";

function assistantWithTools(parts: UIMessage["parts"]): UIMessage[] {
  return [
    { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
    { id: "a1", role: "assistant", parts },
  ] as UIMessage[];
}

describe("hourglass-auto-send-guard", () => {
  it("counts tool steps from step-start markers", () => {
    const messages = assistantWithTools([
      { type: "tool-slack_list_conversations", toolCallId: "t1", state: "output-available", input: {}, output: "ok" },
      { type: "step-start" },
      { type: "tool-slack_get_conversation", toolCallId: "t2", state: "output-available", input: {}, output: "ok" },
    ] as UIMessage["parts"]);
    expect(countAssistantToolSteps(messages)).toBe(2);
    expect(countClientToolCallsSinceLastUser(messages)).toBe(2);
  });

  it("auto-sends when tool calls are complete and distinct", () => {
    const messages = assistantWithTools([
      { type: "tool-slack_list_conversations", toolCallId: "t1", state: "output-available", input: {}, output: "ok" },
      { type: "tool-slack_get_conversation", toolCallId: "t2", state: "output-available", input: { id: "C1" }, output: "ok" },
    ] as UIMessage["parts"]);
    expect(shouldAutoSendAfterToolCalls({ messages })).toBe(true);
  });

  it("allows many distinct tool calls without blocking", () => {
    const parts = [] as UIMessage["parts"];
    for (let i = 0; i < 10; i++) {
      parts.push({
        type: "tool-slack_get_conversation",
        toolCallId: `t${i}`,
        state: "output-available",
        input: { id: `C${i}` },
        output: "ok",
      });
    }
    expect(shouldAutoSendAfterToolCalls({ messages: assistantWithTools(parts) })).toBe(true);
  });

  it("detects identical tool+args repeats as a soft loop (no hard stop)", () => {
    const parts = [] as UIMessage["parts"];
    for (let i = 0; i < MAX_IDENTICAL_TOOL_REPEATS; i++) {
      parts.push({
        type: "tool-slack_list_conversations",
        toolCallId: `t${i}`,
        state: "output-available",
        input: {},
        output: "ok",
      });
    }
    const messages = assistantWithTools(parts);
    const status = detectIdenticalToolLoop(messages);
    expect(status.loopDetected).toBe(true);
    expect(status.hardStop).toBe(false);
    // Soft loops let the turn continue so the model can finish gracefully.
    expect(shouldAutoSendAfterToolCalls({ messages })).toBe(true);
  });

  it("wouldRepeatToolLoop flags the next identical call as a soft loop", () => {
    const parts = [] as UIMessage["parts"];
    for (let i = 0; i < MAX_IDENTICAL_TOOL_REPEATS - 1; i++) {
      parts.push({
        type: "tool-slack_list_conversations",
        toolCallId: `t${i}`,
        state: "output-available",
        input: {},
        output: "ok",
      });
    }
    const messages = assistantWithTools(parts);
    const status = wouldRepeatToolLoop(messages, "slack_list_conversations", {});
    expect(status.loopDetected).toBe(true);
    expect(status.hardStop).toBe(false);
  });

  it("hard-stops auto-send when tool step count exceeds runaway ceiling", () => {
    const parts = [] as UIMessage["parts"];
    for (let i = 0; i < MAX_RUNAWAY_TOOL_STEPS + 1; i++) {
      if (i > 0) parts.push({ type: "step-start" });
      parts.push({
        type: "tool-slack_list_conversations",
        toolCallId: `t${i}`,
        state: "output-available",
        input: { id: `C${i}` },
        output: "ok",
      });
    }
    const messages = assistantWithTools(parts);
    expect(detectIdenticalToolLoop(messages).hardStop).toBe(true);
    expect(shouldAutoSendAfterToolCalls({ messages })).toBe(false);
  });

  it("does not auto-send when the last assistant message has pending tools", () => {
    const messages = assistantWithTools([
      { type: "tool-slack_list_conversations", toolCallId: "t1", state: "input-available", input: {} },
    ] as UIMessage["parts"]);
    expect(shouldAutoSendAfterToolCalls({ messages })).toBe(false);
  });
});
