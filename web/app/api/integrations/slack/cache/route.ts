import { NextRequest, NextResponse } from "next/server";
import { listSlackVaultCache } from "@/lib/slack/vault";

export const runtime = "nodejs";

/**
 * GET /api/integrations/slack/cache?limit=50
 *
 * Reads mirrored Slack data from the local vault only.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") ?? 50), 200));
    const messageLimit = Math.max(1, Math.min(Number(searchParams.get("messageLimit") ?? limit), 1000));
    const conversationId = searchParams.get("conversationId");
    return NextResponse.json(listSlackVaultCache(limit, { conversationId, messageLimit }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read Slack vault cache" },
      { status: 500 },
    );
  }
}
