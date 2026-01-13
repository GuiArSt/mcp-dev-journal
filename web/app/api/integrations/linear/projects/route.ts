import { NextRequest, NextResponse } from "next/server";
import { listProjects, createProject } from "@/lib/linear/client";

// GET - List projects (linear_list_projects)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId") || undefined;
    const showAll = searchParams.get("showAll") === "true";

    const result = await listProjects({ teamId, showAll });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Linear list projects error:", error);
    return NextResponse.json({ error: error.message || "Failed to list projects" }, { status: 500 });
  }
}

// POST - Create project (linear_create_project)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, teamIds, description, content, leadId, targetDate, startDate } = body;

    if (!name || !teamIds || teamIds.length === 0) {
      return NextResponse.json(
        { error: "name and at least one teamId are required" },
        { status: 400 }
      );
    }

    const result = await createProject({
      name,
      teamIds,
      description,
      content,
      leadId,
      targetDate,
      startDate,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Linear create project error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create project" },
      { status: 500 }
    );
  }
}
