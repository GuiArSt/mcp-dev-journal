/**
 * The Muse — Kronus's artistic alter-ego.
 *
 * A small, autonomous service that watches the conversation and decides
 * for itself when to propose visual art. Most of the time it stays silent. Occasionally,
 * when the exchange has earned it, it renders an image.
 *
 * Two modes:
 *
 *  • "auto"  — runs periodically (client ticks it every N turns).
 *              Gemini Flash reads the recent turns and returns
 *              { shouldPropose, renderMode, prompt, reason }. If accepted,
 *              the muse renders with the configured image model.
 *
 *  • "force" — direct call. Prompt + renderMode supplied; muse renders
 *              without deliberation. Used by the `generate_image` chat tool
 *              and the composer's visual button.
 *
 * Image generation defaults to Gemini (Nano Banana 2). When the caller passes
 * `preferGpt: true` (tool path) AND renderMode is `infographic`, it routes
 * to OpenAI GPT Image 2 for its superior text rendering.
 *
 * Image-to-image edits live at POST /api/chat-hourglass/muse/edit (same
 * persistence, registry, and recordImageCost behavior as generate).
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { registerRequest, deregisterRequest } from "@/lib/request-registry";
import { withTrace, traceAI, recordImageCost } from "@/lib/observability";
import { getPrompt, getMuseConfig } from "@/lib/ai/prompt-store";
import { MUSE_PROPOSE_SYSTEM_DEFAULT, MUSE_GENERATE_SYSTEM_DEFAULT } from "@/lib/ai/prompt-defaults";
import { persistMuseImage } from "@/lib/ai/muse-artifact";
import { paintImage } from "@/lib/ai/muse-paint";
import type { PaintSize, RenderMode, PaintQuality } from "@/lib/ai/muse-paint";
import { getProviderPair, normalizePaintModel, type MuseProvider } from "@/lib/ai/muse-provider";

export type { ArtifactRefPayload } from "@/lib/ai/muse-artifact";
export type { MuseProvider, PaintModel } from "@/lib/ai/muse-provider";
export type { PaintQuality, PaintSize, RenderMode } from "@/lib/ai/muse-paint";

export const runtime = "nodejs";
export const maxDuration = 120;

const VISUAL_ART_ADDENDUM = `

RUNTIME VISUAL ART ADDENDUM:
- Treat "painting" as one optional medium, not the default.
- Prefer the strongest visual form for the moment: comic strip, storyboard, editorial illustration, cinematic still, digital rendering, 3D render, collage, scientific plate, poster, map, infographic, drawing, or painting.
- For alternatives, make the options genuinely different when useful. Include visualForm when returning alternatives.
- Do not force non-painting ideas back into a painterly style.`;

// -------------------------- Schemas ------------------------------------

/** Voice — what the muse always says when she ticks. */
const MUSE_VOICE_SCHEMA = z.object({
  kind: z.enum(["poem", "thought", "quip"]).describe(
    "What kind of voice this turn produced. 'poem' when lyrical/earned, 'thought' for a quiet observation, 'quip' for a witty take when nothing earnest is forming.",
  ),
  poemTitle: z
    .string()
    .nullable()
    .describe("3-6 words. Required when kind='poem'; null otherwise."),
  poemLines: z
    .array(z.string())
    .nullable()
    .describe("Exactly 3 short haiku-like lines. Required when kind='poem'; null otherwise."),
  text: z
    .string()
    .nullable()
    .describe("Single sentence (thought) or short line (quip). Required when kind='thought' or 'quip'; null otherwise."),
});

/** A single alternative proposal (used in the multi-alternative picker). */
const MUSE_ALTERNATIVE_SCHEMA = z.object({
  label: z.string().describe("Short name for this variant. E.g. 'comic strip', 'digital rendering', 'system infographic', 'cinematic still'."),
  visualForm: z
    .string()
    .nullable()
    .describe("Visual medium/form, e.g. comic strip, editorial illustration, 3D render, collage, painting, infographic. Use null only when the label already fully specifies the form."),
  renderMode: z.enum(["mood", "infographic"]),
  prompt: z.string().describe("Concrete image prompt for this variant."),
  rationale: z.string().describe("One sentence on why this variant fits the moment."),
});

/** Propose — voice + optional image proposal. Never renders. */
const MUSE_PROPOSAL_SCHEMA = z.object({
  voice: MUSE_VOICE_SCHEMA,
  shouldPropose: z.boolean().describe("True only when the exchange has earned a proposal."),
  suggestedTitle: z
    .string()
    .nullable()
    .describe("Optional replacement chat title. Use only when the current title is missing, generic, typo-ridden, too long, or the conversation's true subject has emerged. 3-7 words, no quotes, no emoji. Null otherwise."),
  titleReason: z
    .string()
    .nullable()
    .describe("Short reason for suggestedTitle. Null when suggestedTitle is null."),
  // Single-proposal path (auto-tick).
  action: z.enum(["new", "refine"]).nullable().describe("'new' for a fresh artifact, 'refine' to refresh an existing one. null when proposing alternatives or when shouldPropose is false."),
  targetUuid: z.string().nullable().describe("UUID of the artifact to refine. Required when action='refine'; null otherwise."),
  renderMode: z.enum(["mood", "infographic"]).nullable().describe("Render mode for the SINGLE proposal. null when proposing alternatives or when shouldPropose is false."),
  prompt: z.string().nullable().describe("Concrete image prompt for the SINGLE proposal. null when proposing alternatives or when shouldPropose is false."),
  // Multi-alternative path (forced/mandatory with alternatives>1).
  alternatives: z.array(MUSE_ALTERNATIVE_SCHEMA).max(4).nullable().describe("N distinct variants (comic strip, illustration, digital rendering, infographic, scientific still, 3D render, painting, etc.). null when proposing a single proposal or when shouldPropose is false."),
  reason: z.string().describe("One short sentence justifying the proposal (or silence). Always required."),
});

/** Generate-direct — muse composes a concrete image prompt from context. */
const MUSE_GENERATE_SCHEMA = z.object({
  prompt: z.string().describe("Concrete image prompt for the image engine."),
  poemTitle: z.string().nullable().describe("Required when renderMode='mood'."),
  poemLines: z.array(z.string()).nullable().describe("3 short lines. Required when renderMode='mood'."),
  reason: z.string().describe("One sentence on what was chosen and why."),
});

// -------------------------- Context helpers ------------------------------

interface ShelfRefForMuse {
  uuid: string;
  kind: string;
  renderMode?: string;
  title: string;
  prompt?: string;
  reason?: string;
  displayed?: boolean;
}

/** Build the transcript block (whole conversation, capped per side). */
function buildTranscript(turns: Array<{ user: string; assistant: string }>): string {
  return turns
    .map(
      (t, i) =>
        `Turn ${i + 1}\n  USER: ${String(t.user ?? "").slice(0, 1500)}\n  KRONUS: ${String(t.assistant ?? "").slice(0, 1500)}`,
    )
    .join("\n\n");
}

/** Build the SHELF block (compact refs). Pass an empty array to omit. */
function buildShelfBlock(shelf: ShelfRefForMuse[] | undefined): string {
  if (!shelf || shelf.length === 0) return "(shelf is empty)";
  return shelf
    .map((r) => {
      const tag = r.displayed ? " ← DISPLAYED" : "";
      const promptLine = r.prompt ? `\n    prompt: ${r.prompt.slice(0, 300)}` : "";
      const reasonLine = r.reason ? `\n    reason: ${r.reason.slice(0, 240)}` : "";
      return `  • ${r.uuid} · ${r.kind}${r.renderMode ? ` · ${r.renderMode}` : ""}${tag}\n    title: ${r.title}${promptLine}${reasonLine}`;
    })
    .join("\n");
}

function sanitizeMuseTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const clean = title
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length < 3) return null;
  return clean.length > 80 ? clean.slice(0, 77).trimEnd() + "..." : clean;
}

/** Run the propose phase. Multimodal — when displayedImageDataUrl is given,
 *  the live image is included as a vision part so the muse can SEE the
 *  current canvas and decide whether to refine vs propose new. */
async function runMusePropose(opts: {
  turns: Array<{ user: string; assistant: string }>;
  shelf?: ShelfRefForMuse[];
  displayedImageDataUrl?: string;
  /** Append-only event log (compact serialization is built here). */
  chatLog?: Array<unknown>;
  /** When true, the muse must propose. Surfaced to the prompt as a hard rule. */
  mandatory: boolean;
  /** When 2-4, return N distinct variants instead of a single proposal. */
  alternatives: number;
  activeSkills?: string[];
  repositoryIndex?: string;
  currentTitle?: string;
  provider: MuseProvider;
  pair: { driverModel: string; driverSdk: "openai" | "google" };
  systemPrompt: string;
  abortSignal?: AbortSignal;
  conversationId?: number;
}) {
  const { provider, pair, systemPrompt, abortSignal, conversationId } = opts;
  const model = pair.driverSdk === "openai" ? openai(pair.driverModel) : google(pair.driverModel);

  const transcript = buildTranscript(opts.turns);
  const shelfBlock = buildShelfBlock(opts.shelf);
  const skills = opts.activeSkills && opts.activeSkills.length
    ? opts.activeSkills.join(", ")
    : "(none)";
  const repoIndex = opts.repositoryIndex?.slice(0, 1500) || "(no index)";
  const currentTitle = opts.currentTitle?.trim() || "(untitled)";

  // Serialize the chat log compactly. Falls back to "(no log)" when empty.
  const { serializeForMuse } = await import("@/lib/chat-log");
  const chatLogBlock = (opts.chatLog && Array.isArray(opts.chatLog) && opts.chatLog.length > 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? serializeForMuse(opts.chatLog as any, 40)
    : "(no log)";

  const directives: string[] = [];
  if (opts.mandatory) {
    directives.push(
      `DIRECTIVE: shouldPropose MUST be true this turn. The user (or Kronus) explicitly asked you to propose. Do not stay silent.`,
    );
  }
  if (opts.alternatives > 1) {
    directives.push(
      `DIRECTIVE: produce ${opts.alternatives} alternatives in the 'alternatives' field. Leave the single-proposal fields (action, targetUuid, renderMode, prompt) all null. Each alternative gets its own label, visualForm, renderMode, prompt, and rationale. Mix visual forms (comic strip, editorial illustration, digital rendering, cinematic still, 3D render, collage, infographic, scientific plate, painting) when reasonable, or stay in one form with ${opts.alternatives} stylistic variations — pick whichever serves the moment better.`,
    );
  } else {
    directives.push(
      `DIRECTIVE: produce a SINGLE proposal in the single-proposal fields. Leave 'alternatives' null.`,
    );
  }
  directives.push(
    `TITLE DIRECTIVE: You may suggest a better chat title in 'suggestedTitle' whenever the current title is missing, generic, typo-ridden, too long, or the conversation's true subject has emerged. Use 3-7 clear words, no quotes, no emoji. If the current title is already good, set suggestedTitle and titleReason to null.`,
  );

  const textBlock = [
    directives.join("\n"),
    "",
    "CURRENT_TITLE:",
    currentTitle,
    "",
    "KRONUS_SKILLS:",
    skills,
    "",
    "REPOSITORY_INDEX:",
    repoIndex,
    "",
    "SHELF:",
    shelfBlock,
    "",
    "CHAT_LOG (oldest → newest, compact):",
    chatLogBlock,
    "",
    "CONVERSATION (full, oldest → newest):",
    "",
    transcript,
  ].join("\n");

  // Build multimodal user message. Only attach the displayed image when
  // present and looks like a data URL (skip remote URLs to avoid auth issues).
  const userParts: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: string }
  > = [{ type: "text", text: textBlock }];
  if (opts.displayedImageDataUrl?.startsWith("data:")) {
    userParts.push({ type: "image", image: opts.displayedImageDataUrl });
  }

  const result = await traceAI(
    "muse-propose",
    pair.driverModel,
    () => generateObject({
      model,
      schema: MUSE_PROPOSAL_SCHEMA,
      system: systemPrompt,
      messages: [{ role: "user", content: userParts }],
      abortSignal,
    }),
    { provider, mandatory: opts.mandatory, alternatives: opts.alternatives, hasDisplayedImage: !!opts.displayedImageDataUrl },
    textBlock,
    "/api/chat-hourglass/muse",
    conversationId,
  );
  return result.object;
}

/** Run the generate-prompt phase (direct/forced image). Returns a single
 *  composed prompt for the image engine. Multimodal when a displayed image is
 *  passed (so the muse can avoid duplicating it). */
async function runMuseGenerate(opts: {
  turns?: Array<{ user: string; assistant: string }>;
  shelf?: ShelfRefForMuse[];
  displayedImageDataUrl?: string;
  renderMode: RenderMode;
  provider: MuseProvider;
  pair: { driverModel: string; driverSdk: "openai" | "google" };
  systemPrompt: string;
  abortSignal?: AbortSignal;
  conversationId?: number;
}) {
  const { provider, pair, systemPrompt, abortSignal, conversationId } = opts;
  const model = pair.driverSdk === "openai" ? openai(pair.driverModel) : google(pair.driverModel);

  const transcript = opts.turns ? buildTranscript(opts.turns) : "(no conversation)";
  const shelfBlock = buildShelfBlock(opts.shelf);

  const textBlock = [
    `RENDER_MODE: ${opts.renderMode}`,
    "",
    "SHELF:",
    shelfBlock,
    "",
    "CONVERSATION (full, oldest → newest):",
    "",
    transcript,
  ].join("\n");

  const userParts: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: string }
  > = [{ type: "text", text: textBlock }];
  if (opts.displayedImageDataUrl?.startsWith("data:")) {
    userParts.push({ type: "image", image: opts.displayedImageDataUrl });
  }

  const result = await traceAI(
    "muse-generate-prompt",
    pair.driverModel,
    () => generateObject({
      model,
      schema: MUSE_GENERATE_SCHEMA,
      system: systemPrompt,
      messages: [{ role: "user", content: userParts }],
      abortSignal,
    }),
    { provider, renderMode: opts.renderMode },
    textBlock,
    "/api/chat-hourglass/muse",
    conversationId,
  );
  return result.object;
}

// -------------------------- Handler -------------------------------------

interface ProposeBody {
  mode: "propose";
  turns: Array<{ user: string; assistant: string }>;
  shelf?: ShelfRefForMuse[];
  displayedImageDataUrl?: string;
  /** Append-only chat log — muse reads this to infer reload, recent rendered images, etc. */
  chatLog?: Array<unknown>;
  /** When true, the muse must propose (used by the visual button). */
  mandatory?: boolean;
  /** When 2-4, the muse returns N distinct variants instead of a single proposal. */
  alternatives?: number;
  /** Who triggered this propose call (for log/telemetry attribution). */
  source?: "auto-tick" | "user" | "kronus";
  activeSkills?: string[];
  repositoryIndex?: string;
  currentTitle?: string;
  provider?: MuseProvider;
  painterModel?: string;
  commit_hash?: string;
}

interface GenerateBody {
  mode: "generate";
  source: "proposal" | "direct";
  // proposal source: prompt + renderMode supplied (from accepted proposal)
  prompt?: string;
  renderMode?: RenderMode;
  targetUuid?: string;
  // direct source: muse composes prompt from context
  turns?: Array<{ user: string; assistant: string }>;
  shelf?: ShelfRefForMuse[];
  displayedImageDataUrl?: string;
  // Free-form style label woven into the image prompt.
  styleHint?: string;
  // Linkage — attach the rendered image to a journal entry / document /
  // portfolio project. At most one is typically set.
  commit_hash?: string;
  document_id?: number;
  portfolio_project_id?: string;
  // common
  size?: PaintSize;
  quality?: PaintQuality;
  provider?: MuseProvider;
  /** Override configured painter (gpt-image-2 | nano-banana-2 | nano-banana-pro). */
  painterModel?: string;
}

// -------- Legacy bodies (kept for backward compat with existing callers) ---

function resolvePainter(
  body: { provider?: MuseProvider; painterModel?: string },
  cfgProvider: MuseProvider,
  cfgPainter: string,
): { provider: MuseProvider; painter: ReturnType<typeof normalizePaintModel> } {
  const painter = normalizePaintModel(body.painterModel ?? cfgPainter);
  const provider: MuseProvider =
    body.provider ??
    (painter === "gpt-image-2" ? "openai" : painter.startsWith("nano-banana") ? "google" : cfgProvider);
  return { provider, painter };
}

interface LegacyAutoBody {
  mode: "auto" | "auto-mandatory";
  turns: Array<{ user: string; assistant: string }>;
  provider?: MuseProvider;
  commit_hash?: string;
}

interface LegacyForceBody {
  mode: "force";
  prompt: string;
  renderMode?: RenderMode;
  size?: PaintSize;
  quality?: PaintQuality;
  provider?: MuseProvider;
  painterModel?: string;
  commit_hash?: string;
}

type Body = ProposeBody | GenerateBody | LegacyAutoBody | LegacyForceBody;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const controller = new AbortController();

  // Load config + prompts from DB (fall back to hardcoded defaults transparently)
  const cfg = getMuseConfig();
  const painterOverride =
    "painterModel" in body && typeof body.painterModel === "string" ? body.painterModel : undefined;
  const { provider: resolvedProvider, painter: resolvedPainter } = resolvePainter(
    { provider: body.provider, painterModel: painterOverride },
    (cfg.provider as MuseProvider) ?? "openai",
    cfg.painterModel,
  );
  const pair = getProviderPair(resolvedProvider, {
    driverModel: cfg.driverModel,
    painterModel: resolvedPainter,
  });
  const proposeSystemPrompt = `${getPrompt("muse-propose-system", MUSE_PROPOSE_SYSTEM_DEFAULT)}${VISUAL_ART_ADDENDUM}`;
  const generateSystemPrompt = `${getPrompt("muse-generate-system", MUSE_GENERATE_SYSTEM_DEFAULT)}${VISUAL_ART_ADDENDUM}`;

  // Pull conversationId from any body shape (propose / generate). Tagged
  // on every internal trace span so the per-chat cost meter sees muse work.
  const rawConvId = (body as unknown as { conversationId?: unknown }).conversationId;
  const conversationId = typeof rawConvId === "number" ? rawConvId : undefined;

  return withTrace(`muse-${body.mode}`, async () => {
  const registryId = registerRequest({
    controller,
    endpoint: "muse",
    mode: body.mode,
    model: pair.painterModel,
    startedAt: new Date(),
    metadata: {
      provider: resolvedProvider,
      ...(body.mode === "force" && body.prompt ? { prompt: body.prompt.slice(0, 120) } : {}),
    },
  });

  try {
    const painter = resolvedPainter;

    // ─── PROPOSE MODE ─────────────────────────────────────────────────────
    // Voice + optional image proposal (single OR alternatives). Never renders.
    // Replaces the legacy auto / auto-mandatory modes.
    if (body.mode === "propose" || body.mode === "auto" || body.mode === "auto-mandatory") {
      const turns = body.mode === "propose" ? body.turns : (body as LegacyAutoBody).turns;
      if (!Array.isArray(turns) || turns.length === 0) {
        return NextResponse.json({ error: "turns required" }, { status: 400 });
      }
      // Resolve mandatory + alternatives from the body. Legacy "auto-mandatory"
      // maps to mandatory:true; legacy "auto" maps to mandatory:false.
      const mandatory =
        body.mode === "auto-mandatory" ? true
        : body.mode === "propose" ? !!body.mandatory
        : false;
      const requestedAlternatives = body.mode === "propose" ? body.alternatives : undefined;
      const alternatives = Math.max(1, Math.min(4, requestedAlternatives ?? 1));

      const proposal = await runMusePropose({
        turns,
        shelf: body.mode === "propose" ? body.shelf : undefined,
        displayedImageDataUrl: body.mode === "propose" ? body.displayedImageDataUrl : undefined,
        chatLog: body.mode === "propose" ? body.chatLog : undefined,
        mandatory,
        alternatives,
        activeSkills: body.mode === "propose" ? body.activeSkills : undefined,
        repositoryIndex: body.mode === "propose" ? body.repositoryIndex : undefined,
        currentTitle: body.mode === "propose" ? body.currentTitle : undefined,
        provider: resolvedProvider,
        pair,
        systemPrompt: proposeSystemPrompt,
        abortSignal: controller.signal,
        conversationId,
      });

      // Decide the response shape: alternatives win if present, otherwise
      // a single proposal, otherwise null.
      const altsValid =
        Array.isArray(proposal.alternatives) && proposal.alternatives.length > 0;
      const singleValid =
        proposal.shouldPropose && !!proposal.prompt && !!proposal.renderMode;
      const responseProposal = altsValid
        ? {
            action: "new" as const,
            targetUuid: null,
            renderMode: null,
            prompt: null,
            alternatives: proposal.alternatives!,
          }
        : singleValid
        ? {
            action: proposal.action ?? "new",
            targetUuid: proposal.targetUuid ?? null,
            renderMode: proposal.renderMode!,
            prompt: proposal.prompt!,
            alternatives: null,
          }
        : null;

      return NextResponse.json({
        voice: proposal.voice,
        shouldPropose: proposal.shouldPropose && (altsValid || singleValid),
        proposal: responseProposal,
        suggestedTitle: sanitizeMuseTitle(proposal.suggestedTitle),
        titleReason: proposal.titleReason,
        reason: proposal.reason,
        provider: resolvedProvider,
      });
    }

    // ─── GENERATE MODE ────────────────────────────────────────────────────
    // Runs the image engine. Two sub-modes:
    //  • source="proposal" — caller supplies prompt + renderMode (from accepted proposal or external tool)
    //  • source="direct"   — muse composes the prompt from context, then renders
    if (body.mode === "generate" || body.mode === "force") {
      const isLegacyForce = body.mode === "force";
      const source: "proposal" | "direct" =
        isLegacyForce ? "proposal" : body.source;

      let renderMode: RenderMode;
      let promptText: string;
      let companionPoem: { title: string; lines: string[] } | null = null;
      let reason: string | null = null;

      if (source === "proposal") {
        // Caller supplies a prompt — render it as-is.
        if (!body.prompt || typeof body.prompt !== "string") {
          return NextResponse.json({ error: "prompt required for generate(source=proposal) / force" }, { status: 400 });
        }
        renderMode = body.renderMode ?? "mood";
        promptText = body.prompt;
      } else {
        // Direct: muse composes a concrete prompt from context using the
        // generate-system-prompt brain, then we render it.
        const generateBody = body as GenerateBody;
        renderMode = generateBody.renderMode ?? "mood";
        const composed = await runMuseGenerate({
          turns: generateBody.turns,
          shelf: generateBody.shelf,
          displayedImageDataUrl: generateBody.displayedImageDataUrl,
          renderMode,
          provider: resolvedProvider,
          pair,
          systemPrompt: generateSystemPrompt,
          abortSignal: controller.signal,
          conversationId,
        });
        promptText = composed.prompt;
        reason = composed.reason ?? null;
        if (renderMode === "mood" && composed.poemTitle && composed.poemLines && composed.poemLines.length >= 2) {
          companionPoem = { title: composed.poemTitle, lines: composed.poemLines.slice(0, 3) };
        }
      }

      const size: PaintSize =
        body.size ?? ((renderMode === "infographic" ? cfg.infographicSize : cfg.moodSize) as PaintSize);
      const quality: PaintQuality =
        body.quality ?? ((renderMode === "infographic" ? cfg.infographicQuality : cfg.moodQuality) as PaintQuality);

      // Pull linkage + style hint from the body (only valid on the generate body).
      const generateBody = body.mode === "generate" ? (body as GenerateBody) : undefined;
      const styleHint = generateBody?.styleHint;
      const linkage = {
        commitHash: body.commit_hash,
        documentId: generateBody?.document_id,
        portfolioProjectId: generateBody?.portfolio_project_id,
      };

      try {
        const dataUrl = await paintImage(
          painter,
          size,
          promptText,
          renderMode,
          quality,
          controller.signal,
          styleHint,
          conversationId,
        );
        if (!dataUrl) throw new Error("image generator returned no image");
        const artifactRef = persistMuseImage({
          dataUrl,
          prompt: promptText,
          renderMode,
          painterModel: painter,
          provider: resolvedProvider,
          reason,
          source: "muse-forced",
          companionPoem,
          styleHint,
          ...linkage,
        });
        // Record the per-image fixed cost for the cost meter. The
        // conversation_id is inherited from withTrace's context; quality
        // governs which GPT Image 2 tier we charge against.
        recordImageCost({
          model: painter,
          quality,
          conversationId,
          endpoint: "/api/chat-hourglass/muse",
          operation: "generate",
        });
        return NextResponse.json({
          artifactRef,
          reason,
          provider: resolvedProvider,
        });
      } catch (paintErr) {
        const message = paintErr instanceof Error ? paintErr.message : "image generation failed";
        return NextResponse.json({
          artifactRef: null,
          reason,
          provider: resolvedProvider,
          error: message,
        });
      }
    }

    return NextResponse.json({ error: `unknown mode: ${(body as { mode: string }).mode}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    deregisterRequest(registryId);
  }
  }, { provider: resolvedProvider, mode: body.mode }, "/api/chat-hourglass/muse", conversationId);
}
