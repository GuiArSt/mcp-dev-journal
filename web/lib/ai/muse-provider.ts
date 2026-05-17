/**
 * Shared Muse provider / painter model wiring for muse routes and painters.
 */

export type PaintModel =
  | "nano-banana-pro"
  | "nano-banana-2"
  | "nano-banana"
  | "gpt-image-2";

export type MuseProvider = "openai" | "google";

const PROVIDER_PAIRS_FALLBACK: Record<
  MuseProvider,
  { driverModel: string; painterModel: PaintModel; driverSdk: "openai" | "google" }
> = {
  openai: {
    driverModel: process.env.OPENAI_GPT55_MODEL_ID || "gpt-5.4",
    painterModel: "gpt-image-2",
    driverSdk: "openai",
  },
  google: { driverModel: "gemini-3.1-pro-preview", painterModel: "nano-banana-2", driverSdk: "google" },
};

export function getProviderPair(
  provider: MuseProvider,
  cfg: { driverModel: string; painterModel: string },
): { driverModel: string; painterModel: PaintModel; driverSdk: "openai" | "google" } {
  const fallback = PROVIDER_PAIRS_FALLBACK[provider];
  return {
    driverModel: cfg.driverModel || fallback.driverModel,
    painterModel: (cfg.painterModel as PaintModel) || fallback.painterModel,
    driverSdk: provider,
  };
}
