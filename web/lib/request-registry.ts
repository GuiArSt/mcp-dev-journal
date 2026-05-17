/**
 * In-process registry of active AI requests.
 *
 * Stores one AbortController per in-flight request so the monitor UI can list
 * and cancel them. Module-level singleton — works for single-instance dev/prod.
 */

export interface ActiveRequest {
  id: string;
  endpoint: string; // e.g. "muse", "summarize"
  mode?: string; // e.g. "auto", "force", or summarize type
  model?: string;
  startedAt: Date;
  metadata: Record<string, unknown>;
}

interface RegistryEntry extends ActiveRequest {
  controller: AbortController;
}

const registry = new Map<string, RegistryEntry>();

// Auto-clean stale entries older than 10 min (guards against crash leaks)
const STALE_MS = 10 * 60 * 1000;

function purgeStale() {
  const cutoff = Date.now() - STALE_MS;
  for (const [id, entry] of registry) {
    if (entry.startedAt.getTime() < cutoff) registry.delete(id);
  }
}

export function registerRequest(opts: Omit<ActiveRequest, "id"> & { controller: AbortController }): string {
  purgeStale();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  registry.set(id, { id, ...opts });
  return id;
}

export function deregisterRequest(id: string): void {
  registry.delete(id);
}

export function cancelRequest(id: string): boolean {
  const entry = registry.get(id);
  if (!entry) return false;
  entry.controller.abort();
  registry.delete(id);
  return true;
}

export function cancelAll(): string[] {
  const ids: string[] = [];
  for (const [id, entry] of registry) {
    entry.controller.abort();
    ids.push(id);
  }
  registry.clear();
  return ids;
}

export function getActiveRequests(): ActiveRequest[] {
  purgeStale();
  return Array.from(registry.values()).map(({ controller: _c, ...rest }) => rest);
}
