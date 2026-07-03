#!/usr/bin/env node
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { publishVault } from './lib/publisher.mjs'
import { builtInExtensionCatalog, builtInTemplateCatalog } from './lib/agent-catalog.mjs'
import { formatValidationResults, validateExtensionInputs } from './validate-extension.mjs'

const WIKILINK_RE = /\[\[([^[\]]+?)\]\]/g
const TAG_RE = /(^|[\s([])#([A-Za-z][\w/-]*)/g
const HEADING_RE = /^(#{1,6})\s+(.+)/
const DEFAULT_STALE_NOTE_DAYS = 90

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
  seed-templates [--kinds <kind,...>] [--folder <path>] [--overwrite] [--json]
                                        Copy bundled starter templates into the selected vault
  create-folder <path>                  Create a folder
  move <from> <to>                      Move or rename a file or folder
  search <query> [--limit <n>] [--json] Search Markdown filenames and contents
  analyze [--stale-days <n>] [--json]   Summarize notes, tags, links, backlinks, gaps, stale notes, and repair queues
  publish --out <folder> [--title <s>] [--description <s>] [--scope <folder>] [--theme <minimal|editorial|reference|quiet-paper|terminal-ledger|swiss-ledger|soft-focus|field-notes>] [--clean] [--no-tags] [--no-backlinks] [--json]
                                        Export the vault to static HTML
  batch [file|-] [--json]               Run JSON operations in one transaction-like sequence
  built-in-templates [--json] [--content]
                                        List bundled starter templates and their variables
  built-in-extensions [--json]          List bundled extension points and manifests
  validate-extension <path...> [--json] [--recursive]
                                        Validate local forge-extension.json manifests

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

Catalog and extension examples:
  forge built-in-templates --json
  forge --vault /path/to/vault seed-templates --kinds daily,meeting,agentTask --json
  forge built-in-extensions --json
  forge validate-extension examples/extensions --recursive --json
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

function parseSeedTemplateKinds(value, { explicit = false } = {}) {
  const kinds = []
  for (const source of asArray(value)) {
    if (source === true) throw new Error('--kinds expects a comma-separated list of template kinds.')
    kinds.push(
      ...String(source)
        .split(',')
        .map((kind) => kind.trim())
        .filter(Boolean)
    )
  }

  if (explicit && kinds.length === 0) {
    throw new Error('--kinds expects at least one template kind.')
  }

  const seen = new Set()
  return kinds.filter((kind) => {
    const key = kind.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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

function parseFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  if (!match) return { properties: {}, body: content }
  const properties = {}
  let listKey = ''
  for (const line of match[1].split(/\r?\n/)) {
    const listItem = /^\s*-\s+(.+)$/.exec(line)
    if (listItem && listKey) {
      const current = Array.isArray(properties[listKey]) ? properties[listKey] : []
      current.push(listItem[1].trim())
      properties[listKey] = current
      continue
    }
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!pair) continue
    if (!pair[2].trim()) {
      listKey = pair[1]
      properties[listKey] = []
      continue
    }
    listKey = ''
    const value = pair[2].trim()
    properties[pair[1]] =
      value.startsWith('[') && value.endsWith(']')
        ? value.slice(1, -1).split(',').map((item) => item.trim()).filter(Boolean)
        : value.replace(/^["']|["']$/g, '')
  }
  return { properties, body: content.slice(match[0].length) }
}

function propertyStrings(value) {
  if (value == null) return []
  return Array.isArray(value) ? value.map(String) : [String(value)]
}

function parseNote(content) {
  const frontmatter = parseFrontmatter(content)
  const links = []
  const tags = []
  const headings = []
  const lines = frontmatter.body.split('\n')
  let inFence = false

  for (const match of frontmatter.body.matchAll(WIKILINK_RE)) {
    const target = linkTarget(match[1])
    if (target && !links.includes(target)) links.push(target)
  }

  for (const match of frontmatter.body.matchAll(TAG_RE)) {
    if (!tags.includes(match[2])) tags.push(match[2])
  }
  for (const tag of propertyStrings(frontmatter.properties.tags)) {
    const clean = tag.replace(/^#/, '').trim()
    if (clean && !tags.includes(clean)) tags.push(clean)
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
    title: propertyStrings(frontmatter.properties.title)[0] ?? headings[0]?.text ?? null,
    words: frontmatter.body.split(/\s+/).filter(Boolean).length,
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

function noteTitle(note) {
  return note.meta.title ?? note.meta.headings[0]?.text ?? baseName(note.path)
}

function daysSince(iso, now = Date.now()) {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return null
  return Math.max(0, Math.floor((now - time) / 86_400_000))
}

function staleDaysOption(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_STALE_NOTE_DAYS
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_STALE_NOTE_DAYS
}

async function analyzeCommand(vault, { staleDays = DEFAULT_STALE_NOTE_DAYS } = {}) {
  const scan = await readMarkdownNotes(vault)
  const filePaths = scan.notes.map((note) => note.path)
  const backlinks = Object.fromEntries(filePaths.map((file) => [file, []]))
  const brokenLinks = []
  const linkEdges = []
  const tagMap = new Map()
  const byFolder = new Map()
  const titleMap = new Map()

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
    title: noteTitle(note),
    size: note.size,
    modified: note.modified,
    words: note.meta.words,
    chars: note.meta.chars,
    tags: note.meta.tags,
    links: note.meta.links,
    backlinks: backlinks[note.path] ?? [],
    headings: note.meta.headings
  }))

  for (const note of notes) {
    const key = note.title.trim().toLowerCase()
    if (!key) continue
    if (!titleMap.has(key)) titleMap.set(key, [])
    titleMap.get(key).push(note.path)
  }

  const duplicateTitles = [...titleMap.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([title, paths]) => ({ title, count: paths.length, paths: paths.sort() }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))

  const staleNotes = notes
    .map((note) => ({ path: note.path, title: note.title, modified: note.modified, daysSinceModified: daysSince(note.modified) }))
    .filter((note) => note.daysSinceModified !== null && note.daysSinceModified >= staleDays)
    .sort((a, b) => b.daysSinceModified - a.daysSinceModified || a.path.localeCompare(b.path))

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
      brokenLinks: brokenLinks.length,
      staleNotes: staleNotes.length,
      duplicateTitleGroups: duplicateTitles.length
    },
    byFolder: Object.fromEntries([...byFolder.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    tags,
    notes,
    links: linkEdges,
    backlinks,
    brokenLinks,
    duplicateTitles,
    staleNotes,
    organizeCandidates: {
      emptyNotes,
      noTagNotes,
      orphanNotes,
      inboxNotes: notes.filter((note) => note.tags.includes('inbox')).map((note) => note.path),
      staleNotes: staleNotes.map((note) => note.path),
      duplicateTitleNotes: duplicateTitles.flatMap((group) => group.paths)
    },
    repairQueues: {
      createMissingNotes: brokenLinks.map((link) => ({ target: link.target, source: link.source })),
      reviewStaleNotes: staleNotes,
      reviewDuplicateTitles: duplicateTitles,
      reviewOrphans: orphanNotes
    }
  }
}

async function publishCommand(
  vault,
  { output = '', title = '', description = '', scopePath = '', theme = 'minimal', clean = false, showTags = true, showBacklinks = true } = {}
) {
  const result = await publishVault({
    vault,
    output,
    title,
    description,
    scopePath,
    theme,
    clean: Boolean(clean),
    showTags,
    showBacklinks
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

function builtInTemplatesCommand(options = {}) {
  return builtInTemplateCatalog({ includeContent: Boolean(options.content) })
}

async function seedTemplatesCommand(vault, options = {}) {
  const catalog = builtInTemplateCatalog({ includeContent: true })
  const explicitKinds = options.kinds != null || options.kind != null
  const requestedKinds = parseSeedTemplateKinds(options.kinds ?? options.kind, { explicit: explicitKinds })
  const kindsByLower = new Map(catalog.templates.map((template) => [template.kind.toLowerCase(), template.kind]))
  const unknownKinds = requestedKinds.filter((kind) => !kindsByLower.has(kind.toLowerCase()))
  if (unknownKinds.length) {
    throw new Error(
      `Unknown template kind(s): ${unknownKinds.join(', ')}. Available kinds: ${catalog.templates
        .map((template) => template.kind)
        .join(', ')}`
    )
  }

  const requested = new Set(requestedKinds.map((kind) => kind.toLowerCase()))
  const selectedTemplates = requested.size
    ? catalog.templates.filter((template) => requested.has(template.kind.toLowerCase()))
    : catalog.templates
  const folder = await templatesFolder(options)
  const overwrite = Boolean(options.overwrite)
  const templates = []

  for (const template of selectedTemplates) {
    const targetName = normalizeDocPath(safeRel(template.file))
    const rel = folder ? path.posix.join(folder, targetName) : targetName
    const { clean, abs } = safeJoin(vault, rel)
    const stat = await fs.stat(abs).catch((error) => {
      if (error?.code === 'ENOENT') return null
      throw error
    })
    if (stat && !stat.isFile()) throw new Error(`Template target is not a file: ${clean}`)

    if (stat && !overwrite) {
      templates.push({
        kind: template.kind,
        label: template.label,
        path: clean,
        status: 'skipped',
        bytes: stat.size
      })
      continue
    }

    const content = String(template.content ?? '')
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, content, 'utf8')
    templates.push({
      kind: template.kind,
      label: template.label,
      path: clean,
      status: stat ? 'overwritten' : 'created',
      bytes: Buffer.byteLength(content)
    })
  }

  return {
    vault,
    templatesFolder: folder || '(vault root)',
    count: templates.length,
    created: templates.filter((template) => template.status === 'created').length,
    overwritten: templates.filter((template) => template.status === 'overwritten').length,
    skipped: templates.filter((template) => template.status === 'skipped').length,
    templates
  }
}

function builtInExtensionsCommand() {
  return builtInExtensionCatalog()
}

function formatTemplateField(field) {
  if (field.kind === 'select') return `${field.key}=[${field.options.join('|')}]`
  return field.key
}

function formatBuiltInTemplatesText(catalog) {
  return catalog.templates.map((template) => {
    const fields = template.fields.length ? template.fields.map(formatTemplateField).join(', ') : 'none'
    const summary = `${template.kind}\t${template.file}\t${template.label}\tfields: ${fields}`
    return template.content ? `${summary}\n${template.content}` : summary
  }).join('\n\n')
}

function formatSeedTemplatesText(result) {
  return [
    `Templates folder: ${result.templatesFolder}`,
    `Created: ${result.created}; Overwritten: ${result.overwritten}; Skipped: ${result.skipped}`,
    '',
    ...result.templates.map((template) => `${template.status}\t${template.kind}\t${template.path}`)
  ].join('\n')
}

function formatBuiltInExtensionsText(catalog) {
  const points = catalog.points.map((point) => (
    `${point.id}\t${point.label}\tallows: ${point.allowedContributionKinds.join(', ')}`
  ))
  const manifests = catalog.manifests.map((manifest) => {
    const contributions = manifest.contributes.map((contribution) => contribution.kind).join(', ')
    const permissions = manifest.permissions.map((permission) => permission.kind).join(', ') || 'none'
    return `${manifest.id}\t${manifest.displayName}\tcontributes: ${contributions}\tpermissions: ${permissions}`
  })
  return [
    `Extension points: ${catalog.pointCount}`,
    ...points,
    '',
    `Built-in extensions: ${catalog.count}`,
    ...manifests
  ].join('\n')
}

function noVaultCommand(command) {
  return [
    'built-in-templates',
    'starter-templates',
    'list-built-in-templates',
    'built-in-extensions',
    'extension-catalog',
    'list-built-in-extensions',
    'validate-extension',
    'validate-extensions'
  ].includes(command)
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
    case 'seedTemplates':
    case 'seed-templates':
    case 'seedStarterTemplates':
    case 'seed-starter-templates':
      return seedTemplatesCommand(vault, {
        folder: op.folder ?? op.templatesFolder,
        kinds: op.kinds ?? op.kind,
        overwrite: Boolean(op.overwrite)
      })
    case 'createFolder':
    case 'create-folder':
      return createFolderCommand(vault, op.path)
    case 'move':
      return moveCommand(vault, op.from, op.to)
    case 'search':
      return searchCommand(vault, op.query, { limit: op.limit })
    case 'analyze':
      return analyzeCommand(vault, { staleDays: staleDaysOption(op.staleDays ?? op['stale-days']) })
    case 'publish':
      return publishCommand(vault, {
        output: op.output ?? op.outDir ?? op.out,
        title: op.title,
        description: op.description,
        scopePath: op.scopePath ?? op.scope,
        theme: op.theme,
        clean: Boolean(op.clean),
        showTags: op.showTags ?? !op.noTags,
        showBacklinks: op.showBacklinks ?? !op.noBacklinks
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
    if (noVaultCommand(command)) {
      switch (command) {
        case 'built-in-templates':
        case 'starter-templates':
        case 'list-built-in-templates':
          printResult(builtInTemplatesCommand(options), { json, text: formatBuiltInTemplatesText })
          return
        case 'built-in-extensions':
        case 'extension-catalog':
        case 'list-built-in-extensions':
          printResult(builtInExtensionsCommand(), { json, text: formatBuiltInExtensionsText })
          return
        case 'validate-extension':
        case 'validate-extensions': {
          if (positional.length === 0) throw new Error('validate-extension requires at least one manifest file or folder path.')
          const validation = await validateExtensionInputs(positional, { recursive: Boolean(options.recursive) })
          printResult(validation, { json, text: formatValidationResults })
          if (!validation.valid) process.exitCode = 1
          return
        }
      }
    }

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
      case 'seed-templates':
      case 'seed-starter-templates':
        printResult(
          await seedTemplatesCommand(vault, {
            folder: options.folder ?? options.templatesFolder ?? options['templates-folder'],
            kinds: options.kinds ?? options.kind,
            overwrite: Boolean(options.overwrite)
          }),
          { json, text: formatSeedTemplatesText }
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
        printResult(await analyzeCommand(vault, { staleDays: staleDaysOption(options['stale-days'] ?? options.staleDays) }), {
          json,
          text: (analysis) => [
            `Vault: ${analysis.vault}`,
            `Markdown notes: ${analysis.totals.markdown}`,
            `Words: ${analysis.totals.words}`,
            `Tags: ${analysis.totals.tags}`,
            `Links: ${analysis.totals.links}`,
            `Broken links: ${analysis.totals.brokenLinks}`,
            `Stale notes: ${analysis.totals.staleNotes}`,
            `Duplicate title groups: ${analysis.totals.duplicateTitleGroups}`,
            `Orphan notes: ${analysis.organizeCandidates.orphanNotes.length}`,
            `Notes without tags: ${analysis.organizeCandidates.noTagNotes.length}`
          ].join('\n')
        })
        break
      case 'publish':
        printResult(await publishCommand(vault, {
          output: options.out || options.output || options.outDir,
          title: options.title,
          description: options.description,
          scopePath: options.scopePath || options.scope,
          theme: options.theme,
          clean: Boolean(options.clean),
          showTags: options.tags === false || options['no-tags'] || options.noTags ? false : true,
          showBacklinks: options.backlinks === false || options['no-backlinks'] || options.noBacklinks ? false : true
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
  builtInExtensionsCommand,
  builtInTemplatesCommand,
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
  seedTemplatesCommand,
  templatesCommand,
  writeCommand
}

if (isDirectRun()) main()
