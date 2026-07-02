/**
 * Zod Validation Schemas
 *
 * Centralized validation schemas for API inputs.
 * Used with validateRequest() helper for type-safe validation.
 */

import { z } from "zod";
import { normalizeRepository } from "@/lib/utils";

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
  repository: z.string().min(1).transform(normalizeRepository).optional(),
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
  repository: z.string().min(1).transform(normalizeRepository),
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
  summary: z.string().nullable().optional(), // AI-generated summary for indexing
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
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes")
    .optional(),
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
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with dashes"),
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
// ARTEMIS JOB HUNTER SCHEMAS
// ============================================================================

export const artemisApplicationStatusSchema = z.enum([
  "saved",
  "drafting",
  "applied",
  "screening",
  "interviewing",
  "take_home",
  "offer",
  "rejected",
  "withdrawn",
  "archived",
]);

export const artemisPrioritySchema = z.enum(["low", "medium", "high"]);
export const artemisWorkModeSchema = z.enum(["remote", "hybrid", "onsite", "unknown"]);
export const artemisArtifactTypeSchema = z.enum([
  "cv",
  "cover_letter",
  "portfolio",
  "case_study",
  "certificate",
  "other",
]);
export const artemisCommunicationChannelSchema = z.enum([
  "email",
  "linkedin",
  "phone",
  "sms",
  "video_call",
  "in_person",
  "note",
  "other",
]);
export const artemisCommunicationDirectionSchema = z.enum([
  "inbound",
  "outbound",
  "internal_note",
]);

export const artemisApplicationQuerySchema = paginationSchema.extend({
  status: artemisApplicationStatusSchema.optional(),
  company_id: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
});

export type ArtemisApplicationQuery = z.infer<typeof artemisApplicationQuerySchema>;

export const artemisCompanyInputSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(1, "Company name is required"),
  website: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  size: z.string().optional().nullable(),
  headquarters: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  linkedin_url: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
});

export type ArtemisCompanyInput = z.infer<typeof artemisCompanyInputSchema>;

export const artemisPositionInputSchema = z.object({
  id: z.number().int().positive().optional(),
  title: z.string().min(1, "Position title is required"),
  department: z.string().optional().nullable(),
  employment_type: z.string().optional().nullable(),
  seniority: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  work_mode: artemisWorkModeSchema.default("unknown"),
  source_url: z.string().optional().nullable(),
  source_platform: z.string().optional().nullable(),
  salary_min: z.number().int().optional().nullable(),
  salary_max: z.number().int().optional().nullable(),
  salary_currency: z.string().optional().nullable(),
  benefits: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
  nice_to_have: z.array(z.string()).default([]),
  raw_posting_text: z.string().optional().nullable(),
  extracted_data: z.record(z.string(), z.unknown()).default({}),
});

export type ArtemisPositionInput = z.infer<typeof artemisPositionInputSchema>;

export const createArtemisApplicationSchema = z.object({
  company_id: z.number().int().positive().optional(),
  company: artemisCompanyInputSchema.optional(),
  position_id: z.number().int().positive().optional(),
  position: artemisPositionInputSchema.optional(),
  status: artemisApplicationStatusSchema.default("saved"),
  priority: artemisPrioritySchema.default("medium"),
  fit_score: z.number().int().min(0).max(100).optional().nullable(),
  applied_at: z.string().optional().nullable(),
  deadline_at: z.string().optional().nullable(),
  follow_up_at: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  contact_name: z.string().optional().nullable(),
  contact_email: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type CreateArtemisApplication = z.infer<typeof createArtemisApplicationSchema>;

export const updateArtemisApplicationSchema = z.object({
  status: artemisApplicationStatusSchema.optional(),
  priority: artemisPrioritySchema.optional(),
  fit_score: z.number().int().min(0).max(100).optional().nullable(),
  applied_at: z.string().optional().nullable(),
  deadline_at: z.string().optional().nullable(),
  follow_up_at: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  contact_name: z.string().optional().nullable(),
  contact_email: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type UpdateArtemisApplication = z.infer<typeof updateArtemisApplicationSchema>;

export const createArtemisArtifactSchema = z.object({
  artifact_type: artemisArtifactTypeSchema,
  document_id: z.number().int().positive().optional().nullable(),
  media_asset_id: z.number().int().positive().optional().nullable(),
  label: z.string().optional().nullable(),
  sent_at: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type CreateArtemisArtifact = z.infer<typeof createArtemisArtifactSchema>;

export const createArtemisCommunicationSchema = z.object({
  company_id: z.number().int().positive().optional().nullable(),
  position_id: z.number().int().positive().optional().nullable(),
  channel: artemisCommunicationChannelSchema.default("note"),
  direction: artemisCommunicationDirectionSchema.default("internal_note"),
  contact_name: z.string().optional().nullable(),
  contact_email: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  raw_text: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  occurred_at: z.string().optional().nullable(),
  next_action: z.string().optional().nullable(),
  next_action_due_at: z.string().optional().nullable(),
});

export type CreateArtemisCommunication = z.infer<typeof createArtemisCommunicationSchema>;

export const artemisExtractJobPostingSchema = z.object({
  text: z.string().min(20, "Paste the job post text to extract"),
  source_url: z.string().optional().nullable(),
});

export const artemisExtractCommunicationSchema = z.object({
  text: z.string().min(5, "Paste the communication text to extract"),
  channel: artemisCommunicationChannelSchema.optional(),
});

export const artemisCompanyPatchSchema = z.object({
  name: z.string().min(1).optional(),
  website: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  size: z.string().optional().nullable(),
  headquarters: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  linkedin_url: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export const artemisPositionPatchSchema = z.object({
  title: z.string().min(1).optional(),
  department: z.string().optional().nullable(),
  employment_type: z.string().optional().nullable(),
  seniority: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  work_mode: artemisWorkModeSchema.optional(),
  source_url: z.string().optional().nullable(),
  source_platform: z.string().optional().nullable(),
  salary_min: z.number().int().optional().nullable(),
  salary_max: z.number().int().optional().nullable(),
  salary_currency: z.string().optional().nullable(),
  benefits: z.array(z.string()).optional(),
  responsibilities: z.array(z.string()).optional(),
  requirements: z.array(z.string()).optional(),
  nice_to_have: z.array(z.string()).optional(),
  raw_posting_text: z.string().optional().nullable(),
  extracted_data: z.record(z.string(), z.unknown()).optional(),
});

export const artemisTaskDraftSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  due_at: z.string().optional().nullable(),
});

export const artemisArtifactSearchDraftSchema = z.object({
  artifact_type: artemisArtifactTypeSchema,
  query: z.string().min(1),
  reason: z.string().optional().nullable(),
});

export const artemisChatProposalSchema = z.object({
  summary: z.string().optional().nullable(),
  application_patch: updateArtemisApplicationSchema.optional().nullable(),
  company_patch: artemisCompanyPatchSchema.optional().nullable(),
  position_patch: artemisPositionPatchSchema.optional().nullable(),
  communication: createArtemisCommunicationSchema.optional().nullable(),
  task: artemisTaskDraftSchema.optional().nullable(),
  new_application: createArtemisApplicationSchema.optional().nullable(),
  artifact_searches: z.array(artemisArtifactSearchDraftSchema).default([]),
  questions: z.array(z.string()).default([]),
});

export type ArtemisChatProposal = z.infer<typeof artemisChatProposalSchema>;

export const artemisChatSchema = z.object({
  message: z.string().min(1, "Tell Artemis what changed"),
  application_id: z.number().int().positive().optional().nullable(),
});

export const applyArtemisChatProposalSchema = artemisChatProposalSchema.omit({
  new_application: true,
  artifact_searches: true,
  questions: true,
});

// ============================================================================
// CHAT COMPRESSION SCHEMAS
// ============================================================================

/**
 * Key decision made during the conversation
 */
export const decisionSchema = z.object({
  topic: z
    .string()
    .describe("What the decision was about (e.g., 'Database schema', 'UI component')"),
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
  conversationOverview: z
    .string()
    .describe("2-3 sentence overview of what this conversation was about"),

  // Key topics discussed
  topicsDiscussed: z
    .array(z.string())
    .describe("List of main topics/areas covered in the conversation"),

  // Decisions made
  decisions: z.array(decisionSchema).describe("Important decisions made during the conversation"),

  // Tasks and their status
  tasks: z.array(taskSchema).describe("Tasks identified, worked on, or completed"),

  // Code changes
  codeArtifacts: z.array(codeArtifactSchema).describe("Files created, modified, or deleted"),

  // Technical context
  technicalContext: z.object({
    technologies: z.array(z.string()).describe("Technologies/frameworks being used"),
    patterns: z.array(z.string()).optional().describe("Design patterns or approaches discussed"),
    constraints: z.array(z.string()).optional().describe("Constraints or requirements mentioned"),
  }),

  // User preferences discovered
  userPreferences: z
    .array(z.string())
    .optional()
    .describe("User preferences or style choices discovered during conversation"),

  // Open questions or blockers
  openItems: z
    .array(z.string())
    .optional()
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
  /** Kronus UI snapshot (model, soul, tools, skills, format) — see web/lib/chat-session-snapshot.ts */
  sessionConfig: z.any().optional(),
  /** Hourglass artifact shelf — ArtifactRef[] with uuid + snapshot fields */
  artifactRefs: z.array(z.any()).optional(),
  /** Hourglass chat log — append-only ChatLogEntry[] */
  chatLog: z.array(z.any()).optional(),
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
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with dashes"),
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
  productIds: z.array(z.string()).optional(),
  visible: z.boolean().optional(),
  diagramImage: z.string().optional().nullable(),
  imageFallback: z.string().optional().nullable(),
  caseStudyLevel: z.enum(["full", "compact", "archive"]).optional().nullable(),
  humaneProblem: z.string().optional().nullable(),
  humaneSolution: z.string().optional().nullable(),
  technicalProblem: z.string().optional().nullable(),
  technicalSolution: z.string().optional().nullable(),
  technicalSpecs: z.string().optional().nullable(),
});

export type CreatePortfolioProject = z.infer<typeof createPortfolioProjectSchema>;

/**
 * Update portfolio project
 */
export const updatePortfolioProjectSchema = createPortfolioProjectSchema
  .partial()
  .omit({ id: true });

export type UpdatePortfolioProject = z.infer<typeof updatePortfolioProjectSchema>;

// ============================================================================
// PORTFOLIO PRODUCT SCHEMAS
// ============================================================================

export const portfolioProductQuerySchema = z.object({
  wildcard: z.coerce.boolean().optional(),
});

export type PortfolioProductQueryParams = z.infer<typeof portfolioProductQuerySchema>;

export const createPortfolioProductSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with dashes"),
  title: z.string().min(1, "Title is required"),
  tagline: z.string().min(1, "Tagline is required"),
  humaneDescription: z.string().min(1, "Humane description is required"),
  buyerPain: z.string().min(1, "Buyer pain is required"),
  promise: z.string().min(1, "Promise is required"),
  deliverables: z.array(z.string()).default([]),
  blueprintTitle: z.string().optional().nullable(),
  serviceTiers: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .default([]),
  caseStudyCtaLabel: z.string().optional().nullable(),
  startingPrice: z.string().min(1, "Starting price is required"),
  timeline: z.string().min(1, "Timeline is required"),
  ctaLabel: z.string().min(1, "CTA label is required"),
  accent: z.enum(["gold", "red", "blue"]).default("gold"),
  wildcard: z.boolean().default(false),
  displayOrder: z.number().default(0),
});

export type CreatePortfolioProduct = z.infer<typeof createPortfolioProductSchema>;

export const updatePortfolioProductSchema = createPortfolioProductSchema
  .partial()
  .omit({ id: true });

export type UpdatePortfolioProduct = z.infer<typeof updatePortfolioProductSchema>;

// ============================================================================
// EXPERIENCE SCHEMAS
// ============================================================================

/**
 * Create work experience
 */
export const createExperienceSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with dashes"),
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
export const updateExperienceSchema = createExperienceSchema
  .partial()
  .omit({ id: true })
  .extend({
    dateEnd: z.string().nullable().optional(),
  });

export type UpdateExperience = z.infer<typeof updateExperienceSchema>;

// ============================================================================
// EDUCATION SCHEMAS
// ============================================================================

/**
 * Create education
 */
export const createEducationSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with dashes"),
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

// ============================================================================
// PROMPT MANAGEMENT SCHEMAS
// ============================================================================

/**
 * Query params for listing prompts
 */
export const promptQuerySchema = paginationSchema.extend({
  project_id: z.string().optional(),
  role: z.enum(["system", "user", "assistant", "chat"]).optional(),
  status: z.enum(["active", "draft", "deprecated", "archived"]).optional(),
  search: z.string().optional(),
  latest_only: z.coerce.boolean().default(true),
});

export type PromptQueryParams = z.infer<typeof promptQuerySchema>;

/**
 * Create prompt
 */
export const createPromptSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes")
    .optional(),
  project_id: z.string().optional(),
  content: z.string().min(1, "Content is required"),
  role: z.enum(["system", "user", "assistant", "chat"]).default("system"),
  purpose: z.string().optional(),
  input_schema: z.string().optional(),
  output_schema: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["active", "draft", "deprecated", "archived"]).default("active"),
  tags: z.array(z.string()).default([]),
  language: z.string().default("en"),
});

export type CreatePrompt = z.infer<typeof createPromptSchema>;

/**
 * Update prompt (creates new version)
 */
export const updatePromptSchema = z.object({
  name: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  project_id: z.string().nullable().optional(),
  role: z.enum(["system", "user", "assistant", "chat"]).optional(),
  purpose: z.string().nullable().optional(),
  input_schema: z.string().nullable().optional(),
  output_schema: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).nullable().optional(),
  status: z.enum(["active", "draft", "deprecated", "archived"]).optional(),
  tags: z.array(z.string()).optional(),
  language: z.string().optional(),
  // If true, creates a new version instead of updating in place
  create_version: z.boolean().default(false),
});

export type UpdatePrompt = z.infer<typeof updatePromptSchema>;

/**
 * Slug parameter for prompts
 */
export const promptSlugSchema = z.object({
  slug: z.string().min(1, "Slug is required"),
});

export type PromptSlugParam = z.infer<typeof promptSlugSchema>;

/**
 * Query params for listing prompt projects
 */
export const promptProjectQuerySchema = paginationSchema.extend({
  status: z.enum(["active", "archived", "draft"]).optional(),
  search: z.string().optional(),
});

export type PromptProjectQueryParams = z.infer<typeof promptProjectQuerySchema>;

/**
 * Create prompt project
 */
export const createPromptProjectSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with dashes"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  status: z.enum(["active", "archived", "draft"]).default("active"),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type CreatePromptProject = z.infer<typeof createPromptProjectSchema>;

/**
 * Update prompt project
 */
export const updatePromptProjectSchema = createPromptProjectSchema.partial().omit({ id: true });

export type UpdatePromptProject = z.infer<typeof updatePromptProjectSchema>;
