import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { getAiIntegration, listAiIntegrations } from "@/lib/ai-integrations";

const QuerySchema = z.object({
  key: z.string().optional(),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const query = QuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (query.key) {
    return NextResponse.json({ integration: getAiIntegration(query.key) });
  }
  return NextResponse.json({ integrations: listAiIntegrations() });
});
