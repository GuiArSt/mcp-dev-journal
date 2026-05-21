import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { DEFAULT_CHAT_MODEL, getChatModelEntry, resolveChatModelId } from "@/lib/ai/model-catalog";

/**
 * Gemini Search Grounding API route
 *
 * Uses the configured Google Flash model as a search intermediary with Google
 * Search grounding.
 * Returns synthesized answer + structured sources with citations.
 *
 * This is a dedicated route because google_search cannot be mixed
 * with custom function tools in the same Gemini API call.
 *
 * Pricing: ~$14/1K search queries (Gemini 3) or $35/1K (Gemini 2.5)
 * + standard Gemini token costs
 */

interface GeminiSearchRequest {
  query: string;
}

export async function POST(req: NextRequest) {
  // Auth check
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google API key not configured" },
      { status: 500 }
    );
  }

  try {
    const { query }: GeminiSearchRequest = await req.json();

    if (!query) {
      return NextResponse.json(
        { error: "query parameter required" },
        { status: 400 }
      );
    }

    console.log(
      `[Gemini Search] Query: "${query.substring(0, 80)}..."`
    );
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

    // Extract grounding metadata from provider response
    const googleMeta = providerMetadata?.google as Record<string, any> | undefined;
    const groundingMetadata = googleMeta?.groundingMetadata as Record<string, any> | undefined;

    // Build structured sources from grounding chunks
    const groundingChunks: Array<{ title: string; url: string }> =
      groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title || "Unknown",
        url: chunk.web?.uri || "",
      })) || [];

    // Build citation supports (text segment → source mapping)
    const supports: Array<{
      text: string;
      sourceIndices: number[];
      confidences: number[];
    }> =
      groundingMetadata?.groundingSupports?.map((support: any) => ({
        text: support.segment?.text || "",
        sourceIndices: support.groundingChunkIndices || [],
        confidences: support.confidenceScores || [],
      })) || [];

    // Use AI SDK sources if available, fall back to grounding chunks
    const citedSources =
      sources && sources.length > 0
        ? sources.map((s: any) => ({
            title: s.title || s.url || "Source",
            url: s.url || "",
          }))
        : groundingChunks;

    // Format response with sources
    let formattedResult = text || "";
    if (citedSources.length > 0) {
      formattedResult += "\n\n**Sources:**\n";
      citedSources.forEach(
        (source: { title: string; url: string }, i: number) => {
          formattedResult += `${i + 1}. [${source.title}](${source.url})\n`;
        }
      );
    }

    return NextResponse.json({
      result: formattedResult,
      sources: citedSources,
      searchQueries: groundingMetadata?.webSearchQueries || [],
      supports,
    });
  } catch (error: any) {
    console.error("[Gemini Search] Error:", error);
    return NextResponse.json(
      { error: error.message || "Gemini search failed" },
      { status: 500 }
    );
  }
}
