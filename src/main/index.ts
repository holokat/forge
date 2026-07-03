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
  safeStorage,
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
import { execFile, spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import {
  DEFAULT_SETTINGS,
  type AgentAccessInfo,
  type AILoginProvider,
  type AISecretUpdate,
  type AISettings,
  type AIStatus,
  type AITextProvider,
  type AITextTaskRequest,
  type AITextTaskResult,
  type ImportedAttachment,
  type ImportedAttachmentKind,
  type ImportedFilePayload,
  type PublishVaultOptions,
  type ReleaseNotesInfo,
  type Settings,
  type ThemeMode,
  type UpdateStatus,
  type VaultData
} from '../shared/types'
import { MobileIngestServer } from './mobileIngest'

const MD_EXT = '.md'
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.bmp', '.tif', '.tiff', '.heic', '.heif'])
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.wav', '.aac', '.caf', '.ogg', '.oga', '.opus', '.flac', '.aif', '.aiff'])
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.ogv'])
const FILE_EXTS = new Set(['.pdf'])
const ASSET_EXTS = new Set([...IMAGE_EXTS, ...AUDIO_EXTS, ...VIDEO_EXTS, ...FILE_EXTS])

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

function normalizeAbsolutePath(targetPath: string): string {
  if (!targetPath || !path.isAbsolute(targetPath)) {
    throw new Error('Expected an absolute file path.')
  }
  const normalized = path.normalize(targetPath)
  if (!fsSync.existsSync(normalized)) {
    throw new Error(`File does not exist: ${normalized}`)
  }
  return normalized
}

async function publishVaultForDesktop(
  vault: string,
  outDir: string,
  options: PublishVaultOptions = {}
): Promise<{ outDir: string; files: number; notes: number }> {
  const publisherPath = app.isPackaged
    ? path.join(process.resourcesPath, 'scripts', 'lib', 'publisher.mjs')
    : path.join(app.getAppPath(), 'scripts', 'lib', 'publisher.mjs')

  const publisher = (await import(pathToFileURL(publisherPath).toString())) as {
    publishVault(options: {
      vault: string
      output: string
      title?: string
      description?: string
      theme?: string
      scopePath?: string
      clean?: boolean
      showTags?: boolean
      showBacklinks?: boolean
      integrations?: PublishVaultOptions['integrations']
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
    title: options.title || path.basename(vault),
    description: options.description,
    theme: options.theme,
    scopePath: options.scopePath,
    clean: options.clean ?? true,
    showTags: options.showTags,
    showBacklinks: options.showBacklinks,
    integrations: options.integrations
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
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      ai: { ...DEFAULT_SETTINGS.ai, ...(parsed.ai ?? {}) }
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

async function writeSettings(settings: Settings): Promise<void> {
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}

// ---------- AI helpers ----------

interface StoredAISecret {
  encrypted: string
  updatedAt: string
}

interface StoredAISecrets {
  version: 1
  openaiApiKey?: StoredAISecret
  anthropicApiKey?: StoredAISecret
}

interface CommandResult {
  stdout: string
  stderr: string
}

function aiSecretsPath(): string {
  return path.join(app.getPath('userData'), 'forge-ai-secrets.json')
}

async function readAISecrets(): Promise<StoredAISecrets> {
  try {
    const raw = await fs.readFile(aiSecretsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<StoredAISecrets>
    return { version: 1, ...parsed }
  } catch {
    return { version: 1 }
  }
}

async function writeAISecrets(secrets: StoredAISecrets): Promise<void> {
  await fs.writeFile(aiSecretsPath(), JSON.stringify(secrets, null, 2), { mode: 0o600 })
}

function safeStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

function encryptSecret(value: string): StoredAISecret {
  if (!safeStorageAvailable()) throw new Error('Encrypted key storage is not available on this Mac.')
  return {
    encrypted: safeStorage.encryptString(value).toString('base64'),
    updatedAt: new Date().toISOString()
  }
}

function decryptSecret(secret: StoredAISecret | undefined): string | null {
  if (!secret || !safeStorageAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(secret.encrypted, 'base64'))
  } catch {
    return null
  }
}

async function saveAISecrets(update: AISecretUpdate = {}): Promise<void> {
  const secrets = await readAISecrets()
  const openaiKey = update.openaiApiKey?.trim()
  const anthropicKey = update.anthropicApiKey?.trim()

  if (update.clearOpenAIKey) delete secrets.openaiApiKey
  if (update.clearAnthropicKey) delete secrets.anthropicApiKey
  if (openaiKey) secrets.openaiApiKey = encryptSecret(openaiKey)
  if (anthropicKey) secrets.anthropicApiKey = encryptSecret(anthropicKey)

  await writeAISecrets(secrets)
}

function execFileText(command: string, args: string[], timeout = 8_000): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: 'utf8', timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const wrapped = new Error(stderr || stdout || error.message) as Error & CommandResult
        wrapped.stdout = stdout
        wrapped.stderr = stderr
        reject(wrapped)
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

function spawnText(
  command: string,
  args: string[],
  input: string,
  options: { cwd?: string; timeout?: number } = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      reject(new Error('AI task timed out.'))
    }, options.timeout ?? 180_000)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(stderr || stdout || `Command exited with code ${code ?? 'unknown'}.`))
    })
    child.stdin.end(input)
  })
}

function homePath(...segments: string[]): string {
  return path.join(app.getPath('home'), ...segments)
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function cliCandidates(name: 'codex' | 'claude'): string[] {
  if (name === 'codex') {
    return uniqueValues([
      'codex',
      '/Applications/Codex.app/Contents/Resources/codex',
      '/opt/homebrew/bin/codex',
      '/usr/local/bin/codex',
      homePath('.local', 'bin', 'codex')
    ])
  }
  return uniqueValues([
    'claude',
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    homePath('.local', 'bin', 'claude')
  ])
}

async function findCLI(name: 'codex' | 'claude'): Promise<{ path: string | null; version: string | null }> {
  for (const candidate of cliCandidates(name)) {
    try {
      const result = await execFileText(candidate, ['--version'])
      const version = (result.stdout || result.stderr).trim() || null
      return { path: candidate, version }
    } catch {
      // Try the next known location.
    }
  }
  return { path: null, version: null }
}

async function codexStatus(): Promise<AIStatus['codex']> {
  const cli = await findCLI('codex')
  if (!cli.path) {
    return {
      installed: false,
      path: null,
      version: null,
      authenticated: false,
      detail: 'Codex CLI is not installed or is not on PATH.',
      setupCommand: 'codex login',
      docsUrl: 'https://developers.openai.com/codex/auth'
    }
  }

  try {
    const result = await execFileText(cli.path, ['login', 'status'])
    const detail = (result.stdout || result.stderr).trim() || 'Codex login status is available.'
    return {
      installed: true,
      path: cli.path,
      version: cli.version,
      authenticated: /logged in/i.test(detail),
      detail,
      setupCommand: 'codex login',
      docsUrl: 'https://developers.openai.com/codex/auth'
    }
  } catch (error) {
    return {
      installed: true,
      path: cli.path,
      version: cli.version,
      authenticated: false,
      detail: error instanceof Error ? error.message : 'Codex is installed but not logged in.',
      setupCommand: 'codex login',
      docsUrl: 'https://developers.openai.com/codex/auth'
    }
  }
}

async function claudeStatus(): Promise<AIStatus['claude']> {
  const cli = await findCLI('claude')
  return {
    installed: Boolean(cli.path),
    path: cli.path,
    version: cli.version,
    authenticated: cli.path ? null : false,
    detail: cli.path
      ? 'Claude Code is installed. Forge can help configure MCP, but does not proxy Claude.ai subscription credentials.'
      : 'Claude Code is not installed or is not on PATH.',
    setupCommand: 'claude',
    docsUrl: 'https://code.claude.com/docs/en/iam'
  }
}

async function getAIStatus(): Promise<AIStatus> {
  const [codex, claude, secrets] = await Promise.all([codexStatus(), claudeStatus(), readAISecrets()])
  const notes = [
    'Codex prompts run through the local Codex CLI, so ChatGPT subscription access comes from the user’s own Codex login.',
    'Claude.ai Free, Pro, and Max credentials cannot be routed through third-party apps. Use an Anthropic API key for direct Forge prompting, or use Claude Code with Forge MCP.'
  ]
  if (!safeStorageAvailable()) {
    notes.push('Encrypted key storage is unavailable. API keys cannot be saved on this device until OS key storage is available.')
  }

  return {
    safeStorageAvailable: safeStorageAvailable(),
    codex,
    claude,
    openai: {
      configured: Boolean(secrets.openaiApiKey),
      updatedAt: secrets.openaiApiKey?.updatedAt ?? null
    },
    anthropic: {
      configured: Boolean(secrets.anthropicApiKey),
      updatedAt: secrets.anthropicApiKey?.updatedAt ?? null
    },
    notes
  }
}

async function saveAISettings(settings: AISettings, secrets?: AISecretUpdate): Promise<AIStatus> {
  const current = await readSettings()
  await writeSettings({ ...current, ai: { ...DEFAULT_SETTINGS.ai, ...settings } })
  if (secrets) await saveAISecrets(secrets)
  return getAIStatus()
}

function providerModel(settings: AISettings, provider: AITextProvider, override?: string): string {
  const requested = override?.trim()
  if (requested) return requested
  if (provider === 'codex') return settings.codexModel.trim()
  if (provider === 'anthropic') return settings.anthropicModel.trim() || DEFAULT_SETTINGS.ai.anthropicModel
  return settings.openaiModel.trim() || DEFAULT_SETTINGS.ai.openaiModel
}

function buildAITextPrompt(request: AITextTaskRequest): string {
  const parts = [
    'You are Forge AI, a local-first Markdown assistant inside the Forge desktop app.',
    'Return useful Markdown or plain text only. Do not describe hidden reasoning.',
    '',
    'User request:',
    request.prompt.trim()
  ]

  if (request.documentContent?.trim()) {
    parts.push(
      '',
      `Active note${request.documentPath ? ` (${request.documentPath})` : ''}:`,
      '```markdown',
      request.documentContent,
      '```'
    )
  }

  return parts.join('\n')
}

function recordText(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function extractOpenAIText(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const root = data as Record<string, unknown>
  const direct = recordText(root, ['output_text', 'text'])
  if (direct) return direct

  const output = root.output
  if (!Array.isArray(output)) return ''
  const parts: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const itemRecord = item as Record<string, unknown>
    const itemText = recordText(itemRecord, ['output_text', 'text'])
    if (itemText) parts.push(itemText)
    const content = itemRecord.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      const blockText = recordText(block as Record<string, unknown>, ['text', 'output_text'])
      if (blockText) parts.push(blockText)
    }
  }
  return parts.join('\n').trim()
}

function extractAnthropicText(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const root = data as Record<string, unknown>
  const content = root.content
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => (block && typeof block === 'object' ? recordText(block as Record<string, unknown>, ['text']) : null))
    .filter((value): value is string => Boolean(value))
    .join('\n')
    .trim()
}

function apiErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback
  const error = (data as Record<string, unknown>).error
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

async function runOpenAITextTask(model: string, prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: prompt
    })
  })
  const data = (await response.json().catch(() => null)) as unknown
  if (!response.ok) throw new Error(apiErrorMessage(data, `OpenAI request failed with status ${response.status}.`))
  const output = extractOpenAIText(data)
  if (!output) throw new Error('OpenAI returned no text output.')
  return output
}

async function runAnthropicTextTask(model: string, prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    })
  })
  const data = (await response.json().catch(() => null)) as unknown
  if (!response.ok) throw new Error(apiErrorMessage(data, `Anthropic request failed with status ${response.status}.`))
  const output = extractAnthropicText(data)
  if (!output) throw new Error('Anthropic returned no text output.')
  return output
}

async function runCodexTextTask(model: string, prompt: string, vault?: string | null): Promise<string> {
  const status = await codexStatus()
  if (!status.path) throw new Error('Codex CLI is not installed.')
  if (status.authenticated === false) throw new Error('Codex CLI is not logged in. Run `codex login` first.')

  const args = [
    'exec',
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--ask-for-approval',
    'never',
    '--color',
    'never'
  ]
  if (model) args.push('--model', model)
  args.push('-')

  const cwd = vault && path.isAbsolute(vault) && fsSync.existsSync(vault) ? vault : app.getPath('home')
  const result = await spawnText(status.path, args, prompt, { cwd })
  const output = result.stdout.trim()
  if (!output) throw new Error(result.stderr.trim() || 'Codex returned no text output.')
  return output
}

async function runAITextTask(request: AITextTaskRequest): Promise<AITextTaskResult> {
  const settings = (await readSettings()).ai
  const secrets = await readAISecrets()
  const provider = request.provider
  const model = providerModel(settings, provider, request.model)
  const prompt = buildAITextPrompt(request)
  let output = ''

  if (provider === 'codex') {
    output = await runCodexTextTask(model, prompt, request.vault)
  } else if (provider === 'openai') {
    const apiKey = decryptSecret(secrets.openaiApiKey)
    if (!apiKey) throw new Error('Save an OpenAI API key before running OpenAI tasks.')
    output = await runOpenAITextTask(model, prompt, apiKey)
  } else {
    const apiKey = decryptSecret(secrets.anthropicApiKey)
    if (!apiKey) throw new Error('Save an Anthropic API key before running Anthropic tasks.')
    output = await runAnthropicTextTask(model, prompt, apiKey)
  }

  return { provider, model: model || null, output }
}

function terminalCommandScript(command: string): string {
  return `tell application "Terminal" to do script ${JSON.stringify(command)}`
}

async function openAIProviderLogin(provider: AILoginProvider): Promise<void> {
  const command = provider === 'codex' ? 'codex login' : 'claude'
  await execFileText('/usr/bin/osascript', ['-e', terminalCommandScript(command), '-e', 'tell application "Terminal" to activate'])
}

// ---------- vault helpers ----------

function safeJoin(vault: string, rel: string): string {
  const abs = path.resolve(vault, rel)
  if (abs !== vault && !abs.startsWith(vault + path.sep)) {
    throw new Error(`Path escapes vault: ${rel}`)
  }
  return abs
}

function slash(value: string): string {
  return value.split(path.sep).join('/')
}

function sanitizeFileName(name: string): string {
  const ext = path.extname(name)
  const stem = path.basename(name, ext)
  const cleanStem = stem
    .normalize('NFKD')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96)
  const cleanExt = ext.replace(/[^\w.]/g, '').slice(0, 16)
  return `${cleanStem || 'Attachment'}${cleanExt}`
}

function attachmentKind(ext: string): ImportedAttachmentKind {
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (VIDEO_EXTS.has(ext)) return 'video'
  return 'file'
}

async function exists(abs: string): Promise<boolean> {
  return fs.access(abs).then(
    () => true,
    () => false
  )
}

async function uniqueVaultRel(vault: string, rel: string): Promise<string> {
  const parsed = path.posix.parse(rel)
  let candidate = rel
  let n = 1
  while (await exists(safeJoin(vault, candidate))) {
    candidate = path.posix.join(parsed.dir, `${parsed.name} ${n}${parsed.ext}`)
    n += 1
  }
  return candidate
}

async function importAttachments(
  vault: string,
  noteRel: string,
  sourcePaths: string[]
): Promise<ImportedAttachment[]> {
  suppressWatchUntil = Date.now() + 1200
  const noteStem = sanitizeFileName(path.basename(noteRel, path.extname(noteRel))).replace(/\.[^.]+$/, '')
  const targetDir = path.posix.join('Attachments', noteStem || 'Note')
  const imported: ImportedAttachment[] = []

  for (const rawSource of sourcePaths) {
    const sourcePath = path.resolve(rawSource)
    const stat = await fs.stat(sourcePath).catch(() => null)
    if (!stat?.isFile()) continue

    const ext = path.extname(sourcePath).toLowerCase()
    if (!ASSET_EXTS.has(ext)) continue

    const rel = await uniqueVaultRel(vault, path.posix.join(targetDir, sanitizeFileName(path.basename(sourcePath))))
    const abs = safeJoin(vault, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.copyFile(sourcePath, abs)
    imported.push({
      sourcePath,
      path: slash(rel),
      name: path.basename(rel),
      kind: attachmentKind(ext)
    })
  }

  return imported
}

function payloadBuffer(payload: ImportedFilePayload): Buffer {
  return Buffer.from(payload.bytes)
}

async function importAttachmentFiles(
  vault: string,
  noteRel: string,
  files: ImportedFilePayload[]
): Promise<ImportedAttachment[]> {
  suppressWatchUntil = Date.now() + 1200
  const noteStem = sanitizeFileName(path.basename(noteRel, path.extname(noteRel))).replace(/\.[^.]+$/, '')
  const targetDir = path.posix.join('Attachments', noteStem || 'Note')
  const imported: ImportedAttachment[] = []

  for (const file of files) {
    const name = sanitizeFileName(file.name)
    const ext = path.extname(name).toLowerCase()
    if (!ASSET_EXTS.has(ext)) continue

    const rel = await uniqueVaultRel(vault, path.posix.join(targetDir, name))
    const abs = safeJoin(vault, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, payloadBuffer(file))
    imported.push({
      sourcePath: file.name,
      path: slash(rel),
      name: path.basename(rel),
      kind: attachmentKind(ext)
    })
  }

  return imported
}

function mediaFolderForKind(kind: ImportedAttachmentKind): string {
  if (kind === 'image') return 'Media/Images'
  if (kind === 'audio') return 'Media/Audio'
  if (kind === 'video') return 'Media/Video'
  return 'Media/Files'
}

async function importMedia(vault: string, sourcePaths: string[]): Promise<ImportedAttachment[]> {
  suppressWatchUntil = Date.now() + 1200
  const imported: ImportedAttachment[] = []

  for (const rawSource of sourcePaths) {
    const sourcePath = path.resolve(rawSource)
    const stat = await fs.stat(sourcePath).catch(() => null)
    if (!stat?.isFile()) continue

    const ext = path.extname(sourcePath).toLowerCase()
    if (!ASSET_EXTS.has(ext)) continue

    const kind = attachmentKind(ext)
    const rel = await uniqueVaultRel(vault, path.posix.join(mediaFolderForKind(kind), sanitizeFileName(path.basename(sourcePath))))
    const abs = safeJoin(vault, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.copyFile(sourcePath, abs)
    imported.push({
      sourcePath,
      path: slash(rel),
      name: path.basename(rel),
      kind
    })
  }

  return imported
}

async function importMediaFiles(vault: string, files: ImportedFilePayload[]): Promise<ImportedAttachment[]> {
  suppressWatchUntil = Date.now() + 1200
  const imported: ImportedAttachment[] = []

  for (const file of files) {
    const name = sanitizeFileName(file.name)
    const ext = path.extname(name).toLowerCase()
    if (!ASSET_EXTS.has(ext)) continue

    const kind = attachmentKind(ext)
    const rel = await uniqueVaultRel(vault, path.posix.join(mediaFolderForKind(kind), name))
    const abs = safeJoin(vault, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, payloadBuffer(file))
    imported.push({
      sourcePath: file.name,
      path: slash(rel),
      name: path.basename(rel),
      kind
    })
  }

  return imported
}

async function scanVault(vault: string): Promise<VaultData> {
  const files: string[] = []
  const folders: string[] = []
  const contents: Record<string, string> = {}
  const fileStats: VaultData['fileStats'] = {}

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const abs = path.join(dir, entry.name)
      const rel = slash(path.relative(vault, abs))
      if (entry.isDirectory()) {
        folders.push(rel)
        await walk(abs)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        const stat = await fs.stat(abs)
        if (ext === MD_EXT) {
          files.push(rel)
          fileStats[rel] = { size: stat.size, modified: stat.mtime.toISOString() }
          try {
            contents[rel] = await fs.readFile(abs, 'utf8')
          } catch {
            contents[rel] = ''
          }
        } else if (ASSET_EXTS.has(ext)) {
          files.push(rel)
          fileStats[rel] = { size: stat.size, modified: stat.mtime.toISOString() }
        }
      }
    }
  }

  await walk(vault)
  files.sort((a, b) => a.localeCompare(b))
  folders.sort((a, b) => a.localeCompare(b))
  return { files, folders, contents, fileStats }
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

  ipcMain.handle('file:importAttachments', (_e, vault: string, noteRel: string, sourcePaths: string[]) => {
    return importAttachments(vault, noteRel, sourcePaths)
  })

  ipcMain.handle('file:importAttachmentFiles', (_e, vault: string, noteRel: string, files: ImportedFilePayload[]) => {
    return importAttachmentFiles(vault, noteRel, files)
  })

  ipcMain.handle('file:importMedia', (_e, vault: string, sourcePaths: string[]) => {
    return importMedia(vault, sourcePaths)
  })

  ipcMain.handle('file:importMediaFiles', (_e, vault: string, files: ImportedFilePayload[]) => {
    return importMediaFiles(vault, files)
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

  ipcMain.handle('file:revealPath', async (_e, targetPath: string) => {
    shell.showItemInFolder(normalizeAbsolutePath(targetPath))
  })

  ipcMain.handle('file:openPath', async (_e, targetPath: string) => {
    const error = await shell.openPath(normalizeAbsolutePath(targetPath))
    if (error) throw new Error(error)
  })

  ipcMain.handle('settings:read', () => readSettings())
  ipcMain.handle('settings:write', (_e, s: Settings) => writeSettings(s))
  ipcMain.handle('agent:getAccessInfo', () => getAgentAccessInfo())
  ipcMain.handle('ai:getStatus', () => getAIStatus())
  ipcMain.handle('ai:saveSettings', (_e, settings: AISettings, secrets?: AISecretUpdate) => saveAISettings(settings, secrets))
  ipcMain.handle('ai:runTextTask', (_e, request: AITextTaskRequest) => runAITextTask(request))
  ipcMain.handle('ai:openProviderLogin', (_e, provider: AILoginProvider) => openAIProviderLogin(provider))
  ipcMain.handle('clipboard:writeText', (_e, text: string) => clipboard.writeText(text))
  ipcMain.handle('vault:publish', (_e, vault: string, outDir: string, options?: PublishVaultOptions) =>
    publishVaultForDesktop(vault, outDir, options)
  )
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
