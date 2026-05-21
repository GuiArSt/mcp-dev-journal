export type AiProviderKey = "anthropic" | "google" | "openai" | "deepseek" | "nebius";

export type ModelTier = "prime" | "standard" | "background";

export interface ChatModelCatalogEntry {
  key: string;
  label: string;
  shortLabel: string;
  provider: AiProviderKey;
  providerLabel: string;
  modelId: string;
  contextWindow: number;
  hasThinking: boolean;
  tier: ModelTier;
  description: string;
  envModelIdKey?: string;
}

export const DEFAULT_CHAT_MODEL = "gemini-3.5-flash" as const;
export const DEFAULT_IMAGE_CHAT_MODEL = "gemini-3.5-flash" as const;
export const DEFAULT_OPENAI_IMAGE_CHAT_MODEL = "gpt-5.5" as const;
export const DEFAULT_GOOGLE_FALLBACK_MODEL = "gemini-3.1-flash-lite" as const;

export const CHAT_MODEL_CATALOG = [
  {
    key: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    shortLabel: "3.5 Flash",
    provider: "google",
    providerLabel: "Google",
    modelId: "gemini-3.5-flash",
    contextWindow: 1_000_000,
    hasThinking: true,
    tier: "standard",
    description: "Agentic Flash default",
  },
  {
    key: "gemini-3.1-pro",
    label: "Gemini 3.1 Pro",
    shortLabel: "3.1 Pro",
    provider: "google",
    providerLabel: "Google",
    modelId: "gemini-3.1-pro-preview",
    contextWindow: 1_000_000,
    hasThinking: true,
    tier: "prime",
    description: "Previous Gemini Pro lane",
  },
  {
    key: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    shortLabel: "Flash-Lite",
    provider: "google",
    providerLabel: "Google",
    modelId: "gemini-3.1-flash-lite-preview",
    contextWindow: 1_000_000,
    hasThinking: false,
    tier: "background",
    description: "Fast background work",
  },
  {
    key: "claude-opus-4.7",
    label: "Claude Opus 4.7",
    shortLabel: "Opus 4.7",
    provider: "anthropic",
    providerLabel: "Anthropic",
    modelId: "claude-opus-4-7",
    contextWindow: 1_000_000,
    hasThinking: true,
    tier: "prime",
    description: "Latest Opus lane",
  },
  {
    key: "claude-opus-4.6",
    label: "Claude Opus 4.6",
    shortLabel: "Opus 4.6",
    provider: "anthropic",
    providerLabel: "Anthropic",
    modelId: "claude-opus-4-6",
    contextWindow: 1_000_000,
    hasThinking: true,
    tier: "prime",
    description: "Stable Opus lane",
  },
  {
    key: "claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    shortLabel: "Sonnet 4.6",
    provider: "anthropic",
    providerLabel: "Anthropic",
    modelId: "claude-sonnet-4-6",
    contextWindow: 1_000_000,
    hasThinking: true,
    tier: "standard",
    description: "Best value Claude lane",
  },
  {
    key: "gpt-5.5",
    label: "GPT-5.5",
    shortLabel: "GPT-5.5",
    provider: "openai",
    providerLabel: "OpenAI",
    modelId: "gpt-5.5",
    contextWindow: 1_000_000,
    hasThinking: true,
    tier: "prime",
    description: "OpenAI latest lane",
    envModelIdKey: "OPENAI_GPT55_MODEL_ID",
  },
  {
    key: "gpt-5.4",
    label: "GPT-5.4",
    shortLabel: "GPT-5.4",
    provider: "openai",
    providerLabel: "OpenAI",
    modelId: "gpt-5.4",
    contextWindow: 1_000_000,
    hasThinking: true,
    tier: "prime",
    description: "OpenAI flagship lane",
  },
  {
    key: "gpt-5.3-instant",
    label: "GPT-5.3 Instant",
    shortLabel: "5.3 Instant",
    provider: "openai",
    providerLabel: "OpenAI",
    modelId: "gpt-5.3-instant",
    contextWindow: 200_000,
    hasThinking: false,
    tier: "standard",
    description: "Fast OpenAI chat",
  },
] as const satisfies readonly ChatModelCatalogEntry[];

export type ChatModelKey = (typeof CHAT_MODEL_CATALOG)[number]["key"];

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

export function getChatModelEntry(key: ChatModelKey): ChatModelCatalogEntry {
  return CHAT_MODEL_CATALOG.find((model) => model.key === key) ?? CHAT_MODEL_CATALOG[0];
}

export function resolveChatModelId(
  entry: ChatModelCatalogEntry,
  env: Record<string, string | undefined>,
): string {
  return entry.envModelIdKey ? env[entry.envModelIdKey] || entry.modelId : entry.modelId;
}
