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
| Cursor IDE | `~/.cursor/mcp.json` (and Cursor Settings UI) | MCP server entry for Tartarus |

Binary: `/Users/guillermo.as/Documents/Software/Laboratory/tartarus/dist/index.js` (adjust if your clone path differs).

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

1. Read all agent configs above, verify `node …/dist/index.js` path exists.
2. Smoke test handshake:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' | node /Users/guillermo.as/Documents/Software/Laboratory/tartarus/dist/index.js 2>/tmp/tartarus-mcp-test.log &
PID=$!; sleep 3; kill $PID 2>/dev/null; cat /tmp/tartarus-mcp-test.log
```

## Rebuild

```bash
cd /Users/guillermo.as/Documents/Software/Laboratory/tartarus && npm run build
```

## Troubleshoot -32000

Server died before handshake. Check: wrong path, missing node_modules, `npm rebuild better-sqlite3`, startup throw (run smoke test above and read stderr).

## Environment

Server loads `.env` from its project root automatically. No keys needed in MCP config env blocks.
