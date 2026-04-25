---
name: journal-visual
description: When creating a journal entry, decide whether to attach a visual (screenshot, Muse infographic, or mood image) and call the appropriate MCP tool. Use for any commit that includes FE or BE/schema changes worth documenting visually.
---

# Journal Visual Attachment

After `journal_create_entry`, optionally attach a visual to make the entry richer. The visual lives in `media_assets` linked by `commit_hash`, and is discoverable via the registry.

## Decision tree

Read `files_changed` from the entry:

**FE change** — paths in `components/`, `app/`, `pages/`, `web/`
→ Use `journal_attach_screenshot`. Ask which port the dev server is on (Tartarus: 3005, Jobilla: varies).
→ If server is not running, fall back to `journal_generate_image` with `render_mode: "infographic"`.

**BE / schema / API change** — paths in `src/`, `lib/`, `migrations/`, `schema.ts`, `tools.ts`
→ Use `journal_generate_image` with `render_mode: "infographic"`. Summarise `what_changed` + `decisions` as context.

**Mixed FE + BE**
→ Screenshot first, then infographic.

**Small / uncertain change**
→ `journal_generate_image` with `render_mode: "mood"`. Cheap and always valid.

## Tools

### `journal_attach_screenshot` — FE changes, server running

```
journal_attach_screenshot({
  commit_hash: "abc1234",
  url: "http://localhost:3005/the-route",  // full URL with port
  label: "What is visible in this screenshot",
  waitForSelector: ".css-selector"         // optional
})
```

Returns `{ mediaId, uuid, rawUrl, label }`. The image is immediately queryable via `GET /api/media?commit_hash=abc1234`.

### `journal_generate_image` — infographic or mood

```
journal_generate_image({
  commit_hash: "abc1234",
  context: "Plain English summary of what changed, pulled from what_changed + decisions",
  render_mode: "infographic",  // or "mood"
  label: "Short label"
})
```

- `infographic` → GPT Image 2. Best for architecture, schema, feature flow, system diagrams.
- `mood` → painterly. Best for narrative/aesthetic context.

Returns `{ uuid, rawUrl, render_mode }`.

### `git_read` — read code context from any repo before deciding

```
git_read({
  repo_path: "/Users/guillermo.as/Documents/Software/jobilla/api",
  command: "diff",
  args: ["HEAD~1", "--stat"]
})
```

Use this to understand what actually changed, especially for cross-repo entries (Jobilla, etc.).

## Port reference

| Project | Dev port |
|---------|----------|
| Tartarus web | 3005 |
| Jobilla (varies) | 3000 / 3001 — check `package.json` `dev` script |

## Both tools require

`TARTARUS_URL` env var set in the MCP server config, pointing to the running Tartarus web app (e.g. `http://localhost:3005`). Without it, both tools return a clear error.
