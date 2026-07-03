import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  net,
  protocol,
  shell
} from 'electron'
import {
  autoUpdater,
  type ProgressInfo,
  type UpdateDownloadedEvent,
  type UpdateInfo
} from 'electron-updater'
import path from 'node:path'
import fs from 'node:fs/promises'
import fsSync, { type FSWatcher } from 'node:fs'
import { pathToFileURL } from 'node:url'
import {
  DEFAULT_SETTINGS,
  type AgentAccessInfo,
  type ReleaseNotesInfo,
  type Settings,
  type ThemeMode,
  type UpdateStatus,
  type VaultData
} from '../shared/types'
import { MobileIngestServer } from './mobileIngest'

const MD_EXT = '.md'
const ASSET_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.pdf',
  '.mp3', '.mp4', '.m4a', '.wav', '.aac', '.caf', '.ogg'
])

let mainWindow: BrowserWindow | null = null
let watcher: FSWatcher | null = null
let suppressWatchUntil = 0
let updaterConfigured = false
let updateStatus: UpdateStatus = {
  state: 'idle',
  currentVersion: app.getVersion(),
  progress: null,
  message: null,
  canInstall: false
}
const mobileIngest = new MobileIngestServer({
  onVaultChanged: () => mainWindow?.webContents.send('vault:changed')
})

function getAppIcon(): Electron.NativeImage | undefined {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(app.getAppPath(), 'build', 'icon.png')

  if (!fsSync.existsSync(iconPath)) return undefined
  const icon = nativeImage.createFromPath(iconPath)
  return icon.isEmpty() ? undefined : icon
}

function getAgentAccessInfo(): AgentAccessInfo {
  if (app.isPackaged) {
    return {
      mode: 'packaged',
      cli: { command: path.join(process.resourcesPath, 'bin', 'forge'), args: [] },
      mcp: { command: path.join(process.resourcesPath, 'bin', 'forge-mcp'), args: [] }
    }
  }

  const appPath = app.getAppPath()
  return {
    mode: 'source',
    cli: { command: 'node', args: [path.join(appPath, 'scripts', 'forge-agent.mjs')] },
    mcp: { command: 'node', args: [path.join(appPath, 'scripts', 'forge-mcp.mjs')] }
  }
}

async function publishVaultForDesktop(vault: string, outDir: string): Promise<{ outDir: string; files: number; notes: number }> {
  const publisherPath = app.isPackaged
    ? path.join(process.resourcesPath, 'scripts', 'lib', 'publisher.mjs')
    : path.join(app.getAppPath(), 'scripts', 'lib', 'publisher.mjs')

  const publisher = (await import(pathToFileURL(publisherPath).toString())) as {
    publishVault(options: {
      vault: string
      output: string
      title?: string
      clean?: boolean
    }): Promise<{
      output: string
      totals: { notes: number }
      written: string[]
      copied: string[]
    }>
  }

  const result = await publisher.publishVault({
    vault,
    output: outDir,
    title: path.basename(vault),
    clean: true
  })

  return {
    outDir: result.output,
    files: result.written.length + result.copied.length,
    notes: result.totals.notes
  }
}

// ---------- updates ----------

function pendingReleaseNotesPath(): string {
  return path.join(app.getPath('userData'), 'pending-release-notes.json')
}

function normalizeReleaseNotes(notes: UpdateInfo['releaseNotes']): string | null {
  if (!notes) return null
  if (typeof notes === 'string') return notes.trim() || null
  const rendered = notes
    .map((entry) => [`## ${entry.version}`, entry.note ?? ''].filter(Boolean).join('\n\n'))
    .join('\n\n')
    .trim()
  return rendered || null
}

function updateDetails(info: UpdateInfo): Pick<UpdateStatus, 'version' | 'releaseName' | 'releaseNotes' | 'releaseDate'> {
  return {
    version: info.version,
    releaseName: info.releaseName ?? null,
    releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    releaseDate: info.releaseDate ?? null
  }
}

function setUpdateStatus(next: Partial<UpdateStatus>): UpdateStatus {
  updateStatus = {
    ...updateStatus,
    currentVersion: app.getVersion(),
    ...next
  }
  mainWindow?.webContents.send('updates:status', updateStatus)
  return updateStatus
}

async function savePendingReleaseNotes(info: UpdateInfo): Promise<void> {
  const pending: ReleaseNotesInfo = {
    version: info.version,
    releaseName: info.releaseName ?? null,
    releaseNotes: normalizeReleaseNotes(info.releaseNotes)
  }
  await fs.writeFile(pendingReleaseNotesPath(), JSON.stringify(pending, null, 2), 'utf8')
}

async function consumePendingReleaseNotes(): Promise<ReleaseNotesInfo | null> {
  try {
    const raw = await fs.readFile(pendingReleaseNotesPath(), 'utf8')
    const pending = JSON.parse(raw) as ReleaseNotesInfo
    if (pending.version !== app.getVersion()) return null
    await fs.unlink(pendingReleaseNotesPath()).catch(() => undefined)
    return pending
  } catch {
    return null
  }
}

function configureAutoUpdater(): void {
  if (updaterConfigured) return
  updaterConfigured = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.fullChangelog = true
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => {
    setUpdateStatus({
      state: 'checking',
      progress: null,
      message: 'Checking for updates...',
      canInstall: false
    })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    setUpdateStatus({
      state: 'available',
      ...updateDetails(info),
      progress: null,
      message: `Downloading Forge ${info.version}...`,
      canInstall: false
    })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setUpdateStatus({
      state: 'downloading',
      progress: Math.max(0, Math.min(100, progress.percent)),
      message: `Downloading update (${Math.round(progress.percent)}%)`,
      canInstall: false
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateDownloadedEvent) => {
    savePendingReleaseNotes(info).catch((error) => console.error('Failed to save pending release notes.', error))
    setUpdateStatus({
      state: 'downloaded',
      ...updateDetails(info),
      progress: 100,
      message: `Forge ${info.version} is ready to install.`,
      canInstall: true
    })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    setUpdateStatus({
      state: 'not-available',
      ...updateDetails(info),
      progress: null,
      message: 'Forge is up to date.',
      canInstall: false
    })
  })

  autoUpdater.on('error', (error: Error) => {
    setUpdateStatus({
      state: 'error',
      progress: null,
      message: error.message,
      canInstall: false
    })
  })
}

async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged && process.env.FORGE_FORCE_UPDATE_CHECK !== '1') {
    return setUpdateStatus({
      state: 'disabled',
      progress: null,
      message: 'Updates are available in packaged builds.',
      canInstall: false
    })
  }

  try {
    configureAutoUpdater()
    await autoUpdater.checkForUpdates()
    return updateStatus
  } catch (error) {
    return setUpdateStatus({
      state: 'error',
      progress: null,
      message: error instanceof Error ? error.message : String(error),
      canInstall: false
    })
  }
}

function installDownloadedUpdate(): void {
  if (!updateStatus.canInstall) throw new Error('No downloaded update is ready to install.')
  autoUpdater.quitAndInstall(false, true)
}

// ---------- settings ----------

const settingsPath = (): string => path.join(app.getPath('userData'), 'forge-settings.json')

async function readSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

async function writeSettings(settings: Settings): Promise<void> {
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}

// ---------- vault helpers ----------

function safeJoin(vault: string, rel: string): string {
  const abs = path.resolve(vault, rel)
  if (abs !== vault && !abs.startsWith(vault + path.sep)) {
    throw new Error(`Path escapes vault: ${rel}`)
  }
  return abs
}

async function scanVault(vault: string): Promise<VaultData> {
  const files: string[] = []
  const folders: string[] = []
  const contents: Record<string, string> = {}

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const abs = path.join(dir, entry.name)
      const rel = path.relative(vault, abs)
      if (entry.isDirectory()) {
        folders.push(rel)
        await walk(abs)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (ext === MD_EXT) {
          files.push(rel)
          try {
            contents[rel] = await fs.readFile(abs, 'utf8')
          } catch {
            contents[rel] = ''
          }
        } else if (ASSET_EXTS.has(ext)) {
          files.push(rel)
        }
      }
    }
  }

  await walk(vault)
  files.sort((a, b) => a.localeCompare(b))
  folders.sort((a, b) => a.localeCompare(b))
  return { files, folders, contents }
}

function startWatching(vault: string): void {
  watcher?.close()
  watcher = null
  let timer: NodeJS.Timeout | null = null
  try {
    watcher = fsSync.watch(vault, { recursive: true }, (_event, filename) => {
      if (!filename || String(filename).split(path.sep).some((p) => p.startsWith('.'))) return
      if (Date.now() < suppressWatchUntil) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => mainWindow?.webContents.send('vault:changed'), 400)
    })
  } catch (err) {
    console.error('watch failed', err)
  }
}

// ---------- window ----------

function createWindow(): void {
  const icon = getAppIcon()

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 760,
    minHeight: 500,
    icon,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 15 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0e0e11' : '#f7f7f8',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// ---------- ipc ----------

function registerIpc(): void {
  ipcMain.handle('dialog:selectVault', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open vault',
      buttonLabel: 'Open as vault',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('vault:open', async (_e, vault: string) => {
    const stat = await fs.stat(vault)
    if (!stat.isDirectory()) throw new Error('Not a directory')
    return scanVault(vault)
  })

  ipcMain.handle('vault:watch', async (_e, vault: string) => {
    mobileIngest.setVault(vault)
    startWatching(vault)
  })

  ipcMain.handle('file:read', async (_e, vault: string, rel: string) => {
    return fs.readFile(safeJoin(vault, rel), 'utf8')
  })

  ipcMain.handle('file:write', async (_e, vault: string, rel: string, content: string) => {
    suppressWatchUntil = Date.now() + 1200
    const abs = safeJoin(vault, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, content, 'utf8')
  })

  ipcMain.handle('file:create', async (_e, vault: string, rel: string, content: string) => {
    suppressWatchUntil = Date.now() + 1200
    const dir = path.dirname(rel)
    const ext = path.extname(rel)
    const base = path.basename(rel, ext)
    let candidate = rel
    let n = 1
    while (
      await fs.access(safeJoin(vault, candidate)).then(
        () => true,
        () => false
      )
    ) {
      candidate = path.join(dir, `${base} ${n}${ext}`)
      n += 1
    }
    const abs = safeJoin(vault, candidate)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, content, 'utf8')
    return candidate
  })

  ipcMain.handle('file:rename', async (_e, vault: string, oldRel: string, newRel: string) => {
    suppressWatchUntil = Date.now() + 1200
    const from = safeJoin(vault, oldRel)
    const to = safeJoin(vault, newRel)
    await fs.mkdir(path.dirname(to), { recursive: true })
    await fs.rename(from, to)
  })

  ipcMain.handle('file:trash', async (_e, vault: string, rel: string) => {
    suppressWatchUntil = Date.now() + 1200
    await shell.trashItem(safeJoin(vault, rel))
  })

  ipcMain.handle('folder:create', async (_e, vault: string, rel: string) => {
    suppressWatchUntil = Date.now() + 1200
    await fs.mkdir(safeJoin(vault, rel), { recursive: true })
  })

  ipcMain.handle('file:reveal', async (_e, vault: string, rel: string) => {
    shell.showItemInFolder(safeJoin(vault, rel))
  })

  ipcMain.handle('settings:read', () => readSettings())
  ipcMain.handle('settings:write', (_e, s: Settings) => writeSettings(s))
  ipcMain.handle('agent:getAccessInfo', () => getAgentAccessInfo())
  ipcMain.handle('clipboard:writeText', (_e, text: string) => clipboard.writeText(text))
  ipcMain.handle('vault:publish', (_e, vault: string, outDir: string) => publishVaultForDesktop(vault, outDir))
  ipcMain.handle('updates:getStatus', () => updateStatus)
  ipcMain.handle('updates:check', () => checkForUpdates())
  ipcMain.handle('updates:install', () => installDownloadedUpdate())
  ipcMain.handle('updates:consumePendingReleaseNotes', () => consumePendingReleaseNotes())
  ipcMain.handle('mobile:getPairingInfo', () => mobileIngest.getPairingInfo())
  ipcMain.handle('mobile:resetPairingToken', () => {
    mobileIngest.resetToken()
    return mobileIngest.getPairingInfo()
  })
  ipcMain.handle('mobile:setVault', (_e, vault: string | null) => mobileIngest.setVault(vault))

  ipcMain.handle('theme:setSource', (_e, mode: ThemeMode) => {
    nativeTheme.themeSource = mode
  })
}

// ---------- lifecycle ----------

protocol.registerSchemesAsPrivileged([
  { scheme: 'forge-asset', privileges: { secure: true, supportFetchAPI: true, stream: true } }
])

app.whenReady().then(() => {
  app.setName('Forge')
  const icon = getAppIcon()
  if (process.platform === 'darwin' && icon) app.dock.setIcon(icon)

  protocol.handle('forge-asset', (request) => {
    const url = new URL(request.url)
    const abs = decodeURIComponent(url.pathname.replace(/^\//, ''))
    return net.fetch(pathToFileURL('/' + abs).toString())
  })

  registerIpc()
  configureAutoUpdater()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
