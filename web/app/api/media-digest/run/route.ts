import { NextResponse } from "next/server";
import { runDailyDigest } from "@/lib/media-digest/run";
import { getDigestStatus } from "@/lib/media-digest/db";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/media-digest/run
 *
 * Returns local media-digest status. Does not run the pipeline.
 */
export async function GET() {
  try {
    return NextResponse.json(getDigestStatus());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read digest status" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/media-digest/run
 *
 * Runs the daily digest pipeline: web search across topics + optional inbox
 * snapshot -> Kronus-lite commentary -> persist items, digest, and Library note.
 * Localhost-only (see middleware) so the launchd cron can call it without auth.
 */
export async function POST() {
  try {
    const result = await runDailyDigest();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Media digest run failed" },
      { status: 500 },
    );
  }
}
