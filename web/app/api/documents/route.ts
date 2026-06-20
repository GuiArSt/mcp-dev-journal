import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { getDrizzleDb, documents } from "@/lib/db/drizzle";
import { withErrorHandler } from "@/lib/api-handler";
import {
  requireQuery,
  requireBody,
  documentQuerySchema,
  createDocumentSchema,
} from "@/lib/validations";
import { ConflictError, DatabaseError } from "@/lib/errors";
import {
  normalizePromptContent,
  detectPromptRole,
  isInChatFormat,
} from "@/lib/prompts/chat-format";

type DocumentRow = typeof documents.$inferSelect;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function parseDocumentMetadata(
  doc: DocumentRow
): Omit<DocumentRow, "metadata"> & { metadata: Record<string, unknown> } {
  try {
    const metadata = JSON.parse(doc.metadata || "{}") as Record<string, unknown>;

    // Normalize: migrate legacy 'year' field to 'writtenDate' if needed
    if (metadata.year && !metadata.writtenDate) {
      metadata.writtenDate = metadata.year;
      delete metadata.year;
    }

    return {
      ...doc,
      metadata,
    };
  } catch {
    return {
      ...doc,
      metadata: {} as Record<string, unknown>,
    };
  }
}

function toApiDocument(doc: ReturnType<typeof parseDocumentMetadata>) {
  return {
    id: doc.id,
    slug: doc.slug,
    type: doc.type,
    title: doc.title,
    content: doc.content,
    language: doc.language,
    metadata: doc.metadata,
    summary: doc.summary,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
  };
}

/**
 * GET /api/documents
 * List documents with optional filtering
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { type, search, year, limit, offset } = requireQuery(documentQuerySchema, request);
  const db = getDrizzleDb();

  const conditions = [];
  if (type) {
    conditions.push(
      sql`(${documents.type} = ${type} OR (json_valid(${documents.metadata}) = 1 AND json_extract(${documents.metadata}, '$.alsoShownIn') LIKE ${`%"${type}"%`}))`
    );
  }
  if (year) {
    conditions.push(
      sql`json_valid(${documents.metadata}) = 1 AND json_extract(${documents.metadata}, '$.year') = ${year}`
    );
  }
  if (search) {
    const searchTerm = `%${search}%`;
    conditions.push(
      sql`(${documents.title} LIKE ${searchTerm} OR ${documents.content} LIKE ${searchTerm})`
    );
  }

  const documentsRows = await db
    .select()
    .from(documents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(documents.createdAt))
    .limit(limit)
    .offset(offset);

  const documentsWithParsedMetadata = documentsRows.map(parseDocumentMetadata);

  const [totalResult] = await db
    .select({ count: count() })
    .from(documents)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  const total = totalResult?.count ?? 0;
  return NextResponse.json({
    documents: documentsWithParsedMetadata.map(toApiDocument),
    total,
    limit,
    offset,
    has_more: offset + documentsRows.length < total,
  });
});

/**
 * POST /api/documents
 * Create a new document
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const {
    title,
    content,
    type,
    language,
    metadata,
    slug: providedSlug,
  } = await requireBody(createDocumentSchema, request);
  const db = getDrizzleDb();

  const slug = providedSlug || slugify(title);

  // Normalize: migrate legacy 'year' field to 'writtenDate' if needed
  const normalizedMetadata: Record<string, unknown> = { ...metadata };
  if (normalizedMetadata.year && !normalizedMetadata.writtenDate) {
    normalizedMetadata.writtenDate = normalizedMetadata.year;
    delete normalizedMetadata.year;
  } else if (normalizedMetadata.year) {
    // If both exist, prefer writtenDate and remove year
    delete normalizedMetadata.year;
  }

  // For prompts: normalize content to chat format and auto-detect role
  let normalizedContent = content;
  if (type === "prompt") {
    // Ensure content is in chat format (wrap in ## System if not)
    normalizedContent = normalizePromptContent(content);

    // Auto-detect role from content structure if not provided
    if (!normalizedMetadata.role) {
      normalizedMetadata.role = detectPromptRole(normalizedContent);
    }
  }

  // Check if slug already exists
  const [existing] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.slug, slug))
    .limit(1);
  if (existing) {
    throw new ConflictError("Document with this title already exists");
  }

  try {
    await db
      .insert(documents)
      .values({
        slug,
        type,
        title,
        content: normalizedContent,
        language,
        metadata: JSON.stringify(normalizedMetadata),
      })
      .run();

    const [document] = await db.select().from(documents).where(eq(documents.slug, slug)).limit(1);

    if (!document) {
      throw new DatabaseError("Failed to retrieve created document");
    }

    // Register in object registry
    try {
      const { registerObject } = await import("@/lib/object-registry");
      registerObject({ type, sourceTable: "documents", sourceId: slug, title });
    } catch { /* registry is non-critical */ }
    const { markContextMetricsStale } = await import("@/lib/mark-context-metrics-stale");
    markContextMetricsStale();

    return NextResponse.json(toApiDocument(parseDocumentMetadata(document)));
  } catch (error) {
    if (error instanceof Error && error.message?.includes("UNIQUE constraint")) {
      throw new ConflictError("Document with this title already exists");
    }
    throw new DatabaseError("Failed to create document");
  }
});
