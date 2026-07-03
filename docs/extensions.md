# Forge Extensions

Forge's first extension system is intentionally local and declarative. The marketplace in Settings reads bundled manifests, lets users install/remove and enable/disable extensions, and persists those preferences in Forge settings.

## Current Model

- Extension manifests live in `src/renderer/src/extensions/registry.ts`.
- Manifest and extension point types live in `src/renderer/src/extensions/manifest.ts`.
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

## Adding A Bundled Extension

1. Add a manifest to `LOCAL_EXTENSION_MANIFESTS`.
2. Keep `runtime.kind` as `declarative`.
3. Declare only the permissions needed by the contribution.
4. Add UI or command integration separately, gated by `enabledExtensions` or `extensionSettings`.
5. Update this document when adding a new extension point.

## Future Marketplace Work

Remote extension install should come after these pieces are designed:

- Signed extension packages.
- Registry metadata format.
- Permission review UI.
- Sandboxed runtime boundary.
- Compatibility and version constraints.
- A submission/review process for the public registry.

