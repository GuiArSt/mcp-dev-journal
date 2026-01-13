import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireQuery, requireBody } from "@/lib/validations";
import { mediaQuerySchema, createMediaSchema } from "@/lib/validations/schemas";
import { ValidationError } from "@/lib/errors";

/**
 * GET /api/media
 *
 * List media assets with optional filters.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const db = getDatabase();
  const { limit, offset, commit_hash, document_id, destination } = requireQuery(mediaQuerySchema, request);

  let query = `
    SELECT
      id, filename, mime_type, file_size, description, alt, prompt, model, tags,
      drive_url, supabase_url, destination, commit_hash, document_id,
      portfolio_project_id, width, height, created_at, updated_at
    FROM media_assets
    WHERE 1=1
  `;
  const params: any[] = [];

  if (commit_hash) {
    query += " AND commit_hash = ?";
    params.push(commit_hash);
  }

  if (document_id) {
    query += " AND document_id = ?";
    params.push(document_id);
  }

  if (destination) {
    query += " AND destination = ?";
    params.push(destination);
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const assets = db.prepare(query).all(...params);

  // Get total count
  let countQuery = "SELECT COUNT(*) as total FROM media_assets WHERE 1=1";
  const countParams: any[] = [];
  if (commit_hash) {
    countQuery += " AND commit_hash = ?";
    countParams.push(commit_hash);
  }
  if (document_id) {
    countQuery += " AND document_id = ?";
    countParams.push(document_id);
  }
  if (destination) {
    countQuery += " AND destination = ?";
    countParams.push(destination);
  }
  const { total } = db.prepare(countQuery).get(...countParams) as { total: number };

  return NextResponse.json({
    assets,
    total,
    limit,
    offset,
  });
});

/**
 * POST /api/media
 *
 * Save a new media asset (download from URL and store).
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const db = getDatabase();
  const body = await requireBody(createMediaSchema, request);

  if (!body.url && !body.data) {
    throw new ValidationError("Either url or data is required");
  }

  // Determine destination based on links
  const destination = body.commit_hash ? "journal" : body.document_id ? "repository" : "media";

  let base64: string;
  let contentType: string;
  let fileSize: number;

  if (body.url) {
    console.log(`[Media] Downloading image from: ${body.url.substring(0, 50)}...`);

    const response = await fetch(body.url);
    if (!response.ok) {
      throw new ValidationError(`Failed to download image: ${response.statusText}`);
    }

    contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    base64 = Buffer.from(arrayBuffer).toString("base64");
    fileSize = arrayBuffer.byteLength;
  } else {
    base64 = body.data!;
    contentType = "image/png";
    fileSize = Math.ceil(base64.length * 0.75);
  }

  console.log(`[Media] Downloaded ${fileSize} bytes, type: ${contentType}`);

  const stmt = db.prepare(`
    INSERT INTO media_assets (
      filename, mime_type, data, file_size, description,
      prompt, model, tags, destination, commit_hash, document_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    body.filename,
    contentType,
    base64,
    fileSize,
    body.description || null,
    body.prompt || null,
    body.model || null,
    JSON.stringify(body.tags),
    destination,
    body.commit_hash || null,
    body.document_id || null
  );

  console.log(`[Media] Saved asset with id: ${result.lastInsertRowid}`);

  return NextResponse.json({
    id: result.lastInsertRowid,
    filename: body.filename,
    mime_type: contentType,
    file_size: fileSize,
    destination,
    commit_hash: body.commit_hash,
    message: "Image saved successfully",
  });
});
