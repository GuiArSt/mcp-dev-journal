"use client";

import { useRef, useEffect, useState, useCallback, memo, useMemo } from "react";
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
  Brain,
} from "lucide-react";
import { cn, formatDateShort } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { SoulConfig, SoulConfigState, DEFAULT_CONFIG } from "./SoulConfig";
import { FormatConfig, FormatConfigState, DEFAULT_FORMAT_CONFIG, KRONUS_FONTS, KRONUS_FONT_SIZES } from "./FormatConfig";
import { ToolsConfig, ToolsConfigState, DEFAULT_CONFIG as DEFAULT_TOOLS_CONFIG } from "./ToolsConfig";
import { ModelConfig, ModelConfigState, DEFAULT_CONFIG as DEFAULT_MODEL_CONFIG } from "./ModelConfig";
import { isLinearTool, getLinearPreview } from "./LinearPreview";
import { compressImage, formatBytes, CompressionResult } from "@/lib/image-compression";
import {
  requiresConfirmation,
  getToolActionDescription,
  formatToolArgsForDisplay,
  formatArgsForDiffView,
  type PendingToolAction,
} from "@/lib/ai/write-tools";
import { computeSmartDiff, type DiffResult } from "@/lib/diff";

// Memoized markdown components - inherit font size from container
// Clear hierarchy: H1 > H2 > H3 with distinct visual treatment
const markdownComponents = {
  // H1: Primary header - large, bold, gold accent, clear visual break
  h1: ({ children }: any) => (
    <h1 className="text-[1.4em] font-bold mt-5 mb-2 text-[var(--kronus-ivory)] border-b border-[var(--kronus-gold)]/30 pb-1">
      {children}
    </h1>
  ),
  // H2: Section header - medium size, teal accent with subtle underline
  h2: ({ children }: any) => (
    <h2 className="text-[1.25em] font-semibold mt-5 mb-2 text-[var(--kronus-teal)] border-b border-[var(--kronus-teal)]/20 pb-1">
      {children}
    </h2>
  ),
  // H3: Subsection - smaller, muted teal, no underline
  h3: ({ children }: any) => (
    <h3 className="text-[1.1em] font-medium mt-4 mb-1.5 text-[var(--kronus-teal-dim)]">
      {children}
    </h3>
  ),
  // H4-H6: Minor headers
  h4: ({ children }: any) => (
    <h4 className="font-semibold mt-2 mb-0.5 text-[var(--kronus-ivory)]">{children}</h4>
  ),
  h5: ({ children }: any) => (
    <h5 className="font-medium mt-2 mb-0.5 text-[var(--kronus-ivory-dim)]">{children}</h5>
  ),
  h6: ({ children }: any) => (
    <h6 className="font-medium mt-2 mb-0.5 text-[var(--kronus-ivory-muted)] text-[0.9em]">{children}</h6>
  ),
  p: ({ children }: any) => (
    <p className="mb-3 leading-relaxed text-[var(--kronus-ivory-dim)]">{children}</p>
  ),
  ul: ({ children }: any) => (
    <ul className="list-disc list-outside mb-3 mt-2 space-y-1.5 ml-6 text-[var(--kronus-ivory-dim)]">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="list-decimal list-outside mb-3 mt-2 space-y-2 ml-6 text-[var(--kronus-ivory-dim)]">{children}</ol>
  ),
  li: ({ children }: any) => (
    <li className="leading-relaxed marker:text-[var(--kronus-teal)] pl-1.5">{children}</li>
  ),
  pre: ({ children }: any) => (
    <pre className="bg-[var(--kronus-deep)] border border-[var(--kronus-border)] p-4 rounded-lg my-3 overflow-x-auto">
      {children}
    </pre>
  ),
  code: ({ children, className }: any) => {
    const isInline = !className;
    return isInline ? (
      <code className="bg-[var(--kronus-deep)] px-1.5 py-0.5 rounded text-[0.85em] font-mono text-[var(--kronus-teal)]">
        {children}
      </code>
    ) : (
      <code className={cn("block text-[0.9em] font-mono text-[var(--kronus-teal)] leading-relaxed whitespace-pre-wrap", className)}>
        {children}
      </code>
    );
  },
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-3 border-[var(--kronus-teal)]/60 pl-6 pr-4 ml-2 my-5 py-3 text-[var(--kronus-ivory-muted)] italic bg-[var(--kronus-teal-soft)] rounded-r-md [&>p]:mb-0 [&>p]:py-1">
      {children}
    </blockquote>
  ),
  // HR: Kronus uses --- heavily - breathing room between sections
  hr: () => <div className="my-4" />,
  strong: ({ children }: any) => (
    <strong className="font-semibold text-[var(--kronus-ivory)]">{children}</strong>
  ),
  // em: Inline italic, NOT block - for emphasis within text
  em: ({ children }: any) => (
    <em className="italic text-[var(--kronus-ivory-muted)]">{children}</em>
  ),
  a: ({ children, href }: any) => (
    <a href={href} className="text-[var(--kronus-teal)] underline underline-offset-2 hover:text-[var(--kronus-gold)]" target="_blank" rel="noopener noreferrer">{children}</a>
  ),
  table: ({ children }: any) => (
    <table className="w-full my-2 border-collapse">{children}</table>
  ),
  th: ({ children }: any) => (
    <th className="border border-[var(--kronus-border)] bg-[var(--kronus-deep)] px-2 py-1.5 text-left text-[var(--kronus-ivory)] font-semibold">{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="border border-[var(--kronus-border)] px-2 py-1.5 text-[var(--kronus-ivory-dim)]">{children}</td>
  ),
  // Images - render inline images from media assets
  img: ({ src, alt }: any) => (
    <span className="block my-3">
      <img
        src={src}
        alt={alt || "Image"}
        className="max-w-full h-auto rounded-lg border border-[var(--kronus-border)] shadow-lg"
        style={{ maxHeight: "400px", objectFit: "contain" }}
        loading="lazy"
      />
      {alt && <span className="block text-xs text-[var(--kronus-ivory-muted)] mt-1 italic">{alt}</span>}
    </span>
  ),
};

// Detect any XML-like tags that Kronus might use for persona/creative formatting
// Matches patterns like <Tag Name>content</Tag Name>, <TAG: SUBTITLE>content</TAG: SUBTITLE>, etc.
// Allows letters, numbers, spaces, colons, underscores, hyphens in tag names
const XML_TAG_REGEX = /<([A-Z][A-Za-z0-9 _:\-]*?)>([\s\S]*?)<\/\1>/g;

// Color palette for dynamically detected tags - cycles through these
const TAG_COLORS = [
  { color: "var(--kronus-gold)", bg: "rgba(212, 175, 55, 0.1)" },
  { color: "var(--kronus-teal)", bg: "rgba(0, 128, 128, 0.1)" },
  { color: "var(--kronus-ivory-muted)", bg: "rgba(30, 30, 35, 0.5)" },
  { color: "#a78bfa", bg: "rgba(167, 139, 250, 0.1)" }, // Purple
  { color: "#f472b6", bg: "rgba(244, 114, 182, 0.1)" }, // Pink
];

// Get consistent color for a tag name (same tag always gets same color)
function getTagColor(tagName: string): { color: string; bg: string } {
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) {
    hash = ((hash << 5) - hash) + tagName.charCodeAt(i);
    hash = hash & hash;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

// Transform any XML-like persona tags into styled blocks
function processKronusTags(text: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let keyIndex = 0;
  let match;

  // Reset regex lastIndex
  XML_TAG_REGEX.lastIndex = 0;

  while ((match = XML_TAG_REGEX.exec(text)) !== null) {
    const [fullMatch, tagName, content] = match;
    const { color, bg } = getTagColor(tagName);

    // Add text before this tag
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index);
      if (beforeText.trim()) {
        elements.push(
          <ReactMarkdown key={`md-${keyIndex++}`} remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]} rehypePlugins={[rehypeKatex]} components={markdownComponents}>
            {beforeText}
          </ReactMarkdown>
        );
      }
    }

    // Add the styled tag block
    elements.push(
      <div
        key={`tag-${keyIndex++}`}
        className="my-4 p-4 rounded-lg border-l-4"
        style={{ borderColor: color, backgroundColor: bg }}
      >
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color }}>
          <span className="opacity-70">✦</span>
          <span>{tagName}</span>
        </div>
        <div className="text-[var(--kronus-ivory-dim)] italic">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]} rehypePlugins={[rehypeKatex]} components={markdownComponents}>
            {content.trim()}
          </ReactMarkdown>
        </div>
      </div>
    );

    lastIndex = match.index + fullMatch.length;
  }

  // Add remaining text after last tag
  if (lastIndex < text.length) {
    const afterText = text.slice(lastIndex);
    if (afterText.trim()) {
      elements.push(
        <ReactMarkdown key={`md-${keyIndex++}`} remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]} rehypePlugins={[rehypeKatex]} components={markdownComponents}>
          {afterText}
        </ReactMarkdown>
      );
    }
  }

  return elements.length > 0 ? elements : [
    <ReactMarkdown key="fallback" remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]} rehypePlugins={[rehypeKatex]} components={markdownComponents}>
      {text}
    </ReactMarkdown>
  ];
}

// Memoized markdown renderer for completed messages
// remarkBreaks converts single line breaks to <br> for better list handling
// Also processes Kronus persona tags like <Creative Discord>, <THE GLITCH>, etc.
const MemoizedMarkdown = memo(function MemoizedMarkdown({ text }: { text: string }) {
  // Check if text contains any XML-like tags (capitalized tag names)
  const hasXmlTags = XML_TAG_REGEX.test(text);
  XML_TAG_REGEX.lastIndex = 0; // Reset after test

  if (hasXmlTags) {
    return <div className="kronus-content">{processKronusTags(text)}</div>;
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]} rehypePlugins={[rehypeKatex]} components={markdownComponents}>
      {text}
    </ReactMarkdown>
  );
});

// Simple streaming text renderer (no markdown parsing during streaming)
const StreamingText = memo(function StreamingText({ text }: { text: string }) {
  return <div className="whitespace-pre-wrap text-[var(--kronus-ivory-dim)]">{text}</div>;
});

// Detect if text contains a confirmation request pattern
function detectConfirmationRequest(text: string): { isConfirmation: boolean; proposedChanges?: string } {
  // Look for patterns like "Accept these changes?", "Confirm?", "Should I..."
  const confirmPatterns = [
    /\*\*Accept (?:these changes|this change)\?\*\*/i,
    /\*\*(?:Ready to |Should I )(?:create|update|save|edit|modify)\??\*\*/i,
    /(?:confirm|approve|proceed)\?\s*$/i,
    /\[Yes\/No\]/i,
  ];

  const isConfirmation = confirmPatterns.some(pattern => pattern.test(text));

  // Extract the proposed changes section if present
  let proposedChanges: string | undefined;
  const changesMatch = text.match(/📝\s*\*\*Proposed Changes[^*]*\*\*[:\s]*([\s\S]*?)(?:\*\*Accept|$)/i);
  if (changesMatch) {
    proposedChanges = changesMatch[1].trim();
  }

  return { isConfirmation, proposedChanges };
}

// Confirmation buttons component
const ConfirmationButtons = memo(function ConfirmationButtons({
  onConfirm,
  onReject,
  onReview,
  proposedChanges,
  disabled,
}: {
  onConfirm: () => void;
  onReject: () => void;
  onReview?: () => void;
  proposedChanges?: string;
  disabled?: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="mt-4 p-3 rounded-lg bg-[var(--kronus-surface)] border border-[var(--kronus-border)]">
      <div className="flex items-center gap-3">
        <button
          onClick={onConfirm}
          disabled={disabled}
          className="px-4 py-2 rounded-lg bg-[var(--kronus-teal)] text-white font-medium hover:bg-[var(--kronus-teal)]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          <Check className="h-4 w-4" />
          Yes, proceed
        </button>
        <button
          onClick={onReject}
          disabled={disabled}
          className="px-4 py-2 rounded-lg bg-[var(--kronus-error)]/20 text-[var(--kronus-error)] font-medium hover:bg-[var(--kronus-error)]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          <X className="h-4 w-4" />
          No, cancel
        </button>
        {proposedChanges && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="px-4 py-2 rounded-lg bg-[var(--kronus-gold)]/20 text-[var(--kronus-gold)] font-medium hover:bg-[var(--kronus-gold)]/30 transition-colors flex items-center gap-2"
          >
            {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showDetails ? "Hide details" : "Review changes"}
          </button>
        )}
      </div>
      {showDetails && proposedChanges && (
        <div className="mt-3 p-3 rounded bg-[var(--kronus-deep)] border border-[var(--kronus-border)] text-sm">
          <pre className="whitespace-pre-wrap text-[var(--kronus-ivory-dim)] font-mono">{proposedChanges}</pre>
        </div>
      )}
    </div>
  );
});

// Thinking/Reasoning display component - shows model's thinking process
const ThinkingDisplay = memo(function ThinkingDisplay({
  reasoning,
  isStreaming,
}: {
  reasoning: string;
  isStreaming: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(true); // Auto-expand while streaming

  // Auto-collapse when streaming ends
  useEffect(() => {
    if (!isStreaming && reasoning) {
      // Keep expanded briefly after streaming ends, then collapse
      const timer = setTimeout(() => setIsExpanded(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, reasoning]);

  if (!reasoning) return null;

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all",
          isStreaming
            ? "bg-[var(--kronus-purple)]/20 text-[var(--kronus-purple)] animate-pulse"
            : "bg-[var(--kronus-surface)] text-[var(--kronus-ivory-muted)] hover:bg-[var(--kronus-surface)]/80"
        )}
      >
        <Brain className="h-4 w-4" />
        <span>{isStreaming ? "Thinking..." : "View thinking"}</span>
        {isExpanded ? (
          <ChevronUp className="h-3 w-3 ml-1" />
        ) : (
          <ChevronDown className="h-3 w-3 ml-1" />
        )}
      </button>
      {isExpanded && (
        <div
          className={cn(
            "mt-2 p-3 rounded-lg border text-sm font-mono whitespace-pre-wrap overflow-x-auto max-h-[300px] overflow-y-auto",
            isStreaming
              ? "bg-[var(--kronus-purple)]/5 border-[var(--kronus-purple)]/30 text-[var(--kronus-ivory-dim)]"
              : "bg-[var(--kronus-deep)] border-[var(--kronus-border)] text-[var(--kronus-ivory-muted)]"
          )}
        >
          {reasoning}
          {isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-[var(--kronus-purple)] animate-pulse" />}
        </div>
      )}
    </div>
  );
});

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
  created_at: string;
  updated_at: string;
}

export function ChatInterface() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toolStates, setToolStates] = useState<Record<string, ToolState>>({});
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  // Conversation management
  const [showHistory, setShowHistory] = useState(false);
  const [savedConversations, setSavedConversations] = useState<SavedConversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [input, setInput] = useState("");

  // Image upload state
  const [selectedFiles, setSelectedFiles] = useState<FileList | undefined>(undefined);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [compressionInfo, setCompressionInfo] = useState<CompressionResult[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);

  // Chat search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<number[]>([]); // indices of matching messages
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Soul config - controls which repository sections Kronus knows about
  const [soulConfig, setSoulConfig] = useState<SoulConfigState>(DEFAULT_CONFIG);
  // Store the config that was used when the conversation started (locked after first message)
  const [lockedSoulConfig, setLockedSoulConfig] = useState<SoulConfigState | null>(null);

  // Tools config - controls which tool categories are enabled
  // NOT locked - can be changed mid-chat to dynamically enable/disable tools
  const [toolsConfig, setToolsConfig] = useState<ToolsConfigState>(DEFAULT_TOOLS_CONFIG);

  // Model config - controls which AI provider is used (google, anthropic, openai)
  // Can be changed mid-chat - applies to next message
  const [modelConfig, setModelConfig] = useState<ModelConfigState>(DEFAULT_MODEL_CONFIG);

  // Format config - controls chat font and size (applies immediately)
  const [formatConfig, setFormatConfig] = useState<FormatConfigState>(DEFAULT_FORMAT_CONFIG);

  // Context compression state
  const [isCompressingContext, setIsCompressingContext] = useState(false);

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

  // Theme state - synced with Sidebar's localStorage
  const [kronusTheme, setKronusTheme] = useState<"dark" | "light">("dark");

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
    sendAutomaticallyWhen: autoRespondAfterTools ? lastAssistantMessageIsCompleteWithToolCalls : undefined,

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
        switch (toolName) {
          // ===== Journal Tools =====
          case "journal_create_entry": {
            const res = await fetch("/api/kronus/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(typedArgs),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            output = `Created journal entry for ${typedArgs.repository}/${typedArgs.branch} (${String(typedArgs.commit_hash).substring(0, 7)})`;
            break;
          }

          case "journal_get_entry": {
            const res = await fetch(`/api/entries/${typedArgs.commit_hash}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Entry not found");
            output = JSON.stringify(data, null, 2);
            break;
          }

          case "journal_list_by_repository": {
            const params = new URLSearchParams({
              repository: String(typedArgs.repository),
              limit: String(typedArgs.limit || 20),
              offset: String(typedArgs.offset || 0),
            });
            const res = await fetch(`/api/entries?${params}`);
            const data = await res.json();
            output = `Found ${data.total} entries for ${typedArgs.repository}:\n${JSON.stringify(data.entries, null, 2)}`;
            break;
          }

          case "journal_list_by_branch": {
            const params = new URLSearchParams({
              repository: String(typedArgs.repository),
              branch: String(typedArgs.branch),
              limit: String(typedArgs.limit || 20),
              offset: String(typedArgs.offset || 0),
            });
            const res = await fetch(`/api/entries?${params}`);
            const data = await res.json();
            output = `Found ${data.total} entries for ${typedArgs.repository}/${typedArgs.branch}:\n${JSON.stringify(data.entries, null, 2)}`;
            break;
          }

          case "journal_list_repositories": {
            const res = await fetch("/api/repositories");
            const data = await res.json();
            output = `Repositories: ${JSON.stringify(data)}`;
            break;
          }

          case "journal_list_branches": {
            const res = await fetch(`/api/repositories?repo=${typedArgs.repository}`);
            const data = await res.json();
            output = `Branches in ${typedArgs.repository}: ${JSON.stringify(data)}`;
            break;
          }

          case "journal_edit_entry": {
            const { commit_hash, ...updates } = typedArgs;
            const res = await fetch(`/api/entries/${commit_hash}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updates),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Update failed");
            output = `Updated entry ${String(commit_hash).substring(0, 7)}`;
            break;
          }

          case "journal_regenerate_entry": {
            const res = await fetch("/api/kronus/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                commit_hash: typedArgs.commit_hash,
                new_context: typedArgs.new_context,
                edit_mode: true,
              }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            output = `Regenerated entry ${String(typedArgs.commit_hash).substring(0, 7)}`;
            break;
          }

          case "journal_get_project_summary": {
            const res = await fetch(`/api/entries?repository=${typedArgs.repository}&summary=true`);
            const data = await res.json();
            output = JSON.stringify(data, null, 2);
            break;
          }

          case "journal_list_project_summaries": {
            const res = await fetch(`/api/repositories?summaries=true`);
            const data = await res.json();
            output = JSON.stringify(data, null, 2);
            break;
          }

          case "journal_upsert_project_summary": {
            const res = await fetch(`/api/repositories/${encodeURIComponent(String(typedArgs.repository))}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                git_url: typedArgs.git_url,
                summary: typedArgs.summary,
                purpose: typedArgs.purpose,
                architecture: typedArgs.architecture,
                key_decisions: typedArgs.key_decisions,
                technologies: typedArgs.technologies,
                status: typedArgs.status,
              }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to upsert project summary");

            output = `✅ Project summary for **${typedArgs.repository}** has been ${data.created ? "created" : "updated"}`;
            break;
          }

          case "journal_list_attachments": {
            const res = await fetch(`/api/entries/${typedArgs.commit_hash}`);
            const data = await res.json();
            output = `Attachments: ${JSON.stringify(data.attachments || [], null, 2)}`;
            break;
          }

          case "journal_backup": {
            const res = await fetch("/api/db/backup", { method: "POST" });
            const data = await res.json();
            output = data.message || "Backup completed";
            break;
          }

          // ===== Linear Tools (all execute directly now - Kronus asks permission first) =====
          case "linear_get_viewer": {
            const res = await fetch("/api/integrations/linear/viewer");
            const data = await res.json();
            output = JSON.stringify(data, null, 2);
            break;
          }

          case "linear_list_issues": {
            const params = new URLSearchParams();
            if (typedArgs.assigneeId) params.set("assigneeId", String(typedArgs.assigneeId));
            if (typedArgs.teamId) params.set("teamId", String(typedArgs.teamId));
            if (typedArgs.projectId) params.set("projectId", String(typedArgs.projectId));
            if (typedArgs.query) params.set("query", String(typedArgs.query));
            if (typedArgs.limit) params.set("limit", String(typedArgs.limit));
            if (typedArgs.showAll) params.set("showAll", "true");

            const res = await fetch(`/api/integrations/linear/issues?${params}`);
            const data = await res.json();
            output = `Found ${data.issues?.length || 0} issues:\n${JSON.stringify(data.issues, null, 2)}`;
            break;
          }

          case "linear_list_projects": {
            const params = typedArgs.teamId ? `?teamId=${typedArgs.teamId}` : "";
            const res = await fetch(`/api/integrations/linear/projects${params}`);
            const data = await res.json();
            output = `Found ${data.projects?.length || 0} projects:\n${JSON.stringify(data.projects, null, 2)}`;
            break;
          }

          case "linear_create_project": {
            const res = await fetch("/api/integrations/linear/projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(typedArgs),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Failed to create project");
            output = `✅ Created project: ${result.name}\nID: ${result.id}`;
            break;
          }

          case "linear_create_issue": {
            const res = await fetch("/api/integrations/linear/issues", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(typedArgs),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Failed to create issue");
            output = `✅ Created issue: ${result.identifier} - ${result.title}\nURL: ${result.url}`;
            break;
          }

          case "linear_update_issue": {
            const { issueId, ...updates } = typedArgs;
            const res = await fetch(`/api/integrations/linear/issues/${issueId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updates),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Failed to update issue");
            output = `✅ Updated issue: ${result.identifier}`;
            break;
          }

          case "linear_update_project": {
            const { projectId, ...updates } = typedArgs;
            const res = await fetch(`/api/integrations/linear/projects/${projectId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updates),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Failed to update project");
            output = `✅ Updated project: ${result.name}`;
            break;
          }

          // NOTE: Old document_*, skill_*, experience_*, education_* tools removed
          // All repository operations now use repository_* prefix handlers below

          case "replicate_generate_image": {
            const res = await fetch("/api/replicate/generate-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: typedArgs.prompt,
                model: typedArgs.model || "black-forest-labs/flux-2-pro",
                width: typedArgs.width || 1024,
                height: typedArgs.height || 1024,
                num_outputs: typedArgs.num_outputs || 1,
                guidance_scale: typedArgs.guidance_scale,
                num_inference_steps: typedArgs.num_inference_steps,
              }),
            });
            
            const data = await res.json();
            if (!res.ok) {
              const errorMsg = data.error || "Failed to generate image";
              const details = data.details ? `
Details: ${data.details}` : "";
              throw new Error(`${errorMsg}${details}`);
            }
            
            if (!data.images || data.images.length === 0) {
              throw new Error("No images were generated. Please try again with a different prompt.");
            }
            
            // Auto-save each generated image to Media Library
            const savedAssets: Array<{id: number, filename: string, url: string}> = [];
            for (let i = 0; i < data.images.length; i++) {
              const imageUrl = data.images[i];
              const timestamp = Date.now();
              const filename = `generated-${timestamp}-${i + 1}.png`;
              
              try {
                const saveRes = await fetch("/api/media", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    url: imageUrl,
                    filename,
                    description: `AI-generated image`,
                    prompt: String(typedArgs.prompt),
                    model: data.model,
                    tags: ["ai-generated"],
                  }),
                });
                
                if (saveRes.ok) {
                  const saveData = await saveRes.json();
                  savedAssets.push({ id: saveData.id, filename: saveData.filename, url: imageUrl });
                }
              } catch (saveErr) {
                console.error("Failed to auto-save image:", saveErr);
              }
            }
            
            // Store image URLs and saved IDs in tool state for display
            setToolStates((prev) => ({
              ...prev,
              [toolCallId]: {
                ...prev[toolCallId],
                images: data.images,
                model: data.model,
                prompt: data.prompt,
              },
            }));
            
            // Format output with saved asset info
            if (savedAssets.length > 0) {
              const assetList = savedAssets.map((a) => `• ID ${a.id}: ${a.filename}`).join("\n");
              output = `✅ Generated ${data.images.length} image(s) using ${data.model}\n\n📁 Saved to Media Library:\n${assetList}\n\nYou can edit metadata (description, tags, links) using the update_media tool with the asset ID.`;
            } else {
              const imageList = data.images.map((url: string, idx: number) => `${idx + 1}. ${url}`).join("\n");
              output = `✅ Generated ${data.images.length} image(s) using ${data.model}:\n${imageList}`;
            }
            break;
          }

          // ===== Media Storage Tools =====
          case "save_image": {
            const res = await fetch("/api/media", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url: typedArgs.url,
                filename: typedArgs.filename,
                description: typedArgs.description,
                prompt: typedArgs.prompt,
                model: typedArgs.model,
                tags: typedArgs.tags || [],
                commit_hash: typedArgs.commit_hash,
                document_id: typedArgs.document_id,
              }),
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save image");
            
            let links = [];
            if (data.commit_hash) links.push(`Journal: ${data.commit_hash.substring(0, 7)}`);
            if (data.document_id) links.push(`Document: #${data.document_id}`);
            const linkInfo = links.length > 0 ? `\n• Linked to: ${links.join(", ")}` : "";
            
            output = `✅ Image saved to Media Library\n• ID: ${data.id}\n• Filename: ${data.filename}\n• Size: ${Math.round(data.file_size / 1024)} KB${linkInfo}`;
            break;
          }

          case "list_media": {
            const params = new URLSearchParams();
            if (typedArgs.commit_hash) params.set("commit_hash", String(typedArgs.commit_hash));
            if (typedArgs.document_id) params.set("document_id", String(typedArgs.document_id));
            if (typedArgs.limit) params.set("limit", String(typedArgs.limit));

            const res = await fetch(`/api/media?${params.toString()}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to list media");

            if (data.assets.length === 0) {
              output = "No media assets found.";
            } else {
              // Build output with inline images for each asset
              let mediaOutput = `**Media Assets** (${data.total} found)\n\n`;

              for (const a of data.assets) {
                const links = [];
                if (a.commit_hash) links.push(`Journal: ${a.commit_hash.substring(0, 7)}`);
                if (a.document_id) links.push(`Document: #${a.document_id}`);
                const linkStr = links.length > 0 ? ` | ${links.join(", ")}` : "";

                const alt = a.alt || a.description || a.filename;
                const imageUrl = `/api/media/${a.id}/raw`;

                mediaOutput += `---\n`;
                mediaOutput += `**${a.filename}** (ID: ${a.id})${linkStr}\n`;
                if (a.description) mediaOutput += `${a.description}\n`;
                mediaOutput += `\n![${alt}](${imageUrl})\n\n`;
              }

              output = mediaOutput;
            }
            break;
          }

          case "update_media": {
            const res = await fetch(`/api/media/${typedArgs.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                filename: typedArgs.filename,
                description: typedArgs.description,
                tags: typedArgs.tags,
                commit_hash: typedArgs.commit_hash,
                document_id: typedArgs.document_id,
              }),
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update media");
            
            let updates = [];
            if (typedArgs.description) updates.push("description");
            if (typedArgs.tags) updates.push("tags");
            if (typedArgs.commit_hash) updates.push("journal link");
            if (typedArgs.document_id) updates.push("document link");
            if (typedArgs.filename) updates.push("filename");
            
            output = `✅ Updated media asset #${typedArgs.id}\nModified: ${updates.join(", ") || "no changes"}`;
            break;
          }

          case "get_media": {
            const res = await fetch(`/api/media/${typedArgs.id}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Media not found");

            const media = data;
            const alt = media.alt || media.description || media.filename;
            const imageUrl = `/api/media/${media.id}/raw`;

            // Build output with metadata and inline image
            let mediaOutput = `**${media.filename}** (ID: ${media.id})\n`;
            if (media.description) mediaOutput += `Description: ${media.description}\n`;
            if (media.prompt) mediaOutput += `Prompt: ${media.prompt}\n`;
            if (media.model) mediaOutput += `Model: ${media.model}\n`;
            if (media.tags && media.tags.length > 0) {
              const tags = typeof media.tags === "string" ? JSON.parse(media.tags) : media.tags;
              if (tags.length > 0) mediaOutput += `Tags: ${tags.join(", ")}\n`;
            }
            mediaOutput += `\n![${alt}](${imageUrl})`;

            output = mediaOutput;
            break;
          }

          // ===== Repository Tools =====
          case "repository_search_documents": {
            const params = new URLSearchParams();
            if (typedArgs.type) params.set("type", String(typedArgs.type));
            if (typedArgs.search) params.set("search", String(typedArgs.search));
            if (typedArgs.limit) params.set("limit", String(typedArgs.limit));
            if (typedArgs.offset) params.set("offset", String(typedArgs.offset));
            
            const res = await fetch(`/api/documents?${params.toString()}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to search documents");
            
            if (!data.documents || data.documents.length === 0) {
              output = "No documents found.";
            } else {
              const docList = data.documents.map((d: any) => {
                const tags = d.metadata?.tags?.join(", ") || "";
                return `• [${d.id}] ${d.title} (${d.type})${tags ? ` [${tags}]` : ""}`;
              }).join("\n");
              const paginationInfo = data.has_more 
                ? `\n\nShowing ${data.documents.length} of ${data.total} documents. Use offset=${data.offset + data.documents.length} to see more.`
                : `\n\nFound ${data.total} total document(s).`;
              output = `Found ${data.documents.length} document(s):\n${docList}${paginationInfo}`;
            }
            break;
          }

          case "repository_get_document": {
            let url = "/api/documents";
            if (typedArgs.id) url += `/${typedArgs.id}`;  // Now supports ID lookup
            else if (typedArgs.slug) url += `/${encodeURIComponent(String(typedArgs.slug))}`;
            else throw new Error("Either id or slug is required");

            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Document not found");

            const doc = data.document || data;

            // Build output with document content
            let docOutput = `**${doc.title}** (ID: ${doc.id})\nType: ${doc.type}\nSlug: ${doc.slug}\n\n${doc.content}`;

            // Include media attachments if any
            if (doc.media_count > 0 && doc.media_assets) {
              docOutput += `\n\n---\n**Attached Media (${doc.media_count}):**\n`;
              for (const media of doc.media_assets) {
                const alt = media.alt || media.description || media.filename;
                docOutput += `\n- **${media.filename}** (ID: ${media.id})\n`;
                if (media.description) docOutput += `  Description: ${media.description}\n`;
                docOutput += `  ![${alt}](${media.url})\n`;
              }
            }

            output = docOutput;
            break;
          }

          case "repository_create_document": {
            const slug = String(typedArgs.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
            const metadata = {
              ...(typedArgs.metadata || {}),
              tags: typedArgs.tags || [],
            };
            
            const res = await fetch("/api/documents", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: typedArgs.title,
                slug,
                type: typedArgs.type || "writing",
                content: typedArgs.content,
                metadata,
              }),
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create document");
            
            output = `✅ Created document: "${typedArgs.title}"\nID: ${data.id}\nSlug: ${slug}`;
            break;
          }

          case "repository_update_document": {
            // First fetch the existing document to merge metadata properly
            const getRes = await fetch(`/api/documents/${typedArgs.id}`);
            if (!getRes.ok) {
              const errData = await getRes.json();
              throw new Error(errData.error || "Document not found");
            }
            const existingDoc = await getRes.json();
            const existingMeta = existingDoc.metadata || {};

            const updateData: any = {};
            if (typedArgs.title) updateData.title = typedArgs.title;
            if (typedArgs.content) updateData.content = typedArgs.content;

            // Merge metadata: preserve existing, override with new values
            if (typedArgs.tags || typedArgs.metadata) {
              updateData.metadata = {
                ...existingMeta,                    // Keep existing metadata (type, year, language, etc.)
                ...(typedArgs.metadata || {}),      // Override with any new metadata fields
                tags: typedArgs.tags ?? existingMeta.tags,  // Use new tags if provided, else keep existing
              };
            }

            const res = await fetch(`/api/documents/${typedArgs.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updateData),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update document");

            output = `✅ Updated document #${typedArgs.id}: "${existingDoc.title}"`;
            break;
          }

          case "repository_list_skills": {
            const res = await fetch("/api/cv");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to list skills");
            
            let skills = data.skills || [];
            if (typedArgs.category) {
              skills = skills.filter((s: any) => s.category === typedArgs.category);
            }
            
            if (skills.length === 0) {
              output = "No skills found.";
            } else {
              const skillList = skills.map((s: any) => 
                `• ${s.name} [${s.category}] - ${s.magnitude}/5 - ${s.description || "No description"}`
              ).join("\n");
              output = `Found ${skills.length} skill(s):\n${skillList}`;
            }
            break;
          }

          case "repository_update_skill": {
            const res = await fetch(`/api/cv/skills/${typedArgs.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: typedArgs.name,
                category: typedArgs.category,
                magnitude: typedArgs.magnitude,
                description: typedArgs.description,
                tags: typedArgs.tags,
              }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update skill");

            output = `✅ Updated skill: ${typedArgs.id}`;
            break;
          }

          case "repository_create_skill": {
            const res = await fetch("/api/cv/skills", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: typedArgs.id,
                name: typedArgs.name,
                category: typedArgs.category,
                magnitude: typedArgs.magnitude,
                description: typedArgs.description,
                icon: typedArgs.icon,
                color: typedArgs.color,
                url: typedArgs.url,
                tags: typedArgs.tags || [],
                firstUsed: typedArgs.firstUsed,
                lastUsed: typedArgs.lastUsed,
              }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create skill");

            output = `✅ Created new skill: ${typedArgs.name} (${typedArgs.category}) - ${typedArgs.magnitude}/5`;
            break;
          }

          case "repository_list_experience": {
            const res = await fetch("/api/cv");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to list experience");

            const exp = data.experience || [];
            if (exp.length === 0) {
              output = "No work experience found.";
            } else {
              const expList = exp.map((e: any) =>
                `• ${e.title} at ${e.company} (${e.dateStart} - ${e.dateEnd || "Present"})\n  ${e.tagline || ""}`
              ).join("\n");
              output = `Found ${exp.length} experience(s):\n${expList}`;
            }
            break;
          }

          case "repository_create_experience": {
            const res = await fetch("/api/cv/experience", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: typedArgs.id,
                title: typedArgs.title,
                company: typedArgs.company,
                department: typedArgs.department,
                location: typedArgs.location,
                dateStart: typedArgs.dateStart,
                dateEnd: typedArgs.dateEnd,
                tagline: typedArgs.tagline,
                note: typedArgs.note,
                achievements: typedArgs.achievements || [],
              }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create experience");

            output = `✅ Created new work experience: ${typedArgs.title} at ${typedArgs.company}`;
            break;
          }

          case "repository_list_education": {
            const res = await fetch("/api/cv");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to list education");

            const edu = data.education || [];
            if (edu.length === 0) {
              output = "No education found.";
            } else {
              const eduList = edu.map((e: any) =>
                `• ${e.degree} in ${e.field} - ${e.institution} (${e.dateStart} - ${e.dateEnd})`
              ).join("\n");
              output = `Found ${edu.length} education(s):\n${eduList}`;
            }
            break;
          }

          case "repository_create_education": {
            const res = await fetch("/api/cv/education", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: typedArgs.id,
                degree: typedArgs.degree,
                field: typedArgs.field,
                institution: typedArgs.institution,
                location: typedArgs.location,
                dateStart: typedArgs.dateStart,
                dateEnd: typedArgs.dateEnd,
                tagline: typedArgs.tagline,
                note: typedArgs.note,
                focusAreas: typedArgs.focusAreas || [],
                achievements: typedArgs.achievements || [],
              }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create education");

            output = `✅ Created new education: ${typedArgs.degree} in ${typedArgs.field} at ${typedArgs.institution}`;
            break;
          }

          case "repository_update_experience": {
            const res = await fetch(`/api/cv/experience/${typedArgs.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: typedArgs.title,
                company: typedArgs.company,
                tagline: typedArgs.tagline,
                achievements: typedArgs.achievements,
                dateStart: typedArgs.dateStart,
                dateEnd: typedArgs.dateEnd,
              }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update experience");

            output = `✅ Updated experience: ${data.title || typedArgs.id}`;
            break;
          }

          case "repository_update_education": {
            const res = await fetch(`/api/cv/education/${typedArgs.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                degree: typedArgs.degree,
                field: typedArgs.field,
                institution: typedArgs.institution,
                tagline: typedArgs.tagline,
                focusAreas: typedArgs.focusAreas,
                achievements: typedArgs.achievements,
              }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update education");

            output = `✅ Updated education: ${data.degree || typedArgs.id}`;
            break;
          }

          // ===== Portfolio Projects Tools =====
          case "repository_list_portfolio_projects": {
            const params = new URLSearchParams();
            if (typedArgs.featured !== undefined) params.set("featured", String(typedArgs.featured));
            if (typedArgs.status) params.set("status", String(typedArgs.status));

            const res = await fetch(`/api/portfolio-projects?${params.toString()}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to list portfolio projects");

            const projects = data.projects || data;
            output = `📁 **Portfolio Projects** (${projects.length} found)\n\n${projects.map((p: any) =>
              `- **${p.title}** (${p.category}) ${p.featured ? "⭐" : ""}\n  Status: ${p.status} | Technologies: ${(p.technologies || []).join(", ")}`
            ).join("\n\n")}`;
            break;
          }

          case "repository_get_portfolio_project": {
            const res = await fetch(`/api/portfolio-projects/${typedArgs.id}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to get portfolio project");

            output = `📁 **${data.title}**\n\n` +
              `**Category:** ${data.category}\n` +
              `**Status:** ${data.status} ${data.featured ? "⭐ Featured" : ""}\n` +
              (data.company ? `**Company:** ${data.company}\n` : "") +
              (data.role ? `**Role:** ${data.role}\n` : "") +
              `**Technologies:** ${(data.technologies || []).join(", ")}\n` +
              (data.tags?.length ? `**Tags:** ${data.tags.join(", ")}\n` : "") +
              (data.description ? `\n---\n\n${data.description}` : "");
            break;
          }

          case "repository_create_portfolio_project": {
            const res = await fetch("/api/portfolio-projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: typedArgs.title,
                category: typedArgs.category,
                company: typedArgs.company,
                role: typedArgs.role,
                status: typedArgs.status || "active",
                featured: typedArgs.featured || false,
                technologies: typedArgs.technologies || [],
                tags: typedArgs.tags || [],
                description: typedArgs.description,
                image_url: typedArgs.image_url,
              }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create portfolio project");

            output = `✅ Created portfolio project: **${typedArgs.title}** (${typedArgs.category})`;
            break;
          }

          case "repository_update_portfolio_project": {
            const res = await fetch(`/api/portfolio-projects/${typedArgs.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: typedArgs.title,
                category: typedArgs.category,
                company: typedArgs.company,
                role: typedArgs.role,
                status: typedArgs.status,
                featured: typedArgs.featured,
                technologies: typedArgs.technologies,
                tags: typedArgs.tags,
                description: typedArgs.description,
                image_url: typedArgs.image_url,
              }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update portfolio project");

            output = `✅ Updated portfolio project: **${data.title || typedArgs.id}**`;
            break;
          }

          // ===== Perplexity Web Search Tools =====
          case "perplexity_search": {
            const res = await fetch("/api/perplexity", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "search",
                query: typedArgs.query,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Perplexity search failed");
            output = `🔍 **Search Results**\n\n${data.result}`;
            break;
          }

          case "perplexity_ask": {
            const res = await fetch("/api/perplexity", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "ask",
                question: typedArgs.question,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Perplexity ask failed");
            output = `💬 **Answer**\n\n${data.result}`;
            break;
          }

          case "perplexity_research": {
            const res = await fetch("/api/perplexity", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "research",
                topic: typedArgs.topic,
                strip_thinking: typedArgs.strip_thinking ?? true,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Perplexity research failed");
            output = `📚 **Research Report**\n\n${data.result}`;
            break;
          }

          case "perplexity_reason": {
            const res = await fetch("/api/perplexity", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "reason",
                problem: typedArgs.problem,
                strip_thinking: typedArgs.strip_thinking ?? true,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Perplexity reasoning failed");
            output = `🧠 **Reasoning Analysis**\n\n${data.result}`;
            break;
          }

          default:
            output = `Unknown tool: ${toolName}`;
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
  });

  // Load conversation history
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations?limit=20");
      const data = await res.json();
      setSavedConversations(data.conversations || []);
      return data.conversations || [];
    } catch (error) {
      console.error("Failed to load conversations:", error);
      return [];
    }
  }, []);

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
          sendMessage(
            { text: prefill },
            {
              body: {
                soulConfig,
                toolsConfig,
                modelConfig,
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

  // Debug: log status and messages changes
  useEffect(() => {
    console.log("[Chat Debug] Status:", status, "Messages:", messages.length, "Error:", error);
    if (messages.length > 0) {
      console.log("[Chat Debug] Last message:", messages[messages.length - 1]);
    }
  }, [status, messages, error]);

  // Auto-scroll to bottom - throttled with requestAnimationFrame
  const scrollTimeoutRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    if (scrollTimeoutRef.current) {
      cancelAnimationFrame(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = requestAnimationFrame(() => {
      if (scrollRef.current) {
        // Find the actual viewport element inside Radix ScrollArea
        const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight;
        }
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
    if (!scrollRef.current) return null;
    // Radix ScrollArea puts the scrollable content inside a viewport element
    return scrollRef.current.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
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

  // Search messages
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      setCurrentSearchIndex(0);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const results: number[] = [];

    messages.forEach((message, index) => {
      const textParts = message.parts
        ?.filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join(" ") || "";

      if (textParts.toLowerCase().includes(lowerQuery)) {
        results.push(index);
      }
    });

    setSearchResults(results);
    setCurrentSearchIndex(0);

    // Scroll to first result
    if (results.length > 0) {
      scrollToSearchResult(results[0]);
    }
  }, [messages]);

  // Scroll to a specific search result
  const scrollToSearchResult = useCallback((messageIndex: number) => {
    const message = messages[messageIndex];
    if (message) {
      const element = messageRefs.current.get(message.id);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [messages]);

  // Navigate search results
  const nextSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(newIndex);
    scrollToSearchResult(searchResults[newIndex]);
  }, [searchResults, currentSearchIndex, scrollToSearchResult]);

  const prevSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(newIndex);
    scrollToSearchResult(searchResults[newIndex]);
  }, [searchResults, currentSearchIndex, scrollToSearchResult]);

  // Keyboard shortcut for search (Cmd/Ctrl + F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === "Escape" && showSearch) {
        setShowSearch(false);
        setSearchQuery("");
        setSearchResults([]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSearch]);

  // Track if prefill was sent (used by init effect)
  const [hasSentPrefill, setHasSentPrefill] = useState(false);

  // Process files (images get compressed, PDFs pass through)
  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsCompressing(true);
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const pdfFiles = files.filter((f) => f.type === "application/pdf");

    try {
      const results: CompressionResult[] = [];
      const previews: string[] = [];
      const dataTransfer = new DataTransfer();

      // Process images (compress them)
      for (const file of imageFiles) {
        const result = await compressImage(file);
        results.push(result);

        // Generate preview from compressed blob
        const reader = new FileReader();
        const previewPromise = new Promise<string>((resolve) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(result.blob);
        });
        previews.push(await previewPromise);

        // Add compressed file
        const ext = result.format === "image/jpeg" ? ".jpg" : ".png";
        const filename = file.name.replace(/\.[^.]+$/, "") + ext;
        const compressedFile = new File([result.blob], filename, { type: result.format });
        dataTransfer.items.add(compressedFile);
      }

      // Add PDFs (no compression needed, use placeholder preview)
      for (const file of pdfFiles) {
        previews.push(`pdf:${file.name}`); // Special marker for PDF preview
        results.push({
          blob: file,
          originalSize: file.size,
          compressedSize: file.size,
          wasCompressed: false,
          format: "application/pdf",
          compressionRatio: 1,
          method: "none"
        });
        dataTransfer.items.add(file);
      }

      setCompressionInfo(results);
      setImagePreviews(previews);
      setSelectedFiles(dataTransfer.files);
    } catch (error) {
      console.error("File processing failed:", error);
      // Fallback to original files
      const dataTransfer = new DataTransfer();
      const previews: string[] = [];

      for (const file of [...imageFiles, ...pdfFiles]) {
        dataTransfer.items.add(file);
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          const previewPromise = new Promise<string>((resolve) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
          });
          previews.push(await previewPromise);
        } else {
          previews.push(`pdf:${file.name}`);
        }
      }
      setImagePreviews(previews);
      setSelectedFiles(dataTransfer.files);
    } finally {
      setIsCompressing(false);
    }
  }, []);

  // Handle file selection from input
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFiles(Array.from(files));
    }
  }, [processFiles]);

  // Handle paste event (Ctrl+V / Cmd+V with images)
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const pasteFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/") || item.type === "application/pdf") {
        const file = item.getAsFile();
        if (file) {
          pasteFiles.push(file);
        }
      }
    }

    if (pasteFiles.length > 0) {
      e.preventDefault();
      processFiles(pasteFiles);
    }
  }, [processFiles]);

  // Handle drop event
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/") || f.type === "application/pdf"
    );

    if (files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Add paste listener to window
  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  // Remove a selected image
  const removeImage = (index: number) => {
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    setCompressionInfo((prev) => prev.filter((_, i) => i !== index));

    // Rebuild FileList without the removed file
    if (selectedFiles) {
      const dataTransfer = new DataTransfer();
      Array.from(selectedFiles).forEach((f, i) => {
        if (i !== index) dataTransfer.items.add(f);
      });
      if (dataTransfer.files.length === 0) {
        setSelectedFiles(undefined);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        setSelectedFiles(dataTransfer.files);
      }
    }
  };

  // Clear all selected files
  const clearFiles = () => {
    setSelectedFiles(undefined);
    setImagePreviews([]);
    setCompressionInfo([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedFiles) || status === "submitted" || status === "streaming") return;

    // Lock soul config on first message of a new conversation (affects system prompt context)
    // Tools config is NOT locked - can be changed mid-chat to enable/disable tools dynamically
    if (messages.length === 0 && !lockedSoulConfig) {
      setLockedSoulConfig(soulConfig);
    }

    // Send message with optional files
    // Soul config is locked (affects system prompt), tools/model config are always current (dynamic)
    const effectiveSoulConfig = lockedSoulConfig || soulConfig;
    const effectiveToolsConfig = toolsConfig; // Always use current - tools can be toggled mid-chat
    sendMessage(
      {
        text: input || "What do you see in this image?",
        files: selectedFiles,
      },
      {
        body: {
          soulConfig: effectiveSoulConfig,
          toolsConfig: effectiveToolsConfig,
          modelConfig,
        },
      }
    );

    // Clear input and files
    setInput("");
    clearFiles();
  };

  // Handle editing a user message - removes all messages after it and re-sends
  const handleEditMessage = (messageId: string) => {
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    const message = messages[messageIndex];
    // Get the text content from the message
    const textContent = message.parts
      ?.filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("\n") || "";

    setEditingMessageId(messageId);
    setEditingMessageContent(textContent);
  };

  // Submit the edited message
  const handleSubmitEdit = () => {
    if (!editingMessageId || !editingMessageContent.trim()) return;

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
    const textContent = userMessage.parts
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
          },
        }
      );
    }, 50);
  };

  // Convert DB format messages to AI SDK format (restores tool invocations)
  const convertDBMessagesToAISDK = (dbMsgs: Array<{ id: string; role: string; content: string; parts?: any[] }>) => {
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
  const convertMessagesToDBFormat = (msgs: typeof messages): Array<{ id: string; role: string; content: string }> => {
    return msgs.map((m) => {
      // Extract text content from parts
      const textParts = m.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n");
      return {
        id: m.id,
        role: m.role,
        content: textParts || "",
      };
    });
  };

  // Warn user before closing/refreshing tab during streaming
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status === "streaming" || status === "submitted") {
        e.preventDefault();
        e.returnValue = "Kronus is still responding. Are you sure you want to leave?";
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
    if (
      messages.length >= 2 &&
      status === "ready" &&
      messages[messages.length - 1]?.role === "assistant"
    ) {
      const autoSave = async () => {
        try {
          // Generate title from first user message (truncate to 50 chars)
          const firstUserMessage = messages.find((m) => m.role === "user");
          if (!firstUserMessage) return;

          const textParts = firstUserMessage.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ");
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
              }),
            });
            if (res.ok) {
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
              }),
            });
            const data = await res.json();
            if (res.ok) {
              setCurrentConversationId(data.id);
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
  }, [messages, status, currentConversationId, loadConversations]);

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
        setMessages(convertedMessages);
        setCurrentConversationId(id);
        setShowHistory(false);
        setToolStates({});
      }
    } catch (error) {
      console.error("Failed to load conversation:", error);
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setCurrentConversationId(null);
    setToolStates({});
    setShowHistory(false);
    setLockedSoulConfig(null); // Unlock soul config for new conversation
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

  // Estimate tokens in current conversation (rough: ~4 chars per token)
  const estimatedTokens = useMemo(() => {
    const textContent = messages
      .map((m) => {
        const textParts = m.parts?.filter((p) => p.type === "text") || [];
        return textParts.map((p: any) => p.text || "").join("");
      })
      .join("");
    return Math.round(textContent.length / 4);
  }, [messages]);

  // Context limit and warning thresholds
  const CONTEXT_LIMIT = 200000;
  const WARNING_THRESHOLD = 0.7; // 70% = 140K tokens
  const COMPRESS_THRESHOLD = 0.85; // 85% = 170K tokens

  const contextUsagePercent = (estimatedTokens / CONTEXT_LIMIT) * 100;
  const showContextWarning = estimatedTokens > CONTEXT_LIMIT * WARNING_THRESHOLD;
  const showCompressButton = estimatedTokens > CONTEXT_LIMIT * 0.5; // Show at 50%

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
    <div className={cn(
      "kronus-chamber flex h-full relative",
      kronusTheme === "light" && "kronus-light"
    )}>
      {/* Conversation History Sidebar */}
      {showHistory && (
        <div className="kronus-sidebar flex w-64 flex-col z-10">
          <div className="flex items-center justify-between border-b p-3">
            <h3 className="text-sm font-semibold">Saved Chats</h3>
            <Button variant="ghost" size="sm" onClick={handleNewConversation}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-1 p-2">
              {savedConversations.length === 0 ? (
                <p className="text-[var(--kronus-ivory-muted)] p-3 text-xs text-center italic">No saved conversations yet</p>
              ) : (
                savedConversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => handleLoadConversation(conv.id)}
                    className={cn(
                      "kronus-sidebar-item group flex cursor-pointer items-center justify-between p-2",
                      currentConversationId === conv.id && "active"
                    )}
                  >
                    <div className="min-w-0 flex-1 overflow-wrap-anywhere break-words">
                      <p className="truncate text-sm font-medium">{conv.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatDateShort(conv.updated_at)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                    >
                      <Trash2 className="text-destructive h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Toolbar */}
        <div className="kronus-toolbar flex items-center gap-2 px-4 py-2 z-10">
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
            <History className="mr-1 h-4 w-4" />
            History
          </Button>
          <Button variant="ghost" size="sm" onClick={handleNewConversation}>
            <Plus className="mr-1 h-4 w-4" />
            New
          </Button>
          {/* Soul Config - always editable, affects next new chat */}
          <SoulConfig
            config={soulConfig}
            onChange={setSoulConfig}
          />
          {/* Tools Config - controls which tool categories are enabled */}
          <ToolsConfig
            config={toolsConfig}
            onChange={setToolsConfig}
          />
          {/* Model Config - select AI provider (Gemini, Claude, GPT-4o) */}
          <ModelConfig
            config={modelConfig}
            onChange={setModelConfig}
          />
          {/* Format Config - font/size, applies immediately */}
          <FormatConfig
            config={formatConfig}
            onChange={setFormatConfig}
          />
          <div className="flex-1" />
          {messages.length > 0 && (
            <>
              {/* Search toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSearch(!showSearch)}
                className={showSearch ? "bg-[var(--kronus-surface)]" : ""}
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
              <Button
                variant="ghost"
                size="sm"
                onClick={scrollToLast}
                title="Jump to last message"
              >
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
          )}
        </div>

        {/* Search Bar */}
        {showSearch && (
          <div className="flex items-center gap-2 px-4 py-2 bg-[var(--kronus-surface)] border-b border-[var(--kronus-border)]">
            <Search className="h-4 w-4 text-[var(--kronus-ivory-muted)]" />
            <Input
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search messages... (Esc to close)"
              className="flex-1 h-8 bg-[var(--kronus-void)] border-[var(--kronus-border)] text-sm"
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
              <span className="text-xs text-[var(--kronus-ivory-muted)] whitespace-nowrap">
                {currentSearchIndex + 1} of {searchResults.length}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={prevSearchResult} disabled={searchResults.length === 0}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={nextSearchResult} disabled={searchResults.length === 0}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowSearch(false);
                setSearchQuery("");
                setSearchResults([]);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Messages Area */}
        <ScrollArea className="flex-1 z-10" ref={scrollRef}>
          <div
            className="mx-auto max-w-3xl space-y-2 p-4"
            style={{
              fontFamily: KRONUS_FONTS[formatConfig.font || "inter"].family,
              fontSize: KRONUS_FONT_SIZES[formatConfig.fontSize || "base"].size,
            }}
          >
            {messages.length === 0 && (
              <div className="kronus-message p-4">
                <div className="flex items-start gap-4">
                  <div className="kronus-avatar flex h-12 w-12 shrink-0 items-center justify-center rounded-full overflow-hidden p-0">
                    <img src="/chronus-logo.png" alt="Kronus" className="h-full w-full object-cover" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-xl text-gradient-teal-gold">
                      Kronus — Oracle of Tartarus
                    </h3>
                    <p className="text-[var(--kronus-ivory-dim)] mt-3 leading-relaxed">
                      Greetings, seeker. I am <span className="text-[var(--kronus-teal)] font-medium">Kronus</span>, keeper of the Developer Journal and guardian of your coding journey.
                    </p>
                    <p className="text-[var(--kronus-ivory-muted)] mt-2 leading-relaxed text-sm">
                      I can help you create and modify journal entries, explore your development history,
                      access your repository of writings and skills, and manage Linear issues.
                      Configure my capabilities via <span className="text-[var(--kronus-purple)]">Tools</span> above.
                    </p>
                    <div className="mt-4 space-y-2 text-xs">
                      <p className="text-[var(--kronus-ivory-muted)]">
                        📜 <strong className="text-[var(--kronus-ivory)]">Journal:</strong> Create entries, explore history, manage attachments
                      </p>
                      <p className="text-[var(--kronus-ivory-muted)]">
                        📚 <strong className="text-[var(--kronus-ivory)]">Repository:</strong> Writings, skills, experience, education
                      </p>
                      <p className="text-[var(--kronus-ivory-muted)]">
                        🔗 <strong className="text-[var(--kronus-ivory)]">Linear:</strong> Issues & projects (drafts require approval)
                      </p>
                      <p className="text-[var(--kronus-ivory-muted)]">
                        🌐 <strong className="text-[var(--kronus-ivory)]">Multimodal:</strong> Web search, image generation (enable in Tools)
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
                className="space-y-2"
                ref={(el) => {
                  if (el) messageRefs.current.set(message.id, el);
                }}
              >
                <div
                  className={cn(
                    "p-2.5 overflow-visible rounded-xl transition-all",
                    message.role === "user" ? "user-message ml-12" : "kronus-message",
                    isSearchMatch && "ring-2 ring-[var(--kronus-teal)]/50",
                    isCurrentSearchResult && "ring-2 ring-[var(--kronus-gold)] bg-[var(--kronus-gold)]/5"
                  )}
                >
                  {message.role === "user" ? (
                    /* User message: simple horizontal layout with edit capability */
                    <div className="group/user-msg flex items-start gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full overflow-hidden user-avatar">
                        <User className="h-4 w-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1 overflow-wrap-anywhere break-words">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs font-semibold text-[var(--kronus-gold)]">You</p>
                          {/* Edit button - visible on hover, hidden during streaming or when editing */}
                          {editingMessageId !== message.id && status !== "streaming" && status !== "submitted" && (
                            <button
                              onClick={() => handleEditMessage(message.id)}
                              className="opacity-0 group-hover/user-msg:opacity-100 transition-opacity p-1 rounded hover:bg-[var(--kronus-surface)] text-[var(--kronus-ivory-muted)] hover:text-[var(--kronus-gold)]"
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
                              className="min-h-[80px] bg-[var(--kronus-deep)] border-[var(--kronus-border)] text-[var(--kronus-ivory)] resize-y"
                              autoFocus
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={handleSubmitEdit}
                                disabled={!editingMessageContent.trim()}
                                className="bg-[var(--kronus-gold)] hover:bg-[var(--kronus-gold)]/80 text-[var(--kronus-deep)]"
                              >
                                <Send className="h-3 w-3 mr-1" />
                                Send
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleCancelEdit}
                                className="text-[var(--kronus-ivory-muted)] hover:text-[var(--kronus-ivory)]"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="max-w-none break-words overflow-wrap-anywhere">
                            {message.parts?.map((part, i) => {
                              if (part.type === "file" && (part as any).mediaType?.startsWith("image/")) {
                                return (
                                  <div key={i} className="mb-3">
                                    <img
                                      src={(part as any).url}
                                      alt={(part as any).filename || "Attached image"}
                                      className="max-w-full max-h-96 rounded-lg border border-[var(--kronus-border)] object-contain"
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
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full overflow-hidden kronus-avatar p-0">
                          <img src="/chronus-logo.png" alt="Kronus" className="h-full w-full object-cover" />
                        </div>
                        <p className="text-base font-bold tracking-[0.3em] uppercase text-[var(--kronus-teal)]" style={{ fontFamily: "var(--font-cinzel), serif" }}>
                          Kronus
                        </p>
                      </div>
                      {/* Content below header - indented for visual hierarchy */}
                      <div className="max-w-none break-words overflow-wrap-anywhere pl-6 pr-2">
                        {/* Reasoning/Thinking display - shown above the response */}
                        {(() => {
                          const reasoningParts = message.parts?.filter((p: any) => p.type === "reasoning") || [];
                          const reasoningText = reasoningParts.map((p: any) => p.text).join("\n");
                          const isLastMessage = message.id === messages[messages.length - 1]?.id;
                          const isCurrentlyStreaming = status === "streaming" && message.role === "assistant" && isLastMessage;

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
                          if (part.type === "file" && (part as any).mediaType?.startsWith("image/")) {
                            return (
                              <div key={i} className="mb-3">
                                <img
                                  src={(part as any).url}
                                  alt={(part as any).filename || "Attached image"}
                                  className="max-w-full max-h-96 rounded-lg border border-[var(--kronus-border)] object-contain"
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
                            const isLastMessage = message.id === messages[messages.length - 1]?.id;
                            const isStreaming = status === "streaming" && message.role === "assistant" && isLastMessage;

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
                        const canRegenerate = isLastAssistantMessage && status !== "streaming" && status !== "submitted";

                        if (!canRegenerate) return null;

                        return (
                          <div className="pl-6 mt-2 opacity-0 group-hover/kronus-msg:opacity-100 transition-opacity">
                            <button
                              onClick={handleRegenerateResponse}
                              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-[var(--kronus-ivory-muted)] hover:text-[var(--kronus-teal)] hover:bg-[var(--kronus-surface)] transition-colors"
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
                        if (!isLastAssistantMessage || status === "streaming" || status === "submitted") return null;

                        // Get text content from message
                        const textContent = message.parts
                          ?.filter((p: any) => p.type === "text")
                          .map((p: any) => p.text)
                          .join("\n") || "";

                        const { isConfirmation, proposedChanges } = detectConfirmationRequest(textContent);
                        if (!isConfirmation) return null;

                        return (
                          <div className="pl-6">
                            <ConfirmationButtons
                              onConfirm={() => {
                                // Send "yes" as user response - include config in body
                                const effectiveSoulConfig = lockedSoulConfig || soulConfig;
                                sendMessage(
                                  { text: "Yes, proceed with the changes." },
                                  { body: { soulConfig: effectiveSoulConfig, toolsConfig, modelConfig } }
                                );
                              }}
                              onReject={() => {
                                // Send "no" as user response
                                const effectiveSoulConfig = lockedSoulConfig || soulConfig;
                                sendMessage(
                                  { text: "No, cancel. Do not make the changes." },
                                  { body: { soulConfig: effectiveSoulConfig, toolsConfig, modelConfig } }
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
                          "tool-invocation ml-12 p-3 mt-2",
                          state?.completed && "success"
                        )}
                      >
                        <button
                          onClick={() => toggleToolExpanded(toolCallId)}
                          className="flex w-full items-center gap-2 text-left"
                        >
                          {state?.pendingConfirmation ? (
                            <AlertCircle className="h-4 w-4 text-[var(--kronus-gold)] animate-pulse" />
                          ) : state?.isLoading ? (
                            <Loader2 className="text-primary h-4 w-4 animate-spin" />
                          ) : state?.error ? (
                            <AlertCircle className="text-destructive h-4 w-4" />
                          ) : state?.completed ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <Wrench className="text-muted-foreground h-4 w-4" />
                          )}
                          <span className="flex-1 font-mono text-sm">{toolName}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              state?.pendingConfirmation
                                ? "bg-[var(--kronus-gold)]/10 border-[var(--kronus-gold)] text-[var(--kronus-gold)]"
                                : "bg-[var(--kronus-surface)] border-[var(--kronus-border)] text-[var(--kronus-ivory-muted)]"
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
                                <p className="text-muted-foreground mb-2 text-xs">Generated Images:</p>
                                <div className="grid grid-cols-1 gap-2">
                                  {state.images.map((imageUrl: string, idx: number) => (
                                    <div key={idx} className="relative rounded-lg border overflow-hidden group">
                                      <img
                                        src={imageUrl}
                                        alt={`Generated image ${idx + 1}`}
                                        className="w-full h-auto max-h-96 object-contain"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = "none";
                                        }}
                                      />
                                      <div className="absolute top-2 right-2 flex gap-1">
                                        <a
                                          href={imageUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="bg-black/50 hover:bg-black/70 text-white text-xs px-2 py-1 rounded"
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
                                                  description: state.prompt ? `Generated: ${state.prompt}` : "AI Generated Image",
                                                  prompt: state.prompt,
                                                  model: state.model,
                                                  destination: "media",
                                                }),
                                              });
                                              const data = await res.json();
                                              if (res.ok) {
                                                alert(`✅ Saved to media library (ID: ${data.id})`);
                                              } else {
                                                alert(`❌ Failed: ${data.error}`);
                                              }
                                            } catch (err: any) {
                                              alert(`❌ Error: ${err.message}`);
                                            }
                                          }}
                                          className="bg-green-600/80 hover:bg-green-600 text-white text-xs px-2 py-1 rounded"
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
                                    "max-h-48 overflow-auto rounded p-2 text-xs border",
                                    state?.error
                                      ? "bg-red-900/20 border-red-900/50 text-red-300"
                                      : "bg-[var(--kronus-void)] border-[var(--kronus-border)] text-[var(--kronus-ivory-dim)]"
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
                    <div className="absolute inset-[-8px] rounded-full bg-gradient-to-r from-[var(--kronus-teal)]/20 via-[var(--kronus-gold)]/10 to-[var(--kronus-teal)]/20 blur-md animate-pulse" />
                    {/* Rotating ouroboros */}
                    <div className="relative h-16 w-16 animate-[spin_8s_linear_infinite]">
                      <img
                        src="/ouroboros.png"
                        alt="Loading"
                        className="h-full w-full object-contain opacity-80 drop-shadow-[0_0_8px_rgba(111,207,207,0.4)]"
                      />
                    </div>
                  </div>
                  <span className="text-[var(--kronus-ivory-muted)] text-sm italic tracking-wide">
                    {status === "submitted" ? "Consulting the oracle..." : "Weaving wisdom..."}
                  </span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div
          className="kronus-input-area p-4 z-10"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
            {/* Error Banner */}
            {error && (
              <div className="mb-3 p-3 rounded-lg bg-[var(--kronus-error)]/10 border border-[var(--kronus-error)]/30 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-[var(--kronus-error)] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--kronus-error)]">
                    Request Failed
                  </p>
                  <p className="text-xs text-[var(--kronus-ivory-muted)] mt-1 break-words">
                    {error.message || "An unknown error occurred"}
                  </p>
                  {error.message?.includes("too long") && (
                    <p className="text-xs text-[var(--kronus-gold)] mt-2">
                      Tip: Try disabling some Soul Config sections or compress the conversation history.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="text-xs text-[var(--kronus-teal)] hover:underline shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Image Previews with compression info */}
            {(imagePreviews.length > 0 || isCompressing) && (
              <div className="mb-3">
                {isCompressing && (
                  <div className="flex items-center gap-2 text-[var(--kronus-ivory-muted)] text-sm mb-2">
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
                      <div key={index} className="relative group">
                        {isPdf ? (
                          /* PDF preview */
                          <div className="h-16 px-3 flex items-center gap-2 rounded-lg border-2 border-[var(--kronus-border)] bg-[var(--kronus-surface)]">
                            <FileText className="h-5 w-5 text-[var(--kronus-gold)]" />
                            <span className="text-xs text-[var(--kronus-ivory-muted)] max-w-[100px] truncate">
                              {pdfName}
                            </span>
                          </div>
                        ) : (
                          /* Image preview */
                          <img
                            src={preview}
                            alt={`Preview ${index + 1}`}
                            className="h-16 w-16 object-cover rounded-lg border-2 border-[var(--kronus-border)]"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        {/* Compression badge (images only) */}
                        {showCompressionBadge && !isPdf && (
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-black/70 text-[var(--kronus-teal)] text-[9px] px-1 py-0.5 rounded-b-lg text-center"
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

            <div className="flex gap-3 items-center">
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
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={imagePreviews.length > 0 ? "Ask about the files..." : "Speak your query to the oracle..."}
                  className="kronus-input max-h-[200px] min-h-[52px] resize-y overflow-y-auto pl-11 pr-4 py-3"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  disabled={status === "submitted" || status === "streaming" || isCompressing}
                />
                {/* Attach button (inside textarea, left side) */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-[var(--kronus-ivory-muted)] hover:text-[var(--kronus-teal)] transition-colors disabled:opacity-40"
                  disabled={status === "submitted" || status === "streaming"}
                  title="Attach files (images, PDFs)"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
              </div>

              {/* Send / Stop button (centered to textarea) */}
              {(status === "submitted" || status === "streaming") ? (
                <button
                  type="button"
                  onClick={() => stop()}
                  className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-[var(--kronus-error)]/20 text-[var(--kronus-error)] hover:bg-[var(--kronus-error)]/30 border border-[var(--kronus-error)]/30 transition-all shadow-lg shadow-[var(--kronus-error)]/10"
                  title="Stop generating"
                >
                  <Square className="h-5 w-5 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-[var(--kronus-teal)] text-[var(--kronus-deep)] hover:bg-[var(--kronus-teal)]/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[var(--kronus-teal)]/20 hover:shadow-[var(--kronus-teal)]/40"
                  disabled={(!input.trim() && !selectedFiles) || isCompressing}
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
        <DialogContent className={cn(
          "bg-[var(--tartarus-surface)] border-[var(--tartarus-border)] transition-all duration-200",
          showDiffView ? "max-w-4xl" : "max-w-2xl"
        )}>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[var(--kronus-gold)]">
                <AlertCircle className="h-5 w-5" />
                Confirm Action
              </span>
              {/* Diff view toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDiffView(!showDiffView)}
                className={cn(
                  "h-8 px-3 gap-2 text-xs",
                  showDiffView
                    ? "bg-[var(--kronus-teal)]/20 text-[var(--kronus-teal)] border border-[var(--kronus-teal)]/30"
                    : "text-[var(--kronus-ivory-muted)] hover:text-[var(--kronus-ivory)] hover:bg-[var(--tartarus-bg)]"
                )}
              >
                <GitCompare className="h-3.5 w-3.5" />
                {showDiffView ? "Hide Diff" : "Show Diff"}
                {showDiffView ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              </Button>
            </DialogTitle>
          </DialogHeader>

          {pendingToolAction && (
            <div className="py-4 space-y-4">
              {/* Action description */}
              <div className="p-3 rounded-lg bg-[var(--tartarus-bg)] border border-[var(--tartarus-border)]">
                <p className="text-sm font-medium text-[var(--kronus-ivory)]">
                  {pendingToolAction.action.description}
                </p>
                <p className="text-xs text-[var(--kronus-ivory-muted)] mt-1">
                  Tool: <code className="text-[var(--kronus-teal)]">{pendingToolAction.action.toolName}</code>
                </p>
              </div>

              {/* Rich preview for Linear tools, diff view for others */}
              {isLinearTool(pendingToolAction.action.toolName) ? (
                /* Linear-style rich preview */
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[var(--kronus-ivory-muted)] uppercase tracking-wide flex items-center gap-2">
                    <FileText className="h-3 w-3" />
                    Preview
                  </p>
                  <div className="max-h-[450px] overflow-y-auto">
                    {getLinearPreview(pendingToolAction.action.toolName, pendingToolAction.action.args)}
                  </div>
                </div>
              ) : showDiffView ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[var(--kronus-ivory-muted)] uppercase tracking-wide flex items-center gap-2">
                    <GitCompare className="h-3 w-3" />
                    Changes Preview
                  </p>
                  <div className="max-h-[400px] overflow-y-auto rounded-lg bg-[var(--tartarus-bg)] border border-[var(--tartarus-border)]">
                    <pre className="p-4 text-xs font-mono text-[var(--kronus-ivory)] whitespace-pre-wrap leading-relaxed">
                      {formatArgsForDiffView(pendingToolAction.action.toolName, pendingToolAction.action.args)}
                    </pre>
                  </div>
                </div>
              ) : (
                /* Compact parameters view */
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[var(--kronus-ivory-muted)] uppercase tracking-wide">
                    Parameters
                  </p>
                  <div className="max-h-[200px] overflow-y-auto rounded-lg bg-[var(--tartarus-bg)] border border-[var(--tartarus-border)] p-3">
                    <dl className="space-y-2 text-sm">
                      {Object.entries(pendingToolAction.action.formattedArgs).map(([key, value]) => (
                        <div key={key} className="grid grid-cols-[120px_1fr] gap-2">
                          <dt className="text-[var(--kronus-ivory-muted)] font-mono text-xs">{key}:</dt>
                          <dd className="text-[var(--kronus-ivory)] break-words whitespace-pre-wrap font-mono text-xs">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              )}

              {/* Warning */}
              <p className="text-xs text-[var(--kronus-gold)] flex items-center gap-1">
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
              className="bg-[var(--kronus-teal)] hover:bg-[var(--kronus-teal)]/90 text-white"
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
