# Forge Agent Access

Forge is local-first: a vault is just a folder of Markdown files. Agents should use Forge through the CLI or MCP server instead of driving the desktop UI.

## What Ships

- `forge`: command-line access for terminal-based agents such as Codex, Claude Code, Cursor, and Windsurf.
- `forge-mcp`: stdio MCP server for Codex, Claude, and other MCP clients.
- `forge-publish`: direct static-site export command for deployment workflows.
- Packaged macOS app wrappers: `Forge.app/Contents/Resources/bin/forge`, `forge-mcp`, and `forge-publish`.

Both entrypoints use the same safe path handling:

- Paths are relative to the selected vault.
- Absolute paths and `..` escapes are rejected.
- Hidden folders and `node_modules` are skipped during scans.
- `create-doc` will not overwrite unless `--overwrite` is passed.

## Vault Selection

Forge resolves the vault in this order:

1. `--vault /path/to/vault`
2. `FORGE_VAULT=/path/to/vault`
3. The active vault saved by Forge desktop in `forge-settings.json`

## CLI Examples

```bash
forge built-in-templates --json
forge built-in-extensions --json
forge validate-extension /path/to/extension-folder --json
forge --vault /path/to/vault list
forge --vault /path/to/vault create-folder Projects
forge --vault /path/to/vault create-doc Projects/Plan --title "Plan"
forge --vault /path/to/vault seed-templates --kinds daily,meeting,agentTask --json
forge --vault /path/to/vault templates --json
forge --vault /path/to/vault create-template Meeting --content "# {{title}}\n\n## Notes\n"
forge --vault /path/to/vault create-from-template Meeting Projects/Kickoff --title "Kickoff"
forge --vault /path/to/vault create-from-template "SEO Brief" Content/Draft \
  --title "Launch post" \
  --vars '{"keyword":"local markdown notes","audience":"developers"}' \
  --var Status=Draft
printf '\n## Next\n- Define scope\n' | forge --vault /path/to/vault append Projects/Plan.md --stdin
forge --vault /path/to/vault search "Define scope" --json
forge --vault /path/to/vault analyze --json
forge --vault /path/to/vault publish --out /path/to/site --clean --json
forge-publish --vault /path/to/vault --out /path/to/site --clean
```

From a source checkout:

```bash
npm run agent -- built-in-templates --json
npm run agent -- built-in-extensions --json
npm run agent -- validate-extension examples/extensions --recursive --json
npm run agent -- --vault /path/to/vault seed-templates --folder Templates --kinds daily,meeting
npm run agent -- --vault /path/to/vault analyze --json
```

## Codex MCP

Codex reads MCP servers from `~/.codex/config.toml` or trusted project `.codex/config.toml` files.

```toml
[mcp_servers.forge]
command = "/Applications/Forge.app/Contents/Resources/bin/forge-mcp"

[mcp_servers.forge.env]
FORGE_VAULT = "/path/to/vault"
```

You can also use Codex CLI:

```bash
codex mcp add forge --env FORGE_VAULT=/path/to/vault -- /Applications/Forge.app/Contents/Resources/bin/forge-mcp
```

## Claude MCP

Claude Desktop-style MCP config:

```json
{
  "mcpServers": {
    "forge": {
      "command": "/Applications/Forge.app/Contents/Resources/bin/forge-mcp",
      "env": {
        "FORGE_VAULT": "/path/to/vault"
      }
    }
  }
}
```

Claude Code:

```bash
claude mcp add --env FORGE_VAULT=/path/to/vault --transport stdio forge -- /Applications/Forge.app/Contents/Resources/bin/forge-mcp
```

## Source Checkout MCP

```bash
node scripts/forge-mcp.mjs --vault /path/to/vault
```

For MCP clients:

```json
{
  "command": "node",
  "args": ["/path/to/forge/scripts/forge-mcp.mjs"],
  "env": {
    "FORGE_VAULT": "/path/to/vault"
  }
}
```

## MCP Tools

- `forge_active_vault`
- `forge_list`
- `forge_tree`
- `forge_read`
- `forge_write`
- `forge_append`
- `forge_create_doc`
- `forge_templates`
- `forge_create_template`
- `forge_create_from_template`
- `forge_create_folder`
- `forge_move`
- `forge_search`
- `forge_analyze`
- `forge_publish`
- `forge_batch`

## Templates

Templates are Markdown files in the configured templates folder, usually `Templates/`. Use them for repeatable note shapes like daily notes, meeting notes, agent task briefs, SEO/content briefs, research briefs, PRDs, project plans, bug reports, decision records, changelog entries, transcript cleanup notes, people, and publishing drafts.

Use two list commands before creating from a template:

```bash
forge built-in-templates --json
forge --vault /path/to/vault templates --json
```

`built-in-templates` does not need a vault. It lists the bundled starter template pack that the app can seed, including each template kind, suggested filename, placeholder fields, and built-in variables. Add `--content` when an agent needs the complete starter Markdown. `templates --json` lists the templates that actually exist in the selected vault.

To install starter templates into the selected vault, use `seed-templates`:

```bash
forge --vault /path/to/vault seed-templates --kinds daily,meeting,agentTask --json
forge --vault /path/to/vault seed-templates --folder "Team Templates" --overwrite
```

`seed-templates` writes Markdown files from the bundled starter catalog into the configured templates folder, or the folder passed with `--folder`. Omit `--kinds` to seed the full starter pack. Existing template files are skipped unless `--overwrite` is passed, so agents can safely run the command before `create-from-template`.

Supported placeholders:

- `{{title}}`
- `{{date}}`
- `{{time}}`
- `{{datetime}}`
- `{{vault}}`
- `{{template}}`
- `{{folder}}`
- Custom variables such as `{{client}}`, `{{keyword}}`, or `{{status}}`
- Prompt-style variables such as `{{prompt:Audience}}`
- Select-style variables such as `{{select:Status|Draft,Review,Final}}`

Pass values from the CLI with `--vars` JSON, an `@file.json`, or repeatable `--var key=value` flags:

```bash
forge --vault /path/to/vault create-from-template "Client Brief" Clients/Acme \
  --title "Acme Brief" \
  --vars '{"client":"Acme","audience":"Founders"}' \
  --var Status=Draft
```

Batch operations and MCP use the same values as a `variables` object:

```json
{
  "action": "createFromTemplate",
  "template": "Client Brief",
  "path": "Clients/Acme.md",
  "title": "Acme Brief",
  "variables": {
    "client": "Acme",
    "audience": "Founders",
    "Status": "Draft"
  }
}
```

If a `prompt:` value is not supplied, Forge inserts an empty string. If a `select:` value is not supplied, Forge uses the first listed option. Unknown plain placeholders are preserved.

Agents should call `forge templates --json` or `forge_templates` before creating from a template, then use `forge create-from-template` or `forge_create_from_template` so generated notes preserve the user’s preferred structure.

## Extensions

Agents can inspect bundled extension points and manifests without a vault:

```bash
forge built-in-extensions --json
```

Local declarative extension manifests can be checked before they are proposed or installed:

```bash
forge validate-extension /path/to/forge-extension.json --json
forge validate-extension /path/to/extensions-folder --recursive --json
```

From a source checkout, the same checks are available through `npm run agent -- validate-extension ...` and `npm run extensions:validate -- ...`.
