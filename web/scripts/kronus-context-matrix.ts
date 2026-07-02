import { collectKronusLiteSummaryLines, buildKronusLiteSummaryIndex } from "../lib/ai/kronus-lite";
import { computeKronusSoulSectionMetrics } from "../lib/kronus-soul-metrics";
import { mergeSkillConfigs, type KronusSkill } from "../lib/ai/skills";
import {
  estimateSoulContextTokens,
  SOUL_CONTEXT_SECTIONS,
  type SoulContextSectionKey,
} from "../lib/kronus-context-stats";
import { getDrizzleDb, documents } from "../lib/db/drizzle";
import { eq } from "drizzle-orm";
import { estimateTokens } from "../lib/chat-text-cleaner";

async function main() {
  const lines = await collectKronusLiteSummaryLines();
  const lite = await buildKronusLiteSummaryIndex();
  const stats = await computeKronusSoulSectionMetrics();

  const bySource = new Map<
    string,
    { count: number; withSummary: number; summaryChars: number; lineTokens: number }
  >();
  for (const l of lines) {
    if (!bySource.has(l.source)) {
      bySource.set(l.source, { count: 0, withSummary: 0, summaryChars: 0, lineTokens: 0 });
    }
    const b = bySource.get(l.source)!;
    b.count++;
    if (l.hasSummary) {
      b.withSummary++;
      const line = `- **${l.title}** (\`${l.id}\`): ${l.summary}`;
      b.summaryChars += l.summary?.length ?? 0;
      b.lineTokens += estimateTokens(line);
    }
  }

  const sectionFull: Record<SoulContextSectionKey, { count: number; tokens: number }> = {
    writings: { count: stats.writings, tokens: stats.writingsTokens },
    portfolioProjects: { count: stats.portfolioProjects, tokens: stats.portfolioProjectsTokens },
    skills: { count: stats.skills, tokens: stats.skillsTokens },
    workExperience: { count: stats.workExperience, tokens: stats.workExperienceTokens },
    education: { count: stats.education, tokens: stats.educationTokens },
    journalEntries: { count: stats.journalEntries, tokens: stats.journalEntriesTokens },
    chatIndex: { count: stats.chatIndex, tokens: stats.chatIndexTokens },
    linearProjects: { count: stats.linearProjects, tokens: stats.linearProjectsTokens },
    linearIssues: { count: stats.linearIssues, tokens: stats.linearIssuesTokens },
    sliteNotes: { count: stats.sliteNotes ?? 0, tokens: stats.sliteNotesTokens ?? 0 },
    notionPages: { count: stats.notionPages ?? 0, tokens: stats.notionPagesTokens ?? 0 },
    slackConversations: {
      count: stats.slackConversations ?? 0,
      tokens: stats.slackConversationsTokens ?? 0,
    },
  };

  const db = getDrizzleDb();
  const skillDocs = db
    .select()
    .from(documents)
    .where(eq(documents.type, "prompt"))
    .all()
    .filter((d) => {
      try {
        return JSON.parse(d.metadata || "{}").type === "kronus-skill";
      } catch {
        return false;
      }
    });

  const skills: KronusSkill[] = skillDocs
    .map((d) => {
      const meta = JSON.parse(d.metadata || "{}") as Record<string, unknown>;
      const cfg = (meta.skillConfig || { soul: {}, tools: {} }) as KronusSkill["config"];
      return {
        id: d.id,
        slug: d.slug,
        title: d.title,
        description: typeof meta.description === "string" ? meta.description : "",
        content: d.content,
        config: cfg,
        icon: cfg.icon || "sparkles",
        color: cfg.color || "#888",
        priority: cfg.priority ?? 0,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  const skillRows = skills.map((s) => {
    const merged = mergeSkillConfigs([s]);
    const soulTokens = estimateSoulContextTokens(merged.soul, stats);
    const enabled = SOUL_CONTEXT_SECTIONS.filter((sec) => merged.soul[sec.key]).map(
      (sec) => sec.key,
    );
    const sectionBreakdown: Partial<Record<SoulContextSectionKey, number>> = {};
    for (const sec of SOUL_CONTEXT_SECTIONS) {
      if (merged.soul[sec.key]) {
        sectionBreakdown[sec.key] = sectionFull[sec.key]?.tokens ?? 0;
      }
    }
    return {
      slug: s.slug,
      title: s.title,
      enabled,
      soulTokens,
      sectionBreakdown,
      skillPromptTokens: estimateTokens(s.content),
      totalWithSkillPrompt: soulTokens + estimateTokens(s.content),
    };
  });

  const liteSummaryOnlyBySection: Record<string, number> = {};
  for (const [source, v] of bySource) {
    liteSummaryOnlyBySection[source] = v.lineTokens;
  }

  console.log(
    JSON.stringify(
      {
        lite: {
          totalItems: lines.length,
          withSummary: lines.filter((l) => l.hasSummary).length,
          missingSummary: lines.filter((l) => !l.hasSummary).length,
          indexTokens: lite.tokenEstimate,
          bySource: Object.fromEntries([...bySource.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
        },
        matrix: {
          sections: SOUL_CONTEXT_SECTIONS.map((s) => ({
            key: s.key,
            count: sectionFull[s.key].count,
            liteSummaryTokens: liteSummaryOnlyBySection[s.key] ?? 0,
            fullBodyTokens: sectionFull[s.key].tokens,
            compressionRatio:
              sectionFull[s.key].tokens > 0
                ? Number(
                    (
                      (liteSummaryOnlyBySection[s.key] ?? 0) / sectionFull[s.key].tokens
                    ).toFixed(3),
                  )
                : null,
          })),
        },
        totals: {
          baseTokens: stats.baseTokens,
          liteIndexOnly: lite.tokenEstimate,
          litePlusBase: stats.baseTokens + lite.tokenEstimate,
          fullAllSections: stats.totalTokens,
          fullActiveOnly: stats.totalTokensActive,
        },
        skills: skillRows,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
