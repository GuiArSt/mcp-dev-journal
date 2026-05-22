# Tartarus — Implementation Plan

Companion to `docs/TARTARUS_VISION_AND_ROADMAP.md`. The roadmap explains *why*
and *in what order*; this document is the *what* and *where*.

Every ticket cites real source files, names a validation command, and flags
whether it can run in parallel with the protected Slack work in progress on
the `codex-slack-vault-and-execution-plan` branch.

---

## Engineering rules

- Protect dirty work. `git status --short` first; do not revert unrelated
  changes.
- Do not touch the Slack implementation unless the ticket explicitly says so.
  Slack-protected paths:
  - `web/lib/slack/vault.ts`
  - `web/app/api/integrations/slack/**`
  - `web/app/(dashboard)/integrations/slack/page.tsx`
  - `web/scripts/slack-backfill.mjs`
  - `web/tests/lib/slack-vault.test.ts`
  - `web/package.json` `slack:backfill` script
- Validation:
  - TypeScript: `cd web && npm run typecheck -- --pretty false`
  - Web unit tests: `cd web && npm run test:run`
  - MCP root: `npm run build` and `npm test` where relevant.
  - UI: verify in `http://localhost:3005` when an authenticated session is
    available.
- Prefer adapter/scaffold work before migrating routes.
- One ticket = one validation. If you can't validate it, split it.

---

## Code map (anchors used by tickets below)

### Surfaces
- `src/` — MCP server, journal tools, registry, read-only git, HTTP bridge.
- `web/` — Next.js operator UI, port 3005.
- `website/` — public site, port 3007, separate pnpm app.

### Spines

- **Conversation persistence:** `web/lib/db-conversations.ts`,
  `web/app/api/conversations/`,
  `web/components/chat/hourglass/HourglassChat.tsx`.
- **Shelf / artifacts:** `web/components/chat/hourglass/artifacts/`,
  `web/app/api/chat-hourglass/artifact/[uuid]/route.ts`,
  `web/app/api/chat-hourglass/shelf/add/route.ts`,
  `web/lib/ai/muse-artifact.ts`.
- **Object registry:** `web/lib/object-registry.ts`,
  `web/lib/db/migrations/012_tartarus_objects.sql`,
  `src/modules/journal/db/database.ts`.
- **Tool execution:** `web/lib/ai/tools.ts`,
  `web/lib/ai/tool-executors/index.ts`,
  `web/lib/ai/tool-executors/`,
  `web/lib/ai/write-tools.ts`.
- **AI providers (today, hardcoded):** `web/app/api/chat/route.ts`,
  `web/lib/ai/model-catalog.ts` (already lists Google / Anthropic / OpenAI /
  DeepSeek / Nebius as `AiProviderKey` + tier per entry),
  `web/app/api/chat-hourglass/muse/route.ts`,
  `web/app/api/chat-hourglass/muse/edit/route.ts`,
  `web/app/api/chat-hourglass/muse/observe/route.ts`,
  `web/app/api/atropos/`, `web/app/api/hermes/`,
  `web/app/api/daimon/polish/route.ts`,
  `web/app/api/kronus/generate/route.ts`,
  `src/modules/journal/ai/`.
- **Cost / observability:** `web/lib/observability.ts` (defines
  `ai_traces`, `openAISpan`, `closeAISpan`, `recordImageCost`,
  `recomputeConversationCost`),
  `src/shared/observability.ts`, `src/shared/model-costs.ts`,
  `web/app/api/conversations/[id]/cost/route.ts`,
  `web/app/api/conversations/[id]/cost/ledger/route.ts`,
  `web/components/chat/hourglass/CostMeter.tsx`.
- **Slack vault (protected):** `web/lib/slack/vault.ts`,
  `web/app/api/integrations/slack/{cache,sync}/route.ts`,
  `web/app/(dashboard)/integrations/slack/page.tsx`,
  `web/scripts/slack-backfill.mjs`.
- **Supabase / deploy:** `web/lib/supabase/server.ts`,
  `web/lib/supabase/client.ts`, `web/app/api/storage/route.ts`,
  `web/scripts/sync-db.ts`, `web/scripts/sync-to-supabase.js`,
  `docs/supabase-schema.sql`, `docs/supabase-migrations/`,
  `web/next.config.ts`.

---

## Phase 1 — Data Vault Stabilization

### V1-SLACK-SUMMARIES-001 — Post-ingestion Slack summary pass

- **Goal:** Populate `slack_messages.summary` /
  `slack_conversations.summary` from cached rows. Summaries are generated
  **after** ingestion, never during a rate-limited Slack call.
- **Files likely touched:** new
  `web/scripts/slack-summarize.mjs`,
  new `web/app/api/integrations/slack/summarize/route.ts`,
  new `web/lib/slack/summarize.ts` (cite-only — does **not** edit
  `web/lib/slack/vault.ts`).
- **Risks:** burning background-tier tokens on noisy channels; conflicts
  with the protected Slack files if not kept separate. Mitigation: read
  vault tables directly, never modify them; write only to the
  `summary` / `summarized_at` columns.
- **Validation:** `cd web && npm run typecheck -- --pretty false`; run
  the summarize script against a small `maxConversations` and inspect
  rows in SQLite.
- **Parallel-safe:** yes, as long as it does not import from
  `web/lib/slack/vault.ts` internals beyond `ensureSlackVaultSchema`.

### V1-CONTEXT-BUDGET-001 — Per-conversation token budget enforcement

- **Goal:** Move the 100K soul-config warning from a UI hint into the
  actual `/api/chat` and chat-hourglass paths. Compute soul + chat log
  + shelf + tool-result budget once per request; fail loud if it
  exceeds a model's `contextWindow` from `model-catalog.ts`.
- **Files likely touched:** `web/app/api/chat/route.ts`,
  `web/app/api/chat-hourglass/muse/route.ts`,
  `web/lib/ai/kronus.ts`, new `web/lib/ai/context-budget.ts`.
- **Risks:** false positives blocking legitimate long chats; needs eval
  cases in Phase 7.
- **Validation:** `cd web && npm run typecheck`; manual test with a
  long history on Gemini 3.5 Flash vs Claude Sonnet 4.6.
- **Parallel-safe:** yes.

### V1-LEDGER-PROVIDER-ROLLUPS-001 — Per-day / per-provider cost rollups

- **Goal:** Add an aggregation endpoint and a dashboard tile so the
  cost meter and ledger are joined by a higher-level view. Follow-up
  from `COST-001` in the prior doc.
- **Files likely touched:** new
  `web/app/api/observability/spend/route.ts`, new
  `web/components/dashboard/SpendOverview.tsx` (or whichever
  monitor/control panel page exists), `web/lib/observability.ts`
  (additive queries only — do not change schema).
- **Risks:** none if read-only.
- **Validation:** `cd web && npm run typecheck`; visual check in the
  control panel.
- **Parallel-safe:** yes.

### V1-LEDGER-FILTERS-001 — Ledger filters by source / model / status

- **Goal:** Filters on the conversation ledger view backed by
  `ai_traces`. Follow-up from `COST-001`.
- **Files likely touched:**
  `web/app/api/conversations/[id]/cost/ledger/route.ts`,
  `web/components/chat/hourglass/CostMeter.tsx`.
- **Risks:** none if read-only.
- **Validation:** typecheck + manual ledger inspection.
- **Parallel-safe:** yes.

### V1-INTEGRATION-CACHE-CONVENTION-001 — Codify the Slack-style pattern

- **Goal:** Document the integration cache contract so future plugins
  (Linear write, Notion sync, Google) inherit the Slack doctrine: a
  `*_sync_state` table, `summary` / `summarized_at` columns on heavy
  rows, Rediscover-only directory refresh, paced backfill driver, and
  no inline summary generation. Documentation-only.
- **Files likely touched:** new `docs/INTEGRATION_CACHE_CONVENTIONS.md`.
- **Risks:** docs drift; mitigate by linking from the working-with-tartarus
  skill.
- **Validation:** review against `web/lib/slack/vault.ts` schema.
- **Parallel-safe:** yes.

---

## Phase 2 — Universal Integration Bus

### BUS-001 — IntegrationPlugin contract + plugin registry scaffold

- **Goal:** Introduce `IntegrationPlugin` and a registry without
  breaking current tool execution. Wrap one low-risk integration first
  (recommended: `memory` or `search` — **not** Linear, **not** Slack).
- **Files likely touched:** new `web/lib/integrations/`,
  `web/lib/ai/tools.ts`, `web/lib/ai/tool-executors/index.ts`,
  new tests under `web/tests/lib/integrations/`.
- **Risks:** breaking the central tool registry. Mitigation:
  registry wraps existing `toolSpecs`/`toolExecutors` without
  modifying their public shape until BUS-002.
- **Validation:** typecheck + `cd web && npm run test:run`.
- **Parallel-safe:** mostly. Avoid touching Slack executors until
  Phase 2 migrates Slack (BUS-005).

### BUS-002 — Slite plugin migration

- **Goal:** First service migrated to the plugin contract. Slite is
  read-only and self-contained, so the blast radius is small.
- **Files likely touched:** `web/lib/integrations/slite/`,
  `web/app/api/integrations/slite/sync/route.ts` (existing).
- **Validation:** typecheck + Slite sync sanity check.
- **Parallel-safe:** yes.

### BUS-003 — Notion plugin migration

- Same shape as BUS-002.
- **Parallel-safe:** yes.

### BUS-004 — Linear plugin migration

- **Goal:** Linear has both read and write tools; migrate read first,
  then write under approval gate (APPROVAL-001 dependency).
- **Parallel-safe:** yes, once BUS-002 lands.

### BUS-005 — Slack plugin migration (post-summaries)

- **Goal:** Expose Slack to Kronus through the plugin contract — but
  only summary-first tools. Raw message fetches require a UUID and
  are read-only.
- **Depends on:** V1-SLACK-SUMMARIES-001.
- **Parallel-safe:** **no** while the Slack branch is active. Schedule
  after the protected work merges.

### BUS-006 — Hosted-safe tool registry split

- **Goal:** Add `hostedSafe: boolean` to every plugin's tool specs.
  Local-only tools (filesystem, git write, Cursor delegate) are
  excluded from hosted-lite chat at the registry level.
- **Parallel-safe:** yes.

---

## Phase 3 — AI Provider Registry / BYOK

### AI-001 — AIProvider contract + tier router

- **Goal:** Centralize provider identity, capability flags, cost
  lookup, tier routing. `web/lib/ai/model-catalog.ts` already encodes
  the tier per entry — wire it.
- **Files likely touched:** new `web/lib/integrations/ai/`,
  `web/lib/ai/model-catalog.ts` (read-only consumer),
  `web/lib/observability.ts` (move `MODEL_COSTS` behind a registry
  lookup), `web/app/api/chat/route.ts` (route via registry, keep the
  existing hardcoded path behind a feature flag for one release).
- **Risks:** routing regression on `/api/chat`. Mitigation: gate
  behind `AI_REGISTRY_V1=1` env until eval suite (Phase 7) passes.
- **Validation:** typecheck + `cd web && npm run test:run` + manual
  smoke test against Gemini 3.5 Flash, Claude Sonnet 4.6, GPT-5.5.
- **Parallel-safe:** yes.

### AI-002 — DeepSeek + Nebius provider implementations

- **Goal:** Implement the two providers that already exist as
  `AiProviderKey` values but have no runtime path. Nebius is an
  OpenAI-compatible endpoint; DeepSeek is a native provider.
- **Files likely touched:** `web/lib/integrations/ai/deepseek.ts`,
  `web/lib/integrations/ai/nebius.ts`, `web/lib/ai/model-catalog.ts`
  (add specific model entries).
- **Risks:** none beyond AI-001.
- **Validation:** typecheck + provider key health-check route.
- **Parallel-safe:** yes.

### AI-003 — BYOK schema + UI

- **Goal:** Per-user API key storage with encryption-at-rest, a
  provider test button, and a per-provider enabled state. Until
  multi-user lands, system keys still take precedence; the schema and
  UI should be ready.
- **Files likely touched:** new migration adding `user_api_keys`,
  new `web/app/(dashboard)/settings/ai-keys/page.tsx`,
  `web/lib/integrations/ai/` (key resolver).
- **Risks:** key leakage. Mitigation: encrypt at rest, never log key
  values, redact in `ai_traces`.
- **Validation:** typecheck + manual key entry flow.
- **Parallel-safe:** yes.

### AI-004 — Tavily search provider (hosted-safe)

- **Goal:** Real-time web grounding exposed as one hosted-safe tool.
  Source packs only — title, URL, retrieved timestamp, excerpt,
  source type — no raw page bodies in context.
- **Files likely touched:** new
  `web/lib/integrations/search/tavily.ts`, new
  `web/app/api/integrations/search/route.ts`,
  `web/lib/ai/tools.ts`, `web/lib/ai/tool-executors/`.
- **Parallel-safe:** yes.

### AI-005 — Fallback chains with trace logging

- **Goal:** When `/api/chat`'s current fallback fires (Google →
  Anthropic → OpenAI), record the fallback in `ai_traces` so the
  ledger explains who actually ran.
- **Files likely touched:** `web/lib/integrations/ai/router.ts`,
  `web/lib/observability.ts` (additive metadata).
- **Parallel-safe:** yes.

---

## Phase 4 — Hosted Lite

### DEPLOY-001 — Deployment-mode decision document

- **Goal:** Document which combination of stores hosts each mode:
  local sovereign / hosted demo / public CMS / future multi-user.
  Decide Supabase Postgres vs SQLite-on-volume vs Supabase Storage
  per mode. Documentation-first.
- **Files likely touched:** new
  `docs/TARTARUS_DEPLOYMENT_MODES.md`.
- **Parallel-safe:** yes.

### DEPLOY-002 — `owner_id` / tenant column on user-scoped tables

- **Goal:** Schema preparation for hosted-lite. Add nullable
  `owner_id` everywhere it will be required; backfill with the local
  user id; leave existing single-user behavior unchanged.
- **Files likely touched:** new
  `web/lib/db/migrations/0xx_owner_id.sql`,
  `web/lib/db/schema.ts`, `web/lib/object-registry.ts`.
- **Risks:** migration churn. Mitigation: nullable column first, NOT
  NULL only after backfill ships.
- **Parallel-safe:** yes.

### DEPLOY-003 — Hosted-safe MCP profile

- **Goal:** A second MCP server profile (or feature flag) with no
  local filesystem, no git write, no Cursor delegate. Uses the
  hosted-safe tool flag from BUS-006.
- **Files likely touched:** `src/server.ts`, `src/config/env.ts`,
  new `src/profiles/hosted.ts`.
- **Validation:** `npm run build && npm test` at the root.
- **Parallel-safe:** yes.

### DEPLOY-004 — Slack OAuth (hosted-lite)

- **Goal:** Per-user OAuth tokens; refuse `SLACK_USER_TOKEN` env in
  hosted mode. Local mode is unaffected.
- **Files likely touched:** new
  `web/app/api/integrations/slack/oauth/{start,callback}/route.ts`,
  new `slack_user_tokens` table, `web/lib/slack/vault.ts` token
  resolution (this is the **only** Slack file this ticket touches,
  and only to switch the token source — coordinate with the active
  Slack branch).
- **Parallel-safe:** **no**, schedule after the protected Slack
  work merges.

---

## Phase 5 — Artifact Lineage / Muse Refinement

### LINEAGE-001 — Registry lineage columns

- **Goal:** Add `parent_uuid`, `lineage_root_uuid`, `lineage_depth`
  to `tartarus_objects`, plus a `refinement_events` table.
- **Files likely touched:** new
  `web/lib/db/migrations/0xx_lineage.sql`,
  `web/lib/db/schema.ts`, `web/lib/object-registry.ts`.
- **Parallel-safe:** yes.

### LINEAGE-002 — Promote `editOfArtifactUuid` out of JSON

- **Goal:** Backfill existing Muse edits from
  `media_assets.description` JSON into real lineage edges. Existing
  helper code in `web/lib/ai/muse-artifact.ts` is the source of truth.
- **Files likely touched:** new
  `web/scripts/backfill-muse-lineage.mjs`,
  `web/lib/ai/muse-artifact.ts` (read-only adapter shift).
- **Risks:** double-counting if run twice. Mitigation: idempotent
  upsert keyed on (parent_uuid, child_uuid).
- **Parallel-safe:** yes, after LINEAGE-001.

### LINEAGE-003 — ModifierAgent pattern + Muse refinement chat

- **Goal:** Generic modifier pattern; first consumer is Muse image
  refinement. Atropos / Hermes follow only after Muse works.
- **Parallel-safe:** yes, after LINEAGE-002.

### LINEAGE-004 — Prompt variant persistence

- **Goal:** Save Muse prompt alternatives + selected prompt to
  registry, linked to the parent prompt. Stops re-rolling token
  costs on duplicate proposals.
- **Parallel-safe:** yes.

---

## Phase 6 — Public CMS / Portfolio

### CMS-001 — Publish status + approval record table

- **Goal:** New `publish_status` enum + `approval_records` table.
  Reused for LinkedIn / X (Phase 6) and any external action that
  needs a persisted approval.
- **Parallel-safe:** yes.

### CMS-002 — Website renderer pulls from vault

- **Goal:** `website/` switches from static JSON to vault reads.
  Local mode reads SQLite directly; hosted mode reads Supabase
  replica.
- **Parallel-safe:** yes, but coordinate with `website/`'s pnpm
  toolchain.

### CMS-003 — `publish_to_website` + LinkedIn plugin

- **Goal:** First publish path behind the approval record.
- **Parallel-safe:** yes, after CMS-001.

---

## Phase 7 — Evaluation System

### EVAL-001 — Eval registry skeleton

- **Goal:** `web/lib/evals/` with a `defineEval()` helper, a fixture
  loader, and a minimal CLI runner. No UI yet.
- **Parallel-safe:** yes.

### EVAL-002 — Initial Tartarus suite

- **Goal:** 6–10 baseline cases:
  - Kronus main chat planning.
  - Tool-call selection.
  - Structured output validity (Entry 0 normalization).
  - Title generation.
  - Slack summary generation (after V1-SLACK-SUMMARIES-001).
  - Muse decision/proposal.
  - Search-grounded answer with citations.
- **Parallel-safe:** yes.

### EVAL-003 — Regression cases from production failures

- **Goal:** Every production "wrong answer" becomes a fixture.
  Modelled on Jobilla's cross-asset / extraction / quality judges.
- **Parallel-safe:** yes.

### EVAL-004 — Langfuse prompt versioning (or equivalent)

- **Goal:** Prompts that go to production are versioned. Promotion
  of a default model or prompt requires a measured before/after.
- **Parallel-safe:** yes.

### EVAL-005 — Eval-gated routing in AI registry

- **Goal:** Phase 3 tier defaults are justified by the eval suite,
  not by provider claims. Failing eval blocks promotion to default.
- **Depends on:** AI-001, EVAL-002.
- **Parallel-safe:** yes.

---

## Phase 8 — Security, Backup, and Full Observability

Hard gate to Kronus-as-full-agent. Earlier phases can ship without
this; autonomy cannot.

Tickets below were derived from the research in
[docs/research/SECURITY_BACKUP_OBSERVABILITY.md](./research/SECURITY_BACKUP_OBSERVABILITY.md).
Read that doc before starting any ticket — it names the exact primitives,
parameters, and trade-offs. The tickets here are the implementation
slice.

**Recommended execution order:** P8-04 → P8-05 → P8-01 → P8-02 → P8-03
→ P8-08 → P8-09 → P8-06 → P8-07 → P8-10. Snapshot and restore-drill
come first so we have a recovery path before flipping any encryption.

### RESEARCH-001 — Encryption / backup / observability stack research

**Status:** ✅ Completed 2026-05-22. Output:
[docs/research/SECURITY_BACKUP_OBSERVABILITY.md](./research/SECURITY_BACKUP_OBSERVABILITY.md)
— 5,376 words, 50 citations, recommended stack table, threat-coverage
map, and the P8-01…P8-10 ticket breakdown reflected below.
Paper-recovery-code design added 2026-05-22 (see Section 3 of the
research doc).

### P8-01 — Field encryption helper + Argon2id KDF

- **Goal:** Land `seal()` / `open()` helpers, KDF wrapper, and the
  key envelope (`vault.keystore.json` v2 with both
  `wrapped_dek_passphrase` and `wrapped_dek_recovery`). No
  consumers yet — primitives only.
- **Files:** `web/lib/crypto/field.ts` (new),
  `web/lib/crypto/kdf.ts` (new), `web/lib/crypto/envelope.ts` (new),
  `web/lib/crypto/recovery.ts` (new — Base32 recovery-code generator
  + parser), `web/tests/lib/crypto/*.test.ts` (new),
  `web/package.json` (`libsodium-wrappers`, `@node-rs/argon2`).
- **Risks:** Argon2 native binding fails on a fresh CI runner.
  Mitigation: pin prebuilt binaries; verify install on macOS arm64
  and linux x64.
- **Validation:** `cd web && npm run test:run` for the new
  crypto tests — round-trip seal/open, KDF determinism on same
  salt, envelope unwrap with passphrase, envelope unwrap with
  recovery code, dual-wrap creates two independent envelopes.
- **Parallel-safe with Slack branch:** Yes.

### P8-02 — Vault unlock route + boot env path

- **Goal:** `/api/vault/unlock` POST endpoint with passphrase or
  recovery-code paths, module-level DEK cache, and the
  `.env.local` `TARTARUS_VAULT_PASSPHRASE` boot path. Plus
  `/api/vault/status` for the UI.
- **Files:** `web/app/api/vault/unlock/route.ts` (new),
  `web/app/api/vault/status/route.ts` (new),
  `web/lib/crypto/runtime.ts` (new — singleton DEK holder,
  zeroize on SIGTERM), `web/instrumentation.ts` (modify — boot
  unlock if env present).
- **Risks:** Hot-reload in dev loses the DEK; document and accept
  (re-POST `/unlock` after restart).
- **Validation:** `curl -X POST localhost:3005/api/vault/unlock
  -d '{"passphrase":"..."}'` then `curl
  localhost:3005/api/vault/status` returns `{unlocked:true}`. Repeat
  with `{"recoveryCode":"..."}` to verify the second path.
- **Parallel-safe:** Yes.

### P8-03 — Backfill: encrypt sensitive columns

- **Goal:** Migrate existing `slack_messages.text`,
  `slack_messages.raw_json`, `ai_integrations.api_key_encrypted`
  (already partly encrypted — normalize),
  `chat_messages.content` to field-encrypted format. Old plaintext
  columns are kept until a follow-up cleanup ticket.
- **Files:** `web/scripts/encrypt-backfill.mjs` (new),
  `web/lib/db/migrations/024_encrypted_columns.sql` (new — adds
  `*_encrypted` columns where missing; does NOT drop old
  plaintext yet), `web/lib/slack/vault.ts` (modify —
  `upsertMessage` writes to `text_encrypted` going forward),
  `web/lib/chat/store.ts` (modify if it exists — same pattern).
- **Risks:** **Touches `web/lib/slack/vault.ts` — defer to
  post-merge of the protected Slack branch.** Until then,
  implement everything except the `vault.ts` write-side change.
- **Validation:** `pnpm tsx web/scripts/encrypt-backfill.mjs
  --dry-run` reports row counts; `--apply` does it;
  `cd web && npm run test:run` still passes on
  `web/tests/lib/slack-vault.test.ts` (existing tests treat
  `text` opaquely).
- **Parallel-safe with Slack branch:** **No — defer to
  post-merge.**

### P8-04 — Snapshot job + age encryption

- **Goal:** A `pnpm snapshot` command that produces an
  `age`-encrypted, chunked tarball and uploads to a dedicated
  Supabase Storage bucket (`tartarus-backups`, private). Cadence
  scaffolding (hourly WAL, daily full) lives in script flags;
  actual scheduling is operator-driven for now.
- **Files:** `web/scripts/snapshot.mjs` (new),
  `web/lib/backup/snapshot.ts` (new — testable core),
  `web/lib/backup/supabase-upload.ts` (new),
  `web/package.json` (`age-encryption`,
  `@mongodb-js/zstd` *or* shell out to system `zstd`),
  `docs/SUPABASE_BACKUP_SETUP.md` (new — bucket policy SQL).
- **Risks:** `db.backup()` blocks writes briefly under heavy
  WAL — acceptable at 02:00 local.
- **Validation:** `pnpm snapshot --dry-run` produces a local
  tarball; `pnpm snapshot` uploads; check Supabase Storage
  console for the file.
- **Parallel-safe:** Yes.

### P8-05 — Restore-drill script

- **Goal:** Weekly verification that the latest snapshot
  round-trips into a working SQLite file. Catches snapshot
  corruption, bucket policy regressions, key rotation
  mismatches, and schema drift.
- **Files:** `web/scripts/restore-drill.mjs` (new),
  `web/lib/backup/restore.ts` (new),
  `web/lib/db/migrations/025_restore_drills.sql` (new —
  `restore_drills` table),
  `web/app/(dashboard)/monitor/backups/page.tsx` (new —
  renders the last 10 drill results).
- **Risks:** Drill produces a real decrypted snapshot in
  `/tmp` — must `rm -rf` reliably even on failure; use a
  try/finally.
- **Validation:** `pnpm restore-drill` exits 0 on a healthy
  backup; exits 1 with diagnostic stderr on a tampered one
  (test by truncating a chunk before run).
- **Parallel-safe:** Yes.

### P8-06 — Sentry wiring

- **Goal:** Add `@sentry/nextjs` to the operator UI and
  `@sentry/node` to the MCP server. Source-mapped stack traces,
  not bundled column offsets.
- **Files:** `web/instrumentation-client.ts` (new),
  `web/sentry.server.config.ts` (new),
  `web/sentry.edge.config.ts` (new),
  `web/next.config.ts` (modify — `withSentryConfig` wrap),
  `src/sentry.ts` (new — for the MCP server),
  `web/package.json` + root `package.json`.
- **Risks:** Source-map upload requires `SENTRY_AUTH_TOKEN`.
  Document in `.env.example`; without it, errors still capture
  but are unsymbolicated.
- **Validation:** Throw a test error from a route; see it in
  the Sentry dashboard within 60s; stack trace shows TS line
  numbers.
- **Parallel-safe:** Yes.

### P8-07 — Integration-error table + `/monitor/integrations` page

- **Goal:** Capture Slack/Gmail/Supabase/Linear sync errors in
  a queryable local table, mirroring the memlog pattern.
- **Files:** `web/lib/db/migrations/026_integration_errors.sql`
  (new), `web/lib/observability/integrations.ts` (new —
  `recordIntegrationError({source, scope, error, context})`),
  `web/app/api/observability/integrations/route.ts` (new),
  `web/app/(dashboard)/monitor/integrations/page.tsx` (new),
  call sites in `web/lib/slack/vault.ts` (1-line in the
  `saveSyncState({error})` path) and any future Gmail/Linear
  sync.
- **Risks:** **Touches `web/lib/slack/vault.ts` — 1-line
  call, low conflict risk, but still coordinate.** Implement
  as a no-op stub until the Slack branch merges, then wire.
- **Validation:** Trigger a Slack rate limit
  (`maxRateLimitWaitMs: 0`), see a row in
  `integration_errors`, see it in `/monitor/integrations`.
- **Parallel-safe with Slack branch:** **Mostly** — defer the
  `vault.ts` integration to post-merge; everything else is
  parallel.

### P8-08 — Capability declarations on MCP tools

- **Goal:** Add `capabilities: Capability[]` field to every
  tool spec in `src/`. **Declarative only — no enforcement
  yet.** Tools opt in to "no permissions" with an explicit
  empty array, never by omission.
- **Files:** `src/types.ts` (modify — `ToolSpec` shape),
  every tool file under `src/tools/**` (add the capabilities
  array, ~30 files), `src/policy/capabilities.ts` (new —
  vocabulary + helpers).
- **Risks:** Many files touched; do as one mechanical sweep
  with code review focused on whether each tool's declaration
  is correct (under-declaring is a security risk).
- **Validation:** `pnpm tsx src/scripts/lint-capabilities.ts`
  reports any tool with missing `capabilities`.
- **Parallel-safe:** Yes (no overlap with Slack branch).

### P8-09 — Policy engine + signed-approval flow

- **Goal:** Build the policy decision engine, the approval
  queue, the Ed25519 signature path, and the audit log.
- **Files:** `web/lib/policy.ts` (new),
  `web/lib/policy/operator-key.ts` (new — Ed25519 keygen +
  sign + verify, uses `libsodium-wrappers`),
  `data/policy.json` (new — default policy,
  version-controlled), `data/policy.local.json` (new —
  per-user override, **gitignored**),
  `web/lib/db/migrations/027_agent_approvals.sql` (new —
  `agent_approvals` + `agent_audit` tables, with
  no-update/no-delete triggers),
  `web/app/api/agent/approvals/route.ts` (new),
  `web/app/(dashboard)/monitor/approvals/page.tsx` (new),
  `web/app/(dashboard)/monitor/audit/page.tsx` (new),
  `src/runtime/policy-gate.ts` (new — the PreToolUse
  interceptor).
- **Risks:** Signing key on disk needs file mode 0600 —
  script enforces this on creation; tests assert mode.
  Operator-key loss = no future approvals, but past
  approvals remain verifiable until rotation point.
  Documented in `docs/RESTORE_PLAYBOOK.md`.
- **Validation:** Configure a test tool with
  `capabilities: ["egress.linear"]`
  (policy: `require_approval`); call it; see pending row in
  `/monitor/approvals`; approve; verify execution;
  check `agent_audit` has one row with signature reference.
- **Parallel-safe:** Yes.

### P8-10 — Observability redaction pass

- **Goal:** Add a `redact()` filter before
  `truncateForStorage()` in `web/lib/observability.ts` that
  strips obvious secrets (API keys, JWTs, OAuth tokens, email
  addresses if configured).
- **Files:** `web/lib/observability.ts` (modify — wrap
  `truncateForStorage` calls),
  `web/lib/observability/redact.ts` (new — regex list for
  known secret patterns), `web/tests/lib/redact.test.ts`
  (new).
- **Risks:** False positives (a UUID looks like a JWT to a
  naive regex). Ship with conservative patterns + a "do not
  redact" allowlist (e.g., trace IDs).
- **Validation:** `cd web && npm run test:run` on the new
  redact test, covering AWS keys, Anthropic keys, Slack
  tokens, Stripe keys, generic Bearer tokens.
- **Parallel-safe:** Yes.

---

## Cross-phase guardrail tickets

### APPROVAL-001 — Hourglass write-tool audit

- **Goal:** Hourglass tool execution honors `requiresConfirmation()`
  from `web/lib/ai/write-tools.ts` end-to-end. The legacy
  `ChatInterface.tsx` already does; Hourglass needs the same.
- **Files likely touched:**
  `web/components/chat/hourglass/HourglassChat.tsx`,
  `web/lib/ai/write-tools.ts`.
- **Parallel-safe:** yes.

### APPROVAL-002 — Destructive route inventory + `requireManualAction` helper

- **Goal:** One shared helper, one inventory doc, one decision per
  route: archive / soft delete / external delete / hard delete.
- **Files likely touched:** new `web/lib/api/require-manual-action.ts`,
  new `docs/DESTRUCTIVE_ROUTE_INVENTORY.md`, audit pass across
  `web/app/api/**/route.ts`.
- **Parallel-safe:** yes.

### AGENT-001 — Canonical `AGENTS.md`

- **Goal:** Short root-level operating manual that links to this
  document and the roadmap, names the three surfaces, and encodes
  the dirty-work / approval / AI-SDK strictness invariants from the
  working-with-tartarus skill.
- **Files likely touched:** new `AGENTS.md`,
  `.agents/skills/working-with-tartarus/SKILL.md` (link back).
- **Parallel-safe:** yes.

---

## Suggested execution order while the Slack branch is open

1. AGENT-001 (no Slack risk).
2. V1-LEDGER-PROVIDER-ROLLUPS-001 + V1-LEDGER-FILTERS-001 (read-only
   on `ai_traces`).
3. V1-CONTEXT-BUDGET-001 (touches `/api/chat`, not Slack).
4. V1-INTEGRATION-CACHE-CONVENTION-001 (doc-only).
5. APPROVAL-001 (Hourglass-only, no Slack).
6. BUS-001 + BUS-002 (memory or Slite first, never Slack).
7. AI-001 behind a flag, then AI-002 and AI-003.
8. LINEAGE-001 + LINEAGE-002.

Defer until after the Slack branch merges:

- V1-SLACK-SUMMARIES-001 (new files only — but easier to land after
  the branch is in main).
- BUS-005 (Slack plugin migration).
- DEPLOY-004 (Slack OAuth).
