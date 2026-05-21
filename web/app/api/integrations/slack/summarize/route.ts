import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { traceAI } from "@/lib/observability";
import { DEFAULT_CHAT_MODEL, getChatModelEntry, resolveChatModelId } from "@/lib/ai/model-catalog";

export const runtime = "nodejs";
export const maxDuration = 120;

const SLACK_SUMMARY_MODEL_ID = resolveChatModelId(getChatModelEntry(DEFAULT_CHAT_MODEL), process.env);

const SummaryOutputSchema = z.object({
  summary: z.string().describe("Dense 3-sentence Slack conversation summary for Tartarus retrieval"),
});

interface SlackConversationCandidate {
  id: string;
  title: string;
  vaultType: string;
  type: string;
  summary: string | null;
  messageCount: number;
}

interface SlackMessageForSummary {
  ts: string;
  authorName: string | null;
  text: string | null;
  subtype: string | null;
  threadTs: string | null;
}

function ensureSlackSummarySchema() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS slack_conversation_summary_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      model TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_slack_summary_runs_conversation ON slack_conversation_summary_runs(conversation_id);
  `);
}

function listCandidates(limit: number, force: boolean): SlackConversationCandidate[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT
      c.id,
      COALESCE(c.name, im.real_name, im.name, c.user_id, c.id) as title,
      c.vault_type as vaultType,
      c.type,
      c.summary,
      COUNT(m.id) as messageCount
    FROM slack_conversations c
    LEFT JOIN slack_users im ON im.id = c.user_id
    LEFT JOIN slack_messages m ON m.conversation_id = c.id
    WHERE (? = 1 OR c.summary IS NULL)
    GROUP BY c.id
    HAVING messageCount > 0
    ORDER BY
      CASE WHEN c.summarized_at IS NULL THEN 0 ELSE 1 END ASC,
      c.summarized_at ASC,
      messageCount DESC
    LIMIT ?
  `).all(force ? 1 : 0, limit) as SlackConversationCandidate[];
}

function getMessagesForSummary(conversationId: string, maxMessages: number): SlackMessageForSummary[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT
      m.ts,
      COALESCE(u.real_name, u.name, m.username, m.user_id, m.bot_id) as authorName,
      m.text,
      m.subtype,
      m.thread_ts as threadTs
    FROM slack_messages m
    LEFT JOIN slack_users u ON u.id = m.user_id
    WHERE m.conversation_id = ?
    ORDER BY CAST(m.ts AS REAL) DESC
    LIMIT ?
  `).all(conversationId, maxMessages).reverse() as SlackMessageForSummary[];
}

function formatMessages(messages: SlackMessageForSummary[]) {
  return messages
    .map((message) => {
      const author = message.authorName ?? "unknown";
      const body = message.text || `[${message.subtype ?? "empty event"}]`;
      const thread = message.threadTs ? " thread" : "";
      return `[${message.ts}${thread}] ${author}: ${body}`;
    })
    .join("\n");
}

async function summarizeConversation(candidate: SlackConversationCandidate, maxMessages: number) {
  const messages = getMessagesForSummary(candidate.id, maxMessages);
  const content = formatMessages(messages);
  if (!content.trim()) throw new Error("No message content to summarize");

  const result = await traceAI(
    "slack:summarize-conversation",
    SLACK_SUMMARY_MODEL_ID,
    () =>
      generateText({
        model: google(SLACK_SUMMARY_MODEL_ID),
        output: Output.object({ schema: SummaryOutputSchema }),
        system: `You summarize Slack conversations for Tartarus, a personal data vault.
Write exactly 3 dense sentences for retrieval.
Sentence 1: what this conversation/channel is about.
Sentence 2: important people, topics, decisions, links, tasks, or recurring themes.
Sentence 3: why it may matter later for the user's memory/work context.
Do not invent missing facts. Preserve names, tools, projects, and concrete nouns when present.`,
        prompt: `Slack conversation metadata:
ID: ${candidate.id}
Title: ${candidate.title}
Vault type: ${candidate.vaultType}
Slack type: ${candidate.type}
Messages included: ${messages.length}

Messages:
${content}`,
      }),
    {
      conversationId: candidate.id,
      title: candidate.title,
      messageCount: messages.length,
    },
    content,
    "/api/integrations/slack/summarize",
  );

  const summary = result.output?.summary;
  if (!summary) throw new Error("Model returned no summary");
  return { summary, messageCount: messages.length };
}

export async function GET() {
  try {
    ensureSlackSummarySchema();
    const db = getDatabase();
    const pending = db.prepare(`
      SELECT COUNT(*) as count
      FROM slack_conversations c
      WHERE c.summary IS NULL
        AND EXISTS (SELECT 1 FROM slack_messages m WHERE m.conversation_id = c.id)
    `).get() as { count: number };
    const summarized = db.prepare(`SELECT COUNT(*) as count FROM slack_conversations WHERE summary IS NOT NULL`).get() as { count: number };
    return NextResponse.json({
      model: SLACK_SUMMARY_MODEL_ID,
      pending: pending.count,
      summarized: summarized.count,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read Slack summary status" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureSlackSummarySchema();
    const body = await request.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(Number(body.limit ?? 3), 20));
    const maxMessages = Math.max(10, Math.min(Number(body.maxMessages ?? 80), 250));
    const force = body.force === true;
    const candidates = listCandidates(limit, force);
    const db = getDatabase();
    const results = [];

    for (const candidate of candidates) {
      try {
        const { summary, messageCount } = await summarizeConversation(candidate, maxMessages);
        db.prepare(`
          UPDATE slack_conversations
          SET summary = ?, summarized_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(summary, candidate.id);
        db.prepare(`
          INSERT INTO slack_conversation_summary_runs (conversation_id, model, message_count, status)
          VALUES (?, ?, ?, 'success')
        `).run(candidate.id, SLACK_SUMMARY_MODEL_ID, messageCount);
        results.push({ id: candidate.id, title: candidate.title, ok: true, messageCount, summary });
      } catch (error) {
        const message = error instanceof Error ? error.message : "summary failed";
        db.prepare(`
          INSERT INTO slack_conversation_summary_runs (conversation_id, model, message_count, status, error)
          VALUES (?, ?, ?, 'error', ?)
        `).run(candidate.id, SLACK_SUMMARY_MODEL_ID, 0, message);
        results.push({ id: candidate.id, title: candidate.title, ok: false, error: message });
      }
    }

    const status = await GET();
    const statusJson = await status.json();
    return NextResponse.json({
      ok: true,
      model: SLACK_SUMMARY_MODEL_ID,
      processed: results.length,
      results,
      status: statusJson,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Slack summarization failed" },
      { status: 500 },
    );
  }
}
