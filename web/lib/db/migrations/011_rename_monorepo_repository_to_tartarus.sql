-- Rename legacy monorepo repository label to tartarus-workspace.
-- Idempotent. Core journal tables (always present in shared journal.db).
-- Athena tables (if present) are updated by migrateMonorepoRepositoryNames in web/lib/db.ts and MCP database.ts on DB open.

UPDATE journal_entries SET repository = 'tartarus-workspace' WHERE repository = 'Developer Journal Workspace';
UPDATE journal_entries SET repository = 'tartarus-workspace' WHERE repository = 'developer journal workspace';

UPDATE repository_overviews SET repository = 'tartarus-workspace' WHERE repository = 'Developer Journal Workspace';
UPDATE repository_overviews SET repository = 'tartarus-workspace' WHERE repository = 'developer journal workspace';
