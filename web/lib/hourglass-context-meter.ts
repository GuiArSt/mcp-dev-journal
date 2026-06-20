import type { SoulConfigState } from "@/components/chat/SoulConfig";
import { estimateTokens } from "@/lib/chat-text-cleaner";
import {
  estimateSoulContextTokens,
  type KronusContextStats,
} from "@/lib/kronus-context-stats";

export interface HourglassContextMeterInput {
  contextLimit: number;
  contextStats: KronusContextStats | null;
  liteIndexTokens: number;
  soulConfig: SoulConfigState;
  impliedSoul?: Partial<SoulConfigState>;
  activeSkillSlugs: string[];
  activeSkillBodyTokens: number;
  conversationText: string;
}

/** Compact label for the composer chip (e.g. 73k, 1.0M). */
export function formatContextTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

export interface HourglassContextMeter {
  soulTokens: number;
  liteTokens: number;
  skillBodyTokens: number;
  conversationTokens: number;
  totalTokens: number;
  contextLimit: number;
  percent: number;
}

/**
 * Mirrors what /api/chat injects into the system prompt (estimate):
 * base + enabled soul sections + Lite index (no skill) + skill bodies + transcript.
 */
export function computeHourglassContextMeter(
  input: HourglassContextMeterInput,
): HourglassContextMeter {
  const soulTokens = input.contextStats
    ? estimateSoulContextTokens(input.soulConfig, input.contextStats, input.impliedSoul)
    : 0;
  const liteTokens =
    input.activeSkillSlugs.length === 0 ? Math.max(0, input.liteIndexTokens) : 0;
  const skillBodyTokens =
    input.activeSkillSlugs.length > 0 ? Math.max(0, input.activeSkillBodyTokens) : 0;
  const conversationTokens = estimateTokens(input.conversationText);
  const totalTokens = soulTokens + liteTokens + skillBodyTokens + conversationTokens;
  const percent = Math.min(
    99,
    input.contextLimit > 0 ? Math.round((totalTokens / input.contextLimit) * 100) : 0,
  );

  return {
    soulTokens,
    liteTokens,
    skillBodyTokens,
    conversationTokens,
    totalTokens,
    contextLimit: input.contextLimit,
    percent,
  };
}
