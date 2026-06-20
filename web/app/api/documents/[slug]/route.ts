import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql, type SQL } from "drizzle-orm";
import { getDrizzleDb, documents, mediaAssets } from "@/lib/db/drizzle";
import { withErrorHandler } from "@/lib/api-handler";
import { NotFoundError, ConflictError, DatabaseError } from "@/lib/errors";
import { normalizePromptContent, detectPromptRole } from "@/lib/prompts/chat-format";

type DocumentRow = typeof documents.$inferSelect;
type MediaAssetRow = typeof mediaAssets.$inferSelect;

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

async function getDocumentBySlugOrId(
  db: ReturnType<typeof getDrizzleDb>,
  slug: string
): Promise<DocumentRow | undefined> {
  if (/^\d+$/.test(slug)) {
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, parseInt(slug, 10)))
      .limit(1);
    return document;
  }
  const [document] = await db.select().from(documents).where(eq(documents.slug, slug)).limit(1);
  return document;
}

/**
 * GET /api/documents/[slug]
 * Get a single document by slug or ID
 */
export const GET = withErrorHandler<{ slug: string }>(async (request: NextRequest, context) => {
  const { params } = context!;
  const { slug } = await params;
  console.log(`[Documents API] Fetching document with slug/id: ${slug}`);
  const db = getDrizzleDb();

  const document = await getDocumentBySlugOrId(db, slug);
  if (!document) {
    console.log(`[Documents API] Document not found for slug: ${slug}`);
    throw new NotFoundError("Document not found");
  }

  console.log(`[Documents API] Found document: ${document.title}`);

  // Fetch attached media assets
  const mediaAssetsRows = await db
    .select({
      id: mediaAssets.id,
      filename: mediaAssets.filename,
      mime_type: mediaAssets.mimeType,
      description: mediaAssets.description,
      alt: mediaAssets.alt,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.documentId, document.id))
    .orderBy(desc(mediaAssets.createdAt));

  const parsedDoc = parseDocumentMetadata(document);

  return NextResponse.json({
    ...toApiDocument(parsedDoc),
    media_count: mediaAssetsRows.length,
    media_assets: mediaAssetsRows.map((m) => ({
      id: m.id,
      filename: m.filename,
      mime_type: m.mime_type,
      description: m.description,
      alt: m.alt,
      url: `/api/media/${m.id}/raw`,
    })),
  });
});

/**
 * PUT /api/documents/[slug]
 * Update a document by slug or ID
 */
export const PUT = withErrorHandler<{ slug: string }>(async (request: NextRequest, context) => {
  const { params } = context!;
  const { slug } = await params;
  const db = getDrizzleDb();
  const body = await request.json();
  const { title, content, type, metadata, summary } = body as {
    title?: string;
    content?: string;
    type?: "writing" | "prompt" | "note";
    metadata?: Record<string, unknown>;
    summary?: string | null;
  };

  const isNumericId = /^\d+$/.test(slug);
  const existing = await getDocumentBySlugOrId(db, slug);
  if (!existing) {
    throw new NotFoundError("Document not found");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {};

  if (title !== undefined) {
    updates.title = title;
    // Update slug if title changed
    const newSlug = slugify(title);
    if (newSlug !== slug && !isNumericId) {
      // Check if new slug exists
      const [slugExists] = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.slug, newSlug))
        .limit(1);
      if (slugExists) {
        throw new ConflictError("Document with this title already exists");
      }
      updates.slug = newSlug;
    }
  }

  // Determine the effective type (updated or existing)
  const effectiveType = type !== undefined ? type : existing.type;

  if (content !== undefined) {
    // For prompts: normalize content to chat format
    if (effectiveType === "prompt") {
      updates.content = normalizePromptContent(content);
    } else {
      updates.content = content;
    }
  }

  if (type !== undefined && ["writing", "prompt", "note"].includes(type)) {
    updates.type = type;
  }

  if (metadata !== undefined) {
    // Normalize: migrate legacy 'year' field to 'writtenDate' if needed
    const normalizedMetadata: Record<string, unknown> = { ...metadata };
    if (normalizedMetadata.year && !normalizedMetadata.writtenDate) {
      normalizedMetadata.writtenDate = normalizedMetadata.year;
      delete normalizedMetadata.year;
    } else if (normalizedMetadata.year) {
      // If both exist, prefer writtenDate and remove year
      delete normalizedMetadata.year;
    }

    // For prompts: auto-detect role from content if not provided
    if (effectiveType === "prompt" && !normalizedMetadata.role) {
      const contentToCheck = updates.content || existing.content;
      normalizedMetadata.role = detectPromptRole(contentToCheck);
    }

    updates.metadata = JSON.stringify(normalizedMetadata);
  }

  if (summary !== undefined) {
    updates.summary = summary;
    if (summary) {
      const { summaryUpdatedAtNow } = await import("@/lib/summary-stamp");
      updates.summaryUpdatedAt = summaryUpdatedAtNow();
    }
  }

  updates.updatedAt = sql`CURRENT_TIMESTAMP`;

  // Track if content changed for auto-summary generation
  const contentChanged = content !== undefined && content !== existing.content;

  try {
    if (isNumericId) {
      await db
        .update(documents)
        .set(updates)
        .where(eq(documents.id, parseInt(slug, 10)))
        .run();
    } else {
      await db.update(documents).set(updates).where(eq(documents.slug, slug)).run();
    }

    // Fetch updated document
    let updated: DocumentRow | undefined;
    if (isNumericId) {
      updated = await getDocumentBySlugOrId(db, slug);
    } else if (title) {
      updated = await getDocumentBySlugOrId(db, slugify(title));
    } else {
      updated = await getDocumentBySlugOrId(db, slug);
    }

    if (!updated) {
      throw new DatabaseError("Failed to retrieve updated document");
    }

    const parsedDoc = parseDocumentMetadata(updated);

    // Auto-generate summary if content changed and summary not explicitly provided
    if (contentChanged && summary === undefined) {
      try {
        const contentToSummarize = updated.content || "";
        if (contentToSummarize.length > 20) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3005";
          const summaryResponse = await fetch(`${baseUrl}/api/ai/summarize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "document",
              content: contentToSummarize,
              title: updated.title,
              metadata: parsedDoc.metadata,
            }),
          });

          if (summaryResponse.ok) {
            const summaryData = await summaryResponse.json();
            if (summaryData.summary) {
              // Update document with generated summary
              const { summaryUpdatedAtNow } = await import("@/lib/summary-stamp");
              await db
                .update(documents)
                .set({ summary: summaryData.summary, summaryUpdatedAt: summaryUpdatedAtNow() })
                .where(eq(documents.id, updated.id))
                .run();
              parsedDoc.summary = summaryData.summary;
            }
          }
        }
      } catch (summaryError) {
        // Don't fail the update if summary generation fails
        console.warn("Failed to generate summary for updated document:", summaryError);
      }
    }

    const { markContextMetricsStale } = await import("@/lib/mark-context-metrics-stale");
    markContextMetricsStale();

    return NextResponse.json(toApiDocument(parsedDoc));
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ConflictError ||
      error instanceof DatabaseError
    ) {
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
export const DELETE = withErrorHandler<{ slug: string }>(async (request: NextRequest, context) => {
  const { params } = context!;
  const { slug } = await params;
  const db = getDrizzleDb();

  // Support both slug and numeric ID
  let result: { changes?: number } | undefined;
  if (/^\d+$/.test(slug)) {
    result = await db
      .delete(documents)
      .where(eq(documents.id, parseInt(slug, 10)))
      .run();
  } else {
    result = await db.delete(documents).where(eq(documents.slug, slug)).run();
  }

  if (!result?.changes) {
    throw new NotFoundError("Document not found");
  }

  const { markContextMetricsStale } = await import("@/lib/mark-context-metrics-stale");
  markContextMetricsStale();

  return NextResponse.json({ success: true });
});
