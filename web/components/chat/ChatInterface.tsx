"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Send,
  User,
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Check,
  CheckCircle2,
  AlertCircle,
  Wrench,
  Save,
  History,
  Plus,
  Trash2,
  Paperclip,
  X,
  Search,
  ArrowUp,
  ArrowDown,
  Zap,
  Square,
  RefreshCw,
  Pencil,
  FileText,
  GitCompare,
  Maximize2,
  Minimize2,

  Gauge,
  Eye,
  EyeOff,
  Wand2,
  MoreHorizontal,
  Sparkles,
} from "lucide-react";
import { cn, formatDateShort } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useMobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SoulConfigState, DEFAULT_CONFIG } from "./SoulConfig";
import {
  FormatConfig,
  FormatConfigState,
  DEFAULT_FORMAT_CONFIG,
  KRONUS_FONTS,
  KRONUS_FONT_SIZES,
} from "./FormatConfig";
import {
  ToolsConfigState,
  DEFAULT_CONFIG as DEFAULT_TOOLS_CONFIG,
} from "./ToolsConfig";
import { SkillSelector } from "./SkillSelector";
import type { SkillInfo } from "@/lib/ai/skills";
import { LEAN_SOUL_CONFIG, LEAN_TOOLS_CONFIG } from "@/lib/ai/skills";
import {
  ModelConfig,
  ModelConfigState,
  DEFAULT_CONFIG as DEFAULT_MODEL_CONFIG,
  MODEL_CONTEXT_LIMITS,
} from "./ModelConfig";
import { isLinearTool, getLinearPreview } from "./LinearPreview";
import { formatBytes } from "@/lib/image-compression";
import {
  requiresConfirmation,
  getToolActionDescription,
  formatToolArgsForDisplay,
  formatArgsForDiffView,
  type PendingToolAction,
} from "@/lib/ai/write-tools";
import { computeSmartDiff, type DiffResult } from "@/lib/diff";
import { executeToolCall } from "@/lib/ai/tool-executors";
import { useFileUpload } from "@/lib/hooks/useFileUpload";
import { useMessageSearch } from "@/lib/hooks/useMessageSearch";
import {
  MemoizedMarkdown,
  StreamingText,
  ConfirmationButtons,
  ThinkingDisplay,
  detectConfirmationRequest,
} from "./ChatMarkdown";
import { DaimonPolishPanel } from "./DaimonPolishPanel";
import {
  toChatSessionSnapshot,
  parseChatSessionSnapshot,
} from "@/lib/chat-session-snapshot";
import type { ArtifactRef } from "@/components/chat/hourglass/artifacts/types";

interface ToolState {
  isLoading: boolean;
  completed?: boolean;
  error?: string;
  result?: string;
  output?: string;
  images?: string[];
  model?: string;
  prompt?: string;
  pendingConfirmation?: boolean;
}

interface SavedConversation {
  id: number;
  title: string;
  summary?: string | null;
  summary_updated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export function ChatInterface() {
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [toolStates, setToolStates] = useState<Record<string, ToolState>>({});
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  // Model config first — vision attachment compression depends on provider/model
  const [modelConfig, setModelConfig] = useState<ModelConfigState>(DEFAULT_MODEL_CONFIG);
  const visionCompression = useMemo(() => {
    if (modelConfig.model.startsWith("claude-")) {
      // Cap long edge for Anthropic vision (token cost; Opus 4.7 high-res uses more tokens per image)
      return { maxDimension: 2048 };
    }
    return undefined;
  }, [modelConfig.model]);

  // File upload hook
  const {
    fileInputRef,
    selectedFiles,
    imagePreviews,
    compressionInfo,
    isCompressing,
    handleFileSelect,
    handleDrop,
    handleDragOver,
    removeImage,
    clearFiles,
  } = useFileUpload(visionCompression);

  /** Non-fatal completion reasons (length, policy, etc.) from the model stream */
  const [streamNotice, setStreamNotice] = useState<string | null>(null);

  // Conversation management
  const [showHistory, setShowHistory] = useState(false);
  const [savedConversations, setSavedConversations] = useState<SavedConversation[]>([]);
  const [conversationsTotal, setConversationsTotal] = useState(0);
  const [conversationsOffset, setConversationsOffset] = useState(0);
  const conversationsLimit = 20;
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [input, setInput] = useState("");
  const [generatingSummaryFor, setGeneratingSummaryFor] = useState<number | null>(null);
  const [isBackfilling, setIsBackfilling] = useState(false);
  // Track message count at last save to detect real changes vs loads
  const lastSavedMessageCountRef = useRef<number>(0);

  // Chat search — initialized after useChat provides messages (see below)

  // Soul config - controls which repository sections Kronus knows about
  const [soulConfig, setSoulConfig] = useState<SoulConfigState>(DEFAULT_CONFIG);
  // Store the config that was used when the conversation started (locked after first message)
  const [lockedSoulConfig, setLockedSoulConfig] = useState<SoulConfigState | null>(null);

  // Tools config - controls which tool categories are enabled
  // NOT locked - can be changed mid-chat to dynamically enable/disable tools
  const [toolsConfig, setToolsConfig] = useState<ToolsConfigState>(DEFAULT_TOOLS_CONFIG);

  // Skills — on-demand context loading. Dynamic, can change mid-conversation.
  // Default: empty (lean mode ~6k tokens). Skills are additive (OR-merge).
  const [activeSkillSlugs, setActiveSkillSlugs] = useState<string[]>([]);
  // Cached skill data (loaded once from API, reused for config derivation)
  const [cachedSkills, setCachedSkills] = useState<SkillInfo[]>([]);
  // Track if user has manually overridden soul/tools config (bypassing skills)
  const [isManualOverride, setIsManualOverride] = useState(false);

  // Fetch skills once and cache them for config derivation
  useEffect(() => {
    fetch("/api/kronus/skills")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.skills) setCachedSkills(data.skills); })
      .catch(() => {});
  }, []);

  // Sync Soul/Tools UI state when skills change (unless manual override)
  useEffect(() => {
    if (isManualOverride) return;
    if (activeSkillSlugs.length === 0) {
      // Lean baseline
      setSoulConfig({ ...LEAN_SOUL_CONFIG });
      setToolsConfig({ ...LEAN_TOOLS_CONFIG });
      return;
    }
    // Merge active skill configs
    const activeConfigs = cachedSkills.filter((s) => activeSkillSlugs.includes(s.slug));
    if (activeConfigs.length === 0) return;
    const soul: SoulConfigState = { ...LEAN_SOUL_CONFIG };
    const tools: ToolsConfigState = { ...LEAN_TOOLS_CONFIG };
    for (const skill of activeConfigs) {
      for (const [key, value] of Object.entries(skill.config.soul || {})) {
        if (value === true) (soul as any)[key] = true;
      }
      for (const [key, value] of Object.entries(skill.config.tools || {})) {
        if (value === true) (tools as any)[key] = true;
      }
    }
    if (soul.chatIndex) {
      tools.memory = true;
    }
    setSoulConfig(soul);
    setToolsConfig(tools);
  }, [activeSkillSlugs, cachedSkills, isManualOverride]);

  // Format config - controls chat font and size (applies immediately)
  const [formatConfig, setFormatConfig] = useState<FormatConfigState>(DEFAULT_FORMAT_CONFIG);

  // Context compression state
  const [isCompressingContext, setIsCompressingContext] = useState(false);

  // Soul context tokens - fetched from stats API for accurate total context calculation
  const [soulContextTokens, setSoulContextTokens] = useState<number>(0);

  // Edit user message state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState("");

  // Pending tool confirmation state - for write tools that require approval
  const [pendingToolAction, setPendingToolAction] = useState<{
    action: PendingToolAction;
    toolCallId: string;
    resolve: (result: string) => void;
  } | null>(null);
  const [showDiffView, setShowDiffView] = useState(false);
  const [artifactRefs, setArtifactRefs] = useState<ArtifactRef[]>([]);

  const addArtifactRef = useCallback((ref: ArtifactRef) => {
    setArtifactRefs((prev) => (prev.some((r) => r.uuid === ref.uuid) ? prev : [...prev, ref]));
  }, []);

  // Daimon — inline polish-before-send plugin (merged Atropos + Hermes)
  const [daimonEnabled, setDaimonEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("tartarus-daimon-enabled") === "true";
    }
    return false;
  });
  const [daimonPolishResult, setDaimonPolishResult] = useState<{
    original: string;
    polished: string;
    didTranslate?: boolean;
    notes?: string | null;
  } | null>(null);
  const [daimonLoading, setDaimonLoading] = useState(false);
  // Stash original text so "Accept" is undoable via Cmd+Z / re-polish
  const [daimonPrevInput, setDaimonPrevInput] = useState<string | null>(null);

  // Persist Daimon toggle
  useEffect(() => {
    localStorage.setItem("tartarus-daimon-enabled", String(daimonEnabled));
  }, [daimonEnabled]);

  // Auto-grow textarea ref
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
  }, []);
  useEffect(() => {
    autoGrow();
  }, [input, autoGrow]);

  // Theme state - synced with Sidebar's localStorage
  const [kronusTheme, setKronusTheme] = useState<"dark" | "light">("dark");

  // Agent config - fetch agent name from API
  const [agentName, setAgentName] = useState<string>("Kronus");
  useEffect(() => {
    fetch("/api/agent/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.name) {
          setAgentName(data.name);
        }
      })
      .catch(() => {
        // Fallback to default
        setAgentName("Kronus");
      });
  }, []);

  // Fetch soul context tokens when soulConfig changes (for accurate total context)
  useEffect(() => {
    const effectiveSoulConfig = lockedSoulConfig || soulConfig;
    fetch("/api/kronus/stats")
      .then((res) => res.json())
      .then((stats) => {
        // Calculate total soul context tokens based on enabled sections
        const linearProjectTokens = effectiveSoulConfig.linearIncludeCompleted
          ? (stats.linear?.projects?.tokensAll ?? stats.linearProjectsTokens ?? 0)
          : (stats.linear?.projects?.tokensActive ?? stats.linearProjectsTokens ?? 0);
        const linearIssueTokens = effectiveSoulConfig.linearIncludeCompleted
          ? (stats.linear?.issues?.tokensAll ?? stats.linearIssuesTokens ?? 0)
          : (stats.linear?.issues?.tokensActive ?? stats.linearIssuesTokens ?? 0);

        const total =
          (stats.baseTokens || 6000) +
          (effectiveSoulConfig.writings ? stats.writingsTokens || 0 : 0) +
          (effectiveSoulConfig.portfolioProjects ? stats.portfolioProjectsTokens || 0 : 0) +
          (effectiveSoulConfig.skills ? stats.skillsTokens || 0 : 0) +
          (effectiveSoulConfig.workExperience ? stats.workExperienceTokens || 0 : 0) +
          (effectiveSoulConfig.education ? stats.educationTokens || 0 : 0) +
          (effectiveSoulConfig.journalEntries ? stats.journalEntriesTokens || 0 : 0) +
          (effectiveSoulConfig.chatIndex ? stats.chatIndexTokens || 0 : 0) +
          (effectiveSoulConfig.linearProjects ? linearProjectTokens : 0) +
          (effectiveSoulConfig.linearIssues ? linearIssueTokens : 0);

        setSoulContextTokens(total);
      })
      .catch(() => {
        // Fallback estimate
        setSoulContextTokens(80000);
      });
  }, [soulConfig, lockedSoulConfig]);

  // Auto-respond after tool calls - instance-based (sessionStorage)
  // Each browser tab/session has its own setting - doesn't affect other users
  const [autoRespondAfterTools, setAutoRespondAfterTools] = useState(true);

  // Initialize auto-respond from sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem("autoRespondAfterTools");
    if (saved !== null) {
      setAutoRespondAfterTools(saved === "true");
    }
  }, []);

  // Save auto-respond to sessionStorage when it changes
  useEffect(() => {
    sessionStorage.setItem("autoRespondAfterTools", String(autoRespondAfterTools));
  }, [autoRespondAfterTools]);

  // Initialize theme from localStorage and listen for changes
  useEffect(() => {
    // Check localStorage on mount
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
      setKronusTheme("light");
    }

    // Listen for theme changes from Sidebar
    const handleThemeChange = (e: CustomEvent<{ isDark: boolean }>) => {
      setKronusTheme(e.detail.isDark ? "dark" : "light");
    };

    window.addEventListener("theme-change", handleThemeChange as EventListener);
    return () => window.removeEventListener("theme-change", handleThemeChange as EventListener);
  }, []);

  // Custom transport - body is passed via sendMessage to avoid stale data issue
  // See: https://ai-sdk.dev/docs/troubleshooting/use-chat-stale-body-data
  const chatTransport = useMemo(() => {
    return new DefaultChatTransport({
      api: "/api/chat",
    });
  }, []);

  const { messages, sendMessage, status, setMessages, addToolResult, error, stop } = useChat({
    transport: chatTransport,
    // Conditionally auto-respond after tool calls - each browser session controls this independently
    sendAutomaticallyWhen: autoRespondAfterTools
      ? lastAssistantMessageIsCompleteWithToolCalls
      : undefined,

    async onToolCall({ toolCall }) {
      const { toolName, input, toolCallId } = toolCall;
      const typedArgs = input as Record<string, unknown>;

      // === WRITE TOOL CONFIRMATION ===
      // Check if this tool requires user confirmation before execution
      if (requiresConfirmation(toolName)) {
        // Set loading state with "pending confirmation" indicator
        setToolStates((prev) => ({
          ...prev,
          [toolCallId]: { isLoading: true, pendingConfirmation: true },
        }));

        // Create a promise that will be resolved when the user confirms/rejects
        const confirmationResult = await new Promise<string>((resolve) => {
          const action: PendingToolAction = {
            id: `${toolName}-${Date.now()}`,
            toolName,
            args: typedArgs as Record<string, any>,
            description: getToolActionDescription(toolName, typedArgs as Record<string, any>),
            formattedArgs: formatToolArgsForDisplay(toolName, typedArgs as Record<string, any>),
            timestamp: Date.now(),
          };

          setPendingToolAction({
            action,
            toolCallId,
            resolve,
          });
        });

        // If rejected, add the rejection as tool result and return early
        if (confirmationResult.startsWith("REJECTED:")) {
          setToolStates((prev) => ({
            ...prev,
            [toolCallId]: { isLoading: false, completed: true, output: confirmationResult },
          }));
          addToolResult({
            tool: toolName,
            toolCallId,
            output: confirmationResult,
          });
          return; // Exit early - don't execute the tool
        }

        // User confirmed - continue with normal tool execution
        // (falls through to the switch statement below)
      }

      setToolStates((prev) => ({
        ...prev,
        [toolCallId]: { isLoading: true, pendingConfirmation: false },
      }));

      let output = "Tool execution completed";

      try {
        // Skill management tools stay inline — they mutate React state
        if (toolName === "activate_skill") {
          const slug = String(typedArgs.slug);
          let wasAlreadyActive = false;
          setActiveSkillSlugs((prev) => {
            if (prev.includes(slug)) {
              wasAlreadyActive = true;
              return prev; // no change — return same reference
            }
            return [...prev, slug];
          });
          if (wasAlreadyActive) {
            output = `Skill "${slug}" is already active. No changes made.`;
          } else {
            setIsManualOverride(false);
            output = `Skill "${slug}" activated. Context and tools will update on the next message.`;
          }
        } else if (toolName === "deactivate_skill") {
          const slug = String(typedArgs.slug);
          setActiveSkillSlugs((prev) => prev.filter((s) => s !== slug));
          output = `Skill "${slug}" deactivated. Context reduced on the next message.`;
        } else {
          // Dispatch to extracted tool executors
          const result = await executeToolCall(toolName, typedArgs as Record<string, any>);
          output = result.output;

          // Merge metadata into toolStates (e.g. generated image URLs)
          if (result.metadata) {
            setToolStates((prev) => ({
              ...prev,
              [toolCallId]: {
                ...prev[toolCallId],
                ...result.metadata,
              },
            }));
            if (result.metadata.artifactRef) {
              addArtifactRef(result.metadata.artifactRef as ArtifactRef);
            }
          }
        }

        setToolStates((prev) => ({
          ...prev,
          [toolCallId]: { isLoading: false, completed: true, output },
        }));
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        output = `Error: ${errorMessage}`;
        setToolStates((prev) => ({
          ...prev,
          [toolCallId]: { isLoading: false, error: errorMessage },
        }));
      }

      addToolResult({
        tool: toolName,
        toolCallId,
        output,
      });
    },

    onFinish: ({ finishReason, isError }) => {
      if (isError) return;
      if (finishReason === "length") {
        setStreamNotice(
          "Stopped: output or context limit. Try a shorter message, compress history, or start a new chat."
        );
        return;
      }
      if (finishReason === "content-filter") {
        setStreamNotice(
          "The model declined this request (content policy). Rephrase or narrow what you are asking."
        );
        return;
      }
      if (finishReason === "other") {
        setStreamNotice(
          "Generation ended unusually. If the thread is long, try compressing the conversation or starting fresh."
        );
      }
    },
  });

  // Chat search hook (needs messages from useChat)
  const {
    showSearch,
    setShowSearch,
    searchQuery,
    searchResults,
    currentSearchIndex,
    messageRefs,
    handleSearch,
    nextSearchResult,
    prevSearchResult,
    closeSearch,
  } = useMessageSearch(messages);

  // Load conversation history with pagination
  const loadConversations = useCallback(
    async (offset = 0) => {
      try {
        const res = await fetch(`/api/conversations?limit=${conversationsLimit}&offset=${offset}`);
        const data = await res.json();
        setSavedConversations(data.conversations || []);
        setConversationsTotal(data.total || 0);
        setConversationsOffset(offset);
        return data.conversations || [];
      } catch (error) {
        console.error("Failed to load conversations:", error);
        return [];
      }
    },
    [conversationsLimit]
  );

  // On mount: check for prefill first, otherwise load most recent conversation
  useEffect(() => {
    const initChat = async () => {
      // Check for prefill FIRST (from "Edit with Kronus" buttons)
      const prefill = sessionStorage.getItem("kronusPrefill");
      if (prefill) {
        // Clear prefill and start FRESH NEW conversation with the context
        sessionStorage.removeItem("kronusPrefill");
        setMessages([]); // Clear all messages
        setCurrentConversationId(null); // No existing conversation
        setToolStates({}); // Clear any tool states
        setHasSentPrefill(true);

        // Load conversation list in background (for sidebar)
        loadConversations();

        // Send the prefill message after a brief delay to ensure state is cleared
        // Pass config via sendMessage body to avoid stale data issue
        setTimeout(() => {
          setStreamNotice(null);
          sendMessage(
            { text: prefill },
            {
              body: {
                soulConfig,
                toolsConfig,
                modelConfig,
                activeSkillSlugs,
              },
            }
          );
        }, 150);
        return;
      }

      // No prefill - load conversations and auto-load most recent
      const conversations = await loadConversations();
      if (conversations.length > 0 && messages.length === 0 && !currentConversationId) {
        const mostRecent = conversations[0]; // Already sorted by updated_at desc
        handleLoadConversation(mostRecent.id);
      }
    };
    initChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Opt-in debug logs only (prevents console spam during token streaming)
  const shouldLogChatDebug =
    process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_CHAT_DEBUG === "1";

  useEffect(() => {
    if (!shouldLogChatDebug) return;
    console.log("[Chat Debug] Status:", status, "Messages:", messages.length, "Error:", error);
    if (messages.length > 0) {
      const last = messages[messages.length - 1] as {
        id?: string;
        role?: string;
        content?: unknown;
        parts?: unknown[];
      };
      console.log("[Chat Debug] Last message:", {
        id: last.id,
        role: last.role,
        parts: Array.isArray(last.parts) ? last.parts.length : 0,
        contentPreview:
          typeof last.content === "string" ? last.content.slice(0, 120) : undefined,
      });
    }
  }, [shouldLogChatDebug, status, messages.length, error]);

  // Auto-scroll to bottom - throttled with requestAnimationFrame
  const scrollTimeoutRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    if (scrollTimeoutRef.current) {
      cancelAnimationFrame(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
    return () => {
      if (scrollTimeoutRef.current) {
        cancelAnimationFrame(scrollTimeoutRef.current);
      }
    };
  }, [messages.length, status]);

  // Helper to get the actual scrollable viewport inside ScrollArea
  const getScrollViewport = useCallback(() => {
    return scrollRef.current;
  }, []);

  // Scroll to first message
  const scrollToFirst = useCallback(() => {
    const viewport = getScrollViewport();
    if (viewport) {
      viewport.scrollTop = 0;
    }
  }, [getScrollViewport]);

  // Scroll to last message
  const scrollToLast = useCallback(() => {
    const viewport = getScrollViewport();
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [getScrollViewport]);


  // Track if prefill was sent (used by init effect)
  const [hasSentPrefill, setHasSentPrefill] = useState(false);


  // Core send — actually dispatches the message to Kronus
  const doSend = useCallback(
    (text: string) => {
      if (messages.length === 0 && !lockedSoulConfig) {
        setLockedSoulConfig(soulConfig);
      }
      const effectiveSoulConfig = lockedSoulConfig || soulConfig;
      const effectiveToolsConfig = toolsConfig;
      sendMessage(
        {
          text: text || "What do you see in this image?",
          files: selectedFiles,
        },
        {
          body: {
            soulConfig: effectiveSoulConfig,
            toolsConfig: effectiveToolsConfig,
            modelConfig,
            activeSkillSlugs,
          },
        }
      );
      setInput("");
      clearFiles();
      setDaimonPolishResult(null);
    },
    [
      messages.length,
      lockedSoulConfig,
      soulConfig,
      toolsConfig,
      selectedFiles,
      modelConfig,
      activeSkillSlugs,
      sendMessage,
      clearFiles,
    ]
  );

  // Daimon polish — triggered explicitly via Cmd+Enter
  const handleDaimonPolish = useCallback(async () => {
    if (!input.trim() || daimonLoading || daimonPolishResult) return;
    setDaimonLoading(true);
    setDaimonPrevInput(input);
    try {
      const res = await fetch("/api/daimon/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input.trim(),
          sourceContext: "kronus-chat",
        }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "Unknown error");
        console.warn("[Daimon] Polish failed:", res.status, err);
        setDaimonLoading(false);
        return;
      }
      const data = await res.json();
      setDaimonPolishResult({
        original: input.trim(),
        polished: data.hadChanges ? data.polishedText : input.trim(),
        didTranslate: data.didTranslate ?? false,
        notes: data.notes ?? null,
      });
    } catch (err) {
      console.warn("[Daimon] Polish error:", err);
    }
    setDaimonLoading(false);
  }, [input, daimonLoading, daimonPolishResult]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStreamNotice(null);
    if ((!input.trim() && !selectedFiles) || status === "submitted" || status === "streaming")
      return;
    doSend(input);
  };

  // Handle editing a user message - removes all messages after it and re-sends
  const handleEditMessage = (messageId: string) => {
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    const message = messages[messageIndex];
    // Get the text content from the message
    const textContent =
      message.parts
        ?.filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n") || "";

    setEditingMessageId(messageId);
    setEditingMessageContent(textContent);
  };

  // Submit the edited message
  const handleSubmitEdit = () => {
    if (!editingMessageId || !editingMessageContent.trim()) return;
    setStreamNotice(null);

    const messageIndex = messages.findIndex((m) => m.id === editingMessageId);
    if (messageIndex === -1) return;

    // Remove all messages from the edited one onwards
    const newMessages = messages.slice(0, messageIndex);
    setMessages(newMessages as any);

    // Clear edit state
    setEditingMessageId(null);
    setEditingMessageContent("");

    // Send the edited message
    const effectiveSoulConfig = lockedSoulConfig || soulConfig;
    const effectiveToolsConfig = toolsConfig; // Always use current - tools can be toggled mid-chat

    // Small delay to allow state update
    setTimeout(() => {
      sendMessage(
        { text: editingMessageContent },
        {
          body: {
            soulConfig: effectiveSoulConfig,
            toolsConfig: effectiveToolsConfig,
            modelConfig,
            activeSkillSlugs,
          },
        }
      );
    }, 50);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingMessageContent("");
  };

  // Regenerate the last assistant response
  const handleRegenerateResponse = () => {
    if (messages.length < 2) return;
    if (status === "streaming" || status === "submitted") return;
    setStreamNotice(null);

    // Find the last user message
    let lastUserMessageIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserMessageIndex = i;
        break;
      }
    }

    if (lastUserMessageIndex === -1) return;

    // Get the user message content
    const userMessage = messages[lastUserMessageIndex];
    const textContent =
      userMessage.parts
        ?.filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n") || "";

    // Remove all messages after and including the last user message
    const newMessages = messages.slice(0, lastUserMessageIndex);
    setMessages(newMessages as any);

    // Re-send the user message
    const effectiveSoulConfig = lockedSoulConfig || soulConfig;
    const effectiveToolsConfig = toolsConfig; // Always use current - tools can be toggled mid-chat

    setTimeout(() => {
      sendMessage(
        { text: textContent },
        {
          body: {
            soulConfig: effectiveSoulConfig,
            toolsConfig: effectiveToolsConfig,
            modelConfig,
            activeSkillSlugs,
          },
        }
      );
    }, 50);
  };

  // Convert DB format messages to AI SDK format (restores tool invocations)
  const convertDBMessagesToAISDK = (
    dbMsgs: Array<{ id: string; role: string; content: string; parts?: any[] }>
  ) => {
    // Filter out tool messages as UIMessage only accepts user/assistant/system
    return dbMsgs
      .filter((m) => m.role !== "tool")
      .map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant" | "system",
        // Use saved parts if available, otherwise create text part
        parts: m.parts || [{ type: "text" as const, text: m.content }],
      }));
  };

  // Convert AI SDK messages to DB format
  const convertMessagesToDBFormat = (
    msgs: typeof messages
  ): Array<{ id: string; role: string; content: string; parts?: any[] }> => {
    return msgs.map((m) => {
      // Extract text content from parts
      const textParts = m.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n");
      return {
        id: m.id,
        role: m.role,
        content: textParts || "",
        parts: m.parts as any[],
      };
    });
  };

  // Warn user before closing/refreshing tab during streaming
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status === "streaming" || status === "submitted") {
        e.preventDefault();
        e.returnValue = `${agentName} is still responding. Are you sure you want to leave?`;
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [status]);

  // Auto-save conversation when assistant completes response
  useEffect(() => {
    // Only auto-save if:
    // 1. We have messages
    // 2. Status is idle (conversation complete)
    // 3. Last message is from assistant
    // 4. We have at least one user message and one assistant message
    // 5. Messages count has actually increased (not just a load from history)
    if (
      messages.length >= 2 &&
      status === "ready" &&
      messages[messages.length - 1]?.role === "assistant" &&
      messages.length > lastSavedMessageCountRef.current
    ) {
      const autoSave = async () => {
        try {
          // Generate title from first user message (truncate to 50 chars)
          const firstUserMessage = messages.find((m) => m.role === "user");
          if (!firstUserMessage) return;

          const textParts = firstUserMessage.parts
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join(" ");
          const title = textParts.substring(0, 50).trim() || "Untitled Conversation";

          const dbMessages = convertMessagesToDBFormat(messages);

          if (currentConversationId) {
            // Update existing conversation
            const res = await fetch(`/api/conversations/${currentConversationId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title,
                messages: dbMessages,
                sessionConfig: toChatSessionSnapshot({
                  soulConfig,
                  toolsConfig,
                  modelConfig,
                  formatConfig,
                  activeSkillSlugs,
                  lockedSoulConfig,
                  isManualOverride,
                }),
                artifactRefs,
              }),
            });
            if (res.ok) {
              lastSavedMessageCountRef.current = messages.length;
              loadConversations();
            }
          } else {
            // Create new conversation
            const res = await fetch("/api/conversations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title,
                messages: dbMessages,
                sessionConfig: toChatSessionSnapshot({
                  soulConfig,
                  toolsConfig,
                  modelConfig,
                  formatConfig,
                  activeSkillSlugs,
                  lockedSoulConfig,
                  isManualOverride,
                }),
                artifactRefs,
              }),
            });
            const data = await res.json();
            if (res.ok) {
              setCurrentConversationId(data.id);
              lastSavedMessageCountRef.current = messages.length;
              loadConversations();
            }
          }
        } catch (error) {
          console.error("Failed to auto-save conversation:", error);
        }
      };

      // Debounce auto-save to avoid too frequent saves
      const timeoutId = setTimeout(autoSave, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [
    messages,
    status,
    currentConversationId,
    loadConversations,
    soulConfig,
    toolsConfig,
    modelConfig,
    formatConfig,
    activeSkillSlugs,
    lockedSoulConfig,
    isManualOverride,
    artifactRefs,
  ]);

  // Persist generated Muse artifacts even when the message count did not
  // change after the tool finished. This keeps old Kronus chat rows
  // compatible with the Hourglass shelf.
  useEffect(() => {
    if (!currentConversationId || artifactRefs.length === 0 || status !== "ready" || messages.length === 0) {
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        const firstUserMessage = messages.find((m) => m.role === "user");
        const title =
          firstUserMessage?.parts
            ?.filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join(" ")
            .substring(0, 50)
            .trim() || "Untitled Conversation";

        await fetch(`/api/conversations/${currentConversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            messages: convertMessagesToDBFormat(messages),
            sessionConfig: toChatSessionSnapshot({
              soulConfig,
              toolsConfig,
              modelConfig,
              formatConfig,
              activeSkillSlugs,
              lockedSoulConfig,
              isManualOverride,
            }),
            artifactRefs,
          }),
        });
      } catch (error) {
        console.error("Failed to save artifact refs:", error);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [
    artifactRefs,
    currentConversationId,
    status,
    messages,
    soulConfig,
    toolsConfig,
    modelConfig,
    formatConfig,
    activeSkillSlugs,
    lockedSoulConfig,
    isManualOverride,
  ]);

  const handleSaveConversation = async () => {
    if (!saveTitle.trim() || messages.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: saveTitle,
          messages: convertMessagesToDBFormat(messages),
          sessionConfig: toChatSessionSnapshot({
            soulConfig,
            toolsConfig,
            modelConfig,
            formatConfig,
            activeSkillSlugs,
            lockedSoulConfig,
            isManualOverride,
          }),
          artifactRefs,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentConversationId(data.id);
        setShowSaveDialog(false);
        setSaveTitle("");
        loadConversations();
      }
    } catch (error) {
      console.error("Failed to save conversation:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadConversation = async (id: number) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = await res.json();
      if (res.ok) {
        // Convert DB format to AI SDK format
        const convertedMessages = convertDBMessagesToAISDK(data.messages);
        // Set baseline BEFORE setting messages to prevent auto-save trigger
        lastSavedMessageCountRef.current = convertedMessages.length;
        setMessages(convertedMessages);
        try {
          setArtifactRefs(JSON.parse(data.artifact_refs ?? "[]") as ArtifactRef[]);
        } catch {
          setArtifactRefs([]);
        }
        setCurrentConversationId(id);
        setShowHistory(false);
        setToolStates({});
        const restored = parseChatSessionSnapshot(
          typeof data.session_config === "string" ? data.session_config : null,
        );
        if (restored) {
          setSoulConfig(restored.soulConfig);
          setToolsConfig(restored.toolsConfig);
          setModelConfig(restored.modelConfig);
          setFormatConfig(restored.formatConfig);
          setActiveSkillSlugs(restored.activeSkillSlugs);
          setLockedSoulConfig(restored.lockedSoulConfig);
          setIsManualOverride(restored.isManualOverride);
        }
      }
    } catch (error) {
      console.error("Failed to load conversation:", error);
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setArtifactRefs([]);
    setCurrentConversationId(null);
    setToolStates({});
    lastSavedMessageCountRef.current = 0;
    setShowHistory(false);
    setLockedSoulConfig(null); // Unlock soul config for new conversation
    setActiveSkillSlugs([]); // Reset to lean mode
    setIsManualOverride(false); // Reset manual override
    // Note: toolsConfig is never locked - it's always dynamic
  };

  const handleDeleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      loadConversations();
      if (currentConversationId === id) {
        handleNewConversation();
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  // Generate or update summary for a conversation (manual trigger)
  const handleGenerateSummary = async (convId: number, force: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    setGeneratingSummaryFor(convId);
    try {
      const res = await fetch(`/api/conversations/${convId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      if (res.ok) {
        const data = await res.json();
        // Update the conversation in state (including title if regenerated)
        setSavedConversations((prev) =>
          prev.map((conv) =>
            conv.id === convId
              ? {
                  ...conv,
                  title: data.title || conv.title,
                  summary: data.summary,
                  summary_updated_at: data.summary_updated_at,
                }
              : conv
          )
        );
      }
    } catch (error) {
      console.error("Failed to generate summary:", error);
    } finally {
      setGeneratingSummaryFor(null);
    }
  };

  // Backfill all conversations without summaries
  const handleBackfillAll = async () => {
    setIsBackfilling(true);
    try {
      const res = await fetch("/api/conversations/backfill-summaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 100 }), // Process up to 100 conversations
      });
      if (res.ok) {
        // Refresh conversations to show new summaries/titles
        loadConversations();
      }
    } catch (error) {
      console.error("Failed to backfill summaries:", error);
    } finally {
      setIsBackfilling(false);
    }
  };

  // Check if conversation has changes since last summary
  const conversationHasChanges = (conv: SavedConversation): boolean => {
    if (!conv.summary_updated_at) return true; // No summary = needs one
    return new Date(conv.updated_at) > new Date(conv.summary_updated_at);
  };

  // Estimate tokens in current conversation (rough: ~4 chars per token)
  const conversationTokens = useMemo(() => {
    const textContent = messages
      .map((m) => {
        const textParts = m.parts?.filter((p) => p.type === "text") || [];
        return textParts.map((p: any) => p.text || "").join("");
      })
      .join("");
    return Math.round(textContent.length / 4);
  }, [messages]);

  // Total context = Soul context (system prompt) + Conversation messages
  const totalContextTokens = soulContextTokens + conversationTokens;

  // Context limit based on selected model (dynamic)
  const CONTEXT_LIMIT = MODEL_CONTEXT_LIMITS[modelConfig.model] || 200000;
  const WARNING_THRESHOLD = 0.7; // 70%
  const COMPRESS_THRESHOLD = 0.85; // 85%

  const contextUsagePercent = (totalContextTokens / CONTEXT_LIMIT) * 100;
  const showContextWarning = totalContextTokens > CONTEXT_LIMIT * WARNING_THRESHOLD;
  const showCompressButton = totalContextTokens > CONTEXT_LIMIT * 0.5; // Show at 50%

  // Handle context compression
  const handleCompressContext = async () => {
    if (!currentConversationId) {
      // Save current conversation first if not saved
      alert("Please save the conversation first before compressing.");
      return;
    }

    setIsCompressingContext(true);
    try {
      const response = await fetch("/api/chat/compress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: currentConversationId }),
      });

      const result = await response.json();

      if (result.success) {
        // Show the summary to the user
        alert(
          `Conversation compressed!\n\nOverview: ${result.summary.conversationOverview}\n\nTopics: ${result.summary.topicsDiscussed.join(", ")}`
        );
        // Reload conversations to show updated status
        loadConversations();
      } else {
        alert(`Compression failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Failed to compress context:", error);
      alert("Failed to compress context. Please try again.");
    } finally {
      setIsCompressingContext(false);
    }
  };

  const toggleToolExpanded = (toolCallId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolCallId)) {
        next.delete(toolCallId);
      } else {
        next.add(toolCallId);
      }
      return next;
    });
  };

  return (
    <div
      className={cn(
        "kronus-chamber relative flex h-full",
        kronusTheme === "light" && "kronus-light"
      )}
    >
      {/* Conversation History Sidebar */}
      {showHistory && (
        <div className={cn(
          "kronus-sidebar z-10 flex flex-col",
          isMobile ? "absolute inset-0 z-20 w-full" : "w-96"
        )}>
          <div className="flex items-center justify-between border-b p-3">
            <h3 className="text-sm font-semibold">Saved Chats</h3>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={handleBackfillAll}
                    disabled={isBackfilling}
                  >
                    {isBackfilling ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[var(--tartarus-gold)]" />
                    ) : (
                      <Wand2 className="h-4 w-4 text-[var(--tartarus-teal)]" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isBackfilling ? "Generating summaries..." : "Generate all missing summaries"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={handleNewConversation}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">New chat</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setShowHistory(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Close sidebar</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-1 p-2">
              {savedConversations.length === 0 ? (
                <p className="p-3 text-center text-xs text-[var(--tartarus-ivory-muted)] italic">
                  No saved conversations yet
                </p>
              ) : (
                savedConversations.map((conv) => {
                  const hasSummary = !!conv.summary;
                  const hasChanges = conversationHasChanges(conv);
                  const isGenerating = generatingSummaryFor === conv.id;
                  const needsSummary = !hasSummary || hasChanges;

                  return (
                    <div
                      key={conv.id}
                      onClick={() => handleLoadConversation(conv.id)}
                      className={cn(
                        "kronus-sidebar-item group cursor-pointer rounded-md p-2.5",
                        currentConversationId === conv.id && "active"
                      )}
                    >
                      {/* Top row: Icons */}
                      <div className="mb-1 flex items-center gap-2">
                        {/* 1. Summary status icon - Eye of Kronus */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              {hasSummary ? (
                                <Eye className="h-4 w-4 text-[var(--tartarus-gold)] drop-shadow-[0_0_4px_var(--tartarus-gold)]" />
                              ) : (
                                <EyeOff className="h-4 w-4 text-[var(--tartarus-ivory-muted)] opacity-50" />
                              )}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent
                            side="right"
                            sideOffset={8}
                            className="z-[100] max-w-[300px] rounded-lg border-2 border-[var(--tartarus-gold)]/40 bg-[var(--tartarus-void)] p-4 shadow-2xl"
                          >
                            {hasSummary ? (
                              <div className="space-y-2">
                                <p className="border-b border-[var(--tartarus-gold)]/20 pb-1.5 text-[11px] font-semibold tracking-widest text-[var(--tartarus-gold)] uppercase">
                                  Kronus Remembers
                                </p>
                                <p className="text-[13px] leading-relaxed text-[#e8e4d9]">
                                  {conv.summary}
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <p className="text-[11px] font-semibold tracking-widest text-[#6b6b7b] uppercase">
                                  Unseen
                                </p>
                                <p className="text-xs text-[#6b6b7b] italic">
                                  No memory yet recorded
                                </p>
                              </div>
                            )}
                          </TooltipContent>
                        </Tooltip>

                        {/* 2. Generate/Update summary button - only active if needs update */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "h-6 w-6 p-0 transition-opacity",
                                needsSummary ? "opacity-100" : "cursor-not-allowed opacity-30"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (needsSummary) handleGenerateSummary(conv.id, hasChanges, e);
                              }}
                              disabled={isGenerating || !needsSummary}
                            >
                              {isGenerating ? (
                                <Loader2 className="h-4 w-4 animate-spin text-[var(--tartarus-gold)]" />
                              ) : (
                                <RefreshCw
                                  className={cn(
                                    "h-4 w-4",
                                    needsSummary
                                      ? "text-[var(--tartarus-teal)]"
                                      : "text-[var(--tartarus-ivory-muted)]"
                                  )}
                                />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="right"
                            className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]"
                          >
                            <div className="text-xs">
                              <p>
                                {isGenerating
                                  ? "Generating..."
                                  : needsSummary
                                    ? hasSummary
                                      ? "Update summary"
                                      : "Generate summary"
                                    : "Summary up to date"}
                              </p>
                              {conv.summary_updated_at && (
                                <p className="mt-1 text-[var(--tartarus-ivory-muted)]">
                                  Last: {formatDateShort(conv.summary_updated_at)}
                                </p>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>

                        {/* Spacer */}
                        <div className="flex-1" />

                        {/* Delete button - appears on hover */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                              onClick={(e) => handleDeleteConversation(conv.id, e)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-[var(--tartarus-error)]" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]"
                          >
                            <p className="text-xs">Delete</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>

                      {/* Title */}
                      <p className="truncate text-sm font-medium">{conv.title}</p>

                      {/* Date */}
                      <p className="mt-0.5 text-xs text-[var(--tartarus-ivory-muted)]">
                        {formatDateShort(conv.updated_at)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
          {/* Pagination */}
          {conversationsTotal > conversationsLimit && (
            <div className="border-t p-3">
              <div className="mb-2 flex items-center justify-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={conversationsOffset === 0}
                      onClick={() => loadConversations(conversationsOffset - conversationsLimit)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Newer chats</TooltipContent>
                </Tooltip>
                <span className="min-w-[60px] text-center text-xs text-[var(--tartarus-ivory-muted)]">
                  {Math.floor(conversationsOffset / conversationsLimit) + 1} /{" "}
                  {Math.ceil(conversationsTotal / conversationsLimit)}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={conversationsOffset + conversationsLimit >= conversationsTotal}
                      onClick={() => loadConversations(conversationsOffset + conversationsLimit)}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Older chats</TooltipContent>
                </Tooltip>
              </div>
              <p className="text-center text-[10px] text-[var(--tartarus-ivory-muted)]">
                {conversationsTotal} conversations
              </p>
            </div>
          )}
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Toolbar */}
        <div className="kronus-toolbar z-10 flex items-center gap-1 px-2 py-2 md:gap-2 md:px-4">
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
            <History className={cn("h-4 w-4", !isMobile && "mr-1")} />
            {!isMobile && "History"}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleNewConversation}>
            <Plus className={cn("h-4 w-4", !isMobile && "mr-1")} />
            {!isMobile && "New"}
          </Button>

          {/* Visual separator between action & config groups */}
          <div className="mx-1 h-5 w-px bg-[var(--tartarus-border)]" />

          {/* Skills — on-demand context loading (primary control) */}
          <SkillSelector
            activeSkillSlugs={activeSkillSlugs}
            onChange={(slugs) => {
              setActiveSkillSlugs(slugs);
              setIsManualOverride(false);
            }}
            isManualOverride={isManualOverride}
            soulConfig={soulConfig}
            onSoulChange={(config) => {
              setSoulConfig(config);
              if (config.chatIndex) {
                setToolsConfig((prev) => ({ ...prev, memory: true }));
              }
              setIsManualOverride(true);
            }}
            toolsConfig={toolsConfig}
            onToolsChange={(config) => {
              setToolsConfig(config);
              setIsManualOverride(true);
            }}
          />

          <ModelConfig config={modelConfig} onChange={setModelConfig} />
          <FormatConfig config={formatConfig} onChange={setFormatConfig} />

          {/* Daimon toggle — inline polish-before-send */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setDaimonEnabled(!daimonEnabled)}
                className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs transition-[color,background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
                style={{
                  color: daimonEnabled ? "var(--tartarus-gold)" : "var(--tartarus-ivory-muted)",
                  backgroundColor: daimonEnabled ? "rgba(196, 162, 101, 0.12)" : "transparent",
                  border: daimonEnabled ? "1px solid rgba(196, 162, 101, 0.25)" : "1px solid transparent",
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Daimon</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {daimonEnabled ? "Daimon active — Cmd+Enter to polish" : "Enable Daimon — Cmd+Enter to polish before sending"}
            </TooltipContent>
          </Tooltip>

          {/* Context Usage Indicator */}
          {messages.length > 0 && (
            <div
              className="ml-1 flex items-center gap-1 rounded-md px-1.5 py-1 md:ml-2 md:gap-1.5 md:px-2"
              style={{
                backgroundColor:
                  contextUsagePercent > 70 ? "rgba(212, 175, 55, 0.15)" : "rgba(0, 206, 209, 0.1)",
                border: `1px solid ${contextUsagePercent > 70 ? "rgba(212, 175, 55, 0.3)" : "rgba(0, 206, 209, 0.2)"}`,
              }}
              title={`Total: ${totalContextTokens.toLocaleString()} / ${CONTEXT_LIMIT.toLocaleString()} tokens\nSoul context: ~${soulContextTokens.toLocaleString()}\nConversation: ~${conversationTokens.toLocaleString()}`}
            >
              <Gauge
                className="h-3.5 w-3.5"
                style={{ color: contextUsagePercent > 70 ? "#D4AF37" : "#00CED1" }}
              />
              <span
                className="font-mono text-[11px] font-medium"
                style={{ color: contextUsagePercent > 70 ? "#D4AF37" : "#00CED1" }}
              >
                {contextUsagePercent.toFixed(0)}%
              </span>
            </div>
          )}

          <div className="flex-1" />

          {/* Mobile: overflow menu for secondary actions */}
          {isMobile ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] text-[var(--tartarus-ivory)] shadow-lg shadow-black/40 backdrop-blur-sm">
                <DropdownMenuItem onSelect={() => setShowSearch(!showSearch)} className="focus:bg-[var(--tartarus-elevated)] focus:text-[var(--tartarus-ivory)]">
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={scrollToFirst} className="focus:bg-[var(--tartarus-elevated)] focus:text-[var(--tartarus-ivory)]">
                  <ChevronUp className="mr-2 h-4 w-4" />
                  Jump to first
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={scrollToLast} className="focus:bg-[var(--tartarus-elevated)] focus:text-[var(--tartarus-ivory)]">
                  <ChevronDown className="mr-2 h-4 w-4" />
                  Jump to last
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[var(--tartarus-border)]" />
                <DropdownMenuItem onSelect={() => {
                  const firstTextPart = messages[0]?.parts?.find(
                    (p): p is { type: "text"; text: string } => p.type === "text"
                  );
                  setSaveTitle(firstTextPart?.text?.substring(0, 50) || "Untitled");
                  setShowSaveDialog(true);
                }} className="focus:bg-[var(--tartarus-elevated)] focus:text-[var(--tartarus-ivory)]">
                  <Save className="mr-2 h-4 w-4" />
                  Save Chat
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            messages.length > 0 && (
            <>
              {/* Search toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSearch(!showSearch)}
                className={showSearch ? "bg-[var(--tartarus-surface)]" : ""}
              >
                <Search className="mr-1 h-4 w-4" />
                Search
              </Button>
              {/* Jump to first */}
              <Button
                variant="ghost"
                size="sm"
                onClick={scrollToFirst}
                title="Jump to first message"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              {/* Jump to last */}
              <Button variant="ghost" size="sm" onClick={scrollToLast} title="Jump to last message">
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const firstTextPart = messages[0]?.parts?.find(
                    (p): p is { type: "text"; text: string } => p.type === "text"
                  );
                  setSaveTitle(firstTextPart?.text?.substring(0, 50) || "Untitled");
                  setShowSaveDialog(true);
                }}
              >
                <Save className="mr-1 h-4 w-4" />
                Save Chat
              </Button>
            </>
            )
          )}
        </div>

        {/* Search Bar */}
        {showSearch && (
          <div className="flex items-center gap-2 border-b border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] px-4 py-2">
            <Search className="h-4 w-4 text-[var(--tartarus-ivory-muted)]" />
            <Input
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search messages... (Esc to close)"
              className="h-8 flex-1 border-[var(--tartarus-border)] bg-[var(--tartarus-void)] text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (e.shiftKey) {
                    prevSearchResult();
                  } else {
                    nextSearchResult();
                  }
                }
              }}
            />
            {searchResults.length > 0 && (
              <span className="text-xs whitespace-nowrap text-[var(--tartarus-ivory-muted)]">
                {currentSearchIndex + 1} of {searchResults.length}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={prevSearchResult}
              disabled={searchResults.length === 0}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={nextSearchResult}
              disabled={searchResults.length === 0}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={closeSearch}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Messages Area */}
        <div className="z-10 min-w-0 w-full flex-1 overflow-hidden">
          <div className="h-full w-full overflow-x-auto overflow-y-auto" ref={scrollRef}>
          <div
            className="mx-auto w-full max-w-3xl space-y-5 p-2 md:p-4"
            style={{
              fontFamily: KRONUS_FONTS[formatConfig.font || "inter"].family,
              fontSize: KRONUS_FONT_SIZES[formatConfig.fontSize || "base"].size,
            }}
          >
            {messages.length === 0 && (
              <div className="kronus-message p-3 md:p-4">
                <div className="flex items-start gap-3 md:gap-4">
                  <div className="kronus-avatar flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full p-0 md:h-12 md:w-12">
                    <img
                      src="/chronus-logo.png"
                      alt={agentName}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-gradient-teal-gold text-xl font-semibold">
                      {agentName} — Oracle of Tartarus
                    </h3>
                    <p className="mt-3 leading-relaxed text-[var(--tartarus-ivory-muted)]">
                      Greetings, seeker. I am{" "}
                      <span className="font-medium text-[var(--tartarus-teal)]">{agentName}</span>,
                      keeper of Tartarus and guardian of your coding journey.
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--tartarus-ivory-muted)]">
                      I start lean and load context on demand. Activate{" "}
                      <span className="text-[var(--tartarus-purple)]">Skills</span> to shape my focus,
                      or configure{" "}
                      <span className="text-[var(--tartarus-purple)]">Tools</span> and{" "}
                      <span className="text-[var(--tartarus-purple)]">Soul</span> directly.
                      Write operations require your approval.
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <p className="text-[var(--tartarus-ivory-muted)]">
                        📜 <strong className="text-[var(--tartarus-ivory)]">Journal:</strong> Entries,
                        history, project summaries
                      </p>
                      <p className="text-[var(--tartarus-ivory-muted)]">
                        📚 <strong className="text-[var(--tartarus-ivory)]">Library:</strong>{" "}
                        Writings, skills, CV, portfolio
                      </p>
                      <p className="text-[var(--tartarus-ivory-muted)]">
                        🔗 <strong className="text-[var(--tartarus-ivory)]">Linear:</strong> Issues,
                        projects, status updates
                      </p>
                      <p className="text-[var(--tartarus-ivory-muted)]">
                        📝 <strong className="text-[var(--tartarus-ivory)]">Slite:</strong> Search,
                        read & write team notes
                      </p>
                      <p className="text-[var(--tartarus-ivory-muted)]">
                        🌐 <strong className="text-[var(--tartarus-ivory)]">Web:</strong> Gemini
                        Search, Perplexity research
                      </p>
                      <p className="text-[var(--tartarus-ivory-muted)]">
                        🎨 <strong className="text-[var(--tartarus-ivory)]">Media:</strong> Image
                        generation, media library
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {messages.map((message, messageIndex) => {
              const isSearchMatch = searchResults.includes(messageIndex);
              const isCurrentSearchResult = searchResults[currentSearchIndex] === messageIndex;

              return (
                <div
                  key={message.id}
                  className="w-full min-w-0 space-y-2"
                  ref={(el) => {
                    if (el) messageRefs.current.set(message.id, el);
                  }}
                >
                  <div
                    className={cn(
                      "min-w-0 p-2.5 transition-[box-shadow,background-color] duration-200",
                      message.role === "user" ? "user-message ml-1 sm:ml-4 md:ml-12" : "kronus-message",
                      isSearchMatch && "ring-2 ring-[var(--tartarus-teal)]/50",
                      isCurrentSearchResult &&
                        "bg-[var(--tartarus-gold)]/5 ring-2 ring-[var(--tartarus-gold)]"
                    )}
                  >
                    {message.role === "user" ? (
                      /* User message: simple horizontal layout with edit capability */
                      <div className="group/user-msg flex items-start gap-2.5">
                        <div className="user-avatar flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full">
                          <User className="h-4 w-4 text-white" />
                        </div>
                        <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                          <div className="mb-1.5 flex items-center justify-between">
                            <p className="text-xs font-medium text-[var(--tartarus-ivory-muted)]">You</p>
                            {/* Edit button - visible on hover, hidden during streaming or when editing */}
                            {editingMessageId !== message.id &&
                              status !== "streaming" &&
                              status !== "submitted" && (
                                <button
                                  onClick={() => handleEditMessage(message.id)}
                                  className="rounded p-1 text-[var(--tartarus-ivory-muted)] opacity-0 transition-opacity group-hover/user-msg:opacity-100 hover:bg-[var(--tartarus-surface)] hover:text-[var(--tartarus-gold)]"
                                  title="Edit message"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                          </div>
                          {/* Edit mode UI */}
                          {editingMessageId === message.id ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editingMessageContent}
                                onChange={(e) => setEditingMessageContent(e.target.value)}
                                className="min-h-[80px] resize-y border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-[var(--tartarus-ivory)]"
                                autoFocus
                              />
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  onClick={handleSubmitEdit}
                                  disabled={!editingMessageContent.trim()}
                                  className="bg-[var(--tartarus-gold)] text-[var(--tartarus-deep)] hover:bg-[var(--tartarus-gold)]/80"
                                >
                                  <Send className="mr-1 h-3 w-3" />
                                  Send
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={handleCancelEdit}
                                  className="text-[var(--tartarus-ivory-muted)] hover:text-[var(--tartarus-ivory)]"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="max-w-none break-words [overflow-wrap:anywhere]">
                              {message.parts?.map((part, i) => {
                                if (
                                  part.type === "file" &&
                                  (part as any).mediaType?.startsWith("image/")
                                ) {
                                  return (
                                    <div key={i} className="mb-3">
                                      <img
                                        src={(part as any).url}
                                        alt={(part as any).filename || "Attached image"}
                                        className="max-h-96 max-w-full rounded-lg border border-[var(--tartarus-border)] object-contain"
                                      />
                                    </div>
                                  );
                                }
                                if (part.type === "text") {
                                  return <MemoizedMarkdown key={i} text={part.text} />;
                                }
                                return null;
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Kronus message: avatar + name on one row, content below */
                      <div className="group/kronus-msg flex flex-col">
                        {/* Header row: avatar centered with name */}
                        <div className="mb-3 flex items-center gap-3">
                          <div className="kronus-avatar flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full p-0">
                            <img
                              src="/chronus-logo.png"
                              alt={agentName}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <p
                            className="text-sm font-medium tracking-wide text-[var(--tartarus-ivory-muted)]"
                          >
                            {agentName}
                          </p>
                        </div>
                        {/* Content below header - indented for visual hierarchy */}
                        <div className="min-w-0 max-w-full pr-1 pl-1 break-words [overflow-wrap:anywhere] md:pr-2 md:pl-6">
                          {/* Reasoning/Thinking display - shown above the response */}
                          {(() => {
                            const reasoningParts =
                              message.parts?.filter((p: any) => p.type === "reasoning") || [];
                            const reasoningText = reasoningParts.map((p: any) => p.text).join("\n");
                            const isLastMessage = message.id === messages[messages.length - 1]?.id;
                            const isCurrentlyStreaming =
                              status === "streaming" &&
                              message.role === "assistant" &&
                              isLastMessage;

                            if (reasoningText) {
                              return (
                                <ThinkingDisplay
                                  reasoning={reasoningText}
                                  isStreaming={isCurrentlyStreaming}
                                />
                              );
                            }
                            return null;
                          })()}
                          {message.parts?.map((part, i) => {
                            // Render image/file parts
                            if (
                              part.type === "file" &&
                              (part as any).mediaType?.startsWith("image/")
                            ) {
                              return (
                                <div key={i} className="mb-3">
                                  <img
                                    src={(part as any).url}
                                    alt={(part as any).filename || "Attached image"}
                                    className="max-h-96 max-w-full rounded-lg border border-[var(--tartarus-border)] object-contain"
                                  />
                                </div>
                              );
                            }
                            // Skip reasoning parts - already displayed above
                            if (part.type === "reasoning") {
                              return null;
                            }
                            if (part.type === "text") {
                              // Check if this is the last message and still streaming
                              const isLastMessage =
                                message.id === messages[messages.length - 1]?.id;
                              const isStreaming =
                                status === "streaming" &&
                                message.role === "assistant" &&
                                isLastMessage;

                              // Use simple text during streaming, full markdown when complete
                              if (isStreaming) {
                                return <StreamingText key={i} text={part.text} />;
                              }
                              return <MemoizedMarkdown key={i} text={part.text} />;
                            }
                            return null;
                          })}
                        </div>
                        {/* Regenerate button - only on last assistant message when not streaming */}
                        {(() => {
                          const isLastAssistantMessage = (() => {
                            for (let j = messages.length - 1; j >= 0; j--) {
                              if (messages[j].role === "assistant") {
                                return messages[j].id === message.id;
                              }
                            }
                            return false;
                          })();
                          const canRegenerate =
                            isLastAssistantMessage &&
                            status !== "streaming" &&
                            status !== "submitted";

                          if (!canRegenerate) return null;

                          return (
                            <div className="mt-2 pl-2 opacity-0 transition-opacity group-hover/kronus-msg:opacity-100 md:pl-6">
                              <button
                                onClick={handleRegenerateResponse}
                                className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-[var(--tartarus-ivory-muted)] transition-colors hover:bg-[var(--tartarus-surface)] hover:text-[var(--tartarus-teal)]"
                                title="Regenerate response"
                              >
                                <RefreshCw className="h-3 w-3" />
                                Regenerate
                              </button>
                            </div>
                          );
                        })()}
                        {/* Confirmation buttons for write operations */}
                        {(() => {
                          // Only show on last assistant message when not streaming
                          const isLastAssistantMessage = (() => {
                            for (let j = messages.length - 1; j >= 0; j--) {
                              if (messages[j].role === "assistant") {
                                return messages[j].id === message.id;
                              }
                            }
                            return false;
                          })();
                          if (
                            !isLastAssistantMessage ||
                            status === "streaming" ||
                            status === "submitted"
                          )
                            return null;

                          // Get text content from message
                          const textContent =
                            message.parts
                              ?.filter((p: any) => p.type === "text")
                              .map((p: any) => p.text)
                              .join("\n") || "";

                          const { isConfirmation, proposedChanges } =
                            detectConfirmationRequest(textContent);
                          if (!isConfirmation) return null;

                          return (
                            <div className="pl-2 md:pl-6">
                              <ConfirmationButtons
                                onConfirm={() => {
                                  // Send "yes" as user response - include config in body
                                  const effectiveSoulConfig = lockedSoulConfig || soulConfig;
                                  setStreamNotice(null);
                                  sendMessage(
                                    { text: "Yes, proceed with the changes." },
                                    {
                                      body: {
                                        soulConfig: effectiveSoulConfig,
                                        toolsConfig,
                                        modelConfig,
                                        activeSkillSlugs,
                                      },
                                    }
                                  );
                                }}
                                onReject={() => {
                                  // Send "no" as user response
                                  const effectiveSoulConfig = lockedSoulConfig || soulConfig;
                                  setStreamNotice(null);
                                  sendMessage(
                                    { text: "No, cancel. Do not make the changes." },
                                    {
                                      body: {
                                        soulConfig: effectiveSoulConfig,
                                        toolsConfig,
                                        modelConfig,
                                        activeSkillSlugs,
                                      },
                                    }
                                  );
                                }}
                                proposedChanges={proposedChanges}
                                disabled={status !== "ready"}
                              />
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {message.parts
                    ?.filter((part) => part.type.startsWith("tool-"))
                    .map((part: any) => {
                      const toolName = part.type.replace("tool-", "");
                      const toolCallId = part.toolCallId;
                      const state = toolStates[toolCallId];
                      const isExpanded = expandedTools.has(toolCallId);

                      return (
                        <div
                          key={toolCallId}
                          className={cn(
                            "tool-invocation mt-2 ml-2 p-3 md:ml-12",
                            state?.completed && "success"
                          )}
                        >
                          <button
                            onClick={() => toggleToolExpanded(toolCallId)}
                            className="flex w-full items-center gap-2 text-left"
                          >
                            {state?.pendingConfirmation ? (
                              <AlertCircle className="h-4 w-4 animate-pulse text-[var(--tartarus-gold)]" />
                            ) : state?.isLoading ? (
                              <Loader2 className="text-primary h-4 w-4 animate-spin" />
                            ) : state?.error ? (
                              <AlertCircle className="text-destructive h-4 w-4" />
                            ) : state?.completed ? (
                              <CheckCircle2 className="h-4 w-4 text-[var(--tartarus-success)]" />
                            ) : (
                              <Wrench className="text-muted-foreground h-4 w-4" />
                            )}
                            <span className="flex-1 font-mono text-sm">{toolName}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                state?.pendingConfirmation
                                  ? "border-[var(--tartarus-gold)] bg-[var(--tartarus-gold)]/10 text-[var(--tartarus-gold)]"
                                  : "border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] text-[var(--tartarus-ivory-muted)]"
                              )}
                            >
                              {state?.pendingConfirmation
                                ? "Awaiting confirmation..."
                                : state?.isLoading
                                  ? "Running..."
                                  : state?.error
                                    ? "Error"
                                    : state?.completed
                                      ? "Done"
                                      : "Pending"}
                            </Badge>
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>

                          {isExpanded && (
                            <div className="mt-3 space-y-2">
                              <div>
                                <p className="text-muted-foreground mb-1 text-xs">Input:</p>
                                <pre className="bg-background max-h-32 overflow-auto rounded p-2 text-xs">
                                  {JSON.stringify(part.input, null, 2)}
                                </pre>
                              </div>
                              {/* Display images if available */}
                              {state?.images && state.images.length > 0 && (
                                <div>
                                  <p className="text-muted-foreground mb-2 text-xs">
                                    Generated Images:
                                  </p>
                                  <div className="grid grid-cols-1 gap-2">
                                    {state.images.map((imageUrl: string, idx: number) => (
                                      <div
                                        key={idx}
                                        className="group relative overflow-hidden rounded-lg border"
                                      >
                                        <img
                                          src={imageUrl}
                                          alt={`Generated image ${idx + 1}`}
                                          className="h-auto max-h-96 w-full object-contain"
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = "none";
                                          }}
                                        />
                                        <div className="absolute top-2 right-2 flex gap-1">
                                          <a
                                            href={imageUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="rounded bg-black/50 px-2 py-1 text-xs text-white hover:bg-black/70"
                                          >
                                            Open
                                          </a>
                                          <button
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              const filename = `generated-${Date.now()}-${idx + 1}.png`;
                                              try {
                                                const res = await fetch("/api/media", {
                                                  method: "POST",
                                                  headers: { "Content-Type": "application/json" },
                                                  body: JSON.stringify({
                                                    url: imageUrl,
                                                    filename,
                                                    description: state.prompt
                                                      ? `Generated: ${state.prompt}`
                                                      : "AI Generated Image",
                                                    prompt: state.prompt,
                                                    model: state.model,
                                                    destination: "media",
                                                  }),
                                                });
                                                const data = await res.json();
                                                if (res.ok) {
                                                  alert(
                                                    `✅ Saved to media library (ID: ${data.id})`
                                                  );
                                                } else {
                                                  alert(`❌ Failed: ${data.error}`);
                                                }
                                              } catch (err: any) {
                                                alert(`❌ Error: ${err.message}`);
                                              }
                                            }}
                                            className="rounded bg-[var(--tartarus-success)] px-2 py-1 text-xs text-white hover:bg-[var(--tartarus-success)]/80"
                                          >
                                            💾 Save
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  {state.prompt && (
                                    <p className="text-muted-foreground mt-2 text-xs italic">
                                      Prompt: "{state.prompt}"
                                    </p>
                                  )}
                                  {state.model && (
                                    <p className="text-muted-foreground text-xs">
                                      Model: {state.model}
                                    </p>
                                  )}
                                </div>
                              )}
                              {(part.output || state?.result || state?.error) && (
                                <div>
                                  <p className="text-muted-foreground mb-1 text-xs">
                                    {state?.error ? "Error:" : "Result:"}
                                  </p>
                                  <pre
                                    className={cn(
                                      "max-h-48 overflow-auto rounded border p-2 text-xs",
                                      state?.error
                                        ? "border-[var(--tartarus-error)]/50 bg-[var(--tartarus-error-soft)] text-[var(--tartarus-error)]"
                                        : "border-[var(--tartarus-border)] bg-[var(--tartarus-void)] text-[var(--tartarus-ivory-dim)]"
                                    )}
                                  >
                                    {state?.error || part.output || state?.result}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              );
            })}

            {(status === "submitted" || status === "streaming") && (
              <div className="kronus-message p-6">
                <div className="flex flex-col items-center justify-center gap-4">
                  {/* Ouroboros loading animation */}
                  <div className="relative">
                    {/* Outer glow ring */}
                    <div className="absolute inset-[-8px] animate-pulse rounded-full bg-gradient-to-r from-[var(--tartarus-teal)]/20 via-[var(--tartarus-gold)]/10 to-[var(--tartarus-teal)]/20 blur-md" />
                    {/* Rotating ouroboros */}
                    <div className="relative h-16 w-16 animate-[spin_8s_linear_infinite]">
                      <img
                        src="/ouroboros.png"
                        alt="Loading"
                        className="h-full w-full object-contain opacity-80 drop-shadow-[0_0_8px_rgba(111,207,207,0.4)]"
                      />
                    </div>
                  </div>
                  <span className="text-sm tracking-wide text-[var(--tartarus-ivory-muted)] italic">
                    {status === "submitted" ? "Consulting the oracle..." : "Weaving wisdom..."}
                  </span>
                </div>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="kronus-input-area z-10 p-3 md:p-5" onDrop={handleDrop} onDragOver={handleDragOver}>
          <form onSubmit={handleSubmit} className="mx-auto md:max-w-3xl">
            {streamNotice && (
              <div className="mb-3 flex items-start gap-3 rounded-lg border border-[var(--tartarus-gold)]/35 bg-[var(--tartarus-gold)]/10 p-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--tartarus-gold)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--tartarus-ivory)]">Notice</p>
                  <p className="mt-1 text-xs break-words text-[var(--tartarus-ivory-muted)]">
                    {streamNotice}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStreamNotice(null)}
                  className="shrink-0 text-xs text-[var(--tartarus-teal)] hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}
            {/* Error Banner */}
            {error && (
              <div className="mb-3 flex items-start gap-3 rounded-lg border border-[var(--tartarus-error)]/30 bg-[var(--tartarus-error)]/10 p-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--tartarus-error)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--tartarus-error)]">Request Failed</p>
                  <p className="mt-1 text-xs break-words text-[var(--tartarus-ivory-muted)]">
                    {error.message || "An unknown error occurred"}
                  </p>
                  {error.message?.includes("too long") && (
                    <p className="mt-2 text-xs text-[var(--tartarus-gold)]">
                      Tip: Try disabling some Soul Config sections or compress the conversation
                      history.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="shrink-0 text-xs text-[var(--tartarus-teal)] hover:underline"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Image Previews with compression info */}
            {(imagePreviews.length > 0 || isCompressing) && (
              <div className="mb-3">
                {isCompressing && (
                  <div className="mb-2 flex items-center gap-2 text-sm text-[var(--tartarus-ivory-muted)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Optimizing images...</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {imagePreviews.map((preview, index) => {
                    const info = compressionInfo[index];
                    const isPdf = preview.startsWith("pdf:");
                    const pdfName = isPdf ? preview.replace("pdf:", "") : "";
                    const showCompressionBadge = info?.wasCompressed;

                    return (
                      <div key={index} className="group relative">
                        {isPdf ? (
                          /* PDF preview */
                          <div className="flex h-16 items-center gap-2 rounded-lg border-2 border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] px-3">
                            <FileText className="h-5 w-5 text-[var(--tartarus-gold)]" />
                            <span className="max-w-[100px] truncate text-xs text-[var(--tartarus-ivory-muted)]">
                              {pdfName}
                            </span>
                          </div>
                        ) : (
                          /* Image preview */
                          <img
                            src={preview}
                            alt={`Preview ${index + 1}`}
                            className="h-16 w-16 rounded-lg border-2 border-[var(--tartarus-border)] object-cover"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--tartarus-error)] text-white opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        {/* Compression badge (images only) */}
                        {showCompressionBadge && !isPdf && (
                          <div
                            className="absolute right-0 bottom-0 left-0 rounded-b-lg bg-black/70 px-1 py-0.5 text-center text-[9px] text-[var(--tartarus-teal)]"
                            title={`Compressed: ${formatBytes(info.originalSize)} → ${formatBytes(info.compressedSize)} (${info.method})`}
                          >
                            {formatBytes(info.compressedSize)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Daimon polish panel — shown after Cmd+Enter */}
            {daimonPolishResult && (
              <div className="mb-3">
                <DaimonPolishPanel
                  original={daimonPolishResult.original}
                  polished={daimonPolishResult.polished}
                  isClean={daimonPolishResult.original === daimonPolishResult.polished}
                  didTranslate={daimonPolishResult.didTranslate}
                  notes={daimonPolishResult.notes}
                  onSendPolished={() => {
                    doSend(daimonPolishResult.polished);
                  }}
                  onSendOriginal={() => {
                    doSend(daimonPolishResult.original);
                  }}
                  onAcceptInPlace={() => {
                    setDaimonPrevInput(input);
                    setInput(daimonPolishResult.polished);
                    setDaimonPolishResult(null);
                  }}
                  onCancel={() => {
                    if (daimonPrevInput !== null) {
                      setInput(daimonPrevInput);
                    }
                    setDaimonPolishResult(null);
                  }}
                />
              </div>
            )}

            <div className="flex items-end gap-3">
              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*,.pdf,application/pdf"
                multiple
                className="hidden"
              />

              {/* Textarea with attach button inside */}
              <div className="relative flex-1">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    imagePreviews.length > 0
                      ? "Ask about the files..."
                      : "Speak your query to the oracle..."
                  }
                  rows={1}
                  className={`kronus-input w-full max-h-[300px] min-h-[52px] resize-none overflow-y-auto py-3 pl-11 text-base md:text-sm${daimonEnabled ? " daimon-active pr-12" : " pr-4"}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if ((e.metaKey || e.ctrlKey) && daimonEnabled) {
                        // Cmd+Enter → polish with Daimon
                        handleDaimonPolish();
                      } else {
                        // Enter → send immediately
                        handleSubmit(e);
                      }
                    }
                  }}
                  disabled={status === "submitted" || status === "streaming" || isCompressing || daimonLoading}
                />
                {/* Attach button (inside textarea, left side) */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-3 left-2.5 flex h-7 w-7 items-center justify-center rounded-md text-[var(--tartarus-ivory-muted)] transition-colors hover:text-[var(--tartarus-teal)] disabled:opacity-40"
                  disabled={status === "submitted" || status === "streaming"}
                  title="Attach files (images, PDFs)"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                {/* Daimon indicator (inside textarea, right side) */}
                {daimonEnabled && (
                  <button
                    type="button"
                    onClick={() => setDaimonEnabled(false)}
                    className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-[var(--tartarus-gold)] bg-[var(--tartarus-gold)]/10 hover:bg-[var(--tartarus-gold)]/20 transition-colors"
                    title="Daimon active — click to disable"
                  >
                    <Sparkles className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Send / Stop button (aligned to bottom of textarea) */}
              {status === "submitted" || status === "streaming" ? (
                <button
                  type="button"
                  onClick={() => stop()}
                  className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border border-[var(--tartarus-error)]/30 bg-[var(--tartarus-error)]/20 text-[var(--tartarus-error)] shadow-[var(--tartarus-error)]/10 shadow-lg transition-[background-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.95] hover:bg-[var(--tartarus-error)]/30"
                  title="Stop generating"
                >
                  <Square className="h-5 w-5 fill-current" />
                </button>
              ) : daimonLoading ? (
                <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border border-[var(--tartarus-gold)]/30 bg-[var(--tartarus-gold)]/10">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--tartarus-gold)]" />
                </div>
              ) : (
                <button
                  type="submit"
                  className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-[var(--tartarus-teal)] text-[var(--tartarus-deep)] shadow-[var(--tartarus-teal)]/20 shadow-lg transition-[background-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.95] hover:bg-[var(--tartarus-teal)]/90 hover:shadow-[var(--tartarus-teal)]/40 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={(!input.trim() && !selectedFiles) || isCompressing || !!daimonPolishResult}
                  title="Send message"
                >
                  <Send className="h-5 w-5" />
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Tool Confirmation Dialog */}
      <Dialog
        open={pendingToolAction !== null}
        onOpenChange={(open) => {
          if (!open && pendingToolAction) {
            // User closed dialog = rejection
            pendingToolAction.resolve("REJECTED: User cancelled the action");
            setPendingToolAction(null);
            setShowDiffView(false);
          }
        }}
      >
        <DialogContent
          className={cn(
            "border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] transition-[max-width] duration-200",
            showDiffView ? "max-w-4xl" : "max-w-2xl"
          )}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[var(--tartarus-gold)]">
                <AlertCircle className="h-5 w-5" />
                Confirm Action
              </span>
              {/* Diff view toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDiffView(!showDiffView)}
                className={cn(
                  "h-8 gap-2 px-3 text-xs",
                  showDiffView
                    ? "border border-[var(--tartarus-teal)]/30 bg-[var(--tartarus-teal)]/20 text-[var(--tartarus-teal)]"
                    : "text-[var(--tartarus-ivory-muted)] hover:bg-[var(--tartarus-bg)] hover:text-[var(--tartarus-ivory)]"
                )}
              >
                <GitCompare className="h-3.5 w-3.5" />
                {showDiffView ? "Hide Diff" : "Show Diff"}
                {showDiffView ? (
                  <Minimize2 className="h-3 w-3" />
                ) : (
                  <Maximize2 className="h-3 w-3" />
                )}
              </Button>
            </DialogTitle>
          </DialogHeader>

          {pendingToolAction && (
            <div className="space-y-4 py-4">
              {/* Action description */}
              <div className="rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-bg)] p-3">
                <p className="text-sm font-medium text-[var(--tartarus-ivory)]">
                  {pendingToolAction.action.description}
                </p>
                <p className="mt-1 text-xs text-[var(--tartarus-ivory-muted)]">
                  Tool:{" "}
                  <code className="text-[var(--tartarus-teal)]">
                    {pendingToolAction.action.toolName}
                  </code>
                </p>
              </div>

              {/* Rich preview for Linear tools, diff view for others */}
              {isLinearTool(pendingToolAction.action.toolName) ? (
                /* Linear-style rich preview */
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-[var(--tartarus-ivory-muted)] uppercase">
                    <FileText className="h-3 w-3" />
                    Preview
                  </p>
                  <div className="max-h-[450px] overflow-y-auto">
                    {getLinearPreview(
                      pendingToolAction.action.toolName,
                      pendingToolAction.action.args
                    )}
                  </div>
                </div>
              ) : showDiffView ? (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-[var(--tartarus-ivory-muted)] uppercase">
                    <GitCompare className="h-3 w-3" />
                    Changes Preview
                  </p>
                  <div className="max-h-[400px] overflow-y-auto rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-bg)]">
                    <pre className="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-[var(--tartarus-ivory)]">
                      {formatArgsForDiffView(
                        pendingToolAction.action.toolName,
                        pendingToolAction.action.args
                      )}
                    </pre>
                  </div>
                </div>
              ) : (
                /* Compact parameters view */
                <div className="space-y-2">
                  <p className="text-xs font-medium tracking-wide text-[var(--tartarus-ivory-muted)] uppercase">
                    Parameters
                  </p>
                  <div className="max-h-[200px] overflow-y-auto rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-bg)] p-3">
                    <dl className="space-y-2 text-sm">
                      {Object.entries(pendingToolAction.action.formattedArgs).map(
                        ([key, value]) => (
                          <div key={key} className="grid grid-cols-[120px_1fr] gap-2">
                            <dt className="font-mono text-xs text-[var(--tartarus-ivory-muted)]">
                              {key}:
                            </dt>
                            <dd className="font-mono text-xs break-words whitespace-pre-wrap text-[var(--tartarus-ivory)]">
                              {value}
                            </dd>
                          </div>
                        )
                      )}
                    </dl>
                  </div>
                </div>
              )}

              {/* Warning */}
              <p className="flex items-center gap-1 text-xs text-[var(--tartarus-gold)]">
                <AlertCircle className="h-3 w-3" />
                This action will modify your data. Please review before confirming.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (pendingToolAction) {
                  pendingToolAction.resolve("REJECTED: User rejected the action");
                  setPendingToolAction(null);
                  setShowDiffView(false);
                }
              }}
              className="border-[var(--tartarus-error)] text-[var(--tartarus-error)] hover:bg-[var(--tartarus-error)]/10"
            >
              <X className="mr-2 h-4 w-4" />
              Reject
            </Button>
            <Button
              onClick={() => {
                if (pendingToolAction) {
                  pendingToolAction.resolve("CONFIRMED");
                  setPendingToolAction(null);
                  setShowDiffView(false);
                }
              }}
              className="bg-[var(--tartarus-teal)] text-white hover:bg-[var(--tartarus-teal)]/90"
            >
              <Check className="mr-2 h-4 w-4" />
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Conversation</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              placeholder="Enter a title for this conversation"
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveConversation} disabled={saving || !saveTitle.trim()}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
