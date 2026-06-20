import { markKronusContextMetricsStale } from "@/lib/kronus-context-metrics-store";

/** Soul-context metrics cache should recompute on next read. */
export function markContextMetricsStale(): void {
  try {
    markKronusContextMetricsStale();
  } catch {
    /* non-critical */
  }
}
