import { streamText, convertToModelMessages } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { getKronusSystemPrompt, SoulConfig, DEFAULT_SOUL_CONFIG } from "@/lib/ai/kronus";

/**
 * Get the AI model - Anthropic is preferred for Kronus
 * 
 * Models:
 * - claude-sonnet-4-5-20250929 (default) - Claude Sonnet 4.5, best for coding/agents
 * - claude-opus-4-20250514 - Maximum capability
 * 
 * Override via ANTHROPIC_MODEL env var
 */
function getModel() {
  // Anthropic - PREFERRED for Kronus chat
  if (process.env.ANTHROPIC_API_KEY) {
    // Default to Claude Sonnet 4.5 - the latest and best for agents
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
    console.log(`Using Anthropic model: ${model}`);
    return anthropic(model);
  }
  // Fallback: OpenAI
  if (process.env.OPENAI_API_KEY) {
    console.log("Using OpenAI model: gpt-4o");
    return openai("gpt-4o");
  }
  // Fallback: Google
  if (process.env.GOOGLE_API_KEY) {
    console.log("Using Google model: gemini-2.0-flash");
    return google("gemini-2.0-flash");
  }
  throw new Error(
    "No AI API key configured. Set ANTHROPIC_API_KEY (preferred), OPENAI_API_KEY, or GOOGLE_API_KEY"
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
  linear_update_project: {
    description: "Update a Linear project",
    inputSchema: z.object({
      projectId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      content: z.string().optional(),
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
};

export async function POST(req: Request) {
  try {
    const { messages, soulConfig } = await req.json();

    // Parse soul config from request, default to all sections enabled
    const config: SoulConfig = soulConfig ? {
      writings: soulConfig.writings ?? true,
      portfolioProjects: soulConfig.portfolioProjects ?? true,
      skills: soulConfig.skills ?? true,
      workExperience: soulConfig.workExperience ?? true,
      education: soulConfig.education ?? true,
    } : DEFAULT_SOUL_CONFIG;

    const model = getModel();
    const systemPrompt = getKronusSystemPrompt(config);

    // Convert UI messages to model format for proper streaming
    const modelMessages = convertToModelMessages(messages);

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools: tools as any,
    });

    return result.toUIMessageStreamResponse();
  } catch (error: any) {
    console.error("Chat error:", error);
    return new Response(JSON.stringify({ error: error.message || "Chat failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
