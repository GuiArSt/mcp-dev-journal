/**
 * Dev-only memory telemetry. Samples JS heap + DOM node count on a timer
 * and logs structured `[mem]` lines to the console. Tags each line with
 * arbitrary context (turns, streaming state, message bytes, etc.) so a
 * post-mortem session can pinpoint which surface was growing.
 *
 * Three durability layers:
 *   1. `console.info` / `console.warn` — visible while the tab is alive
 *   2. `window.__memlog` ring buffer (last N samples) — copyable in console
 *   3. `localStorage["dev-memlog"]` — last samples on threshold breach, so
 *      they survive a crash and can be retrieved on the next session
 *
 * No-op in production builds.
 */

const RING_SIZE = 240;
const STORAGE_KEY = "dev-memlog";
const SESSION_KEY = "dev-memlog-session";
const STORAGE_TRIM = 60; // keep last 60 samples in localStorage on breach
const BEACON_TRIM = 80;  // tail length we POST on breach
const BEACON_ENDPOINT = "/api/observability/memlog";
const BEACON_THROTTLE_MS = 5_000; // at most one POST per 5s during a warn loop
const WARN_HEAP_MB = 500;
const ALERT_HEAP_MB = 1000;
const WARN_DELTA_MB = 100;

export interface MemSample {
  t: number;            // ms epoch
  heap?: number;        // MB (used JS heap)
  heapTotal?: number;   // MB (allocated JS heap)
  heapLimit?: number;   // MB (browser heap ceiling)
  nodes?: number;       // document.getElementsByTagName("*").length
  ctx?: Record<string, unknown>;
}

// Chromium-only API. Typed loosely since it isn't in stdlib lib.dom.
interface PerfWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

declare global {
  interface Window {
    __memlog?: MemSample[];
    __dumpMemlog?: () => MemSample[];
  }
}

type CtxProvider = () => Record<string, unknown>;

let timer: number | null = null;
let intervalMs = 3000;
let getCtx: CtxProvider | null = null;
let lastHeap = 0;
let lastBeaconAt = 0;
let sessionId: string | null = null;

function getSessionId(): string {
  if (sessionId) return sessionId;
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) { sessionId = existing; return existing; }
    const fresh = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, fresh);
    sessionId = fresh;
    return fresh;
  } catch {
    // sessionStorage disabled — fall back to an in-memory id
    sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return sessionId;
  }
}

function peakOf<T>(samples: MemSample[], key: "heap" | "nodes"): number | undefined {
  let max: number | undefined;
  for (const s of samples) {
    const v = s[key];
    if (typeof v === "number" && (max === undefined || v > max)) max = v;
  }
  return max;
}

/** POST the recent ring tail to the server. Uses sendBeacon when available
 *  (survives unload) and falls back to fetch with keepalive. Throttled by
 *  BEACON_THROTTLE_MS unless `force` is set (used by beforeunload). */
function beacon(trigger: "warn" | "alert" | "unload" | "manual", reason: string, force = false) {
  if (typeof window === "undefined") return;
  const ring = window.__memlog ?? [];
  if (ring.length === 0) return;
  const now = Date.now();
  if (!force && now - lastBeaconAt < BEACON_THROTTLE_MS) return;
  lastBeaconAt = now;

  const tail = ring.slice(-BEACON_TRIM);
  const payload = {
    sessionId: getSessionId(),
    trigger,
    reason,
    url: typeof location !== "undefined" ? location.href : null,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    sampleCount: tail.length,
    peakHeapMb: peakOf(tail, "heap"),
    peakNodes: peakOf(tail, "nodes"),
    samples: tail,
  };

  try {
    const body = JSON.stringify(payload);
    // sendBeacon is the only transport guaranteed to flush during unload.
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(BEACON_ENDPOINT, blob);
      if (ok) return;
    }
    // Fallback for environments without sendBeacon. `keepalive` keeps the
    // request alive across navigation/unload (capped at ~64KB by the browser).
    void fetch(BEACON_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => { /* swallow — telemetry must never crash the app */ });
  } catch { /* ignore */ }
}

function snapshot(): MemSample {
  const perf = (typeof performance !== "undefined" ? performance : undefined) as PerfWithMemory | undefined;
  const m = perf?.memory;
  const sample: MemSample = { t: Date.now() };
  if (m) {
    sample.heap = Math.round(m.usedJSHeapSize / 1_048_576);
    sample.heapTotal = Math.round(m.totalJSHeapSize / 1_048_576);
    sample.heapLimit = Math.round(m.jsHeapSizeLimit / 1_048_576);
  }
  if (typeof document !== "undefined") {
    sample.nodes = document.getElementsByTagName("*").length;
  }
  if (getCtx) {
    try { sample.ctx = getCtx(); } catch { /* ignore */ }
  }
  return sample;
}

function pushRing(sample: MemSample) {
  if (typeof window === "undefined") return;
  if (!window.__memlog) window.__memlog = [];
  window.__memlog.push(sample);
  if (window.__memlog.length > RING_SIZE) window.__memlog.shift();
}

function persistOnBreach(sample: MemSample, ring: MemSample[]) {
  if (typeof localStorage === "undefined") return;
  try {
    const tail = ring.slice(-STORAGE_TRIM);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      reason: sample.heap && sample.heap >= ALERT_HEAP_MB ? "alert" : "warn",
      savedAt: Date.now(),
      samples: tail,
    }));
  } catch { /* quota / disabled storage — ignore */ }
}

function tick() {
  const s = snapshot();
  pushRing(s);

  const heap = s.heap ?? 0;
  const delta = heap - lastHeap;
  lastHeap = heap;

  const tag = "[mem]";
  const compact = {
    heap_mb: s.heap,
    total_mb: s.heapTotal,
    limit_mb: s.heapLimit,
    nodes: s.nodes,
    delta_mb: heap > 0 ? delta : undefined,
    ctx: s.ctx,
  };

  const shouldAlert = heap >= ALERT_HEAP_MB;
  const shouldWarn = heap >= WARN_HEAP_MB || Math.abs(delta) >= WARN_DELTA_MB;

  if (shouldAlert) {
    console.error(tag, "HEAP CRITICAL", compact);
    persistOnBreach(s, window.__memlog ?? []);
    beacon("alert", `heap=${heap}MB ≥ ${ALERT_HEAP_MB}MB`);
  } else if (shouldWarn) {
    console.warn(tag, compact);
    persistOnBreach(s, window.__memlog ?? []);
    beacon(
      "warn",
      heap >= WARN_HEAP_MB
        ? `heap=${heap}MB ≥ ${WARN_HEAP_MB}MB`
        : `delta=${delta}MB ≥ ${WARN_DELTA_MB}MB`,
    );
  } else {
    console.info(tag, compact);
  }
}

/** Start sampling. Call once per app lifetime. Safe to call multiple
 *  times — later calls just update the interval / context provider. */
export function startMemLog(opts: { intervalMs?: number; getCtx?: CtxProvider } = {}) {
  if (process.env.NODE_ENV === "production") return;
  if (typeof window === "undefined") return;

  if (opts.intervalMs && opts.intervalMs !== intervalMs) {
    intervalMs = Math.max(500, opts.intervalMs);
    if (timer != null) { window.clearInterval(timer); timer = null; }
  }
  if (opts.getCtx) getCtx = opts.getCtx;

  if (timer != null) return;

  window.__dumpMemlog = () => window.__memlog ?? [];

  // First tick is immediate so we get a baseline before any streaming.
  tick();
  timer = window.setInterval(tick, intervalMs);

  // On a previously-saved breach buffer: surface it loudly so the next
  // session sees what happened before the crash.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { reason?: string; savedAt?: number; samples?: MemSample[] };
      console.error("[mem] previous-session breach buffer", parsed);
      // Keep it around — the user / agent may want to copy it.
    }
  } catch { /* ignore */ }

  // Capture the final ring state when the tab is unloading. This is the
  // path that survives a freeze-then-close: sendBeacon flushes during
  // unload where normal fetch() would be cancelled.
  const unloadFlush = () => {
    const heap = lastHeap;
    const breached = heap >= WARN_HEAP_MB;
    // Only beacon on unload if the tab was already in a warn/alert state —
    // otherwise every navigation would write a row.
    if (breached) beacon("unload", `unload at heap=${heap}MB`, true);
  };
  // pagehide is more reliable than beforeunload on mobile / bfcache paths.
  window.addEventListener("pagehide", unloadFlush);
  window.addEventListener("beforeunload", unloadFlush);
}

/** Manually push a sample with a label. Useful around big operations
 *  (e.g. before/after a stream, after an image render). */
export function markMem(label: string, extra?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  if (typeof window === "undefined") return;
  const s = snapshot();
  s.ctx = { ...(s.ctx ?? {}), label, ...(extra ?? {}) };
  pushRing(s);
  console.info("[mem]", "mark", { label, heap_mb: s.heap, nodes: s.nodes, ...extra });
}

/** Clear the persisted breach buffer (after you've inspected it). */
export function clearMemLogBreach() {
  if (typeof localStorage === "undefined") return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/** Force-flush the current ring buffer to the server. Useful when you
 *  notice a spike yourself and want it captured server-side without
 *  waiting for a threshold breach. Exposed on window as
 *  `window.__flushMemlog(reason?)` for console use. */
export function flushMemLog(reason = "manual flush") {
  beacon("manual", reason, true);
}

declare global {
  interface Window {
    __flushMemlog?: (reason?: string) => void;
  }
}

if (typeof window !== "undefined") {
  window.__flushMemlog = flushMemLog;
}
