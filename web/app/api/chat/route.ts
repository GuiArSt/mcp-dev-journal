import { streamText, convertToModelMessages } from "ai";
import { anthropic, type AnthropicProviderOptions } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google, type GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import { z } from "zod";
import { getKronusSystemPrompt, SoulConfig, DEFAULT_SOUL_CONFIG } from "@/lib/ai/kronus";

/**
 * Tool configuration - controls which tool categories are enabled
 */
export interface ToolsConfig {
  // Core tools (always conceptually available, but can be toggled)
  journal: boolean;      // Journal entries, project summaries
  repository: boolean;   // Documents, skills, experience, education
  linear: boolean;       // Linear issue tracking
  media: boolean;        // Media library, attachments

  // Heavy/optional tools
  imageGeneration: boolean;  // FLUX, Gemini image generation
  webSearch: boolean;        // Perplexity web search/research
}

export const DEFAULT_TOOLS_CONFIG: ToolsConfig = {
  journal: true,
  repository: true,
  linear: true,
  media: true,
  imageGeneration: false,  // Off by default - heavy
  webSearch: false,        // Off by default - requires API key
};

/**
 * Available model selections - each has a provider and model ID
 * Models with reasoning support will have thinking enabled automatically
 */
export type ModelSelection =
  | "gemini-3-flash"      // Google - fast, has thinking
  | "gemini-3-pro"        // Google - most capable, deep reasoning
  | "claude-opus-4.5"     // Anthropic - powerful, has extended thinking
  | "claude-haiku-4.5"    // Anthropic - fast, no thinking
  | "gpt-5.2";            // OpenAI - latest, has reasoning

/**
 * Model configuration - maps selection to provider and model ID
 */
const MODEL_CONFIG: Record<ModelSelection, {
  provider: "google" | "anthropic" | "openai";
  modelId: string;
  hasThinking: boolean;
}> = {
  "gemini-3-flash": {
    provider: "google",
    modelId: "gemini-3-flash-preview",
    hasThinking: true,
  },
  "gemini-3-pro": {
    provider: "google",
    modelId: "gemini-3-pro-preview",
    hasThinking: true,
  },
  "claude-opus-4.5": {
    provider: "anthropic",
    modelId: "claude-opus-4-5-20251101",
    hasThinking: true,
  },
  "claude-haiku-4.5": {
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    hasThinking: false, // Haiku is optimized for speed, no extended thinking
  },
  "gpt-5.2": {
    provider: "openai",
    modelId: "gpt-5.2",
    hasThinking: true,
  },
};

/**
 * Get the AI model based on selected model
 *
 * Models:
 * - gemini-3-flash: Gemini 3 Flash (1M context, fast with thinking)
 * - claude-opus-4.5: Claude Opus 4.5 (200K context, most capable)
 * - claude-haiku-4.5: Claude Haiku 4.5 (200K context, fast)
 * - gpt-5.2: GPT-5.2 (400K context, reasoning)
 */
function getModel(selectedModel?: ModelSelection) {
  const defaultModel: ModelSelection = "gemini-3-flash";
  const modelKey = selectedModel || defaultModel;
  const config = MODEL_CONFIG[modelKey];

  if (!config) {
    console.warn(`Unknown model: ${modelKey}, falling back to ${defaultModel}`);
    return getModel(defaultModel);
  }

  // Check if the required API key is available
  switch (config.provider) {
    case "google":
      if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY) {
        console.log(`Using Google model: ${config.modelId}`);
        return {
          model: google(config.modelId),
          provider: config.provider,
          hasThinking: config.hasThinking,
        };
      }
      console.warn("Google API key not configured");
      break;
    case "anthropic":
      if (process.env.ANTHROPIC_API_KEY) {
        console.log(`Using Anthropic model: ${config.modelId}`);
        return {
          model: anthropic(config.modelId),
          provider: config.provider,
          hasThinking: config.hasThinking,
        };
      }
      console.warn("Anthropic API key not configured");
      break;
    case "openai":
      if (process.env.OPENAI_API_KEY) {
        console.log(`Using OpenAI model: ${config.modelId}`);
        return {
          model: openai(config.modelId),
          provider: config.provider,
          hasThinking: config.hasThinking,
        };
      }
      console.warn("OpenAI API key not configured");
      break;
  }

  // Fallback: try any available provider
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY) {
    const fallback = MODEL_CONFIG["gemini-3-flash"];
    console.log(`Falling back to Google: ${fallback.modelId}`);
    return { model: google(fallback.modelId), provider: "google" as const, hasThinking: fallback.hasThinking };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const fallback = MODEL_CONFIG["claude-haiku-4.5"];
    console.log(`Falling back to Anthropic: ${fallback.modelId}`);
    return { model: anthropic(fallback.modelId), provider: "anthropic" as const, hasThinking: fallback.hasThinking };
  }
  if (process.env.OPENAI_API_KEY) {
    const fallback = MODEL_CONFIG["gpt-5.2"];
    console.log(`Falling back to OpenAI: ${fallback.modelId}`);
    return { model: openai(fallback.modelId), provider: "openai" as const, hasThinking: fallback.hasThinking };
  }

  throw new Error(
    "No AI API key configured. Set GOOGLE_GENERATIVE_AI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY"
  );
}

// Define tools with inputSchema (AI SDK 5.x format)
const tools = {
  journal_create_entry: {
    description: "Create a new journal entry for a git commit",
    inputSchema: z.object({
      commit_hash: z.string().min(7),
      repository: z.string().min(1),
      branch: z.string().min(1),
      author: z.string().min(1),
      date: z.string(),
      raw_agent_report: z.string().min(10),
    }),
  },
  journal_get_entry: {
    description: "Retrieve a journal entry by its commit hash",
    inputSchema: z.object({
      commit_hash: z.string().min(7),
    }),
  },
  journal_list_by_repository: {
    description: "List all journal entries for a repository",
    inputSchema: z.object({
      repository: z.string().min(1),
      limit: z.number().optional().default(20),
      offset: z.number().optional().default(0),
    }),
  },
  journal_list_by_branch: {
    description: "List journal entries for a specific branch",
    inputSchema: z.object({
      repository: z.string().min(1),
      branch: z.string().min(1),
      limit: z.number().optional().default(20),
      offset: z.number().optional().default(0),
    }),
  },
  journal_list_repositories: {
    description: "List all repositories with journal entries",
    inputSchema: z.object({}),
  },
  journal_list_branches: {
    description: "List all branches in a repository with journal entries",
    inputSchema: z.object({
      repository: z.string().min(1),
    }),
  },
  journal_edit_entry: {
    description: "Update fields in an existing journal entry",
    inputSchema: z.object({
      commit_hash: z.string().min(7),
      why: z.string().optional(),
      what_changed: z.string().optional(),
      decisions: z.string().optional(),
      technologies: z.string().optional(),
      kronus_wisdom: z.string().nullable().optional(),
    }),
  },
  journal_regenerate_entry: {
    description: "Use AI to regenerate an existing journal entry",
    inputSchema: z.object({
      commit_hash: z.string().min(7),
      new_context: z.string().optional(),
      use_existing_as_context: z.boolean().optional().default(false),
    }),
  },
  journal_get_project_summary: {
    description: "Get the project summary for a repository",
    inputSchema: z.object({
      repository: z.string().min(1),
    }),
  },
  journal_list_project_summaries: {
    description: "List all project summaries",
    inputSchema: z.object({
      limit: z.number().optional().default(30),
      offset: z.number().optional().default(0),
    }),
  },
  journal_upsert_project_summary: {
    description: "Create or update the project summary for a repository",
    inputSchema: z.object({
      repository: z.string().min(1).describe("Repository name"),
      git_url: z.string().url().describe("Git repository URL"),
      summary: z.string().min(10).describe("High-level project summary"),
      purpose: z.string().min(10).describe("Why this project exists"),
      architecture: z.string().min(10).describe("Overall architecture"),
      key_decisions: z.string().min(10).describe("Major decisions"),
      technologies: z.string().min(3).describe("Comma-separated list of technologies"),
      status: z.string().min(3).describe("Current project status"),
    }),
  },
  journal_list_attachments: {
    description: "List attachments for a journal entry",
    inputSchema: z.object({
      commit_hash: z.string().min(7),
    }),
  },
  journal_backup: {
    description: "Trigger a database backup",
    inputSchema: z.object({}),
  },
  linear_get_viewer: {
    description: "Get your Linear user info",
    inputSchema: z.object({}),
  },
  linear_list_issues: {
    description: "List issues in Linear with optional filters",
    inputSchema: z.object({
      assigneeId: z.string().optional(),
      teamId: z.string().optional(),
      projectId: z.string().optional(),
      query: z.string().optional(),
      limit: z.number().optional().default(50),
      showAll: z.boolean().optional().default(false),
    }),
  },
  linear_create_issue: {
    description: "Create a new issue in Linear",
    inputSchema: z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      teamId: z.string(),
      projectId: z.string().optional(),
      priority: z.number().min(0).max(4).optional(),
      assigneeId: z.string().optional(),
    }),
  },
  linear_update_issue: {
    description: "Update an existing Linear issue",
    inputSchema: z.object({
      issueId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      priority: z.number().min(0).max(4).optional(),
      stateId: z.string().optional(),
      assigneeId: z.string().optional(),
    }),
  },
  linear_list_projects: {
    description: "List all projects in Linear",
    inputSchema: z.object({
      teamId: z.string().optional(),
    }),
  },
  linear_create_project: {
    description: "Create a new project in Linear. Projects help organize related issues and track progress toward goals.",
    inputSchema: z.object({
      name: z.string().min(1).describe("Project name"),
      teamIds: z.array(z.string()).min(1).describe("Array of team IDs to associate with the project"),
      description: z.string().optional().describe("Project description (plain text)"),
      content: z.string().optional().describe("Project content (rich text markdown)"),
      leadId: z.string().optional().describe("User ID for the project lead"),
      targetDate: z.string().optional().describe("Target completion date (ISO 8601)"),
      startDate: z.string().optional().describe("Project start date (ISO 8601)"),
    }),
  },
  linear_update_project: {
    description: "Update a Linear project",
    inputSchema: z.object({
      projectId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      content: z.string().optional(),
      leadId: z.string().optional(),
      targetDate: z.string().optional(),
      startDate: z.string().optional(),
    }),
  },
  // ===== Image Generation Tool =====
  replicate_generate_image: {
    description:
      "Generate an image using FLUX, Nano Banana Pro, or other models. Use this when the user wants to create images from text prompts.",
    inputSchema: z.object({
      prompt: z.string().min(1).describe("Text prompt describing the image to generate"),
      model: z
        .string()
        .optional()
        .default("black-forest-labs/flux-2-pro")
        .describe("Model identifier. Options: 'black-forest-labs/flux-2-pro' (default, best quality), 'black-forest-labs/flux-schnell' (fast), 'nano-banana-pro' (Google, great for text in images), 'gemini-2.0-flash-exp' (Google fast), 'imagen-3.0-generate-002' (Google Imagen)"),
      width: z.number().optional().default(1024).describe("Image width in pixels"),
      height: z.number().optional().default(1024).describe("Image height in pixels"),
      num_outputs: z.number().optional().default(1).describe("Number of images to generate"),
    }),
  },
  // ===== Media/Image Storage Tool =====
  save_image: {
    description:
      "Save an image to the Media library. Images are stored centrally and can be linked to Journal entries and/or Repository documents. Use this after generating an image to permanently store it.",
    inputSchema: z.object({
      url: z.string().url().describe("URL of the image to download and save"),
      filename: z.string().min(1).describe("Filename for the saved image (e.g., 'architecture-diagram.png')"),
      description: z.string().optional().describe("Description of what the image shows"),
      prompt: z.string().optional().describe("The prompt used to generate the image (if AI-generated)"),
      model: z.string().optional().describe("The model used to generate the image (if AI-generated)"),
      tags: z.array(z.string()).optional().default([]).describe("Tags for categorizing the image"),
      commit_hash: z.string().optional().describe("Link to a journal entry by commit hash"),
      document_id: z.number().optional().describe("Link to a repository document by ID"),
    }),
  },
  // ===== Media Listing Tool =====
  list_media: {
    description: "List saved media assets from the Media library. Can filter by linked journal entry or document.",
    inputSchema: z.object({
      commit_hash: z.string().optional().describe("Filter by linked journal entry commit hash"),
      document_id: z.number().optional().describe("Filter by linked repository document ID"),
      limit: z.number().optional().default(20).describe("Maximum number of results"),
    }),
  },
  // ===== Media Get Tool =====
  get_media: {
    description: "Get a specific media asset by ID and display it inline. Use this to show an image in the chat.",
    inputSchema: z.object({
      id: z.number().describe("Media asset ID to fetch and display"),
    }),
  },
  // ===== Media Update Tool =====
  update_media: {
    description: "Update metadata for a saved media asset. Use this to add descriptions, tags, or link images to journal entries or documents.",
    inputSchema: z.object({
      id: z.number().describe("Media asset ID to update"),
      filename: z.string().optional().describe("New filename"),
      description: z.string().optional().describe("New description"),
      tags: z.array(z.string()).optional().describe("New tags array"),
      commit_hash: z.string().optional().describe("Link to journal entry by commit hash"),
      document_id: z.number().optional().describe("Link to repository document by ID"),
    }),
  },

  // ===== Repository Tools =====
  repository_list_documents: {
    description: "List documents from the Repository. Can filter by type (writing, prompt, note).",
    inputSchema: z.object({
      type: z.enum(["writing", "prompt", "note"]).optional().describe("Filter by document type"),
      limit: z.number().optional().default(50).describe("Maximum results"),
    }),
  },
  repository_get_document: {
    description: "Get a specific document from the Repository by slug or ID",
    inputSchema: z.object({
      slug: z.string().optional().describe("Document slug"),
      id: z.number().optional().describe("Document ID"),
    }),
  },
  repository_create_document: {
    description: "Create a new document in the Repository",
    inputSchema: z.object({
      title: z.string().min(1).describe("Document title"),
      content: z.string().min(1).describe("Document content (markdown supported)"),
      type: z.enum(["writing", "prompt", "note"]).default("writing").describe("Document type"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
      metadata: z.record(z.string(), z.any()).optional().describe("Additional metadata (year, language, etc.)"),
    }),
  },
  repository_update_document: {
    description: "Update an existing document in the Repository",
    inputSchema: z.object({
      id: z.number().describe("Document ID to update"),
      title: z.string().optional().describe("New title"),
      content: z.string().optional().describe("New content"),
      tags: z.array(z.string()).optional().describe("New tags"),
      metadata: z.record(z.string(), z.any()).optional().describe("Updated metadata"),
    }),
  },
  repository_list_skills: {
    description: "List all skills from the CV/Repository",
    inputSchema: z.object({
      category: z.string().optional().describe("Filter by category"),
    }),
  },
  repository_update_skill: {
    description: "Update a skill entry",
    inputSchema: z.object({
      id: z.string().describe("Skill ID"),
      name: z.string().optional(),
      category: z.string().optional(),
      magnitude: z.number().min(1).max(5).optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
  },
  repository_create_skill: {
    description: "Create a new skill entry in the CV. Categories: 'AI & Development', 'Languages & Frameworks', 'Data & Analytics', 'Infrastructure & DevOps', 'Design & UX', 'Leadership & Collaboration'. Magnitude is 1-5 (5=expert).",
    inputSchema: z.object({
      id: z.string().describe("Unique skill ID (lowercase, no spaces, e.g. 'react-native')"),
      name: z.string().describe("Display name (e.g. 'React Native')"),
      category: z.string().describe("One of: 'AI & Development', 'Languages & Frameworks', 'Data & Analytics', 'Infrastructure & DevOps', 'Design & UX', 'Leadership & Collaboration'"),
      magnitude: z.number().min(1).max(5).describe("Proficiency level 1-5 (5=expert)"),
      description: z.string().describe("Brief description of expertise"),
      icon: z.string().optional().describe("Icon identifier (optional)"),
      color: z.string().optional().describe("Color hex code (optional)"),
      url: z.string().optional().describe("Reference URL (optional)"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
      firstUsed: z.string().optional().describe("Year first used (e.g. '2020')"),
      lastUsed: z.string().optional().describe("Year last used or 'Present'"),
    }),
  },
  repository_list_experience: {
    description: "List work experience entries",
    inputSchema: z.object({}),
  },
  repository_create_experience: {
    description: "Create a new work experience entry in the CV",
    inputSchema: z.object({
      id: z.string().describe("Unique ID (lowercase, no spaces, e.g. 'company-role-2024')"),
      title: z.string().describe("Job title"),
      company: z.string().describe("Company name"),
      department: z.string().optional().describe("Department (optional)"),
      location: z.string().describe("Location (e.g. 'Helsinki, Finland')"),
      dateStart: z.string().describe("Start date (e.g. '2022-01')"),
      dateEnd: z.string().optional().describe("End date or leave empty for current"),
      tagline: z.string().describe("Brief role description/tagline"),
      note: z.string().optional().describe("Additional notes (optional)"),
      achievements: z.array(z.string()).optional().describe("List of key achievements"),
    }),
  },
  repository_list_education: {
    description: "List education entries",
    inputSchema: z.object({}),
  },
  repository_create_education: {
    description: "Create a new education entry in the CV",
    inputSchema: z.object({
      id: z.string().describe("Unique ID (lowercase, no spaces, e.g. 'university-degree-2020')"),
      degree: z.string().describe("Degree type (e.g. 'Bachelor of Science')"),
      field: z.string().describe("Field of study (e.g. 'Computer Science')"),
      institution: z.string().describe("Institution name"),
      location: z.string().describe("Location (e.g. 'Helsinki, Finland')"),
      dateStart: z.string().describe("Start date (e.g. '2016-09')"),
      dateEnd: z.string().describe("End date (e.g. '2020-06')"),
      tagline: z.string().describe("Brief description/tagline"),
      note: z.string().optional().describe("Additional notes (optional)"),
      focusAreas: z.array(z.string()).optional().describe("Areas of focus/specialization"),
      achievements: z.array(z.string()).optional().describe("Key achievements/honors"),
    }),
  },
  repository_update_experience: {
    description: "Update an existing work experience entry",
    inputSchema: z.object({
      id: z.string().describe("Experience ID to update"),
      title: z.string().optional().describe("Updated job title"),
      company: z.string().optional().describe("Updated company name"),
      tagline: z.string().optional().describe("Updated tagline"),
      achievements: z.array(z.string()).optional().describe("Updated achievements"),
      dateStart: z.string().optional().describe("Updated start date (YYYY-MM)"),
      dateEnd: z.string().nullable().optional().describe("Updated end date (YYYY-MM or null for current)"),
    }),
  },
  repository_update_education: {
    description: "Update an existing education entry",
    inputSchema: z.object({
      id: z.string().describe("Education ID to update"),
      degree: z.string().optional().describe("Updated degree"),
      field: z.string().optional().describe("Updated field of study"),
      institution: z.string().optional().describe("Updated institution"),
      tagline: z.string().optional().describe("Updated tagline"),
      focusAreas: z.array(z.string()).optional().describe("Updated focus areas"),
      achievements: z.array(z.string()).optional().describe("Updated achievements"),
    }),
  },
  // ===== Portfolio Projects Tools =====
  repository_list_portfolio_projects: {
    description: "List portfolio projects",
    inputSchema: z.object({
      featured: z.boolean().optional().describe("Filter by featured status"),
      status: z.string().optional().describe("Filter by status (active, completed, archived)"),
    }),
  },
  repository_get_portfolio_project: {
    description: "Get a specific portfolio project by ID",
    inputSchema: z.object({
      id: z.number().describe("Portfolio project ID"),
    }),
  },
  repository_create_portfolio_project: {
    description: "Create a new portfolio project",
    inputSchema: z.object({
      title: z.string().describe("Project title"),
      category: z.string().describe("Project category (e.g. 'AI/ML', 'Web App', 'Mobile')"),
      company: z.string().optional().describe("Company/client name"),
      role: z.string().optional().describe("Your role in the project"),
      status: z.string().default("active").describe("Project status (active, completed, archived)"),
      featured: z.boolean().default(false).describe("Whether this is a featured project"),
      technologies: z.array(z.string()).optional().describe("Technologies used"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
      description: z.string().optional().describe("Project description (markdown)"),
      image_url: z.string().optional().describe("URL of project image"),
    }),
  },
  repository_update_portfolio_project: {
    description: "Update an existing portfolio project",
    inputSchema: z.object({
      id: z.number().describe("Portfolio project ID to update"),
      title: z.string().optional().describe("Updated title"),
      category: z.string().optional().describe("Updated category"),
      company: z.string().optional().describe("Updated company"),
      role: z.string().optional().describe("Updated role"),
      status: z.string().optional().describe("Updated status"),
      featured: z.boolean().optional().describe("Updated featured status"),
      technologies: z.array(z.string()).optional().describe("Updated technologies"),
      tags: z.array(z.string()).optional().describe("Updated tags"),
      description: z.string().optional().describe("Updated description"),
      image_url: z.string().optional().describe("Updated image URL"),
    }),
  },
};

// ===== Web Search Tools (Perplexity) =====
const webSearchTools = {
  perplexity_search: {
    description: "Search the web using Perplexity. Returns ranked search results with metadata. Best for finding current information, news, documentation.",
    inputSchema: z.object({
      query: z.string().min(1).describe("Search query"),
    }),
  },
  perplexity_ask: {
    description: "Ask a question with real-time web search using Perplexity sonar-pro model. Great for quick questions, factual lookups, and conversational research.",
    inputSchema: z.object({
      question: z.string().min(1).describe("Question to ask"),
    }),
  },
  perplexity_research: {
    description: "Deep, comprehensive research using Perplexity sonar-deep-research model. Use for thorough analysis, detailed reports, complex topics. Takes longer but provides exhaustive results.",
    inputSchema: z.object({
      topic: z.string().min(1).describe("Topic to research in depth"),
      strip_thinking: z.boolean().optional().default(true).describe("Remove thinking tags to save tokens"),
    }),
  },
  perplexity_reason: {
    description: "Advanced reasoning and problem-solving using Perplexity sonar-reasoning-pro model. Perfect for complex analytical tasks, multi-step problems, logical analysis.",
    inputSchema: z.object({
      problem: z.string().min(1).describe("Problem or question requiring reasoning"),
      strip_thinking: z.boolean().optional().default(true).describe("Remove thinking tags to save tokens"),
    }),
  },
};

/**
 * Build the tools object based on toolsConfig
 */
function buildTools(toolsConfig: ToolsConfig): Record<string, any> {
  const enabledTools: Record<string, any> = {};

  // Journal tools
  if (toolsConfig.journal) {
    Object.assign(enabledTools, {
      journal_create_entry: tools.journal_create_entry,
      journal_get_entry: tools.journal_get_entry,
      journal_list_by_repository: tools.journal_list_by_repository,
      journal_list_by_branch: tools.journal_list_by_branch,
      journal_list_repositories: tools.journal_list_repositories,
      journal_list_branches: tools.journal_list_branches,
      journal_edit_entry: tools.journal_edit_entry,
      journal_regenerate_entry: tools.journal_regenerate_entry,
      journal_get_project_summary: tools.journal_get_project_summary,
      journal_list_project_summaries: tools.journal_list_project_summaries,
      journal_upsert_project_summary: tools.journal_upsert_project_summary,
      journal_list_attachments: tools.journal_list_attachments,
      journal_backup: tools.journal_backup,
    });
  }

  // Linear tools
  if (toolsConfig.linear) {
    Object.assign(enabledTools, {
      linear_get_viewer: tools.linear_get_viewer,
      linear_list_issues: tools.linear_list_issues,
      linear_create_issue: tools.linear_create_issue,
      linear_update_issue: tools.linear_update_issue,
      linear_list_projects: tools.linear_list_projects,
      linear_create_project: tools.linear_create_project,
      linear_update_project: tools.linear_update_project,
    });
  }

  // Repository tools
  if (toolsConfig.repository) {
    Object.assign(enabledTools, {
      // Documents (writings, prompts, notes)
      repository_list_documents: tools.repository_list_documents,
      repository_get_document: tools.repository_get_document,
      repository_create_document: tools.repository_create_document,
      repository_update_document: tools.repository_update_document,
      // Skills
      repository_list_skills: tools.repository_list_skills,
      repository_update_skill: tools.repository_update_skill,
      repository_create_skill: tools.repository_create_skill,
      // Work Experience
      repository_list_experience: tools.repository_list_experience,
      repository_create_experience: tools.repository_create_experience,
      repository_update_experience: tools.repository_update_experience,
      // Education
      repository_list_education: tools.repository_list_education,
      repository_create_education: tools.repository_create_education,
      repository_update_education: tools.repository_update_education,
      // Portfolio Projects
      repository_list_portfolio_projects: tools.repository_list_portfolio_projects,
      repository_get_portfolio_project: tools.repository_get_portfolio_project,
      repository_create_portfolio_project: tools.repository_create_portfolio_project,
      repository_update_portfolio_project: tools.repository_update_portfolio_project,
    });
  }

  // Media tools
  if (toolsConfig.media) {
    Object.assign(enabledTools, {
      save_image: tools.save_image,
      list_media: tools.list_media,
      get_media: tools.get_media,
      update_media: tools.update_media,
    });
  }

  // Image generation tools (heavy)
  if (toolsConfig.imageGeneration) {
    Object.assign(enabledTools, {
      replicate_generate_image: tools.replicate_generate_image,
    });
  }

  // Web search tools (Perplexity)
  if (toolsConfig.webSearch) {
    Object.assign(enabledTools, webSearchTools);
  }

  return enabledTools;
}

export async function POST(req: Request) {
  try {
    const { messages, soulConfig, toolsConfig, modelConfig } = await req.json();

    // Parse soul config from request, default to all sections enabled
    const config: SoulConfig = soulConfig ? {
      writings: soulConfig.writings ?? true,
      portfolioProjects: soulConfig.portfolioProjects ?? true,
      skills: soulConfig.skills ?? true,
      workExperience: soulConfig.workExperience ?? true,
      education: soulConfig.education ?? true,
      journalEntries: soulConfig.journalEntries ?? true,
      // Linear context
      linearProjects: soulConfig.linearProjects ?? true,
      linearIssues: soulConfig.linearIssues ?? true,
      linearIncludeCompleted: soulConfig.linearIncludeCompleted ?? false,
    } : DEFAULT_SOUL_CONFIG;

    // Parse tools config from request
    const enabledToolsConfig: ToolsConfig = toolsConfig ? {
      journal: toolsConfig.journal ?? true,
      repository: toolsConfig.repository ?? true,
      linear: toolsConfig.linear ?? true,
      media: toolsConfig.media ?? true,
      imageGeneration: toolsConfig.imageGeneration ?? false,
      webSearch: toolsConfig.webSearch ?? false,
    } : DEFAULT_TOOLS_CONFIG;

    // Get model based on selected model (default: gemini-3-flash)
    const selectedModel = modelConfig?.model as ModelSelection | undefined;
    const { model, provider: actualProvider, hasThinking } = getModel(selectedModel);
    const systemPrompt = await getKronusSystemPrompt(config);
    const enabledTools = buildTools(enabledToolsConfig);

    // Convert UI messages to model format for proper streaming (async in AI SDK 6)
    let modelMessages = await convertToModelMessages(messages);

    // Gemini 3 Pro requires thoughtSignature for multi-turn tool calling
    // When signatures aren't preserved in message conversion, inject dummy signature
    // See: https://ai.google.dev/gemini-api/docs/thought-signatures
    const isGemini3 = actualProvider === "google" &&
                      (process.env.GOOGLE_MODEL?.includes("gemini-3") || !process.env.GOOGLE_MODEL);
    if (isGemini3) {
      modelMessages = modelMessages.map((msg: any) => {
        if (msg.role === "assistant" && msg.content) {
          // Add thoughtSignature to tool-call parts that don't have one
          const updatedContent = msg.content.map((part: any) => {
            if (part.type === "tool-call" && !part.providerMetadata?.google?.thoughtSignature) {
              return {
                ...part,
                providerMetadata: {
                  ...part.providerMetadata,
                  google: {
                    ...part.providerMetadata?.google,
                    thoughtSignature: "skip_thought_signature_validator",
                  },
                },
              };
            }
            return part;
          });
          return { ...msg, content: updatedContent };
        }
        return msg;
      });
    }

    // Build provider options for thinking/reasoning based on provider and model capability
    const providerOptions: Record<string, any> = {};
    if (hasThinking) {
      if (actualProvider === "anthropic") {
        // Enable extended thinking for Claude models (Opus 4.5)
        providerOptions.anthropic = {
          thinking: { type: "enabled", budgetTokens: 10000 },
        } satisfies AnthropicProviderOptions;
      } else if (actualProvider === "google") {
        // Enable thinking for Gemini models
        providerOptions.google = {
          thinkingConfig: {
            includeThoughts: true,
          },
        } satisfies GoogleGenerativeAIProviderOptions;
      } else if (actualProvider === "openai") {
        // Enable reasoning summaries for GPT-5.2
        providerOptions.openai = {
          reasoningSummary: "detailed",
        };
      }
    }

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools: enabledTools as any,
      providerOptions,
      onError: (event) => {
        // Log streaming errors with full details
        console.error("[Chat Stream Error]", {
          error: event.error,
          message: event.error instanceof Error ? event.error.message : String(event.error),
          stack: event.error instanceof Error ? event.error.stack : undefined,
        });
      },
      onFinish: (event) => {
        // Log completion with full details for debugging
        const isError = event.finishReason === "error" || event.finishReason === "other";
        const logFn = isError ? console.error : console.log;
        const label = isError ? "[Chat Finish Warning]" : "[Chat Complete]";

        logFn(label, {
          finishReason: event.finishReason,
          usage: event.usage,
          // Log response content for debugging empty responses
          textLength: event.text?.length || 0,
          textPreview: event.text?.slice(0, 200) || "(empty)",
          toolCallsCount: event.response?.messages?.filter((m: any) => m.role === "assistant" && m.toolCalls)?.length || 0,
          // Raw provider response for debugging
          rawResponse: (event.response as any)?.rawResponse ? JSON.stringify((event.response as any).rawResponse).slice(0, 500) : "(no raw response)",
        });

        // Specifically flag zero-output issues
        if (event.usage?.outputTokens === 0) {
          console.error("[Chat Zero Output]", {
            finishReason: event.finishReason,
            inputTokens: event.usage?.inputTokens,
            possibleCauses: [
              "Context too large for model",
              "Safety filter triggered",
              "Model returned empty response",
              "Rate limit or quota issue",
            ],
          });
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error: any) {
    // Categorize and log errors with context
    const errorType = categorizeError(error);
    console.error(`[Chat Error: ${errorType}]`, {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    });

    return new Response(JSON.stringify({
      error: error.message || "Chat failed",
      type: errorType,
      code: error.code,
    }), {
      status: error.status || 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Categorize errors for better debugging
 */
function categorizeError(error: any): string {
  const message = error.message?.toLowerCase() || "";
  const code = error.code?.toLowerCase() || "";

  // API/Auth errors
  if (message.includes("api key") || message.includes("unauthorized") || error.status === 401) {
    return "AUTH_ERROR";
  }

  // Rate limiting
  if (message.includes("rate limit") || message.includes("quota") || error.status === 429) {
    return "RATE_LIMIT";
  }

  // Token/context limits
  if (message.includes("token") || message.includes("context") || message.includes("too long")) {
    return "TOKEN_LIMIT";
  }

  // Network errors
  if (code.includes("econnrefused") || code.includes("etimedout") || message.includes("network")) {
    return "NETWORK_ERROR";
  }

  // Timeout
  if (message.includes("timeout") || code.includes("timeout")) {
    return "TIMEOUT";
  }

  // Model errors
  if (message.includes("model") || message.includes("not found")) {
    return "MODEL_ERROR";
  }

  // Safety/content filters
  if (message.includes("safety") || message.includes("blocked") || message.includes("filter")) {
    return "CONTENT_FILTER";
  }

  // Validation errors
  if (message.includes("invalid") || message.includes("validation")) {
    return "VALIDATION_ERROR";
  }

  return "UNKNOWN_ERROR";
}
