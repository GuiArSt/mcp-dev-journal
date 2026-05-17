-- Rename Entry 0 table to Repository overview naming.
-- Tartarus web + MCP run the same logic idempotently via migrateProjectSummariesToRepositoryOverviews() on DB open.
-- Manual one-shot (fails if already renamed): sqlite3 data/journal.db < web/lib/db/migrations/018_rename_project_summaries_to_repository_overviews.sql

ALTER TABLE project_summaries RENAME TO repository_overviews;

UPDATE tartarus_objects
SET source_table = 'repository_overviews'
WHERE source_table = 'project_summaries';
