# Plan: Kronus delegates to Cursor (local agent, cleaner streaming)

Goal: when chatting with **Kronus** in Tartarus, the model can **delegate** software / codebase questions to a **Cursor agent** running against a **local git checkout**, with **streaming** semantics where practical, and **auth via env** (`CURSOR_API_KEY`) — carrier responsibility, local-first.

## Current Tartarus (relevant facts)

| Layer | What exists |
|-------|----------------|
| **Chat** | [`web/app/api/chat/route.ts`](../web/app/api/chat/route.ts) — `streamText` + tools from [`web/lib/ai/tools.ts`](../web/lib/ai/tools.ts). Tool calls are executed in [`executeToolCall`](../web/lib/ai/tool-executors/index.ts); each tool returns a **single string** result to the model (no live token stream from inside a tool today). |
| **AI Library (read-only)** | [`web/lib/ai-integrations.ts`](../web/lib/ai-integrations.ts) — indexes Cursor configs, skills, transcripts; tools `ai_*` under category **`aiIntegrations`**. |
| **Git / repo** | [`web/lib/ai/tool-executors/git.ts`](../web/lib/ai/tool-executors/git.ts) — local `git` commands; good precedent for **cwd allowlists** and timeouts. |
| **Cursor SDK** | `@cursor/sdk` in [`web/package.json`](../web/package.json); server helper [`web/lib/cursor-agent-delegate.ts`](../web/lib/cursor-agent-delegate.ts), config [`web/lib/cursor-delegate-config.ts`](../web/lib/cursor-delegate-config.ts), API [`web/app/api/cursor-delegate/insight/route.ts`](../web/app/api/cursor-delegate/insight/route.ts). |

## Setup (git clones + env)

1. **Clone** any repo you want the agent to read (normal `git clone`).
2. **Register paths** (pick one or both):
   - **JSON file** (good for many projects): copy [`docs/examples/cursor-delegate-repos.example.json`](examples/cursor-delegate-repos.example.json) to e.g. `~/.config/tartarus/cursor-delegate-repos.json`, edit `id` + absolute `path`, then set `CURSOR_DELEGATE_REPOS_FILE` to that path in `web/.env.local`.
   - **Comma list**: `CURSOR_DELEGATE_CWD_ALLOWLIST=/abs/path/a,/abs/path/b` — each segment is a repo root; `project_id` defaults to the directory **basename** (collisions get `-2`, `-3`, …).
3. **`CURSOR_API_KEY`** in `web/.env.local` (Cursor Dashboard → Integrations).
4. **Restart** `next dev` after env changes.
5. In Kronus **Tools**, enable **Cursor code**, then the model can call `cursor_repository_insight` with `project_id` + `question`.

Optional: `CURSOR_DELEGATE_MODEL` (default `composer-2`), `CURSOR_DELEGATE_TIMEOUT_MS`, `CURSOR_DELEGATE_MAX_OUTPUT_CHARS`.

## Cursor side (SDK — public beta)

From Cursor’s TypeScript SDK docs (`@cursor/sdk`):

- **`Agent.create({ apiKey, model, local: { cwd } })`** — local runtime uses **files on disk** (your repo).
- **`agent.send(message)`** → **`Run`** with **`run.stream()`** → async iterable of **`SDKMessage`** (assistant deltas, `tool_call`, etc.).
- **`Agent.prompt(message, options)`** — one-shot create + run + dispose.
- **`send()`** can take **`onDelta` / `onStep`** for finer **InteractionUpdate** streaming (`text-delta`, `tool-call-started`, …).
- **Auth**: `CURSOR_API_KEY` (user or service account). Billing / privacy same as IDE per docs.

This matches “delegate + fetch code information”: the Cursor agent does **read/grep/shell** style work inside `cwd`; Kronus consumes the **aggregated** answer.

## Architecture choice (recommended)

### Phase A — **Server tool, buffered stream** (best first ship)

1. Add dependency **`@cursor/sdk`** to [`web/package.json`](../web/package.json) (pin version when implementing).
2. New module e.g. [`web/lib/cursor-agent-delegate.ts`](../web/lib/cursor-agent-delegate.ts):
   - `runLocalCursorInsight({ cwd, prompt, maxChars, maxMs })`  
   - Resolve `cwd` with **`fs.realpath`** and assert it is under one of **`CURSOR_DELEGATE_CWD_ALLOWLIST`** (comma-separated abs paths or roots from env).
   - `Agent.create` + `send` with **`onDelta`** optional for logging only; **accumulate** assistant text + short tool summary lines into a **capped buffer** (e.g. 48k chars) returned to the tool.
   - Hard **timeout** (AbortSignal / race) and **try/finally** dispose agent (`await using` pattern from docs).
3. New tool e.g. **`cursor_repository_insight`** in [`web/lib/ai/tools.ts`](../web/lib/ai/tools.ts):
   - Description: deep code/repo questions; must pass **`repository_path`** or **`cwd`** matching allowlist.
   - Executor in [`web/lib/ai/tool-executors/cursor-delegate.ts`](../web/lib/ai/tool-executors/cursor-delegate.ts) calling the module.
4. **ToolsConfig**: add optional flag **`cursorDelegate`** (or nest under `aiIntegrations` if you want it gated with the same toggle) + SoulConfig merge in [`web/lib/ai/skills.ts`](../web/lib/ai/skills.ts) / chat route.
5. **System prompt** snippet (when tool enabled): “You may call `cursor_repository_insight` for deep reads of a **local** checkout; pass only allowed paths.”

**Streaming “cleanliness” here**: the **Kronus answer** still streams via `streamText`; inside one tool step the Cursor run streams **internally** into a buffer. The UI does not show Cursor token-by-token unless you add a second channel (Phase C).

### Phase B — **Structured attachment** (better UX without full SSE)

- Tool returns: **summary text** + **`run_id`** + **first N chars** + link “open in Cursor if installed” (optional).
- Store last run metadata in memory/redis optional — only if you need “continue same agent” (`Agent` resume APIs in docs).

### Phase C — **True dual stream** (ambitious)

- New route **`POST /api/cursor-agent/stream`** (SSE or AI SDK UI message stream) that pipes **`run.stream()`** to the client.
- Hourglass or ChatInterface would use **`fetch` + ReadableStream** or a small hook; **Kronus** would **not** use this path in the same turn (orchestration gets complex: model would need to “hand off” to UI).
- Only worth it if you want **visible** Cursor reasoning in the panel while Kronus waits.

### Phase D — **Sandbox**

- **Process sandbox**: same as today — **allowed roots** + no `cwd` escape + timeout.
- **Docker sandbox** (optional): run a **thin sidecar** that has `@cursor/sdk` + repo bind-mount; Tartarus calls sidecar HTTP with signed token — only if you need stronger isolation than path allowlists.

## Security checklist (non-negotiable)

- **`CURSOR_API_KEY`** only in server env (e.g. `web/.env.local`); never send to browser.
- **`CURSOR_DELEGATE_CWD_ALLOWLIST`** — e.g. `/Users/you/Documents/Software/Laboratory/tartarus,/Users/you/Documents/Software/jobilla` — **reject** any `cwd` not prefixed after `realpath`.
- **Rate limit** per user/session (simple in-memory or existing middleware).
- **Cap** stream length, event count, wall time; **redact** obvious secrets in accumulated text (reuse patterns from [`redactSecrets`](../web/lib/ai-integrations.ts)).

## MCP / `src/` parity (optional)

If you want **`kronus_ask`** or journal MCP to delegate too: the root **`package.json`** MCP bundle would need **`@cursor/sdk`** bundled or dynamic import from a path that exists in the MCP build — watch **esbuild externals** (same as other AI deps). Alternatively keep delegation **web-only** first.

## Implementation order

1. Env + allowlist + `cursor-agent-delegate` module + tests (mock `Agent.create` if SDK hard in CI).  
2. Tool spec + executor + `toolCategories` + `ToolsConfig` UI + skills merge.  
3. Prompt nudge + manual QA on a real repo.  
4. (Optional) SSE route + UI.  
5. (Optional) Docker sidecar.

## Relation to existing “AI integrations”

- **ai_integrations** = **index + fetch** of **past** configs and logs.  
- **Cursor delegate** = **live** agent run for **new** analysis.  
Keep both; document in tool descriptions so Kronus picks the right one.

## References

- Cursor TypeScript SDK: `https://cursor.com/docs/sdk/typescript.md` (local agent, `run.stream()`, `onDelta`, billing).
- Tartarus agent memory / Library vocabulary: [`docs/agent-memory-bridge.md`](agent-memory-bridge.md).
