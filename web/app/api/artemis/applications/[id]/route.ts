import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody } from "@/lib/validations";
import { updateArtemisApplicationSchema } from "@/lib/validations/schemas";
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
 * GET /api/artemis/applications/[id]
 *
 * Fetch a hydrated Artemis application detail.
 */
export const GET = withErrorHandler(
  async (_request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const resolvedParams = await context?.params;
    const id = parseId(resolvedParams?.id);
    const db = getDatabase();
    initArtemisSchema(db);

    const detail = getApplicationDetail(db, id);
    if (!detail) throw new NotFoundError("Artemis application", String(id));

    return NextResponse.json(detail);
  }
);

/**
 * PATCH /api/artemis/applications/[id]
 *
 * Patch application status, dates, priority, fit score, contacts, and notes.
 */
export const PATCH = withErrorHandler(
  async (request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const resolvedParams = await context?.params;
    const id = parseId(resolvedParams?.id);
    const body = await requireBody(updateArtemisApplicationSchema, request);
    const db = getDatabase();
    initArtemisSchema(db);

    const existing = db.prepare("SELECT id FROM artemis_applications WHERE id = ?").get(id);
    if (!existing) throw new NotFoundError("Artemis application", String(id));

    const updates: string[] = ["updated_at = CURRENT_TIMESTAMP"];
    const params: unknown[] = [];

    const add = (column: string, value: unknown) => {
      updates.push(`${column} = ?`);
      params.push(value);
    };

    if (body.status !== undefined) add("status", body.status);
    if (body.priority !== undefined) add("priority", body.priority);
    if (body.fit_score !== undefined) add("fit_score", body.fit_score ?? null);
    if (body.applied_at !== undefined) add("applied_at", toNullableText(body.applied_at));
    if (body.deadline_at !== undefined) add("deadline_at", toNullableText(body.deadline_at));
    if (body.follow_up_at !== undefined) add("follow_up_at", toNullableText(body.follow_up_at));
    if (body.source !== undefined) add("source", toNullableText(body.source));
    if (body.contact_name !== undefined) add("contact_name", toNullableText(body.contact_name));
    if (body.contact_email !== undefined) add("contact_email", toNullableText(body.contact_email));
    if (body.notes !== undefined) add("notes", toNullableText(body.notes));

    db.prepare(`UPDATE artemis_applications SET ${updates.join(", ")} WHERE id = ?`).run(
      ...params,
      id
    );

    const detail = getApplicationDetail(db, id);
    return NextResponse.json(detail);
  }
);
