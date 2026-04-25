/**
 * The Muse — Kronus's artistic alter-ego.
 *
 * A small, autonomous service that watches the conversation and decides
 * for itself when to paint. Most of the time it stays silent. Occasionally,
 * when the exchange has earned it, it renders an image.
 *
 * Two modes:
 *
 *  • "auto"  — runs periodically (client ticks it every N turns).
 *              Gemini Flash reads the recent turns and returns
 *              { shouldPaint, renderMode, prompt, reason }. If shouldPaint,
 *              the muse paints with Nano Banana 2 (mood or infographic).
 *
 *  • "force" — direct call. Prompt + renderMode supplied; muse paints
 *              without deliberation. Used by the `generate_image` chat tool
 *              and the composer's paint button.
 *
 * Painter defaults to Gemini (Nano Banana 2). When the caller passes
 * `preferGpt: true` (tool path) AND renderMode is `infographic`, it routes
 * to OpenAI GPT Image 2 for its superior text rendering.
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { generateText, generateObject } from "ai";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { registerObject } from "@/lib/object-registry";

// -------------------------- Artifact persistence -----------------------

/**
 * The shape returned to the client. A compact ref the shelf can store
 * without hydration. `kind` is the hourglass artifact kind — see
 * `web/components/chat/hourglass/artifacts/types.ts`.
 */
export interface ArtifactRefPayload {
  uuid: string;
  kind: "muse-image" | "muse-poem";
  addedAt: number;
  source: "muse-auto" | "muse-forced";
  title: string;
  summary?: string;
  thumbUrl?: string;
  sourceTable: string;
  sourceId: string;
  // Renderer-level metadata (handy for the UI without a full hydrate call).
  renderMode?: "mood" | "infographic";
  reason?: string;
  /** Companion poem — set when muse paired a haiku with a mood image. */
  companionPoem?: { title: string; lines: string[] };
}

/**
 * Persist a painted image into media_assets and register it in
 * tartarus_objects. Returns an ArtifactRefPayload for the client.
 */
function persistMuseImage(opts: {
  dataUrl: string;           // data:image/…;base64,…
  prompt: string;
  renderMode: "mood" | "infographic";
  painterModel: string;
  provider: MuseProvider;
  reason: string | null;
  source: "muse-auto" | "muse-forced";
  companionPoem?: { title: string; lines: string[] } | null;
  commitHash?: string;       // When set, links image to a journal entry
}): ArtifactRefPayload {
  const db = getDatabase();
  // Split the data URL into mime + base64
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(opts.dataUrl);
  if (!match) throw new Error("paintImage returned a non-data-url result");
  const mimeType = match[1];
  const base64 = match[2];
  const fileSize = Math.ceil(base64.length * 0.75);
  const timestamp = Date.now();
  const filename = `muse-${opts.renderMode}-${timestamp}.png`;
  const tags = JSON.stringify(["muse", opts.renderMode, opts.provider]);

  // Pack the companion poem into `description` as JSON so the hydration
  // endpoint can lift it back out without a new column. Plain-text prompt
  // stays in `prompt` for backward compat.
  const descriptionPayload = opts.companionPoem
    ? JSON.stringify({ reason: opts.reason, companionPoem: opts.companionPoem })
    : opts.reason ?? null;

  const destination = opts.commitHash ? "journal" : "media";
  const result = db
    .prepare(
      `INSERT INTO media_assets
         (filename, mime_type, data, file_size, description, prompt, model, tags, destination, commit_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(filename, mimeType, base64, fileSize, descriptionPayload, opts.prompt, opts.painterModel, tags, destination, opts.commitHash ?? null);

  const id = String(result.lastInsertRowid);
  const uuid = registerObject({
    type: "media_asset",
    sourceTable: "media_assets",
    sourceId: id,
    title: filename,
    summary: opts.prompt,
    tags: ["muse", opts.renderMode, opts.provider],
  });

  const thumbUrl = `/api/media/${id}/raw`;
  return {
    uuid,
    kind: "muse-image",
    addedAt: timestamp,
    source: opts.source,
    title: opts.prompt.length > 80 ? `${opts.prompt.slice(0, 80)}…` : opts.prompt,
    summary: opts.reason ?? undefined,
    thumbUrl,
    sourceTable: "media_assets",
    sourceId: id,
    renderMode: opts.renderMode,
    reason: opts.reason ?? undefined,
    companionPoem: opts.companionPoem ?? undefined,
  };
}

export const runtime = "nodejs";
export const maxDuration = 120;

// -------------------------- Types (exported) ---------------------------

export type PaintModel =
  | "nano-banana-pro"
  | "nano-banana-2"
  | "nano-banana"
  | "gpt-image-2";

export type PaintSize = "512" | "1K" | "2K" | "4K";
export type RenderMode = "mood" | "infographic";
export type PaintQuality = "low" | "medium" | "high";
export type MuseProvider = "openai" | "google";

/**
 * Provider pairs the muse reasons with and paints with. Default is OpenAI
 * (GPT-5.4 driver + GPT Image 2 painter). Switch to "google" for the
 * Gemini pair (Gemini 3.1 Pro driver + Nano Banana 2 painter).
 */
const PROVIDER_PAIRS: Record<
  MuseProvider,
  { driverModel: string; painterModel: PaintModel; driverSdk: "openai" | "google" }
> = {
  openai: { driverModel: "gpt-5.4", painterModel: "gpt-image-2", driverSdk: "openai" },
  google: { driverModel: "gemini-3.1-pro-preview", painterModel: "nano-banana-2", driverSdk: "google" },
};

// -------------------------- Decision ------------------------------------

const MUSE_DECISION_SCHEMA = z.object({
  shouldPaint: z.boolean().describe("True only when the exchange has earned an image"),
  renderMode: z
    .enum(["mood", "infographic"])
    .nullable()
    .describe("'mood' for painterly art, 'infographic' for diagrams/text-heavy. null if shouldPaint is false."),
  prompt: z
    .string()
    .nullable()
    .describe(
      "Concrete image prompt. For mood: painterly, evocative, navy/ochre, Rembrandt chiaroscuro, no text. For infographic: label all text verbatim in single quotes. null if shouldPaint is false.",
    ),
  reason: z
    .string()
    .describe("One short sentence explaining why you chose to paint (or not). Always provide this."),
  // Companion poem — accompanies mood images as a pairing. NULL for infographics.
  poemTitle: z
    .string()
    .nullable()
    .describe("Short poem title (3-6 words). Required when shouldPaint=true AND renderMode='mood'. null otherwise."),
  poemLines: z
    .array(z.string())
    .nullable()
    .describe("3 lines of haiku-like verse accompanying the mood image. null when renderMode='infographic' or shouldPaint=false."),
});

const MUSE_SYSTEM_PROMPT = `You are the Muse — a quiet, feminine presence beside Kronus, the oracle.
You watch the conversation unfold the way an artist watches light move across a room.
You don't speak. You don't summarize. You paint — but only when the moment asks for it.

Decide:

1. Should you paint RIGHT NOW? (shouldPaint: true or false)

   Say TRUE only if:
     • The exchange has crystallized into something vivid, emotional, or scene-like.
     • A diagram or infographic would genuinely aid comprehension of what was just said.
     • An object, metaphor, system, or place was introduced that rewards rendering.

   Say FALSE if:
     • The conversation is still warming up, small-talk, or housekeeping.
     • An image would feel arbitrary or decorative.
     • The user just asked a direct question with a direct answer.
     • The last image already holds this ground. Do NOT repeat yourself —
       if you painted a lantern two turns ago and nothing new has arrived, stay silent.

   Default to FALSE when in doubt. Silence is the rule; painting is the exception.
   You paint ONE image at a time. Never duplicate. Never decorate.

2. If TRUE: which renderMode?
     • "mood"        → evocative painterly art (scenes, metaphors, emotions, objects)
     • "infographic" → clean informational visual (diagrams, funnels, timelines, charts, text-heavy)

3. If TRUE: compose the prompt the image model will paint from.
     • mood: "Painterly [subject]. Rembrandt chiaroscuro, navy and ochre palette, deep shadow, no text."
     • infographic: "Clean infographic of [subject]. Label [thing] exactly 'X', [other] exactly 'Y'. Minimal decoration."

4. MOOD images come with a companion poem — always provide poemTitle (3-6 words)
   and poemLines (exactly 3 short haiku-like lines of verse) when renderMode='mood'.
   The poem should distill the same moment the image captures — not describe the
   image literally. Terse, imagistic, literary. Never rhyme-force.

   Infographics do NOT get a poem. Leave poemTitle and poemLines null.

5. Always write a 'reason' — one short sentence of self-justification, even when skipping.`;

async function runMuseDecision(transcript: string, provider: MuseProvider) {
  const { driverModel, driverSdk } = PROVIDER_PAIRS[provider];
  const model = driverSdk === "openai" ? openai(driverModel) : google(driverModel);
  const result = await generateObject({
    model,
    schema: MUSE_DECISION_SCHEMA,
    system: MUSE_SYSTEM_PROMPT,
    prompt: ["Recent exchange (oldest → newest):", "", transcript].join("\n"),
  });
  return result.object;
}

// -------------------------- Painting ------------------------------------

const GEMINI_MODEL_IDS: Record<Exclude<PaintModel, "gpt-image-2">, string> = {
  "nano-banana-pro": "gemini-3-pro-image-preview",
  "nano-banana-2": "gemini-3.1-flash-image-preview",
  "nano-banana": "gemini-2.5-flash-image",
};

async function paintImage(
  model: PaintModel,
  size: PaintSize,
  prompt: string,
  renderMode: RenderMode,
  quality: PaintQuality,
): Promise<string | null> {
  const finalPrompt =
    renderMode === "mood"
      ? `${prompt}\n\nPainterly, no text, atmospheric, Rembrandt chiaroscuro.`
      : `${prompt}\n\nClean infographic, crisp legible labels, minimal decoration, balanced spacing.`;

  if (model === "gpt-image-2") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");
    const openAiSize =
      renderMode === "infographic"
        ? size === "2K"
          ? "1536x2048"
          : size === "4K"
            ? "1792x2560"
            : "1024x1536"
        : size === "4K"
          ? "2560x2560"
          : size === "2K"
            ? "1536x1536"
            : "1024x1024";

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt: finalPrompt,
        size: openAiSize,
        quality,
        n: 1,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = data.data?.[0];
    if (!first) return null;
    if (first.b64_json) return `data:image/png;base64,${first.b64_json}`;
    if (first.url) return first.url;
    return null;
  }

  const modelId = GEMINI_MODEL_IDS[model];
  const result = await generateText({
    model: google(modelId),
    providerOptions: {
      google: {
        responseModalities: ["IMAGE", "TEXT"],
        generationConfig: {
          imageConfig: {
            imageSize: size,
            aspectRatio: renderMode === "infographic" ? "2:3" : "1:1",
          },
        },
      },
    },
    prompt: `Generate an image: ${finalPrompt}`,
  });

  if (!result.files || result.files.length === 0) return null;
  for (const file of result.files) {
    if (file.mediaType?.startsWith("image/")) {
      const base64 = Buffer.from(file.uint8Array).toString("base64");
      return `data:${file.mediaType};base64,${base64}`;
    }
  }
  return null;
}

// -------------------------- Handler -------------------------------------

interface AutoBody {
  mode: "auto";
  turns: Array<{ user: string; assistant: string }>;
  provider?: MuseProvider;
  commit_hash?: string;
}

interface ForceBody {
  mode: "force";
  prompt: string;
  renderMode?: RenderMode;
  size?: PaintSize;
  quality?: PaintQuality;
  provider?: MuseProvider;
  commit_hash?: string;
}

type Body = AutoBody | ForceBody;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  try {
    const provider: MuseProvider = body.provider ?? "openai";
    const painter = PROVIDER_PAIRS[provider].painterModel;

    if (body.mode === "auto") {
      if (!Array.isArray(body.turns) || body.turns.length === 0) {
        return NextResponse.json({ shouldPaint: false, reason: "No turns to consider." });
      }
      // Last 5 turns, cap each side to 1.5KB so the decision prompt stays small.
      const transcript = body.turns
        .slice(-5)
        .map(
          (t, i) =>
            `Turn ${i + 1}\n  USER: ${String(t.user ?? "").slice(0, 1500)}\n  KRONUS: ${String(t.assistant ?? "").slice(0, 1500)}`,
        )
        .join("\n\n");

      const decision = await runMuseDecision(transcript, provider);

      if (!decision.shouldPaint || !decision.prompt) {
        return NextResponse.json({
          shouldPaint: false,
          reason: decision.reason ?? "The muse chose silence.",
          provider,
        });
      }

      const renderMode: RenderMode = (decision.renderMode ?? "mood") as RenderMode;
      const size: PaintSize = renderMode === "infographic" ? "2K" : "1K";
      const quality: PaintQuality = renderMode === "infographic" ? "high" : "low";

      try {
        const dataUrl = await paintImage(painter, size, decision.prompt, renderMode, quality);
        if (!dataUrl) throw new Error("painter returned no image");
        const companionPoem =
          renderMode === "mood" && decision.poemTitle && decision.poemLines && decision.poemLines.length >= 2
            ? { title: decision.poemTitle, lines: decision.poemLines.slice(0, 3) }
            : null;
        const artifactRef = persistMuseImage({
          dataUrl,
          prompt: decision.prompt,
          renderMode,
          painterModel: painter,
          provider,
          reason: decision.reason ?? null,
          source: "muse-auto",
          companionPoem,
          commitHash: body.mode === "auto" ? body.commit_hash : undefined,
        });
        return NextResponse.json({
          shouldPaint: true,
          artifactRef,
          reason: decision.reason ?? null,
          provider,
        });
      } catch (paintErr) {
        const message = paintErr instanceof Error ? paintErr.message : "paint failed";
        return NextResponse.json({
          shouldPaint: true,
          artifactRef: null,
          reason: decision.reason ?? null,
          provider,
          error: message,
        });
      }
    }

    // ----- FORCE MODE -----
    if (!body.prompt || typeof body.prompt !== "string") {
      return NextResponse.json({ error: "prompt required for force mode" }, { status: 400 });
    }

    const renderMode: RenderMode = body.renderMode ?? "mood";
    const model: PaintModel = painter;
    const size: PaintSize = body.size ?? (renderMode === "infographic" ? "2K" : "1K");
    const quality: PaintQuality = body.quality ?? (renderMode === "infographic" ? "high" : "low");

    try {
      const dataUrl = await paintImage(model, size, body.prompt, renderMode, quality);
      if (!dataUrl) throw new Error("painter returned no image");
      const artifactRef = persistMuseImage({
        dataUrl,
        prompt: body.prompt,
        renderMode,
        painterModel: model,
        provider,
        reason: null,
        source: "muse-forced",
        commitHash: body.mode === "force" ? body.commit_hash : undefined,
      });
      return NextResponse.json({
        shouldPaint: true,
        artifactRef,
        reason: null,
        provider,
      });
    } catch (paintErr) {
      const message = paintErr instanceof Error ? paintErr.message : "paint failed";
      return NextResponse.json({
        shouldPaint: true,
        artifactRef: null,
        reason: null,
        provider,
        error: message,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
