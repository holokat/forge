# Forge Static Publishing

Forge can export a vault to static HTML without using the desktop renderer UI. The publisher scans Markdown notes, renders clean HTML pages, rewrites local note links, adds backlinks and tag pages, and copies local non-Markdown assets into the output folder.

## Usage

From the source checkout:

```bash
npm run publish:vault -- --vault /path/to/vault --out /path/to/site --clean
```

Or call the script directly:

```bash
node scripts/forge-publish.mjs --vault /path/to/vault --out /path/to/site --title "My Notes"
```

If `--vault` is omitted, the command follows the normal Forge vault resolution order:

1. `FORGE_VAULT`
2. The active vault saved by the desktop app

## Output

The output folder contains:

- `index.html` with all notes, tags, counts, and broken wikilinks.
- `notes/**/*.html` for rendered Markdown notes.
- `tags/*.html` for tag index pages.
- `assets/**` copied from non-Markdown files in the vault.
- `_forge/styles.css` and `_forge/manifest.json` for generated site assets and metadata.
- `.forge-publish.json` as the ownership marker used by `--clean`.

## Link Behavior

- Wikilinks such as `[[Project Plan]]`, `[[Folder/Note|label]]`, and `[[Note#Heading]]` resolve to generated note pages.
- Markdown links to other notes, such as `[Plan](Projects/Plan.md)`, resolve to generated note pages.
- Hashtags become links to generated tag pages.
- Local images and other non-Markdown assets are copied to `assets/` and linked with relative URLs.
- Missing wikilinks are shown as unresolved and listed on `index.html`.

## Safety

The publisher refuses to write directly into the vault root or filesystem root. When the output folder is inside the vault, that folder is skipped during scanning so generated files do not get republished.

Use `--clean` to remove stale generated files before publishing. Cleanup is bounded: it only removes a non-empty folder when `.forge-publish.json` identifies it as a previous Forge publisher output.
