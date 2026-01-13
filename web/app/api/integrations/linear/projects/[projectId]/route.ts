import { NextRequest, NextResponse } from "next/server";
import { updateProject } from "@/lib/linear/client";

// PATCH - Update project (linear_update_project)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const { name, description, content, leadId, targetDate, startDate } = body;

    const project = await updateProject(projectId, {
      name,
      description,
      content,
      leadId,
      targetDate,
      startDate,
    });

    return NextResponse.json(project);
  } catch (error: any) {
    console.error("Linear update project error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update project" },
      { status: 500 }
    );
  }
}
