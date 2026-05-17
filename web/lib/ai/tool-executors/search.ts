import type { ToolExecutor } from "./types";

export const searchExecutors: Record<string, ToolExecutor> = {
  gemini_search: async (args) => {
    const res = await fetch("/api/gemini-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: args.query }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gemini search failed");
    return { output: `🔍 **Google Search Results**\n\n${data.result}` };
  },
};
