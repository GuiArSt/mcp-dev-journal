import { NextResponse } from "next/server";
import { buildSummaryFreshnessReport } from "@/lib/summary-freshness";

export const runtime = "nodejs";

/**
 * GET /api/kronus/summary-status
 * Coverage + staleness for Kronus Lite summary index entities.
 */
export async function GET() {
  try {
    const report = await buildSummaryFreshnessReport();
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build summary status";
    console.error("[summary-status]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
