import { z } from "zod";

/**
 * Tool definitions for Kronus chat
 * Following the Vercel AI SDK pattern: server defines schemas, client executes
 */

export const toolSpecs = {
  // ===== Journal Entry Tools =====
  journal_create_entry: {
    description:
      "Create a new journal entry for a git commit. Use this when the user provides a commit report or asks to document their work.",
    inputSchema: z.object({
      commit_hash: z.string().min(7).describe("Git commit SHA (minimum 7 chars)"),
      repository: z.string().min(1).describe("Repository/project name"),
      branch: z.string().min(1).describe("Git branch name"),
      author: z.string().min(1).describe("Git commit author"),
      date: z.string().describe("Commit date (ISO 8601 format)"),
      raw_agent_report: z.string().min(10).describe("Full context of the work done"),
    }),
  },

  journal_get_entry: {
    description:
      "Retrieve a journal entry by its commit hash. Use this to look up details about a specific commit.",
    inputSchema: z.object({
      commit_hash: z.string().min(7).describe("Git commit SHA to look up"),
    }),
  },

  journal_list_by_repository: {
    description:
      "List all journal entries for a repository. Use this to browse development history.",
    inputSchema: z.object({
      repository: z.string().min(1).describe("Repository name to search"),
      limit: z.number().optional().default(20).describe("Max entries to return"),
      offset: z.number().optional().default(0).describe("Pagination offset"),
    }),
  },

  journal_list_by_branch: {
    description: "List journal entries for a specific branch in a repository.",
    inputSchema: z.object({
      repository: z.string().min(1).describe("Repository name"),
      branch: z.string().min(1).describe("Branch name"),
      limit: z.number().optional().default(20).describe("Max entries to return"),
      offset: z.number().optional().default(0).describe("Pagination offset"),
    }),
  },

  journal_list_repositories: {
    description:
      "List all repositories that have journal entries. Use this to discover available projects.",
    inputSchema: z.object({}),
  },

  journal_list_branches: {
    description: "List all branches in a repository that have journal entries.",
    inputSchema: z.object({
      repository: z.string().min(1).describe("Repository name"),
    }),
  },

  journal_edit_entry: {
    description:
      "Update fields in an existing journal entry. Use this to correct or enhance documentation.",
    inputSchema: z.object({
      commit_hash: z.string().min(7).describe("Commit hash of entry to update"),
      why: z.string().optional().describe("Updated 'why' field"),
      what_changed: z.string().optional().describe("Updated 'what changed' field"),
      decisions: z.string().optional().describe("Updated 'decisions' field"),
      technologies: z.string().optional().describe("Comma-separated list of technologies used. NO markdown, just names: 'React, TypeScript, PostgreSQL'"),
      kronus_wisdom: z.string().nullable().optional().describe("Updated wisdom/reflection"),
    }),
  },

  journal_regenerate_entry: {
    description: "Use AI to regenerate or refine an existing journal entry with new context.",
    inputSchema: z.object({
      commit_hash: z.string().min(7).describe("Commit hash of entry to regenerate"),
      new_context: z.string().optional().describe("New context or instructions for regeneration"),
      use_existing_as_context: z
        .boolean()
        .optional()
        .default(false)
        .describe("Consider existing entry when regenerating"),
    }),
  },

  // ===== Project Summary Tools =====
  journal_get_project_summary: {
    description:
      "Get the high-level project summary for a repository. Contains architecture, purpose, and key decisions.",
    inputSchema: z.object({
      repository: z.string().min(1).describe("Repository name"),
    }),
  },

  journal_upsert_project_summary: {
    description: "Create or update the project summary for a repository.",
    inputSchema: z.object({
      repository: z.string().min(1).describe("Repository name"),
      git_url: z.string().url().describe("Git repository URL"),
      summary: z.string().min(10).describe("High-level project summary"),
      purpose: z.string().min(10).describe("Why this project exists"),
      architecture: z.string().min(10).describe("Overall architecture"),
      key_decisions: z.string().min(10).describe("Major decisions"),
      technologies: z.string().min(3).describe("Comma-separated list of technologies. NO markdown formatting, NO labels like 'Frontend:' or 'Backend:'. Just technology names separated by commas. Example: 'Next.js, React, TypeScript, PostgreSQL, Tailwind CSS'"),
      status: z.string().min(3).describe("Current project status - a short phrase like 'Production-ready', 'In development', 'Beta', etc."),
    }),
  },

  journal_list_project_summaries: {
    description: "List all project summaries across repositories.",
    inputSchema: z.object({
      limit: z.number().optional().default(30).describe("Max summaries to return"),
      offset: z.number().optional().default(0).describe("Pagination offset"),
    }),
  },

  // ===== Attachment Tools =====
  journal_list_attachments: {
    description: "List attachments for a journal entry by commit hash.",
    inputSchema: z.object({
      commit_hash: z.string().min(7).describe("Commit hash"),
    }),
  },

  journal_get_attachment: {
    description: "Get details about a specific attachment by ID.",
    inputSchema: z.object({
      attachment_id: z.number().positive().describe("Attachment ID"),
    }),
  },

  // ===== Database Tools =====
  journal_backup: {
    description: "Manually trigger a database backup to SQL file.",
    inputSchema: z.object({}),
  },

  // ===== Linear Integration Tools =====
  linear_get_viewer: {
    description: "Get your Linear user info including teams and projects.",
    inputSchema: z.object({}),
  },

  linear_list_issues: {
    description: "List issues in Linear with optional filters.",
    inputSchema: z.object({
      assigneeId: z.string().optional().describe("Filter by assignee user ID"),
      teamId: z.string().optional().describe("Filter by team ID"),
      projectId: z.string().optional().describe("Filter by project ID"),
      query: z.string().optional().describe("Search in title/description"),
      limit: z.number().optional().default(50).describe("Max results"),
      showAll: z.boolean().optional().default(false).describe("Show all issues, not just yours"),
    }),
  },

  linear_create_issue: {
    description: "Create a new issue in Linear.",
    inputSchema: z.object({
      title: z.string().min(1).describe("Issue title"),
      description: z.string().optional().describe("Issue description (markdown)"),
      teamId: z.string().describe("Team ID (required)"),
      projectId: z.string().optional().describe("Project ID"),
      priority: z
        .number()
        .min(0)
        .max(4)
        .optional()
        .describe("Priority: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low"),
      assigneeId: z.string().optional().describe("Assignee user ID"),
    }),
  },

  linear_update_issue: {
    description: "Update an existing Linear issue.",
    inputSchema: z.object({
      issueId: z.string().describe("Issue ID to update"),
      title: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description"),
      priority: z.number().min(0).max(4).optional().describe("New priority"),
      stateId: z.string().optional().describe("New state ID"),
      assigneeId: z.string().optional().describe("New assignee ID"),
    }),
  },

  linear_list_projects: {
    description: "List all projects in Linear workspace.",
    inputSchema: z.object({
      teamId: z.string().optional().describe("Filter by team ID"),
    }),
  },

  linear_update_project: {
    description: "Update an existing Linear project.",
    inputSchema: z.object({
      projectId: z.string().describe("Project ID to update"),
      name: z.string().optional().describe("New name"),
      description: z.string().optional().describe("New description"),
      content: z.string().optional().describe("New content (rich text)"),
    }),
  },
  // ===== Document Tools =====
  document_list: {
    description: "List documents (writings, prompts, notes) with optional filters.",
    inputSchema: z.object({
      type: z.enum(["writing", "prompt", "note"]).optional().describe("Filter by document type"),
      year: z.string().optional().describe("Filter by year"),
      search: z.string().optional().describe("Search in title or content"),
      limit: z.number().optional().default(50).describe("Max documents to return"),
    }),
  },

  document_get: {
    description: "Get a document by its slug (URL-friendly identifier).",
    inputSchema: z.object({
      slug: z.string().min(1).describe("Document slug"),
    }),
  },

  document_create: {
    description: "Create a new document (writing, prompt, or note).",
    inputSchema: z.object({
      title: z.string().min(1).describe("Document title"),
      content: z.string().min(1).describe("Document content (markdown/XML)"),
      type: z.enum(["writing", "prompt", "note"]).describe("Document type"),
      language: z.string().optional().default("en").describe("Language code"),
      metadata: z.record(z.string(), z.any()).optional().describe("Additional metadata (year, series, etc.)"),
    }),
  },

  document_update: {
    description: "Update an existing document.",
    inputSchema: z.object({
      slug: z.string().min(1).describe("Document slug"),
      title: z.string().optional().describe("New title"),
      content: z.string().optional().describe("New content"),
      metadata: z.record(z.string(), z.any()).optional().describe("Updated metadata"),
    }),
  },

  // NOTE: document_delete removed - destructive actions are UI-only, not exposed to AI agents

  // ===== CV Tools - Generate + Edit Pattern =====
  skill_list: {
    description: "List all skills.",
    inputSchema: z.object({}),
  },

  skill_get: {
    description: "Get a skill by its ID.",
    inputSchema: z.object({
      id: z.string().min(1).describe("Skill ID"),
    }),
  },

  skill_generate: {
    description:
      "Use AI to generate a structured skill entry from a raw description. This creates a complete skill with magnitude, category, and tags.",
    inputSchema: z.object({
      name: z.string().min(1).describe("Skill name"),
      description: z.string().min(10).describe("Raw description of the skill and experience level"),
      category: z.string().optional().describe("Skill category (e.g., 'AI & Development')"),
    }),
  },

  skill_update: {
    description: "Update fields in an existing skill directly.",
    inputSchema: z.object({
      id: z.string().min(1).describe("Skill ID"),
      name: z.string().optional().describe("Updated name"),
      magnitude: z.number().min(1).max(4).optional().describe("Updated magnitude (1-4)"),
      description: z.string().optional().describe("Updated description"),
      category: z.string().optional().describe("Updated category"),
      tags: z.array(z.string()).optional().describe("Updated tags"),
    }),
  },

  experience_list: {
    description: "List all work experience entries.",
    inputSchema: z.object({}),
  },

  experience_get: {
    description: "Get a work experience entry by its ID.",
    inputSchema: z.object({
      id: z.string().min(1).describe("Experience ID"),
    }),
  },

  experience_generate: {
    description:
      "Use AI to generate a structured work experience entry from a raw description. This creates achievements, dates, and other structured data.",
    inputSchema: z.object({
      company: z.string().min(1).describe("Company name"),
      title: z.string().min(1).describe("Job title"),
      description: z.string().min(10).describe("Raw description of the role and achievements"),
    }),
  },

  experience_update: {
    description: "Update fields in an existing work experience entry directly.",
    inputSchema: z.object({
      id: z.string().min(1).describe("Experience ID"),
      title: z.string().optional().describe("Updated title"),
      company: z.string().optional().describe("Updated company"),
      achievements: z.array(z.any()).optional().describe("Updated achievements array"),
      dateStart: z.string().optional().describe("Updated start date (YYYY-MM)"),
      dateEnd: z.string().nullable().optional().describe("Updated end date (YYYY-MM or null)"),
    }),
  },

  education_list: {
    description: "List all education entries.",
    inputSchema: z.object({}),
  },

  education_get: {
    description: "Get an education entry by its ID.",
    inputSchema: z.object({
      id: z.string().min(1).describe("Education ID"),
    }),
  },

  education_generate: {
    description:
      "Use AI to generate a structured education entry from a raw description. This creates focus areas, achievements, and other structured data.",
    inputSchema: z.object({
      institution: z.string().min(1).describe("Institution name"),
      degree: z.string().min(1).describe("Degree type"),
      description: z.string().min(10).describe("Raw description of the education and achievements"),
    }),
  },

  education_update: {
    description: "Update fields in an existing education entry directly.",
    inputSchema: z.object({
      id: z.string().min(1).describe("Education ID"),
      degree: z.string().optional().describe("Updated degree"),
      field: z.string().optional().describe("Updated field of study"),
      focusAreas: z.array(z.string()).optional().describe("Updated focus areas"),
      achievements: z.array(z.string()).optional().describe("Updated achievements"),
    }),
  },
  // ===== Replicate Image Generation =====
      replicate_generate_image: {
    description:
      "Generate an image using image generation models. Supports FLUX.2 Pro (default) and other Replicate/Google models (FLUX, Stable Diffusion, etc.). Use this when the user wants to create images from text prompts.",
    inputSchema: z.object({
      prompt: z.string().min(1).describe("Text prompt describing the image to generate"),
      model: z
        .string()
        .optional()
        .default("black-forest-labs/flux-2-pro")
        .describe(
          "Model identifier. " +
          "FLUX.2 Pro (default): 'black-forest-labs/flux-2-pro'. Google Imagen 4: 'imagen-4.0-generate-001', 'imagen-4.0-fast-generate-001', 'imagen-4.0-ultra-generate-001'. " +
          "FLUX.2 (best quality): 'black-forest-labs/flux-2-pro', 'black-forest-labs/flux-2-flex', 'black-forest-labs/flux-2-dev'. " +
          "FLUX.1.1: 'black-forest-labs/flux-1.1-pro-ultra', 'black-forest-labs/flux-1.1-pro'. " +
          "FLUX.1: 'black-forest-labs/flux-pro', 'black-forest-labs/flux-dev', 'black-forest-labs/flux-schnell' (fastest). " +
          "Stable Diffusion 3.5: 'stability-ai/stable-diffusion-3.5-large', 'stability-ai/stable-diffusion-3.5-large-turbo', 'stability-ai/stable-diffusion-3.5-medium'. " +
          "Stable Diffusion XL: 'stability-ai/sdxl', 'stability-ai/sdxl-base', 'stability-ai/stable-diffusion-xl-base-1.0'. " +
          "Other: 'runwayml/stable-diffusion-v1-5', 'ai-forever/kandinsky-2.2', 'lucataco/sdxl-lightning'."
        ),
      width: z.number().optional().default(1024).describe("Image width in pixels"),
      height: z.number().optional().default(1024).describe("Image height in pixels"),
      num_outputs: z.number().optional().default(1).describe("Number of images to generate"),
      guidance_scale: z.number().optional().describe("Guidance scale (Replicate models only, usually 3.5-7.5 for FLUX, 1-20 for SDXL)"),
      num_inference_steps: z.number().optional().describe("Number of inference steps (Replicate models only, more steps = higher quality but slower)"),
    }),
  },

} as const;

// Server-side definitions for streamText
export const serverToolDefinitions = Object.fromEntries(
  Object.entries(toolSpecs).map(([key, spec]) => [
    key,
    {
      description: spec.description,
      parameters: spec.inputSchema,
    },
  ])
);

export type ToolName = keyof typeof toolSpecs;
