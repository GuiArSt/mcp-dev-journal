"use client";

import { forwardRef, memo, useRef, useImperativeHandle, useEffect, useMemo, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { MermaidPreview } from "@/components/multimedia/MermaidPreview";
import { HourglassSpinner } from "./icons";
import type { ToolCallSummary, Turn } from "./types";
import { ConversationSummaryControls } from "./ConversationSummaryControls";
import type { ConversationSummaryRow } from "@/lib/conversation-summary-ui";

const INITIAL_RENDERED_TURNS = 24;
const LOAD_EARLIER_STEP = 24;
const USER_MSG_PREVIEW_CHARS = 80;

function previewUserText(text: string, max = USER_MSG_PREVIEW_CHARS): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

type RecentConversation = ConversationSummaryRow;

interface HeroProps {
  turns: Turn[];
  streamingAssistantText?: string;
  pendingUserText?: string;
  activeToolCalls?: ToolCallSummary[];
  isThinking: boolean;
  isStreaming: boolean;
  onRegen?: () => void;
  onCopy?: (text: string) => void;
  onEdit?: () => void;
  onScrollTurnChange?: (visibleTurn: number) => void;
  recentConversations?: RecentConversation[];
  onLoadConversation?: (id: number) => void;
  onConversationSummaryUpdated?: (id: number, patch: Partial<RecentConversation>) => void;
  /** Changes when a conversation is loaded or reset — triggers scroll-to-start after render. */
  conversationAnchorKey?: string | number | null;
}

export interface HeroHandle {
  scrollToTurn: (n: number) => void;
  scrollToBottom: () => void;
  scrollToTop: () => void;
}

const NEAR_BOTTOM_PX = 140;

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const Hero = forwardRef<HeroHandle, HeroProps>(function Hero(
  {
    turns,
    streamingAssistantText,
    pendingUserText,
    activeToolCalls = [],
    isThinking,
    isStreaming,
    onRegen,
    onCopy,
    onEdit,
    onScrollTurnChange,
    recentConversations,
    onLoadConversation,
    onConversationSummaryUpdated,
    conversationAnchorKey,
  },
  ref,
) {
  const heroRef = useRef<HTMLElement | null>(null);
  const [latestButtonVisible, setLatestButtonVisible] = useState(false);
  const [renderedTurnCount, setRenderedTurnCount] = useState(INITIAL_RENDERED_TURNS);
  const stickToBottomRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const anchorKeyRef = useRef<string | number | null | undefined>(undefined);
  const pendingStartAnchorRef = useRef(false);

  const isNearBottom = useCallback((el: HTMLElement) => {
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  const scrollToTop = useCallback((behavior: ScrollBehavior = "instant") => {
    const el = heroRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    stickToBottomRef.current = false;
    el.scrollTo({ top: 0, behavior });
    window.setTimeout(() => {
      programmaticScrollRef.current = false;
      if (heroRef.current) setLatestButtonVisible(!isNearBottom(heroRef.current));
    }, behavior === "smooth" ? 320 : 0);
  }, [isNearBottom]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "instant") => {
    const el = heroRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    stickToBottomRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior });
    window.setTimeout(() => {
      programmaticScrollRef.current = false;
      if (heroRef.current) setLatestButtonVisible(!isNearBottom(heroRef.current));
    }, behavior === "smooth" ? 320 : 0);
  }, [isNearBottom]);

  const scrollTargetIntoView = useCallback((target: HTMLElement, behavior: ScrollBehavior = "smooth") => {
    const container = heroRef.current;
    if (!container) return;
    programmaticScrollRef.current = true;
    stickToBottomRef.current = false;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = container.scrollTop + (targetRect.top - containerRect.top) - 36;
    container.scrollTo({ top: Math.max(0, top), behavior });
    window.setTimeout(() => {
      programmaticScrollRef.current = false;
      if (heroRef.current) setLatestButtonVisible(!isNearBottom(heroRef.current));
    }, behavior === "smooth" ? 320 : 0);
  }, [isNearBottom]);

  const scrollToTurnIndex = useCallback((turnIndex: number, focus: "kronos" | "start" = "kronos") => {
    const el = heroRef.current;
    if (!el) return;

    const latestTurn = pendingUserText !== undefined ? turns.length + 1 : turns.length;
    if (turnIndex > latestTurn) {
      scrollToBottom("smooth");
      return;
    }

    const scrollTurnBlock = (index: number) => {
      const node = heroRef.current;
      if (!node) return;
      const block = node.querySelector<HTMLElement>(`[data-turn="${index}"]`);
      if (!block) return;
      const target =
        focus === "kronos"
          ? (block.querySelector<HTMLElement>(".hg-kronos-msg") ?? block)
          : block;
      scrollTargetIntoView(target, "smooth");
    };

    // In-flight pending turn is rendered outside `turns[]`.
    if (pendingUserText !== undefined && turnIndex === latestTurn) {
      scrollTurnBlock(turnIndex);
      return;
    }

    const pos = turns.findIndex((t) => t.index === turnIndex);
    if (pos < 0) return;

    const doScroll = () => scrollTurnBlock(turnIndex);

    const requiredRendered = turns.length - pos;
    if (requiredRendered > renderedTurnCount) {
      setRenderedTurnCount(requiredRendered);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(doScroll);
      });
      return;
    }

    doScroll();
  }, [pendingUserText, renderedTurnCount, scrollToBottom, scrollTargetIntoView, turns]);

  useImperativeHandle(ref, () => ({
    scrollToTurn: scrollToTurnIndex,
    scrollToBottom: () => scrollToBottom("smooth"),
    scrollToTop: () => scrollToTop("instant"),
  }), [scrollToBottom, scrollToTop, scrollToTurnIndex]);

  const currentTurn = turns.length;
  const hiddenTurnCount = Math.max(0, turns.length - renderedTurnCount);
  const visibleTurns = useMemo(
    () => turns.slice(Math.max(0, turns.length - renderedTurnCount)),
    [renderedTurnCount, turns],
  );

  useEffect(() => {
    setRenderedTurnCount((count) => Math.min(Math.max(count, INITIAL_RENDERED_TURNS), Math.max(turns.length, INITIAL_RENDERED_TURNS)));
  }, [turns.length]);

  // Track scroll: pin/unpin bottom follow + latest button + parent turn indicator.
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!programmaticScrollRef.current) {
        stickToBottomRef.current = isNearBottom(el);
      }
      setLatestButtonVisible(turns.length > 0 && !isNearBottom(el));

      if (onScrollTurnChange) {
        const blocks = el.querySelectorAll<HTMLElement>(".hg-turn-block");
        if (!blocks.length) return;
        const center = el.scrollTop + el.clientHeight / 2;
        let visible = currentTurn;
        for (const b of Array.from(blocks)) {
          if (b.offsetTop <= center) visible = Number(b.dataset.turn) || visible;
        }
        onScrollTurnChange(visible);
      }
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [currentTurn, isNearBottom, onScrollTurnChange, turns.length]);

  useEffect(() => {
    if (anchorKeyRef.current !== conversationAnchorKey) {
      anchorKeyRef.current = conversationAnchorKey;
      if (typeof conversationAnchorKey === "number") {
        pendingStartAnchorRef.current = true;
      }
    }
  }, [conversationAnchorKey]);

  // After a conversation loads or resets, anchor at the beginning once layout settles.
  useEffect(() => {
    if (!pendingStartAnchorRef.current || turns.length === 0) return;

    let cancelled = false;
    const anchor = () => {
      if (cancelled || !heroRef.current) return;
      pendingStartAnchorRef.current = false;
      scrollToTop("instant");
    };

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(anchor);
    });
    const settleTimer = window.setTimeout(anchor, 180);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(settleTimer);
    };
  }, [scrollToTop, turns.length]);

  // While streaming, follow the live tail only if the reader is pinned to the bottom.
  const streamScrollRafRef = useRef<number | null>(null);
  useEffect(() => {
    const live = pendingUserText !== undefined || isStreaming;
    if (!live) return;
    const el = heroRef.current;
    if (!el || !stickToBottomRef.current) return;

    if (streamScrollRafRef.current != null) cancelAnimationFrame(streamScrollRafRef.current);
    streamScrollRafRef.current = requestAnimationFrame(() => {
      streamScrollRafRef.current = null;
      const node = heroRef.current;
      if (!node || !stickToBottomRef.current) return;
      programmaticScrollRef.current = true;
      node.scrollTop = node.scrollHeight;
      programmaticScrollRef.current = false;
    });

    return () => {
      if (streamScrollRafRef.current != null) cancelAnimationFrame(streamScrollRafRef.current);
    };
  }, [isStreaming, pendingUserText, streamingAssistantText]);

  const handleLatestClick = () => {
    const latest = pendingUserText !== undefined ? turns.length + 1 : turns.length;
    if (latest <= 0) return;
    scrollToTurnIndex(latest, "kronos");
  };

  const handleLoadEarlier = () => {
    setRenderedTurnCount((count) => Math.min(turns.length, count + LOAD_EARLIER_STEP));
  };

  return (
    <main className="hg-hero" ref={heroRef as never}>
      <div className="hg-doc">
        {turns.length === 0 && !pendingUserText && (
          <div className="hg-doc-empty">
            <span className="hg-doc-empty-glyph">✦</span>
            <p>The page is blank. Begin.</p>
            {recentConversations && recentConversations.length > 0 && (
              <div className="hg-doc-empty-history">
                <div className="hg-doc-empty-history-label">recent</div>
                {recentConversations.map((c) => (
                  <div key={c.id} className="hg-doc-empty-history-row">
                    <button
                      type="button"
                      className="hg-doc-empty-history-main"
                      onClick={() => onLoadConversation?.(c.id)}
                    >
                      <span className="hg-doc-empty-history-title">{c.title || "untitled"}</span>
                      {c.summary && (
                        <span className="hg-doc-empty-history-summary">{c.summary}</span>
                      )}
                      <span className="hg-doc-empty-history-age">
                        {new Date(c.updated_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </span>
                    </button>
                    <ConversationSummaryControls
                      conv={c}
                      size="sm"
                      onUpdated={(patch) => onConversationSummaryUpdated?.(c.id, patch)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {hiddenTurnCount > 0 && (
          <button type="button" className="hg-load-earlier" onClick={handleLoadEarlier}>
            show {Math.min(LOAD_EARLIER_STEP, hiddenTurnCount)} earlier turns · {hiddenTurnCount} hidden
          </button>
        )}

        {visibleTurns.map((t) => {
          const isLastCompletedTurn = t.index === currentTurn;
          const isCurrent = isLastCompletedTurn && pendingUserText === undefined;
          return (
            <TurnBlock
              key={t.id}
              turn={t}
              isCurrent={isCurrent}
              isThinking={false}
              isStreaming={false}
              onRegen={isCurrent ? onRegen : undefined}
              onCopy={isCurrent && onCopy ? () => onCopy(t.assistantText) : undefined}
              onEdit={isCurrent ? onEdit : undefined}
            />
          );
        })}

        {/* Pending turn: user has sent, assistant is thinking or streaming */}
        {pendingUserText !== undefined && (
          <PendingTurnBlock
            turnIndex={turns.length + 1}
            userText={pendingUserText}
            assistantText={streamingAssistantText ?? ""}
            toolCalls={activeToolCalls}
            isThinking={isThinking || (isStreaming && !(streamingAssistantText ?? "").trim())}
            isStreaming={isStreaming && Boolean((streamingAssistantText ?? "").trim())}
          />
        )}
      </div>

      <button
        type="button"
        className={`hg-scroll-latest${latestButtonVisible ? " hg-show" : ""}`}
        onClick={handleLatestClick}
        aria-label={`Jump to latest turn, beat ${String(currentTurn).padStart(2, "0")}`}
      >
        <span className="hg-scroll-latest-icon" aria-hidden>↓</span>
        <span>latest · beat {String(currentTurn).padStart(2, "0")}</span>
      </button>
    </main>
  );
});

interface TurnBlockProps {
  turn: Turn;
  isCurrent: boolean;
  isThinking: boolean;
  isStreaming: boolean;
  onRegen?: () => void;
  onCopy?: () => void;
  onEdit?: () => void;
}

/** Live in-flight turn — isolated so completed TurnBlocks stay memo-stable. */
function PendingTurnBlock({
  turnIndex,
  userText,
  assistantText,
  toolCalls,
  isThinking,
  isStreaming,
}: {
  turnIndex: number;
  userText: string;
  assistantText: string;
  toolCalls: ToolCallSummary[];
  isThinking: boolean;
  isStreaming: boolean;
}) {
  const turn: Turn = {
    id: "pending",
    index: turnIndex,
    userMessageId: "pending-user",
    assistantMessageId: "pending-assistant",
    startedAt: Date.now(),
    userText,
    assistantText,
    toolCalls,
  };
  return (
    <TurnBlock
      turn={turn}
      isCurrent
      isThinking={isThinking}
      isStreaming={isStreaming}
    />
  );
}

function UserTurnMessage({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const trimmed = text.trim();
  if (!trimmed) return null;

  return (
    <div className={`hg-user-msg-wrap${expanded ? " hg-expanded" : " hg-collapsed"}`}>
      <button
        type="button"
        className="hg-user-msg-toggle"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
      >
        <span className="hg-user-msg-label">you</span>
        {!expanded && <span className="hg-user-msg-preview">{previewUserText(trimmed, 56)}</span>}
        <span className="hg-user-msg-fold">{expanded ? "hide" : "show"}</span>
      </button>
      {expanded && <div className="hg-user-msg hg-user-msg-body">{text}</div>}
    </div>
  );
}

const TurnBlock = memo(function TurnBlock({ turn, isCurrent, isThinking, isStreaming, onRegen, onCopy, onEdit }: TurnBlockProps) {
  const displayedText = turn.assistantText;
  const toolCalls = turn.toolCalls ?? [];

  return (
    <div className={`hg-turn-block${isCurrent ? " hg-current" : ""}`} data-turn={turn.index}>
      <div className="hg-turn-head">
        <span className="hg-dot" />
        <span className="hg-turn-n" title="Chat stream beat — same numbering as shelf ‘beat’ labels when artifacts are added.">
          beat {String(turn.index).padStart(2, "0")}
          {isCurrent ? " · now" : ""}
        </span>
        <span className="hg-line" />
        <span className="hg-turn-time">
          {formatTime(turn.startedAt)}
          {isStreaming ? " · streaming" : ""}
        </span>
      </div>

      <UserTurnMessage text={turn.userText} />

      <div className="hg-kronos-msg">
        <div className="hg-kronos-avatar" aria-hidden />
        <div className="hg-kronos-body">
          {isThinking && (
            <div className="hg-thinking-card" role="status" aria-live="polite">
              <div className="hg-thinking-anim">
                <HourglassSpinner />
              </div>
              <div className="hg-thinking-label">
                {toolCalls.length > 0 ? "Using tools" : "Thinking"}<span className="hg-dots" />
              </div>
            </div>
          )}

          {toolCalls.length > 0 && <ToolActivity calls={toolCalls} live={isCurrent && (isThinking || isStreaming)} />}

          {(displayedText || !isThinking) && <div className="hg-kronos-name">Kronos</div>}

          {displayedText && (
            <DocBody markdown={displayedText} streaming={isStreaming} />
          )}

          {isCurrent && !isStreaming && (onRegen || onCopy || onEdit) && (
            <div className="hg-turn-actions">
              {onRegen && <button onClick={onRegen}>⟳ regen</button>}
              {onCopy && <button onClick={onCopy}>⎘ copy</button>}
              {onEdit && <button onClick={onEdit}>✎ edit</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function ToolActivity({ calls, live }: { calls: ToolCallSummary[]; live: boolean }) {
  return (
    <div className="hg-tool-activity" role={live ? "status" : undefined} aria-live={live ? "polite" : undefined}>
      <span className="hg-tool-activity-label">tools</span>
      <div className="hg-tool-activity-list">
        {calls.map((call, index) => (
          <span key={`${call.name}-${index}`} className={`hg-tool-status hg-tool-status-${call.status}`}>
            <span className="hg-tool-status-dot" aria-hidden />
            <span className="hg-tool-status-name">{formatToolName(call.name)}</span>
            <span className="hg-tool-status-state">{formatToolStatus(call.status)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function formatToolName(name: string) {
  return name.replace(/^tool-/, "").replace(/_/g, " ");
}

function formatToolStatus(status: ToolCallSummary["status"]) {
  if (status === "done") return "done";
  if (status === "error") return "failed";
  return "running";
}

interface DocBodyProps {
  markdown: string;
  streaming: boolean;
}

function DocBody({ markdown, streaming }: DocBodyProps) {
  if (streaming) return <StreamingDocBody text={markdown} />;
  const normalized = normalizeAssistantMarkdown(markdown);

  return (
    <div className="hg-doc-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          p: ({ children }) => {
            const text = childrenToText(children);
            if (text && /^[A-Z]/.test(text) && text.endsWith(".") && text.length < 140 && text.split(" ").length <= 18) {
              // Heuristic for the "intro" italic lead line.
              return <p className="hg-intro">{children}</p>;
            }
            return <p>{children}</p>;
          },
          blockquote: (p) => <blockquote>{p.children}</blockquote>,
          code: (p) => <code className={p.className}>{p.children}</code>,
          pre: (p) => {
            const child = Array.isArray(p.children) ? p.children[0] : p.children;
            const props = child && typeof child === "object" && "props" in child
              ? (child as { props?: { className?: string; children?: React.ReactNode } }).props
              : undefined;
            const raw = childrenToText(props?.children).replace(/\n$/, "");
            const lang = /language-(\w+)/.exec(props?.className ?? "")?.[1]?.toLowerCase();
            if (lang === "mermaid" || isLikelyMermaid(raw)) {
              return <MermaidPreview code={raw} className="hg-chat-mermaid" theme="base" />;
            }
            if (isLikelyAsciiDiagram(raw)) {
              return (
                <pre className="hg-ascii-diagram">
                  <code>{raw}</code>
                </pre>
              );
            }
            return <pre>{p.children}</pre>;
          },
          table: (p) => (
            <div className="hg-table-wrap">
              <table>{p.children}</table>
            </div>
          ),
          thead: (p) => <thead>{p.children}</thead>,
          tbody: (p) => <tbody>{p.children}</tbody>,
          tr: (p) => <tr>{p.children}</tr>,
          th: (p) => <th>{p.children}</th>,
          td: (p) => <td>{p.children}</td>,
          br: () => <br />,
          a: (p) => (
            <a href={p.href} target="_blank" rel="noreferrer">
              {p.children}
            </a>
          ),
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

function normalizeAssistantMarkdown(markdown: string): string {
  return markdown
    .replace(/&lt;br\s*\/?&gt;|<br\s*\/?>/gi, "; ")
    .replace(/```(?:mermaid|mmd)\s*\n([\s\S]*?)```/gi, (_, code: string) => {
      return `\`\`\`mermaid\n${code.trim()}\n\`\`\``;
    });
}

function isLikelyMermaid(code: string): boolean {
  return /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline)\b/i.test(code);
}

function isLikelyAsciiDiagram(code: string): boolean {
  const lines = code.split("\n").filter((line) => line.trim());
  if (lines.length < 4) return false;
  const arrows = (code.match(/-->|->|=>|→|←|↑|↓|▼|▶/g) ?? []).length;
  const boxChars = (code.match(/[|+\-=_\[\]┌┐└┘─│┬┴┼═║╔╗╚╝]/g) ?? []).length;
  const bracketLabels = (code.match(/\[[^\]\n]{2,80}\]/g) ?? []).length;
  return arrows >= 2 || boxChars >= 18 || bracketLabels >= 3;
}

function StreamingDocBody({ text }: { text: string }) {
  // Split into stable paragraphs + a single growing tail so the layout
  // engine only re-measures the tail per token, not the entire `pre-wrap`
  // block. A single ever-growing <span> with pre-wrap is what kills the
  // tab on long answers (each token triggers a full re-layout of the text
  // node, and GC pressure compounds).
  const { stable, tail } = useMemo(() => splitForStream(text), [text]);
  return (
    <div className="hg-doc-body hg-doc-body-stream" aria-live="polite">
      {stable.length > 0 && (
        <div className="hg-doc-stream-stable">
          {stable.map((para, i) => (
            <span key={i} className="hg-doc-stream-para">{para}</span>
          ))}
        </div>
      )}
      <span className="hg-doc-stream-tail">{tail}</span>
      <span className="hg-cursor" aria-hidden />
    </div>
  );
}

/** Split streaming text into completed paragraphs + the in-progress tail.
 *  A paragraph is a chunk terminated by a blank line. The tail keeps
 *  whatever is after the last `\n\n` (or the whole text if there is none). */
function splitForStream(text: string): { stable: string[]; tail: string } {
  const lastBreak = text.lastIndexOf("\n\n");
  if (lastBreak === -1) return { stable: [], tail: text };
  const stableBlock = text.slice(0, lastBreak);
  const tail = text.slice(lastBreak + 2);
  const stable = stableBlock.split(/\n\n+/);
  return { stable, tail };
}

function childrenToText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(childrenToText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return childrenToText((children as { props: { children?: React.ReactNode } }).props.children);
  }
  return "";
}
