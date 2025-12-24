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
