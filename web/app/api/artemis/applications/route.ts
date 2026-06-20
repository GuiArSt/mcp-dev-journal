import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody, requireQuery } from "@/lib/validations";
import { createArtemisApplicationSchema, artemisApplicationQuerySchema } from "@/lib/validations/schemas";
import { getDatabase } from "@/lib/db";
import {
  getApplicationDetail,
  initArtemisSchema,
  parseJsonArray,
  toNullableText,
} from "@/lib/artemis/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";

function registerArtemisObject(type: string, sourceTable: string, sourceId: number, title: string, summary?: string) {
  import("@/lib/object-registry")
    .then(({ registerObject }) => {
      registerObject({
        type,
        sourceTable,
        sourceId: String(sourceId),
        title,
        summary,
        tags: ["artemis", "job-hunt"],
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
 * GET /api/artemis/applications
 *
 * List Artemis applications with company and position summary fields.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const db = getDatabase();
  initArtemisSchema(db);

  const { status, company_id, search, limit, offset } = requireQuery(
    artemisApplicationQuerySchema,
    request
  );

  const where: string[] = [];
  const params: unknown[] = [];

  if (status) {
    where.push("a.status = ?");
    params.push(status);
  }
  if (company_id) {
    where.push("c.id = ?");
    params.push(company_id);
  }
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    where.push("(c.name LIKE ? OR p.title LIKE ? OR a.notes LIKE ? OR p.raw_posting_text LIKE ?)");
    params.push(term, term, term, term);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = db
    .prepare(`
      SELECT
        a.*,
        p.title AS position_title,
        p.location AS position_location,
        p.work_mode AS position_work_mode,
        p.source_url AS position_source_url,
        c.id AS company_id,
        c.name AS company_name,
        c.industry AS company_industry,
        c.location AS company_location,
        (
          SELECT COUNT(*)
          FROM artemis_communications ac
          WHERE ac.application_id = a.id
        ) AS communication_count,
        (
          SELECT COUNT(*)
          FROM artemis_application_artifacts aa
          WHERE aa.application_id = a.id
        ) AS artifact_count,
        (
          SELECT COUNT(*)
          FROM artemis_tasks t
          WHERE t.application_id = a.id AND t.status = 'open'
        ) AS open_task_count
      FROM artemis_applications a
      JOIN artemis_job_positions p ON p.id = a.position_id
      JOIN artemis_companies c ON c.id = p.company_id
      ${whereSql}
      ORDER BY COALESCE(a.last_activity_at, a.updated_at, a.created_at) DESC
      LIMIT ? OFFSET ?
    `)
    .all(...params, limit, offset) as any[];

  const total = db
    .prepare(`
      SELECT COUNT(*) AS total
      FROM artemis_applications a
      JOIN artemis_job_positions p ON p.id = a.position_id
      JOIN artemis_companies c ON c.id = p.company_id
      ${whereSql}
    `)
    .get(...params) as { total: number };

  return NextResponse.json({
    applications: rows.map((row) => ({
      id: row.id,
      position_id: row.position_id,
      status: row.status,
      priority: row.priority,
      fit_score: row.fit_score,
      applied_at: row.applied_at,
      deadline_at: row.deadline_at,
      follow_up_at: row.follow_up_at,
      last_activity_at: row.last_activity_at,
      source: row.source,
      contact_name: row.contact_name,
      contact_email: row.contact_email,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      position: {
        id: row.position_id,
        title: row.position_title,
        location: row.position_location,
        work_mode: row.position_work_mode,
        source_url: row.position_source_url,
      },
      company: {
        id: row.company_id,
        name: row.company_name,
        industry: row.company_industry,
        location: row.company_location,
      },
      communication_count: row.communication_count,
      artifact_count: row.artifact_count,
      open_task_count: row.open_task_count,
    })),
    total: total.total,
    limit,
    offset,
    has_more: offset + rows.length < total.total,
  });
});

/**
 * POST /api/artemis/applications
 *
 * Create an application and either reference or create its company and position.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const db = getDatabase();
  initArtemisSchema(db);
  const body = await requireBody(createArtemisApplicationSchema, request);

  const createApplication = db.transaction(() => {
    let companyId = body.company_id ?? body.company?.id ?? null;

    if (!companyId) {
      if (!body.company?.name) {
        throw new ValidationError("Provide company_id or company details");
      }

      const existingCompany = db
        .prepare("SELECT id FROM artemis_companies WHERE lower(name) = lower(?) LIMIT 1")
        .get(body.company.name) as { id: number } | undefined;

      if (existingCompany) {
        companyId = existingCompany.id;
      } else {
        const result = db
          .prepare(`
            INSERT INTO artemis_companies (
              name, website, industry, size, headquarters, location, linkedin_url,
              description, notes, tags
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            body.company.name,
            toNullableText(body.company.website),
            toNullableText(body.company.industry),
            toNullableText(body.company.size),
            toNullableText(body.company.headquarters),
            toNullableText(body.company.location),
            toNullableText(body.company.linkedin_url),
            toNullableText(body.company.description),
            toNullableText(body.company.notes),
            JSON.stringify(body.company.tags ?? [])
          );
        companyId = Number(result.lastInsertRowid);
      }
    }

    const company = db
      .prepare("SELECT * FROM artemis_companies WHERE id = ?")
      .get(companyId) as any | undefined;
    if (!company) throw new NotFoundError("Artemis company", String(companyId));

    let positionId = body.position_id ?? body.position?.id ?? null;

    if (!positionId) {
      if (!body.position?.title) {
        throw new ValidationError("Provide position_id or position details");
      }

      const existingPosition = body.position.source_url
        ? (db
            .prepare(`
              SELECT id FROM artemis_job_positions
              WHERE company_id = ? AND lower(title) = lower(?) AND source_url = ?
              LIMIT 1
            `)
            .get(companyId, body.position.title, body.position.source_url) as { id: number } | undefined)
        : (db
            .prepare(`
              SELECT id FROM artemis_job_positions
              WHERE company_id = ? AND lower(title) = lower(?)
              LIMIT 1
            `)
            .get(companyId, body.position.title) as { id: number } | undefined);

      if (existingPosition) {
        positionId = existingPosition.id;
      } else {
        const result = db
          .prepare(`
            INSERT INTO artemis_job_positions (
              company_id, title, department, employment_type, seniority, location, work_mode,
              source_url, source_platform, salary_min, salary_max, salary_currency,
              benefits, responsibilities, requirements, nice_to_have, raw_posting_text, extracted_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            companyId,
            body.position.title,
            toNullableText(body.position.department),
            toNullableText(body.position.employment_type),
            toNullableText(body.position.seniority),
            toNullableText(body.position.location),
            body.position.work_mode,
            toNullableText(body.position.source_url),
            toNullableText(body.position.source_platform),
            body.position.salary_min ?? null,
            body.position.salary_max ?? null,
            toNullableText(body.position.salary_currency),
            JSON.stringify(body.position.benefits ?? []),
            JSON.stringify(body.position.responsibilities ?? []),
            JSON.stringify(body.position.requirements ?? []),
            JSON.stringify(body.position.nice_to_have ?? []),
            toNullableText(body.position.raw_posting_text),
            JSON.stringify(body.position.extracted_data ?? {})
          );
        positionId = Number(result.lastInsertRowid);
      }
    }

    const position = db
      .prepare("SELECT * FROM artemis_job_positions WHERE id = ?")
      .get(positionId) as any | undefined;
    if (!position) throw new NotFoundError("Artemis job position", String(positionId));

    const result = db
      .prepare(`
        INSERT INTO artemis_applications (
          position_id, status, priority, fit_score, applied_at, deadline_at,
          follow_up_at, source, contact_name, contact_email, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        positionId,
        body.status,
        body.priority,
        body.fit_score ?? null,
        toNullableText(body.applied_at),
        toNullableText(body.deadline_at),
        toNullableText(body.follow_up_at),
        toNullableText(body.source),
        toNullableText(body.contact_name),
        toNullableText(body.contact_email),
        toNullableText(body.notes)
      );

    const applicationId = Number(result.lastInsertRowid);
    return { applicationId, company, position };
  });

  try {
    const { applicationId, company, position } = createApplication();
    registerArtemisObject("artemis_company", "artemis_companies", company.id, company.name, company.description ?? undefined);
    registerArtemisObject(
      "artemis_job_position",
      "artemis_job_positions",
      position.id,
      `${position.title} at ${company.name}`,
      [
        position.location,
        parseJsonArray(position.requirements).slice(0, 3).join(", "),
      ].filter(Boolean).join(" | ") || undefined
    );
    registerArtemisObject(
      "artemis_application",
      "artemis_applications",
      applicationId,
      `${position.title} at ${company.name}`,
      "Job application tracked in Artemis"
    );
    markMetricsStale();

    const detail = getApplicationDetail(db, applicationId);
    return NextResponse.json(detail, { status: 201 });
  } catch (error: any) {
    if (error.message?.includes("UNIQUE constraint")) {
      throw new ConflictError("Artemis record already exists");
    }
    throw error;
  }
});
