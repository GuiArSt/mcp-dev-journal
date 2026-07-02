import type { SoulConfigState } from "@/components/chat/SoulConfig";

/** Stats from GET /api/kronus/stats — counts + token estimates per soul section. */
export interface KronusContextStats {
  writings: number;
  writingsTokens: number;
  portfolioProjects: number;
  portfolioProjectsTokens: number;
  skills: number;
  skillsTokens: number;
  workExperience: number;
  workExperienceTokens: number;
  education: number;
  educationTokens: number;
  journalEntries: number;
  journalEntriesTokens: number;
  chatIndex: number;
  chatIndexTokens: number;
  chatIndexIncluded?: number;
  chatIndexMissingSummaries?: number;
  sliteNotes?: number;
  sliteNotesTokens?: number;
  notionPages?: number;
  notionPagesTokens?: number;
  slackConversations?: number;
  slackConversationsTokens?: number;
  linear?: {
    projects: {
      total: number;
      active: number;
      completed: number;
      tokensActive: number;
      tokensAll: number;
      /** Tokens when injected by Kronus (excludes canceled; includes completed). */
      tokensKronus?: number;
    };
    issues: {
      total: number;
      active: number;
      completed: number;
      tokensActive: number;
      tokensAll: number;
      tokensKronus?: number;
    };
  };
  linearProjects: number;
  linearProjectsTokens: number;
  linearIssues: number;
  linearIssuesTokens: number;
  baseTokens: number;
  totalTokens: number;
  totalTokensWithCompleted?: number;
  totalTokensActive?: number;
}

export type SoulContextSectionKey = Exclude<keyof SoulConfigState, "linearIncludeCompleted">;

export const SOUL_CONTEXT_SECTIONS: Array<{
  key: SoulContextSectionKey;
  countKey: keyof KronusContextStats;
  tokensKey: keyof KronusContextStats;
}> = [
  { key: "writings", countKey: "writings", tokensKey: "writingsTokens" },
  { key: "portfolioProjects", countKey: "portfolioProjects", tokensKey: "portfolioProjectsTokens" },
  { key: "skills", countKey: "skills", tokensKey: "skillsTokens" },
  { key: "workExperience", countKey: "workExperience", tokensKey: "workExperienceTokens" },
  { key: "education", countKey: "education", tokensKey: "educationTokens" },
  { key: "journalEntries", countKey: "journalEntries", tokensKey: "journalEntriesTokens" },
  { key: "chatIndex", countKey: "chatIndex", tokensKey: "chatIndexTokens" },
  { key: "linearProjects", countKey: "linearProjects", tokensKey: "linearProjectsTokens" },
  { key: "linearIssues", countKey: "linearIssues", tokensKey: "linearIssuesTokens" },
  { key: "sliteNotes", countKey: "sliteNotes", tokensKey: "sliteNotesTokens" },
  { key: "notionPages", countKey: "notionPages", tokensKey: "notionPagesTokens" },
  { key: "slackConversations", countKey: "slackConversations", tokensKey: "slackConversationsTokens" },
];

const SECTION_LOOKUP = Object.fromEntries(
  SOUL_CONTEXT_SECTIONS.map((s) => [s.key, s]),
) as Record<SoulContextSectionKey, (typeof SOUL_CONTEXT_SECTIONS)[number]>;

/** Manual toggles OR skill-implied sections (matches server effective soul). */
export function mergeEffectiveSoulConfig(
  manual: SoulConfigState,
  implied?: Partial<SoulConfigState>,
): SoulConfigState {
  const out = { ...manual };
  if (!implied) return out;
  for (const section of SOUL_CONTEXT_SECTIONS) {
    if (implied[section.key]) out[section.key] = true;
  }
  return out;
}

export function getLinearSectionTokens(
  key: "linearProjects" | "linearIssues",
  stats: KronusContextStats,
  includeCompleted: boolean,
): number {
  const breakdown =
    key === "linearProjects" ? stats.linear?.projects : stats.linear?.issues;
  if (breakdown) {
    if (includeCompleted) return breakdown.tokensAll;
    return breakdown.tokensKronus ?? breakdown.tokensActive;
  }
  return key === "linearProjects" ? stats.linearProjectsTokens : stats.linearIssuesTokens;
}

export function getSoulSectionCountAndTokens(
  key: SoulContextSectionKey,
  stats: KronusContextStats,
  config: SoulConfigState,
): { count: number; tokens: number } {
  const meta = SECTION_LOOKUP[key];
  const count = Number(stats[meta.countKey] ?? 0);
  let tokens = Number(stats[meta.tokensKey] ?? 0);
  if (key === "linearProjects" || key === "linearIssues") {
    tokens = getLinearSectionTokens(key, stats, config.linearIncludeCompleted);
  }
  return { count, tokens };
}

/** Estimated repository + base prompt tokens for the effective soul config. */
export function estimateSoulContextTokens(
  manual: SoulConfigState,
  stats: KronusContextStats,
  implied?: Partial<SoulConfigState>,
): number {
  const effective = mergeEffectiveSoulConfig(manual, implied);
  let total = stats.baseTokens;
  for (const section of SOUL_CONTEXT_SECTIONS) {
    if (!effective[section.key]) continue;
    total += getSoulSectionCountAndTokens(section.key, stats, effective).tokens;
  }
  return total;
}

export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function formatTokenLabel(value: number): string {
  return `~${formatTokenCount(value)}`;
}
