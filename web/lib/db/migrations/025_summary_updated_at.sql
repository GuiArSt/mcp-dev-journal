-- Track when AI summaries were last generated vs content updates (staleness control)

ALTER TABLE documents ADD COLUMN summary_updated_at TEXT;
ALTER TABLE portfolio_projects ADD COLUMN summary_updated_at TEXT;
ALTER TABLE skills ADD COLUMN summary_updated_at TEXT;
ALTER TABLE work_experience ADD COLUMN summary_updated_at TEXT;
ALTER TABLE education ADD COLUMN summary_updated_at TEXT;
ALTER TABLE journal_entries ADD COLUMN summary_updated_at TEXT;
ALTER TABLE repository_overviews ADD COLUMN summary_updated_at TEXT;
ALTER TABLE linear_projects ADD COLUMN summary_updated_at TEXT;
ALTER TABLE linear_issues ADD COLUMN summary_updated_at TEXT;
ALTER TABLE slite_notes ADD COLUMN summary_updated_at TEXT;
ALTER TABLE notion_pages ADD COLUMN summary_updated_at TEXT;

-- Muse: default driver + observe to Gemini Flash 3.5
UPDATE muse_config
SET
  provider = 'google',
  driver_model = 'gemini-3.5-flash',
  observe_model = 'gemini-3.5-flash',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1;
