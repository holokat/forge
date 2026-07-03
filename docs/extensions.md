# Forge Extensions

Forge's first extension system is intentionally local and declarative. The marketplace in Settings reads bundled manifests, lets users install/remove and enable/disable extensions, and persists those preferences in Forge settings.

Forge does not execute arbitrary third-party JavaScript. Extension manifests declare safe contributions that Forge can route to built-in runtime surfaces.

## Current Model

- Extension manifests live in `src/renderer/src/extensions/registry.ts`.
- Manifest and extension point types live in `src/renderer/src/extensions/manifest.ts`.
- Runtime hook routing lives in `src/renderer/src/extensions/runtime.ts`.
- Manifest and registry validation lives in `src/renderer/src/extensions/validation.ts`.
- Agent-facing catalog reader and fallback data live in `scripts/lib/agent-catalog.mjs`.
- User install and enable state is stored as `extensionSettings` in Forge settings.
- Extensions do not execute arbitrary code yet.
- Extensions do not get network access yet.

This keeps the initial marketplace safe for open-source users while Forge grows stable extension points.

## Extension Points

The local registry currently defines these experimental extension points:

- `forge.commands`
- `forge.markdown.transforms`
- `forge.note.metadata`
- `forge.sidebar.widgets`
- `forge.views`

Each manifest declares the points it contributes to, the contribution kind, and the local permissions it needs.

## Runtime Hooks

Enabled extensions are resolved into an `ExtensionRuntimeCatalog`:

- `commands`
- `markdownTransforms`
- `metadataProviders`
- `sidebarWidgets`
- `views`
- `routes`

Routes map a contribution to a Forge-owned implementation surface such as the command palette, editor selection transforms, note footer metadata, right sidebar widgets, or workspace views. Each route also includes `metadata` with the extension point, contribution description, permission kinds, source kind, and original declarative contribution. Current bundled contributions are wired to visible app behavior. Future third-party contributions without an implemented route are treated as declared but not wired.

This keeps the marketplace honest: a manifest can be installed and enabled, but Forge still shows how many hooks are active and how many are wired to real app behavior.

## Bundled Local Extensions

Forge ships practical built-in manifests that describe local features without executing extension code:

| Extension | Contributions | Local surfaces |
| --- | --- | --- |
| Daily Notes | command, sidebar widget | Command palette and Today sidebar widget |
| Reading Stats | metadata provider, sidebar widget | Active-note counts and Reading stats sidebar widget |
| Markdown Tools | Markdown transforms | Heading cleanup, wrapping, checklist conversion, line sorting, callout formatting, and generated table-of-contents insertion in the command palette |
| Graph Insights | view | Graph workspace view |
| Backlinks | metadata provider, sidebar widget | Backlinks and unlinked mentions from the local index |
| Link Health | metadata provider, sidebar widget | Unresolved wikilink metadata, local link counts, and broken-link checks |
| Tag Index | metadata provider, sidebar widget | Active-note tags, tag search filters, and publish tag pages |
| Outline and Table of Contents | metadata provider, sidebar widget | Parsed headings and clickable right-sidebar outline |
| Task Summary | metadata provider, sidebar widget, view | Open/completed task counts, active-note task navigation, and a vault-wide Tasks workspace view |
| Vault Health | metadata provider, view | Broken links, stale notes, repair queues, duplicate titles, orphan notes, untagged/empty notes, inbox counts, and open task load in a vault-wide workspace view |
| Publish Checklist | metadata provider, sidebar widget | Publish-page checklist metadata and static publishing readiness checks |
| Frontmatter Inspector | metadata provider, sidebar widget | Parsed properties, aliases, and title metadata |
| Media Gallery | sidebar widget | Linked local image, video, audio, PDF, and common file attachments |

## Adding A Bundled Extension

1. Add a manifest to `LOCAL_EXTENSION_MANIFESTS`.
2. Keep `runtime.kind` as `declarative`.
3. Declare only the permissions needed by the contribution.
4. Keep the packaged registry resource and `scripts/lib/agent-catalog.mjs` fallback data current so agents can discover it from the CLI.
5. Add UI or command integration separately, gated by `enabledExtensions` or `extensionSettings`.
6. Update this document when adding a new extension point.

Agents can list the bundled extension catalog without opening the app or selecting a vault:

```bash
forge built-in-extensions --json
```

From a source checkout:

```bash
npm run agent -- built-in-extensions --json
```

## Local Folder Extension Manifests

Open-source contributors can prototype an extension in any folder with a `forge-extension.json` file:

```json
{
  "manifestVersion": 1,
  "id": "example.daily-notes",
  "name": "daily-notes",
  "displayName": "Daily Notes Example",
  "description": "Adds a safe command for opening today's local daily note.",
  "version": "0.1.0",
  "publisher": "Example",
  "license": "MIT",
  "categories": ["capture", "organization"],
  "keywords": ["daily", "journal"],
  "source": { "kind": "local-folder", "label": "Local folder", "path": "." },
  "runtime": {
    "kind": "declarative",
    "networkAccess": false,
    "arbitraryCode": false,
    "allowedHosts": []
  },
  "extensionPoints": [{ "id": "forge.commands", "label": "Commands" }],
  "permissions": [
    {
      "kind": "vault:write",
      "reason": "Creates a Markdown note for the current day when requested."
    }
  ],
  "contributes": [
    {
      "id": "example.daily-notes.open-today",
      "kind": "command",
      "extensionPoint": "forge.commands",
      "label": "Open today's note",
      "command": "forge.dailyNotes.openToday",
      "icon": "CalendarDays"
    }
  ]
}
```

Validate a manifest or folder before proposing it:

```bash
npm run agent -- validate-extension examples/extensions/daily-notes
npm run agent -- validate-extension examples/extensions --recursive --json
npm run extensions:validate -- examples/extensions/daily-notes
npm run extensions:validate -- examples/extensions --recursive
npm run extensions:validate -- /path/to/forge-extension.json --json
```

Current examples cover daily-note commands, reading stats, link health, tag/outline metadata, publish checklists, frontmatter inspection, task panels/checklists, generated table-of-contents insertion, callout formatting, media attachments, vault health scaffolds, vault maintenance queues, metadata dashboard scaffolds, static publishing workflows, agent handoff workflows, task review queues, saved-query scaffolds and catalogs, vault reporting, publish prep and preflight scaffolds, verification report workflows, and meeting/content workflows.

## Example Coverage

The manifests in `examples/extensions/` are local-folder examples for contributors. They intentionally use only contribution kinds and values accepted by the current validator:

| Example | Current valid coverage | Planned coverage not represented as a manifest |
| --- | --- | --- |
| `daily-notes` | Safe command declaration for opening today's note | Rich recurring-note rules |
| `reading-stats` | Metadata provider and reading stats sidebar widget | Per-folder reading analytics |
| `link-health` | Metadata provider and link-health sidebar widget | Bulk link repair actions |
| `tag-outline` | Tag and heading metadata plus tags and outline sidebar widgets | Generated table-of-contents insertion |
| `publish-checklist` | Publish metadata and publish checklist sidebar widget | Custom checklist rule packs |
| `frontmatter-inspector` | Frontmatter metadata and properties sidebar widget | Editable property schemas |
| `tasks-checklist` | Task checklist metadata, tasks sidebar widget, vault-wide tasks view, and `lines-to-checklist` Markdown transform | Recurring task rules and saved task filters |
| `table-of-contents-insertion` | Heading metadata plus the supported `insert-table-of-contents` Markdown transform | Editable TOC formatting presets |
| `media-attachments` | Attachment metadata fields plus the supported `media-gallery` sidebar widget | Attachment actions such as reveal, copy link, and batch organization |
| `callout-formatting` | Supported `callout` Markdown transform | Callout style presets and reusable callout templates |
| `vault-health` | Link, backlink, tag, heading, task, publish, stale-note, duplicate-title, and repair-queue metadata plus the supported `vault-health` view | Saved health reports, sidebar widgets, and bulk repair actions |
| `vault-reporting` | Link, backlink, tag, task, and publish metadata; `link-health`, `backlinks`, and `tasks` sidebar widgets; supported `vault-health` view | Dedicated report generation, scheduled health snapshots, and bulk repair actions |
| `vault-maintenance-queue` | Link, backlink, tag, task, publish, stale-note, duplicate-title, and repair-queue metadata; `link-health`, `backlinks`, `tasks`, and `tags` sidebar widgets; supported `vault-health` view; supported checklist, sort, and heading transforms | Explicit repair queue contribution values, bulk repair actions, and automated fix commands |
| `query-dashboard` | Frontmatter, tag, reading, task, and publish metadata only | Declarative query language, saved dashboard filters, table/card dashboard views, and computed rollups |
| `saved-query-scaffold` | Frontmatter, tag, reading, task, and publish metadata; `tags` and `frontmatter` sidebar widgets; validator-supported `append-template` and `normalize-headings` transforms | Executable saved-query language, query result views, table/card dashboard views, and computed rollups |
| `saved-query-catalog` | Frontmatter, tag, heading, reading, task, publish, and link metadata; `tags`, `frontmatter`, and `tasks` sidebar widgets; validator-supported `append-template`, `normalize-headings`, and `sort-lines` transforms | Executable saved-query language, query result views, saved dashboard/table views, computed rollups, and query scheduling |
| `static-publishing-workflow` | Publish, frontmatter, and heading metadata; `publish-checklist` sidebar widget; supported `insert-table-of-contents` transform | Publish pipeline commands, preflight rule packs, per-site deployment hooks, and custom readiness checks |
| `publish-prep` | Publish, frontmatter, heading, and link metadata; `publish-checklist`, `frontmatter`, and `outline` sidebar widgets; supported heading, TOC, and callout transforms | Publish pipeline commands, per-site deployment hooks, custom readiness checks, and batch preflight fixes |
| `publish-preflight` | Publish, frontmatter, tag, heading, and link metadata; `publish-checklist`, `frontmatter`, `outline`, and `link-health` sidebar widgets; supported `vault-health` view; validator-supported `append-template`, heading, TOC, and callout transforms | Publish preflight rule contribution values, saved publish profiles, CLI/MCP publish launchers, deployment hooks, and batch preflight fixes |
| `task-review` | Task, tag, frontmatter, and publish metadata; `tasks` and `frontmatter` sidebar widgets; supported `tasks` view; supported checklist and sort transforms | Review-state metadata schemas, saved review filters, assignment rules, and automated review summaries |
| `agent-handoff-workflow` | Frontmatter, tag, and task metadata; `tasks` and `frontmatter` sidebar widgets; supported `tasks` view; supported `lines-to-checklist` and `normalize-headings` transforms | Agent runbook contribution point, MCP/CLI workflow launchers, review-state metadata, and automated handoff summaries |
| `meeting-content-workflow` | Frontmatter, tag, heading, reading, and task metadata; `frontmatter`, `outline`, and `tasks` sidebar widgets; validator-supported `append-template`; supported checklist, callout, and heading transforms | Meeting/content template contribution point, editorial calendar views, transcript ingestion, and automated action-item extraction |
| `verification-report-workflow` | Frontmatter, tag, heading, link, task, publish, and reading metadata; `tasks`, `link-health`, `publish-checklist`, `frontmatter`, and `outline` sidebar widgets; supported `vault-health` and `tasks` views; validator-supported report, checklist, heading, and callout transforms | Dedicated verification report generators, test runner integrations, MCP/CLI workflow launchers, automated run capture, and review-state schemas |

The planned coverage column is intentionally prose. Example folder names and descriptions may use workflow terms, but manifest fields such as `kind`, `view`, `widget`, and `transform` must stay within the validator-supported values. Do not encode future contribution values such as `saved-query`, `query-results`, `publish-preflight`, `publish-profile`, `repair-queue`, `verification-report`, `meeting-workflow`, publishing pipeline commands, or agent workflow launchers in manifests until the validator adds those values. The `append-template` transform is accepted by the manifest validator and useful for scaffold examples, but it is not currently listed as a wired bundled Markdown Tools runtime route.

Validation checks:

- Required manifest fields.
- Supported extension points and contribution kinds.
- Declarative-only runtime policy.
- No network access.
- No arbitrary code execution.
- Permission declarations and reason strings.
- Contribution shape for commands, Markdown transforms, metadata providers, sidebar widgets, and views.

## Signed Registry Draft

Remote extension installation should use a signed registry document before it is exposed in the app:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-03T00:00:00.000Z",
  "minForgeVersion": "0.1.1",
  "registry": {
    "points": [],
    "manifests": []
  },
  "signatures": [
    {
      "algorithm": "ed25519",
      "keyId": "forge-registry-2026-01",
      "signedPayloadSha256": "base64-or-hex-digest",
      "signature": "base64-signature"
    }
  ]
}
```

The Extensions settings pane includes a signed-registry import preview. It validates registry document shape, signature metadata, manifest declarations, and contribution compatibility before enabling the install action. Forge should only complete remote registry installation after cryptographic signature verification against trusted public keys, version compatibility checks, and a user-visible permissions review. Until then, bundled and local-folder declarative manifests are the supported path.

## Future Marketplace Work

Remote extension install should come after these pieces are implemented:

- Signature verification against trusted registry keys.
- Full permission review confirmation before install.
- Compatibility and version constraints.
- Sandboxed runtime boundary if Forge ever allows executable extensions.
- A submission/review process for the public registry.
