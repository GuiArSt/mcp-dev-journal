import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Perplexity Sonar API proxy (OpenAI-compatible chat/completions).
 *
 * Actions map to Sonar models for synthesized answers with citations.
 * For raw ranked web results, use /api/perplexity/search instead.
 */

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

const ALLOWED_ACTIONS = ["ask", "research", "reason"] as const;
type Action = (typeof ALLOWED_ACTIONS)[number];

interface PerplexityRequest {
  action: Action;
  question?: string;
  topic?: string;
  problem?: string;
  strip_thinking?: boolean;
}

const ACTION_MODELS: Record<Action, string> = {
  ask: "sonar-pro",
  research: "sonar-deep-research",
  reason: "sonar-reasoning-pro",
};

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "PERPLEXITY_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const body: PerplexityRequest = await req.json();
    const { action, question, topic, problem, strip_thinking = true } = body;

    if (!action || !ALLOWED_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${ALLOWED_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const model = ACTION_MODELS[action];
    const userMessage = question || topic || problem || "";

    if (!userMessage.trim()) {
      return NextResponse.json(
        { error: "No question/topic/problem provided" },
        { status: 400 }
      );
    }

    console.log(`[Perplexity Sonar] ${action} (${model}): "${userMessage.substring(0, 50)}..."`);

    const response = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: userMessage.trim() }],
        return_citations: true,
        return_images: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Perplexity Sonar] API error ${response.status}:`, errorText);
      return NextResponse.json(
        { error: `Perplexity API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";
    const citations: string[] = data.citations || [];

    if (strip_thinking && /<\s*think|redacted_thinking/i.test(content)) {
      content = content.replace(/[\s\S]*?<\/think>/gi, "").trim();
    }

    let formattedResponse = content;
    if (citations.length > 0) {
      formattedResponse += "\n\n**Sources:**\n";
      citations.forEach((citation: string, i: number) => {
        formattedResponse += `${i + 1}. ${citation}\n`;
      });
    }

    return NextResponse.json({
      result: formattedResponse,
      provider: "perplexity-sonar",
      model,
      citations,
      usage: data.usage,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to call Perplexity API";
    console.error("[Perplexity Sonar] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
