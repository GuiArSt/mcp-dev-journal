/**
 * Database schema definitions and migrations for Repository feature
 */

import { getDatabase } from "./db";

export interface Document {
  id: number;
  slug: string;
  type: "writing" | "prompt" | "note";
  title: string;
  content: string;
  language: string;
  metadata: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  magnitude: number; // 1-5
  description: string;
  icon?: string;
  color?: string;
  url?: string;
  tags: string; // JSON array as string
  firstUsed?: string;
  lastUsed?: string;
}

export interface SkillCategory {
  id: string;
  name: string;
  color: string; // Tailwind color name like "violet", "pink", "blue"
  icon: string; // Lucide icon name like "cpu", "palette", "database"
  sortOrder: number;
}

export interface DocumentType {
  id: string;
  name: string;
  description: string;
  color: string; // Tailwind color name
  icon: string; // Lucide icon name
  sortOrder: number;
}

export interface WorkExperience {
  id: string;
  title: string;
  company: string;
  department?: string;
  location: string;
  dateStart: string;
  dateEnd: string | null;
  tagline: string;
  note?: string;
  achievements: string; // JSON array as string
  logo?: string; // base64 or URL for company logo
}

export interface Education {
  id: string;
  degree: string;
  field: string;
  institution: string;
  location: string;
  dateStart: string;
  dateEnd: string;
  tagline: string;
  note?: string;
  focusAreas: string; // JSON array as string
  achievements: string; // JSON array as string
  logo?: string; // base64 or URL for institution logo
}

export interface MediaAsset {
  id: number;
  filename: string;
  mime_type: string;
  data: string; // base64 encoded
  file_size: number;
  description?: string;
  prompt?: string; // original generation prompt
  model?: string; // model used for generation
  tags: string; // JSON array as string
  // Linking
  destination: "journal" | "repository" | "media";
  commit_hash?: string; // if linked to journal entry
  document_id?: number; // if linked to repository document
  created_at: string;
  updated_at: string;
}

/**
 * Initialize Repository tables if they don't exist
 */
export function initRepositorySchema() {
  const db = getDatabase();

  // Documents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('writing', 'prompt', 'note')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      language TEXT DEFAULT 'en',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
    CREATE INDEX IF NOT EXISTS idx_documents_language ON documents(language);
    CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
  `);

  // Skill Categories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT 'gray',
      icon TEXT NOT NULL DEFAULT 'tag',
      sortOrder INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_skill_categories_sortOrder ON skill_categories(sortOrder);
  `);

  // Seed default categories if table is empty
  const categoryCount = db.prepare("SELECT COUNT(*) as count FROM skill_categories").get() as { count: number };
  if (categoryCount.count === 0) {
    const defaultCategories = [
      { id: "ai-dev", name: "AI & Development", color: "violet", icon: "cpu", sortOrder: 1 },
      { id: "design-creative", name: "Design & Creative Production", color: "pink", icon: "palette", sortOrder: 2 },
      { id: "data-analytics", name: "Data & Analytics", color: "blue", icon: "database", sortOrder: 3 },
      { id: "infra-devops", name: "Infrastructure & DevOps", color: "orange", icon: "server", sortOrder: 4 },
      { id: "writing-comm", name: "Writing & Communication", color: "emerald", icon: "pen-tool", sortOrder: 5 },
      { id: "business-leadership", name: "Business & Leadership", color: "amber", icon: "users", sortOrder: 6 },
    ];
    const insertCategory = db.prepare("INSERT INTO skill_categories (id, name, color, icon, sortOrder) VALUES (?, ?, ?, ?, ?)");
    for (const cat of defaultCategories) {
      insertCategory.run(cat.id, cat.name, cat.color, cat.icon, cat.sortOrder);
    }
  }

  // Document Types table
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT 'emerald',
      icon TEXT NOT NULL DEFAULT 'file-text',
      sortOrder INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_document_types_sortOrder ON document_types(sortOrder);
  `);

  // Seed default document types if table is empty
  const docTypeCount = db.prepare("SELECT COUNT(*) as count FROM document_types").get() as { count: number };
  if (docTypeCount.count === 0) {
    const defaultDocTypes = [
      { id: "manifesto", name: "manifesto", description: "Personal manifestos and philosophical writings", color: "violet", icon: "scroll", sortOrder: 1 },
      { id: "poem", name: "poem", description: "Poetry and verse", color: "pink", icon: "feather", sortOrder: 2 },
      { id: "manifesto-poem", name: "manifesto-poem", description: "Poetic manifestos blending philosophy and verse", color: "indigo", icon: "sparkles", sortOrder: 3 },
      { id: "essay", name: "essay", description: "Long-form analytical writing", color: "emerald", icon: "file-text", sortOrder: 4 },
      { id: "reflection", name: "reflection", description: "Personal reflections and introspection", color: "amber", icon: "lightbulb", sortOrder: 5 },
      { id: "letter", name: "letter", description: "Personal letters and correspondence", color: "rose", icon: "mail", sortOrder: 6 },
      { id: "story", name: "story", description: "Short stories and narratives", color: "blue", icon: "book-open", sortOrder: 7 },
      { id: "system-prompt", name: "system-prompt", description: "AI system prompts and instructions", color: "cyan", icon: "terminal", sortOrder: 8 },
      { id: "agent-prompt", name: "agent-prompt", description: "Agent-specific prompts and configurations", color: "teal", icon: "bot", sortOrder: 9 },
    ];
    const insertDocType = db.prepare("INSERT INTO document_types (id, name, description, color, icon, sortOrder) VALUES (?, ?, ?, ?, ?, ?)");
    for (const dt of defaultDocTypes) {
      insertDocType.run(dt.id, dt.name, dt.description, dt.color, dt.icon, dt.sortOrder);
    }
  }

  // Skills table
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      magnitude INTEGER NOT NULL CHECK(magnitude >= 1 AND magnitude <= 5),
      description TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      url TEXT,
      tags TEXT DEFAULT '[]',
      firstUsed TEXT,
      lastUsed TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
    CREATE INDEX IF NOT EXISTS idx_skills_magnitude ON skills(magnitude);
  `);

  // Work Experience table
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_experience (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      department TEXT,
      location TEXT NOT NULL,
      dateStart TEXT NOT NULL,
      dateEnd TEXT,
      tagline TEXT NOT NULL,
      note TEXT,
      achievements TEXT DEFAULT '[]'
    );
    
    CREATE INDEX IF NOT EXISTS idx_work_experience_dateStart ON work_experience(dateStart);
    CREATE INDEX IF NOT EXISTS idx_work_experience_company ON work_experience(company);
  `);

  // Education table
  db.exec(`
    CREATE TABLE IF NOT EXISTS education (
      id TEXT PRIMARY KEY,
      degree TEXT NOT NULL,
      field TEXT NOT NULL,
      institution TEXT NOT NULL,
      location TEXT NOT NULL,
      dateStart TEXT NOT NULL,
      dateEnd TEXT NOT NULL,
      tagline TEXT NOT NULL,
      note TEXT,
      focusAreas TEXT DEFAULT '[]',
      achievements TEXT DEFAULT '[]'
    );
    
    CREATE INDEX IF NOT EXISTS idx_education_dateStart ON education(dateStart);
    CREATE INDEX IF NOT EXISTS idx_education_institution ON education(institution);
  `);

  // Media Assets table (for generated images, uploaded files)
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      description TEXT,
      prompt TEXT,
      model TEXT,
      tags TEXT DEFAULT '[]',
      destination TEXT NOT NULL CHECK(destination IN ('journal', 'repository', 'media')),
      commit_hash TEXT,
      document_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_media_assets_destination ON media_assets(destination);
    CREATE INDEX IF NOT EXISTS idx_media_assets_commit_hash ON media_assets(commit_hash);
    CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets(created_at);
  `);

  // Conversations table (for Kronus chat history)
  // NOTE: Using chat_conversations for consistency with existing data
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      messages TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at ON chat_conversations(updated_at);
  `);

  // DEPRECATED: atropos_memory table removed
  // Data migrated to normalized tables: atropos_memories, atropos_dictionary, atropos_stats
  // Run: npx tsx scripts/migrate-atropos.ts to migrate and drop legacy table

  // Athena Learning Items table (for spaced repetition and progress tracking)
  db.exec(`
    CREATE TABLE IF NOT EXISTS athena_learning_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default',

      -- Item identification
      type TEXT NOT NULL CHECK(type IN ('flashcard', 'quiz_question', 'concept')),
      repository TEXT NOT NULL,
      commit_hash TEXT,

      -- Content (JSON structure depends on type)
      content TEXT NOT NULL,

      -- FSRS spaced repetition fields
      difficulty REAL DEFAULT 0,
      stability REAL DEFAULT 0,
      retrievability REAL DEFAULT 1,
      last_review TEXT,
      next_review TEXT,
      review_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,

      -- Metadata
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_athena_items_user_repo ON athena_learning_items(user_id, repository);
    CREATE INDEX IF NOT EXISTS idx_athena_items_next_review ON athena_learning_items(next_review);
    CREATE INDEX IF NOT EXISTS idx_athena_items_type ON athena_learning_items(type);
  `);

  // Athena Learning Sessions table (track quiz/lesson sessions)
  db.exec(`
    CREATE TABLE IF NOT EXISTS athena_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT DEFAULT 'default',

      -- Session info
      repository TEXT NOT NULL,
      session_type TEXT NOT NULL CHECK(session_type IN ('lesson', 'quiz', 'review')),

      -- Generated content (JSON)
      content TEXT NOT NULL,

      -- Results (for quizzes)
      score INTEGER,
      total_questions INTEGER,
      answers TEXT, -- JSON array of user answers

      -- Timing
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_athena_sessions_user ON athena_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_athena_sessions_repo ON athena_sessions(repository);
  `);

  // Run migrations for new columns
  migrateLogoColumns(db);
}

/**
 * Add logo columns to work_experience and education tables
 */
function migrateLogoColumns(db: ReturnType<typeof getDatabase>) {
  // Add logo column to work_experience
  try {
    db.exec(`ALTER TABLE work_experience ADD COLUMN logo TEXT;`);
    console.log("Added logo column to work_experience table");
  } catch (error: any) {
    if (!error.message?.includes("duplicate column")) {
      // Column already exists, that's fine
    }
  }

  // Add logo column to education
  try {
    db.exec(`ALTER TABLE education ADD COLUMN logo TEXT;`);
    console.log("Added logo column to education table");
  } catch (error: any) {
    if (!error.message?.includes("duplicate column")) {
      // Column already exists, that's fine
    }
  }
}

// DEPRECATED: WritingMemory and TypoPattern interfaces removed - use AtroposMemoryRow instead

export interface AtroposMemoryRow {
  id: number;
  user_id: string;
  custom_dictionary: string; // JSON array
  memories: string; // JSON array of {content, tags[], createdAt}
  total_checks: number;
  total_corrections: number;
  created_at: string;
  updated_at: string;
}
