# Tartarus — Vision and Roadmap

This is the authoritative roadmap for Tartarus. It encodes the product vision,
the current code reality, and the architectural sequencing rules future agents
must follow.

It is not a sprint plan. There are no dates. Sequence matters more than speed.

Companion document: `docs/TARTARUS_IMPLEMENTATION_PLAN.md` fragments this
roadmap into code-grounded tickets, source anchors, validation commands, and
acceptance checks.

---

## 1. Core Vision

Tartarus is an **Agentic Context Management System**.

It is a sovereign SQLite vault that captures a professional's full digital
context — code, decisions, writings, artifacts, communications, work history,
and operational memory — and lets AI agents act on that context through
explicit tools and human approval gates.

Tartarus began as a developer journal. Its long-term shape is broader: one
database, one context layer, one orchestrator covering code, documents,
integrations, publishing, and refinement.

## 2. Philosophical Pillars

### Sovereignty
The user owns the database. External services are mirrors, integrations, or
publish targets. SQLite remains the canonical vault.

### Relief
Tartarus unifies the systems where work already lives — Git, Linear, Slite,
Notion, Google Workspace, Slack, media, chat — under one administrative layer.

### Transcendence
Human context becomes structured machine-readable memory. The agent does not
guess; it reads the library, acts through tools, refines artifacts, and records
what changed.

---

## 3. Current Reality (audited against the code on this branch)

This section is the load-bearing one. It must match the repo. Update it the
moment a phase lands or a claim becomes wrong.

### What exists today

- **Two-tier surface, real.**
  - `src/` — MCP server (Kronus access, journal, registry, read-only git,
    HTTP bridge, prompts/resources).
  - `web/` — Next.js operator UI on port `3005`. Hourglass chat, Muse shelf,
    cost meter, ledger, history rail, integrations dashboards.
  - `website/` — separate public Next.js app on port `3007`. Already on pnpm.
- **SQLite is canonical.** WAL mode. Shared by MCP and web via
  `web/lib/db.ts`, `web/lib/db/drizzle.ts`, `src/modules/journal/db/database.ts`.
- **Object registry with UUIDs.** `tartarus_objects` +
  `tartarus_object_history`, helpers in `web/lib/object-registry.ts`.
  Universal `registry_search_objects` / `registry_fetch_object` over all
  durable rows. Lineage (parent/child) does **not** yet exist.
- **Tool execution spine.** Centralized specs in `web/lib/ai/tools.ts`,
  executors in `web/lib/ai/tool-executors/`, write/read classification in
  `web/lib/ai/write-tools.ts`. Skill-aware tool merging in `/api/chat`.
- **AI cost/trace ledger.** `web/lib/observability.ts` defines `ai_traces`
  with `conversation_id`, plus `recordImageCost` for fixed-cost image paints
  (GPT Image 2 quality tiers, Nano Banana variants). `recomputeConversationCost`
  writes the running total to `chat_conversations.cost_usd /
  actual_input_tokens / actual_output_tokens` after every span closes.
- **Hourglass cost meter + ledger.** `CostMeter.tsx` polls
  `/api/conversations/[id]/cost`; clicking opens the ledger backed by
  `ai_traces`, so meter and ledger cannot drift.
- **Slack vault, first integration mirroring sovereign-memory doctrine.**
  - `web/lib/slack/vault.ts` (SQLite schema + sync logic).
  - `web/app/api/integrations/slack/{cache,sync}/route.ts`.
  - `web/app/(dashboard)/integrations/slack/page.tsx` (vault dashboard with
    Rediscover / Pilot / Backfill buttons, joins users/conversations so the
    message list shows real author/channel names, not raw IDs).
  - `web/scripts/slack-backfill.mjs` (paced, resumable terminal driver;
    `cd web && npm run slack:backfill`).
  - Vault tables: `slack_users`, `slack_conversations`, `slack_messages`,
    `slack_sync_state`. Categories: `personal_conversation` (DM) /
    `group` (MPIM/private) / `public_forum` (public channels).
- **Hourglass artifact system.** Shelf, set_artifact tool, denormalized
  artifact refs in `chat_conversations.artifact_refs`. Muse edits store
  `editOfArtifactUuid` inside media `description` JSON — pre-lineage debt.
- **Skills system.** Skill documents in `documents` table with metadata
  flag, `mergeSkillConfigs` derives soul + tools per conversation.
- **Read-only Linear / Slite / Notion caches** with sync routes, plus
  `linear://` and `slite://` MCP resources.

### What is partially built

- **AI provider routing.** `web/lib/ai/model-catalog.ts` enumerates Google,
  Anthropic, OpenAI, DeepSeek, Nebius as `AiProviderKey` values, and a tier
  field (`prime` / `standard` / `background`) on every entry. But `/api/chat`
  still calls `google()` / `anthropic()` / `openai()` directly, hardcodes
  the env-key checks, and has no abstraction for DeepSeek or Nebius. There
  is no provider registry, no tier router, no BYOK runtime path.
- **Approval gates.** Legacy `/chat` has Promise-based confirmation. Hourglass
  executes tool calls through its own path and has not been audited against
  `write-tools.ts` end-to-end. Several `DELETE` routes still exist;
  `X-Manual-Action` is used by some but not universally.
- **Slack vault completeness.** Ingestion works and is rate-limit aware
  (single history slice per run, `conversations.list` only on Rediscover,
  per-conversation `slack_sync_state` cursors). Summaries (the `summary` /
  `summarized_at` columns on `slack_conversations` and `slack_messages`) are
  declared in the schema but **not generated yet**. Kronus has no Slack tool
  exposed — by design, until summaries land.
- **Supabase usage.** Server/client modules, storage uploads, sync scripts,
  and schema files all exist. But there is no clean separation of "local
  sovereign" vs "hosted demo" vs "public CMS" modes, and a few migration
  files have drifted from the live SQLite schema.
- **Muse autonomy state.** `muse_config.tickEvery` exists in DB; the
  Hourglass client still uses hardcoded cadence and a session-relative
  countdown. Reload safety is OK; persistence is not.
- **Eval system.** No `web/lib/evals/` directory. Routing decisions are
  vibes, not measurements.

### What is aspirational

- IntegrationPlugin contract and plugin bus.
- AI provider registry with tier routing, BYOK, fallback chains.
- Tavily / agentic search as a hosted-safe tool.
- Object registry lineage (parent_uuid, refinement events) and the
  ModifierAgent pattern.
- LinkedIn / X publishing pipeline ("Megaphone").
- Public CMS publishing from vault content.
- Custom sovereign Kronus model (Nebius-hosted fine-tune).
- Jobilla-style eval matrix with prompt/model regression cases.

### What is blocked by infrastructure

- **BYOK** is blocked by the missing provider registry — bolting it into
  scattered routes would entrench the mess.
- **Lineage UI / artifact refinement chats** are blocked by the missing
  parent/child lineage in the registry. Muse edits already need it.
- **Publishing to LinkedIn / website** is blocked by missing universal
  approval records (no `approval_records` table, no signed approval shape).
- **Hosted/Vercel mode** is blocked by SQLite-on-volume vs Postgres
  decisions, plus the unresolved "what is public-safe in this vault"
  question. Vercel serverless cannot host the operator UI without a hosted
  DB adapter.
- **Sovereign Kronus fine-tuning** is blocked by lineage + clean tool-call
  logs + eval ground truth. Training data is currently messy.
- **Slack as a Kronus tool** is blocked by the missing summary layer.
  Exposing raw Slack history to the model would burn tokens, hit rate
  limits during chat, and reduce sovereignty.

---

## 4. Architectural Invariants (non-negotiable unless revised here)

### Database truth
SQLite is canonical. External systems are integrations, mirrors, or
publishing targets. If state matters to context, it must persist in SQLite.

### Object identity
Durable objects have UUIDs in `tartarus_objects` (or a successor registry).
Search and fetch operate over stable IDs, not ephemeral UI state.

### Approval gates
Write, destructive, publish, external-send, or external-mutation actions
require human approval. Acceptable mechanisms:
- Promise-based UI confirmation (legacy `/chat` pattern).
- Explicit `X-Manual-Action` HTTP header for operator-only routes.
- Future signed approval records.

### Immutability of history
Agents do not silently delete history. Prefer: create → update with audit
trail → archive → mark deleted from external sync while preserving local
record. Hard delete is rare and operator-driven.

### AI SDK strictness
Structured AI responses use AI SDK structured-output patterns
(`Output.object()`, `generateObject` with Zod). No fragile raw-JSON parsing.

### No hallucinated context
Agents read from SQLite, registry, Entry 0, persisted chat memory,
read-only git tools, or explicit user input. If context is missing,
ask or inspect. Do not invent.

### Provider abstraction
New AI routes should move toward the AI registry (Phase 3). Avoid adding
hardcoded provider/model calls unless they are temporary and documented.

### Plugin abstraction
New service integrations should move toward the plugin registry (Phase 2).
Avoid adding isolated service clients unless the contract is not ready and
the debt is explicitly marked.

### Sovereign-memory doctrine (Slack and successors)
External communication systems are mirrored locally first, summarized
locally, then exposed to Kronus through summary-first tools. Raw fetches
are escape hatches, not the default. Hosted-lite mode never uses a shared
personal token — each user authenticates via OAuth and gets a vault scoped
to their own identity.

---

## 5. Phased Roadmap

Each phase creates prerequisites for the next. Do not build later phases
in a way that bypasses earlier structural work.

### Phase 1 — Data Vault Stabilization

**Purpose:** make the sovereign memory layer dependable before stacking
more surface on top of it. This is where the Slack work lives.

Work:
- **Slack backfill completion.** Drive `web/scripts/slack-backfill.mjs` to
  steady-state coverage of DMs, groups, and member-only public channels.
  Stay on the cached-conversations + single-slice doctrine. No web request
  attempts a one-shot "sync all Slack" — it will rate-limit and time out.
- **Slack summaries (post-ingestion).** Background pass over
  `slack_messages` / `slack_conversations` populating the `summary` and
  `summarized_at` columns that the schema already declares. Summaries are
  generated **after** ingestion, never during rate-limited Slack calls.
  Kronus reads summaries first; raw messages are a tool of last resort.
- **Integration cache conventions.** Codify what every integration table
  must expose: a `*_sync_state` table, a `summary` / `summarized_at` pair
  on heavy rows, a Rediscover-only path for directory refresh, and the
  rule that normal sync never re-pulls directories.
- **Context budgeting.** Per-conversation token budget for soul + chat log
  + shelf + tool results, enforced in `/api/chat` and `chat-hourglass`
  routes. Today the only visible budget signal is the soul-config 100K
  warning in `SoulConfig.tsx`; budgets need to land in the model call
  itself.
- **Cost ledger hardening.** `recomputeConversationCost` already runs at
  every span close; what's missing is:
  - per-day and per-provider rollups (the monitor page TODO from
    `COST-001` follow-up),
  - filters on the ledger UI (by source / model / status),
  - sanity tests that prove ledger ≡ meter for every conversation.

Exit:
- Slack vault has DMs, groups, joined public channels in SQLite.
- Conversation/message rows have non-null summaries.
- Every conversation can be opened with a known, bounded context budget.
- Ledger and meter agree across all conversations in a freshly-imported
  vault.

### Phase 2 — Universal Integration Bus

**Purpose:** stop hardcoding services. Build the nervous system before
adding more limbs.

Work:
- **`IntegrationPlugin` contract:**
  - `key`, `name`, `authStatus()`, `getTools()`, `getContext(query)`,
    optional `sync()` / `summarize()` hooks.
  - Hosted-safety flag: does this plugin run in hosted mode, or is it
    local-only?
- **Plugin registry** under `web/lib/integrations/` that composes tool
  specs and executors. Wraps the existing `web/lib/ai/tools.ts` +
  `tool-executors/` shape; do not rip them out first.
- **Migrate integrations in order of lowest risk:**
  1. `memory` or `search` (no external state).
  2. Slite.
  3. Notion.
  4. Linear.
  5. Google Workspace.
  6. Slack (only after summaries exist).
- **Hosted-safe vs local-only tool registry.** Split the registry by
  hosted-safety. Local MCP tools (filesystem, git write, repo-aware
  Cursor delegate) never reach hosted-lite chat.

Exit:
- One integration is served through the plugin contract.
- Adding a new plugin does not require editing `/api/chat` orchestration.
- Hosted-safe tool list is enumerable at runtime.

### Phase 3 — AI Provider Registry / BYOK

**Purpose:** centralize provider identity, capability, cost, fallback,
and per-user keys. Today `model-catalog.ts` already lists tiers — but
nothing reads them.

Work:
- **`AIProvider` contract:** identity, auth status, model list, capability
  flags (text / tools / vision / image / structured output / reasoning /
  embeddings), unified generation call, cost lookup.
- **Implement providers:** OpenAI, Anthropic, Google, DeepSeek (new),
  Nebius Token Factory (custom OpenAI-compatible endpoint slot already in
  `AiProviderKey`).
- **BYOK schema:** per-user API keys, encrypted at rest, with provider
  test buttons. Until multi-user lands, system keys still apply; the
  schema and UI should be ready.
- **Tier router** that maps task → tier → model:
  - `prime`: main Kronus chat, hard reasoning, agentic planning.
  - `standard`: Muse production copy, moderate reasoning.
  - `background`: summaries, titles, labels, classification, validators.
  - `search`: Tavily real-time grounding (Phase 2.1 of the prior doc).
- **Cost tracking** moves behind the registry. `MODEL_COSTS` in
  `observability.ts` becomes a registry lookup, not a hardcoded map.
- **Fallback chains with trace logging.** Every fallback shows up in
  `ai_traces` so the ledger explains who actually ran.

Exit:
- `/api/chat` routes through the registry by tier.
- Adding a new provider does not edit individual routes.
- Cost ledger shows tier + provider + model + task type per call.
- BYOK can be turned on without rewriting routes.

### Phase 4 — Hosted Lite

**Purpose:** make Tartarus reachable through a URL without lying about
sovereignty or persistence.

Work:
- **Decide storage:**
  - Supabase Postgres (with mirrored schema for vault tables) is the
    realistic candidate for hosted-lite multi-user.
  - Supabase Storage stays the media backing.
  - SQLite-on-volume is acceptable for single-tenant hosted demo only.
- **Deployment modes documented:** local sovereign / hosted demo / public
  CMS / future multi-user. Each mode lists what is enabled, what is
  disabled, and which env vars are required.
- **Per-user vault separation.** Schema gets an `owner_id` (or `tenant_id`)
  on every user-scoped table. Migrations write the local user's id during
  the transition.
- **Hosted-safe MCP concept.** A reduced MCP profile with no local
  filesystem, no git write, no Cursor delegate. The tool registry's
  hosted-safety flag (Phase 2) is the source of truth.
- **Slack OAuth (hosted-lite only).** Per-user OAuth tokens. Shared
  `SLACK_USER_TOKEN` is local-mode only and must be refused in hosted
  mode.

Exit:
- A non-technical user can open one URL and reach Tartarus.
- Private local memory is not exposed by the hosted deployment.
- Hosted demo can be reset from seed data.

### Phase 5 — Artifact Lineage / Muse Refinement

**Purpose:** turn the registry into an artifact evolution system. Muse
already accidentally needs this (`editOfArtifactUuid` is hidden in JSON).

Work:
- **Lineage columns** on `tartarus_objects`: `parent_uuid`,
  `lineage_root_uuid`, `lineage_depth`.
- **Refinement event table:** source artifact, instruction, modifier
  type, model/provider, reason, created artifact.
- **Promote `editOfArtifactUuid`** out of `media_assets.description` JSON
  into real lineage edges. Backfill existing rows.
- **`ModifierAgent` pattern:** accepts artifact + instruction + scoped
  context, returns a linked child artifact, records the event.
- **Muse refinement chat:** clicking an artifact opens a scoped chat that
  uses an artifact-specific prompt (not Kronus's global soul) and produces
  child artifacts.
- **Unify Atropos and Hermes** under the modifier pattern only after the
  generic event shape works on Muse.
- **Prompt variants persistence.** Alternatives currently regenerated per
  request should be saved (linked to their parent prompt) so re-rolls
  don't pay token cost twice.
- **Muse as productive producer.** Once lineage exists, Muse can produce
  visual + caption pairs for the Megaphone (Phase 6) without losing
  provenance.

Exit:
- Any child artifact traces to its parent visually in the UI.
- A refinement event explains *why* the child exists.
- Existing registry search/fetch still works on lineage-tagged rows.

### Phase 6 — Public CMS / Portfolio

**Purpose:** connect the sovereign vault to public output without
surrendering source-of-truth control.

Work:
- **Website as read-only renderer.** `website/` already exists. Make
  selected `documents`, `portfolio_projects`, and `media_assets` rows
  publishable; render them server-side from the vault (direct DB read in
  local mode, Supabase replica in hosted mode).
- **Publish flow with approval gates:**
  - `publish_status`: `draft` / `approved` / `published` / `failed` /
    `archived`.
  - Approval record persisted (reuses Phase 3 approval shape).
  - External URL stored back on the source row.
- **LinkedIn / X publishing plugins** built on the same approval record
  shape. LinkedIn first; X second; others only after the pattern is stable.
- **Archive over delete.** Published assets are never silently deleted —
  archived with the external URL preserved.

Exit:
- One approved artifact can be published externally and traced back to
  its vault source.
- Public website pulls portfolio entries from the vault, not from static
  JSON.

### Phase 7 — Evaluation System

**Purpose:** turn Tartarus into a measurable AI product. Inspired
directly by the Jobilla campaign-generation eval matrix (7 judges, 88
binary tests).

Work:
- **Eval registry** under `web/lib/evals/`:
  - `id`, `taskType`, `input`, `expectedBehavior`, `requiredSchema`,
    `allowedTools`, `rubric`, `sourceArtifactUuid?`.
- **Run records:** provider/model/tier, prompt version, tool registry
  version, latency, cost, schema validity, tool-call correctness, human
  rating.
- **Initial suite:**
  - Kronus main chat planning.
  - Tool-call selection.
  - Structured output validity.
  - Title generation.
  - Summary generation (the Slack summary path from Phase 1).
  - Muse decision / proposal.
  - Search-grounded answer with citations.
- **Regression cases from production failures.** Every "this answer was
  wrong" becomes a fixture in the eval suite. Same pattern as Jobilla's
  cross-asset coherence judges, scoped to Tartarus tasks.
- **Langfuse prompt versioning** (or equivalent) for prompts that go to
  production. Promotion of a default model or prompt requires a measured
  before/after.
- **Eval-gated routing.** Phase 3's tier defaults are justified by the
  eval suite, not by provider claims.

Exit:
- A provider/model/prompt change has a measured before/after record.
- New major AI features ship with eval cases.
- Accepted and rejected outputs are preserved for future fine-tuning.

### Phase 8 — Security, Backup, and Full Observability

**Purpose:** before Kronus runs as a full autonomous agent, the vault
has to be encrypted, backed up under your control, and instrumented
well enough to post-mortem any action it takes. **This phase is the
hard gate to Kronus-as-full-agent.** It is not a precondition for any
earlier phase — Phases 1–7 can land without it — but autonomy cannot.

Threat model:
- **Cloud / host compromise.** Supabase, Vercel, or the backup-bucket
  host gets breached or subpoenaed. The vault must remain unreadable
  to the host.
- **Future Kronus autonomy.** Once Kronus runs unattended, every
  action must be capability-scoped, signed, audit-logged, and
  revocable.
- **Out of scope:** laptop theft (FileVault handles disk encryption);
  network MITM (HTTPS handles transport).

Work:

- **Encryption at rest (client-side, host-blind).**
  - Decide the primitive: per-vault data key wrapped under a
    passphrase-derived KEK (Argon2id or scrypt). Research ticket
    (RESEARCH-001) selects the exact recipe — libsodium / age /
    native WebCrypto — and decides SQLCipher vs. application-level
    field encryption. The trade-off is opaque queries vs. queryable
    plaintext indexes; the research must give a recommendation, not
    a menu.
  - Backup payloads to Supabase Storage are always encrypted
    **before upload**. Supabase stores ciphertext only.
- **Backup strategy (Supabase Storage as target).**
  - Dedicated bucket separate from `journal-images`.
  - Cadence: nightly full snapshot (encrypted tarball of `data/`),
    plus on-demand snapshots before risky operations.
  - Retention: research recommends; starting point 30 daily / 12
    weekly / 12 monthly.
  - **Restore drill:** scripted, documented, and run at least once
    before this phase is called done. A backup nobody has restored
    is a fiction.
- **Full observability ingestion (minimum viable visibility).**
  Same pattern as the shipped `client_memlog` work — server-side
  SQLite tables, lazy `ensureXxxTable()` migrations, one viewer
  page per stream under `/monitor/*`.
  - **Client errors.** React error boundaries +
    `window.onerror` + `unhandledrejection` beacon to a new
    `client_errors` table.
  - **Server-side API traces.** Every `/api/**` route writes a row
    to `api_traces` (joined to `ai_traces.trace_id` when an AI call
    is involved) with input hash, output hash, status, latency,
    error JSON. **Hashes by default, full bodies only on error** —
    so we get coverage without storing PII.
  - **External sync errors.** Slack/Linear/Slite/Notion sync
    failures write structured rows into `sync_errors` with retry
    metadata. Rate-limit hits become first-class events.
  - **Langfuse integration for the AI layer.** Prompts, completions,
    tool calls, latencies, costs. `ai_traces` remains the local
    source of truth; Langfuse is the visualization and alerting
    layer. Self-host if hosted-Langfuse data residency is wrong.
- **Agent capability scoping (foundation for autonomy).**
  - Every tool declares `capabilities`: `read` / `write` /
    `external-call` / `cost-bearing` / `destructive`.
  - Per-skill capability allowlist enforced at the tool-executor
    layer — not the prompt layer. Prompts are not security.
  - **Signed approval records** for any action above a threshold
    (cost, destructiveness, external-publish). Reuses the approval
    records introduced in Phase 6.
  - **Kill switch.** A single env flag or DB row that halts all
    agent write tools instantly.

Exit:
- Sensitive columns (chat transcripts, Slack message bodies, AI
  integration credentials, private repository documents) are
  application-encrypted with libsodium per `web/lib/crypto/field.ts`.
  SQLCipher was rejected in [RESEARCH-001](./research/SECURITY_BACKUP_OBSERVABILITY.md)
  — non-sensitive plaintext columns remain queryable.
- A nightly encrypted backup lands in Supabase Storage, and has
  been restored from scratch at least once.
- `client_errors`, `api_traces`, `sync_errors`, and the Langfuse
  pipeline are flowing, with `/monitor/*` pages for each.
- Every tool declares capabilities; skill system enforces them; the
  kill switch is wired and tested.

---

## 6. Slack Doctrine (sovereign memory ingestion)

Slack is the first integration that proves the sovereign-memory pattern.
Future integrations follow the same shape.

1. **Mirror first, tool last.** Slack is a data vault mirror, not a
   Kronus tool. Tools come after summaries.
2. **`SLACK_USER_TOKEN` preferred in local mode.** It's a personal vault
   mirror, not a shared bot. `SLACK_BOT_TOKEN` is a fallback for cases
   where only bot scopes are available.
3. **Backfill is paced and resumable.**
   - Driven by `web/scripts/slack-backfill.mjs` —
     `cd web && npm run slack:backfill`.
   - One history slice per iteration, default 70s pause.
   - Per-conversation cursor in `slack_sync_state`.
   - Do not propose a one-shot "sync all Slack" web request — it will
     rate-limit and time out.
4. **`conversations.list` is not called by normal backfill.** Only the
   `Rediscover` UI action refreshes the directory; backfill uses the
   cached conversation list.
5. **Member-only public channels are mirrored; non-member public
   channels are metadata-only** unless `includeNonMemberPublic` is
   explicitly set.
6. **Summaries are post-ingestion, never inline.** Generated by a
   background pass on saved rows; the schema's `summary` /
   `summarized_at` columns are the contract.
7. **Kronus reads summarized/indexed Slack first**, then fetches raw
   messages by ID only when needed. No raw-history dumps in the prompt.
8. **Hosted-lite uses OAuth per user, never a shared personal token.**
   Local-mode `SLACK_USER_TOKEN` must be refused in hosted runtime.

---

## 7. Positioning Lines

Use these in README, portfolio, and pitch material.

**Technical:** Tartarus is an agentic context management system built on a
sovereign SQLite vault. It indexes work history, documents, media,
conversations, and service state, then exposes that context to AI agents
through approval-gated tools.

**Pragmatic:** Tartarus connects the systems where work already lives,
keeps the important context in one local database, and lets an AI
assistant handle administrative work without losing control of the data.

**Strategic:** Tartarus is the infrastructure layer behind agentic work —
memory, tools, integrations, routing, refinement, publishing, and
auditability in one system.
