export type ThemeMode = 'light' | 'dark' | 'system'

export interface VaultData {
  /** All non-hidden files in the vault, as relative paths */
  files: string[]
  /** All folders, as relative paths */
  folders: string[]
  /** Contents of every markdown file, keyed by relative path */
  contents: Record<string, string>
}

export interface Settings {
  theme: ThemeMode
  lastVault: string | null
  recentVaults: string[]
  fontSize: number
  lineWidth: number
  templatesFolder: string
  dailyNotesFolder: string
  enabledExtensions: string[]
  extensionSettings: ExtensionSettings
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
  publishVault(vault: string, outDir: string): Promise<{ outDir: string; files: number; notes: number }>
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
