#!/usr/bin/env node
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { publishVault } from './lib/publisher.mjs'

const WIKILINK_RE = /\[\[([^[\]]+?)\]\]/g
const TAG_RE = /(^|[\s([])#([A-Za-z][\w/-]*)/g
const HEADING_RE = /^(#{1,6})\s+(.+)/

const HELP = `Forge agent CLI

Usage:
  forge --vault <folder> <command> [args]
  FORGE_VAULT=<folder> forge <command> [args]
  forge <command> [args]                Uses the active Forge desktop vault when available

From the source checkout:
  npm run agent -- --vault <folder> <command> [args]

Commands:
  list [--json]                         List folders and files in the vault
  tree                                  Print a compact vault tree
  read <path> [--json]                  Read a file
  write <path> (--stdin|--content <s>|--content-file <file>)
                                        Create or overwrite a file
  append <path> (--stdin|--content <s>|--content-file <file>)
                                        Append content to a file
  create-doc <path> [--title <title>] [--stdin|--content <s>|--content-file <file>] [--overwrite]
                                        Create a Markdown document
  templates [--folder <path>] [--json] List Markdown templates
  create-template <name> [--folder <path>] [--stdin|--content <s>|--content-file <file>] [--overwrite]
                                        Create a Markdown template
  create-from-template <template> <path> [--title <title>] [--folder <path>] [--vars <json>] [--var <key=value>] [--overwrite]
                                        Create a note from a template
  create-folder <path>                  Create a folder
  move <from> <to>                      Move or rename a file or folder
  search <query> [--limit <n>] [--json] Search Markdown filenames and contents
  analyze [--json]                      Summarize notes, tags, links, backlinks, and gaps
  publish --out <folder> [--title <s>] [--clean] [--json]
                                        Export the vault to static HTML
  batch [file|-] [--json]               Run JSON operations in one transaction-like sequence

Batch shape:
  {
    "vault": "/Users/me/Notes",
    "operations": [
      {"action": "createFolder", "path": "Projects"},
      {"action": "createDoc", "path": "Projects/Plan.md", "title": "Plan"},
      {"action": "createFromTemplate", "template": "Brief", "path": "Projects/Brief.md", "variables": {"client": "Acme"}},
      {"action": "append", "path": "Projects/Plan.md", "content": "\\nNext step"}
    ]
  }

Template variables:
  Built-ins: {{title}}, {{date}}, {{time}}, {{datetime}}, {{vault}}, {{template}}, {{folder}}
  Custom variables: {{client}}, {{prompt:Audience}}, {{select:Status|Draft,Final}}
  CLI examples: --vars '{"client":"Acme"}' --var Audience=Developers
`

function parseArgv(argv) {
  const globals = {
    vault: process.env.FORGE_VAULT ?? '',
    json: false,
    help: false
  }
  const rest = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--vault') {
      globals.vault = argv[++i] ?? ''
    } else if (arg.startsWith('--vault=')) {
      globals.vault = arg.slice('--vault='.length)
    } else if (arg === '--json') {
      globals.json = true
    } else if (arg === '--help' || arg === '-h') {
      globals.help = true
    } else {
      rest.push(arg)
    }
  }

  return { globals, command: rest[0] ?? '', args: rest.slice(1) }
}

function parseOptions(args) {
  const positional = []
  const options = {}

  function addOption(key, value) {
    if (Object.hasOwn(options, key)) {
      options[key] = Array.isArray(options[key]) ? [...options[key], value] : [options[key], value]
    } else {
      options[key] = value
    }
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }

    const eq = arg.indexOf('=')
    if (eq > -1) {
      addOption(arg.slice(2, eq), arg.slice(eq + 1))
      continue
    }

    const key = arg.slice(2)
    const next = args[i + 1]
    if (!next || next.startsWith('--')) {
      addOption(key, true)
    } else {
      addOption(key, next)
      i++
    }
  }

  return { positional, options }
}

function fail(message, json = false, code = 1) {
  if (json) {
    console.error(JSON.stringify({ ok: false, error: message }, null, 2))
  } else {
    console.error(`Error: ${message}`)
  }
  process.exit(code)
}

function slash(rel) {
  return rel.split(path.sep).join('/')
}

function baseName(rel) {
  return path.basename(rel).replace(/\.md$/i, '')
}

function isMarkdown(rel) {
  return /\.md$/i.test(rel)
}

function linkTarget(inner) {
  return inner.split('|')[0].split('#')[0].trim()
}

function normalizeDocPath(rel) {
  return /\.md$/i.test(rel) ? rel : `${rel}.md`
}

function normalizeVault(vault) {
  if (!vault) throw new Error('Missing vault path. Pass --vault <folder> or set FORGE_VAULT.')
  return path.resolve(expandHome(vault))
}

function defaultSettingsPath() {
  if (process.env.FORGE_SETTINGS_PATH) return expandHome(process.env.FORGE_SETTINGS_PATH)
  const home = process.env.HOME ?? ''
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Forge', 'forge-settings.json')
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Forge', 'forge-settings.json')
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'Forge', 'forge-settings.json')
}

async function readActiveVaultFromSettings() {
  const settings = await readDesktopSettings()
  return typeof settings.lastVault === 'string' ? settings.lastVault : ''
}

async function readDesktopSettings() {
  try {
    const raw = await fs.readFile(defaultSettingsPath(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function resolveVault(vault) {
  return normalizeVault(vault || process.env.FORGE_VAULT || (await readActiveVaultFromSettings()))
}

function expandHome(value) {
  if (value === '~') return process.env.HOME ?? value
  if (value.startsWith('~/')) return path.join(process.env.HOME ?? '', value.slice(2))
  return value
}

function safeRel(rel, { allowRoot = false } = {}) {
  const value = String(rel ?? '').replaceAll('\\', '/').trim()
  if (!value && allowRoot) return ''
  if (!value) throw new Error('Missing relative path.')
  if (value.includes('\0')) throw new Error('Path contains a null byte.')
  if (path.isAbsolute(value)) throw new Error(`Path must be relative to the vault: ${value}`)

  const normalized = slash(path.posix.normalize(value))
  if (normalized === '.' && allowRoot) return ''
  if (normalized === '.' || normalized.startsWith('../') || normalized === '..') {
    throw new Error(`Path escapes the vault: ${value}`)
  }
  return normalized
}

function safeJoin(vault, rel, options) {
  const clean = safeRel(rel, options)
  const abs = path.resolve(vault, clean)
  if (abs !== vault && !abs.startsWith(vault + path.sep)) {
    throw new Error(`Path escapes the vault: ${rel}`)
  }
  return { clean, abs }
}

async function templatesFolder(options = {}) {
  const explicit = options.folder || options['templates-folder']
  if (explicit) return safeRel(explicit, { allowRoot: true })
  const settings = await readDesktopSettings()
  return safeRel(settings.templatesFolder || 'Templates', { allowRoot: true })
}

function formatDateParts(date = new Date()) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const dateValue = `${yyyy}-${mm}-${dd}`
  const time = `${hh}:${min}`
  return { date: dateValue, time, datetime: `${dateValue} ${time}` }
}

function normalizeTemplateVariableKey(key) {
  return String(key ?? '').trim().toLowerCase()
}

function normalizeTemplateVariables(variables = {}) {
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) return {}
  const normalized = {}
  for (const [key, value] of Object.entries(variables)) {
    const cleanKey = String(key).trim()
    if (!cleanKey) continue
    normalized[cleanKey] = value == null ? '' : String(value)
  }
  return normalized
}

function lookupTemplateKeys(rawKey) {
  const key = String(rawKey ?? '').trim()
  const prompt = /^prompt\s*:\s*(.+)$/i.exec(key)
  if (prompt) return [key, prompt[1].trim()]

  const select = /^select\s*:\s*([^|]+)(?:\|.*)?$/i.exec(key)
  if (select) return [key, select[1].trim()]

  return [key]
}

function firstSelectOption(rawOptions = '') {
  return String(rawOptions)
    .split(/[|,]/)
    .map((option) => option.trim())
    .filter(Boolean)[0] ?? ''
}

function renderTemplateContent(template, { title, vault, templateName, folder = '', variables = {} }) {
  const parts = formatDateParts()
  const builtInValues = {
    title,
    date: parts.date,
    time: parts.time,
    datetime: parts.datetime,
    vault: path.basename(vault),
    template: templateName,
    folder
  }
  const values = new Map()
  for (const [key, value] of Object.entries(builtInValues)) {
    values.set(normalizeTemplateVariableKey(key), value)
  }
  for (const [key, value] of Object.entries(normalizeTemplateVariables(variables))) {
    values.set(normalizeTemplateVariableKey(key), value)
  }

  return template.replace(/\{\{\s*([^{}\n]+?)\s*\}\}/g, (match, key) => {
    const prompt = /^prompt\s*:\s*(.+)$/i.exec(String(key).trim())
    const select = /^select\s*:\s*([^|]+)(?:\|(.*))?$/i.exec(String(key).trim())
    for (const lookupKey of lookupTemplateKeys(key)) {
      const normalized = normalizeTemplateVariableKey(lookupKey)
      if (values.has(normalized)) return values.get(normalized)
    }
    if (prompt) return ''
    if (select) return firstSelectOption(select[2])
    return match
  })
}

function templateDisplayName(templatePath, folder) {
  const prefix = folder ? `${folder.replace(/\/+$/, '')}/` : ''
  const rel = prefix && templatePath.startsWith(prefix) ? templatePath.slice(prefix.length) : templatePath
  return rel.replace(/\.md$/i, '')
}

function templateRel(folder, name) {
  const cleanName = normalizeDocPath(safeRel(name))
  return folder ? path.posix.join(folder, cleanName) : cleanName
}

async function ensureVault(vault) {
  const stat = await fs.stat(vault).catch(() => null)
  if (!stat?.isDirectory()) throw new Error(`Vault is not a directory: ${vault}`)
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

async function readContent(options) {
  if (options.stdin) return readStdin()
  if (typeof options.content === 'string') return options.content
  if (typeof options['content-file'] === 'string') {
    return fs.readFile(expandHome(options['content-file']), 'utf8')
  }
  return ''
}

async function readJsonOption(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be a JSON object.`)
  const source = value.startsWith('@') ? await fs.readFile(expandHome(value.slice(1)), 'utf8') : value
  const parsed = JSON.parse(source)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`)
  }
  return parsed
}

function asArray(value) {
  if (value == null || value === false) return []
  return Array.isArray(value) ? value : [value]
}

function parseVarEntry(entry) {
  if (typeof entry !== 'string') throw new Error('--var expects key=value.')
  const eq = entry.indexOf('=')
  if (eq < 1) throw new Error(`Invalid --var value: ${entry}. Use key=value.`)
  return [entry.slice(0, eq).trim(), entry.slice(eq + 1)]
}

async function parseTemplateVariables(options = {}) {
  const variables = {}

  for (const source of asArray(options.vars)) {
    Object.assign(variables, await readJsonOption(source, '--vars'))
  }

  for (const entry of asArray(options.var)) {
    const [key, value] = parseVarEntry(entry)
    if (!key) throw new Error(`Invalid --var value: ${entry}. Use key=value.`)
    variables[key] = value
  }

  return normalizeTemplateVariables(variables)
}

function operationTemplateVariables(op = {}) {
  const variables = op.variables ?? op.vars
  if (variables == null) return {}
  if (typeof variables === 'string') {
    const parsed = JSON.parse(variables)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Template variables must be a JSON object.')
    }
    return normalizeTemplateVariables(parsed)
  }
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    throw new Error('Template variables must be an object.')
  }
  return normalizeTemplateVariables(variables)
}

async function walkVault(vault) {
  const folders = []
  const files = []

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue

      const abs = path.join(dir, entry.name)
      const rel = slash(path.relative(vault, abs))

      if (entry.isDirectory()) {
        folders.push(rel)
        await walk(abs)
      } else if (entry.isFile()) {
        const stat = await fs.stat(abs)
        files.push({
          path: rel,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          markdown: isMarkdown(rel)
        })
      }
    }
  }

  await walk(vault)
  folders.sort((a, b) => a.localeCompare(b))
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { vault, folders, files }
}

async function readMarkdownNotes(vault) {
  const scan = await walkVault(vault)
  const notes = []

  for (const file of scan.files.filter((f) => f.markdown)) {
    const content = await fs.readFile(path.join(vault, file.path), 'utf8')
    notes.push({
      ...file,
      content,
      meta: parseNote(content)
    })
  }

  return { ...scan, notes }
}

function parseNote(content) {
  const links = []
  const tags = []
  const headings = []
  const lines = content.split('\n')
  let inFence = false

  for (const match of content.matchAll(WIKILINK_RE)) {
    const target = linkTarget(match[1])
    if (target && !links.includes(target)) links.push(target)
  }

  for (const match of content.matchAll(TAG_RE)) {
    if (!tags.includes(match[2])) tags.push(match[2])
  }

  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (inFence) return
    const match = HEADING_RE.exec(line)
    if (match) headings.push({ level: match[1].length, text: match[2].trim(), line: index })
  })

  return {
    links,
    tags,
    headings,
    words: content.split(/\s+/).filter(Boolean).length,
    chars: content.length
  }
}

function resolveLink(target, filePaths) {
  const normalized = target.toLowerCase()
  const withExt = normalized.endsWith('.md') ? normalized : `${normalized}.md`

  for (const file of filePaths) {
    const lower = file.toLowerCase()
    if (lower === normalized || lower === withExt) return file
  }
  for (const file of filePaths) {
    const lowerBase = path.basename(file).toLowerCase()
    if (lowerBase === normalized || lowerBase === withExt) return file
  }
  return null
}

function makeSnippet(content, query) {
  const lower = content.toLowerCase()
  const needle = query.toLowerCase()
  const index = lower.indexOf(needle)
  if (index === -1) return ''

  const start = Math.max(0, index - 80)
  const end = Math.min(content.length, index + query.length + 120)
  return content.slice(start, end).replace(/\s+/g, ' ').trim()
}

function renderTree(scan) {
  const entries = [
    ...scan.folders.map((folder) => ({ path: folder, type: 'folder' })),
    ...scan.files.map((file) => ({ path: file.path, type: 'file' }))
  ].sort((a, b) => a.path.localeCompare(b.path))

  if (entries.length === 0) return '(empty vault)'
  return entries
    .map((entry) => {
      const depth = entry.path.split('/').length - 1
      const name = entry.path.split('/').pop()
      return `${'  '.repeat(depth)}${entry.type === 'folder' ? '+ ' : '- '}${name}`
    })
    .join('\n')
}

async function listCommand(vault) {
  return walkVault(vault)
}

async function readCommand(vault, rel) {
  const { clean, abs } = safeJoin(vault, rel)
  const stat = await fs.stat(abs)
  if (!stat.isFile()) throw new Error(`Not a file: ${clean}`)
  const content = await fs.readFile(abs, 'utf8')
  return { path: clean, content, size: stat.size, modified: stat.mtime.toISOString() }
}

async function writeCommand(vault, rel, content) {
  const { clean, abs } = safeJoin(vault, rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, 'utf8')
  return { path: clean, bytes: Buffer.byteLength(content), written: true }
}

async function appendCommand(vault, rel, content) {
  const { clean, abs } = safeJoin(vault, rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.appendFile(abs, content, 'utf8')
  return { path: clean, bytes: Buffer.byteLength(content), appended: true }
}

async function createDocCommand(vault, rel, { title = '', content = '', overwrite = false } = {}) {
  const docPath = normalizeDocPath(rel)
  const { clean, abs } = safeJoin(vault, docPath)
  const exists = await fs.stat(abs).then(
    () => true,
    () => false
  )
  if (exists && !overwrite) throw new Error(`Document already exists: ${clean}`)

  const fallbackTitle = title || baseName(clean)
  const body = content || `# ${fallbackTitle}\n`
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, body, 'utf8')
  return { path: clean, bytes: Buffer.byteLength(body), created: !exists, overwritten: exists }
}

async function templatesCommand(vault, options = {}) {
  const folder = await templatesFolder(options)
  const scan = await walkVault(vault)
  const prefix = folder ? `${folder.replace(/\/+$/, '')}/` : ''
  const templates = scan.files
    .filter((file) => file.markdown)
    .filter((file) => !prefix || file.path.startsWith(prefix))
    .map((file) => ({
      path: file.path,
      name: templateDisplayName(file.path, folder),
      size: file.size,
      modified: file.modified
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { templatesFolder: folder || '(vault root)', count: templates.length, templates }
}

async function createTemplateCommand(vault, name, { folder = '', content = '', overwrite = false } = {}) {
  const templateFolder = await templatesFolder({ folder })
  const rel = templateRel(templateFolder, name)
  const body = content || `# {{title}}\n`
  return createDocCommand(vault, rel, { content: body, overwrite })
}

async function resolveTemplatePath(vault, requested, options = {}) {
  const folder = await templatesFolder(options)
  const direct = safeRel(requested)
  const candidates = [
    normalizeDocPath(direct),
    templateRel(folder, direct)
  ]

  for (const candidate of candidates) {
    const { clean, abs } = safeJoin(vault, candidate)
    const stat = await fs.stat(abs).catch(() => null)
    if (stat?.isFile()) return clean
  }

  const listed = await templatesCommand(vault, { folder })
  const lowered = requested.toLowerCase().replace(/\.md$/i, '')
  const match = listed.templates.find((template) => {
    return template.path.toLowerCase() === requested.toLowerCase() ||
      template.name.toLowerCase() === lowered ||
      path.basename(template.path).toLowerCase().replace(/\.md$/i, '') === lowered
  })
  if (!match) throw new Error(`Template not found: ${requested}`)
  return match.path
}

async function createFromTemplateCommand(
  vault,
  template,
  rel,
  { title = '', folder = '', overwrite = false, variables = {} } = {}
) {
  const templatePath = await resolveTemplatePath(vault, template, { folder })
  const templateFile = await readCommand(vault, templatePath)
  const docPath = normalizeDocPath(rel)
  const docFolder = path.posix.dirname(docPath) === '.' ? '' : path.posix.dirname(docPath)
  const cleanTitle = String(title || baseName(docPath)).replace(/[\\/:*?"<>|]/g, '').trim() || baseName(docPath)
  const resolvedVariables = normalizeTemplateVariables(variables)
  const content = renderTemplateContent(templateFile.content || '# {{title}}\n', {
    title: cleanTitle,
    vault,
    templateName: baseName(templatePath),
    folder: docFolder,
    variables: resolvedVariables
  })
  const result = await createDocCommand(vault, docPath, { title: cleanTitle, content, overwrite })
  const variableKeys = Object.keys(resolvedVariables).sort((a, b) => a.localeCompare(b))
  return { ...result, template: templatePath, variables: variableKeys }
}

async function createFolderCommand(vault, rel) {
  const { clean, abs } = safeJoin(vault, rel)
  await fs.mkdir(abs, { recursive: true })
  return { path: clean, created: true }
}

async function moveCommand(vault, from, to) {
  const source = safeJoin(vault, from)
  const target = safeJoin(vault, to)
  await fs.mkdir(path.dirname(target.abs), { recursive: true })
  await fs.rename(source.abs, target.abs)
  return { from: source.clean, to: target.clean, moved: true }
}

async function searchCommand(vault, query, { limit = 20 } = {}) {
  const scan = await readMarkdownNotes(vault)
  const needle = query.trim().toLowerCase()
  if (!needle) throw new Error('Search query is empty.')

  const results = []
  for (const note of scan.notes) {
    const pathHit = note.path.toLowerCase().includes(needle)
    const contentHit = note.content.toLowerCase().includes(needle)
    if (!pathHit && !contentHit) continue

    results.push({
      path: note.path,
      title: note.meta.headings[0]?.text ?? baseName(note.path),
      pathHit,
      contentHit,
      snippet: contentHit ? makeSnippet(note.content, query) : ''
    })
  }

  return { query, count: results.length, results: results.slice(0, Number(limit) || 20) }
}

async function analyzeCommand(vault) {
  const scan = await readMarkdownNotes(vault)
  const filePaths = scan.notes.map((note) => note.path)
  const backlinks = Object.fromEntries(filePaths.map((file) => [file, []]))
  const brokenLinks = []
  const linkEdges = []
  const tagMap = new Map()
  const byFolder = new Map()

  for (const note of scan.notes) {
    const folder = path.dirname(note.path) === '.' ? '(root)' : path.dirname(note.path)
    byFolder.set(folder, (byFolder.get(folder) ?? 0) + 1)

    for (const tag of note.meta.tags) {
      if (!tagMap.has(tag)) tagMap.set(tag, [])
      tagMap.get(tag).push(note.path)
    }

    for (const target of note.meta.links) {
      const resolved = resolveLink(target, filePaths)
      if (resolved) {
        backlinks[resolved].push(note.path)
        linkEdges.push({ source: note.path, target: resolved, label: target })
      } else {
        brokenLinks.push({ source: note.path, target })
      }
    }
  }

  const notes = scan.notes.map((note) => ({
    path: note.path,
    title: note.meta.headings[0]?.text ?? baseName(note.path),
    words: note.meta.words,
    chars: note.meta.chars,
    tags: note.meta.tags,
    links: note.meta.links,
    backlinks: backlinks[note.path] ?? [],
    headings: note.meta.headings
  }))

  const tags = [...tagMap.entries()]
    .map(([tag, paths]) => ({ tag, count: paths.length, paths: paths.sort() }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))

  const emptyNotes = notes.filter((note) => note.words === 0).map((note) => note.path)
  const noTagNotes = notes.filter((note) => note.tags.length === 0).map((note) => note.path)
  const orphanNotes = notes
    .filter((note) => note.backlinks.length === 0 && note.links.length === 0)
    .map((note) => note.path)

  return {
    vault,
    totals: {
      files: scan.files.length,
      markdown: scan.notes.length,
      folders: scan.folders.length,
      words: notes.reduce((sum, note) => sum + note.words, 0),
      chars: notes.reduce((sum, note) => sum + note.chars, 0),
      tags: tags.length,
      links: linkEdges.length,
      brokenLinks: brokenLinks.length
    },
    byFolder: Object.fromEntries([...byFolder.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    tags,
    notes,
    links: linkEdges,
    backlinks,
    brokenLinks,
    organizeCandidates: {
      emptyNotes,
      noTagNotes,
      orphanNotes,
      inboxNotes: notes.filter((note) => note.tags.includes('inbox')).map((note) => note.path)
    }
  }
}

async function publishCommand(vault, { output = '', title = '', clean = false } = {}) {
  const result = await publishVault({
    vault,
    output,
    title,
    clean: Boolean(clean)
  })

  return {
    ok: true,
    vault: result.vault,
    outDir: result.output,
    totals: result.totals,
    files: result.written.length + result.copied.length,
    written: result.written.length,
    copied: result.copied.length,
    brokenLinks: result.brokenLinks
  }
}

async function runOperation(vault, op) {
  const action = op.action || op.command
  if (!action) throw new Error('Batch operation is missing action.')

  switch (action) {
    case 'list':
      return listCommand(vault)
    case 'tree':
      return { tree: renderTree(await listCommand(vault)) }
    case 'read':
      return readCommand(vault, op.path)
    case 'write':
      return writeCommand(vault, op.path, op.content ?? '')
    case 'append':
      return appendCommand(vault, op.path, op.content ?? '')
    case 'createDoc':
    case 'create-doc':
      return createDocCommand(vault, op.path, {
        title: op.title,
        content: op.content ?? '',
        overwrite: Boolean(op.overwrite)
      })
    case 'templates':
    case 'listTemplates':
    case 'list-templates':
      return templatesCommand(vault, { folder: op.folder ?? op.templatesFolder })
    case 'createTemplate':
    case 'create-template':
      return createTemplateCommand(vault, op.name ?? op.path, {
        folder: op.folder ?? op.templatesFolder,
        content: op.content ?? '',
        overwrite: Boolean(op.overwrite)
      })
    case 'createFromTemplate':
    case 'create-from-template':
      return createFromTemplateCommand(vault, op.template, op.path, {
        title: op.title,
        folder: op.folder ?? op.templatesFolder,
        overwrite: Boolean(op.overwrite),
        variables: operationTemplateVariables(op)
      })
    case 'createFolder':
    case 'create-folder':
      return createFolderCommand(vault, op.path)
    case 'move':
      return moveCommand(vault, op.from, op.to)
    case 'search':
      return searchCommand(vault, op.query, { limit: op.limit })
    case 'analyze':
      return analyzeCommand(vault)
    case 'publish':
      return publishCommand(vault, {
        output: op.output ?? op.outDir ?? op.out,
        title: op.title,
        clean: Boolean(op.clean)
      })
    default:
      throw new Error(`Unknown batch action: ${action}`)
  }
}

async function batchCommand(defaultVault, inputPath) {
  const raw = !inputPath || inputPath === '-' ? await readStdin() : await fs.readFile(expandHome(inputPath), 'utf8')
  const parsed = JSON.parse(raw)
  const operations = Array.isArray(parsed) ? parsed : parsed.operations
  if (!Array.isArray(operations)) throw new Error('Batch input must be an array or an object with operations[].')

  const vault = await resolveVault(parsed.vault ?? defaultVault)
  await ensureVault(vault)

  const results = []
  for (let i = 0; i < operations.length; i++) {
    try {
      results.push({ index: i, ok: true, result: await runOperation(vault, operations[i]) })
    } catch (error) {
      results.push({ index: i, ok: false, error: error.message })
      break
    }
  }

  return { vault, results, ok: results.every((result) => result.ok) }
}

function printResult(result, { json = false, text = null } = {}) {
  if (json) {
    console.log(JSON.stringify(result, null, 2))
  } else if (text) {
    console.log(text(result))
  } else {
    console.log(JSON.stringify(result, null, 2))
  }
}

async function main() {
  const { globals, command, args } = parseArgv(process.argv.slice(2))
  if (globals.help || !command) {
    console.log(HELP)
    return
  }

  const { positional, options } = parseOptions(args)
  const json = globals.json || Boolean(options.json)

  try {
    if (command === 'batch') {
      printResult(await batchCommand(globals.vault, positional[0]), { json: true })
      return
    }

    const vault = await resolveVault(globals.vault)
    await ensureVault(vault)

    switch (command) {
      case 'list':
        printResult(await listCommand(vault), {
          json,
          text: (scan) => [
            `Vault: ${scan.vault}`,
            `Folders: ${scan.folders.length}`,
            `Files: ${scan.files.length}`,
            '',
            ...scan.folders.map((folder) => `+ ${folder}`),
            ...scan.files.map((file) => `- ${file.path}`)
          ].join('\n')
        })
        break
      case 'tree':
        printResult(await listCommand(vault), { text: renderTree })
        break
      case 'read':
        printResult(await readCommand(vault, positional[0]), {
          json,
          text: (file) => file.content
        })
        break
      case 'write':
        printResult(await writeCommand(vault, positional[0], await readContent(options)), { json })
        break
      case 'append':
        printResult(await appendCommand(vault, positional[0], await readContent(options)), { json })
        break
      case 'create-doc':
        printResult(
          await createDocCommand(vault, positional[0], {
            title: options.title,
            content: await readContent(options),
            overwrite: Boolean(options.overwrite)
          }),
          { json }
        )
        break
      case 'templates':
      case 'list-templates':
        printResult(await templatesCommand(vault, { folder: options.folder || options.templatesFolder }), {
          json,
          text: (result) =>
            result.templates.length
              ? result.templates.map((template) => `${template.name}\t${template.path}`).join('\n')
              : `No templates found in ${result.templatesFolder}.`
        })
        break
      case 'create-template':
        printResult(
          await createTemplateCommand(vault, positional[0], {
            folder: options.folder || options.templatesFolder,
            content: await readContent(options),
            overwrite: Boolean(options.overwrite)
          }),
          { json }
        )
        break
      case 'create-from-template':
        printResult(
          await createFromTemplateCommand(vault, positional[0], positional[1], {
            title: options.title,
            folder: options.folder || options.templatesFolder,
            overwrite: Boolean(options.overwrite),
            variables: await parseTemplateVariables(options)
          }),
          { json }
        )
        break
      case 'create-folder':
      case 'ensure-folder':
        printResult(await createFolderCommand(vault, positional[0]), { json })
        break
      case 'move':
      case 'rename':
        printResult(await moveCommand(vault, positional[0], positional[1]), { json })
        break
      case 'search':
        printResult(await searchCommand(vault, positional.join(' '), { limit: options.limit }), {
          json,
          text: (result) =>
            result.results.length
              ? result.results.map((item) => `${item.path}${item.snippet ? `\n  ${item.snippet}` : ''}`).join('\n')
              : 'No matches.'
        })
        break
      case 'analyze':
        printResult(await analyzeCommand(vault), {
          json,
          text: (analysis) => [
            `Vault: ${analysis.vault}`,
            `Markdown notes: ${analysis.totals.markdown}`,
            `Words: ${analysis.totals.words}`,
            `Tags: ${analysis.totals.tags}`,
            `Links: ${analysis.totals.links}`,
            `Broken links: ${analysis.totals.brokenLinks}`,
            `Orphan notes: ${analysis.organizeCandidates.orphanNotes.length}`,
            `Notes without tags: ${analysis.organizeCandidates.noTagNotes.length}`
          ].join('\n')
        })
        break
      case 'publish':
        printResult(await publishCommand(vault, {
          output: options.out || options.output || options.outDir,
          title: options.title,
          clean: Boolean(options.clean)
        }), {
          json,
          text: (result) => [
            `Published ${result.totals.notes} notes to ${result.outDir}`,
            `Files: ${result.files}`,
            `Tags: ${result.totals.tags}`,
            `Broken links: ${result.brokenLinks.length}`
          ].join('\n')
        })
        break
      default:
        throw new Error(`Unknown command: ${command}`)
    }
  } catch (error) {
    fail(error.message, json)
  }
}

function isDirectRun() {
  const entry = process.argv[1]
  if (!entry) return false
  const current = fileURLToPath(import.meta.url)
  try {
    return fsSync.realpathSync(entry) === current
  } catch {
    return path.resolve(entry) === current
  }
}

export {
  HELP,
  analyzeCommand,
  appendCommand,
  batchCommand,
  createFromTemplateCommand,
  createDocCommand,
  createFolderCommand,
  createTemplateCommand,
  ensureVault,
  listCommand,
  moveCommand,
  publishCommand,
  readCommand,
  renderTree,
  resolveVault,
  runOperation,
  searchCommand,
  templatesCommand,
  writeCommand
}

if (isDirectRun()) main()
