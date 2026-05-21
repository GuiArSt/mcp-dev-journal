import { NextRequest, NextResponse } from "next/server";
import { getSlackVaultStatus, syncSlackVault, type SlackSyncOptions } from "@/lib/slack/vault";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/integrations/slack/sync
 *
 * Returns local Slack vault status. Does not call Slack.
 */
export async function GET() {
  try {
    return NextResponse.json(getSlackVaultStatus());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read Slack vault status" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/integrations/slack/sync
 *
 * Mirrors Slack-accessible users/conversations/messages into the local vault.
 * This is intentionally data-vault only: no Kronus tools are exposed yet.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as SlackSyncOptions;
    const result = await syncSlackVault(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Slack sync failed" },
      { status: 500 },
    );
  }
}
