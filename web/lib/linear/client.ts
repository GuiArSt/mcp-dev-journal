// Linear API Client for web app
// Mirrors the MCP Linear tools functionality

const LINEAR_API_URL = "https://api.linear.app/graphql";

function getApiKey(): string {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error("LINEAR_API_KEY environment variable is required");
  }
  return apiKey;
}

// Get the default user ID from env (same as MCP)
export function getDefaultUserId(): string | undefined {
  return process.env.LINEAR_USER_ID;
}

async function linearQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getApiKey(),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.statusText}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(`Linear GraphQL error: ${json.errors[0]?.message}`);
  }

  return json.data;
}

// Get current user info (linear_get_viewer)
export async function getViewer() {
  const query = `
    query Viewer {
      viewer {
        id
        name
        email
        teams {
          nodes {
            id
            name
          }
        }
      }
    }
  `;

  const data = await linearQuery<{ viewer: any }>(query);
  return {
    id: data.viewer.id,
    name: data.viewer.name,
    email: data.viewer.email,
    teams: data.viewer.teams.nodes,
  };
}

// List issues (linear_list_issues)
// By default, filters to issues assigned to LINEAR_USER_ID unless showAll=true
export async function listIssues(
  options: {
    assigneeId?: string;
    stateId?: string;
    teamId?: string;
    projectId?: string;
    query?: string;
    limit?: number;
    showAll?: boolean;
  } = {}
) {
  const { stateId, teamId, projectId, query: searchQuery, limit = 50, showAll = false } = options;
  
  // Apply default user filter unless showAll is true
  const defaultUserId = getDefaultUserId();
  const finalAssigneeId = showAll 
    ? options.assigneeId 
    : (options.assigneeId || defaultUserId);

  const filters: string[] = [];

  if (finalAssigneeId) filters.push(`assignee: { id: { eq: "${finalAssigneeId}" } }`);
  if (stateId) filters.push(`state: { id: { eq: "${stateId}" } }`);
  if (teamId) filters.push(`team: { id: { eq: "${teamId}" } }`);
  if (projectId) filters.push(`project: { id: { eq: "${projectId}" } }`);
  if (searchQuery)
    filters.push(
      `or: [{ title: { containsIgnoreCase: "${searchQuery}" } }, { description: { containsIgnoreCase: "${searchQuery}" } }]`
    );

  const filterStr = filters.length > 0 ? `filter: { ${filters.join(", ")} }` : "";

  const query = `
    query Issues($first: Int!) {
      issues(first: $first, ${filterStr}) {
        nodes {
          id
          identifier
          title
          description
          priority
          url
          state {
            id
            name
            color
          }
          assignee {
            id
            name
            email
          }
          project {
            id
            name
          }
          team {
            id
            name
          }
        }
      }
    }
  `;

  const data = await linearQuery<{ issues: { nodes: any[] } }>(query, { first: limit });
  return {
    issues: data.issues.nodes,
    total: data.issues.nodes.length,
    filteredByUser: !!finalAssigneeId,
  };
}

// Create issue (linear_create_issue)
export async function createIssue(input: {
  title: string;
  description?: string;
  teamId: string;
  projectId?: string;
  priority?: number;
  assigneeId?: string;
  parentId?: string;
}) {
  const mutation = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }
  `;

  const data = await linearQuery<{ issueCreate: { success: boolean; issue: any } }>(mutation, {
    input,
  });
  return data.issueCreate.issue;
}

// Update issue (linear_update_issue)
export async function updateIssue(
  issueId: string,
  input: {
    title?: string;
    description?: string;
    priority?: number;
    stateId?: string;
    assigneeId?: string;
  }
) {
  const mutation = `
    mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }
  `;

  const data = await linearQuery<{ issueUpdate: { success: boolean; issue: any } }>(mutation, {
    id: issueId,
    input,
  });
  return data.issueUpdate.issue;
}

// List projects (linear_list_projects)
// Filters to projects the user is a member of by default
export async function listProjects(options: { teamId?: string; showAll?: boolean } = {}) {
  const { teamId, showAll = false } = options;
  const defaultUserId = getDefaultUserId();
  
  const filters: string[] = [];
  
  if (teamId) {
    filters.push(`accessibleTeams: { id: { eq: "${teamId}" } }`);
  }
  
  // Filter to projects where user is a member (unless showAll)
  if (!showAll && defaultUserId) {
    filters.push(`members: { id: { eq: "${defaultUserId}" } }`);
  }
  
  const filterStr = filters.length > 0 ? `filter: { ${filters.join(", ")} }` : "";

  const query = `
    query Projects {
      projects(first: 50, ${filterStr}) {
        nodes {
          id
          name
          description
          content
          state
          progress
          targetDate
          url
          lead {
            id
            name
          }
          members {
            nodes {
              id
              name
            }
          }
        }
      }
    }
  `;

  const data = await linearQuery<{ projects: { nodes: any[] } }>(query);
  return {
    projects: data.projects.nodes,
    filteredByUser: !showAll && !!defaultUserId,
  };
}

// Create project (linear_create_project)
export async function createProject(input: {
  name: string;
  teamIds: string[];
  description?: string;
  content?: string;
  leadId?: string;
  targetDate?: string;
  startDate?: string;
}) {
  const mutation = `
    mutation CreateProject($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        success
        project {
          id
          name
          description
          content
          url
        }
      }
    }
  `;

  const data = await linearQuery<{ projectCreate: { success: boolean; project: any } }>(mutation, {
    input,
  });

  if (!data.projectCreate?.success || !data.projectCreate.project) {
    throw new Error("Failed to create project: No project returned");
  }

  return data.projectCreate.project;
}

// Update project (linear_update_project)
export async function updateProject(
  projectId: string,
  input: {
    name?: string;
    description?: string;
    content?: string;
    leadId?: string;
    targetDate?: string;
    startDate?: string;
  }
) {
  const mutation = `
    mutation UpdateProject($id: String!, $input: ProjectUpdateInput!) {
      projectUpdate(id: $id, input: $input) {
        success
        project {
          id
          name
          description
        }
      }
    }
  `;

  const data = await linearQuery<{ projectUpdate: { success: boolean; project: any } }>(mutation, {
    id: projectId,
    input,
  });
  return data.projectUpdate.project;
}
