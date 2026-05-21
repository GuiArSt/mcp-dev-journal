import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, getDatabase } from "@/lib/db";
import { getSlackVaultStatus, listSlackVaultCache, syncSlackVault } from "@/lib/slack/vault";

let tempDir: string;
const originalUserToken = process.env.SLACK_USER_TOKEN;
const originalBotToken = process.env.SLACK_BOT_TOKEN;
const originalDbPath = process.env.JOURNAL_DB_PATH;

function createEmptyDb() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slack-vault-"));
  process.env.JOURNAL_DB_PATH = path.join(tempDir, "journal.db");
  fs.writeFileSync(process.env.JOURNAL_DB_PATH, "");
  closeDatabase();
}

function slackResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  createEmptyDb();
  process.env.SLACK_USER_TOKEN = "xoxp-test";
  delete process.env.SLACK_BOT_TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });

  if (originalUserToken === undefined) delete process.env.SLACK_USER_TOKEN;
  else process.env.SLACK_USER_TOKEN = originalUserToken;

  if (originalBotToken === undefined) delete process.env.SLACK_BOT_TOKEN;
  else process.env.SLACK_BOT_TOKEN = originalBotToken;

  if (originalDbPath === undefined) delete process.env.JOURNAL_DB_PATH;
  else process.env.JOURNAL_DB_PATH = originalDbPath;
});

describe("Slack vault sync", () => {
  it("reports the missing-token setup without calling Slack", async () => {
    delete process.env.SLACK_USER_TOKEN;
    delete process.env.SLACK_BOT_TOKEN;

    expect(getSlackVaultStatus()).toMatchObject({
      configured: false,
      stats: { users: 0, messages: 0 },
    });
    await expect(syncSlackVault()).rejects.toThrow("Slack token missing");
  });

  it("mirrors Slack users, conversations, messages, and thread replies into SQLite", async () => {
    const calls: Array<{ method: string; params: Record<string, string> }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        const method = url.pathname.split("/").pop() ?? "";
        const params = Object.fromEntries(url.searchParams.entries());
        calls.push({ method, params });

        if (method === "auth.test") {
          return slackResponse({ ok: true, team_id: "T1", team: "Tartarus Test", user_id: "U1", user: "g" });
        }

        if (method === "users.list") {
          return slackResponse({
            ok: true,
            members: [
              { id: "U1", team_id: "T1", name: "g", real_name: "Guillermo", tz: "Europe/Berlin", profile: { title: "Architect" } },
              { id: "U2", team_id: "T1", name: "ana", real_name: "Ana", tz: "Europe/Berlin" },
            ],
          });
        }

        if (method === "conversations.list") {
          return slackResponse({
            ok: true,
            channels: [
              { id: "D1", is_im: true, user: "U2", is_member: true },
              { id: "G1", name: "small-group", is_mpim: true, is_member: true, num_members: 3 },
              { id: "C1", name: "public-room", is_channel: true, is_member: true, topic: { value: "public work" } },
              { id: "C2", name: "not-joined", is_channel: true, is_member: false },
            ],
          });
        }

        if (method === "conversations.history") {
          const channel = params.channel;
          if (channel === "D1") {
            return slackResponse({ ok: true, messages: [{ ts: "1710000001.000100", user: "U2", text: "dm context" }] });
          }
          if (channel === "G1") {
            return slackResponse({ ok: true, messages: [{ ts: "1710000002.000100", user: "U1", text: "group context" }] });
          }
          if (channel === "C1") {
            return slackResponse({
              ok: true,
              messages: [{ ts: "1710000003.000100", user: "U1", text: "thread parent", reply_count: 1 }],
            });
          }
          throw new Error(`Unexpected history call for ${channel}`);
        }

        if (method === "conversations.replies") {
          expect(params.channel).toBe("C1");
          expect(params.ts).toBe("1710000003.000100");
          return slackResponse({
            ok: true,
            messages: [
              { ts: "1710000003.000100", user: "U1", text: "thread parent", reply_count: 1 },
              { ts: "1710000004.000100", user: "U2", text: "thread reply", thread_ts: "1710000003.000100" },
            ],
          });
        }

        throw new Error(`Unhandled Slack method ${method}`);
      }),
    );

    const result = await syncSlackVault({
      maxConversations: 10,
      messageLimit: 5,
      threadReplyLimit: 5,
      includeNonMemberPublic: false,
    });

    expect(result).toMatchObject({ ok: true, tokenSource: "SLACK_USER_TOKEN" });
    expect(calls.map((call) => call.method)).toEqual([
      "auth.test",
      "users.list",
      "conversations.list",
      "conversations.history",
      "conversations.history",
      "conversations.history",
      "conversations.replies",
    ]);
    expect(calls.filter((call) => call.params.channel === "C2")).toHaveLength(0);

    const db = getDatabase();
    expect(db.prepare("SELECT COUNT(*) as count FROM slack_users").get()).toMatchObject({ count: 2 });
    expect(db.prepare("SELECT COUNT(*) as count FROM slack_conversations").get()).toMatchObject({ count: 4 });
    expect(db.prepare("SELECT COUNT(*) as count FROM slack_messages").get()).toMatchObject({ count: 4 });

    expect(
      db.prepare("SELECT vault_type as vaultType, COUNT(*) as count FROM slack_conversations GROUP BY vault_type ORDER BY vault_type").all(),
    ).toEqual([
      { vaultType: "group", count: 1 },
      { vaultType: "personal_conversation", count: 1 },
      { vaultType: "public_forum", count: 2 },
    ]);

    expect(getSlackVaultStatus()).toMatchObject({
      configured: true,
      tokenSource: "SLACK_USER_TOKEN",
      auth: { teamId: "T1", userId: "U1" },
      stats: { users: 2, messages: 4 },
    });
    expect(listSlackVaultCache(10).recentMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          authorName: "Ana",
          conversationId: "C1",
          conversationTitle: "public-room",
          text: "thread reply",
          threadTs: "1710000003.000100",
        }),
      ]),
    );
  });

  it("can sync messages from cached conversations without rediscovering conversations", async () => {
    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS slack_conversations (
        id TEXT PRIMARY KEY,
        team_id TEXT,
        name TEXT,
        type TEXT NOT NULL,
        vault_type TEXT NOT NULL,
        is_member INTEGER DEFAULT 0,
        is_archived INTEGER DEFAULT 0,
        is_private INTEGER DEFAULT 0,
        is_im INTEGER DEFAULT 0,
        is_mpim INTEGER DEFAULT 0,
        is_channel INTEGER DEFAULT 0,
        user_id TEXT,
        topic TEXT,
        purpose TEXT,
        num_members INTEGER,
        raw_json TEXT NOT NULL,
        summary TEXT,
        summarized_at TEXT,
        latest_ts TEXT,
        oldest_ts TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    db.prepare(`
      INSERT INTO slack_conversations
        (id, name, type, vault_type, is_member, is_channel, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "CACHED1",
      "cached-room",
      "public_channel",
      "public_forum",
      1,
      1,
      JSON.stringify({ id: "CACHED1", name: "cached-room", is_channel: true, is_member: true }),
    );

    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        const method = url.pathname.split("/").pop() ?? "";
        calls.push(method);

        if (method === "auth.test") {
          return slackResponse({ ok: true, team_id: "T1", team: "Tartarus Test", user_id: "U1", user: "g" });
        }
        if (method === "conversations.history") {
          return slackResponse({ ok: true, messages: [{ ts: "1710000100.000100", user: "U1", text: "cached sync" }] });
        }
        throw new Error(`Unexpected Slack method ${method}`);
      }),
    );

    await syncSlackVault({
      syncUsers: false,
      syncConversations: false,
      syncMessages: true,
      syncThreads: false,
      maxConversations: 1,
      messageLimit: 15,
    });

    expect(calls).toEqual(["auth.test", "conversations.history"]);
    expect(listSlackVaultCache(10).recentMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conversationId: "CACHED1", conversationTitle: "cached-room", text: "cached sync" }),
      ]),
    );
  });
});
