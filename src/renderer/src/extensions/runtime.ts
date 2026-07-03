import type { ExtensionInstallPreference, ExtensionSettings } from '../../../shared/types'
import type {
  CommandContribution,
  ExtensionContribution,
  ExtensionContributionKind,
  ExtensionManifest,
  ExtensionPermissionKind,
  ExtensionRegistry,
  MarkdownTransformContribution,
  MetadataProviderContribution,
  SidebarWidgetContribution,
  ViewContribution
} from './manifest'
import { extensionEntry, normalizeExtensionSettings } from './preferences'
import { LOCAL_EXTENSION_REGISTRY } from './registry'
import { formatExtensionIssue, validateExtensionRegistry } from './validation'

export type ExtensionRuntimeSurface =
  | 'command-palette'
  | 'editor-selection'
  | 'note-footer'
  | 'right-sidebar'
  | 'workspace-view'
  | 'extension-api'

export interface ExtensionRuntimeRouteMetadata {
  extensionPoint: string
  description?: string
  permissionKinds: ExtensionPermissionKind[]
  sourceKind: ExtensionManifest['source']['kind']
  contribution: ExtensionContribution
}

export interface ExtensionRuntimeRoute {
  id: string
  extensionId: string
  contributionId: string
  kind: ExtensionContributionKind
  label: string
  surface: ExtensionRuntimeSurface
  implementation: string
  status: 'wired' | 'declared'
  metadata: ExtensionRuntimeRouteMetadata
}

export interface ExtensionRuntimeManifest {
  manifest: ExtensionManifest
  entry: ExtensionInstallPreference
  contributions: ExtensionContribution[]
  routes: ExtensionRuntimeRoute[]
}

export interface ExtensionRuntimeCatalog {
  manifests: ExtensionRuntimeManifest[]
  installed: ExtensionRuntimeManifest[]
  enabled: ExtensionRuntimeManifest[]
  commands: CommandContribution[]
  markdownTransforms: MarkdownTransformContribution[]
  metadataProviders: MetadataProviderContribution[]
  sidebarWidgets: SidebarWidgetContribution[]
  views: ViewContribution[]
  routes: ExtensionRuntimeRoute[]
  diagnostics: string[]
}

const BUILT_IN_RUNTIME_ROUTES: Record<
  string,
  Pick<ExtensionRuntimeRoute, 'surface' | 'implementation' | 'status'>
> = {
  'forge.daily-notes.open-today': {
    surface: 'command-palette',
    implementation: 'store.createDailyNote',
    status: 'wired'
  },
  'forge.daily-notes.sidebar': {
    surface: 'right-sidebar',
    implementation: 'SidebarRight.ExtensionWidgets.daily-note',
    status: 'wired'
  },
  'forge.reading-stats.metadata': {
    surface: 'note-footer',
    implementation: 'store.counts',
    status: 'wired'
  },
  'forge.reading-stats.sidebar': {
    surface: 'right-sidebar',
    implementation: 'SidebarRight.ExtensionWidgets.reading-stats',
    status: 'wired'
  },
  'forge.markdown-tools.normalize-headings': {
    surface: 'editor-selection',
    implementation: 'CommandPalette.normalizeHeadingSpacing',
    status: 'wired'
  },
  'forge.markdown-tools.wrap-selection': {
    surface: 'editor-selection',
    implementation: 'CommandPalette.wrapSelection',
    status: 'wired'
  },
  'forge.graph-insights.view': {
    surface: 'workspace-view',
    implementation: 'store.openGraph',
    status: 'wired'
  },
  'forge.backlinks.metadata': {
    surface: 'right-sidebar',
    implementation: 'store.backlinksFor',
    status: 'wired'
  },
  'forge.backlinks.sidebar': {
    surface: 'right-sidebar',
    implementation: 'SidebarRight.Backlinks',
    status: 'wired'
  },
  'forge.unlinked-mentions.sidebar': {
    surface: 'right-sidebar',
    implementation: 'SidebarRight.UnlinkedMentions',
    status: 'wired'
  },
  'forge.link-health.metadata': {
    surface: 'right-sidebar',
    implementation: 'parseNote.links + resolveLink',
    status: 'wired'
  },
  'forge.link-health.sidebar': {
    surface: 'right-sidebar',
    implementation: 'SidebarRight.LinkHealth',
    status: 'wired'
  },
  'forge.tag-index.metadata': {
    surface: 'right-sidebar',
    implementation: 'parseNote.tags',
    status: 'wired'
  },
  'forge.tag-index.sidebar': {
    surface: 'right-sidebar',
    implementation: 'SidebarRight.Tags',
    status: 'wired'
  },
  'forge.outline-toc.metadata': {
    surface: 'right-sidebar',
    implementation: 'parseNote.headings',
    status: 'wired'
  },
  'forge.outline-toc.sidebar': {
    surface: 'right-sidebar',
    implementation: 'SidebarRight.Outline',
    status: 'wired'
  },
  'forge.publish-checklist.metadata': {
    surface: 'right-sidebar',
    implementation: 'parseNote.headings + parseFrontmatter.properties + resolveLink',
    status: 'wired'
  },
  'forge.publish-checklist.sidebar': {
    surface: 'right-sidebar',
    implementation: 'SidebarRight.PublishChecklist',
    status: 'wired'
  },
  'forge.frontmatter-inspector.metadata': {
    surface: 'right-sidebar',
    implementation: 'parseFrontmatter.properties',
    status: 'wired'
  },
  'forge.frontmatter-inspector.sidebar': {
    surface: 'right-sidebar',
    implementation: 'SidebarRight.Properties',
    status: 'wired'
  },
  'forge.media-player.sidebar': {
    surface: 'right-sidebar',
    implementation: 'SidebarRight.AudioAttachments',
    status: 'wired'
  }
}

function routeForContribution(manifest: ExtensionManifest, contribution: ExtensionContribution): ExtensionRuntimeRoute {
  const route = BUILT_IN_RUNTIME_ROUTES[contribution.id] ?? {
    surface: 'extension-api' as const,
    implementation: 'declarative contribution',
    status: 'declared' as const
  }

  return {
    id: `${manifest.id}:${contribution.id}`,
    extensionId: manifest.id,
    contributionId: contribution.id,
    kind: contribution.kind,
    label: contribution.label,
    metadata: {
      extensionPoint: contribution.extensionPoint,
      description: contribution.description,
      permissionKinds: manifest.permissions.map((permission) => permission.kind),
      sourceKind: manifest.source.kind,
      contribution
    },
    ...route
  }
}

function enabledContributions<K extends ExtensionContributionKind>(
  manifests: ExtensionRuntimeManifest[],
  kind: K
): Extract<ExtensionContribution, { kind: K }>[] {
  return manifests.flatMap((item) =>
    item.contributions.filter((contribution): contribution is Extract<ExtensionContribution, { kind: K }> => {
      return contribution.kind === kind
    })
  )
}

export function createExtensionRuntime(
  settings: ExtensionSettings,
  registry: ExtensionRegistry = LOCAL_EXTENSION_REGISTRY
): ExtensionRuntimeCatalog {
  const normalized = normalizeExtensionSettings(settings)
  const diagnostics = validateExtensionRegistry(registry).issues.map(formatExtensionIssue)
  const manifests = registry.manifests.map((manifest) => {
    const entry = extensionEntry(normalized, manifest.id)
    const contributions = entry.installed && entry.enabled ? [...manifest.contributes] : []
    return {
      manifest,
      entry,
      contributions,
      routes: contributions.map((contribution) => routeForContribution(manifest, contribution))
    }
  })
  const installed = manifests.filter((item) => item.entry.installed)
  const enabled = installed.filter((item) => item.entry.enabled)
  const routes = enabled.flatMap((item) => item.routes)

  return {
    manifests,
    installed,
    enabled,
    commands: enabledContributions(enabled, 'command'),
    markdownTransforms: enabledContributions(enabled, 'markdown-transform'),
    metadataProviders: enabledContributions(enabled, 'metadata-provider'),
    sidebarWidgets: enabledContributions(enabled, 'sidebar-widget'),
    views: enabledContributions(enabled, 'view'),
    routes,
    diagnostics
  }
}

export function extensionRuntimeForManifest(
  catalog: ExtensionRuntimeCatalog,
  extensionId: string
): ExtensionRuntimeManifest | undefined {
  return catalog.manifests.find((item) => item.manifest.id === extensionId)
}
