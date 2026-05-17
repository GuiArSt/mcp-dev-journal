import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDatabase } from "@/lib/db";
import { registerObject, updateObjectSummary } from "@/lib/object-registry";

const MAX_TEXT_CHARS = 80_000;
const MAX_PREVIEW_CHARS = 8_000;
const MAX_SESSIONS_PER_AGENT = 20;
const MAX_EVENTS_PER_SESSION = 300;

export type AiIntegrationKey =
  | "codex"
  | "claude_code"
  | "gemini_cli"
  | "cursor"
  | "coderabbit";

export type CanonicalActor = "user" | "assistant" | "tool" | "system" | "reviewer";
export type CanonicalEventType =
  | "message"
  | "tool_call"
  | "tool_result"
  | "reasoning"
  | "context"
  | "status"
  | "finding"
  | "artifact";

export interface CanonicalLogEvent {
  timestamp: string | null;
  sequence: number;
  actor: CanonicalActor;
  eventType: CanonicalEventType;
  text: string;
  tooling?: {
    name?: string;
    callId?: string;
    ok?: boolean;
    argsPreview?: string;
    resultPreview?: string;
  };
  params?: Record<string, unknown>;
}

export interface AiIntegration {
  key: AiIntegrationKey;
  displayName: string;
  status: "available" | "missing" | "needs_auth" | "error";
  version: string | null;
  authStatus: string | null;
  sourcePaths: string[];
  configSummary: string | null;
  metadata: Record<string, unknown>;
  lastScannedAt: string | null;
  uuid: string | null;
}

export interface AiArtifact {
  id: number;
  uuid: string | null;
  integrationKey: AiIntegrationKey;
  kind: string;
  sourcePath: string;
  title: string;
  summary: string | null;
  content: string | null;
  metadata: Record<string, unknown>;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiLogSession {
  id: number;
  uuid: string | null;
  integrationKey: AiIntegrationKey;
  stableId: string;
  sourcePath: string;
  title: string;
  summary: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  messageCount: number;
  metadata: Record<string, unknown>;
}

export interface AiLogEventRow extends CanonicalLogEvent {
  id: number;
  sessionId: number;
  sourceEventType: string | null;
}

export interface AiProposal {
  id: number;
  uuid: string | null;
  integrationKey: AiIntegrationKey;
  targetKind: string;
  targetPath: string;
  title: string;
  content: string;
  summary: string | null;
  status: "draft" | "accepted" | "superseded";
  sourceArtifactId: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type IntegrationDef = {
  key: AiIntegrationKey;
  displayName: string;
  configPaths: string[];
  skillRoots: string[];
  sessionRoots: string[];
};

const DEFAULT_INTEGRATIONS: IntegrationDef[] = [
  {
    key: "codex",
    displayName: "Codex",
    configPaths: ["~/.codex/config.toml", "AGENTS.md"],
    skillRoots: ["~/.codex/skills"],
    sessionRoots: ["~/.codex/sessions"],
  },
  {
    key: "claude_code",
    displayName: "Claude Code",
    configPaths: ["~/.claude.json", "~/.claude/settings.json"],
    skillRoots: ["~/.claude/skills"],
    sessionRoots: ["~/.claude/projects"],
  },
  {
    key: "gemini_cli",
    displayName: "Gemini CLI",
    configPaths: ["~/.gemini/settings.json", "GEMINI.md", "gemini.md"],
    skillRoots: [],
    sessionRoots: ["~/.gemini/tmp"],
  },
  {
    key: "cursor",
    displayName: "Cursor",
    configPaths: ["~/.cursor/mcp.json"],
    skillRoots: ["~/.cursor/skills-cursor"],
    sessionRoots: ["~/.cursor/projects"],
  },
  {
    key: "coderabbit",
    displayName: "CodeRabbit CLI",
    configPaths: [".coderabbit.yaml", ".coderabbit.yml", "coderabbit.yaml", "coderabbit.yml"],
    skillRoots: [],
    sessionRoots: [],
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function expandPath(value: string): string {
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

/** Optional JSON from `TARTARUS_AGENT_SOURCES` — see docs/agent-memory-bridge.md */
interface AgentSourcesFileV1 {
  version?: number;
  integrations?: Partial<
    Record<
      AiIntegrationKey,
      { sessionRoots?: string[]; skillRoots?: string[]; configPaths?: string[] }
    >
  >;
  workspaces?: Array<{ pathPrefix: string; repository: string }>;
}

function uniqStrings(a: string[]): string[] {
  return [...new Set(a.filter(Boolean))];
}

function mergePaths(base: string[], extra?: string[]): string[] {
  return uniqStrings([...(base || []), ...(extra || [])]);
}

function loadAgentSourcesFile(): AgentSourcesFileV1 | null {
  const raw = process.env.TARTARUS_AGENT_SOURCES?.trim();
  if (!raw) return null;
  const abs = expandPath(raw);
  try {
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
    const parsed = JSON.parse(fs.readFileSync(abs, "utf8")) as AgentSourcesFileV1;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Merged integration roots + workspace map for Journal Repository tagging on sessions. */
export function getScanContext(): {
  integrations: IntegrationDef[];
  workspaces: AgentSourcesFileV1["workspaces"];
} {
  const file = loadAgentSourcesFile();
  if (!file) {
    return { integrations: [...DEFAULT_INTEGRATIONS], workspaces: undefined };
  }
  const hasPathOverrides = file.integrations && Object.keys(file.integrations).length > 0;
  const hasWorkspaces = (file.workspaces?.length ?? 0) > 0;
  if (!hasPathOverrides && !hasWorkspaces) {
    return { integrations: [...DEFAULT_INTEGRATIONS], workspaces: undefined };
  }
  const integrations = DEFAULT_INTEGRATIONS.map((def) => {
    const ov = file.integrations?.[def.key];
    if (!ov) return { ...def };
    return {
      ...def,
      sessionRoots: mergePaths(def.sessionRoots, ov.sessionRoots),
      skillRoots: mergePaths(def.skillRoots, ov.skillRoots),
      configPaths: mergePaths(def.configPaths, ov.configPaths),
    };
  });
  return { integrations, workspaces: file.workspaces };
}

function resolveJournalRepository(
  filePath: string,
  workspaces: AgentSourcesFileV1["workspaces"] | undefined,
): string | undefined {
  if (!workspaces?.length) return undefined;
  const norm = path.normalize(filePath);
  for (const w of workspaces) {
    if (!w?.pathPrefix || !w.repository) continue;
    const prefix = path.normalize(expandPath(w.pathPrefix));
    if (norm.startsWith(prefix)) return w.repository;
  }
  return undefined;
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function clip(value: string, max = MAX_PREVIEW_CHARS): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n[truncated ${value.length - max} chars]`;
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/(authorization)(["'\s:=]+)(Bearer\s+)?([^"'\s,}]+)/gi, "$1$2[REDACTED]")
      .replace(/(api[_-]?key|token|secret|password|authorization|cookie)(["'\s:=]+)([^"'\s,}]+)/gi, "$1$2[REDACTED]")
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [REDACTED]")
      .replace(/cr-[A-Za-z0-9_-]{8,}/g, "cr-[REDACTED]")
      .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-[REDACTED]");
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        /key|token|secret|password|auth|cookie/i.test(key) ? "[REDACTED]" : redactSecrets(item),
      ]),
    );
  }
  return value;
}

function readTextFile(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 3_000_000) return null;
    return String(redactSecrets(fs.readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
}

function textFromMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const obj = part as Record<string, unknown>;
          if (typeof obj.text === "string") return obj.text;
          if (typeof obj.content === "string") return obj.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function ensureTables(): void {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_integrations (
      key TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL,
      version TEXT,
      auth_status TEXT,
      source_paths TEXT DEFAULT '[]',
      config_summary TEXT,
      metadata TEXT DEFAULT '{}',
      last_scanned_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      integration_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      source_path TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT,
      metadata TEXT DEFAULT '{}',
      content_hash TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(integration_key, kind, source_path)
    );

    CREATE TABLE IF NOT EXISTS ai_log_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      integration_key TEXT NOT NULL,
      stable_id TEXT NOT NULL,
      source_path TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      started_at TEXT,
      updated_at TEXT,
      message_count INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(integration_key, stable_id, source_path)
    );

    CREATE TABLE IF NOT EXISTS ai_log_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      sequence INTEGER NOT NULL,
      timestamp TEXT,
      actor TEXT NOT NULL,
      event_type TEXT NOT NULL,
      text TEXT NOT NULL,
      tooling TEXT,
      params TEXT DEFAULT '{}',
      source_event_type TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES ai_log_sessions(id) ON DELETE CASCADE,
      UNIQUE(session_id, sequence)
    );

    CREATE TABLE IF NOT EXISTS ai_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      integration_key TEXT NOT NULL,
      target_kind TEXT NOT NULL,
      target_path TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      summary TEXT,
      status TEXT DEFAULT 'draft',
      source_artifact_id INTEGER,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_artifacts_integration ON ai_artifacts(integration_key)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_sessions_integration ON ai_log_sessions(integration_key)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_events_session ON ai_log_events(session_id, sequence)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_proposals_integration ON ai_proposals(integration_key, status)`);
}

function registerAiObject(type: string, sourceTable: string, sourceId: string, title: string, summary?: string, tags: string[] = []): string {
  const uuid = registerObject({
    type,
    sourceTable,
    sourceId,
    title,
    summary,
    tags,
  });
  if (summary) updateObjectSummary(uuid, summary, tags);
  return uuid;
}

function upsertIntegration(row: Omit<AiIntegration, "uuid">): void {
  ensureTables();
  const db = getDatabase();
  db.prepare(`
    INSERT INTO ai_integrations (key, display_name, status, version, auth_status, source_paths, config_summary, metadata, last_scanned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      display_name = excluded.display_name,
      status = excluded.status,
      version = excluded.version,
      auth_status = excluded.auth_status,
      source_paths = excluded.source_paths,
      config_summary = excluded.config_summary,
      metadata = excluded.metadata,
      last_scanned_at = excluded.last_scanned_at
  `).run(
    row.key,
    row.displayName,
    row.status,
    row.version,
    row.authStatus,
    JSON.stringify(row.sourcePaths),
    row.configSummary,
    JSON.stringify(row.metadata),
    row.lastScannedAt,
  );
  registerAiObject("ai_integration", "ai_integrations", row.key, row.displayName, row.configSummary ?? undefined, [
    "ai-integration",
    row.key,
  ]);
}

function upsertArtifact(input: {
  integrationKey: AiIntegrationKey;
  kind: string;
  sourcePath: string;
  title: string;
  summary: string;
  content: string;
  metadata?: Record<string, unknown>;
}): number {
  ensureTables();
  const db = getDatabase();
  const content = clip(String(redactSecrets(input.content)), MAX_TEXT_CHARS);
  const contentHash = hashText(content);
  db.prepare(`
    INSERT INTO ai_artifacts (integration_key, kind, source_path, title, summary, content, metadata, content_hash, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(integration_key, kind, source_path) DO UPDATE SET
      title = excluded.title,
      summary = excluded.summary,
      content = excluded.content,
      metadata = excluded.metadata,
      content_hash = excluded.content_hash,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    input.integrationKey,
    input.kind,
    input.sourcePath,
    input.title,
    input.summary,
    content,
    JSON.stringify(redactSecrets(input.metadata ?? {})),
    contentHash,
  );
  const row = db
    .prepare("SELECT id FROM ai_artifacts WHERE integration_key = ? AND kind = ? AND source_path = ?")
    .get(input.integrationKey, input.kind, input.sourcePath) as { id: number };
  registerAiObject("ai_artifact", "ai_artifacts", String(row.id), input.title, input.summary, [
    "ai-artifact",
    input.integrationKey,
    input.kind,
  ]);
  return row.id;
}

function upsertSession(input: {
  integrationKey: AiIntegrationKey;
  stableId: string;
  sourcePath: string;
  title: string;
  summary: string;
  startedAt: string | null;
  updatedAt: string | null;
  metadata?: Record<string, unknown>;
  events: CanonicalLogEvent[];
}): number {
  ensureTables();
  const db = getDatabase();
  db.prepare(`
    INSERT INTO ai_log_sessions (integration_key, stable_id, source_path, title, summary, started_at, updated_at, message_count, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(integration_key, stable_id, source_path) DO UPDATE SET
      title = excluded.title,
      summary = excluded.summary,
      started_at = excluded.started_at,
      updated_at = excluded.updated_at,
      message_count = excluded.message_count,
      metadata = excluded.metadata
  `).run(
    input.integrationKey,
    input.stableId,
    input.sourcePath,
    input.title,
    input.summary,
    input.startedAt,
    input.updatedAt,
    input.events.length,
    JSON.stringify(redactSecrets(input.metadata ?? {})),
  );
  const row = db
    .prepare("SELECT id FROM ai_log_sessions WHERE integration_key = ? AND stable_id = ? AND source_path = ?")
    .get(input.integrationKey, input.stableId, input.sourcePath) as { id: number };

  db.prepare("DELETE FROM ai_log_events WHERE session_id = ?").run(row.id);
  const insert = db.prepare(`
    INSERT INTO ai_log_events (session_id, sequence, timestamp, actor, event_type, text, tooling, params, source_event_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const txn = db.transaction((events: CanonicalLogEvent[]) => {
    for (const event of events.slice(0, MAX_EVENTS_PER_SESSION)) {
      insert.run(
        row.id,
        event.sequence,
        event.timestamp,
        event.actor,
        event.eventType,
        clip(String(redactSecrets(event.text)), MAX_TEXT_CHARS),
        event.tooling ? JSON.stringify(redactSecrets(event.tooling)) : null,
        JSON.stringify(redactSecrets(event.params ?? {})),
        typeof event.params?.rawEventType === "string" ? event.params.rawEventType : null,
      );
    }
  });
  txn(input.events);
  registerAiObject("ai_log_session", "ai_log_sessions", String(row.id), input.title, input.summary, [
    "ai-log-session",
    input.integrationKey,
  ]);
  return row.id;
}

function existingFiles(paths: string[]): string[] {
  return paths.map(expandPath).filter((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

function walkFiles(root: string, predicate: (filePath: string) => boolean, max = 100): string[] {
  const found: string[] = [];
  const stack = [root];
  while (stack.length > 0 && found.length < max) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", "cache", "telemetry"].includes(entry.name)) stack.push(full);
      } else if (predicate(full)) {
        found.push(full);
      }
      if (found.length >= max) break;
    }
  }
  return found.sort((a, b) => {
    try {
      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
    } catch {
      return 0;
    }
  });
}

function summarizeFile(kind: string, filePath: string, content: string): string {
  const rel = filePath.startsWith(os.homedir()) ? `~${filePath.slice(os.homedir().length)}` : filePath;
  return `${kind} from ${rel}; ${content.length} chars after redaction.`;
}

function scanArtifactsFor(integration: IntegrationDef): string[] {
  const sourcePaths: string[] = [];
  for (const filePath of existingFiles(integration.configPaths)) {
    const content = readTextFile(filePath);
    if (!content) continue;
    sourcePaths.push(filePath);
    upsertArtifact({
      integrationKey: integration.key,
      kind: "config",
      sourcePath: filePath,
      title: `${integration.displayName} config: ${path.basename(filePath)}`,
      summary: summarizeFile("Config", filePath, content),
      content,
      metadata: { readOnlyExternalSource: true },
    });
  }

  for (const root of existingFiles(integration.skillRoots)) {
    sourcePaths.push(root);
    const skillFiles = walkFiles(root, (p) => path.basename(p) === "SKILL.md", 50);
    for (const filePath of skillFiles) {
      const content = readTextFile(filePath);
      if (!content) continue;
      upsertArtifact({
        integrationKey: integration.key,
        kind: "ai_skill",
        sourcePath: filePath,
        title: `${integration.displayName} skill: ${path.basename(path.dirname(filePath))}`,
        summary: summarizeFile("AI skill", filePath, content),
        content,
        metadata: { skillName: path.basename(path.dirname(filePath)), readOnlyExternalSource: true },
      });
    }
  }

  if (integration.key === "cursor") {
    for (const root of existingFiles(["~/.cursor/projects"])) {
      const rules = walkFiles(root, (p) => p.endsWith("/rules") || p.endsWith(".mdc"), 50);
      for (const filePath of rules) {
        const content = readTextFile(filePath);
        if (!content) continue;
        sourcePaths.push(filePath);
        upsertArtifact({
          integrationKey: "cursor",
          kind: "rule",
          sourcePath: filePath,
          title: `Cursor rule: ${path.basename(path.dirname(filePath))}`,
          summary: summarizeFile("Cursor rule", filePath, content),
          content,
          metadata: { readOnlyExternalSource: true },
        });
      }
    }
  }

  return sourcePaths;
}

export function codexEvents(filePath: string): { events: CanonicalLogEvent[]; meta: Record<string, unknown> } {
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean).slice(0, MAX_EVENTS_PER_SESSION);
  const events: CanonicalLogEvent[] = [];
  const meta: Record<string, unknown> = {};
  lines.forEach((line, index) => {
    let obj: any;
    try { obj = JSON.parse(line); } catch { return; }
    if (obj.type === "session_meta") Object.assign(meta, redactSecrets(obj.payload || {}));
    const payload = obj.payload || {};
    const rawType = payload.type || obj.type;
    let actor: CanonicalActor = "system";
    let eventType: CanonicalEventType = "status";
    let text = "";
    let tooling: CanonicalLogEvent["tooling"] | undefined;
    if (obj.type === "response_item" && payload.type === "message") {
      actor = payload.role === "user" ? "user" : "assistant";
      eventType = "message";
      text = textFromMessageContent(payload.content);
    } else if (obj.type === "event_msg" && payload.type === "user_message") {
      actor = "user";
      eventType = "message";
      text = payload.message || "";
    } else if (obj.type === "event_msg" && payload.type === "agent_message") {
      actor = "assistant";
      eventType = "message";
      text = payload.message || "";
    } else if (payload.type === "function_call") {
      actor = "assistant";
      eventType = "tool_call";
      text = payload.name || "tool call";
      tooling = { name: payload.name, callId: payload.call_id, argsPreview: clip(payload.arguments || "", 1000) };
    } else if (payload.type === "function_call_output") {
      actor = "tool";
      eventType = "tool_result";
      text = payload.output || "";
      tooling = { callId: payload.call_id, resultPreview: clip(payload.output || "", 1000) };
    } else if (payload.type === "agent_reasoning" || payload.type === "reasoning") {
      actor = "assistant";
      eventType = "reasoning";
      text = payload.text || textFromMessageContent(payload.content) || payload.summary?.join?.("\n") || "";
    } else if (obj.type === "turn_context") {
      eventType = "context";
      text = payload.cwd || "turn context";
    } else {
      text = payload.message || payload.text || rawType || obj.type;
    }
    if (!text && !tooling) return;
    events.push({
      timestamp: obj.timestamp || null,
      sequence: index,
      actor,
      eventType,
      text: String(redactSecrets(text)),
      tooling,
      params: { rawEventType: rawType, provider: "codex" },
    });
  });
  return { events, meta };
}

export function claudeEvents(filePath: string): { events: CanonicalLogEvent[]; meta: Record<string, unknown> } {
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean).slice(0, MAX_EVENTS_PER_SESSION);
  const events: CanonicalLogEvent[] = [];
  const meta: Record<string, unknown> = {};
  lines.forEach((line, index) => {
    let obj: any;
    try { obj = JSON.parse(line); } catch { return; }
    if (index === 0) Object.assign(meta, redactSecrets({ cwd: obj.cwd, sessionId: obj.sessionId, gitBranch: obj.gitBranch, agentId: obj.agentId }));
    const content = obj.message?.content;
    let actor: CanonicalActor = obj.type === "assistant" ? "assistant" : obj.type === "user" ? "user" : "system";
    let eventType: CanonicalEventType = "message";
    let text = textFromMessageContent(content);
    let tooling: CanonicalLogEvent["tooling"] | undefined;
    if (Array.isArray(content) && content[0]?.type === "tool_use") {
      eventType = "tool_call";
      text = content.map((c: any) => c.name || c.type).join(", ");
      tooling = {
        name: content[0].name,
        callId: content[0].id,
        argsPreview: clip(JSON.stringify(redactSecrets(content[0].input || {})), 1000),
      };
    } else if (Array.isArray(content) && content[0]?.type === "tool_result") {
      actor = "tool";
      eventType = "tool_result";
      text = textFromMessageContent(content[0].content) || String(content[0].content || "");
      tooling = { callId: content[0].tool_use_id, ok: !content[0].is_error, resultPreview: clip(text, 1000) };
    }
    if (!text && !tooling) return;
    events.push({
      timestamp: obj.timestamp || null,
      sequence: index,
      actor,
      eventType,
      text: String(redactSecrets(text)),
      tooling,
      params: { rawEventType: obj.type, provider: "claude_code", model: obj.message?.model, cwd: obj.cwd, gitBranch: obj.gitBranch },
    });
  });
  return { events, meta };
}

export function geminiEvents(filePath: string): { events: CanonicalLogEvent[]; meta: Record<string, unknown> } {
  const obj = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const messages = Array.isArray(obj.messages) ? obj.messages : [];
  const events = messages.slice(0, MAX_EVENTS_PER_SESSION).map((message: any, index: number): CanonicalLogEvent => ({
    timestamp: message.timestamp || null,
    sequence: index,
    actor: message.type === "assistant" ? "assistant" : message.type === "user" ? "user" : "system",
    eventType: message.type === "error" ? "status" : "message",
    text: String(redactSecrets(message.content || "")),
    params: { rawEventType: message.type, provider: "gemini_cli" },
  }));
  return {
    events,
    meta: redactSecrets({ sessionId: obj.sessionId, projectHash: obj.projectHash }) as Record<string, unknown>,
  };
}

export function cursorEvents(filePath: string): { events: CanonicalLogEvent[]; meta: Record<string, unknown> } {
  const stat = fs.statSync(filePath);
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean).slice(0, MAX_EVENTS_PER_SESSION);
  const events: CanonicalLogEvent[] = [];
  lines.forEach((line, index) => {
    let obj: any;
    try { obj = JSON.parse(line); } catch { return; }
    const content = obj.message?.content;
    const text = textFromMessageContent(content);
    if (!text) return;
    events.push({
      timestamp: obj.timestamp || null,
      sequence: index,
      actor: obj.role === "assistant" ? "assistant" : obj.role === "user" ? "user" : "system",
      eventType: "message",
      text: String(redactSecrets(text)),
      params: { rawEventType: obj.role || "message", provider: "cursor" },
    });
  });
  return { events, meta: { fileMtime: new Date(stat.mtimeMs).toISOString() } };
}

function scanSessionsFor(
  integration: IntegrationDef,
  workspaces: AgentSourcesFileV1["workspaces"],
): number {
  let count = 0;
  for (const root of existingFiles(integration.sessionRoots)) {
    let files: string[] = [];
    if (integration.key === "codex") {
      files = walkFiles(root, (p) => /rollout-.*\.jsonl$/.test(path.basename(p)), MAX_SESSIONS_PER_AGENT);
    } else if (integration.key === "claude_code") {
      files = walkFiles(root, (p) => p.endsWith(".jsonl"), MAX_SESSIONS_PER_AGENT);
    } else if (integration.key === "gemini_cli") {
      files = walkFiles(root, (p) => /\/chats\/session-.*\.json$/.test(p), MAX_SESSIONS_PER_AGENT);
    } else if (integration.key === "cursor") {
      files = walkFiles(root, (p) => p.includes("/agent-transcripts/") && p.endsWith(".jsonl"), MAX_SESSIONS_PER_AGENT);
    }
    for (const filePath of files) {
      try {
        const parser =
          integration.key === "codex" ? codexEvents :
          integration.key === "claude_code" ? claudeEvents :
          integration.key === "gemini_cli" ? geminiEvents :
          integration.key === "cursor" ? cursorEvents :
          null;
        if (!parser) continue;
        const { events, meta } = parser(filePath);
        if (events.length === 0) continue;
        const stableId = String((meta as any).id || (meta as any).sessionId || hashText(filePath).slice(0, 16));
        const stat = fs.statSync(filePath);
        const firstText = events.find((e) => e.eventType === "message")?.text || path.basename(filePath);
        const journalRepository = resolveJournalRepository(filePath, workspaces);
        const sessionMeta =
          journalRepository !== undefined
            ? { ...(meta as Record<string, unknown>), journalRepository }
            : (meta as Record<string, unknown>);
        upsertSession({
          integrationKey: integration.key,
          stableId,
          sourcePath: filePath,
          title: `${integration.displayName}: ${clip(firstText.replace(/\s+/g, " "), 80)}`,
          summary: `${events.length} normalized log event(s) from ${filePath.startsWith(os.homedir()) ? `~${filePath.slice(os.homedir().length)}` : filePath}.`,
          startedAt: events[0]?.timestamp || null,
          updatedAt: events.at(-1)?.timestamp || new Date(stat.mtimeMs).toISOString(),
          metadata: sessionMeta,
          events,
        });
        count += 1;
      } catch {
        // Keep scan resilient; malformed historic logs should not block the Library index.
      }
    }
  }
  return count;
}

function coderabbitStatus(): { version: string | null; authStatus: string | null; status: AiIntegration["status"]; metadata: Record<string, unknown> } {
  let version: string | null = null;
  let authStatus: string | null = null;
  let status: AiIntegration["status"] = "missing";
  const metadata: Record<string, unknown> = {};
  try {
    version = execFileSync("coderabbit", ["--version"], { encoding: "utf8", timeout: 5000 }).trim();
    status = "available";
  } catch {
    return { version, authStatus: "cli_missing", status, metadata };
  }
  try {
    const raw = execFileSync("coderabbit", ["auth", "status", "--agent"], { encoding: "utf8", timeout: 10_000 }).trim();
    const parsed = safeJsonParse<Record<string, unknown>>(raw, {});
    Object.assign(metadata, redactSecrets(parsed));
    const authenticated = parsed.authenticated === true || parsed.status === "authenticated";
    authStatus = authenticated ? "authenticated" : "not_authenticated";
    status = authenticated ? "available" : "needs_auth";
  } catch (error) {
    authStatus = "unknown";
    metadata.authStatusError = error instanceof Error ? error.message : String(error);
  }
  return { version, authStatus, status, metadata };
}

export function scanAiIntegrations(): { scannedAt: string; integrations: AiIntegration[]; sessionsIndexed: number } {
  ensureTables();
  const scannedAt = nowIso();
  let sessionsIndexed = 0;
  const { integrations, workspaces } = getScanContext();
  for (const integration of integrations) {
    const sourcePaths = scanArtifactsFor(integration);
    const sessions = scanSessionsFor(integration, workspaces);
    sessionsIndexed += sessions;

    let version: string | null = null;
    let authStatus: string | null = null;
    let status: AiIntegration["status"] = sourcePaths.length > 0 || sessions > 0 ? "available" : "missing";
    let metadata: Record<string, unknown> = { sessionsIndexed: sessions };

    if (integration.key === "coderabbit") {
      const cr = coderabbitStatus();
      version = cr.version;
      authStatus = cr.authStatus;
      status = cr.status;
      metadata = { ...metadata, ...cr.metadata };
    }

    upsertIntegration({
      key: integration.key,
      displayName: integration.displayName,
      status,
      version,
      authStatus,
      sourcePaths,
      configSummary: `${integration.displayName}: ${sourcePaths.length} source path(s), ${sessions} session(s) indexed.`,
      metadata,
      lastScannedAt: scannedAt,
    });
  }
  return { scannedAt, integrations: listAiIntegrations(), sessionsIndexed };
}

function mapIntegration(row: any): AiIntegration {
  return {
    key: row.key,
    displayName: row.display_name,
    status: row.status,
    version: row.version,
    authStatus: row.auth_status,
    sourcePaths: safeJsonParse(row.source_paths, []),
    configSummary: row.config_summary,
    metadata: safeJsonParse(row.metadata, {}),
    lastScannedAt: row.last_scanned_at,
    uuid: row.uuid ?? null,
  };
}

export function listAiIntegrations(): AiIntegration[] {
  ensureTables();
  const db = getDatabase();
  return db.prepare(`
    SELECT i.*, o.uuid
    FROM ai_integrations i
    LEFT JOIN tartarus_objects o ON o.source_table = 'ai_integrations' AND o.source_id = i.key
    ORDER BY i.display_name
  `).all().map(mapIntegration);
}

export function getAiIntegration(key: string): AiIntegration | null {
  ensureTables();
  const db = getDatabase();
  const row = db.prepare(`
    SELECT i.*, o.uuid
    FROM ai_integrations i
    LEFT JOIN tartarus_objects o ON o.source_table = 'ai_integrations' AND o.source_id = i.key
    WHERE i.key = ?
  `).get(key);
  return row ? mapIntegration(row) : null;
}

function mapArtifact(row: any): AiArtifact {
  return {
    id: row.id,
    uuid: row.uuid ?? null,
    integrationKey: row.integration_key,
    kind: row.kind,
    sourcePath: row.source_path,
    title: row.title,
    summary: row.summary,
    content: row.content,
    metadata: safeJsonParse(row.metadata, {}),
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listAiArtifacts(options: { integrationKey?: string; kind?: string; limit?: number; offset?: number } = {}): AiArtifact[] {
  ensureTables();
  const db = getDatabase();
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.integrationKey) { where.push("a.integration_key = ?"); params.push(options.integrationKey); }
  if (options.kind) { where.push("a.kind = ?"); params.push(options.kind); }
  params.push(Math.min(options.limit ?? 50, 200), options.offset ?? 0);
  return db.prepare(`
    SELECT a.*, o.uuid
    FROM ai_artifacts a
    LEFT JOIN tartarus_objects o ON o.source_table = 'ai_artifacts' AND o.source_id = CAST(a.id AS TEXT)
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY a.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params).map(mapArtifact);
}

export function getAiArtifact(id: number): AiArtifact | null {
  ensureTables();
  const db = getDatabase();
  const row = db.prepare(`
    SELECT a.*, o.uuid
    FROM ai_artifacts a
    LEFT JOIN tartarus_objects o ON o.source_table = 'ai_artifacts' AND o.source_id = CAST(a.id AS TEXT)
    WHERE a.id = ?
  `).get(id);
  return row ? mapArtifact(row) : null;
}

function mapSession(row: any): AiLogSession {
  return {
    id: row.id,
    uuid: row.uuid ?? null,
    integrationKey: row.integration_key,
    stableId: row.stable_id,
    sourcePath: row.source_path,
    title: row.title,
    summary: row.summary,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count ?? 0,
    metadata: safeJsonParse(row.metadata, {}),
  };
}

export function listAiLogSessions(options: { integrationKey?: string; limit?: number; offset?: number } = {}): AiLogSession[] {
  ensureTables();
  const db = getDatabase();
  const params: unknown[] = [];
  const where = options.integrationKey ? "WHERE s.integration_key = ?" : "";
  if (options.integrationKey) params.push(options.integrationKey);
  params.push(Math.min(options.limit ?? 50, 200), options.offset ?? 0);
  return db.prepare(`
    SELECT s.*, o.uuid
    FROM ai_log_sessions s
    LEFT JOIN tartarus_objects o ON o.source_table = 'ai_log_sessions' AND o.source_id = CAST(s.id AS TEXT)
    ${where}
    ORDER BY COALESCE(s.updated_at, s.created_at) DESC
    LIMIT ? OFFSET ?
  `).all(...params).map(mapSession);
}

export function getAiLogSession(id: number): (AiLogSession & { events: AiLogEventRow[] }) | null {
  ensureTables();
  const db = getDatabase();
  const session = db.prepare(`
    SELECT s.*, o.uuid
    FROM ai_log_sessions s
    LEFT JOIN tartarus_objects o ON o.source_table = 'ai_log_sessions' AND o.source_id = CAST(s.id AS TEXT)
    WHERE s.id = ?
  `).get(id);
  if (!session) return null;
  const events = db.prepare("SELECT * FROM ai_log_events WHERE session_id = ? ORDER BY sequence").all(id).map((row: any) => ({
    id: row.id,
    sessionId: row.session_id,
    timestamp: row.timestamp,
    sequence: row.sequence,
    actor: row.actor,
    eventType: row.event_type,
    text: row.text,
    tooling: safeJsonParse(row.tooling, undefined),
    params: safeJsonParse(row.params, {}),
    sourceEventType: row.source_event_type,
  }));
  return { ...mapSession(session), events };
}

function mapProposal(row: any): AiProposal {
  return {
    id: row.id,
    uuid: row.uuid ?? null,
    integrationKey: row.integration_key,
    targetKind: row.target_kind,
    targetPath: row.target_path,
    title: row.title,
    content: row.content,
    summary: row.summary,
    status: row.status,
    sourceArtifactId: row.source_artifact_id,
    metadata: safeJsonParse(row.metadata, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createAiProposal(input: {
  integrationKey: AiIntegrationKey;
  targetKind: string;
  targetPath: string;
  title: string;
  content: string;
  summary?: string;
  sourceArtifactId?: number | null;
  metadata?: Record<string, unknown>;
}): AiProposal {
  ensureTables();
  const db = getDatabase();
  const metadata = { ...(input.metadata ?? {}), tartarus_proposal: true, readOnlyExternalSource: false };
  const result = db.prepare(`
    INSERT INTO ai_proposals (integration_key, target_kind, target_path, title, content, summary, source_artifact_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.integrationKey,
    input.targetKind,
    input.targetPath,
    input.title,
    input.content,
    input.summary ?? null,
    input.sourceArtifactId ?? null,
    JSON.stringify(redactSecrets(metadata)),
  );
  const id = Number(result.lastInsertRowid);
  registerAiObject("ai_proposal", "ai_proposals", String(id), input.title, input.summary, [
    "ai-proposal",
    input.integrationKey,
    input.targetKind,
  ]);
  const proposal = getAiProposal(id);
  if (!proposal) throw new Error("Failed to create AI proposal");
  return proposal;
}

export function listAiProposals(options: { integrationKey?: string; status?: string; limit?: number; offset?: number } = {}): AiProposal[] {
  ensureTables();
  const db = getDatabase();
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.integrationKey) { where.push("p.integration_key = ?"); params.push(options.integrationKey); }
  if (options.status) { where.push("p.status = ?"); params.push(options.status); }
  params.push(Math.min(options.limit ?? 50, 200), options.offset ?? 0);
  return db.prepare(`
    SELECT p.*, o.uuid
    FROM ai_proposals p
    LEFT JOIN tartarus_objects o ON o.source_table = 'ai_proposals' AND o.source_id = CAST(p.id AS TEXT)
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY p.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params).map(mapProposal);
}

export function getAiProposal(id: number): AiProposal | null {
  ensureTables();
  const db = getDatabase();
  const row = db.prepare(`
    SELECT p.*, o.uuid
    FROM ai_proposals p
    LEFT JOIN tartarus_objects o ON o.source_table = 'ai_proposals' AND o.source_id = CAST(p.id AS TEXT)
    WHERE p.id = ?
  `).get(id);
  return row ? mapProposal(row) : null;
}
