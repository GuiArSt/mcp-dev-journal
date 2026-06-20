import { NextRequest, NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody } from "@/lib/validations";
import { artemisExtractJobPostingSchema } from "@/lib/validations/schemas";
import { traceAI } from "@/lib/observability";
import { DEFAULT_CHAT_MODEL, getChatModelEntry, resolveChatModelId } from "@/lib/ai/model-catalog";

const MODEL_ID = resolveChatModelId(getChatModelEntry(DEFAULT_CHAT_MODEL), process.env);

const JobPostingDraftSchema = z.object({
  company: z.object({
    name: z.string().min(1),
    website: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    size: z.string().nullable().optional(),
    headquarters: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    linkedin_url: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    tags: z.array(z.string()).default([]),
  }),
  position: z.object({
    title: z.string().min(1),
    department: z.string().nullable().optional(),
    employment_type: z.string().nullable().optional(),
    seniority: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    work_mode: z.enum(["remote", "hybrid", "onsite", "unknown"]).default("unknown"),
    source_url: z.string().nullable().optional(),
    source_platform: z.string().nullable().optional(),
    salary_min: z.number().int().nullable().optional(),
    salary_max: z.number().int().nullable().optional(),
    salary_currency: z.string().nullable().optional(),
    benefits: z.array(z.string()).default([]),
    responsibilities: z.array(z.string()).default([]),
    requirements: z.array(z.string()).default([]),
    nice_to_have: z.array(z.string()).default([]),
    raw_posting_text: z.string(),
    extracted_data: z.record(z.string(), z.unknown()).default({}),
  }),
  application: z.object({
    status: z.enum(["saved", "drafting", "applied", "screening", "interviewing", "take_home", "offer", "rejected", "withdrawn", "archived"]).default("saved"),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    fit_score: z.number().int().min(0).max(100).nullable().optional(),
    deadline_at: z.string().nullable().optional(),
    follow_up_at: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    contact_name: z.string().nullable().optional(),
    contact_email: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
});

/**
 * POST /api/artemis/extract/job-posting
 *
 * Extracts a reviewable Artemis draft from pasted job posting text. No DB writes.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const input = await requireBody(artemisExtractJobPostingSchema, request);
  const model = google(MODEL_ID);

  const result = await traceAI(
    "artemis:extract-job-posting",
    MODEL_ID,
    () =>
      generateText({
        model,
        output: Output.object({ schema: JobPostingDraftSchema }),
        system: [
          "You extract structured job application tracking data for Artemis, a personal job hunt module.",
          "Return only fields supported by the schema.",
          "Do not invent specifics. Use null or empty arrays when the posting does not state a detail.",
          "Set application.status to saved unless the user text clearly says they already applied.",
        ].join("\n"),
        prompt: `Source URL: ${input.source_url ?? "not provided"}\n\nJob posting text:\n${input.text}`,
      }),
    { sourceUrl: input.source_url ?? null },
    input.text,
    "/api/artemis/extract/job-posting"
  );

  return NextResponse.json({
    draft: {
      ...result.output,
      position: {
        ...result.output.position,
        source_url: result.output.position.source_url ?? input.source_url ?? null,
        raw_posting_text: input.text,
      },
    },
  });
});
