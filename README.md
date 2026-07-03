# Forge ⚡️

A fast, beautiful, local-first knowledge base for macOS — an Obsidian-style note app. Your notes are plain Markdown files in a folder ("vault") on your Mac. No servers, no lock-in.

![Electron](https://img.shields.io/badge/Electron-33-47848F) ![React](https://img.shields.io/badge/React-18-61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)

## Features

- **Vaults** — any folder of Markdown files; open, create, and switch vaults. Recent vaults remembered.
- **Live-styled editor** — CodeMirror 6 with Markdown styling as you type (headings, bold, code, quotes), plus a rendered **reading view** (⌘E to toggle).
- **Wikilinks** — type `[[` for autocomplete, ⌘-click to follow, links to missing notes create them. Aliases (`[[Note|label]]`) supported.
- **Backlinks & outline** — right panel shows what links to the current note, its headings, and its tags.
- **Graph view** — interactive force-directed graph of your vault (zoom, pan, drag, click to open).
- **Quick switcher** (⌘O) and **command palette** (⌘P) with fuzzy matching.
- **Full-text search** across the vault.
- **Tabs**, file tree with context menus (rename, reveal in Finder, move to Trash), inline title rename.
- **Interactive task lists** — click checkboxes in reading view to update the source.
- **Dark, light, and system themes**, adjustable font size and line width.
- **Autosave** with debounce; external file changes picked up via file watching.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| ⌘O | Quick switcher (open or create note) |
| ⌘P | Command palette |
| ⌘N | New note |
| ⌘E | Toggle edit / reading view |
| ⌘T / ⌘W | New tab / close tab |
| ⌘⇧G | Graph view |
| ⌘\ | Toggle sidebar |
| ⌘, | Settings |

## Development

```bash
npm install
npm run dev        # run the Electron app with hot reload
npm run dev:web    # renderer only, in a browser with a mock vault (design work)
npm run agent -- --vault /path/to/vault analyze --json
npm run mcp        # run the Forge MCP server over stdio
npm run typecheck
```

## Agent access

Forge is built for local agents. Vaults are plain Markdown folders, and Forge exposes two automation front doors:

- `forge` — a local CLI for agents that can run shell commands.
- `forge-mcp` — a stdio MCP server for Codex, Claude, and other MCP clients.

Both use the same path safety rules as the desktop app. If `--vault` / `FORGE_VAULT` is omitted, they use the active vault saved by Forge desktop.

```bash
forge --vault /path/to/vault create-folder Projects
forge --vault /path/to/vault create-doc Projects/Plan --title "Plan"
forge --vault /path/to/vault search "Plan" --json
forge --vault /path/to/vault analyze --json
```

From a source checkout, use `npm run agent -- ...` or `node scripts/forge-mcp.mjs`. Packaged macOS builds include wrapper commands at `Forge.app/Contents/Resources/bin/`.

See `AGENTS.md` and `docs/agent-access.md` for the full CLI, MCP, Codex, and Claude setup guide.

## iOS voice recorder

Forge includes a native iPhone companion app in `ios/ForgeRecorder`. Open a vault in the desktop app, then use Settings > Mobile recorder to scan the pairing QR code. Recordings are transcribed on iPhone and saved automatically as Markdown notes in `Inbox/Voice` in the open vault.

Generate the iOS project with:

```bash
xcodegen generate --spec ios/ForgeRecorder/project.yml
```

## Packaging

```bash
npm run dist       # builds a .dmg into release/
```

## Architecture

- `src/main` — Electron main process: window, vault file I/O over IPC, settings, file watching, `forge-asset://` protocol for images.
- `src/preload` — context-isolated bridge exposing the typed `window.forge` API.
- `src/renderer` — React UI. State in a Zustand store; note contents kept outside React state for performance. CodeMirror 6 editor with custom wikilink/tag extensions; `marked` + DOMPurify for reading view.
- `src/shared` — types shared across processes.
