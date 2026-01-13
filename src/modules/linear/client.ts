import { LinearClient as LinearSDK } from '@linear/sdk';
import { LinearAPIError } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';
import type {
  LinearTeam,
  LinearProject,
  LinearIssue,
  CreateIssueInput,
  UpdateIssueInput,
  UpdateProjectInput,
  CreateProjectInput,
} from './types.js';

/**
 * Linear API client wrapper using official SDK
 */
export class LinearClient {
  private sdk: LinearSDK;

  constructor(apiKey: string) {
    this.sdk = new LinearSDK({ apiKey });
    logger.debug('Linear client initialized');
  }

  async getViewer(): Promise<{
    id: string;
    name: string;
    email: string;
    teams: LinearTeam[];
    projects: LinearProject[];
  }> {
    try {
      logger.debug('Fetching viewer info (current user)');
      const viewer = await this.sdk.viewer;
      const teams = await viewer.teams();

      // Get all projects the user has access to
      const allProjects = await this.sdk.projects();

      // Content is available directly from projects() query
      const projectsWithData = allProjects.nodes.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        content: (project as any).content || undefined,
      }));

      return {
        id: viewer.id,
        name: viewer.name,
        email: viewer.email,
        teams: teams.nodes.map((team) => ({
          id: team.id,
          name: team.name,
          key: team.key,
        })),
        projects: projectsWithData,
      };
    } catch (error) {
      throw new LinearAPIError(
        `Failed to get viewer: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  async listTeams(): Promise<LinearTeam[]> {
    try {
      logger.debug('Fetching Linear teams');
      const teams = await this.sdk.teams();
      return teams.nodes.map((team) => ({
        id: team.id,
        name: team.name,
        key: team.key,
      }));
    } catch (error) {
      throw new LinearAPIError(
        `Failed to list teams: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  async listProjects(teamId?: string): Promise<LinearProject[]> {
    try {
      logger.debug(`Fetching Linear projects${teamId ? ` for team ${teamId}` : ''}`);

      // Fetch all projects (Linear SDK doesn't support team filtering on projects easily)
      const projectsQuery = await this.sdk.projects();

      // Content is available directly from projects() query
      return projectsQuery.nodes.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        content: (project as any).content || undefined,
      }));
    } catch (error) {
      throw new LinearAPIError(
        `Failed to list projects: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  async listIssues(options: {
    assigneeId?: string;
    stateId?: string;
    teamId?: string;
    projectId?: string;
    query?: string;
    limit?: number;
  } = {}): Promise<LinearIssue[]> {
    try {
      const { assigneeId, stateId, teamId, projectId, query, limit = 50 } = options;

      logger.debug(`Listing Linear issues with filters:`, options);

      // Build filter object
      const filter: any = {};

      if (assigneeId) {
        filter.assignee = { id: { eq: assigneeId } };
      }

      if (stateId) {
        filter.state = { id: { eq: stateId } };
      }

      if (teamId) {
        filter.team = { id: { eq: teamId } };
      }

      if (projectId) {
        filter.project = { id: { eq: projectId } };
      }

      if (query) {
        filter.or = [
          { title: { contains: query } },
          { description: { contains: query } },
          { identifier: { contains: query } },
        ];
      }

      const issues = await this.sdk.issues({
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        first: limit
      });

      return await Promise.all(
        issues.nodes.map(async (issue) => {
          const state = await issue.state;
          const assignee = await issue.assignee;
          const team = await issue.team;
          const project = await issue.project;

          return {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            description: issue.description,
            url: issue.url,
            priority: issue.priority,
            state: state ? { id: state.id, name: state.name } : undefined,
            assignee: assignee ? { id: assignee.id, name: assignee.name } : undefined,
            team: team ? { id: team.id, name: team.name, key: team.key } : undefined,
            project: project ? { id: project.id, name: project.name } : undefined,
          };
        })
      );
    } catch (error) {
      throw new LinearAPIError(
        `Failed to list issues: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  async createIssue(input: CreateIssueInput): Promise<LinearIssue> {
    try {
      logger.debug(`Creating Linear issue: ${input.title}`);

      const issuePayload: any = {
        title: input.title,
        teamId: input.teamId,
      };

      if (input.description) issuePayload.description = input.description;
      if (input.projectId) issuePayload.projectId = input.projectId;
      if (input.priority !== undefined) issuePayload.priority = input.priority;
      if (input.assigneeId) issuePayload.assigneeId = input.assigneeId;
      if (input.parentId) issuePayload.parentId = input.parentId;

      const result = await this.sdk.createIssue(issuePayload);
      const issue = await result.issue;

      if (!issue) {
        throw new LinearAPIError('Failed to create issue: No issue returned');
      }

      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        url: issue.url,
        priority: issue.priority,
      };
    } catch (error) {
      throw new LinearAPIError(
        `Failed to create issue: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  async updateIssue(input: UpdateIssueInput): Promise<LinearIssue> {
    try {
      logger.debug(`Updating Linear issue: ${input.issueId}`);

      const updatePayload: any = {};
      if (input.title) updatePayload.title = input.title;
      if (input.description !== undefined) updatePayload.description = input.description;
      if (input.priority !== undefined) updatePayload.priority = input.priority;
      if (input.stateId) updatePayload.stateId = input.stateId;
      if (input.assigneeId) updatePayload.assigneeId = input.assigneeId;

      const result = await this.sdk.updateIssue(input.issueId, updatePayload);
      const issue = await result.issue;

      if (!issue) {
        throw new LinearAPIError('Failed to update issue: No issue returned');
      }

      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        url: issue.url,
        priority: issue.priority,
      };
    } catch (error) {
      throw new LinearAPIError(
        `Failed to update issue: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  async createProject(input: CreateProjectInput): Promise<LinearProject> {
    try {
      logger.debug(`Creating Linear project: ${input.name}`);

      // Use GraphQL mutation for project creation
      const createInput: any = {
        name: input.name,
        teamIds: input.teamIds,
      };

      if (input.description) createInput.description = input.description;
      if (input.content) createInput.content = input.content;
      if (input.leadId) createInput.leadId = input.leadId;
      if (input.targetDate) createInput.targetDate = input.targetDate;
      if (input.startDate) createInput.startDate = input.startDate;

      const result = await this.sdk.client.request<{
        projectCreate: {
          success: boolean;
          project: {
            id: string;
            name: string;
            description: string | null;
            content: string | null;
            url: string;
          };
        };
      }>(
        `
        mutation projectCreate($input: ProjectCreateInput!) {
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
      `,
        {
          input: createInput,
        }
      );

      if (!result.projectCreate?.success || !result.projectCreate.project) {
        throw new LinearAPIError('Failed to create project: No project returned');
      }

      const createdProject = result.projectCreate.project;

      return {
        id: createdProject.id,
        name: createdProject.name,
        description: createdProject.description || undefined,
        content: createdProject.content || undefined,
      };
    } catch (error) {
      throw new LinearAPIError(
        `Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  async updateProject(input: UpdateProjectInput): Promise<LinearProject> {
    try {
      logger.debug(`Updating Linear project: ${input.projectId}`);

      // Use GraphQL mutation directly as the SDK's project.update() has issues
      const updateInput: any = {};
      if (input.name) updateInput.name = input.name;
      if (input.description !== undefined) updateInput.description = input.description;
      if (input.content !== undefined) updateInput.content = input.content;
      if (input.leadId !== undefined) updateInput.leadId = input.leadId;
      if (input.targetDate !== undefined) updateInput.targetDate = input.targetDate;
      if (input.startDate !== undefined) updateInput.startDate = input.startDate;

      const result = await this.sdk.client.request<{
        projectUpdate: {
          success: boolean;
          project: {
            id: string;
            name: string;
            description: string | null;
            content: string | null;
          };
        };
      }>(
        `
        mutation projectUpdate($id: String!, $input: ProjectUpdateInput!) {
          projectUpdate(id: $id, input: $input) {
            success
            project {
              id
              name
              description
              content
            }
          }
        }
      `,
        {
          id: input.projectId,
          input: updateInput,
        }
      );

      if (!result.projectUpdate?.success || !result.projectUpdate.project) {
        throw new LinearAPIError('Failed to update project: No project returned');
      }

      const updatedProject = result.projectUpdate.project;

      return {
        id: updatedProject.id,
        name: updatedProject.name,
        description: updatedProject.description || undefined,
        content: updatedProject.content || undefined,
      };
    } catch (error) {
      throw new LinearAPIError(
        `Failed to update project: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }
}
