/**
 * Muse painters — text-to-image and image-to-image (edit).
 * Used by /api/chat-hourglass/muse and /api/chat-hourglass/muse/edit.
 */

import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { traceAI } from "@/lib/observability";
import type { PaintModel } from "@/lib/ai/muse-provider";

export type PaintSize = "512" | "1K" | "2K" | "4K";
export type RenderMode = "mood" | "infographic";
export type PaintQuality = "low" | "medium" | "high";

const GEMINI_MODEL_IDS: Record<Exclude<PaintModel, "gpt-image-2">, string> = {
  "nano-banana-pro": "gemini-3-pro-image-preview",
  "nano-banana-2": "gemini-3.1-flash-image-preview",
  "nano-banana": "gemini-2.5-flash-image",
};

function moodRenderingInstruction(styleHint?: string | null): string {
  const hint = styleHint?.trim();
  if (hint) {
    return `Expressive visual art in the requested form; follow the style hint closely: ${hint}. No text overlay unless the prompt explicitly asks for labels, captions, panels, or speech.`;
  }
  return "Expressive visual art in a form that fits the prompt: illustration, comic strip, cinematic still, digital rendering, painting, collage, print, or another suitable visual language. No text overlay unless the prompt explicitly asks for labels, captions, panels, or speech.";
}

function buildPainterPrompt(
  prompt: string,
  renderMode: RenderMode,
  styleHint?: string | null,
  editPreamble?: string,
): string {
  const base =
    renderMode === "mood"
      ? `${prompt}\n\n${moodRenderingInstruction(styleHint)}`
      : `${prompt}\n\nClean infographic, crisp legible labels, minimal decoration, balanced spacing.${styleHint ? ` Style: ${styleHint}.` : ""}`;
  if (editPreamble) return `${editPreamble}\n\n${base}`;
  return base;
}

/** Text-to-image (existing muse behavior). */
export async function paintImage(
  model: PaintModel,
  size: PaintSize,
  prompt: string,
  renderMode: RenderMode,
  quality: PaintQuality,
  abortSignal?: AbortSignal,
  styleHint?: string | null,
  /** When set, `muse-paint` span is tagged for `recomputeConversationCost`. */
  conversationId?: number,
): Promise<string | null> {
  const isComic = !!styleHint && /comic/i.test(styleHint);
  const wantsLandscape = renderMode === "infographic" || isComic;
  const finalPrompt = buildPainterPrompt(prompt, renderMode, styleHint);

  if (model === "gpt-image-2") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");
    const openAiSize = wantsLandscape
      ? size === "4K" ? "2560x1792"
      : size === "2K" ? "1792x1024"
      : "1536x1024"
      : size === "4K" ? "2560x2560"
      : size === "2K" ? "1536x1536"
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
      signal: abortSignal,
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
  const result = await traceAI(
    "muse-paint",
    modelId,
    () =>
      generateText({
        model: google(modelId),
        providerOptions: {
          google: {
            responseModalities: ["IMAGE", "TEXT"],
            generationConfig: {
              imageConfig: {
                imageSize: size,
                aspectRatio: wantsLandscape ? "3:2" : "1:1",
              },
            },
          },
        },
        prompt: `Generate an image: ${finalPrompt}`,
        abortSignal,
      }),
    { renderMode, size },
    finalPrompt,
    "/api/chat-hourglass/muse",
    conversationId,
  );

  if (!result.files || result.files.length === 0) return null;
  for (const file of result.files) {
    if (file.mediaType?.startsWith("image/")) {
      const base64 = Buffer.from(file.uint8Array).toString("base64");
      return `data:${file.mediaType};base64,${base64}`;
    }
  }
  return null;
}

function openAiEditOutputSize(wantsLandscape: boolean): "1024x1024" | "1536x1024" | "1024x1536" {
  if (wantsLandscape) return "1536x1024";
  return "1024x1024";
}

/**
 * Image-to-image edit: OpenAI `/v1/images/edits` (JSON + data URL) or Gemini
 * multimodal generate with the source image attached.
 */
export async function paintImageEdit(opts: {
  model: PaintModel;
  size: PaintSize;
  sourceImageDataUrl: string;
  prompt: string;
  renderMode: RenderMode;
  quality: PaintQuality;
  abortSignal?: AbortSignal;
  styleHint?: string | null;
  conversationId?: number;
}): Promise<string | null> {
  const { model, size, sourceImageDataUrl, prompt, renderMode, quality, abortSignal, styleHint, conversationId } = opts;

  if (!sourceImageDataUrl.startsWith("data:")) {
    throw new Error("paintImageEdit: sourceImageDataUrl must be a data: URL");
  }

  const isComic = !!styleHint && /comic/i.test(styleHint);
  const wantsLandscape = renderMode === "infographic" || isComic;
  const editPreamble =
    "You are editing the attached reference image. Apply the user's instructions; keep recognizable structure and subjects unless they ask to replace them entirely.";
  const finalPrompt = buildPainterPrompt(prompt, renderMode, styleHint, editPreamble);

  if (model === "gpt-image-2") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");
    const outSize = openAiEditOutputSize(wantsLandscape);

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-2",
        images: [{ image_url: sourceImageDataUrl }],
        prompt: finalPrompt,
        size: outSize,
        quality,
        background: "opaque",
        n: 1,
      }),
      signal: abortSignal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI edits ${res.status}: ${body.slice(0, 400)}`);
    }
    const data = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = data.data?.[0];
    if (!first) return null;
    if (first.b64_json) return `data:image/png;base64,${first.b64_json}`;
    if (first.url) return first.url;
    return null;
  }

  const modelId = GEMINI_MODEL_IDS[model];
  const result = await traceAI(
    "muse-paint-edit",
    modelId,
    () =>
      generateText({
        model: google(modelId),
        providerOptions: {
          google: {
            responseModalities: ["IMAGE", "TEXT"],
            generationConfig: {
              imageConfig: {
                imageSize: size,
                aspectRatio: wantsLandscape ? "3:2" : "1:1",
              },
            },
          },
        },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: finalPrompt },
              { type: "image", image: sourceImageDataUrl },
            ],
          },
        ],
        abortSignal,
      }),
    { renderMode, size, edit: true },
    finalPrompt.slice(0, 500),
    "/api/chat-hourglass/muse/edit",
    conversationId,
  );

  if (!result.files || result.files.length === 0) return null;
  for (const file of result.files) {
    if (file.mediaType?.startsWith("image/")) {
      const base64 = Buffer.from(file.uint8Array).toString("base64");
      return `data:${file.mediaType};base64,${base64}`;
    }
  }
  return null;
}
