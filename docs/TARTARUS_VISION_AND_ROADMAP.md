# The Tartarus Codex: Vision and Procedural Roadmap

This document is the authoritative roadmap for Tartarus. It consolidates the
current product vision, the feature map from planning sessions, and the
architectural sequencing rules for future agents.

It is not a sprint plan. It has no dates. The sequence matters more than speed.

Companion document:

- `docs/TARTARUS_IMPLEMENTATION_PLAN.md` fragments this roadmap into
  code-grounded tickets, source anchors, dependencies, and acceptance checks.

## 1. Core Vision

Tartarus is an Agentic Context Management System.

It is the Eternal Library: a sovereign SQLite vault that captures a
professional's digital context - code, decisions, writings, artifacts,
communications, work history, and operational memory - and lets AI agents act on
that context through explicit tools and human approval gates.

Tartarus began as a developer journal and knowledge repository. Its long-term
shape is broader: an agentic workspace where one database, one context layer,
and one orchestrator can manage work across code, documents, integrations,
publishing, and refinement workflows.

## 2. Philosophical Pillars

### Sovereignty

The user owns the database. Tartarus does not rent the user's professional
memory to a vendor-owned walled garden. External services can mirror, publish,
or enrich context, but SQLite remains the canonical vault.

### Relief

Tartarus unifies disconnected work systems - Git, Linear, Slite, Notion, Google
Workspace, media, chat history, and future social channels - under one
administrative layer. It exists to reduce busywork, duplication, and forgotten
context.

### Transcendence

Human context becomes structured machine-readable memory. The agent does not
guess; it reads the library, acts through tools, refines artifacts, and records
what changed. Mundane work is automated so thought can become sharper.

## 3. Current Reality

The repo already contains the foundation of this vision:

- `src/` is the MCP server and local agent interface.
- `web/` is the Next.js operator UI.
- SQLite is the canonical data layer.
- Drizzle schema exists for core web data.
- `tartarus_objects` already gives objects stable UUIDs and registry metadata.
- `tartarus_object_history` already exists for snapshots and version history.
- Hourglass is now the main chat surface at `/chat`.
- The Muse shelf, image generation, chat log, and conversation memory are real.
- Tool confirmation exists through `web/lib/ai/write-tools.ts` and UI approval
  flows, but enforcement is not yet universal.
- AI providers are still scattered across routes and modules.
- Integrations are still hardcoded by domain rather than registered through a
  plugin bus.
- Package management is still npm-based in the current repo state; pnpm
  hardening has not landed yet.
- Supabase and Vercel integration points exist, but online deployment is not
  yet treated as a first-class deployment track in the roadmap.

This means the immediate roadmap is not "add more surface area." It is:
secure the foundation, unify the bus, then expand.

## 4. Code Reality Audit

This section tests the vision against the current repository. It should be
updated whenever a phase lands.

### Package and Supply Chain

Current state:

- Root and `web/` are still npm-based.
- `package-lock.json` and `web/package-lock.json` exist.
- No root `.npmrc` or `web/.npmrc` is currently enforcing
  `ignore-scripts=true`.
- No `pnpm-lock.yaml` exists in the active root or `web/` package.
- `website/` already uses pnpm separately and should not be confused with the
  operator UI migration.

Reality check:

Phase 1 is not a documentation task. It is a real migration. The repo must
choose pnpm at the root and `web/` level, generate lockfiles, remove npm
lockfiles, and document any lifecycle scripts that must be manually approved.

Source anchors:

- `package.json`
- `package-lock.json`
- `web/package.json`
- `web/package-lock.json`
- `website/package.json`

### Database and Persistence

Current state:

- SQLite is already the canonical local store.
- WAL mode is enabled in the web DB helpers and MCP journal database code.
- Drizzle schema exists for the web database.
- `tartarus_objects` and `tartarus_object_history` already provide stable UUIDs
  and snapshots.
- Object lineage fields such as `parent_uuid`, `lineage_depth`, and
  `lineage_root_uuid` do not exist yet.

Reality check:

The Lineage Engine should extend the existing object registry instead of
inventing a parallel artifact table. The registry is already the right spine;
it just lacks parent/child semantics and refinement event records.

Source anchors:

- `web/lib/db.ts`
- `web/lib/db/drizzle.ts`
- `web/lib/db/schema.ts`
- `web/lib/object-registry.ts`
- `web/lib/db/migrations/012_tartarus_objects.sql`
- `src/modules/journal/db/database.ts`

### Tool and Integration Execution

Current state:

- Tool schemas are centralized in `web/lib/ai/tools.ts`.
- Tool executors are manually composed in
  `web/lib/ai/tool-executors/index.ts`.
- Domain executors already exist for areas such as journal, Linear, Slite,
  Notion, Google, media, memory, repository, AI integrations, git, and search.
- There is no `IntegrationPlugin` contract yet.

Reality check:

The plugin bus should start by wrapping the existing tool spec/executor pattern.
Do not rip out the central registry first. Create the plugin contract, adapt one
low-risk domain, prove composition works, then migrate larger integrations.

Source anchors:

- `web/lib/ai/tools.ts`
- `web/lib/ai/tool-executors/index.ts`
- `web/lib/ai/tool-executors/`

### AI Provider Boundary

Current state:

- `/api/chat` has manual model configuration, direct provider selection, and
  local fallback behavior.
- Muse, Atropos, Hermes, Daimon, Kronus generation, summaries, and MCP journal
  AI helpers still call providers directly in their own modules.
- Cost tables exist in shared observability code, but provider routing is not
  centralized.
- BYOK is not yet a real runtime path.

Reality check:

The AI registry is necessary before BYOK, model routing, custom Nebius, or
serious cost governance. BYOK should not be bolted directly into individual
routes because those routes would keep bypassing it.

Source anchors:

- `web/app/api/chat/route.ts`
- `web/app/api/chat-hourglass/muse/route.ts`
- `web/app/api/chat-hourglass/muse/edit/route.ts`
- `web/app/api/atropos/`
- `web/app/api/hermes/`
- `web/app/api/daimon/polish/route.ts`
- `web/app/api/kronus/generate/route.ts`
- `src/modules/journal/ai/`
- `web/lib/observability.ts`
- `src/shared/model-costs.ts`

### Approval and Destructive Boundaries

Current state:

- `web/lib/ai/write-tools.ts` defines read/write tool classification.
- The legacy chat UI has a Promise-based confirmation flow for write tools.
- Hourglass executes tool calls through its own path and must be audited for
  equivalent confirmation behavior.
- Several API routes expose `DELETE` handlers or hard-delete helpers.
- Some journal/entry routes require explicit manual-action headers, but this is
  not universal.

Reality check:

The approval invariant is correct, but it is not fully true today. Phase 1 must
include a route-level and UI-level write/destructive audit before the product
can claim universal human approval gates.

Source anchors:

- `web/lib/ai/write-tools.ts`
- `web/components/chat/ChatInterface.tsx`
- `web/components/chat/hourglass/HourglassChat.tsx`
- `web/app/api/**/route.ts`
- `web/lib/object-registry.ts`

### Supabase and Vercel

Current state:

- Supabase clients exist for server and browser contexts.
- Supabase storage and DB sync scripts exist.
- Supabase schema and migration SQL files exist under `docs/`.
- Media rows already track Supabase URLs.
- `web/next.config.ts` uses standalone output, which helps deployment.
- The operator UI still depends on local SQLite semantics.

Reality check:

Vercel deployment cannot be treated as identical to local sovereign mode.
Serverless runtime behavior, file persistence, native SQLite dependencies, and
private memory exposure must be designed explicitly. Supabase is currently best
treated as storage, mirror, public-read delivery, or demo infrastructure unless
a later architecture decision promotes it.

Source anchors:

- `web/lib/supabase/server.ts`
- `web/lib/supabase/client.ts`
- `web/app/api/storage/route.ts`
- `web/scripts/sync-db.ts`
- `web/scripts/sync-to-supabase.js`
- `docs/supabase-schema.sql`
- `docs/supabase-migrations/`
- `web/next.config.ts`

### Muse, Shelf, and Hourglass

Current state:

- Hourglass is the main chat surface.
- The Muse shelf and image generation path are real.
- The UI now has visual generation feedback, image copy/paste, prompt
  alternatives, and model/cost cleanup work in progress.
- Muse thoughts are a meaningful artifact type and should not be coupled only
  to image generation.

Reality check:

The shelf is no longer a side flourish. It is the first visible artifact system.
Lineage, prompt alternatives, Muse thoughts, and visual state should be modeled
as first-class artifacts rather than one-off UI state.

Source anchors:

- `web/components/chat/hourglass/`
- `web/app/api/chat-hourglass/`

### Agent Operating Context

Current state:

- No root `AGENTS.md`, `agent.md`, `CLAUDE.md`, or `GEMINI.md` file is present.
- Repo-specific skills exist under `.agents/skills/`.
- The active Tartarus skill already documents the three main surfaces:
  `src/`, `web/`, and `website/`.

Reality check:

The roadmap should not assume a canonical agent manual exists yet. Creating one
is part of AGENT-001. Until then, `.agents/skills/working-with-tartarus/SKILL.md`
is the closest executable source of agent guidance.

Source anchors:

- `.agents/skills/working-with-tartarus/SKILL.md`
- `.agents/skills/`

## 5. Boundary Tests and Product Ticket Distribution

These tests temper the roadmap. If a proposed feature fails one of these tests,
it must be moved later or reduced to a scaffold.

### Boundary Tests

- If a new integration requires editing chat orchestration, central tool specs,
  executors, env handling, UI controls, and approval logic all at once, the
  plugin bus is not ready. Build the bus first.
- If BYOK requires touching every route that calls an AI provider, the provider
  abstraction is missing. Build the AI registry first.
- If artifact refinement only mutates the current shelf image, lineage is being
  bypassed. Add registry lineage first.
- If Vercel deployment depends on a mutable local SQLite file in serverless
  runtime, the deployment mode is undefined. Define local, hosted demo, and
  public CMS modes before promising hosted persistence.
- If Hourglass can execute a write tool without the same confirmation semantics
  as the legacy chat, the approval invariant is false. Fix this before adding
  publishing tools.
- If social publishing can post externally without storing the external URL and
  approval record, the Megaphone phase is not ready.
- If fine-tuning starts before tool calls, lineage, prompt alternatives, and
  provider metadata are cleanly logged, the dataset will encode mess instead of
  product behavior.

### Epic FORT-001: Supply-Chain and Approval Lockdown

Goal: make the local product safe enough for agents to work inside it.

Tickets:

- Migrate root and `web/` from npm lockfiles to pnpm 11 lockfiles.
- Add `.npmrc` policy with `ignore-scripts=true`.
- Document approved lifecycle scripts and how to run them manually.
- Add a package-manager guard so npm lockfiles do not return silently.
- Inventory all `DELETE` routes and hard-delete helpers.
- Add a standard approval/manual-action guard for destructive API routes.
- Audit Hourglass tool execution against `web/lib/ai/write-tools.ts`.
- Create a credential rotation checklist for current provider and integration
  keys.

Acceptance:

- New installs are deterministic and script-locked.
- All destructive paths are either approval-gated, manual-header gated, or
  explicitly listed as operator-only debt.
- Hourglass and legacy chat follow the same write-tool safety rules.

### Epic AGENT-001: Agent Operating Manual and Skill

Goal: make future coding agents read the product correctly before editing.

Tickets:

- Create `AGENTS.md` or update the repo operating manual equivalent with this
  roadmap's code reality.
- Update/create the Tartarus developer skill with current surfaces:
  `src/`, `web/`, and `website/`.
- Add an assumption-test checklist for agents.
- Add a "before coding" checklist:
  - inspect source
  - check dirty work
  - identify target surface
  - state boundary risks
  - choose narrow validation
- Link this roadmap from the operating manual.

Acceptance:

- A fresh agent can distinguish MCP server, operator UI, and public website.
- A fresh agent knows which invariants are true today and which are planned.
- The skill tells agents to trust code over stale memory.

### Epic BUS-001: Integration Plugin Scaffold

Goal: introduce the plugin shape without breaking the existing tool executor
system.

Tickets:

- Define `IntegrationPlugin`.
- Create a plugin registry that can expose tool specs and executors.
- Wrap one low-risk integration first.
- Add tests proving plugin-composed tools match existing behavior.
- Migrate larger integrations only after the adapter is proven.

Acceptance:

- At least one integration is served through the plugin contract.
- Existing chat tool calls still work.
- Adding a new plugin no longer requires editing unrelated orchestration code.

### Epic AI-001: AI Provider Registry Scaffold

Goal: centralize AI provider identity, capability, cost, and fallback behavior.

Tickets:

- Define `AIProvider`.
- Implement OpenAI, Anthropic, and Google providers.
- Add an OpenAI-compatible custom endpoint shape for future Nebius.
- Add capability flags for tools, vision, image generation, structured output,
  and reasoning.
- Add a router that can choose model/provider by task type.
- Add fallback logging.
- Move cost lookup behind the provider/model registry.
- Keep existing routes working before migration.

Acceptance:

- The registry can call at least the three primary providers in isolation.
- Unit tests cover model selection and fallback.
- No major route migration happens until the scaffold is tested.

### Epic APPROVAL-001: Write and Publish Guardrail

Goal: make human approval a platform invariant, not a single-component feature.

Tickets:

- Centralize write/destructive classification.
- Reuse classification in Hourglass tool execution.
- Add route helpers for manual-action enforcement.
- Distinguish archive, soft delete, external delete, and hard delete.
- Add approval records for future social publishing and website publishing.

Acceptance:

- A write tool cannot be silently executed from either chat UI.
- External publishing has a persisted approval event.
- Hard delete remains rare and operator-controlled.

### Epic DEPLOY-001: Supabase and Vercel Deployment Modes

Goal: make hosted use possible without lying about sovereignty or persistence.

Tickets:

- Define local sovereign, hosted demo, public CMS, and future multi-user modes.
- Audit current Supabase storage, schema, and sync scripts.
- Document required Supabase env vars and storage policies.
- Document Vercel build and runtime constraints for `web/`.
- Decide how hosted demo data is seeded and protected.
- Add deployment health checks for DB, storage, AI providers, and media.
- Document what is public-safe.

Acceptance:

- A clean deployment procedure exists.
- Supabase's role is explicit.
- Vercel deployment does not imply full local SQLite equivalence unless the
  runtime architecture actually supports it.

### Epic LINEAGE-001: Registry Lineage and Refinement

Goal: turn the object registry into an artifact evolution system.

Tickets:

- Add lineage columns or a lineage edge table.
- Add refinement event records.
- Update object registry helpers.
- Render read-only lineage for existing artifacts first.
- Add Muse image refinement after lineage exists.
- Generalize Atropos and Hermes only after the generic event shape works.

Acceptance:

- A child artifact can be traced to its parent.
- A refinement event explains why the child exists.
- Existing registry search/fetch still works.

### Epic MEGA-001: Public Publishing and Social Output

Goal: connect Tartarus to public channels only after approval and registry
infrastructure are reliable.

Tickets:

- Add publish status to artifacts/media.
- Add LinkedIn as the first social plugin.
- Add external URL persistence.
- Add approval records.
- Add public website/CMS publishing only after deployment modes are settled.

Acceptance:

- One approved artifact can be published externally and traced back to source.
- Public output can be archived/updated without deleting local history.

### Epic MODEL-001: Sovereign Kronus Model Research

Goal: prepare model independence without burning time on premature fine-tuning.

Tickets:

- Define model-selection criteria:
  - license
  - tool-calling behavior
  - structured output reliability
  - fine-tuning cost
  - inference cost
  - Nebius or equivalent deployment viability
- Build a small evaluation set before training.
- Export candidate training examples only after logs and metadata are clean.
- Test a small model before committing to a larger MoE candidate.

Acceptance:

- The chosen model is justified by tests, not vibes.
- The training data format matches real Tartarus workflows.

## 6. Procedural Roadmap

Each phase creates prerequisites for the next. Do not build later phases in a
way that bypasses earlier structural work.

### Phase 1: The Fortress - Security and Integrity

Purpose: secure the local development and agent-execution environment before
expanding the system.

Required work:

- Migrate root and `web/` package management to pnpm 11.
- Add root and `web/` `.npmrc` with `ignore-scripts=true`.
- Replace npm lockfiles with pnpm lockfiles after migration.
- Add a repo check that fails when unmanaged package-manager lockfiles appear.
- Audit dependency lifecycle scripts and explicitly document any allowed script.
- Rotate existing API keys as baseline hygiene:
  - OpenAI
  - Anthropic
  - Google/Gemini
  - Linear
  - Slite/Notion/Google Workspace where applicable
  - Supabase/storage keys where applicable
- Ensure MCP tools and local agent workflows are directory scoped.
- Audit destructive API routes and enforce either:
  - UI confirmation flow, or
  - `X-Manual-Action` style explicit manual header.

Exit criteria:

- Installs are deterministic and script-locked.
- Secrets are rotated or explicitly marked as still pending.
- Destructive/write paths have a documented approval mechanism.
- Agents cannot silently operate outside the intended project boundary.

### Phase 2: The Universal Bus - Integration and AI Unification

Purpose: stop hardcoding services and providers. Build the extensible nervous
system before adding more integrations.

Required work:

- Create an `IntegrationPlugin` contract:
  - `key`
  - `name`
  - `authStatus()`
  - `getTools()`
  - `getContext(query)`
  - optional sync/status hooks
- Create a plugin registry that can compose tools and context dynamically.
- Refactor existing integrations into the registry pattern:
  - Linear
  - Slite
  - Notion
  - Google Workspace
  - Git/read-only repo context
  - media/library surfaces where appropriate
- Create an `AIProvider` contract:
  - provider identity
  - auth status
  - model list
  - capability flags: tools, vision, image generation, structured output,
    reasoning, embeddings if needed
  - unified generation call
  - cost lookup
- Implement core AI providers:
  - OpenAI
  - Anthropic
  - Google/Gemini
  - DeepSeek
  - Nebius Token Factory
  - custom OpenAI-compatible endpoint slot for Nebius/future Kronus
  - optional Replicate/Ollama slots
- Add model routing:
  - prime route
  - standard route
  - background route
  - vision route
  - structured-output route
  - private/local route
- Initial model tier doctrine:
  - Prime is for main Kronus chat, hard reasoning, agentic planning, and complex
    tool selection. DeepSeek V4 Pro is the first open/efficient Prime candidate;
    OpenAI, Anthropic, and Gemini Prime remain BYOK/system fallbacks.
  - Standard is for normal hosted usage, Muse production copy, and moderate
    reasoning. Qwen and Gemini are the first Standard candidates.
  - Background is for summaries, indexing, titles, labels, validation,
    classification, and cheap observers. These should never burn Prime tokens
    unless explicitly requested.
  - Search is a separate capability. Tavily supplies real-time grounding and
    should feed Kronus rather than replacing the reasoning model.
- Add fallback chains with trace logging.
- Add BYOK schema and UI:
  - system key support
  - user key support
  - encrypted storage before serious multi-user use
  - key test button
  - per-provider enabled state
- Add per-skill model preferences:
  - primary provider/model
  - fallback provider/model
  - capability requirements

Exit criteria:

- New services can be added without editing central chat orchestration logic.
- New AI providers can be added without rewriting routes.
- `/api/chat` can route through the AI registry.
- Existing functionality still works during migration.
- Cost ledger can explain spend by tier, provider, model, task type, and
  conversation.

### Phase 2.1: Agentic Search Layer

Purpose: give Kronus current, grounded knowledge without exposing unsafe local
MCP tools in hosted mode.

Required work:

- Add a search provider contract under the integration registry.
- Implement Tavily first:
  - Nebius/Tavily adapter if exposed through the Nebius platform.
  - direct Tavily adapter as fallback.
- Expose search as a hosted-safe tool.
- Return source packs, not large raw pages:
  - title
  - URL
  - retrieved timestamp
  - excerpt
  - source confidence/type
- Trace each search call through observability and the conversation cost ledger.
- Let Kronus decide when search is needed; do not search every turn.

Exit criteria:

- Kronus can ground external/current claims with cited source packs.
- Hosted mode has search without local filesystem or local git access.
- Search costs and source usage are visible in the ledger.

### Phase 2.5: The Online Citadel - Supabase and Vercel Deployment

Purpose: make Tartarus deployable online without weakening the local SQLite
sovereignty model.

This phase prepares hosted demos, public publishing, and portfolio access. It
does not replace SQLite as canonical truth. Hosted stores are mirrors, delivery
layers, auth layers, or public-read surfaces unless explicitly promoted by a
future architecture decision.

Required work:

- Define deployment modes:
  - local sovereign mode
  - hosted demo mode
  - public website/CMS mode
  - future multi-user mode
- Audit existing Supabase usage:
  - storage buckets
  - schema sync files
  - media URLs
  - public/private access assumptions
  - migration drift between SQLite and Supabase schema files
- Create Supabase setup procedure:
  - project creation
  - env var list
  - storage bucket policy
  - schema/migration application
  - local-to-Supabase sync expectations
  - backup/export procedure
- Create Vercel deployment procedure:
  - project configuration
  - required env vars
  - build command
  - deployment target for `web/`
  - deployment target for future public site
  - preview vs production behavior
- Add deployment health checks:
  - DB connectivity
  - Supabase storage read/write where enabled
  - AI provider availability
  - auth/session sanity
  - media rendering
- Document what data is safe for hosted/public mode.
- Ensure secrets are not bundled or exposed in client builds.
- Add a hosted demo plan that can show Tartarus without exposing private memory.

Exit criteria:

- A clean machine can deploy Tartarus to Vercel using documented steps.
- Supabase is configured only for the intended hosted/public responsibilities.
- Local SQLite remains the canonical vault.
- Public/hosted deployment has a safe demo data story.

### Phase 3: The Lineage Engine - Artifact Refinement

Purpose: move from one-shot generation to tracked artifact evolution.

Required work:

- Extend object lineage:
  - `parent_uuid`
  - `lineage_depth`
  - `lineage_root_uuid` if useful
  - refinement metadata/history
- Define refinement event shape:
  - source artifact
  - instruction
  - modifier type
  - model/provider
  - reason
  - created artifact
- Create a generic `ModifierAgent` pattern:
  - accepts artifact + instruction + scoped context
  - returns a new linked artifact
  - records lineage
- Unify existing specialized agents under this pattern where appropriate:
  - Atropos: correction/refinement
  - Hermes: translation/transformation
  - Muse edit/refine: visual refinement
- Add scoped refinement UI:
  - clicking an image or document opens a refinement drawer
  - the drawer uses an artifact-specific prompt, not the global Kronus prompt
  - refined output appears as a child artifact
  - lineage is visible and navigable
- Add labeling:
  - style
  - tone
  - format
  - content
  - translation
  - correction
  - visual composition

Exit criteria:

- A Muse image can be refined without overwriting history.
- A document can later use the same lineage mechanism.
- Artifact evolution is visible in the UI and stored in the DB.

### Phase 4: The Megaphone - Publishing, Social, and Public CMS

Purpose: connect the sovereign vault to public output without surrendering
source-of-truth control.

Required work:

- Build social publishing plugin(s):
  - LinkedIn first
  - Twitter/X second
  - others only after the pattern is stable
- Define marketing pipeline:
  - Muse creates or selects visual
  - Kronus drafts copy
  - user approves
  - social API publishes
  - DB records external URL and publish metadata
- Add publish status to media/artifacts:
  - draft
  - approved
  - published
  - failed
  - archived
- Build a public website/CMS surface:
  - public documents
  - public journal entries where selected
  - public project/portfolio entries
  - public media assets
- Add `publish_to_website` tool behind approval.
- Keep website publishing DB-backed:
  - internal document remains canonical
  - public site is a renderer or deployment target
  - published URL is stored back into Tartarus

Exit criteria:

- Tartarus can publish one approved asset/post to a public channel.
- Public website content can be managed from the vault.
- Publishing is traceable and reversible by archive/update, not silent deletion.

### Phase 5: The Sovereign Soul - Model Independence

Purpose: reduce dependence on proprietary APIs by training a small routing and
voice model that can act as Kronus for cheap/default tasks.

Required work:

- Research and select open model candidates.
  - Candidates should be tested, not assumed.
  - Chinese open models are preferred candidates for Standard and future
    sovereignty work.
  - Qwen and GLM-style models are likely candidates for hosted Standard and
    fine-tuning.
  - DeepSeek V4 Pro is a Prime candidate for main Kronus chat if availability,
    latency, price, and policy behavior hold up in Tartarus evals.
  - Gemini remains a Standard/Prime fallback depending on provider, context
    length, and cost.
  - Selection must be based on current benchmarks, license, tool-calling
    behavior, structured output reliability, language behavior, fine-tuning cost,
    deployment viability, and price per successful task.
- Build dataset export:
  - high-quality chats
  - tool calls
  - journal summaries
  - refinement interactions
  - Muse proposal and approval chains
  - failed/low-quality interactions excluded by curation
- Define JSONL training format.
- Build an evaluation set before fine-tuning.
- Run small proof-of-concept fine-tune with Unsloth or equivalent.
- Host candidate on Nebius or another efficient provider.
- Integrate as a custom AI provider through Phase 2's AI registry.
- Use it for:
  - voice/style
  - routing
  - summaries
  - cheap planning
  - tool-selection assistance
- Keep main Kronus chat and heavy reasoning delegated to Prime models until a
  smaller sovereign model proves it can hold quality.

Exit criteria:

- Tartarus has a custom Kronus model endpoint registered as an AI provider.
- The custom model is evaluated against a held-out set.
- It is useful for orchestration/voice even if not useful for heavy coding.

### Phase 5.5: The Measuring Glass - Model and Feature Evaluation

Purpose: turn Tartarus usage into a durable measurement system. Every important
new feature, prompt, provider, or model should be measurable against real
Tartarus tasks, not judged only by vibe or one-off manual trials.

This is inspired by the Jobilla-style evaluation system: a fixed set of tests,
new feature-specific cases, agent-shaped expectations, and repeated comparison
across model/provider/prompt versions.

Required work:

- Create an evaluation registry:
  - task id
  - task type
  - input fixture
  - expected behavior
  - scoring rubric
  - source conversation/artifact if derived from real usage
  - allowed tools
  - required output schema
- Let agents propose new eval cases when building features:
  - a new Muse feature adds Muse eval cases
  - a new integration adds tool-call eval cases
  - a new hosted-safe tool adds permission-boundary eval cases
  - a new prompt version adds prompt regression cases
- Track eval runs:
  - model
  - provider
  - prompt version
  - tool registry version
  - latency
  - cost
  - schema validity
  - tool-call correctness
  - human rating where available
- Support multiple scoring styles:
  - exact structured assertions
  - rubric/LLM judge for qualitative outputs
  - human approval/rejection as ground truth
  - regression comparison against the previous accepted answer
- Feed results into routing:
  - Prime/Standard/Background defaults should be justified by measured success,
    not preference.
  - Failed evals should block promotion of a model or prompt to default.
- Preserve eval data for future fine-tuning:
  - accepted outputs
  - rejected outputs
  - tool-call traces
  - explanations of why a result was accepted or rejected

Exit criteria:

- A provider/model/prompt change can be compared against previous production
  behavior.
- New major features include eval cases before being considered stable.
- Routing decisions can cite measured quality, cost, and latency.
- Tartarus accumulates clean training and evaluation data as part of ordinary
  usage.

## 7. Feature Inventory

This list captures the feature ideas that must not be lost.

### Security and Infrastructure

- pnpm 11 migration.
- `.npmrc` script lockdown.
- dependency/script audit.
- credential rotation.
- MCP sandboxing.
- approval audit.
- package manager policy.

### Agent and Skill Infrastructure

- improve `AGENTS.md` or equivalent repo operating manual.
- create/update a Tartarus developer skill.
- encode current architecture and security rules.
- encode journal/memory workflow.
- encode plugin and modifier contracts once they exist.
- require agents to test assumptions against source before implementing.

### Context Management

- context dashboard in monitor/control panel.
- skill-driven context activation.
- per-session context/tool config persistence.
- chat memory sync across Kronus/Muse/Hourglass.
- no hallucinated context: use DB, Entry 0, registry, or read-only git.

### Muse and Shelf

- visual art alternatives, not painting-only.
- selected prompt and alternative prompts persisted.
- Muse thoughts preserved even without images.
- visual generation loading state overlays current artifact.
- shelf image fit and blue/ivory visual system.
- image copy/paste into Hourglass chat.
- Muse title suggestions.
- Muse image attachment sync between tool path and shelf.

### Artifact Refinement

- click artifact to open scoped refinement chat.
- image-to-image refinement.
- document refinement later.
- lineage tree/history.
- ModifierAgent abstraction.
- Atropos and Hermes unified under modifier pattern.
- refinement labels for future training data.

### Integration Bus

- `IntegrationPlugin` interface.
- self-registering services.
- Linear plugin.
- Slite plugin.
- Notion plugin.
- Google Workspace plugin.
- Git/read-only repo plugin.
- future Slack plugin.
- future social plugin.

### AI Management

- `AIProvider` registry.
- BYOK.
- model routing.
- Prime/Standard/Background tier policy.
- DeepSeek V4 Pro Prime slot.
- Qwen/Gemini Standard slots.
- Tavily search provider.
- fallback chains.
- per-skill model preferences.
- custom endpoint slot.
- Nebius custom Kronus provider.
- provider health/auth checks.
- cost tracking by provider/model/skill/conversation.
- budget warnings and limits.

### Social and Marketing Pipeline

- LinkedIn publishing.
- Twitter/X publishing.
- Muse visual to post pipeline.
- Kronus copy draft.
- human approval.
- external URL persistence.
- post status tracking.
- later scheduling.

### Public Website and CMS

- Supabase setup for hosted/public storage where needed.
- Vercel deployment for the operator UI and public site.
- deployment mode documentation: local, hosted demo, public CMS.
- public website powered by Tartarus content.
- public document flag/tag.
- public journal/piece renderer.
- `publish_to_website` tool behind approval.
- portfolio pages driven from DB.
- website as proof that Tartarus can operate a CMS.

### Sovereign Model

- open model research.
- dataset extraction.
- interaction curation.
- JSONL export.
- evaluation set.
- Unsloth fine-tuning.
- Nebius deployment.
- AI registry integration.

## 8. Architectural Invariants

These are non-negotiable unless deliberately revised in this document.

### Database Truth

SQLite is canonical. External systems are integrations, mirrors, or publishing
targets. If state matters to context, it must be persisted in SQLite.

### Object Identity

Durable objects should have UUIDs in `tartarus_objects` or a successor registry
table. Search and fetch should operate over stable IDs, not ephemeral UI state.

### Approval Gates

Write, destructive, publish, external-send, or external-mutation actions require
human approval. Acceptable mechanisms:

- Promise-based UI confirmation.
- explicit manual-action HTTP header for operator-only routes.
- future signed approval records.

### Immutability of History

Agents should not silently delete history. Prefer:

- create
- update with audit trail
- archive
- mark deleted from external sync while preserving local record

Hard delete is a manual operator action and must be rare.

### AI SDK Strictness

Structured AI responses must use AI SDK structured output patterns. Do not add
fragile raw JSON parsing fallbacks for new endpoints.

### No Hallucinated Context

Agents must read from:

- SQLite.
- object registry.
- Entry 0/repository overview.
- persisted chat memory.
- read-only git tools.
- explicit user input.

If context is absent, ask or inspect. Do not invent.

### Provider Abstraction

New AI routes should move toward the AI registry. Avoid adding new hardcoded
provider/model calls unless they are temporary and documented.

### Plugin Abstraction

New service integrations should move toward the plugin registry. Avoid adding
another isolated service client unless the plugin contract is not ready and the
debt is explicitly marked.

## 9. Immediate Execution Order

Use this order when work resumes. The first product work should be
FORT-001 and AGENT-001; the rest should wait until those tickets expose the
actual boundaries clearly.

1. Review this document and update any incorrect claim.
2. Create or update the agent operating manual/skill.
3. Run the Phase 1 security audit.
4. Begin pnpm and `.npmrc` hardening.
5. Document the Supabase/Vercel deployment mode and secret boundary.
6. Audit Hourglass write-tool execution and destructive API routes.
7. Create the plugin/AI registry design document before coding the registry.
8. Implement the smallest safe scaffold for the registry.
9. Migrate one low-risk route or integration only after tests exist.
10. Add lineage schema only after registry and approval boundaries are clear.

Do not start social publishing, CMS publishing, or model fine-tuning until the
Fortress and Universal Bus are stable enough to carry them.

## 10. Positioning Lines

Use these for README, portfolio, and pitch materials.

### Technical

Tartarus is an agentic context management system built on a sovereign SQLite
vault. It indexes work history, documents, media, conversations, and service
state, then exposes that context to AI agents through approval-gated tools.

### Pragmatic

Tartarus connects the systems where work already lives, keeps the important
context in one local database, and lets an AI assistant handle administrative
work without losing control of the data.

### Strategic

Tartarus is the infrastructure layer behind agentic work: memory, tools,
integrations, routing, refinement, publishing, and auditability in one system.
