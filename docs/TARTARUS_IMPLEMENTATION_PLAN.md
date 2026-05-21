# Tartarus Implementation Plan

This document fragments the master roadmap into executable engineering work.
It is code-grounded: every workstream names the current source anchors, the
boundary it must respect, and the acceptance checks that prove it is done.

Use this together with `docs/TARTARUS_VISION_AND_ROADMAP.md`:

- Vision document: why the product exists and what order the architecture needs.
- Implementation plan: what to build next, where it lives, and how to verify it.

## 1. Current Code Map

### Product Surfaces

- `src/`
  MCP server, journal tools, Kronus MCP access, registry search/fetch, read-only
  git helpers, and shared observability/model-cost code.
- `web/`
  Main operator UI. Next.js dashboard on port `3005`, Hourglass chat, Muse shelf,
  API routes, SQLite/Drizzle, AI SDK calls, tool execution, observability, and
  conversation persistence.
- `website/`
  Public portfolio/site. Separate app. Uses pnpm already. Do not confuse it with
  the `web/` operator UI.

### Existing Spines

- Conversation persistence:
  - `web/lib/db-conversations.ts`
  - `web/app/api/conversations/`
  - `web/components/chat/hourglass/HourglassChat.tsx`
- Shelf/artifacts:
  - `web/components/chat/hourglass/artifacts/`
  - `web/app/api/chat-hourglass/artifact/[uuid]/route.ts`
  - `web/app/api/chat-hourglass/shelf/add/route.ts`
  - `web/lib/ai/muse-artifact.ts`
- Object registry:
  - `web/lib/object-registry.ts`
  - `web/lib/db/migrations/012_tartarus_objects.sql`
  - `src/modules/journal/db/database.ts`
- Tool execution:
  - `web/lib/ai/tools.ts`
  - `web/lib/ai/tool-executors/index.ts`
  - `web/lib/ai/tool-executors/`
- AI/provider calls:
  - `web/app/api/chat/route.ts`
  - `web/app/api/chat-hourglass/muse/route.ts`
  - `web/app/api/chat-hourglass/muse/edit/route.ts`
  - `web/app/api/chat-hourglass/muse/observe/route.ts`
  - `web/app/api/atropos/`
  - `web/app/api/hermes/`
  - `web/app/api/daimon/polish/route.ts`
  - `web/app/api/kronus/generate/route.ts`
  - `src/modules/journal/ai/`
- Cost/observability:
  - `web/lib/observability.ts`
  - `src/shared/observability.ts`
  - `src/shared/model-costs.ts`
  - `web/app/api/conversations/[id]/cost/route.ts`
  - `web/app/api/conversations/[id]/cost/ledger/route.ts`
  - `web/components/chat/hourglass/CostMeter.tsx`
- Supabase/deploy:
  - `web/lib/supabase/server.ts`
  - `web/lib/supabase/client.ts`
  - `web/app/api/storage/route.ts`
  - `web/scripts/sync-db.ts`
  - `web/scripts/sync-to-supabase.js`
  - `docs/supabase-schema.sql`
  - `docs/supabase-migrations/`
  - `web/next.config.ts`

## 2. Engineering Rules

- Protect current dirty work. Do not revert unrelated local changes.
- Keep each ticket narrow enough to validate independently.
- Prefer adapter/scaffold work before migrating routes.
- Add UI affordances only when the underlying state is real or clearly marked
  as local/session-only.
- Do not add social publishing, CMS publishing, or fine-tuning until approval,
  provider, and deployment boundaries are reliable.
- Every ticket must state validation:
  - TypeScript: `cd web && npm run typecheck -- --pretty false`
  - UI changes: verify in `http://localhost:3005` when an authenticated session
    is available.
  - MCP/root changes: `npm run build` at the repo root where relevant.

## 3. Completed Pre-Roadmap Fixes

These landed before the larger architecture work because they reduced immediate
UX/cost risk.

### VISION-001: Reduce Shelf Image Vision Payloads

Status: implemented.

Files:

- `web/components/chat/hourglass/HourglassChat.tsx`
- `web/lib/image-compression.ts`

What changed:

- Kronus text context remains metadata-only for shelf images.
- Muse vision context now receives a reduced preview for the currently displayed
  shelf image instead of the original full image.
- Current reducer target:
  - max edge `1024px`
  - target bytes around `350KB`
  - quality starts at `0.78`

Follow-up:

- Add explicit telemetry for original size vs reduced size.
- Store reusable vision thumbnails/previews for generated media.

### COST-001: Per-Chat Cost Ledger

Status: implemented.

Files:

- `web/app/api/conversations/[id]/cost/ledger/route.ts`
- `web/components/chat/hourglass/CostMeter.tsx`
- `web/app/globals.css`

What changed:

- Clicking the topbar cost pill opens a cost ledger.
- Ledger reads from `ai_traces`, so it cannot drift from the cost meter source.
- Shows category totals and chronological line items:
  - Kronus replies
  - Muse images
  - Muse decisions
  - Muse thoughts
  - summaries
  - other AI/tool-backed calls

Follow-up:

- Add provider/model pricing table view in settings.
- Add filters by source/model/status.
- Add per-day and per-provider totals on the monitor page.

### HISTORY-001: Chat History Rail Cleanup

Status: implemented.

Files:

- `web/components/chat/hourglass/Rail.tsx`
- `web/components/chat/hourglass/HourglassChat.tsx`
- `web/app/globals.css`

What changed:

- History rail now means other saved conversations only.
- Removed the confusing `this chat` vs `history` split.
- Current conversation is filtered out.
- Rail and cost ledger backgrounds are solid enough to avoid bleed-through.

Follow-up:

- Add search/filter in history rail.
- Add delete/archive only after approval guardrail work.

## 4. Immediate Workstream: Hourglass Autonomy and Controls

This workstream finishes the current UI surface before larger infrastructure
changes.

### MUSE-STATE-001: Persist Muse Autonomy State

Problem:

- Muse visual cadence is hardcoded in `HourglassChat.tsx`.
- `muse_config.tickEvery` exists in DB but the client does not use it.
- Reload does not immediately trigger Muse, which is good, but the countdown is
  session-relative and not visible.
- Cheap observe ticks and visual proposal ticks can drift because one uses
  absolute modulo while the other uses the mounted session baseline.

Files:

- `web/components/chat/hourglass/HourglassChat.tsx`
- `web/components/chat/hourglass/Composer.tsx`
- `web/lib/ai/prompt-store.ts`
- `web/lib/db-conversations.ts`
- new helper if needed: `web/lib/muse-autonomy.ts`

Implementation:

- Add per-conversation Muse state to `session_config` first. Avoid schema churn
  until the shape settles.
- State shape:
  - `mode`: `off | thoughts | visuals`
  - `tickEvery`
  - `lastObservedTurn`
  - `lastProposalTurn`
  - `snoozedUntilTurn`
- Compute countdown from persisted state:
  - `nextVisualIn = tickEvery - ((turns.length - lastProposalTurn) % tickEvery)`
- Use one cadence source for observe and propose decisions.
- Preserve reload safety: restored history must not trigger immediate observe or
  proposal calls.

Acceptance:

- Reloading a chat does not trigger Muse immediately.
- UI can display `watching - 2 turns`, `thoughts only`, `paused`, `deciding`,
  `proposal ready`, or `painting`.
- User can force Muse now.
- User can pause Muse for this chat.
- User can switch between `thoughts only` and `visuals`.
- No duplicate Muse proposal is created when one is already pending.

Validation:

- `cd web && npm run typecheck -- --pretty false`
- Manual browser check:
  - reload with existing turns
  - send one turn
  - verify countdown changes
  - force Muse
  - pause Muse

### MUSE-UI-001: Muse Status Chip

Problem:

- The `visual` button forces Muse, but the user cannot tell whether Muse is
  observing, paused, waiting, or close to proposing.

Files:

- `web/components/chat/hourglass/Composer.tsx`
- `web/components/chat/hourglass/HourglassChat.tsx`
- `web/app/globals.css`

Implementation:

- Add a compact Muse chip near the `visual` button.
- States:
  - `muse - watching - 2 turns`
  - `muse - next turn`
  - `muse - thoughts only`
  - `muse - paused`
  - `muse - deciding`
  - `muse - painting`
  - `muse - proposal ready`
- Chip menu actions:
  - `wake now`
  - `pause this chat`
  - `thoughts only`
  - `visuals on`
  - cadence selector: `2 / 3 / 5 / manual`

Acceptance:

- User knows when Muse is active and when the next automatic visual check will
  happen.
- User can override the automatic behavior without opening settings.
- Chip does not make the composer wider or less usable on mobile.

## 5. Fortress Workstream

This workstream makes agent execution and destructive paths safer.

### FORT-001: Package Manager and Lifecycle Lockdown

Current reality:

- Root and `web/` use npm lockfiles.
- No `.npmrc` lockdown is present.
- `website/` already uses pnpm and is separate.

Files:

- `package.json`
- `package-lock.json`
- `web/package.json`
- `web/package-lock.json`
- `website/package.json`
- new `.npmrc`
- new `web/.npmrc`

Implementation:

- Decide whether root + `web/` migrate to pnpm now.
- Generate pnpm lockfiles.
- Remove npm lockfiles only after installs/builds pass.
- Add `ignore-scripts=true`.
- Document any required native-package lifecycle steps.
- Add a guard script that fails when unexpected lockfiles appear.

Acceptance:

- Fresh install is deterministic.
- Lifecycle scripts are blocked by default.
- Build/typecheck path is documented.

Validation:

- Root: `npm run build` or pnpm equivalent after migration.
- Web: `cd web && npm run typecheck -- --pretty false` or pnpm equivalent.

### APPROVAL-001: Write and Destructive Guardrail Audit

Current reality:

- `web/lib/ai/write-tools.ts` exists.
- Legacy chat has confirmation behavior.
- Hourglass tool execution must be confirmed against the same rules.
- Many API routes expose `DELETE`.

Files:

- `web/lib/ai/write-tools.ts`
- `web/components/chat/ChatInterface.tsx`
- `web/components/chat/hourglass/HourglassChat.tsx`
- `web/app/api/**/route.ts`
- `web/lib/object-registry.ts`

Implementation:

- Inventory all `DELETE` routes.
- Classify:
  - archive preferred
  - soft delete
  - external delete
  - hard delete
- Add reusable API guard helper:
  - `requireManualAction(request)`
  - returns 403 unless `X-Manual-Action: true` or future signed approval exists.
- Ensure Hourglass uses `requiresConfirmation()` before executing write tools.
- Add approval records for future publish/send operations.

Acceptance:

- No write tool silently executes in Hourglass.
- Destructive routes are guarded or explicitly documented as operator-only debt.
- Future social/CMS publishing has a place to store approvals.

Validation:

- Typecheck.
- Manual tool-call test with one read tool and one write tool.

## 6. Agent Operating Manual Workstream

### AGENT-001: Create Canonical Agent Manual

Current reality:

- No root `AGENTS.md`, `agent.md`, `CLAUDE.md`, or `GEMINI.md` exists.
- `.agents/skills/working-with-tartarus/SKILL.md` is the closest current manual.

Files:

- new `AGENTS.md`
- `.agents/skills/working-with-tartarus/SKILL.md`
- `docs/TARTARUS_VISION_AND_ROADMAP.md`
- `docs/TARTARUS_IMPLEMENTATION_PLAN.md`

Implementation:

- Create root `AGENTS.md`.
- Keep it short enough to be read every time.
- Link to the vision and implementation plan.
- Encode:
  - code surfaces
  - validation commands
  - dirty work policy
  - approval invariants
  - AI SDK v6 strictness
  - SQLite canonical truth
  - when to update journal/Entry 0
- Update the Tartarus skill to reference `AGENTS.md`.

Acceptance:

- A fresh coding agent knows where to start.
- It can distinguish `src/`, `web/`, and `website/`.
- It knows which invariants are already true and which are roadmap goals.

## 7. Universal Bus Workstream

Do this after the immediate Hourglass controls and guardrail work.

### BUS-001: Integration Plugin Scaffold

Current reality:

- Tool specs and executors are centralized but manual.
- There is no `IntegrationPlugin` abstraction.

Files:

- `web/lib/ai/tools.ts`
- `web/lib/ai/tool-executors/index.ts`
- `web/lib/ai/tool-executors/`
- new `web/lib/integrations/`

Implementation:

- Define `IntegrationPlugin`.
- Build registry that can return:
  - tool specs
  - executors
  - auth status
  - optional context summary
- Wrap one low-risk integration first:
  - recommended first candidate: `memory` or `search`, not Linear.
- Add tests or a fixture proving current tool names still resolve.

Acceptance:

- Existing tool calls still work.
- One integration is served through the plugin registry.
- Adding a second plugin does not require editing chat orchestration.

### AI-001: AI Provider Registry Scaffold

Current reality:

- AI calls are spread across routes.
- `/api/chat` has manual model config and fallback behavior.
- Muse/Atropos/Hermes/Daimon/Kronus routes call providers directly.
- The product needs model tiers, not one global "best" model. Main Kronus chat
  should stay smart; summaries, indexing, titles, labels, and validation should
  move to cheaper models.

Files:

- `web/app/api/chat/route.ts`
- `web/lib/observability.ts`
- `src/shared/model-costs.ts`
- new `web/lib/integrations/ai/`

Implementation:

- Define `AIProvider`.
- Implement providers:
  - OpenAI
  - Anthropic
  - Google
  - DeepSeek
  - Nebius Token Factory
  - OpenAI-compatible custom endpoint
- Implement provider tiers:
  - `prime`: main Kronus chat, hard reasoning, agentic planning, complex tool
    selection.
  - `standard`: normal hosted usage, Muse production copy, moderate reasoning.
  - `background`: summaries, titles, labels, indexing, classification,
    validation, cheap observers.
  - `search`: Tavily-backed real-time web grounding, exposed as a hosted-safe
    search tool and context provider.
- Initial routing policy:
  - `prime`: DeepSeek V4 Pro where available; OpenAI/Anthropic/Gemini Prime via
    BYOK or system key as fallback.
  - `standard`: Qwen and Gemini.
  - `background`: Qwen/Gemini small or equivalent cheapest reliable model.
  - `search`: Tavily, preferably through Nebius/Tavily integration if the API
    surface is available; otherwise direct Tavily provider.
- Add capability flags:
  - text
  - tools
  - vision
  - image generation
  - structured output
  - reasoning
- Move cost lookup toward provider registry.
- Add an eval harness before declaring defaults:
  - schema adherence
  - tool-call correctness
  - multilingual response quality
  - context-following over long Tartarus chats
  - cost and latency per successful task
- Do not migrate routes until provider tests pass.

Acceptance:

- Provider registry can call primary providers in isolation.
- Router can select by task type.
- Fallback behavior is tested.
- Main Kronus chat can be assigned to `prime` without forcing `prime` for
  summaries/indexing.
- The ledger can explain which tier/provider/model created each cost.

### AI-003: Model Evaluation Harness

Problem:

- Model routing cannot be trusted if choices are based only on provider claims
  or isolated manual impressions.
- The long-term product needs a Jobilla-style measurement loop where new
  features add new tests, agents shape expectations, and model/prompt changes
  are compared repeatedly.

Files:

- new `web/lib/evals/`
- new `web/app/api/evals/`
- `web/lib/observability.ts`
- `web/lib/ai/prompt-store.ts`
- future settings/admin UI

Implementation:

- Define an eval case format:
  - `id`
  - `taskType`
  - `input`
  - `expectedBehavior`
  - `requiredSchema`
  - `allowedTools`
  - `rubric`
  - optional source conversation/artifact UUID
- Define an eval run record:
  - provider/model/tier
  - prompt version
  - tool registry version
  - latency
  - cost
  - schema validity
  - tool-call correctness
  - score
  - human rating when available
- Start with a small fixed suite:
  - Kronus main chat planning
  - tool-call selection
  - structured output validity
  - title generation
  - summary generation
  - Muse decision/proposal
  - search-grounded answer with citations
- Require new major AI features to add or update eval cases before being marked
  stable.
- Use eval results to justify Prime/Standard/Background routing defaults.

Acceptance:

- A candidate model can run against the same Tartarus task suite as another
  model.
- Results include quality, schema validity, tool correctness, latency, and cost.
- Prompt/model promotions have a measured before/after record.
- Accepted/rejected outputs are preserved for future fine-tuning datasets.

### AI-002: Agentic Search Infrastructure

Problem:

- Kronus should not guess when a current or external fact is needed.
- Search must be available in hosted mode without exposing local filesystem MCP
  tools.

Files:

- new `web/lib/integrations/search/`
- new `web/app/api/integrations/search/`
- `web/lib/ai/tools.ts`
- `web/lib/ai/tool-executors/`

Implementation:

- Add a hosted-safe search provider contract.
- Implement Tavily as the first provider.
- Support two adapter modes:
  - Nebius/Tavily when available through the Nebius platform.
  - Direct Tavily API as fallback.
- Expose search through the plugin registry as a tool with explicit trace/cost
  metadata.
- Add a source-pack shape for Kronus:
  - title
  - URL
  - retrieved timestamp
  - excerpt
  - confidence/source type
- Keep raw pages and large payloads out of prompt context unless explicitly
  requested.

Acceptance:

- Kronus can request web grounding through one hosted-safe tool.
- Tool results are cited and traceable.
- Search calls appear in the cost/usage ledger.
- Hosted mode does not expose local filesystem, git write operations, or local
  MCP tools through search.

## 8. Hosted Demo Workstream

This exists because users may need Tartarus through a URL without installing the
repo, especially on locked-down work computers.

### DEPLOY-001: Hosted Demo Mode

Decision:

- Do not treat Vercel serverless as equivalent to local SQLite mode.
- For a full mutable operator UI, prefer serverful hosting with a persistent
  volume first.
- Use Vercel for public CMS/static surfaces or for a hosted mode only after a
  hosted DB adapter exists.

Files:

- `web/next.config.ts`
- `web/lib/db.ts`
- `web/lib/supabase/`
- `web/app/api/storage/route.ts`
- `docs/supabase-schema.sql`
- `docs/supabase-migrations/`

Implementation path:

1. Define deployment modes:
   - local sovereign
   - hosted demo
   - public CMS
   - future multi-user
2. For hosted demo:
   - deploy `web/` as standalone Next app on serverful host
   - persist SQLite on volume
   - protect with auth
   - use sanitized/demo DB
   - set strict cost caps
   - disable destructive external tools by default
3. For public CMS:
   - use Vercel/website path
   - expose only public documents/media
   - use Supabase storage where useful

Acceptance:

- A non-technical tester can access Tartarus through one URL.
- Private local memory is not exposed.
- The hosted demo can be reset from seed data.

## 9. Lineage Workstream

Start after registry/approval boundaries are stable.

### LINEAGE-001: Object Registry Lineage

Current reality:

- `tartarus_objects` and `tartarus_object_history` exist.
- Parent/child lineage does not exist.
- Muse edits currently store `editOfArtifactUuid` in media description JSON.

Files:

- `web/lib/object-registry.ts`
- `web/lib/db/schema.ts`
- `web/lib/db/migrations/`
- `web/lib/ai/muse-artifact.ts`
- `web/app/api/chat-hourglass/artifact/[uuid]/route.ts`

Implementation:

- Add lineage fields or a lineage edge table.
- Add refinement event records.
- Promote `editOfArtifactUuid` out of description JSON.
- Render read-only lineage before adding refinement chat.

Acceptance:

- A child artifact traces to its parent.
- A refinement event explains why the child exists.
- Existing registry fetch/search still works.

## 10. Explicit Non-Goals Until Prerequisites Land

- Do not add LinkedIn/Twitter publishing before approval records exist.
- Do not add BYOK directly into scattered routes before AI provider registry.
- Do not fine-tune Kronus before interaction logs, tool calls, Muse choices, and
  lineage records are clean enough to export.
- Do not promise Vercel-hosted mutable SQLite persistence.
- Do not refactor all integrations at once.

## 11. Next Execution Order

1. `MUSE-STATE-001`
2. `MUSE-UI-001`
3. `AGENT-001`
4. `APPROVAL-001`
5. `FORT-001`
6. `DEPLOY-001`
7. `BUS-001`
8. `AI-001`
9. `AI-002`
10. `AI-003`
11. `LINEAGE-001`

This order keeps the current UI usable, makes agents safer, then opens the
larger architecture work without forcing a rewrite.
