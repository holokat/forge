# Forge Agent Access

Forge vaults are plain folders of Markdown files. Agents should use the local CLI or MCP server instead of driving the UI.

## Quick Start

Use a vault path explicitly:

```bash
forge --vault /path/to/vault analyze --json
```

Or set it once for a shell session:

```bash
export FORGE_VAULT=/path/to/vault
forge list
```

If neither is provided, Forge falls back to the active vault saved by the desktop app.

From the source checkout, use `npm run agent -- ...` instead of `forge ...`.

If the Forge desktop app is open on the same vault, its file watcher will pick up agent edits.

## Common Tasks

```bash
forge --vault /path/to/vault create-folder Projects
forge --vault /path/to/vault create-doc Projects/Plan --title "Plan"
forge --vault /path/to/vault templates --json
forge --vault /path/to/vault create-template Meeting --content "# {{title}}\n\n## Notes\n"
forge --vault /path/to/vault create-from-template Meeting Projects/Kickoff --title "Kickoff"
printf '\n## Next\n- Ship it\n' | forge --vault /path/to/vault append Projects/Plan.md --stdin
forge --vault /path/to/vault read Projects/Plan.md
forge --vault /path/to/vault search "Ship it" --json
forge --vault /path/to/vault move Projects/Plan.md Projects/Active/Plan.md
forge --vault /path/to/vault analyze --json
forge --vault /path/to/vault publish --out /path/to/site --clean --json
```

## MCP

Use `forge-mcp` for Codex, Claude, and other MCP clients:

```bash
FORGE_VAULT=/path/to/vault forge-mcp
```

The MCP server exposes tools for listing, reading, writing, appending, creating folders/docs, listing/creating/using templates, moving, searching, analyzing, publishing, and batch operations. It speaks stdio MCP and should be launched by the MCP client, not used interactively.

## Templates

Templates are Markdown files in the configured templates folder, usually `Templates/`. Agents can list them with `forge templates --json`, create reusable templates with `forge create-template`, and create notes with `forge create-from-template`.

Supported placeholders are `{{title}}`, `{{date}}`, `{{time}}`, `{{datetime}}`, `{{vault}}`, and `{{template}}`.

## Batch Operations

Batch mode is best when an agent needs multiple changes to stay ordered:

```json
{
  "vault": "/path/to/vault",
  "operations": [
    { "action": "createFolder", "path": "Projects" },
    { "action": "createTemplate", "name": "Project.md", "content": "# {{title}}\n\n## Goal\n" },
    { "action": "createFromTemplate", "template": "Project", "path": "Projects/Plan.md", "title": "Plan" },
    { "action": "append", "path": "Projects/Plan.md", "content": "\n## Next\n- Define scope\n" },
    { "action": "analyze" },
    { "action": "publish", "outDir": "/path/to/site", "clean": true }
  ]
}
```

Run it with:

```bash
forge batch batch.json --json
```

## Safety Rules

- Paths are always relative to the selected vault.
- Absolute paths and `..` escapes are rejected.
- Hidden folders and `node_modules` are ignored during scans.
- `create-doc` will not overwrite an existing note unless `--overwrite` is passed.
- There is no delete command; move or rewrite content intentionally instead.

## Capabilities

The CLI can list, read, create, overwrite, append, move, search, analyze Markdown notes, publish static HTML, and work with templates. `analyze --json` returns totals, tags, wikilinks, backlinks, broken links, empty notes, notes without tags, inbox notes, and orphan notes for organization workflows.

## Changelog Rule

Forge product changes are tracked as individual Markdown notes in the active Forge vault under `Forge Changelog/`. Any time an agent makes a substantial user-facing, architectural, workflow, or companion-app change, it must create a new changelog note instead of appending to or editing a shared changelog file. Use the active vault from `~/Library/Application Support/Forge/forge-settings.json` unless the user specifies another vault.

Name each entry `YYYY-MM-DD HH.mm - Short title.md` so entries sort chronologically and can later power a Forge website. Each entry should include date, type, summary, user impact, and website-copy notes. Do not edit previous changelog entries unless the user explicitly asks for a correction or migration.
