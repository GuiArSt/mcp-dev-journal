/**
 * Turn — a completed exchange (user + assistant) reconstructed from the
 * useChat `messages` array. Turns no longer own artifacts — artifacts
 * live on the conversation's shelf.
 */
export interface Turn {
  id: string;
  index: number;
  userMessageId: string;
  assistantMessageId: string;
  startedAt: number;
  userText: string;
  assistantText: string;
}

export type MoodTab = "mood" | "infographic" | "repo";
export type ComposerMode = "floating" | "docked";
export type RailView = "chat" | "reader" | "repo";

// Re-export artifact types for convenience.
export type { Artifact, ArtifactRef, ArtifactBody, ArtifactKind, ArtifactSource } from "./artifacts/types";
