import { NextRequest, NextResponse } from "next/server";
import { getDrizzleDb, portfolioProjects } from "@/lib/db/drizzle";
import { eq } from "drizzle-orm";
import { withErrorHandler } from "@/lib/api-handler";
import { requireParams, requireBody } from "@/lib/validations";
import { stringIdParamSchema, updatePortfolioProjectSchema } from "@/lib/validations/schemas";
import { NotFoundError } from "@/lib/errors";
import { getDatabase } from "@/lib/db";
import { normalizePortfolioImageInput, portfolioProjectImageForClient } from "@/lib/media-image-url";
import { serializePortfolioProject } from "@/lib/portfolio-serialize";

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
 * GET /api/portfolio-projects/[id]
 *
 * Get a single portfolio project.
 */
export const GET = withErrorHandler(
  async (_request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const resolvedParams = await context?.params;
    const { id } = requireParams(stringIdParamSchema, resolvedParams);
    const db = getDrizzleDb();

    const project = db.select().from(portfolioProjects).where(eq(portfolioProjects.id, id)).get();

    if (!project) {
      throw new NotFoundError("Portfolio project", id);
    }

    const sqlite = getDatabase();
    return NextResponse.json(
      serializePortfolioProject(project, portfolioProjectImageForClient(project.image, sqlite))
    );
  }
);

/**
 * PUT /api/portfolio-projects/[id]
 *
 * Update a portfolio project.
 */
export const PUT = withErrorHandler(
  async (request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const resolvedParams = await context?.params;
    const { id } = requireParams(stringIdParamSchema, resolvedParams);
    const db = getDrizzleDb();
    const body = await requireBody(updatePortfolioProjectSchema, request);

    // Check if project exists
    const existing = db.select().from(portfolioProjects).where(eq(portfolioProjects.id, id)).get();

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
    if (body.image !== undefined) {
      const sqlite = getDatabase();
      updateData.image =
        body.image == null || body.image === ""
          ? body.image
          : normalizePortfolioImageInput(body.image, sqlite);
    }
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
    if (body.productIds !== undefined) {
      updateData.productIds = JSON.stringify(body.productIds);
    }
    if (body.visible !== undefined) updateData.visible = body.visible;
    if (body.diagramImage !== undefined) updateData.diagramImage = body.diagramImage;
    if (body.imageFallback !== undefined) updateData.imageFallback = body.imageFallback;
    if (body.caseStudyLevel !== undefined) updateData.caseStudyLevel = body.caseStudyLevel;
    if (body.humaneProblem !== undefined) updateData.humaneProblem = body.humaneProblem;
    if (body.humaneSolution !== undefined) updateData.humaneSolution = body.humaneSolution;
    if (body.technicalProblem !== undefined) updateData.technicalProblem = body.technicalProblem;
    if (body.technicalSolution !== undefined) updateData.technicalSolution = body.technicalSolution;
    if (body.technicalSpecs !== undefined) updateData.technicalSpecs = body.technicalSpecs;

    // Update project
    db.update(portfolioProjects).set(updateData).where(eq(portfolioProjects.id, id)).run();

    // Fetch updated project
    const project = db.select().from(portfolioProjects).where(eq(portfolioProjects.id, id)).get();

    // Regenerate summary if content-related fields changed
    const contentChanged =
      body.title !== undefined ||
      body.description !== undefined ||
      body.excerpt !== undefined ||
      body.technologies !== undefined ||
      body.role !== undefined ||
      body.metrics !== undefined;
    if (contentChanged && project) {
      generatePortfolioSummary(id, project).catch(console.error);
    }

    const sqlite = getDatabase();
    return NextResponse.json(
      serializePortfolioProject(
        project!,
        project ? portfolioProjectImageForClient(project.image, sqlite) : null
      )
    );
  }
);

// NOTE: DELETE is intentionally not exposed via API
// Deletion should only be done manually via UI or direct SQL
// Agents can only add/edit, not delete repository content
