/**
 * Kronus Lite — baseline context when no skill is active.
 * Injects compact summary lines for indexed library/cache rows (not full bodies).
 * Full sections load only when a skill or manual soul toggle enables them.
 */
import {
  getDrizzleDb,
  documents,
  portfolioProjects,
  skills,
  workExperience,
  education,
  journalEntries,
  linearProjects,
  linearIssues,
  sliteNotes,
  notionPages,
  repositoryOverviews,
} from "@/lib/db/drizzle";
import { eq, desc } from "drizzle-orm";
import { listChatIndex } from "@/lib/chat-memory";
import { estimateTokens } from "@/lib/chat-text-cleaner";

export interface LiteSummaryLine {
  source: string;
  id: string;
  title: string;
  summary: string | null;
  hasSummary: boolean;
}

export async function collectKronusLiteSummaryLines(): Promise<LiteSummaryLine[]> {
  const db = getDrizzleDb();
  const lines: LiteSummaryLine[] = [];

  const writings = db.select({ slug: documents.slug, title: documents.title, summary: documents.summary })
    .from(documents)
    .where(eq(documents.type, "writing"))
    .all();
  for (const w of writings) {
    lines.push({
      source: "writing",
      id: w.slug,
      title: w.title,
      summary: w.summary,
      hasSummary: !!w.summary?.trim(),
    });
  }

  const projects = db.select().from(portfolioProjects).all();
  for (const p of projects) {
    lines.push({
      source: "portfolio",
      id: p.id,
      title: p.title,
      summary: p.summary,
      hasSummary: !!p.summary?.trim(),
    });
  }

  for (const s of db.select().from(skills).all()) {
    lines.push({
      source: "skill",
      id: s.id,
      title: s.name,
      summary: s.summary,
      hasSummary: !!s.summary?.trim(),
    });
  }

  for (const j of db.select().from(workExperience).all()) {
    lines.push({
      source: "experience",
      id: j.id,
      title: `${j.title} @ ${j.company}`,
      summary: j.summary,
      hasSummary: !!j.summary?.trim(),
    });
  }

  for (const e of db.select().from(education).all()) {
    lines.push({
      source: "education",
      id: e.id,
      title: `${e.degree} — ${e.institution}`,
      summary: e.summary,
      hasSummary: !!e.summary?.trim(),
    });
  }

  const entries = db.select().from(journalEntries).orderBy(desc(journalEntries.date)).limit(80).all();
  for (const entry of entries) {
    lines.push({
      source: "journal",
      id: entry.commitHash,
      title: `${entry.repository} · ${entry.commitHash.substring(0, 7)}`,
      summary: entry.summary,
      hasSummary: !!entry.summary?.trim(),
    });
  }

  try {
    const overviews = db.select().from(repositoryOverviews).all();
    for (const o of overviews) {
      lines.push({
        source: "repository_overview",
        id: o.repository,
        title: o.repository,
        summary: o.summary,
        hasSummary: !!o.summary?.trim(),
      });
    }
  } catch {
    /* optional */
  }

  try {
    const linProjects = await db
      .select()
      .from(linearProjects)
      .where(eq(linearProjects.isDeleted, false));
    for (const p of linProjects) {
      lines.push({
        source: "linear_project",
        id: p.id,
        title: p.name,
        summary: p.summary,
        hasSummary: !!p.summary?.trim(),
      });
    }

    const linIssues = await db
      .select()
      .from(linearIssues)
      .where(eq(linearIssues.isDeleted, false))
      .limit(120);
    for (const i of linIssues) {
      lines.push({
        source: "linear_issue",
        id: i.id,
        title: i.identifier ? `${i.identifier}: ${i.title}` : i.title,
        summary: i.summary,
        hasSummary: !!i.summary?.trim(),
      });
    }
  } catch {
    /* linear cache optional */
  }

  try {
    const notes = await db
      .select()
      .from(sliteNotes)
      .where(eq(sliteNotes.isDeleted, false))
      .orderBy(desc(sliteNotes.lastEditedAt))
      .limit(80);
    for (const n of notes) {
      lines.push({
        source: "slite",
        id: n.id,
        title: n.title,
        summary: n.summary,
        hasSummary: !!n.summary?.trim(),
      });
    }

    const pages = await db
      .select()
      .from(notionPages)
      .where(eq(notionPages.isDeleted, false))
      .orderBy(desc(notionPages.lastEditedAt))
      .limit(80);
    for (const p of pages) {
      lines.push({
        source: "notion",
        id: p.id,
        title: p.title,
        summary: p.summary,
        hasSummary: !!p.summary?.trim(),
      });
    }
  } catch {
    /* integrations optional */
  }

  const chatIndex = listChatIndex({ limit: 200, offset: 0 });
  for (const c of chatIndex.conversations) {
    lines.push({
      source: "chat",
      id: String(c.id),
      title: c.title,
      summary: c.summary,
      hasSummary: !!c.summary?.trim(),
    });
  }

  return lines;
}

export async function buildKronusLiteSummaryIndex(): Promise<{ content: string; tokenEstimate: number }> {
  const lines = await collectKronusLiteSummaryLines();
  const withSummary = lines.filter((l) => l.hasSummary);
  const missing = lines.length - withSummary.length;

  if (lines.length === 0) {
    return { content: "", tokenEstimate: 0 };
  }

  const grouped = new Map<string, LiteSummaryLine[]>();
  for (const line of withSummary) {
    if (!grouped.has(line.source)) grouped.set(line.source, []);
    grouped.get(line.source)!.push(line);
  }

  const sections: string[] = [
    `## Kronus Lite — Summary Index (${withSummary.length} indexed, ${missing} without summary)`,
    "",
    "You are in **Kronus Lite** mode: no skill is active. You have **summaries only** for the items below — not full document bodies.",
    "Use repository, journal, Linear, Slite, Notion, or memory tools when you need full content. Activate a skill or enable a soul section for deeper injected context.",
    "",
  ];

  for (const [source, items] of grouped) {
    const block = items
      .map((item) => `- **${item.title}** (\`${item.id}\`): ${item.summary}`)
      .join("\n");
    sections.push(`### ${source} (${items.length})\n${block}\n`);
  }

  if (missing > 0) {
    sections.push(
      `_Note: ${missing} items have no summary yet — run library backfill or open Monitor → summaries._`,
    );
  }

  const content = sections.join("\n");
  return { content, tokenEstimate: estimateTokens(content) };
}
