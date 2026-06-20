# Tartarus Codebase Inventory

**Status:** Phase 1 — structural audit (verified from filesystem + source reads)  
**Rule:** No assumptions. Anything not verified is in **FLAGS**.  
**Last audit:** 2026-06-11  
**Auditor:** Agent session (Cursor) + parallel read-only scans of `src/`, `web/`, `website/`, root

---

## 0. What this repo is (verified)

Tartarus is a **local-first knowledge OS** with three deployable surfaces sharing one SQLite vault (`data/journal.db`):

| Surface | Path | Package | Port | Verified role |
|---------|------|---------|------|---------------|
| **MCP server** | `src/` → `dist/` | `tartarus-workspace` (root npm) | stdio / Docker `:3333` | Journal, registry, Kronus MCP tools, git reads |
| **Operator UI** | `web/` | `web` (npm) | `:3005` / Docker `:3777` | Kronus Hourglass chat, library, integrations, monitor |
| **Public site** | `website/` | `my-v0-project` (pnpm, **git submodule**) | `:3007` | Portfolio, CV, publications, workshop |

**Evidence:** `README.md`, `AGENTS.md`, `.agents/skills/working-with-tartarus/SKILL.md`, `package.json` files, route trees.

**Canonical database:** `data/journal.db` (~270 MB at audit).  
**FLAG:** Root `journal.db` exists but is **0 bytes** — stale/legacy path; code resolves `data/journal.db`.

---

## 1. Scale (file counts, excluding node_modules/.next/dist)

| Area | Files | Notes |
|------|------:|-------|
| `src/` | 25 | Entire MCP server source |
| `web/` | 439 | Next.js operator app |
| `website/` | 277 | Public portfolio submodule |
| `docs/` | 11 | Plans + Supabase SQL |
| `tests/` (root) | 2 | MCP integration + registry |
| `web/tests/` | 11 | Vitest (not counted above) |
| `web/scripts/` | 13 | Maintenance CLIs |
| `data/` | 8+ | SQLite + gmail-triage JSON |
| `cv/` | 5 | Standalone PDF generator |
| `mcp-server/` | 2 | Docker HTTP bridge |
| `config/` | 2 | launchd plists for sync |

**~750+ application source files** across the three apps. A literal line-by-line audit of every file is **Phase 2+** (see §8).

---

## 2. `src/` — MCP server (25 files)

### Entry points (verified)

```
index.ts → UnifiedMCPServer (server.ts)
  → initDatabase(data/journal.db)
  → registerJournalTools()
  → registerKronusTools()
  → registerGitTools()
```

**FLAG:** `registerAppsModule()` in `src/modules/apps/index.ts` is **never called** from `server.ts`. Linear Review MCP Apps tools are **unwired**.

### Module map

| Module | Files | Verified role |
|--------|-------|---------------|
| `config/env.ts` | 1 | Zod env → `UnifiedConfig` |
| `shared/*` | 7 | Logger, errors, observability DB, model costs, project root, journal-kronus-context |
| `modules/journal/` | 6 | **~5.6k-line** `tools.ts`: 29 MCP tools, 32 resources, 5 prompts; DB; AI generators |
| `modules/kronus/` | 5 | `kronus_ask`, `kronus_history`, `kronus_stats`; agent over SQLite summaries |
| `modules/git/` | 1 | Read-only `git_read` |
| `modules/apps/` | 4 | MCP ext-apps Linear sync UI — **orphan at startup** |

### MCP surface (verified counts)

| Type | Count | Notes |
|------|------:|-------|
| Tools (wired) | 32–33 | +`kronus_ask` only if AI keys present |
| Resources | 32 | journal, linear, slite, notion, repository, registry, CV |
| Prompts | 5 | `create-entry`, `update-summary`, `explore-repo`, `journal-visual`, `tartarus` |
| Kronus resources | 3 | `observability://chats|traces|stats` |

### `src/` FLAGS (no assumptions)

| ID | Flag | Evidence |
|----|------|----------|
| S1 | **Apps module unwired** | `registerAppsModule` only defined, not imported in `server.ts` |
| S2 | **Stale logs in journal/tools.ts** | Logs say "10 tools", "3 prompts"; actual 29 tools, 5 prompts |
| S3 | **Broken prompt ref** | `explore-repo` mentions `journal_list_branches` — no such tool |
| S4 | **Dead exports (src-only grep)** | `regenerateJournalEntry`, `closeDatabase`, `closeObservabilityDb` |
| S5 | **Doc drift** | `kronus/types.ts` mentions `web/data/tartarus.db`; live path is `data/journal.db` |
| S6 | **Port drift** | `env.ts` example `TARTARUS_URL` port 3001; code defaults 3005 |
| S7 | **Duplicate model costs** | `shared/model-costs.ts` vs inline `web/lib/observability.ts` — not shared import |
| S8 | **Cross-boundary import** | `web/app/api/kronus/generate/route.ts` imports `src/shared/journal-kronus-context.ts` |
| S9 | **UNREAD at line level** | `journal/types.ts`, `journal/db/database.ts` (large); inventory from exports only |
| S10 | **Root package deps unused in src** | `drizzle-orm`, `dotenv` in root `package.json` — no imports under `src/` |

### HTTP dependencies on `web/` (when `TARTARUS_URL` set)

Repository writes, media upload, screenshots, muse image gen, AI summarize — see `src/modules/journal/tools.ts` `fetchTartarus*` calls. **Verified list in agent audit S-HTTP** (§2 appendix).

---

## 3. `web/` — Operator dashboard (439 files)

### Routes (verified)

- **28** dashboard pages under `app/(dashboard)/`
- **137** API routes under `app/api/`
- `/` redirects to `/chat` (Hourglass is primary chat)

### Chat duality (verified)

| UI | Route | Component | API |
|----|-------|-----------|-----|
| **Hourglass (primary)** | `/chat` | `HourglassChat` | `POST /api/chat` + muse/shelf routes |
| **Legacy** | `/legacy-chat` | `ChatInterface` (always mounted in layout, hidden) | Same `POST /api/chat` |
| Redirect | `/chat-hourglass` → `/chat` | | |

### Database (verified)

- **Engine:** `better-sqlite3` → `data/journal.db`
- **Drizzle:** 39 tables in `lib/db/schema.ts`
- **Raw SQL:** still used for conversations, observability, Slack vault, control panel, memlog
- **26 migration files** in `lib/db/migrations/` — **no single migration runner**; applied ad hoc from multiple lib modules

**FLAGS:**

| ID | Flag | Evidence |
|----|------|----------|
| W1 | **Dual DB access** | Drizzle + raw `getDatabase()` on same file |
| W2 | **Parallel schema defs** | `lib/db-schema.ts` vs `lib/db/schema.ts` |
| W3 | **Tables not in Drizzle** | `ai_traces`, `ai_prompt_versions`, `muse_config`, `slack_*`, `client_memlog` |
| W4 | **Two prompt systems** | `/api/prompts` (library) vs `/api/control-panel` (runtime AI prompts) |
| W5 | **Deprecated API aliases** | `/api/project-summaries` → `repository-overviews` |
| W6 | **Deprecated routes** | `/repository/*` redirects to `/library/*` |

### Orphan components (import grep — UNVERIFIED for dynamic import)

| File | Evidence |
|------|----------|
| `components/backfill/BackfillAll.tsx` | Zero imports |
| `components/backfill/SummaryButton.tsx` | Zero imports |
| `components/db/DatabaseOperations.tsx` | Zero imports |
| `components/chat/KronusModes.tsx` | Zero imports |
| `components/chat/hourglass/ProposalPicker.tsx` | Zero imports (comment ref in HourglassChat only) |
| `components/chat/hourglass/ProposalCard.tsx` | Zero imports |
| `lib/supabase/client.ts` | Zero imports in `web/` |

### Key `lib/` domains (verified)

| Domain | Path | Role |
|--------|------|------|
| Kronus AI | `lib/ai/*` | Prompts, tools, skills, muse, kronus-lite, model-catalog |
| Tool execution | `lib/ai/tool-executors/*` | Client-side tool runners per integration |
| Context metrics | `lib/kronus-*` | Soul section token estimates |
| Integrations | `lib/linear`, `notion`, `slite`, `slack`, `google` | Sync + API clients |
| Registry | `lib/object-registry.ts` | UUID index over `tartarus_objects` |
| Observability | `lib/observability.ts` | `ai_traces`, cost meter |
| Auth | `lib/auth.ts`, `lib/mcp-auth.ts` | Dashboard + MCP attachment auth |

### API route index

Full **137-route table** with methods and verified purposes: see agent audit (stored in session; next phase: split into `docs/API_INVENTORY.md`).

---

## 4. `website/` — Public portfolio (277 files, submodule)

| Field | Value |
|-------|-------|
| Remote | `https://github.com/GuiArSt/guillermo-portfolio.git` |
| Package name | `my-v0-project` (v0 scaffold — not renamed) |
| PM | pnpm |
| DB | Reads `data/journal.db` via copied `lib/db/schema.ts` from `web/` |

**Schema sync:** `scripts/sync-website-schema.sh` (root) copies `web/lib/db/schema.ts` → `website/lib/db/schema.ts`.

### FLAGS

| ID | Flag | Evidence |
|----|------|----------|
| WS1 | **Makefile uses npm for website** | Root `Makefile` `dev-website` runs `npm run dev`; lockfile is pnpm |
| WS2 | **README omits website** | Root `README.md` has zero `website/` mentions |
| WS3 | **Admin routes missing** | `middleware.ts` guards `/admin` but no `app/admin/` |
| WS4 | **`lib/tartarus.ts` stub** | Contains TODO; integration status unknown |
| WS5 | **INIT.md stale refs** | Mentions files not present in tree |
| WS6 | **Submodule sync state** | UNVERIFIED vs remote `main` |

---

## 5. Root & adjacent (not the three apps)

| Path | Verified role | Flags |
|------|---------------|-------|
| `Soul.xml` | Kronus soul prompt (loaded by MCP + web) | `Soul.xml.local` also present (190KB) — relationship UNVERIFIED |
| `docker-compose.yml` | Web + MCP HTTP; mounts `./data` | Website not in compose |
| `Makefile` | Orchestrates web + website dev, schema sync | npm/pnpm inconsistency (WS1) |
| `cv/` | Standalone Puppeteer PDF | Not wired in Makefile |
| `design_handoff_kronus_hourglass/` | Apr 2025 HTML reference | Historical; UNVERIFIED if still authoritative |
| `journal_backup.sql` | SQL dump | Backup artifact |
| `mcp-server/http-server.js` | HTTP MCP bridge | UNREAD at line level |

### Agent / skills duplication

| Location | Contents |
|----------|----------|
| `.agents/skills/` | `working-with-tartarus`, journal workflow, journal-visual, agentic-management, emil-design, release, skill-creator |
| `.claude/skills/` | Overlap + `tartarus-journal-mcp` (not in `.agents`) |
| `.agents/toolkits/skill-creator/` | Full Python toolkit |

**FLAG:** Which path each agent runtime loads — **UNVERIFIED**.

---

## 6. Data vault (`data/`)

```
data/journal.db          # ACTIVE (~270 MB)
data/journal.db-wal/shm
data/journal.db.pre-registry
data/observability.db
data/gmail-triage/*.json # Triage metadata (not read)
```

---

## 7. Documentation map (`docs/`)

| File | Status |
|------|--------|
| `TARTARUS_VISION_AND_ROADMAP.md` | Product vision — appears current |
| `TARTARUS_IMPLEMENTATION_PLAN.md` | Code-grounded tickets — modified in git |
| `MCP_JOURNAL_READ_PROPOSAL.md` | Draft May 2026 |
| `agent-memory-bridge.md` | Maps to `web/lib/ai-integrations.ts` |
| `cursor-kronus-delegation.md` | Maps to cursor delegate code |
| `research/SECURITY_BACKUP_OBSERVABILITY.md` | Research — implementation extent UNVERIFIED |
| `supabase-*.sql` | Postgres mirror schema — canonical vault is SQLite |
| `CODEBASE_INVENTORY.md` | **This file** |

---

## 8. Audit phases (how we build proper ownership)

### Phase 1 — DONE (this document)

- Surface map, entry points, counts, verified roles
- FLAGS register for chimera symptoms (orphans, dual patterns, doc drift)

### Phase 2 — Per-module deep read (next)

| Track | Scope | Output |
|-------|-------|--------|
| **2A** | `src/modules/journal/tools.ts` + `database.ts` | Tool/resource line map, dead code |
| **2B** | `web/lib/ai/*` + `tool-executors/*` | Tool spec ↔ executor ↔ API wiring |
| **2C** | `web/lib/db/*` + migrations | Single schema truth doc; migration runner design |
| **2D** | `web/app/api/**` | `docs/API_INVENTORY.md` with auth + DB touch per route |
| **2E** | Orphan sweep | knip/tsc + manual confirm each FLAG component |

### Phase 3 — Ownership matrix

For each module: **owner** (human/agent), **status** (active / legacy / delete candidate), **tests**, **last journal entry**.

### Phase 4 — Consolidation candidates (FLAGS only — no action until approved)

- Wire or delete `src/modules/apps/`
- Merge dual chat UI or formally deprecate legacy
- Single migration runner
- Single model-cost source
- Rename `website` package; fix Makefile pnpm
- Transparent `muse.png` asset

---

## 9. Master FLAGS register (cross-cutting)

| ID | Severity | Issue | Surfaces |
|----|----------|-------|----------|
| X1 | HIGH | No centralized DB migration runner | web |
| X2 | HIGH | Drizzle + raw SQL dual access | web |
| X3 | MEDIUM | MCP apps module unwired | src |
| X4 | MEDIUM | Two chat UIs share one API | web |
| X5 | MEDIUM | Two prompt systems | web |
| X6 | MEDIUM | Model costs duplicated | src + web |
| X7 | LOW | Orphan UI components (7 files) | web |
| X8 | LOW | Root `journal.db` empty file | root |
| X9 | LOW | README incomplete (no website) | docs |
| X10 | LOW | Stale MCP registration logs | src |

---

## 10. How to extend this inventory

When auditing a file:

1. Read it. If purpose clear → add row to module table with **evidence** (export, import, route).
2. If unclear → add to FLAGS with what was checked.
3. Never infer from filename alone.
4. Update `Last audit` date and journal entry when committing.

**Commands for Phase 2:**

```bash
# API route list
find web/app/api -name route.ts | sort

# Import orphans (candidate)
# requires knip or manual rg — not run in Phase 1

# MCP tool names
rg 'registerTool|server\.tool' src/modules -l
```

---

*This is a living document. Phase 1 is structural truth + flags. Line-level ownership is Phase 2.*
