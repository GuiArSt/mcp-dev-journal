-- ============================================
-- TARTARUS - Supabase PostgreSQL Schema
-- ============================================
-- Run this in Supabase SQL Editor (SQL tab in dashboard)
-- This creates all tables needed for the Developer Journal

-- ============================================
-- 1. JOURNAL ENTRIES (core table)
-- ============================================
CREATE TABLE IF NOT EXISTS journal_entries (
  id BIGSERIAL PRIMARY KEY,
  commit_hash TEXT UNIQUE NOT NULL,
  repository TEXT NOT NULL,
  branch TEXT NOT NULL,
  author TEXT NOT NULL,
  code_author TEXT,
  team_members TEXT DEFAULT '[]',
  date TIMESTAMPTZ NOT NULL,
  why TEXT NOT NULL,
  what_changed TEXT NOT NULL,
  decisions TEXT NOT NULL,
  technologies TEXT NOT NULL,
  kronus_wisdom TEXT,
  raw_agent_report TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_journal_entries_repository ON journal_entries(repository);
CREATE INDEX IF NOT EXISTS idx_journal_entries_branch ON journal_entries(repository, branch);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_created ON journal_entries(created_at DESC);

-- ============================================
-- 2. PROJECT SUMMARIES ("Entry 0" per repo)
-- ============================================
CREATE TABLE IF NOT EXISTS project_summaries (
  id BIGSERIAL PRIMARY KEY,
  repository TEXT UNIQUE NOT NULL,
  git_url TEXT NOT NULL,
  summary TEXT NOT NULL,
  purpose TEXT NOT NULL,
  architecture TEXT NOT NULL,
  key_decisions TEXT NOT NULL,
  technologies TEXT NOT NULL,
  status TEXT NOT NULL,
  linear_project_id TEXT,
  linear_issue_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_summaries_repository ON project_summaries(repository);

-- ============================================
-- 3. ENTRY ATTACHMENTS (images, diagrams, PDFs)
-- ============================================
CREATE TABLE IF NOT EXISTS entry_attachments (
  id BIGSERIAL PRIMARY KEY,
  commit_hash TEXT NOT NULL REFERENCES journal_entries(commit_hash) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  description TEXT,
  file_size INTEGER NOT NULL,
  data TEXT NOT NULL, -- base64 encoded
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entry_attachments_commit ON entry_attachments(commit_hash);

-- ============================================
-- 4. DOCUMENTS (writings, prompts, notes)
-- ============================================
CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('writing', 'prompt', 'note')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_slug ON documents(slug);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at DESC);

-- ============================================
-- 5. SKILLS (CV)
-- ============================================
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  magnitude INTEGER NOT NULL CHECK(magnitude >= 1 AND magnitude <= 5),
  description TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  url TEXT,
  tags JSONB DEFAULT '[]',
  first_used DATE,
  last_used DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_magnitude ON skills(magnitude DESC);

-- ============================================
-- 6. WORK EXPERIENCE (CV)
-- ============================================
CREATE TABLE IF NOT EXISTS work_experience (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  department TEXT,
  location TEXT NOT NULL,
  date_start DATE NOT NULL,
  date_end DATE,
  tagline TEXT NOT NULL,
  note TEXT,
  achievements JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_experience_date ON work_experience(date_start DESC);
CREATE INDEX IF NOT EXISTS idx_work_experience_company ON work_experience(company);

-- ============================================
-- 7. EDUCATION (CV)
-- ============================================
CREATE TABLE IF NOT EXISTS education (
  id TEXT PRIMARY KEY,
  degree TEXT NOT NULL,
  field TEXT NOT NULL,
  institution TEXT NOT NULL,
  location TEXT NOT NULL,
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  tagline TEXT NOT NULL,
  note TEXT,
  focus_areas JSONB DEFAULT '[]',
  achievements JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_education_date ON education(date_start DESC);
CREATE INDEX IF NOT EXISTS idx_education_institution ON education(institution);

-- ============================================
-- 8. MEDIA ASSETS (generated images, uploads)
-- ============================================
CREATE TABLE IF NOT EXISTS media_assets (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  data TEXT NOT NULL, -- base64 encoded
  file_size INTEGER NOT NULL,
  description TEXT,
  prompt TEXT, -- AI generation prompt
  model TEXT, -- AI model used
  tags JSONB DEFAULT '[]',
  destination TEXT NOT NULL CHECK(destination IN ('journal', 'repository', 'media')),
  commit_hash TEXT, -- if linked to journal entry
  document_id BIGINT REFERENCES documents(id) ON DELETE SET NULL,
  storage_path TEXT, -- Supabase storage path (if using bucket)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_destination ON media_assets(destination);
CREATE INDEX IF NOT EXISTS idx_media_assets_commit ON media_assets(commit_hash);
CREATE INDEX IF NOT EXISTS idx_media_assets_created ON media_assets(created_at DESC);

-- ============================================
-- 9. CHAT CONVERSATIONS (Kronus history)
-- ============================================
CREATE TABLE IF NOT EXISTS chat_conversations (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON chat_conversations(updated_at DESC);

-- ============================================
-- TRIGGERS: Auto-update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'journal_entries', 'project_summaries', 'documents',
    'skills', 'work_experience', 'education',
    'media_assets', 'chat_conversations'
  ])
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS update_%I_updated_at ON %I;
      CREATE TRIGGER update_%I_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    ', t, t, t, t);
  END LOOP;
END;
$$;

-- ============================================
-- ROW LEVEL SECURITY (optional - enable if needed)
-- ============================================
-- For now, we use service_role key which bypasses RLS
-- Uncomment and configure if you want public access with RLS

-- ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE project_summaries ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
-- etc...

-- ============================================
-- STORAGE BUCKET (run separately or via dashboard)
-- ============================================
-- Go to Storage in Supabase Dashboard and create:
-- Bucket name: journal-images
-- Public: Yes (or No with signed URLs)

-- ============================================
-- DONE!
-- ============================================
-- Tables created:
-- 1. journal_entries (commits)
-- 2. project_summaries (repo overviews)
-- 3. entry_attachments (files linked to entries)
-- 4. documents (writings, prompts)
-- 5. skills (CV)
-- 6. work_experience (CV)
-- 7. education (CV)
-- 8. media_assets (images)
-- 9. chat_conversations (Kronus history)
