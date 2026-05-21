#!/usr/bin/env node

import { setTimeout as sleep } from "node:timers/promises";

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  args.set(key, value);
}

const baseUrl = args.get("base-url") ?? process.env.TARTARUS_URL ?? "http://localhost:3005";
const batches = Number(args.get("batches") ?? process.env.SLACK_SUMMARY_BATCHES ?? 20);
const limit = Number(args.get("limit") ?? process.env.SLACK_SUMMARY_LIMIT ?? 3);
const maxMessages = Number(args.get("max-messages") ?? process.env.SLACK_SUMMARY_MAX_MESSAGES ?? 80);
const pauseMs = Number(args.get("pause-ms") ?? process.env.SLACK_SUMMARY_PAUSE_MS ?? 1_000);
const force = args.get("force") === "true";

function now() {
  return new Date().toISOString();
}

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...init,
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
  if (!response.ok) throw new Error(data.error || data.raw || `HTTP ${response.status}`);
  return data;
}

function summarizeResults(results) {
  const ok = results.filter((item) => item.ok).length;
  const failed = results.filter((item) => item.ok === false).length;
  const messages = results.reduce((sum, item) => sum + Number(item.messageCount ?? 0), 0);
  return `processed=${results.length} ok=${ok} failed=${failed} messages=${messages}`;
}

console.log(`[${now()}] Slack summarizer starting against ${baseUrl}`);
console.log(`[${now()}] batches=${batches} limit=${limit} maxMessages=${maxMessages} force=${force}`);

const initial = await request("/api/integrations/slack/summarize");
console.log(`[${now()}] Initial: model=${initial.model} pending=${initial.pending} summarized=${initial.summarized}`);

for (let i = 1; i <= batches; i += 1) {
  const data = await request("/api/integrations/slack/summarize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit, maxMessages, force }),
  });

  console.log(
    `[${now()}] Batch ${i}/${batches}: ${summarizeResults(data.results ?? [])} | pending=${data.status?.pending ?? "?"} summarized=${data.status?.summarized ?? "?"}`,
  );

  if (!force && Number(data.status?.pending ?? 0) === 0) break;
  if ((data.results ?? []).length === 0) break;
  if (i < batches) await sleep(pauseMs);
}

const final = await request("/api/integrations/slack/summarize");
console.log(`[${now()}] Slack summarizer finished: model=${final.model} pending=${final.pending} summarized=${final.summarized}`);
