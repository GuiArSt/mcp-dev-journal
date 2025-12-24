import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireQuery, requireBody, documentQuerySchema, createDocumentSchema } from "@/lib/validations";
import { ConflictError, DatabaseError } from "@/lib/errors";

interface DocumentRow {
  id: number;
  slug: string;
  type: string;
  title: string;
  content: string;
  language: string;
  metadata: string;
  created_at: string;
  updated_at: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function parseDocumentMetadata(doc: DocumentRow): Omit<DocumentRow, 'metadata'> & { metadata: Record<string, unknown> } {
  try {
    return {
      ...doc,
      metadata: JSON.parse(doc.metadata || "{}") as Record<string, unknown>,
    };
  } catch {
    return {
      ...doc,
      metadata: {} as Record<string, unknown>,
    };
  }
}

/**
 * GET /api/documents
 * List documents with optional filtering
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { type, search, year, limit, offset } = requireQuery(documentQuerySchema, request);
  const db = getDatabase();

  // Build query with conditions
  let query = "SELECT * FROM documents WHERE 1=1";
  const params: (string | number)[] = [];

  if (type) {
    query += " AND type = ?";
    params.push(type);
  }

  if (year) {
    query += " AND json_extract(metadata, '$.year') = ?";
    params.push(year);
  }

  if (search) {
    query += " AND (title LIKE ? OR content LIKE ?)";
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm);
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const documents = db.prepare(query).all(...params) as DocumentRow[];
  console.log(`[Documents API] Query: ${query.substring(0, 100)}...`);
  console.log(`[Documents API] Found ${documents.length} documents`);

  // Parse metadata JSON
  const documentsWithParsedMetadata = documents.map(parseDocumentMetadata);

  // Get total count with same filters
  let countQuery = "SELECT COUNT(*) as count FROM documents WHERE 1=1";
  const countParams: (string | number)[] = [];

  if (type) {
    countQuery += " AND type = ?";
    countParams.push(type);
  }
  if (year) {
    countQuery += " AND json_extract(metadata, '$.year') = ?";
    countParams.push(year);
  }
  if (search) {
    countQuery += " AND (title LIKE ? OR content LIKE ?)";
    const searchTerm = `%${search}%`;
    countParams.push(searchTerm, searchTerm);
  }

  const totalRow = db.prepare(countQuery).get(...countParams) as { count: number };
  const total = totalRow.count;

  console.log(`[Documents API] Returning ${documentsWithParsedMetadata.length} documents`);
  return NextResponse.json({
    documents: documentsWithParsedMetadata,
    total,
    limit,
    offset,
    has_more: offset + documents.length < total,
  });
});

/**
 * POST /api/documents
 * Create a new document
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const { title, content, type, language, metadata, slug: providedSlug } = await requireBody(createDocumentSchema, request);
  const db = getDatabase();

  const slug = providedSlug || slugify(title);
  const metadataJson = JSON.stringify(metadata);

  // Check if slug already exists
  const existing = db.prepare("SELECT id FROM documents WHERE slug = ?").get(slug);
  if (existing) {
    throw new ConflictError("Document with this title already exists");
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO documents (slug, type, title, content, language, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .run(slug, type, title, content, language, metadataJson);

    const document = db.prepare("SELECT * FROM documents WHERE id = ?").get(result.lastInsertRowid) as DocumentRow;

    return NextResponse.json(parseDocumentMetadata(document));
  } catch (error) {
    if (error instanceof Error && error.message?.includes("UNIQUE constraint")) {
      throw new ConflictError("Document with this title already exists");
    }
    throw new DatabaseError("Failed to create document");
  }
});
