/**
 * Chat log — append-only chronological event stream attached to a
 * conversation. Both the Muse and Kronus read it as their source of
 * truth for "what's actually happened" beyond the message transcript.
 *
 * Storage: `chat_conversations.chat_log` TEXT column (JSON-serialized array).
 * Writers: HourglassChat events, muse propose endpoint, paint accept handler.
 * Readers: muse propose body (`chatLog`), Kronus chat route (system-prompt block).
 */

export type CanonicalChatLogEntry = {
  timestamp: string | null;
  sequence?: number;
  actor: "user" | "assistant" | "tool" | "system" | "reviewer";
  eventType: "message" | "tool_call" | "tool_result" | "reasoning" | "context" | "status" | "finding" | "artifact";
  text: string;
  tooling?: {
    name?: string;
    callId?: string;
    ok?: boolean;
    argsPreview?: string;
    resultPreview?: string;
  };
  params?: Record<string, unknown>;
};

type LegacyChatLogEntry =
  | { kind: "user_message"; text: string; ts: number }
  | { kind: "assistant_message"; text: string; ts: number }
  | { kind: "tool_call"; name: string; argsPreview?: string; ts: number }
  | { kind: "tool_result"; name: string; ok: boolean; preview?: string; ts: number }
  | {
      kind: "shelf_add";
      uuid: string;
      artifactKind: string;
      renderMode?: string;
      title: string;
      source: "muse-auto" | "muse-forced" | "muse-edited" | "user-add" | "kronus-tool";
      reason?: string;
      ts: number;
    }
  | {
      kind: "muse_propose";
      voiceKind: "poem" | "thought" | "quip";
      proposed: boolean;
      reason: string;
      alternativesCount?: number;
      /** Full voice line shown in the mood panel (poem title + lines or thought/quip). */
      voiceText?: string;
      poemTitle?: string | null;
      poemLines?: string[] | null;
      turnIndex?: number;
      ts: number;
    }
  | { kind: "muse_thought"; text: string; turnIndex: number; ts: number }
  | { kind: "muse_paint"; uuid: string; renderMode: string; ts: number }
  | { kind: "session_resumed"; fromTurnCount: number; ts: number };

export type ChatLogEntry = CanonicalChatLogEntry | LegacyChatLogEntry;

function isoFromTs(ts: number | undefined): string | null {
  return typeof ts === "number" && Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

export function normalizeChatLogEntry(entry: ChatLogEntry, sequence?: number): CanonicalChatLogEntry {
  if ("eventType" in entry) return { ...entry, sequence: entry.sequence ?? sequence };

  switch (entry.kind) {
    case "user_message":
      return { timestamp: isoFromTs(entry.ts), sequence, actor: "user", eventType: "message", text: entry.text };
    case "assistant_message":
      return { timestamp: isoFromTs(entry.ts), sequence, actor: "assistant", eventType: "message", text: entry.text };
    case "tool_call":
      return { timestamp: isoFromTs(entry.ts), sequence, actor: "assistant", eventType: "tool_call", text: entry.name, tooling: { name: entry.name, argsPreview: entry.argsPreview } };
    case "tool_result":
      return { timestamp: isoFromTs(entry.ts), sequence, actor: "tool", eventType: "tool_result", text: entry.preview || entry.name, tooling: { name: entry.name, ok: entry.ok, resultPreview: entry.preview } };
    case "shelf_add":
      return { timestamp: isoFromTs(entry.ts), sequence, actor: entry.source === "kronus-tool" ? "assistant" : "system", eventType: "artifact", text: entry.title, params: { kind: "shelf_add", uuid: entry.uuid, artifactKind: entry.artifactKind, renderMode: entry.renderMode, source: entry.source, reason: entry.reason } };
    case "muse_propose":
      return {
        timestamp: isoFromTs(entry.ts),
        sequence,
        actor: "assistant",
        eventType: "artifact",
        text: entry.reason,
        params: {
          kind: "muse_propose",
          voiceKind: entry.voiceKind,
          proposed: entry.proposed,
          alternativesCount: entry.alternativesCount,
          voiceText: entry.voiceText,
          poemTitle: entry.poemTitle,
          poemLines: entry.poemLines,
          turnIndex: entry.turnIndex,
        },
      };
    case "muse_thought":
      return {
        timestamp: isoFromTs(entry.ts),
        sequence,
        actor: "assistant",
        eventType: "artifact",
        text: entry.text,
        params: { kind: "muse_thought", text: entry.text, turnIndex: entry.turnIndex },
      };
    case "muse_paint":
      return { timestamp: isoFromTs(entry.ts), sequence, actor: "assistant", eventType: "artifact", text: entry.uuid, params: { kind: "muse_paint", uuid: entry.uuid, renderMode: entry.renderMode } };
    case "session_resumed":
      return { timestamp: isoFromTs(entry.ts), sequence, actor: "system", eventType: "status", text: `session resumed from ${entry.fromTurnCount} turns`, params: { kind: "session_resumed", fromTurnCount: entry.fromTurnCount } };
  }
}

/** Append an entry; pure (returns a new array). */
export function appendEntry(log: ChatLogEntry[], entry: ChatLogEntry): ChatLogEntry[] {
  return [...log, normalizeChatLogEntry(entry, log.length)];
}

/** Format an absolute unix-ms timestamp as `HH:mm:ss` for compact serialization. */
function fmtTs(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Trim a string to a max length with an ellipsis. */
function trim(s: string | undefined, max: number): string {
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Compact serialization for the muse's propose body. Returns the most
 * recent N entries (default 40), in chronological order.
 */
export function serializeForMuse(log: ChatLogEntry[], max = 40): string {
  if (!log.length) return "(empty)";
  const slice = log.slice(-max);
  return slice
    .map((entry, index) => {
      const e = normalizeChatLogEntry(entry, index);
      const t = e.timestamp ? fmtTs(new Date(e.timestamp).getTime()) : "--:--:--";
      if (e.eventType === "tool_call") {
        return `[${t}] tool_call: ${e.tooling?.name || trim(e.text, 60)}${e.tooling?.argsPreview ? ` (${trim(e.tooling.argsPreview, 80)})` : ""}`;
      }
      if (e.eventType === "tool_result") {
        return `[${t}] tool_result: ${e.tooling?.name || "tool"} ${e.tooling?.ok === false ? "err" : "ok"}${e.tooling?.resultPreview ? ` ${trim(e.tooling.resultPreview, 80)}` : ""}`;
      }
      if (e.eventType === "artifact") {
        const kind = typeof e.params?.kind === "string" ? e.params.kind : "artifact";
        if (kind === "muse_visual_choice") {
          const selected = e.params?.selected as { label?: unknown; visualForm?: unknown; prompt?: unknown } | null | undefined;
          const alternatives = Array.isArray(e.params?.alternatives) ? e.params.alternatives : [];
          const selectedLabel =
            selected && typeof selected.label === "string" ? selected.label
            : e.params?.selectedIndex === null ? "skipped"
            : "unknown";
          const visualForm = selected && typeof selected.visualForm === "string" ? `/${selected.visualForm}` : "";
          const prompt = selected && typeof selected.prompt === "string" ? ` ${trim(selected.prompt, 90)}` : "";
          return `[${t}] muse_visual_choice: ${selectedLabel}${visualForm}; alternatives=${alternatives.length}${prompt}`;
        }
        return `[${t}] ${kind}: ${trim(e.text, 120)}`;
      }
      return `[${t}] ${e.actor}/${e.eventType}: ${trim(e.text, 200)}`;
    })
    .join("\n");
}

/**
 * Compact serialization for Kronus's system-prompt block. Same format as
 * the muse view but typically with a shorter max (default 20).
 */
export function serializeForKronus(log: ChatLogEntry[], max = 20): string {
  return serializeForMuse(log, max);
}

/** Shape used by Hourglass to rehydrate the muse thought strip from `chat_log`. */
export interface MuseThoughtRestore {
  id: string;
  text: string;
  turnIndex: number;
  at: number;
  kind?: "poem" | "thought" | "quip";
  poemTitle?: string;
  poemLines?: string[];
}

/**
 * Rebuild muse mood-panel entries from persisted chat_log (legacy + canonical).
 * Caps at 24 items (newest wins chronologically within the log order).
 */
export function extractMuseThoughtsFromChatLog(log: ChatLogEntry[]): MuseThoughtRestore[] {
  const out: MuseThoughtRestore[] = [];
  let seq = 0;

  for (const entry of log) {
    if ("kind" in entry) {
      if (entry.kind === "muse_thought") {
        out.push({
          id: `log-muse-${seq++}`,
          text: entry.text,
          turnIndex: entry.turnIndex,
          at: entry.ts,
        });
      }
      if (entry.kind === "muse_propose") {
        const vt = entry.voiceText?.trim();
        if (vt) {
          out.push({
            id: `log-voice-${seq++}`,
            text: vt,
            turnIndex: entry.turnIndex ?? 0,
            at: entry.ts,
            kind: entry.voiceKind,
            poemTitle: entry.poemTitle ?? undefined,
            poemLines: entry.poemLines ?? undefined,
          });
        }
      }
    }
    if ("eventType" in entry && entry.eventType === "artifact") {
      const p = entry.params as Record<string, unknown> | undefined;
      if (!p) continue;
      const kind = typeof p.kind === "string" ? p.kind : "";
      if (kind === "muse_thought") {
        const text = typeof p.text === "string" ? p.text : entry.text;
        const turnIndex = typeof p.turnIndex === "number" ? p.turnIndex : 0;
        if (text?.trim()) {
          out.push({
            id: `log-can-${seq++}`,
            text,
            turnIndex,
            at: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
          });
        }
      }
      if (kind === "muse_propose") {
        const vt = typeof p.voiceText === "string" ? p.voiceText.trim() : "";
        if (vt) {
          const vk = p.voiceKind as MuseThoughtRestore["kind"] | undefined;
          out.push({
            id: `log-can-v-${seq++}`,
            text: vt,
            turnIndex: typeof p.turnIndex === "number" ? p.turnIndex : 0,
            at: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
            kind: vk,
            poemTitle: typeof p.poemTitle === "string" ? p.poemTitle : undefined,
            poemLines: Array.isArray(p.poemLines) ? (p.poemLines as string[]) : undefined,
          });
        }
      }
    }
  }
  return out.slice(-24);
}
