/**
 * Summary coverage + staleness across Kronus-indexed entities.
 * Stale = content updated after summary was last generated.
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
import { eq } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { initConversationsTable } from "@/lib/db-conversations";

export type SummarySourceType =
  | "writing"
  | "portfolio"
  | "skill"
  | "experience"
  | "education"
  | "journal"
  | "repository_overview"
  | "linear_project"
  | "linear_issue"
  | "slite"
  | "notion"
  | "chat";

export interface SummaryFreshnessRow {
  source: SummarySourceType;
  id: string;
  title: string;
  hasSummary: boolean;
  contentUpdatedAt: string | null;
  summaryUpdatedAt: string | null;
  /** True when content was saved after the last summary generation. */
  isStale: boolean;
}

export interface SummaryFreshnessReport {
  total: number;
  withSummary: number;
  missingSummary: number;
  stale: number;
  bySource: Record<
    string,
    { total: number; withSummary: number; missingSummary: number; stale: number }
  >;
  items: SummaryFreshnessRow[];
}

function isStale(contentUpdatedAt: string | null, summaryUpdatedAt: string | null): boolean {
  if (!contentUpdatedAt || !summaryUpdatedAt) return false;
  return new Date(contentUpdatedAt).getTime() > new Date(summaryUpdatedAt).getTime();
}

function bump(
  bySource: SummaryFreshnessReport["bySource"],
  source: string,
  row: SummaryFreshnessRow,
): void {
  if (!bySource[source]) {
    bySource[source] = { total: 0, withSummary: 0, missingSummary: 0, stale: 0 };
  }
  const b = bySource[source];
  b.total += 1;
  if (row.hasSummary) b.withSummary += 1;
  else b.missingSummary += 1;
  if (row.isStale) b.stale += 1;
}

export async function buildSummaryFreshnessReport(): Promise<SummaryFreshnessReport> {
  const db = getDrizzleDb();
  const items: SummaryFreshnessRow[] = [];
  const bySource: SummaryFreshnessReport["bySource"] = {};

  const writings = db
    .select({
      slug: documents.slug,
      title: documents.title,
      summary: documents.summary,
      updatedAt: documents.updatedAt,
      summaryUpdatedAt: documents.summaryUpdatedAt,
    })
    .from(documents)
    .where(eq(documents.type, "writing"))
    .all();
  for (const w of writings) {
    const row: SummaryFreshnessRow = {
      source: "writing",
      id: w.slug,
      title: w.title,
      hasSummary: !!w.summary?.trim(),
      contentUpdatedAt: w.updatedAt,
      summaryUpdatedAt: w.summaryUpdatedAt,
      isStale: false,
    };
    row.isStale = isStale(row.contentUpdatedAt, row.summaryUpdatedAt);
    items.push(row);
    bump(bySource, "writing", row);
  }

  for (const p of db.select().from(portfolioProjects).all()) {
    const row: SummaryFreshnessRow = {
      source: "portfolio",
      id: p.id,
      title: p.title,
      hasSummary: !!p.summary?.trim(),
      contentUpdatedAt: p.updatedAt,
      summaryUpdatedAt: p.summaryUpdatedAt,
      isStale: false,
    };
    row.isStale = isStale(row.contentUpdatedAt, row.summaryUpdatedAt);
    items.push(row);
    bump(bySource, "portfolio", row);
  }

  for (const s of db.select().from(skills).all()) {
    const row: SummaryFreshnessRow = {
      source: "skill",
      id: s.id,
      title: s.name,
      hasSummary: !!s.summary?.trim(),
      contentUpdatedAt: null,
      summaryUpdatedAt: s.summaryUpdatedAt,
      isStale: false,
    };
    items.push(row);
    bump(bySource, "skill", row);
  }

  for (const j of db.select().from(workExperience).all()) {
    const row: SummaryFreshnessRow = {
      source: "experience",
      id: j.id,
      title: `${j.title} @ ${j.company}`,
      hasSummary: !!j.summary?.trim(),
      contentUpdatedAt: null,
      summaryUpdatedAt: j.summaryUpdatedAt,
      isStale: false,
    };
    items.push(row);
    bump(bySource, "experience", row);
  }

  for (const e of db.select().from(education).all()) {
    const row: SummaryFreshnessRow = {
      source: "education",
      id: e.id,
      title: `${e.degree} — ${e.institution}`,
      hasSummary: !!e.summary?.trim(),
      contentUpdatedAt: null,
      summaryUpdatedAt: e.summaryUpdatedAt,
      isStale: false,
    };
    items.push(row);
    bump(bySource, "education", row);
  }

  for (const entry of db.select().from(journalEntries).all()) {
    const row: SummaryFreshnessRow = {
      source: "journal",
      id: entry.commitHash,
      title: `${entry.repository} · ${entry.commitHash.substring(0, 7)}`,
      hasSummary: !!entry.summary?.trim(),
      contentUpdatedAt: entry.createdAt,
      summaryUpdatedAt: entry.summaryUpdatedAt,
      isStale: false,
    };
    row.isStale = isStale(row.contentUpdatedAt, row.summaryUpdatedAt);
    items.push(row);
    bump(bySource, "journal", row);
  }

  try {
    for (const o of db.select().from(repositoryOverviews).all()) {
      const row: SummaryFreshnessRow = {
        source: "repository_overview",
        id: o.repository,
        title: o.repository,
        hasSummary: !!o.summary?.trim(),
        contentUpdatedAt: o.updatedAt,
        summaryUpdatedAt: o.summaryUpdatedAt,
        isStale: false,
      };
      row.isStale = isStale(row.contentUpdatedAt, row.summaryUpdatedAt);
      items.push(row);
      bump(bySource, "repository_overview", row);
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
      const row: SummaryFreshnessRow = {
        source: "linear_project",
        id: p.id,
        title: p.name,
        hasSummary: !!p.summary?.trim(),
        contentUpdatedAt: p.updatedAt ?? p.syncedAt,
        summaryUpdatedAt: p.summaryUpdatedAt,
        isStale: false,
      };
      row.isStale = isStale(row.contentUpdatedAt, row.summaryUpdatedAt);
      items.push(row);
      bump(bySource, "linear_project", row);
    }

    const linIssues = await db
      .select()
      .from(linearIssues)
      .where(eq(linearIssues.isDeleted, false));
    for (const i of linIssues) {
      const row: SummaryFreshnessRow = {
        source: "linear_issue",
        id: i.id,
        title: i.identifier ? `${i.identifier}: ${i.title}` : i.title,
        hasSummary: !!i.summary?.trim(),
        contentUpdatedAt: i.updatedAt ?? i.syncedAt,
        summaryUpdatedAt: i.summaryUpdatedAt,
        isStale: false,
      };
      row.isStale = isStale(row.contentUpdatedAt, row.summaryUpdatedAt);
      items.push(row);
      bump(bySource, "linear_issue", row);
    }
  } catch {
    /* optional */
  }

  try {
    const notes = await db
      .select()
      .from(sliteNotes)
      .where(eq(sliteNotes.isDeleted, false));
    for (const n of notes) {
      const row: SummaryFreshnessRow = {
        source: "slite",
        id: n.id,
        title: n.title,
        hasSummary: !!n.summary?.trim(),
        contentUpdatedAt: n.updatedAt ?? n.lastEditedAt,
        summaryUpdatedAt: n.summaryUpdatedAt,
        isStale: false,
      };
      row.isStale = isStale(row.contentUpdatedAt, row.summaryUpdatedAt);
      items.push(row);
      bump(bySource, "slite", row);
    }

    const pages = await db
      .select()
      .from(notionPages)
      .where(eq(notionPages.isDeleted, false));
    for (const p of pages) {
      const row: SummaryFreshnessRow = {
        source: "notion",
        id: p.id,
        title: p.title,
        hasSummary: !!p.summary?.trim(),
        contentUpdatedAt: p.updatedAt ?? p.lastEditedAt,
        summaryUpdatedAt: p.summaryUpdatedAt,
        isStale: false,
      };
      row.isStale = isStale(row.contentUpdatedAt, row.summaryUpdatedAt);
      items.push(row);
      bump(bySource, "notion", row);
    }
  } catch {
    /* optional */
  }

  initConversationsTable();
  const sqlite = getDatabase();
  const chats = sqlite
    .prepare(
      `SELECT id, title, summary, updated_at, summary_updated_at FROM chat_conversations ORDER BY updated_at DESC LIMIT 200`,
    )
    .all() as Array<{
    id: number;
    title: string;
    summary: string | null;
    updated_at: string;
    summary_updated_at: string | null;
  }>;
  for (const c of chats) {
    const row: SummaryFreshnessRow = {
      source: "chat",
      id: String(c.id),
      title: c.title || "Untitled",
      hasSummary: !!c.summary?.trim(),
      contentUpdatedAt: c.updated_at,
      summaryUpdatedAt: c.summary_updated_at,
      isStale: isStale(c.updated_at, c.summary_updated_at),
    };
    items.push(row);
    bump(bySource, "chat", row);
  }

  const withSummary = items.filter((i) => i.hasSummary).length;
  const stale = items.filter((i) => i.isStale).length;

  return {
    total: items.length,
    withSummary,
    missingSummary: items.length - withSummary,
    stale,
    bySource,
    items,
  };
}
