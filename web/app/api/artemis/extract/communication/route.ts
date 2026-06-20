import { NextRequest, NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody } from "@/lib/validations";
import { artemisExtractCommunicationSchema } from "@/lib/validations/schemas";
import { traceAI } from "@/lib/observability";
import { DEFAULT_CHAT_MODEL, getChatModelEntry, resolveChatModelId } from "@/lib/ai/model-catalog";

const MODEL_ID = resolveChatModelId(getChatModelEntry(DEFAULT_CHAT_MODEL), process.env);

const CommunicationDraftSchema = z.object({
  channel: z.enum(["email", "linkedin", "phone", "sms", "video_call", "in_person", "note", "other"]),
  direction: z.enum(["inbound", "outbound", "internal_note"]),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  raw_text: z.string(),
  summary: z.string().nullable().optional(),
  occurred_at: z.string().nullable().optional(),
  next_action: z.string().nullable().optional(),
  next_action_due_at: z.string().nullable().optional(),
});

/**
 * POST /api/artemis/extract/communication
 *
 * Extracts a reviewable communication draft from pasted text. No DB writes.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const input = await requireBody(artemisExtractCommunicationSchema, request);
  const model = google(MODEL_ID);

  const result = await traceAI(
    "artemis:extract-communication",
    MODEL_ID,
    () =>
      generateText({
        model,
        output: Output.object({ schema: CommunicationDraftSchema }),
        system: [
          "You extract a structured communication timeline entry for Artemis, a personal job hunt module.",
          "Return only fields supported by the schema.",
          "Do not invent dates, contact details, or next actions.",
          "Use internal_note when the pasted text is the user's own note rather than a message.",
        ].join("\n"),
        prompt: `Preferred channel: ${input.channel ?? "infer"}\n\nCommunication text:\n${input.text}`,
      }),
    { channel: input.channel ?? null },
    input.text,
    "/api/artemis/extract/communication"
  );

  return NextResponse.json({
    draft: {
      ...result.output,
      channel: input.channel ?? result.output.channel,
      raw_text: input.text,
    },
  });
});
