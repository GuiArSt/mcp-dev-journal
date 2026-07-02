import { describe, expect, it } from "vitest";
import { convertToModelMessages, modelMessageSchema } from "ai";
import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  prepareUiMessagesForInference,
  repairModelMessages,
  repairPartsForModel,
  repairUiMessagesForModel,
  restorePartsFromPersist,
  finalizeRestoredUiMessages,
  normalizeUiMessageParts,
} from "@/lib/chat-message-repair";

describe("chat-message-repair", () => {
  it("converts bare file parts (no url/data) to text", () => {
    const out = repairPartsForModel([
      { type: "file", mediaType: "image/png", filename: "image.png" },
    ]);
    expect(out[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("image.png"),
    });
  });

  it("converts blob: file urls to text placeholders", () => {
    const out = repairPartsForModel([
      { type: "file", mediaType: "image/png", filename: "x.png", url: "blob:http://localhost/abc" },
    ]);
    expect(out[0]).toMatchObject({ type: "text" });
  });

  it("repairs content-only legacy messages", () => {
    type UiMsg = { role?: string; parts?: unknown[]; content?: unknown };
    const repaired = repairUiMessagesForModel<UiMsg>([
      {
        role: "user",
        content: [{ type: "file", mediaType: "image/png", filename: "a.png" }],
      },
    ]);
    expect(repaired[0].parts?.[0]).toMatchObject({ type: "text" });
  });

  it("strips empty anthropic reasoning when switching to OpenAI", () => {
    type UiMsg = { role?: string; parts?: unknown[]; content?: unknown };
    const { messages, strippedReasoning } = prepareUiMessagesForInference<UiMsg>(
      [
        {
          role: "assistant",
          content: [
            {
              type: "reasoning",
              text: "",
              providerOptions: { anthropic: { signature: "sig" } },
            },
            { type: "text", text: "hello" },
          ],
        },
      ],
      "openai",
    );
    expect(strippedReasoning).toBe(1);
    expect(messages[0].parts).toEqual([{ type: "text", text: "hello" }]);
  });

  it("repairModelMessages fixes invalid file content after convert", async () => {
    const broken = [
      {
        role: "user",
        parts: [{ type: "file", mediaType: "image/png", filename: "image.png" }],
      },
    ];
    const modelMessages = await convertToModelMessages(broken as any);
    await expect(async () => {
      repairModelMessages(modelMessages);
    }).not.toThrow();
    const repaired = repairModelMessages(modelMessages);
    expect(repaired[0].content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "text" })]),
    );
  });

  it("drops step-start parts", () => {
    const out = repairPartsForModel([
      { type: "step-start" },
      { type: "text", text: "ok" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "text", text: "ok" });
  });

  it("converts persisted file placeholders to text", () => {
    const out = repairPartsForModel([
      {
        type: "file",
        mediaType: "image/png",
        filename: "image.png",
        persistedInlineMedia: true,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("image.png"),
    });
  });

  it("converts persisted image placeholders to text", () => {
    const out = repairPartsForModel([
      { type: "image", persistedInlineMedia: true },
    ]);
    expect(out[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Image attachment"),
    });
  });

  it("converts broken tool parts without toolCallId to text summaries", () => {
    const out = repairPartsForModel([
      {
        type: "tool-repository_search_documents",
        toolName: "repository_search_documents",
        state: "output-available",
        output: { type: "text", value: "No documents found." },
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("repository_search_documents"),
    });
  });

  it("repairUiMessagesForModel allows convertToModelMessages", async () => {
    const broken = [
      { role: "user", parts: [{ type: "text", text: "hello" }] },
      {
        role: "user",
        parts: [
          {
            type: "file",
            mediaType: "image/png",
            filename: "image.png",
            persistedInlineMedia: true,
          },
        ],
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-web_search",
            toolName: "web_search",
            state: "output-available",
            output: { ok: true },
          },
        ],
      },
    ];

    const repaired = repairUiMessagesForModel(broken);
    const modelMessages = await convertToModelMessages(repaired as any);
    expect(modelMessages.length).toBeGreaterThan(0);
    expect(modelMessages.every((m) => m.role && m.content !== undefined)).toBe(true);
  });

  it("normalizeUiMessageParts promotes content when parts is empty", () => {
    const out = normalizeUiMessageParts({
      role: "user",
      parts: [],
      content: [{ type: "file", mediaType: "image/png", filename: "a.png" }],
    });
    expect(out.parts).toHaveLength(1);
    expect(out.content).toBeUndefined();
  });

  it("repairModelMessages fixes bare image parts after convert", async () => {
    const broken = [
      {
        role: "user",
        parts: [{ type: "image", mediaType: "image/png", filename: "image.png" }],
      },
    ];
    const repairedUi = repairUiMessagesForModel(broken);
    const modelMessages = repairModelMessages(await convertToModelMessages(repairedUi as any));
    expect(modelMessages.length).toBe(1);
    expect(modelMessages[0].content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "text" })]),
    );
  });

  it("repairModelMessages drops invalid tool role messages", async () => {
    const broken = [
      { role: "user", parts: [{ type: "text", text: "hi" }] },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-web_search",
            toolName: "web_search",
            state: "output-available",
            output: { ok: true },
          },
        ],
      },
    ];
    const prepared = prepareUiMessagesForInference(broken, "openai").messages;
    const modelMessages = await convertToModelMessages(prepared as any);
    const repaired = repairModelMessages(modelMessages);
    expect(repaired.length).toBeGreaterThan(0);
    expect(repaired.every((m) => m.role !== "tool" || Array.isArray(m.content))).toBe(true);
  });

  it("normalizeUiMessageParts drops stale content when parts exist", () => {
    const out = normalizeUiMessageParts({
      role: "user",
      parts: [{ type: "text", text: "hello" }],
      content: [{ type: "file", mediaType: "image/png", filename: "stale.png" }],
    });
    expect(out.parts).toHaveLength(1);
    expect(out.content).toBeUndefined();
  });

  it("converts orphaned OpenAI function calls after assistant text", () => {
    const { messages, repairedOpenAiTools } = prepareUiMessagesForInference(
      [
        {
          role: "assistant",
          parts: [
            {
              type: "reasoning",
              text: "",
              providerMetadata: { openai: { itemId: "rs_pair" } },
            },
            {
              type: "tool-slack_get_conversation",
              toolCallId: "call_ok",
              toolName: "slack_get_conversation",
              state: "output-available",
              output: { ok: true },
              callProviderMetadata: { openai: { itemId: "fc_ok" } },
            },
            { type: "text", text: "partial reply" },
            {
              type: "tool-slack_get_conversation",
              toolCallId: "call_orphan",
              toolName: "slack_get_conversation",
              state: "output-available",
              output: { ok: true },
              callProviderMetadata: { openai: { itemId: "fc_orphan" } },
            },
          ],
        },
      ],
      "openai",
    );
    expect(repairedOpenAiTools).toBe(1);
    const types = messages[0].parts?.map((p: { type?: string }) => p.type);
    expect(types).toEqual(["reasoning", "tool-slack_get_conversation", "text", "text"]);
  });

  it("converts Anthropic tool parts when replaying to OpenAI", () => {
    const { messages, repairedOpenAiTools } = prepareUiMessagesForInference(
      [
        {
          role: "assistant",
          parts: [
            {
              type: "tool-slack_list_conversations",
              toolCallId: "toolu_01abc",
              toolName: "slack_list_conversations",
              state: "output-available",
              output: { conversations: [] },
            },
          ],
        },
      ],
      "openai",
    );
    expect(repairedOpenAiTools).toBe(1);
    expect(messages[0].parts?.[0]).toMatchObject({ type: "text" });
  });

  it("conversation 132 survives full openai inference pipeline", async () => {
    const dbPath = resolve(__dirname, "../../../data/journal.db");
    if (!existsSync(dbPath)) return;

    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare("SELECT messages FROM chat_conversations WHERE id = 132").get() as
      | { messages?: string }
      | undefined;
    db.close();
    if (!row?.messages) return;

    const raw = JSON.parse(row.messages) as unknown[];
    const { messages: prepared } = prepareUiMessagesForInference(raw as any[], "openai");

    const sanitized = prepared
      .map((msg: any) => {
        if (Array.isArray(msg.parts)) {
          return { ...msg, parts: repairPartsForModel(msg.parts), content: undefined };
        }
        return msg;
      })
      .filter((msg: any) => {
        if (Array.isArray(msg.parts) && msg.parts.length > 0) {
          return msg.parts.some((part: any) => {
            if (part.type === "text") return part.text?.trim().length > 0;
            if (part.type === "reasoning") return part.text?.trim().length > 0;
            if (part.type === "tool-call" || part.type === "tool-result") return true;
            if (part.type === "dynamic-tool" || (typeof part.type === "string" && part.type.startsWith("tool-"))) {
              return true;
            }
            return false;
          });
        }
        return typeof msg.content === "string" && msg.content.trim().length > 0;
      });

    const modelMessages = repairModelMessages(await convertToModelMessages(sanitized as any));
    const result = z.array(modelMessageSchema).safeParse(modelMessages);
    expect(result.success, JSON.stringify(result.success ? [] : result.error.issues.slice(0, 5))).toBe(
      true,
    );
  });

  it("conversation 139 survives full openai inference pipeline", async () => {
    const dbPath = resolve(__dirname, "../../../data/journal.db");
    if (!existsSync(dbPath)) return;

    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare("SELECT messages FROM chat_conversations WHERE id = 139").get() as
      | { messages?: string }
      | undefined;
    db.close();
    if (!row?.messages) return;

    const raw = JSON.parse(row.messages) as unknown[];
    const { messages: prepared, repairedOpenAiTools } = prepareUiMessagesForInference(raw as any[], "openai");
    expect(repairedOpenAiTools).toBeGreaterThan(0);

    const sanitized = prepared
      .map((msg: any) => {
        if (Array.isArray(msg.parts)) {
          return { ...msg, parts: repairPartsForModel(msg.parts), content: undefined };
        }
        return msg;
      })
      .filter((msg: any) => {
        if (Array.isArray(msg.parts) && msg.parts.length > 0) {
          return msg.parts.some((part: any) => {
            if (part.type === "text") return part.text?.trim().length > 0;
            if (part.type === "reasoning") return part.text?.trim().length > 0;
            if (part.type === "tool-call" || part.type === "tool-result") return true;
            if (part.type === "dynamic-tool" || (typeof part.type === "string" && part.type.startsWith("tool-"))) {
              return true;
            }
            return false;
          });
        }
        return typeof msg.content === "string" && msg.content.trim().length > 0;
      });

    const modelMessages = repairModelMessages(await convertToModelMessages(sanitized as any));
    const result = z.array(modelMessageSchema).safeParse(modelMessages);
    expect(result.success, JSON.stringify(result.success ? [] : result.error.issues.slice(0, 5))).toBe(
      true,
    );
  });

  it("finalizeRestoredUiMessages closes pending tool parts", () => {
    const messages = finalizeRestoredUiMessages([
      {
        role: "assistant",
        parts: [
          { type: "tool-slack_list_conversations", toolCallId: "t1", state: "input-available", input: {} },
        ],
      },
    ]);
    const part = (
      messages[0] as unknown as { parts: Array<{ state: string; output: string }> }
    ).parts[0];
    expect(part.state).toBe("output-available");
    expect(part.output).toContain("restored");
  });
});
