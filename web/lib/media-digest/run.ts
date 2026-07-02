/**
 * Daily media digest pipeline ("Kronus-lite with web search").
 *
 * Flow: collect (Perplexity per topic) + optional Gmail inbox -> Kronus-lite
 * commentary/ranking (model-catalog + traceAI + structured output) -> persist
 * public_media items + a media_digests row + a mirrored Library note -> register
 * in the object registry so Kronus can discover it.
 */

import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { traceAI } from "@/lib/observability";
import {
  DEFAULT_CHAT_MODEL,
  getChatModelEntry,
  resolveChatModelId,
} from "@/lib/ai/model-catalog";
import { getDatabase } from "@/lib/db";
import { MEDIA_DIGEST_TOPICS } from "./topics";
import {
  clearDigestForDate,
  finalizeDigest,
  getLatestDigest,
  insertMediaItem,
  insertPendingDigest,
  markDigestFailed,
  scoreMediaItem,
  upsertDigestDocument,
  type MediaPerspective,
} from "./db";

const PERPLEXITY_SEARCH_URL = "https://api.perplexity.ai/search";
const MAX_RESULTS_PER_QUERY = 6;

interface CollectedItem {
  url: string | null;
  title: string;
  snippet: string | null;
  publication: string | null;
  topic: string;
  topicLabel: string;
  sourceQuery: string;
  publishedAt: string | null;
  provider: string;
}

interface PerplexityRawResult {
  title?: string;
  url?: string;
  snippet?: string;
  date?: string | null;
  last_updated?: string | null;
}

function resolveModelId(): string {
  return (
    process.env.MEDIA_DIGEST_MODEL_ID ||
    resolveChatModelId(getChatModelEntry(DEFAULT_CHAT_MODEL), process.env)
  );
}

function publicationFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function perplexitySearch(query: string, maxResults: number): Promise<PerplexityRawResult[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY not configured");

  const response = await fetch(PERPLEXITY_SEARCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      search_context_size: "low",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplexity Search API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return Array.isArray(data.results) ? (data.results as PerplexityRawResult[]) : [];
}

/** Search every topic query, dedupe by URL, and return a flat collected list. */
export async function collectTopicMedia(): Promise<{ items: CollectedItem[]; errors: string[] }> {
  const items: CollectedItem[] = [];
  const errors: string[] = [];
  const seenUrls = new Set<string>();

  for (const topic of MEDIA_DIGEST_TOPICS) {
    for (const query of topic.queries) {
      try {
        const results = await perplexitySearch(query, MAX_RESULTS_PER_QUERY);
        for (const r of results) {
          const url = r.url ?? null;
          const key = url ?? `${topic.id}:${r.title ?? ""}`;
          if (seenUrls.has(key)) continue;
          seenUrls.add(key);
          if (!r.title && !url) continue;
          items.push({
            url,
            title: r.title || url || "Untitled",
            snippet: r.snippet?.trim() ? r.snippet.trim().slice(0, 800) : null,
            publication: publicationFromUrl(r.url),
            topic: topic.id,
            topicLabel: topic.label,
            sourceQuery: query,
            publishedAt: r.date || r.last_updated || null,
            provider: "perplexity",
          });
        }
      } catch (error) {
        errors.push(
          `[${topic.id}] "${query.slice(0, 50)}": ${error instanceof Error ? error.message : "search failed"}`,
        );
      }
    }
  }

  return { items, errors };
}

/** Pull a lightweight morning inbox snapshot via the gws CLI. Best-effort. */
export async function collectInbox(): Promise<string | null> {
  try {
    const { gmailListMessages } = await import("@/lib/google/client");
    const messages = await gmailListMessages({
      query: "newer_than:1d -in:chats -category:promotions",
      maxResults: 25,
    });
    if (!messages.length) return null;
    return messages
      .map((m) => `- ${m.subject || "(no subject)"} — ${m.from || "unknown"}${m.date ? ` (${m.date})` : ""}`)
      .join("\n");
  } catch (error) {
    console.warn(
      "[Media Digest] inbox collection skipped:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

const PERSPECTIVES: readonly MediaPerspective[] = [
  "left",
  "right",
  "state",
  "sensationalist",
  "neutral",
  "unknown",
];

const DigestItemSchema = z.object({
  index: z.number().int().describe("0-based index into the provided items list"),
  importance: z.number().int().min(0).max(100).describe("Editorial importance 0-100"),
  perspective: z.enum(PERSPECTIVES as unknown as [string, ...string[]]),
  language: z.string().optional().describe("ISO language code of the source, if known"),
  note: z.string().optional().describe("One-line why-it-matters note"),
});

const DigestSectionSchema = z.object({
  topic: z.string().describe("Topic id this section covers"),
  heading: z.string(),
  commentary: z.string().describe("2-4 sentence Kronus-lite commentary on this topic today"),
  items: z.array(DigestItemSchema),
});

const DigestOutputSchema = z.object({
  title: z.string().describe("Punchy title for today's digest"),
  editorial: z.string().describe("3-5 sentence overall editorial note across all topics"),
  inbox_summary: z.string().nullable().optional().describe("Short summary of the inbox, or null"),
  sections: z.array(DigestSectionSchema),
  dropped_count: z.number().int().optional().describe("Low-importance items intentionally omitted"),
});

export type DigestOutput = z.infer<typeof DigestOutputSchema>;

/** Kronus-lite: rank, tag perspective, and comment on the collected items. */
export async function composeDigest(
  items: CollectedItem[],
  inboxRaw: string | null,
  date: string,
): Promise<DigestOutput> {
  const modelId = resolveModelId();
  const model = google(modelId);

  const itemsBlock = items
    .map(
      (it, i) =>
        `[${i}] (topic: ${it.topic}) ${it.title}\n    source: ${it.publication ?? "unknown"} ${it.url ?? ""}\n    ${it.snippet ?? ""}`,
    )
    .join("\n");

  const topicList = MEDIA_DIGEST_TOPICS.map((t) => `${t.id} (${t.label})`).join(", ");

  const system = `You are Kronus, a sharp personal media editor. You are building Guillermo's daily media digest for ${date}.
Group items into topic sections, rank each by editorial importance (0-100), and tag each item's perspective as one of: left, right, state, sensationalist, neutral, unknown.
Deliberately balance political and geopolitical coverage across the spectrum; do not let one perspective dominate. Drop noise and near-duplicates (count them in dropped_count). Write concise, opinionated, useful commentary. Reference every kept item by its [index].
Valid topic ids: ${topicList}.`;

  const prompt = `Collected items (index, topic, title, source, snippet):

${itemsBlock || "(no items collected)"}

${inboxRaw ? `\nInbox (last 24h, subject — sender):\n${inboxRaw}\n` : "\n(no inbox data)\n"}

Produce the structured digest now.`;

  const result = await traceAI(
    "media-digest:compose",
    modelId,
    () =>
      generateText({
        model,
        output: Output.object({ schema: DigestOutputSchema }),
        system,
        prompt,
      }),
    { date, itemCount: items.length },
    prompt,
    "/api/media-digest/run",
  );

  const parsed = result.output;
  if (!parsed) throw new Error("Digest composition returned no output");
  return parsed;
}

function renderMarkdown(
  date: string,
  output: DigestOutput,
  items: CollectedItem[],
  scoreByIndex: Map<number, { importance: number; perspective: string; note?: string }>,
): string {
  const lines: string[] = [];
  lines.push(`# ${output.title}`);
  lines.push("");
  lines.push(
    `*${date}* · ${items.length} stories · ${output.sections.length} topics · generated by Kronus-lite`,
  );
  lines.push("");
  lines.push(output.editorial);
  lines.push("");

  for (const section of output.sections) {
    if (!section.items.length) continue;
    lines.push(`## ${section.heading}`);
    lines.push("");
    if (section.commentary) {
      lines.push(section.commentary);
      lines.push("");
    }
    const sorted = [...section.items].sort((a, b) => b.importance - a.importance);
    for (const si of sorted) {
      const it = items[si.index];
      if (!it) continue;
      const score = scoreByIndex.get(si.index);
      const perspective = score?.perspective ?? si.perspective;
      const importance = score?.importance ?? si.importance;
      const linked = it.url ? `[${it.title}](${it.url})` : it.title;
      const meta = [it.publication, perspective, `importance ${importance}`]
        .filter(Boolean)
        .join(" · ");
      lines.push(`- **${linked}** — ${meta}`);
      if (si.note) lines.push(`  - ${si.note}`);
    }
    lines.push("");
  }

  if (output.inbox_summary) {
    lines.push("## Inbox");
    lines.push("");
    lines.push(output.inbox_summary);
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

export interface RunDigestResult {
  ok: boolean;
  digestId: number | null;
  date: string;
  itemCount: number;
  documentSlug: string | null;
  searchErrors: string[];
  title?: string;
}

/** Full daily pipeline. Idempotent per date (replaces an existing digest). */
export async function runDailyDigest(): Promise<RunDigestResult> {
  const date = new Date().toISOString().slice(0, 10);
  const db = getDatabase();
  const modelId = resolveModelId();

  const { items, errors } = await collectTopicMedia();
  const inboxRaw = await collectInbox();

  if (items.length === 0) {
    throw new Error(
      `No media collected. Search errors: ${errors.join("; ") || "none reported"}`,
    );
  }

  clearDigestForDate(date, db);
  const digestId = insertPendingDigest(date, modelId, db);

  try {
    // Insert items first so each collected item has a stable row id by index.
    const itemIds: number[] = items.map((it) =>
      insertMediaItem(digestId, {
        url: it.url,
        title: it.title,
        snippet: it.snippet,
        publication: it.publication,
        topic: it.topic,
        topicLabel: it.topicLabel,
        publishedAt: it.publishedAt,
        sourceQuery: it.sourceQuery,
        provider: it.provider,
        metadata: { searchQuery: it.sourceQuery },
      }),
    );

    const output = await composeDigest(items, inboxRaw, date);

    // Apply AI scores back onto the persisted items, keyed by index.
    const scoreByIndex = new Map<
      number,
      { importance: number; perspective: string; note?: string }
    >();
    for (const section of output.sections) {
      for (const si of section.items) {
        const rowId = itemIds[si.index];
        if (rowId == null) continue;
        const perspective = (
          PERSPECTIVES.includes(si.perspective as MediaPerspective)
            ? si.perspective
            : "unknown"
        ) as MediaPerspective;
        scoreMediaItem(
          rowId,
          {
            importance: si.importance,
            perspective,
            language: si.language ?? null,
            note: si.note ?? null,
          },
          db,
        );
        scoreByIndex.set(si.index, {
          importance: si.importance,
          perspective,
          note: si.note,
        });
      }
    }

    const markdown = renderMarkdown(date, output, items, scoreByIndex);
    const slug = `media-digest-${date}`;

    upsertDigestDocument(
      {
        slug,
        title: `Media Digest — ${date}`,
        content: markdown,
        metadata: {
          kind: "media-digest",
          digestDate: date,
          itemCount: items.length,
          model: modelId,
          tags: ["media-digest", "daily-report"],
        },
      },
      db,
    );

    // Persist a JSON section map (topic -> ranked item row ids) for scaling.
    const sectionMap = output.sections.map((section) => ({
      topic: section.topic,
      heading: section.heading,
      commentary: section.commentary,
      itemIds: section.items
        .map((si) => itemIds[si.index])
        .filter((id): id is number => id != null),
    }));

    finalizeDigest(
      digestId,
      {
        title: output.title,
        summary: output.editorial,
        commentary: output.editorial,
        sections: sectionMap,
        inboxSummary: output.inbox_summary ?? null,
        itemCount: items.length,
        documentSlug: slug,
        status: "complete",
      },
      db,
    );

    // Make the digest + the document discoverable by Kronus / registry search.
    try {
      const { registerObject } = await import("@/lib/object-registry");
      registerObject({
        type: "media_digest",
        sourceTable: "media_digests",
        sourceId: String(digestId),
        title: output.title,
        summary: output.editorial,
        tags: ["media-digest", "daily-report", date],
      });
      registerObject({
        type: "document",
        sourceTable: "documents",
        sourceId: slug,
        title: `Media Digest — ${date}`,
        summary: output.editorial,
      });
    } catch {
      /* registry is non-critical */
    }

    try {
      const { markContextMetricsStale } = await import("@/lib/mark-context-metrics-stale");
      markContextMetricsStale();
    } catch {
      /* non-critical */
    }

    return {
      ok: true,
      digestId,
      date,
      itemCount: items.length,
      documentSlug: slug,
      searchErrors: errors,
      title: output.title,
    };
  } catch (error) {
    markDigestFailed(digestId, db);
    throw error;
  }
}

export { getLatestDigest };
