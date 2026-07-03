# Forge Static Publishing

Forge can export a vault or a single vault folder to static HTML without using the desktop renderer UI. The publisher scans Markdown notes, renders clean HTML pages, rewrites local note links, adds backlinks and tag pages when enabled, and copies local non-Markdown assets into the output folder.

## Usage

From the source checkout:

```bash
npm run publish:vault -- --vault /path/to/vault --out /path/to/site --clean
```

Or call the script directly:

```bash
node scripts/forge-publish.mjs --vault /path/to/vault --out /path/to/site --title "My Notes"
```

Publish a single folder as its own website:

```bash
node scripts/forge-publish.mjs \
  --vault /path/to/vault \
  --out /path/to/site \
  --scope Projects \
  --title "Projects" \
  --description "Project notes and status updates" \
  --theme reference \
  --clean
```

The desktop app can save multiple publishing profiles per vault. Each profile stores a site name, description, theme, scope, output folder, clean behavior, tag navigation, backlink sections, and deploy notes.

Available themes:

- `minimal`, `editorial`, `reference`
- `quiet-paper`, `terminal-ledger`, `swiss-ledger`, `soft-focus`, `field-notes`

If `--vault` is omitted, the command follows the normal Forge vault resolution order:

1. `FORGE_VAULT`
2. The active vault saved by the desktop app

## Output

The output folder contains:

- `index.html` with all notes, tags, counts, and broken wikilinks.
- `notes/**/*.html` for rendered Markdown notes.
- `tags/*.html` for tag index pages when tag navigation is enabled.
- `assets/**` copied from non-Markdown files in the vault.
- `_forge/styles.css`, `_forge/site.js`, and `_forge/manifest.json` for generated site assets, theme toggles, reading progress, and metadata.
- `.nojekyll` so GitHub Pages serves `_forge` assets.
- `.forge-publish.json` as the ownership marker used by `--clean`.

## Link Behavior

- Wikilinks such as `[[Project Plan]]`, `[[Folder/Note|label]]`, and `[[Note#Heading]]` resolve to generated note pages.
- Markdown links to other notes, such as `[Plan](Projects/Plan.md)`, resolve to generated note pages.
- Hashtags become links to generated tag pages.
- Local images, audio, video, PDFs, and other non-Markdown assets are copied to `assets/` and linked with relative URLs.
- Missing wikilinks are shown as unresolved and listed on `index.html`.

## Public Hosting

Forge publishing is static and host-neutral. The generated folder can be served by GitHub Pages, Cloudflare Pages, Netlify, Vercel, S3/R2, IPFS, or any plain web server. Forge does not require a Forge account, hosted API, or project-owned server to make published notes public.

For GitHub Pages, keep the generated `.nojekyll` file in the deployed output so files under `_forge/` are served.

## Roadmap Ideas

Good publishing defaults to borrow from dedicated tools include custom domain/subfolder notes, canonical URLs, Open Graph metadata, JSON-LD schema, RSS, local search, related posts, author pages, analytics hooks, email capture snippets, and newsletter export. Forge should keep these host-neutral and optional.

## Safety

The publisher refuses to write directly into the vault root or filesystem root. When the output folder is inside the vault, that folder is skipped during scanning so generated files do not get republished.

Use `--clean` to remove stale generated files before publishing. Cleanup is bounded: it only removes a non-empty folder when `.forge-publish.json` identifies it as a previous Forge publisher output.
