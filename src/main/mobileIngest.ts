import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'

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

interface VoiceNotePayload {
  transcript?: string
  title?: string
  recordedAt?: string
  durationSeconds?: number
  deviceName?: string
  token?: string
  /** Base64-encoded audio file (no data: prefix) */
  audioBase64?: string
  /** Original file name; only the extension is used */
  audioFileName?: string
}

interface BuddyFolderPayload {
  path?: string
  name?: string
  newName?: string
}

interface BuddyNotePayload {
  path?: string
  folderPath?: string
  transcript?: string
  title?: string
  recordedAt?: string
  durationSeconds?: number
  deviceName?: string
  audioBase64?: string
  audioFileName?: string
}

interface BuddyFolder {
  path: string
  name: string
  noteCount: number
}

interface BuddyNote {
  path: string
  folderPath: string
  title: string
  transcript: string
  recordedAt: string | null
  durationSeconds: number | null
  audioPath: string | null
}

interface MobileIngestOptions {
  onVaultChanged(): void
}

const DEFAULT_PORT = 47873
// Large enough for a long voice memo (base64-encoded AAC)
const MAX_BODY_BYTES = 64 * 1024 * 1024
const AUDIO_EXTENSIONS = new Set(['m4a', 'mp3', 'wav', 'aac', 'caf', 'ogg'])

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export class MobileIngestServer {
  private server: http.Server | null = null
  private port = DEFAULT_PORT
  private token = createPairingToken()
  private vault: string | null = null

  constructor(private readonly options: MobileIngestOptions) {}

  setVault(vault: string | null): void {
    this.vault = vault
  }

  resetToken(): void {
    this.token = createPairingToken()
  }

  async getPairingInfo(): Promise<MobilePairingInfo> {
    if (!this.vault) return { available: false, reason: 'Open a vault before pairing Forge Buddy.' }
    await this.ensureServer()

    const { lan, tailscale } = classifyAddresses()
    const host = lan[0] ?? tailscale[0] ?? '127.0.0.1'
    const toUrl = (address: string): string => `http://${address}:${this.port}`
    const baseUrl = toUrl(host)
    // Tailscale (or any WireGuard tailnet) addresses keep working away from
    // home, so the phone can fail over to them when the LAN IP is unreachable.
    const altUrls = [...tailscale, ...lan.slice(1)].map(toUrl).filter((url) => url !== baseUrl)

    const desktopName = os.hostname()
    const params = new URLSearchParams({
      baseURL: baseUrl,
      token: this.token,
      desktop: desktopName
    })
    if (altUrls.length > 0) params.set('altURLs', altUrls.join(','))

    return {
      available: true,
      baseUrl,
      altUrls,
      hasTailscale: tailscale.length > 0,
      pairingUrl: `forge-buddy://pair?${params.toString()}`,
      port: this.port,
      host,
      desktopName,
      vaultName: path.basename(this.vault)
    }
  }

  private async ensureServer(): Promise<void> {
    if (this.server?.listening) return

    this.server = http.createServer((request, response) => {
      this.handleRequest(request, response).catch((error) => {
        if (error instanceof HttpError) {
          sendJson(response, error.status, { ok: false, error: error.message })
          return
        }
        console.error('mobile ingest request failed', error)
        sendJson(response, 500, { ok: false, error: 'Internal server error' })
      })
    })

    await listen(this.server, DEFAULT_PORT).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EADDRINUSE') throw error
      await listen(this.server!, 0)
    })

    const address = this.server.address()
    if (typeof address === 'object' && address) this.port = address.port
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }

    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { ok: true, app: 'Forge', vault: this.vault ? path.basename(this.vault) : null })
      return
    }

    if (url.pathname.startsWith('/api/buddy/')) {
      await this.handleBuddyRequest(request, response, url)
      return
    }

    if (request.method !== 'POST' || url.pathname !== '/api/mobile/voice-note') {
      sendJson(response, 404, { ok: false, error: 'Not found' })
      return
    }

    if (!this.vault) {
      sendJson(response, 409, { ok: false, error: 'No Forge vault is open on the desktop.' })
      return
    }

    const payload = JSON.parse(await readBody(request)) as VoiceNotePayload
    const token = parseBearerToken(request.headers.authorization) ?? payload.token
    if (token !== this.token) {
      sendJson(response, 401, { ok: false, error: 'Invalid pairing token.' })
      return
    }

    const transcript = payload.transcript?.trim()
    if (!transcript) {
      sendJson(response, 400, { ok: false, error: 'Transcript is required.' })
      return
    }

    const { notePath, audioPath } = await this.writeVoiceNote(payload, transcript)
    this.options.onVaultChanged()
    sendJson(response, 201, { ok: true, path: notePath, audioPath })
  }

  private async handleBuddyRequest(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL
  ): Promise<void> {
    if (!this.vault) {
      sendJson(response, 409, { ok: false, error: 'No Forge vault is open on the desktop.' })
      return
    }

    const body = request.method === 'GET' ? '' : await readBody(request)
    const payload = body ? JSON.parse(body) : {}
    const token = parseBearerToken(request.headers.authorization) ?? url.searchParams.get('token') ?? payload.token
    if (token !== this.token) {
      sendJson(response, 401, { ok: false, error: 'Invalid pairing token.' })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/buddy/audio') {
      await this.sendBuddyAudio(response, url.searchParams.get('path') ?? '')
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/buddy/snapshot') {
      sendJson(response, 200, { ok: true, ...(await this.getBuddySnapshot()) })
      return
    }

    if (request.method !== 'POST') {
      sendJson(response, 405, { ok: false, error: 'Method not allowed.' })
      return
    }

    switch (url.pathname) {
      case '/api/buddy/folders/create': {
        const result = await this.createBuddyFolder(payload as BuddyFolderPayload)
        this.options.onVaultChanged()
        sendJson(response, 201, { ok: true, folder: result })
        return
      }
      case '/api/buddy/folders/rename': {
        const result = await this.renameBuddyFolder(payload as BuddyFolderPayload)
        this.options.onVaultChanged()
        sendJson(response, 200, { ok: true, folder: result })
        return
      }
      case '/api/buddy/folders/delete': {
        await this.deleteBuddyFolder(payload as BuddyFolderPayload)
        this.options.onVaultChanged()
        sendJson(response, 200, { ok: true })
        return
      }
      case '/api/buddy/notes/create': {
        const result = await this.createBuddyNote(payload as BuddyNotePayload)
        this.options.onVaultChanged()
        sendJson(response, 201, { ok: true, note: result })
        return
      }
      case '/api/buddy/notes/update': {
        const result = await this.updateBuddyNote(payload as BuddyNotePayload)
        this.options.onVaultChanged()
        sendJson(response, 200, { ok: true, note: result })
        return
      }
      case '/api/buddy/notes/move': {
        const result = await this.moveBuddyNote(payload as BuddyNotePayload)
        this.options.onVaultChanged()
        sendJson(response, 200, { ok: true, note: result })
        return
      }
      case '/api/buddy/notes/delete': {
        await this.deleteBuddyNote(payload as BuddyNotePayload)
        this.options.onVaultChanged()
        sendJson(response, 200, { ok: true })
        return
      }
      default:
        sendJson(response, 404, { ok: false, error: 'Not found' })
    }
  }

  private async writeVoiceNote(
    payload: VoiceNotePayload,
    transcript: string
  ): Promise<{ notePath: string; audioPath: string | null }> {
    const recordedAt = payload.recordedAt ? new Date(payload.recordedAt) : new Date()
    const safeDate = Number.isNaN(recordedAt.getTime()) ? new Date() : recordedAt
    const title = payload.title?.trim() || `Voice Note ${formatDisplayDate(safeDate)}`
    const fileStem = sanitizeFileName(`${formatPathDate(safeDate)} ${title}`)
    const rel = await uniqueMarkdownPath(this.vault!, path.join('Inbox', 'Voice', `${fileStem}.md`))
    const abs = safeJoin(this.vault!, rel)

    const audioPath = await this.writeAudio(payload, path.parse(rel).name)

    const duration = typeof payload.durationSeconds === 'number' ? formatDuration(payload.durationSeconds) : null
    const source = payload.deviceName?.trim() || 'Forge Buddy for iOS'
    const markdown = [
      `# ${title}`,
      '',
      `- Recorded: ${safeDate.toISOString()}`,
      `- Source: ${source}`,
      duration ? `- Duration: ${duration}` : null,
      '- Tags: #voice',
      '',
      audioPath ? '## Audio' : null,
      audioPath ? '' : null,
      audioPath ? `![[${path.basename(audioPath)}]]` : null,
      audioPath ? '' : null,
      '## Transcript',
      '',
      transcript,
      ''
    ]
      .filter((line): line is string => line !== null)
      .join('\n')

    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, markdown, 'utf8')
    return { notePath: rel, audioPath }
  }

  private async writeAudio(payload: VoiceNotePayload, noteStem: string): Promise<string | null> {
    const base64 = payload.audioBase64?.trim()
    if (!base64) return null

    let audio: Buffer
    try {
      audio = Buffer.from(base64, 'base64')
    } catch {
      throw new Error('Audio payload is not valid base64.')
    }
    if (audio.length === 0) return null

    const rawExt = (payload.audioFileName ?? '').split('.').pop()?.toLowerCase() ?? ''
    const ext = AUDIO_EXTENSIONS.has(rawExt) ? rawExt : 'm4a'
    const rel = await uniqueMarkdownPath(this.vault!, path.join('Inbox', 'Voice', `${noteStem}.${ext}`))
    const abs = safeJoin(this.vault!, rel)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, audio)
    return rel
  }

  private async getBuddySnapshot(): Promise<{ folders: BuddyFolder[]; notes: BuddyNote[] }> {
    const vault = this.requireVault()
    const folders: string[] = []
    const notes: BuddyNote[] = []

    const walk = async (dirRel: string): Promise<void> => {
      const abs = safeJoin(vault, dirRel)
      const entries = await fs.readdir(abs, { withFileTypes: true })
      for (const entry of entries) {
        if (shouldSkipVaultEntry(entry.name)) continue
        const rel = dirRel ? path.join(dirRel, entry.name) : entry.name
        if (entry.isDirectory()) {
          folders.push(rel)
          await walk(rel)
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
          notes.push(await this.readBuddyNote(rel))
        }
      }
    }

    await walk('')
    const counts = new Map<string, number>()
    for (const note of notes) {
      let current = note.folderPath
      while (current) {
        counts.set(current, (counts.get(current) ?? 0) + 1)
        const parent = path.dirname(current)
        current = parent === '.' ? '' : parent
      }
    }

    return {
      folders: folders
        .map((folderPath) => ({
          path: folderPath,
          name: path.basename(folderPath),
          noteCount: counts.get(folderPath) ?? 0
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
      notes: notes.sort((a, b) => {
        const aTime = a.recordedAt ? Date.parse(a.recordedAt) : 0
        const bTime = b.recordedAt ? Date.parse(b.recordedAt) : 0
        return bTime - aTime || a.path.localeCompare(b.path)
      })
    }
  }

  private async createBuddyFolder(payload: BuddyFolderPayload): Promise<BuddyFolder> {
    const vault = this.requireVault()
    const name = sanitizePathSegment(payload.name)
    const parent = normalizeVaultRel(payload.path ?? '', { allowEmpty: true, expect: 'folder' })
    const rel = parent ? path.join(parent, name) : name
    await fs.mkdir(safeJoin(vault, rel), { recursive: false })
    return { path: rel, name: path.basename(rel), noteCount: 0 }
  }

  private async renameBuddyFolder(payload: BuddyFolderPayload): Promise<BuddyFolder> {
    const vault = this.requireVault()
    const rel = normalizeVaultRel(payload.path, { expect: 'folder' })
    const newName = sanitizePathSegment(payload.newName ?? payload.name)
    const parent = path.dirname(rel)
    const nextRel = parent === '.' ? newName : path.join(parent, newName)
    await fs.rename(safeJoin(vault, rel), safeJoin(vault, nextRel))
    const snapshot = await this.getBuddySnapshot()
    return snapshot.folders.find((folder) => folder.path === nextRel) ?? { path: nextRel, name: newName, noteCount: 0 }
  }

  private async deleteBuddyFolder(payload: BuddyFolderPayload): Promise<void> {
    const vault = this.requireVault()
    const rel = normalizeVaultRel(payload.path, { expect: 'folder' })
    await fs.rm(safeJoin(vault, rel), { recursive: true, force: true })
  }

  private async createBuddyNote(payload: BuddyNotePayload): Promise<BuddyNote> {
    const vault = this.requireVault()
    const transcript = payload.transcript?.trim() ?? ''
    const hasAudio = Boolean(payload.audioBase64?.trim())
    if (!transcript && !hasAudio) throw new HttpError(400, 'Transcript or audio is required.')

    const folderRel = normalizeVaultRel(payload.folderPath ?? '', { allowEmpty: true, expect: 'folder' })
    const recordedAt = parseInputDate(payload.recordedAt)
    const title = payload.title?.trim() || titleFromTranscript(transcript) || `Voice Note ${formatDisplayDate(recordedAt)}`
    const fileStem = sanitizeFileName(`${formatPathDate(recordedAt)} ${title}`)
    const noteRel = await uniqueVaultPath(vault, path.join(folderRel, `${fileStem}.md`))
    const noteStem = path.parse(noteRel).name
    const audioPath = await this.writeBuddyAudio(payload, path.dirname(noteRel), noteStem)
    const duration = typeof payload.durationSeconds === 'number' ? formatDuration(payload.durationSeconds) : null
    const source = payload.deviceName?.trim() || 'Forge Buddy for iOS'

    const markdown = [
      `# ${title}`,
      '',
      `- Recorded: ${recordedAt.toISOString()}`,
      `- Source: ${source}`,
      duration ? `- Duration: ${duration}` : null,
      '- Tags: #voice',
      '',
      audioPath ? '## Audio' : null,
      audioPath ? '' : null,
      audioPath ? `![[${path.basename(audioPath)}]]` : null,
      audioPath ? '' : null,
      '## Transcript',
      '',
      transcript,
      ''
    ]
      .filter((line): line is string => line !== null)
      .join('\n')

    await fs.mkdir(path.dirname(safeJoin(vault, noteRel)), { recursive: true })
    await fs.writeFile(safeJoin(vault, noteRel), markdown, 'utf8')
    return this.readBuddyNote(noteRel)
  }

  private async updateBuddyNote(payload: BuddyNotePayload): Promise<BuddyNote> {
    const vault = this.requireVault()
    const rel = normalizeVaultRel(payload.path, { expect: 'note' })
    const abs = safeJoin(vault, rel)
    let markdown = await fs.readFile(abs, 'utf8')

    if (payload.title?.trim()) {
      markdown = replaceMarkdownTitle(markdown, payload.title.trim())
    }
    if (payload.transcript !== undefined) {
      markdown = replaceTranscriptSection(markdown, payload.transcript.trim())
    }

    await fs.writeFile(abs, markdown, 'utf8')
    return this.readBuddyNote(rel)
  }

  private async moveBuddyNote(payload: BuddyNotePayload): Promise<BuddyNote> {
    const vault = this.requireVault()
    const rel = normalizeVaultRel(payload.path, { expect: 'note' })
    const folderRel = normalizeVaultRel(payload.folderPath, { allowEmpty: true, expect: 'folder' })
    const fromAbs = safeJoin(vault, rel)
    let markdown = await fs.readFile(fromAbs, 'utf8')
    await fs.mkdir(safeJoin(vault, folderRel), { recursive: true })

    const nextRel = await uniqueVaultPath(vault, path.join(folderRel, path.basename(rel)))
    const audioRef = extractAudioRef(markdown)
    if (audioRef) {
      const currentAudioRel = resolveWikiAssetRel(rel, audioRef)
      if (currentAudioRel && path.dirname(currentAudioRel) === path.dirname(rel)) {
        const nextAudioRel = await uniqueVaultPath(vault, path.join(folderRel, path.basename(currentAudioRel)))
        try {
          await fs.rename(safeJoin(vault, currentAudioRel), safeJoin(vault, nextAudioRel))
          markdown = markdown.replace(`![[${audioRef}]]`, `![[${path.basename(nextAudioRel)}]]`)
        } catch {
          // Keep the existing link when the media asset was already missing.
        }
      }
    }

    await fs.writeFile(safeJoin(vault, nextRel), markdown, 'utf8')
    await fs.rm(fromAbs, { force: true })
    return this.readBuddyNote(nextRel)
  }

  private async deleteBuddyNote(payload: BuddyNotePayload): Promise<void> {
    const vault = this.requireVault()
    const rel = normalizeVaultRel(payload.path, { expect: 'note' })
    const abs = safeJoin(vault, rel)
    const markdown = await fs.readFile(abs, 'utf8').catch(() => '')
    const audioRef = extractAudioRef(markdown)
    const audioRel = audioRef ? tryResolveWikiAssetRel(rel, audioRef) : null
    if (audioRel && path.dirname(audioRel) === path.dirname(rel)) {
      await fs.rm(safeJoin(vault, audioRel), { force: true }).catch(() => undefined)
    }
    await fs.rm(abs, { force: true })
  }

  private async readBuddyNote(rel: string): Promise<BuddyNote> {
    const vault = this.requireVault()
    const abs = safeJoin(vault, rel)
    const markdown = await fs.readFile(abs, 'utf8')
    const stat = await fs.stat(abs)
    const folderPath = path.dirname(rel) === '.' ? '' : path.dirname(rel)
    const recordedAt = extractRecordedAt(markdown) ?? stat.mtime.toISOString()
    const audioRef = extractAudioRef(markdown)
    const audioPath = audioRef ? tryResolveWikiAssetRel(rel, audioRef) : null

    return {
      path: rel,
      folderPath,
      title: extractTitle(markdown) ?? path.parse(rel).name,
      transcript: extractTranscript(markdown),
      recordedAt,
      durationSeconds: extractDurationSeconds(markdown),
      audioPath
    }
  }

  private async writeBuddyAudio(payload: BuddyNotePayload, folderRel: string, noteStem: string): Promise<string | null> {
    const vault = this.requireVault()
    const base64 = payload.audioBase64?.trim()
    if (!base64) return null

    const audio = Buffer.from(base64, 'base64')
    if (audio.length === 0) return null

    const rawExt = (payload.audioFileName ?? '').split('.').pop()?.toLowerCase() ?? ''
    const ext = AUDIO_EXTENSIONS.has(rawExt) ? rawExt : 'wav'
    const safeFolder = folderRel === '.' ? '' : folderRel
    const rel = await uniqueVaultPath(vault, path.join(safeFolder, `${noteStem}.${ext}`))
    await fs.mkdir(path.dirname(safeJoin(vault, rel)), { recursive: true })
    await fs.writeFile(safeJoin(vault, rel), audio)
    return rel
  }

  private async sendBuddyAudio(response: ServerResponse, rel: string): Promise<void> {
    const vault = this.requireVault()
    const audioRel = normalizeVaultRel(rel, { expect: 'asset' })
    const ext = path.extname(audioRel).slice(1).toLowerCase()
    if (!AUDIO_EXTENSIONS.has(ext)) throw new HttpError(400, 'Audio path is required.')

    const audio = await fs.readFile(safeJoin(vault, audioRel))
    response.writeHead(200, {
      'Content-Type': audioContentType(ext),
      'Content-Length': audio.length,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    })
    response.end(audio)
  }

  private requireVault(): string {
    if (!this.vault) throw new HttpError(409, 'No Forge vault is open on the desktop.')
    return this.vault
  }
}

function listen(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    request.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function parseBearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '')
  return match?.[1] ?? null
}

function safeJoin(vault: string, rel: string): string {
  const root = path.resolve(vault)
  const abs = path.resolve(root, rel)
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`Path escapes vault: ${rel}`)
  }
  return abs
}

async function uniqueMarkdownPath(vault: string, rel: string): Promise<string> {
  return uniqueVaultPath(vault, rel)
}

async function uniqueVaultPath(vault: string, rel: string): Promise<string> {
  const parsed = path.parse(rel)
  let candidate = rel
  let n = 1
  while (
    await fs.access(safeJoin(vault, candidate)).then(
      () => true,
      () => false
    )
  ) {
    candidate = path.join(parsed.dir, `${parsed.name} ${n}${parsed.ext}`)
    n += 1
  }
  return candidate
}

function normalizeVaultRel(
  value: string | undefined,
  options: { allowEmpty?: boolean; expect: 'folder' | 'note' | 'asset' }
): string {
  const raw = (value ?? '').trim().replace(/\\/g, '/')
  if (!raw) {
    if (options.allowEmpty) return ''
    throw new HttpError(400, 'Path is required.')
  }
  if (path.isAbsolute(raw)) throw new HttpError(400, 'Absolute paths are not allowed.')

  const normalized = path.posix.normalize(raw)
  if (normalized === '.' || normalized === '') {
    if (options.allowEmpty) return ''
    throw new HttpError(400, 'Path is required.')
  }

  const segments = normalized.split('/').filter(Boolean)
  if (
    normalized.startsWith('../') ||
    normalized === '..' ||
    segments.some((segment) => segment === '..' || segment.startsWith('.') || segment === 'node_modules')
  ) {
    throw new HttpError(400, 'Path is outside the allowed Forge vault area.')
  }

  if (options.expect === 'note' && path.extname(normalized).toLowerCase() !== '.md') {
    throw new HttpError(400, 'Note path must point to a Markdown file.')
  }
  return normalized
}

function sanitizePathSegment(value: string | undefined): string {
  const raw = (value ?? '').trim()
  if (!raw) throw new HttpError(400, 'Folder name is required.')
  if (raw.includes('/') || raw.includes('\\')) throw new HttpError(400, 'Folder name cannot contain path separators.')
  const name = sanitizeFileName(raw).replace(/\.+$/g, '').trim()
  if (!name || name.startsWith('.')) throw new HttpError(400, 'Folder name is required.')
  if (name === 'node_modules') throw new HttpError(400, 'Folder name is reserved.')
  return name
}

function shouldSkipVaultEntry(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules'
}

function createPairingToken(): string {
  return crypto.randomBytes(24).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/** Split the machine's IPv4 addresses into LAN and Tailscale-style tailnet
 * addresses (the 100.64.0.0/10 CGNAT range Tailscale assigns). */
function classifyAddresses(): { lan: string[]; tailscale: string[] } {
  const lan: string[] = []
  const tailscale: string[] = []
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      if (isCgnat(entry.address)) tailscale.push(entry.address)
      else lan.push(entry.address)
    }
  }
  return { lan, tailscale }
}

function isCgnat(address: string): boolean {
  const [a, b] = address.split('.').map(Number)
  return a === 100 && b >= 64 && b <= 127
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Voice Note'
}

function parseInputDate(value: string | undefined): Date {
  const date = value ? new Date(value) : new Date()
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function titleFromTranscript(transcript: string): string {
  return sanitizeFileName(transcript.split(/\s+/).slice(0, 7).join(' '))
}

function extractTitle(markdown: string): string | null {
  return /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? null
}

function replaceMarkdownTitle(markdown: string, title: string): string {
  if (/^#\s+.+$/m.test(markdown)) return markdown.replace(/^#\s+.+$/m, `# ${title}`)
  return `# ${title}\n\n${markdown}`
}

function extractRecordedAt(markdown: string): string | null {
  const value = /^-\s*Recorded:\s*(.+)$/m.exec(markdown)?.[1]?.trim()
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function extractDurationSeconds(markdown: string): number | null {
  const value = /^-\s*Duration:\s*(.+)$/m.exec(markdown)?.[1]?.trim()
  if (!value) return null
  const colonParts = value.split(':').map((part) => Number(part))
  if (colonParts.length === 2 && colonParts.every(Number.isFinite)) return colonParts[0] * 60 + colonParts[1]
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function extractTranscript(markdown: string): string {
  const match = /^##\s+Transcript\s*$/im.exec(markdown)
  if (!match) return markdown.replace(/^#\s+.+$/m, '').trim()
  const start = match.index + match[0].length
  const rest = markdown.slice(start).replace(/^\s+/, '')
  const nextHeading = /^##\s+/m.exec(rest)
  return (nextHeading ? rest.slice(0, nextHeading.index) : rest).trim()
}

function replaceTranscriptSection(markdown: string, transcript: string): string {
  const match = /^##\s+Transcript\s*$/im.exec(markdown)
  if (!match) return `${markdown.trimEnd()}\n\n## Transcript\n\n${transcript}\n`
  const start = match.index + match[0].length
  const before = markdown.slice(0, start).trimEnd()
  const afterStart = markdown.slice(start)
  const nextHeading = /^##\s+/m.exec(afterStart.replace(/^\s+/, ''))
  if (!nextHeading) return `${before}\n\n${transcript}\n`

  const trimmedAfter = afterStart.replace(/^\s+/, '')
  const after = trimmedAfter.slice(nextHeading.index)
  return `${before}\n\n${transcript}\n\n${after.trimStart()}`
}

function extractAudioRef(markdown: string): string | null {
  return /!\[\[([^\]]+\.(?:m4a|mp3|wav|aac|caf|ogg))\]\]/i.exec(markdown)?.[1]?.trim() ?? null
}

function audioContentType(ext: string): string {
  switch (ext) {
    case 'm4a':
    case 'aac':
      return 'audio/mp4'
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'ogg':
      return 'audio/ogg'
    case 'caf':
      return 'audio/x-caf'
    default:
      return 'application/octet-stream'
  }
}

function resolveWikiAssetRel(noteRel: string, ref: string): string | null {
  const normalizedRef = normalizeVaultRel(ref, { allowEmpty: false, expect: 'asset' })
  const baseDir = path.dirname(noteRel) === '.' ? '' : path.dirname(noteRel)
  return normalizedRef.includes('/') ? normalizedRef : path.join(baseDir, normalizedRef)
}

function tryResolveWikiAssetRel(noteRel: string, ref: string): string | null {
  try {
    return resolveWikiAssetRel(noteRel, ref)
  } catch {
    return null
  }
}

function formatPathDate(date: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

function formatDisplayDate(date: Date): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}
