# Tartarus — Security, Backup, Observability

Scope: a single-user agentic context-management system. SQLite (`data/journal.db`) is the immovable canonical store. Supabase Storage is the only hosted dependency we want to lean on for backups. The dominant threat is host compromise: the cloud must hold ciphertext only. The second threat is future Kronus autonomy: every agent action must be scoped, signed, and revocable.

Researched 2026-05-22.

---

## 1. TL;DR — Recommended stack

| Concern | Recommendation | Rationale |
|---|---|---|
| Encryption at rest (vault DB) | Application-level field encryption with libsodium `crypto_secretbox` (XChaCha20-Poly1305) on a denylist of sensitive columns; keep SQLite plaintext for indexes | Host-blind on the *backup* path; preserves Drizzle, FTS, and Slack join queries; no native rebuild |
| Backup file encryption | `age` via the `age-encryption` npm package — encrypt before upload to Supabase Storage | Audited format, streams cleanly, X25519 recipient + passphrase work-factor, no binary dep |
| KDF for the master passphrase | Argon2id via `@node-rs/argon2` — m=64 MiB, t=3, p=1 | OWASP 2026 baseline +headroom; pure Rust binding, no node-gyp |
| Key wrapping | Data Encryption Key (DEK, 32-byte random) wrapped by passphrase-derived KEK; envelope written to `data/vault.keystore.json` | Lets you rotate passphrase without re-encrypting the vault |
| Runtime key storage | In-process memory only; unlock on app boot via env var or `/api/vault/unlock`. No keychain in Phase 8 | Single-machine, single-user — keychain adds OS-vendor coupling without buying much |
| Snapshot format | SQLite online `.backup` API → `tar` → `age` → Supabase Storage, chunked at 64 MiB | Atomic page-level copy under WAL load; no rsync hazards |
| Cadence / retention | Hourly incremental (WAL only), daily full, 14 daily + 8 weekly + 6 monthly | Restore-from-yesterday is the realistic bar for a single user |
| Restore drill | Weekly `scripts/restore-drill.mjs` that pulls latest snapshot, decrypts to a sandbox dir, opens DB, asserts row counts, deletes | A backup not restored is fiction |
| Error/trace observability | Sentry (cloud, free single-dev tier) for client+server errors; Langfuse cloud for AI traces (already covered by `ai_traces`) | Self-hosting Langfuse means Postgres+Clickhouse+Redis+S3 — strictly overkill for one user |
| External-sync errors | Reuse the memlog beacon pattern in a new `integration_errors` SQLite table + `/monitor/integrations` page | Mirrors existing shape; no parallel system |
| Agent capability scoping | `capabilities` array on every MCP tool spec + a `policy.json` allow/deny list; signed approval row in `agent_approvals` for any non-`read` capability | Fits MCP, fits the existing `src/` server, gives Kronus a revocable kill-switch |
| Audit log | Append-only `agent_audit` table; one row per tool invocation with capability, args hash, policy decision | Replayable, queryable from the existing dashboard |

---

## 2. Encryption at rest

**Primary recommendation: application-level field encryption with libsodium, not SQLCipher.**

The trade-off is sharp and the codebase makes the answer easy. SQLCipher gives you whole-file encryption — every page, every byte, including the indexes — which is great for laptop-theft scenarios. But (a) the laptop is already FileVault-protected and we said laptop theft is out of scope; (b) SQLCipher encrypts at the page layer, so a `SELECT … WHERE text LIKE …` still works only if the file is unlocked, which means the key sits in memory anyway; (c) the path to SQLCipher in Node is either [`better-sqlite3-multiple-ciphers`](https://www.npmjs.com/package/better-sqlite3-multiple-ciphers) (drop-in replacement for `better-sqlite3`, currently at 12.8.0, MIT, last release within the past year) or a custom build of upstream [`SQLCipher 4.13`](https://www.zetetic.net/blog/2026/01/20/sqlcipher-4.13.0-release/) released 2026-01-20. Both require swapping the native binding for the whole DB. That's a migration we don't need to pay for: the *backup* is where ciphertext matters, and the backup goes to Supabase encrypted by `age` regardless.

What we *do* need at the SQLite layer is targeted protection for high-sensitivity columns so that, if a dev accidentally `cp data/journal.db` to a shared dir or a stray log line dumps a row, the secret bits are still opaque. Candidates: `slack_messages.text`, `slack_messages.raw_json`, `ai_integrations.api_key_encrypted` (already field-encrypted today — extend the pattern), conversation transcripts in `chat_messages`, anything in `repository_documents.body` flagged `private`. Everything else stays plaintext because we need FTS, joins, and `LIKE`.

**Library pick:** [`libsodium-wrappers`](https://www.npmjs.com/package/libsodium-wrappers) (`crypto_secretbox_easy` = XChaCha20-Poly1305, 24-byte nonce, 16-byte MAC). License ISC, ~290 KB, runs in Node and browser identically, no native deps. The big nonce means we can generate nonces with `crypto.randomBytes(24)` and ignore birthday-collision math. Per-column encrypted values are stored as `base64(nonce || ciphertext || tag)` — a single TEXT column, no schema split.

Loss to weigh: encrypted columns are query-opaque (no `LIKE`, no FTS). Mitigation: build the FTS index over a *summary* column (we already do `summarized_at` / `summary` for Slack), and store the encrypted blob alongside. Summaries leak topic but not verbatim content — an acceptable trade for a single-user system where the user is also the summarizer.

**Migration cost.** One Drizzle migration to widen the target columns to TEXT (most already are), one wrapper helper in `web/lib/crypto/field.ts` exposing `seal(plaintext)` / `open(ciphertext)`, and a background backfill script that streams existing rows through `seal` in a transaction. Hosted-lite portability is preserved: the same encrypted blobs round-trip through Supabase Postgres if/when Phase 4 lands.

See also (rejected):
- **SQLCipher / better-sqlite3-multiple-ciphers** — whole-file encryption, but locks us to a single native binding and doesn't help the backup path; revisit only if the threat model expands to "laptop is unlocked while attacker has shell".
- **Page-level encryption via SQLite's built-in `SEE`** — proprietary, paid, ignored.
- **Encrypt at the Drizzle layer with a custom dialect** — fragile, every raw `db.prepare(...)` bypasses it.

---

## 3. Key management

**KDF: Argon2id via [`@node-rs/argon2`](https://www.npmjs.com/package/@node-rs/argon2) v2.0.2 (MIT, last published mid-2025).** Parameters: `memoryCost = 65536` (64 MiB), `timeCost = 3`, `parallelism = 1`. That's above the [OWASP 2026 minimum](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) (19 MiB / t=2) and matches the "security-conscious" tier from the [2026 password-hashing comparison](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/). On an M-series Mac it runs in ~300 ms — fine for a once-per-boot unlock. The Rust binding avoids node-gyp and the [3.7 MB → 476 KB install-size win](https://www.npmjs.com/package/@node-rs/argon2) matters for the Vercel build cache. scrypt is rejected because Argon2id is the PHC winner and has clearer side-channel guarantees against GPU/ASIC attackers.

**Envelope:**

```
passphrase --Argon2id(salt,64MiB,t=3)--> KEK (32B)
DEK = randomBytes(32)        // generated once at vault init
wrapped_DEK = secretbox(DEK, nonce, KEK)
```

Persisted to `data/vault.keystore.json`:

```json
{
  "version": 1,
  "kdf": { "name": "argon2id", "m": 65536, "t": 3, "p": 1, "salt": "base64..." },
  "wrapped_dek": "base64(nonce || ciphertext || tag)",
  "created_at": "2026-05-22T...",
  "rotated_at": null
}
```

Field encryption uses the DEK directly. Passphrase rotation re-wraps the DEK only — no row touched. DEK rotation re-encrypts touched columns in a one-shot script, then atomically swaps `vault.keystore.json` (we keep the old DEK around for 24h to decrypt anything still in flight).

**Where the unlocked DEK lives at runtime:** **in-process memory only.** Two unlock paths:

1. **Boot env:** `TARTARUS_VAULT_PASSPHRASE=…` in `.env.local`, never committed. On Next.js server start, derive KEK + unwrap DEK, store in a module-level `let dek: Uint8Array | null`. Zeroize on `SIGTERM` (best effort — V8 can't truly guarantee zero, but `dek.fill(0)` covers the common case).
2. **Interactive:** `POST /api/vault/unlock` with the passphrase, derives + unwraps + sets the module var. Used when env vars aren't an option (e.g., shared dev box).

OS keychain (`@github/keytar` via [keytar-node](https://github.com/Brooooooklyn/keyring-node)) — **rejected for Phase 8.** It introduces a per-OS dependency, doesn't help on the server-side Vercel path, and the value-add (passphrase autounlock) is small for a single user who already types their FileVault password every boot. Reconsider in Phase 4 if Tartarus runs as a long-lived daemon.

**Passphrase recovery: opt-in paper recovery code, no online escrow.** The vault is a memory aid built over years — losing the passphrase means losing the encrypted columns and the encrypted backups. Pure no-recovery is technically defensible but operationally unforgiving. The compromise:

- At vault init, the user is offered a **128-bit recovery secret** generated on the client. It is printed once (Base32, 5 word-groups of 5 chars) and never stored digitally. The user puts it somewhere physical: 1Password emergency kit, a paper safe, a sealed envelope.
- The DEK is wrapped **twice** in the keystore: once under the passphrase-derived KEK (`wrapped_dek_passphrase`), once under a KEK derived from the recovery secret via the same Argon2id parameters (`wrapped_dek_recovery`).
- Recovery: the user types the 25 chars on the unlock screen, Argon2id derives the second KEK, unwraps the DEK, then prompts them to set a new passphrase (which re-wraps `wrapped_dek_passphrase` and leaves `wrapped_dek_recovery` untouched).
- **Opt-out is allowed.** The init flow makes the trade-off explicit: "no recovery code = unrecoverable if you forget. I accept this." Users with strong key-management hygiene (hardware tokens, etc.) can refuse the code.
- **No online escrow, no email-reset.** The recovery secret never touches a server, never goes in 1Password unless the user puts it there themselves, and Tartarus has no way to regenerate or recover it. Lose both the passphrase and the paper, lose the vault.

Updated keystore (`data/vault.keystore.json`):

```json
{
  "version": 2,
  "kdf": { "name": "argon2id", "m": 65536, "t": 3, "p": 1 },
  "wrapped_dek_passphrase": {
    "salt": "base64...",
    "wrapped": "base64(nonce || ciphertext || tag)"
  },
  "wrapped_dek_recovery": {
    "salt": "base64...",
    "wrapped": "base64(nonce || ciphertext || tag)",
    "enabled": true
  },
  "created_at": "2026-05-22T...",
  "passphrase_rotated_at": null,
  "recovery_rotated_at": null
}
```

Cost of this addition: one extra `secretbox` at init, one extra unlock code path, a "print this once" UI screen. Recovery KEK derivation is the same Argon2id work, just on a 128-bit-entropy input instead of a passphrase. **The cryptographic strength of recovery is bounded by the 128-bit secret**, not the Argon2id parameters — that's fine, 128 bits of true randomness is well beyond practical brute-force.

Threat-model note: the recovery code becomes the **most dangerous physical artifact** in the system. Treat it like a hardware wallet seed phrase. Lose it = no recovery. Steal it = vault compromise. The init UI must say this in plain text, not legalese.

---

## 4. Backup recipe

**Snapshot format: SQLite online backup API → tarball → age-encrypt → Supabase Storage.**

Why not Litestream: [Litestream v0.5.x](https://github.com/benbjohnson/litestream) is actively maintained and excellent, but it's a Go daemon designed for continuous replication of *server* databases to S3-compatible object stores. Running it alongside Tartarus on a laptop introduces a process lifecycle problem (it has to be up whenever the DB is being written) and Supabase Storage is not an S3-compatible endpoint Litestream knows about — we'd be stitching it onto an [S3-compatible shim](https://supabase.com/docs/guides/storage). The single-user/single-machine cost is higher than the value. **Use it in Phase 4 when there's a hosted server.**

Why not raw `cp data/journal.db`: WAL mode means `cp` can grab a torn page mid-checkpoint. The [SQLite online backup API](https://www.sqlite.org/backup.html) handles this correctly and is already exposed by `better-sqlite3` as `db.backup(path)`.

**The snapshot script** (`web/scripts/snapshot.mjs`, new):

1. Open `data/journal.db` read-only.
2. `db.backup('/tmp/tartarus-snap-<ts>/journal.db')` — page-level copy under WAL.
3. Include sibling files: `data/observability.db`, `data/gmail-triage/`, `data/vault.keystore.json`, the contents of `web/lib/db/migrations/` (so we know which schema the snapshot belongs to).
4. `tar -cf` the snapshot dir, pipe through `zstd -19` (gives ~3× over gzip on JSON-heavy SQLite), pipe through `age --encrypt --recipient $TARTARUS_AGE_RECIPIENT`.
5. Chunk into 64 MiB pieces (`split -b 64m`) — Supabase Storage's [signed upload endpoint](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl) tolerates large blobs but a multi-part chunked upload makes failed transfers resumable.
6. Upload to private bucket `tartarus-backups/<yyyy>/<mm>/<dd>/snap-<ts>.<n>.age`.

[`age-encryption`](https://www.npmjs.com/package/age-encryption) (TypeScript port of FiloSottile's age, depends on noble crypto, Node 20+ compatible) is the recommendation. License BSD-3. Use a single X25519 recipient generated at vault init and stored alongside the keystore. Loss of the age identity = loss of backups — same blast radius as the passphrase, mitigated the same way (don't lose it).

**Compression.** `zstd` level 19 on the tarball before `age`. Library: [`@mongodb-js/zstd`](https://www.npmjs.com/package/@mongodb-js/zstd) (pure Rust binding) or the system `zstd` binary shelled out — system binary is simpler.

**Chunk size: 64 MiB.** Supabase Storage doesn't enforce a hard upper limit on the [v2 API](https://supabase.com/docs/guides/storage/buckets/fundamentals), but 64 MiB is the smallest unit where the per-request overhead is negligible while still letting a flaky connection recover. For a vault that grows into the GB range (Slack backfill, image artifacts), this becomes ~15-50 chunks per snapshot — manageable.

**Cadence and retention.**

- **Hourly:** copy the current WAL only (`data/journal.db-wal`) into an `age`-encrypted blob. Cheap, single chunk. Keep 24 of these.
- **Daily:** full snapshot per the recipe above. 02:00 local. Keep 14.
- **Weekly:** promote Sunday's daily to the weekly tier. Keep 8.
- **Monthly:** promote the first daily of each month to monthly. Keep 6.

Total worst-case storage at a 1 GB vault: ~14 + 8 + 6 = 28 fulls × ~300 MB compressed = ~8 GB. Supabase Storage's free tier covers it; paid tier is `$0.021/GB-month` — trivial.

**Supabase Storage bucket policy.** Bucket `tartarus-backups`: **private**, no public reads. RLS policies on `storage.objects`:

```sql
-- Only the service role (used by the snapshot job) can write
CREATE POLICY "backups_write_service" ON storage.objects
  FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'tartarus-backups');

-- Only the authenticated owner can read (via signed URL)
CREATE POLICY "backups_read_owner" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'tartarus-backups' AND owner = auth.uid());
```

Snapshot uploads use the `sb_secret_*` service key from `.env.local`. Restore reads use a [time-limited signed URL](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl) (`createSignedUrl(path, 300)`), never a public URL — public buckets bypass RLS entirely and that's not what we want for ciphertext-at-rest either (defense in depth).

### Restore drill

A backup that hasn't been restored is fiction. This is the part most teams skip. The drill script (`web/scripts/restore-drill.mjs`, new) runs weekly via a cron-equivalent — for Tartarus, a manually-invokable npm script that's also wired into a once-a-week Kronus reminder.

What it does:

1. List the latest 5 snapshots in Supabase Storage. Assert: at least one in the last 25h.
2. Generate signed URLs for each chunk of the latest daily snapshot.
3. Stream-download to `/tmp/restore-drill-<ts>/`.
4. Concatenate chunks (`cat snap-*.0.age snap-*.1.age … > full.tar.age`).
5. `age --decrypt -i <identity-file>` to a tarball. Assert: file > 1 KB, header is `tar`.
6. Extract to a sandbox dir. Assert: `journal.db` exists, `vault.keystore.json` exists, migrations dir is non-empty.
7. Open the SQLite file with `better-sqlite3` in `readonly: true`. Run integrity checks:
   - `PRAGMA integrity_check` returns `ok`.
   - `SELECT COUNT(*) FROM ai_traces` returns ≥ live count − 5% (small drift OK if backup is from earlier in the hour).
   - `SELECT COUNT(*) FROM slack_messages` is non-zero if Slack vault is configured.
   - Open one encrypted column, decrypt with the live DEK, assert UTF-8.
8. Delete the sandbox dir.
9. Write one row to `restore_drills` (new table: `started_at`, `ended_at`, `snapshot_path`, `result`, `rows_checked`, `notes`).
10. If anything fails: emit a `[restore-drill]` error to Sentry **and** write a Kronus alert.

Failure modes it catches:
- Snapshot job silently broken (no fresh backups).
- Upload corruption (chunks don't concatenate cleanly, age MAC fails).
- age identity file rotated but old snapshots still using old recipient.
- SQLite page corruption (integrity_check fails — happens in practice if WAL was mid-checkpoint).
- DEK lost or rotated without re-encryption (encrypted column decrypt fails).
- Schema drift (migration count in snapshot ≠ migration count in current code, surfaces as a warning).

What it does NOT catch: bit rot in old snapshots (only the latest is tested). Mitigation: every 4th week, the drill targets a random snapshot from the monthly tier.

---

## 5. Observability stack

**Recommendation: Sentry cloud for errors/traces (web app + MCP server), Langfuse cloud for AI traces (optional alongside the existing `ai_traces` table), no self-hosted Langfuse.**

Self-hosting Langfuse means standing up [Postgres, ClickHouse, Redis/Valkey, and an S3-compatible blob store](https://langfuse.com/self-hosting). That's a four-service stack with [non-trivial version pinning](https://langfuse.com/self-hosting/deployment/infrastructure/clickhouse) (ClickHouse must be ≥24.3 but ≤25.5.2 due to a known deletion bug) for a system whose primary value is being a single-user knowledge tool. It's not just "overkill" — it's an operational rabbit hole that will outweigh Tartarus itself. Reject.

The existing `ai_traces` table in [`web/lib/observability.ts`](../../web/lib/observability.ts) already does 80% of what Langfuse does for one user: per-span cost, latency, model, token counts, conversation rollup. It's queryable from SQLite, exposed via the `/monitor/*` pages, and survives in the same snapshot as the rest of the data. The gap is *visualization* — trace tree views, waterfall charts, prompt-diff comparisons. If/when that gap bites, sign up for Langfuse cloud (free tier covers a single user) and dual-write from `traceAI()`. **Don't run their infra to get their UI.**

For app errors / API traces / external sync errors:

- **Sentry cloud, free tier.** [`@sentry/nextjs`](https://www.npmjs.com/package/@sentry/nextjs) v10.x supports [Next.js 16 including Turbopack and `proxy.ts`](https://docs.sentry.io/platforms/javascript/guides/nextjs/). MIT-licensed SDK. Covers React error boundaries, server-side API route errors, and Edge runtime. Set up: one `instrumentation-client.ts` + one `sentry.server.config.ts`. Done.
- **External sync errors** (Slack rate limit, Gmail auth failure, Supabase upload retry exhaustion) — write to a new `integration_errors` SQLite table, mirroring the `client_memlog` shape from migration 022. New `/monitor/integrations` page renders the latest 100 with filters. This stays local and queryable; Sentry gets a separate event with the same correlation id only for outright failures (not retries).
- **AI traces** keep going to `ai_traces` exactly as today; the `/monitor/traces` page is already the Langfuse-like view. Don't fork it.

Rejected alternatives:
- **OpenTelemetry collector + Grafana Tempo / SigNoz** — even more infra than Langfuse self-host, and we'd be back to running a Postgres+ClickHouse equivalent. SigNoz is the closest single-binary option but it still wants ClickHouse.
- **PostHog self-host** — heavier still, optimized for product analytics not observability, and the [PostHog MCP integration](https://github.com/PostHog/posthog) wouldn't pull its weight for a single user.
- **Pure SQLite, skip Sentry entirely** — viable, but Sentry's free tier costs nothing and gives source-mapped stack traces from prod-bundled Next.js that we cannot get from a SQLite table without a lot of glue. The marginal effort to add Sentry is ~30 min; the marginal value (one good stack trace per outage) is high.

A note on flux: the OpenTelemetry-for-JS story in 2026 is still consolidating around [the official Node SDK](https://opentelemetry.io/), and Vercel ships its own [tracing instrumentation](https://vercel.com/docs/observability/otel-overview) that overlaps awkwardly with `@sentry/nextjs`. If Tartarus ever deploys to Vercel for the operator UI (Phase 4), revisit — Vercel's free observability tier may obsolete part of this stack.

---

## 6. Agent capability scoping

Survey of existing patterns, since this is the foundation for Kronus autonomy:

- **LangChain tools** — capabilities are implicit; a `Tool` is just a name + schema + function. No declarative permissions, no signing. Permission gating is left to the host (LangSmith provides audit logs, not enforcement). Lesson: don't reinvent LangChain's mistake of trusting the tool name.
- **AutoGen / Microsoft Agent Framework** — has `human_input_mode` ("ALWAYS" / "NEVER" / "TERMINATE") as a crude approval gate. No per-tool capability declarations. Lesson: a binary "ask the human" toggle is not enough; we need scoped capabilities.
- **OpenAI Swarm / Assistants** — function specs include a JSON Schema for arguments but no separate capability declaration. The OpenAI [Responses API](https://platform.openai.com/docs/) has `metadata.requires_approval` per tool — closest to what we want. Lesson: declarative `requires_approval` works.
- **Anthropic tool-use + MCP** — the [MCP 2026 spec](https://modelcontextprotocol.io/) defines tool annotations including `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`. Servers like the Anthropic Agent SDK provide a [`PreToolUse` hook](https://www.augmentcode.com/guides/anthropic-agent-sdk-what-ships-vs-what-you-build) for interception. Kong, Auth0, and others have shipped [MCP gateways that filter tool visibility per agent](https://konghq.com/blog/engineering/mcp-tool-governance-security-meets-context-efficiency). Lesson: build on MCP's tool annotations + a local PreTool gate, don't invent a new schema.

**Recommended capability declaration shape.** Every tool spec (the MCP definitions in `src/`) gets a `capabilities` array. Suggested vocabulary, additive over MCP's hints:

```ts
type Capability =
  | "read.journal"        // read entries, attachments, project summaries
  | "read.repository"     // read documents, CV, portfolio
  | "read.cache"          // read Linear/Slite/Slack mirrored caches
  | "read.observability"  // read ai_traces, memlog, restore_drills
  | "write.journal"       // create/update journal entries
  | "write.repository"    // create/update documents
  | "write.cache"         // refresh integration caches
  | "egress.network"      // any outbound HTTP not to Anthropic/OpenAI
  | "egress.linear"       // Linear write API
  | "egress.slack"        // Slack write API (post message)
  | "egress.gmail"        // Gmail send
  | "egress.git"          // git commit / push
  | "exec.shell"          // bash, anything that can run arbitrary code
  | "exec.sql"            // raw SQL against the SQLite vault
  | "spend.tokens"        // any LLM call — implies cost
  | "spend.images";       // image generation — flat fee per call
```

Each tool declares its capabilities and the policy engine decides yes/no. A tool declaring `exec.shell` is *never* allowed without an explicit signed approval, regardless of policy.

**Where it lives — tool spec AND skill manifest.**

- **Tool spec** (canonical, in MCP server code under `src/`): the `capabilities` array is part of the tool's registration. This is what the runtime enforces.
- **Skill manifest** (a new `skill.json` next to each skill in `.claude/skills/`): declares the *maximum* set of capabilities the skill is allowed to request. The runtime computes `effective = tool.capabilities ∩ skill.maxCapabilities` and denies anything in `tool.capabilities \ skill.maxCapabilities`.

Both layers because the tool author and the skill author are different audiences. A tool says "I need to write to Slack." A skill says "When I'm running, the agent may post to Slack but not to Gmail." The intersection is what the policy engine evaluates.

**Policy engine (`web/lib/policy.ts`, new):**

```ts
interface PolicyDecision {
  allow: boolean;
  requiresApproval: boolean;
  reason: string;
  capability: Capability;
}

function decide(tool: ToolSpec, skill: SkillManifest, context: AgentContext): PolicyDecision
```

Default policy (`data/policy.json`, version-controlled):

```json
{
  "default": "deny",
  "rules": [
    { "capabilities": ["read.*"], "decision": "allow" },
    { "capabilities": ["spend.tokens", "spend.images"], "decision": "allow", "budget": { "daily_usd": 5 } },
    { "capabilities": ["write.journal", "write.repository"], "decision": "allow_with_audit" },
    { "capabilities": ["write.cache", "egress.linear", "egress.slack"], "decision": "require_approval" },
    { "capabilities": ["egress.gmail", "egress.git", "exec.shell", "exec.sql"], "decision": "require_signed_approval" }
  ]
}
```

**Signed approval records.** When a capability requires approval, the runtime:

1. Generates an approval request: `{ id, tool, args, capabilities, requested_at, agent_session }`.
2. Surfaces it in `/monitor/approvals` (new page) — the human approves or rejects.
3. On approval, the runtime signs the request with a long-lived Ed25519 key (`data/operator.key`, generated at first boot, never leaves disk) and writes the signed blob to `agent_approvals` table: `id, request_json, signature, signed_at, expires_at, used_at`.
4. The tool runtime verifies the signature before executing. Approvals are single-use (`used_at` set) and expire after 5 minutes for `require_signed_approval`, 1 hour for `require_approval`.

The signing key is *not* the vault DEK. It's a separate Ed25519 operator key, because the threat models differ: vault encryption protects the *backup*, the operator key protects the *audit trail*. Even if Kronus is compromised and starts forging approvals, every approval is signed with a key it doesn't have — the audit log is tamper-evident.

**Audit log (`agent_audit` table, new):** one row per tool invocation:

```sql
CREATE TABLE agent_audit (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  tool_name TEXT NOT NULL,
  capabilities TEXT NOT NULL,             -- JSON array
  args_hash TEXT NOT NULL,                -- sha256 of canonical args
  args_preview TEXT,                      -- first 2KB, possibly redacted
  policy_decision TEXT NOT NULL,          -- allow | deny | require_approval
  approval_id TEXT,                       -- FK to agent_approvals
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT,                            -- success | error | denied
  error_message TEXT
);
```

This is *the* compliance surface for "what did Kronus actually do." Pair with `/monitor/audit` (paginated, filterable by capability/tool/decision).

---

## 7. Threat-model coverage map

| Threat | In-scope vector | Mitigation in this stack | Residual gap |
|---|---|---|---|
| **Supabase compromise / subpoena — backups** | Attacker reads `tartarus-backups` bucket | `age` encryption with X25519 recipient kept locally; Supabase sees ciphertext only; private bucket + RLS as defense-in-depth | If attacker also has the laptop, FileVault is the last line — out of scope per brief |
| **Supabase compromise — Storage credentials** | Service role key exfiltrated, attacker uploads malicious replacements | Snapshot manifests should be Ed25519-signed by the snapshot job; restore drill verifies signature | **Gap:** signature-on-snapshots not in the Phase 8 ticket list — add later if threat is realized |
| **Vercel compromise (if web app hosted there in Phase 4)** | Attacker reads env vars | `TARTARUS_VAULT_PASSPHRASE` is the crown jewel; document not setting it in Vercel env at all and using interactive unlock instead | **Gap:** interactive unlock UX on a hosted deployment is unsolved; Phase 4 problem |
| **Disk image of `data/journal.db` leaks** | Stolen laptop pre-FileVault, errant `cp` to shared dir, dev rsync to wrong host | Sensitive columns are libsodium-encrypted with DEK held only in memory | **Gap:** plaintext columns (Slack channel names, conversation titles, summaries) still leak metadata; accepted trade for queryability |
| **Future Kronus autonomous misbehavior — destructive action** | Kronus executes `exec.shell` or `egress.git push --force` | Capability declaration forces signed approval; Ed25519 operator key not accessible from agent context | **Gap:** if the human approver is also Kronus-impersonated (UI compromise), the signature still happens. Mitigate by displaying capability+args in raw form on the approval modal |
| **Future Kronus — silent exfiltration** | Kronus calls `egress.network` to attacker-controlled endpoint | `egress.network` is in `require_approval`; deny-by-default; audit log captures every call | **Gap:** AI calls themselves (`spend.tokens`) hit Anthropic/OpenAI/Google — those providers see prompts. Accepted: in scope of "we trust the LLM vendor" |
| **Future Kronus — audit log tampering** | Kronus tries to delete its own `agent_audit` rows | Audit table has `CREATE TRIGGER` preventing DELETE/UPDATE; daily snapshot freezes a copy | **Gap:** Kronus with `exec.sql` could drop the trigger. Mitigate: `exec.sql` is `require_signed_approval` with mandatory args inspection |
| **Passphrase loss** | User forgets, vault unrecoverable | Documented, no recovery — accepted | **Gap:** none — this is by design |
| **Backup that hasn't been restored** | Snapshots accumulate, none verified, real restore fails | Weekly `restore-drill.mjs`, fails loudly via Sentry + Kronus alert | **Gap:** bit rot in old snapshots only sampled monthly |
| **Observability data leak (traces contain secrets)** | `ai_traces.input` / `.output` contains an API key the user pasted | Existing 8 KB truncation in `truncateForStorage` is not redaction; need a regex pass before insert | **Gap:** add a `redact()` pass in Phase 8 ticket |
| **MCP server compromise (the `src/` server itself)** | Bad input to MCP tool → arbitrary effect | Capability declarations on every tool; policy engine intercepts before execution | **Gap:** capability-less legacy tools must be migrated; tracked in Phase 8 ticket |
| **Slack token exfiltration** | `SLACK_USER_TOKEN` or `SLACK_BOT_TOKEN` env leaks | Out of scope here (it's a Slack permissions question, not a Tartarus one); mitigate by using bot token where possible | **Gap:** not Tartarus's problem to solve |

---

## 8. Phase 8 ticket breakdown

Tickets are sized for ~1-day chunks. All are designed to be developable on a side branch off `main` without touching the open Slack branch (`codex-slack-vault-and-execution-plan`). The Slack branch only touches `web/lib/slack/**`, `web/app/api/integrations/slack/**`, `web/app/(dashboard)/integrations/slack/page.tsx`, and `web/scripts/slack-backfill.mjs` — none of which are touched by these tickets.

### P8-01 — Field encryption helper + Argon2id KDF

- **Goal:** Land `seal()` / `open()` + key envelope, no consumers yet.
- **Files:** `web/lib/crypto/field.ts` (new), `web/lib/crypto/kdf.ts` (new), `web/lib/crypto/envelope.ts` (new), `web/lib/db/migrations/023_vault_keystore.sql` (new — empty placeholder; the keystore lives in `data/vault.keystore.json`, not SQLite), `web/package.json` (`libsodium-wrappers`, `@node-rs/argon2`).
- **Risks:** Argon2 native binding fails on a fresh CI Mac runner; mitigate by pinning prebuilt binaries.
- **Validation:** `pnpm vitest run web/tests/lib/crypto.test.ts` — round-trip seal/open, KDF determinism on same salt, envelope unwrap.
- **Parallel-safe with Slack branch:** Yes — no overlap.

### P8-02 — Vault unlock route + boot env path

- **Goal:** Implement `/api/vault/unlock` POST endpoint and module-level DEK cache; wire `.env.local` `TARTARUS_VAULT_PASSPHRASE` boot path.
- **Files:** `web/app/api/vault/unlock/route.ts` (new), `web/app/api/vault/status/route.ts` (new), `web/lib/crypto/runtime.ts` (new — singleton DEK holder), `web/instrumentation.ts` (modify — boot unlock if env present).
- **Risks:** Hot-reload in dev loses the DEK; document and accept (re-POST `/unlock` after restart).
- **Validation:** `curl -X POST localhost:3005/api/vault/unlock -d '{"passphrase":"..."}'` then `curl localhost:3005/api/vault/status` returns `{unlocked:true}`.
- **Parallel-safe:** Yes.

### P8-03 — Backfill: encrypt sensitive columns

- **Goal:** Migrate existing `slack_messages.text`, `slack_messages.raw_json`, `ai_integrations.api_key_encrypted` (already partly encrypted — normalize), `chat_messages.content` to field-encrypted format.
- **Files:** `web/scripts/encrypt-backfill.mjs` (new), `web/lib/db/migrations/024_encrypted_columns.sql` (new — adds `*_encrypted` columns where missing; does NOT drop old plaintext yet), `web/lib/slack/vault.ts` (modify — `upsertMessage` writes to `text_encrypted` going forward), `web/lib/chat/store.ts` (modify if it exists — same pattern).
- **Risks:** **Touches `web/lib/slack/vault.ts` — coordinate with the Slack branch.** Land *after* the Slack branch merges to `main`, not in parallel. Until then, the ticket can implement everything except the `vault.ts` write-side change.
- **Validation:** `pnpm tsx web/scripts/encrypt-backfill.mjs --dry-run` reports row counts; `--apply` does it; `pnpm vitest run web/tests/lib/slack-vault.test.ts` still passes (existing tests treat `text` opaquely).
- **Parallel-safe with Slack branch:** **No — defer to post-merge.**

### P8-04 — Snapshot job + age encryption

- **Goal:** Cron-runnable `pnpm snapshot` that produces an `age`-encrypted, chunked tarball and uploads to Supabase Storage.
- **Files:** `web/scripts/snapshot.mjs` (new), `web/lib/backup/snapshot.ts` (new — testable core), `web/lib/backup/supabase-upload.ts` (new), `web/package.json` (`age-encryption`, `@mongodb-js/zstd` or shell out to `zstd`).
- **Risks:** `db.backup()` blocks writes briefly under heavy WAL — acceptable for nightly 02:00.
- **Validation:** `pnpm snapshot --dry-run` produces a local tarball; `pnpm snapshot` uploads; check Supabase Storage console for the file.
- **Parallel-safe:** Yes.

### P8-05 — Restore-drill script

- **Goal:** Weekly verification that the latest snapshot round-trips into a working SQLite file.
- **Files:** `web/scripts/restore-drill.mjs` (new), `web/lib/backup/restore.ts` (new), `web/lib/db/migrations/025_restore_drills.sql` (new — `restore_drills` table), `web/app/(dashboard)/monitor/backups/page.tsx` (new — renders the last 10 drill results).
- **Risks:** Drill produces a real decrypted snapshot in `/tmp` — must `rm -rf` reliably even on failure; use a try/finally.
- **Validation:** `pnpm restore-drill` exits 0 on a healthy backup, exits 1 with diagnostic stderr on a tampered one (test by truncating a chunk before run).
- **Parallel-safe:** Yes.

### P8-06 — Sentry wiring

- **Goal:** Add `@sentry/nextjs` to the operator UI + the MCP server (`@sentry/node`).
- **Files:** `web/instrumentation-client.ts` (new), `web/sentry.server.config.ts` (new), `web/sentry.edge.config.ts` (new), `web/next.config.ts` (modify — `withSentryConfig` wrap), `src/sentry.ts` (new — for the MCP server), `web/package.json` + `package.json` (root, for MCP).
- **Risks:** Source maps upload requires `SENTRY_AUTH_TOKEN` — document in `.env.example`; without it, errors still capture but are unsymbolicated.
- **Validation:** Throw a test error from a route; see it in the Sentry dashboard within 60s; stack trace shows TS line numbers, not bundled column offsets.
- **Parallel-safe:** Yes.

### P8-07 — Integration-error table + `/monitor/integrations` page

- **Goal:** Capture Slack/Gmail/Supabase sync errors in a queryable local table, mirroring the memlog pattern.
- **Files:** `web/lib/db/migrations/026_integration_errors.sql` (new), `web/lib/observability/integrations.ts` (new — `recordIntegrationError({source, scope, error, context})`), `web/app/api/observability/integrations/route.ts` (new), `web/app/(dashboard)/monitor/integrations/page.tsx` (new), call sites in `web/lib/slack/vault.ts` (1 line in the `saveSyncState({error})` path) and any future Gmail/Linear sync.
- **Risks:** **Touches `web/lib/slack/vault.ts` — 1-line call, low conflict risk, but still coordinate.** Can be implemented as a no-op stub against `vault.ts` and wired post-merge.
- **Validation:** Trigger a Slack rate limit (`maxRateLimitWaitMs: 0`), see a row in `integration_errors`, see it in `/monitor/integrations`.
- **Parallel-safe with Slack branch:** **Mostly** — defer the `vault.ts` integration to post-merge; everything else is parallel.

### P8-08 — Capability declarations on MCP tools

- **Goal:** Add `capabilities: Capability[]` field to every tool spec in `src/`. No enforcement yet — declarative only.
- **Files:** `src/types.ts` (modify — `ToolSpec` shape), every tool file under `src/tools/**` (add the capabilities array, ~30 files), `src/policy/capabilities.ts` (new — vocabulary + helpers).
- **Risks:** Touches many files; do as one big mechanical sweep, code-review focuses on whether each tool's declaration is correct (under-declaring is a security risk).
- **Validation:** `pnpm tsx src/scripts/lint-capabilities.ts` reports any tool with empty `capabilities` (must be opt-in to "no permissions" with `capabilities: []`).
- **Parallel-safe:** Yes (no overlap with Slack branch).

### P8-09 — Policy engine + signed-approval flow

- **Goal:** Build the policy decision engine, the approval queue, and the Ed25519 signature path.
- **Files:** `web/lib/policy.ts` (new), `web/lib/policy/operator-key.ts` (new — Ed25519 keygen + sign + verify, uses `libsodium-wrappers`), `data/policy.json` (new, version-controlled), `web/lib/db/migrations/027_agent_approvals.sql` (new — `agent_approvals` + `agent_audit` tables, with no-update no-delete triggers), `web/app/api/agent/approvals/route.ts` (new), `web/app/(dashboard)/monitor/approvals/page.tsx` (new), `web/app/(dashboard)/monitor/audit/page.tsx` (new), `src/runtime/policy-gate.ts` (new — the PreToolUse interceptor).
- **Risks:** Signing key on disk needs file mode 0600 — script enforces this on creation; tests assert mode.
- **Validation:** Configure a test tool with `capabilities: ["egress.linear"]` (policy: `require_approval`); call it; see pending row in `/monitor/approvals`; approve; verify execution; check `agent_audit` has one row with signature reference.
- **Parallel-safe:** Yes.

### P8-10 — Observability redaction pass

- **Goal:** Add a `redact()` filter before `truncateForStorage()` in `web/lib/observability.ts` that strips obvious secrets (API keys, JWTs, OAuth tokens, email addresses if configured).
- **Files:** `web/lib/observability.ts` (modify — wrap `truncateForStorage` calls), `web/lib/observability/redact.ts` (new — regex list + Bloom filter for known secret patterns), `web/tests/lib/redact.test.ts` (new).
- **Risks:** False positives (a UUID looks like a JWT to a naive regex); ship with conservative patterns + a "do not redact" allowlist (e.g., trace IDs).
- **Validation:** `pnpm vitest run web/tests/lib/redact.test.ts` covers AWS keys, Anthropic keys, Slack tokens, Stripe keys, generic Bearer tokens.
- **Parallel-safe:** Yes.

---

## Closing note

The shape of this stack: SQLite stays plaintext for query speed, sensitive columns get sealed under a libsodium DEK, backups get tarballed and age-encrypted before they ever touch Supabase, the operator key signs every consequential agent action, and the audit table is append-only and snapshot-protected. None of these pieces are exotic. The work is in landing them in order, behind a restore-drill that proves the whole chain.

The two pieces I am least confident about as of mid-2026: (a) whether the upcoming MCP spec revision will change the tool-annotation shape in a way that forces a rename of the `capabilities` field — current direction looks stable but it's a moving target; (b) whether Supabase Storage's per-object size / signed-URL TTL limits change before Phase 8 ships — the [v2 API docs](https://supabase.com/docs/guides/storage/buckets/fundamentals) have been quiet but Supabase reorgs these without much notice. Both are recoverable: rename a field, add a chunker bound.

---

### Citations

- [better-sqlite3-multiple-ciphers on npm](https://www.npmjs.com/package/better-sqlite3-multiple-ciphers) — encrypted SQLite drop-in
- [SQLCipher 4.13.0 release notes (Zetetic, 2026-01-20)](https://www.zetetic.net/blog/2026/01/20/sqlcipher-4.13.0-release/)
- [libsodium-wrappers on npm](https://www.npmjs.com/package/libsodium-wrappers) — XChaCha20-Poly1305 in JS
- [age-encryption on npm](https://www.npmjs.com/package/age-encryption) — age format for Node 20+
- [FiloSottile/age on GitHub](https://github.com/FiloSottile/age) — reference implementation
- [@node-rs/argon2 on npm](https://www.npmjs.com/package/@node-rs/argon2) — Rust Argon2 binding, no node-gyp
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) — 2026 Argon2id parameter guidance
- [Complete Guide to Password Hashing 2026 (guptadeepak.com)](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/)
- [Litestream GitHub](https://github.com/benbjohnson/litestream) — SQLite replication
- [Litestream Revamped (Fly.io)](https://fly.io/blog/litestream-revamped/) — LTX migration
- [SQLite Online Backup API](https://www.sqlite.org/backup.html)
- [Supabase Storage Buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase createSignedUrl reference](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl)
- [Langfuse Self-Host overview](https://langfuse.com/self-hosting)
- [Langfuse ClickHouse requirements](https://langfuse.com/self-hosting/deployment/infrastructure/clickhouse)
- [@sentry/nextjs on npm](https://www.npmjs.com/package/@sentry/nextjs)
- [Sentry Next.js platform docs (incl. Next 16 / proxy.ts)](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [MCP tool annotations spec](https://modelcontextprotocol.io/)
- [Anthropic Agent SDK PreToolUse hooks (Augment Code)](https://www.augmentcode.com/guides/anthropic-agent-sdk-what-ships-vs-what-you-build)
- [Kong on MCP tool governance](https://konghq.com/blog/engineering/mcp-tool-governance-security-meets-context-efficiency)
- [keyring-node (keytar alternative)](https://github.com/Brooooooklyn/keyring-node)
