import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const db = getDatabase();
    const searchParams = request.nextUrl.searchParams;
    const repository = searchParams.get("repository");

    if (!repository) {
      return NextResponse.json(
        { error: "Repository parameter is required" },
        { status: 400 }
      );
    }

    // Get attachments for entries in this repository
    const attachments = db.prepare(`
      SELECT
        ea.id,
        ea.commit_hash,
        ea.filename,
        ea.mime_type,
        ea.description,
        ea.file_size as size,
        ea.uploaded_at as created_at,
        je.repository,
        je.branch
      FROM entry_attachments ea
      JOIN journal_entries je ON ea.commit_hash = je.commit_hash
      WHERE je.repository = ?
      ORDER BY ea.uploaded_at DESC
    `).all(repository);

    return NextResponse.json({
      attachments,
      total: attachments.length,
    });
  } catch (error) {
    console.error("List attachments by repository error:", error);
    return NextResponse.json(
      { error: "Failed to list attachments" },
      { status: 500 }
    );
  }
}
