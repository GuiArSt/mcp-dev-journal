import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const PERPLEXITY_SEARCH_URL = "https://api.perplexity.ai/search";

interface PerplexitySearchRequest {
  query: string;
  max_results?: number;
  search_context_size?: "low" | "medium" | "high";
  country?: string;
}

interface PerplexitySearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  date?: string | null;
  last_updated?: string | null;
}

function formatSearchResults(
  results: PerplexitySearchResult[],
  provider: "perplexity"
): string {
  if (results.length === 0) {
    return "No results found.";
  }

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

  return formatted.trim();
}

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
    const body: PerplexitySearchRequest = await req.json();
    const { query, max_results = 8, search_context_size = "low", country } = body;

    if (!query?.trim()) {
      return NextResponse.json({ error: "query parameter required" }, { status: 400 });
    }

    console.log(`[Perplexity Search] "${query.substring(0, 80)}..."`);

    const response = await fetch(PERPLEXITY_SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: query.trim(),
        max_results: Math.min(Math.max(max_results, 1), 20),
        search_context_size,
        ...(country ? { country } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Perplexity Search] API error ${response.status}:`, errorText);
      return NextResponse.json(
        { error: `Perplexity Search API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    const results: PerplexitySearchResult[] = Array.isArray(data.results)
      ? data.results
      : [];

    const sources = results
      .filter((r) => r.url)
      .map((r) => ({
        title: r.title || r.url || "Source",
        url: r.url || "",
        date: r.date || r.last_updated || null,
      }));

    const formattedResult = formatSearchResults(results, "perplexity");

    return NextResponse.json({
      result: formattedResult,
      provider: "perplexity",
      sources,
      searchId: data.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Perplexity search failed";
    console.error("[Perplexity Search] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
