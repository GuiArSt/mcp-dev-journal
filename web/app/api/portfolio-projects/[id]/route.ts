import { NextRequest, NextResponse } from "next/server";
import { getDrizzleDb, portfolioProjects } from "@/lib/db/drizzle";
import { eq } from "drizzle-orm";
import { withErrorHandler } from "@/lib/api-handler";
import { requireParams, requireBody } from "@/lib/validations";
import { stringIdParamSchema, updatePortfolioProjectSchema } from "@/lib/validations/schemas";
import { NotFoundError } from "@/lib/errors";

/**
 * GET /api/portfolio-projects/[id]
 *
 * Get a single portfolio project.
 */
export const GET = withErrorHandler(async (
  _request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(stringIdParamSchema, resolvedParams);
  const db = getDrizzleDb();

  const project = db
    .select()
    .from(portfolioProjects)
    .where(eq(portfolioProjects.id, id))
    .get();

  if (!project) {
    throw new NotFoundError("Portfolio project", id);
  }

  return NextResponse.json({
    ...project,
    technologies: JSON.parse(project.technologies || "[]"),
    metrics: JSON.parse(project.metrics || "{}"),
    links: JSON.parse(project.links || "{}"),
    tags: JSON.parse(project.tags || "[]"),
  });
});

/**
 * PUT /api/portfolio-projects/[id]
 *
 * Update a portfolio project.
 */
export const PUT = withErrorHandler(async (
  request: NextRequest,
  context?: { params: Promise<{ id: string }> }
) => {
  const resolvedParams = await context?.params;
  const { id } = requireParams(stringIdParamSchema, resolvedParams);
  const db = getDrizzleDb();
  const body = await requireBody(updatePortfolioProjectSchema, request);

  // Check if project exists
  const existing = db
    .select()
    .from(portfolioProjects)
    .where(eq(portfolioProjects.id, id))
    .get();

  if (!existing) {
    throw new NotFoundError("Portfolio project", id);
  }

  // Build update object
  const updateData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.title !== undefined) updateData.title = body.title;
  if (body.category !== undefined) updateData.category = body.category;
  if (body.company !== undefined) updateData.company = body.company;
  if (body.dateCompleted !== undefined) updateData.dateCompleted = body.dateCompleted;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.featured !== undefined) updateData.featured = body.featured;
  if (body.image !== undefined) updateData.image = body.image;
  if (body.excerpt !== undefined) updateData.excerpt = body.excerpt;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.role !== undefined) updateData.role = body.role;
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;

  // JSON fields
  if (body.technologies !== undefined) {
    updateData.technologies = JSON.stringify(body.technologies);
  }
  if (body.metrics !== undefined) {
    updateData.metrics = JSON.stringify(body.metrics);
  }
  if (body.links !== undefined) {
    updateData.links = JSON.stringify(body.links);
  }
  if (body.tags !== undefined) {
    updateData.tags = JSON.stringify(body.tags);
  }

  // Update project
  db.update(portfolioProjects)
    .set(updateData)
    .where(eq(portfolioProjects.id, id))
    .run();

  // Fetch updated project
  const project = db
    .select()
    .from(portfolioProjects)
    .where(eq(portfolioProjects.id, id))
    .get();

  return NextResponse.json({
    ...project,
    technologies: JSON.parse(project?.technologies || "[]"),
    metrics: JSON.parse(project?.metrics || "{}"),
    links: JSON.parse(project?.links || "{}"),
    tags: JSON.parse(project?.tags || "[]"),
  });
});

// NOTE: DELETE is intentionally not exposed via API
// Deletion should only be done manually via UI or direct SQL
// Agents can only add/edit, not delete repository content
