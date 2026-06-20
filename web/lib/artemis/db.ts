import type Database from "better-sqlite3";
import { getDatabase } from "@/lib/db";

export const ARTEMIS_STATUSES = [
  "saved",
  "drafting",
  "applied",
  "screening",
  "interviewing",
  "take_home",
  "offer",
  "rejected",
  "withdrawn",
  "archived",
] as const;

export type ArtemisStatus = (typeof ARTEMIS_STATUSES)[number];

let initialized = false;

export function initArtemisSchema(database: Database.Database = getDatabase()): void {
  if (initialized) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS artemis_companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      website TEXT,
      industry TEXT,
      size TEXT,
      headquarters TEXT,
      location TEXT,
      linkedin_url TEXT,
      description TEXT,
      notes TEXT,
      tags TEXT DEFAULT '[]',
      summary TEXT,
      summary_updated_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_artemis_companies_name_lower
      ON artemis_companies(lower(name));

    CREATE TABLE IF NOT EXISTS artemis_job_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES artemis_companies(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      department TEXT,
      employment_type TEXT,
      seniority TEXT,
      location TEXT,
      work_mode TEXT DEFAULT 'unknown',
      source_url TEXT,
      source_platform TEXT,
      salary_min INTEGER,
      salary_max INTEGER,
      salary_currency TEXT,
      benefits TEXT DEFAULT '[]',
      responsibilities TEXT DEFAULT '[]',
      requirements TEXT DEFAULT '[]',
      nice_to_have TEXT DEFAULT '[]',
      raw_posting_text TEXT,
      extracted_data TEXT DEFAULT '{}',
      summary TEXT,
      summary_updated_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_artemis_positions_company
      ON artemis_job_positions(company_id);
    CREATE INDEX IF NOT EXISTS idx_artemis_positions_title
      ON artemis_job_positions(title);

    CREATE TABLE IF NOT EXISTS artemis_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position_id INTEGER NOT NULL REFERENCES artemis_job_positions(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'saved',
      priority TEXT DEFAULT 'medium',
      fit_score INTEGER,
      applied_at TEXT,
      deadline_at TEXT,
      follow_up_at TEXT,
      last_activity_at TEXT,
      source TEXT,
      contact_name TEXT,
      contact_email TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_artemis_applications_position
      ON artemis_applications(position_id);
    CREATE INDEX IF NOT EXISTS idx_artemis_applications_status
      ON artemis_applications(status);
    CREATE INDEX IF NOT EXISTS idx_artemis_applications_follow_up
      ON artemis_applications(follow_up_at);

    CREATE TABLE IF NOT EXISTS artemis_application_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL REFERENCES artemis_applications(id) ON DELETE CASCADE,
      artifact_type TEXT NOT NULL,
      document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
      media_asset_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
      label TEXT,
      sent_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      CHECK (document_id IS NOT NULL OR media_asset_id IS NOT NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_artemis_artifacts_application
      ON artemis_application_artifacts(application_id);
    CREATE INDEX IF NOT EXISTS idx_artemis_artifacts_document
      ON artemis_application_artifacts(document_id);
    CREATE INDEX IF NOT EXISTS idx_artemis_artifacts_media
      ON artemis_application_artifacts(media_asset_id);

    CREATE TABLE IF NOT EXISTS artemis_communications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER REFERENCES artemis_applications(id) ON DELETE SET NULL,
      company_id INTEGER REFERENCES artemis_companies(id) ON DELETE SET NULL,
      position_id INTEGER REFERENCES artemis_job_positions(id) ON DELETE SET NULL,
      channel TEXT NOT NULL DEFAULT 'note',
      direction TEXT NOT NULL DEFAULT 'internal_note',
      contact_name TEXT,
      contact_email TEXT,
      subject TEXT,
      raw_text TEXT,
      summary TEXT,
      occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      next_action TEXT,
      next_action_due_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_artemis_communications_application
      ON artemis_communications(application_id);
    CREATE INDEX IF NOT EXISTS idx_artemis_communications_company
      ON artemis_communications(company_id);
    CREATE INDEX IF NOT EXISTS idx_artemis_communications_occurred
      ON artemis_communications(occurred_at DESC);

    CREATE TABLE IF NOT EXISTS artemis_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER REFERENCES artemis_applications(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      due_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_artemis_tasks_application
      ON artemis_tasks(application_id);
    CREATE INDEX IF NOT EXISTS idx_artemis_tasks_due
      ON artemis_tasks(due_at);
    CREATE INDEX IF NOT EXISTS idx_artemis_tasks_status
      ON artemis_tasks(status);
  `);

  initialized = true;
}

export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || value.trim() === "") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function toNullableText(value: unknown): string | null {
  if (typeof value !== "string") return value == null ? null : String(value);
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function toApiCompany(row: any) {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    industry: row.industry,
    size: row.size,
    headquarters: row.headquarters,
    location: row.location,
    linkedin_url: row.linkedin_url,
    description: row.description,
    notes: row.notes,
    tags: parseJsonArray(row.tags),
    summary: row.summary,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toApiPosition(row: any) {
  return {
    id: row.id,
    company_id: row.company_id,
    title: row.title,
    department: row.department,
    employment_type: row.employment_type,
    seniority: row.seniority,
    location: row.location,
    work_mode: row.work_mode || "unknown",
    source_url: row.source_url,
    source_platform: row.source_platform,
    salary_min: row.salary_min,
    salary_max: row.salary_max,
    salary_currency: row.salary_currency,
    benefits: parseJsonArray(row.benefits),
    responsibilities: parseJsonArray(row.responsibilities),
    requirements: parseJsonArray(row.requirements),
    nice_to_have: parseJsonArray(row.nice_to_have),
    raw_posting_text: row.raw_posting_text,
    extracted_data: parseJsonObject(row.extracted_data),
    summary: row.summary,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toApiApplication(row: any) {
  return {
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
  };
}

export function toApiArtifact(row: any) {
  return {
    id: row.id,
    application_id: row.application_id,
    artifact_type: row.artifact_type,
    document_id: row.document_id,
    media_asset_id: row.media_asset_id,
    label: row.label,
    sent_at: row.sent_at,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    document_title: row.document_title,
    document_slug: row.document_slug,
    media_filename: row.media_filename,
  };
}

export function toApiCommunication(row: any) {
  return {
    id: row.id,
    application_id: row.application_id,
    company_id: row.company_id,
    position_id: row.position_id,
    channel: row.channel,
    direction: row.direction,
    contact_name: row.contact_name,
    contact_email: row.contact_email,
    subject: row.subject,
    raw_text: row.raw_text,
    summary: row.summary,
    occurred_at: row.occurred_at,
    next_action: row.next_action,
    next_action_due_at: row.next_action_due_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toApiTask(row: any) {
  return {
    id: row.id,
    application_id: row.application_id,
    title: row.title,
    description: row.description,
    due_at: row.due_at,
    status: row.status,
    created_at: row.created_at,
    completed_at: row.completed_at,
    updated_at: row.updated_at,
  };
}

export function getApplicationDetail(database: Database.Database, id: number) {
  initArtemisSchema(database);

  const application = database
    .prepare("SELECT * FROM artemis_applications WHERE id = ?")
    .get(id) as any | undefined;
  if (!application) return null;

  const position = database
    .prepare("SELECT * FROM artemis_job_positions WHERE id = ?")
    .get(application.position_id) as any;
  const company = database
    .prepare("SELECT * FROM artemis_companies WHERE id = ?")
    .get(position.company_id) as any;
  const artifacts = database
    .prepare(`
      SELECT aa.*, d.title AS document_title, d.slug AS document_slug, ma.filename AS media_filename
      FROM artemis_application_artifacts aa
      LEFT JOIN documents d ON d.id = aa.document_id
      LEFT JOIN media_assets ma ON ma.id = aa.media_asset_id
      WHERE aa.application_id = ?
      ORDER BY COALESCE(aa.sent_at, aa.created_at) DESC
    `)
    .all(id) as any[];
  const communications = database
    .prepare(`
      SELECT *
      FROM artemis_communications
      WHERE application_id = ?
      ORDER BY occurred_at DESC, created_at DESC
    `)
    .all(id) as any[];
  const tasks = database
    .prepare(`
      SELECT *
      FROM artemis_tasks
      WHERE application_id = ?
      ORDER BY status ASC, due_at ASC, created_at DESC
    `)
    .all(id) as any[];

  return {
    application: toApiApplication(application),
    position: toApiPosition(position),
    company: toApiCompany(company),
    artifacts: artifacts.map(toApiArtifact),
    communications: communications.map(toApiCommunication),
    tasks: tasks.map(toApiTask),
  };
}
