import { NextRequest, NextResponse } from "next/server";
import { getSlackConversationFromVault } from "@/lib/slack/vault";

export const runtime = "nodejs";

/**
 * GET /api/integrations/slack/conversations/[id]
 *
 * Fetch one conversation and paginated messages from the local vault.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const messageLimit = Number(searchParams.get("messageLimit") ?? 50);
    const messageOffset = Number(searchParams.get("messageOffset") ?? 0);

    const result = getSlackConversationFromVault(id, { messageLimit, messageOffset });
    if (!result) {
      return NextResponse.json(
        { error: `Conversation "${id}" not found in Slack vault. Sync Slack data first.` },
        { status: 404 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch Slack conversation" },
      { status: 500 },
    );
  }
}
