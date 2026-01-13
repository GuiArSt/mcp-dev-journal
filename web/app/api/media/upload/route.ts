import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

// Route segment config for App Router - increase body size limit for uploads
export const maxDuration = 60; // 60 seconds timeout for large uploads
export const dynamic = "force-dynamic";

/**
 * POST /api/media/upload
 * Upload a file directly (multipart form data)
 *
 * Form fields:
 * - file: The file to upload (required)
 * - description: Description of the media
 * - alt: Alt text for accessibility
 * - document_id: Link to a document
 * - portfolio_project_id: Link to a portfolio project
 * - commit_hash: Link to a journal entry
 * - tags: JSON array of tags
 * - drive_url: Google Drive URL (for archival reference)
 */
export async function POST(request: NextRequest) {
  try {
    const db = getDatabase();
    const formData = await request.formData();

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const description = formData.get("description") as string | null;
    const alt = formData.get("alt") as string | null;
    const documentId = formData.get("document_id") as string | null;
    const portfolioProjectId = formData.get("portfolio_project_id") as string | null;
    const commitHash = formData.get("commit_hash") as string | null;
    const tagsJson = formData.get("tags") as string | null;
    const driveUrl = formData.get("drive_url") as string | null;

    // Read file data
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const fileSize = arrayBuffer.byteLength;

    // Determine destination
    const destination = commitHash
      ? "journal"
      : documentId
      ? "repository"
      : portfolioProjectId
      ? "portfolio"
      : "media";

    // Get image dimensions if it's an image
    let width: number | null = null;
    let height: number | null = null;

    // Parse tags
    let tags: string[] = [];
    if (tagsJson) {
      try {
        tags = JSON.parse(tagsJson);
      } catch {
        tags = [];
      }
    }

    console.log(`[Media Upload] Uploading ${file.name} (${fileSize} bytes)`);

    // Insert into database
    const stmt = db.prepare(`
      INSERT INTO media_assets (
        filename, mime_type, data, file_size, description, alt,
        prompt, model, tags, drive_url, destination,
        commit_hash, document_id, portfolio_project_id, width, height
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      file.name,
      file.type || "application/octet-stream",
      base64,
      fileSize,
      description || null,
      alt || null,
      null, // prompt
      null, // model
      JSON.stringify(tags),
      driveUrl || null,
      destination,
      commitHash || null,
      documentId ? parseInt(documentId) : null,
      portfolioProjectId || null,
      width,
      height
    );

    console.log(`[Media Upload] Saved asset with id: ${result.lastInsertRowid}`);

    // Fetch the created record
    const asset = db
      .prepare(
        `SELECT id, filename, mime_type, file_size, description, alt,
                drive_url, supabase_url, destination, document_id,
                portfolio_project_id, commit_hash, created_at
         FROM media_assets WHERE id = ?`
      )
      .get(result.lastInsertRowid) as Record<string, unknown>;

    return NextResponse.json({
      ...asset,
      message: "File uploaded successfully",
    });
  } catch (error: any) {
    console.error("[Media Upload] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload file" },
      { status: 500 }
    );
  }
}
