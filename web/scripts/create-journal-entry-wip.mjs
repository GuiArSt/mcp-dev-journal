#!/usr/bin/env node
/**
 * One-off: create a journal entry when MCP/web API auth is unavailable.
 * Usage: node web/scripts/create-journal-entry-wip.mjs
 * Rebind commit_hash after you commit (PATCH /api/entries/:hash or MCP edit).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const dbPath = path.join(root, "data/journal.db");

const COMMIT_HASH = "wip-hourglass-repairs-20260611";
const REPOSITORY = "tartarus";
const BRANCH = "codex-slack-vault-and-execution-plan";

const raw_agent_report = `Uncommitted work session — rebind commit_hash when landed on main.

## Hourglass performance (Phase 1–2)
- web/lib/hourglass-turns.ts — turn reconstruction pure functions
- HourglassChat — completedTurns vs liveTail split; Composer outside memo chrome
- Hero — PendingTurnBlock isolation; rAF scroll
- HourglassChrome.tsx — NEW memo shell (Topbar/Rail/MoodPanel)
- tests/lib/hourglass-turns.test.ts

## Context meter
- hourglass-context-meter.ts — soul + lite index + skill bodies + conversation
- kronus/stats liteIndexTokens; skills tokenEstimate
- Composer ctx chip: 73k / 1.0M · 7% + tooltip

## Multi-provider reasoning (GPT-5.5)
- chat-reasoning-repair.ts — preserve OpenAI rs_/msg_ pairs; strip only foreign reasoning
- chat/route.ts — reasoning.encrypted_content for multi-turn OpenAI

## Reliability / observability
- dev-client-errors, monitor/crashes, memlog conversationId, save-on-finish + sendBeacon

## Inventory
- docs/CODEBASE_INVENTORY.md Phase 1 complete; Phase 2 module maps pending`;

const entry = {
  commit_hash: COMMIT_HASH,
  repository: REPOSITORY,
  branch: BRANCH,
  author: "Guillermo Stumpf",
  date: new Date().toISOString(),
  why: "Hourglass chat was re-rendering the full UI on every stream token, the context meter under-counted real prompt size (~7% vs ~50k+ tokens), and GPT-5.5 failed on multi-turn history because OpenAI reasoning pairs were incorrectly stripped.",
  what_changed:
    "Phase 1–2 stable turns refactor (hourglass-turns.ts, Hero, HourglassChrome); accurate context meter with Kronus Lite index; provider-correct reasoning repair for OpenAI Responses API; client crash/memlog observability; immediate conversation persistence on stream finish.",
  decisions:
    "Freeze completedTurns while streaming and only rebuild on idle; move Composer outside memoized chrome so ctx updates without re-rendering MoodPanel; never strip OpenAI reasoning with empty text (rs_ itemId); request reasoning.encrypted_content for GPT-5.5 multi-turn; Phase 1 codebase inventory in docs/CODEBASE_INVENTORY.md before line-level Phase 2.",
  technologies:
    "Next.js, React, AI SDK 6, OpenAI Responses API, Anthropic adaptive thinking, Gemini thoughtSignature, Vitest, better-sqlite3, Hourglass chat",
  kronus_wisdom:
    "Provider memory is not interchangeable — each model leaves fingerprints (rs_, signatures, thoughtSignature). Stripping the wrong layer orphans the conversation.",
  raw_agent_report,
  files_changed: JSON.stringify([
    { path: "web/lib/hourglass-turns.ts", action: "created" },
    { path: "web/lib/hourglass-context-meter.ts", action: "created" },
    { path: "web/lib/chat-reasoning-repair.ts", action: "created" },
    { path: "web/components/chat/hourglass/HourglassChrome.tsx", action: "created" },
    { path: "web/components/chat/hourglass/HourglassChat.tsx", action: "modified" },
    { path: "web/components/chat/hourglass/Hero.tsx", action: "modified" },
    { path: "web/components/chat/hourglass/Composer.tsx", action: "modified" },
    { path: "web/app/api/chat/route.ts", action: "modified" },
    { path: "web/lib/dev-client-errors.ts", action: "created" },
    { path: "docs/CODEBASE_INVENTORY.md", action: "created" },
  ]),
  summary:
    "Hourglass chat repairs: stable turns, real context meter, GPT-5.5 reasoning history fix, crash observability, Phase 1 codebase map.",
};

const db = new Database(dbPath);
const exists = db
  .prepare("SELECT 1 FROM journal_entries WHERE commit_hash = ?")
  .get(COMMIT_HASH);
if (exists) {
  console.log(`Journal entry already exists: ${COMMIT_HASH}`);
  process.exit(0);
}

db.prepare(
  `INSERT INTO journal_entries (
    commit_hash, repository, branch, author, date, why, what_changed,
    decisions, technologies, kronus_wisdom, raw_agent_report, files_changed, summary
  ) VALUES (
    @commit_hash, @repository, @branch, @author, @date, @why, @what_changed,
    @decisions, @technologies, @kronus_wisdom, @raw_agent_report, @files_changed, @summary
  )`,
).run(entry);

console.log(`Created journal entry ${COMMIT_HASH} for ${REPOSITORY}/${BRANCH}`);
console.log(`View: journal://entry/${COMMIT_HASH}`);
