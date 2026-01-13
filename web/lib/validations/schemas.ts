/**
 * Zod Validation Schemas
 *
 * Centralized validation schemas for API inputs.
 * Used with validateRequest() helper for type-safe validation.
 */

import { z } from "zod";

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

/**
 * Pagination parameters
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

// ============================================================================
// JOURNAL SCHEMAS
// ============================================================================

/**
 * Query params for listing journal entries
 */
export const journalQuerySchema = paginationSchema.extend({
  repository: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
});

export type JournalQueryParams = z.infer<typeof journalQuerySchema>;

/**
 * Commit hash parameter
 */
export const commitHashSchema = z.object({
  commitHash: z.string().min(7, "Commit hash must be at least 7 characters"),
});

export type CommitHashParam = z.infer<typeof commitHashSchema>;

/**
 * Create journal entry
 */
export const createJournalEntrySchema = z.object({
  commit_hash: z.string().min(7),
  repository: z.string().min(1),
  branch: z.string().min(1),
  author: z.string().min(1),
  date: z.string(),
  raw_agent_report: z.string().min(10),
});

export type CreateJournalEntry = z.infer<typeof createJournalEntrySchema>;

/**
 * Update journal entry
 */
export const updateJournalEntrySchema = z.object({
  why: z.string().optional(),
  what_changed: z.string().optional(),
  decisions: z.string().optional(),
  technologies: z.string().optional(),
  kronus_wisdom: z.string().nullable().optional(),
  // Attribution fields
  author: z.string().min(1).optional(),
  code_author: z.string().min(1).optional(),
  team_members: z.string().optional(), // JSON array string
});

export type UpdateJournalEntry = z.infer<typeof updateJournalEntrySchema>;

// ============================================================================
// DOCUMENT SCHEMAS
// ============================================================================

/**
 * Query params for listing documents
 */
export const documentQuerySchema = paginationSchema.extend({
  type: z.enum(["writing", "prompt", "note"]).optional(),
  search: z.string().optional(),
  year: z.coerce.number().optional(),
});

export type DocumentQueryParams = z.infer<typeof documentQuerySchema>;

/**
 * Create document
 */
export const createDocumentSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
  type: z.enum(["writing", "prompt", "note"]).default("writing"),
  content: z.string().min(1, "Content is required"),
  language: z.string().default("en"),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export type CreateDocument = z.infer<typeof createDocumentSchema>;

/**
 * Update document
 */
export const updateDocumentSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  type: z.enum(["writing", "prompt", "note"]).optional(),
  language: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateDocument = z.infer<typeof updateDocumentSchema>;

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

/**
 * Login request
 */
export const loginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export type LoginRequest = z.infer<typeof loginSchema>;

// ============================================================================
// CV/SKILL SCHEMAS
// ============================================================================

/**
 * Create skill
 */
export const createSkillSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with dashes"),
  name: z.string().min(1),
  category: z.string().min(1),
  magnitude: z.number().min(1).max(5),
  description: z.string().min(1),
  icon: z.string().optional(),
  color: z.string().optional(),
  url: z.string().url().optional().or(z.literal("")),
  tags: z.array(z.string()).optional().default([]),
  firstUsed: z.string().optional(),
  lastUsed: z.string().optional(),
});

export type CreateSkill = z.infer<typeof createSkillSchema>;

/**
 * Update skill
 */
export const updateSkillSchema = createSkillSchema.partial().omit({ id: true });

export type UpdateSkill = z.infer<typeof updateSkillSchema>;

// ============================================================================
// MEDIA SCHEMAS
// ============================================================================

/**
 * Query params for listing media
 */
export const mediaQuerySchema = paginationSchema.extend({
  commit_hash: z.string().optional(),
  document_id: z.coerce.number().optional(),
  destination: z.enum(["journal", "repository", "media"]).optional(),
});

export type MediaQueryParams = z.infer<typeof mediaQuerySchema>;

/**
 * Create media asset
 */
export const createMediaSchema = z.object({
  filename: z.string().min(1),
  url: z.string().url().optional(),
  data: z.string().optional(), // base64
  description: z.string().optional(),
  prompt: z.string().optional(),
  model: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  destination: z.enum(["journal", "repository", "media"]).default("media"),
  commit_hash: z.string().optional(),
  document_id: z.number().optional(),
});

export type CreateMedia = z.infer<typeof createMediaSchema>;

// ============================================================================
// CHAT COMPRESSION SCHEMAS
// ============================================================================

/**
 * Key decision made during the conversation
 */
export const decisionSchema = z.object({
  topic: z.string().describe("What the decision was about (e.g., 'Database schema', 'UI component')"),
  decision: z.string().describe("The actual decision made"),
  rationale: z.string().optional().describe("Why this decision was made, if discussed"),
});

/**
 * Task or action item from the conversation
 */
export const taskSchema = z.object({
  description: z.string().describe("What needs to be done"),
  status: z.enum(["completed", "in_progress", "pending"]).describe("Current status of the task"),
  context: z.string().optional().describe("Additional context about this task"),
});

/**
 * Code artifact created or modified during the conversation
 */
export const codeArtifactSchema = z.object({
  filePath: z.string().describe("Path to the file"),
  action: z.enum(["created", "modified", "deleted"]).describe("What happened to this file"),
  summary: z.string().describe("Brief description of what was done"),
});

/**
 * CompressionSummary - Structured summary generated by Haiku 4.5
 * This is stored in the database and used to continue conversations
 */
export const compressionSummarySchema = z.object({
  // High-level summary
  conversationOverview: z.string()
    .describe("2-3 sentence overview of what this conversation was about"),

  // Key topics discussed
  topicsDiscussed: z.array(z.string())
    .describe("List of main topics/areas covered in the conversation"),

  // Decisions made
  decisions: z.array(decisionSchema)
    .describe("Important decisions made during the conversation"),

  // Tasks and their status
  tasks: z.array(taskSchema)
    .describe("Tasks identified, worked on, or completed"),

  // Code changes
  codeArtifacts: z.array(codeArtifactSchema)
    .describe("Files created, modified, or deleted"),

  // Technical context
  technicalContext: z.object({
    technologies: z.array(z.string()).describe("Technologies/frameworks being used"),
    patterns: z.array(z.string()).optional().describe("Design patterns or approaches discussed"),
    constraints: z.array(z.string()).optional().describe("Constraints or requirements mentioned"),
  }),

  // User preferences discovered
  userPreferences: z.array(z.string()).optional()
    .describe("User preferences or style choices discovered during conversation"),

  // Open questions or blockers
  openItems: z.array(z.string()).optional()
    .describe("Unresolved questions or blockers at end of conversation"),

  // Metadata
  metadata: z.object({
    originalMessageCount: z.number().describe("Number of messages in original conversation"),
    compressedAt: z.string().describe("ISO timestamp of compression"),
    modelUsed: z.string().describe("Model used for compression (e.g., claude-3-5-haiku-20241022)"),
  }),
});

export type CompressionSummary = z.infer<typeof compressionSummarySchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type Task = z.infer<typeof taskSchema>;
export type CodeArtifact = z.infer<typeof codeArtifactSchema>;

/**
 * Request body for compress endpoint
 */
export const compressRequestSchema = z.object({
  conversationId: z.number().describe("ID of the conversation to compress"),
});

export type CompressRequest = z.infer<typeof compressRequestSchema>;

// ============================================================================
// CONVERSATION SCHEMAS
// ============================================================================

/**
 * Query params for listing conversations
 */
export const conversationQuerySchema = paginationSchema.extend({
  query: z.string().optional(),
});

export type ConversationQueryParams = z.infer<typeof conversationQuerySchema>;

/**
 * Create/update conversation
 */
export const saveConversationSchema = z.object({
  title: z.string().min(1, "Title is required"),
  messages: z.array(z.any()).min(1, "Messages are required"),
});

export type SaveConversation = z.infer<typeof saveConversationSchema>;

/**
 * ID parameter (numeric)
 */
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive("ID must be a positive integer"),
});

export type IdParam = z.infer<typeof idParamSchema>;

/**
 * String ID parameter (for portfolio projects, skills, etc.)
 */
export const stringIdParamSchema = z.object({
  id: z.string().min(1, "ID is required"),
});

export type StringIdParam = z.infer<typeof stringIdParamSchema>;

// ============================================================================
// PORTFOLIO PROJECT SCHEMAS
// ============================================================================

/**
 * Query params for listing portfolio projects
 */
export const portfolioQuerySchema = z.object({
  category: z.string().optional(),
  status: z.enum(["shipped", "wip", "archived"]).optional(),
  featured: z.coerce.boolean().optional(),
});

export type PortfolioQueryParams = z.infer<typeof portfolioQuerySchema>;

/**
 * Create portfolio project
 */
export const createPortfolioProjectSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with dashes"),
  title: z.string().min(1, "Title is required"),
  category: z.string().min(1, "Category is required"),
  company: z.string().optional(),
  dateCompleted: z.string().optional(),
  status: z.enum(["shipped", "wip", "archived"]).default("shipped"),
  featured: z.boolean().default(false),
  image: z.string().optional(),
  excerpt: z.string().optional(),
  description: z.string().optional(),
  role: z.string().optional(),
  technologies: z.array(z.string()).default([]),
  metrics: z.record(z.string(), z.unknown()).default({}),
  links: z.record(z.string(), z.string()).default({}),
  tags: z.array(z.string()).default([]),
  sortOrder: z.number().default(0),
});

export type CreatePortfolioProject = z.infer<typeof createPortfolioProjectSchema>;

/**
 * Update portfolio project
 */
export const updatePortfolioProjectSchema = createPortfolioProjectSchema.partial().omit({ id: true });

export type UpdatePortfolioProject = z.infer<typeof updatePortfolioProjectSchema>;

// ============================================================================
// EXPERIENCE SCHEMAS
// ============================================================================

/**
 * Create work experience
 */
export const createExperienceSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with dashes"),
  title: z.string().min(1, "Title is required"),
  company: z.string().min(1, "Company is required"),
  department: z.string().optional(),
  location: z.string().min(1, "Location is required"),
  dateStart: z.string().min(1, "Start date is required"),
  dateEnd: z.string().optional(),
  tagline: z.string().min(1, "Tagline is required"),
  note: z.string().optional(),
  achievements: z.array(z.string()).default([]),
  logo: z.string().optional(),
});

export type CreateExperience = z.infer<typeof createExperienceSchema>;

/**
 * Update work experience
 */
export const updateExperienceSchema = createExperienceSchema.partial().omit({ id: true });

export type UpdateExperience = z.infer<typeof updateExperienceSchema>;

// ============================================================================
// EDUCATION SCHEMAS
// ============================================================================

/**
 * Create education
 */
export const createEducationSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with dashes"),
  degree: z.string().min(1, "Degree is required"),
  field: z.string().min(1, "Field is required"),
  institution: z.string().min(1, "Institution is required"),
  location: z.string().min(1, "Location is required"),
  dateStart: z.string().min(1, "Start date is required"),
  dateEnd: z.string().min(1, "End date is required"),
  tagline: z.string().min(1, "Tagline is required"),
  note: z.string().optional(),
  focusAreas: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
  logo: z.string().optional(),
});

export type CreateEducation = z.infer<typeof createEducationSchema>;

/**
 * Update education
 */
export const updateEducationSchema = createEducationSchema.partial().omit({ id: true });

export type UpdateEducation = z.infer<typeof updateEducationSchema>;

// ============================================================================
// CATEGORY SCHEMAS
// ============================================================================

/**
 * Create skill category
 */
export const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  color: z.string().default("gray"),
  icon: z.string().default("tag"),
});

export type CreateCategory = z.infer<typeof createCategorySchema>;

/**
 * Update skill category
 */
export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().optional(),
});

export type UpdateCategory = z.infer<typeof updateCategorySchema>;
