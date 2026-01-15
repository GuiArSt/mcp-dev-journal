/**
 * Linear Sync - Cache Linear data locally
 * 
 * Fetches Projects and Issues from Linear API and stores them in the database.
 * Preserves historical data even if items are deleted in Linear.
 */

import { getDrizzleDb, linearProjects, linearIssues } from "@/lib/db/drizzle";
import { eq } from "drizzle-orm";
import { listProjects, listIssues } from "./client";

export interface SyncResult {
  projects: {
    created: number;
    updated: number;
    deleted: number;
    total: number;
  };
  issues: {
    created: number;
    updated: number;
    deleted: number;
    total: number;
  };
}

/**
 * Sync Linear Projects to local database
 */
export async function syncLinearProjects(includeCompleted: boolean = false): Promise<SyncResult["projects"]> {
  const db = getDrizzleDb();
  
  // Fetch from Linear API
  const result = await listProjects({ showAll: true }); // Get all projects, we'll filter locally
  const apiProjects = result.projects || [];
  
  // Filter by completion if needed
  const filteredProjects = includeCompleted
    ? apiProjects
    : apiProjects.filter((p: any) => p.state !== "completed" && p.state !== "canceled");
  
  // Get all existing project IDs from DB
  const existingProjects = await db.select({ id: linearProjects.id }).from(linearProjects);
  const existingIds = new Set(existingProjects.map(p => p.id));
  
  // Track API project IDs
  const apiIds = new Set(filteredProjects.map((p: any) => p.id));
  
  let created = 0;
  let updated = 0;
  
  // Upsert projects from API
  for (const project of filteredProjects) {
    const teamIds = project.members?.nodes?.map((m: any) => m.id) || [];
    const memberIds = project.members?.nodes?.map((m: any) => m.id) || [];
    
    const projectData = {
      id: project.id,
      name: project.name,
      description: project.description || null,
      content: project.content || null,
      state: project.state || null,
      progress: project.progress || null,
      targetDate: project.targetDate || null,
      startDate: project.startDate || null,
      url: project.url,
      leadId: project.lead?.id || null,
      leadName: project.lead?.name || null,
      teamIds: JSON.stringify(teamIds),
      memberIds: JSON.stringify(memberIds),
      syncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
      deletedAt: null,
    };
    
    if (existingIds.has(project.id)) {
      // Update existing
      await db
        .update(linearProjects)
        .set({
          ...projectData,
          createdAt: undefined, // Preserve original created_at
        })
        .where(eq(linearProjects.id, project.id));
      updated++;
    } else {
      // Create new
      await db.insert(linearProjects).values({
        ...projectData,
        createdAt: new Date().toISOString(),
      });
      created++;
    }
  }
  
  // Mark deleted projects (exist in DB but not in API)
  let deleted = 0;
  for (const existingId of existingIds) {
    if (!apiIds.has(existingId)) {
      await db
        .update(linearProjects)
        .set({
          isDeleted: true,
          deletedAt: new Date().toISOString(),
          syncedAt: new Date().toISOString(),
        })
        .where(eq(linearProjects.id, existingId));
      deleted++;
    }
  }
  
  const total = await db.select().from(linearProjects).then(rows => rows.length);
  
  return { created, updated, deleted, total };
}

/**
 * Sync Linear Issues to local database
 */
export async function syncLinearIssues(includeCompleted: boolean = false): Promise<SyncResult["issues"]> {
  const db = getDrizzleDb();
  
  // Fetch from Linear API (get more to ensure we capture everything)
  const result = await listIssues({ showAll: true, limit: 250 });
  const apiIssues = result.issues || [];
  
  // Filter by completion if needed
  const filteredIssues = includeCompleted
    ? apiIssues
    : apiIssues.filter((i: any) => {
        const stateName = i.state?.name?.toLowerCase() || "";
        return (
          !stateName.includes("done") &&
          !stateName.includes("completed") &&
          !stateName.includes("canceled")
        );
      });
  
  // Get all existing issue IDs from DB
  const existingIssues = await db.select({ id: linearIssues.id }).from(linearIssues);
  const existingIds = new Set(existingIssues.map(i => i.id));
  
  // Track API issue IDs
  const apiIds = new Set(filteredIssues.map((i: any) => i.id));
  
  let created = 0;
  let updated = 0;
  
  // Upsert issues from API
  for (const issue of filteredIssues) {
    const issueData = {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || null,
      url: issue.url,
      priority: issue.priority ?? null,
      stateId: issue.state?.id || null,
      stateName: issue.state?.name || null,
      assigneeId: issue.assignee?.id || null,
      assigneeName: issue.assignee?.name || null,
      teamId: issue.team?.id || null,
      teamName: issue.team?.name || null,
      teamKey: issue.team?.key || null,
      projectId: issue.project?.id || null,
      projectName: issue.project?.name || null,
      parentId: issue.parent?.id || null,
      syncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
      deletedAt: null,
    };
    
    if (existingIds.has(issue.id)) {
      // Update existing
      await db
        .update(linearIssues)
        .set({
          ...issueData,
          createdAt: undefined, // Preserve original created_at
        })
        .where(eq(linearIssues.id, issue.id));
      updated++;
    } else {
      // Create new
      await db.insert(linearIssues).values({
        ...issueData,
        createdAt: new Date().toISOString(),
      });
      created++;
    }
  }
  
  // Mark deleted issues (exist in DB but not in API)
  let deleted = 0;
  for (const existingId of existingIds) {
    if (!apiIds.has(existingId)) {
      await db
        .update(linearIssues)
        .set({
          isDeleted: true,
          deletedAt: new Date().toISOString(),
          syncedAt: new Date().toISOString(),
        })
        .where(eq(linearIssues.id, existingId));
      deleted++;
    }
  }
  
  const total = await db.select().from(linearIssues).then(rows => rows.length);
  
  return { created, updated, deleted, total };
}

/**
 * Sync both Projects and Issues
 */
export async function syncLinearData(includeCompleted: boolean = false): Promise<SyncResult> {
  const [projectsResult, issuesResult] = await Promise.all([
    syncLinearProjects(includeCompleted),
    syncLinearIssues(includeCompleted),
  ]);
  
  return {
    projects: projectsResult,
    issues: issuesResult,
  };
}
