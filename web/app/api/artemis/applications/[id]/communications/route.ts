import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody } from "@/lib/validations";
import { createArtemisCommunicationSchema } from "@/lib/validations/schemas";
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

function registerCommunication(sourceId: number, title: string, summary?: string) {
  if (!summary || summary.trim().length < 20) return;
  import("@/lib/object-registry")
    .then(({ registerObject }) => {
      registerObject({
        type: "artemis_communication",
        sourceTable: "artemis_communications",
        sourceId: String(sourceId),
        title,
        summary,
        tags: ["artemis", "job-hunt", "communication"],
      });
    })
    .catch(() => {});
}

/**
 * POST /api/artemis/applications/[id]/communications
 *
 * Save a communication/manual note and create a follow-up task when requested.
 */
export const POST = withErrorHandler(
  async (request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const resolvedParams = await context?.params;
    const applicationId = parseId(resolvedParams?.id);
    const body = await requireBody(createArtemisCommunicationSchema, request);
    const db = getDatabase();
    initArtemisSchema(db);

    const application = db
      .prepare(`
        SELECT a.id, a.position_id, p.company_id, p.title, c.name AS company_name
        FROM artemis_applications a
        JOIN artemis_job_positions p ON p.id = a.position_id
        JOIN artemis_companies c ON c.id = p.company_id
        WHERE a.id = ?
      `)
      .get(applicationId) as any | undefined;
    if (!application) throw new NotFoundError("Artemis application", String(applicationId));

    const companyId = body.company_id ?? application.company_id;
    const positionId = body.position_id ?? application.position_id;
    const occurredAt = toNullableText(body.occurred_at) ?? new Date().toISOString();

    const tx = db.transaction(() => {
      const result = db
        .prepare(`
          INSERT INTO artemis_communications (
            application_id, company_id, position_id, channel, direction, contact_name,
            contact_email, subject, raw_text, summary, occurred_at, next_action, next_action_due_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          applicationId,
          companyId,
          positionId,
          body.channel,
          body.direction,
          toNullableText(body.contact_name),
          toNullableText(body.contact_email),
          toNullableText(body.subject),
          toNullableText(body.raw_text),
          toNullableText(body.summary),
          occurredAt,
          toNullableText(body.next_action),
          toNullableText(body.next_action_due_at)
        );

      db.prepare(`
        UPDATE artemis_applications
        SET last_activity_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(occurredAt, applicationId);

      if (body.next_action?.trim()) {
        db.prepare(`
          INSERT INTO artemis_tasks (application_id, title, due_at, status)
          VALUES (?, ?, ?, 'open')
        `).run(applicationId, body.next_action.trim(), toNullableText(body.next_action_due_at));
      }

      return Number(result.lastInsertRowid);
    });

    const communicationId = tx();
    registerCommunication(
      communicationId,
      body.subject || `${application.title} at ${application.company_name}`,
      body.summary || body.raw_text || undefined
    );

    const detail = getApplicationDetail(db, applicationId);
    return NextResponse.json(detail, { status: 201 });
  }
);
