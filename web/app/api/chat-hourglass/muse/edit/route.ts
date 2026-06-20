/**
 * Muse image-to-image edit — OpenAI `images/edits` or Gemini multimodal paint.
 * Persists like /muse generate; records the same flat image cost for the cost meter.
 */

import { NextRequest, NextResponse } from "next/server";
import { registerRequest, deregisterRequest } from "@/lib/request-registry";
import { withTrace, recordImageCost } from "@/lib/observability";
import { getMuseConfig } from "@/lib/ai/prompt-store";
import { persistMuseImage } from "@/lib/ai/muse-artifact";
import { paintImageEdit, type PaintQuality, type PaintSize, type RenderMode } from "@/lib/ai/muse-paint";
import { getProviderPair, normalizePaintModel, type MuseProvider } from "@/lib/ai/muse-provider";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    sourceImageDataUrl?: string;
    prompt?: string;
    renderMode?: RenderMode;
    size?: PaintSize;
    quality?: PaintQuality;
    provider?: MuseProvider;
    styleHint?: string;
    commit_hash?: string;
    document_id?: number;
    portfolio_project_id?: string;
    conversationId?: number;
    source_artifact_uuid?: string;
  } | null;

  if (!body?.sourceImageDataUrl || typeof body.sourceImageDataUrl !== "string") {
    return NextResponse.json({ error: "sourceImageDataUrl is required" }, { status: 400 });
  }
  if (!body.prompt || typeof body.prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const sourceImageDataUrl = body.sourceImageDataUrl;
  if (!sourceImageDataUrl.startsWith("data:")) {
    return NextResponse.json(
      { error: "sourceImageDataUrl must be a data:image/...;base64,... URL" },
      { status: 400 },
    );
  }

  const cfg = getMuseConfig();
  const painter = normalizePaintModel(body.painterModel ?? cfg.painterModel);
  const resolvedProvider: MuseProvider =
    body.provider ??
    (painter === "gpt-image-2" ? "openai" : painter.startsWith("nano-banana") ? "google" : (cfg.provider as MuseProvider) ?? "openai");
  const pair = getProviderPair(resolvedProvider, {
    driverModel: cfg.driverModel,
    painterModel: painter,
  });

  const renderMode = body.renderMode ?? "mood";
  const size: PaintSize =
    body.size ??
    ((renderMode === "infographic" ? cfg.infographicSize : cfg.moodSize) as PaintSize);
  const quality: PaintQuality =
    body.quality ??
    ((renderMode === "infographic" ? cfg.infographicQuality : cfg.moodQuality) as PaintQuality);

  const controller = new AbortController();
  const conversationId = typeof body.conversationId === "number" ? body.conversationId : undefined;

  return withTrace(
    "muse-edit",
    async () => {
      const registryId = registerRequest({
        controller,
        endpoint: "muse",
        mode: "edit",
        model: pair.painterModel,
        startedAt: new Date(),
        metadata: {
          provider: resolvedProvider,
          promptPreview: body.prompt!.slice(0, 120),
        },
      });

      try {
        const dataUrl = await paintImageEdit({
          model: pair.painterModel,
          size,
          sourceImageDataUrl,
          prompt: body.prompt!,
          renderMode,
          quality,
          abortSignal: controller.signal,
          styleHint: body.styleHint ?? null,
          conversationId,
        });

        if (!dataUrl) {
          return NextResponse.json({
            artifactRef: null,
            provider: resolvedProvider,
            error: "painter returned no image",
          });
        }

        if (!dataUrl.startsWith("data:")) {
          return NextResponse.json(
            {
              artifactRef: null,
              provider: resolvedProvider,
              error:
                "Painter returned a non-data URL; persistence expects an inlined data URL. Try another provider or size.",
            },
            { status: 502 },
          );
        }

        const artifactRef = persistMuseImage({
          dataUrl,
          prompt: body.prompt!,
          renderMode,
          painterModel: pair.painterModel,
          provider: resolvedProvider,
          reason: "image-to-image edit",
          source: "muse-edited",
          styleHint: body.styleHint ?? null,
          commitHash: body.commit_hash,
          documentId: body.document_id,
          portfolioProjectId: body.portfolio_project_id,
          editOfArtifactUuid: body.source_artifact_uuid ?? null,
        });

        recordImageCost({
          model: pair.painterModel,
          quality,
          conversationId,
          endpoint: "/api/chat-hourglass/muse/edit",
          operation: "edit",
        });

        return NextResponse.json({
          artifactRef,
          reason: "image-to-image edit",
          provider: resolvedProvider,
        });
      } catch (paintErr) {
        const message = paintErr instanceof Error ? paintErr.message : "paint failed";
        return NextResponse.json({
          artifactRef: null,
          provider: resolvedProvider,
          error: message,
        });
      } finally {
        deregisterRequest(registryId);
      }
    },
    { provider: resolvedProvider, mode: "edit" },
    "/api/chat-hourglass/muse/edit",
    conversationId,
  );
}
