import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { getAiArtifact, listAiArtifacts } from "@/lib/ai-integrations";

const QuerySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  integrationKey: z.string().optional(),
  kind: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const query = QuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (query.id) {
    return NextResponse.json({ artifact: getAiArtifact(query.id) });
  }
  return NextResponse.json({
    artifacts: listAiArtifacts({
      integrationKey: query.integrationKey,
      kind: query.kind,
      limit: query.limit,
      offset: query.offset,
    }),
  });
});
