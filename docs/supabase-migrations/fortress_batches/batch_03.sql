-- prompts
CREATE TABLE IF NOT EXISTS prompts (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  project_id TEXT NULL,
  -- Core content
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'system' CHECK(role IN ('system', 'user', 'assistant', 'chat')),
  -- Prompt metadata
  purpose TEXT,
  input_schema TEXT,
  output_schema TEXT,
  config TEXT,
  -- Versioning
  version INTEGER NOT NULL DEFAULT 1,
  is_latest INTEGER NOT NULL DEFAULT 1,
  parent_version_id INTEGER NULL,
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'draft', 'deprecated', 'archived')),
  -- Classification
  tags TEXT DEFAULT '[]',
  language TEXT DEFAULT 'en',
  -- AI summary for Kronus indexing
  summary TEXT,
  -- Legacy document link (for migration)
  legacy_document_id INTEGER,
  -- Timestamps
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- public_media
CREATE TABLE IF NOT EXISTS public_media (
      id BIGSERIAL PRIMARY KEY,
      digest_id INTEGER,
      url TEXT,
      title TEXT NOT NULL,
      snippet TEXT,
      publication TEXT,
      author TEXT,
      topic TEXT,
      topic_label TEXT,
      perspective TEXT DEFAULT 'unknown'
        CHECK (perspective IN ('left', 'right', 'state', 'sensationalist', 'neutral', 'unknown')),
      importance INTEGER DEFAULT 0,
      language TEXT DEFAULT 'en',
      published_at TEXT,
      source_query TEXT,
      provider TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
-- repository_overviews
CREATE TABLE IF NOT EXISTS "repository_overviews" (
          id BIGSERIAL PRIMARY KEY,
          repository TEXT UNIQUE NOT NULL,
          git_url TEXT,
          summary TEXT,
          purpose TEXT,
          architecture TEXT,
          key_decisions TEXT,
          technologies TEXT,
          status TEXT,
          linear_project_id TEXT,
          linear_issue_id TEXT,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        , file_structure TEXT, tech_stack TEXT, frontend TEXT, backend TEXT, database_info TEXT, services TEXT, custom_tooling TEXT, data_flow TEXT, patterns TEXT, commands TEXT, extended_notes TEXT, last_synced_entry TEXT, entries_synced INTEGER, schema_version INTEGER DEFAULT 1, sections_json TEXT, last_scanned_commit TEXT, total_updates INTEGER DEFAULT 0, summary_updated_at TEXT);
-- skill_categories
CREATE TABLE IF NOT EXISTS skill_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT 'gray',
      icon TEXT NOT NULL DEFAULT 'tag',
      sortOrder INTEGER NOT NULL DEFAULT 0
    );
-- skills
CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      magnitude INTEGER NOT NULL CHECK(magnitude >= 1 AND magnitude <= 4),
      description TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      url TEXT,
      tags TEXT DEFAULT '[]',
      firstUsed TEXT,
      lastUsed TEXT
    , summary TEXT, summary_updated_at TEXT);
-- slack_conversation_summary_runs
CREATE TABLE IF NOT EXISTS slack_conversation_summary_runs (
      id BIGSERIAL PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      model TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
-- slack_conversations
CREATE TABLE IF NOT EXISTS slack_conversations (
      id TEXT PRIMARY KEY,
      team_id TEXT,
      name TEXT,
      type TEXT NOT NULL,
      vault_type TEXT NOT NULL,
      is_member INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      is_private INTEGER DEFAULT 0,
      is_im INTEGER DEFAULT 0,
      is_mpim INTEGER DEFAULT 0,
      is_channel INTEGER DEFAULT 0,
      user_id TEXT,
      topic TEXT,
      purpose TEXT,
      num_members INTEGER,
      raw_json TEXT NOT NULL,
      summary TEXT,
      summarized_at TEXT,
      latest_ts TEXT,
      oldest_ts TEXT,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
-- slack_messages
CREATE TABLE IF NOT EXISTS slack_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      ts TEXT NOT NULL,
      user_id TEXT,
      username TEXT,
      bot_id TEXT,
      subtype TEXT,
      text TEXT,
      thread_ts TEXT,
      parent_user_id TEXT,
      reply_count INTEGER,
      is_thread_parent INTEGER DEFAULT 0,
      raw_json TEXT NOT NULL,
      summary TEXT,
      summarized_at TEXT,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
-- slack_sync_state
CREATE TABLE IF NOT EXISTS slack_sync_state (
      scope TEXT PRIMARY KEY,
      cursor TEXT,
      last_synced_ts TEXT,
      stats_json TEXT DEFAULT '{}',
      last_error TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
-- slack_users
CREATE TABLE IF NOT EXISTS slack_users (
      id TEXT PRIMARY KEY,
      team_id TEXT,
      name TEXT,
      real_name TEXT,
      tz TEXT,
      is_bot INTEGER DEFAULT 0,
      deleted INTEGER DEFAULT 0,
      profile_json TEXT DEFAULT '{}',
      raw_json TEXT NOT NULL,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
-- slite_notes
CREATE TABLE IF NOT EXISTS slite_notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        parent_note_id TEXT,
        url TEXT,
        owner_id TEXT,
        owner_name TEXT,
        review_state TEXT,
        note_type TEXT,
        summary TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        is_deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_edited_at TEXT
      , summary_updated_at TEXT);
-- tartarus_object_history
CREATE TABLE IF NOT EXISTS tartarus_object_history (
      id BIGSERIAL PRIMARY KEY,
      object_uuid TEXT NOT NULL,
      version INTEGER NOT NULL,
      snapshot TEXT NOT NULL,
      changed_by TEXT DEFAULT 'system',
      change_summary TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
-- tartarus_objects
CREATE TABLE IF NOT EXISTS tartarus_objects (
      uuid TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      source_table TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT,
      summary TEXT,
      tags TEXT DEFAULT '[]',
      importance INTEGER DEFAULT 0,
      estimated_tokens INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_table, source_id)
    );
-- work_experience
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
    , logo TEXT, summary TEXT, summary_updated_at TEXT);

-- Foreign keys omitted in v1 mirror (SQLite order != Postgres-safe order).
-- Re-add selectively when hosted-lite needs strict referential integrity.-- ai_log_events
-- ALTER_PLACEHOLDERFOREIGN KEY (session_id) REFERENCES ai_log_sessions(id) ON DELETE CASCADE
-- artemis_application_artifacts
-- REFERENCES artemis_applications
-- REFERENCES documents
-- REFERENCES media_assets
-- artemis_applications
-- REFERENCES artemis_job_positions
-- artemis_communications
-- REFERENCES artemis_applications
-- REFERENCES artemis_companies
-- REFERENCES artemis_job_positions
-- artemis_job_positions
-- REFERENCES artemis_companies
-- artemis_tasks
-- REFERENCES artemis_applications
-- entry_attachments
-- ALTER_PLACEHOLDERFOREIGN KEY (commit_hash) REFERENCES journal_entries(commit_hash) ON DELETE CASCADE
-- kronus_context_section_metrics
-- REFERENCES kronus_context_sections
-- media_assets
-- ALTER_PLACEHOLDERFOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET
-- REFERENCES portfolio_projects
-- prompt_entry_links
-- REFERENCES prompts
-- prompt_trace_links
-- REFERENCES prompts
-- prompts
-- REFERENCES prompt_projects
-- REFERENCES prompts
-- public_media
-- REFERENCES media_digests
-- slack_messages
-- ALTER_PLACEHOLDERFOREIGN KEY (conversation_id) REFERENCES slack_conversations(id) ON DELETE CASCADE
-- tartarus_object_history
-- ALTER_PLACEHOLDERFOREIGN KEY (object_uuid) REFERENCES tartarus_objects(uuid) ON DELETE CASCADE