import { NextRequest, NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { getDatabase } from "@/lib/db";
import { getApplicationDetail, initArtemisSchema, parseJsonArray } from "@/lib/artemis/db";
import { traceAI } from "@/lib/observability";
import { getPrompt } from "@/lib/ai/prompt-store";
import { ARTEMIS_AGENT_DEFAULT } from "@/lib/ai/prompt-defaults";
import { DEFAULT_CHAT_MODEL, getChatModelEntry, resolveChatModelId } from "@/lib/ai/model-catalog";
import { requireBody } from "@/lib/validations";
import { artemisChatProposalSchema, artemisChatSchema } from "@/lib/validations/schemas";
import { NotFoundError } from "@/lib/errors";

const MODEL_ID = resolveChatModelId(getChatModelEntry(DEFAULT_CHAT_MODEL), process.env);

const ArtemisAgentResponseSchema = z.object({
  reply: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  proposal: artemisChatProposalSchema,
});

function safeAll<T>(db: ReturnType<typeof getDatabase>, sql: string, ...params: unknown[]): T[] {
  try {
    return db.prepare(sql).all(...params) as T[];
  } catch {
    return [];
  }
}

function compactCvContext(db: ReturnType<typeof getDatabase>) {
  const skills = safeAll<any>(
    db,
    `
      SELECT name, category, magnitude, description, summary
      FROM skills
      ORDER BY category ASC, magnitude DESC, name ASC
      LIMIT 40
    `
  );
  const experience = safeAll<any>(
    db,
    `
      SELECT title, company, department, location, dateStart, dateEnd, tagline, achievements, summary
      FROM work_experience
      ORDER BY dateStart DESC
      LIMIT 12
    `
  ).map((row) => ({ ...row, achievements: parseJsonArray(row.achievements).slice(0, 4) }));
  const education = safeAll<any>(
    db,
    `
      SELECT degree, field, institution, location, dateStart, dateEnd, tagline, focusAreas, achievements, summary
      FROM education
      ORDER BY dateStart DESC
      LIMIT 8
    `
  ).map((row) => ({
    ...row,
    focusAreas: parseJsonArray(row.focusAreas).slice(0, 6),
    achievements: parseJsonArray(row.achievements).slice(0, 4),
  }));
  const portfolio = safeAll<any>(
    db,
    `
      SELECT title, category, company, status, excerpt, role, technologies, metrics, summary
      FROM portfolio_projects
      ORDER BY featured DESC, sort_order ASC, title ASC
      LIMIT 15
    `
  ).map((row) => ({
    ...row,
    technologies: parseJsonArray(row.technologies).slice(0, 10),
  }));
  const documents = safeAll<any>(
    db,
    `
      SELECT id, slug, type, title, summary, metadata
      FROM documents
      WHERE lower(title) LIKE '%cv%'
        OR lower(title) LIKE '%resume%'
        OR lower(title) LIKE '%cover%'
        OR lower(title) LIKE '%letter%'
        OR lower(metadata) LIKE '%cv%'
        OR lower(metadata) LIKE '%cover%'
      ORDER BY updated_at DESC
      LIMIT 20
    `
  ).map((row) => ({
    id: row.id,
    slug: row.slug,
    type: row.type,
    title: row.title,
    summary: row.summary,
  }));

  return { skills, experience, education, portfolio, documents };
}

/**
 * POST /api/artemis/chat
 *
 * Turns messy job-hunt updates into a reviewable Artemis proposal. No DB writes.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const input = await requireBody(artemisChatSchema, request);
  const db = getDatabase();
  initArtemisSchema(db);

  const application = input.application_id
    ? getApplicationDetail(db, input.application_id)
    : null;
  if (input.application_id && !application) {
    throw new NotFoundError("Artemis application", String(input.application_id));
  }

  const context = {
    selectedApplication: application,
    cv: compactCvContext(db),
    statusPipeline: [
      "saved",
      "drafting",
      "applied",
      "screening",
      "interviewing",
      "take_home",
      "offer",
      "rejected",
      "withdrawn",
      "archived",
    ],
  };

  const model = google(MODEL_ID);
  const result = await traceAI(
    "artemis:chat",
    MODEL_ID,
    () =>
      generateText({
        model,
        output: Output.object({ schema: ArtemisAgentResponseSchema }),
        system: getPrompt("artemis-agent", ARTEMIS_AGENT_DEFAULT),
        prompt: [
          "ARTEMIS_CONTEXT:",
          JSON.stringify(context, null, 2),
          "",
          "USER_UPDATE:",
          input.message,
        ].join("\n"),
      }),
    { applicationId: input.application_id ?? null },
    input.message,
    "/api/artemis/chat"
  );

  return NextResponse.json(result.output);
});
