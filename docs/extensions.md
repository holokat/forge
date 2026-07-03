# Forge Extensions

Forge's first extension system is intentionally local and declarative. The marketplace in Settings reads bundled manifests, lets users install/remove and enable/disable extensions, and persists those preferences in Forge settings.

Forge does not execute arbitrary third-party JavaScript. Extension manifests declare safe contributions that Forge can route to built-in runtime surfaces.

## Current Model

- Extension manifests live in `src/renderer/src/extensions/registry.ts`.
- Manifest and extension point types live in `src/renderer/src/extensions/manifest.ts`.
- Runtime hook routing lives in `src/renderer/src/extensions/runtime.ts`.
- Manifest and registry validation lives in `src/renderer/src/extensions/validation.ts`.
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

Routes map a contribution to a Forge-owned implementation surface such as the command palette, editor selection transforms, note footer metadata, right sidebar widgets, or workspace views. Contributions without an implemented route are treated as declared but not wired.

This keeps the marketplace honest: a manifest can be installed and enabled, but Forge still shows how many hooks are active and how many are wired to real app behavior.

## Adding A Bundled Extension

1. Add a manifest to `LOCAL_EXTENSION_MANIFESTS`.
2. Keep `runtime.kind` as `declarative`.
3. Declare only the permissions needed by the contribution.
4. Add UI or command integration separately, gated by `enabledExtensions` or `extensionSettings`.
5. Update this document when adding a new extension point.

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
npm run extensions:validate -- examples/extensions/daily-notes
npm run extensions:validate -- examples/extensions --recursive
npm run extensions:validate -- /path/to/forge-extension.json --json
```

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

Forge should only install remote registry entries after signature verification, manifest validation, version compatibility checks, and a user-visible permissions review. Until then, bundled and local-folder declarative manifests are the supported path.

## Future Marketplace Work

Remote extension install should come after these pieces are implemented:

- Signature verification against trusted registry keys.
- Permission review UI before install.
- Compatibility and version constraints.
- Sandboxed runtime boundary if Forge ever allows executable extensions.
- A submission/review process for the public registry.
