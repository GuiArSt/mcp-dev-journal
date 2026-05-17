import type { ArtifactRef } from "./artifacts/types";
import type { MoodTab } from "./types";

/** Which shelf tab owns this ref (for tab switch when picking from full history). */
export function moodTabForRef(r: ArtifactRef): MoodTab {
  if (r.kind === "muse-image") {
    return r.renderMode === "infographic" ? "infographic" : "mood";
  }
  return "repo";
}

/** Padded beat index (chat turn when the artifact was created). */
export function formatBeatPadded(turn: number | null | undefined): string {
  if (turn == null || Number.isNaN(turn)) return "—";
  return String(turn).padStart(2, "0");
}

/** Tooltip copy — internal log uses chat turn count at creation time. */
export function beatTurnTooltip(turn: number | null | undefined): string {
  if (turn == null) return "Beat index not recorded.";
  return `Beat ${formatBeatPadded(turn)} — logged when the chat stream was on this turn (not shelf order).`;
}

export function formatShelfSlot(oneBasedIndex: number, total: number): string {
  if (total <= 0) return "";
  return `${oneBasedIndex}/${total}`;
}
