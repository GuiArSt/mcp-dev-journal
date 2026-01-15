# MCP Server Architecture Refactoring - Changes Summary

## Overview

Refactored MCP server to follow clear separation: **Resources for read-only access, Tools for write/search operations**.

## Changes Made

### 1. Converted Read-Only "Get" Tools to Resources

**Removed Tools:**
- `journal_get_entry` → `journal://entry/{commit_hash}` resource
- `journal_get_project_summary` → `journal://summary/{repository}` resource (already existed)
- `journal_get_attachment` → `journal://attachment/{attachment_id}` resource
- `repository_get_document` → `repository://document/{slug_or_id}` resource
- `repository_get_portfolio_project` → `repository://portfolio-project/{id}` resource

**Rationale**: These are simple read operations - perfect for resources. Resources provide URI-based access, caching, and discoverability.

### 2. Converted Simple List Operations to Resources

**Removed Tools:**
- `journal_list_repositories` → `journal://repositories` resource (already existed)
- `journal_list_branches` → `journal://branches/{repository}` resource
- `journal_list_attachments` → `journal://attachments/{commit_hash}` resource

**Rationale**: Simple list operations with single parameter don't need tool complexity. Resources are cleaner for this.

### 3. Renamed Search Tool for Clarity

**Changed:**
- `repository_list_documents` → `repository_search_documents`

**Why**: This tool has search, filters, and pagination - it's a QUERY tool, not a simple list. The name now reflects its purpose.

**Updated:**
- Tool description emphasizes it's a SEARCH TOOL
- Added `search` and `offset` parameters to web app handlers
- Updated all references across codebase

### 4. Added Pagination to Repository Documents

**Enhanced:**
- `repository_search_documents` now supports `limit` and `offset`
- Returns pagination metadata: `total_documents`, `showing`, `has_more`
- Matches pattern used in journal tools for consistency

**API Response Structure:**
```json
{
  "documents": [...],
  "total": 100,
  "limit": 50,
  "offset": 0,
  "has_more": true
}
```

### 5. Optimized Resources for Heavy Base64 Data

**Attachment Resource (`journal://attachment/{attachment_id}`):**
- **Images**: Blocks base64 inclusion (too large for MCP)
- **Large files (>100KB)**: Preview only (max 10KB)
- **Small text files**: Full data if `include_data=true`
- **Always provides**: `download_url` for fetching via HTTP

**Document Resource (`repository://document/{slug_or_id}`):**
- Warns if content >100KB (might contain embedded base64)
- Still returns full content (text-based, should be fine)

**Rationale**: Base64-encoded images can be 100KB+ which exceeds MCP limits (~10 KiB). Resources should provide download URLs instead.

### 6. Added New Resources

**Journal Resources:**
- `journal://entry/{commit_hash}` - Get entry (optional `?include_raw_report=true`)
- `journal://attachment/{attachment_id}` - Get attachment (blocks base64 for images)
- `journal://branches/{repository}` - List branches
- `journal://attachments/{commit_hash}` - List attachments for entry

**Repository Resources:**
- `repository://document/{slug_or_id}` - Get document
- `repository://documents/{type}` - List by type (with `list` function)
- `repository://portfolio-project/{id}` - Get portfolio project

## Final Architecture

### Tools (12 total)

**Write Operations (3):**
1. `journal_create_entry` - Create journal entry
2. `journal_create_project_summary` - Create Entry 0
3. `journal_submit_summary_report` - Update Entry 0

**Query/Search Operations (9):**
4. `journal_list_by_repository` - List entries (pagination + include_raw_report)
5. `journal_list_by_branch` - List entries by branch (pagination + include_raw_report)
6. `journal_list_project_summaries` - List summaries (pagination)
7. `journal_list_media_library` - Unified media library (multiple filters + pagination)
8. `repository_search_documents` - Search documents (search + type + pagination)
9. `repository_list_skills` - List skills
10. `repository_list_experience` - List experience
11. `repository_list_education` - List education
12. `repository_list_portfolio_projects` - List portfolio projects

### Resources (10 total)

**Journal Resources (7):**
1. `journal://repositories` - List all repositories
2. `journal://summary/{repository}` - Get Entry 0
3. `journal://entry/{commit_hash}` - Get entry
4. `journal://attachment/{attachment_id}` - Get attachment metadata
5. `journal://branches/{repository}` - List branches
6. `journal://attachments/{commit_hash}` - List attachments
7. `journal://entry/{commit_hash}` - Get entry (with optional query params)

**Repository Resources (3):**
8. `repository://document/{slug_or_id}` - Get document
9. `repository://documents/{type}` - List documents by type
10. `repository://portfolio-project/{id}` - Get portfolio project

## Key Principles Reinforced

### 1. Resources = Simple Read-Only Access
- Direct URI access (e.g., `journal://entry/abc123`)
- Simple parameters (single ID/slug, maybe query params)
- Good for caching and discoverability
- No complex filtering or pagination

### 2. Tools = Write Operations + Complex Queries
- **Write operations**: Create, update (modify state)
- **Complex queries**: Multiple filters, search, pagination control
- **Options and flags**: include_raw_report, include_data, etc.

### 3. Base64 Protection
- **Images**: Always blocked in resources (use download_url)
- **Large files**: Warned/previewed only
- **Small text files**: Can include base64 if requested
- Prevents MCP size limit issues (~256 lines / 10 KiB)

## Database Structure Confirmed

**Hierarchy: Repository → Branch → Entry (commit_hash)**

- **6 repositories** total
- **13 branches** across all repositories
- **45 entries** total
- **4 project summaries** (Entry 0)
- **1 attachment**

**Structure:**
```
Repository (e.g., "Developer Journal Workspace")
  └── Branch (e.g., "main")
      └── Entry (commit_hash: "abc1234")
          ├── why, what_changed, decisions
          ├── technologies, kronus_wisdom
          └── files_changed: ["src/file1.ts", "lib/utils.ts"]
```

## Files Modified

1. `src/modules/journal/tools.ts` - Removed 7 tools, added 7 resources
2. `src/server.ts` - Updated tool/resource counts (12 tools, 10 resources)
3. `web/app/api/chat/route.ts` - Updated tool definitions
4. `web/components/chat/ChatInterface.tsx` - Updated handlers
5. `web/lib/ai/kronus.ts` - Updated references
6. `web/lib/ai/write-tools.ts` - Updated READ_TOOLS set
7. `MCP_TOOLS_OVERVIEW.md` - Updated documentation

## Testing

To test the MCP server:
1. Ensure `TARTARUS_URL` is set in `.env`
2. Start Tartarus: `cd web && npm run dev`
3. Connect MCP client to: `dist/index.js`
4. Try accessing resources:
   - `journal://repositories`
   - `journal://entry/{commit_hash}`
   - `repository://document/{slug}`
5. Try using tools:
   - `journal_create_entry` (write operation)
   - `repository_search_documents` (search with filters)

## Benefits

1. **Clearer API**: Easy to understand what's a resource vs tool
2. **Better caching**: Resources can be cached by MCP clients
3. **URI-based access**: Direct resource access like web URLs
4. **Performance**: Resources avoid heavy base64 payloads
5. **Consistency**: Same pattern across all read-only operations
