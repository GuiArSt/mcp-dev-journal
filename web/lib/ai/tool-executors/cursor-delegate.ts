import type { ToolExecutor } from "./types";

export const cursorDelegateExecutors: Record<string, ToolExecutor> = {
  cursor_repository_insight: async (args) => {
    const res = await fetch("/api/cursor-delegate/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: args.project_id,
        question: args.question,
      }),
    });
    const data = (await res.json()) as { error?: string; output?: string };
    if (!res.ok) {
      throw new Error(data.error || `Cursor delegate failed (${res.status})`);
    }
    return { output: data.output ?? "" };
  },
};
