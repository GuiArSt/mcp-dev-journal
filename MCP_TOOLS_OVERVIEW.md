# MCP Tools Overview

This document provides a comprehensive overview of all MCP tools exposed by the Developer Journal MCP Server, organized by category.

## Total Tools: 20

- **Journal Tools**: 13 tools
- **Repository Tools**: 7 tools (via Tartarus API)

---

## 📝 JOURNAL TOOLS (13 tools)

### Core Journal Operations

1. **journal_create_entry**
   - Create a developer journal entry for a git commit
   - Links work to git commits, branches, repositories
   - Kronus (AI) extracts: why, what_changed, decisions, technologies, files_changed

2. **journal_get_entry**
   - Retrieve a journal entry by commit hash
   - Optional: include raw_agent_report (excluded by default for size)

3. **journal_list_by_repository**
   - List journal entries for a repository (paginated)
   - Includes attachment counts
   - Filter by repository, pagination support

4. **journal_list_by_branch**
   - List journal entries for a repository and branch (paginated)
   - Includes attachment counts
   - Filter by repository + branch

5. **journal_list_repositories**
   - List all repositories that have journal entries

6. **journal_list_branches**
   - List all branches in a repository that have journal entries

### Project Summaries (Entry 0)

7. **journal_get_project_summary**
   - Get the high-level summary (Entry 0) for a repository
   - Includes journal entry statistics and Linear integration fields

8. **journal_create_project_summary**
   - Create initial Entry 0 (Living Project Summary) for a repository
   - Synthesized from agent's raw_report + recent journal entries
   - Use when repository has NO Entry 0 yet

9. **journal_submit_summary_report**
   - Update existing Entry 0 with new observations
   - Kronus normalizes chaotic reports into structured sections
   - Use when Entry 0 already exists

10. **journal_list_project_summaries**
    - List project summaries across all repositories (paginated)
    - Includes journal entry stats and Linear integration info

### Attachments & Media

11. **journal_list_attachments**
    - Get attachment metadata for a journal entry by commit hash
    - Returns filenames, descriptions, sizes, types
    - Includes download URLs (if TARTARUS_URL configured)

12. **journal_get_attachment**
    - Retrieve attachment by ID
    - Optional: include base64-encoded file data
    - Use for images, diagrams, PDFs, Mermaid files

13. **journal_list_media_library**
    - Unified media library (merges entry_attachments + media_assets)
    - Filter by repository, commit, destination, MIME type
    - Direct download URLs to bypass MCP truncation limits

---

## 📚 REPOSITORY TOOLS (7 tools)

### Repository Structure Overview

The repository contains multiple distinct parts:

1. **Journal Entries** (git commit-based) - See Journal Tools above
2. **Documents** (writings, prompts, notes) - See below
3. **Skills** (CV/portfolio) - Technical capabilities
4. **Work Experience** (CV) - Job history
5. **Education** (CV) - Academic background
6. **Portfolio Projects** - Showcased deliverables

### Documents Structure

Documents have **TWO levels of categorization**:

- **Primary Type** (required): `writing`, `prompt`, `note`
- **Labels/Tags** (in metadata.tags array): Custom labels like "poems", "prompts", "skills", "manifesto", "essay", "reflection", etc.

**Example**: A document with `type="writing"` might have `metadata.tags=["poem", "philosophy"]`

### Document Tools

14. **repository_search_documents**
    - **SEARCH TOOL** - Search and query documents from the repository
    - Filter by type (writing/prompt/note) AND search by keywords in title/content
    - Pagination control (limit/offset)
    - Returns: id, slug, type, title, language, excerpt, dates, pagination metadata
    - Documents can appear in multiple categories via `metadata.alsoShownIn`
    - **Note**: For simple direct access, use `repository://document/{slug_or_id}` resource instead

### CV/Portfolio Tools

16. **repository_list_skills**
    - List all skills from CV/portfolio
    - Filter by category (Frontend, Backend, AI/ML, etc.)
    - Returns: name, category, proficiency level (magnitude 1-5), description, tags
    - Grouped by category

17. **repository_list_experience**
    - List work experience history from CV
    - Returns: company, title, dates, location, tagline, achievements
    - Useful for understanding professional background

18. **repository_list_education**
    - List education history from CV
    - Returns: degree, field, institution, dates, tagline, focus areas, achievements
    - Useful for understanding academic background

### Portfolio Projects

19. **repository_list_portfolio_projects**
    - List portfolio projects (shipped work, case studies)
    - Filter by status (shipped/wip/archived) or featured flag
    - Returns: title, category, company, role, technologies, metrics, links
    - **Distinct from journal project_summaries** (these are showcased deliverables)

20. **repository_get_portfolio_project**
    - Get full details of a portfolio project by ID
    - Returns complete project information including description, metrics, links

---

## 🔗 LINEAR TOOLS (7 tools)

*Note: Linear tools are registered separately if Linear integration is configured*

1. **linear_get_viewer** - Get current user info (ID, email, teams, projects)
2. **linear_list_issues** - List issues with filters (assignee, state, team, project, search)
3. **linear_create_issue** - Create a new issue
4. **linear_update_issue** - Update an existing issue
5. **linear_list_projects** - List all projects (filter by team)
6. **linear_create_project** - Create a new project
7. **linear_update_project** - Update an existing project (name, description, content, lead, dates)

---

## 🎯 Key Concepts

### Entry 0 (Living Project Summary)
- A persistent, evolving knowledge base for a project/repository
- Created via `journal_create_project_summary` (initial) or `journal_submit_summary_report` (updates)
- Synthesized from agent reports + journal entries
- Contains structured sections: file_structure, tech_stack, frontend, backend, database_info, etc.

### Document Types vs Labels
- **Type**: Primary categorization (`writing`, `prompt`, `note`)
- **Tags/Labels**: Secondary categorization in `metadata.tags` array (e.g., "poems", "prompts", "skills")
- Documents can have multiple tags
- Use `type` filter for broad categories, `search` for specific labels/content

### Portfolio Projects vs Journal Project Summaries
- **Portfolio Projects**: Showcased deliverables, case studies, shipped work (via repository tools)
- **Journal Project Summaries**: Living documentation of active projects (via journal tools)

### Media Library
- Unified view of attachments (journal entries) + media assets (web app)
- Direct download URLs to bypass MCP truncation limits
- Filter by repository, commit, destination, MIME type

---

## 📋 MCP Resources

- `journal://repositories` - List of all repositories with journal entries
- `journal://summary/{repository}` - Project summary (Entry 0) for a repository

---

## 🔧 Configuration Requirements

- **TARTARUS_URL**: Required for repository tools (documents, skills, experience, education, portfolio)
- **MCP_API_KEY**: Optional, for authenticating MCP server requests to Tartarus API
- **LINEAR_API_KEY**: Required for Linear tools
- **LINEAR_USER_ID**: Optional, for default assignee filtering

---

## 📊 Tool Categories Summary

| Category | Count | Purpose |
|----------|-------|---------|
| Journal Entries | 6 | Create, read, list journal entries linked to git commits |
| Project Summaries | 4 | Manage Entry 0 (Living Project Summary) |
| Attachments/Media | 3 | Handle files attached to journal entries |
| Documents | 2 | Access repository documents (writings, prompts, notes) |
| CV/Portfolio | 4 | Access skills, experience, education, portfolio projects |
| Linear | 7 | Integrate with Linear for project/issue management |

**Total: 27 tools** (20 Journal/Repository + 7 Linear)
