/**
 * Drizzle ORM Schema Definitions
 *
 * Type-safe database schema for the Tartarus system.
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
  // AI-generated 3-sentence summary for Kronus indexing
  summary: text("summary"),
  summaryUpdatedAt: text("summary_updated_at"),
});

/**
 * Repository overview (Entry 0) — canonical technical + narrative memory per `repository`.
 * SQLite table: `repository_overviews` (renamed from legacy `project_summaries`).
 */
export const repositoryOverviews = sqliteTable("repository_overviews", {
  repository: text("repository").primaryKey(),
  gitUrl: text("git_url"),
  summary: text("summary"),
  summaryUpdatedAt: text("summary_updated_at"),
  purpose: text("purpose"),
  architecture: text("architecture"),
  keyDecisions: text("key_decisions"),
  technologies: text("technologies"),
  status: text("status"),
  linearProjectId: text("linear_project_id"),
  linearIssueId: text("linear_issue_id"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
  // Living Project Summary (Entry 0) - Enhanced fields
  fileStructure: text("file_structure"), // Git-style file tree (agent-provided)
  techStack: text("tech_stack"), // Frameworks, libraries, versions (indicative)
  frontend: text("frontend"), // FE patterns, components, state management
  backend: text("backend"), // BE routes, middleware, auth patterns
  databaseInfo: text("database_info"), // Schema, ORM patterns, migrations
  services: text("services"), // External APIs, integrations
  customTooling: text("custom_tooling"), // Project-specific utilities
  dataFlow: text("data_flow"), // How data is processed
  patterns: text("patterns"), // Naming conventions, code style
  commands: text("commands"), // Dev, deploy, make commands
  extendedNotes: text("extended_notes"), // Gotchas, TODOs, historical context
  // Sync tracking
  lastSyncedEntry: text("last_synced_entry"), // Last journal entry hash used for update
  entriesSynced: integer("entries_synced"), // Count of entries analyzed
});

/** @deprecated Use `repositoryOverviews` — alias for gradual TypeScript migration */
export const projectSummaries = repositoryOverviews;

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
  summary: text("summary"), // AI-generated 3-sentence summary for indexing
  summaryUpdatedAt: text("summary_updated_at"),
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
  summary: text("summary"), // AI-generated 3-sentence summary for Kronus indexing
  summaryUpdatedAt: text("summary_updated_at"),
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
  summary: text("summary"), // AI-generated 3-sentence summary for Kronus indexing
  summaryUpdatedAt: text("summary_updated_at"),
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
  summary: text("summary"), // AI-generated 3-sentence summary for Kronus indexing
  summaryUpdatedAt: text("summary_updated_at"),
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
  /** Stable identifier for queryable lookup. Convention for muse paints:
   *  `muse:{renderMode}:turn-{N}:{first-8-of-prompt-hash}`. Other paths
   *  may stamp their own labels (user-upload, etc.). */
  label: text("label"),
  summary: text("summary"), // AI-generated 3-sentence summary for indexing
  // Storage URLs
  driveUrl: text("drive_url"), // Google Drive long-term archival URL
  supabaseUrl: text("supabase_url"), // Supabase Storage CDN URL
  // Relationships
  destination: text("destination", {
    enum: ["journal", "repository", "media", "portfolio"],
  }).notNull(),
  commitHash: text("commit_hash"),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
  portfolioProjectId: text("portfolio_project_id").references(() => portfolioProjects.id, {
    onDelete: "set null",
  }),
  // Metadata
  width: integer("width"), // Image dimensions
  height: integer("height"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

// ============================================================================
// ARTEMIS JOB HUNTER SYSTEM
// ============================================================================

/**
 * Artemis companies - organizations tracked during the job hunt.
 */
export const artemisCompanies = sqliteTable("artemis_companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  website: text("website"),
  industry: text("industry"),
  size: text("size"),
  headquarters: text("headquarters"),
  location: text("location"),
  linkedinUrl: text("linkedin_url"),
  description: text("description"),
  notes: text("notes"),
  tags: text("tags").default("[]"),
  summary: text("summary"),
  summaryUpdatedAt: text("summary_updated_at"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Artemis job positions - role information, reusable across multiple applications.
 */
export const artemisJobPositions = sqliteTable("artemis_job_positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .notNull()
    .references(() => artemisCompanies.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  department: text("department"),
  employmentType: text("employment_type"),
  seniority: text("seniority"),
  location: text("location"),
  workMode: text("work_mode", { enum: ["remote", "hybrid", "onsite", "unknown"] }).default("unknown"),
  sourceUrl: text("source_url"),
  sourcePlatform: text("source_platform"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  salaryCurrency: text("salary_currency"),
  benefits: text("benefits").default("[]"),
  responsibilities: text("responsibilities").default("[]"),
  requirements: text("requirements").default("[]"),
  niceToHave: text("nice_to_have").default("[]"),
  rawPostingText: text("raw_posting_text"),
  extractedData: text("extracted_data").default("{}"),
  summary: text("summary"),
  summaryUpdatedAt: text("summary_updated_at"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Artemis applications - a concrete application attempt for a job position.
 */
export const artemisApplications = sqliteTable("artemis_applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  positionId: integer("position_id")
    .notNull()
    .references(() => artemisJobPositions.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: [
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
    ],
  })
    .notNull()
    .default("saved"),
  priority: text("priority", { enum: ["low", "medium", "high"] }).default("medium"),
  fitScore: integer("fit_score"),
  appliedAt: text("applied_at"),
  deadlineAt: text("deadline_at"),
  followUpAt: text("follow_up_at"),
  lastActivityAt: text("last_activity_at"),
  source: text("source"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  notes: text("notes"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Artemis application artifacts - CVs, letters, portfolio docs, and media sent.
 */
export const artemisApplicationArtifacts = sqliteTable("artemis_application_artifacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id")
    .notNull()
    .references(() => artemisApplications.id, { onDelete: "cascade" }),
  artifactType: text("artifact_type", {
    enum: ["cv", "cover_letter", "portfolio", "case_study", "certificate", "other"],
  }).notNull(),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
  mediaAssetId: integer("media_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  label: text("label"),
  sentAt: text("sent_at"),
  notes: text("notes"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Artemis communications - pasted or manually entered recruiter/application timeline.
 */
export const artemisCommunications = sqliteTable("artemis_communications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id").references(() => artemisApplications.id, { onDelete: "set null" }),
  companyId: integer("company_id").references(() => artemisCompanies.id, { onDelete: "set null" }),
  positionId: integer("position_id").references(() => artemisJobPositions.id, { onDelete: "set null" }),
  channel: text("channel", {
    enum: ["email", "linkedin", "phone", "sms", "video_call", "in_person", "note", "other"],
  })
    .notNull()
    .default("note"),
  direction: text("direction", { enum: ["inbound", "outbound", "internal_note"] })
    .notNull()
    .default("internal_note"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  subject: text("subject"),
  rawText: text("raw_text"),
  summary: text("summary"),
  occurredAt: text("occurred_at").notNull().default("CURRENT_TIMESTAMP"),
  nextAction: text("next_action"),
  nextActionDueAt: text("next_action_due_at"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Artemis tasks - explicit follow-ups and application prep work.
 */
export const artemisTasks = sqliteTable("artemis_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id").references(() => artemisApplications.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  dueAt: text("due_at"),
  status: text("status", { enum: ["open", "done", "dismissed"] })
    .notNull()
    .default("open"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  completedAt: text("completed_at"),
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
  /** JSON: Kronus UI snapshot (model, tools, skills, format) restored when opening the chat */
  sessionConfig: text("session_config"),
  /** JSON: Hourglass artifact shelf — append-only ArtifactRef[] with uuid + snapshot fields */
  artifactRefs: text("artifact_refs").default("[]"),
  /** Hourglass chat log — append-only chronological event stream. JSON ChatLogEntry[]. */
  chatLog: text("chat_log").default("[]"),
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
  tone: text("tone", { enum: ["formal", "neutral", "slang"] })
    .notNull()
    .default("neutral"),
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
 * Distinct from `repository_overviews` (per-repo Entry 0 documentation)
 */
export const portfolioProjects = sqliteTable("portfolio_projects", {
  id: text("id").primaryKey(), // e.g., 'langfuse-refactor'
  title: text("title").notNull(),
  category: text("category").notNull(), // 'AI Software', 'Web Design', 'Data Engineering', etc.
  company: text("company"), // Company or 'Personal Project'
  dateCompleted: text("date_completed"), // YYYY-MM format or null for WIP
  status: text("status", { enum: ["shipped", "wip", "archived"] })
    .notNull()
    .default("shipped"),
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
  summary: text("summary"), // AI-generated 3-sentence summary for Kronus indexing
  summaryUpdatedAt: text("summary_updated_at"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

// ============================================================================
// LINEAR INTEGRATION - Cached Data
// ============================================================================

/**
 * Linear Projects - cached locally for historical preservation
 * Stores full project data from Linear API, preserved even if deleted in Linear
 */
export const linearProjects = sqliteTable("linear_projects", {
  id: text("id").primaryKey(), // Linear project ID
  name: text("name").notNull(),
  description: text("description"), // Plain text description
  content: text("content"), // Rich text content (markdown/Prosemirror)
  state: text("state"), // e.g., "started", "planned", "completed", "canceled"
  progress: real("progress"), // 0.0 to 1.0
  targetDate: text("target_date"), // ISO 8601 date
  startDate: text("start_date"), // ISO 8601 date
  url: text("url").notNull(), // Linear project URL
  leadId: text("lead_id"), // User ID of project lead
  leadName: text("lead_name"), // Name of project lead (cached for context)
  teamIds: text("team_ids").default("[]"), // JSON array of team IDs
  memberIds: text("member_ids").default("[]"), // JSON array of member user IDs
  summary: text("summary"), // AI-generated 3-sentence summary for indexing
  summaryUpdatedAt: text("summary_updated_at"),
  // Metadata
  syncedAt: text("synced_at").default("CURRENT_TIMESTAMP"), // Last sync time
  deletedAt: text("deleted_at"), // If deleted in Linear, when we detected it
  isDeleted: integer("is_deleted", { mode: "boolean" }).default(false), // Soft delete flag
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"), // When we first cached it
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Linear Issues - cached locally for historical preservation
 * Stores full issue data from Linear API, preserved even if deleted in Linear
 */
export const linearIssues = sqliteTable("linear_issues", {
  id: text("id").primaryKey(), // Linear issue ID
  identifier: text("identifier").notNull(), // e.g., "PROJ-123"
  title: text("title").notNull(),
  description: text("description"), // Markdown description
  url: text("url").notNull(), // Linear issue URL
  priority: integer("priority"), // 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low
  stateId: text("state_id"), // Workflow state ID
  stateName: text("state_name"), // Workflow state name (cached for context)
  assigneeId: text("assignee_id"), // User ID of assignee
  assigneeName: text("assignee_name"), // Name of assignee (cached for context)
  teamId: text("team_id"), // Team ID
  teamName: text("team_name"), // Team name (cached for context)
  teamKey: text("team_key"), // Team key (e.g., "PROJ")
  projectId: text("project_id"), // Project ID if linked
  projectName: text("project_name"), // Project name (cached for context)
  parentId: text("parent_id"), // Parent issue ID for sub-issues
  summary: text("summary"), // AI-generated 3-sentence summary for indexing
  summaryUpdatedAt: text("summary_updated_at"),
  // Metadata
  syncedAt: text("synced_at").default("CURRENT_TIMESTAMP"), // Last sync time
  deletedAt: text("deleted_at"), // If deleted in Linear, when we detected it
  isDeleted: integer("is_deleted", { mode: "boolean" }).default(false), // Soft delete flag
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"), // When we first cached it
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Linear Project Updates - status posts on projects
 * Cached locally from Linear API, preserves history
 */
export const linearProjectUpdates = sqliteTable("linear_project_updates", {
  id: text("id").primaryKey(), // Linear project update ID
  projectId: text("project_id").notNull(), // Linear project ID
  projectName: text("project_name"), // Cached project name
  body: text("body").notNull(), // Markdown content of the update
  health: text("health"), // "onTrack" | "atRisk" | "offTrack"
  userId: text("user_id"), // Author user ID
  userName: text("user_name"), // Author name (cached)
  // Metadata
  syncedAt: text("synced_at").default("CURRENT_TIMESTAMP"),
  isDeleted: integer("is_deleted", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"), // When created in Linear
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

// ============================================================================
// SLITE INTEGRATION - Cached Notes
// ============================================================================

/**
 * Slite Notes - cached locally for knowledge base context
 * Synced from Slite REST API, preserved even if deleted in Slite
 */
export const sliteNotes = sqliteTable("slite_notes", {
  id: text("id").primaryKey(), // Slite note ID
  title: text("title").notNull(),
  content: text("content"), // Markdown content
  parentNoteId: text("parent_note_id"), // Parent note ID (hierarchy)
  url: text("url"), // Slite note URL
  ownerId: text("owner_id"), // Author user ID or group ID
  ownerName: text("owner_name"), // Author display name (cached)
  reviewState: text("review_state"), // "Verified" | "Outdated" | "VerificationRequested"
  noteType: text("note_type"), // "rich_text" | "discussion" | "collection"
  summary: text("summary"), // AI-generated 3-sentence summary
  summaryUpdatedAt: text("summary_updated_at"),
  // Metadata
  syncedAt: text("synced_at").default("CURRENT_TIMESTAMP"),
  deletedAt: text("deleted_at"),
  isDeleted: integer("is_deleted", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
  lastEditedAt: text("last_edited_at"), // From Slite API
});

// ============================================================================
// NOTION INTEGRATION - Cached Pages
// ============================================================================

/**
 * Notion Pages - cached locally for knowledge base context
 * Synced from Notion API, preserved even if deleted/archived in Notion
 */
export const notionPages = sqliteTable("notion_pages", {
  id: text("id").primaryKey(), // Notion page ID
  title: text("title").notNull(),
  content: text("content"), // Markdown content (converted from blocks)
  parentId: text("parent_id"), // Parent page or database ID
  parentType: text("parent_type"), // "page_id" | "database_id" | "workspace"
  url: text("url"), // Notion page URL
  createdBy: text("created_by"), // Author user ID
  createdByName: text("created_by_name"), // Author display name (cached)
  lastEditedBy: text("last_edited_by"), // Last editor user ID
  lastEditedByName: text("last_edited_by_name"), // Last editor display name (cached)
  icon: text("icon"), // Emoji or icon URL
  coverUrl: text("cover_url"), // Cover image URL
  archived: integer("archived", { mode: "boolean" }).default(false),
  summary: text("summary"), // AI-generated 3-sentence summary
  summaryUpdatedAt: text("summary_updated_at"),
  // Metadata
  syncedAt: text("synced_at").default("CURRENT_TIMESTAMP"),
  deletedAt: text("deleted_at"),
  isDeleted: integer("is_deleted", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"), // From Notion API
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
  lastEditedAt: text("last_edited_at"), // From Notion API
});

// ============================================================================
// PROMPT MANAGEMENT SYSTEM
// ============================================================================

/**
 * Prompt Projects - groups of related prompts
 * e.g., 'kronus-oracle', 'tartarus-system', 'langfuse-integration'
 */
export const promptProjects = sqliteTable("prompt_projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", { enum: ["active", "archived", "draft"] })
    .notNull()
    .default("active"),
  tags: text("tags").default("[]"),
  metadata: text("metadata").default("{}"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Prompts - first-class prompt entities with versioning
 * Stores prompts in chat format (## System, ## User, ## Assistant)
 */
export const prompts = sqliteTable("prompts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  projectId: text("project_id").references(() => promptProjects.id, { onDelete: "set null" }),
  // Core content
  name: text("name").notNull(),
  content: text("content").notNull(),
  role: text("role", { enum: ["system", "user", "assistant", "chat"] })
    .notNull()
    .default("system"),
  // Prompt metadata
  purpose: text("purpose"),
  inputSchema: text("input_schema"),
  outputSchema: text("output_schema"),
  config: text("config"), // JSON: {model, temperature, max_tokens, ...}
  // Versioning
  version: integer("version").notNull().default(1),
  isLatest: integer("is_latest", { mode: "boolean" }).notNull().default(true),
  parentVersionId: integer("parent_version_id"),
  // Status
  status: text("status", { enum: ["active", "draft", "deprecated", "archived"] })
    .notNull()
    .default("active"),
  // Classification
  tags: text("tags").default("[]"),
  language: text("language").default("en"),
  // AI summary for Kronus indexing
  summary: text("summary"),
  // Legacy document link (for migration)
  legacyDocumentId: integer("legacy_document_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  // Timestamps
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Prompt-Journal Entry Links
 * Connect prompts to journal entries
 */
export const promptEntryLinks = sqliteTable("prompt_entry_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  promptId: integer("prompt_id")
    .notNull()
    .references(() => prompts.id, { onDelete: "cascade" }),
  commitHash: text("commit_hash").notNull(),
  linkType: text("link_type", { enum: ["reference", "used_by", "created_for"] })
    .notNull()
    .default("reference"),
  notes: text("notes"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Prompt-Trace Links
 * Connect prompts to AI traces for observability
 */
export const promptTraceLinks = sqliteTable("prompt_trace_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  promptId: integer("prompt_id")
    .notNull()
    .references(() => prompts.id, { onDelete: "cascade" }),
  traceId: text("trace_id").notNull(),
  promptVersion: integer("prompt_version").notNull(),
  // Performance metrics (copied from trace for quick access)
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  latencyMs: integer("latency_ms"),
  costUsd: real("cost_usd"),
  status: text("status"),
  // Timestamps
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Infer types from schema
export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;

export type RepositoryOverview = typeof repositoryOverviews.$inferSelect;
export type NewRepositoryOverview = typeof repositoryOverviews.$inferInsert;
/** @deprecated Use RepositoryOverview */
export type ProjectSummary = RepositoryOverview;
/** @deprecated Use NewRepositoryOverview */
export type NewProjectSummary = NewRepositoryOverview;

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

export type ArtemisCompany = typeof artemisCompanies.$inferSelect;
export type NewArtemisCompany = typeof artemisCompanies.$inferInsert;

export type ArtemisJobPosition = typeof artemisJobPositions.$inferSelect;
export type NewArtemisJobPosition = typeof artemisJobPositions.$inferInsert;

export type ArtemisApplication = typeof artemisApplications.$inferSelect;
export type NewArtemisApplication = typeof artemisApplications.$inferInsert;

export type ArtemisApplicationArtifact = typeof artemisApplicationArtifacts.$inferSelect;
export type NewArtemisApplicationArtifact = typeof artemisApplicationArtifacts.$inferInsert;

export type ArtemisCommunication = typeof artemisCommunications.$inferSelect;
export type NewArtemisCommunication = typeof artemisCommunications.$inferInsert;

export type ArtemisTask = typeof artemisTasks.$inferSelect;
export type NewArtemisTask = typeof artemisTasks.$inferInsert;

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

export type PromptProject = typeof promptProjects.$inferSelect;
export type NewPromptProject = typeof promptProjects.$inferInsert;

export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;

export type PromptEntryLink = typeof promptEntryLinks.$inferSelect;
export type NewPromptEntryLink = typeof promptEntryLinks.$inferInsert;

export type PromptTraceLink = typeof promptTraceLinks.$inferSelect;
export type NewPromptTraceLink = typeof promptTraceLinks.$inferInsert;

// ============================================================================
// TARTARUS OBJECT REGISTRY
// ============================================================================

/**
 * Universal object index — every entity in the system gets a UUID here.
 * Powers the generic search + fetch tools for Kronus.
 */
export const tartarusObjects = sqliteTable("tartarus_objects", {
  uuid: text("uuid").primaryKey(),
  type: text("type").notNull(),
  sourceTable: text("source_table").notNull(),
  sourceId: text("source_id").notNull(),
  title: text("title"),
  summary: text("summary"),
  tags: text("tags").default("[]"),
  importance: integer("importance").default(0),
  estimatedTokens: integer("estimated_tokens").default(0),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

/**
 * Object version history — append-only snapshots for tracking changes.
 */
export const tartarusObjectHistory = sqliteTable("tartarus_object_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  objectUuid: text("object_uuid").notNull().references(() => tartarusObjects.uuid, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  snapshot: text("snapshot").notNull(),
  changedBy: text("changed_by").default("system"),
  changeSummary: text("change_summary"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

export type TartarusObject = typeof tartarusObjects.$inferSelect;
export type NewTartarusObject = typeof tartarusObjects.$inferInsert;

export type TartarusObjectHistoryEntry = typeof tartarusObjectHistory.$inferSelect;
export type NewTartarusObjectHistoryEntry = typeof tartarusObjectHistory.$inferInsert;

// ============================================================================
// KRONUS CONTEXT METRICS (UI token estimates by soul section label)
// ============================================================================

export const kronusContextSections = sqliteTable("kronus_context_sections", {
  sectionKey: text("section_key").primaryKey(),
  label: text("label").notNull(),
  category: text("category").notNull().default("soul"),
  soulConfigKey: text("soul_config_key"),
  sourceTables: text("source_tables").notNull().default("[]"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const kronusContextSectionMetrics = sqliteTable("kronus_context_section_metrics", {
  sectionKey: text("section_key")
    .primaryKey()
    .references(() => kronusContextSections.sectionKey),
  itemCount: integer("item_count").notNull().default(0),
  tokenEstimate: integer("token_estimate").notNull().default(0),
  breakdownJson: text("breakdown_json").notNull().default("{}"),
  computedAt: text("computed_at").notNull().default("CURRENT_TIMESTAMP"),
});

export const kronusContextMetricsMeta = sqliteTable("kronus_context_metrics_meta", {
  id: integer("id").primaryKey(),
  stale: integer("stale").notNull().default(1),
  computedAt: text("computed_at"),
});

export type KronusContextSection = typeof kronusContextSections.$inferSelect;
export type KronusContextSectionMetric = typeof kronusContextSectionMetrics.$inferSelect;

// ============================================================================
// AI INTEGRATION LIBRARY
// ============================================================================

export const aiIntegrations = sqliteTable("ai_integrations", {
  key: text("key").primaryKey(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull(),
  version: text("version"),
  authStatus: text("auth_status"),
  sourcePaths: text("source_paths").default("[]"),
  configSummary: text("config_summary"),
  metadata: text("metadata").default("{}"),
  lastScannedAt: text("last_scanned_at"),
});

export const aiArtifacts = sqliteTable("ai_artifacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  integrationKey: text("integration_key").notNull(),
  kind: text("kind").notNull(),
  sourcePath: text("source_path").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  content: text("content"),
  metadata: text("metadata").default("{}"),
  contentHash: text("content_hash"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

export const aiLogSessions = sqliteTable("ai_log_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  integrationKey: text("integration_key").notNull(),
  stableId: text("stable_id").notNull(),
  sourcePath: text("source_path").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  startedAt: text("started_at"),
  updatedAt: text("updated_at"),
  messageCount: integer("message_count").default(0),
  metadata: text("metadata").default("{}"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

export const aiLogEvents = sqliteTable("ai_log_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  sequence: integer("sequence").notNull(),
  timestamp: text("timestamp"),
  actor: text("actor").notNull(),
  eventType: text("event_type").notNull(),
  text: text("text").notNull(),
  tooling: text("tooling"),
  params: text("params").default("{}"),
  sourceEventType: text("source_event_type"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

export const aiProposals = sqliteTable("ai_proposals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  integrationKey: text("integration_key").notNull(),
  targetKind: text("target_kind").notNull(),
  targetPath: text("target_path").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  summary: text("summary"),
  status: text("status").default("draft"),
  sourceArtifactId: integer("source_artifact_id"),
  metadata: text("metadata").default("{}"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

export type AiIntegration = typeof aiIntegrations.$inferSelect;
export type NewAiIntegration = typeof aiIntegrations.$inferInsert;
export type AiArtifact = typeof aiArtifacts.$inferSelect;
export type NewAiArtifact = typeof aiArtifacts.$inferInsert;
export type AiLogSession = typeof aiLogSessions.$inferSelect;
export type NewAiLogSession = typeof aiLogSessions.$inferInsert;
export type AiLogEvent = typeof aiLogEvents.$inferSelect;
export type NewAiLogEvent = typeof aiLogEvents.$inferInsert;
export type AiProposal = typeof aiProposals.$inferSelect;
export type NewAiProposal = typeof aiProposals.$inferInsert;
