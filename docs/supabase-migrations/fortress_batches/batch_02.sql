-- documents
CREATE TABLE IF NOT EXISTS documents (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('writing', 'prompt', 'note')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      language TEXT DEFAULT 'en',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    , summary TEXT, summary_updated_at TEXT);
-- education
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
    , logo TEXT, summary TEXT, summary_updated_at TEXT);
-- entry_attachments
CREATE TABLE IF NOT EXISTS entry_attachments (
      id BIGSERIAL PRIMARY KEY,
      commit_hash TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data BYTEA,
      file_size INTEGER NOT NULL,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP, description TEXT, summary TEXT
    , object_key TEXT
);
-- hermes_dictionary
CREATE TABLE IF NOT EXISTS hermes_dictionary (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  term TEXT NOT NULL,
  preserve_as TEXT,
  source_language TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- hermes_memories
CREATE TABLE IF NOT EXISTS hermes_memories (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  content TEXT NOT NULL,
  source_language TEXT,
  target_language TEXT,
  tags TEXT DEFAULT '[]',
  frequency INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- hermes_stats
CREATE TABLE IF NOT EXISTS hermes_stats (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  total_translations INTEGER DEFAULT 0,
  total_characters_translated INTEGER DEFAULT 0,
  language_pairs_used TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- hermes_translations
CREATE TABLE IF NOT EXISTS hermes_translations (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  original_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'neutral' CHECK(tone IN ('formal', 'neutral', 'slang')),
  had_changes INTEGER DEFAULT 1,
  clarification_questions TEXT DEFAULT '[]',
  source_context TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- journal_entries
CREATE TABLE IF NOT EXISTS journal_entries (
      id BIGSERIAL PRIMARY KEY,
      commit_hash TEXT UNIQUE NOT NULL,
      repository TEXT NOT NULL,
      branch TEXT NOT NULL,
      author TEXT NOT NULL,
      date TEXT NOT NULL,
      why TEXT NOT NULL,
      what_changed TEXT NOT NULL,
      decisions TEXT NOT NULL,
      technologies TEXT NOT NULL,
      kronus_wisdom TEXT,
      raw_agent_report TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    , code_author TEXT, team_members TEXT DEFAULT '[]', files_changed TEXT, summary TEXT, summary_updated_at TEXT);
-- kronus_context_metrics_cache
CREATE TABLE IF NOT EXISTS kronus_context_metrics_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload_json TEXT NOT NULL,
      computed_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      stale INTEGER NOT NULL DEFAULT 1
    );
-- kronus_context_metrics_meta
CREATE TABLE IF NOT EXISTS kronus_context_metrics_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  stale INTEGER NOT NULL DEFAULT 1,
  computed_at TEXT
);
-- kronus_context_section_metrics
CREATE TABLE IF NOT EXISTS kronus_context_section_metrics (
  section_key TEXT PRIMARY KEY,
  item_count INTEGER NOT NULL DEFAULT 0,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  breakdown_json TEXT NOT NULL DEFAULT '{}',
  computed_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
-- kronus_context_sections
CREATE TABLE IF NOT EXISTS kronus_context_sections (
  section_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'soul',
  soul_config_key TEXT,
  source_tables TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0
);
-- linear_issues
CREATE TABLE IF NOT EXISTS linear_issues (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        url TEXT NOT NULL,
        priority INTEGER,
        state_id TEXT,
        state_name TEXT,
        assignee_id TEXT,
        assignee_name TEXT,
        team_id TEXT,
        team_name TEXT,
        team_key TEXT,
        project_id TEXT,
        project_name TEXT,
        parent_id TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        is_deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      , summary TEXT, summary_updated_at TEXT);
-- linear_project_updates
CREATE TABLE IF NOT EXISTS linear_project_updates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  project_name TEXT,
  body TEXT NOT NULL,
  health TEXT, -- "onTrack" | "atRisk" | "offTrack"
  user_id TEXT,
  user_name TEXT,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- linear_projects
CREATE TABLE IF NOT EXISTS linear_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        content TEXT,
        state TEXT,
        progress DOUBLE PRECISION,
        target_date TEXT,
        start_date TEXT,
        url TEXT NOT NULL,
        lead_id TEXT,
        lead_name TEXT,
        team_ids TEXT DEFAULT '[]',
        member_ids TEXT DEFAULT '[]',
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        is_deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      , summary TEXT, summary_updated_at TEXT);
-- media_assets
CREATE TABLE IF NOT EXISTS media_assets (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data TEXT,
      file_size INTEGER NOT NULL,
      description TEXT,
      prompt TEXT,
      model TEXT,
      tags TEXT DEFAULT '[]',
      destination TEXT NOT NULL CHECK(destination IN ('journal', 'repository', 'media')),
      commit_hash TEXT,
      document_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP, alt TEXT, drive_url TEXT, supabase_url TEXT, portfolio_project_id TEXT NULL, width INTEGER, height INTEGER, label TEXT NULL
    , object_key TEXT
);
-- media_digests
CREATE TABLE IF NOT EXISTS media_digests (
      id BIGSERIAL PRIMARY KEY,
      digest_date TEXT NOT NULL UNIQUE,
      title TEXT,
      summary TEXT,
      commentary TEXT,
      sections TEXT DEFAULT '[]',
      inbox_summary TEXT,
      item_count INTEGER DEFAULT 0,
      model TEXT,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'failed')),
      document_slug TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
-- muse_config
CREATE TABLE IF NOT EXISTS muse_config (
      id                  INTEGER PRIMARY KEY CHECK (id = 1),
      provider            TEXT    NOT NULL DEFAULT 'openai',
      driver_model        TEXT    NOT NULL DEFAULT 'gpt-5.4',
      painter_model       TEXT    NOT NULL DEFAULT 'gpt-image-2',
      observe_model       TEXT    NOT NULL DEFAULT 'gemini-2.5-flash',
      tick_every          INTEGER NOT NULL DEFAULT 3,
      mood_size           TEXT    NOT NULL DEFAULT '1K',
      infographic_size    TEXT    NOT NULL DEFAULT '2K',
      mood_quality        TEXT    NOT NULL DEFAULT 'low',
      infographic_quality TEXT    NOT NULL DEFAULT 'high',
      updated_at          TEXT    NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
-- notion_pages
CREATE TABLE IF NOT EXISTS notion_pages (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        parent_id TEXT,
        parent_type TEXT,
        url TEXT,
        created_by TEXT,
        created_by_name TEXT,
        last_edited_by TEXT,
        last_edited_by_name TEXT,
        icon TEXT,
        cover_url TEXT,
        archived INTEGER DEFAULT 0,
        summary TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        is_deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_edited_at TEXT
      , summary_updated_at TEXT);
-- portfolio_products
CREATE TABLE IF NOT EXISTS portfolio_products (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        tagline TEXT NOT NULL,
        humane_description TEXT NOT NULL,
        buyer_pain TEXT NOT NULL,
        promise TEXT NOT NULL,
        deliverables TEXT DEFAULT '[]',
        starting_price TEXT NOT NULL,
        timeline TEXT NOT NULL,
        cta_label TEXT NOT NULL,
        accent TEXT NOT NULL DEFAULT 'gold' CHECK (accent IN ('gold', 'red', 'blue')),
        wildcard INTEGER DEFAULT 0,
        display_order INTEGER DEFAULT 0,
        summary TEXT,
        summary_updated_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      , blueprint_title TEXT, service_tiers TEXT DEFAULT '[]', case_study_cta_label TEXT);
-- portfolio_projects
CREATE TABLE IF NOT EXISTS portfolio_projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    company TEXT,
    date_completed TEXT,
    status TEXT NOT NULL DEFAULT 'shipped' CHECK (status IN ('shipped', 'wip', 'archived')),
    featured INTEGER DEFAULT 0,
    image TEXT,
    excerpt TEXT,
    description TEXT,
    role TEXT,
    technologies TEXT DEFAULT '[]',
    metrics TEXT DEFAULT '{}',
    links TEXT DEFAULT '{}',
    tags TEXT DEFAULT '[]',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
, summary TEXT, summary_updated_at TEXT, product_ids TEXT DEFAULT '[]', visible INTEGER DEFAULT 1, diagram_image TEXT, image_fallback TEXT, case_study_level TEXT, humane_problem TEXT, humane_solution TEXT, technical_problem TEXT, technical_solution TEXT, technical_specs TEXT);
-- prompt_entry_links
CREATE TABLE IF NOT EXISTS prompt_entry_links (
  id BIGSERIAL PRIMARY KEY,
  prompt_id INTEGER NOT NULL,
  commit_hash TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'reference' CHECK(link_type IN ('reference', 'used_by', 'created_for')),
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(prompt_id, commit_hash, link_type)
);
-- prompt_projects
CREATE TABLE IF NOT EXISTS prompt_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived', 'draft')),
  tags TEXT DEFAULT '[]',
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- prompt_trace_links
CREATE TABLE IF NOT EXISTS prompt_trace_links (
  id BIGSERIAL PRIMARY KEY,
  prompt_id INTEGER NOT NULL,
  trace_id TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  -- Performance metrics (copied from trace for quick access)
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  cost_usd DOUBLE PRECISION,
  status TEXT,
  -- Timestamps
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);