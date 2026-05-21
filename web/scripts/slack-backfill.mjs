#!/usr/bin/env node

import { setTimeout as sleep } from "node:timers/promises";

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  args.set(key, value);
}

const baseUrl = args.get("base-url") ?? process.env.TARTARUS_URL ?? "http://localhost:3005";
const iterations = Number(args.get("iterations") ?? process.env.SLACK_BACKFILL_ITERATIONS ?? 100);
const pauseMs = Number(args.get("pause-ms") ?? process.env.SLACK_BACKFILL_PAUSE_MS ?? 70_000);
const discover = args.get("discover") !== "false";

function now() {
  return new Date().toISOString();
}

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`HTTP ${response.status} redirect to ${response.headers.get("location") ?? "unknown"}. Is the API route allowed by middleware?`);
  }
  if (!response.ok) {
    const message = data.error || data.raw || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`HTTP ${response.status} redirect to ${response.headers.get("location") ?? "unknown"}. Is the API route allowed by middleware?`);
  }
  if (!response.ok) {
    const message = data.error || data.raw || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function summarizeStatus(status) {
  const conversations = Object.values(status?.stats?.conversations ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  return `users=${status?.stats?.users ?? 0} conversations=${conversations} messages=${status?.stats?.messages ?? 0}`;
}

function summarizeMessages(messages) {
  if (!Array.isArray(messages)) return "messages=0";
  const ok = messages.filter((item) => item?.ok).length;
  const failed = messages.filter((item) => item && item.ok === false).length;
  const copied = messages.reduce((sum, item) => sum + Number(item?.messages ?? 0), 0);
  const cursors = messages.filter((item) => item?.cursor).length;
  return `messageCalls=${messages.length} ok=${ok} failed=${failed} copied=${copied} cursors=${cursors}`;
}

console.log(`[${now()}] Slack backfill starting against ${baseUrl}`);
console.log(`[${now()}] iterations=${iterations} pauseMs=${pauseMs} discover=${discover}`);

if (discover) {
  console.log(`[${now()}] Discovering users/conversations. This calls users.list and conversations.list.`);
  const discovered = await postJson("/api/integrations/slack/sync", {
    syncUsers: true,
    syncConversations: true,
    syncMessages: false,
    syncThreads: false,
    maxRateLimitWaitMs: 70_000,
  });
  console.log(`[${now()}] Discover complete: ${summarizeStatus(discovered.status)}`);
  console.log(`[${now()}] Waiting before history calls to avoid Slack method limits...`);
  await sleep(pauseMs);
}

for (let i = 1; i <= iterations; i += 1) {
  try {
    console.log(`[${now()}] Slice ${i}/${iterations}: syncing one cached conversation history page.`);
    const result = await postJson("/api/integrations/slack/sync", {
      syncUsers: false,
      syncConversations: false,
      syncMessages: true,
      syncThreads: false,
      maxConversations: 1,
      maxConversationPages: 1,
      messageLimit: 15,
      continueBackfill: true,
      forceFull: true,
      includeNonMemberPublic: false,
      maxRateLimitWaitMs: 70_000,
    });

    console.log(`[${now()}] Slice ${i}/${iterations} complete: ${summarizeMessages(result.messages)} | ${summarizeStatus(result.status)}`);
  } catch (error) {
    console.error(`[${now()}] Slice ${i}/${iterations} failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (i < iterations) {
    console.log(`[${now()}] Sleeping ${Math.round(pauseMs / 1000)}s for Slack rate limits...`);
    await sleep(pauseMs);
  }
}

const finalCache = await getJson("/api/integrations/slack/cache?limit=1");
console.log(`[${now()}] Slack backfill finished: ${summarizeStatus(finalCache.status)}`);
