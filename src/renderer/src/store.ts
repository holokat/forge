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

export type TabKind = 'note' | 'graph' | 'empty'
export type ViewMode = 'edit' | 'read'
export type StarterTemplateKind = 'daily' | 'meeting' | 'project' | 'person' | 'research'

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
  newTab(): void
  closeTab(id: string): void
  activateTab(id: string): void
  setTabMode(id: string, mode: ViewMode): void
  toggleActiveMode(): void

  updateContent(path: string, content: string): void
  createNote(folder?: string): Promise<void>
  createNoteNamed(name: string): Promise<string | null>
  createNoteFromTemplate(templatePath: string, opts?: { title?: string; folder?: string }): Promise<string | null>
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
    enabledExtensions: enabledExtensionIds(state.extensionSettings),
    extensionSettings: state.extensionSettings
  }
  await window.forge.writeSettings(settings)
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

function formatDateParts(date: Date): { date: string; time: string; datetime: string } {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const dateValue = `${yyyy}-${mm}-${dd}`
  const time = `${hh}:${min}`
  return { date: dateValue, time, datetime: `${dateValue} ${time}` }
}

function renderTemplate(
  template: string,
  context: { title: string; vaultName: string; templateName: string; now?: Date }
): string {
  const parts = formatDateParts(context.now ?? new Date())
  const values: Record<string, string> = {
    title: context.title,
    date: parts.date,
    time: parts.time,
    datetime: parts.datetime,
    vault: context.vaultName,
    template: context.templateName
  }
  return template.replace(/\{\{\s*(title|date|time|datetime|vault|template)\s*\}\}/gi, (_match, key: string) => {
    return values[key.toLowerCase()] ?? ''
  })
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
      '',
      '## Agenda',
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
      'status: active',
      'tags: [project]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Goal',
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
      '',
      '## Sources',
      '',
      '## Findings',
      '',
      '## Synthesis',
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
    set({
      theme: settings.theme,
      fontSize: settings.fontSize,
      lineWidth: settings.lineWidth,
      templatesFolder: settings.templatesFolder,
      dailyNotesFolder: settings.dailyNotesFolder,
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

    set({
      vault,
      vaultName: vault.split('/').pop() ?? vault,
      files,
      folders: data.folders,
      index: buildIndex(data.contents),
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
    set({ vault: null, vaultName: '', files: [], folders: [], index: {}, tabs: [], activeTabId: null, modal: null })
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
    set({ files: data.files, folders: data.folders, index, tabs, contentVersion: get().contentVersion + 1 })
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
      templateName: baseName(templatePath)
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
    const today = formatDateParts(new Date())
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
      templateName: 'Daily'
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

    set({
      files: get().files.map(mapPath).sort(),
      folders: get().folders.map(mapPath).sort(),
      index,
      tabs: get().tabs.map((t) => (t.path ? { ...t, path: mapPath(t.path) } : t)),
      contentVersion: get().contentVersion + 1
    })
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
    set({
      files: get().files.filter((f) => !gone(f)),
      folders: get().folders.filter((f) => !gone(f)),
      index,
      tabs: get().tabs.map((t) =>
        t.path && gone(t.path) ? { ...t, kind: 'empty' as TabKind, path: null } : t
      ),
      contentVersion: get().contentVersion + 1
    })
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
