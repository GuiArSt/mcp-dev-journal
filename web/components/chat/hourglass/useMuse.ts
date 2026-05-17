"use client";

import { useCallback } from "react";
import type { ArtifactRef } from "./artifacts/types";

export type PaintSize = "512" | "1K" | "2K" | "4K";
export type RenderMode = "mood" | "infographic";
export type PaintQuality = "low" | "medium" | "high";
export type MuseProvider = "openai" | "google";

/** What the muse always says when she ticks — never empty. */
export interface MuseVoice {
  kind: "poem" | "thought" | "quip";
  poemTitle?: string | null;
  poemLines?: string[] | null;
  text?: string | null;
}

/** A single alternative in a multi-alternative proposal. */
export interface MuseProposalAlternative {
  label: string;
  visualForm?: string | null;
  renderMode: RenderMode;
  prompt: string;
  rationale: string;
}

/** Image proposal — separate from voice, may be null. EITHER a single
 *  proposal (single-fields populated) OR a list of alternatives. */
export interface MuseProposal {
  action: "new" | "refine";
  targetUuid?: string | null;
  renderMode: RenderMode | null;
  prompt: string | null;
  alternatives: MuseProposalAlternative[] | null;
}

/** Compact ref of an existing artifact, for the muse's shelf-awareness. */
export interface MuseShelfRef {
  uuid: string;
  kind: string;
  renderMode?: string;
  title: string;
  prompt?: string;
  reason?: string;
  displayed?: boolean;
}

/** Response from PROPOSE mode. */
export interface MuseProposeResponse {
  voice: MuseVoice;
  shouldPropose: boolean;
  proposal: MuseProposal | null;
  suggestedTitle?: string | null;
  titleReason?: string | null;
  reason: string;
  provider?: MuseProvider;
  error?: string;
}

/** Response from GENERATE mode (the image generator ran). */
export interface MuseGenerateResponse {
  artifactRef?: ArtifactRef | null;
  reason?: string | null;
  provider?: MuseProvider;
  error?: string;
}

// ─── Request shapes ─────────────────────────────────────────────────────

export interface MuseProposeRequest {
  mode: "propose";
  turns: Array<{ user: string; assistant: string }>;
  shelf?: MuseShelfRef[];
  displayedImageDataUrl?: string;
  /** Append-only log the muse reads (timestamps, session_resumed, etc). */
  chatLog?: unknown[];
  /** Force the muse to propose. Used by the visual button + Kronus tools. */
  mandatory?: boolean;
  /** When 2-4, return that many distinct variants instead of a single proposal. */
  alternatives?: number;
  /** Telemetry / log attribution. */
  source?: "auto-tick" | "user" | "kronus";
  activeSkills?: string[];
  repositoryIndex?: string;
  currentTitle?: string;
  provider?: MuseProvider;
  /** Tag every internal trace span with this chat's conversation_id so the
   *  per-chat cost meter sees the muse's work. */
  conversationId?: number;
}

export interface MuseGenerateProposalRequest {
  mode: "generate";
  source: "proposal";
  prompt: string;
  renderMode: RenderMode;
  targetUuid?: string;
  size?: PaintSize;
  quality?: PaintQuality;
  provider?: MuseProvider;
  styleHint?: string;
  commit_hash?: string;
  document_id?: number;
  portfolio_project_id?: string;
  conversationId?: number;
}

export interface MuseGenerateDirectRequest {
  mode: "generate";
  source: "direct";
  renderMode?: RenderMode;
  turns?: Array<{ user: string; assistant: string }>;
  shelf?: MuseShelfRef[];
  displayedImageDataUrl?: string;
  size?: PaintSize;
  quality?: PaintQuality;
  provider?: MuseProvider;
  styleHint?: string;
  commit_hash?: string;
  document_id?: number;
  portfolio_project_id?: string;
  conversationId?: number;
}

export type MuseRequest =
  | MuseProposeRequest
  | MuseGenerateProposalRequest
  | MuseGenerateDirectRequest;

/** Image-to-image edit — POST /api/chat-hourglass/muse/edit */
export interface MuseEditRequest {
  sourceImageDataUrl: string;
  prompt: string;
  renderMode?: RenderMode;
  size?: PaintSize;
  quality?: PaintQuality;
  provider?: MuseProvider;
  styleHint?: string;
  commit_hash?: string;
  document_id?: number;
  portfolio_project_id?: string;
  conversationId?: number;
  /** Shelf/registry UUID of the source image (stored in media_assets.description JSON). */
  source_artifact_uuid?: string;
}

/**
 * Single typed entrypoint to the muse service. Returns the propose response
 * or the generate response depending on mode (callers narrow with `mode`).
 */
export function useMuse() {
  return useCallback(async (req: MuseRequest): Promise<MuseProposeResponse | MuseGenerateResponse> => {
    const res = await fetch("/api/chat-hourglass/muse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`muse ${res.status}: ${detail}`);
    }
    return (await res.json()) as MuseProposeResponse | MuseGenerateResponse;
  }, []);
}

/**
 * Muse image edit — same persistence + cost meter as generate, but sends the
 * source image to OpenAI edits or Gemini multimodal image generation.
 */
export function useMuseEdit() {
  return useCallback(async (req: MuseEditRequest): Promise<MuseGenerateResponse> => {
    const res = await fetch("/api/chat-hourglass/muse/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`muse edit ${res.status}: ${detail}`);
    }
    return (await res.json()) as MuseGenerateResponse;
  }, []);
}

/**
 * Calls the Muse observer (/api/chat-hourglass/muse/observe) — returns a
 * single literary observation about the recent exchange. Does NOT render,
 * does NOT persist. Cheap. Used for the thought-stream placeholder.
 */
export function useMuseObserver() {
  return useCallback(async (
    turns: Array<{ user: string; assistant: string }>,
    conversationId?: number,
  ): Promise<string | null> => {
    try {
      const res = await fetch("/api/chat-hourglass/muse/observe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns, conversationId }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { thought?: string; error?: string };
      return json.thought || null;
    } catch {
      return null;
    }
  }, []);
}
