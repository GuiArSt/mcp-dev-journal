/**
 * Dev-only client error telemetry. Captures uncaught exceptions and
 * unhandled promise rejections, beacons them to the server, and keeps a
 * localStorage buffer so the next session (or a coding agent) can read what
 * happened after a tab freeze/crash.
 *
 * Pairs with dev-memlog.ts (heap) — each error report includes the last
 * memlog ring tail when available.
 *
 * No-op in production builds.
 */

import type { MemSample } from "./dev-memlog";

const STORAGE_KEY = "dev-client-errors";
const SESSION_KEY = "dev-memlog-session"; // share session id with memlog
const BEACON_ENDPOINT = "/api/observability/client-errors";
const STORAGE_TRIM = 20;
const MEM_TAIL = 40;
const BEACON_THROTTLE_MS = 2_000;

export type ClientErrorKind = "error" | "unhandledrejection";

export interface ClientErrorReport {
  sessionId: string;
  kind: ClientErrorKind;
  message: string;
  stack?: string | null;
  source?: string | null;
  lineno?: number | null;
  colno?: number | null;
  url?: string | null;
  userAgent?: string | null;
  conversationId?: number | null;
  context?: Record<string, unknown>;
  memTail?: MemSample[];
}

type CtxProvider = () => Record<string, unknown>;

let started = false;
let getCtx: CtxProvider | null = null;
let lastBeaconAt = 0;
let sessionId: string | null = null;

function getSessionId(): string {
  if (sessionId) return sessionId;
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) {
      sessionId = existing;
      return existing;
    }
    const fresh = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, fresh);
    sessionId = fresh;
    return fresh;
  } catch {
    sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return sessionId;
  }
}

function pickConversationId(ctx: Record<string, unknown> | undefined): number | null {
  const v = ctx?.conversationId;
  if (typeof v === "number") return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return null;
}

function memTail(): MemSample[] {
  if (typeof window === "undefined") return [];
  const ring = window.__memlog ?? [];
  return ring.slice(-MEM_TAIL);
}

function persistLocal(report: ClientErrorReport) {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const prev = raw ? (JSON.parse(raw) as { savedAt?: number; errors?: ClientErrorReport[] }) : {};
    const errors = Array.isArray(prev.errors) ? prev.errors : [];
    errors.push(report);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ savedAt: Date.now(), errors: errors.slice(-STORAGE_TRIM) }),
    );
  } catch { /* quota */ }
}

function beacon(report: ClientErrorReport, force = false) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (!force && now - lastBeaconAt < BEACON_THROTTLE_MS) return;
  lastBeaconAt = now;

  const payload = { ...report, memTail: report.memTail ?? memTail() };

  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(BEACON_ENDPOINT, blob)) return;
    }
    void fetch(BEACON_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch { /* swallow */ }
}

function report(kind: ClientErrorKind, message: string, extra: Partial<ClientErrorReport> = {}) {
  if (process.env.NODE_ENV === "production") return;
  const ctx = (() => {
    try {
      return getCtx?.() ?? {};
    } catch {
      return {};
    }
  })();

  const report: ClientErrorReport = {
    sessionId: getSessionId(),
    kind,
    message: message.slice(0, 4000),
    url: typeof location !== "undefined" ? location.href : null,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    conversationId: pickConversationId(ctx),
    context: ctx,
    memTail: memTail(),
    ...extra,
  };

  console.error("[client-error]", kind, report.message, report);
  persistLocal(report);
  beacon(report, true);
}

/** Register optional live context (conversationId, route, etc.). */
export function setClientErrorContext(getCtxFn: CtxProvider) {
  getCtx = getCtxFn;
}

/** Start global error listeners. Safe to call once per app lifetime. */
export function startClientErrorLog(opts: { getCtx?: CtxProvider } = {}) {
  if (process.env.NODE_ENV === "production") return;
  if (typeof window === "undefined") return;
  if (opts.getCtx) getCtx = opts.getCtx;
  if (started) return;
  started = true;

  window.addEventListener("error", (event) => {
    const err = event.error;
    report("error", event.message || String(err ?? "unknown error"), {
      stack: err instanceof Error ? err.stack : undefined,
      source: event.filename ?? null,
      lineno: event.lineno ?? null,
      colno: event.colno ?? null,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "unhandled rejection";
    report("unhandledrejection", message, {
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  // Surface errors from the previous session after a crash/reload.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { savedAt?: number; errors?: ClientErrorReport[] };
      console.error("[client-error] previous-session buffer", parsed);
    }
  } catch { /* ignore */ }

  window.__dumpClientErrors = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as { errors?: ClientErrorReport[] }).errors ?? [] : [];
    } catch {
      return [];
    }
  };
}

export function clearClientErrorBuffer() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

declare global {
  interface Window {
    __dumpClientErrors?: () => ClientErrorReport[];
  }
}
