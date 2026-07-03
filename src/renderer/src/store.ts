import { create } from 'zustand'
import type { ReactNode } from 'react'
import { DEFAULT_SETTINGS, type ExtensionSettings, type Settings, type ThemeMode } from '../../shared/types'
import {
  createDefaultExtensionSettings,
  enabledExtensionIds,
  normalizeExtensionSettings,
  withExtensionEnabled,
  withExtensionInstalled
} from './extensions/preferences'
import { baseName, isMarkdown, noteDisplayTitle, parseNote, resolveLink, wordCount, type NoteMeta } from './lib/parse'
import { formatTemplateDateParts, renderTemplate } from './lib/templates'

export type TabKind = 'note' | 'graph' | 'board' | 'empty'
export type ViewMode = 'edit' | 'read'
export const STARTER_TEMPLATE_KINDS = [
  'daily',
  'meeting',
  'project',
  'person',
  'research',
  'agentTask',
  'seoBrief',
  'productSpec',
  'bugReport',
  'decision',
  'releaseNotes',
  'changelog',
  'publishPage'
] as const
export type StarterTemplateKind = (typeof STARTER_TEMPLATE_KINDS)[number]

export const STARTER_TEMPLATE_CATALOG: { kind: StarterTemplateKind; label: string; detail: string }[] = [
  { kind: 'daily', label: 'Daily', detail: 'Date-based planning' },
  { kind: 'meeting', label: 'Meeting', detail: 'Agenda and action items' },
  { kind: 'project', label: 'Project', detail: 'Goals, scope, milestones' },
  { kind: 'person', label: 'Person', detail: 'Relationship notes' },
  { kind: 'research', label: 'Research', detail: 'Questions, sources, findings' },
  { kind: 'agentTask', label: 'Agent task', detail: 'Precise AI work briefs' },
  { kind: 'seoBrief', label: 'SEO brief', detail: 'Search-focused content planning' },
  { kind: 'productSpec', label: 'Product spec', detail: 'PRD and launch scope' },
  { kind: 'bugReport', label: 'Bug report', detail: 'Repro, impact, fix notes' },
  { kind: 'decision', label: 'Decision log', detail: 'Options and rationale' },
  { kind: 'releaseNotes', label: 'Release notes', detail: 'User-facing changes' },
  { kind: 'changelog', label: 'Changelog', detail: 'Forge-style product entries' },
  { kind: 'publishPage', label: 'Publish page', detail: 'Public Markdown pages' }
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

  boot(): Promise<void>
  openVaultDialog(): Promise<void>
  openVaultPath(path: string): Promise<void>
  closeVault(): void
  refreshVault(): Promise<void>

  openFile(path: string, opts?: { newTab?: boolean }): void
  openGraph(): void
  openBoard(): void
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
      '## Schedule',
      '',
      '## Notes',
      '',
      '## Tasks',
      ''
    ].join('\n')
  },
  meeting: {
    file: 'Meeting.md',
    content: [
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
    ].join('\n')
  },
  project: {
    file: 'Project.md',
    content: [
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
    file: 'Research.md',
    content: [
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
    ].join('\n')
  },
  seoBrief: {
    file: 'SEO Content Brief.md',
    content: [
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
    ].join('\n')
  },
  productSpec: {
    file: 'Product Spec.md',
    content: [
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
    ].join('\n')
  },
  decision: {
    file: 'Decision Log.md',
    content: [
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
    file: 'Forge Changelog Entry.md',
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
    ].join('\n')
  },
  publishPage: {
    file: 'Publish Page.md',
    content: [
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
    ].join('\n')
  }
}

export const useStore = create<ForgeState>((set, get) => ({
  booted: false,
  vault: null,
  vaultName: '',
  files: [],
  folders: [],
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

  async boot() {
    const settings = await window.forge.readSettings()
    const extensionSettings = normalizeExtensionSettings(settings.extensionSettings, settings.enabledExtensions)
    const bookmarkSettings = normalizeBookmarkSettings(settings.bookmarks)
    set({
      theme: settings.theme,
      fontSize: settings.fontSize,
      lineWidth: settings.lineWidth,
      templatesFolder: settings.templatesFolder,
      dailyNotesFolder: settings.dailyNotesFolder,
      bookmarkSettings,
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
    noteContents.clear()
    for (const [path, content] of Object.entries(data.contents)) noteContents.set(path, content)

    // Seed an empty vault with a welcome note
    let files = data.files
    if (!files.some(isMarkdown)) {
      const welcome = await window.forge.createFile(vault, 'Welcome.md', WELCOME_NOTE)
      noteContents.set(welcome, WELCOME_NOTE)
      files = [...files, welcome].sort()
    }

    const recents = [vault, ...get().recentVaults.filter((v) => v !== vault)].slice(0, 8)
    const firstNote = files.find(isMarkdown) ?? null
    const tab: Tab = { id: newTabId(), kind: firstNote ? 'note' : 'empty', path: firstNote, mode: 'edit' }
    const bookmarks = bookmarksForVault(get().bookmarkSettings, vault, files)

    set({
      vault,
      vaultName: vault.split('/').pop() ?? vault,
      files,
      folders: data.folders,
      index: buildIndex(data.contents),
      bookmarks,
      bookmarkSettings: { ...get().bookmarkSettings, [vault]: bookmarks },
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

  closeVault() {
    noteContents.clear()
    set({ vault: null, vaultName: '', files: [], folders: [], index: {}, bookmarks: [], tabs: [], activeTabId: null, modal: null })
    window.forge.setMobileVault(null).catch(console.error)
    persistSettings({ ...get(), vault: null } as ForgeState)
  },

  async refreshVault() {
    const { vault } = get()
    if (!vault) return
    const data = await window.forge.openVault(vault)
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
    set({
      files: data.files,
      folders: data.folders,
      index,
      bookmarks,
      bookmarkSettings: { ...get().bookmarkSettings, [vault]: bookmarks },
      tabs,
      contentVersion: get().contentVersion + 1
    })
  },

  openFile(path, opts) {
    const { tabs, activeTabId } = get()
    const existing = tabs.find((t) => t.kind === 'note' && t.path === path)
    if (existing) {
      set({ activeTabId: existing.id })
    } else if (!opts?.newTab && activeTabId) {
      set({
        tabs: tabs.map((t) => (t.id === activeTabId ? { ...t, kind: 'note' as TabKind, path, mode: t.mode } : t))
      })
    } else {
      const tab: Tab = { id: newTabId(), kind: 'note', path, mode: 'edit' }
      set({ tabs: [...tabs, tab], activeTabId: tab.id })
    }
    set({ counts: wordCount(noteContents.get(path) ?? '') })
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

  openBoard() {
    const { tabs } = get()
    const existing = tabs.find((t) => t.kind === 'board')
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    const tab: Tab = { id: newTabId(), kind: 'board', path: null, mode: 'edit' }
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
        window.forge.writeFile(vault, path, content).catch(console.error)
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
      index: { ...get().index, [created]: parseNote('') }
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
    set({
      files: [...get().files, created].sort(),
      index: { ...get().index, [created]: parseNote('') }
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

    const bookmarks = normalizeBookmarkList(get().bookmarks.map(mapPath))
    set({
      files: get().files.map(mapPath).sort(),
      folders: get().folders.map(mapPath).sort(),
      index,
      bookmarks,
      bookmarkSettings: { ...get().bookmarkSettings, [vault]: bookmarks },
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
    const bookmarks = get().bookmarks.filter((bookmark) => !gone(bookmark))
    set({
      files: get().files.filter((f) => !gone(f)),
      folders: get().folders.filter((f) => !gone(f)),
      index,
      bookmarks,
      bookmarkSettings: { ...get().bookmarkSettings, [vault]: bookmarks },
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
  if (tab.kind === 'board') return 'Board'
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
