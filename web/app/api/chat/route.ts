import { streamText, convertToModelMessages, type ModelMessage } from "ai";
import { openAISpan, closeAISpan } from "@/lib/observability";
import { anthropic, type AnthropicProviderOptions } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google, type GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import {
  getKronusSystemPrompt,
  getKronusSystemPromptWithSkills,
  SoulConfig,
  DEFAULT_SOUL_CONFIG,
} from "@/lib/ai/kronus";
import { getDrizzleDb, documents } from "@/lib/db/drizzle";
import { eq } from "drizzle-orm";
import type { KronusSkill, SkillConfig, SkillInfo } from "@/lib/ai/skills";
import { mergeSkillConfigs } from "@/lib/ai/skills";
import { toolSpecs, toolCategories, type ToolName } from "@/lib/ai/tools";
import { getDatabase } from "@/lib/db";
import { lookupByUUID } from "@/lib/object-registry";
import {
  DEFAULT_CHAT_MODEL,
  normalizeChatModelKey,
  getChatModelEntry,
  resolveChatModelId,
  type ChatModelKey,
} from "@/lib/ai/model-catalog";
import {
  normalizeUiMessageParts,
  prepareUiMessagesForInference,
  repairModelMessages,
  repairPartsForModel,
} from "@/lib/chat-message-repair";

/**
 * Compact ref the Hourglass client sends with every message. Denormalized
 * snapshot fields come from chat_conversations.artifact_refs.
 */
interface ShelfRefForPrompt {
  uuid: string;
  kind: string;
  title: string;
  summary?: string;
  turnIndex?: number;
}

function isToolUIPartLike(part: unknown): part is Record<string, any> {
  if (!part || typeof part !== "object") return false;
  const type = (part as { type?: unknown }).type;
  return (
    type === "dynamic-tool" ||
    (typeof type === "string" && type.startsWith("tool-"))
  );
}

function getUIToolName(part: Record<string, any>): string {
  if (typeof part.toolName === "string" && part.toolName.trim()) {
    return part.toolName;
  }
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  return "unknown_tool";
}

function hasGoogleThoughtSignature(part: Record<string, any>): boolean {
  const google =
    part.callProviderMetadata?.google ??
    part.providerMetadata?.google ??
    null;
  const signature = google?.thoughtSignature ?? google?.thought_signature;
  return (
    typeof signature === "string" &&
    signature.trim().length > 0
  );
}

function compactToolValue(value: unknown, max = 1600): string | null {
  if (value == null) return null;
  let raw: string;
  try {
    raw = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    raw = String(value);
  }
  if (!raw) return null;
  return raw.length > max ? `${raw.slice(0, max)}…[truncated]` : raw;
}

function summarizeUnsignedGeminiToolPart(part: Record<string, any>): string | null {
  const toolName = getUIToolName(part);
  const state = typeof part.state === "string" ? part.state : "unknown";
  const lines = [
    `[Tool ${toolName} ${
      state === "output-error"
        ? "failed"
        : state === "output-available"
          ? "completed"
          : "was called"
    }]`,
  ];

  const input = compactToolValue(part.input ?? part.rawInput, 900);
  const output = compactToolValue(part.output, 1800);
  const errorText = compactToolValue(part.errorText, 1200);

  if (input) lines.push(`Input: ${input}`);
  if (output) lines.push(`Output: ${output}`);
  if (errorText) lines.push(`Error: ${errorText}`);

  return lines.length > 1 ? lines.join("\n") : null;
}

/**
 * Gemini requires `thoughtSignature` metadata on every structured historical
 * tool-call. Some existing chats and client-side tool-result continuations can
 * contain unsigned tool parts. Keeping those parts structured makes Gemini
 * reject the entire request, so convert only the unsigned tool events to text.
 */
function repairUnsignedGeminiToolHistory(messages: any[]): { messages: any[]; repaired: number } {
  let repaired = 0;
  const repairedMessages = messages.map((message) => {
    if (message?.role !== "assistant" || !Array.isArray(message.parts)) {
      return message;
    }

    const parts = message.parts.flatMap((part: any) => {
      if (!isToolUIPartLike(part) || hasGoogleThoughtSignature(part)) {
        return [part];
      }
      repaired++;
      const summary = summarizeUnsignedGeminiToolPart(part);
      return summary ? [{ type: "text" as const, text: summary }] : [];
    });

    return { ...message, parts };
  });

  return { messages: repairedMessages, repaired };
}

/**
 * Build the "# Shared Display Shelf" block injected into Kronus's system
 * prompt. The currently-displayed artifact arrives in full; others are
 * one-line refs so the context stays lean.
 */
function buildShelfBlock(
  shelf: ShelfRefForPrompt[] | undefined,
  displayedUuid: string | null | undefined,
): string {
  if (!Array.isArray(shelf) || shelf.length === 0) return "";

  const displayed = displayedUuid ? shelf.find((r) => r.uuid === displayedUuid) : null;
  const others = displayed ? shelf.filter((r) => r.uuid !== displayed.uuid) : shelf;

  const parts: string[] = ["", "", "# Shared Display Shelf"];
  parts.push(
    "",
    `You and the user share a display panel with ${shelf.length} artifact${shelf.length === 1 ? "" : "s"}.`,
    "Only the currently-displayed one is included in full; others are compact refs.",
    "To switch what's displayed, call the `set_artifact` tool with a uuid.",
  );

  if (displayed) {
    parts.push("", "## Currently Displayed (full)");
    const body = serializeDisplayedBody(displayed.uuid);
    parts.push(
      "",
      `**UUID:** \`${displayed.uuid}\``,
      `**Kind:** ${displayed.kind}`,
      `**Title:** ${displayed.title}`,
    );
    if (displayed.turnIndex != null) parts.push(`**Turn:** ${displayed.turnIndex}`);
    if (body) parts.push("", body);
    else if (displayed.summary) parts.push("", displayed.summary);
  }

  if (others.length > 0) {
    parts.push("", `## Other Shelf Refs (${others.length})`);
    for (const r of others) {
      const summary = r.summary ? ` — ${r.summary.slice(0, 120)}` : "";
      const turn = r.turnIndex != null ? ` (turn ${String(r.turnIndex).padStart(2, "0")})` : "";
      parts.push(`- \`${r.uuid}\` · ${r.kind} · *${r.title}*${turn}${summary}`);
    }
  }

  return parts.join("\n");
}

/**
 * Build the "# Chat Log" block — a compact, chronological view of recent
 * events in this conversation (messages, tool calls, shelf adds, muse
 * proposals/paints, session resumes). Helps Kronus see what's actually
 * happened beyond the message transcript.
 */
function buildChatLogBlock(chatLog: unknown[] | undefined, max = 20): string {
  if (!Array.isArray(chatLog) || chatLog.length === 0) return "";
  // Reuse the same serializer the muse uses, just with a Kronus-sized cap.
  // Dynamic import avoids pulling chat-log helpers into edge-only contexts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { serializeForKronus } = require("@/lib/chat-log") as typeof import("@/lib/chat-log");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const block = serializeForKronus(chatLog as any, max);
  if (!block || block === "(empty)") return "";
  return ["", "", "# Chat Log", "", "Recent events in this conversation (oldest → newest, compact):", "", block].join("\n");
}

/**
 * Resolve a UUID to a short serialized body for the system prompt. Keeps
 * things terse — never includes image base64, caps long documents.
 */
function serializeDisplayedBody(uuid: string): string | null {
  const obj = lookupByUUID(uuid);
  if (!obj) return null;
  const db = getDatabase();

  try {
    switch (obj.source_table) {
      case "documents": {
        const row = db
          .prepare(`SELECT type, title, content, summary, metadata FROM documents WHERE slug = ?`)
          .get(obj.source_id) as { type: string; title: string; content: string; summary: string | null; metadata: string | null } | undefined;
        if (!row) return null;
        let tags: string[] = [];
        try {
          const meta = JSON.parse(row.metadata || "{}");
          if (Array.isArray(meta.tags)) tags = meta.tags;
        } catch { /* ignore */ }
        // Poems render as-is (they're short).
        if (row.type === "note" && tags.includes("muse") && tags.includes("poem")) {
          return `*(muse poem)*\n\n${row.content}`;
        }
        // User notes, too.
        if (row.type === "note" && tags.includes("user-note")) {
          return `*(user note)*\n\n${row.content}`;
        }
        // Documents: cap body to 4000 chars so long writings don't flood context.
        const body = row.content.length > 4000 ? `${row.content.slice(0, 4000)}\n\n*[truncated]*` : row.content;
        return `${row.summary ? `_${row.summary}_\n\n` : ""}${body}`;
      }
      case "journal_entries": {
        const row = db
          .prepare(
            `SELECT commit_hash, repository, branch, date, why, what_changed, decisions, technologies, kronus_wisdom, summary
             FROM journal_entries WHERE commit_hash = ?`,
          )
          .get(obj.source_id) as
          | {
              commit_hash: string;
              repository: string;
              branch: string;
              date: string;
              why: string;
              what_changed: string;
              decisions: string;
              technologies: string;
              kronus_wisdom: string | null;
              summary: string | null;
            }
          | undefined;
        if (!row) return null;
        const lines = [
          `*Journal entry \`${row.commit_hash.slice(0, 12)}\` · ${row.repository}/${row.branch} · ${row.date}*`,
          "",
        ];
        if (row.summary) lines.push(`**Summary:** ${row.summary}`, "");
        if (row.why) lines.push(`**Why:** ${row.why.slice(0, 1500)}`, "");
        if (row.what_changed) lines.push(`**What changed:** ${row.what_changed.slice(0, 1500)}`, "");
        if (row.decisions) lines.push(`**Decisions:** ${row.decisions.slice(0, 1500)}`, "");
        if (row.kronus_wisdom) lines.push(`**Kronus wisdom:** ${row.kronus_wisdom.slice(0, 1500)}`);
        return lines.join("\n").trim();
      }
      case "media_assets": {
        const row = db
          .prepare(`SELECT filename, description, prompt, model, tags FROM media_assets WHERE id = ?`)
          .get(Number(obj.source_id)) as
          | { filename: string; description: string | null; prompt: string | null; model: string | null; tags: string | null }
          | undefined;
        if (!row) return null;
        let tags: string[] = [];
        try { if (row.tags) tags = JSON.parse(row.tags); } catch { /* ignore */ }
        const isMuse = tags.includes("muse");
        const lines = [
          `*(${isMuse ? "muse image" : "media"} · ${row.filename})*`,
          "",
        ];
        if (row.prompt) lines.push(`**Prompt:** ${row.prompt}`);
        if (row.description) {
          // Muse descriptions are JSON (reason + companionPoem); render friendly.
          if (isMuse) {
            try {
              const parsed = JSON.parse(row.description) as { reason?: string; companionPoem?: { title: string; lines: string[] } };
              if (parsed.reason) lines.push(`**Reason:** ${parsed.reason}`);
              if (parsed.companionPoem) {
                lines.push(`**Companion poem "${parsed.companionPoem.title}":**`);
                for (const ln of parsed.companionPoem.lines) lines.push(`  > ${ln}`);
              }
            } catch {
              lines.push(`**Description:** ${row.description}`);
            }
          } else {
            lines.push(`**Description:** ${row.description}`);
          }
        }
        if (row.model) lines.push(`**Painted with:** ${row.model}`);
        lines.push(`*(image bytes omitted — call \`get_media\` with id ${obj.source_id} if you need them)*`);
        return lines.join("\n").trim();
      }
      case "project_summaries":
      case "repository_overviews": {
        const row = db
          .prepare(
            `SELECT repository, summary, purpose, architecture, tech_stack, status
             FROM repository_overviews WHERE repository = ?`,
          )
          .get(obj.source_id) as
          | { repository: string; summary: string | null; purpose: string | null; architecture: string | null; tech_stack: string | null; status: string | null }
          | undefined;
        if (!row) return null;
        const lines = [`*Repository overview · ${row.repository}${row.status ? ` · ${row.status}` : ""}*`, ""];
        if (row.summary) lines.push(`**Summary:** ${row.summary}`);
        if (row.purpose) lines.push(`**Purpose:** ${row.purpose.slice(0, 1500)}`);
        if (row.architecture) lines.push(`**Architecture:** ${row.architecture.slice(0, 1500)}`);
        if (row.tech_stack) lines.push(`**Tech stack:** ${row.tech_stack.slice(0, 800)}`);
        return lines.join("\n").trim();
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}


/**
 * Tool configuration - controls which tool categories are enabled
 */
export interface ToolsConfig {
  // Core tools (always conceptually available, but can be toggled)
  journal: boolean; // Journal entries, project summaries
  repository: boolean; // Documents, skills, experience, education
  cursorDelegate: boolean; // Cursor local agent on registered git roots (CURSOR_API_KEY)
  linear: boolean; // Linear issue tracking
  slite: boolean; // Slite knowledge base
  notion: boolean; // Notion workspace pages
  git: boolean; // Git repository access (GitHub/GitLab)
  media: boolean; // Media library, attachments

  // Heavy/optional tools
  imageGeneration: boolean; // FLUX, Gemini image generation
  webSearch: boolean; // Perplexity web search/research

  // External integrations
  google: boolean; // Google Workspace (Drive, Gmail, Calendar)

  // Chat memory
  memory: boolean; // Chat index summaries + full chat fetch by UUID/id

  // AI Integration Library
  aiIntegrations: boolean; // Agent configs, artifacts, logs, proposals
}

/** Opus 4.7: steer verbosity and literalism (see Anthropic migration guide). */
const CLAUDE_OPUS_47_SYSTEM_SUFFIX = `
When the user wants a short answer, keep it short. Follow their instructions literally; if something essential is missing, ask one brief clarifying question instead of assuming.`;

/**
 * Opus 4.7 rejects assistant-message prefills. Strip leading assistant turns so the
 * thread always starts from a user/tool context (common bad shape after imports or bugs).
 */
function stripLeadingAssistantMessages(messages: ModelMessage[]): ModelMessage[] {
  const out = [...messages];
  while (out.length > 0 && out[0].role === "assistant") {
    out.shift();
  }
  return out;
}

export const DEFAULT_TOOLS_CONFIG: ToolsConfig = {
  journal: true,
  repository: true,
  cursorDelegate: false,
  linear: true,
  slite: false, // Off by default - requires SLITE_API_KEY
  notion: false, // Off by default - requires NOTION_API_KEY
  git: false, // Off by default - requires GitHub/GitLab token
  media: true,
  imageGeneration: false, // Off by default - heavy
  webSearch: false, // Off by default - requires API key
  google: false, // Off by default - requires gws auth setup
  memory: false, // Off by default - enabled with chat index context
  aiIntegrations: false, // Off by default - Library agent index tools
};

export type ModelSelection = ChatModelKey;

function getModel(selectedModel?: ChatModelKey) {
  const modelKey = normalizeChatModelKey(selectedModel);
  const entry = getChatModelEntry(modelKey);
  const modelId = resolveChatModelId(entry, process.env);

  // Check if the required API key is available
  switch (entry.provider) {
    case "google":
      if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY) {
        console.log(`Using Google model: ${modelId}`);
        return {
          model: google(modelId),
          provider: entry.provider,
          hasThinking: entry.hasThinking,
          modelId,
        };
      }
      console.warn("Google API key not configured");
      break;
    case "anthropic":
      if (process.env.ANTHROPIC_API_KEY) {
        console.log(`Using Anthropic model: ${modelId}`);
        return {
          model: anthropic(modelId),
          provider: entry.provider,
          hasThinking: entry.hasThinking,
          modelId,
        };
      }
      console.warn("Anthropic API key not configured");
      break;
    case "openai":
      if (process.env.OPENAI_API_KEY) {
        console.log(`Using OpenAI model: ${modelId}`);
        return {
          model: openai(modelId),
          provider: entry.provider,
          hasThinking: entry.hasThinking,
          modelId,
        };
      }
      console.warn("OpenAI API key not configured");
      break;
  }

  // Fallback: try any available provider (latest lane per vendor)
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY) {
    const fallback = getChatModelEntry("gemini-3.5-flash");
    const fallbackModelId = resolveChatModelId(fallback, process.env);
    console.log(`Falling back to Google: ${fallbackModelId}`);
    return {
      model: google(fallbackModelId),
      provider: "google" as const,
      hasThinking: fallback.hasThinking,
      modelId: fallbackModelId,
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const fallback = getChatModelEntry("claude-opus-4.7");
    const fallbackModelId = resolveChatModelId(fallback, process.env);
    console.log(`Falling back to Anthropic: ${fallbackModelId}`);
    return {
      model: anthropic(fallbackModelId),
      provider: "anthropic" as const,
      hasThinking: fallback.hasThinking,
      modelId: fallbackModelId,
    };
  }
  if (process.env.OPENAI_API_KEY) {
    const fallback = getChatModelEntry("gpt-5.5");
    const fallbackModelId = resolveChatModelId(fallback, process.env);
    console.log(`Falling back to OpenAI: ${fallbackModelId}`);
    return {
      model: openai(fallbackModelId),
      provider: "openai" as const,
      hasThinking: fallback.hasThinking,
      modelId: fallbackModelId,
    };
  }

  throw new Error(
    "No AI API key configured. Set GOOGLE_GENERATIVE_AI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY"
  );
}

/**
 * Build the tools object based on toolsConfig
 * Tool definitions imported from tools.ts (single source of truth)
 */
function buildTools(toolsConfig: ToolsConfig): Record<string, any> {
  const enabledTools: Record<string, any> = {};

  const configKeys: (keyof ToolsConfig)[] = [
    "journal",
    "linear",
    "slite",
    "repository",
    "cursorDelegate",
    "aiIntegrations",
    "git",
    "media",
    "imageGeneration",
    "webSearch",
    "google",
    "memory",
  ];

  for (const key of configKeys) {
    if (toolsConfig[key] && toolCategories[key]) {
      for (const toolName of toolCategories[key]) {
        const spec = toolSpecs[toolName];
        if (spec) {
          enabledTools[toolName] = spec;
        }
      }
    }
  }

  // Skill management tools — always available
  for (const toolName of toolCategories._alwaysOn) {
    const spec = toolSpecs[toolName];
    if (spec) {
      enabledTools[toolName] = spec;
    }
  }

  return enabledTools;
}

export async function POST(req: Request) {
  try {
    const { messages, soulConfig, toolsConfig, modelConfig, activeSkillSlugs, displayedArtifactUuid, shelf, chatLog, conversationId } =
      await req.json();

    const requestedSoulConfig: Partial<SoulConfig> | undefined = soulConfig
      ? {
          writings: soulConfig.writings ?? false,
          portfolioProjects: soulConfig.portfolioProjects ?? false,
          skills: soulConfig.skills ?? false,
          workExperience: soulConfig.workExperience ?? false,
          education: soulConfig.education ?? false,
          journalEntries: soulConfig.journalEntries ?? false,
          chatIndex: soulConfig.chatIndex ?? false,
          linearProjects: soulConfig.linearProjects ?? false,
          linearIssues: soulConfig.linearIssues ?? false,
          linearIncludeCompleted: soulConfig.linearIncludeCompleted ?? false,
          sliteNotes: soulConfig.sliteNotes ?? false,
          notionPages: soulConfig.notionPages ?? false,
        }
      : undefined;

    // Determine system prompt and tools based on skill mode vs legacy mode
    let systemPrompt: string;
    let enabledToolsConfig: ToolsConfig;

    if (activeSkillSlugs && Array.isArray(activeSkillSlugs)) {
      // ===== SKILL MODE =====
      // Load ALL skill documents from DB (for available skills reference)
      const db = getDrizzleDb();
      const allSkillDocs = db
        .select()
        .from(documents)
        .where(eq(documents.type, "prompt"))
        .all()
        .filter((d) => {
          try {
            const meta = JSON.parse(d.metadata || "{}");
            return meta.type === "kronus-skill" && meta.skillConfig;
          } catch {
            return false;
          }
        });

      // Build full available skills list (lightweight, for system prompt reference)
      const allAvailableSkills: SkillInfo[] = allSkillDocs.map((d) => {
        const meta = JSON.parse(d.metadata || "{}");
        const config: SkillConfig = meta.skillConfig || { soul: {}, tools: {} };
        return {
          id: d.id,
          slug: d.slug,
          title: d.title,
          description: d.summary || d.content.substring(0, 120),
          icon: config.icon || "Zap",
          color: config.color || "#00CED1",
          priority: config.priority ?? 50,
          config,
        };
      }).sort((a, b) => a.priority - b.priority);

      // Build active skills (full content, for prompt injection)
      const activeSkills: KronusSkill[] = allSkillDocs
        .filter((d) => activeSkillSlugs.includes(d.slug))
        .map((doc) => {
          const meta = JSON.parse(doc.metadata || "{}");
          const config: SkillConfig = meta.skillConfig || { soul: {}, tools: {} };
          return {
            id: doc.id,
            slug: doc.slug,
            title: doc.title,
            description: doc.summary || doc.content.substring(0, 120),
            content: doc.content,
            config,
            icon: config.icon || "Zap",
            color: config.color || "#00CED1",
            priority: config.priority ?? 50,
          };
        });

      // Build skill-aware system prompt with available skills reference
      systemPrompt = await getKronusSystemPromptWithSkills(
        activeSkills,
        allAvailableSkills,
        requestedSoulConfig,
      );

      // Derive tools from skill merge (OR with any explicit toolsConfig from client)
      if (activeSkills.length > 0) {
        const merged = mergeSkillConfigs(activeSkills);
        enabledToolsConfig = {
          journal: merged.tools.journal || (toolsConfig?.journal ?? false),
          repository: merged.tools.repository || (toolsConfig?.repository ?? false),
          cursorDelegate:
            merged.tools.cursorDelegate || (toolsConfig?.cursorDelegate ?? false),
          linear: merged.tools.linear || (toolsConfig?.linear ?? false),
          slite: merged.tools.slite || (toolsConfig?.slite ?? false),
          notion: merged.tools.notion || (toolsConfig?.notion ?? false),
          git: merged.tools.git || (toolsConfig?.git ?? false),
          media: merged.tools.media || (toolsConfig?.media ?? false),
          imageGeneration:
            merged.tools.imageGeneration || (toolsConfig?.imageGeneration ?? false),
          webSearch: merged.tools.webSearch || (toolsConfig?.webSearch ?? false),
          google: merged.tools.google || (toolsConfig?.google ?? false),
          aiIntegrations:
            merged.tools.aiIntegrations || (toolsConfig?.aiIntegrations ?? false),
          memory:
            merged.tools.memory ||
            merged.soul.chatIndex ||
            requestedSoulConfig?.chatIndex ||
            (toolsConfig?.memory ?? false),
        };
      } else {
        // Lean baseline tools (no skills active)
        enabledToolsConfig = toolsConfig
          ? {
              journal: toolsConfig.journal ?? true,
              repository: toolsConfig.repository ?? true,
              cursorDelegate: toolsConfig.cursorDelegate ?? false,
              linear: toolsConfig.linear ?? false,
              slite: toolsConfig.slite ?? false,
              notion: toolsConfig.notion ?? false,
              git: toolsConfig.git ?? false,
              media: toolsConfig.media ?? false,
              imageGeneration: toolsConfig.imageGeneration ?? false,
              webSearch: toolsConfig.webSearch ?? false,
              google: toolsConfig.google ?? false,
              aiIntegrations: toolsConfig.aiIntegrations ?? false,
              memory: (toolsConfig.memory ?? false) || (requestedSoulConfig?.chatIndex ?? false),
            }
          : {
              journal: true,
              repository: true,
              cursorDelegate: false,
              linear: false,
              slite: false,
              notion: false,
              git: false,
              media: false,
              imageGeneration: false,
              webSearch: false,
              google: false,
              memory: requestedSoulConfig?.chatIndex ?? false,
              aiIntegrations: false,
            };
      }
    } else {
      // ===== LEGACY MODE (backward compatible) =====
      const config: SoulConfig = soulConfig
        ? {
            writings: soulConfig.writings ?? true,
            portfolioProjects: soulConfig.portfolioProjects ?? true,
            skills: soulConfig.skills ?? true,
            workExperience: soulConfig.workExperience ?? true,
            education: soulConfig.education ?? true,
            journalEntries: soulConfig.journalEntries ?? true,
            chatIndex: soulConfig.chatIndex ?? false,
            linearProjects: soulConfig.linearProjects ?? true,
            linearIssues: soulConfig.linearIssues ?? true,
            linearIncludeCompleted: soulConfig.linearIncludeCompleted ?? false,
            sliteNotes: soulConfig.sliteNotes ?? false,
            notionPages: soulConfig.notionPages ?? false,
          }
        : DEFAULT_SOUL_CONFIG;

      systemPrompt = await getKronusSystemPrompt(config);

      enabledToolsConfig = toolsConfig
        ? {
            journal: toolsConfig.journal ?? true,
            repository: toolsConfig.repository ?? true,
            cursorDelegate: toolsConfig.cursorDelegate ?? false,
            linear: toolsConfig.linear ?? true,
            slite: toolsConfig.slite ?? false,
            notion: toolsConfig.notion ?? false,
            git: toolsConfig.git ?? false,
            media: toolsConfig.media ?? true,
            imageGeneration: toolsConfig.imageGeneration ?? false,
            webSearch: toolsConfig.webSearch ?? false,
            google: toolsConfig.google ?? false,
            aiIntegrations: toolsConfig.aiIntegrations ?? false,
            memory: (toolsConfig.memory ?? false) || (soulConfig?.chatIndex ?? false),
          }
        : DEFAULT_TOOLS_CONFIG;
    }

    // Get model based on selected model (default: gemini-3-flash)
    const selectedModel = modelConfig?.model as ModelSelection | undefined;
    const {
      model,
      provider: actualProvider,
      hasThinking: modelSupportsThinking,
      modelId: activeModelId,
    } = getModel(selectedModel);
    // Reasoning is enabled if model supports it AND user hasn't disabled it
    const reasoningEnabled = modelConfig?.reasoningEnabled ?? true;
    const hasThinking = modelSupportsThinking && reasoningEnabled;
    const enabledTools = buildTools(enabledToolsConfig);

    // Register `set_artifact` only when a shelf is present (Hourglass chat).
    // Legacy /chat has no shelf, so Kronus shouldn't see this tool there.
    if (Array.isArray(shelf) && shelf.length > 0) {
      const setArtifactSpec = toolSpecs.set_artifact;
      if (setArtifactSpec) enabledTools.set_artifact = setArtifactSpec;
    }

    let messagesForModel =
      actualProvider === "google"
        ? (() => {
            const repaired = repairUnsignedGeminiToolHistory(messages as any[]);
            if (repaired.repaired > 0) {
              console.warn(
                `[Gemini] Repaired ${repaired.repaired} unsigned tool-call part(s) by converting them to text history`
              );
            }
            return repaired.messages;
          })()
        : messages;

    const inferencePrep = prepareUiMessagesForInference(messagesForModel as any[], actualProvider);
    if (inferencePrep.strippedReasoning > 0) {
      console.warn(
        `[${actualProvider}] Stripped ${inferencePrep.strippedReasoning} cross-provider reasoning part(s) from history`
      );
    }
    messagesForModel = inferencePrep.messages;

    // Sanitize messages - remove control characters that can cause issues
    // (e.g., <ctrl46> from Delete key, other non-printable characters)
    // Also filter out messages with empty content (can happen when switching models,
    // e.g., Gemini thinking-only messages don't have content that Claude accepts)
    const sanitizedMessages = messagesForModel
      .map((msg: any) => {
        const normalized = normalizeUiMessageParts(msg);
        const sanitizeText = (text: string) =>
          text
            .replace(/<ctrl\d+>/gi, "")
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

        if (typeof normalized.content === "string") {
          return { ...normalized, content: sanitizeText(normalized.content) };
        }
        if (Array.isArray(normalized.parts)) {
          const sanitizedParts = normalized.parts.map((part: any) => {
            if (part?.type === "text" && typeof part.text === "string") {
              return { ...part, text: sanitizeText(part.text) };
            }
            if (part?.type === "reasoning" && typeof part.text === "string") {
              return { ...part, text: sanitizeText(part.text) };
            }
            return part;
          });
          const repairedParts = repairPartsForModel(sanitizedParts);
          return { ...normalized, parts: repairedParts, content: undefined };
        }
        return normalized;
      })
      .filter((msg: any) => {
        // UI messages use `parts`; legacy paths may still use `content`
        if (Array.isArray(msg.parts) && msg.parts.length > 0) {
          return msg.parts.some((part: any) => {
            if (part.type === "text") return part.text?.trim().length > 0;
            if (part.type === "reasoning") return part.text?.trim().length > 0;
            if (part.type === "tool-call" || part.type === "tool-result") return true;
            if (part.type === "dynamic-tool" || (typeof part.type === "string" && part.type.startsWith("tool-"))) {
              return true;
            }
            if (part.type === "image") {
              const url = typeof part.url === "string" ? part.url : "";
              const image = typeof part.image === "string" ? part.image : "";
              return (image.length > 0 && !image.startsWith("blob:")) || (url.length > 0 && !url.startsWith("blob:"));
            }
            if (part.type === "file") {
              const url = typeof part.url === "string" ? part.url : "";
              return (url.length > 0 && !url.startsWith("blob:")) || part.data != null;
            }
            return false;
          });
        }
        if (typeof msg.content === "string") {
          return msg.content.trim().length > 0;
        }
        if (Array.isArray(msg.content)) {
          return msg.content.length > 0 && msg.content.some((part: any) => {
            if (part.type === "text") return part.text?.trim().length > 0;
            if (part.type === "tool-call" || part.type === "tool-result") return true;
            if (part.type === "image") return true;
            return false;
          });
        }
        return true;
      });

    // Convert UI messages to model format for proper streaming (async in AI SDK 6)
    let modelMessages = repairModelMessages(await convertToModelMessages(sanitizedMessages));

    const isAnthropicAdaptive =
      (activeModelId === "claude-opus-4-7" || activeModelId === "claude-fable-5") &&
      actualProvider === "anthropic";
    if (isAnthropicAdaptive) {
      modelMessages = stripLeadingAssistantMessages(modelMessages);
    }

    // Gemini 3 requires a thoughtSignature on every historical tool-call.
    // Diagnostic: log the raw incoming UI tool-call parts to locate where
    // callProviderMetadata is dropped, and log the converted ModelMessage state.
    if (actualProvider === "google") {
      for (const msg of messagesForModel as any[]) {
        if (msg.role !== "assistant" || !Array.isArray(msg.parts)) continue;
        for (const part of msg.parts) {
          if (typeof part.type !== "string" || !part.type.startsWith("tool-")) continue;
          console.log("[Gemini UI part]", {
            type: part.type,
            toolCallId: part.toolCallId,
            state: part.state,
            hasCallProviderMetadata: !!part.callProviderMetadata,
            hasResultProviderMetadata: !!part.resultProviderMetadata,
            callMetaKeys: part.callProviderMetadata ? Object.keys(part.callProviderMetadata) : null,
          });
        }
      }
      let unsignedCount = 0;
      for (const msg of modelMessages as any[]) {
        if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
        for (const part of msg.content) {
          if (part.type !== "tool-call") continue;
          if (!part.providerOptions?.google?.thoughtSignature) unsignedCount++;
        }
      }
      if (unsignedCount > 0) {
        console.error(`[Gemini] ${unsignedCount} tool-call part(s) missing thoughtSignature — aborting to prevent runaway loop`);
        return new Response(
          JSON.stringify({
            error: "Gemini thought_signature missing from tool-call history — start a new chat or switch provider.",
          }),
          { status: 422, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Build provider options for thinking/reasoning based on provider and model capability
    const providerOptions: Record<string, any> = {};
    if (hasThinking) {
      if (actualProvider === "anthropic") {
        // Opus 4.7 / Fable 5: adaptive thinking only (budget_tokens rejected by API)
        if (activeModelId === "claude-opus-4-7" || activeModelId === "claude-fable-5") {
          providerOptions.anthropic = {
            thinking: { type: "adaptive", display: "summarized" },
            effort: "xhigh",
          } satisfies AnthropicProviderOptions;
        } else {
          // Sonnet 4.6 / Opus 4.6 — extended thinking with token budget
          providerOptions.anthropic = {
            thinking: { type: "enabled", budgetTokens: 10000 },
          } satisfies AnthropicProviderOptions;
        }
      } else if (actualProvider === "google") {
        // Enable thinking for Gemini models
        providerOptions.google = {
          thinkingConfig: {
            includeThoughts: true,
          },
        } satisfies GoogleGenerativeAIProviderOptions;
      } else if (actualProvider === "openai") {
        // GPT-5.x Responses API: reasoning + message must be replayed as pairs.
        // Request encrypted_content so multi-turn history works when store=false.
        providerOptions.openai = {
          reasoningEffort: "medium",
          reasoningSummary: "detailed",
          include: ["reasoning.encrypted_content"],
        };
      }
    }

    // ─── Shared Display Shelf injection (Hourglass chat) ───
    // Kronus sees every ref on the shelf as a compact line, and the
    // currently-displayed artifact in full. Lets him reference what the
    // user is looking at without extra tool calls.
    const shelfBlock = buildShelfBlock(shelf, displayedArtifactUuid);
    // Append-only event log — what the conversation has actually done so
    // far (messages, tool calls, shelf adds, muse proposals/paints,
    // session resumes). Lets Kronus refer to events that aren't in the
    // message transcript (e.g. "the muse painted the gate two turns ago").
    const chatLogBlock = buildChatLogBlock(chatLog);

    const effectiveSystemPrompt =
      isAnthropicAdaptive
        ? `${systemPrompt}${shelfBlock}${chatLogBlock}\n${CLAUDE_OPUS_47_SYSTEM_SUFFIX}`
        : `${systemPrompt}${shelfBlock}${chatLogBlock}`;

    // Capture the most recent user message as the trace input (the actual question).
    const lastUser = [...modelMessages].reverse().find((m: { role?: string }) => m.role === "user");
    const traceInput = lastUser
      ? typeof (lastUser as { content?: unknown }).content === "string"
        ? (lastUser as { content: string }).content
        : (lastUser as { content: unknown }).content
      : undefined;
    const traceSpanId = openAISpan(
      "chat",
      activeModelId,
      { provider: actualProvider },
      traceInput,
      "/api/chat",
      typeof conversationId === "number" ? conversationId : undefined,
    );
    const result = streamText({
      model,
      system: effectiveSystemPrompt,
      messages: modelMessages,
      tools: enabledTools as any,
      providerOptions,
      // Opus 4.7: omit non-default sampling params (handled by SDK for this model).
      // Higher output cap recommended at xhigh effort (Anthropic migration guide).
      ...(isAnthropicAdaptive ? { maxOutputTokens: 64_000 } : {}),
      onError: (event) => {
        // Log streaming errors with full details
        console.error("[Chat Stream Error]", {
          error: event.error,
          message: event.error instanceof Error ? event.error.message : String(event.error),
          stack: event.error instanceof Error ? event.error.stack : undefined,
        });
      },
      onFinish: (event) => {
        const finalText = (event as { text?: string }).text ?? "";
        closeAISpan(traceSpanId, event.usage, undefined, finalText);
        const isError = event.finishReason === "error" || event.finishReason === "other";
        const logFn = isError ? console.error : console.log;
        const label = isError ? "[Chat Finish Warning]" : "[Chat Complete]";

        const raw = event.rawFinishReason;
        if (raw === "refusal" || raw === "model_context_window_exceeded") {
          console.warn("[Chat Finish raw]", {
            modelId: activeModelId,
            finishReason: event.finishReason,
            rawFinishReason: raw,
          });
        }

        logFn(label, {
          finishReason: event.finishReason,
          rawFinishReason: event.rawFinishReason,
          usage: event.usage,
          // Log response content for debugging empty responses
          textLength: event.text?.length || 0,
          textPreview: event.text?.slice(0, 200) || "(empty)",
          toolCallsCount:
            event.response?.messages?.filter((m: any) => m.role === "assistant" && m.toolCalls)
              ?.length || 0,
          // Raw provider response for debugging
          rawResponse: (event.response as any)?.rawResponse
            ? JSON.stringify((event.response as any).rawResponse).slice(0, 500)
            : "(no raw response)",
        });

        // Specifically flag zero-output issues
        if (event.usage?.outputTokens === 0) {
          console.error("[Chat Zero Output]", {
            finishReason: event.finishReason,
            inputTokens: event.usage?.inputTokens,
            possibleCauses: [
              "Context too large for model",
              "Safety filter triggered",
              "Model returned empty response",
              "Rate limit or quota issue",
            ],
          });
        }
      },
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        // Forward user-friendly error message to the client
        // (by default AI SDK does NOT forward errors to prevent sensitive data leakage)
        if (!(error instanceof Error)) {
          return "An unexpected error occurred. Please try again.";
        }

        const msg = error.message;

        // AI_RetryError wraps the actual cause — extract the last error message
        if (msg.includes("Last error:")) {
          return msg.split("Last error:")[1].trim();
        }

        // Provider-specific codes
        if (msg.includes("high demand") || msg.includes("UNAVAILABLE") || msg.includes("503")) {
          return "The model is currently overloaded. Please try again in a moment.";
        }
        if (msg.includes("rate limit") || msg.includes("quota") || msg.includes("429")) {
          return "Rate limit reached. Please wait a moment before sending another message.";
        }
        if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("api key")) {
          return "Authentication error — check your API key configuration.";
        }
        if (msg.includes("context") || msg.includes("token") || msg.includes("too long")) {
          return "The conversation is too long for this model. Try compressing the context or starting a new chat.";
        }
        if (
          msg.includes("temperature") ||
          msg.includes("top_p") ||
          msg.includes("top_k") ||
          msg.includes("sampling")
        ) {
          return "This model rejected custom sampling parameters. Remove temperature/top_p/top_k from the request (the chat API already omits them for Opus 4.7).";
        }
        if (msg.toLowerCase().includes("prefill")) {
          return "Assistant prefill is not supported for this model. Continue with a user message instead.";
        }

        return msg;
      },
    });
  } catch (error: any) {
    // Categorize and log errors with context
    const errorType = categorizeError(error);
    console.error(`[Chat Error: ${errorType}]`, {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    });

    return new Response(
      JSON.stringify({
        error: error.message || "Chat failed",
        type: errorType,
        code: error.code,
      }),
      {
        status: error.status || 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * Categorize errors for better debugging
 */
function categorizeError(error: any): string {
  const message = error.message?.toLowerCase() || "";
  const code = error.code?.toLowerCase() || "";

  // API/Auth errors
  if (message.includes("api key") || message.includes("unauthorized") || error.status === 401) {
    return "AUTH_ERROR";
  }

  // Rate limiting
  if (message.includes("rate limit") || message.includes("quota") || error.status === 429) {
    return "RATE_LIMIT";
  }

  // Token/context limits
  if (message.includes("token") || message.includes("context") || message.includes("too long")) {
    return "TOKEN_LIMIT";
  }

  // Network errors
  if (code.includes("econnrefused") || code.includes("etimedout") || message.includes("network")) {
    return "NETWORK_ERROR";
  }

  // Timeout
  if (message.includes("timeout") || code.includes("timeout")) {
    return "TIMEOUT";
  }

  // Model errors
  if (message.includes("model") || message.includes("not found")) {
    return "MODEL_ERROR";
  }

  // Safety/content filters
  if (message.includes("safety") || message.includes("blocked") || message.includes("filter")) {
    return "CONTENT_FILTER";
  }

  // Validation errors
  if (message.includes("invalid") || message.includes("validation")) {
    return "VALIDATION_ERROR";
  }

  return "UNKNOWN_ERROR";
}
