import type { ExtensionManifest, ExtensionPointDefinition, ExtensionRegistry, ExtensionRuntimePolicy } from './manifest'
import { formatExtensionIssue, validateExtensionRegistry } from './validation'

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
        reason: 'Reads selected Markdown text and active-note headings before applying local transforms.'
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
      },
      {
        id: 'forge.markdown-tools.lines-to-checklist',
        kind: 'markdown-transform',
        extensionPoint: 'forge.markdown.transforms',
        label: 'Convert lines to checklist',
        transform: 'lines-to-checklist'
      },
      {
        id: 'forge.markdown-tools.sort-lines',
        kind: 'markdown-transform',
        extensionPoint: 'forge.markdown.transforms',
        label: 'Sort selected lines',
        transform: 'sort-lines'
      },
      {
        id: 'forge.markdown-tools.callout',
        kind: 'markdown-transform',
        extensionPoint: 'forge.markdown.transforms',
        label: 'Wrap selection as callout',
        transform: 'callout'
      },
      {
        id: 'forge.markdown-tools.insert-table-of-contents',
        kind: 'markdown-transform',
        extensionPoint: 'forge.markdown.transforms',
        label: 'Insert generated table of contents',
        transform: 'insert-table-of-contents'
      }
    ],
    defaultInstalled: true,
    defaultEnabled: true
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
  },
  {
    manifestVersion: 1,
    id: 'forge.backlinks',
    name: 'backlinks',
    displayName: 'Backlinks',
    description: 'Exposes local backlinks, linked mentions, and unlinked mention opportunities for the active note.',
    version: '0.1.0',
    publisher: 'Forge',
    license: 'MIT',
    repository: 'https://github.com/forge-notes/forge',
    categories: ['navigation', 'organization'],
    keywords: ['backlinks', 'mentions', 'links'],
    source: { kind: 'built-in', label: 'Bundled with Forge' },
    runtime: declarativeRuntime,
    extensionPoints: [
      { id: 'forge.note.metadata', label: 'Note metadata' },
      { id: 'forge.sidebar.widgets', label: 'Sidebar widgets' }
    ],
    permissions: [
      {
        kind: 'vault:metadata',
        reason: 'Uses the local note index to find notes that link to or mention the active note.'
      }
    ],
    contributes: [
      {
        id: 'forge.backlinks.metadata',
        kind: 'metadata-provider',
        extensionPoint: 'forge.note.metadata',
        label: 'Backlink metadata',
        description: 'Counts linked sources and unlinked mention candidates for the active note.',
        fields: ['backlinks', 'backlinkCount', 'unlinkedMentions', 'unlinkedMentionCount']
      },
      {
        id: 'forge.backlinks.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Backlinks',
        description: 'Lists notes that link to the active note from the right sidebar.',
        widget: 'backlinks'
      },
      {
        id: 'forge.unlinked-mentions.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Unlinked mentions',
        description: 'Lists safe plain-text mentions that can be converted into wikilinks.',
        widget: 'unlinked-mentions'
      }
    ],
    defaultInstalled: true,
    defaultEnabled: true
  },
  {
    manifestVersion: 1,
    id: 'forge.link-health',
    name: 'link-health',
    displayName: 'Link Health',
    description: 'Surfaces unresolved wikilinks and local link health signals without running extension code.',
    version: '0.1.0',
    publisher: 'Forge',
    license: 'MIT',
    repository: 'https://github.com/forge-notes/forge',
    categories: ['navigation', 'organization', 'publishing'],
    keywords: ['unresolved links', 'broken links', 'wikilinks'],
    source: { kind: 'built-in', label: 'Bundled with Forge' },
    runtime: declarativeRuntime,
    extensionPoints: [
      { id: 'forge.note.metadata', label: 'Note metadata' },
      { id: 'forge.sidebar.widgets', label: 'Sidebar widgets' }
    ],
    permissions: [
      {
        kind: 'vault:metadata',
        reason: 'Uses the local note index to compare wikilinks with known Markdown files.'
      }
    ],
    contributes: [
      {
        id: 'forge.link-health.metadata',
        kind: 'metadata-provider',
        extensionPoint: 'forge.note.metadata',
        label: 'Unresolved link metadata',
        description: 'Reports unresolved wikilinks and broken-link counts derived from the local index.',
        fields: ['resolvedLinks', 'unresolvedLinks', 'brokenLinkCount']
      },
      {
        id: 'forge.link-health.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Link health',
        description: 'Shows local outgoing-link, broken-link, and backlink counts in the right sidebar.',
        widget: 'link-health'
      }
    ],
    defaultInstalled: true,
    defaultEnabled: true
  },
  {
    manifestVersion: 1,
    id: 'forge.tag-index',
    name: 'tag-index',
    displayName: 'Tag Index',
    description: 'Exposes note tags as local metadata, sidebar chips, searchable filters, and static-publish tag pages.',
    version: '0.1.0',
    publisher: 'Forge',
    license: 'MIT',
    repository: 'https://github.com/forge-notes/forge',
    categories: ['navigation', 'organization', 'publishing'],
    keywords: ['tags', 'index', 'filters'],
    source: { kind: 'built-in', label: 'Bundled with Forge' },
    runtime: declarativeRuntime,
    extensionPoints: [
      { id: 'forge.note.metadata', label: 'Note metadata' },
      { id: 'forge.sidebar.widgets', label: 'Sidebar widgets' }
    ],
    permissions: [
      {
        kind: 'vault:metadata',
        reason: 'Reads tags already parsed from Markdown bodies and frontmatter.'
      }
    ],
    contributes: [
      {
        id: 'forge.tag-index.metadata',
        kind: 'metadata-provider',
        extensionPoint: 'forge.note.metadata',
        label: 'Tag metadata',
        description: 'Provides active-note tags and tag counts from the local note index.',
        fields: ['tags', 'tagCount', 'frontmatterTags', 'inlineTags']
      },
      {
        id: 'forge.tag-index.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Tags',
        description: 'Shows active-note tag chips in the right sidebar.',
        widget: 'tags'
      }
    ],
    defaultInstalled: true,
    defaultEnabled: true
  },
  {
    manifestVersion: 1,
    id: 'forge.outline-toc',
    name: 'outline-toc',
    displayName: 'Outline and Table of Contents',
    description: 'Exposes Markdown headings as a local outline and table-of-contents contribution for active notes.',
    version: '0.1.0',
    publisher: 'Forge',
    license: 'MIT',
    repository: 'https://github.com/forge-notes/forge',
    categories: ['editing', 'navigation', 'organization'],
    keywords: ['outline', 'toc', 'headings'],
    source: { kind: 'built-in', label: 'Bundled with Forge' },
    runtime: declarativeRuntime,
    extensionPoints: [
      { id: 'forge.note.metadata', label: 'Note metadata' },
      { id: 'forge.sidebar.widgets', label: 'Sidebar widgets' }
    ],
    permissions: [
      {
        kind: 'vault:read',
        reason: 'Reads the active note headings already parsed by Forge.'
      }
    ],
    contributes: [
      {
        id: 'forge.outline-toc.metadata',
        kind: 'metadata-provider',
        extensionPoint: 'forge.note.metadata',
        label: 'Heading outline metadata',
        description: 'Provides heading text, levels, line numbers, and heading counts for the active note.',
        fields: ['headings', 'headingCount', 'tableOfContents']
      },
      {
        id: 'forge.outline-toc.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Outline',
        description: 'Shows active-note headings as a clickable right-sidebar outline.',
        widget: 'outline'
      }
    ],
    defaultInstalled: true,
    defaultEnabled: true
  },
  {
    manifestVersion: 1,
    id: 'forge.task-summary',
    name: 'task-summary',
    displayName: 'Task Summary',
    description: 'Shows open, completed, and total Markdown checkbox tasks for active notes and the full vault.',
    version: '0.1.0',
    publisher: 'Forge',
    license: 'MIT',
    repository: 'https://github.com/forge-notes/forge',
    categories: ['editing', 'organization'],
    keywords: ['tasks', 'checkboxes', 'todo', 'checklist'],
    source: { kind: 'built-in', label: 'Bundled with Forge' },
    runtime: declarativeRuntime,
    extensionPoints: [
      { id: 'forge.note.metadata', label: 'Note metadata' },
      { id: 'forge.sidebar.widgets', label: 'Sidebar widgets' },
      { id: 'forge.views', label: 'Views' }
    ],
    permissions: [
      {
        kind: 'vault:read',
        reason: 'Reads Markdown checkbox tasks already loaded from the active note.'
      }
    ],
    contributes: [
      {
        id: 'forge.task-summary.metadata',
        kind: 'metadata-provider',
        extensionPoint: 'forge.note.metadata',
        label: 'Task metadata',
        fields: ['tasks', 'openTasks', 'completedTasks', 'taskCompletionPercent']
      },
      {
        id: 'forge.task-summary.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Task summary',
        widget: 'tasks'
      },
      {
        id: 'forge.task-summary.view',
        kind: 'view',
        extensionPoint: 'forge.views',
        label: 'Tasks view',
        view: 'tasks'
      }
    ],
    defaultInstalled: true,
    defaultEnabled: true
  },
  {
    manifestVersion: 1,
    id: 'forge.vault-health',
    name: 'vault-health',
    displayName: 'Vault Health',
    description:
      'Adds a local vault-wide health view for broken links, stale notes, repair queues, duplicate titles, task load, and inbox cleanup.',
    version: '0.1.0',
    publisher: 'Forge',
    license: 'MIT',
    repository: 'https://github.com/forge-notes/forge',
    categories: ['navigation', 'organization', 'visualization'],
    keywords: ['vault health', 'quality', 'broken links', 'orphans', 'cleanup'],
    source: { kind: 'built-in', label: 'Bundled with Forge' },
    runtime: declarativeRuntime,
    extensionPoints: [
      { id: 'forge.note.metadata', label: 'Note metadata' },
      { id: 'forge.views', label: 'Views' }
    ],
    permissions: [
      {
        kind: 'vault:metadata',
        reason: 'Uses local note metadata, wikilinks, tags, tasks, and file paths already indexed by Forge.'
      }
    ],
    contributes: [
      {
        id: 'forge.vault-health.metadata',
        kind: 'metadata-provider',
        extensionPoint: 'forge.note.metadata',
        label: 'Vault health metadata',
        description: 'Reports vault-wide cleanup signals derived from local Markdown notes.',
        fields: [
          'brokenLinks',
          'orphanNotes',
          'untaggedNotes',
          'emptyNotes',
          'duplicateTitles',
          'staleNotes',
          'repairQueues',
          'openTasks',
          'inboxNotes'
        ]
      },
      {
        id: 'forge.vault-health.view',
        kind: 'view',
        extensionPoint: 'forge.views',
        label: 'Vault health',
        description: 'Opens the local vault-wide health dashboard.',
        view: 'vault-health'
      }
    ],
    defaultInstalled: true,
    defaultEnabled: true
  },
  {
    manifestVersion: 1,
    id: 'forge.publish-checklist',
    name: 'publish-checklist',
    displayName: 'Publish Checklist',
    description: 'Exposes local publishing readiness metadata and the built-in publish-page checklist workflow.',
    version: '0.1.0',
    publisher: 'Forge',
    license: 'MIT',
    repository: 'https://github.com/forge-notes/forge',
    categories: ['publishing', 'organization'],
    keywords: ['publish', 'checklist', 'static site'],
    source: { kind: 'built-in', label: 'Bundled with Forge' },
    runtime: declarativeRuntime,
    extensionPoints: [
      { id: 'forge.note.metadata', label: 'Note metadata' },
      { id: 'forge.sidebar.widgets', label: 'Sidebar widgets' }
    ],
    permissions: [
      {
        kind: 'vault:read',
        reason: 'Reads publish-page frontmatter and checklist items from local Markdown notes.'
      }
    ],
    contributes: [
      {
        id: 'forge.publish-checklist.metadata',
        kind: 'metadata-provider',
        extensionPoint: 'forge.note.metadata',
        label: 'Publishing checklist metadata',
        description: 'Identifies publish-page status, slugs, checklist items, and readiness signals.',
        fields: ['publishStatus', 'publishSlug', 'publishChecklistItems', 'publishReady']
      },
      {
        id: 'forge.publish-checklist.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Publish checklist',
        description: 'Shows local publish readiness checks in the right sidebar.',
        widget: 'publish-checklist'
      }
    ],
    defaultInstalled: true,
    defaultEnabled: true
  },
  {
    manifestVersion: 1,
    id: 'forge.frontmatter-inspector',
    name: 'frontmatter-inspector',
    displayName: 'Frontmatter Inspector',
    description: 'Exposes parsed frontmatter properties, aliases, and titles as local note metadata.',
    version: '0.1.0',
    publisher: 'Forge',
    license: 'MIT',
    repository: 'https://github.com/forge-notes/forge',
    categories: ['editing', 'organization'],
    keywords: ['frontmatter', 'properties', 'metadata'],
    source: { kind: 'built-in', label: 'Bundled with Forge' },
    runtime: declarativeRuntime,
    extensionPoints: [
      { id: 'forge.note.metadata', label: 'Note metadata' },
      { id: 'forge.sidebar.widgets', label: 'Sidebar widgets' }
    ],
    permissions: [
      {
        kind: 'vault:read',
        reason: 'Reads frontmatter already parsed from local Markdown notes.'
      }
    ],
    contributes: [
      {
        id: 'forge.frontmatter-inspector.metadata',
        kind: 'metadata-provider',
        extensionPoint: 'forge.note.metadata',
        label: 'Frontmatter metadata',
        description: 'Provides parsed frontmatter properties, aliases, and title overrides for the active note.',
        fields: ['frontmatterProperties', 'aliases', 'title']
      },
      {
        id: 'forge.frontmatter-inspector.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Properties',
        description: 'Shows active-note frontmatter properties in the right sidebar.',
        widget: 'frontmatter'
      }
    ],
    defaultInstalled: true,
    defaultEnabled: true
  },
  {
    manifestVersion: 1,
    id: 'forge.media-player',
    name: 'media-player',
    displayName: 'Media Gallery',
    description: 'Shows linked local images, video, audio, PDFs, and common attachments from the active note.',
    version: '0.1.0',
    publisher: 'Forge',
    license: 'MIT',
    repository: 'https://github.com/forge-notes/forge',
    categories: ['capture', 'editing', 'organization'],
    keywords: ['media', 'audio', 'recordings', 'attachments', 'voice', 'gallery'],
    source: { kind: 'built-in', label: 'Bundled with Forge' },
    runtime: declarativeRuntime,
    extensionPoints: [{ id: 'forge.sidebar.widgets', label: 'Sidebar widgets' }],
    permissions: [
      {
        kind: 'vault:read',
        reason: 'Reads linked local attachments for local preview and playback.'
      }
    ],
    contributes: [
      {
        id: 'forge.media-player.gallery',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Media gallery',
        widget: 'media-gallery'
      },
      {
        id: 'forge.media-player.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Audio attachments',
        widget: 'audio'
      }
    ],
    defaultInstalled: true,
    defaultEnabled: true
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
  return validateExtensionRegistry(registry).issues.map(formatExtensionIssue)
}
