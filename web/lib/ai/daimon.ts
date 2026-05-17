/**
 * Daimon — The Merged Fate-Messenger
 *
 * Combines Atropos (grammar/style correction) and Hermes (translation) into a
 * single pre-send polish step.  One structured-output call on Gemini 3.1 Flash
 * Lite decides whether to correct, translate, or both.
 *
 * The caller sends { text, targetLanguage? }.  If targetLanguage is provided
 * the model translates *and* corrects in one pass; otherwise it only corrects.
 */

import { z } from "zod";
import { getPrompt } from "@/lib/ai/prompt-store";

// ============================================================================
// Zod Schemas  (Anthropic-safe: no .min/.max on arrays)
// ============================================================================

export const DaimonResponseSchema = z.object({
  polishedText: z
    .string()
    .describe(
      "The corrected (and optionally translated) text. Preserve formatting, line breaks, and the author's voice. Only fix real errors — never rewrite style."
    ),
  hadChanges: z
    .boolean()
    .describe("True if the text was modified in any way (correction or translation)"),
  didTranslate: z
    .boolean()
    .describe("True if translation was performed"),
  notes: z
    .string()
    .optional()
    .describe(
      "Brief note only when genuinely useful — e.g. cultural nuance, untranslatable wordplay, or an ambiguity worth flagging. Omit for routine corrections."
    ),
});

export type DaimonResponse = z.infer<typeof DaimonResponseSchema>;

// ============================================================================
// Memory types (shared across Atropos + Hermes tables)
// ============================================================================

export interface DaimonMemory {
  /** Words/terms that must never be "corrected" or translated */
  protectedTerms: string[];
  /** Learned writing patterns from Atropos */
  correctionPatterns: string[];
  /** Learned translation preferences from Hermes */
  translationPatterns: string[];
  /** Stats */
  totalChecks: number;
  totalCorrections: number;
  totalTranslations: number;
}

// ============================================================================
// System prompt
// ============================================================================

const DAIMON_SYSTEM = `You are Daimon — a swift, precise text-polisher that fixes grammar, spelling, and punctuation errors while preserving the author's voice, tone, and formatting.

## Rules
- Fix only genuine errors (typos, grammar, punctuation, spelling).
- Never rewrite for style, rephrase sentences, or add/remove content.
- Preserve markdown, code blocks, line breaks, and whitespace exactly.
- If a word looks like a technical term, brand name, or deliberate stylistic choice, leave it.
- If the text is already correct, return it unchanged with hadChanges: false.

## Translation mode
When a target language is specified:
- Translate the text into the target language.
- Fix errors in the source text *during* translation (don't translate typos literally).
- Match the formality/register of the original.
- Keep technical terms, brand names, and code in their original form unless a well-known localised equivalent exists.
- Set didTranslate: true.

## Protected terms
Never alter these (they may look like misspellings but are intentional):
`;

export function getDaimonSystemPrompt(memory: DaimonMemory): string {
  const base = getPrompt("daimon-system", DAIMON_SYSTEM);
  const sections: string[] = [base];

  if (memory.protectedTerms.length > 0) {
    sections.push(memory.protectedTerms.join(", "));
  }

  if (memory.correctionPatterns.length > 0) {
    sections.push(
      "\n## Learned correction patterns\n" +
        memory.correctionPatterns.map((p) => `- ${p}`).join("\n")
    );
  }

  if (memory.translationPatterns.length > 0) {
    sections.push(
      "\n## Learned translation preferences\n" +
        memory.translationPatterns.map((p) => `- ${p}`).join("\n")
    );
  }

  if (memory.totalChecks > 0) {
    sections.push(
      `\n(${memory.totalChecks} texts checked, ${memory.totalCorrections} corrected, ${memory.totalTranslations} translated)`
    );
  }

  return sections.join("\n");
}

// ============================================================================
// User prompt builder
// ============================================================================

export function buildDaimonUserPrompt(
  text: string,
  targetLanguage?: string | null
): string {
  if (targetLanguage) {
    return `Translate to ${targetLanguage} and correct any errors:\n\n${text}`;
  }
  return `Correct the following:\n\n${text}`;
}

// ============================================================================
// Supported languages (re-exported from Hermes for the UI)
// ============================================================================

export const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  de: "German",
  fr: "French",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  hi: "Hindi",
  tr: "Turkish",
  pl: "Polish",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
};

// ============================================================================
// Default memory
// ============================================================================

export function getDefaultDaimonMemory(): DaimonMemory {
  return {
    protectedTerms: [
      "MCP", "Supabase", "Kronus", "Tartarus", "Atropos", "Hermes", "Daimon",
      "Haiku", "API", "JSON", "SQL", "CLI", "SDK", "TypeScript", "JavaScript",
      "React", "Next.js", "Node.js", "GitHub", "GitLab", "Linear",
    ],
    correctionPatterns: [],
    translationPatterns: [],
    totalChecks: 0,
    totalCorrections: 0,
    totalTranslations: 0,
  };
}
