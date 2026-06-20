-- Artemis Job Hunter module
-- Tracks companies, job positions, applications, sent artifacts, communications, and tasks.

CREATE TABLE IF NOT EXISTS artemis_companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  size TEXT,
  headquarters TEXT,
  location TEXT,
  linkedin_url TEXT,
  description TEXT,
  notes TEXT,
  tags TEXT DEFAULT '[]',
  summary TEXT,
  summary_updated_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_artemis_companies_name_lower
  ON artemis_companies(lower(name));

CREATE TABLE IF NOT EXISTS artemis_job_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES artemis_companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  department TEXT,
  employment_type TEXT,
  seniority TEXT,
  location TEXT,
  work_mode TEXT DEFAULT 'unknown',
  source_url TEXT,
  source_platform TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT,
  benefits TEXT DEFAULT '[]',
  responsibilities TEXT DEFAULT '[]',
  requirements TEXT DEFAULT '[]',
  nice_to_have TEXT DEFAULT '[]',
  raw_posting_text TEXT,
  extracted_data TEXT DEFAULT '{}',
  summary TEXT,
  summary_updated_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_artemis_positions_company
  ON artemis_job_positions(company_id);
CREATE INDEX IF NOT EXISTS idx_artemis_positions_title
  ON artemis_job_positions(title);

CREATE TABLE IF NOT EXISTS artemis_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id INTEGER NOT NULL REFERENCES artemis_job_positions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'saved',
  priority TEXT DEFAULT 'medium',
  fit_score INTEGER,
  applied_at TEXT,
  deadline_at TEXT,
  follow_up_at TEXT,
  last_activity_at TEXT,
  source TEXT,
  contact_name TEXT,
  contact_email TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_artemis_applications_position
  ON artemis_applications(position_id);
CREATE INDEX IF NOT EXISTS idx_artemis_applications_status
  ON artemis_applications(status);
CREATE INDEX IF NOT EXISTS idx_artemis_applications_follow_up
  ON artemis_applications(follow_up_at);

CREATE TABLE IF NOT EXISTS artemis_application_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES artemis_applications(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL,
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  media_asset_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  label TEXT,
  sent_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  CHECK (document_id IS NOT NULL OR media_asset_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_artemis_artifacts_application
  ON artemis_application_artifacts(application_id);
CREATE INDEX IF NOT EXISTS idx_artemis_artifacts_document
  ON artemis_application_artifacts(document_id);
CREATE INDEX IF NOT EXISTS idx_artemis_artifacts_media
  ON artemis_application_artifacts(media_asset_id);

CREATE TABLE IF NOT EXISTS artemis_communications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER REFERENCES artemis_applications(id) ON DELETE SET NULL,
  company_id INTEGER REFERENCES artemis_companies(id) ON DELETE SET NULL,
  position_id INTEGER REFERENCES artemis_job_positions(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'note',
  direction TEXT NOT NULL DEFAULT 'internal_note',
  contact_name TEXT,
  contact_email TEXT,
  subject TEXT,
  raw_text TEXT,
  summary TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_action TEXT,
  next_action_due_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_artemis_communications_application
  ON artemis_communications(application_id);
CREATE INDEX IF NOT EXISTS idx_artemis_communications_company
  ON artemis_communications(company_id);
CREATE INDEX IF NOT EXISTS idx_artemis_communications_occurred
  ON artemis_communications(occurred_at DESC);

CREATE TABLE IF NOT EXISTS artemis_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER REFERENCES artemis_applications(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_artemis_tasks_application
  ON artemis_tasks(application_id);
CREATE INDEX IF NOT EXISTS idx_artemis_tasks_due
  ON artemis_tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_artemis_tasks_status
  ON artemis_tasks(status);
