import { NextRequest, NextResponse } from "next/server";
import {
  listSlackConversationsFromVault,
  type SlackVaultType,
} from "@/lib/slack/vault";

export const runtime = "nodejs";

const VAULT_TYPES = new Set<SlackVaultType>([
  "personal_conversation",
  "group",
  "public_forum",
]);

/**
 * GET /api/integrations/slack/conversations
 *
 * List or search mirrored Slack conversations from the local vault (no live API).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") ?? undefined;
    const vaultTypeParam = searchParams.get("vaultType");
    const vaultType =
      vaultTypeParam && VAULT_TYPES.has(vaultTypeParam as SlackVaultType)
        ? (vaultTypeParam as SlackVaultType)
        : undefined;
    const withMessagesOnly = searchParams.get("withMessagesOnly") !== "false";
    const limit = Number(searchParams.get("limit") ?? 20);
    const offset = Number(searchParams.get("offset") ?? 0);

    const result = listSlackConversationsFromVault({
      query,
      vaultType,
      withMessagesOnly,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list Slack conversations" },
      { status: 500 },
    );
  }
}
