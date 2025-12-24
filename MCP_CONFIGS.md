# MCP Client Configurations - Quick Reference

**MCP Server v2.0.0** - 10 read-focused journal tools for AI agents.

**Replace the path** `/Users/guillermo.as/Documents/Software/Laboratory/Developer Journal Workspace` with your actual installation path.

The server automatically loads `.env` from the project root, so no need to specify env vars in these configs.

> **Note**: For write/edit operations (editing entries, attachments, project summaries), use the **Tartarus web app** (`cd web && npm run dev`).

---

## Cursor (`~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "developer-journal": {
      "command": "node",
      "args": ["/Users/guillermo.as/Documents/Software/Laboratory/Developer Journal Workspace/dist/index.js"]
    }
  }
}
```

---

## Claude Desktop

### macOS (`~/Library/Application Support/Claude/claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "developer-journal": {
      "command": "node",
      "args": ["/Users/guillermo.as/Documents/Software/Laboratory/Developer Journal Workspace/dist/index.js"]
    }
  }
}
```

### Windows (`%APPDATA%\Claude\claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "developer-journal": {
      "command": "node",
      "args": ["C:\\Users\\YourUsername\\Documents\\Software\\Laboratory\\Developer Journal Workspace\\dist\\index.js"]
    }
  }
}
```

### Linux (`~/.config/Claude/claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "developer-journal": {
      "command": "node",
      "args": ["/home/yourusername/Documents/Software/Laboratory/Developer Journal Workspace/dist/index.js"]
    }
  }
}
```

---

## VS Code with MCP Extension (`settings.json`)

```json
{
  "mcp.servers": {
    "developer-journal": {
      "command": "node",
      "args": ["/Users/guillermo.as/Documents/Software/Laboratory/Developer Journal Workspace/dist/index.js"]
    }
  }
}
```

---

## Google AI Studio / Gemini

```json
{
  "mcpServers": {
    "developer-journal": {
      "command": "node",
      "args": ["/Users/guillermo.as/Documents/Software/Laboratory/Developer Journal Workspace/dist/index.js"]
    }
  }
}
```

---

## Generic MCP Client

```json
{
  "mcpServers": {
    "developer-journal": {
      "command": "node",
      "args": ["/absolute/path/to/Developer Journal Workspace/dist/index.js"]
    }
  }
}
```

---

## Getting Your Installation Path

Run this command in your terminal to get the exact path:

```bash
cd "/Users/guillermo.as/Documents/Software/Laboratory/Developer Journal Workspace" && pwd
```

Then replace the path in the configs above with the output.





















