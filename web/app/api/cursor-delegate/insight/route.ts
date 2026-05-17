import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { runCursorRepositoryInsight } from "@/lib/cursor-agent-delegate";
import {
  findCursorDelegateProject,
  formatProjectListHint,
  loadCursorDelegateProjects,
} from "@/lib/cursor-delegate-config";

/** List registered project ids (for debugging / UI). */
export const GET = withErrorHandler(async () => {
  const projects = loadCursorDelegateProjects();
  return NextResponse.json({
    projects: projects.map((p) => ({ id: p.id, root: p.root })),
    hint: formatProjectListHint(projects),
  });
});

const bodySchema = z.object({
  project_id: z.string().min(1),
  question: z.string().min(10).max(24_000),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors ? JSON.stringify(parsed.error.flatten()) : "Invalid body" },
      { status: 400 }
    );
  }

  const projects = loadCursorDelegateProjects();
  const match = findCursorDelegateProject(projects, parsed.data.project_id);
  if (!match) {
    return NextResponse.json(
      {
        error: `Unknown project_id "${parsed.data.project_id}". ${formatProjectListHint(projects)}`,
      },
      { status: 400 }
    );
  }

  try {
    const output = await runCursorRepositoryInsight(match.root, parsed.data.question);
    return NextResponse.json({ output, project_id: match.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cursor-delegate/insight]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
});
