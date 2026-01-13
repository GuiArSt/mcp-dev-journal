import { NextResponse } from "next/server";
import { initDatabase, exportToSQL } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { getErrorMessage } from "@/lib/errors";
import path from "path";

/**
 * GET /api/db/backup
 *
 * Download backup as SQL file.
 * Note: Can't use withErrorHandler because it returns a plain Response for file download.
 */
export async function GET() {
  try {
    initDatabase();

    // Create temporary backup
    const backupPath = path.join(process.cwd(), "..", "journal_backup.sql");
    exportToSQL(backupPath);

    // Read and return as download
    const fs = await import("fs");
    const sql = fs.readFileSync(backupPath, "utf-8");

    return new Response(sql, {
      headers: {
        "Content-Type": "application/sql",
        "Content-Disposition": `attachment; filename="journal_backup_${new Date().toISOString().split("T")[0]}.sql"`,
      },
    });
  } catch (error) {
    console.error("[API Error] Backup failed:", error);
    return NextResponse.json(
      { error: getErrorMessage(error), code: "BACKUP_ERROR" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/db/backup
 *
 * Trigger manual backup.
 */
export const POST = withErrorHandler(async () => {
  initDatabase();

  const backupPath = path.join(process.cwd(), "..", "journal_backup.sql");
  exportToSQL(backupPath);

  return NextResponse.json({
    success: true,
    message: "Backup completed successfully",
    path: backupPath,
    timestamp: new Date().toISOString(),
  });
});
