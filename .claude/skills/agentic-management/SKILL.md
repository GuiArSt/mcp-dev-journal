---
name: agentic-management
description: Manage Tartarus MCP server config across Claude Code, Codex, Gemini, and Cursor. Status check, rebuild, update paths, troubleshoot -32000. Optional TARTARUS_AGENT_SOURCES JSON for scan paths and Journal Repository tagging.
---

# Agentic Management

Tartarus MCP server runs as stdio across AI CLI agents. For **vocabulary** (Library, AI Skill, AI Settings, Journal Repository) and how ingested data maps to the DB, read **[docs/agent-memory-bridge.md](../../../docs/agent-memory-bridge.md)** in this repo.

## Config Locations

| Agent | File | Key |
|---|---|---|
| Claude Code | `~/.claude.json` | `mcpServers.tartarus` |
| Codex | `~/.codex/config.toml` | `[mcp_servers.tartarus]` |
| Gemini | `~/.gemini/settings.json` | `mcpServers.tartarus` |
| Cursor IDE | `~/.cursor/mcp.json` | `mcpServers.tartarus` |

**MCP command:** pin **Node 22** in config (not bare `node` — shell may be Node 25;
`better-sqlite3` must match the runtime ABI):

```json
"tartarus": {
  "command": "/opt/homebrew/opt/node@22/bin/node",
  "args": ["/Users/guillermo.as/Documents/Software/Laboratory/tartarus/dist/index.js"]
}
```

## Node 22 pin

- `.nvmrc` → `22`
- After install / Node change: `npm run rebuild:native` (puts node@22 first on PATH for npm rebuild)

## Optional: `TARTARUS_AGENT_SOURCES` (JSON)

Point the **web app** env var at a JSON file to override default scan roots and to tag sessions with a **Journal `repository`** slug when the session file path lives under a configured workspace prefix.

- Example: [docs/examples/agent-sources.json](../../../docs/examples/agent-sources.json)
- Used by [`web/lib/ai-integrations.ts`](../../../web/lib/ai-integrations.ts) on `POST /api/ai-integrations/scan` (Library → AI integrations tab, port **3005**).

## Library scan (AI Settings + AI Skills + sessions)

After `npm run dev` in `web/`:

1. `POST http://localhost:3005/api/ai-integrations/scan`
2. Or use **Library** → **AI integrations** tab in the dashboard.

This indexes Codex / Claude / Gemini / Cursor configs and recent sessions into SQLite + `tartarus_objects` (see `docs/agent-memory-bridge.md`).

## Status Check

1. Read all agent configs above — server must be named **`tartarus`**, command must be **node@22** + `dist/index.js`.
2. Smoke test handshake:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' \
  | /opt/homebrew/opt/node@22/bin/node /Users/guillermo.as/Documents/Software/Laboratory/tartarus/dist/index.js 2>/tmp/tartarus-mcp-test.log &
PID=$!; sleep 3; kill $PID 2>/dev/null; cat /tmp/tartarus-mcp-test.log
```

## Rebuild

```bash
cd /Users/guillermo.as/Documents/Software/Laboratory/tartarus
npm run rebuild:native
npm run build
```

## Troubleshoot -32000

Server died before handshake. Check: wrong path, bare `node` instead of
`node@22`, missing `node_modules`, `npm run rebuild:native`, startup throw.

## Environment

Server loads `.env` from its project root automatically. No keys needed in MCP config env blocks.
