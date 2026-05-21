"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import type { UIMessage } from "ai";
import { LEAN_SOUL_CONFIG, LEAN_TOOLS_CONFIG } from "@/lib/ai/skills";
import { executeToolCall } from "@/lib/ai/tool-executors";
import { Topbar } from "./Topbar";
import { Rail } from "./Rail";
import { Hero, type HeroHandle } from "./Hero";
import { MoodPanel, type MuseThought } from "./MoodPanel";
import { Composer } from "./Composer";
import { useMuse, useMuseEdit, useMuseObserver } from "./useMuse";
import type { MuseProposeResponse, MuseGenerateResponse, MuseShelfRef } from "./useMuse";
import { MuseEditPopover } from "./MuseEditPopover";
import { ArtifactAddSheet } from "./artifacts/ArtifactAddSheet";
import { SkillsPopover, type SkillOption } from "./SkillsPopover";
import { ConfigPopover } from "./ConfigPopover";
import type { ComposerMode, MoodTab, RailView, ToolCallSummary, Turn } from "./types";
import type { Artifact, ArtifactBody, ArtifactRef } from "./artifacts/types";
import type { ChatMessage } from "@/lib/db-conversations";
import { appendEntry, extractMuseThoughtsFromChatLog, type ChatLogEntry } from "@/lib/chat-log";
import type { PendingApproval, PendingApprovalAlternative } from "./ApprovalCard";
import type { SoulConfigState } from "@/components/chat/SoulConfig";
import type { ToolsConfigState } from "@/components/chat/ToolsConfig";
import { compressImage, fileToDataUrl } from "@/lib/image-compression";
import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_CHAT_MODEL,
  DEFAULT_OPENAI_IMAGE_CHAT_MODEL,
  isChatModelKey,
  type ChatModelKey,
} from "@/lib/ai/model-catalog";

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

/**
 * Extract plain text from a UIMessage, concatenating all text parts.
 * Tool calls are serialized into readable pill text so they surface
 * in the reader's doc body via markdown.
 */
function messageToText(m: UIMessage): string {
  if (!m.parts) return "";
  const out: string[] = [];
  for (const part of m.parts) {
    if (part.type === "text") out.push(part.text ?? "");
    else if (part.type === "file") {
      const filePart = part as unknown as { filename?: string; mediaType?: string };
      if (filePart.mediaType?.startsWith("image/")) {
        out.push(`[image attached${filePart.filename ? `: ${filePart.filename}` : ""}]`);
      } else if (filePart.mediaType === "application/pdf") {
        out.push(`[PDF attached${filePart.filename ? `: ${filePart.filename}` : ""}]`);
      }
    } else if ((part as unknown as { type?: string }).type === "image") {
      out.push("[image attached]");
    }
    else if (part.type?.startsWith("tool-")) {
      const t = part as unknown as { type: string };
      // leave tool calls to be rendered as pills elsewhere; omit from text.
      void t;
    }
  }
  return out.join("");
}

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
  return {
    id: m.id,
    role: m.role as UIMessage["role"],
    content: m.content,
    parts: m.parts ?? [{ type: "text" as const, text: m.content }],
    createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
  } as UIMessage;
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
    const validModel = isChatModelKey(model) ? model : DEFAULT_CHAT_MODEL;
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

function messageToolCalls(m: UIMessage): ToolCallSummary[] {
  const calls: ToolCallSummary[] = [];
  if (!m.parts) return calls;
  for (const part of m.parts) {
    if (part.type?.startsWith("tool-")) {
      const p = part as unknown as { toolName?: string; state?: string };
      const name = p.toolName ?? part.type.slice(5);
      const state = p.state === "output-available" ? "done" : p.state === "output-error" ? "error" : "pending";
      calls.push({ name, status: state });
    }
  }
  return calls;
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
    setChatModel(restored.modelConfig.model);
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
  const [railView, setRailView] = useState<RailView>("chat");
  const [viewingTurn, setViewingTurnRaw] = useState(1);
  const [daimonActive, setDaimonActive] = useState(false);
  const [daimonPending, setDaimonPending] = useState(false);
  const [conversationTitle, setConversationTitle] = useState("");
  const [recentConversations, setRecentConversations] = useState<Array<{ id: number; title: string; updated_at: string }>>([]);
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

  const { messages, sendMessage, status, stop, setMessages, addToolResult } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    async onToolCall({ toolCall }) {
      const { toolName, input, toolCallId } = toolCall;
      const args = (input ?? {}) as Record<string, unknown>;

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
  const messagesRef = useRef<UIMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Reconstruct turns from messages
  const turns = useMemo<Turn[]>(() => {
    const out: Turn[] = [];
    let pendingUser: UIMessage | null = null;
    let idx = 0;
    for (const m of messages) {
      if (m.role === "user") {
        pendingUser = m;
      } else if (m.role === "assistant" && pendingUser) {
        idx += 1;
        const userText = messageToText(pendingUser).trim();
        const assistantText = messageToText(m).trim();
        out.push({
          id: m.id,
          index: idx,
          userMessageId: pendingUser.id,
          assistantMessageId: m.id,
          startedAt: (m as unknown as { createdAt?: Date }).createdAt?.getTime?.() ?? Date.now(),
          userText,
          assistantText,
          toolCalls: messageToolCalls(m),
        });
        pendingUser = null;
      }
    }
    return out;
  }, [messages]);

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

  const saveConversationNow = useCallback(async (msgs: UIMessage[], currentShelf: ArtifactRef[]) => {
    if (msgs.length === 0) return;
    const title = conversationTitleRef.current || "untitled conversation";
    const body = {
      title,
      messages: msgs.filter((m) => m.role === "user" || m.role === "assistant").map(uiToChat),
      sessionConfig: sessionConfigRef.current,
      artifactRefs: currentShelf,
      chatLog: chatLogRef.current,
    };
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
  }, []);

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
        const { conversations } = await res.json() as { conversations: Array<{ id: number; title: string; updated_at: string }> };
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
        const uiMsgs = (conv.messages ?? []).map(chatToUI);
        if (uiMsgs.length > 0) setMessages(uiMsgs);
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
  }, [restoreSessionConfig]);

  // Hero-scroll "which turn am I looking at" — separate from the shelf.
  const currentTurnIndex = turns.length;
  useEffect(() => {
    if (currentTurnIndex > 0) setViewingTurnRaw(currentTurnIndex);
  }, [currentTurnIndex]);

  // Detect pending streaming assistant text + unanswered user text
  const streamingAssistantText = useMemo(() => {
    if (!isStreaming && !isThinking) return undefined;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return undefined;
    return messageToText(last);
  }, [messages, isStreaming, isThinking]);

  const pendingUserText = useMemo(() => {
    if (!isStreaming && !isThinking) return undefined;
    // Find the last user message. Only synthesize a pending turn while no
    // assistant message exists yet; once streaming creates an assistant
    // message, that real turn should stream in place instead of duplicating.
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        const laterAssistant = messages.slice(i + 1).some((m) => m.role === "assistant");
        return laterAssistant ? undefined : messageToText(messages[i]);
      }
    }
    return undefined;
  }, [messages, isStreaming, isThinking]);

  const activeToolCalls = useMemo<ToolCallSummary[]>(() => {
    if (!isStreaming && !isThinking) return [];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messageToolCalls(messages[i]);
    }
    return [];
  }, [messages, isStreaming, isThinking]);

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
    // Save on every new completed turn
    if (turns.length !== lastSavedTurnRef.current) {
      lastSavedTurnRef.current = turns.length;
      scheduleSave(messages, shelfRef.current);
    }
  }, [turns.length, isStreaming, isThinking, messages, scheduleSave]);

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
          conversationId: conversationIdRef.current ?? undefined,
        },
      },
    );
  }, [daimonActive, messages, sendMessage, soulConfig, toolsConfig, modelConfig, imagesProvider, activeSkillSlugs, shelf, viewingUuid, imagesEnabled]);

  const handleNewChat = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setMessages([]);
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
    setViewingTurnRaw(1);
    setConversationId(null);
    setSoulConfig(LEAN_SOUL_CONFIG);
    setBaseToolsConfig(LEAN_TOOLS_CONFIG);
    setChatModel(DEFAULT_CHAT_MODEL);
    setActiveSkillSlugs([]);
    setImagesEnabled(false);
    setImagesProvider("google");
  }, [setMessages]);

  const handleLoadConversation = useCallback(async (id: number) => {
    handleNewChat();
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) return;
      const conv = await res.json() as { id: number; title: string; messages: ChatMessage[]; session_config?: string | null; artifact_refs?: string; chat_log?: string; updated_at: string };
      const uiMsgs = (conv.messages ?? []).map(chatToUI);
      if (uiMsgs.length > 0) setMessages(uiMsgs);
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
  }, [handleNewChat, restoreSessionConfig, setMessages]);

  const handleScrollToTurn = useCallback((n: number) => {
    heroRef.current?.scrollToTurn(n);
    setViewingTurnRaw(n);
    if (railOpen) setRailOpen(false);
  }, [railOpen]);

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
        provider: imagesProvider,
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
  }, [musePainting, viewingUuid, loadDisplayedImageDataUrl, callMuseEdit, imagesProvider, pushArtifact, saveConversationNow, logEvent, turns.length]);

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
    const stash = (p as unknown as { _direct?: { commitHash?: string; documentId?: number; portfolioProjectId?: string; styleHint?: string } })._direct;
    const selected: PendingApprovalAlternative = {
      label: p.direct?.styleHint ?? (p.mode === "direct" ? "direct prompt" : p.action === "refine" ? "refine" : "single visual"),
      visualForm: p.direct?.styleHint ?? null,
      renderMode: p.renderMode,
      prompt: p.prompt,
      rationale: p.reason,
    };
    await paintProposal(p.prompt, p.renderMode, p.turnIndex, p.targetUuid, stash, {
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

  // Keyboard: Cmd+/ toggle rail; Esc return-to-now
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setRailOpen((o) => !o);
      }
      if (e.key === "Escape") {
        heroRef.current?.scrollToBottom();
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

  // Derived metrics (mock-ish — real context% would need a server count)
  const totalText = useMemo(() => messages.map(messageToText).join(" "), [messages]);
  const estTokens = Math.round(totalText.length / 4);
  const contextPercent = Math.min(99, Math.round((estTokens / 200_000) * 100));
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
  const chatModelLabel = useMemo(
    () => CHAT_MODELS.find((m) => m.key === chatModel)?.label ?? chatModel,
    [chatModel],
  );

  // Per-tab counts for the topbar's shelf-tab strip.
  const shelfCounts = useMemo(() => ({
    mood: shelf.filter((r) => r.kind === "muse-image" && r.renderMode !== "infographic").length,
    infographic: shelf.filter((r) => r.kind === "muse-image" && r.renderMode === "infographic").length,
    repo: shelf.filter((r) => r.kind !== "muse-image").length,
  }), [shelf]);

  return (
    <div className={`hg-stage${moodCollapsed ? " hg-mood-collapsed" : ""}`}>
      <Topbar
        title={conversationTitle || "an unnamed conversation"}
        conversationId={conversationId}
        shelfVisible={!moodCollapsed}
        shelfTabs={{
          active: moodTab,
          onChange: setMoodTab,
          counts: shelfCounts,
        }}
      />

      <Rail
        view={railView}
        onViewChange={(v) => {
          setRailView(v);
          if (v === "reader") window.location.href = "/reader";
          else if (v === "repo") window.location.href = "/library";
        }}
        turns={turns}
        currentTurn={currentTurnIndex}
        viewingTurn={viewingTurn}
        onScrollToTurn={handleScrollToTurn}
        onNewChat={handleNewChat}
        onLoadConversation={handleLoadConversation}
        open={railOpen}
        onToggleOpen={() => setRailOpen((o) => !o)}
        conversationTitle={conversationTitle}
        conversationStartedAt={conversationStartedAt}
        modelLabel={chatModelLabel}
        currentConversationId={conversationId}
      />

      <Hero
        ref={heroRef}
        turns={turns}
        streamingAssistantText={streamingAssistantText}
        pendingUserText={pendingUserText}
        activeToolCalls={activeToolCalls}
        isThinking={isThinking}
        isStreaming={isStreaming}
        onRegen={() => handleRegen()}
        onCopy={handleCopy}
        onScrollTurnChange={(v) => setViewingTurnRaw(v)}
        recentConversations={recentConversations}
        onLoadConversation={handleLoadConversation}
      />

      <MoodPanel
        shelf={shelf}
        viewingUuid={viewingUuid}
        onViewingUuidChange={setViewingUuid}
        hydratedArtifact={hydratedArtifact}
        hydrating={hydrating}
        museSilenceReason={museSilenceReason}
        museThoughts={museThoughts}
        musePainting={musePainting}
        collapsed={moodCollapsed}
        onToggleCollapse={() => setMoodCollapsed((c) => !c)}
        tab={moodTab}
        onTabChange={setMoodTab}
        onRegen={handleRegen}
        onAdd={() => setAddSheetOpen(true)}
        pendingApproval={pendingApproval}
        onAcceptApproval={handleAcceptProposal}
        onPickAlternative={handlePickAlternative}
        onSkipApproval={handleSkipProposal}
        onEditImage={
          hydratedArtifact && (hydratedArtifact.body.kind === "muse-image" || hydratedArtifact.body.kind === "media")
            ? () => { setEditPopoverError(null); setEditPopoverOpen(true); }
            : undefined
        }
        editPopover={
          <MuseEditPopover
            open={editPopoverOpen}
            busy={musePainting}
            onClose={() => setEditPopoverOpen(false)}
            onSubmit={(p) => { void paintEdit(p); }}
            sourceTitle={hydratedArtifact?.title}
            error={editPopoverError}
          />
        }
      />

      <Composer
        mode={composerMode}
        onModeChange={setComposerMode}
        draftResetNonce={composerDraftResetNonce}
        onSubmit={handleSend}
        disabled={isThinking || isStreaming || daimonPending}
        contextPercent={contextPercent}
        activeSkillCount={activeSkillSlugs.length}
        skillContextActive={skillContextActive}
        effectiveContextCount={effectiveContextCount}
        effectiveToolsCount={effectiveToolsCount}
        chatModel={chatModel}
        chatModels={CHAT_MODELS}
        onChatModelChange={(k) => setChatModel(k as ChatModelKey)}
        imagesEnabled={imagesEnabled}
        onToggleImages={handleToggleImages}
        imagesProvider={imagesProvider}
        onImagesProviderChange={handleImagesProviderChange}
        onPaint={handlePaint}
        onSkillsClick={(anchor) => {
          setSkillsAnchorRect(anchor);
          setSkillsOpen((o) => !o);
        }}
        onConfigClick={(anchor) => {
          setConfigAnchorRect(anchor);
          setConfigOpen((o) => !o);
        }}
        onRequestCloseSkills={() => setSkillsOpen(false)}
        onRequestCloseConfig={() => setConfigOpen(false)}
        daimonActive={daimonActive}
        onToggleDaimon={() => setDaimonActive((a) => !a)}
        onStop={stop}
        isStreaming={isStreaming}
      />

      <ArtifactAddSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        onAdded={(ref) => pushArtifact({ ...ref, turnIndex: turns.length || undefined })}
      />

      <SkillsPopover
        open={skillsOpen}
        onOpenChange={(open) => {
          setSkillsOpen(open);
          if (!open) setSkillsAnchorRect(null);
        }}
        anchorRect={skillsAnchorRect}
        activeSkillSlugs={activeSkillSlugs}
        onActiveSkillSlugsChange={setActiveSkillSlugs}
        onSkillsLoaded={setAvailableSkillOptions}
      />

      <ConfigPopover
        open={configOpen}
        onOpenChange={(open) => {
          setConfigOpen(open);
          if (!open) setConfigAnchorRect(null);
        }}
        anchorRect={configAnchorRect}
        soulConfig={soulConfig}
        toolsConfig={baseToolsConfig}
        impliedSoulConfig={skillConfigForUi.soul}
        impliedToolsConfig={skillConfigForUi.tools}
        onSoulConfigChange={setSoulConfig}
        onToolsConfigChange={setBaseToolsConfig}
      />
    </div>
  );
}
