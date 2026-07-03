import type { ExtensionInstallPreference, ExtensionSettings } from '../../../shared/types'
import type {
  CommandContribution,
  ExtensionContribution,
  ExtensionContributionKind,
  ExtensionManifest,
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

export interface ExtensionRuntimeRoute {
  id: string
  extensionId: string
  contributionId: string
  kind: ExtensionContributionKind
  label: string
  surface: ExtensionRuntimeSurface
  implementation: string
  status: 'wired' | 'declared'
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
    implementation: 'daily note sidebar widget route',
    status: 'declared'
  },
  'forge.reading-stats.metadata': {
    surface: 'note-footer',
    implementation: 'store.counts',
    status: 'wired'
  },
  'forge.reading-stats.sidebar': {
    surface: 'right-sidebar',
    implementation: 'reading stats sidebar widget route',
    status: 'declared'
  },
  'forge.markdown-tools.normalize-headings': {
    surface: 'editor-selection',
    implementation: 'markdown transform registry',
    status: 'declared'
  },
  'forge.markdown-tools.wrap-selection': {
    surface: 'editor-selection',
    implementation: 'markdown transform registry',
    status: 'declared'
  },
  'forge.graph-insights.view': {
    surface: 'workspace-view',
    implementation: 'store.openGraph',
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
