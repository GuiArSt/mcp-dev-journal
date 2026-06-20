import { describe, it, expect } from "vitest";
import { computeHourglassContextMeter } from "@/lib/hourglass-context-meter";
import { LEAN_SOUL_CONFIG } from "@/lib/ai/skills";
import type { KronusContextStats } from "@/lib/kronus-context-stats";

const baseStats: KronusContextStats = {
  writings: 0,
  writingsTokens: 0,
  portfolioProjects: 0,
  portfolioProjectsTokens: 0,
  skills: 0,
  skillsTokens: 0,
  workExperience: 0,
  workExperienceTokens: 0,
  education: 0,
  educationTokens: 0,
  journalEntries: 0,
  journalEntriesTokens: 0,
  chatIndex: 0,
  chatIndexTokens: 0,
  linearProjects: 0,
  linearProjectsTokens: 0,
  linearIssues: 0,
  linearIssuesTokens: 0,
  baseTokens: 6000,
  totalTokens: 6000,
};

describe("computeHourglassContextMeter", () => {
  it("includes lite index when no skill is active", () => {
    const m = computeHourglassContextMeter({
      contextLimit: 1_000_000,
      contextStats: baseStats,
      liteIndexTokens: 46_000,
      soulConfig: LEAN_SOUL_CONFIG,
      activeSkillSlugs: [],
      activeSkillBodyTokens: 0,
      conversationText: "hello world",
    });
    expect(m.liteTokens).toBe(46_000);
    expect(m.skillBodyTokens).toBe(0);
    expect(m.soulTokens).toBe(6000);
    expect(m.totalTokens).toBeGreaterThan(46_000);
  });

  it("uses skill bodies instead of lite when a skill is active", () => {
    const m = computeHourglassContextMeter({
      contextLimit: 1_000_000,
      contextStats: baseStats,
      liteIndexTokens: 46_000,
      soulConfig: LEAN_SOUL_CONFIG,
      activeSkillSlugs: ["developer"],
      activeSkillBodyTokens: 12_000,
      conversationText: "",
    });
    expect(m.liteTokens).toBe(0);
    expect(m.skillBodyTokens).toBe(12_000);
  });

  it("scales percent against the selected model context limit", () => {
    const input = {
      contextStats: baseStats,
      liteIndexTokens: 0,
      soulConfig: LEAN_SOUL_CONFIG,
      impliedSoul: undefined,
      activeSkillSlugs: [] as string[],
      activeSkillBodyTokens: 0,
      conversationText: "x".repeat(4000),
    };
    const on1M = computeHourglassContextMeter({ ...input, contextLimit: 1_000_000 });
    const on200k = computeHourglassContextMeter({ ...input, contextLimit: 200_000 });
    expect(on200k.percent).toBeGreaterThan(on1M.percent);
  });
});
