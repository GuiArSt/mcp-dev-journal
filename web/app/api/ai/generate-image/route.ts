/**
 * AI Generate Image — unified painters (GPT Image 2 default, Nano Banana 2 / Pro on Google).
 *
 * API IDs (verified Apr 2026):
 * - OpenAI: gpt-image-2
 * - Google Nano Banana 2: gemini-3.1-flash-image-preview
 * - Google Nano Banana Pro: gemini-3-pro-image-preview
 */

import { NextRequest, NextResponse } from "next/server";
import { paintImage, type PaintQuality, type PaintSize, type RenderMode } from "@/lib/ai/muse-paint";
import { normalizePaintModel, type PaintModel } from "@/lib/ai/muse-provider";

const ASPECT_TO_SIZE: Record<string, PaintSize> = {
  "1:1": "1K",
  "3:2": "2K",
  "2:3": "2K",
  "16:9": "2K",
  "9:16": "2K",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      prompt,
      model = "gpt-image-2",
      aspectRatio = "1:1",
      renderMode = "mood",
      quality,
    } = body as {
      prompt?: string;
      model?: string;
      aspectRatio?: string;
      renderMode?: RenderMode;
      quality?: PaintQuality;
    };

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const painter: PaintModel = normalizePaintModel(model);
    const size = ASPECT_TO_SIZE[aspectRatio] ?? "1K";
    const paintQuality: PaintQuality =
      quality ?? (renderMode === "infographic" ? "high" : painter === "gpt-image-2" ? "medium" : "low");

    if (painter === "gpt-image-2" && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY must be configured for GPT Image 2" },
        { status: 500 },
      );
    }
    if (painter !== "gpt-image-2" && !(process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY)) {
      return NextResponse.json(
        { error: "GOOGLE_API_KEY must be configured for Gemini image generation" },
        { status: 500 },
      );
    }

    console.log(`[AI Image] Generating with ${painter}, prompt: ${prompt.substring(0, 50)}...`);

    const dataUrl = await paintImage(
      painter,
      size,
      prompt,
      renderMode,
      paintQuality,
    );

    if (!dataUrl) {
      return NextResponse.json({ error: "No images generated" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      images: [dataUrl],
      model: painter,
      prompt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate image";
    console.error("[AI Image] Error:", error);
    return NextResponse.json(
      {
        error: message,
        details: error instanceof Error ? error.toString() : String(error),
        stack: process.env.NODE_ENV === "development" && error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/ai/generate-image
 * Returns available painters and capabilities.
 */
export async function GET() {
  return NextResponse.json({
    models: [
      {
        id: "gpt-image-2",
        name: "GPT Image 2",
        description: "Default — best text rendering, infographics, photorealism",
        apiModelId: "gpt-image-2",
        provider: "openai",
      },
      {
        id: "nano-banana-2",
        name: "Nano Banana 2 (Gemini 3.1 Flash Image)",
        description: "Fast Google image generation and editing",
        apiModelId: "gemini-3.1-flash-image-preview",
        provider: "google",
      },
      {
        id: "nano-banana-pro",
        name: "Nano Banana Pro (Gemini 3 Pro Image)",
        description: "Highest-quality Google image model, 4K",
        apiModelId: "gemini-3-pro-image-preview",
        provider: "google",
      },
    ],
    defaultModel: "gpt-image-2",
    retiredModels: {
      "nano-banana": "nano-banana-2",
      "gemini-2.5-flash-image": "nano-banana-2",
    },
  });
}
