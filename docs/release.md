# Forge Release Notes

Forge macOS releases must be Developer ID signed, notarized by Apple, and stapled before they are attached to a public GitHub release.

## Required Secrets

Set these GitHub repository secrets before publishing a macOS release:

- `MACOS_CERTIFICATE_P12`: Base64 encoded Developer ID Application certificate export.
- `MACOS_CERTIFICATE_PASSWORD`: Password for the `.p12` certificate export.
- `APPLE_API_KEY_BASE64`: Base64 encoded `AuthKey_<key-id>.p8` App Store Connect API key.
- `APPLE_API_KEY_ID`: App Store Connect API key ID.
- `APPLE_API_ISSUER`: App Store Connect issuer UUID.
- `APPLE_TEAM_ID`: Apple Developer Team ID.

Use an App Store Connect Team API key with App Manager access. The issuer UUID is shown in App Store Connect under Users and Access, Integrations, App Store Connect API.

## Local Validation

For local release checks, export the same Apple variables before building:

```bash
export APPLE_API_KEY=/absolute/path/to/AuthKey_<key-id>.p8
export APPLE_API_KEY_ID=<key-id>
export APPLE_API_ISSUER=<issuer-uuid>
export APPLE_TEAM_ID=<team-id>
npm run dist:notarized
```

Validate the app and DMG:

```bash
codesign --verify --deep --strict --verbose=4 release/mac-arm64/Forge.app
xcrun stapler validate release/mac-arm64/Forge.app
spctl -a -vvv -t open release/mac-arm64/Forge.app
spctl -a -vvv -t install release/Forge-*-arm64.dmg
```

## Publishing

1. Update `package.json` and `package-lock.json` version.
2. Commit the release change.
3. Tag the commit as `vX.Y.Z`.
4. Push the tag.

The `release-macos.yml` workflow builds the app, notarizes it, staples the ticket, and uploads the DMG, blockmap, and `latest-mac.yml` to the GitHub release.
