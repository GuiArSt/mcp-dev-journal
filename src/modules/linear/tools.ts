import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LinearClient } from './client.js';
import { toMcpError } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';

/**
 * Register Linear tools with the MCP server
 *
 * IMPORTANT: These tools hit the LIVE Linear API and are for MANAGEMENT operations.
 * - Use these to CREATE, UPDATE, and MANAGE issues/projects in real-time
 * - For READ-ONLY access to historical data, use the linear:// resources instead
 * - The linear:// resources read from the local cache (preserves deleted items)
 */
export function registerLinearTools(server: McpServer, client: LinearClient, defaultUserId?: string) {
  logger.info('Registering Linear tools (live API - management operations)...');

  // Tool 1: Get Viewer (Current User Info)
  server.registerTool(
    'linear_get_viewer',
    {
      title: 'Get Current User Info',
      description: '[LIVE API] Get your user info including ID, email, all teams and projects you have access to. Use this to get team IDs and project IDs for creating/updating issues.',
      inputSchema: {},
    },
    async () => {
      try {
        const viewer = await client.getViewer();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(viewer, null, 2),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 2: List Issues with Filters
  server.registerTool(
    'linear_list_issues',
    {
      title: 'List Linear Issues',
      description: `[LIVE API] Fetch current issues from Linear API. For reading historical data (including deleted), use linear://issues resource instead. By default shows issues assigned to you${defaultUserId ? ` (user ID: ${defaultUserId})` : ' (set LINEAR_USER_ID env var to configure)'}.`,
      inputSchema: {
        assigneeId: z.string().optional().describe(`Filter by assignee user ID${defaultUserId ? ` (defaults to your user ID: ${defaultUserId})` : ' (set LINEAR_USER_ID env var for default)'}`),
        stateId: z.string().optional().describe('Filter by workflow state ID'),
        teamId: z.string().optional().describe('Filter by team ID'),
        projectId: z.string().optional().describe('Filter by project ID'),
        query: z.string().optional().describe('Search in title, description, or identifier'),
        limit: z
          .number()
          .optional()
          .default(50)
          .describe('Maximum number of results (default 50)'),
        showAll: z.boolean().optional().default(false).describe('Set to true to show all issues, not just yours'),
      },
    },
    async ({ assigneeId, stateId, teamId, projectId, query, limit, showAll }) => {
      try {
        // Default to configured user ID if not specified and showAll is false
        // LINEAR_USER_ID env var can override, otherwise falls back to null (shows all)
        const finalAssigneeId = showAll ? assigneeId : (assigneeId || defaultUserId || undefined);

        const issues = await client.listIssues({
          assigneeId: finalAssigneeId,
          stateId,
          teamId,
          projectId,
          query,
          limit,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(issues, null, 2),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 4: Create Issue
  server.registerTool(
    'linear_create_issue',
    {
      title: 'Create Linear Issue',
      description: '[LIVE API - WRITE] Create a new issue in Linear. This modifies Linear directly.',
      inputSchema: {
        title: z.string().min(1).describe('Issue title'),
        description: z.string().optional().describe('Issue description (markdown supported)'),
        teamId: z.string().describe('Team ID where issue will be created'),
        projectId: z.string().optional().describe('Project ID to associate with'),
        priority: z
          .number()
          .min(0)
          .max(4)
          .optional()
          .describe('Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low'),
        assigneeId: z.string().optional().describe('User ID to assign the issue to'),
        parentId: z.string().optional().describe('Parent issue ID for sub-issues'),
      },
    },
    async ({ title, description, teamId, projectId, priority, assigneeId, parentId }) => {
      try {
        const issue = await client.createIssue({
          title,
          description,
          teamId,
          projectId,
          priority,
          assigneeId,
          parentId,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(issue, null, 2),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 5: Update Issue
  server.registerTool(
    'linear_update_issue',
    {
      title: 'Update Linear Issue',
      description: '[LIVE API - WRITE] Update an existing Linear issue. This modifies Linear directly.',
      inputSchema: {
        issueId: z.string().describe('Issue ID to update'),
        title: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description (markdown supported)'),
        priority: z
          .number()
          .min(0)
          .max(4)
          .optional()
          .describe('Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low'),
        stateId: z.string().optional().describe('Workflow state ID'),
        assigneeId: z.string().optional().describe('User ID to assign to'),
      },
    },
    async ({ issueId, title, description, priority, stateId, assigneeId }) => {
      try {
        const issue = await client.updateIssue({
          issueId,
          title,
          description,
          priority,
          stateId,
          assigneeId,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(issue, null, 2),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 6: List Projects
  server.registerTool(
    'linear_list_projects',
    {
      title: 'List Linear Projects',
      description: '[LIVE API] Fetch current projects from Linear API. For reading historical data (including deleted), use linear://projects resource instead.',
      inputSchema: {
        teamId: z.string().optional().describe('Filter projects by team ID'),
      },
    },
    async ({ teamId }) => {
      try {
        const projects = await client.listProjects(teamId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(projects, null, 2),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 7: Create Project
  server.registerTool(
    'linear_create_project',
    {
      title: 'Create Linear Project',
      description: '[LIVE API - WRITE] Create a new project in Linear. This modifies Linear directly. Projects help organize related issues and track progress toward goals.',
      inputSchema: {
        name: z.string().min(1).describe('Project name'),
        teamIds: z.array(z.string()).min(1).describe('Array of team IDs to associate with the project (at least one required)'),
        description: z.string().optional().describe('Project description (plain text)'),
        content: z.string().optional().describe('Project content (rich text markdown with images and formatting)'),
        leadId: z.string().optional().describe('User ID for the project lead'),
        targetDate: z.string().optional().describe('Target completion date (ISO 8601 format, e.g., "2026-03-01")'),
        startDate: z.string().optional().describe('Project start date (ISO 8601 format, e.g., "2026-01-15")'),
      },
    },
    async ({ name, teamIds, description, content, leadId, targetDate, startDate }) => {
      try {
        const project = await client.createProject({
          name,
          teamIds,
          description,
          content,
          leadId,
          targetDate,
          startDate,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(project, null, 2),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  // Tool 8: Update Project
  server.registerTool(
    'linear_update_project',
    {
      title: 'Update Linear Project',
      description: '[LIVE API - WRITE] Update an existing Linear project. This modifies Linear directly. Note: Rich content with images is stored in the "content" field, not "description".',
      inputSchema: {
        projectId: z.string().describe('Project ID to update'),
        name: z.string().optional().describe('New project name'),
        description: z.string().optional().describe('New project description (plain text)'),
        content: z.string().optional().describe('New project content (rich text markdown with images and formatting)'),
        leadId: z.string().optional().describe('User ID for the project lead'),
        targetDate: z.string().optional().describe('Target completion date (ISO 8601 format, e.g., "2026-03-01")'),
        startDate: z.string().optional().describe('Project start date (ISO 8601 format, e.g., "2026-01-15")'),
      },
    },
    async ({ projectId, name, description, content, leadId, targetDate, startDate }) => {
      try {
        const project = await client.updateProject({
          projectId,
          name,
          description,
          content,
          leadId,
          targetDate,
          startDate,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(project, null, 2),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    }
  );

  logger.success('Linear tools registered (7 tools - live API for management operations)');
}
