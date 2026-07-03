export type ExtensionId = string

export type ExtensionCategory = 'capture' | 'editing' | 'navigation' | 'organization' | 'publishing' | 'visualization'

export type ExtensionPointKind = 'command' | 'markdown-transform' | 'metadata-provider' | 'sidebar-widget' | 'view'

export type ExtensionPointStability = 'experimental' | 'stable'

export type ExtensionContributionKind = 'command' | 'markdown-transform' | 'metadata-provider' | 'sidebar-widget' | 'view'

export type ExtensionPermissionKind =
  | 'clipboard:write'
  | 'settings:read'
  | 'vault:metadata'
  | 'vault:read'
  | 'vault:write'
  | 'workspace:ui'

export interface ExtensionPermission {
  kind: ExtensionPermissionKind
  reason: string
  optional?: boolean
}

export interface ExtensionPointDefinition {
  id: string
  kind: ExtensionPointKind
  label: string
  description: string
  stability: ExtensionPointStability
  owner: 'forge'
  allowedContributionKinds: ExtensionContributionKind[]
}

export interface ExtensionPointRef {
  id: string
  label: string
}

interface BaseContribution {
  id: string
  extensionPoint: string
  label: string
  description?: string
}

export interface CommandContribution extends BaseContribution {
  kind: 'command'
  command: string
  icon?: string
}

export interface MarkdownTransformContribution extends BaseContribution {
  kind: 'markdown-transform'
  transform:
    | 'append-template'
    | 'normalize-headings'
    | 'wrap-selection'
    | 'lines-to-checklist'
    | 'sort-lines'
    | 'callout'
    | 'insert-table-of-contents'
}

export interface MetadataProviderContribution extends BaseContribution {
  kind: 'metadata-provider'
  fields: string[]
}

export interface SidebarWidgetContribution extends BaseContribution {
  kind: 'sidebar-widget'
  widget:
    | 'reading-stats'
    | 'daily-note'
    | 'audio'
    | 'frontmatter'
    | 'outline'
    | 'backlinks'
    | 'unlinked-mentions'
    | 'tags'
    | 'tasks'
    | 'media-gallery'
    | 'link-health'
    | 'publish-checklist'
}

export interface ViewContribution extends BaseContribution {
  kind: 'view'
  view: 'graph-insights'
}

export type ExtensionContribution =
  | CommandContribution
  | MarkdownTransformContribution
  | MetadataProviderContribution
  | SidebarWidgetContribution
  | ViewContribution

export interface ExtensionRuntimePolicy {
  kind: 'declarative'
  networkAccess: false
  arbitraryCode: false
  allowedHosts: []
}

export interface ExtensionSource {
  kind: 'built-in' | 'local-folder'
  label: string
  path?: string
}

export interface ExtensionManifest {
  manifestVersion: 1
  id: ExtensionId
  name: string
  displayName: string
  description: string
  version: string
  publisher: string
  license: string
  repository?: string
  homepage?: string
  categories: ExtensionCategory[]
  keywords: string[]
  source: ExtensionSource
  runtime: ExtensionRuntimePolicy
  extensionPoints: ExtensionPointRef[]
  permissions: ExtensionPermission[]
  contributes: ExtensionContribution[]
  defaultInstalled?: boolean
  defaultEnabled?: boolean
}

export interface ExtensionRegistry {
  points: readonly ExtensionPointDefinition[]
  manifests: readonly ExtensionManifest[]
}

export interface ExtensionRegistrySignature {
  algorithm: 'ed25519'
  keyId: string
  signature: string
  signedPayloadSha256: string
  signedAt?: string
}

export interface ExtensionRegistryDocument {
  schemaVersion: 1
  generatedAt: string
  minForgeVersion?: string
  registry: ExtensionRegistry
  signatures: readonly ExtensionRegistrySignature[]
}
