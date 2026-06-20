/**
 * Kronus chat UI snapshot — persisted per conversation so reopening restores
 * model, repository context (soul), tools, skills, typography, and lock state.
 *
 * Stored as JSON in `chat_conversations.session_config` (see db-conversations).
 */

import type { SoulConfigState } from "@/components/chat/SoulConfig";
import { DEFAULT_CONFIG as DEFAULT_SOUL_CONFIG } from "@/components/chat/SoulConfig";
import type { ToolsConfigState } from "@/components/chat/ToolsConfig";
import { DEFAULT_CONFIG as DEFAULT_TOOLS_CONFIG } from "@/components/chat/ToolsConfig";
import type { ModelConfigState, ModelSelection } from "@/components/chat/ModelConfig";
import { DEFAULT_CONFIG as DEFAULT_MODEL_CONFIG } from "@/components/chat/ModelConfig";
import type { FormatConfigState } from "@/components/chat/FormatConfig";
import { DEFAULT_FORMAT_CONFIG } from "@/components/chat/FormatConfig";
import { normalizeChatModelKey } from "@/lib/ai/model-catalog";

export const CHAT_SESSION_SNAPSHOT_VERSION = 1 as const;

export interface ChatSessionSnapshotV1 {
  v: typeof CHAT_SESSION_SNAPSHOT_VERSION;
  soulConfig: SoulConfigState;
  toolsConfig: ToolsConfigState;
  modelConfig: ModelConfigState;
  formatConfig: FormatConfigState;
  activeSkillSlugs: string[];
  lockedSoulConfig: SoulConfigState | null;
  isManualOverride: boolean;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mergeSoul(partial: unknown): SoulConfigState {
  if (!isPlainObject(partial)) return { ...DEFAULT_SOUL_CONFIG };
  return { ...DEFAULT_SOUL_CONFIG, ...partial } as SoulConfigState;
}

function mergeTools(partial: unknown): ToolsConfigState {
  if (!isPlainObject(partial)) return { ...DEFAULT_TOOLS_CONFIG };
  return { ...DEFAULT_TOOLS_CONFIG, ...partial } as ToolsConfigState;
}

function mergeModel(partial: unknown): ModelConfigState {
  if (!isPlainObject(partial)) return { ...DEFAULT_MODEL_CONFIG };
  const model = normalizeChatModelKey(partial.model) as ModelSelection;
  const reasoningEnabled =
    typeof partial.reasoningEnabled === "boolean"
      ? partial.reasoningEnabled
      : DEFAULT_MODEL_CONFIG.reasoningEnabled;
  return { model, reasoningEnabled };
}

function mergeFormat(partial: unknown): FormatConfigState {
  if (!isPlainObject(partial)) return { ...DEFAULT_FORMAT_CONFIG };
  return { ...DEFAULT_FORMAT_CONFIG, ...partial } as FormatConfigState;
}

/** Plain object for API body `sessionConfig` (server stores JSON.stringify in DB). */
export function toChatSessionSnapshot(args: {
  soulConfig: SoulConfigState;
  toolsConfig: ToolsConfigState;
  modelConfig: ModelConfigState;
  formatConfig: FormatConfigState;
  activeSkillSlugs: string[];
  lockedSoulConfig: SoulConfigState | null;
  isManualOverride: boolean;
}): ChatSessionSnapshotV1 {
  return {
    v: CHAT_SESSION_SNAPSHOT_VERSION,
    soulConfig: args.soulConfig,
    toolsConfig: args.toolsConfig,
    modelConfig: args.modelConfig,
    formatConfig: args.formatConfig,
    activeSkillSlugs: [...args.activeSkillSlugs],
    lockedSoulConfig: args.lockedSoulConfig,
    isManualOverride: args.isManualOverride,
  };
}

/** JSON string for DB column `session_config` (if writing SQL directly). */
export function buildChatSessionSnapshot(args: Parameters<typeof toChatSessionSnapshot>[0]): string {
  return JSON.stringify(toChatSessionSnapshot(args));
}

/** Parse DB JSON; returns merged UI state, or null if missing/invalid. */
export function parseChatSessionSnapshot(raw: string | null | undefined): {
  soulConfig: SoulConfigState;
  toolsConfig: ToolsConfigState;
  modelConfig: ModelConfigState;
  formatConfig: FormatConfigState;
  activeSkillSlugs: string[];
  lockedSoulConfig: SoulConfigState | null;
  isManualOverride: boolean;
} | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    const soulConfig = mergeSoul(parsed.soulConfig);
    const toolsConfig = mergeTools(parsed.toolsConfig);
    const modelConfig = mergeModel(parsed.modelConfig);
    const formatConfig = mergeFormat(parsed.formatConfig);
    const activeSkillSlugs = Array.isArray(parsed.activeSkillSlugs)
      ? parsed.activeSkillSlugs.filter((s): s is string => typeof s === "string")
      : [];
    let lockedSoulConfig: SoulConfigState | null = null;
    if ("lockedSoulConfig" in parsed) {
      if (parsed.lockedSoulConfig === null) lockedSoulConfig = null;
      else if (isPlainObject(parsed.lockedSoulConfig)) {
        lockedSoulConfig = mergeSoul(parsed.lockedSoulConfig);
      }
    }
    const isManualOverride = parsed.isManualOverride === true;
    return {
      soulConfig,
      toolsConfig,
      modelConfig,
      formatConfig,
      activeSkillSlugs,
      lockedSoulConfig,
      isManualOverride,
    };
  } catch {
    return null;
  }
}
