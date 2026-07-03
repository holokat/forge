export interface Heading {
  level: number
  text: string
  line: number
}

export type PropertyValue = string | string[] | number | boolean

export interface Frontmatter {
  properties: Record<string, PropertyValue>
  raw: string
  body: string
  bodyStartLine: number
}

export interface NoteMeta {
  /** Raw wikilink targets (heading/alias parts stripped) */
  links: string[]
  tags: string[]
  headings: Heading[]
  properties: Record<string, PropertyValue>
  aliases: string[]
  title: string | null
  body: string
}

export const WIKILINK_RE = /\[\[([^[\]]+?)\]\]/g
export const TAG_RE = /(^|[\s([])#([A-Za-z][\w/-]*)/g
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** "Note#Heading|alias" -> "Note" */
export function linkTarget(inner: string): string {
  return inner.split('|')[0].split('#')[0].trim()
}

export function linkLabel(inner: string): string {
  const parts = inner.split('|')
  return (parts[1] ?? parts[0]).trim()
}

function parseScalar(value: string): PropertyValue {
  const trimmed = value.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  return trimmed.replace(/^["']|["']$/g, '')
}

function parseInlineList(value: string): string[] | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null
  return trimmed
    .slice(1, -1)
    .split(',')
    .map((item) => String(parseScalar(item)).trim())
    .filter(Boolean)
}

export function parseFrontmatter(content: string): Frontmatter {
  const match = FRONTMATTER_RE.exec(content)
  if (!match) return { properties: {}, raw: '', body: content, bodyStartLine: 0 }

  const raw = match[1]
  const properties: Record<string, PropertyValue> = {}
  const lines = raw.split(/\r?\n/)
  let listKey: string | null = null

  for (const line of lines) {
    const listItem = /^\s*-\s+(.+)$/.exec(line)
    if (listItem && listKey) {
      const current = properties[listKey]
      const values = Array.isArray(current) ? current : current === undefined ? [] : [String(current)]
      values.push(String(parseScalar(listItem[1])))
      properties[listKey] = values
      continue
    }

    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!pair) continue

    const key = pair[1]
    const value = pair[2]
    if (value.trim() === '') {
      listKey = key
      properties[key] = []
      continue
    }
    listKey = null
    const inlineList = parseInlineList(value)
    properties[key] = inlineList ?? parseScalar(value)
  }

  const bodyStartLine = match[0].split(/\r?\n/).length - 1
  return { properties, raw, body: content.slice(match[0].length), bodyStartLine }
}

function propertyStrings(value: PropertyValue | undefined): string[] {
  if (value === undefined) return []
  if (Array.isArray(value)) return value.map(String)
  return [String(value)]
}

export function parseNote(content: string): NoteMeta {
  const frontmatter = parseFrontmatter(content)
  const links: string[] = []
  const tags: string[] = []
  const headings: Heading[] = []

  for (const match of frontmatter.body.matchAll(WIKILINK_RE)) {
    const target = linkTarget(match[1])
    if (target && !target.startsWith('!')) links.push(target)
  }
  for (const match of frontmatter.body.matchAll(TAG_RE)) {
    if (!tags.includes(match[2])) tags.push(match[2])
  }
  for (const tag of propertyStrings(frontmatter.properties.tags)) {
    const clean = tag.replace(/^#/, '').trim()
    if (clean && !tags.includes(clean)) tags.push(clean)
  }

  const lines = frontmatter.body.split('\n')
  let inFence = false
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (inFence) return
    const m = /^(#{1,6})\s+(.+)/.exec(line)
    if (m) headings.push({ level: m[1].length, text: m[2].trim(), line: i + frontmatter.bodyStartLine })
  })

  const aliases = [
    ...propertyStrings(frontmatter.properties.alias),
    ...propertyStrings(frontmatter.properties.aliases)
  ].filter(Boolean)
  const title = propertyStrings(frontmatter.properties.title)[0] ?? headings[0]?.text ?? null

  return { links, tags, headings, properties: frontmatter.properties, aliases, title, body: frontmatter.body }
}

export function baseName(rel: string): string {
  const name = rel.split('/').pop() ?? rel
  return name.replace(/\.md$/i, '')
}

export function isMarkdown(rel: string): boolean {
  return /\.md$/i.test(rel)
}

export function isAudio(rel: string): boolean {
  return /\.(m4a|mp3|wav|aac|caf|ogg)$/i.test(rel)
}

export function isImage(rel: string): boolean {
  return /\.(png|jpe?g|gif|svg|webp)$/i.test(rel)
}

export function noteDisplayTitle(path: string, meta?: Pick<NoteMeta, 'title'>): string {
  return meta?.title || baseName(path)
}

/** Resolve a wikilink target to a file path within `files`. */
export function resolveLink(target: string, files: string[]): string | null {
  const t = target.toLowerCase()
  const withExt = t.endsWith('.md') ? t : t + '.md'
  // Full path match first, then basename match (Obsidian-style shortest path)
  for (const f of files) {
    if (f.toLowerCase() === withExt || f.toLowerCase() === t) return f
  }
  for (const f of files) {
    const base = f.split('/').pop()!.toLowerCase()
    if (base === withExt || base === t) return f
  }
  return null
}

export function wordCount(text: string): { words: number; chars: number } {
  const words = text.split(/\s+/).filter(Boolean).length
  return { words, chars: text.length }
}
