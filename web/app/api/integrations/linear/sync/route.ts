import { NextRequest, NextResponse } from "next/server";
import { listIssues, listProjects, getViewer } from "@/lib/linear/client";

/**
 * Linear Sync API
 *
 * Since we now use live Linear API calls instead of caching,
 * this route just validates the connection and returns current stats.
 *
 * GET - Get sync status and live data stats
 * POST - Validate connection and get fresh data
 */

// GET - Get sync status
export async function GET() {
  try {
    // Fetch live data from Linear API
    const [projectsResult, issuesResult] = await Promise.all([
      listProjects({ showAll: false }),
      listIssues({ showAll: false, limit: 100 }),
    ]);

    return NextResponse.json({
      status: "live", // We use live API now, no caching
      lastSync: new Date().toISOString(),
      lastError: null,
      stats: {
        projects: projectsResult.projects?.length || 0,
        issues: issuesResult.issues?.length || 0,
      },
    });
  } catch (error: any) {
    console.error("Linear sync status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get Linear status" },
      { status: 500 }
    );
  }
}

// POST - Validate connection and refresh (no caching, just validates)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { includeCompleted = false } = body;

    // Get viewer info to validate connection
    const viewer = await getViewer();
    console.log(`[Linear Sync] Connection validated for user: ${viewer.name}`);

    // Fetch fresh data from Linear (validates API is working)
    const [projectsResult, issuesResult] = await Promise.all([
      listProjects({ showAll: false }),
      listIssues({ showAll: false, limit: 100 }),
    ]);

    const projects = projectsResult.projects || [];
    const issues = issuesResult.issues || [];

    // Filter by completion status if needed
    const filteredProjects = includeCompleted
      ? projects
      : projects.filter(
          (p: any) => p.state !== "completed" && p.state !== "canceled"
        );

    const filteredIssues = includeCompleted
      ? issues
      : issues.filter((i: any) => {
          const stateName = i.state?.name?.toLowerCase() || "";
          return (
            !stateName.includes("done") &&
            !stateName.includes("completed") &&
            !stateName.includes("canceled")
          );
        });

    return NextResponse.json({
      success: true,
      message: `Found ${filteredProjects.length} active projects and ${filteredIssues.length} active issues`,
      stats: {
        projects: filteredProjects.length,
        issues: filteredIssues.length,
      },
    });
  } catch (error: any) {
    console.error("Linear sync error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to connect to Linear" },
      { status: 500 }
    );
  }
}
