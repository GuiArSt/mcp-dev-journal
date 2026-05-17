import type { ToolExecutor } from "./types";

/**
 * `generate_image` — single image-generation tool for the chat.
 *
 * Routes to the Muse service (/api/chat-hourglass/muse) in "force" mode.
 * The Muse paints with Google Gemini (Nano Banana family) by default.
 * When `provider: "openai"` is requested AND the mode is `infographic`,
 * the Muse routes to OpenAI GPT Image 2 for its superior text rendering.
 */
export const imageExecutors: Record<string, ToolExecutor> = {
  generate_image: async (args) => {
    // Tool exposes provider as "gemini" | "openai" (user-friendly); muse
    // endpoint accepts "google" | "openai". Default: openai (GPT Image 2).
    const toolProvider = (args.provider as "gemini" | "openai" | undefined) ?? "openai";
    const museProvider: "google" | "openai" = toolProvider === "gemini" ? "google" : "openai";
    const renderMode = ((args.mode as "mood" | "infographic" | undefined) ?? "mood");
    const size = args.size as "512" | "1K" | "2K" | "4K" | undefined;
    const quality = args.quality as "low" | "medium" | "high" | undefined;
    const styleHint = args.style_hint as string | undefined;
    const commitHash = args.commit_hash as string | undefined;
    const documentId = args.document_id as number | undefined;
    const portfolioProjectId = args.portfolio_project_id as string | undefined;

    const res = await fetch("/api/chat-hourglass/muse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "generate",
        source: "proposal",
        prompt: String(args.prompt ?? ""),
        renderMode,
        size,
        quality,
        provider: museProvider,
        styleHint,
        commit_hash: commitHash,
        document_id: documentId,
        portfolio_project_id: portfolioProjectId,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || `muse ${res.status}`);
    }
    if (!data.artifactRef) {
      throw new Error(data.error ?? "Muse returned no artifact");
    }

    const ref = data.artifactRef as {
      uuid: string;
      thumbUrl?: string;
      renderMode?: string;
      title?: string;
    };

    return {
      output: `🎨 Image generated (${ref.renderMode ?? "mood"}) — arriving on your shelf.`,
      metadata: {
        artifactRef: data.artifactRef,
        images: ref.thumbUrl ? [ref.thumbUrl] : [],
        uuid: ref.uuid,
        thumbUrl: ref.thumbUrl,
        renderMode: ref.renderMode,
        provider: data.provider,
        prompt: args.prompt,
      },
    };
  },

  /**
   * `wake_muse` — let the Muse decide what to paint, given an intent.
   * Calls propose-mode (mandatory, alternatives default 1) and then
   * paints the chosen proposal. For now this auto-accepts; a later pass
   * will route the proposal/picker through the Hourglass UI when called
   * from the chat-hourglass surface.
   */
  wake_muse: async (args) => {
    const intent = String(args.intent ?? "");
    if (!intent) throw new Error("wake_muse: intent is required");
    const alternatives = Math.max(1, Math.min(4, Number(args.alternatives ?? 1)));
    const commitHash = args.commit_hash as string | undefined;
    const documentId = args.document_id as number | undefined;
    const portfolioProjectId = args.portfolio_project_id as string | undefined;

    // Step 1: ask the muse to propose. The muse sees the intent woven into
    // the propose-mode brain via a single-turn synthetic exchange.
    const proposeRes = await fetch("/api/chat-hourglass/muse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "propose",
        turns: [{ user: intent, assistant: "" }],
        mandatory: true,
        alternatives,
        source: "kronus",
      }),
    });
    const proposeData = await proposeRes.json();
    if (!proposeRes.ok) {
      throw new Error(proposeData?.error || `wake_muse propose ${proposeRes.status}`);
    }
    if (!proposeData?.proposal) {
      return {
        output: `The muse declined to paint: ${proposeData?.reason ?? "no proposal returned"}`,
        metadata: { provider: proposeData?.provider },
      };
    }

    // Pick the prompt + renderMode. With alternatives, take the first one.
    const proposal = proposeData.proposal as {
      action?: "new" | "refine";
      targetUuid?: string | null;
      renderMode: "mood" | "infographic" | null;
      prompt: string | null;
      alternatives?: Array<{ label: string; renderMode: "mood" | "infographic"; prompt: string; rationale: string }> | null;
    };
    let chosenPrompt: string | null = proposal.prompt;
    let chosenRenderMode: "mood" | "infographic" | null = proposal.renderMode;
    let chosenLabel: string | undefined;
    if (!chosenPrompt && proposal.alternatives && proposal.alternatives.length > 0) {
      chosenPrompt = proposal.alternatives[0].prompt;
      chosenRenderMode = proposal.alternatives[0].renderMode;
      chosenLabel = proposal.alternatives[0].label;
    }
    if (!chosenPrompt || !chosenRenderMode) {
      return {
        output: `The muse proposed something but it could not be parsed.`,
        metadata: { provider: proposeData?.provider },
      };
    }

    // Step 2: paint via generate / source=proposal, forwarding linkage +
    // the alternative's label as a styleHint.
    const genRes = await fetch("/api/chat-hourglass/muse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "generate",
        source: "proposal",
        prompt: chosenPrompt,
        renderMode: chosenRenderMode,
        targetUuid: proposal.targetUuid ?? undefined,
        styleHint: chosenLabel,
        commit_hash: commitHash,
        document_id: documentId,
        portfolio_project_id: portfolioProjectId,
      }),
    });
    const genData = await genRes.json();
    if (!genRes.ok || !genData?.artifactRef) {
      throw new Error(genData?.error || `wake_muse generate ${genRes.status}`);
    }

    const ref = genData.artifactRef as { uuid: string; thumbUrl?: string; renderMode?: string };
    const altCount = proposal.alternatives?.length ?? 1;
    const variant = chosenLabel ? ` · ${chosenLabel}` : "";
    return {
      output: `🎨 The muse painted ${altCount > 1 ? `the first of ${altCount} variants` : "her proposal"}${variant} (${ref.renderMode ?? chosenRenderMode}) — on your shelf.`,
      metadata: {
        artifactRef: genData.artifactRef,
        images: ref.thumbUrl ? [ref.thumbUrl] : [],
        uuid: ref.uuid,
        thumbUrl: ref.thumbUrl,
        renderMode: ref.renderMode,
        provider: genData.provider,
        prompt: chosenPrompt,
      },
    };
  },

  /**
   * `link_artifact` — retroactively attach an existing artifact (by UUID)
   * to a journal entry, document, or portfolio project. Hits the
   * /api/registry/link route which updates media_assets linkage columns
   * and re-derives `destination`.
   */
  link_artifact: async (args) => {
    const uuid = String(args.uuid ?? "");
    const targetKind = args.target_kind as "journal" | "document" | "portfolio";
    const targetId = String(args.target_id ?? "");
    if (!uuid || !targetKind || !targetId) {
      throw new Error("link_artifact: uuid + target_kind + target_id are required");
    }

    const res = await fetch("/api/registry/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uuid,
        target: { kind: targetKind, id: targetId },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || `link_artifact ${res.status}`);
    }

    const linked = data.linked as { kind: string; sourceId: string; title?: string };
    return {
      output: `🔗 Linked artifact ${uuid.slice(0, 8)}… to ${linked.kind}: ${linked.title ?? linked.sourceId}`,
      metadata: {
        uuid,
        linked,
      },
    };
  },
};
