import { NextRequest, NextResponse } from "next/server";
import { getDrizzleDb, portfolioProjects } from "@/lib/db/drizzle";
import { eq, desc, asc } from "drizzle-orm";
import { withErrorHandler } from "@/lib/api-handler";
import { requireQuery, requireBody } from "@/lib/validations";
import { portfolioQuerySchema, createPortfolioProjectSchema } from "@/lib/validations/schemas";
import { ConflictError } from "@/lib/errors";

/**
 * GET /api/portfolio-projects
 *
 * List all portfolio projects with optional filtering.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const db = getDrizzleDb();
  const { category, status, featured } = requireQuery(portfolioQuerySchema, request);

  // Build query
  let query = db.select().from(portfolioProjects);

  // Apply filters
  if (category) {
    query = query.where(eq(portfolioProjects.category, category)) as typeof query;
  }
  if (status) {
    query = query.where(eq(portfolioProjects.status, status)) as typeof query;
  }
  if (featured !== undefined) {
    query = query.where(eq(portfolioProjects.featured, featured)) as typeof query;
  }

  // Order by featured (desc), sort_order (asc)
  const projects = query
    .orderBy(desc(portfolioProjects.featured), asc(portfolioProjects.sortOrder))
    .all();

  // Parse JSON fields
  const parsedProjects = projects.map((p) => ({
    ...p,
    technologies: JSON.parse(p.technologies || "[]"),
    metrics: JSON.parse(p.metrics || "{}"),
    links: JSON.parse(p.links || "{}"),
    tags: JSON.parse(p.tags || "[]"),
  }));

  return NextResponse.json({
    projects: parsedProjects,
    total: parsedProjects.length,
  });
});

/**
 * POST /api/portfolio-projects
 *
 * Create a new portfolio project.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const db = getDrizzleDb();
  const body = await requireBody(createPortfolioProjectSchema, request);

  // Check if project already exists
  const existing = db
    .select()
    .from(portfolioProjects)
    .where(eq(portfolioProjects.id, body.id))
    .get();

  if (existing) {
    throw new ConflictError("Project with this ID already exists");
  }

  // Insert new project
  db.insert(portfolioProjects)
    .values({
      id: body.id,
      title: body.title,
      category: body.category,
      company: body.company || null,
      dateCompleted: body.dateCompleted || null,
      status: body.status,
      featured: body.featured,
      image: body.image || null,
      excerpt: body.excerpt || null,
      description: body.description || null,
      role: body.role || null,
      technologies: JSON.stringify(body.technologies),
      metrics: JSON.stringify(body.metrics),
      links: JSON.stringify(body.links),
      tags: JSON.stringify(body.tags),
      sortOrder: body.sortOrder,
    })
    .run();

  // Fetch the created project
  const project = db
    .select()
    .from(portfolioProjects)
    .where(eq(portfolioProjects.id, body.id))
    .get();

  return NextResponse.json({
    ...project,
    technologies: JSON.parse(project?.technologies || "[]"),
    metrics: JSON.parse(project?.metrics || "{}"),
    links: JSON.parse(project?.links || "{}"),
    tags: JSON.parse(project?.tags || "[]"),
  });
});
