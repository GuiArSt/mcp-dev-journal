import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LinearClient } from './client.js';
import { toMcpError } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';

/**
 * Register Linear tools with the MCP server
 */
export function registerLinearTools(server: McpServer, client: LinearClient, defaultUserId?: string) {
  logger.info('Registering Linear tools...');

  // Tool 1: Get Viewer (Current User Info)
  server.registerTool(
    'linear_get_viewer',
    {
      title: 'Get Current User Info',
      description: 'Get your user info including ID, email, all teams and projects you have access to. Use this to get team IDs and project IDs for filtering issues.',
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
      description: `List issues in Linear with optional filters for assignee, state, team, project, or text search. By default shows issues assigned to you${defaultUserId ? ` (user ID: ${defaultUserId})` : ' (set LINEAR_USER_ID env var to configure)'}.`,
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
      description: 'Create a new issue in Linear',
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
      description: 'Update an existing Linear issue',
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

  logger.success('Linear tools registered (4 tools)');
}
