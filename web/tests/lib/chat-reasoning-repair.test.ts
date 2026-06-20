import { describe, it, expect } from "vitest";
import {
  isForeignReasoningPart,
  isOpenAiReasoningPart,
  stripIncompatibleReasoningParts,
} from "@/lib/chat-reasoning-repair";

describe("chat-reasoning-repair", () => {
  it("detects OpenAI reasoning by itemId even when text is empty", () => {
    const part = {
      type: "reasoning",
      text: "",
      providerOptions: { openai: { itemId: "rs_abc123" } },
    };
    expect(isOpenAiReasoningPart(part)).toBe(true);
    expect(isForeignReasoningPart(part, "openai")).toBe(false);
  });

  it("keeps OpenAI reasoning when target is openai", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            text: "",
            providerOptions: { openai: { itemId: "rs_abc" } },
          },
          { type: "text", text: "Hello" },
        ],
      },
    ];
    const { messages: out, stripped } = stripIncompatibleReasoningParts(messages, "openai");
    expect(stripped).toBe(0);
    expect(out[0].parts).toHaveLength(2);
  });

  it("strips Anthropic reasoning when target is openai", () => {
    const part = {
      type: "reasoning",
      text: "thinking…",
      providerOptions: { anthropic: { signature: "sig" } },
    };
    expect(isForeignReasoningPart(part, "openai")).toBe(true);
    const { stripped } = stripIncompatibleReasoningParts(
      [{ role: "assistant", parts: [part, { type: "text", text: "Hi" }] }],
      "openai",
    );
    expect(stripped).toBe(1);
  });

  it("strips OpenAI reasoning when target is anthropic", () => {
    const part = {
      type: "reasoning",
      text: "",
      providerOptions: { openai: { itemId: "rs_xyz" } },
    };
    expect(isForeignReasoningPart(part, "anthropic")).toBe(true);
    const { stripped } = stripIncompatibleReasoningParts(
      [{ role: "assistant", parts: [part] }],
      "anthropic",
    );
    expect(stripped).toBe(1);
  });

  it("does not strip empty-text OpenAI reasoning (regression for msg_/rs_ pairing)", () => {
    const messages = Array.from({ length: 5 }, (_, i) => ({
      role: "assistant" as const,
      parts: [
        {
          type: "reasoning",
          text: "",
          providerOptions: { openai: { itemId: `rs_${i}` } },
        },
        { type: "text", text: `reply ${i}` },
      ],
    }));
    const { stripped } = stripIncompatibleReasoningParts(messages, "openai");
    expect(stripped).toBe(0);
  });
});
