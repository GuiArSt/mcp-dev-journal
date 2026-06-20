export type ChatReasoningProvider = "openai" | "anthropic" | "google";

type ReasoningPart = {
  type?: string;
  text?: string;
  providerOptions?: Record<string, Record<string, unknown> | undefined>;
  providerMetadata?: Record<string, Record<string, unknown> | undefined>;
};

function openAiReasoningMeta(part: ReasoningPart): Record<string, unknown> | undefined {
  return part.providerOptions?.openai ?? part.providerMetadata?.openai;
}

/** OpenAI Responses API reasoning items use rs_ ids; text is often empty. */
export function isOpenAiReasoningPart(part: ReasoningPart): boolean {
  const meta = openAiReasoningMeta(part);
  if (!meta) return false;
  return !!(
    meta.itemId ||
    meta.reasoningEncryptedContent ||
    meta.reasoning_encrypted_content
  );
}

function isAnthropicReasoningPart(part: ReasoningPart): boolean {
  const meta = part.providerOptions?.anthropic ?? part.providerMetadata?.anthropic;
  return !!(meta?.signature || meta?.thinkingSignature);
}

function isGoogleReasoningPart(part: ReasoningPart): boolean {
  const meta = part.providerOptions?.google ?? part.providerMetadata?.google;
  return !!(meta?.thoughtSignature || meta?.thought_signature);
}

/**
 * Returns true when a reasoning part belongs to a provider other than the
 * active chat model provider and should be removed before convertToModelMessages.
 */
export function isForeignReasoningPart(
  part: ReasoningPart,
  targetProvider: ChatReasoningProvider,
): boolean {
  if (part?.type !== "reasoning") return false;

  const openai = isOpenAiReasoningPart(part);
  const anthropic = isAnthropicReasoningPart(part);
  const google = isGoogleReasoningPart(part);

  if (targetProvider === "openai") {
    if (openai) return false;
    return anthropic || google;
  }
  if (targetProvider === "anthropic") {
    if (anthropic) return false;
    return openai || google;
  }
  if (google) return false;
  return openai || anthropic;
}

/** Empty reasoning blobs without native provider metadata cannot be replayed. */
export function shouldKeepReasoningPart(
  part: ReasoningPart,
  targetProvider: ChatReasoningProvider,
): boolean {
  if (part?.type !== "reasoning") return true;
  if (isForeignReasoningPart(part, targetProvider)) return false;

  const text = typeof part.text === "string" ? part.text.trim() : "";
  if (text.length > 0) return true;

  if (targetProvider === "openai") return isOpenAiReasoningPart(part);
  if (targetProvider === "anthropic") return isAnthropicReasoningPart(part);
  return isGoogleReasoningPart(part);
}

/**
 * Reasoning/thinking parts are provider-specific.
 *
 * - Anthropic adaptive reasoning stores signatures on historical parts.
 * - OpenAI Responses API requires rs_ + msg_ pairs — never strip OpenAI
 *   reasoning when the target provider is OpenAI (text is often empty).
 * - Gemini uses thoughtSignature on tool/reasoning metadata.
 */
export function stripIncompatibleReasoningParts<T extends { parts?: unknown[]; content?: unknown }>(
  messages: T[],
  targetProvider: ChatReasoningProvider,
): { messages: T[]; stripped: number } {
  let stripped = 0;
  const repaired = messages.map((message) => {
    const sourceParts = Array.isArray(message?.parts)
      ? message.parts
      : Array.isArray(message?.content)
        ? (message.content as unknown[])
        : null;
    if (!sourceParts) return message;

    const parts = sourceParts.filter((part) => {
      if ((part as ReasoningPart)?.type !== "reasoning") return true;
      if (shouldKeepReasoningPart(part as ReasoningPart, targetProvider)) return true;
      stripped++;
      return false;
    });
    if (parts.length === sourceParts.length) return message;
    return { ...message, parts, content: undefined };
  });
  return { messages: repaired, stripped };
}
