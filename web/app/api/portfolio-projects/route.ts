import { NextRequest, NextResponse } from "next/server";
import { getDrizzleDb, portfolioProjects } from "@/lib/db/drizzle";
import { eq, desc, asc } from "drizzle-orm";
import { withErrorHandler } from "@/lib/api-handler";
import { requireQuery, requireBody } from "@/lib/validations";
import { portfolioQuerySchema, createPortfolioProjectSchema } from "@/lib/validations/schemas";
import { ConflictError } from "@/lib/errors";
import { getDatabase } from "@/lib/db";
import { normalizePortfolioImageInput, portfolioProjectImageForClient } from "@/lib/media-image-url";

/**
 * Generate AI summary for portfolio project (async, non-blocking)
 */
async function generatePortfolioSummary(projectId: string, project: any): Promise<void> {
  try {
    const technologies =
      typeof project.technologies === "string"
        ? JSON.parse(project.technologies || "[]")
        : project.technologies || [];
    const metrics =
      typeof project.metrics === "string"
        ? JSON.parse(project.metrics || "{}")
        : project.metrics || {};
    const tags =
      typeof project.tags === "string" ? JSON.parse(project.tags || "[]") : project.tags || [];

    const content = `
Project: ${project.title}
Category: ${project.category}
${project.company ? `Company: ${project.company}` : ""}
${project.role ? `Role: ${project.role}` : ""}
Status: ${project.status}
${project.dateCompleted ? `Completed: ${project.dateCompleted}` : ""}
${project.excerpt ? `Summary: ${project.excerpt}` : ""}
${project.description ? `Description: ${project.description}` : ""}
${technologies.length ? `Technologies: ${technologies.join(", ")}` : ""}
${
  Object.keys(metrics).length
    ? `Metrics: ${Object.entries(metrics)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")}`
    : ""
}
${tags.length ? `Tags: ${tags.join(", ")}` : ""}
    `.trim();

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3005"}/api/ai/summarize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "portfolio_project",
          title: project.title,
          content,
          metadata: { category: project.category, status: project.status, technologies },
        }),
      }
    );

    if (response.ok) {
      const { summary } = await response.json();
      const db = getDrizzleDb();
      db.update(portfolioProjects)
        .set({ summary })
        .where(eq(portfolioProjects.id, projectId))
        .run();
    }
  } catch (error) {
    console.error("Failed to generate portfolio summary:", error);
  }
}

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

  const sqlite = getDatabase();
  // Parse JSON fields
  const parsedProjects = projects.map((p) => ({
    ...p,
    image: portfolioProjectImageForClient(p.image, sqlite),
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

  const sqlite = getDatabase();
  const storedImage = body.image ? normalizePortfolioImageInput(body.image, sqlite) : null;

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
      image: storedImage,
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

  // Generate summary asynchronously (don't block response)
  if (project) {
    generatePortfolioSummary(body.id, project).catch(console.error);
  }

  try {
    const { registerObject } = await import("@/lib/object-registry");
    registerObject({ type: 'portfolio_project', sourceTable: 'portfolio_projects', sourceId: body.id, title: body.title });
  } catch { /* registry is non-critical */ }

  const { markContextMetricsStale } = await import("@/lib/mark-context-metrics-stale");
  markContextMetricsStale();

  return NextResponse.json({
    ...project,
    technologies: JSON.parse(project?.technologies || "[]"),
    metrics: JSON.parse(project?.metrics || "{}"),
    links: JSON.parse(project?.links || "{}"),
    tags: JSON.parse(project?.tags || "[]"),
  });
});
