import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/errors";

/**
 * GET /api/health
 *
 * Health check endpoint for Docker/monitoring.
 * Returns status of app and database connectivity.
 */
export const GET = withErrorHandler(async () => {
  const db = getDatabase();
  const result = db.prepare("SELECT 1 as ok").get() as { ok: number };

  if (result?.ok !== 1) {
    throw new AppError("Database check failed", 503, "DB_UNHEALTHY");
  }

  return NextResponse.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    database: "connected",
  });
});
