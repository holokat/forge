import { create } from 'zustand'
import type { ReactNode } from 'react'
import {
  DEFAULT_SETTINGS,
  type ExtensionSettings,
  type PublishSiteConfig,
  type PublishSiteTheme,
  type Settings,
  type ThemeMode,
  type VaultFileStat
} from '../../shared/types'
import {
  createDefaultExtensionSettings,
  enabledExtensionIds,
  normalizeExtensionSettings,
  withExtensionEnabled,
  withExtensionInstalled
} from './extensions/preferences'
import { baseName, isMarkdown, noteDisplayTitle, parseNote, resolveLink, wordCount, type NoteMeta } from './lib/parse'
import { formatTemplateDateParts, renderTemplate } from './lib/templates'

export type TabKind = 'note' | 'graph' | 'empty'
export type ViewMode = 'edit' | 'read'
export const STARTER_TEMPLATE_KINDS = [
  'daily',
  'weeklyReview',
  'meeting',
  'sourceNote',
  'knowledgeMap',
  'calloutLibrary',
  'agentTask',
  'agentReview',
  'taskReview',
  'savedQuery',
  'publishPreflight',
  'savedQueryCatalog',
  'verificationReportWorkflow',
  'implementationPlan',
  'refactorPlan',
  'seoBrief',
  'contentRefreshBrief',
  'research',
  'sprintPlan',
  'productSpec',
  'project',
  'supportTicket',
  'experimentLog',
  'contentOutline',
  'interviewNotes',
  'bugReport',
  'decision',
  'incidentPostmortem',
  'technicalRFC',
  'apiSpec',
  'extensionSpec',
  'launchPlan',
  'customerProfile',
  'contentCalendar',
  'learningPlan',
  'decisionReview',
  'publishPage',
  'publishRunbook',
  'changelog',
  'transcriptCleanup',
  'releaseNotes',
  'person'
] as const
export type StarterTemplateKind = (typeof STARTER_TEMPLATE_KINDS)[number]

export const STARTER_TEMPLATE_CATALOG: { kind: StarterTemplateKind; label: string; detail: string }[] = [
  { kind: 'daily', label: 'Daily note', detail: 'Focus, log, decisions, follow-ups' },
  { kind: 'weeklyReview', label: 'Weekly review', detail: 'Wins, learnings, open loops, next week' },
  { kind: 'meeting', label: 'Meeting notes', detail: 'Agenda, decisions, action items' },
  { kind: 'sourceNote', label: 'Source note', detail: 'Literature notes and source extraction' },
  { kind: 'knowledgeMap', label: 'Knowledge map', detail: 'MOC hub for linked notes and gaps' },
  { kind: 'calloutLibrary', label: 'Callout library / snippets', detail: 'Reusable note, tip, warning, question, and quote snippets' },
  { kind: 'agentTask', label: 'Agent task', detail: 'Precise AI work briefs' },
  { kind: 'agentReview', label: 'Agent review / QA', detail: 'Checklist for reviewing agent work' },
  { kind: 'taskReview', label: 'Task review', detail: 'Review open work, owners, blockers, and next actions' },
  { kind: 'savedQuery', label: 'Saved query', detail: 'Reusable search, task, tag, or link query' },
  { kind: 'publishPreflight', label: 'Publish preflight', detail: 'Readiness checks before static-site publishing' },
  { kind: 'savedQueryCatalog', label: 'Saved query catalog', detail: 'Index reusable queries, thresholds, and owners' },
  { kind: 'verificationReportWorkflow', label: 'Verification report', detail: 'Capture checks, evidence, risks, and handoff' },
  { kind: 'implementationPlan', label: 'Implementation plan', detail: 'Scope, steps, commands, verification, and handoff' },
  { kind: 'refactorPlan', label: 'Refactor plan', detail: 'Preserve behavior while changing structure safely' },
  { kind: 'seoBrief', label: 'SEO/content brief', detail: 'Audience, intent, outline, links' },
  { kind: 'contentRefreshBrief', label: 'Content refresh brief', detail: 'Audit and update stale content without losing intent' },
  { kind: 'research', label: 'Research brief', detail: 'Questions, sources, synthesis' },
  { kind: 'sprintPlan', label: 'Sprint plan', detail: 'Goals, scope, capacity, risks' },
  { kind: 'productSpec', label: 'PRD', detail: 'Requirements and launch criteria' },
  { kind: 'project', label: 'Project plan', detail: 'Scope, milestones, risks' },
  { kind: 'supportTicket', label: 'Support ticket', detail: 'Customer issue tracking and resolution' },
  { kind: 'experimentLog', label: 'Experiment log', detail: 'Hypothesis, procedure, results' },
  { kind: 'contentOutline', label: 'Content outline', detail: 'Structured drafting brief' },
  { kind: 'interviewNotes', label: 'Interview notes', detail: 'Research, customer, or hiring notes' },
  { kind: 'bugReport', label: 'Bug report', detail: 'Repro, impact, fix notes' },
  { kind: 'decision', label: 'Decision record', detail: 'Options, rationale, consequences' },
  { kind: 'incidentPostmortem', label: 'Incident postmortem', detail: 'Impact, timeline, causes, follow-up' },
  { kind: 'technicalRFC', label: 'Technical RFC', detail: 'Proposal, tradeoffs, rollout plan' },
  { kind: 'apiSpec', label: 'API spec', detail: 'Endpoint contract and examples' },
  { kind: 'extensionSpec', label: 'Extension spec', detail: 'Manifest, contribution points, permissions, and QA' },
  { kind: 'launchPlan', label: 'Launch plan', detail: 'Readiness, rollout, comms, metrics' },
  { kind: 'customerProfile', label: 'Customer profile', detail: 'Account context, goals, risks, next steps' },
  { kind: 'contentCalendar', label: 'Content calendar', detail: 'Campaign schedule and publishing workflow' },
  { kind: 'learningPlan', label: 'Learning plan', detail: 'Goals, resources, practice, evidence' },
  { kind: 'decisionReview', label: 'Decision review', detail: 'Evaluate outcomes and next decision' },
  { kind: 'publishPage', label: 'Publish page', detail: 'Public Markdown page draft' },
  { kind: 'publishRunbook', label: 'Publish runbook', detail: 'Repeatable static-site publishing checklist and rollback plan' },
  { kind: 'changelog', label: 'Changelog entry', detail: 'Forge-style product entries' },
  { kind: 'transcriptCleanup', label: 'Transcript cleanup', detail: 'Raw transcript to polished notes' },
  { kind: 'releaseNotes', label: 'Release notes', detail: 'User-facing changes' },
  { kind: 'person', label: 'Person', detail: 'Relationship notes' }
]

export interface Tab {
  id: string
  kind: TabKind
  path: string | null
  mode: ViewMode
}

export interface ContextMenuItem {
  label: string
  icon?: ReactNode
  danger?: boolean
  action: () => void
}

export interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

export type ModalKind = 'palette' | 'switcher' | 'template' | 'settings' | null

/** Note contents live outside React state to avoid re-render storms. */
export const noteContents = new Map<string, string>()

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const parseTimers = new Map<string, ReturnType<typeof setTimeout>>()
let tabCounter = 0
const newTabId = (): string => `tab-${++tabCounter}`

export interface ForgeState {
  booted: boolean
  vault: string | null
  vaultName: string
  files: string[]
  folders: string[]
  fileStats: Record<string, VaultFileStat>
  index: Record<string, NoteMeta>
  tabs: Tab[]
  activeTabId: string | null
  theme: ThemeMode
  fontSize: number
  lineWidth: number
  templatesFolder: string
  dailyNotesFolder: string
  bookmarks: string[]
  bookmarkSettings: Record<string, string[]>
  pinnedFolders: string[]
  pinnedFolderSettings: Record<string, string[]>
  publishSites: PublishSiteConfig[]
  publishSiteSettings: Record<string, PublishSiteConfig[]>
  enabledExtensions: string[]
  extensionSettings: ExtensionSettings
  recentVaults: string[]
  leftOpen: boolean
  rightOpen: boolean
  leftPane: 'files' | 'search'
  modal: ModalKind
  contextMenu: ContextMenuState | null
  counts: { words: number; chars: number }
  /** bumped whenever note contents change, for panes that read noteContents */
  contentVersion: number
  pendingEditorNavigation: { path: string; lineNumber: number } | null

  boot(): Promise<void>
  openVaultDialog(): Promise<void>
  openVaultPath(path: string): Promise<void>
  removeRecentVault(path: string): void
  closeVault(): void
  refreshVault(): Promise<void>

  openFile(path: string, opts?: { newTab?: boolean; line?: number }): void
  consumePendingEditorNavigation(path: string): number | null
  openGraph(): void
  newTab(): void
  closeTab(id: string): void
  activateTab(id: string): void
  setTabMode(id: string, mode: ViewMode): void
  toggleActiveMode(): void

  updateContent(path: string, content: string): void
  createNote(folder?: string): Promise<void>
  createNoteNamed(name: string): Promise<string | null>
  createNoteFromTemplate(
    templatePath: string,
    opts?: { title?: string; folder?: string; variables?: Record<string, string> }
  ): Promise<string | null>
  createStarterTemplate(kind: StarterTemplateKind): Promise<string | null>
  createDailyNote(): Promise<string | null>
  createFolder(parent: string, name: string): Promise<void>
  renamePath(oldPath: string, newPath: string): Promise<void>
  /** Move a file or folder into `targetFolder` ('' = vault root). */
  movePath(source: string, targetFolder: string): Promise<void>
  trashPath(path: string): Promise<void>

  setTheme(theme: ThemeMode): void
  setFontSize(size: number): void
  setLineWidth(width: number): void
  setTemplatesFolder(folder: string): void
  setDailyNotesFolder(folder: string): void
  toggleBookmark(path: string): void
  removeBookmark(path: string): void
  togglePinnedFolder(path: string): void
  setPublishSites(sites: PublishSiteConfig[]): void
  setExtensionInstalled(extensionId: string, installed: boolean): void
  setExtensionEnabled(extensionId: string, enabled: boolean): void
  setLeftOpen(open: boolean): void
  setRightOpen(open: boolean): void
  setLeftPane(pane: 'files' | 'search'): void
  setModal(modal: ModalKind): void
  setContextMenu(menu: ContextMenuState | null): void
}

function buildIndex(contents: Record<string, string>): Record<string, NoteMeta> {
  const index: Record<string, NoteMeta> = {}
  for (const [path, content] of Object.entries(contents)) {
    index[path] = parseNote(content)
  }
  return index
}

function fileStatForContent(content: string): VaultFileStat {
  return {
    size: new TextEncoder().encode(content).byteLength,
    modified: new Date().toISOString()
  }
}

async function persistSettings(state: ForgeState): Promise<void> {
  const settings: Settings = {
    theme: state.theme,
    lastVault: state.vault,
    recentVaults: state.recentVaults,
    fontSize: state.fontSize,
    lineWidth: state.lineWidth,
    templatesFolder: state.templatesFolder,
    dailyNotesFolder: state.dailyNotesFolder,
    bookmarks: bookmarkSettingsForState(state),
    pinnedFolders: pinnedFolderSettingsForState(state),
    publishSites: publishSiteSettingsForState(state),
    enabledExtensions: enabledExtensionIds(state.extensionSettings),
    extensionSettings: state.extensionSettings
  }
  await window.forge.writeSettings(settings)
}

function normalizeBookmarkList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .filter((path): path is string => typeof path === 'string')
        .map((path) => path.replaceAll('\\', '/').trim())
        .filter((path) => path.length > 0 && !path.startsWith('/') && !path.split('/').includes('..'))
    )
  )
}

function normalizeBookmarkSettings(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const settings: Record<string, string[]> = {}
  for (const [vault, bookmarks] of Object.entries(value)) {
    if (typeof vault === 'string' && vault.trim()) settings[vault] = normalizeBookmarkList(bookmarks)
  }
  return settings
}

function bookmarkSettingsForState(state: ForgeState): Record<string, string[]> {
  if (!state.vault) return state.bookmarkSettings
  return { ...state.bookmarkSettings, [state.vault]: state.bookmarks }
}

function bookmarksForVault(settings: Record<string, string[]>, vault: string, files: string[]): string[] {
  const existing = new Set(files)
  return normalizeBookmarkList(settings[vault]).filter((path) => existing.has(path) && isMarkdown(path))
}

function normalizePinnedFolderSettings(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const settings: Record<string, string[]> = {}
  for (const [vault, folders] of Object.entries(value)) {
    if (typeof vault === 'string' && vault.trim()) settings[vault] = normalizeBookmarkList(folders)
  }
  return settings
}

function pinnedFolderSettingsForState(state: ForgeState): Record<string, string[]> {
  if (!state.vault) return state.pinnedFolderSettings
  return { ...state.pinnedFolderSettings, [state.vault]: state.pinnedFolders }
}

function pinnedFoldersForVault(settings: Record<string, string[]>, vault: string, folders: string[]): string[] {
  const existing = new Set(folders)
  return normalizeBookmarkList(settings[vault]).filter((path) => existing.has(path))
}

function normalizePublishSiteTheme(value: unknown): PublishSiteTheme {
  const themes: PublishSiteTheme[] = [
    'minimal',
    'editorial',
    'reference',
    'quiet-paper',
    'terminal-ledger',
    'swiss-ledger',
    'soft-focus',
    'field-notes'
  ]
  return themes.includes(value as PublishSiteTheme) ? (value as PublishSiteTheme) : 'minimal'
}

function normalizePublishSiteConfig(value: unknown, folders: string[] = []): PublishSiteConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<PublishSiteConfig>
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : ''
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : ''
  const outputDir = typeof raw.outputDir === 'string' && raw.outputDir.trim() ? raw.outputDir.trim() : ''
  if (!id || !name || !outputDir) return null

  const description = typeof raw.description === 'string' ? raw.description : ''
  const folder = raw.scope?.kind === 'folder' ? normalizeFolderPath(raw.scope.folder) : ''
  const existingFolders = new Set(folders)
  const scope = folder && (!folders.length || existingFolders.has(folder)) ? { kind: 'folder' as const, folder } : { kind: 'vault' as const }
  const options =
    raw.options && typeof raw.options === 'object' && !Array.isArray(raw.options)
      ? (raw.options as Partial<PublishSiteConfig['options']>)
      : {}
  const createdAt = typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString()
  const updatedAt = typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : createdAt

  return {
    id,
    name,
    description,
    theme: normalizePublishSiteTheme(raw.theme),
    scope,
    outputDir,
    options: {
      clean: options.clean !== false,
      showTags: options.showTags !== false,
      showBacklinks: options.showBacklinks !== false
    },
    createdAt,
    updatedAt
  }
}

function normalizePublishSites(value: unknown, folders: string[] = []): PublishSiteConfig[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const sites: PublishSiteConfig[] = []
  for (const item of value) {
    const site = normalizePublishSiteConfig(item, folders)
    if (!site || seen.has(site.id)) continue
    seen.add(site.id)
    sites.push(site)
  }
  return sites
}

function normalizePublishSiteSettings(value: unknown): Record<string, PublishSiteConfig[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const settings: Record<string, PublishSiteConfig[]> = {}
  for (const [vault, sites] of Object.entries(value)) {
    if (typeof vault === 'string' && vault.trim()) settings[vault] = normalizePublishSites(sites)
  }
  return settings
}

function publishSiteSettingsForState(state: ForgeState): Record<string, PublishSiteConfig[]> {
  if (!state.vault) return state.publishSiteSettings
  return { ...state.publishSiteSettings, [state.vault]: state.publishSites }
}

function publishSitesForVault(settings: Record<string, PublishSiteConfig[]>, vault: string, folders: string[]): PublishSiteConfig[] {
  return normalizePublishSites(settings[vault], folders)
}

function normalizeFolderPath(value: string): string {
  return value
    .replaceAll('\\', '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== '.' && part !== '..')
    .join('/')
}

function noteTitle(value: string, fallback: string): string {
  return (value || fallback).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || fallback
}

function folderAncestors(folder: string): string[] {
  const clean = normalizeFolderPath(folder)
  if (!clean) return []
  const parts = clean.split('/')
  return parts.map((_part, index) => parts.slice(0, index + 1).join('/'))
}

const STARTER_TEMPLATES: Record<StarterTemplateKind, { file: string; content: string }> = {
  daily: {
    file: 'Daily.md',
    content: [
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
      '## Priorities',
      '- [ ] ',
      '- [ ] ',
      '- [ ] ',
      '',
      '## Schedule',
      '- ',
      '',
      '## Notes',
      '',
      '## Decisions',
      '- ',
      '',
      '## Tasks',
      '- [ ] ',
      '',
      '## Follow-ups',
      '- '
    ].join('\n')
  },
  weeklyReview: {
    file: 'Weekly Review.md',
    content: [
      '---',
      'type: weekly-review',
      'week: {{prompt:Week}}',
      'status: {{select:Status|Draft,Reviewed,Archived}}',
      'created: {{date}}',
      'tags: [weekly-review, review]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Week',
      '{{prompt:Week}}',
      '',
      '## Wins',
      '- ',
      '',
      '## Shipped',
      '- ',
      '',
      '## Learned',
      '- ',
      '',
      '## Metrics',
      '- Metric:  Result:  Notes: ',
      '',
      '## Open Loops',
      '- [ ] ',
      '',
      '## Decisions',
      '- ',
      '',
      '## Next Week',
      '- Focus:',
      '- Risks:',
      '- First action:',
      '',
      '## Agent Follow-up',
      '- Notes to summarize:',
      '- Links to repair:',
      '- Tasks to extract:'
    ].join('\n')
  },
  meeting: {
    file: 'Meeting Notes.md',
    content: [
      '---',
      'type: meeting',
      'date: {{date}}',
      'status: {{select:Status|Scheduled,In progress,Done}}',
      'tags: [meeting]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Objective',
      '{{prompt:Objective}}',
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
      '- ',
      '',
      '## Action Items',
      '- [ ] Owner:  Due:  Task: ',
      '',
      '## Follow-ups',
      '- '
    ].join('\n')
  },
  sourceNote: {
    file: 'Source Note.md',
    content: [
      '---',
      'type: source-note',
      'source_type: {{select:Source type|Book,Article,Paper,Podcast,Video,Docs,Other}}',
      'status: {{select:Status|Queued,Reading,Processed,Archived}}',
      'author: {{prompt:Author}}',
      'source: {{prompt:Source}}',
      'url: {{prompt:URL}}',
      'created: {{date}}',
      'tags: [source, literature]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Citation',
      '- Author: {{prompt:Author}}',
      '- Source: {{prompt:Source}}',
      '- URL: {{prompt:URL}}',
      '',
      '## Why This Matters',
      '{{prompt:Why this matters}}',
      '',
      '## Summary',
      '',
      '## Key Ideas',
      '- Idea:  Evidence:  Confidence: ',
      '',
      '## Quotes',
      '- ',
      '',
      '## Connections',
      '- Related notes: ',
      '- Contradicts: ',
      '- Supports: ',
      '',
      '## Questions',
      '- ',
      '',
      '## Agent Extraction Tasks',
      '- [ ] Pull durable claims into evergreen notes',
      '- [ ] Link people, organizations, and concepts',
      '- [ ] Flag uncertain or unsupported claims'
    ].join('\n')
  },
  knowledgeMap: {
    file: 'Knowledge Map.md',
    content: [
      '---',
      'type: knowledge-map',
      'topic: {{prompt:Topic}}',
      'status: {{select:Status|Draft,Living,Archived}}',
      'created: {{date}}',
      'tags: [moc, map]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Purpose',
      '{{prompt:Purpose}}',
      '',
      '## Core Notes',
      '- [[ ]]',
      '',
      '## Clusters',
      '### People',
      '- ',
      '',
      '### Concepts',
      '- ',
      '',
      '### Projects',
      '- ',
      '',
      '## Open Questions',
      '- ',
      '',
      '## Gaps',
      '- Missing note:',
      '- Stale note:',
      '- Broken link:',
      '',
      '## Next Links to Create',
      '- [[ ]]',
      '',
      '## Agent Maintenance',
      '- [ ] Find unlinked mentions for this topic',
      '- [ ] Suggest notes that belong in this map',
      '- [ ] Summarize changes since last review'
    ].join('\n')
  },
  calloutLibrary: {
    file: 'Callout Library.md',
    content: [
      '---',
      'type: callout-library',
      'status: {{select:Status|Draft,Active,Archived}}',
      'created: {{date}}',
      'tags: [callouts, templates]',
      '---',
      '',
      '# {{title}}',
      '',
      '## How to Use',
      '- Copy a snippet into any note.',
      '- Replace placeholder text with the actual context.',
      '- Keep callouts short enough to scan.',
      '',
      '## Note',
      '> [!note] Context',
      '> Use this for neutral background, definitions, or source notes.',
      '',
      '## Tip',
      '> [!tip] Better Path',
      '> Use this for a recommended action, shortcut, or pattern.',
      '',
      '## Warning',
      '> [!warning] Check Before Shipping',
      '> Use this for risks, blockers, caveats, or destructive steps.',
      '',
      '## Question',
      '> [!question] Open Question',
      '> Use this for unresolved decisions, research prompts, or agent follow-up.',
      '',
      '## Quote',
      '> [!quote] Source Quote',
      '> Use this for copied source text that needs attribution.',
      '> Source: {{prompt:Source}}',
      '',
      '## Agent Notes',
      '- Preserve callout type and title when rewriting notes.',
      '- Do not convert warnings into neutral notes.',
      '- Keep quoted text attributed to its source.'
    ].join('\n')
  },
  project: {
    file: 'Project Plan.md',
    content: [
      '---',
      'type: project-plan',
      'status: {{select:Status|Planning,Active,Paused,Done}}',
      'owner: {{prompt:Owner}}',
      'target: {{prompt:Target date}}',
      'tags: [project]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Goal',
      '{{prompt:Goal}}',
      '',
      '## Background',
      '',
      '## Scope',
      '### In scope',
      '- ',
      '',
      '### Out of scope',
      '- ',
      '',
      '## Deliverables',
      '- ',
      '',
      '## Milestones',
      '- [ ] Milestone:  Owner:  Date: ',
      '',
      '## Risks',
      '- Risk:  Mitigation: ',
      '',
      '## Open Questions',
      '- ',
      '',
      '## Next Actions',
      '- [ ] '
    ].join('\n')
  },
  person: {
    file: 'Person.md',
    content: [
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
    ].join('\n')
  },
  research: {
    file: 'Research Brief.md',
    content: [
      '---',
      'type: research-brief',
      'status: {{select:Status|Scoping,Researching,Synthesizing,Done}}',
      'created: {{date}}',
      'tags: [research]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Research Question',
      '{{prompt:Research question}}',
      '',
      '## Decision or Use',
      '{{prompt:Decision or use}}',
      '',
      '## Source List',
      '- Source:  Why it matters: ',
      '',
      '## Findings',
      '- Finding:  Evidence:  Confidence: ',
      '',
      '## Synthesis',
      '',
      '## Risks and Gaps',
      '- ',
      '',
      '## Recommended Next Step',
      ''
    ].join('\n')
  },
  sprintPlan: {
    file: 'Sprint Plan.md',
    content: [
      '---',
      'type: sprint-plan',
      'sprint: {{prompt:Sprint}}',
      'status: {{select:Status|Planned,Active,Complete,Closed}}',
      'start: {{prompt:Start date}}',
      'end: {{prompt:End date}}',
      'created: {{date}}',
      'tags: [sprint, planning]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Sprint Goal',
      '{{prompt:Sprint goal}}',
      '',
      '## Capacity',
      '- People:',
      '- Focus days:',
      '- Known interruptions:',
      '',
      '## Commitments',
      '- [ ] Owner:  Work:  Done when: ',
      '',
      '## Backlog Candidates',
      '- ',
      '',
      '## Execution Plan',
      '### Now',
      '- ',
      '',
      '### Next',
      '- ',
      '',
      '### Blocked',
      '- ',
      '',
      '## Risks',
      '- Risk:  Mitigation: ',
      '',
      '## Review Criteria',
      '- Demo:',
      '- Metrics:',
      '- Retro notes:',
      '',
      '## Agent Tasks',
      '- [ ] Break commitments into implementation tasks',
      '- [ ] Check linked specs and issues for stale assumptions',
      '- [ ] Draft end-of-sprint summary'
    ].join('\n')
  },
  agentTask: {
    file: 'Agent Task Brief.md',
    content: [
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
      '- Stay within the requested ownership boundary.',
      '- Prefer small, reviewable edits.',
      '',
      '## Inputs',
      '- Files or folders: {{prompt:Files or folders}}',
      '- External references: {{prompt:External references}}',
      '',
      '## Definition of Done',
      '- [ ] Requested change is complete',
      '- [ ] Targeted validation has run or is explained',
      '- [ ] Files changed are summarized',
      '',
      '## Checklist',
      '- [ ] Inspect current state',
      '- [ ] Implement the requested change',
      '- [ ] Verify behavior',
      '- [ ] Summarize outcome',
      '',
      '## Verification',
      '',
      '## Result',
      ''
    ].join('\n')
  },
  agentReview: {
    file: 'Agent Review QA.md',
    content: [
      '---',
      'type: agent-review',
      'status: {{select:Status|Ready,Reviewing,Changes requested,Approved,Blocked}}',
      'reviewer: {{prompt:Reviewer}}',
      'created: {{date}}',
      'tags: [agent, review, qa]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Scope',
      '- Request: {{prompt:Request}}',
      '- Files or notes reviewed: {{prompt:Files or notes reviewed}}',
      '- Ownership boundary:',
      '- Out of scope:',
      '',
      '## Review Checklist',
      '- [ ] Requested behavior is implemented',
      '- [ ] Unrelated edits are not included',
      '- [ ] Markdown renders cleanly',
      '- [ ] Links, tags, and frontmatter are valid',
      '- [ ] Agent-facing instructions are clear',
      '- [ ] Validation output is captured or explained',
      '',
      '## Findings',
      '- Severity:',
      '- Location:',
      '- Issue:',
      '- Recommendation:',
      '',
      '## Callouts to Add',
      '> [!warning] Risk',
      '> Note any risky follow-up or unresolved blocker.',
      '',
      '> [!question] Open Question',
      '> Note anything that needs user or owner input.',
      '',
      '## QA Notes',
      '',
      '## Decision',
      '{{select:Decision|Approve,Request changes,Block,Needs owner review}}',
      '',
      '## Follow-up Tasks',
      '- [ ] '
    ].join('\n')
  },
  taskReview: {
    file: 'Task Review.md',
    content: [
      '---',
      'type: task-review',
      'status: {{select:Status|Ready,Reviewing,Done}}',
      'period: {{prompt:Review period}}',
      'owner: {{prompt:Owner}}',
      'created: {{date}}',
      'tags: [tasks, review]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Scope',
      '- Review period: {{prompt:Review period}}',
      '- Folder or project: {{prompt:Folder or project}}',
      '- Owner: {{prompt:Owner}}',
      '',
      '## Summary',
      '- Open tasks:',
      '- Completed tasks:',
      '- Blocked tasks:',
      '- Deferred tasks:',
      '',
      '## Needs Attention',
      '| Task | Owner | Source note | Reason | Next step |',
      '| --- | --- | --- | --- | --- |',
      '|  |  |  |  |  |',
      '',
      '## Completed',
      '- [x] ',
      '',
      '## Blocked',
      '- [ ] Owner:  Blocker:  Decision needed: ',
      '',
      '## Deferred or Dropped',
      '- Task:  Reason: ',
      '',
      '## Next Actions',
      '- [ ] Owner:  Due:  Action: ',
      '',
      '## Agent Review Instructions',
      '- Group duplicate tasks before recommending owners.',
      '- Preserve source-note links for every migrated task.',
      '- Flag stale tasks that have no owner or next step.'
    ].join('\n')
  },
  savedQuery: {
    file: 'Saved Query.md',
    content: [
      '---',
      'type: saved-query',
      'query_type: {{select:Query type|Search,Task,Tag,Link,Vault health,Publish}}',
      'status: {{select:Status|Draft,Active,Paused,Archived}}',
      'owner: {{prompt:Owner}}',
      'created: {{date}}',
      'tags: [query, saved]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Purpose',
      '{{prompt:Purpose}}',
      '',
      '## Query',
      '- Type: {{select:Query type|Search,Task,Tag,Link,Vault health,Publish}}',
      '- Search text or filter: {{prompt:Search text or filter}}',
      '- Folder scope: {{prompt:Folder scope}}',
      '- Sort or grouping:',
      '',
      '## Command or Steps',
      '```bash',
      'forge --vault "{{vault}}" search "{{prompt:Search text or filter}}" --json',
      '```',
      '',
      '## Expected Results',
      '- Signal:',
      '- Healthy range:',
      '- Action threshold:',
      '',
      '## Review Cadence',
      '- Cadence: {{select:Cadence|Daily,Weekly,Monthly,Before publish,As needed}}',
      '- Owner: {{prompt:Owner}}',
      '',
      '## Results Log',
      '- {{date}} - Result:  Action:',
      '',
      '## Agent Notes',
      '- Keep the query narrow enough to act on.',
      '- Record false positives so future runs can refine the filter.',
      '- Link follow-up notes created from this query.'
    ].join('\n')
  },
  publishPreflight: {
    file: 'Publish Preflight.md',
    content: [
      '---',
      'type: publish-preflight',
      'category: publish',
      'status: {{select:Status|Draft,Checking,Ready,Blocked,Published}}',
      'target: {{prompt:Publish target}}',
      'owner: {{prompt:Owner}}',
      'created: {{date}}',
      'tags: [publish, preflight, agent]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Objective',
      '{{prompt:Objective}}',
      '',
      '## Scope',
      '- Vault: {{vault}}',
      '- Publish target: {{prompt:Publish target}}',
      '- Owned files: {{prompt:Owned files}}',
      '- Output directory:',
      '- Out of scope:',
      '',
      '## Allowed Commands',
      '```bash',
      'forge --vault "{{vault}}" analyze --json',
      'forge --vault "{{vault}}" publish --out "{{prompt:Publish target}}" --clean --json',
      '```',
      '',
      '## Preflight Checklist',
      '- [ ] Required pages have titles, slugs, and descriptions',
      '- [ ] Draft or private pages are excluded or approved',
      '- [ ] Broken wikilinks are resolved or accepted',
      '- [ ] Image, video, PDF, and attachment references are present',
      '- [ ] Navigation, tags, and index pages are reviewed',
      '- [ ] Release notes or publish notes are ready',
      '- [ ] Output directory and clean behavior are confirmed',
      '',
      '## Findings',
      '| Area | Finding | Source | Required action | Owner |',
      '| --- | --- | --- | --- | --- |',
      '| Links |  |  |  | {{prompt:Owner}} |',
      '',
      '## Publish Decision',
      '{{select:Decision|Ready to publish,Publish with notes,Blocked,Needs owner review}}',
      '',
      '## Verification',
      '- Analyze result:',
      '- Publish result:',
      '- Pages generated:',
      '- Broken links remaining:',
      '- Assets checked:',
      '',
      '## Risks',
      '- Risk:  Mitigation:',
      '',
      '## Final Handoff Notes',
      '- Published output:',
      '- Blockers:',
      '- Follow-up owners:',
      '- Next publish window:'
    ].join('\n')
  },
  savedQueryCatalog: {
    file: 'Saved Query Catalog.md',
    content: [
      '---',
      'type: saved-query-catalog',
      'category: query',
      'status: {{select:Status|Draft,Active,Review,Archived}}',
      'owner: {{prompt:Owner}}',
      'created: {{date}}',
      'tags: [query, catalog, agent]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Objective',
      '{{prompt:Objective}}',
      '',
      '## Scope',
      '- Vault: {{vault}}',
      '- Folder or collection: {{prompt:Folder or collection}}',
      '- Owned files: {{prompt:Owned files}}',
      '- Out of scope:',
      '',
      '## Allowed Commands',
      '```bash',
      'forge --vault "{{vault}}" search "{{prompt:Search text}}" --json',
      'forge --vault "{{vault}}" analyze --json',
      '```',
      '',
      '## Catalog',
      '| Name | Type | Query or command | Cadence | Owner | Action threshold |',
      '| --- | --- | --- | --- | --- | --- |',
      '|  | {{select:Query type|Search,Task,Tag,Link,Vault health,Publish}} |  | {{select:Cadence|Daily,Weekly,Monthly,Before publish,As needed}} | {{prompt:Owner}} |  |',
      '',
      '## Query Details',
      '### {{prompt:Query name}}',
      '- Purpose:',
      '- Search text or filter: {{prompt:Search text}}',
      '- Expected healthy result:',
      '- False positives to ignore:',
      '- Follow-up note or queue:',
      '',
      '## Agent Checklist',
      '- [ ] Remove duplicate or stale saved queries',
      '- [ ] Add owner, cadence, and threshold to every active query',
      '- [ ] Link each query to the workflow it supports',
      '- [ ] Record example output for ambiguous filters',
      '',
      '## Verification',
      '- Commands run:',
      '- Queries tested:',
      '- Broken or noisy queries:',
      '- Catalog changes:',
      '',
      '## Risks',
      '- Risk:  Mitigation:',
      '',
      '## Final Handoff Notes',
      '- Added:',
      '- Updated:',
      '- Archived:',
      '- Needs owner decision:'
    ].join('\n')
  },
  verificationReportWorkflow: {
    file: 'Verification Report.md',
    content: [
      '---',
      'type: verification-report',
      'category: verification',
      'status: {{select:Status|Draft,Verifying,Passed,Failed,Blocked}}',
      'owner: {{prompt:Owner}}',
      'created: {{date}}',
      'tags: [verification, agent]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Objective',
      '{{prompt:Objective}}',
      '',
      '## Work Reviewed',
      '- Request or plan: {{prompt:Request or plan}}',
      '- Owned files: {{prompt:Owned files}}',
      '- Out of scope:',
      '- Reviewer: {{prompt:Owner}}',
      '',
      '## Allowed Commands',
      '```bash',
      '{{prompt:Allowed verification command}}',
      '```',
      '',
      '## Verification Matrix',
      '| Check | Command or method | Expected | Actual | Status |',
      '| --- | --- | --- | --- | --- |',
      '|  |  |  |  | Pending |',
      '',
      '## Evidence',
      '- Output summary:',
      '- Files inspected:',
      '- Screenshots or artifacts:',
      '- Manual checks:',
      '',
      '## Agent Checklist',
      '- [ ] Verify the requested behavior, not just command success',
      '- [ ] Confirm no unrelated files were changed',
      '- [ ] Capture failures with exact commands and next steps',
      '- [ ] Re-check after fixes if any verification failed',
      '',
      '## Risks',
      '- Risk:  Mitigation:',
      '',
      '## Final Handoff Notes',
      '- Result: {{select:Result|Pass,Pass with caveats,Fail,Blocked}}',
      '- Changed files reviewed:',
      '- Tests or checks not run:',
      '- Follow-up required:'
    ].join('\n')
  },
  implementationPlan: {
    file: 'Implementation Plan.md',
    content: [
      '---',
      'type: implementation-plan',
      'category: plan',
      'status: {{select:Status|Draft,Ready,In progress,Blocked,Done}}',
      'owner: {{prompt:Owner}}',
      'created: {{date}}',
      'tags: [implementation, plan, agent]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Objective',
      '{{prompt:Objective}}',
      '',
      '## Context',
      '- Vault: {{vault}}',
      '- Related notes: {{prompt:Related notes}}',
      '- Current behavior:',
      '- Desired behavior:',
      '',
      '## Ownership Boundary',
      '- Owned files: {{prompt:Owned files}}',
      '- Do not touch:',
      '- Dependencies:',
      '- Out of scope:',
      '',
      '## Allowed Commands',
      '```bash',
      '{{prompt:Allowed command}}',
      '```',
      '',
      '## Plan',
      '- [ ] Inspect current state and existing dirty changes',
      '- [ ] Identify the smallest behavior-preserving change',
      '- [ ] Implement in scoped files',
      '- [ ] Update related docs or templates',
      '- [ ] Run targeted verification',
      '- [ ] Summarize changed files and residual risks',
      '',
      '## Acceptance Criteria',
      '- [ ] User-facing requirement is met',
      '- [ ] Existing workflows still work',
      '- [ ] Edge cases are covered or documented',
      '- [ ] Handoff notes are specific enough for review',
      '',
      '## Verification',
      '- Commands to run:',
      '- Expected output:',
      '- Manual checks:',
      '- Not covered:',
      '',
      '## Risks',
      '- Risk:  Mitigation:',
      '',
      '## Final Handoff Notes',
      '- Completed:',
      '- Changed files:',
      '- Verification result:',
      '- Follow-up:'
    ].join('\n')
  },
  refactorPlan: {
    file: 'Refactor Plan.md',
    content: [
      '---',
      'type: refactor-plan',
      'category: plan',
      'status: {{select:Status|Draft,Ready,In progress,Blocked,Done}}',
      'owner: {{prompt:Owner}}',
      'created: {{date}}',
      'tags: [refactor, plan, agent]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Objective',
      '{{prompt:Objective}}',
      '',
      '## Behavior to Preserve',
      '- User-visible behavior:',
      '- Data or file format:',
      '- Public commands or APIs:',
      '- Known edge cases:',
      '',
      '## Ownership Boundary',
      '- Owned files: {{prompt:Owned files}}',
      '- Do not touch:',
      '- Dependencies:',
      '- Out of scope:',
      '',
      '## Allowed Commands',
      '```bash',
      '{{prompt:Allowed command}}',
      '```',
      '',
      '## Refactor Steps',
      '- [ ] Characterize current behavior with tests or examples',
      '- [ ] Split mechanical moves from behavior changes',
      '- [ ] Make one small structural change at a time',
      '- [ ] Keep names and interfaces stable unless approved',
      '- [ ] Run verification after each risky step',
      '- [ ] Remove dead paths only when usage is checked',
      '',
      '## Verification',
      '- Baseline command output:',
      '- Post-refactor command output:',
      '- Manual regression checks:',
      '- Performance or size checks:',
      '',
      '## Risks',
      '- Risk:  Mitigation:',
      '- Rollback path:',
      '',
      '## Final Handoff Notes',
      '- Behavior preserved:',
      '- Structure changed:',
      '- Tests or checks run:',
      '- Follow-up refactors:'
    ].join('\n')
  },
  seoBrief: {
    file: 'SEO Content Brief.md',
    content: [
      '---',
      'type: seo-brief',
      'status: {{select:Status|Brief,Drafting,Review,Published}}',
      'content_type: {{select:Content type|Article,Landing page,Docs,Case study,Email}}',
      'created: {{date}}',
      'tags: [seo, content]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Audience',
      '{{prompt:Audience}}',
      '',
      '## Search Target',
      '- Primary keyword: {{prompt:Primary keyword}}',
      '- Secondary keywords: {{prompt:Secondary keywords}}',
      '- Search intent: {{select:Search intent|Informational,Commercial,Transactional,Navigational}}',
      '',
      '## Angle',
      '{{prompt:Angle}}',
      '',
      '## Reader Promise',
      '',
      '## Outline',
      '- H1: {{title}}',
      '- H2:',
      '- H2:',
      '- H2:',
      '',
      '## Evidence and Sources',
      '- ',
      '',
      '## Internal Links',
      '- ',
      '',
      '## Meta',
      '- Title tag:',
      '- Description:',
      '- Slug:',
      '',
      '## Notes for Agent',
      '- Preserve factual uncertainty.',
      '- Suggest sources before drafting claims.',
      '- Keep headings scannable.',
      ''
    ].join('\n')
  },
  contentRefreshBrief: {
    file: 'Content Refresh Brief.md',
    content: [
      '---',
      'type: content-refresh-brief',
      'status: {{select:Status|Audit,Refreshing,Review,Published}}',
      'asset_type: {{select:Asset type|Article,Docs,Landing page,Guide,Newsletter,Video}}',
      'owner: {{prompt:Owner}}',
      'url: {{prompt:URL}}',
      'created: {{date}}',
      'tags: [content, refresh]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Existing Asset',
      '- URL or note: {{prompt:URL}}',
      '- Asset type: {{select:Asset type|Article,Docs,Landing page,Guide,Newsletter,Video}}',
      '- Current owner: {{prompt:Owner}}',
      '- Last updated:',
      '',
      '## Refresh Goal',
      '{{prompt:Refresh goal}}',
      '',
      '## Audience and Intent',
      '- Audience: {{prompt:Audience}}',
      '- Search or reader intent:',
      '- Conversion or next action:',
      '',
      '## Decay Signals',
      '- Outdated claim:',
      '- Broken link:',
      '- Missing section:',
      '- Performance signal:',
      '',
      '## Updates Needed',
      '- Keep:',
      '- Rewrite:',
      '- Add:',
      '- Remove:',
      '',
      '## Source Review',
      '- Source:  Claim supported:  Notes: ',
      '',
      '## SEO and Distribution',
      '- Primary keyword:',
      '- Internal links to add:',
      '- Channels to re-share:',
      '',
      '## QA Checklist',
      '- [ ] Facts and dates checked',
      '- [ ] Links checked',
      '- [ ] Title and description updated',
      '- [ ] Publish or changelog note prepared',
      '',
      '## Agent Drafting Notes',
      '- Preserve the original audience and promise unless the brief changes them.',
      '- Mark unsupported claims instead of rewriting them as fact.',
      '- Summarize material changes for reviewers.'
    ].join('\n')
  },
  productSpec: {
    file: 'PRD.md',
    content: [
      '---',
      'type: prd',
      'status: {{select:Status|Draft,Review,Ready,Building,Shipped}}',
      'owner: {{prompt:Owner}}',
      'created: {{date}}',
      'tags: [product, prd]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Problem',
      '{{prompt:Problem}}',
      '',
      '## Users',
      '{{prompt:Users}}',
      '',
      '## Goals',
      '- ',
      '',
      '## Non-goals',
      '- ',
      '',
      '## Requirements',
      '- Must:',
      '- Should:',
      '- Could:',
      '',
      '## User Experience',
      '- Entry point:',
      '- Primary flow:',
      '- Empty/error states:',
      '',
      '## Data and Instrumentation',
      '- Events:',
      '- Success metrics:',
      '- Guardrails:',
      '',
      '## Rollout Plan',
      '- ',
      '',
      '## Open Questions',
      '- ',
      '',
      '## Launch Checklist',
      '- [ ] Product review',
      '- [ ] Engineering review',
      '- [ ] Support/docs ready',
      ''
    ].join('\n')
  },
  supportTicket: {
    file: 'Support Ticket.md',
    content: [
      '---',
      'type: support-ticket',
      'status: {{select:Status|New,Waiting on customer,Investigating,Resolved,Closed}}',
      'priority: {{select:Priority|Low,Normal,High,Urgent}}',
      'customer: {{prompt:Customer}}',
      'created: {{date}}',
      'tags: [support]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Summary',
      '{{prompt:Summary}}',
      '',
      '## Customer Context',
      '- Customer: {{prompt:Customer}}',
      '- Plan/account:',
      '- Related notes:',
      '',
      '## Timeline',
      '- {{datetime}} - Created',
      '',
      '## Reproduction',
      '1. ',
      '2. ',
      '3. ',
      '',
      '## Expected',
      '',
      '## Actual',
      '',
      '## Workaround',
      '',
      '## Resolution',
      '',
      '## Follow-up',
      '- [ ] Reply to customer',
      '- [ ] Update docs or saved reply',
      '- [ ] Link related bug or decision'
    ].join('\n')
  },
  experimentLog: {
    file: 'Experiment Log.md',
    content: [
      '---',
      'type: experiment-log',
      'status: {{select:Status|Proposed,Running,Analyzing,Concluded}}',
      'owner: {{prompt:Owner}}',
      'started: {{date}}',
      'tags: [experiment]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Hypothesis',
      '{{prompt:Hypothesis}}',
      '',
      '## Success Criteria',
      '- ',
      '',
      '## Variables',
      '- Independent:',
      '- Dependent:',
      '- Controls:',
      '',
      '## Setup',
      '',
      '## Procedure',
      '1. ',
      '2. ',
      '3. ',
      '',
      '## Observations',
      '- ',
      '',
      '## Data',
      '- Source:',
      '- Result:',
      '',
      '## Conclusion',
      '',
      '## Decision',
      '{{select:Decision|Keep,Iterate,Stop,Inconclusive}}',
      '',
      '## Follow-up',
      '- [ ] '
    ].join('\n')
  },
  contentOutline: {
    file: 'Content Outline.md',
    content: [
      '---',
      'type: content-outline',
      'status: {{select:Status|Outline,Drafting,Review,Published}}',
      'format: {{select:Format|Article,Guide,Newsletter,Video,Talk,Thread}}',
      'audience: {{prompt:Audience}}',
      'created: {{date}}',
      'tags: [content, outline]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Goal',
      '{{prompt:Goal}}',
      '',
      '## Audience',
      '{{prompt:Audience}}',
      '',
      '## Reader Promise',
      '',
      '## Angle',
      '{{prompt:Angle}}',
      '',
      '## Outline',
      '- H1: {{title}}',
      '- H2:',
      '  - Point:',
      '  - Evidence:',
      '- H2:',
      '  - Point:',
      '  - Evidence:',
      '- H2:',
      '  - Point:',
      '  - Evidence:',
      '',
      '## Evidence and Links',
      '- ',
      '',
      '## Distribution Notes',
      '- Channel:',
      '- CTA:',
      '',
      '## Agent Drafting Notes',
      '- Preserve claims that need citations.',
      '- Keep examples concrete.',
      '- Do not fill gaps with invented facts.'
    ].join('\n')
  },
  interviewNotes: {
    file: 'Interview Notes.md',
    content: [
      '---',
      'type: interview-notes',
      'interview_type: {{select:Interview type|User research,Candidate,Customer,Expert,Internal}}',
      'participant: {{prompt:Participant}}',
      'date: {{date}}',
      'status: {{select:Status|Scheduled,Completed,Synthesized,Archived}}',
      'tags: [interview]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Objective',
      '{{prompt:Objective}}',
      '',
      '## Participant Context',
      '- Name: {{prompt:Participant}}',
      '- Role/context:',
      '- Related notes:',
      '',
      '## Questions',
      '- ',
      '',
      '## Notes',
      '',
      '## Highlights',
      '- ',
      '',
      '## Pain Points',
      '- ',
      '',
      '## Quotes',
      '- ',
      '',
      '## Opportunities',
      '- ',
      '',
      '## Follow-ups',
      '- [ ] ',
      '',
      '## Agent Synthesis Instructions',
      '- Separate observation from interpretation.',
      '- Preserve exact quotes only when recorded.',
      '- Link themes back to source notes.'
    ].join('\n')
  },
  bugReport: {
    file: 'Bug Report.md',
    content: [
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
      '## Impact',
      '{{prompt:Impact}}',
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
      '## Suspected Cause',
      '',
      '## Workaround',
      '',
      '## Notes / Fix',
      ''
    ].join('\n')
  },
  decision: {
    file: 'Decision Record.md',
    content: [
      '---',
      'type: decision-record',
      'status: {{select:Status|Proposed,Accepted,Rejected,Superseded}}',
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
      '',
      '## Review Date',
      '{{prompt:Review date}}',
      ''
    ].join('\n')
  },
  incidentPostmortem: {
    file: 'Incident Postmortem.md',
    content: [
      '---',
      'type: incident-postmortem',
      'status: {{select:Status|Draft,Reviewed,Closed}}',
      'severity: {{select:Severity|SEV1,SEV2,SEV3,SEV4}}',
      'incident_date: {{prompt:Incident date}}',
      'owner: {{prompt:Owner}}',
      'created: {{date}}',
      'tags: [incident, postmortem]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Summary',
      '{{prompt:Summary}}',
      '',
      '## Impact',
      '- Users affected:',
      '- Duration:',
      '- Systems:',
      '- Customer impact:',
      '',
      '## Timeline',
      '- {{datetime}} - Detected',
      '-  - Mitigated',
      '-  - Resolved',
      '',
      '## Detection',
      '- Signal:',
      '- Alert or report:',
      '- Time to detect:',
      '',
      '## Root Cause',
      '- Trigger:',
      '- Contributing factors:',
      '- What changed:',
      '',
      '## Resolution',
      '- Mitigation:',
      '- Permanent fix:',
      '- Verification:',
      '',
      '## What Went Well',
      '- ',
      '',
      '## What Went Wrong',
      '- ',
      '',
      '## Follow-up Actions',
      '- [ ] Owner:  Due:  Action: ',
      '',
      '## Agent Tasks',
      '- [ ] Extract action items with owners and due dates',
      '- [ ] Link related support tickets, bugs, and decisions',
      '- [ ] Draft customer-facing summary if needed'
    ].join('\n')
  },
  technicalRFC: {
    file: 'Technical RFC.md',
    content: [
      '---',
      'type: technical-rfc',
      'status: {{select:Status|Draft,In review,Accepted,Rejected,Implemented}}',
      'owner: {{prompt:Owner}}',
      'reviewers: {{prompt:Reviewers}}',
      'created: {{date}}',
      'tags: [rfc, engineering]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Summary',
      '{{prompt:Summary}}',
      '',
      '## Problem',
      '{{prompt:Problem}}',
      '',
      '## Goals',
      '- ',
      '',
      '## Non-goals',
      '- ',
      '',
      '## Proposed Design',
      '- Architecture:',
      '- Data model:',
      '- User or developer flow:',
      '',
      '## Alternatives Considered',
      '- Option:  Pros:  Cons: ',
      '',
      '## Tradeoffs',
      '- Benefit:',
      '- Cost:',
      '- Risk:',
      '',
      '## Rollout Plan',
      '- Phase:',
      '- Migration:',
      '- Rollback:',
      '',
      '## Observability',
      '- Metrics:',
      '- Logs:',
      '- Alerts:',
      '',
      '## Open Questions',
      '- ',
      '',
      '## Decision Log',
      '- {{date}} - ',
      '',
      '## Agent Review Notes',
      '- [ ] Check assumptions against linked specs or code',
      '- [ ] Identify missing edge cases and migration risks',
      '- [ ] Summarize unresolved reviewer questions'
    ].join('\n')
  },
  apiSpec: {
    file: 'API Spec.md',
    content: [
      '---',
      'type: api-spec',
      'status: {{select:Status|Draft,Review,Stable,Deprecated}}',
      'method: {{select:Method|GET,POST,PUT,PATCH,DELETE}}',
      'endpoint: {{prompt:Endpoint}}',
      'owner: {{prompt:Owner}}',
      'created: {{date}}',
      'tags: [api, spec]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Overview',
      '{{prompt:Overview}}',
      '',
      '## Endpoint',
      '- Method: {{select:Method|GET,POST,PUT,PATCH,DELETE}}',
      '- Path: {{prompt:Endpoint}}',
      '- Auth: {{select:Auth|None,API key,OAuth,Session,Service token}}',
      '',
      '## Request Parameters',
      '| Name | Type | Required | Description |',
      '| --- | --- | --- | --- |',
      '|  |  |  |  |',
      '',
      '## Request Body',
      '```json',
      '{}',
      '```',
      '',
      '## Response',
      '```json',
      '{}',
      '```',
      '',
      '## Error Cases',
      '| Status | Code | Condition | Recovery |',
      '| --- | --- | --- | --- |',
      '|  |  |  |  |',
      '',
      '## Examples',
      '```bash',
      'curl ',
      '```',
      '',
      '## Compatibility',
      '- Versioning:',
      '- Breaking changes:',
      '- Deprecation plan:',
      '',
      '## Test Cases',
      '- [ ] Happy path',
      '- [ ] Auth failure',
      '- [ ] Validation failure',
      '- [ ] Rate limit or quota behavior',
      '',
      '## Agent Tasks',
      '- [ ] Generate example requests and responses',
      '- [ ] Compare implementation behavior with this contract',
      '- [ ] Flag undocumented fields or status codes'
    ].join('\n')
  },
  extensionSpec: {
    file: 'Extension Spec.md',
    content: [
      '---',
      'type: extension-spec',
      'status: {{select:Status|Draft,Review,Ready,Building,Shipped}}',
      'extension_id: {{prompt:Extension ID}}',
      'owner: {{prompt:Owner}}',
      'created: {{date}}',
      'tags: [extension, spec]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Purpose',
      '{{prompt:Purpose}}',
      '',
      '## User Workflow',
      '- Entry point:',
      '- Primary action:',
      '- Success state:',
      '- Empty or error state:',
      '',
      '## Manifest',
      '- Extension ID: {{prompt:Extension ID}}',
      '- Display name:',
      '- Categories:',
      '- Keywords:',
      '- Default installed: {{select:Default installed|No,Yes}}',
      '- Default enabled: {{select:Default enabled|No,Yes}}',
      '',
      '## Extension Points',
      '| Point | Contribution | User-facing label | Notes |',
      '| --- | --- | --- | --- |',
      '|  |  |  |  |',
      '',
      '## Permissions',
      '| Permission | Reason | Data touched |',
      '| --- | --- | --- |',
      '|  |  |  |',
      '',
      '## Settings',
      '- Setting:  Type:  Default:  Validation: ',
      '',
      '## Data and Compatibility',
      '- Reads:',
      '- Writes:',
      '- Migration or fallback:',
      '',
      '## QA Plan',
      '- [ ] Manifest validates',
      '- [ ] Disabled state tested',
      '- [ ] Empty vault behavior tested',
      '- [ ] Permission copy reviewed',
      '- [ ] Agent catalog fallback stays in sync',
      '',
      '## Rollout',
      '- Release note:',
      '- Docs:',
      '- Changelog:',
      '',
      '## Agent Implementation Notes',
      '- Keep extension IDs stable and namespaced.',
      '- Avoid adding runtime permissions unless the workflow requires them.',
      '- Update renderer and agent fallback catalogs together.'
    ].join('\n')
  },
  launchPlan: {
    file: 'Launch Plan.md',
    content: [
      '---',
      'type: launch-plan',
      'status: {{select:Status|Planning,Ready,Launching,Launched,Paused}}',
      'owner: {{prompt:Owner}}',
      'launch_date: {{prompt:Launch date}}',
      'audience: {{prompt:Audience}}',
      'created: {{date}}',
      'tags: [launch, go-to-market]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Objective',
      '{{prompt:Objective}}',
      '',
      '## Audience',
      '{{prompt:Audience}}',
      '',
      '## Scope',
      '### Included',
      '- ',
      '',
      '### Excluded',
      '- ',
      '',
      '## Launch Criteria',
      '- Product:',
      '- Docs:',
      '- Support:',
      '- Analytics:',
      '',
      '## Rollout Plan',
      '- Phase:  Audience:  Date:  Owner: ',
      '',
      '## Communications',
      '- Internal:',
      '- Customer:',
      '- Website or docs:',
      '- Social or community:',
      '',
      '## Support Readiness',
      '- Saved replies:',
      '- Known issues:',
      '- Escalation path:',
      '',
      '## Metrics',
      '- Success metric:',
      '- Guardrail metric:',
      '- Review date:',
      '',
      '## Risks',
      '- Risk:  Mitigation: ',
      '',
      '## Checklist',
      '- [ ] Launch owner assigned',
      '- [ ] Rollback or pause plan written',
      '- [ ] Docs and support notes reviewed',
      '- [ ] Metrics dashboard or query ready',
      '',
      '## Agent Tasks',
      '- [ ] Draft announcement copy from scope and audience',
      '- [ ] Check linked PRD, RFC, and support notes for gaps',
      '- [ ] Summarize launch readiness blockers'
    ].join('\n')
  },
  customerProfile: {
    file: 'Customer Profile.md',
    content: [
      '---',
      'type: customer-profile',
      'status: {{select:Status|Prospect,Active,At risk,Churned,Archived}}',
      'customer: {{prompt:Customer}}',
      'segment: {{select:Segment|Individual,SMB,Mid-market,Enterprise,Internal}}',
      'owner: {{prompt:Owner}}',
      'created: {{date}}',
      'tags: [customer, profile]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Snapshot',
      '- Customer: {{prompt:Customer}}',
      '- Segment: {{select:Segment|Individual,SMB,Mid-market,Enterprise,Internal}}',
      '- Owner: {{prompt:Owner}}',
      '- Health: {{select:Health|Green,Yellow,Red,Unknown}}',
      '',
      '## People',
      '- Name:  Role:  Notes: ',
      '',
      '## Goals',
      '- ',
      '',
      '## Use Cases',
      '- Workflow:',
      '- Success criteria:',
      '',
      '## Environment',
      '- Tools:',
      '- Integrations:',
      '- Constraints:',
      '',
      '## Timeline',
      '- {{date}} - Profile created',
      '',
      '## Pain Points',
      '- ',
      '',
      '## Success Signals',
      '- ',
      '',
      '## Risks',
      '- Risk:  Mitigation: ',
      '',
      '## Opportunities',
      '- ',
      '',
      '## Related Notes',
      '- [[ ]]',
      '',
      '## Agent Tasks',
      '- [ ] Summarize recent notes about this customer',
      '- [ ] Extract open follow-ups and owners',
      '- [ ] Identify missing context before the next meeting'
    ].join('\n')
  },
  contentCalendar: {
    file: 'Content Calendar.md',
    content: [
      '---',
      'type: content-calendar',
      'status: {{select:Status|Planning,Active,Paused,Archived}}',
      'channel: {{select:Channel|Blog,Newsletter,Social,Docs,Video,Multi-channel}}',
      'owner: {{prompt:Owner}}',
      'month: {{prompt:Month}}',
      'created: {{date}}',
      'tags: [content, calendar]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Goals',
      '- ',
      '',
      '## Audience',
      '{{prompt:Audience}}',
      '',
      '## Themes',
      '- Theme:  Notes: ',
      '',
      '## Calendar',
      '| Date | Channel | Asset | Status | Owner | Link |',
      '| --- | --- | --- | --- | --- | --- |',
      '|  |  |  |  |  |  |',
      '',
      '## Production Plan',
      '### Not Started',
      '- ',
      '',
      '### Drafting',
      '- ',
      '',
      '### Review',
      '- ',
      '',
      '### Scheduled',
      '- ',
      '',
      '### Published',
      '- ',
      '',
      '## Distribution',
      '- Primary channel:',
      '- Repurposing plan:',
      '- CTA:',
      '',
      '## Dependencies',
      '- Source material:',
      '- Design:',
      '- Reviewers:',
      '',
      '## Agent Tasks',
      '- [ ] Turn approved ideas into draft briefs',
      '- [ ] Find stale or blocked calendar items',
      '- [ ] Summarize upcoming publishing workload'
    ].join('\n')
  },
  learningPlan: {
    file: 'Learning Plan.md',
    content: [
      '---',
      'type: learning-plan',
      'status: {{select:Status|Not started,Active,Paused,Complete}}',
      'topic: {{prompt:Topic}}',
      'target_date: {{prompt:Target date}}',
      'created: {{date}}',
      'tags: [learning, plan]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Outcome',
      '{{prompt:Outcome}}',
      '',
      '## Current Level',
      '{{select:Current level|Beginner,Working knowledge,Intermediate,Advanced}}',
      '',
      '## Curriculum',
      '- Module:  Goal:  Evidence: ',
      '',
      '## Resources',
      '- Resource:  Type:  Link:  Priority: ',
      '',
      '## Practice Projects',
      '- Project:  Skill tested:  Done when: ',
      '',
      '## Schedule',
      '- Week:  Focus:  Output: ',
      '',
      '## Notes',
      '- ',
      '',
      '## Assessment',
      '- Can explain:',
      '- Can build:',
      '- Needs more practice:',
      '',
      '## Agent Coach Tasks',
      '- [ ] Convert resources into a weekly plan',
      '- [ ] Quiz weak areas from notes in this topic',
      '- [ ] Suggest practice tasks based on gaps'
    ].join('\n')
  },
  decisionReview: {
    file: 'Decision Review.md',
    content: [
      '---',
      'type: decision-review',
      'status: {{select:Status|Scheduled,Reviewing,Done}}',
      'decision_date: {{prompt:Decision date}}',
      'review_date: {{date}}',
      'owner: {{prompt:Owner}}',
      'tags: [decision, review]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Original Decision',
      '- Link: [[ ]]',
      '- Summary: {{prompt:Original decision}}',
      '- Intended outcome:',
      '',
      '## Actual Outcome',
      '- What happened:',
      '- What did not happen:',
      '- Who was affected:',
      '',
      '## Evidence',
      '- Metric or signal:  Result:  Source: ',
      '',
      '## What Changed',
      '- Assumption:',
      '- New information:',
      '- Constraint:',
      '',
      '## Consequences',
      '- Positive:',
      '- Negative:',
      '- Unexpected:',
      '',
      '## Review Decision',
      '{{select:Review decision|Keep,Change,Reverse,Defer}}',
      '',
      '## Follow-up Decisions',
      '- [ ] Decision needed:  Owner:  Due: ',
      '',
      '## Agent Tasks',
      '- [ ] Compare this review with the original decision note',
      '- [ ] Pull supporting evidence from linked notes',
      '- [ ] Draft follow-up decision records if needed'
    ].join('\n')
  },
  releaseNotes: {
    file: 'Release Notes.md',
    content: [
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
    ].join('\n')
  },
  changelog: {
    file: 'Changelog Entry.md',
    content: [
      '---',
      'type: changelog',
      'date: {{datetime}}',
      'change_type: {{select:Change type|Feature,Improvement,Fix,Docs,Internal}}',
      'tags: [forge, changelog]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Date',
      '{{datetime}}',
      '',
      '## Type',
      '{{select:Change type|Feature,Improvement,Fix,Docs,Internal}}',
      '',
      '## Summary',
      '{{prompt:Summary}}',
      '',
      '## User Impact',
      '{{prompt:User impact}}',
      '',
      '## Website Copy Notes',
      '{{prompt:Website copy notes}}',
      '',
      '## Validation',
      '',
      '## Implementation Notes',
      ''
    ].join('\n')
  },
  publishPage: {
    file: 'Publish Page.md',
    content: [
      '---',
      'type: publish-page',
      'status: {{select:Status|Draft,Review,Published}}',
      'slug: {{prompt:Slug}}',
      'description: {{prompt:Description}}',
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
      '## Calls to Action',
      '- ',
      '',
      '## Assets',
      '- ',
      '',
      '## Links',
      '- ',
      '',
      '## Publishing Checklist',
      '- [ ] Check links',
      '- [ ] Check images and media',
      '- [ ] Check title and description',
      '- [ ] Export static site',
      ''
    ].join('\n')
  },
  publishRunbook: {
    file: 'Publish Runbook.md',
    content: [
      '---',
      'type: publish-runbook',
      'status: {{select:Status|Draft,Ready,Running,Complete,Blocked}}',
      'target: {{prompt:Publish target}}',
      'owner: {{prompt:Owner}}',
      'created: {{date}}',
      'tags: [publish, runbook]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Objective',
      '{{prompt:Objective}}',
      '',
      '## Inputs',
      '- Vault: {{vault}}',
      '- Publish target: {{prompt:Publish target}}',
      '- Output directory:',
      '- Source folders:',
      '- Owner: {{prompt:Owner}}',
      '',
      '## Preflight',
      '- [ ] Vault health report reviewed',
      '- [ ] Broken links triaged',
      '- [ ] Draft pages marked ready',
      '- [ ] Assets checked',
      '- [ ] Changelog or release notes prepared',
      '',
      '## Run Steps',
      '```bash',
      'forge --vault "{{vault}}" analyze --json',
      'forge --vault "{{vault}}" publish --out "{{prompt:Publish target}}" --clean --json',
      '```',
      '',
      '## QA',
      '- [ ] Homepage loads',
      '- [ ] Navigation works',
      '- [ ] Tags or indexes render',
      '- [ ] Images and attachments load',
      '- [ ] Search or external checks pass',
      '',
      '## Rollback',
      '- Previous output:',
      '- Restore command:',
      '- Owner to notify:',
      '',
      '## Publish Log',
      '- {{datetime}} - Result:  Notes:',
      '',
      '## Agent Tasks',
      '- [ ] Summarize analyze output before publishing',
      '- [ ] Capture publish totals and broken-link count',
      '- [ ] Draft user-facing release notes from changed pages'
    ].join('\n')
  },
  transcriptCleanup: {
    file: 'Transcript Cleanup.md',
    content: [
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
    ].join('\n')
  }
}

export const useStore = create<ForgeState>((set, get) => ({
  booted: false,
  vault: null,
  vaultName: '',
  files: [],
  folders: [],
  fileStats: {},
  index: {},
  tabs: [],
  activeTabId: null,
  theme: DEFAULT_SETTINGS.theme,
  fontSize: DEFAULT_SETTINGS.fontSize,
  lineWidth: DEFAULT_SETTINGS.lineWidth,
  templatesFolder: DEFAULT_SETTINGS.templatesFolder,
  dailyNotesFolder: DEFAULT_SETTINGS.dailyNotesFolder,
  bookmarks: [],
  bookmarkSettings: DEFAULT_SETTINGS.bookmarks,
  pinnedFolders: [],
  pinnedFolderSettings: DEFAULT_SETTINGS.pinnedFolders,
  publishSites: [],
  publishSiteSettings: DEFAULT_SETTINGS.publishSites,
  enabledExtensions: DEFAULT_SETTINGS.enabledExtensions,
  extensionSettings: createDefaultExtensionSettings(),
  recentVaults: [],
  leftOpen: true,
  rightOpen: true,
  leftPane: 'files',
  modal: null,
  contextMenu: null,
  counts: { words: 0, chars: 0 },
  contentVersion: 0,
  pendingEditorNavigation: null,

  async boot() {
    const settings = await window.forge.readSettings()
    const extensionSettings = normalizeExtensionSettings(settings.extensionSettings, settings.enabledExtensions)
    const bookmarkSettings = normalizeBookmarkSettings(settings.bookmarks)
    const pinnedFolderSettings = normalizePinnedFolderSettings(settings.pinnedFolders)
    const publishSiteSettings = normalizePublishSiteSettings(settings.publishSites)
    set({
      theme: settings.theme,
      fontSize: settings.fontSize,
      lineWidth: settings.lineWidth,
      templatesFolder: settings.templatesFolder,
      dailyNotesFolder: settings.dailyNotesFolder,
      bookmarkSettings,
      pinnedFolderSettings,
      publishSiteSettings,
      extensionSettings,
      enabledExtensions: enabledExtensionIds(extensionSettings),
      recentVaults: settings.recentVaults,
      booted: true
    })
    window.forge.setThemeSource(settings.theme)
    if (settings.lastVault) {
      try {
        await get().openVaultPath(settings.lastVault)
      } catch {
        // vault moved or deleted; stay on the picker
      }
    }
  },

  async openVaultDialog() {
    const path = await window.forge.selectVault()
    if (path) await get().openVaultPath(path)
  },

  async openVaultPath(vault) {
    const data = await window.forge.openVault(vault)
    data.fileStats ??= {}
    noteContents.clear()
    for (const [path, content] of Object.entries(data.contents)) noteContents.set(path, content)

    // Seed an empty vault with a welcome note
    let files = data.files
    if (!files.some(isMarkdown)) {
      const welcome = await window.forge.createFile(vault, 'Welcome.md', WELCOME_NOTE)
      noteContents.set(welcome, WELCOME_NOTE)
      files = [...files, welcome].sort()
      data.fileStats[welcome] = fileStatForContent(WELCOME_NOTE)
    }

    const recents = [vault, ...get().recentVaults.filter((v) => v !== vault)].slice(0, 12)
    const firstNote = files.find(isMarkdown) ?? null
    const tab: Tab = { id: newTabId(), kind: firstNote ? 'note' : 'empty', path: firstNote, mode: 'edit' }
    const bookmarks = bookmarksForVault(get().bookmarkSettings, vault, files)
    const pinnedFolders = pinnedFoldersForVault(get().pinnedFolderSettings, vault, data.folders)
    const publishSites = publishSitesForVault(get().publishSiteSettings, vault, data.folders)

    set({
      vault,
      vaultName: vault.split('/').pop() ?? vault,
      files,
      folders: data.folders,
      fileStats: data.fileStats ?? {},
      index: buildIndex(data.contents),
      bookmarks,
      bookmarkSettings: { ...get().bookmarkSettings, [vault]: bookmarks },
      pinnedFolders,
      pinnedFolderSettings: { ...get().pinnedFolderSettings, [vault]: pinnedFolders },
      publishSites,
      publishSiteSettings: { ...get().publishSiteSettings, [vault]: publishSites },
      tabs: [tab],
      activeTabId: tab.id,
      recentVaults: recents,
      leftPane: 'files',
      modal: null,
      contentVersion: get().contentVersion + 1
    })
    if (firstNote) {
      set({ counts: wordCount(noteContents.get(firstNote) ?? '') })
    }
    await window.forge.watchVault(vault)
    persistSettings(get())
  },

  removeRecentVault(path) {
    if (!path || path === get().vault) return
    set({ recentVaults: get().recentVaults.filter((vault) => vault !== path) })
    persistSettings(get())
  },

  closeVault() {
    noteContents.clear()
    set({
      vault: null,
      vaultName: '',
      files: [],
      folders: [],
      fileStats: {},
      index: {},
      bookmarks: [],
      pinnedFolders: [],
      publishSites: [],
      tabs: [],
      activeTabId: null,
      modal: null
    })
    window.forge.setMobileVault(null).catch(console.error)
    persistSettings({ ...get(), vault: null } as ForgeState)
  },

  async refreshVault() {
    const { vault } = get()
    if (!vault) return
    const data = await window.forge.openVault(vault)
    data.fileStats ??= {}
    // Keep locally-edited content that hasn't hit disk yet
    for (const [path, content] of Object.entries(data.contents)) {
      if (!saveTimers.has(path)) noteContents.set(path, content)
    }
    for (const key of Array.from(noteContents.keys())) {
      if (!(key in data.contents) && !saveTimers.has(key)) noteContents.delete(key)
    }
    const index = buildIndex(Object.fromEntries(noteContents))
    // Drop tabs whose file disappeared
    const tabs = get().tabs.map((t) =>
      t.kind === 'note' && t.path && !data.files.includes(t.path) ? { ...t, kind: 'empty' as TabKind, path: null } : t
    )
    const bookmarks = bookmarksForVault(get().bookmarkSettings, vault, data.files)
    const pinnedFolders = pinnedFoldersForVault(get().pinnedFolderSettings, vault, data.folders)
    const publishSites = publishSitesForVault(get().publishSiteSettings, vault, data.folders)
    set({
      files: data.files,
      folders: data.folders,
      fileStats: data.fileStats ?? {},
      index,
      bookmarks,
      bookmarkSettings: { ...get().bookmarkSettings, [vault]: bookmarks },
      pinnedFolders,
      pinnedFolderSettings: { ...get().pinnedFolderSettings, [vault]: pinnedFolders },
      publishSites,
      publishSiteSettings: { ...get().publishSiteSettings, [vault]: publishSites },
      tabs,
      contentVersion: get().contentVersion + 1
    })
  },

  openFile(path, opts) {
    const { tabs, activeTabId } = get()
    const existing = tabs.find((t) => t.kind === 'note' && t.path === path)
    if (existing) {
      set({
        activeTabId: existing.id,
        tabs:
          opts?.line === undefined
            ? tabs
            : tabs.map((tab) => (tab.id === existing.id ? { ...tab, mode: 'edit' } : tab))
      })
    } else if (!opts?.newTab && activeTabId) {
      set({
        tabs: tabs.map((tab) =>
          tab.id === activeTabId
            ? { ...tab, kind: 'note' as TabKind, path, mode: opts?.line === undefined ? tab.mode : 'edit' }
            : tab
        )
      })
    } else {
      const tab: Tab = { id: newTabId(), kind: 'note', path, mode: 'edit' }
      set({ tabs: [...tabs, tab], activeTabId: tab.id })
    }
    if (opts?.line !== undefined) set({ pendingEditorNavigation: { path, lineNumber: opts.line } })
    set({ counts: wordCount(noteContents.get(path) ?? '') })
  },

  consumePendingEditorNavigation(path) {
    const pending = get().pendingEditorNavigation
    if (!pending || pending.path !== path) return null
    set({ pendingEditorNavigation: null })
    return pending.lineNumber
  },

  openGraph() {
    const { tabs } = get()
    const existing = tabs.find((t) => t.kind === 'graph')
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    const tab: Tab = { id: newTabId(), kind: 'graph', path: null, mode: 'edit' }
    set({ tabs: [...tabs, tab], activeTabId: tab.id })
  },

  newTab() {
    const tab: Tab = { id: newTabId(), kind: 'empty', path: null, mode: 'edit' }
    set({ tabs: [...get().tabs, tab], activeTabId: tab.id })
  },

  closeTab(id) {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    const next = tabs.filter((t) => t.id !== id)
    let nextActive = activeTabId
    if (activeTabId === id) {
      nextActive = next[Math.min(idx, next.length - 1)]?.id ?? null
    }
    set({ tabs: next, activeTabId: nextActive })
  },

  activateTab(id) {
    set({ activeTabId: id })
    const tab = get().tabs.find((t) => t.id === id)
    if (tab?.path) set({ counts: wordCount(noteContents.get(tab.path) ?? '') })
  },

  setTabMode(id, mode) {
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, mode } : t)) })
  },

  toggleActiveMode() {
    const { tabs, activeTabId } = get()
    const tab = tabs.find((t) => t.id === activeTabId)
    if (tab && tab.kind === 'note') {
      get().setTabMode(tab.id, tab.mode === 'edit' ? 'read' : 'edit')
    }
  },

  updateContent(path, content) {
    const { vault, tabs, activeTabId } = get()
    if (!vault) return
    noteContents.set(path, content)

    const existing = saveTimers.get(path)
    if (existing) clearTimeout(existing)
    saveTimers.set(
      path,
      setTimeout(() => {
        saveTimers.delete(path)
        window.forge
          .writeFile(vault, path, content)
          .then(() => {
            set({ fileStats: { ...get().fileStats, [path]: fileStatForContent(content) } })
          })
          .catch(console.error)
      }, 500)
    )

    const parseExisting = parseTimers.get(path)
    if (parseExisting) clearTimeout(parseExisting)
    parseTimers.set(
      path,
      setTimeout(() => {
        parseTimers.delete(path)
        set({
          index: { ...get().index, [path]: parseNote(content) },
          contentVersion: get().contentVersion + 1
        })
      }, 300)
    )

    const active = tabs.find((t) => t.id === activeTabId)
    if (active?.path === path) set({ counts: wordCount(content) })
  },

  async createNote(folder) {
    const { vault } = get()
    if (!vault) return
    const rel = (folder ? folder + '/' : '') + 'Untitled.md'
    const created = await window.forge.createFile(vault, rel, '')
    noteContents.set(created, '')
    set({
      files: [...get().files, created].sort(),
      folders: [...new Set([...get().folders, ...folderAncestors(folder ?? '')])].sort(),
      fileStats: { ...get().fileStats, [created]: fileStatForContent('') },
      index: { ...get().index, [created]: parseNote('') },
      contentVersion: get().contentVersion + 1
    })
    get().openFile(created)
  },

  async createNoteNamed(name) {
    const { vault } = get()
    if (!vault) return null
    const clean = name.replace(/[\\:*?"<>|]/g, '').trim()
    if (!clean) return null
    const created = await window.forge.createFile(vault, clean + '.md', '')
    noteContents.set(created, '')
    const folder = created.split('/').slice(0, -1).join('/')
    set({
      files: [...get().files, created].sort(),
      folders: [...new Set([...get().folders, ...folderAncestors(folder)])].sort(),
      fileStats: { ...get().fileStats, [created]: fileStatForContent('') },
      index: { ...get().index, [created]: parseNote('') },
      contentVersion: get().contentVersion + 1
    })
    get().openFile(created)
    return created
  },

  async createNoteFromTemplate(templatePath, opts) {
    const { vault, vaultName } = get()
    if (!vault) return null

    const template = await window.forge.readFile(vault, templatePath)
    const title = noteTitle(opts?.title ?? '', baseName(templatePath))
    const folder = normalizeFolderPath(opts?.folder ?? '')
    const rel = `${folder ? folder + '/' : ''}${title}.md`
    const content = renderTemplate(template || `# {{title}}\n`, {
      title,
      vaultName,
      templateName: baseName(templatePath),
      folder,
      variables: opts?.variables
    })

    const created = await window.forge.createFile(vault, rel, content)
    noteContents.set(created, content)
    set({
      files: [...get().files, created].sort(),
      folders: [...new Set([...get().folders, ...folderAncestors(folder)])].sort(),
      fileStats: { ...get().fileStats, [created]: fileStatForContent(content) },
      index: { ...get().index, [created]: parseNote(content) },
      contentVersion: get().contentVersion + 1
    })
    get().openFile(created)
    return created
  },

  async createStarterTemplate(kind) {
    const { vault, templatesFolder } = get()
    if (!vault) return null
    const starter = STARTER_TEMPLATES[kind]
    const folder = normalizeFolderPath(templatesFolder || DEFAULT_SETTINGS.templatesFolder)
    const rel = `${folder ? folder + '/' : ''}${starter.file}`
    const created = await window.forge.createFile(vault, rel, starter.content)
    noteContents.set(created, starter.content)
    set({
      files: [...get().files, created].sort(),
      folders: [...new Set([...get().folders, ...folderAncestors(folder)])].sort(),
      fileStats: { ...get().fileStats, [created]: fileStatForContent(starter.content) },
      index: { ...get().index, [created]: parseNote(starter.content) },
      contentVersion: get().contentVersion + 1
    })
    get().openFile(created)
    return created
  },

  async createDailyNote() {
    const { vault, dailyNotesFolder, templatesFolder } = get()
    if (!vault) return null
    const today = formatTemplateDateParts(new Date())
    const rel = `${dailyNotesFolder || 'Daily'}/${today.date}.md`
    const existing = get().files.find((file) => file.toLowerCase() === rel.toLowerCase())
    if (existing) {
      get().openFile(existing)
      return existing
    }

    const templatePath = `${templatesFolder || 'Templates'}/Daily.md`
    let template = ''
    try {
      template = await window.forge.readFile(vault, templatePath)
    } catch {
      template = [
        '---',
        `date: ${today.date}`,
        'tags: [daily]',
        '---',
        '',
        '# {{date}}',
        '',
        '## Notes',
        '',
        '## Tasks',
        ''
      ].join('\n')
    }
    const content = renderTemplate(template, {
      title: today.date,
      vaultName: get().vaultName,
      templateName: 'Daily',
      folder: dailyNotesFolder || 'Daily'
    })

    const created = await window.forge.createFile(vault, rel, content)
    noteContents.set(created, content)
    set({
      files: [...get().files, created].sort(),
      folders: [...new Set([...get().folders, dailyNotesFolder || 'Daily'])].sort(),
      fileStats: { ...get().fileStats, [created]: fileStatForContent(content) },
      index: { ...get().index, [created]: parseNote(content) },
      contentVersion: get().contentVersion + 1
    })
    get().openFile(created)
    return created
  },

  async createFolder(parent, name) {
    const { vault } = get()
    if (!vault || !name.trim()) return
    const rel = (parent ? parent + '/' : '') + name.trim()
    await window.forge.createFolder(vault, rel)
    set({ folders: [...get().folders, rel].sort() })
  },

  async renamePath(oldPath, newPath) {
    const { vault } = get()
    if (!vault || oldPath === newPath) return
    await window.forge.rename(vault, oldPath, newPath)
    const mapPath = (p: string): string =>
      p === oldPath ? newPath : p.startsWith(oldPath + '/') ? newPath + p.slice(oldPath.length) : p

    for (const key of Array.from(noteContents.keys())) {
      const mapped = mapPath(key)
      if (mapped !== key) {
        noteContents.set(mapped, noteContents.get(key)!)
        noteContents.delete(key)
      }
    }
    const index: Record<string, NoteMeta> = {}
    for (const [key, value] of Object.entries(get().index)) index[mapPath(key)] = value
    const fileStats: Record<string, VaultFileStat> = {}
    for (const [key, value] of Object.entries(get().fileStats)) fileStats[mapPath(key)] = value

    const bookmarks = normalizeBookmarkList(get().bookmarks.map(mapPath))
    const pinnedFolders = normalizeBookmarkList(get().pinnedFolders.map(mapPath))
    const publishSites = get().publishSites.map((site) => ({
      ...site,
      scope: site.scope.kind === 'folder' ? { kind: 'folder' as const, folder: mapPath(site.scope.folder) } : site.scope,
      updatedAt: site.scope.kind === 'folder' && site.scope.folder === oldPath ? new Date().toISOString() : site.updatedAt
    }))
    set({
      files: get().files.map(mapPath).sort(),
      folders: get().folders.map(mapPath).sort(),
      fileStats,
      index,
      bookmarks,
      bookmarkSettings: { ...get().bookmarkSettings, [vault]: bookmarks },
      pinnedFolders,
      pinnedFolderSettings: { ...get().pinnedFolderSettings, [vault]: pinnedFolders },
      publishSites,
      publishSiteSettings: { ...get().publishSiteSettings, [vault]: publishSites },
      tabs: get().tabs.map((t) => (t.path ? { ...t, path: mapPath(t.path) } : t)),
      contentVersion: get().contentVersion + 1
    })
    persistSettings(get())
  },

  async movePath(source, targetFolder) {
    const { files, folders } = get()
    // A folder can't be moved into itself or its own descendant
    if (targetFolder === source || targetFolder.startsWith(source + '/')) return
    const parent = source.split('/').slice(0, -1).join('/')
    if (parent === targetFolder) return

    const name = source.split('/').pop()!
    const exists = (p: string): boolean => files.includes(p) || folders.includes(p)
    const inTarget = (n: string): string => (targetFolder ? targetFolder + '/' : '') + n
    let dest = inTarget(name)
    if (exists(dest)) {
      const dot = name.lastIndexOf('.')
      const stem = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      let n = 1
      while (exists(dest)) {
        dest = inTarget(`${stem} ${n}${ext}`)
        n += 1
      }
    }
    await get().renamePath(source, dest)
  },

  async trashPath(path) {
    const { vault } = get()
    if (!vault) return
    await window.forge.trash(vault, path)
    const gone = (p: string): boolean => p === path || p.startsWith(path + '/')
    for (const key of Array.from(noteContents.keys())) if (gone(key)) noteContents.delete(key)
    const index: Record<string, NoteMeta> = {}
    for (const [key, value] of Object.entries(get().index)) if (!gone(key)) index[key] = value
    const fileStats: Record<string, VaultFileStat> = {}
    for (const [key, value] of Object.entries(get().fileStats)) if (!gone(key)) fileStats[key] = value
    const bookmarks = get().bookmarks.filter((bookmark) => !gone(bookmark))
    const pinnedFolders = get().pinnedFolders.filter((folder) => !gone(folder))
    const now = new Date().toISOString()
    const publishSites = get().publishSites.map((site) =>
      site.scope.kind === 'folder' && gone(site.scope.folder)
        ? { ...site, scope: { kind: 'vault' as const }, updatedAt: now }
        : site
    )
    set({
      files: get().files.filter((f) => !gone(f)),
      folders: get().folders.filter((f) => !gone(f)),
      fileStats,
      index,
      bookmarks,
      bookmarkSettings: { ...get().bookmarkSettings, [vault]: bookmarks },
      pinnedFolders,
      pinnedFolderSettings: { ...get().pinnedFolderSettings, [vault]: pinnedFolders },
      publishSites,
      publishSiteSettings: { ...get().publishSiteSettings, [vault]: publishSites },
      tabs: get().tabs.map((t) =>
        t.path && gone(t.path) ? { ...t, kind: 'empty' as TabKind, path: null } : t
      ),
      contentVersion: get().contentVersion + 1
    })
    persistSettings(get())
  },

  setTheme(theme) {
    set({ theme })
    window.forge.setThemeSource(theme)
    persistSettings(get())
  },

  setFontSize(fontSize) {
    set({ fontSize })
    persistSettings(get())
  },

  setLineWidth(lineWidth) {
    set({ lineWidth })
    persistSettings(get())
  },
  setTemplatesFolder(templatesFolder) {
    set({ templatesFolder: templatesFolder.trim() || DEFAULT_SETTINGS.templatesFolder })
    persistSettings(get())
  },
  setDailyNotesFolder(dailyNotesFolder) {
    set({ dailyNotesFolder: dailyNotesFolder.trim() || DEFAULT_SETTINGS.dailyNotesFolder })
    persistSettings(get())
  },
  toggleBookmark(path) {
    const { files, vault } = get()
    if (!vault || !files.includes(path) || !isMarkdown(path)) return
    const current = get().bookmarks
    const exists = current.includes(path)
    const bookmarks = exists ? current.filter((bookmark) => bookmark !== path) : [...current, path]
    set({ bookmarks, bookmarkSettings: { ...get().bookmarkSettings, [vault]: bookmarks } })
    persistSettings(get())
  },
  removeBookmark(path) {
    const { vault } = get()
    if (!vault) return
    const bookmarks = get().bookmarks.filter((bookmark) => bookmark !== path)
    if (bookmarks.length === get().bookmarks.length) return
    set({ bookmarks, bookmarkSettings: { ...get().bookmarkSettings, [vault]: bookmarks } })
    persistSettings(get())
  },

  togglePinnedFolder(path) {
    const { vault, folders, pinnedFolders } = get()
    if (!vault || !folders.includes(path)) return
    const next = pinnedFolders.includes(path)
      ? pinnedFolders.filter((folder) => folder !== path)
      : [...pinnedFolders, path]
    const normalized = pinnedFoldersForVault({ [vault]: next }, vault, folders)
    set({
      pinnedFolders: normalized,
      pinnedFolderSettings: { ...get().pinnedFolderSettings, [vault]: normalized }
    })
    persistSettings(get())
  },

  setPublishSites(sites) {
    const { vault, folders } = get()
    if (!vault) return
    const normalized = normalizePublishSites(sites, folders)
    set({
      publishSites: normalized,
      publishSiteSettings: { ...get().publishSiteSettings, [vault]: normalized }
    })
    persistSettings(get())
  },
  setExtensionInstalled(extensionId, installed) {
    const extensionSettings = withExtensionInstalled(get().extensionSettings, extensionId, installed)
    set({ extensionSettings, enabledExtensions: enabledExtensionIds(extensionSettings) })
    persistSettings(get())
  },
  setExtensionEnabled(extensionId, enabled) {
    const baseSettings = enabled ? withExtensionInstalled(get().extensionSettings, extensionId, true) : get().extensionSettings
    const extensionSettings = withExtensionEnabled(baseSettings, extensionId, enabled)
    set({ extensionSettings, enabledExtensions: enabledExtensionIds(extensionSettings) })
    persistSettings(get())
  },

  setLeftOpen(leftOpen) {
    set({ leftOpen })
  },
  setRightOpen(rightOpen) {
    set({ rightOpen })
  },
  setLeftPane(leftPane) {
    set({ leftPane, leftOpen: true })
  },
  setModal(modal) {
    set({ modal })
  },
  setContextMenu(contextMenu) {
    set({ contextMenu })
  }
}))

/** All notes that link to `path` with the matched link text context. */
export function backlinksFor(path: string, files: string[], index: Record<string, NoteMeta>): string[] {
  const result: string[] = []
  for (const [source, meta] of Object.entries(index)) {
    if (source === path) continue
    if (meta.links.some((l) => resolveLink(l, files) === path)) result.push(source)
  }
  return result.sort()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function unlinkedMentionsFor(path: string, files: string[], index: Record<string, NoteMeta>): string[] {
  const meta = index[path]
  const names = [noteDisplayTitle(path, meta), baseName(path), ...(meta?.aliases ?? [])]
    .map((name) => name.trim())
    .filter((name, index, all) => name.length >= 3 && all.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index)
  if (names.length === 0) return []

  const linkedSources = new Set(backlinksFor(path, files, index))
  const patterns = names.map((name) => new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(name)}([^\\p{L}\\p{N}_]|$)`, 'iu'))
  const result: string[] = []
  for (const source of files.filter(isMarkdown)) {
    if (source === path || linkedSources.has(source)) continue
    const content = noteContents.get(source) ?? ''
    if (patterns.some((pattern) => pattern.test(content))) result.push(source)
  }
  return result.sort()
}

export function activeTab(state: ForgeState): Tab | null {
  return state.tabs.find((t) => t.id === state.activeTabId) ?? null
}

export function tabTitle(tab: Tab): string {
  if (tab.kind === 'graph') return 'Graph'
  if (tab.kind === 'empty' || !tab.path) return 'New tab'
  return baseName(tab.path)
}

const WELCOME_NOTE = `# Welcome to Forge

Forge keeps your notes as **plain Markdown files**, right here on your Mac.

## The basics

- Press **⌘O** to quickly open or create a note
- Press **⌘P** to run any command
- Make connections with wikilinks: type \`[[\` and start writing
- Add #tags anywhere to organize

## Make it yours

Open **Settings** from the command palette to switch between light, dark, and system themes.

> Your second brain should feel like home. Make a few notes, link them together, then open the graph view to watch your ideas connect.
`
