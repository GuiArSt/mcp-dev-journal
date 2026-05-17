---
name: working-with-tartarus
description: Use when working in the Tartarus repo, including requests phrased as working with Tartarus, Taratus, or tratus. Covers the current BE, FE, MCP server, web dashboard, public website, commands, code boundaries, UI workflow, MCP memory, registry, Entry 0, and journal conventions.
---

# Working With Tartarus

Use this skill when the user asks to work on Tartarus, Taratus, tratus, Kronus, the MCP server, the Tartarus web app, the public website, or the UI in this repository.

## First read

Start by locating the target surface before editing. Tartarus has three active surfaces that are easy to confuse:

1. `src/`
   The root TypeScript MCP server. It exposes tools, resources, prompts, Kronus MCP access, journal workflows, repository access, registry search/fetch, and read-only git helpers.

2. `web/`
   The main Tartarus dashboard and operator UI. This is the Next.js app on port `3005`, with Kronus chat, Hourglass chat, Reader, Repository, Prompts, Integrations, Multimedia, Atropos, Hermes, Control Panel, API routes, shared SQLite access, AI tracing, and write-tool confirmation flows.

3. `website/`
   The public portfolio/site on port `3007`. It is a separate Next.js app with the portfolio, publications, CV, workshop, i18n, Supabase auth, and public content data.

When the user says "UI" without more detail, assume `web/` first because that is the Tartarus product UI. Check `website/` only if they mention portfolio, public site, publications, CV demo, commission, workshop, or marketing/site pages.

## Context routine

Before making meaningful changes:

1. Run `git status --short` and preserve unrelated dirty work.
2. Read the nearest `README.md`, `package.json`, and relevant `Makefile`.
3. For project memory, prefer targeted MCP context:
   - `kronus_ask` for current architecture/status questions.
   - `journal_list_by_repository({ repository: "tartarus" })` for recent commits.
   - `registry_search_objects` then `registry_fetch_object` when the object type is unknown.
   - `journal://project-summary/tartarus` or `/deep` when available through resources.
4. Trust code over stale docs. If README, MCP memory, and source disagree, inspect the source and state the discrepancy.

## Current architecture

The root README describes Tartarus as a dual-interface platform:

- MCP server plus web app for structured AI-powered journaling, project documentation, and personal knowledge management.
- SQLite is shared by MCP and web. The object registry gives every object a UUID and powers universal search/fetch.
- Entry 0 is the living project summary. Journal entries are commit-scoped records. Repository documents are content objects. Registry is discovery over all of them.
- Kronus is the knowledge oracle. In the web app it uses the AI SDK and tool-calling; in MCP it can be queried through `kronus_ask`.

Important MCP conventions from project memory:

- Read-only data should be resources or query tools with pagination.
- Write operations should go through explicit tool/API flows and should not be hidden behind broad fetch operations.
- Heavy binary/base64 payloads should not be in normal MCP responses; return metadata and download URLs.
- Use registry search/fetch for universal discovery, not as a substitute for domain-specific write flows.

## Common commands

Root MCP server:

```bash
npm install
npm run build
npm test
npm run test:registry
npm run test:mcp
npm run dev
npm run start
```

Main Tartarus web app:

```bash
cd web
npm install --legacy-peer-deps
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test:run
npm run check
```

Public website:

```bash
cd website
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm tsc --noEmit
```

Whole workspace:

```bash
make dev
make check
make build
make clean-website
docker compose up -d --build
```

Use ports:

- `web/`: `http://localhost:3005`
- `website/`: `http://localhost:3007`
- Docker web: `http://localhost:3777`
- Docker MCP bridge: `http://localhost:3333`

## Web UI workflow

For `web/` UI work:

1. Inspect route and component ownership first:
   - pages: `web/app/(dashboard)/**`
   - API routes: `web/app/api/**`
   - layout/nav: `web/components/layout/Sidebar.tsx`, `web/app/(dashboard)/layout.tsx`
   - chat: `web/components/chat/**`
   - Hourglass: `web/app/(dashboard)/chat-hourglass/**`, `web/components/chat/hourglass/**`
   - shared UI primitives: `web/components/ui/**`
   - design tokens/global CSS: `web/app/globals.css`, `web/DESIGN_SYSTEM.md`
2. Follow the existing dark Tartarus design system:
   - background: `--tartarus-void`, `--tartarus-deep`, `--tartarus-surface`
   - primary action: `--tartarus-teal`
   - Kronus/secondary accent: `--tartarus-gold`
   - text: `--tartarus-ivory`, `--tartarus-ivory-dim`, `--tartarus-ivory-muted`
3. Prefer existing shadcn/Radix primitives and `lucide-react` icons.
4. Keep operational screens dense, readable, and built for repeated use. Avoid marketing-page composition inside the dashboard.
5. Add loading, empty, disabled, error, and dirty states when changing workflows.
6. After UI edits, run the narrowest useful checks, start the dev server if needed, and verify in browser/screenshots when practical.

## Public website workflow

For `website/` work:

- Treat it as a separate product from the Tartarus dashboard.
- Use `website/app/**` for pages and `website/components/**` for public components.
- Data flows through JSON/data helpers in `website/data/**`, `website/public/data/**`, and `website/lib/data/**`.
- Use the existing i18n files under `website/locales/**`.
- Use `pnpm`, not npm, unless the existing file you are touching clearly uses npm-specific tooling.

## MCP and backend workflow

For root `src/` MCP work:

- Entry point: `src/index.ts`
- HTTP/server support: `src/server.ts`
- config/env: `src/config/env.ts`
- journal tools and database access: `src/modules/journal/**`
- Kronus tools/agent: `src/modules/kronus/**`
- git helpers: `src/modules/git/tools.ts`
- shared logger, errors, observability, model costs: `src/shared/**`

For web backend/API work:

- API routes live in `web/app/api/**/route.ts`.
- Shared DB code lives in `web/lib/db.ts`, `web/lib/db/schema.ts`, `web/lib/db/drizzle.ts`, and `web/lib/db-conversations.ts`.
- AI integrations live in `web/lib/ai/**`.
- Tool execution lives in `web/lib/ai/tool-executors/**`.
- Observability lives in `web/lib/observability.ts` and `/api/observability`.

When adding or changing a data shape, check both the API route and the UI consumer. If the shape is persisted, check the SQLite schema/migration and object registry hooks.

## Journal and memory

After meaningful code changes, document the work in Tartarus memory when requested or when the repo workflow calls for it:

- Use `journal_create_entry` for a commit-scoped change.
- Use `journal_update_project_technical` when architecture, commands, stack, schema, or file structure changed.
- Use `journal_submit_summary_report` when status, purpose, high-level direction, or narrative context changed.
- Use `journal-visual` for screenshots or generated visuals when documenting UI/API/schema work.

Keep these concepts separate:

- journal entry: what changed in a commit
- Entry 0: current project state
- repository document: durable note/prompt/writing/CV/portfolio content
- registry: universal index for finding and fetching objects

## Working rules

- Preserve dirty work that already exists.
- Use `rg` and targeted file reads before broad scans.
- Use `apply_patch` for manual file edits.
- Avoid changing both `web/` and `website/` unless the request clearly spans both.
- Do not silently add new dependencies; prefer existing Radix/shadcn/lucide/AI SDK/Drizzle patterns.
- For frontend changes, verify that text fits, states are implemented, and layout works at desktop and mobile widths.
- For MCP changes, run `npm run build` and the relevant MCP/registry tests when practical.
- For `web/`, run `npm run typecheck` or `npm run check` depending on blast radius.
- For `website/`, run `pnpm tsc --noEmit` and `pnpm build` for broad page/layout changes.

