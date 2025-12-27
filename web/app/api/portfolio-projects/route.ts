import { NextRequest, NextResponse } from "next/server";
import { getDrizzleDb, portfolioProjects } from "@/lib/db/drizzle";
import { eq, desc, asc } from "drizzle-orm";

/**
 * GET /api/portfolio-projects
 * List all portfolio projects
 */
export async function GET(request: NextRequest) {
  try {
    const db = getDrizzleDb();
    const { searchParams } = new URL(request.url);

    const category = searchParams.get("category");
    const status = searchParams.get("status") as "shipped" | "wip" | "archived" | null;
    const featured = searchParams.get("featured");

    // Build query
    let query = db.select().from(portfolioProjects);

    // Apply filters
    if (category) {
      query = query.where(eq(portfolioProjects.category, category)) as typeof query;
    }
    if (status && ["shipped", "wip", "archived"].includes(status)) {
      query = query.where(eq(portfolioProjects.status, status)) as typeof query;
    }
    if (featured === "true") {
      query = query.where(eq(portfolioProjects.featured, true)) as typeof query;
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
  } catch (error: any) {
    console.error("Failed to fetch portfolio projects:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch portfolio projects" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/portfolio-projects
 * Create a new portfolio project
 */
export async function POST(request: NextRequest) {
  try {
    const db = getDrizzleDb();
    const body = await request.json();

    const {
      id,
      title,
      category,
      company,
      dateCompleted,
      status = "shipped",
      featured = false,
      image,
      excerpt,
      description,
      role,
      technologies = [],
      metrics = {},
      links = {},
      tags = [],
      sortOrder = 0,
    } = body;

    if (!id || !title || !category) {
      return NextResponse.json(
        { error: "id, title, and category are required" },
        { status: 400 }
      );
    }

    // Check if project already exists
    const existing = db
      .select()
      .from(portfolioProjects)
      .where(eq(portfolioProjects.id, id))
      .get();

    if (existing) {
      return NextResponse.json(
        { error: "Project with this ID already exists" },
        { status: 409 }
      );
    }

    // Insert new project
    db.insert(portfolioProjects)
      .values({
        id,
        title,
        category,
        company: company || null,
        dateCompleted: dateCompleted || null,
        status,
        featured: !!featured,
        image: image || null,
        excerpt: excerpt || null,
        description: description || null,
        role: role || null,
        technologies: JSON.stringify(technologies),
        metrics: JSON.stringify(metrics),
        links: JSON.stringify(links),
        tags: JSON.stringify(tags),
        sortOrder,
      })
      .run();

    // Fetch the created project
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
    console.error("Failed to create portfolio project:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create portfolio project" },
      { status: 500 }
    );
  }
}
