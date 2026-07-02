#!/usr/bin/env node
/**
 * Paced Slack history backfill via Tartarus web API.
 *
 * One "slice" = one conversations.history page (default 15 msgs) for one channel.
 * Progress is persisted in slack_sync_state (cursors). Safe to stop and resume.
 *
 * Rate limits (Slack, May 2025+):
 * - Custom / user-token internal apps: Tier 3 (~50+ req/min, limit up to 1000)
 * - Non-Marketplace distributed apps: Tier 1 (1 req/min, limit 15)
 *
 * Profiles:
 *   --profile=conservative  pause 70s, 15 msgs/page (default, Tier-1 safe)
 *   --profile=internal      pause 2s, 200 msgs/page (user-token / custom app)
 */

import { setTimeout as sleep } from "node:timers/promises";

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  args.set(key, value);
}

const PROFILES = {
  conservative: { pauseMs: 70_000, messageLimit: 15, maxRateLimitWaitMs: 70_000 },
  internal: { pauseMs: 2_000, messageLimit: 200, maxRateLimitWaitMs: 120_000 },
};

const profileName = args.get("profile") ?? process.env.SLACK_BACKFILL_PROFILE ?? "conservative";
const profile = PROFILES[profileName] ?? PROFILES.conservative;

const baseUrl = args.get("base-url") ?? process.env.TARTARUS_URL ?? "http://localhost:3005";
const untilComplete = args.get("until-complete") === "true" || args.get("until-complete") === "";
const maxIterations = Number(
  args.get("max-iterations") ??
    process.env.SLACK_BACKFILL_MAX_ITERATIONS ??
    (untilComplete ? 50_000 : 100),
);
const pauseMs = Number(args.get("pause-ms") ?? process.env.SLACK_BACKFILL_PAUSE_MS ?? profile.pauseMs);
const messageLimit = Number(args.get("message-limit") ?? process.env.SLACK_BACKFILL_MESSAGE_LIMIT ?? profile.messageLimit);
const maxRateLimitWaitMs = Number(
  args.get("max-rate-limit-wait-ms") ?? process.env.SLACK_BACKFILL_MAX_RATE_WAIT_MS ?? profile.maxRateLimitWaitMs,
);
const discover = args.get("discover") !== "false";
const statusOnly = args.get("status-only") === "true";
const timeZone = args.get("time-zone") ?? process.env.SLACK_BACKFILL_TIME_ZONE ?? "Europe/Berlin";
const cutoffDate = args.get("cutoff-date") ?? process.env.SLACK_BACKFILL_CUTOFF_DATE ?? "";
const latestTs =
  args.get("latest-ts") ?? process.env.SLACK_BACKFILL_LATEST_TS ?? (cutoffDate ? cutoffDateToSlackTs(cutoffDate, timeZone) : "");

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
  const part =
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "shortOffset",
      hour: "2-digit",
    })
      .formatToParts(date)
      .find((item) => item.type === "timeZoneName")?.value ?? "GMT";
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
    throw new Error(
      `HTTP ${response.status} redirect to ${response.headers.get("location") ?? "unknown"}. Is the API route allowed by middleware?`,
    );
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
    throw new Error(
      `HTTP ${response.status} redirect to ${response.headers.get("location") ?? "unknown"}. Is the API route allowed by middleware?`,
    );
  }
  if (!response.ok) {
    const message = data.error || data.raw || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function summarizeStatus(status) {
  const conversations = Object.values(status?.stats?.conversations ?? {}).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  );
  return `users=${status?.stats?.users ?? 0} conversations=${conversations} messages=${status?.stats?.messages ?? 0}`;
}

function summarizeBackfill(status) {
  const b = status?.stats?.backfill ?? {};
  const eligible = Number(b.eligible ?? 0);
  const touched = Number(b.touched ?? 0);
  const exhausted = Number(b.exhausted ?? 0);
  const pendingCursors = Number(b.pendingCursors ?? 0);
  const untouched = Math.max(0, eligible - touched);
  const phase =
    untouched > 0
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
  return { eligible, touched, pendingCursors, untouched, exhausted: Number(b.exhausted ?? 0) };
}

function isBackfillComplete(status) {
  const c = backfillCounters(status);
  return c.untouched === 0 && c.pendingCursors === 0;
}

function summarizeMessages(messages) {
  if (!Array.isArray(messages)) return "messages=0";
  const ok = messages.filter((item) => item?.ok).length;
  const failed = messages.filter((item) => item && item.ok === false).length;
  const copied = messages.reduce((sum, item) => sum + Number(item?.messages ?? 0), 0);
  const cursors = messages.filter((item) => item?.cursor).length;
  const rateLimited = messages.filter((item) => item?.error === "ratelimited").length;
  return `messageCalls=${messages.length} ok=${ok} failed=${failed} rateLimited=${rateLimited} copied=${copied} cursors=${cursors}`;
}

function formatEta(pendingCursors, pauseMs) {
  const sec = (pendingCursors * pauseMs) / 1000;
  if (sec < 3600) return `~${Math.round(sec / 60)} min (lower bound, 1 page/cursor)`;
  if (sec < 86400) return `~${(sec / 3600).toFixed(1)} h (lower bound)`;
  return `~${(sec / 86400).toFixed(1)} days (lower bound; busy channels need many pages each)`;
}

console.log(`[${now()}] Slack backfill starting against ${baseUrl}`);
console.log(
  `[${now()}] profile=${profileName} untilComplete=${untilComplete} maxIterations=${maxIterations} pauseMs=${pauseMs} messageLimit=${messageLimit} discover=${discover} timeZone=${timeZone} cutoffDate=${cutoffDate || "none"} latestTs=${latestTs || "none"}`,
);

const startingCache = await getJson("/api/integrations/slack/cache?limit=1");
console.log(`[${now()}] Current vault: ${summarizeStatus(startingCache.status)} | ${summarizeBackfill(startingCache.status)}`);
const startingCounters = backfillCounters(startingCache.status);
console.log(
  `[${now()}] Resume: touched=${startingCounters.touched}/${startingCounters.eligible}, pendingCursors=${startingCounters.pendingCursors}, exhausted=${startingCounters.exhausted}.`,
);
if (startingCounters.pendingCursors > 0) {
  console.log(`[${now()}] ETA hint: ${formatEta(startingCounters.pendingCursors, pauseMs)} at current pause (real time is higher).`);
}

if (statusOnly) {
  console.log(`[${now()}] Status-only mode complete.`);
  process.exit(isBackfillComplete(startingCache.status) ? 0 : 1);
}

if (isBackfillComplete(startingCache.status)) {
  console.log(`[${now()}] Backfill already complete (no pending cursors, all eligible touched).`);
  process.exit(0);
}

if (discover) {
  console.log(`[${now()}] Discovering users/conversations (users.list + conversations.list).`);
  const discovered = await postJson("/api/integrations/slack/sync", {
    syncUsers: true,
    syncConversations: true,
    syncMessages: false,
    syncThreads: false,
    maxRateLimitWaitMs,
  });
  console.log(`[${now()}] Discover complete: ${summarizeStatus(discovered.status)} | ${summarizeBackfill(discovered.status)}`);
  console.log(`[${now()}] Waiting ${Math.round(pauseMs / 1000)}s before history calls...`);
  await sleep(pauseMs);
}

let slice = 0;
let consecutiveRateLimits = 0;

while (slice < maxIterations) {
  slice += 1;
  const before = await getJson("/api/integrations/slack/cache?limit=1");
  const beforeCounters = backfillCounters(before.status);

  if (isBackfillComplete(before.status)) {
    console.log(`[${now()}] Backfill complete after ${slice - 1} slices. ${summarizeBackfill(before.status)}`);
    break;
  }

  console.log(
    `[${now()}] Slice ${slice}${untilComplete ? "" : `/${maxIterations}`}: one history page. ${summarizeBackfill(before.status)}`,
  );

  let slicePauseMs = pauseMs;
  try {
    const result = await postJson("/api/integrations/slack/sync", {
      syncUsers: false,
      syncConversations: false,
      syncMessages: true,
      syncThreads: false,
      maxConversations: 1,
      maxConversationPages: 1,
      messageLimit,
      continueBackfill: true,
      forceFull: true,
      includeNonMemberPublic: false,
      maxRateLimitWaitMs,
      latestTs: latestTs || undefined,
    });

    const msg = Array.isArray(result.messages) ? result.messages[0] : null;
    if (msg?.error === "ratelimited") {
      consecutiveRateLimits += 1;
      const waitSec = Number(msg.retryAfter ?? 60);
      slicePauseMs = Math.max(pauseMs, waitSec * 1000 + 500);
      console.warn(`[${now()}] Rate limited on slice ${slice}; backing off ${Math.round(slicePauseMs / 1000)}s`);
      if (consecutiveRateLimits >= 3 && profileName === "internal") {
        console.warn(`[${now()}] Consider --profile=conservative if rate limits persist (Tier 1 app limits).`);
      }
    } else {
      consecutiveRateLimits = 0;
    }

    const afterCounters = backfillCounters(result.status);
    console.log(
      `[${now()}] Slice ${slice} done: ${summarizeMessages(result.messages)} | ${summarizeStatus(result.status)} | ${summarizeBackfill(result.status)}`,
    );

    if (afterCounters.pendingCursors < beforeCounters.pendingCursors) {
      console.log(`[${now()}] Cursor exhausted for a channel (${beforeCounters.pendingCursors} → ${afterCounters.pendingCursors} pending).`);
    }
  } catch (error) {
    console.error(`[${now()}] Slice ${slice} failed: ${error instanceof Error ? error.message : String(error)}`);
    slicePauseMs = Math.max(pauseMs, 120_000);
  }

  if (!untilComplete && slice >= maxIterations) break;

  const tail = await getJson("/api/integrations/slack/cache?limit=1");
  if (isBackfillComplete(tail.status)) {
    console.log(`[${now()}] Backfill complete. ${summarizeBackfill(tail.status)}`);
    break;
  }

  if (slice < maxIterations || untilComplete) {
    console.log(
      `[${now()}] Sleeping ${Math.round(slicePauseMs / 1000)}s. Next slice ~${formatLocalTime(new Date(Date.now() + slicePauseMs))}`,
    );
    await sleep(slicePauseMs);
  }
}

const finalCache = await getJson("/api/integrations/slack/cache?limit=1");
const complete = isBackfillComplete(finalCache.status);
console.log(
  `[${now()}] Slack backfill ${complete ? "COMPLETE" : "PAUSED"}: ${summarizeStatus(finalCache.status)} | ${summarizeBackfill(finalCache.status)}`,
);
if (!complete) {
  console.log(`[${now()}] Resume with: cd web && npm run slack:backfill -- --until-complete --cutoff-date=${cutoffDate || "2026-05-25"} --discover=false`);
  process.exit(1);
}
