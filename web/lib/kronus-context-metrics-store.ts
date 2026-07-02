import fs from "fs";
import path from "path";
import { getDatabase } from "@/lib/db";
import type { KronusContextStats } from "@/lib/kronus-context-stats";
import { KRONUS_CONTEXT_SECTION_SEED } from "@/lib/kronus-context-taxonomy";
import { computeKronusSoulSectionMetrics } from "@/lib/kronus-soul-metrics";

const META_ID = 1;

export interface ContextSectionMetric {
  section_key: string;
  label: string;
  category: string;
  soul_config_key: string | null;
  source_tables: string[];
  sort_order: number;
  item_count: number;
  token_estimate: number;
  breakdown: Record<string, unknown>;
  computed_at: string;
}

let initDone = false;

function resolveMigrationPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "web/lib/db/migrations/024_kronus_context_section_metrics.sql"),
    path.join(process.cwd(), "lib/db/migrations/024_kronus_context_section_metrics.sql"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function initContextMetricsSchema(): void {
  if (initDone) return;
  const db = getDatabase();
  const migrationFile = resolveMigrationPath();
  if (migrationFile) {
    db.exec(fs.readFileSync(migrationFile, "utf-8"));
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kronus_context_sections (
        section_key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'soul',
        soul_config_key TEXT,
        source_tables TEXT NOT NULL DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS kronus_context_section_metrics (
        section_key TEXT PRIMARY KEY REFERENCES kronus_context_sections(section_key),
        item_count INTEGER NOT NULL DEFAULT 0,
        token_estimate INTEGER NOT NULL DEFAULT 0,
        breakdown_json TEXT NOT NULL DEFAULT '{}',
        computed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS kronus_context_metrics_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        stale INTEGER NOT NULL DEFAULT 1,
        computed_at TEXT
      );
      INSERT OR IGNORE INTO kronus_context_metrics_meta (id, stale) VALUES (1, 1);
    `);
  }

  const insertTaxonomy = db.prepare(`
    INSERT OR REPLACE INTO kronus_context_sections
      (section_key, label, category, soul_config_key, source_tables, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const beforeCount = (
    db.prepare(`SELECT COUNT(*) as count FROM kronus_context_sections`).get() as { count: number }
  ).count;
  for (const row of KRONUS_CONTEXT_SECTION_SEED) {
    insertTaxonomy.run(
      row.section_key,
      row.label,
      row.category,
      row.soul_config_key,
      JSON.stringify(row.source_tables),
      row.sort_order,
    );
  }
  const afterCount = (
    db.prepare(`SELECT COUNT(*) as count FROM kronus_context_sections`).get() as { count: number }
  ).count;
  if (afterCount > beforeCount) {
    markKronusContextMetricsStale();
  }

  initDone = true;
}

export function markKronusContextMetricsStale(): void {
  initContextMetricsSchema();
  getDatabase()
    .prepare(`UPDATE kronus_context_metrics_meta SET stale = 1 WHERE id = ?`)
    .run(META_ID);
}

function persistMetricsFromStats(stats: KronusContextStats, computedAt: string): void {
  const db = getDatabase();
  const upsert = db.prepare(`
    INSERT INTO kronus_context_section_metrics
      (section_key, item_count, token_estimate, breakdown_json, computed_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(section_key) DO UPDATE SET
      item_count = excluded.item_count,
      token_estimate = excluded.token_estimate,
      breakdown_json = excluded.breakdown_json,
      computed_at = excluded.computed_at
  `);

  const rows: Array<{ key: string; count: number; tokens: number; breakdown: Record<string, unknown> }> = [
    { key: "base_prompt", count: 1, tokens: stats.baseTokens, breakdown: {} },
    { key: "writings", count: stats.writings, tokens: stats.writingsTokens, breakdown: {} },
    { key: "portfolioProjects", count: stats.portfolioProjects, tokens: stats.portfolioProjectsTokens, breakdown: {} },
    { key: "skills", count: stats.skills, tokens: stats.skillsTokens, breakdown: {} },
    { key: "workExperience", count: stats.workExperience, tokens: stats.workExperienceTokens, breakdown: {} },
    { key: "education", count: stats.education, tokens: stats.educationTokens, breakdown: {} },
    { key: "journalEntries", count: stats.journalEntries, tokens: stats.journalEntriesTokens, breakdown: {} },
    {
      key: "chatIndex",
      count: stats.chatIndex,
      tokens: stats.chatIndexTokens,
      breakdown: {
        included: stats.chatIndexIncluded,
        missingSummaryCount: stats.chatIndexMissingSummaries,
      },
    },
    {
      key: "linearProjects",
      count: stats.linearProjects,
      tokens: stats.linearProjectsTokens,
      breakdown: (stats.linear?.projects ?? {}) as Record<string, unknown>,
    },
    {
      key: "linearIssues",
      count: stats.linearIssues,
      tokens: stats.linearIssuesTokens,
      breakdown: (stats.linear?.issues ?? {}) as Record<string, unknown>,
    },
    {
      key: "sliteNotes",
      count: stats.sliteNotes ?? 0,
      tokens: stats.sliteNotesTokens ?? 0,
      breakdown: {},
    },
    {
      key: "notionPages",
      count: stats.notionPages ?? 0,
      tokens: stats.notionPagesTokens ?? 0,
      breakdown: {},
    },
    {
      key: "slackConversations",
      count: stats.slackConversations ?? 0,
      tokens: stats.slackConversationsTokens ?? 0,
      breakdown: {},
    },
  ];

  const tx = db.transaction(() => {
    for (const row of rows) {
      upsert.run(row.key, row.count, row.tokens, JSON.stringify(row.breakdown), computedAt);
    }
    db.prepare(
      `UPDATE kronus_context_metrics_meta SET stale = 0, computed_at = ? WHERE id = ?`,
    ).run(computedAt, META_ID);
  });
  tx();
}

function statsFromSectionRows(sections: ContextSectionMetric[]): KronusContextStats {
  const byKey = Object.fromEntries(sections.map((s) => [s.section_key, s]));

  const projectsBreakdown = byKey.linearProjects?.breakdown as
    | NonNullable<KronusContextStats["linear"]>["projects"]
    | undefined;
  const issuesBreakdown = byKey.linearIssues?.breakdown as
    | NonNullable<KronusContextStats["linear"]>["issues"]
    | undefined;

  const stats: KronusContextStats = {
    writings: byKey.writings?.item_count ?? 0,
    writingsTokens: byKey.writings?.token_estimate ?? 0,
    portfolioProjects: byKey.portfolioProjects?.item_count ?? 0,
    portfolioProjectsTokens: byKey.portfolioProjects?.token_estimate ?? 0,
    skills: byKey.skills?.item_count ?? 0,
    skillsTokens: byKey.skills?.token_estimate ?? 0,
    workExperience: byKey.workExperience?.item_count ?? 0,
    workExperienceTokens: byKey.workExperience?.token_estimate ?? 0,
    education: byKey.education?.item_count ?? 0,
    educationTokens: byKey.education?.token_estimate ?? 0,
    journalEntries: byKey.journalEntries?.item_count ?? 0,
    journalEntriesTokens: byKey.journalEntries?.token_estimate ?? 0,
    chatIndex: byKey.chatIndex?.item_count ?? 0,
    chatIndexTokens: byKey.chatIndex?.token_estimate ?? 0,
    chatIndexIncluded: Number(byKey.chatIndex?.breakdown.included ?? 0),
    chatIndexMissingSummaries: Number(byKey.chatIndex?.breakdown.missingSummaryCount ?? 0),
    linearProjects: byKey.linearProjects?.item_count ?? 0,
    linearProjectsTokens: byKey.linearProjects?.token_estimate ?? 0,
    linearIssues: byKey.linearIssues?.item_count ?? 0,
    linearIssuesTokens: byKey.linearIssues?.token_estimate ?? 0,
    sliteNotes: byKey.sliteNotes?.item_count ?? 0,
    sliteNotesTokens: byKey.sliteNotes?.token_estimate ?? 0,
    notionPages: byKey.notionPages?.item_count ?? 0,
    notionPagesTokens: byKey.notionPages?.token_estimate ?? 0,
    slackConversations: byKey.slackConversations?.item_count ?? 0,
    slackConversationsTokens: byKey.slackConversations?.token_estimate ?? 0,
    baseTokens: byKey.base_prompt?.token_estimate ?? 6000,
    totalTokens: 0,
    totalTokensWithCompleted: 0,
  };

  if (projectsBreakdown || issuesBreakdown) {
    stats.linear = {
      projects: projectsBreakdown ?? {
        total: 0,
        active: 0,
        completed: 0,
        tokensActive: 0,
        tokensAll: 0,
      },
      issues: issuesBreakdown ?? {
        total: 0,
        active: 0,
        completed: 0,
        tokensActive: 0,
        tokensAll: 0,
      },
    };
  }

  stats.totalTokens =
    stats.baseTokens +
    stats.writingsTokens +
    stats.portfolioProjectsTokens +
    stats.skillsTokens +
    stats.workExperienceTokens +
    stats.educationTokens +
    stats.journalEntriesTokens +
    stats.chatIndexTokens +
    stats.linearProjectsTokens +
    stats.linearIssuesTokens +
    (stats.sliteNotesTokens ?? 0) +
    (stats.notionPagesTokens ?? 0) +
    (stats.slackConversationsTokens ?? 0);

  if (stats.linear) {
    stats.totalTokensWithCompleted =
      stats.baseTokens +
      stats.writingsTokens +
      stats.portfolioProjectsTokens +
      stats.skillsTokens +
      stats.workExperienceTokens +
      stats.educationTokens +
      stats.journalEntriesTokens +
      stats.chatIndexTokens +
      stats.linear.projects.tokensAll +
      stats.linear.issues.tokensAll +
      (stats.sliteNotesTokens ?? 0) +
      (stats.notionPagesTokens ?? 0) +
      (stats.slackConversationsTokens ?? 0);
    stats.totalTokensActive =
      stats.baseTokens +
      stats.writingsTokens +
      stats.portfolioProjectsTokens +
      stats.skillsTokens +
      stats.workExperienceTokens +
      stats.educationTokens +
      stats.journalEntriesTokens +
      stats.chatIndexTokens +
      stats.linear.projects.tokensActive +
      stats.linear.issues.tokensActive +
      (stats.sliteNotesTokens ?? 0) +
      (stats.notionPagesTokens ?? 0) +
      (stats.slackConversationsTokens ?? 0);
  }

  return stats;
}

function loadSectionMetrics(): { sections: ContextSectionMetric[]; computedAt: string } | null {
  initContextMetricsSchema();
  const db = getDatabase();
  const rows = db
    .prepare(
      `
    SELECT
      s.section_key,
      s.label,
      s.category,
      s.soul_config_key,
      s.source_tables,
      s.sort_order,
      COALESCE(m.item_count, 0) as item_count,
      COALESCE(m.token_estimate, 0) as token_estimate,
      COALESCE(m.breakdown_json, '{}') as breakdown_json,
      COALESCE(m.computed_at, '') as computed_at
    FROM kronus_context_sections s
    LEFT JOIN kronus_context_section_metrics m ON m.section_key = s.section_key
    ORDER BY s.sort_order ASC
  `,
    )
    .all() as Array<{
    section_key: string;
    label: string;
    category: string;
    soul_config_key: string | null;
    source_tables: string;
    sort_order: number;
    item_count: number;
    token_estimate: number;
    breakdown_json: string;
    computed_at: string;
  }>;

  if (rows.length === 0) return null;
  const computedAt = rows.find((r) => r.computed_at)?.computed_at ?? "";
  if (!computedAt) return null;

  return {
    computedAt,
    sections: rows.map((r) => ({
      section_key: r.section_key,
      label: r.label,
      category: r.category,
      soul_config_key: r.soul_config_key,
      source_tables: JSON.parse(r.source_tables || "[]") as string[],
      sort_order: r.sort_order,
      item_count: r.item_count,
      token_estimate: r.token_estimate,
      breakdown: JSON.parse(r.breakdown_json || "{}") as Record<string, unknown>,
      computed_at: r.computed_at,
    })),
  };
}

function hasIncompleteSectionMetrics(): boolean {
  const db = getDatabase();
  const row = db
    .prepare(
      `
    SELECT COUNT(*) as missing
    FROM kronus_context_sections s
    LEFT JOIN kronus_context_section_metrics m ON m.section_key = s.section_key
    WHERE s.soul_config_key IS NOT NULL
      AND (
        m.section_key IS NULL
        OR m.computed_at IS NULL
        OR TRIM(m.computed_at) = ''
      )
  `,
    )
    .get() as { missing: number };
  return row.missing > 0;
}

export async function getKronusContextMetrics(options?: {
  refresh?: boolean;
}): Promise<{
  stats: KronusContextStats;
  sections: ContextSectionMetric[];
  computedAt: string;
  cached: boolean;
}> {
  initContextMetricsSchema();
  const db = getDatabase();
  const meta = db
    .prepare(`SELECT stale, computed_at FROM kronus_context_metrics_meta WHERE id = ?`)
    .get(META_ID) as { stale: number; computed_at: string | null } | undefined;

  const shouldRecompute =
    options?.refresh === true ||
    !meta ||
    meta.stale === 1 ||
    !meta.computed_at ||
    hasIncompleteSectionMetrics();

  if (!shouldRecompute) {
    const loaded = loadSectionMetrics();
    if (loaded?.sections.some((s) => s.computed_at)) {
      return {
        stats: statsFromSectionRows(loaded.sections),
        sections: loaded.sections,
        computedAt: loaded.computedAt,
        cached: true,
      };
    }
  }

  const stats = await computeKronusSoulSectionMetrics();
  const computedAt = new Date().toISOString();
  persistMetricsFromStats(stats, computedAt);
  const loaded = loadSectionMetrics();

  return {
    stats,
    sections: loaded?.sections ?? [],
    computedAt,
    cached: false,
  };
}
