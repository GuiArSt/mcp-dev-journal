import { describe, it, expect } from "vitest";
import type { UIMessage } from "ai";
import {
  assistantHasPendingToolCalls,
  buildTurnsFromMessages,
  extractLiveTail,
  messageToText,
  shouldCommitCompletedTurns,
} from "@/lib/hourglass-turns";

function userMsg(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] } as UIMessage;
}

function assistantMsg(id: string, text: string, extraParts: unknown[] = []): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }, ...extraParts],
  } as UIMessage;
}

describe("buildTurnsFromMessages", () => {
  it("pairs user and assistant messages in order", () => {
    const messages = [
      userMsg("u1", "hello"),
      assistantMsg("a1", "hi there"),
      userMsg("u2", "again"),
      assistantMsg("a2", "sure"),
    ];
    const turns = buildTurnsFromMessages(messages);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({ index: 1, userText: "hello", assistantText: "hi there" });
    expect(turns[1]).toMatchObject({ index: 2, userText: "again", assistantText: "sure" });
  });

  it("leaves trailing user without assistant unpaired", () => {
    const messages = [userMsg("u1", "hello"), assistantMsg("a1", "hi"), userMsg("u2", "waiting")];
    const turns = buildTurnsFromMessages(messages);
    expect(turns).toHaveLength(1);
    expect(turns[0].userText).toBe("hello");
  });

  it("captures tool calls on assistant messages", () => {
    const messages = [
      userMsg("u1", "search"),
      assistantMsg("a1", "", [
        { type: "tool-journal_read", toolName: "journal_read", state: "output-available" },
      ]),
    ];
    const turns = buildTurnsFromMessages(messages);
    expect(turns[0].toolCalls).toEqual([{ name: "journal_read", status: "done" }]);
  });
});

describe("extractLiveTail", () => {
  it("returns null when not active", () => {
    const messages = [userMsg("u1", "hi"), assistantMsg("a1", "yo")];
    expect(extractLiveTail(messages, false)).toBeNull();
  });

  it("returns user only while thinking", () => {
    const messages = [userMsg("u1", "hello"), userMsg("u2", "new question")];
    const tail = extractLiveTail(messages, true);
    expect(tail).toEqual({ userText: "new question", assistantText: "", toolCalls: [] });
  });

  it("returns partial assistant while streaming", () => {
    const messages = [userMsg("u1", "hello"), assistantMsg("a1", "partial reply...")];
    const tail = extractLiveTail(messages, true);
    expect(tail?.userText).toBe("hello");
    expect(tail?.assistantText).toBe("partial reply...");
  });
});

describe("shouldCommitCompletedTurns", () => {
  it("blocks commit when assistant has pending tool calls", () => {
    const messages = [
      userMsg("u1", "go"),
      assistantMsg("a1", "", [{ type: "tool-wake_muse", toolName: "wake_muse", state: "input-available" }]),
    ];
    expect(assistantHasPendingToolCalls(messages[1])).toBe(true);
    expect(shouldCommitCompletedTurns(messages)).toBe(false);
  });

  it("allows commit when tools are resolved", () => {
    const messages = [
      userMsg("u1", "go"),
      assistantMsg("a1", "done", [{ type: "tool-wake_muse", toolName: "wake_muse", state: "output-available" }]),
    ];
    expect(shouldCommitCompletedTurns(messages)).toBe(true);
  });
});

describe("messageToText", () => {
  it("concatenates text parts", () => {
    expect(messageToText(userMsg("u1", "a") )).toBe("a");
  });
});
