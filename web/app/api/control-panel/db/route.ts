import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/control-panel/db
 *   ?slug=…          filter by prompt slug (substring match)
 *   ?label=…         filter by label (production / staging / draft)
 *   ?limit=…         default 100
 *
 * Returns raw rows of ai_prompt_versions joined with active-version flags,
 * for the prompt DB browser inside the control panel.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug")?.trim() ?? "";
  const label = searchParams.get("label")?.trim() ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 500);

  try {
    const db = getDatabase();
    const filters: string[] = [];
    const params: unknown[] = [];
    if (slug) { filters.push("v.prompt_slug LIKE ?"); params.push(`%${slug}%`); }
    if (label) { filters.push("v.label = ?"); params.push(label); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const rows = db.prepare(`
      SELECT
        v.id, v.prompt_slug, v.version, v.label, v.created_at, v.created_by,
        substr(v.content, 1, 200) as content_preview,
        length(v.content) as content_length,
        CASE WHEN a.version = v.version THEN 1 ELSE 0 END as is_active
      FROM ai_prompt_versions v
      LEFT JOIN ai_prompt_active a ON a.prompt_slug = v.prompt_slug
      ${where}
      ORDER BY v.created_at DESC
      LIMIT ?
    `).all(...params, limit) as Array<{
      id: number;
      prompt_slug: string;
      version: number;
      label: string;
      created_at: string;
      created_by: string;
      content_preview: string;
      content_length: number;
      is_active: number;
    }>;

    const totalCount = db.prepare(`SELECT COUNT(*) as n FROM ai_prompt_versions`).get() as { n: number };

    return NextResponse.json({
      rows: rows.map((r) => ({
        id: r.id,
        slug: r.prompt_slug,
        version: r.version,
        label: r.label,
        createdAt: r.created_at,
        createdBy: r.created_by,
        contentPreview: r.content_preview,
        contentLength: r.content_length,
        isActive: !!r.is_active,
      })),
      total: totalCount.n,
      returned: rows.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
