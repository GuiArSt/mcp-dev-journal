"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { shouldAutoSendAfterToolCalls, wouldRepeatToolLoop, toolCallSignature, identicalToolLimitNotice, runawayToolNotice } from "@/lib/hourglass-auto-send-guard";
import type { UIMessage } from "ai";
import { LEAN_SOUL_CONFIG, LEAN_TOOLS_CONFIG } from "@/lib/ai/skills";
import { executeToolCall } from "@/lib/ai/tool-executors";
import { Hero, type HeroHandle } from "./Hero";
import { HourglassChrome } from "./HourglassChrome";
import { Composer } from "./Composer";
import type { MuseThought } from "./MoodPanel";
import { useMuse, useMuseEdit, useMuseObserver } from "./useMuse";
import type { MuseProposeResponse, MuseGenerateResponse, MuseShelfRef } from "./useMuse";
import { MuseEditPopover } from "./MuseEditPopover";
import { ArtifactAddSheet } from "./artifacts/ArtifactAddSheet";
import { SkillsPopover, type SkillOption } from "./SkillsPopover";
import { ConfigPopover } from "./ConfigPopover";
import type { KronusContextStats } from "@/lib/kronus-context-stats";
import {
  computeHourglassContextMeter,
  formatContextTokenCount,
} from "@/lib/hourglass-context-meter";
import type { ComposerMode, MoodTab, Turn } from "./types";
import type { Artifact, ArtifactBody, ArtifactRef } from "./artifacts/types";
import type { ChatMessage } from "@/lib/db-conversations";
import { sanitizeMessagesForPersist } from "@/lib/conversation-persist";
import { restorePartsFromPersist, finalizeRestoredUiMessages } from "@/lib/chat-message-repair";
import { appendEntry, extractMuseThoughtsFromChatLog, type ChatLogEntry } from "@/lib/chat-log";
import type { PendingApproval, PendingApprovalAlternative } from "./ApprovalCard";
import type { SoulConfigState } from "@/components/chat/SoulConfig";
import type { ToolsConfigState } from "@/components/chat/ToolsConfig";
import { compressImage, fileToDataUrl } from "@/lib/image-compression";
import { startMemLog, markMem } from "@/lib/dev-memlog";
import { setClientErrorContext } from "@/lib/dev-client-errors";
import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_CHAT_MODEL,
  DEFAULT_OPENAI_IMAGE_CHAT_MODEL,
  getModelContextLimit,
  normalizeChatModelKey,
  type ChatModelKey,
} from "@/lib/ai/model-catalog";
import {
  buildTurnsFromMessages,
  extractLiveTail,
  messageToText,
  shouldCommitCompletedTurns,
} from "@/lib/hourglass-turns";

// The muse ticks every N completed turns. First image earliest = turn 2.
const MUSE_TICK_EVERY = 3;
const MUSE_VISION_MAX_EDGE = 1024;
const MUSE_VISION_MAX_BYTES = 350 * 1024;

type MuseVisualChoiceLog = {
  source: "single" | "alternatives" | "direct";
  reason: string;
  selectedIndex?: number;
  selected: PendingApprovalAlternative;
  alternatives?: PendingApprovalAlternative[];
};

function normalizeMuseTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const clean = title
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length < 3) return null;
  return clean.length > 80 ? `${clean.slice(0, 77).trimEnd()}...` : clean;
}

/** Flatten a UIMessage to the minimal ChatMessage format we persist. */
function uiToChat(m: UIMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role as ChatMessage["role"],
    content: messageToText(m),
    parts: m.parts as any[],
    createdAt: (m as unknown as { createdAt?: Date }).createdAt?.toISOString(),
  };
}

/** Reconstruct a minimal UIMessage from a persisted ChatMessage. */
function chatToUI(m: ChatMessage): UIMessage {
  const rawParts = (m.parts as unknown[] | undefined) ?? [{ type: "text" as const, text: m.content }];
  const parts = restorePartsFromPersist(rawParts) as UIMessage["parts"];
  return {
    id: m.id,
    role: m.role as UIMessage["role"],
    content: m.content,
    parts,
    createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
  } as UIMessage;
}

function chatMessagesToUI(messages: ChatMessage[]): UIMessage[] {
  return finalizeRestoredUiMessages(messages.map(chatToUI));
}

/** Use the ApprovalCard's PendingApproval shape directly. */
type PendingApprovalShape = PendingApproval;

interface HourglassSessionConfig {
  v: 1;
  surface: "hourglass";
  soulConfig: typeof LEAN_SOUL_CONFIG;
  toolsConfig: typeof LEAN_TOOLS_CONFIG;
  modelConfig: { model: ChatModelKey; reasoningEnabled: boolean };
  activeSkillSlugs: string[];
  imagesEnabled: boolean;
  imagesProvider: "google" | "openai";
}

function parseHourglassSessionConfig(raw: string | null | undefined): HourglassSessionConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<HourglassSessionConfig>;
    if (parsed?.surface && parsed.surface !== "hourglass") return null;
    const model = parsed.modelConfig?.model;
    const validModel = normalizeChatModelKey(model);
    return {
      v: 1,
      surface: "hourglass",
      soulConfig: { ...LEAN_SOUL_CONFIG, ...(parsed.soulConfig ?? {}) },
      toolsConfig: { ...LEAN_TOOLS_CONFIG, ...(parsed.toolsConfig ?? {}) },
      modelConfig: { model: validModel as ChatModelKey, reasoningEnabled: parsed.modelConfig?.reasoningEnabled ?? false },
      activeSkillSlugs: Array.isArray(parsed.activeSkillSlugs)
        ? parsed.activeSkillSlugs.filter((s): s is string => typeof s === "string")
        : [],
      imagesEnabled: parsed.imagesEnabled === true,
      imagesProvider: parsed.imagesProvider === "openai" ? "openai" : "google",
    };
  } catch {
    return null;
  }
}

function asksForVisualTool(text: string): boolean {
  const normalized = text.toLowerCase();
  if (/\binfographic(s)?\b/.test(normalized)) return true;
  const visualNoun = /\b(muse|visual|image|picture|diagram|poster|comic|illustration|rendering|artwork|shelf)\b/.test(normalized);
  const actionVerb = /\b(ask|wake|request|create|make|generate|paint|draw|render|produce|offer|show)\b/.test(normalized);
  return visualNoun && actionVerb;
}

function countEnabledMerged(base: object, implied: object): number {
  const keys = new Set([...Object.keys(base), ...Object.keys(implied)]);
  let count = 0;
  for (const key of keys) {
    if ((base as Record<string, unknown>)[key] || (implied as Record<string, unknown>)[key]) count += 1;
  }
  return count;
}

export function HourglassChat() {
  // Chat-model + image-tool settings
  const [chatModel, setChatModel] = useState<ChatModelKey>(DEFAULT_CHAT_MODEL);
  const [imagesEnabled, setImagesEnabled] = useState(false);
  // When images enabled, user can pick between Gemini-default and GPT
  const [imagesProvider, setImagesProvider] = useState<"google" | "openai">("google");

  // Session config (live, flows into every sendMessage)
  const [soulConfig, setSoulConfig] = useState(LEAN_SOUL_CONFIG);
  const [baseToolsConfig, setBaseToolsConfig] = useState(LEAN_TOOLS_CONFIG);
  const toolsConfig = useMemo(
    () => ({ ...baseToolsConfig, imageGeneration: baseToolsConfig.imageGeneration || imagesEnabled }),
    [baseToolsConfig, imagesEnabled],
  );
  const modelConfig = useMemo(
    () => ({ model: chatModel, reasoningEnabled: false }),
    [chatModel],
  );
  const [activeSkillSlugs, setActiveSkillSlugs] = useState<string[]>([]);
  const [availableSkillOptions, setAvailableSkillOptions] = useState<SkillOption[]>([]);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [skillsAnchorRect, setSkillsAnchorRect] = useState<DOMRect | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [configAnchorRect, setConfigAnchorRect] = useState<DOMRect | null>(null);
  const [contextStats, setContextStats] = useState<KronusContextStats | null>(null);
  const [liteIndexTokens, setLiteIndexTokens] = useState(0);
  const sessionConfigRef = useRef<HourglassSessionConfig | null>(null);
  const skillConfigForUi = useMemo(() => {
    const soul: Partial<SoulConfigState> = {};
    const tools: Partial<ToolsConfigState> = {};
    const active = new Set(activeSkillSlugs);
    for (const skill of availableSkillOptions) {
      if (!active.has(skill.slug) || !skill.config) continue;
      for (const [key, value] of Object.entries(skill.config.soul ?? {})) {
        if (value === true) (soul as Record<string, boolean>)[key] = true;
      }
      for (const [key, value] of Object.entries(skill.config.tools ?? {})) {
        if (value === true) (tools as Record<string, boolean>)[key] = true;
      }
    }
    return { soul, tools };
  }, [activeSkillSlugs, availableSkillOptions]);

  // Skill definitions live in DB and change over time — load on mount so
  // ConfigPopover "active via skill" reflects current presets (not a stale
  // first-open cache from before migrations).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/kronus/skills")
      .then(async (res) => {
        if (!res.ok) throw new Error(`skills ${res.status}`);
        const json = (await res.json()) as {
          skills: Array<{
            slug: string;
            title: string;
            description?: string;
            config: SkillOption["config"];
            tokenEstimate?: number;
          }>;
        };
        if (cancelled) return;
        setAvailableSkillOptions(
          (json.skills ?? []).map((s) => ({
            slug: s.slug,
            title: s.title,
            summary: s.description,
            config: s.config,
            tokenEstimate: s.tokenEstimate,
          })),
        );
      })
      .catch(() => {
        /* SkillsPopover can still lazy-load as fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshContextStats = useCallback(() => {
    fetch("/api/kronus/stats")
      .then(async (res) => {
        if (!res.ok) throw new Error(`stats ${res.status}`);
        const data = (await res.json()) as KronusContextStats & { liteIndexTokens?: number };
        if (typeof data.writings === "number") {
          setContextStats(data);
          setLiteIndexTokens(typeof data.liteIndexTokens === "number" ? data.liteIndexTokens : 0);
        }
      })
      .catch(() => {
        /* keep previous */
      });
  }, []);

  useEffect(() => {
    refreshContextStats();
  }, [refreshContextStats]);

  // When user toggles "Images" on, auto-swap to an image-capable model if
  // they're currently on Claude. We don't force-swap back on off.
  const handleToggleImages = useCallback(() => {
    setImagesEnabled((prev) => {
      const next = !prev;
      if (next) {
        setChatModel((cur) => {
          const provider = CHAT_MODELS.find((m) => m.key === cur)?.provider;
          if (provider === "anthropic") {
            return imagesProvider === "google" ? DEFAULT_IMAGE_CHAT_MODEL : DEFAULT_OPENAI_IMAGE_CHAT_MODEL;
          }
          return cur;
        });
      }
      return next;
    });
  }, [imagesProvider]);

  const handleImagesProviderChange = useCallback((p: "google" | "openai") => {
    setImagesProvider(p);
    // If images is already on, swap model accordingly.
    setChatModel((cur) => {
      if (!imagesEnabled) return cur;
      return p === "google" ? DEFAULT_IMAGE_CHAT_MODEL : DEFAULT_OPENAI_IMAGE_CHAT_MODEL;
    });
  }, [imagesEnabled]);

  useEffect(() => {
    sessionConfigRef.current = {
      v: 1,
      surface: "hourglass",
      soulConfig,
      toolsConfig: baseToolsConfig,
      modelConfig,
      activeSkillSlugs,
      imagesEnabled,
      imagesProvider,
    };
  }, [activeSkillSlugs, baseToolsConfig, imagesEnabled, imagesProvider, modelConfig, soulConfig]);

  const restoreSessionConfig = useCallback((raw: string | null | undefined) => {
    const restored = parseHourglassSessionConfig(raw);
    if (!restored) return;
    setSoulConfig(restored.soulConfig);
    setBaseToolsConfig(restored.toolsConfig);
    setChatModel(normalizeChatModelKey(restored.modelConfig.model));
    setActiveSkillSlugs(restored.activeSkillSlugs);
    setImagesEnabled(restored.imagesEnabled || restored.toolsConfig.imageGeneration);
    setImagesProvider(restored.imagesProvider);
  }, []);

  // UI state — composer draft lives inside `Composer` so typing does not
  // re-render Hero/Mood (was freezing input on long chats).
  const [composerDraftResetNonce, setComposerDraftResetNonce] = useState(0);
  const [composerMode, setComposerMode] = useState<ComposerMode>("floating");
  const [moodTab, setMoodTab] = useState<MoodTab>("mood");
  const [moodCollapsed, setMoodCollapsed] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [daimonActive, setDaimonActive] = useState(false);
  const [daimonPending, setDaimonPending] = useState(false);
  const [conversationTitle, setConversationTitle] = useState("");
  const [recentConversations, setRecentConversations] = useState<
    Array<{
      id: number;
      title: string;
      updated_at: string;
      summary?: string | null;
      summary_updated_at?: string | null;
    }>
  >([]);
  const [conversationStartedAt, setConversationStartedAt] = useState(() => Date.now());
  // Conversation persistence — maps to chat_conversations row
  const [conversationId, setConversationId] = useState<number | null>(null);
  // Mutable refs so async save callbacks always see the latest values
  const conversationIdRef = useRef<number | null>(null);
  const conversationTitleRef = useRef<string>("");
  const lastMuseTitleRef = useRef<string>("");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedTurnRef = useRef<number>(0);
  const lastSavedShelfLenRef = useRef<number>(0);
  const saveConversationNowRef = useRef<
    (msgs: UIMessage[], currentShelf: ArtifactRef[]) => Promise<void>
  >(async () => {});

  const heroRef = useRef<HeroHandle>(null);

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);

  // Ref bridge: shelf state + setViewingUuid are declared AFTER useChat,
  // so onToolCall can't reference them directly. These refs are kept in
  // sync via an effect further down.
  const shelfRef = useRef<ArtifactRef[]>([]);
  const setViewingUuidRef = useRef<(uuid: string | null) => void>(() => {});
  // Same bridge for the chat-log writer (declared below).
  const logEventRef = useRef<(entry: ChatLogEntry) => void>(() => {});
  // Bridges used by wake_muse (Kronus tool intercepted in onToolCall).
  const turnsRef = useRef<Turn[]>([]);
  const buildShelfForMuseRef = useRef<() => Array<{ uuid: string; kind: string; renderMode?: string; title: string; prompt?: string; reason?: string; displayed?: boolean }>>(() => []);
  const loadDisplayedImageDataUrlRef = useRef<() => Promise<string | undefined>>(async () => undefined);
  const setPendingApprovalRef = useRef<(p: PendingApprovalShape | null) => void>(() => {});
  const paintProposalRef = useRef<(prompt: string, renderMode: "mood" | "infographic", turnIndex: number, targetUuid?: string) => Promise<void>>(async () => {});
  const setMuseThoughtsRef = useRef<Dispatch<SetStateAction<MuseThought[]>> | null>(null);
  const setMusePaintingRef = useRef<Dispatch<SetStateAction<boolean>> | null>(null);
  const applyMuseTitleRef = useRef<(title: string | null | undefined, reason?: string | null, turnIndex?: number) => void>(() => {});
  /** Prevent duplicate client execution if the SDK replays a tool call id. */
  const executedToolCallIdsRef = useRef<Set<string>>(new Set());
  const toolSigRef = useRef<Set<string>>(new Set());
  const stopRef = useRef<() => void>(() => {});
  /** Block auto-continue after restoring a saved conversation until the user sends again. */
  const suppressAutoSendRef = useRef(false);
  const [toolLoopBlocked, setToolLoopBlocked] = useState(false);

  const autoSendGate = useCallback(({ messages: msgs }: { messages: UIMessage[] }) => {
    if (suppressAutoSendRef.current) return false;
    const allow = shouldAutoSendAfterToolCalls({ messages: msgs });
    if (!allow && lastAssistantMessageIsCompleteWithToolCalls({ messages: msgs })) {
      queueMicrotask(() => {
        stopRef.current();
        setToolLoopBlocked(true);
      });
    }
    return allow;
  }, []);

  const { messages, sendMessage, status, stop, setMessages, addToolResult } = useChat({
    transport,
    sendAutomaticallyWhen: autoSendGate,
    onFinish: () => {
      // Flush immediately — debounced save can miss a tab freeze/crash within 1s.
      void saveConversationNowRef.current(messagesRef.current, shelfRef.current);
    },
    async onToolCall({ toolCall }) {
      const { toolName, input, toolCallId } = toolCall;
      const args = (input ?? {}) as Record<string, unknown>;

      if (executedToolCallIdsRef.current.has(toolCallId)) return;
      executedToolCallIdsRef.current.add(toolCallId);

      const sig = toolCallSignature(toolName, args);
      const loop = wouldRepeatToolLoop(messagesRef.current, toolName, args);
      if (loop.loopDetected || toolSigRef.current.has(sig)) {
        // Soft path: skip the redundant call and hand the model a clear notice
        // so it can recover and finish on its own. Only a true runaway
        // (loop.hardStop) halts the run and surfaces the banner.
        const output = loop.hardStop ? runawayToolNotice() : identicalToolLimitNotice(toolName);
        addToolResult({ tool: toolName, toolCallId, output });
        logEventRef.current({ kind: "tool_result", name: toolName, ok: false, preview: output.slice(0, 200), ts: Date.now() });
        if (loop.hardStop) {
          queueMicrotask(() => {
            stopRef.current();
            setToolLoopBlocked(true);
          });
        }
        return;
      }
      toolSigRef.current.add(sig);

      // Log the call (chat-log writer is the ref bridge — state lives below).
      const argsPreview = JSON.stringify(args).slice(0, 200);
      logEventRef.current({ kind: "tool_call", name: toolName, argsPreview, ts: Date.now() });

      // Client-side tool: wake_muse runs the muse propose phase from
      // Kronus's request. The result goes through the same accept-flow as
      // a user tick: a single proposal card OR a 4-alternative picker.
      if (toolName === "wake_muse") {
        const intent = String(args.intent ?? "");
        const alternatives = Math.max(1, Math.min(4, Number(args.alternatives ?? 1)));
        // Note: legacy `auto` arg is ignored — Kronus tools never paint
        // without user confirmation. Every paint goes through ApprovalCard.
        setMusePaintingRef.current?.(true);
        try {
          const displayedImageDataUrl = await loadDisplayedImageDataUrlRef.current();
          // Build a synthetic turn so the muse has the intent in context
          // alongside the live conversation.
          const fullTurns = turnsRef.current.map((t) => ({ user: t.userText, assistant: t.assistantText }));
          if (intent.trim()) {
            fullTurns.push({ user: `[Kronus to Muse] ${intent.trim()}`, assistant: "" });
          }
          const res = await fetch("/api/chat-hourglass/muse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "propose",
              turns: fullTurns,
              shelf: buildShelfForMuseRef.current(),
              displayedImageDataUrl,
              chatLog: chatLogRef.current,
              mandatory: true,
              alternatives,
              source: "kronus",
              currentTitle: conversationTitleRef.current,
              conversationId: conversationIdRef.current ?? undefined,
            }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`muse ${res.status}: ${text.slice(0, 160)}`);
          }
          const data = await res.json() as MuseProposeResponse;
          applyMuseTitleRef.current(data.suggestedTitle, data.titleReason, turnsRef.current.length);
          const voice = data.voice;
          const voiceText =
            voice.kind === "poem"
              ? `${voice.poemTitle ?? ""} — ${(voice.poemLines ?? []).join(" / ")}`.trim()
              : (voice.text ?? "");
          const tsWake = Date.now();
          if (voiceText) {
            setMuseThoughtsRef.current?.((prev) =>
              [
                ...prev,
                {
                  id: `wake-voice-${tsWake}`,
                  text: voiceText,
                  turnIndex: turnsRef.current.length,
                  at: tsWake,
                  kind: voice.kind,
                  poemTitle: voice.poemTitle ?? undefined,
                  poemLines: voice.poemLines ?? undefined,
                },
              ].slice(-8),
            );
          }
          logEventRef.current({
            kind: "muse_propose",
            voiceKind: voice.kind,
            voiceText: voiceText || undefined,
            poemTitle: voice.poemTitle,
            poemLines: voice.poemLines,
            turnIndex: turnsRef.current.length,
            proposed: !!(data.shouldPropose && data.proposal),
            reason: data.reason,
            alternativesCount: data.proposal?.alternatives?.length ?? 1,
            ts: tsWake,
          });

          // Push the proposal/picker into UI state via the ref bridge.
          // ALWAYS user-confirmed — there is no auto-accept path; Kronus
          // tools never paint without explicit user accept.
          if (data.shouldPropose && data.proposal) {
            const isAlts = !!data.proposal.alternatives && data.proposal.alternatives.length > 0;
            setPendingApprovalRef.current({
              id: `wake-muse-${Date.now()}`,
              mode: isAlts ? "alternatives" : "single",
              action: data.proposal.action,
              targetUuid: data.proposal.targetUuid,
              renderMode: data.proposal.renderMode ?? undefined,
              prompt: data.proposal.prompt ?? undefined,
              alternatives: isAlts ? data.proposal.alternatives! : undefined,
              reason: data.reason,
              turnIndex: turnsRef.current.length,
            });
          }

          const summary = data.proposal?.alternatives
            ? `The muse offered ${data.proposal.alternatives.length} visual alternatives - confirm in the right panel.`
            : data.proposal
            ? `The muse proposed an image - confirm in the right panel.`
            : `The muse declined to propose. ${data.reason}`;
          addToolResult({ tool: toolName, toolCallId, output: summary });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          addToolResult({ tool: toolName, toolCallId, output: `Error waking muse: ${msg}` });
          logEventRef.current({ kind: "tool_result", name: toolName, ok: false, preview: msg.slice(0, 200), ts: Date.now() });
        } finally {
          setMusePaintingRef.current?.(false);
        }
        return;
      }

      // Kronus's `generate_image` is intercepted here so the image is NOT
      // rendered immediately. Instead an ApprovalCard surfaces in the right
      // panel showing Kronus's prompt + provider/model + any linkage —
      // user must accept before rendering runs.
      if (toolName === "generate_image") {
        const prompt = String(args.prompt ?? "");
        if (!prompt) {
          const output = "generate_image: prompt is required";
          addToolResult({ tool: toolName, toolCallId, output });
          logEventRef.current({ kind: "tool_result", name: toolName, ok: false, preview: output, ts: Date.now() });
          return;
        }
        const renderMode = (args.mode as "mood" | "infographic" | undefined) ?? "mood";
        const toolProvider = (args.provider as "gemini" | "openai" | undefined) ?? "openai";
        const provider = toolProvider === "gemini" ? "google" : "openai";
        const model = args.model as string | undefined;
        const styleHint = args.style_hint as string | undefined;
        const commitHash = args.commit_hash as string | undefined;
        const documentId = args.document_id as number | undefined;
        const portfolioProjectId = args.portfolio_project_id as string | undefined;

        // Build a minimal linked-chip payload for the approval card.
        const linked = commitHash
          ? { kind: "journal" as const, sourceTable: "journal_entries" as const, sourceId: commitHash }
          : documentId
          ? { kind: "document" as const, sourceTable: "documents" as const, sourceId: String(documentId) }
          : portfolioProjectId
          ? { kind: "portfolio" as const, sourceTable: "portfolio_projects" as const, sourceId: portfolioProjectId }
          : undefined;

        setPendingApprovalRef.current({
          id: `gen-image-${Date.now()}`,
          mode: "direct",
          renderMode,
          prompt,
          reason: "Kronus has prepared a prompt for you to confirm before rendering.",
          turnIndex: turnsRef.current.length,
          direct: {
            provider,
            model,
            styleHint,
            linked,
          },
          // Stash the linkage on the approval so accept-direct can forward it
          // to the muse endpoint without re-parsing.
          ...({ _direct: { commitHash, documentId, portfolioProjectId, styleHint, provider, model } } as Record<string, unknown>),
        });

        const output = `Image queued - confirm the prompt in the right panel to render.`;
        addToolResult({ tool: toolName, toolCallId, output });
        logEventRef.current({ kind: "tool_result", name: toolName, ok: true, preview: output, ts: Date.now() });
        return;
      }

      // Client-side tool: set_artifact swaps the displayed artifact on the
      // shelf. No server call — just UI state + ack.
      if (toolName === "set_artifact") {
        const wanted = String(args.uuid ?? "");
        const found = shelfRef.current.find((r) => r.uuid === wanted);
        if (!found) {
          const output = `No artifact with uuid ${wanted} on the shelf. Current shelf has ${shelfRef.current.length} refs.`;
          addToolResult({ tool: toolName, toolCallId, output });
          logEventRef.current({ kind: "tool_result", name: toolName, ok: false, preview: output.slice(0, 200), ts: Date.now() });
          return;
        }
        setViewingUuidRef.current(found.uuid);
        const output = `Displayed: ${found.kind} · ${found.title} (uuid ${found.uuid}).`;
        addToolResult({ tool: toolName, toolCallId, output });
        logEventRef.current({ kind: "tool_result", name: toolName, ok: true, preview: output.slice(0, 200), ts: Date.now() });
        return;
      }

      try {
        const { output } = await executeToolCall(toolName, args as Record<string, any>);
        addToolResult({ tool: toolName, toolCallId, output });
        logEventRef.current({ kind: "tool_result", name: toolName, ok: true, preview: String(output).slice(0, 200), ts: Date.now() });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        addToolResult({ tool: toolName, toolCallId, output: `Error: ${msg}` });
        logEventRef.current({ kind: "tool_result", name: toolName, ok: false, preview: msg.slice(0, 200), ts: Date.now() });
      }
    },
  });

  const isStreaming = status === "streaming";
  const isThinking = status === "submitted";
  const isLive = isStreaming || isThinking;
  stopRef.current = stop;
  const messagesRef = useRef<UIMessage[]>([]);

  const applyRestoredMessages = useCallback((uiMsgs: UIMessage[]) => {
    suppressAutoSendRef.current = true;
    stop();
    executedToolCallIdsRef.current.clear();
    toolSigRef.current.clear();
    setToolLoopBlocked(false);
    if (uiMsgs.length > 0) {
      setMessages(finalizeRestoredUiMessages(uiMsgs));
    }
    queueMicrotask(() => stop());
  }, [setMessages, stop]);

  useEffect(() => {
    if (!suppressAutoSendRef.current) return;
    if (status === "submitted" || status === "streaming") {
      stop();
    }
  }, [status, stop]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Completed turns — frozen while streaming. Rebuilt once when idle so we
  // never walk full message history per token (see lib/hourglass-turns.ts).
  const [completedTurns, setCompletedTurns] = useState<Turn[]>([]);
  useEffect(() => {
    if (isLive) return;
    if (!shouldCommitCompletedTurns(messages)) return;
    setCompletedTurns(buildTurnsFromMessages(messages));
  }, [isLive, messages]);

  const turns = completedTurns;

  const liveTail = useMemo(
    () => extractLiveTail(messages, isLive),
    [messages, isLive],
  );

  // ─── Artifact shelf ─────────────────────────────────────────────────────
  // Append-only list of refs pointing to tartarus_objects. Each time the
  // muse paints / the user adds / Kronus fetches, a new ref is pushed.
  const [shelf, setShelf] = useState<ArtifactRef[]>([]);
  // The currently displayed artifact, pointed at by uuid.
  const [viewingUuid, setViewingUuid] = useState<string | null>(null);
  // Full hydrated artifact (fetched on demand from /api/chat-hourglass/artifact/[uuid]).
  const [hydratedArtifact, setHydratedArtifact] = useState<Artifact | null>(null);
  const [hydrating, setHydrating] = useState(false);
  // The latest muse "silence" reason (when the muse ticked but decided not to paint).
  const [museSilenceReason, setMuseSilenceReason] = useState<string | null>(null);

  // Muse thought stream — literary observations + propose voices.
  // Cheap observer lines are logged as `muse_thought`; propose ticks log
  // `muse_propose` with `voiceText` — both are restored from `chat_log`.
  const [museThoughts, setMuseThoughts] = useState<MuseThought[]>([]);
  useEffect(() => {
    setMuseThoughtsRef.current = setMuseThoughts;
  }, [setMuseThoughts]);

  // Concurrency lock: the muse paints ONE image at a time. A new paint
  // call is refused while `musePainting` is true so we never double-invoke
  // the painter and never duplicate turns' artifacts.
  const [musePainting, setMusePainting] = useState(false);
  useEffect(() => { setMusePaintingRef.current = setMusePainting; }, []);

  // Pending image approval — UNIFIED across all three sources:
  //   • muse auto-tick → mode: "single"
  //   • composer paint → mode: "alternatives"
  //   • Kronus generate_image → mode: "direct"
  // No paint runs without explicit user accept/pick. See ApprovalCard.tsx.
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);

  // Image edit popover — anchored over the displayed image. The muse
  // receives the current image + the prompt and produces a mutation via
  // /muse/edit. The resulting artifact is pushed to the shelf alongside
  // the original (tagged `muse-edited`, so history is preserved).
  const [editPopoverOpen, setEditPopoverOpen] = useState(false);
  const [editPopoverError, setEditPopoverError] = useState<string | null>(null);

  // ─── Chat log ──────────────────────────────────────────────────────────
  // Append-only event stream the muse and Kronus both read. See
  // web/lib/chat-log.ts. Persisted alongside the conversation.
  const [chatLog, setChatLog] = useState<ChatLogEntry[]>([]);
  const chatLogRef = useRef<ChatLogEntry[]>([]);
  useEffect(() => { chatLogRef.current = chatLog; }, [chatLog]);
  /** Append an entry to the chat log. Stable reference for use in callbacks. */
  const logEvent = useCallback((entry: ChatLogEntry) => {
    setChatLog((prev) => appendEntry(prev, entry));
  }, []);

  /** Append a ref to the shelf and focus it. Idempotent on uuid. */
  const pushArtifact = useCallback((ref: ArtifactRef) => {
    setShelf((prev) => (prev.some((r) => r.uuid === ref.uuid) ? prev : [...prev, ref]));
    setViewingUuid(ref.uuid);
    setMuseSilenceReason(null);
    // Log the shelf addition.
    logEvent({
      kind: "shelf_add",
      uuid: ref.uuid,
      artifactKind: ref.kind,
      renderMode: ref.renderMode,
      title: ref.title,
      source: ref.source === "muse-auto" ? "muse-auto"
        : ref.source === "muse-forced" ? "muse-forced"
        : ref.source === "muse-edited" ? "muse-edited"
        : ref.source === "kronus-tool" ? "kronus-tool"
        : "user-add",
      reason: ref.summary,
      ts: Date.now(),
    });
  }, [logEvent]);

  // Keep the ref bridges (used by useChat.onToolCall) in sync.
  useEffect(() => { shelfRef.current = shelf; }, [shelf]);
  useEffect(() => { setViewingUuidRef.current = setViewingUuid; }, []);
  useEffect(() => { logEventRef.current = logEvent; }, [logEvent]);
  useEffect(() => { conversationIdRef.current = conversationId; }, [conversationId]);
  useEffect(() => { conversationTitleRef.current = conversationTitle; }, [conversationTitle]);
  useEffect(() => { turnsRef.current = turns; }, [turns]);
  useEffect(() => { setPendingApprovalRef.current = setPendingApproval; }, []);

  // Log new completed turns to the chat log. We diff against
  // `lastLoggedTurnRef` so a re-render doesn't double-log.
  const lastLoggedTurnRef = useRef<number>(0);
  useEffect(() => {
    if (turns.length <= lastLoggedTurnRef.current) return;
    const newTurns = turns.slice(lastLoggedTurnRef.current);
    lastLoggedTurnRef.current = turns.length;
    for (const t of newTurns) {
      if (t.userText) {
        logEvent({ kind: "user_message", text: t.userText, ts: t.startedAt });
      }
      if (t.assistantText) {
        logEvent({ kind: "assistant_message", text: t.assistantText, ts: Date.now() });
      }
    }
  }, [turns, logEvent]);

  // ─── Conversation persistence ────────────────────────────────────────────

  /** Build the PATCH/POST body used by save + unload beacon. */
  const buildConversationSaveBody = useCallback((msgs: UIMessage[], currentShelf: ArtifactRef[]) => ({
    title: conversationTitleRef.current || "untitled conversation",
    messages: sanitizeMessagesForPersist(
      msgs.filter((m) => m.role === "user" || m.role === "assistant").map(uiToChat),
    ),
    sessionConfig: sessionConfigRef.current,
    artifactRefs: currentShelf,
    chatLog: chatLogRef.current,
  }), []);

  const saveConversationNow = useCallback(async (msgs: UIMessage[], currentShelf: ArtifactRef[]) => {
    if (msgs.length === 0) return;
    const body = buildConversationSaveBody(msgs, currentShelf);
    const cid = conversationIdRef.current;
    try {
      if (cid === null) {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const json = await res.json() as { id: number };
          conversationIdRef.current = json.id;
          setConversationId(json.id);
        }
      } else {
        await fetch(`/api/conversations/${cid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
    } catch (err) {
      console.warn("[hourglass] conversation save failed:", err);
    }
  }, [buildConversationSaveBody]);

  useEffect(() => {
    saveConversationNowRef.current = saveConversationNow;
  }, [saveConversationNow]);

  /** Upsert the conversation to the API (debounced, 1 s). */
  const scheduleSave = useCallback((msgs: UIMessage[], currentShelf: ArtifactRef[]) => {
    if (msgs.length === 0) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void saveConversationNow(msgs, currentShelf);
    }, 1000);
  }, [saveConversationNow]);

  const applyMuseTitle = useCallback((suggestedTitle: string | null | undefined, reason?: string | null, turnIndex?: number) => {
    const next = normalizeMuseTitle(suggestedTitle);
    if (!next) return;
    const current = conversationTitleRef.current.trim();
    if (current.toLowerCase() === next.toLowerCase()) return;
    if (lastMuseTitleRef.current.toLowerCase() === next.toLowerCase()) return;

    lastMuseTitleRef.current = next;
    conversationTitleRef.current = next;
    setConversationTitle(next);
    logEvent({
      timestamp: new Date().toISOString(),
      actor: "assistant",
      eventType: "status",
      text: `Muse renamed chat: ${next}`,
      params: {
        kind: "title_update",
        title: next,
        previousTitle: current || null,
        reason: reason ?? null,
        turnIndex: turnIndex ?? turnsRef.current.length,
      },
    });
    scheduleSave(messages, shelfRef.current);
  }, [logEvent, messages, scheduleSave]);

  useEffect(() => { applyMuseTitleRef.current = applyMuseTitle; }, [applyMuseTitle]);

  /** On mount: load recent conversations, auto-restore the latest if < 24 h old. */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/conversations?limit=8");
        if (!res.ok) return;
        const { conversations } = await res.json() as {
          conversations: Array<{
            id: number;
            title: string;
            updated_at: string;
            summary?: string | null;
            summary_updated_at?: string | null;
          }>;
        };
        if (!conversations.length) return;
        setRecentConversations(conversations);
        const latest = conversations[0];
        const age = Date.now() - new Date(latest.updated_at).getTime();
        if (age > 24 * 60 * 60 * 1000) return; // stale — show history but don't auto-restore
        // Fetch full conversation
        const full = await fetch(`/api/conversations/${latest.id}`);
        if (!full.ok) return;
        const conv = await full.json() as { id: number; title: string; messages: ChatMessage[]; session_config?: string | null; artifact_refs?: string; chat_log?: string; updated_at: string };
        // Restore messages
        const uiMsgs = chatMessagesToUI(conv.messages ?? []);
        if (uiMsgs.length > 0) applyRestoredMessages(uiMsgs);
        // Restore shelf
        let refs: ArtifactRef[] = [];
        try {
          refs = JSON.parse(conv.artifact_refs ?? "[]") as ArtifactRef[];
        } catch { /* ignore */ }
        if (refs.length > 0) {
          setShelf(refs);
          setViewingUuid(refs[refs.length - 1].uuid);
        }
        // Restore chat log + mark a session_resumed entry so the muse can
        // distinguish a fresh page load from a fresh exchange.
        let restoredLog: ChatLogEntry[] = [];
        try {
          restoredLog = JSON.parse(conv.chat_log ?? "[]") as ChatLogEntry[];
        } catch { /* ignore */ }
        if (uiMsgs.length > 0) {
          // We're rehydrating a real conversation — log the resume.
          const turnCount = uiMsgs.filter((m) => m.role === "assistant").length;
          restoredLog = [
            ...restoredLog,
            { kind: "session_resumed", fromTurnCount: turnCount, ts: Date.now() },
          ];
        }
        setChatLog(restoredLog);
        setMuseThoughts(extractMuseThoughtsFromChatLog(restoredLog));
        // Tell the message-logger effect that everything we just restored
        // has already been logged — don't double-log on the next render.
        lastLoggedTurnRef.current = uiMsgs.filter((m) => m.role === "assistant").length;
        // Restore metadata
        setConversationId(conv.id);
        setConversationTitle(conv.title);
        lastMuseTitleRef.current = conv.title;
        setConversationStartedAt(new Date(conv.updated_at).getTime());
        restoreSessionConfig(conv.session_config);
      } catch (err) {
        console.warn("[hourglass] conversation restore failed:", err);
      }
    })();
  }, [applyRestoredMessages, restoreSessionConfig]);

  const streamingAssistantText = liveTail?.assistantText || undefined;
  const pendingUserText = liveTail ? liveTail.userText : undefined;
  const activeToolCalls = liveTail?.toolCalls ?? [];

  // ─── Dev memory telemetry ───────────────────────────────────────────────
  // Sampled every 3 s; tagged with live chat context so the post-mortem of
  // a crash can pinpoint which surface was growing. See /lib/dev-memlog.
  // Refs keep the context provider closure stable across renders.
  const memCtxRef = useRef<() => Record<string, unknown>>(() => ({}));
  memCtxRef.current = () => ({
    conversationId: conversationIdRef.current,
    isStreaming,
    isThinking,
    musePainting,
    messages: messages.length,
    turns: turns.length,
    shelf: shelf.length,
    museThoughts: museThoughts.length,
    chatLog: chatLog.length,
    streamingChars: streamingAssistantText?.length ?? 0,
    pendingApproval: !!pendingApproval,
  });
  useEffect(() => {
    const ctx = () => memCtxRef.current();
    startMemLog({ intervalMs: 3000, getCtx: ctx });
    setClientErrorContext(ctx);
  }, []);
  // Hard markers around the streaming lifecycle make the log easy to scan.
  useEffect(() => {
    if (isStreaming || isThinking) markMem(isThinking ? "stream_submit" : "stream_start");
    else markMem("stream_idle");
  }, [isStreaming, isThinking]);

  // Title — neutral until the Muse has enough context to name the exchange.
  useEffect(() => {
    if (!conversationTitle && messages.length > 0) {
      setConversationTitle("untitled conversation");
    }
  }, [messages, conversationTitle]);

  // Autosave: after each turn completes (streaming done) and when shelf changes.
  useEffect(() => {
    if (isStreaming || isThinking) return;
    if (turns.length === 0) return;
    // Save on every new completed turn — immediate, not debounced (onFinish also flushes).
    if (turns.length !== lastSavedTurnRef.current) {
      lastSavedTurnRef.current = turns.length;
      void saveConversationNow(messages, shelfRef.current);
    }
  }, [turns.length, isStreaming, isThinking, messages, saveConversationNow]);

  // Last-resort flush when the tab unloads after a long stream (sendBeacon survives navigation).
  useEffect(() => {
    const flushOnUnload = () => {
      const msgs = messagesRef.current;
      if (msgs.length === 0) return;
      const cid = conversationIdRef.current;
      if (cid === null) return;
      try {
        const body = JSON.stringify(buildConversationSaveBody(msgs, shelfRef.current));
        const blob = new Blob([body], { type: "text/plain" });
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          navigator.sendBeacon(`/api/conversations/${cid}`, blob);
        }
      } catch { /* telemetry must never block unload */ }
    };
    window.addEventListener("pagehide", flushOnUnload);
    return () => window.removeEventListener("pagehide", flushOnUnload);
  }, [buildConversationSaveBody]);

  // Also save whenever the shelf gains a new item (muse paint / user add)
  useEffect(() => {
    if (isStreaming || isThinking) return;
    if (shelf.length === 0) return;
    if (shelf.length !== lastSavedShelfLenRef.current) {
      lastSavedShelfLenRef.current = shelf.length;
      scheduleSave(messages, shelf);
    }
  }, [shelf, isStreaming, isThinking, messages, scheduleSave]);

  // ─── Muse refs + tick (declared before effects so baseline runs first) ─
  const observeMuse = useMuseObserver();
  const lastObservedTurn = useRef<number>(0);
  const callMuse = useMuse();
  const callMuseEdit = useMuseEdit();
  const lastMuseTickAt = useRef<number>(0);
  /** Baseline `turns.length` after the first time we see real turns this session. Stays null until then so async restore does not snapshot 0. */
  const mountedTurnsRef = useRef<number | null>(null);

  // Anchor the muse tick gate on the first *non-zero* turn count (fixes
  // restore: first effect tick used to see turns=0, then history loaded to
  // N and looked like N "new" turns). Must run before the muse observer so
  // we do not call /observe on rehydrated history.
  useEffect(() => {
    if (turns.length === 0) return;
    if (mountedTurnsRef.current !== null) return;
    mountedTurnsRef.current = turns.length;
    lastObservedTurn.current = turns.length;
  }, [turns.length]);

  // The Muse observer: drops a literary thought after every new turn
  // (except tick-turns, which run the full decide+paint path). Logged as
  // `muse_thought` for persistence.
  useEffect(() => {
    if (isStreaming || isThinking) return;
    if (turns.length === 0) return;
    if (turns.length % MUSE_TICK_EVERY === 0) return; // tick turns go to the paint path
    if (lastObservedTurn.current >= turns.length) return;
    lastObservedTurn.current = turns.length;

    const turnIndex = turns.length;
    const ts = Date.now();
    observeMuse(
      turns.slice(-3).map((t) => ({ user: t.userText, assistant: t.assistantText })),
      conversationIdRef.current ?? undefined,
    ).then((thought) => {
      if (!thought) return;
      logEvent({ kind: "muse_thought", text: thought, turnIndex, ts });
      setMuseThoughts((prev) =>
        [
          ...prev,
          { id: `thought-${turnIndex}-${ts}`, text: thought, turnIndex, at: ts },
        ].slice(-8),
      );
    });
  }, [turns, isStreaming, isThinking, observeMuse, logEvent]);

  // ─── Muse propose tick ─────────────────────────────────────────────────
  // The muse never paints automatically. Every MUSE_TICK_EVERY *new* user
  // turns after the session baseline, she runs propose. Silent on reload.

  /** Build the compact shelf payload the muse uses to know what's already painted. */
  const buildShelfForMuse = useCallback((): MuseShelfRef[] => {
    return shelfRef.current.map((r) => ({
      uuid: r.uuid,
      kind: r.kind,
      renderMode: r.renderMode,
      title: r.title,
      // The shelf snapshot doesn't carry the full prompt or reason; title +
      // summary are best-effort proxies. Hydration would give the full body
      // but is too expensive to do for every shelf item every tick.
      prompt: r.title,
      reason: r.summary,
      displayed: r.uuid === viewingUuid,
    }));
  }, [viewingUuid]);

  /** Fetch the currently-displayed image as a reduced base64 data URL so the
   *  muse can SEE it in her multimodal call without sending full shelf images
   *  into vision context. Returns undefined when there's no displayed image. */
  const loadDisplayedImageDataUrl = useCallback(async (): Promise<string | undefined> => {
    const ref = shelfRef.current.find((r) => r.uuid === viewingUuid);
    if (!ref || !ref.thumbUrl) return undefined;
    try {
      const res = await fetch(ref.thumbUrl);
      if (!res.ok) return undefined;
      const blob = await res.blob();
      const source = new File([blob], ref.title || "shelf-image", {
        type: blob.type || "image/png",
      });
      const reduced = await compressImage(source, {
        maxDimension: MUSE_VISION_MAX_EDGE,
        maxSizeBytes: MUSE_VISION_MAX_BYTES,
        initialQuality: 0.78,
        minQuality: 0.52,
        qualityStep: 0.08,
      });
      return await fileToDataUrl(reduced.blob);
    } catch {
      return undefined;
    }
  }, [viewingUuid]);

  // Sync the ref bridges for wake_muse. These are read inside onToolCall.
  useEffect(() => { buildShelfForMuseRef.current = buildShelfForMuse; }, [buildShelfForMuse]);
  useEffect(() => { loadDisplayedImageDataUrlRef.current = loadDisplayedImageDataUrl; }, [loadDisplayedImageDataUrl]);

  useEffect(() => {
    if (isStreaming || isThinking) return;
    if (imagesEnabled) return;
    if (turns.length < 2) return;
    if (musePainting) return;
    if (pendingApproval) return; // a proposal is awaiting decision; don't pile on

    // Mount-time turn count gates the tick. The muse stays SILENT on
    // reload — she only fires after 3 *new* user turns this session.
    const mounted = mountedTurnsRef.current ?? turns.length;
    const newSinceMount = turns.length - mounted;
    if (newSinceMount < MUSE_TICK_EVERY) return;
    if (newSinceMount % MUSE_TICK_EVERY !== 0) return;
    if (lastMuseTickAt.current === turns.length) return;

    lastMuseTickAt.current = turns.length;
    const turnIndex = turns.length;

    (async () => {
      const displayedImageDataUrl = await loadDisplayedImageDataUrl();
      try {
        const res = (await callMuse({
          mode: "propose",
          turns: turns.map((t) => ({ user: t.userText, assistant: t.assistantText })),
          shelf: buildShelfForMuse(),
          displayedImageDataUrl,
          chatLog: chatLogRef.current,
          mandatory: false,
          alternatives: 1,
          source: "auto-tick",
          currentTitle: conversationTitleRef.current,
          conversationId: conversationIdRef.current ?? undefined,
          activeSkills: activeSkillSlugs,
        })) as MuseProposeResponse;
        applyMuseTitle(res.suggestedTitle, res.titleReason, turnIndex);

        // Voice always present. Push it onto the thought stream.
        const voice = res.voice;
        const voiceText = voice.kind === "poem"
          ? `${voice.poemTitle ?? ""} — ${(voice.poemLines ?? []).join(" / ")}`.trim()
          : (voice.text ?? "");
        if (voiceText) {
          setMuseThoughts((prev) => [
            ...prev,
            {
              id: `voice-${turnIndex}-${Date.now()}`,
              text: voiceText,
              turnIndex,
              at: Date.now(),
              kind: voice.kind,
              poemTitle: voice.poemTitle ?? undefined,
              poemLines: voice.poemLines ?? undefined,
            },
          ].slice(-8));
        }

        // Log the propose tick (voice text is restored into the mood panel).
        logEvent({
          kind: "muse_propose",
          voiceKind: voice.kind,
          voiceText: voiceText || undefined,
          poemTitle: voice.poemTitle,
          poemLines: voice.poemLines,
          turnIndex,
          proposed: !!(res.shouldPropose && res.proposal),
          reason: res.reason,
          alternativesCount: res.proposal?.alternatives?.length ?? 1,
          ts: Date.now(),
        });

        // Stash the proposal (single OR alternatives picker).
        if (res.shouldPropose && res.proposal) {
          const isAlts = !!res.proposal.alternatives && res.proposal.alternatives.length > 0;
          setPendingApproval({
            id: `proposal-${turnIndex}-${Date.now()}`,
            mode: isAlts ? "alternatives" : "single",
            action: res.proposal.action ?? undefined,
            targetUuid: res.proposal.targetUuid,
            renderMode: res.proposal.renderMode ?? undefined,
            prompt: res.proposal.prompt ?? undefined,
            alternatives: isAlts ? res.proposal.alternatives! : undefined,
            reason: res.reason,
            turnIndex,
          });
        } else if (res.reason) {
          setMuseSilenceReason(res.reason);
        }
      } catch (err) {
        console.warn("[hourglass] muse propose failed:", err);
      }
    })();
  }, [turns, isStreaming, isThinking, imagesEnabled, musePainting, pendingApproval, activeSkillSlugs, callMuse, buildShelfForMuse, loadDisplayedImageDataUrl, applyMuseTitle]);

  // Hydrate the currently-viewed artifact when viewingUuid changes.
  useEffect(() => {
    if (!viewingUuid) {
      setHydratedArtifact(null);
      return;
    }
    const ref = shelf.find((r) => r.uuid === viewingUuid);
    if (!ref) return;
    let cancelled = false;
    setHydratedArtifact(null);
    setHydrating(true);
    fetch(`/api/chat-hourglass/artifact/${viewingUuid}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`hydration ${res.status}`);
        const body = (await res.json()) as ArtifactBody;
        if (cancelled) return;
        setHydratedArtifact({ ...ref, body });
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[hourglass] hydration failed:", err);
          setHydratedArtifact(null);
        }
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewingUuid, shelf]);

  // Handlers
  const handleSend = useCallback(async (rawIn: string, files?: FileList) => {
    const raw = rawIn.trim();
    const hasFiles = Boolean(files?.length);
    if (!raw && !hasFiles) return;
    let text = raw || "What do you see in this image?";

    // Daimon polish: when toggled on, briefly polish the input via /api/daimon/polish
    if (daimonActive) {
      setDaimonPending(true);
      try {
        const res = await fetch("/api/daimon/polish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, context: messages.slice(-3).map(messageToText) }),
        });
        if (res.ok) {
          const json = await res.json();
          if (typeof json.polished === "string" && json.polished.trim()) text = json.polished.trim();
        }
      } catch (err) {
        console.warn("[hourglass] daimon polish failed:", err);
      } finally {
        setDaimonPending(false);
      }
    }

    if (isLive) stop();
    suppressAutoSendRef.current = false;
    executedToolCallIdsRef.current.clear();
    toolSigRef.current.clear();
    setToolLoopBlocked(false);
    if (messages.length === 0) setConversationStartedAt(Date.now());
    // Ship shelf + displayed artifact so Kronus can see what's on the
    // shared panel. The server resolves the displayed uuid to full content
    // and includes compact refs for the rest of the shelf.
    const shelfForKronus = shelf.map((r) => ({
      uuid: r.uuid,
      kind: r.kind,
      title: r.title,
      summary: r.summary,
      turnIndex: r.turnIndex,
    }));
    const activeModel = CHAT_MODELS.find((m) => m.key === modelConfig.model);
    const modelConfigForSend =
      hasFiles && activeModel?.provider === "anthropic"
        ? {
            model: imagesProvider === "openai" ? DEFAULT_OPENAI_IMAGE_CHAT_MODEL : DEFAULT_IMAGE_CHAT_MODEL,
            reasoningEnabled: false,
          }
        : modelConfig;
    if (modelConfigForSend.model !== modelConfig.model) {
      setChatModel(modelConfigForSend.model);
      setImagesEnabled(true);
    }
    const visualIntent = asksForVisualTool(text);
    const toolsConfigForSend = visualIntent
      ? { ...toolsConfig, imageGeneration: true }
      : toolsConfig;
    if (visualIntent && !imagesEnabled) setImagesEnabled(true);

    let conversationIdForSend = conversationIdRef.current;
    if (conversationIdForSend === null) {
      const firstMessage: ChatMessage = {
        id: `preflight-user-${Date.now()}`,
        role: "user",
        content: text,
        parts: [{ type: "text", text }],
        createdAt: new Date().toISOString(),
      };
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: conversationTitleRef.current || text.slice(0, 80) || "untitled conversation",
            messages: [firstMessage],
            sessionConfig: sessionConfigRef.current,
            artifactRefs: shelfRef.current,
            chatLog: chatLogRef.current,
          }),
        });
        if (res.ok) {
          const json = await res.json() as { id: number };
          conversationIdForSend = json.id;
          conversationIdRef.current = json.id;
          setConversationId(json.id);
        }
      } catch (err) {
        console.warn("[hourglass] conversation preflight save failed:", err);
      }
    }

    sendMessage(
      { text, files },
      {
        body: {
          soulConfig,
          toolsConfig: toolsConfigForSend,
          modelConfig: modelConfigForSend,
          activeSkillSlugs,
          displayedArtifactUuid: viewingUuid,
          shelf: shelfForKronus,
          chatLog: chatLogRef.current,
          // Used by /api/chat → observability to tag every trace span
          // with this chat's conversation_id for the cost meter.
          conversationId: conversationIdForSend ?? undefined,
        },
      },
    );
  }, [daimonActive, isLive, messages, sendMessage, soulConfig, stop, toolsConfig, modelConfig, imagesProvider, activeSkillSlugs, shelf, viewingUuid, imagesEnabled]);

  const handleNewChat = useCallback(() => {
    stop();
    executedToolCallIdsRef.current.clear();
    toolSigRef.current.clear();
    setToolLoopBlocked(false);
    suppressAutoSendRef.current = false;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setMessages([]);
    setCompletedTurns([]);
    setComposerDraftResetNonce((n) => n + 1);
    setShelf([]);
    setViewingUuid(null);
    setHydratedArtifact(null);
    setMuseSilenceReason(null);
    setMuseThoughts([]);
    setChatLog([]);
    lastLoggedTurnRef.current = 0;
    lastMuseTickAt.current = 0;
    lastObservedTurn.current = 0;
    mountedTurnsRef.current = null;
    lastSavedTurnRef.current = 0;
    lastSavedShelfLenRef.current = 0;
    lastMuseTitleRef.current = "";
    setConversationTitle("");
    setConversationStartedAt(Date.now());
    setConversationId(null);
    setSoulConfig(LEAN_SOUL_CONFIG);
    setBaseToolsConfig(LEAN_TOOLS_CONFIG);
    setChatModel(DEFAULT_CHAT_MODEL);
    setActiveSkillSlugs([]);
    setImagesEnabled(false);
    setImagesProvider("google");
  }, [setMessages, stop]);

  const handleLoadConversation = useCallback(async (id: number) => {
    handleNewChat();
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) return;
      const conv = await res.json() as { id: number; title: string; messages: ChatMessage[]; session_config?: string | null; artifact_refs?: string; chat_log?: string; updated_at: string };
      const uiMsgs = chatMessagesToUI(conv.messages ?? []);
      if (uiMsgs.length > 0) applyRestoredMessages(uiMsgs);
      try {
        const refs = JSON.parse(conv.artifact_refs ?? "[]") as ArtifactRef[];
        if (refs.length > 0) { setShelf(refs); setViewingUuid(refs[refs.length - 1].uuid); }
      } catch { /* ignore */ }
      // Restore chat log + append session_resumed.
      let restoredLog: ChatLogEntry[] = [];
      try {
        restoredLog = JSON.parse(conv.chat_log ?? "[]") as ChatLogEntry[];
      } catch { /* ignore */ }
      const turnCount = uiMsgs.filter((m) => m.role === "assistant").length;
      if (uiMsgs.length > 0) {
        restoredLog = [...restoredLog, { kind: "session_resumed", fromTurnCount: turnCount, ts: Date.now() }];
      }
      setChatLog(restoredLog);
      setMuseThoughts(extractMuseThoughtsFromChatLog(restoredLog));
      lastLoggedTurnRef.current = turnCount;
      setConversationId(conv.id);
      setConversationTitle(conv.title);
      lastMuseTitleRef.current = conv.title;
      setConversationStartedAt(new Date(conv.updated_at).getTime());
      restoreSessionConfig(conv.session_config);
    } catch (err) {
      console.warn("[hourglass] conversation load failed:", err);
    }
  }, [applyRestoredMessages, handleNewChat, restoreSessionConfig]);

  // Regen: re-paint the currently-viewed artifact with the same prompt
  // (generate/source=proposal), or fall back to direct generation from
  // context if no stored prompt is available.
  const handleRegen = useCallback(async () => {
    if (musePainting) return;
    const turnIndex = turns.length;
    setMusePainting(true);
    try {
      if (hydratedArtifact && hydratedArtifact.body.kind === "muse-image" && hydratedArtifact.body.prompt) {
        const res = (await callMuse({
          mode: "generate",
          source: "proposal",
          prompt: hydratedArtifact.body.prompt,
          renderMode: hydratedArtifact.body.renderMode ?? "mood",
          conversationId: conversationIdRef.current ?? undefined,
        })) as MuseGenerateResponse;
        if (res.artifactRef) pushArtifact({ ...res.artifactRef, turnIndex });
        else setMuseSilenceReason(res.reason ?? res.error ?? "muse could not render");
        return;
      }
      const displayedImageDataUrl = await loadDisplayedImageDataUrl();
      const res = (await callMuse({
        mode: "generate",
        source: "direct",
        renderMode: "mood",
        turns: turns.map((t) => ({ user: t.userText, assistant: t.assistantText })),
        shelf: buildShelfForMuse(),
        displayedImageDataUrl,
        conversationId: conversationIdRef.current ?? undefined,
      })) as MuseGenerateResponse;
      if (!res.artifactRef) {
        setMuseSilenceReason(res.reason ?? res.error ?? "muse could not render");
        return;
      }
      pushArtifact({ ...res.artifactRef, turnIndex });
    } catch (err) {
      setMuseSilenceReason(`muse failed: ${String(err)}`);
    } finally {
      setMusePainting(false);
    }
  }, [turns, hydratedArtifact, musePainting, callMuse, pushArtifact, buildShelfForMuse, loadDisplayedImageDataUrl]);

  // Composer paint button: forced direct generation. The muse composes a
  // concrete prompt from full context (conversation + shelf + displayed
  // image) — but no longer paints directly. Instead, asks the muse to
  // PROPOSE 4 alternatives in mandatory mode. The user picks one via the
  // ProposalPicker UI; that pick goes through generate / source=proposal.
  const handlePaint = useCallback(async () => {
    if (turns.length === 0) return;
    if (musePainting) return;
    if (pendingApproval) return; // already showing a proposal
    setMusePainting(true);
    try {
      const displayedImageDataUrl = await loadDisplayedImageDataUrl();
      const res = (await callMuse({
        mode: "propose",
        turns: turns.map((t) => ({ user: t.userText, assistant: t.assistantText })),
        shelf: buildShelfForMuse(),
        displayedImageDataUrl,
        chatLog: chatLogRef.current,
        mandatory: true,
        alternatives: 4,
        source: "user",
        currentTitle: conversationTitleRef.current,
        activeSkills: activeSkillSlugs,
        conversationId: conversationIdRef.current ?? undefined,
      })) as MuseProposeResponse;
      applyMuseTitle(res.suggestedTitle, res.titleReason, turns.length);

      // Voice goes on the thought stream regardless.
      const voice = res.voice;
      const voiceText = voice.kind === "poem"
        ? `${voice.poemTitle ?? ""} — ${(voice.poemLines ?? []).join(" / ")}`.trim()
        : (voice.text ?? "");
      if (voiceText) {
        setMuseThoughts((prev) => [
          ...prev,
          {
            id: `voice-paint-${Date.now()}`,
            text: voiceText,
            turnIndex: turns.length,
            at: Date.now(),
            kind: voice.kind,
            poemTitle: voice.poemTitle ?? undefined,
            poemLines: voice.poemLines ?? undefined,
          },
        ].slice(-8));
      }

      logEvent({
        kind: "muse_propose",
        voiceKind: voice.kind,
        voiceText: voiceText || undefined,
        poemTitle: voice.poemTitle,
        poemLines: voice.poemLines,
        turnIndex: turns.length,
        proposed: !!(res.shouldPropose && res.proposal),
        reason: res.reason,
        alternativesCount: res.proposal?.alternatives?.length ?? 1,
        ts: Date.now(),
      });

      if (res.shouldPropose && res.proposal) {
        const isAlts = !!res.proposal.alternatives && res.proposal.alternatives.length > 0;
        setPendingApproval({
          id: `proposal-paint-${Date.now()}`,
          mode: isAlts ? "alternatives" : "single",
          action: res.proposal.action ?? undefined,
          targetUuid: res.proposal.targetUuid,
          renderMode: res.proposal.renderMode ?? undefined,
          prompt: res.proposal.prompt ?? undefined,
          alternatives: isAlts ? res.proposal.alternatives! : undefined,
          reason: res.reason,
          turnIndex: turns.length,
        });
      } else {
        setMuseSilenceReason(res.reason ?? "The muse declined to propose.");
      }
    } catch (err) {
      setMuseSilenceReason(`muse failed: ${String(err)}`);
    } finally {
      setMusePainting(false);
    }
  }, [turns, musePainting, pendingApproval, callMuse, buildShelfForMuse, loadDisplayedImageDataUrl, logEvent, activeSkillSlugs, applyMuseTitle]);

  /** Internal: render a concrete prompt+renderMode (the chosen proposal or
   *  alternative). Uses generate/source=proposal — no re-decision.
   *  Optional `linkage` + `styleHint` forwarded for Kronus-direct paths so
   *  the rendered image attaches to the journal/doc/portfolio Kronus named. */
  const paintProposal = useCallback(async (
    prompt: string,
    renderMode: "mood" | "infographic",
    turnIndex: number,
    targetUuid?: string | null,
    extras?: {
      styleHint?: string;
      commitHash?: string;
      documentId?: number;
      portfolioProjectId?: string;
      provider?: "google" | "openai";
      painterModel?: string;
    },
    choiceLog?: MuseVisualChoiceLog,
  ) => {
    setMusePainting(true);
    try {
      const res = (await callMuse({
        mode: "generate",
        source: "proposal",
        prompt,
        renderMode,
        targetUuid: targetUuid ?? undefined,
        styleHint: extras?.styleHint,
        commit_hash: extras?.commitHash,
        document_id: extras?.documentId,
        portfolio_project_id: extras?.portfolioProjectId,
        conversationId: conversationIdRef.current ?? undefined,
        ...(extras?.provider ? { provider: extras.provider } : {}),
        ...(extras?.painterModel ? { painterModel: extras.painterModel } : {}),
      } as Parameters<typeof callMuse>[0])) as MuseGenerateResponse;
      if (res.artifactRef) {
        const artifactRef = { ...res.artifactRef, turnIndex };
        const nextShelf = shelfRef.current.some((r) => r.uuid === artifactRef.uuid)
          ? shelfRef.current
          : [...shelfRef.current, artifactRef];
        shelfRef.current = nextShelf;
        pushArtifact(artifactRef);
        void saveConversationNow(messagesRef.current, nextShelf);
        logEvent({ kind: "muse_paint", uuid: res.artifactRef.uuid, renderMode, ts: Date.now() });
        if (choiceLog) {
          logEvent({
            timestamp: new Date().toISOString(),
            actor: "assistant",
            eventType: "artifact",
            text: `Muse rendered ${choiceLog.selected.label}`,
            params: {
              kind: "muse_visual_choice",
              uuid: res.artifactRef.uuid,
              source: choiceLog.source,
              reason: choiceLog.reason,
              selectedIndex: choiceLog.selectedIndex,
              selected: choiceLog.selected,
              alternatives: choiceLog.alternatives,
            },
          });
        }
      } else {
        setMuseSilenceReason(res.reason ?? res.error ?? "muse could not render");
      }
    } catch (err) {
      setMuseSilenceReason(`muse failed: ${String(err)}`);
    } finally {
      setMusePainting(false);
    }
  }, [callMuse, pushArtifact, logEvent]);

  // Sync paintProposal into the ref bridge so wake_muse(auto:true) can call it.
  useEffect(() => { paintProposalRef.current = paintProposal; }, [paintProposal]);

  /** Image-to-image mutation via /muse/edit. Mirrors paintProposal but
   *  sends the currently-displayed image as the source. The new artifact
   *  lands on the shelf as a separate entry (kind=muse-image, source=
   *  muse-edited), so the original stays intact. v1 is single-shot — no
   *  alternatives, no approval card. */
  const paintEdit = useCallback(async (prompt: string) => {
    if (musePainting) return;
    const ref = shelfRef.current.find((r) => r.uuid === viewingUuid);
    if (!ref) {
      setEditPopoverError("no image selected");
      return;
    }
    setEditPopoverError(null);
    setMusePainting(true);
    try {
      const sourceImageDataUrl = await loadDisplayedImageDataUrl();
      if (!sourceImageDataUrl) {
        setEditPopoverError("could not load the current image");
        return;
      }
      const res = await callMuseEdit({
        sourceImageDataUrl,
        prompt,
        renderMode: ref.renderMode,
        styleHint: ref.styleHint,
        source_artifact_uuid: ref.uuid,
        conversationId: conversationIdRef.current ?? undefined,
      });
      if (res.artifactRef) {
        const turnIndex = ref.turnIndex ?? turns.length;
        const artifactRef = { ...res.artifactRef, turnIndex };
        const nextShelf = shelfRef.current.some((r) => r.uuid === artifactRef.uuid)
          ? shelfRef.current
          : [...shelfRef.current, artifactRef];
        shelfRef.current = nextShelf;
        pushArtifact(artifactRef);
        void saveConversationNow(messagesRef.current, nextShelf);
        logEvent({ kind: "muse_paint", uuid: res.artifactRef.uuid, renderMode: ref.renderMode ?? "mood", ts: Date.now() });
        logEvent({
          timestamp: new Date().toISOString(),
          actor: "user",
          eventType: "artifact",
          text: `Muse mutated image via edit popover`,
          params: {
            kind: "muse_edit",
            source_uuid: ref.uuid,
            result_uuid: res.artifactRef.uuid,
            prompt,
          },
        });
        setEditPopoverOpen(false);
      } else {
        setEditPopoverError(res.error ?? "muse could not render");
      }
    } catch (err) {
      setEditPopoverError(`muse failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMusePainting(false);
    }
  }, [musePainting, viewingUuid, loadDisplayedImageDataUrl, callMuseEdit, pushArtifact, saveConversationNow, logEvent, turns.length]);

  /** Accept a single OR direct-mode pending approval. Routes through the
   *  same paintProposal helper, forwarding any linkage Kronus stashed for
   *  direct-mode generate_image calls. */
  const handleAcceptProposal = useCallback(async () => {
    if (!pendingApproval || musePainting) return;
    const p = pendingApproval;
    setPendingApproval(null);
    if (!p.prompt || !p.renderMode) {
      setMuseSilenceReason("proposal had no prompt/renderMode");
      return;
    }
    // Direct mode (Kronus's generate_image) stashed linkage + styleHint
    // on the approval payload via a non-typed `_direct` escape hatch.
    const stash = (p as unknown as {
      _direct?: {
        commitHash?: string;
        documentId?: number;
        portfolioProjectId?: string;
        styleHint?: string;
        provider?: "google" | "openai";
        model?: string;
      };
    })._direct;
    const selected: PendingApprovalAlternative = {
      label: p.direct?.styleHint ?? (p.mode === "direct" ? "direct prompt" : p.action === "refine" ? "refine" : "single visual"),
      visualForm: p.direct?.styleHint ?? null,
      renderMode: p.renderMode,
      prompt: p.prompt,
      rationale: p.reason,
    };
    await paintProposal(p.prompt, p.renderMode, p.turnIndex, p.targetUuid, {
      ...stash,
      provider: stash?.provider,
      painterModel: stash?.model,
    }, {
      source: p.mode === "direct" ? "direct" : "single",
      reason: p.reason,
      selected,
    });
  }, [pendingApproval, musePainting, paintProposal]);

  /** Pick one of the multi-alternative proposals (visual button path). */
  const handlePickAlternative = useCallback(async (index: number) => {
    if (!pendingApproval || musePainting) return;
    const alts = pendingApproval.alternatives;
    if (!alts || index < 0 || index >= alts.length) return;
    const chosen = alts[index];
    const turnIndex = pendingApproval.turnIndex;
    setPendingApproval(null);
    await paintProposal(
      chosen.prompt,
      chosen.renderMode,
      turnIndex,
      undefined,
      { styleHint: chosen.visualForm ?? chosen.label },
      {
        source: "alternatives",
        reason: pendingApproval.reason,
        selectedIndex: index,
        selected: chosen,
        alternatives: alts,
      },
    );
  }, [pendingApproval, musePainting, paintProposal]);

  const handleSkipProposal = useCallback(() => {
    if (pendingApproval?.alternatives?.length) {
      logEvent({
        timestamp: new Date().toISOString(),
        actor: "assistant",
        eventType: "artifact",
        text: "Muse alternatives skipped",
        params: {
          kind: "muse_visual_choice",
          source: "alternatives",
          reason: pendingApproval.reason,
          selectedIndex: null,
          selected: null,
          alternatives: pendingApproval.alternatives,
        },
      });
      scheduleSave(messages, shelfRef.current);
    }
    setPendingApproval(null);
  }, [pendingApproval, logEvent, messages, scheduleSave]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).catch(() => { /* ignore */ });
  }, []);

  // Keyboard: Cmd+/ toggle rail; Esc stop when live else jump to latest
  const isLiveRef = useRef(false);
  const toolLoopBlockedRef = useRef(false);
  isLiveRef.current = isLive;
  toolLoopBlockedRef.current = toolLoopBlocked;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setRailOpen((o) => !o);
      }
      if (e.key === "Escape") {
        if (isLiveRef.current || toolLoopBlockedRef.current) {
          stopRef.current();
          setToolLoopBlocked(false);
        } else {
          heroRef.current?.scrollToBottom();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close rail on outside click when open
  useEffect(() => {
    if (!railOpen) return;
    const onClick = (e: MouseEvent) => {
      const rail = document.querySelector(".hg-rail");
      if (rail && !rail.contains(e.target as Node)) setRailOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [railOpen]);

  // Context meter — mirrors /api/chat system prompt estimate for the selected model.
  const contextLimit = useMemo(() => getModelContextLimit(chatModel), [chatModel]);
  const conversationText = useMemo(() => {
    const parts: string[] = [];
    for (const t of completedTurns) {
      if (t.userText) parts.push(t.userText);
      if (t.assistantText) parts.push(t.assistantText);
    }
    if (liveTail?.userText) parts.push(liveTail.userText);
    if (liveTail?.assistantText) parts.push(liveTail.assistantText);
    return parts.join("\n");
  }, [completedTurns, liveTail]);
  const activeSkillBodyTokens = useMemo(() => {
    const active = new Set(activeSkillSlugs);
    return availableSkillOptions.reduce(
      (sum, s) => sum + (active.has(s.slug) ? (s.tokenEstimate ?? 0) : 0),
      0,
    );
  }, [activeSkillSlugs, availableSkillOptions]);
  const contextMeter = useMemo(
    () =>
      computeHourglassContextMeter({
        contextLimit,
        contextStats,
        liteIndexTokens,
        soulConfig,
        impliedSoul: skillConfigForUi.soul,
        activeSkillSlugs,
        activeSkillBodyTokens,
        conversationText,
      }),
    [
      contextLimit,
      contextStats,
      liteIndexTokens,
      soulConfig,
      skillConfigForUi.soul,
      activeSkillSlugs,
      activeSkillBodyTokens,
      conversationText,
    ],
  );
  const chatModelLabel = useMemo(
    () => CHAT_MODELS.find((m) => m.key === chatModel)?.label ?? chatModel,
    [chatModel],
  );
  const contextTokenLabel = `${formatContextTokenCount(contextMeter.totalTokens)} / ${formatContextTokenCount(contextMeter.contextLimit)}`;
  const contextTooltip = useMemo(() => {
    const lines = [
      `Soul ${formatContextTokenCount(contextMeter.soulTokens)}`,
      contextMeter.liteTokens > 0
        ? `Lite index ${formatContextTokenCount(contextMeter.liteTokens)}`
        : null,
      contextMeter.skillBodyTokens > 0
        ? `Skill bodies ${formatContextTokenCount(contextMeter.skillBodyTokens)}`
        : null,
      `Conversation ${formatContextTokenCount(contextMeter.conversationTokens)}`,
      `${chatModelLabel} · ${contextMeter.contextLimit.toLocaleString()} token window`,
    ].filter(Boolean);
    return lines.join(" · ");
  }, [contextMeter, chatModelLabel]);
  const effectiveContextCount = useMemo(
    () => countEnabledMerged(soulConfig, skillConfigForUi.soul),
    [soulConfig, skillConfigForUi.soul],
  );
  const effectiveToolsCount = useMemo(
    () => countEnabledMerged(toolsConfig, skillConfigForUi.tools),
    [toolsConfig, skillConfigForUi.tools],
  );
  const skillContextActive = activeSkillSlugs.length > 0 && (
    Object.values(skillConfigForUi.soul).some(Boolean) ||
    Object.values(skillConfigForUi.tools).some(Boolean)
  );

  // Per-tab counts for the topbar's shelf-tab strip.
  const shelfCounts = useMemo(() => ({
    mood: shelf.filter((r) => r.kind === "muse-image" && r.renderMode !== "infographic").length,
    infographic: shelf.filter((r) => r.kind === "muse-image" && r.renderMode === "infographic").length,
    repo: shelf.filter((r) => r.kind !== "muse-image").length,
  }), [shelf]);

  const handleToggleRail = useCallback(() => setRailOpen((o) => !o), []);
  const handleToggleMoodCollapsed = useCallback(() => setMoodCollapsed((c) => !c), []);
  const handleOpenAddSheet = useCallback(() => setAddSheetOpen(true), []);
  const handleSkillsClick = useCallback((anchor: DOMRect) => {
    setSkillsAnchorRect(anchor);
    setSkillsOpen((o) => !o);
  }, []);
  const handleConfigClick = useCallback((anchor: DOMRect) => {
    setConfigAnchorRect(anchor);
    setConfigOpen((o) => !o);
  }, []);
  const handleRequestCloseSkills = useCallback(() => setSkillsOpen(false), []);
  const handleRequestCloseConfig = useCallback(() => setConfigOpen(false), []);
  const handleChatModelChange = useCallback((k: string) => setChatModel(k as ChatModelKey), []);
  const handleToggleDaimon = useCallback(() => setDaimonActive((a) => !a), []);
  const handleHeroRegen = useCallback(() => { void handleRegen(); }, [handleRegen]);
  const [visibleTurn, setVisibleTurn] = useState(1);
  const latestTurn = pendingUserText !== undefined ? turns.length + 1 : turns.length;
  const handleScrollTurnChange = useCallback((turn: number) => {
    setVisibleTurn(turn);
  }, []);
  const handleTurnNavStep = useCallback((direction: -1 | 1) => {
    const latest = pendingUserText !== undefined ? turns.length + 1 : turns.length;
    if (latest <= 0) return;
    setVisibleTurn((currentVisible) => {
      const current = Math.min(Math.max(currentVisible || latest, 1), latest);
      const target = direction < 0 ? Math.max(1, current - 1) : Math.min(latest, current + 1);
      if (target === current) {
        if (direction > 0) heroRef.current?.scrollToTurn(latest);
        return currentVisible;
      }
      heroRef.current?.scrollToTurn(target);
      return target;
    });
  }, [pendingUserText, turns.length]);
  const handleTurnNavCharged = useCallback((direction: -1 | 1) => {
    const latest = pendingUserText !== undefined ? turns.length + 1 : turns.length;
    if (latest <= 0) return;
    if (direction < 0) {
      setVisibleTurn(1);
      heroRef.current?.scrollToTurn(1);
      return;
    }
    setVisibleTurn(latest);
    heroRef.current?.scrollToTurn(latest);
  }, [pendingUserText, turns.length]);
  const turnNav = useMemo(() => {
    if (latestTurn <= 0) return undefined;
    return {
      visibleTurn: Math.min(Math.max(visibleTurn, 1), latestTurn),
      latestTurn,
      onStep: handleTurnNavStep,
      onCharged: handleTurnNavCharged,
    };
  }, [handleTurnNavCharged, handleTurnNavStep, latestTurn, visibleTurn]);
  const handleConversationSummaryUpdated = useCallback((id: number, patch: Partial<(typeof recentConversations)[number]>) => {
    setRecentConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);
  const handleEditImageOpen = useCallback(() => {
    setEditPopoverError(null);
    setEditPopoverOpen(true);
  }, []);
  const handleMuseEditClose = useCallback(() => setEditPopoverOpen(false), []);
  const handleMuseEditSubmit = useCallback((p: string) => { void paintEdit(p); }, [paintEdit]);
  const handleArtifactAdded = useCallback((ref: ArtifactRef) => {
    pushArtifact({ ...ref, turnIndex: turnsRef.current.length || undefined });
  }, [pushArtifact]);
  const handleSkillsOpenChange = useCallback((open: boolean) => {
    setSkillsOpen(open);
    if (!open) setSkillsAnchorRect(null);
  }, []);
  const handleConfigOpenChange = useCallback((open: boolean) => {
    setConfigOpen(open);
    if (!open) setConfigAnchorRect(null);
  }, []);

  const canEditDisplayedImage =
    hydratedArtifact != null &&
    (hydratedArtifact.body.kind === "muse-image" || hydratedArtifact.body.kind === "media");

  const museEditPopover = useMemo(
    () => (
      <MuseEditPopover
        open={editPopoverOpen}
        busy={musePainting}
        onClose={handleMuseEditClose}
        onSubmit={handleMuseEditSubmit}
        sourceTitle={hydratedArtifact?.title}
        error={editPopoverError}
      />
    ),
    [editPopoverOpen, musePainting, handleMuseEditClose, handleMuseEditSubmit, hydratedArtifact?.title, editPopoverError],
  );

  return (
    <div className={`hg-stage${moodCollapsed ? " hg-mood-collapsed" : ""}`}>
      {toolLoopBlocked && (
        <div className="hg-tool-budget-banner" role="status">
          <span>Repeated tool loop detected — agent stopped. Send a new message or dismiss to continue.</span>
          <button type="button" onClick={() => { stop(); setToolLoopBlocked(false); }}>
            dismiss
          </button>
        </div>
      )}
      <HourglassChrome
        conversationTitle={conversationTitle}
        conversationId={conversationId}
        moodCollapsed={moodCollapsed}
        moodTab={moodTab}
        onMoodTabChange={setMoodTab}
        shelfCounts={shelfCounts}
        onNewChat={handleNewChat}
        onLoadConversation={handleLoadConversation}
        railOpen={railOpen}
        onToggleRail={handleToggleRail}
        conversationStartedAt={conversationStartedAt}
        chatModelLabel={chatModelLabel}
        shelf={shelf}
        viewingUuid={viewingUuid}
        onViewingUuidChange={setViewingUuid}
        hydratedArtifact={hydratedArtifact}
        hydrating={hydrating}
        museSilenceReason={museSilenceReason}
        museThoughts={museThoughts}
        musePainting={musePainting}
        onToggleMoodCollapsed={handleToggleMoodCollapsed}
        onRegen={handleRegen}
        onOpenAddSheet={handleOpenAddSheet}
        pendingApproval={pendingApproval}
        onAcceptApproval={handleAcceptProposal}
        onPickAlternative={handlePickAlternative}
        onSkipApproval={handleSkipProposal}
        onEditImage={canEditDisplayedImage ? handleEditImageOpen : undefined}
        editPopover={museEditPopover}
        turnNav={turnNav}
      />

      <Composer
        mode={composerMode}
        onModeChange={setComposerMode}
        draftResetNonce={composerDraftResetNonce}
        onSubmit={handleSend}
        disabled={isThinking || isStreaming || daimonPending}
        contextPercent={contextMeter.percent}
        contextTokenLabel={contextTokenLabel}
        contextTooltip={contextTooltip}
        activeSkillCount={activeSkillSlugs.length}
        skillContextActive={skillContextActive}
        effectiveContextCount={effectiveContextCount}
        effectiveToolsCount={effectiveToolsCount}
        chatModel={chatModel}
        chatModels={CHAT_MODELS}
        onChatModelChange={handleChatModelChange}
        imagesEnabled={imagesEnabled}
        onToggleImages={handleToggleImages}
        imagesProvider={imagesProvider}
        onImagesProviderChange={handleImagesProviderChange}
        onPaint={handlePaint}
        onSkillsClick={handleSkillsClick}
        onConfigClick={handleConfigClick}
        onRequestCloseSkills={handleRequestCloseSkills}
        onRequestCloseConfig={handleRequestCloseConfig}
        daimonActive={daimonActive}
        onToggleDaimon={handleToggleDaimon}
        onStop={stop}
        isLive={isLive}
        canStop={isLive || toolLoopBlocked}
      />

      <Hero
        ref={heroRef}
        turns={turns}
        streamingAssistantText={streamingAssistantText}
        pendingUserText={pendingUserText}
        activeToolCalls={activeToolCalls}
        isThinking={isThinking}
        isStreaming={isStreaming}
        conversationAnchorKey={conversationId ?? "new"}
        onRegen={handleHeroRegen}
        onCopy={handleCopy}
        onScrollTurnChange={handleScrollTurnChange}
        recentConversations={recentConversations}
        onLoadConversation={handleLoadConversation}
        onConversationSummaryUpdated={handleConversationSummaryUpdated}
      />

      <ArtifactAddSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        onAdded={handleArtifactAdded}
      />

      <SkillsPopover
        open={skillsOpen}
        onOpenChange={handleSkillsOpenChange}
        anchorRect={skillsAnchorRect}
        activeSkillSlugs={activeSkillSlugs}
        onActiveSkillSlugsChange={setActiveSkillSlugs}
        onSkillsLoaded={setAvailableSkillOptions}
      />

      <ConfigPopover
        open={configOpen}
        onOpenChange={handleConfigOpenChange}
        anchorRect={configAnchorRect}
        soulConfig={soulConfig}
        toolsConfig={baseToolsConfig}
        impliedSoulConfig={skillConfigForUi.soul}
        impliedToolsConfig={skillConfigForUi.tools}
        onSoulConfigChange={setSoulConfig}
        onToolsConfigChange={setBaseToolsConfig}
        contextStats={contextStats}
        contextLimit={contextLimit}
      />
    </div>
  );
}
