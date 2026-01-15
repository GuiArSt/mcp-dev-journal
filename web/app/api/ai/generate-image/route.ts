/**
 * AI Generate Image - Unified Image Generation via AI SDK 6.0
 *
 * Uses AI SDK 6.0 generateText with multimodal Gemini models for native image generation.
 * Gemini 3 Pro Image (Nano Banana Pro) - State-of-the-art image generation with text rendering.
 *
 * Model: gemini-3-pro-image-preview (Nano Banana Pro)
 * - 4K output resolution support
 * - Advanced text rendering
 * - Multi-image reference (up to 14 images)
 * - Consistent identity across subjects
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

// Supported Gemini image generation models
const GEMINI_IMAGE_MODELS = {
  // Gemini 3 Pro Image (Nano Banana Pro) - Best quality, 4K support
  "gemini-3-pro-image": "gemini-3-pro-image-preview",
  "nano-banana-pro": "gemini-3-pro-image-preview",

  // Gemini 2.5 Flash Image - Fast, good quality
  "gemini-2.5-flash-image": "gemini-2.5-flash-image-preview",

  // Legacy Gemini 2.0 Flash (retiring Oct 2025)
  "gemini-2.0-flash": "gemini-2.0-flash-preview-image-generation",
} as const;

type ModelAlias = keyof typeof GEMINI_IMAGE_MODELS;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      prompt,
      model = "gemini-3-pro-image", // Default to Nano Banana Pro
      aspectRatio = "1:1",
    } = body;

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    // Check API key
    const googleApiKey = process.env.GOOGLE_API_KEY;
    if (!googleApiKey) {
      return NextResponse.json(
        { error: "GOOGLE_API_KEY must be configured for Gemini image generation" },
        { status: 500 }
      );
    }

    // Resolve model alias to actual model ID
    const modelId = GEMINI_IMAGE_MODELS[model as ModelAlias] || model;

    console.log(`[AI Image] Generating with model ${modelId}, prompt: ${prompt.substring(0, 50)}...`);

    // AI SDK 6.0 pattern: generateText with multimodal Gemini model
    // Images are returned in result.files array
    const result = await generateText({
      model: google(modelId),
      providerOptions: {
        google: {
          // Request image output modality
          responseModalities: ["IMAGE", "TEXT"],
          // Configure image generation
          generationConfig: {
            imageConfig: {
              aspectRatio,
            },
          },
        },
      },
      prompt: `Generate an image: ${prompt}`,
    });

    // Extract generated images from result.files
    const imageUrls: string[] = [];

    if (result.files && result.files.length > 0) {
      for (const file of result.files) {
        if (file.mediaType?.startsWith("image/")) {
          // Convert Uint8Array to base64 data URL
          const base64 = Buffer.from(file.uint8Array).toString("base64");
          const dataUrl = `data:${file.mediaType};base64,${base64}`;
          imageUrls.push(dataUrl);
        }
      }
    }

    if (imageUrls.length === 0) {
      // Check if there's text response (model might have refused or given text instead)
      const textResponse = result.text;
      console.error("[AI Image] No images generated. Text response:", textResponse?.substring(0, 500));

      return NextResponse.json(
        {
          error: "No images generated",
          details: textResponse || "Model did not return image output",
        },
        { status: 500 }
      );
    }

    console.log(`[AI Image] Generated ${imageUrls.length} image(s) with ${modelId}`);

    return NextResponse.json({
      success: true,
      images: imageUrls,
      model: modelId,
      prompt,
    });
  } catch (error: any) {
    console.error("[AI Image] Error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to generate image",
        details: error.toString(),
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/generate-image
 * Returns available models and their capabilities
 */
export async function GET() {
  return NextResponse.json({
    models: [
      {
        id: "gemini-3-pro-image",
        name: "Gemini 3 Pro Image (Nano Banana Pro)",
        description: "State-of-the-art image generation with 4K support and advanced text rendering",
        maxResolution: "4096x4096",
        aspectRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
      },
      {
        id: "gemini-2.5-flash-image",
        name: "Gemini 2.5 Flash Image",
        description: "Fast image generation with good quality",
        maxResolution: "2048x2048",
        aspectRatios: ["1:1", "16:9", "9:16"],
      },
    ],
    defaultModel: "gemini-3-pro-image",
    provider: "google",
    sdk: "AI SDK 6.0",
  });
}
