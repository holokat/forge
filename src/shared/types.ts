export type ThemeMode = 'light' | 'dark' | 'system'

export interface VaultFileStat {
  size: number
  modified: string
}

export interface VaultData {
  /** All non-hidden files in the vault, as relative paths */
  files: string[]
  /** All folders, as relative paths */
  folders: string[]
  /** Contents of every markdown file, keyed by relative path */
  contents: Record<string, string>
  /** File metadata keyed by relative path */
  fileStats: Record<string, VaultFileStat>
}

export interface Settings {
  theme: ThemeMode
  lastVault: string | null
  recentVaults: string[]
  fontSize: number
  lineWidth: number
  templatesFolder: string
  dailyNotesFolder: string
  bookmarks: Record<string, string[]>
  pinnedFolders: Record<string, string[]>
  publishSites: Record<string, PublishSiteConfig[]>
  enabledExtensions: string[]
  extensionSettings: ExtensionSettings
}

export type PublishSiteTheme =
  | 'minimal'
  | 'editorial'
  | 'reference'
  | 'quiet-paper'
  | 'terminal-ledger'
  | 'swiss-ledger'
  | 'soft-focus'
  | 'field-notes'

export type PublishSiteScope =
  | { kind: 'vault' }
  | { kind: 'folder'; folder: string }

export interface PublishSiteOptions {
  clean: boolean
  showTags: boolean
  showBacklinks: boolean
}

export type PublishAnalyticsProvider = 'none' | 'plausible' | 'umami' | 'custom'
export type PublishDeployTarget = 'manual' | 'github-pages' | 'cloudflare-pages' | 'netlify' | 'vercel' | 's3-r2' | 'ipfs'
export type PublishFormProvider = 'none' | 'netlify' | 'formspree' | 'custom'

export interface PublishSeoRssConfig {
  enabled: boolean
  siteUrl: string
  socialImage: string
  rss: boolean
  sitemap: boolean
  robots: boolean
}

export interface PublishAnalyticsConfig {
  provider: PublishAnalyticsProvider
  domain: string
  scriptUrl: string
  websiteId: string
  customSnippet: string
}

export interface PublishDeployConfig {
  target: PublishDeployTarget
  projectName: string
  productionUrl: string
  notes: string
}

export interface PublishEmbedsConfig {
  enabled: boolean
  allowIframes: boolean
  allowExternalMedia: boolean
}

export interface PublishFormsConfig {
  enabled: boolean
  provider: PublishFormProvider
  formName: string
  endpoint: string
  buttonLabel: string
}

export interface PublishSiteIntegrations {
  seoRss: PublishSeoRssConfig
  analytics: PublishAnalyticsConfig
  deploy: PublishDeployConfig
  embeds: PublishEmbedsConfig
  forms: PublishFormsConfig
}

export interface PublishSiteConfig {
  id: string
  name: string
  description: string
  theme: PublishSiteTheme
  scope: PublishSiteScope
  outputDir: string
  options: PublishSiteOptions
  integrations: PublishSiteIntegrations
  createdAt: string
  updatedAt: string
}

export interface PublishVaultOptions {
  title?: string
  description?: string
  theme?: PublishSiteTheme
  scopePath?: string
  clean?: boolean
  showTags?: boolean
  showBacklinks?: boolean
  integrations?: PublishSiteIntegrations
}

export const DEFAULT_PUBLISH_SITE_INTEGRATIONS: PublishSiteIntegrations = {
  seoRss: {
    enabled: true,
    siteUrl: '',
    socialImage: '',
    rss: true,
    sitemap: true,
    robots: true
  },
  analytics: {
    provider: 'none',
    domain: '',
    scriptUrl: '',
    websiteId: '',
    customSnippet: ''
  },
  deploy: {
    target: 'manual',
    projectName: '',
    productionUrl: '',
    notes: ''
  },
  embeds: {
    enabled: true,
    allowIframes: false,
    allowExternalMedia: true
  },
  forms: {
    enabled: false,
    provider: 'none',
    formName: 'contact',
    endpoint: '',
    buttonLabel: 'Send'
  }
}

export interface ExtensionInstallPreference {
  installed: boolean
  enabled: boolean
  installedAt: string | null
  updatedAt: string | null
}

export interface ExtensionSettings {
  schemaVersion: 1
  registry: 'local'
  entries: Record<string, ExtensionInstallPreference>
}

export interface MobilePairingInfo {
  available: boolean
  reason?: string
  baseUrl?: string
  /** Additional reachable base URLs (e.g. a Tailscale address) */
  altUrls?: string[]
  /** True when a Tailscale/tailnet address was detected */
  hasTailscale?: boolean
  pairingUrl?: string
  port?: number
  host?: string
  desktopName?: string
  vaultName?: string
}

export interface AgentCommandInfo {
  command: string
  args: string[]
}

export interface AgentAccessInfo {
  mode: 'packaged' | 'source'
  cli: AgentCommandInfo
  mcp: AgentCommandInfo
}

export type ImportedAttachmentKind = 'image' | 'audio' | 'video' | 'file'

export interface ImportedAttachment {
  sourcePath: string
  path: string
  name: string
  kind: ImportedAttachmentKind
}

export type UpdateState =
  | 'idle'
  | 'disabled'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error'

export interface ReleaseNotesInfo {
  version: string
  releaseName?: string | null
  releaseNotes?: string | null
}

export interface UpdateStatus {
  state: UpdateState
  currentVersion: string
  version?: string
  releaseName?: string | null
  releaseNotes?: string | null
  releaseDate?: string | null
  progress?: number | null
  message?: string | null
  canInstall?: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  lastVault: null,
  recentVaults: [],
  fontSize: 16,
  lineWidth: 700,
  templatesFolder: 'Templates',
  dailyNotesFolder: 'Daily',
  bookmarks: {},
  pinnedFolders: {},
  publishSites: {},
  enabledExtensions: [],
  extensionSettings: {
    schemaVersion: 1,
    registry: 'local',
    entries: {}
  }
}

export interface ForgeAPI {
  selectVault(): Promise<string | null>
  openVault(vault: string): Promise<VaultData>
  readFile(vault: string, rel: string): Promise<string>
  writeFile(vault: string, rel: string, content: string): Promise<void>
  createFile(vault: string, rel: string, content: string): Promise<string>
  rename(vault: string, oldRel: string, newRel: string): Promise<void>
  trash(vault: string, rel: string): Promise<void>
  createFolder(vault: string, rel: string): Promise<void>
  reveal(vault: string, rel: string): Promise<void>
  readSettings(): Promise<Settings>
  writeSettings(settings: Settings): Promise<void>
  getAgentAccessInfo(): Promise<AgentAccessInfo>
  copyText(text: string): Promise<void>
  getMobilePairingInfo(): Promise<MobilePairingInfo>
  resetMobilePairingToken(): Promise<MobilePairingInfo>
  setMobileVault(vault: string | null): Promise<void>
  droppedFilePaths(files: unknown[]): string[]
  importAttachments(vault: string, noteRel: string, sourcePaths: string[]): Promise<ImportedAttachment[]>
  importMedia(vault: string, sourcePaths: string[]): Promise<ImportedAttachment[]>
  publishVault(vault: string, outDir: string, options?: PublishVaultOptions): Promise<{ outDir: string; files: number; notes: number }>
  getUpdateStatus(): Promise<UpdateStatus>
  checkForUpdates(): Promise<UpdateStatus>
  installUpdate(): Promise<void>
  consumePendingReleaseNotes(): Promise<ReleaseNotesInfo | null>
  onUpdateStatus(cb: (status: UpdateStatus) => void): () => void
  setThemeSource(mode: ThemeMode): Promise<void>
  watchVault(vault: string): Promise<void>
  onVaultChanged(cb: () => void): () => void
  /** Absolute-path asset URL usable in <img src> */
  assetUrl(vault: string, rel: string): string
}

declare global {
  interface Window {
    forge: ForgeAPI
  }
}
