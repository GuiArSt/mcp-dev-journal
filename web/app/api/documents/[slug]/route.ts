import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { NotFoundError, ConflictError, DatabaseError } from "@/lib/errors";

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

function getDocumentBySlugOrId(db: ReturnType<typeof getDatabase>, slug: string): DocumentRow | undefined {
  if (/^\d+$/.test(slug)) {
    return db.prepare("SELECT * FROM documents WHERE id = ?").get(parseInt(slug)) as DocumentRow | undefined;
  }
  return db.prepare("SELECT * FROM documents WHERE slug = ?").get(slug) as DocumentRow | undefined;
}

/**
 * GET /api/documents/[slug]
 * Get a single document by slug or ID
 */
export const GET = withErrorHandler<{ slug: string }>(async (
  request: NextRequest,
  context
) => {
  const { params } = context!;
  const { slug } = await params;
  console.log(`[Documents API] Fetching document with slug/id: ${slug}`);
  const db = getDatabase();

  const document = getDocumentBySlugOrId(db, slug);
  if (!document) {
    console.log(`[Documents API] Document not found for slug: ${slug}`);
    throw new NotFoundError("Document not found");
  }

  console.log(`[Documents API] Found document: ${document.title}`);
  return NextResponse.json(parseDocumentMetadata(document));
});

/**
 * PUT /api/documents/[slug]
 * Update a document by slug or ID
 */
export const PUT = withErrorHandler<{ slug: string }>(async (
  request: NextRequest,
  context
) => {
  const { params } = context!;
  const { slug } = await params;
  const db = getDatabase();
  const body = await request.json();
  const { title, content, metadata } = body as {
    title?: string;
    content?: string;
    metadata?: Record<string, unknown>;
  };

  const isNumericId = /^\d+$/.test(slug);
  const existing = getDocumentBySlugOrId(db, slug);
  if (!existing) {
    throw new NotFoundError("Document not found");
  }

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (title !== undefined) {
    updates.push("title = ?");
    values.push(title);
    // Update slug if title changed
    const newSlug = slugify(title);
    if (newSlug !== slug && !isNumericId) {
      // Check if new slug exists
      const slugExists = db.prepare("SELECT id FROM documents WHERE slug = ?").get(newSlug);
      if (slugExists) {
        throw new ConflictError("Document with this title already exists");
      }
      updates.push("slug = ?");
      values.push(newSlug);
    }
  }

  if (content !== undefined) {
    updates.push("content = ?");
    values.push(content);
  }

  if (metadata !== undefined) {
    updates.push("metadata = ?");
    values.push(JSON.stringify(metadata));
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");

  try {
    if (isNumericId) {
      db.prepare(`UPDATE documents SET ${updates.join(", ")} WHERE id = ?`).run(...values, parseInt(slug));
    } else {
      db.prepare(`UPDATE documents SET ${updates.join(", ")} WHERE slug = ?`).run(...values, slug);
    }

    // Fetch updated document
    let updated: DocumentRow | undefined;
    if (isNumericId) {
      updated = db.prepare("SELECT * FROM documents WHERE id = ?").get(parseInt(slug)) as DocumentRow | undefined;
    } else if (title) {
      updated = db.prepare("SELECT * FROM documents WHERE slug = ?").get(slugify(title)) as DocumentRow | undefined;
    } else {
      updated = db.prepare("SELECT * FROM documents WHERE slug = ?").get(slug) as DocumentRow | undefined;
    }

    if (!updated) {
      throw new DatabaseError("Failed to retrieve updated document");
    }

    return NextResponse.json(parseDocumentMetadata(updated));
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ConflictError || error instanceof DatabaseError) {
      throw error;
    }
    if (error instanceof Error && error.message?.includes("UNIQUE constraint")) {
      throw new ConflictError("Document with this title already exists");
    }
    throw new DatabaseError("Failed to update document");
  }
});

/**
 * DELETE /api/documents/[slug]
 * Delete a document by slug or ID
 */
export const DELETE = withErrorHandler<{ slug: string }>(async (
  request: NextRequest,
  context
) => {
  const { params } = context!;
  const { slug } = await params;
  const db = getDatabase();

  // Support both slug and numeric ID
  let result;
  if (/^\d+$/.test(slug)) {
    result = db.prepare("DELETE FROM documents WHERE id = ?").run(parseInt(slug));
  } else {
    result = db.prepare("DELETE FROM documents WHERE slug = ?").run(slug);
  }

  if (result.changes === 0) {
    throw new NotFoundError("Document not found");
  }

  return NextResponse.json({ success: true });
});
