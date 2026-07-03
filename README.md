# Forge

Forge is a local-first Markdown knowledge base for macOS. It is built for people and AI agents who want to work with plain files instead of a closed notes database.

Forge is open source under the MIT License.

## What Forge Can Do

- Open any folder as a Markdown vault.
- Create, edit, rename, move, and organize notes and folders.
- Autosave notes as plain `.md` files.
- Use wikilinks, backlinks, tags, outlines, and a graph view.
- Search notes, titles, aliases, tags, and frontmatter properties.
- Create daily notes and reusable notes from Markdown templates.
- Show unlinked mentions to help connect related notes.
- Play local audio attachments from voice notes.
- Pair with Forge Buddy, the iOS companion recorder.
- Expose a local CLI and MCP server for Codex, Claude, and other agent tools.
- Publish a vault to static HTML.
- Manage bundled extensions through an early local marketplace.
- Check and install app updates from GitHub releases.

## Current Status

Forge is early software. The core local notes workflow works, and the agent/CLI/MCP surface is usable, but many features are still being shaped.

Implemented foundations:

- Desktop Markdown editor and reader.
- Vault file tree and tabs.
- Wikilinks, backlinks, tags, outlines, graph view, and search.
- Frontmatter properties and aliases.
- Daily notes and templates.
- Template picker plus CLI/MCP template tools.
- Local agent CLI.
- MCP server for agent tools.
- Static HTML publisher.
- Forge Buddy pairing/ingest support.
- Local declarative extension marketplace foundation.
- In-app update checks and release notes.

Planned or in progress:

- A safer public extension/plugin system.
- Better publishing workflows.
- More graph and backlink organization tools.
- Stronger import/export flows.
- More polish around Forge Buddy sync and offline capture.
- Broader documentation for contributors.

## Development

```bash
npm install
npm run dev
npm run typecheck
```

Useful local commands:

```bash
npm run agent -- --vault /path/to/vault analyze --json
npm run mcp
npm run publish:vault -- --vault /path/to/vault --out /path/to/site --clean
```

## License

MIT License. See `LICENSE`.
