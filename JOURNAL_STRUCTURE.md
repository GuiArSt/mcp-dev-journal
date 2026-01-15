# Journal Database Structure

## Hierarchy

**Repository → Branch → Entry (commit_hash)**

```
Repository (Project)
  └── Branch (Git branch)
      └── Entry (Git commit)
          ├── commit_hash (unique identifier)
          ├── author
          ├── date
          ├── why, what_changed, decisions, technologies
          ├── kronus_wisdom
          ├── raw_agent_report
          └── files_changed (JSON array)
```

## Database Schema

### `journal_entries` Table
- **Primary Key**: `id` (auto-increment)
- **Unique Constraint**: `commit_hash` (one entry per commit)
- **Required Fields**: `repository`, `branch`, `commit_hash`, `author`, `date`
- **Content Fields**: `why`, `what_changed`, `decisions`, `technologies`, `raw_agent_report`
- **Optional Fields**: `kronus_wisdom`, `files_changed` (JSON)

### `project_summaries` Table (Entry 0)
- **Primary Key**: `id`
- **Unique Constraint**: `repository` (one summary per repository)
- Contains: `summary`, `purpose`, `architecture`, `key_decisions`, `technologies`, `status`
- **Living Project Summary fields**: `file_structure`, `tech_stack`, `frontend`, `backend`, `database_info`, `services`, `custom_tooling`, `data_flow`, `patterns`, `commands`, `extended_notes`

### `entry_attachments` Table
- **Primary Key**: `id`
- **Foreign Key**: `commit_hash` → `journal_entries(commit_hash)`
- Contains: `filename`, `mime_type`, `description`, `data` (BLOB), `file_size`

## Current Database State

**Total Repositories**: 6
**Total Branches**: 13
**Total Entries**: 45
**Project Summaries**: 4
**Attachments**: 1

### Repository Breakdown

1. **Developer Journal Workspace**
   - Branches: 1 (main)
   - Entries: 14
   - Date range: 2025-12-02 → 2026-01-14

2. **Hades Protocol**
   - Branches: 1 (main)
   - Entries: 2
   - Date range: 2025-12-28 → 2025-12-29

3. **JobiData**
   - Branches: 3 (industry_classification, local, main)
   - Entries: 16
   - Date range: 2025-11-10 → 2025-12-28

4. **TestRepo**
   - Branches: 1 (main)
   - Entries: 1
   - Date: 2026-01-13

5. **jobilla**
   - Branches: 1 (main)
   - Entries: 1
   - Date: 2026-01-13

6. **jobilla-ad-generation**
   - Branches: 6 (ENG-3381-thank-you-pages, ENG-3438, develop, evals-staging, forecasting-prototype, main)
   - Entries: 11
   - Date range: 2025-10-13 → 2026-01-12

## Key Points

1. **One entry per commit**: `commit_hash` is unique - each git commit can only have one journal entry
2. **Repository-level summaries**: Each repository has one `project_summary` (Entry 0) that evolves over time
3. **Branch organization**: Entries are organized by repository and branch, allowing you to track work across different git branches
4. **Attachments**: Files (images, diagrams, etc.) are linked to entries via `commit_hash`

## Access Patterns

- **Get entry**: `journal://entry/{commit_hash}` resource
- **List entries by repo**: `journal_list_by_repository` tool (with pagination)
- **List entries by branch**: `journal_list_by_branch` tool (with pagination)
- **List branches**: `journal://branches/{repository}` resource
- **List repositories**: `journal://repositories` resource
- **Get project summary**: `journal://summary/{repository}` resource
