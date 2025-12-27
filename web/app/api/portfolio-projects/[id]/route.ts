import { NextRequest, NextResponse } from "next/server";
import { getDrizzleDb, portfolioProjects } from "@/lib/db/drizzle";
import { eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/portfolio-projects/[id]
 * Get a single portfolio project
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDrizzleDb();

    const project = db
      .select()
      .from(portfolioProjects)
      .where(eq(portfolioProjects.id, id))
      .get();

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...project,
      technologies: JSON.parse(project.technologies || "[]"),
      metrics: JSON.parse(project.metrics || "{}"),
      links: JSON.parse(project.links || "{}"),
      tags: JSON.parse(project.tags || "[]"),
    });
  } catch (error: any) {
    console.error("Failed to fetch portfolio project:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch portfolio project" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/portfolio-projects/[id]
 * Update a portfolio project
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDrizzleDb();
    const body = await request.json();

    // Check if project exists
    const existing = db
      .select()
      .from(portfolioProjects)
      .where(eq(portfolioProjects.id, id))
      .get();

    if (!existing) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Build update object
    const updateData: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.title !== undefined) updateData.title = body.title;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.company !== undefined) updateData.company = body.company;
    if (body.dateCompleted !== undefined) updateData.dateCompleted = body.dateCompleted;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.featured !== undefined) updateData.featured = !!body.featured;
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
  } catch (error: any) {
    console.error("Failed to update portfolio project:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update portfolio project" },
      { status: 500 }
    );
  }
}

// NOTE: DELETE is intentionally not exposed via API
// Deletion should only be done manually via UI or direct SQL
// Agents can only add/edit, not delete repository content
