import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  claudeEvents,
  codexEvents,
  cursorEvents,
  geminiEvents,
  redactSecrets,
} from "@/lib/ai-integrations";

let tempDirs: string[] = [];

function tempFile(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-integrations-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("AI integration log adapters", () => {
  it("normalizes Codex JSONL messages and tool calls", () => {
    const filePath = tempFile(
      "rollout-test.jsonl",
      [
        JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z", type: "event_msg", payload: { type: "user_message", message: "hello" } }),
        JSON.stringify({ timestamp: "2026-01-01T00:00:01.000Z", type: "response_item", payload: { type: "function_call", name: "git_status", call_id: "call_1", arguments: "{\"cwd\":\"/tmp\"}" } }),
        JSON.stringify({ timestamp: "2026-01-01T00:00:02.000Z", type: "response_item", payload: { type: "function_call_output", call_id: "call_1", output: "ok" } }),
      ].join("\n"),
    );

    const { events } = codexEvents(filePath);

    expect(events).toMatchObject([
      { sequence: 0, actor: "user", eventType: "message", text: "hello" },
      { sequence: 1, actor: "assistant", eventType: "tool_call", tooling: { name: "git_status", callId: "call_1" } },
      { sequence: 2, actor: "tool", eventType: "tool_result", tooling: { callId: "call_1" } },
    ]);
  });

  it("normalizes Claude Code JSONL tool results", () => {
    const filePath = tempFile(
      "claude.jsonl",
      JSON.stringify({
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "user",
        cwd: "/repo",
        gitBranch: "main",
        sessionId: "session-1",
        message: {
          content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "result text", is_error: false }],
        },
      }),
    );

    const { events, meta } = claudeEvents(filePath);

    expect(meta).toMatchObject({ cwd: "/repo", sessionId: "session-1", gitBranch: "main" });
    expect(events[0]).toMatchObject({
      timestamp: "2026-01-01T00:00:00.000Z",
      sequence: 0,
      actor: "tool",
      eventType: "tool_result",
      text: "result text",
      tooling: { callId: "toolu_1", ok: true },
    });
  });

  it("normalizes Gemini CLI session JSON", () => {
    const filePath = tempFile(
      "session-test.json",
      JSON.stringify({
        sessionId: "gemini-session",
        projectHash: "project",
        messages: [
          { timestamp: "2026-01-01T00:00:00.000Z", type: "user", content: "question" },
          { timestamp: "2026-01-01T00:00:01.000Z", type: "assistant", content: "answer" },
        ],
      }),
    );

    const { events, meta } = geminiEvents(filePath);

    expect(meta).toMatchObject({ sessionId: "gemini-session", projectHash: "project" });
    expect(events.map((event) => [event.sequence, event.actor, event.eventType, event.text])).toEqual([
      [0, "user", "message", "question"],
      [1, "assistant", "message", "answer"],
    ]);
  });

  it("allows nullable Cursor timestamps and preserves sequence order", () => {
    const filePath = tempFile(
      "transcript.jsonl",
      [
        JSON.stringify({ role: "user", message: { content: "first" } }),
        JSON.stringify({ role: "assistant", message: { content: "second" } }),
      ].join("\n"),
    );

    const { events, meta } = cursorEvents(filePath);

    expect(meta.fileMtime).toBeTruthy();
    expect(events).toMatchObject([
      { timestamp: null, sequence: 0, actor: "user", eventType: "message", text: "first" },
      { timestamp: null, sequence: 1, actor: "assistant", eventType: "message", text: "second" },
    ]);
  });

  it("redacts source-specific secrets recursively", () => {
    expect(
      redactSecrets({
        token: "secret-token",
        nested: "authorization: Bearer abc123",
        apiKey: "sk-abc123456789",
      }),
    ).toEqual({
      token: "[REDACTED]",
      nested: "authorization: [REDACTED]",
      apiKey: "[REDACTED]",
    });
  });
});
