import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { normalizeRepository } from "@/lib/utils";
import { NotFoundError } from "@/lib/errors";
import { triggerBackup } from "@/lib/backup";

const PATCH_KEYS = [
  "git_url",
  "summary",
  "purpose",
  "architecture",
  "key_decisions",
  "technologies",
  "status",
  "linear_project_id",
  "linear_issue_id",
  "file_structure",
  "tech_stack",
  "frontend",
  "backend",
  "database_info",
  "services",
  "custom_tooling",
  "data_flow",
  "patterns",
  "commands",
  "extended_notes",
] as const;

type PatchKey = (typeof PATCH_KEYS)[number];

function emptyOverviewRow(repository: string): Record<string, unknown> {
  return {
    repository,
    git_url: null,
    summary: "Pending — fill via Kronus or Reader.",
    purpose: "",
    architecture: "",
    key_decisions: "",
    technologies: "",
    status: "active",
    linear_project_id: null,
    linear_issue_id: null,
    file_structure: null,
    tech_stack: null,
    frontend: null,
    backend: null,
    database_info: null,
    services: null,
    custom_tooling: null,
    data_flow: null,
    patterns: null,
    commands: null,
    extended_notes: null,
    last_synced_entry: null,
    entries_synced: null,
  };
}

function mergeOverview(
  repository: string,
  existing: Record<string, unknown> | undefined,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const base = existing
    ? { ...existing }
    : (emptyOverviewRow(repository) as Record<string, unknown>);
  for (const k of PATCH_KEYS) {
    if (body[k] !== undefined) base[k] = body[k];
  }
  base.repository = repository;
  return base;
}

/**
 * GET /api/repository-overviews/[repository]
 * Single Repository overview (Entry 0) row, snake_case.
 */
export const GET = withErrorHandler<{ repository: string }>(
  async (_request: NextRequest, context) => {
    const { repository: raw } = await context!.params;
    const repository = normalizeRepository(decodeURIComponent(raw));
    const db = getDatabase();
    const row = db
      .prepare(`SELECT * FROM repository_overviews WHERE repository = ?`)
      .get(repository) as Record<string, unknown> | undefined;
    if (!row) {
      throw new NotFoundError("Repository overview", repository);
    }
    return NextResponse.json(row);
  },
);

/**
 * PUT /api/repository-overviews/[repository]
 * Upsert Repository overview (Entry 0). Body fields are optional; omitted keys keep existing values.
 * On first create, missing text fields default to empty string or a short placeholder for summary.
 */
export const PUT = withErrorHandler<{ repository: string }>(
  async (request: NextRequest, context) => {
    const { repository: raw } = await context!.params;
    const repository = normalizeRepository(decodeURIComponent(raw));
    const body = (await request.json()) as Record<string, unknown>;
    const db = getDatabase();

    const existing = db
      .prepare(`SELECT * FROM repository_overviews WHERE repository = ?`)
      .get(repository) as Record<string, unknown> | undefined;

    const merged = mergeOverview(repository, existing, body);
    const created = !existing;

    if (created) {
      db.prepare(
        `
        INSERT INTO repository_overviews (
          repository, git_url, summary, purpose, architecture, key_decisions, technologies, status,
          linear_project_id, linear_issue_id,
          file_structure, tech_stack, frontend, backend, database_info, services, custom_tooling,
          data_flow, patterns, commands, extended_notes, updated_at
        ) VALUES (
          @repository, @git_url, @summary, @purpose, @architecture, @key_decisions, @technologies, @status,
          @linear_project_id, @linear_issue_id,
          @file_structure, @tech_stack, @frontend, @backend, @database_info, @services, @custom_tooling,
          @data_flow, @patterns, @commands, @extended_notes, datetime('now')
        )
      `,
      ).run({
        repository: merged.repository,
        git_url: merged.git_url ?? null,
        summary: String(merged.summary ?? ""),
        purpose: String(merged.purpose ?? ""),
        architecture: String(merged.architecture ?? ""),
        key_decisions: String(merged.key_decisions ?? ""),
        technologies: String(merged.technologies ?? ""),
        status: String(merged.status ?? "active"),
        linear_project_id: merged.linear_project_id ?? null,
        linear_issue_id: merged.linear_issue_id ?? null,
        file_structure: merged.file_structure ?? null,
        tech_stack: merged.tech_stack ?? null,
        frontend: merged.frontend ?? null,
        backend: merged.backend ?? null,
        database_info: merged.database_info ?? null,
        services: merged.services ?? null,
        custom_tooling: merged.custom_tooling ?? null,
        data_flow: merged.data_flow ?? null,
        patterns: merged.patterns ?? null,
        commands: merged.commands ?? null,
        extended_notes: merged.extended_notes ?? null,
      });

      try {
        const { registerObject } = await import("@/lib/object-registry");
        registerObject({
          type: "project_summary",
          sourceTable: "repository_overviews",
          sourceId: repository,
          title: repository,
          summary: String(merged.summary ?? "").slice(0, 500),
        });
      } catch {
        /* optional */
      }
    } else {
      const sets: string[] = [];
      const params: Record<string, unknown> = { repository };
      for (const k of PATCH_KEYS) {
        if (body[k] !== undefined) {
          sets.push(`${k} = @${k}`);
          params[k] = body[k];
        }
      }
      sets.push(`updated_at = datetime('now')`);
      if (sets.length === 1) {
        // only updated_at — still bump
        db.prepare(`UPDATE repository_overviews SET updated_at = datetime('now') WHERE repository = @repository`).run({
          repository,
        });
      } else {
        db.prepare(`UPDATE repository_overviews SET ${sets.join(", ")} WHERE repository = @repository`).run(params);
      }
    }

    const row = db
      .prepare(`SELECT * FROM repository_overviews WHERE repository = ?`)
      .get(repository);

    triggerBackup();

    return NextResponse.json({
      success: true,
      created,
      repository,
      overview: row,
    });
  },
);
