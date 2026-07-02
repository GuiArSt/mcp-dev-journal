/**
 * Kronus Skills — On-Demand Context Loading
 *
 * Skills are prompts that declare their context dependencies (soul sections + tools).
 * Kronus starts in Lite mode (all summaries, no full bodies), loads full context when a skill is activated.
 * Skills are additive: activating multiple skills OR-merges their configs.
 *
 * Storage: documents table with type="prompt" and metadata.type="kronus-skill"
 */

import type { SoulConfigState } from "@/components/chat/SoulConfig";
import type { ToolsConfigState } from "@/components/chat/ToolsConfig";

// ============================================================================
// TYPES
// ============================================================================

/** Skill configuration stored in document metadata.skillConfig */
export interface SkillConfig {
  soul: Partial<SoulConfigState>;
  tools: Partial<ToolsConfigState>;
  icon?: string;
  color?: string;
  priority?: number;
}

/** A resolved skill ready for use */
export interface KronusSkill {
  id: number;
  slug: string;
  title: string;
  description: string;
  content: string;
  config: SkillConfig;
  icon: string;
  color: string;
  priority: number;
}

/** Lightweight skill info for the UI (no full content) */
export interface SkillInfo {
  id: number;
  slug: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  priority: number;
  config: SkillConfig;
}

// ============================================================================
// LEAN BASELINE CONFIGS
// ============================================================================

/** Kronus Lite soul config — no full sections (summaries index injected separately) */
export const LEAN_SOUL_CONFIG: SoulConfigState = {
  writings: false,
  portfolioProjects: false,
  skills: false,
  workExperience: false,
  education: false,
  journalEntries: false,
  chatIndex: false,
  linearProjects: false,
  linearIssues: false,
  linearIncludeCompleted: false,
  sliteNotes: false,
  notionPages: false,
  slackConversations: false,
};

/** Lean baseline tools config — only journal + repository for basic functionality */
export const LEAN_TOOLS_CONFIG: ToolsConfigState = {
  journal: true,
  repository: true,
  cursorDelegate: false,
  linear: false,
  git: false,
  media: false,
  imageGeneration: false,
  webSearch: false,
  slite: false,
  notion: false,
  slack: false,
  google: false,
  memory: false,
  aiIntegrations: false,
};

/** All soul sections enabled */
export const ALL_SOUL_CONFIG: SoulConfigState = {
  writings: true,
  portfolioProjects: true,
  skills: true,
  workExperience: true,
  education: true,
  journalEntries: true,
  chatIndex: true,
  linearProjects: true,
  linearIssues: true,
  linearIncludeCompleted: false,
  sliteNotes: true,
  notionPages: true,
  slackConversations: true,
};

/** All tools enabled */
export const ALL_TOOLS_CONFIG: ToolsConfigState = {
  journal: true,
  repository: true,
  cursorDelegate: true,
  linear: true,
  git: true,
  media: true,
  imageGeneration: true,
  webSearch: true,
  slite: true,
  notion: true,
  slack: true,
  google: true,
  memory: true,
  aiIntegrations: true,
};

// ============================================================================
// MERGE LOGIC
// ============================================================================

/**
 * Merge multiple skill configs into effective soul + tools configs.
 * Purely additive OR-merge: if ANY skill wants a section/tool, it's enabled.
 * No conflicts possible — skills only add, never subtract.
 */
export function mergeSkillConfigs(skills: KronusSkill[]): {
  soul: SoulConfigState;
  tools: ToolsConfigState;
} {
  const soul: SoulConfigState = { ...LEAN_SOUL_CONFIG };
  const tools: ToolsConfigState = { ...LEAN_TOOLS_CONFIG };

  for (const skill of skills) {
    // Merge soul: OR logic
    for (const [key, value] of Object.entries(skill.config.soul)) {
      if (value === true) {
        (soul as unknown as Record<string, boolean>)[key] = true;
      }
    }
    // Merge tools: OR logic
    for (const [key, value] of Object.entries(skill.config.tools)) {
      if (value === true) {
        (tools as unknown as Record<string, boolean>)[key] = true;
      }
    }
  }

  return { soul, tools };
}

/**
 * Build the additional system prompt section from active skills.
 * This text gets appended to the lean baseline prompt.
 */
export function buildSkillPromptSection(skills: KronusSkill[]): string {
  if (skills.length === 0) return "";

  const sections = skills.map(
    (s) => `### Active Skill: ${s.title}\n${s.content}`
  );

  return `\n\n## Active Skills\n\nThe following skills are currently active, shaping your focus and capabilities:\n\n${sections.join("\n\n---\n\n")}`;
}

// ============================================================================
// STATE DETECTION
// ============================================================================

/**
 * Check if two soul configs are equal
 */
export function soulConfigsEqual(a: SoulConfigState, b: SoulConfigState): boolean {
  return (
    a.writings === b.writings &&
    a.portfolioProjects === b.portfolioProjects &&
    a.skills === b.skills &&
    a.workExperience === b.workExperience &&
    a.education === b.education &&
    a.journalEntries === b.journalEntries &&
    a.chatIndex === b.chatIndex &&
    a.linearProjects === b.linearProjects &&
    a.linearIssues === b.linearIssues &&
    a.linearIncludeCompleted === b.linearIncludeCompleted &&
    a.sliteNotes === b.sliteNotes &&
    a.notionPages === b.notionPages &&
    a.slackConversations === b.slackConversations
  );
}

/**
 * Check if two tools configs are equal
 */
export function toolsConfigsEqual(a: ToolsConfigState, b: ToolsConfigState): boolean {
  return (
    a.journal === b.journal &&
    a.repository === b.repository &&
    a.cursorDelegate === b.cursorDelegate &&
    a.linear === b.linear &&
    a.git === b.git &&
    a.media === b.media &&
    a.imageGeneration === b.imageGeneration &&
    a.webSearch === b.webSearch &&
    a.slite === b.slite &&
    a.notion === b.notion &&
    a.slack === b.slack &&
    a.google === b.google &&
    a.memory === b.memory &&
    a.aiIntegrations === b.aiIntegrations
  );
}

/**
 * Check if the current config matches "everything on" (Almighty).
 * Used to detect: if manual override results in all-on, show Almighty not Custom.
 */
export function isAlmightyConfig(soul: SoulConfigState, tools: ToolsConfigState): boolean {
  const allSoul =
    soul.writings &&
    soul.portfolioProjects &&
    soul.skills &&
    soul.workExperience &&
    soul.education &&
    soul.journalEntries &&
    soul.chatIndex &&
    soul.linearProjects &&
    soul.linearIssues &&
    soul.sliteNotes &&
    soul.notionPages &&
    soul.slackConversations;

  const allTools =
    tools.journal &&
    tools.repository &&
    tools.cursorDelegate &&
    tools.linear &&
    tools.git &&
    tools.media &&
    tools.imageGeneration &&
    tools.webSearch &&
    tools.slite &&
    tools.notion &&
    tools.slack &&
    tools.google &&
    tools.memory &&
    tools.aiIntegrations;

  return !!allSoul && !!allTools;
}
