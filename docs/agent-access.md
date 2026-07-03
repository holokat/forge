# Forge Agent Access

Forge is local-first: a vault is just a folder of Markdown files. Agents should use Forge through the CLI or MCP server instead of driving the desktop UI.

## What Ships

- `forge`: command-line access for terminal-based agents such as Codex, Claude Code, Cursor, and Windsurf.
- `forge-mcp`: stdio MCP server for Codex, Claude, and other MCP clients.
- Packaged macOS app wrappers: `Forge.app/Contents/Resources/bin/forge` and `Forge.app/Contents/Resources/bin/forge-mcp`.

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
forge --vault /path/to/vault list
forge --vault /path/to/vault create-folder Projects
forge --vault /path/to/vault create-doc Projects/Plan --title "Plan"
printf '\n## Next\n- Define scope\n' | forge --vault /path/to/vault append Projects/Plan.md --stdin
forge --vault /path/to/vault search "Define scope" --json
forge --vault /path/to/vault analyze --json
```

From a source checkout:

```bash
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
- `forge_create_folder`
- `forge_move`
- `forge_search`
- `forge_analyze`
- `forge_batch`
