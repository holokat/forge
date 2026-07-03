import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const builtInTemplateVariables = ['title', 'date', 'time', 'datetime', 'vault', 'template', 'folder']
const builtInVariableSet = new Set(builtInTemplateVariables)
const lines = (...items) => items.join('\n')

export const BUILT_IN_STARTER_TEMPLATES = [
  {
    kind: 'daily',
    label: 'Daily',
    detail: 'Date-based planning',
    file: 'Daily.md',
    content: lines(
      '---',
      'date: {{date}}',
      'tags: [daily]',
      '---',
      '',
      '# {{date}}',
      '',
      '## Focus',
      '{{prompt:Focus}}',
      '',
      '## Schedule',
      '',
      '## Notes',
      '',
      '## Tasks',
      ''
    )
  },
  {
    kind: 'meeting',
    label: 'Meeting notes',
    detail: 'Agenda, decisions, action items',
    file: 'Meeting Notes.md',
    content: lines(
      '---',
      'type: meeting',
      'date: {{date}}',
      'tags: [meeting]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Attendees',
      '{{prompt:Attendees}}',
      '',
      '## Agenda',
      '{{prompt:Agenda}}',
      '',
      '## Notes',
      '',
      '## Decisions',
      '',
      '## Action items',
      ''
    )
  },
  {
    kind: 'project',
    label: 'Project plan',
    detail: 'Scope, milestones, risks',
    file: 'Project Plan.md',
    content: lines(
      '---',
      'type: project',
      'status: {{select:Status|Planning,Active,Paused,Done}}',
      'tags: [project]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Goal',
      '{{prompt:Goal}}',
      '',
      '## Scope',
      '',
      '## Milestones',
      '',
      '## Open questions',
      ''
    )
  },
  {
    kind: 'person',
    label: 'Person',
    detail: 'Relationship notes',
    file: 'Person.md',
    content: lines(
      '---',
      'type: person',
      'tags: [person]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Role',
      '{{prompt:Role}}',
      '',
      '## Context',
      '',
      '## Notes',
      '',
      '## Follow-ups',
      ''
    )
  },
  {
    kind: 'research',
    label: 'Research brief',
    detail: 'Questions, sources, synthesis',
    file: 'Research Brief.md',
    content: lines(
      '---',
      'type: research',
      'created: {{date}}',
      'tags: [research]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Question',
      '{{prompt:Research question}}',
      '',
      '## Sources',
      '',
      '## Findings',
      '',
      '## Synthesis',
      ''
    )
  },
  {
    kind: 'agentTask',
    label: 'Agent task',
    detail: 'Precise AI work briefs',
    file: 'Agent Task Brief.md',
    content: lines(
      '---',
      'type: agent-task',
      'status: {{select:Status|Ready,In progress,Blocked,Done}}',
      'created: {{date}}',
      'tags: [agent, task]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Objective',
      '{{prompt:Objective}}',
      '',
      '## Context',
      '- Vault: {{vault}}',
      '- Folder: {{folder}}',
      '- Related notes: {{prompt:Related notes}}',
      '',
      '## Constraints',
      '- Preserve existing user changes.',
      '- Keep paths relative to the vault.',
      '- Prefer small, reviewable edits.',
      '',
      '## Checklist',
      '- [ ] Inspect current state',
      '- [ ] Implement the requested change',
      '- [ ] Verify behavior',
      '- [ ] Summarize outcome',
      '',
      '## Result',
      ''
    )
  },
  {
    kind: 'seoBrief',
    label: 'SEO brief',
    detail: 'Search-focused content planning',
    file: 'SEO Content Brief.md',
    content: lines(
      '---',
      'type: seo-brief',
      'status: {{select:Status|Brief,Drafting,Review,Published}}',
      'created: {{date}}',
      'tags: [seo, content]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Search Target',
      '- Primary keyword: {{prompt:Primary keyword}}',
      '- Secondary keywords: {{prompt:Secondary keywords}}',
      '- Audience: {{prompt:Audience}}',
      '- Search intent: {{select:Search intent|Informational,Commercial,Transactional,Navigational}}',
      '',
      '## Angle',
      '{{prompt:Angle}}',
      '',
      '## Outline',
      '- H1: {{title}}',
      '- H2:',
      '- H2:',
      '- H2:',
      '',
      '## Internal Links',
      '- ',
      '',
      '## Notes for Agent',
      '- Preserve factual uncertainty.',
      '- Suggest sources before drafting claims.',
      '- Keep headings scannable.',
      ''
    )
  },
  {
    kind: 'productSpec',
    label: 'PRD',
    detail: 'Requirements and launch criteria',
    file: 'PRD.md',
    content: lines(
      '---',
      'type: product-spec',
      'status: {{select:Status|Draft,Ready,Building,Shipped}}',
      'created: {{date}}',
      'tags: [product, spec]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Problem',
      '{{prompt:Problem}}',
      '',
      '## User',
      '{{prompt:User}}',
      '',
      '## Goals',
      '- ',
      '',
      '## Non-goals',
      '- ',
      '',
      '## Requirements',
      '- ',
      '',
      '## Open Questions',
      '- ',
      '',
      '## Launch Notes',
      ''
    )
  },
  {
    kind: 'bugReport',
    label: 'Bug report',
    detail: 'Repro, impact, fix notes',
    file: 'Bug Report.md',
    content: lines(
      '---',
      'type: bug',
      "status: {{select:Status|New,Triaged,Fixing,Fixed,Won't fix}}",
      'severity: {{select:Severity|Low,Medium,High,Critical}}',
      'created: {{date}}',
      'tags: [bug]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Summary',
      '{{prompt:Summary}}',
      '',
      '## Environment',
      '{{prompt:Environment}}',
      '',
      '## Steps to Reproduce',
      '1. ',
      '2. ',
      '3. ',
      '',
      '## Expected',
      '',
      '## Actual',
      '',
      '## Notes / Fix',
      ''
    )
  },
  {
    kind: 'decision',
    label: 'Decision record',
    detail: 'Options and rationale',
    file: 'Decision Record.md',
    content: lines(
      '---',
      'type: decision',
      'status: {{select:Status|Proposed,Accepted,Rejected,Revisited}}',
      'date: {{date}}',
      'tags: [decision]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Decision',
      '{{prompt:Decision}}',
      '',
      '## Context',
      '',
      '## Options',
      '- Option A:',
      '- Option B:',
      '',
      '## Rationale',
      '',
      '## Consequences',
      '- ',
      ''
    )
  },
  {
    kind: 'releaseNotes',
    label: 'Release notes',
    detail: 'User-facing changes',
    file: 'Release Notes.md',
    content: lines(
      '---',
      'type: release-notes',
      'version: {{prompt:Version}}',
      'date: {{date}}',
      'tags: [release]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Highlights',
      '- ',
      '',
      '## Added',
      '- ',
      '',
      '## Improved',
      '- ',
      '',
      '## Fixed',
      '- ',
      '',
      '## Notes',
      ''
    )
  },
  {
    kind: 'changelog',
    label: 'Changelog entry',
    detail: 'Forge-style product entries',
    file: 'Changelog Entry.md',
    content: lines(
      '---',
      'type: changelog',
      'date: {{datetime}}',
      'change_type: {{select:Change type|Feature,Improvement,Fix,Docs,Internal}}',
      'tags: [forge, changelog]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Summary',
      '{{prompt:Summary}}',
      '',
      '## User Impact',
      '{{prompt:User impact}}',
      '',
      '## Website Copy Notes',
      '',
      '## Implementation Notes',
      ''
    )
  },
  {
    kind: 'transcriptCleanup',
    label: 'Transcript cleanup',
    detail: 'Raw transcript to polished notes',
    file: 'Transcript Cleanup.md',
    content: lines(
      '---',
      'type: transcript-cleanup',
      'status: {{select:Status|Raw,Cleaning,Reviewed,Published}}',
      'source: {{prompt:Source recording or note}}',
      'created: {{date}}',
      'tags: [transcript, voice]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Cleanup Instructions',
      '{{prompt:Cleanup instructions}}',
      '',
      '## Speaker Notes',
      '{{prompt:Speaker names}}',
      '',
      '## Raw Transcript',
      '',
      '## Cleaned Transcript',
      '',
      '## Summary',
      '- ',
      '',
      '## Key Points',
      '- ',
      '',
      '## Action Items',
      '- [ ] ',
      '',
      '## Quotes to Preserve',
      '- ',
      '',
      '## Follow-up Questions',
      '- ',
      '',
      '## Agent Instructions',
      '- Preserve speaker intent.',
      '- Remove filler and obvious transcription mistakes.',
      '- Keep uncertain phrases marked with [?].',
      '- Do not invent facts that are not in the transcript.'
    )
  },
  {
    kind: 'publishPage',
    label: 'Publish page',
    detail: 'Public Markdown pages',
    file: 'Publish Page.md',
    content: lines(
      '---',
      'type: publish-page',
      'status: {{select:Status|Draft,Review,Published}}',
      'slug: {{prompt:Slug}}',
      'created: {{date}}',
      'tags: [publish]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Summary',
      '{{prompt:Summary}}',
      '',
      '## Body',
      '',
      '## Assets',
      '- ',
      '',
      '## Publishing Checklist',
      '- [ ] Check links',
      '- [ ] Check images and media',
      '- [ ] Export static site',
      ''
    )
  }
]

const declarativeRuntime = {
  kind: 'declarative',
  networkAccess: false,
  arbitraryCode: false,
  allowedHosts: []
}

export const BUILT_IN_EXTENSION_POINTS = [
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
]

export const BUILT_IN_EXTENSION_MANIFESTS = [
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
        fields: ['backlinks', 'backlinkCount', 'unlinkedMentions', 'unlinkedMentionCount']
      },
      {
        id: 'forge.backlinks.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Backlinks',
        widget: 'backlinks'
      },
      {
        id: 'forge.unlinked-mentions.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Unlinked mentions',
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
        fields: ['resolvedLinks', 'unresolvedLinks', 'brokenLinkCount']
      },
      {
        id: 'forge.link-health.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Link health',
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
        fields: ['tags', 'tagCount', 'frontmatterTags', 'inlineTags']
      },
      {
        id: 'forge.tag-index.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Tags',
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
        fields: ['headings', 'headingCount', 'tableOfContents']
      },
      {
        id: 'forge.outline-toc.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Outline',
        widget: 'outline'
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
        fields: ['publishStatus', 'publishSlug', 'publishChecklistItems', 'publishReady']
      },
      {
        id: 'forge.publish-checklist.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Publish checklist',
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
        fields: ['frontmatterProperties', 'aliases', 'title']
      },
      {
        id: 'forge.frontmatter-inspector.sidebar',
        kind: 'sidebar-widget',
        extensionPoint: 'forge.sidebar.widgets',
        label: 'Properties',
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
    displayName: 'Media Player',
    description: 'Shows playable linked audio attachments for local voice recordings and imported media.',
    version: '0.1.0',
    publisher: 'Forge',
    license: 'MIT',
    repository: 'https://github.com/forge-notes/forge',
    categories: ['capture', 'editing'],
    keywords: ['audio', 'recordings', 'attachments', 'voice'],
    source: { kind: 'built-in', label: 'Bundled with Forge' },
    runtime: declarativeRuntime,
    extensionPoints: [{ id: 'forge.sidebar.widgets', label: 'Sidebar widgets' }],
    permissions: [
      {
        kind: 'vault:read',
        reason: 'Reads linked local audio attachments for playback.'
      }
    ],
    contributes: [
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
]

let sourceRegistryCache

function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
}

function extractConstArray(source, exportName) {
  const marker = `export const ${exportName}`
  const markerIndex = source.indexOf(marker)
  if (markerIndex === -1) return ''
  const assignment = source.indexOf('=', markerIndex)
  if (assignment === -1) return ''
  const start = source.indexOf('[', assignment)
  if (start === -1) return ''

  let depth = 0
  let quote = ''
  let escaped = false
  for (let index = start; index < source.length; index++) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '[') depth++
    if (char === ']') {
      depth--
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  return ''
}

function readSourceRegistryCatalog() {
  if (sourceRegistryCache !== undefined) return sourceRegistryCache

  sourceRegistryCache = null
  const registryPath = path.join(packageRoot(), 'src', 'renderer', 'src', 'extensions', 'registry.ts')
  if (!fs.existsSync(registryPath)) return sourceRegistryCache

  try {
    const source = fs.readFileSync(registryPath, 'utf8')
    const pointsSource = extractConstArray(source, 'LOCAL_EXTENSION_POINTS')
    const manifestsSource = extractConstArray(source, 'LOCAL_EXTENSION_MANIFESTS')
    if (!pointsSource || !manifestsSource) return sourceRegistryCache

    const points = Function(`return (${pointsSource})`)()
    const manifests = Function('declarativeRuntime', `return (${manifestsSource})`)(declarativeRuntime)
    if (Array.isArray(points) && Array.isArray(manifests)) {
      sourceRegistryCache = { points, manifests, source: registryPath }
    }
  } catch {
    sourceRegistryCache = null
  }

  return sourceRegistryCache
}

export function extensionPointDefinitions() {
  return readSourceRegistryCatalog()?.points ?? BUILT_IN_EXTENSION_POINTS
}

export function parseTemplatePlaceholders(content) {
  const placeholders = []
  const seen = new Set()

  for (const match of content.matchAll(/\{\{\s*([^{}\n]+?)\s*\}\}/g)) {
    const raw = match[1].trim()
    const prompt = /^prompt\s*:\s*(.+)$/i.exec(raw)
    const select = /^select\s*:\s*([^|]+)(?:\|(.*))?$/i.exec(raw)
    const key = prompt?.[1]?.trim() || select?.[1]?.trim() || raw
    const kind = prompt ? 'prompt' : select ? 'select' : builtInVariableSet.has(raw.toLowerCase()) ? 'built-in' : 'custom'
    const options = select?.[2]
      ? select[2].split(/[|,]/).map((option) => option.trim()).filter(Boolean)
      : []
    const id = `${kind}:${key.toLowerCase()}:${options.join('|')}`
    if (seen.has(id)) continue
    seen.add(id)
    placeholders.push({
      key,
      kind,
      placeholder: `{{${raw}}}`,
      ...(options.length ? { options } : {})
    })
  }

  return placeholders
}

export function builtInTemplateCatalog({ includeContent = false } = {}) {
  return {
    builtInVariables: builtInTemplateVariables,
    count: BUILT_IN_STARTER_TEMPLATES.length,
    templates: BUILT_IN_STARTER_TEMPLATES.map((template) => {
      const placeholders = parseTemplatePlaceholders(template.content)
      return {
        kind: template.kind,
        label: template.label,
        detail: template.detail,
        file: template.file,
        fields: placeholders.filter((field) => field.kind !== 'built-in'),
        placeholders,
        ...(includeContent ? { content: template.content } : {})
      }
    })
  }
}

export function builtInExtensionCatalog() {
  const sourceCatalog = readSourceRegistryCatalog()
  const points = sourceCatalog?.points ?? BUILT_IN_EXTENSION_POINTS
  const manifests = sourceCatalog?.manifests ?? BUILT_IN_EXTENSION_MANIFESTS
  const contributionCount = manifests.reduce((total, manifest) => total + manifest.contributes.length, 0)
  const permissionKinds = Array.from(
    new Set(manifests.flatMap((manifest) => manifest.permissions.map((permission) => permission.kind)))
  ).sort()

  return {
    count: manifests.length,
    pointCount: points.length,
    contributionCount,
    permissionKinds,
    source: sourceCatalog ? 'source-registry' : 'script-fallback',
    points,
    manifests
  }
}
