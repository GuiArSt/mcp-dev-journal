/**
 * AI Model Cost Definitions (per 1M tokens)
 *
 * Single source of truth for model pricing.
 * Used by both MCP server (src/) and web app (web/) observability.
 */

export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // Full model IDs
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20250514": { input: 0.8, output: 4.0 },
  "claude-opus-4-5-20251101": { input: 15.0, output: 75.0 },
  "claude-opus-4-6": { input: 5.0, output: 25.0 },
  "claude-opus-4-7": { input: 5.0, output: 25.0 },
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  "claude-sonnet-5": { input: 3.0, output: 15.0 },
  "claude-fable-5": { input: 10.0, output: 50.0 },
  // AI SDK model aliases
  "claude-haiku-4-5": { input: 0.8, output: 4.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-opus-4-5": { input: 15.0, output: 75.0 },
  // Google Gemini models
  "gemini-3.5-flash": { input: 1.5, output: 9.0 },
  "gemini-3.1-pro": { input: 2.5, output: 15.0 },
  "gemini-3.1-pro-preview": { input: 2.5, output: 15.0 },
  "gemini-3-flash": { input: 0.5, output: 3.0 },
  "gemini-3-flash-preview": { input: 0.5, output: 3.0 },
  "gemini-3-pro": { input: 2.0, output: 12.0 },
  "gemini-3-pro-preview": { input: 2.0, output: 12.0 },
  // OpenAI models
  "gpt-5.4": { input: 2.5, output: 15.0 },
  "gpt-5.5": { input: 5.0, output: 30.0 },
};

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;
  if ((model === "gpt-5.4" || model === "gpt-5.5") && inputTokens > 272_000) {
    return (inputTokens * costs.input * 2 + outputTokens * costs.output * 1.5) / 1_000_000;
  }
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
}
