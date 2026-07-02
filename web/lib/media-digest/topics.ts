/**
 * Topic taxonomy for the daily media digest.
 *
 * Each topic drives one or more web searches. Queries are written to surface
 * recent, high-signal items. For political/geopolitical topics the queries
 * deliberately pull across the spectrum (right, left, state, sensationalist)
 * so the Kronus-lite pass can weigh and balance them by importance.
 *
 * Kept in code for v1; structured so it can move to a DB table later.
 */

export interface MediaTopic {
  id: string;
  label: string;
  /** Relative weight (higher = more items kept). 1-5. */
  weight: number;
  queries: string[];
}

export const MEDIA_DIGEST_TOPICS: MediaTopic[] = [
  {
    id: "ai-coding-tools",
    label: "AI Coding Tools",
    weight: 5,
    queries: [
      "latest news Claude Code, OpenAI Codex, Cursor editor updates this week",
      "Canva new features and AI updates this week",
      "AI coding agents and IDE tooling changes, terms of service updates this week",
    ],
  },
  {
    id: "frontier-models",
    label: "Frontier Models & AI Race",
    weight: 5,
    queries: [
      "new frontier AI model release OpenAI Anthropic Google DeepMind this week",
      "AGI progress and AI race news, Claude ChatGPT Gemini updates this week",
    ],
  },
  {
    id: "deep-science-ai",
    label: "Deep Learning Science",
    weight: 4,
    queries: [
      "new machine learning research papers training methods breakthrough this week arXiv",
      "notable explanations of new LLM training techniques and architectures this week",
    ],
  },
  {
    id: "space-frontier",
    label: "Space & Frontier Physics",
    weight: 4,
    queries: [
      "space exploration news, black hole discoveries, frontier astrophysics this week",
      "SETI, UAP and credible alien signal news, serious coverage this week",
    ],
  },
  {
    id: "physics-quantum",
    label: "CERN & Quantum",
    weight: 3,
    queries: [
      "CERN particle physics news and quantum computing breakthroughs this week",
    ],
  },
  {
    id: "gaming",
    label: "Gaming & Indie",
    weight: 3,
    queries: [
      "biggest new video game releases and announcements this week",
      "breakthrough indie game titles getting attention this week",
    ],
  },
  {
    id: "geopolitics",
    label: "Geopolitics",
    weight: 4,
    queries: [
      "major geopolitical decisions, treaties, military actions this week, balanced sources",
      "geopolitics news this week from right-wing, left-wing and state media perspectives",
    ],
  },
  {
    id: "politics-bolivia",
    label: "Bolivia",
    weight: 4,
    queries: [
      "Bolivia politics and major current events this week, multiple perspectives",
    ],
  },
  {
    id: "politics-germany",
    label: "Germany",
    weight: 3,
    queries: [
      "Germany politics, policy changes and major news this week, multiple perspectives",
    ],
  },
  {
    id: "politics-france",
    label: "France",
    weight: 3,
    queries: [
      "France politics, policy changes and major news this week, multiple perspectives",
    ],
  },
  {
    id: "typescript-fullstack",
    label: "TypeScript & Frameworks",
    weight: 3,
    queries: [
      "TypeScript, Node.js, React and Next.js framework updates and releases this week",
    ],
  },
  {
    id: "security-tools",
    label: "Security & My Stack",
    weight: 3,
    queries: [
      "Google services and Gmail changes, terms of service updates this week",
      "NordVPN NordPass and consumer privacy security news this week",
    ],
  },
];
