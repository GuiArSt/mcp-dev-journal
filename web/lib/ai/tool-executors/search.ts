import type { ToolExecutor } from "./types";

async function runHostedWebSearch(args: Record<string, any>) {
  const res = await fetch("/api/gemini-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: args.query }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Web search failed");
  return { output: `**Web Search Results**\n\n${data.result}` };
}

export const searchExecutors: Record<string, ToolExecutor> = {
  web_search: runHostedWebSearch,
  gemini_search: runHostedWebSearch,
};
