import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { traceAI } from "@/lib/observability";
import { getPrompt } from "@/lib/ai/prompt-store";
import { KRONUS_CHAT_SUMMARY_DEFAULT } from "@/lib/ai/prompt-defaults";

const SummarySchema = z.object({
  summary: z
    .string()
    .describe(
      "A concise 2-3 sentence summary describing what this conversation was about, what was discussed, and key points covered."
    ),
});

function getObservabilityDbPath(): string {
  let currentDir = process.cwd();
  if (path.basename(currentDir) === "web") {
    currentDir = path.dirname(currentDir);
  }
  return path.join(currentDir, "data", "observability.db");
}

interface KronusChatRow {
  id: number;
  trace_id: string;
  question: string;
  answer: string;
  repository: string | null;
  depth: string;
  summary: string | null;
  summary_updated_at: string | null;
  created_at: string;
  status: string;
}

async function summarizeChat(
  question: string,
  answer: string,
  repository?: string
): Promise<string | null> {
  const googleApiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!googleApiKey) {
    throw new Error(
      "Google API key not available (GOOGLE_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY required)"
    );
  }

  // Hardcoded: Gemini 3 Flash for summarization
  const model = google("gemini-3-flash");

  const conversationText = `Question: ${question}\n\nAnswer: ${answer}${repository ? `\n\nRepository: ${repository}` : ""}`;

  const userPrompt = `Generate a living summary for this Kronus conversation:\n\n${conversationText}`;
  const result = await traceAI(
    "kronus-chat-summary",
    "gemini-3-flash",
    () => generateText({
      model,
      output: Output.object({ schema: SummarySchema }),
      system: getPrompt("kronus-chat-summary", KRONUS_CHAT_SUMMARY_DEFAULT),
      prompt: userPrompt,
    }),
    { repository: repository ?? null },
    userPrompt,
    "/api/kronus/chats/[id]/summary",
  );

  return result.output?.summary ?? null;
}

/**
 * GET /api/kronus/chats/[id]/summary
 *
 * Check if a chat has a summary
 * Returns: { id, has_summary, summary, summary_updated_at }
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const chatId = parseInt(id, 10);

    if (isNaN(chatId)) {
      return NextResponse.json({ error: "Invalid chat ID" }, { status: 400 });
    }

    const dbPath = getObservabilityDbPath();
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ error: "Observability database not found" }, { status: 404 });
    }

    const db = new Database(dbPath, { readonly: true });
    const chat = db
      .prepare(
        "SELECT id, summary, summary_updated_at, question, repository, created_at FROM kronus_chats WHERE id = ?"
      )
      .get(chatId) as
      | Pick<
          KronusChatRow,
          "id" | "summary" | "summary_updated_at" | "question" | "repository" | "created_at"
        >
      | undefined;
    db.close();

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: chat.id,
      has_summary: !!chat.summary,
      summary: chat.summary,
      summary_updated_at: chat.summary_updated_at,
      question_preview: chat.question.substring(0, 100) + (chat.question.length > 100 ? "..." : ""),
      repository: chat.repository,
      created_at: chat.created_at,
    });
  } catch (error: any) {
    console.error("[KronusChat] GET summary error:", error);
    return NextResponse.json({ error: error.message || "Unknown error" }, { status: 500 });
  }
}

/**
 * POST /api/kronus/chats/[id]/summary
 *
 * Generate or regenerate summary for a specific chat
 *
 * Body:
 *   - force: boolean (optional) - If true, regenerates even if summary exists
 *
 * Behavior:
 *   - If summary doesn't exist: generates one
 *   - If summary exists and force=false (default): returns existing summary without regenerating
 *   - If summary exists and force=true: regenerates the summary
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const chatId = parseInt(id, 10);

    if (isNaN(chatId)) {
      return NextResponse.json({ error: "Invalid chat ID" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const force = body.force === true;

    const dbPath = getObservabilityDbPath();
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ error: "Observability database not found" }, { status: 404 });
    }

    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");

    const chat = db
      .prepare(
        "SELECT id, question, answer, repository, summary, summary_updated_at, status FROM kronus_chats WHERE id = ?"
      )
      .get(chatId) as KronusChatRow | undefined;

    if (!chat) {
      db.close();
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    if (chat.status !== "success") {
      db.close();
      return NextResponse.json(
        { error: "Cannot summarize failed chat", status: chat.status },
        { status: 400 }
      );
    }

    // If summary exists and not forcing, return existing
    if (chat.summary && !force) {
      db.close();
      return NextResponse.json({
        id: chat.id,
        summary: chat.summary,
        summary_updated_at: chat.summary_updated_at,
        generated: false,
        message: "Summary already exists. Use force=true to regenerate.",
      });
    }

    // Generate summary
    const summary = await summarizeChat(chat.question, chat.answer, chat.repository ?? undefined);

    if (!summary) {
      db.close();
      return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
    }

    // Update database
    const now = new Date().toISOString();
    db.prepare("UPDATE kronus_chats SET summary = ?, summary_updated_at = ? WHERE id = ?").run(
      summary,
      now,
      chatId
    );
    db.close();

    return NextResponse.json({
      id: chatId,
      summary,
      summary_updated_at: now,
      generated: true,
      regenerated: force && !!chat.summary,
      message: force && chat.summary ? "Summary regenerated" : "Summary generated",
    });
  } catch (error: any) {
    console.error("[KronusChat] POST summary error:", error);
    return NextResponse.json({ error: error.message || "Unknown error" }, { status: 500 });
  }
}
