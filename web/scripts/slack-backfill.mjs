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
const statusOnly = args.get("status-only") === "true";
const timeZone = args.get("time-zone") ?? process.env.SLACK_BACKFILL_TIME_ZONE ?? "Europe/Berlin";
const cutoffDate = args.get("cutoff-date") ?? process.env.SLACK_BACKFILL_CUTOFF_DATE ?? "";
const latestTs = args.get("latest-ts") ?? process.env.SLACK_BACKFILL_LATEST_TS ?? (cutoffDate ? cutoffDateToSlackTs(cutoffDate, timeZone) : "");

const localTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZoneName: "short",
});

function formatLocalTime(date = new Date()) {
  return localTimeFormatter.format(date);
}

function now() {
  return formatLocalTime();
}

function getTimeZoneOffsetMs(date, zone) {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  }).formatToParts(date).find((item) => item.type === "timeZoneName")?.value ?? "GMT";
  const match = part.match(/^GMT(?:(?<sign>[+-])(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?)?$/);
  if (!match?.groups?.sign) return 0;
  const sign = match.groups.sign === "-" ? -1 : 1;
  const hours = Number(match.groups.hours ?? 0);
  const minutes = Number(match.groups.minutes ?? 0);
  return sign * ((hours * 60 + minutes) * 60 * 1000);
}

function cutoffDateToSlackTs(dateString, zone) {
  const match = dateString.match(/^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/);
  if (!match?.groups) {
    throw new Error(`Invalid --cutoff-date=${dateString}. Use YYYY-MM-DD, for example --cutoff-date=2026-05-25.`);
  }
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const localEndOfDayGuess = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  const offsetMs = getTimeZoneOffsetMs(localEndOfDayGuess, zone);
  const utcInstant = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - offsetMs);
  return (utcInstant.getTime() / 1000).toFixed(6);
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

function summarizeBackfill(status) {
  const b = status?.stats?.backfill ?? {};
  const eligible = Number(b.eligible ?? 0);
  const touched = Number(b.touched ?? 0);
  const exhausted = Number(b.exhausted ?? 0);
  const pendingCursors = Number(b.pendingCursors ?? 0);
  const untouched = Math.max(0, eligible - touched);
  const phase = untouched > 0
    ? `first-pass (${untouched} untouched)`
    : pendingCursors > 0
      ? `deepening (${pendingCursors} cursors)`
      : "complete";
  return [
    `phase=${phase}`,
    `eligible=${eligible}`,
    `touched=${touched} (${b.touchedPercent ?? 0}%)`,
    `exhausted=${exhausted} (${b.exhaustedPercent ?? 0}%)`,
    `pendingCursors=${pendingCursors}`,
    `withMessages=${b.withMessages ?? 0}`,
  ].join(" ");
}

function backfillCounters(status) {
  const b = status?.stats?.backfill ?? {};
  const eligible = Number(b.eligible ?? 0);
  const touched = Number(b.touched ?? 0);
  const pendingCursors = Number(b.pendingCursors ?? 0);
  const untouched = Math.max(0, eligible - touched);
  return { eligible, touched, pendingCursors, untouched };
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
console.log(`[${now()}] iterations=${iterations} pauseMs=${pauseMs} discover=${discover} timeZone=${timeZone} cutoffDate=${cutoffDate || "none"} latestTs=${latestTs || "none"}`);

const startingCache = await getJson("/api/integrations/slack/cache?limit=1");
console.log(`[${now()}] Current vault: ${summarizeStatus(startingCache.status)} | ${summarizeBackfill(startingCache.status)}`);
const startingCounters = backfillCounters(startingCache.status);
console.log(
  `[${now()}] Resume note: local slice numbers restart, DB progress resumes from touched=${startingCounters.touched}/${startingCounters.eligible}.`,
);

if (statusOnly) {
  console.log(`[${now()}] Status-only mode complete.`);
  process.exit(0);
}

if (discover) {
  console.log(`[${now()}] Discovering users/conversations. This calls users.list and conversations.list.`);
  const discovered = await postJson("/api/integrations/slack/sync", {
    syncUsers: true,
    syncConversations: true,
    syncMessages: false,
    syncThreads: false,
    maxRateLimitWaitMs: 70_000,
  });
  console.log(`[${now()}] Discover complete: ${summarizeStatus(discovered.status)} | ${summarizeBackfill(discovered.status)}`);
  const discoveredCounters = backfillCounters(discovered.status);
  console.log(
    `[${now()}] Resume baseline after discovery: touched=${discoveredCounters.touched}/${discoveredCounters.eligible}, untouched=${discoveredCounters.untouched}, pendingCursors=${discoveredCounters.pendingCursors}.`,
  );
  console.log(`[${now()}] Waiting before history calls to avoid Slack method limits...`);
  await sleep(pauseMs);
}

for (let i = 1; i <= iterations; i += 1) {
  try {
    const before = await getJson("/api/integrations/slack/cache?limit=1");
    const beforeCounters = backfillCounters(before.status);
    const estimatedGlobal = Math.min(beforeCounters.touched + 1, beforeCounters.eligible || beforeCounters.touched + 1);
    console.log(
      `[${now()}] Slice ${i}/${iterations} (global ${estimatedGlobal}/${beforeCounters.eligible || "?"}): syncing one cached conversation history page. ${summarizeBackfill(before.status)}`,
    );
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
      latestTs: latestTs || undefined,
    });

    const afterCounters = backfillCounters(result.status);
    console.log(
      `[${now()}] Slice ${i}/${iterations} complete: ${summarizeMessages(result.messages)} | ${summarizeStatus(result.status)} | ${summarizeBackfill(result.status)} | global=${afterCounters.touched}/${afterCounters.eligible}`,
    );
  } catch (error) {
    console.error(`[${now()}] Slice ${i}/${iterations} failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (i < iterations) {
    console.log(`[${now()}] Sleeping ${Math.round(pauseMs / 1000)}s for Slack rate limits. Next slice around ${formatLocalTime(new Date(Date.now() + pauseMs))}...`);
    await sleep(pauseMs);
  }
}

const finalCache = await getJson("/api/integrations/slack/cache?limit=1");
console.log(`[${now()}] Slack backfill finished: ${summarizeStatus(finalCache.status)} | ${summarizeBackfill(finalCache.status)}`);
