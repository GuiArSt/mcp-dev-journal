"use client";

import { forwardRef, memo, useRef, useImperativeHandle, useEffect, useMemo, useState } from "react";
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
}

export interface HeroHandle {
  scrollToTurn: (n: number) => void;
  scrollToBottom: () => void;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const Hero = forwardRef<HeroHandle, HeroProps>(function Hero(
  { turns, streamingAssistantText, pendingUserText, activeToolCalls = [], isThinking, isStreaming, onRegen, onCopy, onEdit, onScrollTurnChange, recentConversations, onLoadConversation, onConversationSummaryUpdated },
  ref,
) {
  const heroRef = useRef<HTMLElement | null>(null);
  const [returnPillVisible, setReturnPillVisible] = useState(false);
  const [renderedTurnCount, setRenderedTurnCount] = useState(INITIAL_RENDERED_TURNS);

  useImperativeHandle(ref, () => ({
    scrollToTurn: (n: number) => {
      const el = heroRef.current;
      if (!el) return;
      const block = el.querySelector<HTMLElement>(`[data-turn="${n}"]`);
      if (block) el.scrollTo({ top: block.offsetTop - 40, behavior: "smooth" });
    },
    scrollToBottom: () => {
      const el = heroRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    },
  }), []);

  const currentTurn = turns.length;
  const hiddenTurnCount = Math.max(0, turns.length - renderedTurnCount);
  const visibleTurns = useMemo(
    () => turns.slice(Math.max(0, turns.length - renderedTurnCount)),
    [renderedTurnCount, turns],
  );

  useEffect(() => {
    setRenderedTurnCount((count) => Math.min(Math.max(count, INITIAL_RENDERED_TURNS), Math.max(turns.length, INITIAL_RENDERED_TURNS)));
  }, [turns.length]);

  // Track scroll to toggle return-pill + notify parent
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const onScroll = () => {
      const blocks = el.querySelectorAll<HTMLElement>(".hg-turn-block");
      if (!blocks.length) return;
      const lastBlock = blocks[blocks.length - 1];
      const scrolledPastCurrent = el.scrollTop < lastBlock.offsetTop - 200;
      setReturnPillVisible(scrolledPastCurrent);

      if (onScrollTurnChange) {
        // find the block whose top is closest above the visible center
        const center = el.scrollTop + el.clientHeight / 2;
        let visible = currentTurn;
        for (const b of Array.from(blocks)) {
          if (b.offsetTop <= center) visible = Number(b.dataset.turn) || visible;
        }
        onScrollTurnChange(visible);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [currentTurn, onScrollTurnChange, turns.length]);

  // Keep streaming cheap: throttle scroll-to-bottom to one layout pass per frame.
  const scrollRafRef = useRef<number | null>(null);
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (heroRef.current) heroRef.current.scrollTop = heroRef.current.scrollHeight;
    });
    return () => {
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [turns.length, streamingAssistantText]);

  const handleReturnClick = () => {
    const el = heroRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  const handleLoadEarlier = () => {
    setRenderedTurnCount((count) => Math.min(turns.length, count + LOAD_EARLIER_STEP));
  };

  return (
    <main className="hg-hero" ref={heroRef as never}>
      <button
        type="button"
        className={`hg-return-pill${returnPillVisible ? " hg-show" : ""}`}
        onClick={handleReturnClick}
      >
        ← return to now (beat {String(currentTurn).padStart(2, "0")})
      </button>

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

      <div className="hg-user-msg">{turn.userText}</div>

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
