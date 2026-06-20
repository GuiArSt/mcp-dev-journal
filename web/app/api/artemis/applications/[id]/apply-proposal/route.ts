import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { getDatabase } from "@/lib/db";
import { getApplicationDetail, initArtemisSchema, toNullableText } from "@/lib/artemis/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { requireBody } from "@/lib/validations";
import { applyArtemisChatProposalSchema } from "@/lib/validations/schemas";

function parseId(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError("Invalid Artemis application ID");
  }
  return id;
}

function registerCommunication(sourceId: number, title: string, summary?: string | null) {
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

function markMetricsStale() {
  import("@/lib/mark-context-metrics-stale")
    .then(({ markContextMetricsStale }) => markContextMetricsStale())
    .catch(() => {});
}

/**
 * POST /api/artemis/applications/[id]/apply-proposal
 *
 * Applies a reviewed Artemis chat proposal to an existing application.
 */
export const POST = withErrorHandler(
  async (request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const resolvedParams = await context?.params;
    const applicationId = parseId(resolvedParams?.id);
    const body = await requireBody(applyArtemisChatProposalSchema, request);
    const db = getDatabase();
    initArtemisSchema(db);

    const existing = db
      .prepare(`
        SELECT a.id, a.position_id, p.company_id, p.title, c.name AS company_name
        FROM artemis_applications a
        JOIN artemis_job_positions p ON p.id = a.position_id
        JOIN artemis_companies c ON c.id = p.company_id
        WHERE a.id = ?
      `)
      .get(applicationId) as any | undefined;
    if (!existing) throw new NotFoundError("Artemis application", String(applicationId));

    const tx = db.transaction(() => {
      if (body.company_patch && Object.keys(body.company_patch).length) {
        const updates: string[] = ["updated_at = CURRENT_TIMESTAMP"];
        const params: unknown[] = [];
        const add = (column: string, value: unknown) => {
          updates.push(`${column} = ?`);
          params.push(value);
        };

        if (body.company_patch.name !== undefined) add("name", body.company_patch.name);
        if (body.company_patch.website !== undefined) add("website", toNullableText(body.company_patch.website));
        if (body.company_patch.industry !== undefined) add("industry", toNullableText(body.company_patch.industry));
        if (body.company_patch.size !== undefined) add("size", toNullableText(body.company_patch.size));
        if (body.company_patch.headquarters !== undefined) add("headquarters", toNullableText(body.company_patch.headquarters));
        if (body.company_patch.location !== undefined) add("location", toNullableText(body.company_patch.location));
        if (body.company_patch.linkedin_url !== undefined) add("linkedin_url", toNullableText(body.company_patch.linkedin_url));
        if (body.company_patch.description !== undefined) add("description", toNullableText(body.company_patch.description));
        if (body.company_patch.notes !== undefined) add("notes", toNullableText(body.company_patch.notes));
        if (body.company_patch.tags !== undefined) add("tags", JSON.stringify(body.company_patch.tags));

        if (params.length) {
          db.prepare(`UPDATE artemis_companies SET ${updates.join(", ")} WHERE id = ?`).run(
            ...params,
            existing.company_id
          );
        }
      }

      if (body.position_patch && Object.keys(body.position_patch).length) {
        const updates: string[] = ["updated_at = CURRENT_TIMESTAMP"];
        const params: unknown[] = [];
        const add = (column: string, value: unknown) => {
          updates.push(`${column} = ?`);
          params.push(value);
        };

        if (body.position_patch.title !== undefined) add("title", body.position_patch.title);
        if (body.position_patch.department !== undefined) add("department", toNullableText(body.position_patch.department));
        if (body.position_patch.employment_type !== undefined) add("employment_type", toNullableText(body.position_patch.employment_type));
        if (body.position_patch.seniority !== undefined) add("seniority", toNullableText(body.position_patch.seniority));
        if (body.position_patch.location !== undefined) add("location", toNullableText(body.position_patch.location));
        if (body.position_patch.work_mode !== undefined) add("work_mode", body.position_patch.work_mode);
        if (body.position_patch.source_url !== undefined) add("source_url", toNullableText(body.position_patch.source_url));
        if (body.position_patch.source_platform !== undefined) add("source_platform", toNullableText(body.position_patch.source_platform));
        if (body.position_patch.salary_min !== undefined) add("salary_min", body.position_patch.salary_min ?? null);
        if (body.position_patch.salary_max !== undefined) add("salary_max", body.position_patch.salary_max ?? null);
        if (body.position_patch.salary_currency !== undefined) add("salary_currency", toNullableText(body.position_patch.salary_currency));
        if (body.position_patch.benefits !== undefined) add("benefits", JSON.stringify(body.position_patch.benefits));
        if (body.position_patch.responsibilities !== undefined) add("responsibilities", JSON.stringify(body.position_patch.responsibilities));
        if (body.position_patch.requirements !== undefined) add("requirements", JSON.stringify(body.position_patch.requirements));
        if (body.position_patch.nice_to_have !== undefined) add("nice_to_have", JSON.stringify(body.position_patch.nice_to_have));
        if (body.position_patch.raw_posting_text !== undefined) add("raw_posting_text", toNullableText(body.position_patch.raw_posting_text));
        if (body.position_patch.extracted_data !== undefined) add("extracted_data", JSON.stringify(body.position_patch.extracted_data));

        if (params.length) {
          db.prepare(`UPDATE artemis_job_positions SET ${updates.join(", ")} WHERE id = ?`).run(
            ...params,
            existing.position_id
          );
        }
      }

      if (body.application_patch && Object.keys(body.application_patch).length) {
        const updates: string[] = ["updated_at = CURRENT_TIMESTAMP"];
        const params: unknown[] = [];
        const add = (column: string, value: unknown) => {
          updates.push(`${column} = ?`);
          params.push(value);
        };

        if (body.application_patch.status !== undefined) add("status", body.application_patch.status);
        if (body.application_patch.priority !== undefined) add("priority", body.application_patch.priority);
        if (body.application_patch.fit_score !== undefined) add("fit_score", body.application_patch.fit_score ?? null);
        if (body.application_patch.applied_at !== undefined) add("applied_at", toNullableText(body.application_patch.applied_at));
        if (body.application_patch.deadline_at !== undefined) add("deadline_at", toNullableText(body.application_patch.deadline_at));
        if (body.application_patch.follow_up_at !== undefined) add("follow_up_at", toNullableText(body.application_patch.follow_up_at));
        if (body.application_patch.source !== undefined) add("source", toNullableText(body.application_patch.source));
        if (body.application_patch.contact_name !== undefined) add("contact_name", toNullableText(body.application_patch.contact_name));
        if (body.application_patch.contact_email !== undefined) add("contact_email", toNullableText(body.application_patch.contact_email));
        if (body.application_patch.notes !== undefined) add("notes", toNullableText(body.application_patch.notes));

        if (params.length) {
          db.prepare(`UPDATE artemis_applications SET ${updates.join(", ")} WHERE id = ?`).run(
            ...params,
            applicationId
          );
        }
      }

      let communicationId: number | null = null;
      if (body.communication) {
        const occurredAt = toNullableText(body.communication.occurred_at) ?? new Date().toISOString();
        const result = db
          .prepare(`
            INSERT INTO artemis_communications (
              application_id, company_id, position_id, channel, direction, contact_name,
              contact_email, subject, raw_text, summary, occurred_at, next_action, next_action_due_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            applicationId,
            body.communication.company_id ?? existing.company_id,
            body.communication.position_id ?? existing.position_id,
            body.communication.channel,
            body.communication.direction,
            toNullableText(body.communication.contact_name),
            toNullableText(body.communication.contact_email),
            toNullableText(body.communication.subject),
            toNullableText(body.communication.raw_text),
            toNullableText(body.communication.summary),
            occurredAt,
            toNullableText(body.communication.next_action),
            toNullableText(body.communication.next_action_due_at)
          );
        communicationId = Number(result.lastInsertRowid);
        db.prepare(`
          UPDATE artemis_applications
          SET last_activity_at = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(occurredAt, applicationId);
      }

      const task = body.task ?? (body.communication?.next_action
        ? {
            title: body.communication.next_action,
            description: null,
            due_at: body.communication.next_action_due_at ?? null,
          }
        : null);
      if (task?.title?.trim()) {
        db.prepare(`
          INSERT INTO artemis_tasks (application_id, title, description, due_at, status)
          VALUES (?, ?, ?, ?, 'open')
        `).run(
          applicationId,
          task.title.trim(),
          toNullableText(task.description),
          toNullableText(task.due_at)
        );
      }

      return communicationId;
    });

    const communicationId = tx();
    if (communicationId && body.communication) {
      registerCommunication(
        communicationId,
        body.communication.subject || `${existing.title} at ${existing.company_name}`,
        body.communication.summary || body.communication.raw_text
      );
    }
    markMetricsStale();

    const detail = getApplicationDetail(db, applicationId);
    return NextResponse.json(detail);
  }
);
