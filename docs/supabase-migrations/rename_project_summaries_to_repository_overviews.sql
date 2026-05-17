-- One-time Postgres migration for existing Supabase projects that still use
-- `project_summaries`. Run in SQL editor (or psql) before sync scripts target
-- `repository_overviews`. Idempotent: no-op if `project_summaries` is already gone.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'project_summaries'
  ) THEN
    ALTER TABLE project_summaries RENAME TO repository_overviews;
  END IF;
END $$;
