/**
 * POST /api/chat-hourglass/muse/observe
 *
 * The Muse's thought stream. Returns a short, literary observation about
 * the most recent exchange — not a response, not a summary, just a quiet
 * whisper. Called on every new turn while the muse builds toward her
 * decision to paint.
 *
 * No persistence. No side effects. Cheap Gemini Flash call (~$0.00003 each).
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { getPrompt, getMuseConfig } from "@/lib/ai/prompt-store";
import { MUSE_OBSERVE_DEFAULT } from "@/lib/ai/prompt-defaults";
import { traceAI } from "@/lib/observability";

export const runtime = "nodejs";
export const maxDuration = 30;

const OBSERVATION_SCHEMA = z.object({
  thought: z
    .string()
    .describe(
      "A single sentence of literary, imagistic observation. Never a summary, never advice. A quiet thought in the dark as the muse watches.",
    ),
});


interface Body {
  turns: Array<{ user: string; assistant: string }>;
  conversationId?: number;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !Array.isArray(body.turns) || body.turns.length === 0) {
    return NextResponse.json({ error: "turns required" }, { status: 400 });
  }

  // Keep it tight — only the last 3 turns, capped.
  const transcript = body.turns
    .slice(-3)
    .map((t) =>
      `  USER: ${String(t.user ?? "").slice(0, 800)}\n  KRONUS: ${String(t.assistant ?? "").slice(0, 800)}`,
    )
    .join("\n\n");

  try {
    const cfg = getMuseConfig();
    const observePrompt = getPrompt("muse-observe", MUSE_OBSERVE_DEFAULT);
    const modelId = cfg.observeModel || "gemini-2.5-flash";
    // Trace the observe call so its (tiny) cost shows up in the per-chat
    // cost meter alongside everything else this conversation triggers.
    const convId = typeof body.conversationId === "number" ? body.conversationId : undefined;
    const result = await traceAI(
      "muse-observe",
      modelId,
      () => generateObject({
        model: google(modelId),
        schema: OBSERVATION_SCHEMA,
        system: observePrompt,
        prompt: `Recent exchange:\n\n${transcript}`,
      }),
      { conversationId: convId },
      transcript,
      "/api/chat-hourglass/muse/observe",
      convId,
    );
    return NextResponse.json({ thought: result.object.thought });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
