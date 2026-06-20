import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody } from "@/lib/validations";
import { createArtemisArtifactSchema } from "@/lib/validations/schemas";
import { getDatabase } from "@/lib/db";
import { getApplicationDetail, initArtemisSchema, toNullableText } from "@/lib/artemis/db";
import { NotFoundError, ValidationError } from "@/lib/errors";

function parseId(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("Invalid Artemis application ID");
  }
  return id;
}

/**
 * POST /api/artemis/applications/[id]/artifacts
 *
 * Link an existing document or media asset to an Artemis application.
 */
export const POST = withErrorHandler(
  async (request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const resolvedParams = await context?.params;
    const applicationId = parseId(resolvedParams?.id);
    const body = await requireBody(createArtemisArtifactSchema, request);
    const db = getDatabase();
    initArtemisSchema(db);

    const application = db
      .prepare("SELECT id FROM artemis_applications WHERE id = ?")
      .get(applicationId);
    if (!application) throw new NotFoundError("Artemis application", String(applicationId));

    if (!body.document_id && !body.media_asset_id) {
      throw new ValidationError("Provide document_id or media_asset_id");
    }

    if (body.document_id) {
      const document = db.prepare("SELECT id FROM documents WHERE id = ?").get(body.document_id);
      if (!document) throw new NotFoundError("Document", String(body.document_id));
    }
    if (body.media_asset_id) {
      const media = db.prepare("SELECT id FROM media_assets WHERE id = ?").get(body.media_asset_id);
      if (!media) throw new NotFoundError("Media asset", String(body.media_asset_id));
    }

    db.prepare(`
      INSERT INTO artemis_application_artifacts (
        application_id, artifact_type, document_id, media_asset_id, label, sent_at, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      applicationId,
      body.artifact_type,
      body.document_id ?? null,
      body.media_asset_id ?? null,
      toNullableText(body.label),
      toNullableText(body.sent_at),
      toNullableText(body.notes)
    );

    const detail = getApplicationDetail(db, applicationId);
    return NextResponse.json(detail, { status: 201 });
  }
);
