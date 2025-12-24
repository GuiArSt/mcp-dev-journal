/**
 * Hermes - The Messenger Who Translates
 * A poetic AI translator that learns your translation preferences
 */

import { z } from "zod";

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Clarification Question - for ambiguous translations
 */
export const ClarificationQuestionSchema = z.object({
  question: z
    .string()
    .describe(
      "A clarifying question when the text has cultural nuance, idioms, or multiple valid interpretations"
    ),
  context: z
    .string()
    .describe("Brief explanation of why this clarification is needed"),
  options: z
    .array(z.string())
    .min(2)
    .max(3)
    .describe(
      "2-3 quick-select options (A, B, C style). User can also provide free text."
    ),
});

/**
 * Translation Response - main output from Hermes
 */
export const TranslationResponseSchema = z.object({
  translatedText: z
    .string()
    .describe(
      "The translated text. Natural, fluent, and appropriate for the requested tone. Preserve formatting and structure."
    ),
  hadChanges: z
    .boolean()
    .describe(
      "True if translation was performed, false if source and target language are the same"
    ),
  clarificationQuestions: z
    .array(ClarificationQuestionSchema)
    .max(3)
    .optional()
    .describe(
      "RARELY used. Only ask when genuine ambiguity exists (idioms, cultural nuance, multiple interpretations). Most translations need no questions. Max 3 questions."
    ),
  notes: z
    .string()
    .optional()
    .describe(
      "Brief translator's note if there's something important about the translation (e.g., cultural context, untranslatable wordplay)"
    ),
});

/**
 * Memory Extraction - extracted learnings from user's edits
 */
export const MemoryExtractionSchema = z.object({
  mainChanges: z
    .array(z.string())
    .describe(
      "What the user changed from AI translation to their final version. Be specific about each change."
    ),
  newPatterns: z
    .array(z.string())
    .describe(
      "Translation preferences observed: formality adjustments, idiom preferences, cultural adaptations, regional variations, etc."
    ),
  suggestedLabel: z
    .string()
    .describe(
      "Content type: Business email, Casual chat, Technical documentation, Literary, Marketing, etc."
    ),
  protectedTerms: z
    .array(z.string())
    .describe(
      "Terms the user kept untranslated or in specific forms (brand names, technical terms, proper nouns)"
    ),
});

// ============================================================================
// Types
// ============================================================================

export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>;
export type TranslationResponse = z.infer<typeof TranslationResponseSchema>;
export type MemoryExtraction = z.infer<typeof MemoryExtractionSchema>;

export type TranslationTone = "formal" | "neutral" | "slang";

export interface HermesMemoryEntry {
  content: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  tags: string[];
  createdAt: string;
}

export interface HermesMemory {
  protectedTerms: Array<{
    term: string;
    preserveAs?: string;
    sourceLanguage?: string;
  }>;
  memories: HermesMemoryEntry[];
  totalTranslations: number;
  languagePairs: Record<string, number>; // e.g., {"en-es": 5, "de-en": 3}
}

// ============================================================================
// Language Utilities
// ============================================================================

export const SUPPORTED_LANGUAGES = {
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
  cs: "Czech",
  el: "Greek",
  he: "Hebrew",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  uk: "Ukrainian",
  ro: "Romanian",
  hu: "Hungarian",
  ca: "Catalan",
} as const;

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;

export function getLanguageName(code: string): string {
  return SUPPORTED_LANGUAGES[code as LanguageCode] || code;
}

// ============================================================================
// The Poem of Hermes (System Prompt)
// ============================================================================

const HERMES_POEM = `Stick and balance
The tools of your trade
Wings in your feet
Suaveness in your words
The great messenger, the one who understands both divine and mundane.

The messenger, the communicator
You bring the word of gods to kings and peasants.

Translate then, Hermes
For once you flew between domains
Today you fly between languages.

May Babylon fear you
For you are the cupule of the tower
Stealing the multitudinous understanding
and bringing trade and connection to the children of the earth.

Translate then, from English to French,
From Spanish to German.
The systematic trappings of meaning of humans are your trade
From one to another
You do not translate directly
For you understand the soul more than the mechanic
You see language as a tool
Shaped differently to work differently in each trade.

Translate, teach and show us how to build the bridge
May we follow your wings into communion.

---

When clarity wavers and meaning forks—
Only then does Hermes pause and ask.
Better to clarify than to corrupt.

Adapt the tone requested:
Formal for the court of kings
Neutral for the marketplace of ideas
Slang for the tavern of friends

From me you will learn preferences:
Which idioms to keep, which to transform
Which terms are sacred and untranslatable
Which expressions make me, me.`;

// ============================================================================
// Memory Injection
// ============================================================================

/**
 * Build the memory injection section for the system prompt
 */
export function buildMemoryInjection(memory: HermesMemory): string {
  const sections: string[] = [];

  // Protected terms (don't translate these)
  if (memory.protectedTerms.length > 0) {
    const termsList = memory.protectedTerms
      .map((t) => {
        if (t.preserveAs) {
          return `${t.term} → ${t.preserveAs}`;
        }
        return t.term;
      })
      .join(", ");
    sections.push(
      `**Sacred Terms (preserve these, never translate):**\n${termsList}`
    );
  }

  // Memories/learnings
  if (memory.memories.length > 0) {
    const recentMemories = memory.memories.slice(-20); // Last 20 memories
    const memoryList = recentMemories
      .map((m) => {
        const langs =
          m.sourceLanguage && m.targetLanguage
            ? ` [${m.sourceLanguage}→${m.targetLanguage}]`
            : "";
        const tags = m.tags.length > 0 ? ` (${m.tags.join(", ")})` : "";
        return `- ${m.content}${langs}${tags}`;
      })
      .join("\n");
    sections.push(`**Learned Preferences:**\n${memoryList}`);
  }

  // Stats
  if (memory.totalTranslations > 0) {
    const topPairs = Object.entries(memory.languagePairs)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([pair, count]) => `${pair}: ${count}`)
      .join(", ");
    sections.push(
      `**Journey Together:** ${memory.totalTranslations} messages carried${topPairs ? ` (${topPairs})` : ""}`
    );
  }

  if (sections.length === 0) {
    return "\n(No memories yet. This is our first crossing.)";
  }

  return "\n" + sections.join("\n\n");
}

/**
 * Get the complete Hermes system prompt
 */
export function getHermesSystemPrompt(memory: HermesMemory): string {
  const memorySection = buildMemoryInjection(memory);
  return HERMES_POEM + memorySection;
}

/**
 * Build the user prompt for translation
 */
export function buildTranslationUserPrompt(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  tone: TranslationTone,
  answers?: Record<string, string>
): string {
  const toneDescriptions: Record<TranslationTone, string> = {
    formal:
      "Use formal register. Professional, polished, suitable for business or official contexts.",
    neutral:
      "Use neutral register. Natural and conversational, neither too formal nor too casual.",
    slang:
      "Use informal/slang register. Casual, friendly, use colloquialisms and expressions as appropriate.",
  };

  let prompt = `Translate the following from ${getLanguageName(sourceLanguage)} to ${getLanguageName(targetLanguage)}.

**Tone:** ${tone.charAt(0).toUpperCase() + tone.slice(1)}
${toneDescriptions[tone]}

--------

${text}`;

  if (answers && Object.keys(answers).length > 0) {
    const answersText = Object.entries(answers)
      .map(([question, answer]) => `Q: ${question}\nA: ${answer}`)
      .join("\n\n");
    prompt += `\n\n--------\n\nClarifications provided:\n${answersText}`;
  }

  return prompt;
}

/**
 * Build the user prompt for memory extraction
 */
export function buildExtractionUserPrompt(
  aiTranslation: string,
  userFinal: string,
  sourceLanguage: string,
  targetLanguage: string
): string {
  return `Analyze the differences between my AI translation and my final version.
Extract what I changed and what patterns this reveals about my translation preferences.

**Source Language:** ${getLanguageName(sourceLanguage)}
**Target Language:** ${getLanguageName(targetLanguage)}

**AI Translation (what Hermes produced):**
${aiTranslation}

**My Final Version (what I actually used):**
${userFinal}

Identify what I changed, why I might have changed it, and what this tells you about my translation preferences.`;
}

// ============================================================================
// Default Memory
// ============================================================================

export function getDefaultHermesMemory(): HermesMemory {
  return {
    protectedTerms: [
      { term: "API" },
      { term: "JSON" },
      { term: "SQL" },
      { term: "CLI" },
      { term: "SDK" },
      { term: "TypeScript" },
      { term: "JavaScript" },
      { term: "React" },
      { term: "Next.js" },
      { term: "Node.js" },
      { term: "MCP" },
      { term: "Supabase" },
      { term: "GitHub" },
      { term: "GitLab" },
    ],
    memories: [],
    totalTranslations: 0,
    languagePairs: {},
  };
}
