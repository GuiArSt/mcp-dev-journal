/**
 * Drizzle ORM Schema Definitions
 *
 * Type-safe database schema for the Developer Journal system.
 * Replaces raw SQL queries with typed queries.
 */

import { sqliteTable, text, integer, real, blob } from "drizzle-orm/sqlite-core";

// ============================================================================
// JOURNAL SYSTEM
// ============================================================================

/**
 * Journal entries - core commit documentation
 */
export const journalEntries = sqliteTable("journal_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  commitHash: text("commit_hash").notNull().unique(),
  repository: text("repository").notNull(),
  branch: text("branch").notNull(),
  author: text("author").notNull(),
  codeAuthor: text("code_author"),
  teamMembers: text("team_members").default("[]"),
  date: text("date").notNull(),
  why: text("why").notNull(),
  whatChanged: text("what_changed").notNull(),
  decisions: text("decisions").notNull(),
  technologies: text("technologies").notNull(),
  kronusWisdom: text("kronus_wisdom"),
  rawAgentReport: text("raw_agent_report").notNull(),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  // File change tracking (JSON array of FileChange objects)
  filesChanged: text("files_changed"),
});

/**
 * Project summaries - high-level repository overviews (Entry 0)
 * Enhanced with Living Project Summary fields for capturing project knowledge
 */
export const projectSummaries = sqliteTable("project_summaries", {
  repository: text("repository").primaryKey(),
  gitUrl: text("git_url"),
  summary: text("summary"),
  purpose: text("purpose"),
  architecture: text("architecture"),
  keyDecisions: text("key_decisions"),
  technologies: text("technologies"),
  status: text("status"),
  linearProjectId: text("linear_project_id"),
  linearIssueId: text("linear_issue_id"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
  // Living Project Summary (Entry 0) - Enhanced fields
  fileStructure: text("file_structure"),       // Git-style file tree (agent-provided)
  techStack: text("tech_stack"),               // Frameworks, libraries, versions (indicative)
  frontend: text("frontend"),                   // FE patterns, components, state management
  backend: text("backend"),                     // BE routes, middleware, auth patterns
  databaseInfo: text("database_info"),         // Schema, ORM patterns, migrations
  services: text("services"),                   // External APIs, integrations
  customTooling: text("custom_tooling"),       // Project-specific utilities
  dataFlow: text("data_flow"),                 // How data is processed
  patterns: text("patterns"),                   // Naming conventions, code style
  commands: text("commands"),                   // Dev, deploy, make commands
  extendedNotes: text("extended_notes"),       // Gotchas, TODOs, historical context
  // Sync tracking
  lastSyncedEntry: text("last_synced_entry"),  // Last journal entry hash used for update
  entriesSynced: integer("entries_synced"),    // Count of entries analyzed
});

/**
 * Entry attachments - files linked to journal entries
 */
export const entryAttachments = sqliteTable("entry_attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  commitHash: text("commit_hash")
    .notNull()
    .references(() => journalEntries.commitHash, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  data: blob("data", { mode: "buffer" }).notNull(),
  description: text("description"),
  fileSize: integer("file_size").notNull(),
  uploadedAt: text("uploaded_at").default("CURRENT_TIMESTAMP"),
});

// ============================================================================
// REPOSITORY SYSTEM
// ============================================================================

/**
 * Documents - writings, prompts, notes
 */
export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  type: text("type", { enum: ["writing", "prompt", "note"] }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  language: text("language").default("en"),
  metadata: text("metadata").default("{}"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Skill categories
 */
export const skillCategories = sqliteTable("skill_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("gray"),
  icon: text("icon").notNull().default("tag"),
  sortOrder: integer("sortOrder").notNull().default(0),
});

/**
 * Document types
 */
export const documentTypes = sqliteTable("document_types", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("emerald"),
  icon: text("icon").notNull().default("file-text"),
  sortOrder: integer("sortOrder").notNull().default(0),
});

/**
 * Skills - CV skill entries
 */
export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  magnitude: integer("magnitude").notNull(), // 1-5
  description: text("description").notNull(),
  icon: text("icon"),
  color: text("color"),
  url: text("url"),
  tags: text("tags").default("[]"),
  firstUsed: text("firstUsed"),
  lastUsed: text("lastUsed"),
});

/**
 * Work experience - CV entries
 */
export const workExperience = sqliteTable("work_experience", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  department: text("department"),
  location: text("location").notNull(),
  dateStart: text("dateStart").notNull(),
  dateEnd: text("dateEnd"),
  tagline: text("tagline").notNull(),
  note: text("note"),
  achievements: text("achievements").default("[]"),
  logo: text("logo"),
});

/**
 * Education - CV entries
 */
export const education = sqliteTable("education", {
  id: text("id").primaryKey(),
  degree: text("degree").notNull(),
  field: text("field").notNull(),
  institution: text("institution").notNull(),
  location: text("location").notNull(),
  dateStart: text("dateStart").notNull(),
  dateEnd: text("dateEnd").notNull(),
  tagline: text("tagline").notNull(),
  note: text("note"),
  focusAreas: text("focusAreas").default("[]"),
  achievements: text("achievements").default("[]"),
  logo: text("logo"),
});

// ============================================================================
// MEDIA SYSTEM
// ============================================================================

/**
 * Media assets - images, files
 *
 * Storage strategy:
 * - `data`: Base64 encoded file for hot/active storage (SQLite/Supabase)
 * - `driveUrl`: Google Drive URL for long-term archival (optional)
 * - `supabaseUrl`: Supabase Storage URL for web-accessible CDN (optional)
 *
 * When both URLs exist, prefer supabaseUrl for display, driveUrl for archival.
 * The `data` field can be cleared once external URLs are populated to save space.
 */
export const mediaAssets = sqliteTable("media_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  data: text("data"), // base64 encoded - nullable for external-only storage
  fileSize: integer("file_size").notNull(),
  description: text("description"),
  alt: text("alt"), // Alt text for accessibility
  prompt: text("prompt"), // AI generation prompt if applicable
  model: text("model"), // AI model used if applicable
  tags: text("tags").default("[]"),
  // Storage URLs
  driveUrl: text("drive_url"), // Google Drive long-term archival URL
  supabaseUrl: text("supabase_url"), // Supabase Storage CDN URL
  // Relationships
  destination: text("destination", { enum: ["journal", "repository", "media", "portfolio"] }).notNull(),
  commitHash: text("commit_hash"),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
  portfolioProjectId: text("portfolio_project_id").references(() => portfolioProjects.id, { onDelete: "set null" }),
  // Metadata
  width: integer("width"), // Image dimensions
  height: integer("height"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

// ============================================================================
// CHAT SYSTEM
// ============================================================================

/**
 * Conversations - Kronus chat history
 *
 * Compression flow:
 * 1. Chat grows large → user clicks "Compress" or auto-trigger at ~180K tokens
 * 2. Haiku 4.5 generates CompressionSummary from messages
 * 3. New conversation created with summary as context
 * 4. Old conversation archived (isCompressed=true)
 */
export const conversations = sqliteTable("chat_conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  messages: text("messages").notNull().default("[]"),
  // Soul config snapshot - what repo sections were included
  soulConfig: text("soul_config").default("{}"),
  // Compression fields
  isCompressed: integer("is_compressed", { mode: "boolean" }).default(false),
  compressionSummary: text("compression_summary"), // JSON: CompressionSummary
  parentConversationId: integer("parent_conversation_id"), // Link to previous if continued
  childConversationId: integer("child_conversation_id"), // Link to continuation
  // Metadata
  messageCount: integer("message_count").default(0),
  estimatedTokens: integer("estimated_tokens").default(0),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

// ============================================================================
// ATROPOS SYSTEM
// ============================================================================

/**
 * Atropos corrections - history of all corrections made
 */
export const atroposCorrections = sqliteTable("atropos_corrections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").default("default").notNull(),
  originalText: text("original_text").notNull(),
  correctedText: text("corrected_text").notNull(),
  hadChanges: integer("had_changes", { mode: "boolean" }).default(false),
  intentQuestions: text("intent_questions").default("[]"), // JSON array
  sourceContext: text("source_context"), // e.g., "document:slug", "chat:123", "standalone"
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Atropos memories - individual writing style learnings (normalized)
 */
export const atroposMemories = sqliteTable("atropos_memories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").default("default").notNull(),
  content: text("content").notNull(),
  tags: text("tags").default("[]"), // JSON array
  frequency: integer("frequency").default(1), // how often this pattern appears
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Atropos dictionary - protected words/terms (normalized)
 */
export const atroposDictionary = sqliteTable("atropos_dictionary", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").default("default").notNull(),
  term: text("term").notNull(),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Atropos user stats - aggregate statistics per user
 */
export const atroposStats = sqliteTable("atropos_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").default("default").notNull(),
  totalChecks: integer("total_checks").default(0),
  totalCorrections: integer("total_corrections").default(0),
  totalCharactersCorrected: integer("total_characters_corrected").default(0),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

// ============================================================================
// HERMES SYSTEM
// ============================================================================

/**
 * Hermes translations - history of all translations made
 */
export const hermesTranslations = sqliteTable("hermes_translations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").default("default").notNull(),
  originalText: text("original_text").notNull(),
  translatedText: text("translated_text").notNull(),
  sourceLanguage: text("source_language").notNull(), // e.g., "en", "es", "de"
  targetLanguage: text("target_language").notNull(),
  tone: text("tone", { enum: ["formal", "neutral", "slang"] }).notNull().default("neutral"),
  hadChanges: integer("had_changes", { mode: "boolean" }).default(true),
  clarificationQuestions: text("clarification_questions").default("[]"), // JSON array
  sourceContext: text("source_context"), // e.g., "document:slug", "chat:123", "standalone"
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Hermes memories - learned translation patterns and preferences
 */
export const hermesMemories = sqliteTable("hermes_memories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").default("default").notNull(),
  content: text("content").notNull(),
  sourceLanguage: text("source_language"), // optional: language-specific memory
  targetLanguage: text("target_language"), // optional: language-specific memory
  tags: text("tags").default("[]"), // JSON array
  frequency: integer("frequency").default(1),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Hermes dictionary - protected terms that should not be translated
 */
export const hermesDictionary = sqliteTable("hermes_dictionary", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").default("default").notNull(),
  term: text("term").notNull(),
  preserveAs: text("preserve_as"), // optional: specific form to use (e.g., brand names)
  sourceLanguage: text("source_language"), // optional: only apply when translating from this language
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Hermes user stats - aggregate translation statistics per user
 */
export const hermesStats = sqliteTable("hermes_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").default("default").notNull(),
  totalTranslations: integer("total_translations").default(0),
  totalCharactersTranslated: integer("total_characters_translated").default(0),
  languagePairsUsed: text("language_pairs_used").default("{}"), // JSON: {"en-es": 5, "de-en": 3}
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

// ============================================================================
// ATHENA SYSTEM
// ============================================================================

/**
 * Athena learning items - flashcards, quiz questions, concepts
 */
export const athenaLearningItems = sqliteTable("athena_learning_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").default("default"),
  type: text("type", { enum: ["flashcard", "quiz_question", "concept"] }).notNull(),
  repository: text("repository").notNull(),
  commitHash: text("commit_hash"),
  content: text("content").notNull(),
  // FSRS spaced repetition fields
  difficulty: real("difficulty").default(0),
  stability: real("stability").default(0),
  retrievability: real("retrievability").default(1),
  lastReview: text("last_review"),
  nextReview: text("next_review"),
  reviewCount: integer("review_count").default(0),
  correctCount: integer("correct_count").default(0),
  tags: text("tags").default("[]"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Athena sessions - lesson/quiz/review sessions
 */
export const athenaSessions = sqliteTable("athena_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").default("default"),
  repository: text("repository").notNull(),
  sessionType: text("session_type", { enum: ["lesson", "quiz", "review"] }).notNull(),
  content: text("content").notNull(),
  score: integer("score"),
  totalQuestions: integer("total_questions"),
  answers: text("answers"),
  startedAt: text("started_at").default("CURRENT_TIMESTAMP"),
  completedAt: text("completed_at"),
});

// ============================================================================
// PORTFOLIO PROJECTS SYSTEM
// ============================================================================

/**
 * Portfolio projects - shipped work, case studies, showcased projects
 * Distinct from project_summaries (which are git repository documentation)
 */
export const portfolioProjects = sqliteTable("portfolio_projects", {
  id: text("id").primaryKey(), // e.g., 'langfuse-refactor'
  title: text("title").notNull(),
  category: text("category").notNull(), // 'AI Software', 'Web Design', 'Data Engineering', etc.
  company: text("company"), // Company or 'Personal Project'
  dateCompleted: text("date_completed"), // YYYY-MM format or null for WIP
  status: text("status", { enum: ["shipped", "wip", "archived"] }).notNull().default("shipped"),
  featured: integer("featured", { mode: "boolean" }).default(false),
  image: text("image"), // Path to project image
  excerpt: text("excerpt"), // Short description for cards
  description: text("description"), // Full description
  role: text("role"), // Your role in the project
  technologies: text("technologies").default("[]"), // JSON array of tech stack
  metrics: text("metrics").default("{}"), // JSON object with measurable outcomes
  links: text("links").default("{}"), // JSON object: { live, github, caseStudy }
  tags: text("tags").default("[]"), // JSON array for filtering
  sortOrder: integer("sort_order").default(0), // Manual ordering
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

// ============================================================================
// LINEAR CONTEXT CACHE
// ============================================================================

/**
 * Cached Linear projects - local mirror of Linear projects assigned to user
 * Synced periodically and used for AI context
 */
export const linearProjects = sqliteTable("linear_projects", {
  id: text("id").primaryKey(), // Linear project ID
  name: text("name").notNull(),
  description: text("description"),
  content: text("content"), // Rich markdown content
  state: text("state"), // 'backlog', 'planned', 'started', 'paused', 'completed', 'canceled'
  progress: real("progress"), // 0-1 completion percentage
  targetDate: text("target_date"),
  startDate: text("start_date"),
  url: text("url").notNull(),
  // Lead/owner info
  leadId: text("lead_id"),
  leadName: text("lead_name"),
  // Sync metadata
  lastSyncedAt: text("last_synced_at").default("CURRENT_TIMESTAMP"),
  // Context inclusion toggles (user can enable/disable per project)
  includeInContext: integer("include_in_context", { mode: "boolean" }).default(true),
});

/**
 * Cached Linear issues - local mirror of Linear issues assigned to user
 * Synced periodically and used for AI context
 */
export const linearIssues = sqliteTable("linear_issues", {
  id: text("id").primaryKey(), // Linear issue ID
  identifier: text("identifier").notNull(), // e.g., 'PROJ-123'
  title: text("title").notNull(),
  description: text("description"),
  priority: integer("priority"), // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  url: text("url").notNull(),
  // State info
  stateId: text("state_id"),
  stateName: text("state_name"),
  stateColor: text("state_color"),
  // Assignee info
  assigneeId: text("assignee_id"),
  assigneeName: text("assignee_name"),
  // Project linkage
  projectId: text("project_id").references(() => linearProjects.id, { onDelete: "set null" }),
  projectName: text("project_name"),
  // Team info
  teamId: text("team_id"),
  teamName: text("team_name"),
  // Sync metadata
  lastSyncedAt: text("last_synced_at").default("CURRENT_TIMESTAMP"),
  // Context inclusion toggles
  includeInContext: integer("include_in_context", { mode: "boolean" }).default(true),
});

/**
 * Linear sync metadata - tracks sync status and settings
 */
export const linearSyncMeta = sqliteTable("linear_sync_meta", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lastFullSync: text("last_full_sync"),
  syncStatus: text("sync_status", { enum: ["idle", "syncing", "error"] }).default("idle"),
  lastError: text("last_error"),
  // Settings
  includeCompleted: integer("include_completed", { mode: "boolean" }).default(false),
  autoSyncEnabled: integer("auto_sync_enabled", { mode: "boolean" }).default(true),
  syncIntervalMinutes: integer("sync_interval_minutes").default(30),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Infer types from schema
export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;

export type ProjectSummary = typeof projectSummaries.$inferSelect;
export type NewProjectSummary = typeof projectSummaries.$inferInsert;

export type EntryAttachment = typeof entryAttachments.$inferSelect;
export type NewEntryAttachment = typeof entryAttachments.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;

export type WorkExperience = typeof workExperience.$inferSelect;
export type NewWorkExperience = typeof workExperience.$inferInsert;

export type Education = typeof education.$inferSelect;
export type NewEducation = typeof education.$inferInsert;

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

// Legacy AtroposMemory type removed - use AtroposMemoryItem, AtroposDictionaryTerm, AtroposUserStats instead

export type AtroposCorrection = typeof atroposCorrections.$inferSelect;
export type NewAtroposCorrection = typeof atroposCorrections.$inferInsert;

export type AtroposMemoryItem = typeof atroposMemories.$inferSelect;
export type NewAtroposMemoryItem = typeof atroposMemories.$inferInsert;

export type AtroposDictionaryTerm = typeof atroposDictionary.$inferSelect;
export type NewAtroposDictionaryTerm = typeof atroposDictionary.$inferInsert;

export type AtroposUserStats = typeof atroposStats.$inferSelect;
export type NewAtroposUserStats = typeof atroposStats.$inferInsert;

export type AthenaLearningItem = typeof athenaLearningItems.$inferSelect;
export type NewAthenaLearningItem = typeof athenaLearningItems.$inferInsert;

export type AthenaSession = typeof athenaSessions.$inferSelect;
export type NewAthenaSession = typeof athenaSessions.$inferInsert;

export type HermesTranslation = typeof hermesTranslations.$inferSelect;
export type NewHermesTranslation = typeof hermesTranslations.$inferInsert;

export type HermesMemoryItem = typeof hermesMemories.$inferSelect;
export type NewHermesMemoryItem = typeof hermesMemories.$inferInsert;

export type HermesDictionaryTerm = typeof hermesDictionary.$inferSelect;
export type NewHermesDictionaryTerm = typeof hermesDictionary.$inferInsert;

export type HermesUserStats = typeof hermesStats.$inferSelect;
export type NewHermesUserStats = typeof hermesStats.$inferInsert;

export type PortfolioProject = typeof portfolioProjects.$inferSelect;
export type NewPortfolioProject = typeof portfolioProjects.$inferInsert;

export type LinearProject = typeof linearProjects.$inferSelect;
export type NewLinearProject = typeof linearProjects.$inferInsert;

export type LinearIssue = typeof linearIssues.$inferSelect;
export type NewLinearIssue = typeof linearIssues.$inferInsert;

export type LinearSyncMeta = typeof linearSyncMeta.$inferSelect;
export type NewLinearSyncMeta = typeof linearSyncMeta.$inferInsert;
