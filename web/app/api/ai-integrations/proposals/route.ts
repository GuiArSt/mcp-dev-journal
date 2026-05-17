import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import {
  createAiProposal,
  getAiProposal,
  listAiProposals,
  type AiIntegrationKey,
} from "@/lib/ai-integrations";

const QuerySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  integrationKey: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const BodySchema = z.object({
  integrationKey: z.enum(["codex", "claude_code", "gemini_cli", "cursor", "coderabbit"]),
  targetKind: z.string().min(1),
  targetPath: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  summary: z.string().optional(),
  sourceArtifactId: z.number().int().positive().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const query = QuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (query.id) {
    return NextResponse.json({ proposal: getAiProposal(query.id) });
  }
  return NextResponse.json({
    proposals: listAiProposals({
      integrationKey: query.integrationKey,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    }),
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const body = BodySchema.parse(await request.json());
  return NextResponse.json({
    proposal: createAiProposal({
      integrationKey: body.integrationKey as AiIntegrationKey,
      targetKind: body.targetKind,
      targetPath: body.targetPath,
      title: body.title,
      content: body.content,
      summary: body.summary,
      sourceArtifactId: body.sourceArtifactId,
      metadata: body.metadata,
    }),
  });
});
