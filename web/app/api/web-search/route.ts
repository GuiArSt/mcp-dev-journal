import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { DEFAULT_CHAT_MODEL, getChatModelEntry, resolveChatModelId } from "@/lib/ai/model-catalog";

interface WebSearchRequest {
  query: string;
}

type SearchProvider = "perplexity" | "gemini";

const PERPLEXITY_SEARCH_URL = "https://api.perplexity.ai/search";

function resolveSearchProvider(): SearchProvider {
  const explicit = process.env.SEARCH_PROVIDER?.toLowerCase();
  if (explicit === "gemini" || explicit === "google") return "gemini";
  if (explicit === "perplexity") return "perplexity";

  if (process.env.PERPLEXITY_API_KEY) return "perplexity";
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY) {
    return "gemini";
  }

  return "gemini";
}

async function runPerplexitySearch(query: string) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY not configured");

  const response = await fetch(PERPLEXITY_SEARCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      max_results: 8,
      search_context_size: "low",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity Search API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const results: Array<{
    title?: string;
    url?: string;
    snippet?: string;
    date?: string | null;
    last_updated?: string | null;
  }> = Array.isArray(data.results) ? data.results : [];

  const sources = results
    .filter((r) => r.url)
    .map((r) => ({
      title: r.title || r.url || "Source",
      url: r.url || "",
      date: r.date || r.last_updated || null,
    }));

  let formatted = "";
  results.forEach((result, index) => {
    const title = result.title || "Untitled";
    const url = result.url || "";
    const date = result.date || result.last_updated;
    formatted += `${index + 1}. **${title}**`;
    if (url) formatted += ` — ${url}`;
    if (date) formatted += ` (${date})`;
    formatted += "\n";
    if (result.snippet?.trim()) {
      const snippet =
        result.snippet.length > 600
          ? `${result.snippet.slice(0, 600)}…`
          : result.snippet;
      formatted += `   ${snippet}\n`;
    }
    formatted += "\n";
  });

  return {
    result: formatted.trim() || "No results found.",
    provider: "perplexity" as const,
    sources,
    searchId: data.id,
  };
}

async function runGeminiSearch(query: string) {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Google API key not configured");
  }

  const searchModelId =
    process.env.GOOGLE_SEARCH_MODEL_ID ||
    resolveChatModelId(getChatModelEntry(DEFAULT_CHAT_MODEL), process.env);

  const { text, sources, providerMetadata } = await generateText({
    model: google(searchModelId),
    tools: {
      google_search: google.tools.googleSearch({}) as any,
    },
    prompt: query,
  });

  const googleMeta = providerMetadata?.google as Record<string, any> | undefined;
  const groundingMetadata = googleMeta?.groundingMetadata as Record<string, any> | undefined;
  const groundingChunks: Array<{ title: string; url: string }> =
    groundingMetadata?.groundingChunks?.map((chunk: any) => ({
      title: chunk.web?.title || "Unknown",
      url: chunk.web?.uri || "",
    })) || [];

  const citedSources =
    sources && sources.length > 0
      ? sources.map((s: any) => ({
          title: s.title || s.url || "Source",
          url: s.url || "",
        }))
      : groundingChunks;

  let formattedResult = text || "";
  if (citedSources.length > 0) {
    formattedResult += "\n\n**Sources:**\n";
    citedSources.forEach((source: { title: string; url: string }, i: number) => {
      formattedResult += `${i + 1}. [${source.title}](${source.url})\n`;
    });
  }

  return {
    result: formattedResult,
    provider: "gemini" as const,
    sources: citedSources,
    searchQueries: groundingMetadata?.webSearchQueries || [],
  };
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { query }: WebSearchRequest = await req.json();
    if (!query?.trim()) {
      return NextResponse.json({ error: "query parameter required" }, { status: 400 });
    }

    const provider = resolveSearchProvider();
    console.log(`[Web Search] provider=${provider} query="${query.substring(0, 80)}..."`);

    if (provider === "perplexity") {
      try {
        return NextResponse.json(await runPerplexitySearch(query.trim()));
      } catch (perplexityError) {
        const hasGemini =
          process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!hasGemini) throw perplexityError;

        console.warn("[Web Search] Perplexity failed, falling back to Gemini:", perplexityError);
        return NextResponse.json({
          ...(await runGeminiSearch(query.trim())),
          fallbackFrom: "perplexity",
        });
      }
    }

    return NextResponse.json(await runGeminiSearch(query.trim()));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Web search failed";
    console.error("[Web Search] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
