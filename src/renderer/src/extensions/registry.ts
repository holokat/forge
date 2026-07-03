import type { ExtensionManifest, ExtensionPointDefinition, ExtensionRegistry, ExtensionRuntimePolicy } from './manifest'

const declarativeRuntime: ExtensionRuntimePolicy = {
  kind: 'declarative',
  networkAccess: false,
  arbitraryCode: false,
  allowedHosts: []
}

export const LOCAL_EXTENSION_POINTS: readonly ExtensionPointDefinition[] = [
  {
    id: 'forge.commands',
    kind: 'command',
    label: 'Commands',
    description: 'Contributes local commands that can be surfaced by Forge command UIs.',
    stability: 'experimental',
    owner: 'forge',
    allowedContributionKinds: ['command']
  },
  {
    id: 'forge.markdown.transforms',
    kind: 'markdown-transform',
    label: 'Markdown transforms',
    description: 'Contributes bounded text transforms for selected Markdown content.',
    stability: 'experimental',
    owner: 'forge',
    allowedContributionKinds: ['markdown-transform']
  },
  {
    id: 'forge.note.metadata',
    kind: 'metadata-provider',
    label: 'Note metadata',
    description: 'Contributes local metadata fields derived from vault notes.',
    stability: 'experimental',
    owner: 'forge',
    allowedContributionKinds: ['metadata-provider']
  },
  {
    id: 'forge.sidebar.widgets',
    kind: 'sidebar-widget',
    label: 'Sidebar widgets',
    description: 'Contributes compact local widgets for the Forge sidebars.',
    stability: 'experimental',
    owner: 'forge',
    allowedContributionKinds: ['sidebar-widget']
  },
  {
    id: 'forge.views',
    kind: 'view',
    label: 'Views',
    description: 'Contributes local views backed by vault data already available to Forge.',
    stability: 'experimental',
    owner: 'forge',
    allowedContributionKinds: ['view']
  }
] as const

export const LOCAL_EXTENSION_MANIFESTS: readonly ExtensionManifest[] = [
  {
    manifestVersion: 1,
    id: 'forge.daily-notes',
    name: 'daily-notes',
    displayName: 'Daily Notes',
    description: "Adds a local command and sidebar entry for opening or creating today's note in the vault.",
    version: '0.1.0',
    publisher: 'Forge',
    license: 'MIT',
    repository: 'https://github.com/forge-notes/forge',
    categories: ['capture', 'organization'],
    keywords: ['journal', 'daily', 'capture'],
    source: { kind: 'built-in', label: 'Bundled with Forge' },
    runtime: declarativeRuntime,
    extensionPoints: [
      { id: 'forge.commands', label: 'Commands' },
      { id: 'forge.sidebar.widgets', label: 'Sidebar widgets' }
    ],
    permissions: [
      {
        kind: 'vault:write',
        reason: 'Creates a Markdown note for the current day when requested.'
      }
    ],
    contributes: [
      {
        id: 'forge.daily-notes.open-today',
        kind: 'command',
        extensionPoint: 'forge.commands',
        label: "Open today's note",
        command: 'forge.dailyNotes.openToday',
        icon: 'CalendarDays'
      },
      {
        id: 'forge.daily-notes.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Today',
        widget: 'daily-note'
      }
    ]
  },
  {
    manifestVersion: 1,
    id: 'forge.reading-stats',
    name: 'reading-stats',
    displayName: 'Reading Stats',
    description: 'Shows local word, character, and estimated reading-time metadata for the active note.',
    version: '0.1.0',
    publisher: 'Forge',
    license: 'MIT',
    repository: 'https://github.com/forge-notes/forge',
    categories: ['editing', 'organization'],
    keywords: ['word count', 'metadata', 'stats'],
    source: { kind: 'built-in', label: 'Bundled with Forge' },
    runtime: declarativeRuntime,
    extensionPoints: [
      { id: 'forge.note.metadata', label: 'Note metadata' },
      { id: 'forge.sidebar.widgets', label: 'Sidebar widgets' }
    ],
    permissions: [
      {
        kind: 'vault:read',
        reason: 'Reads the active note content already loaded by Forge.'
      }
    ],
    contributes: [
      {
        id: 'forge.reading-stats.metadata',
        kind: 'metadata-provider',
        extensionPoint: 'forge.note.metadata',
        label: 'Reading statistics',
        fields: ['wordCount', 'characterCount', 'estimatedReadingMinutes']
      },
      {
        id: 'forge.reading-stats.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Reading stats',
        widget: 'reading-stats'
      }
    ],
    defaultInstalled: true,
    defaultEnabled: true
  },
  {
    manifestVersion: 1,
    id: 'forge.markdown-tools',
    name: 'markdown-tools',
    displayName: 'Markdown Tools',
    description: 'Contributes local-only Markdown cleanup and wrapping transforms for selected text.',
    version: '0.1.0',
    publisher: 'Forge',
    license: 'MIT',
    repository: 'https://github.com/forge-notes/forge',
    categories: ['editing'],
    keywords: ['markdown', 'format', 'selection'],
    source: { kind: 'built-in', label: 'Bundled with Forge' },
    runtime: declarativeRuntime,
    extensionPoints: [
      { id: 'forge.commands', label: 'Commands' },
      { id: 'forge.markdown.transforms', label: 'Markdown transforms' }
    ],
    permissions: [
      {
        kind: 'vault:read',
        reason: 'Reads selected Markdown text before applying a local transform.'
      },
      {
        kind: 'vault:write',
        reason: 'Writes the transformed Markdown back to the current note.'
      }
    ],
    contributes: [
      {
        id: 'forge.markdown-tools.normalize-headings',
        kind: 'markdown-transform',
        extensionPoint: 'forge.markdown.transforms',
        label: 'Normalize heading spacing',
        transform: 'normalize-headings'
      },
      {
        id: 'forge.markdown-tools.wrap-selection',
        kind: 'markdown-transform',
        extensionPoint: 'forge.markdown.transforms',
        label: 'Wrap selection',
        transform: 'wrap-selection'
      }
    ]
  },
  {
    manifestVersion: 1,
    id: 'forge.graph-insights',
    name: 'graph-insights',
    displayName: 'Graph Insights',
    description: 'Adds a local graph summary view for orphans, hubs, backlinks, and broken wikilinks.',
    version: '0.1.0',
    publisher: 'Forge',
    license: 'MIT',
    repository: 'https://github.com/forge-notes/forge',
    categories: ['navigation', 'visualization'],
    keywords: ['graph', 'links', 'orphans'],
    source: { kind: 'built-in', label: 'Bundled with Forge' },
    runtime: declarativeRuntime,
    extensionPoints: [{ id: 'forge.views', label: 'Views' }],
    permissions: [
      {
        kind: 'vault:metadata',
        reason: 'Uses the local note index and link graph already built by Forge.'
      }
    ],
    contributes: [
      {
        id: 'forge.graph-insights.view',
        kind: 'view',
        extensionPoint: 'forge.views',
        label: 'Graph insights',
        view: 'graph-insights'
      }
    ]
  }
] as const

export const LOCAL_EXTENSION_REGISTRY: ExtensionRegistry = {
  points: LOCAL_EXTENSION_POINTS,
  manifests: LOCAL_EXTENSION_MANIFESTS
}

export function getLocalExtension(id: string): ExtensionManifest | undefined {
  return LOCAL_EXTENSION_MANIFESTS.find((manifest) => manifest.id === id)
}

export function searchLocalExtensions(query: string, manifests = LOCAL_EXTENSION_MANIFESTS): ExtensionManifest[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return [...manifests]

  return manifests.filter((manifest) => {
    const haystack = [
      manifest.displayName,
      manifest.name,
      manifest.description,
      manifest.publisher,
      manifest.license,
      ...manifest.categories,
      ...manifest.keywords,
      ...manifest.extensionPoints.map((point) => point.label)
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalized)
  })
}

export function registryDiagnostics(registry = LOCAL_EXTENSION_REGISTRY): string[] {
  const issues: string[] = []
  const pointIds = new Set(registry.points.map((point) => point.id))
  const manifestIds = new Set<string>()

  for (const manifest of registry.manifests) {
    if (manifestIds.has(manifest.id)) issues.push(`Duplicate extension id: ${manifest.id}`)
    manifestIds.add(manifest.id)

    const runtime = manifest.runtime as { networkAccess: boolean; arbitraryCode: boolean }
    if (runtime.networkAccess) issues.push(`Network access is not allowed: ${manifest.id}`)
    if (runtime.arbitraryCode) issues.push(`Arbitrary code execution is not allowed: ${manifest.id}`)

    for (const point of manifest.extensionPoints) {
      if (!pointIds.has(point.id)) issues.push(`Unknown extension point "${point.id}" in ${manifest.id}`)
    }

    for (const contribution of manifest.contributes) {
      if (!pointIds.has(contribution.extensionPoint)) {
        issues.push(`Unknown contribution point "${contribution.extensionPoint}" in ${manifest.id}`)
      }
    }
  }

  return issues
}
