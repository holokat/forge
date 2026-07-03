export interface Heading {
  level: number
  text: string
  line: number
}

export interface NoteMeta {
  /** Raw wikilink targets (heading/alias parts stripped) */
  links: string[]
  tags: string[]
  headings: Heading[]
}

export const WIKILINK_RE = /\[\[([^[\]]+?)\]\]/g
export const TAG_RE = /(^|[\s([])#([A-Za-z][\w/-]*)/g

/** "Note#Heading|alias" -> "Note" */
export function linkTarget(inner: string): string {
  return inner.split('|')[0].split('#')[0].trim()
}

export function linkLabel(inner: string): string {
  const parts = inner.split('|')
  return (parts[1] ?? parts[0]).trim()
}

export function parseNote(content: string): NoteMeta {
  const links: string[] = []
  const tags: string[] = []
  const headings: Heading[] = []

  for (const match of content.matchAll(WIKILINK_RE)) {
    const target = linkTarget(match[1])
    if (target && !target.startsWith('!')) links.push(target)
  }
  for (const match of content.matchAll(TAG_RE)) {
    if (!tags.includes(match[2])) tags.push(match[2])
  }

  const lines = content.split('\n')
  let inFence = false
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (inFence) return
    const m = /^(#{1,6})\s+(.+)/.exec(line)
    if (m) headings.push({ level: m[1].length, text: m[2].trim(), line: i })
  })

  return { links, tags, headings }
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
