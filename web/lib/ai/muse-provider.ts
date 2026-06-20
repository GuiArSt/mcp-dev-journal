/**
 * Shared Muse provider / painter model wiring for muse routes and painters.
 */

export type PaintModel = "nano-banana-pro" | "nano-banana-2" | "gpt-image-2";

/** Retired alias — maps to Nano Banana 2 (gemini-3.1-flash-image-preview). */
const LEGACY_PAINT_MODELS: Record<string, PaintModel> = {
  "nano-banana": "nano-banana-2",
  "gemini-2.5-flash-image": "nano-banana-2",
};

export function normalizePaintModel(value: string | undefined | null): PaintModel {
  if (!value) return "gpt-image-2";
  if (value === "nano-banana-pro" || value === "nano-banana-2" || value === "gpt-image-2") {
    return value;
  }
  return LEGACY_PAINT_MODELS[value] ?? "gpt-image-2";
}

export type MuseProvider = "openai" | "google";

/** Text model for muse propose / generate-prompt (not the image painter). */
export const MUSE_OPENAI_DRIVER_DEFAULT = process.env.OPENAI_GPT55_MODEL_ID || "gpt-5.5";
/** Widely available on Gemini API keys; 3.5 Flash may not be enabled on all keys yet. */
export const MUSE_GOOGLE_DRIVER_DEFAULT = "gemini-2.5-flash";

const PROVIDER_PAIRS_FALLBACK: Record<
  MuseProvider,
  { driverModel: string; painterModel: PaintModel; driverSdk: "openai" | "google" }
> = {
  openai: {
    driverModel: MUSE_OPENAI_DRIVER_DEFAULT,
    painterModel: "gpt-image-2",
    driverSdk: "openai",
  },
  google: {
    driverModel: MUSE_GOOGLE_DRIVER_DEFAULT,
    painterModel: "nano-banana-2",
    driverSdk: "google",
  },
};

/** Keep driver text models on the same provider as the SDK (no Gemini ids on OpenAI). */
export function driverModelForProvider(provider: MuseProvider, configured?: string | null): string {
  const fallback = PROVIDER_PAIRS_FALLBACK[provider].driverModel;
  const candidate = configured?.trim() || fallback;
  if (provider === "google") {
    return candidate.startsWith("gemini-") ? candidate : fallback;
  }
  return candidate.startsWith("gemini-") ? fallback : candidate;
}

export function painterForImagesProvider(provider: MuseProvider): PaintModel {
  return provider === "google" ? "nano-banana-2" : "gpt-image-2";
}

export function getProviderPair(
  provider: MuseProvider,
  cfg: { driverModel: string; painterModel: string },
): { driverModel: string; painterModel: PaintModel; driverSdk: "openai" | "google" } {
  const fallback = PROVIDER_PAIRS_FALLBACK[provider];
  return {
    driverModel: driverModelForProvider(provider, cfg.driverModel),
    painterModel: normalizePaintModel(cfg.painterModel) || fallback.painterModel,
    driverSdk: provider,
  };
}
