import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { fetchChatMemory, listChatIndex } from "@/lib/chat-memory";

const QuerySchema = z.object({
  query: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  uuid: z.string().optional(),
  id: z.coerce.number().int().positive().optional(),
  maxChars: z.coerce.number().min(1_000).max(200_000).optional(),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = QuerySchema.parse(params);

  if (parsed.uuid || parsed.id) {
    const conversation = fetchChatMemory({
      uuid: parsed.uuid,
      id: parsed.id,
      maxChars: parsed.maxChars,
    });
    return NextResponse.json({ conversation });
  }

  return NextResponse.json(listChatIndex(parsed));
});

