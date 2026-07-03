import { create } from 'zustand'
import type { ReactNode } from 'react'
import {
  DEFAULT_SETTINGS,
  DEFAULT_PUBLISH_SITE_INTEGRATIONS,
  type AISettings,
  type AITextProvider,
  type PublishAnalyticsProvider,
  type PublishDeployTarget,
  type PublishFormProvider,
  type ExtensionSettings,
  type PublishSiteConfig,
  type PublishSiteIntegrations,
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
import { STARTER_TEMPLATES } from './lib/starterTemplates'
import type { StarterTemplateKind } from './lib/starterTemplates'
import { formatTemplateDateParts, renderTemplate } from './lib/templates'
export { STARTER_TEMPLATE_CATALOG, STARTER_TEMPLATE_KINDS } from './lib/starterTemplates'
export type { StarterTemplateKind } from './lib/starterTemplates'

export type TabKind = 'note' | 'graph' | 'media' | 'empty'
export type ViewMode = 'edit' | 'read'

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
  aiSettings: AISettings
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
  openMediaVault(): void
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
  setAISettings(settings: AISettings): void
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
    ai: state.aiSettings,
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

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeAIProvider(value: unknown): AITextProvider {
  const providers: AITextProvider[] = ['codex', 'openai', 'anthropic']
  return providers.includes(value as AITextProvider) ? (value as AITextProvider) : DEFAULT_SETTINGS.ai.defaultProvider
}

function normalizeAISettings(value: unknown): AISettings {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<AISettings>) : {}
  return {
    defaultProvider: normalizeAIProvider(raw.defaultProvider),
    codexModel: stringValue(raw.codexModel),
    openaiModel: stringValue(raw.openaiModel) || DEFAULT_SETTINGS.ai.openaiModel,
    anthropicModel: stringValue(raw.anthropicModel) || DEFAULT_SETTINGS.ai.anthropicModel,
    includeActiveNote: booleanValue(raw.includeActiveNote, DEFAULT_SETTINGS.ai.includeActiveNote)
  }
}

function normalizeAnalyticsProvider(value: unknown): PublishAnalyticsProvider {
  const providers: PublishAnalyticsProvider[] = ['none', 'plausible', 'umami', 'custom']
  return providers.includes(value as PublishAnalyticsProvider) ? (value as PublishAnalyticsProvider) : 'none'
}

function normalizeDeployTarget(value: unknown): PublishDeployTarget {
  const targets: PublishDeployTarget[] = ['manual', 'github-pages', 'cloudflare-pages', 'netlify', 'vercel', 's3-r2', 'ipfs']
  return targets.includes(value as PublishDeployTarget) ? (value as PublishDeployTarget) : 'manual'
}

function normalizeFormProvider(value: unknown): PublishFormProvider {
  const providers: PublishFormProvider[] = ['none', 'netlify', 'formspree', 'custom']
  return providers.includes(value as PublishFormProvider) ? (value as PublishFormProvider) : 'none'
}

function normalizeRobotsMode(value: unknown): 'index' | 'noindex' {
  return value === 'noindex' ? 'noindex' : 'index'
}

function normalizeLanguage(value: unknown): string {
  const language = stringValue(value).trim()
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(language) ? language : DEFAULT_PUBLISH_SITE_INTEGRATIONS.seoRss.language
}

function normalizePublishSiteIntegrations(value: unknown): PublishSiteIntegrations {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<PublishSiteIntegrations>)
    : {}
  const seoRss: Record<string, unknown> =
    raw.seoRss && typeof raw.seoRss === 'object' && !Array.isArray(raw.seoRss)
      ? (raw.seoRss as unknown as Record<string, unknown>)
      : {}
  const analytics: Record<string, unknown> =
    raw.analytics && typeof raw.analytics === 'object' && !Array.isArray(raw.analytics)
      ? (raw.analytics as unknown as Record<string, unknown>)
      : {}
  const deploy: Record<string, unknown> =
    raw.deploy && typeof raw.deploy === 'object' && !Array.isArray(raw.deploy)
      ? (raw.deploy as unknown as Record<string, unknown>)
      : {}
  const embeds: Record<string, unknown> =
    raw.embeds && typeof raw.embeds === 'object' && !Array.isArray(raw.embeds)
      ? (raw.embeds as unknown as Record<string, unknown>)
      : {}
  const forms: Record<string, unknown> =
    raw.forms && typeof raw.forms === 'object' && !Array.isArray(raw.forms)
      ? (raw.forms as unknown as Record<string, unknown>)
      : {}

  return {
    seoRss: {
      enabled: booleanValue(seoRss.enabled, DEFAULT_PUBLISH_SITE_INTEGRATIONS.seoRss.enabled),
      siteUrl: stringValue(seoRss.siteUrl),
      socialImage: stringValue(seoRss.socialImage),
      authorName: stringValue(seoRss.authorName),
      language: normalizeLanguage(seoRss.language),
      robotsMode: normalizeRobotsMode(seoRss.robotsMode),
      favicon: stringValue(seoRss.favicon),
      customFooter: stringValue(seoRss.customFooter),
      rss: booleanValue(seoRss.rss, DEFAULT_PUBLISH_SITE_INTEGRATIONS.seoRss.rss),
      sitemap: booleanValue(seoRss.sitemap, DEFAULT_PUBLISH_SITE_INTEGRATIONS.seoRss.sitemap),
      robots: booleanValue(seoRss.robots, DEFAULT_PUBLISH_SITE_INTEGRATIONS.seoRss.robots)
    },
    analytics: {
      provider: normalizeAnalyticsProvider(analytics.provider),
      domain: stringValue(analytics.domain),
      scriptUrl: stringValue(analytics.scriptUrl),
      websiteId: stringValue(analytics.websiteId),
      customSnippet: stringValue(analytics.customSnippet)
    },
    deploy: {
      target: normalizeDeployTarget(deploy.target),
      projectName: stringValue(deploy.projectName),
      productionUrl: stringValue(deploy.productionUrl),
      notes: stringValue(deploy.notes)
    },
    embeds: {
      enabled: booleanValue(embeds.enabled, DEFAULT_PUBLISH_SITE_INTEGRATIONS.embeds.enabled),
      allowIframes: booleanValue(embeds.allowIframes, DEFAULT_PUBLISH_SITE_INTEGRATIONS.embeds.allowIframes),
      allowExternalMedia: booleanValue(embeds.allowExternalMedia, DEFAULT_PUBLISH_SITE_INTEGRATIONS.embeds.allowExternalMedia)
    },
    forms: {
      enabled: booleanValue(forms.enabled, DEFAULT_PUBLISH_SITE_INTEGRATIONS.forms.enabled),
      provider: normalizeFormProvider(forms.provider),
      formName: stringValue(forms.formName) || DEFAULT_PUBLISH_SITE_INTEGRATIONS.forms.formName,
      endpoint: stringValue(forms.endpoint),
      buttonLabel: stringValue(forms.buttonLabel) || DEFAULT_PUBLISH_SITE_INTEGRATIONS.forms.buttonLabel
    }
  }
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
    integrations: normalizePublishSiteIntegrations(raw.integrations),
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
  aiSettings: DEFAULT_SETTINGS.ai,
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
    const aiSettings = normalizeAISettings(settings.ai)
    set({
      theme: settings.theme,
      fontSize: settings.fontSize,
      lineWidth: settings.lineWidth,
      templatesFolder: settings.templatesFolder,
      dailyNotesFolder: settings.dailyNotesFolder,
      aiSettings,
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

  openMediaVault() {
    const { tabs } = get()
    const existing = tabs.find((t) => t.kind === 'media')
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    const tab: Tab = { id: newTabId(), kind: 'media', path: null, mode: 'edit' }
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
  setAISettings(aiSettings) {
    set({ aiSettings: normalizeAISettings(aiSettings) })
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
  if (tab.kind === 'media') return 'Media'
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
