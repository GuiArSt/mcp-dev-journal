export type AiProviderKey = "anthropic" | "google" | "openai" | "deepseek" | "nebius";

export type ModelTier = "prime" | "standard" | "background";

export interface ChatModelCatalogEntry {
  key: string;
  label: string;
  shortLabel: string;
  provider: AiProviderKey;
  providerLabel: string;
  modelId: string;
  /** Provider-documented max input context (tokens). */
  contextWindow: number;
  hasThinking: boolean;
  tier: ModelTier;
  description: string;
  envModelIdKey?: string;
}

/** User-facing chat models in Hourglass + legacy ChatInterface picker. */
export const CHAT_MODEL_CATALOG = [
  {
    key: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    shortLabel: "3.5 Flash",
    provider: "google",
    providerLabel: "Google",
    modelId: "gemini-3.5-flash",
    // Google AI: 1,048,576 input tokens (gemini-3.5-flash model card / API docs, May 2026)
    contextWindow: 1_048_576,
    hasThinking: true,
    tier: "standard",
    description: "Default — fast agentic chat",
  },
  {
    key: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    shortLabel: "Sonnet 5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    modelId: "claude-sonnet-5",
    // Anthropic API: 1M context, adaptive thinking (Claude Sonnet 5 docs, Jun 2026)
    contextWindow: 1_000_000,
    hasThinking: true,
    tier: "standard",
    description: "Agentic Sonnet — speed, tools, everyday work",
  },
  {
    key: "claude-opus-4.8",
    label: "Claude Opus 4.8",
    shortLabel: "Opus 4.8",
    provider: "anthropic",
    providerLabel: "Anthropic",
    modelId: "claude-opus-4-8",
    // Anthropic API: 1M context window (Claude Opus 4.8 docs, May 2026)
    contextWindow: 1_000_000,
    hasThinking: true,
    tier: "prime",
    description: "Frontier Opus — coding, agents, long-horizon work",
  },
  {
    key: "claude-opus-4.7",
    label: "Claude Opus 4.7",
    shortLabel: "Opus 4.7",
    provider: "anthropic",
    providerLabel: "Anthropic",
    modelId: "claude-opus-4-7",
    // Anthropic API: 1M context window (Claude Opus 4.7 docs, Apr 2026)
    contextWindow: 1_000_000,
    hasThinking: true,
    tier: "prime",
    description: "Deep reasoning and agents",
  },
  {
    key: "claude-fable-5",
    label: "Claude Fable 5",
    shortLabel: "Fable 5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    modelId: "claude-fable-5",
    // Anthropic API: 1M context, adaptive thinking (Claude Fable 5 docs, Jun 2026)
    contextWindow: 1_000_000,
    hasThinking: true,
    tier: "prime",
    description: "Mythos-class — long-horizon agentic work",
    envModelIdKey: "ANTHROPIC_FABLE_MODEL_ID",
  },
  {
    key: "gpt-5.5",
    label: "GPT-5.5",
    shortLabel: "GPT-5.5",
    provider: "openai",
    providerLabel: "OpenAI",
    modelId: "gpt-5.5",
    // OpenAI API model page: 1,050,000 context window (gpt-5.5, Apr 2026)
    contextWindow: 1_050_000,
    hasThinking: true,
    tier: "prime",
    description: "OpenAI frontier",
    envModelIdKey: "OPENAI_GPT55_MODEL_ID",
  },
] as const satisfies readonly ChatModelCatalogEntry[];

export type ChatModelKey = (typeof CHAT_MODEL_CATALOG)[number]["key"];

export const DEFAULT_CHAT_MODEL = "gemini-3.5-flash" as const;
export const DEFAULT_IMAGE_CHAT_MODEL = "gemini-3.5-flash" as const;
export const DEFAULT_OPENAI_IMAGE_CHAT_MODEL = "gpt-5.5" as const;

/** Background / batch jobs only — not shown in the chat model picker. */
export const BACKGROUND_GEMINI_FLASH_LITE_MODEL_ID = "gemini-3.1-flash-lite-preview";

/** Maps saved sessions that still reference retired picker models. */
const LEGACY_CHAT_MODEL_KEYS: Record<string, ChatModelKey> = {
  "gemini-3.1-pro": "gemini-3.5-flash",
  "gemini-3.1-flash-lite": "gemini-3.5-flash",
  "claude-opus-4.6": "claude-opus-4.8",
  "claude-opus-4.7": "claude-opus-4.8",
  "claude-sonnet-4.6": "claude-sonnet-5",
  "gpt-5.4": "gpt-5.5",
  "gpt-5.3-instant": "gpt-5.5",
};

export const CHAT_MODELS = CHAT_MODEL_CATALOG.map((model) => ({
  key: model.key,
  label: model.label,
  provider: model.provider,
  tier: model.tier,
}));

export const CHAT_MODEL_KEYS = CHAT_MODEL_CATALOG.map((model) => model.key) as ChatModelKey[];

export const MODEL_CONTEXT_LIMITS = Object.fromEntries(
  CHAT_MODEL_CATALOG.map((model) => [model.key, model.contextWindow]),
) as Record<ChatModelKey, number>;

export function isChatModelKey(value: unknown): value is ChatModelKey {
  return typeof value === "string" && CHAT_MODEL_CATALOG.some((model) => model.key === value);
}

export function normalizeChatModelKey(value: unknown): ChatModelKey {
  if (isChatModelKey(value)) return value;
  if (typeof value === "string" && value in LEGACY_CHAT_MODEL_KEYS) {
    return LEGACY_CHAT_MODEL_KEYS[value];
  }
  return DEFAULT_CHAT_MODEL;
}

export function getChatModelEntry(key: ChatModelKey): ChatModelCatalogEntry {
  return CHAT_MODEL_CATALOG.find((model) => model.key === key) ?? CHAT_MODEL_CATALOG[0];
}

/** Context budget for UI meters (Hourglass ctx %, Soul popover, legacy chat). */
export function getModelContextLimit(key: ChatModelKey): number {
  return getChatModelEntry(key).contextWindow;
}

export function resolveChatModelId(
  entry: ChatModelCatalogEntry,
  env: Record<string, string | undefined>,
): string {
  return entry.envModelIdKey ? env[entry.envModelIdKey] || entry.modelId : entry.modelId;
}
