import type { ToolExecutor } from "./types";

async function runHostedWebSearch(args: Record<string, any>) {
  const res = await fetch("/api/web-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: args.query }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Web search failed");
  const provider =
    data.provider === "perplexity"
      ? "Perplexity Search"
      : data.provider === "gemini"
        ? "Gemini Search"
        : "Web Search";
  return { output: `**${provider} Results**\n\n${data.result}` };
}

async function runGeminiSearch(args: Record<string, any>) {
  const res = await fetch("/api/gemini-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: args.query }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Gemini search failed");
  return { output: `**Gemini Search Results**\n\n${data.result}` };
}

export const searchExecutors: Record<string, ToolExecutor> = {
  web_search: runHostedWebSearch,
  gemini_search: runGeminiSearch,

  perplexity_search: async (args) => {
    const res = await fetch("/api/perplexity/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: args.query,
        max_results: args.max_results,
        search_context_size: args.search_context_size ?? "low",
        country: args.country,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Perplexity search failed");
    return { output: `**Perplexity Search Results**\n\n${data.result}` };
  },

  perplexity_ask: async (args) => {
    const res = await fetch("/api/perplexity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ask", question: args.question }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Perplexity ask failed");
    return { output: `**Perplexity Answer**\n\n${data.result}` };
  },

  perplexity_research: async (args) => {
    const res = await fetch("/api/perplexity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "research",
        topic: args.topic,
        strip_thinking: args.strip_thinking ?? true,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Perplexity research failed");
    return { output: `**Perplexity Research**\n\n${data.result}` };
  },

  perplexity_reason: async (args) => {
    const res = await fetch("/api/perplexity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reason",
        problem: args.problem,
        strip_thinking: args.strip_thinking ?? true,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Perplexity reasoning failed");
    return { output: `**Perplexity Reasoning**\n\n${data.result}` };
  },
};
