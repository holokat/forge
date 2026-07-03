import fs from 'node:fs/promises'
import path from 'node:path'
import { Marked } from 'marked'

const GENERATOR = 'forge-static-publisher'
const MARKER_FILE = '.forge-publish.json'
const WIKILINK_RE = /(!?)\[\[([^[\]]+?)\]\]/g
const TAG_RE = /(^|[\s([])#([A-Za-z][\w/-]*)/g
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const MARKDOWN_LINK_RE = /(!?)\[([^\]\n]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g
const EXTERNAL_REF_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i
const IMAGE_EXT_RE = /\.(?:apng|avif|gif|jpe?g|png|svg|webp)$/i
const AUDIO_EXT_RE = /\.(?:aac|aiff?|flac|m4a|mp3|oga|ogg|opus|wav|webm)$/i
const VIDEO_EXT_RE = /\.(?:m4v|mov|mp4|ogv|webm)$/i
const PUBLISH_THEMES = [
  'minimal',
  'editorial',
  'reference',
  'quiet-paper',
  'terminal-ledger',
  'swiss-ledger',
  'soft-focus',
  'field-notes'
]
const BLOG_THEMES = new Set(['quiet-paper', 'terminal-ledger', 'swiss-ledger', 'soft-focus', 'field-notes'])

function slash(value) {
  return value.split(path.sep).join('/')
}

function expandHome(value) {
  if (value === '~') return process.env.HOME ?? value
  if (value.startsWith('~/')) return path.join(process.env.HOME ?? '', value.slice(2))
  return value
}

function normalizeScopePath(value) {
  if (!value) return ''
  const normalized = String(value)
    .replaceAll('\\', '/')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
  if (normalized.some((part) => part === '.' || part === '..')) {
    throw new Error('Publish scope must stay inside the vault.')
  }
  return normalized.join('/')
}

function isPathInScope(rel, scopePath) {
  return !scopePath || rel === scopePath || rel.startsWith(`${scopePath}/`)
}

function normalizeTheme(value) {
  return PUBLISH_THEMES.includes(value) ? value : 'minimal'
}

function isMarkdown(rel) {
  return /\.md$/i.test(rel)
}

function withoutMarkdownExt(rel) {
  return rel.replace(/\.md$/i, '')
}

function noteOutputPath(rel) {
  return `notes/${withoutMarkdownExt(rel)}.html`
}

function assetOutputPath(rel) {
  return `assets/${rel}`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, '&#39;')
}

function stripInlineMarkdown(value) {
  return String(value ?? '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]/g, '')
    .trim()
}

function slugify(value, fallback = 'section') {
  const slug = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}\s/_-]/gu, '')
    .replace(/[\/_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || fallback
}

function uniqueSlug(value, used, fallback) {
  const base = slugify(value, fallback)
  let slug = base
  let index = 2
  while (used.has(slug)) {
    slug = `${base}-${index}`
    index += 1
  }
  used.add(slug)
  return slug
}

function encodePathForHref(rel) {
  return rel
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

function relativeHref(fromOutputPath, toOutputPath, hash = '') {
  const fromDir = path.posix.dirname(fromOutputPath)
  let rel = path.posix.relative(fromDir, toOutputPath)
  if (!rel) rel = path.posix.basename(toOutputPath)
  if (!rel.startsWith('.')) rel = `./${rel}`
  return `${encodePathForHref(rel)}${hash ? `#${encodeURIComponent(hash)}` : ''}`
}

function splitOnce(value, separator) {
  const index = value.indexOf(separator)
  if (index === -1) return [value, '']
  return [value.slice(0, index), value.slice(index + separator.length)]
}

function parseWikiInner(inner) {
  const [targetPart, alias] = splitOnce(inner.trim(), '|')
  const [docTarget, headingTarget] = splitOnce(targetPart.trim(), '#')
  const fallbackLabel = headingTarget || path.posix.basename(docTarget).replace(/\.md$/i, '') || targetPart
  return {
    docTarget: docTarget.trim(),
    headingTarget: headingTarget.trim(),
    label: (alias || fallbackLabel).trim() || targetPart.trim()
  }
}

function stripFrontMatter(content) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { body: content, data: {} }
  }

  const lines = content.split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() !== '---' && lines[i].trim() !== '...') continue

    const data = {}
    for (const line of lines.slice(1, i)) {
      const match = /^([A-Za-z0-9_-]+):\s*(.+?)\s*$/.exec(line)
      if (!match) continue
      data[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }

    return { body: lines.slice(i + 1).join('\n'), data }
  }

  return { body: content, data: {} }
}

function markdownLinkTargets(body) {
  const targets = []
  for (const match of body.matchAll(MARKDOWN_LINK_RE)) {
    if (match[1]) continue
    const href = normalizeMarkdownHref(match[3])
    if (!href || EXTERNAL_REF_RE.test(href) || href.startsWith('#')) continue
    targets.push({ kind: 'markdown', raw: match[0], href, label: match[2] || href })
  }
  return targets
}

function normalizeMarkdownHref(rawHref) {
  return String(rawHref ?? '').trim().replace(/^<|>$/g, '')
}

function parseNote(content, rel) {
  const { body, data } = stripFrontMatter(content)
  const rawLinks = []
  const tags = []
  const headings = []
  const usedHeadingSlugs = new Set()
  const lines = body.split(/\r?\n/)
  let inFence = false

  for (const match of body.matchAll(WIKILINK_RE)) {
    const parsed = parseWikiInner(match[2])
    rawLinks.push({
      kind: 'wiki',
      embed: Boolean(match[1]),
      raw: match[0],
      target: parsed.docTarget,
      heading: parsed.headingTarget,
      label: parsed.label
    })
  }

  rawLinks.push(...markdownLinkTargets(body))

  for (const match of body.matchAll(TAG_RE)) {
    if (!tags.includes(match[2])) tags.push(match[2])
  }

  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return

    const match = HEADING_RE.exec(line)
    if (!match) return

    const text = stripInlineMarkdown(match[2])
    headings.push({
      level: match[1].length,
      text,
      slug: uniqueSlug(text, usedHeadingSlugs, `heading-${index + 1}`),
      line: index
    })
  })

  return {
    body,
    data,
    rawLinks,
    tags,
    headings,
    words: body.split(/\s+/).filter(Boolean).length,
    chars: body.length,
    title: data.title || headings[0]?.text || path.posix.basename(rel).replace(/\.md$/i, '')
  }
}

function decodeHrefPath(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function splitHref(href) {
  const [beforeHash, hash = ''] = splitOnce(href, '#')
  const [pathname, query = ''] = splitOnce(beforeHash, '?')
  return { pathname: decodeHrefPath(pathname), query, hash: decodeHrefPath(hash) }
}

function normalizeVaultRelFromHref(currentNotePath, hrefPath) {
  const clean = hrefPath.replaceAll('\\', '/').trim()
  if (!clean) return ''

  const base = clean.startsWith('/') ? '' : path.posix.dirname(currentNotePath)
  const joined = clean.startsWith('/') ? clean.slice(1) : path.posix.join(base, clean)
  const normalized = path.posix.normalize(joined)
  if (normalized === '.' || normalized.startsWith('../') || normalized === '..') return null
  return normalized
}

function resolveNoteTarget(target, currentNotePath, filePaths) {
  if (!target) return currentNotePath

  const normalizedTarget = target.replaceAll('\\', '/').trim()
  const fromHref = normalizeVaultRelFromHref(currentNotePath, normalizedTarget)
  const candidates = []
  if (fromHref) {
    candidates.push(fromHref)
    if (!/\.md$/i.test(fromHref)) candidates.push(`${fromHref}.md`)
  }

  const lowered = normalizedTarget.toLowerCase()
  const loweredWithExt = lowered.endsWith('.md') ? lowered : `${lowered}.md`
  for (const candidate of candidates) {
    const exact = filePaths.find((file) => file.toLowerCase() === candidate.toLowerCase())
    if (exact) return exact
  }
  for (const file of filePaths) {
    const lower = file.toLowerCase()
    if (lower === lowered || lower === loweredWithExt) return file
  }
  for (const file of filePaths) {
    const lowerBase = path.posix.basename(file).toLowerCase()
    if (lowerBase === lowered || lowerBase === loweredWithExt) return file
  }
  return null
}

function resolveMarkdownNoteHref(href, currentNotePath, filePaths) {
  const { pathname, hash } = splitHref(href)
  if (!pathname && hash) return { resolved: currentNotePath, heading: hash }
  if (!pathname) return { resolved: null, heading: hash }

  const rel = normalizeVaultRelFromHref(currentNotePath, pathname)
  if (!rel) return { resolved: null, heading: hash }
  const exact = filePaths.find((file) => file.toLowerCase() === rel.toLowerCase())
  if (exact) return { resolved: exact, heading: hash }
  if (!/\.md$/i.test(rel)) {
    const withExt = filePaths.find((file) => file.toLowerCase() === `${rel}.md`.toLowerCase())
    if (withExt) return { resolved: withExt, heading: hash }
  }
  if (/\.md$/i.test(rel)) return { resolved: resolveNoteTarget(rel, currentNotePath, filePaths), heading: hash }
  return { resolved: null, heading: hash }
}

function resolveAssetHref(href, currentNotePath, assetPaths) {
  const { pathname, query, hash } = splitHref(href)
  if (!pathname || EXTERNAL_REF_RE.test(pathname)) return null

  const rel = normalizeVaultRelFromHref(currentNotePath, pathname)
  if (!rel) return null
  const resolved = assetPaths.find((file) => file.toLowerCase() === rel.toLowerCase())
  if (!resolved) return null
  return { resolved, query, hash }
}

function resolveAssetTarget(target, currentNotePath, assetPaths) {
  if (!target) return null
  const normalizedTarget = target.replaceAll('\\', '/').trim()
  const fromHref = normalizeVaultRelFromHref(currentNotePath, normalizedTarget)
  if (fromHref) {
    const exact = assetPaths.find((file) => file.toLowerCase() === fromHref.toLowerCase())
    if (exact) return exact
  }
  const lowered = normalizedTarget.toLowerCase()
  return assetPaths.find((file) => file.toLowerCase() === lowered || path.posix.basename(file).toLowerCase() === lowered) ?? null
}

function headingHash(note, headingTarget) {
  if (!headingTarget) return ''
  const normalized = headingTarget.trim().toLowerCase()
  return note.headings.find((heading) => heading.text.toLowerCase() === normalized)?.slug ?? slugify(headingTarget)
}

function dedupeLinks(links) {
  const seen = new Set()
  const deduped = []
  for (const link of links) {
    const key = [link.kind === 'backlink' ? 'backlink' : 'link', link.resolved ?? link.target ?? link.href, link.heading].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(link)
  }
  return deduped
}

async function scanVault(vault, { excludeAbs = '' } = {}) {
  const files = []
  const folders = []
  const normalizedExclude = excludeAbs ? path.resolve(excludeAbs) : ''

  async function walk(dir) {
    const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue

      const abs = path.join(dir, entry.name)
      if (normalizedExclude && (abs === normalizedExclude || abs.startsWith(`${normalizedExclude}${path.sep}`))) continue

      const rel = slash(path.relative(vault, abs))
      if (entry.isDirectory()) {
        folders.push(rel)
        await walk(abs)
      } else if (entry.isFile()) {
        const stat = await fs.stat(abs)
        files.push({
          path: rel,
          abs,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          markdown: isMarkdown(rel)
        })
      }
    }
  }

  await walk(vault)
  return { folders, files }
}

function buildTagIndex(notes) {
  const byTag = new Map()
  for (const note of notes) {
    for (const tag of note.tags) {
      if (!byTag.has(tag)) byTag.set(tag, [])
      byTag.get(tag).push(note)
    }
  }

  const used = new Set()
  return [...byTag.entries()]
    .map(([tag, taggedNotes]) => ({
      tag,
      notes: taggedNotes.sort((a, b) => a.title.localeCompare(b.title)),
      outputPath: `tags/${uniqueSlug(tag, used, 'tag')}.html`
    }))
    .sort((a, b) => b.notes.length - a.notes.length || a.tag.localeCompare(b.tag))
}

function enrichLinks(notes, tagIndex) {
  const filePaths = notes.map((note) => note.path)
  const byPath = new Map(notes.map((note) => [note.path, note]))
  const backlinks = new Map(notes.map((note) => [note.path, []]))
  const brokenLinks = []

  for (const note of notes) {
    const links = []
    for (const raw of note.rawLinks) {
      if (raw.embed) continue

      if (raw.kind === 'wiki') {
        const resolved = resolveNoteTarget(raw.target, note.path, filePaths)
        if (!resolved) {
          brokenLinks.push({ source: note.path, target: raw.target || raw.heading, label: raw.label })
          continue
        }
        const heading = headingHash(byPath.get(resolved), raw.heading)
        links.push({ ...raw, resolved, heading })
        backlinks.get(resolved).push({ source: note.path, label: raw.label, heading })
        continue
      }

      if (raw.kind === 'markdown') {
        const resolved = resolveMarkdownNoteHref(raw.href, note.path, filePaths)
        if (!resolved.resolved) continue

        const targetNote = byPath.get(resolved.resolved)
        const heading = targetNote ? headingHash(targetNote, resolved.heading) : resolved.heading
        links.push({ ...raw, resolved: resolved.resolved, heading })
        backlinks.get(resolved.resolved).push({ source: note.path, label: raw.label, heading })
      }
    }
    note.links = dedupeLinks(links)
  }

  for (const note of notes) {
    note.backlinks = dedupeLinks(
      (backlinks.get(note.path) ?? []).map((link) => ({
        kind: 'backlink',
        resolved: link.source,
        label: byPath.get(link.source)?.title ?? link.source,
        heading: ''
      }))
    )
  }

  const tagPagesByTag = new Map(tagIndex.map((entry) => [entry.tag, entry]))
  for (const note of notes) {
    note.tagPages = note.tags.map((tag) => tagPagesByTag.get(tag)).filter(Boolean)
  }

  return { brokenLinks }
}

function renderTagChip(tag, fromOutputPath, tagIndex, className = 'tag') {
  const tagPage = tagIndex.find((entry) => entry.tag === tag)
  if (!tagPage) return `<span class="${className}">#${escapeHtml(tag)}</span>`
  return `<a class="${className}" href="${relativeHref(fromOutputPath, tagPage.outputPath)}">#${escapeHtml(tag)}</a>`
}

function renderNoteLink(note, fromOutputPath, className = 'note-link') {
  return `<a class="${className}" href="${relativeHref(fromOutputPath, note.outputPath)}">${escapeHtml(note.title)}</a>`
}

function renderLinkList(links, notesByPath, fromOutputPath, emptyText) {
  if (!links.length) return `<p class="empty-state">${escapeHtml(emptyText)}</p>`
  return `<ul class="link-list">${links
    .map((link) => {
      const note = notesByPath.get(link.resolved)
      if (!note) return ''
      const hash = link.heading || ''
      return `<li><a href="${relativeHref(fromOutputPath, note.outputPath, hash)}">${escapeHtml(note.title)}</a></li>`
    })
    .join('')}</ul>`
}

function renderMarkdown(note, site) {
  let headingIndex = 0

  const wikilinkExt = {
    name: 'wikilink',
    level: 'inline',
    start(src) {
      const index = src.search(/!?\[\[/)
      return index < 0 ? undefined : index
    },
    tokenizer(src) {
      const match = /^(!?)\[\[([^[\]]+?)\]\]/.exec(src)
      if (!match) return undefined
      return { type: 'wikilink', raw: match[0], embed: Boolean(match[1]), inner: match[2] }
    },
    renderer(token) {
      const parsed = parseWikiInner(token.inner)
      if (token.embed) {
        const asset = resolveAssetTarget(parsed.docTarget, note.path, site.assetPaths)
        if (asset && IMAGE_EXT_RE.test(asset)) {
          return `<img class="embed" src="${relativeHref(note.outputPath, assetOutputPath(asset))}" alt="${escapeAttribute(parsed.label)}" loading="lazy">`
        }
        if (asset && AUDIO_EXT_RE.test(asset)) {
          return `<audio class="embed-audio" controls preload="metadata" src="${relativeHref(note.outputPath, assetOutputPath(asset))}"></audio>`
        }
        if (asset && VIDEO_EXT_RE.test(asset)) {
          return `<video class="embed-video" controls preload="metadata" playsinline src="${relativeHref(note.outputPath, assetOutputPath(asset))}"></video>`
        }
      }

      const resolved = resolveNoteTarget(parsed.docTarget, note.path, site.filePaths)
      if (!resolved) {
        return `<span class="internal-link unresolved">${escapeHtml(parsed.label)}</span>`
      }
      const targetNote = site.notesByPath.get(resolved)
      const hash = targetNote ? headingHash(targetNote, parsed.headingTarget) : ''
      return `<a class="internal-link" href="${relativeHref(note.outputPath, targetNote.outputPath, hash)}">${escapeHtml(parsed.label)}</a>`
    }
  }

  const hashtagExt = {
    name: 'hashtag',
    level: 'inline',
    start(src) {
      const index = src.search(/#[A-Za-z]/)
      return index < 0 ? undefined : index
    },
    tokenizer(src, tokens) {
      const match = /^#[A-Za-z][\w/-]*/.exec(src)
      if (!match) return undefined
      const previous = tokens[tokens.length - 1]
      if (previous && previous.type === 'text' && /\S$/.test(previous.raw)) return undefined
      return { type: 'hashtag', raw: match[0], tag: match[0].slice(1) }
    },
    renderer(token) {
      return renderTagChip(token.tag, note.outputPath, site.tagIndex)
    }
  }

  const renderer = {
    heading(token) {
      const heading = note.headings[headingIndex]
      headingIndex += 1
      const slug = heading?.slug ?? slugify(token.text)
      const body = this.parser.parseInline(token.tokens)
      return `<h${token.depth} id="${escapeAttribute(slug)}">${body}<a class="heading-anchor" href="#${escapeAttribute(slug)}" aria-label="Link to this heading">#</a></h${token.depth}>`
    },
    html(token) {
      return escapeHtml(token.raw)
    },
    image(token) {
      const href = normalizeMarkdownHref(token.href)
      if (EXTERNAL_REF_RE.test(href) || href.startsWith('data:')) {
        return `<img class="embed" src="${escapeAttribute(href)}" alt="${escapeAttribute(token.text)}" loading="lazy">`
      }

      const asset = resolveAssetHref(href, note.path, site.assetPaths)
      if (!asset) {
        return `<span class="missing-asset">${escapeHtml(token.text || href)}</span>`
      }

      const suffix = `${asset.query ? `?${asset.query}` : ''}${asset.hash ? `#${encodeURIComponent(asset.hash)}` : ''}`
      return `<img class="embed" src="${relativeHref(note.outputPath, assetOutputPath(asset.resolved))}${suffix}" alt="${escapeAttribute(token.text)}" loading="lazy">`
    },
    link(token) {
      const href = normalizeMarkdownHref(token.href)
      const body = this.parser.parseInline(token.tokens)
      const title = token.title ? ` title="${escapeAttribute(token.title)}"` : ''

      if (EXTERNAL_REF_RE.test(href) || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return `<a class="external-link" href="${escapeAttribute(href)}" target="_blank" rel="noreferrer"${title}>${body}</a>`
      }
      if (href.startsWith('#')) {
        return `<a class="internal-link" href="${escapeAttribute(href)}"${title}>${body}</a>`
      }

      const noteTarget = resolveMarkdownNoteHref(href, note.path, site.filePaths)
      if (noteTarget.resolved) {
        const targetNote = site.notesByPath.get(noteTarget.resolved)
        const hash = headingHash(targetNote, noteTarget.heading)
        return `<a class="internal-link" href="${relativeHref(note.outputPath, targetNote.outputPath, hash)}"${title}>${body}</a>`
      }

      const asset = resolveAssetHref(href, note.path, site.assetPaths)
      if (asset) {
        return `<a class="asset-link" href="${relativeHref(note.outputPath, assetOutputPath(asset.resolved))}"${title}>${body}</a>`
      }

      return `<a class="external-link unresolved" href="${escapeAttribute(href)}"${title}>${body}</a>`
    }
  }

  const marked = new Marked({
    gfm: true,
    breaks: false,
    extensions: [wikilinkExt, hashtagExt],
    renderer
  })

  return marked.parse(note.body, { async: false })
}

function pageShell({ title, site, description = '', currentOutputPath, body, navNotes, tagIndex }) {
  const stylesheetHref = relativeHref(currentOutputPath, '_forge/styles.css')
  const scriptHref = relativeHref(currentOutputPath, '_forge/site.js')
  const homeHref = relativeHref(currentOutputPath, 'index.html')
  const noteItems = navNotes
    .map((note) => `<li>${renderNoteLink(note, currentOutputPath, 'sidebar-link')}</li>`)
    .join('')
  const tagNav = site.showTags
    ? `<nav class="sidebar-section" aria-label="Tags">
        <h2>Tags</h2>
        <ul>${tagIndex
          .slice(0, 24)
          .map((entry) => `<li><a href="${relativeHref(currentOutputPath, entry.outputPath)}">#${escapeHtml(entry.tag)} <span>${entry.notes.length}</span></a></li>`)
          .join('')}</ul>
      </nav>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="${GENERATOR}">
  ${description ? `<meta name="description" content="${escapeAttribute(description)}">` : ''}
  <title>${escapeHtml(title)} - ${escapeHtml(site.title)}</title>
  <link rel="stylesheet" href="${stylesheetHref}">
  <script src="${scriptHref}" defer></script>
</head>
<body class="site-theme-${escapeAttribute(site.theme)}">
  <a class="skip-link" href="#content">Skip to content</a>
  <div class="site-shell">
    <aside class="site-sidebar" aria-label="Site navigation">
      <div class="site-brand">
        <a href="${homeHref}">${escapeHtml(site.title)}</a>
        <span>${escapeHtml(site.scopePath ? site.scopePath : 'Forge publish')}</span>
        ${site.description ? `<p>${escapeHtml(site.description)}</p>` : ''}
      </div>
      <nav class="sidebar-section" aria-label="Notes">
        <h2>Notes</h2>
        <ul>${noteItems}</ul>
      </nav>
      ${tagNav}
    </aside>
    <main id="content" class="site-main">
${body}
    </main>
  </div>
</body>
</html>
`
}

function renderStats(stats) {
  return `<dl class="stats-grid">
    <div><dt>Notes</dt><dd>${stats.notes}</dd></div>
    <div><dt>Tags</dt><dd>${stats.tags}</dd></div>
    <div><dt>Links</dt><dd>${stats.links}</dd></div>
    <div><dt>Assets</dt><dd>${stats.assets}</dd></div>
  </dl>`
}

function dateForNote(note) {
  const raw = note.data?.date || note.modified
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : new Date(raw)
  return Number.isNaN(date.getTime()) ? new Date(0) : date
}

function formatNoteDate(note, format = 'long') {
  const date = dateForNote(note)
  if (format === 'iso') return date.toISOString().slice(0, 10)
  if (format === 'year') return String(date.getUTCFullYear())
  if (format === 'monthYear') {
    return `${date.toLocaleString('en', { month: 'short', timeZone: 'UTC' }).toUpperCase()} ${date.getUTCFullYear()}`
  }
  if (format === 'monthDay') return date.toLocaleString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  if (format === 'dot') {
    return `${String(date.getUTCMonth() + 1).padStart(2, '0')}.${String(date.getUTCDate()).padStart(2, '0')}`
  }
  return date.toLocaleString('en', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function noteTag(note) {
  return String(note.data?.tag || note.tags[0] || path.posix.dirname(note.path).split('/').filter(Boolean).pop() || 'note')
}

function noteReadTime(note) {
  return String(note.data?.read || `${Math.max(1, Math.round(note.words / 220))} min read`)
}

function noteExcerpt(note) {
  if (note.data?.excerpt) return String(note.data.excerpt)
  const paragraph = note.body
    .split(/\n{2,}/)
    .map((block) => stripInlineMarkdown(block.replace(/^#+\s+/gm, '').replace(/^>\s?/gm, '')))
    .find((block) => block && !block.startsWith('---'))
  if (!paragraph) return `${note.words} words from ${note.path}.`
  return paragraph.length > 165 ? `${paragraph.slice(0, 162).trim()}...` : paragraph
}

function blogNotes(site, notes = site.notes) {
  return [...notes].sort((a, b) => dateForNote(b).getTime() - dateForNote(a).getTime() || a.title.localeCompare(b.title))
}

function blogNotesByYear(site, notes = site.notes) {
  const groups = new Map()
  for (const note of blogNotes(site, notes)) {
    const year = formatNoteDate(note, 'year')
    if (!groups.has(year)) groups.set(year, [])
    groups.get(year).push(note)
  }
  return [...groups.entries()].map(([year, items]) => ({ year, items }))
}

function blogHeader(site, currentOutputPath, variant = '') {
  const homeHref = relativeHref(currentOutputPath, 'index.html')
  const brand = escapeHtml(site.title)
  return `<header class="blog-header ${variant}">
    <a class="blog-brand" href="${homeHref}">${brand}</a>
    <nav class="blog-nav" aria-label="Site">
      <a href="${homeHref}">writing</a>
      <button class="theme-toggle" type="button" data-theme-toggle aria-label="Toggle color theme">
        <span class="theme-toggle-sun">Light</span>
        <span class="theme-toggle-moon">Dark</span>
      </button>
    </nav>
  </header>`
}

function blogShell({ title, site, description = '', currentOutputPath, body, headerVariant = '' }) {
  const stylesheetHref = relativeHref(currentOutputPath, '_forge/styles.css')
  const scriptHref = relativeHref(currentOutputPath, '_forge/site.js')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="${GENERATOR}">
  ${description ? `<meta name="description" content="${escapeAttribute(description)}">` : ''}
  <title>${escapeHtml(title)} - ${escapeHtml(site.title)}</title>
  <link rel="stylesheet" href="${stylesheetHref}">
  <script src="${scriptHref}" defer></script>
</head>
<body class="site-theme-${escapeAttribute(site.theme)}">
  <a class="skip-link" href="#content">Skip to content</a>
  <div class="reading-progress" data-progress></div>
  ${blogHeader(site, currentOutputPath, headerVariant)}
  <main id="content">
${body}
  </main>
</body>
</html>
`
}

function renderQuietPaperIndex(site, notes = site.notes, title = site.title, description = site.description, outputPath = 'index.html') {
  const groups = blogNotesByYear(site, notes)
  return blogShell({
    title,
    site,
    description,
    currentOutputPath: outputPath,
    body: `    <section class="quiet-index blog-reveal">
      <p class="quiet-bio">${escapeHtml(description || `Notes, essays, and reference material from ${site.title}.`)}</p>
      <div class="quiet-year-groups" data-stagger>
        ${groups
          .map(
            (group) => `<section class="quiet-year">
          <div class="quiet-year-label">${escapeHtml(group.year)}</div>
          ${group.items
            .map(
              (note) => `<a class="quiet-row" href="${relativeHref(outputPath, note.outputPath)}">
            <span>${escapeHtml(formatNoteDate(note, 'monthDay'))}</span>
            <strong>${escapeHtml(note.title)}</strong>
          </a>`
            )
            .join('')}
        </section>`
          )
          .join('')}
      </div>
    </section>`
  })
}

function renderTerminalIndex(site, notes = site.notes, title = site.title, description = site.description, outputPath = 'index.html') {
  const sorted = blogNotes(site, notes)
  return blogShell({
    title,
    site,
    description,
    currentOutputPath: outputPath,
    headerVariant: 'terminal',
    body: `    <section class="terminal-index blog-reveal">
      <div class="terminal-bio">
        <p>${escapeHtml(description || `A local Markdown ledger published from ${site.title}.`)}</p>
        <span aria-hidden="true"></span>
      </div>
      <div class="terminal-table" data-stagger>
        <div class="terminal-table-head"><span>NO.</span><span>DATE</span><span>TITLE</span><span>TAG</span></div>
        ${sorted
          .map(
            (note, index) => `<a class="terminal-row" href="${relativeHref(outputPath, note.outputPath)}">
          <span>${String(index + 1).padStart(3, '0')}</span>
          <span>${escapeHtml(formatNoteDate(note, 'iso'))}</span>
          <strong>${escapeHtml(note.title)}</strong>
          <span>${escapeHtml(noteTag(note))}</span>
        </a>`
          )
          .join('')}
      </div>
    </section>`
  })
}

function renderSwissIndex(site, notes = site.notes, title = site.title, description = site.description, outputPath = 'index.html') {
  const sorted = blogNotes(site, notes)
  return blogShell({
    title,
    site,
    description,
    currentOutputPath: outputPath,
    headerVariant: 'swiss',
    body: `    <section class="swiss-index blog-reveal">
      <h1>${escapeHtml(site.title)}<span>.</span></h1>
      <p>${escapeHtml(description || 'Published notes from a local Forge vault.')}</p>
      <div class="swiss-rows" data-stagger>
        ${sorted
          .map(
            (note, index) => `<a class="swiss-row" href="${relativeHref(outputPath, note.outputPath)}">
          <span>${String(index + 1).padStart(2, '0')}</span>
          <span>${escapeHtml(formatNoteDate(note, 'monthYear'))}</span>
          <strong>${escapeHtml(note.title)}</strong>
        </a>`
          )
          .join('')}
      </div>
    </section>`
  })
}

function renderSoftFocusIndex(site, notes = site.notes, title = site.title, description = site.description, outputPath = 'index.html') {
  const sorted = blogNotes(site, notes)
  return blogShell({
    title,
    site,
    description,
    currentOutputPath: outputPath,
    headerVariant: 'soft',
    body: `    <section class="soft-index blog-reveal">
      <div class="soft-dot" aria-hidden="true"></div>
      <h1>${escapeHtml(site.title)}</h1>
      <p>${escapeHtml(description || 'A focused stream of local Markdown writing.')}</p>
      <div class="soft-label">Writing</div>
      <div class="soft-rows" data-stagger>
        ${sorted
          .map(
            (note) => `<a class="soft-row" href="${relativeHref(outputPath, note.outputPath)}">
          <strong>${escapeHtml(note.title)}</strong>
          <span>${escapeHtml(formatNoteDate(note, 'monthDay'))}</span>
        </a>`
          )
          .join('')}
      </div>
    </section>`
  })
}

function renderFieldNotesIndex(site, notes = site.notes, title = site.title, description = site.description, outputPath = 'index.html') {
  const sorted = blogNotes(site, notes)
  return blogShell({
    title,
    site,
    description,
    currentOutputPath: outputPath,
    headerVariant: 'field',
    body: `    <section class="field-index blog-reveal">
      <aside class="field-rail">
        <span>est. ${escapeHtml(formatNoteDate(sorted[0] ?? { modified: new Date().toISOString(), data: {} }, 'year'))}</span>
        <span>${escapeHtml(site.scopePath || 'local vault')}</span>
        <span>${escapeHtml(site.stats.notes)} entries</span>
      </aside>
      <div class="field-main">
        <h1>${escapeHtml(site.title)}<em>.</em></h1>
        <p>${escapeHtml(description || 'Archival notes, public entries, and working knowledge.')}</p>
        <div class="field-rows" data-stagger>
          ${sorted
            .map(
              (note) => `<a class="field-row" href="${relativeHref(outputPath, note.outputPath)}">
            <span>${escapeHtml(formatNoteDate(note, 'dot'))}</span>
            <strong>${escapeHtml(note.title)}</strong>
          </a>`
            )
            .join('')}
        </div>
      </div>
    </section>`
  })
}

function renderBlogIndexPage(site, notes = site.notes, title = site.title, description = site.description, outputPath = 'index.html') {
  if (site.theme === 'quiet-paper') return renderQuietPaperIndex(site, notes, title, description, outputPath)
  if (site.theme === 'terminal-ledger') return renderTerminalIndex(site, notes, title, description, outputPath)
  if (site.theme === 'swiss-ledger') return renderSwissIndex(site, notes, title, description, outputPath)
  if (site.theme === 'soft-focus') return renderSoftFocusIndex(site, notes, title, description, outputPath)
  if (site.theme === 'field-notes') return renderFieldNotesIndex(site, notes, title, description, outputPath)
  return ''
}

function renderIndexPage(site) {
  if (BLOG_THEMES.has(site.theme)) return renderBlogIndexPage(site)

  const outputPath = 'index.html'
  const noteCards = site.notes
    .map(
      (note) => `<article class="note-card">
        <p class="note-path">${escapeHtml(note.path)}</p>
        <h2>${renderNoteLink(note, outputPath)}</h2>
        <p>${note.words} words</p>
        ${site.showTags ? `<div class="tag-row">${note.tags.map((tag) => renderTagChip(tag, outputPath, site.tagIndex)).join('')}</div>` : ''}
      </article>`
    )
    .join('')
  const tagCloud = site.tagIndex
    .map((entry) => `<a class="tag-cloud-item" href="${relativeHref(outputPath, entry.outputPath)}">#${escapeHtml(entry.tag)} <span>${entry.notes.length}</span></a>`)
    .join('')
  const broken = site.brokenLinks.length
    ? `<section class="content-section">
        <h2>Broken wikilinks</h2>
        <ul class="link-list">${site.brokenLinks
          .map((link) => `<li>${escapeHtml(link.source)} -> ${escapeHtml(link.target)}</li>`)
          .join('')}</ul>
      </section>`
    : ''

  return pageShell({
    title: 'Index',
    site,
    description: site.description || `${site.notes.length} published Forge notes`,
    currentOutputPath: outputPath,
    navNotes: site.notes,
    tagIndex: site.tagIndex,
    body: `      <header class="page-header">
        <p class="eyebrow">${escapeHtml(site.scopePath ? 'Folder site' : 'Static vault')}</p>
        <h1>${escapeHtml(site.title)}</h1>
        <p>${escapeHtml(site.description || `${site.notes.length} notes rendered from Markdown with local links, backlinks, tags, and assets.`)}</p>
      </header>
      ${renderStats(site.stats)}
      <section class="content-section">
        <h2>All notes</h2>
        <div class="note-grid">${noteCards || '<p class="empty-state">No Markdown notes found.</p>'}</div>
      </section>
      ${site.showTags ? `<section class="content-section">
        <h2>Tags</h2>
        <div class="tag-cloud">${tagCloud || '<p class="empty-state">No tags found.</p>'}</div>
      </section>` : ''}
      ${broken}`
  })
}

function renderTagPage(site, tagPage) {
  if (BLOG_THEMES.has(site.theme)) {
    return renderBlogIndexPage(
      site,
      tagPage.notes,
      `#${tagPage.tag}`,
      `${tagPage.notes.length} ${tagPage.notes.length === 1 ? 'entry' : 'entries'} tagged with #${tagPage.tag}.`,
      tagPage.outputPath
    )
  }

  const outputPath = tagPage.outputPath
  const notes = tagPage.notes
    .map(
      (note) => `<article class="note-card">
        <p class="note-path">${escapeHtml(note.path)}</p>
        <h2>${renderNoteLink(note, outputPath)}</h2>
        <p>${note.words} words</p>
      </article>`
    )
    .join('')

  return pageShell({
    title: `#${tagPage.tag}`,
    site,
    currentOutputPath: outputPath,
    navNotes: site.notes,
    tagIndex: site.tagIndex,
    body: `      <header class="page-header">
        <p class="eyebrow">Tag</p>
        <h1>#${escapeHtml(tagPage.tag)}</h1>
        <p>${tagPage.notes.length} ${tagPage.notes.length === 1 ? 'note' : 'notes'} tagged with #${escapeHtml(tagPage.tag)}.</p>
      </header>
      <section class="content-section">
        <h2>Tagged notes</h2>
        <div class="note-grid">${notes}</div>
      </section>`
  })
}

function renderBlogToc(note) {
  if (!note.headings.length) return ''
  return `<nav class="blog-toc" aria-label="Contents">
    <div>Contents</div>
    ${note.headings
      .filter((heading) => heading.level <= 3)
      .map((heading) => `<a href="#${escapeAttribute(heading.slug)}">${escapeHtml(heading.text)}</a>`)
      .join('')}
  </nav>`
}

function renderBlogPager(site, note, index) {
  const sorted = blogNotes(site)
  const newer = sorted[index - 1]
  const older = sorted[index + 1]
  if (!newer && !older) return ''
  return `<nav class="blog-pager" aria-label="Adjacent notes">
    ${older ? `<a href="${relativeHref(note.outputPath, older.outputPath)}"><span>Previous</span><strong>${escapeHtml(older.title)}</strong></a>` : '<span></span>'}
    ${newer ? `<a href="${relativeHref(note.outputPath, newer.outputPath)}"><span>Next</span><strong>${escapeHtml(newer.title)}</strong></a>` : '<span></span>'}
  </nav>`
}

function renderBlogRelations(site, note) {
  if (!site.showBacklinks && !note.links.length) return ''
  const sections = [
    note.links.length
      ? `<div><h2>Links</h2>${renderLinkList(note.links, site.notesByPath, note.outputPath, 'No outgoing note links.')}</div>`
      : '',
    site.showBacklinks && note.backlinks.length
      ? `<div><h2>Backlinks</h2>${renderLinkList(note.backlinks, site.notesByPath, note.outputPath, 'No backlinks yet.')}</div>`
      : ''
  ].filter(Boolean)
  if (!sections.length) return ''
  return `<section class="blog-relations" aria-label="Note relationships">${sections.join('')}</section>`
}

function renderBlogTagRow(site, note) {
  if (!site.showTags || !note.tags.length) return ''
  return `<div class="blog-tags">${note.tags.map((tag) => renderTagChip(tag, note.outputPath, site.tagIndex)).join('')}</div>`
}

function renderBlogNotePage(site, note) {
  const sorted = blogNotes(site)
  const index = Math.max(0, sorted.findIndex((entry) => entry.path === note.path))
  const html = renderMarkdown(note, site)
  const toc = renderBlogToc(note)
  const pager = renderBlogPager(site, note, index)
  const relations = renderBlogRelations(site, note)
  const tagRow = renderBlogTagRow(site, note)
  const backHref = relativeHref(note.outputPath, 'index.html')
  const postNo = String(index + 1).padStart(site.theme === 'terminal-ledger' ? 3 : 2, '0')
  const meta = `${formatNoteDate(note)} · ${noteReadTime(note)}`

  if (site.theme === 'terminal-ledger') {
    return blogShell({
      title: note.title,
      site,
      description: noteExcerpt(note),
      currentOutputPath: note.outputPath,
      headerVariant: 'terminal',
      body: `    <section class="terminal-post blog-reveal">
      <aside class="terminal-rail">
        ${toc}
        <dl>
          <div><dt>Date</dt><dd>${escapeHtml(formatNoteDate(note, 'iso'))}</dd></div>
          <div><dt>Read</dt><dd>${escapeHtml(noteReadTime(note))}</dd></div>
          <div><dt>Tag</dt><dd>${escapeHtml(noteTag(note))}</dd></div>
        </dl>
      </aside>
      <article class="blog-article terminal-article">
        <a class="blog-back" href="${backHref}">← index</a>
        <p class="terminal-label">NO. ${escapeHtml(postNo)} / ${escapeHtml(noteTag(note).toUpperCase())}</p>
        <h1>${escapeHtml(note.title)}</h1>
        ${tagRow}
        <div class="blog-prose">${html}</div>
        ${pager}
        ${relations}
      </article>
    </section>`
    })
  }

  if (site.theme === 'swiss-ledger') {
    return blogShell({
      title: note.title,
      site,
      description: noteExcerpt(note),
      currentOutputPath: note.outputPath,
      headerVariant: 'swiss',
      body: `    <section class="swiss-post blog-reveal">
      <a class="blog-back" href="${backHref}">← Index</a>
      <p class="swiss-label">NO. ${escapeHtml(postNo)} — ${escapeHtml(noteTag(note).toUpperCase())}</p>
      <h1>${escapeHtml(note.title)}</h1>
      <div class="swiss-meta"><span>Date</span><strong>${escapeHtml(formatNoteDate(note, 'iso'))}</strong><span>Read</span><strong>${escapeHtml(noteReadTime(note))}</strong><span>By</span><strong>${escapeHtml(site.title)}</strong></div>
      ${toc}
      ${tagRow}
      <article class="blog-article">
        <div class="blog-prose">${html}</div>
        ${pager}
        ${relations}
      </article>
    </section>`
    })
  }

  if (site.theme === 'soft-focus') {
    return blogShell({
      title: note.title,
      site,
      description: noteExcerpt(note),
      currentOutputPath: note.outputPath,
      headerVariant: 'soft',
      body: `    <section class="soft-post blog-reveal">
      <a class="blog-back" href="${backHref}">← Writing</a>
      <p class="soft-post-tag">${escapeHtml(noteTag(note).toUpperCase())}</p>
      <h1>${escapeHtml(note.title)}</h1>
      <p class="blog-meta">${escapeHtml(meta)}</p>
      ${toc}
      ${tagRow}
      <article class="blog-article">
        <div class="blog-prose">${html}</div>
        ${pager}
        ${relations}
      </article>
    </section>`
    })
  }

  if (site.theme === 'field-notes') {
    return blogShell({
      title: note.title,
      site,
      description: noteExcerpt(note),
      currentOutputPath: note.outputPath,
      headerVariant: 'field',
      body: `    <section class="field-post blog-reveal">
      <aside class="field-post-rail">
        <a class="blog-back" href="${backHref}">← Archive</a>
        <dl>
          <div><dt>Date</dt><dd>${escapeHtml(formatNoteDate(note, 'dot'))}</dd></div>
          <div><dt>Read</dt><dd>${escapeHtml(noteReadTime(note))}</dd></div>
          <div><dt>Tag</dt><dd>${escapeHtml(noteTag(note))}</dd></div>
        </dl>
        ${toc}
      </aside>
      <article class="blog-article field-article">
        <h1>${escapeHtml(note.title)}</h1>
        ${tagRow}
        <div class="blog-prose">${html}</div>
        ${pager}
        ${relations}
      </article>
    </section>`
    })
  }

  return blogShell({
    title: note.title,
    site,
    description: noteExcerpt(note),
    currentOutputPath: note.outputPath,
    body: `    <section class="quiet-post blog-reveal">
      <article class="blog-article">
        <a class="blog-back" href="${backHref}">← All writing</a>
        <p class="quiet-post-tag">${escapeHtml(noteTag(note).toUpperCase())}</p>
        <h1>${escapeHtml(note.title)}</h1>
        <p class="blog-meta">${escapeHtml(meta)}</p>
        ${toc}
        ${tagRow}
        <div class="blog-prose">${html}</div>
        ${pager}
        ${relations}
      </article>
    </section>`
  })
}

function renderNotePage(site, note) {
  if (BLOG_THEMES.has(site.theme)) return renderBlogNotePage(site, note)

  const html = renderMarkdown(note, site)
  const notesByPath = site.notesByPath
  const tagRow = site.showTags && note.tags.length
    ? `<div class="tag-row">${note.tags.map((tag) => renderTagChip(tag, note.outputPath, site.tagIndex)).join('')}</div>`
    : site.showTags
      ? '<p class="empty-state">No tags.</p>'
      : ''
  const relationSections = [
    `<div>
          <h2>Links</h2>
          ${renderLinkList(note.links, notesByPath, note.outputPath, 'No outgoing note links.')}
        </div>`,
    site.showBacklinks
      ? `<div>
          <h2>Backlinks</h2>
          ${renderLinkList(note.backlinks, notesByPath, note.outputPath, 'No backlinks yet.')}
        </div>`
      : ''
  ].filter(Boolean).join('\n')

  return pageShell({
    title: note.title,
    site,
    description: `${note.title} from ${site.title}`,
    currentOutputPath: note.outputPath,
    navNotes: site.notes,
    tagIndex: site.tagIndex,
    body: `      <article class="note-article">
        <header class="page-header note-header">
          <p class="eyebrow">${escapeHtml(note.path)}</p>
          <h1>${escapeHtml(note.title)}</h1>
          <p>${note.words} words</p>
          ${tagRow}
        </header>
        <div class="markdown-body">
${html}
        </div>
      </article>
      <section class="content-section relation-grid" aria-label="Note relationships">
        ${relationSections}
      </section>`
  })
}

function styles() {
  return `@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..600&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Spline+Sans:wght@400;500;600&display=swap');

:root {
  color-scheme: light;
  --bg: #fbfbfa;
  --panel: #ffffff;
  --panel-soft: #f1f3ee;
  --text: #232522;
  --muted: #6f756d;
  --faint: #92998f;
  --accent: #126f66;
  --accent-strong: #0c4f49;
  --link: #3f5fc4;
  --tag-bg: #fff2c8;
  --tag-text: #5e4700;
  --code-bg: #eef1f5;
  --shadow-border: 0 0 0 1px rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04);
  --shadow-border-hover: 0 0 0 1px rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.06);
}

* {
  box-sizing: border-box;
}

html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
  min-height: 100vh;
  background: linear-gradient(180deg, var(--bg) 0%, var(--panel-soft) 100%);
}

body.site-theme-editorial {
  --bg: #f8f8f6;
  --panel-soft: #eeeeec;
  --text: #171717;
  --muted: #646464;
  --accent: #262626;
  --accent-strong: #000000;
  --link: #202020;
  --tag-bg: #eeeeec;
  --tag-text: #282828;
}

body.site-theme-reference {
  --bg: #f7f8fb;
  --panel-soft: #eef0f5;
  --text: #1e2229;
  --muted: #626976;
  --accent: #303742;
  --accent-strong: #11151b;
  --link: #252b35;
  --tag-bg: #e9ecf2;
  --tag-text: #252b35;
}

a {
  color: var(--link);
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
  transition-property: color, box-shadow, background-color, scale;
  transition-duration: 150ms;
  transition-timing-function: ease-out;
}

a:hover {
  color: var(--accent-strong);
}

a:active {
  scale: 0.96;
}

.skip-link {
  position: fixed;
  left: 16px;
  top: 16px;
  z-index: 10;
  transform: translateY(-140%);
  background: var(--panel);
  color: var(--text);
  padding: 10px 14px;
  border-radius: 8px;
  box-shadow: var(--shadow-border);
  transition-property: transform;
  transition-duration: 150ms;
  transition-timing-function: ease-out;
}

.skip-link:focus {
  transform: translateY(0);
}

.site-shell {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: clamp(24px, 4vw, 56px);
  width: min(1440px, 100%);
  margin: 0 auto;
  padding: 28px;
}

.site-sidebar {
  position: sticky;
  top: 28px;
  align-self: start;
  max-height: calc(100vh - 56px);
  overflow: auto;
  padding: 20px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: var(--shadow-border);
}

.site-brand {
  display: grid;
  gap: 4px;
  margin-bottom: 24px;
}

.site-brand a {
  color: var(--text);
  font-size: 1rem;
  font-weight: 760;
  text-decoration: none;
  text-wrap: balance;
}

.site-brand span,
.eyebrow,
.note-path,
.empty-state {
  color: var(--muted);
}

.site-brand p {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
  text-wrap: pretty;
}

.sidebar-section {
  margin-top: 22px;
}

.sidebar-section h2 {
  margin: 0 0 8px;
  color: var(--faint);
  font-size: 0.72rem;
  letter-spacing: 0;
  text-transform: uppercase;
}

.sidebar-section ul,
.link-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.sidebar-section li + li,
.link-list li + li {
  margin-top: 6px;
}

.sidebar-section a,
.sidebar-link {
  display: flex;
  justify-content: space-between;
  min-height: 40px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 7px;
  color: var(--text);
  text-decoration: none;
}

.sidebar-section a:hover,
.sidebar-link:hover {
  background: var(--panel-soft);
  box-shadow: var(--shadow-border-hover);
}

.site-main {
  min-width: 0;
  padding: 24px 0 72px;
}

.page-header {
  max-width: 820px;
  margin: 0 0 28px;
}

.page-header h1 {
  margin: 0;
  color: var(--text);
  font-size: clamp(2.1rem, 5vw, 4.4rem);
  line-height: 0.96;
  letter-spacing: 0;
  text-wrap: balance;
}

.page-header p {
  max-width: 680px;
  margin: 14px 0 0;
  color: var(--muted);
  font-size: 1.02rem;
  line-height: 1.65;
  text-wrap: pretty;
}

.eyebrow,
.note-path {
  margin: 0 0 8px;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 32px;
}

.stats-grid div,
.note-card,
.relation-grid > div {
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow-border);
}

.stats-grid div {
  padding: 18px;
}

.stats-grid dt {
  color: var(--muted);
  font-size: 0.8rem;
}

.stats-grid dd {
  margin: 6px 0 0;
  font-size: 1.9rem;
  font-weight: 760;
  font-variant-numeric: tabular-nums;
}

.content-section {
  margin-top: 34px;
}

.content-section h2,
.relation-grid h2 {
  margin: 0 0 14px;
  color: var(--text);
  font-size: 1rem;
  text-wrap: balance;
}

.note-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}

.note-card {
  padding: 18px;
  transition-property: box-shadow, transform;
  transition-duration: 150ms;
  transition-timing-function: ease-out;
}

.note-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-border-hover);
}

.note-card h2 {
  margin: 0;
  font-size: 1.08rem;
  line-height: 1.35;
  text-wrap: balance;
}

.note-card p {
  margin: 10px 0 0;
  color: var(--muted);
  line-height: 1.5;
  text-wrap: pretty;
}

.tag-row,
.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.tag,
.tag-cloud-item {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--tag-bg);
  color: var(--tag-text);
  font-size: 0.84rem;
  font-weight: 680;
  text-decoration: none;
}

.tag-cloud-item span,
.sidebar-section a span {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.note-article {
  max-width: 860px;
}

.note-header {
  margin-bottom: 22px;
}

.markdown-body {
  color: var(--text);
  font-size: 1rem;
  line-height: 1.72;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  position: relative;
  margin: 1.6em 0 0.55em;
  line-height: 1.18;
  text-wrap: balance;
}

.markdown-body h1 {
  font-size: 2.1rem;
}

.markdown-body h2 {
  font-size: 1.55rem;
}

.markdown-body h3 {
  font-size: 1.22rem;
}

.heading-anchor {
  margin-left: 8px;
  color: var(--faint);
  font-size: 0.8em;
  opacity: 0;
  text-decoration: none;
  transition-property: opacity, color;
  transition-duration: 150ms;
  transition-timing-function: ease-out;
}

.markdown-body h1:hover .heading-anchor,
.markdown-body h2:hover .heading-anchor,
.markdown-body h3:hover .heading-anchor,
.markdown-body h4:hover .heading-anchor,
.markdown-body h5:hover .heading-anchor,
.markdown-body h6:hover .heading-anchor,
.heading-anchor:focus {
  opacity: 1;
}

.markdown-body p,
.markdown-body li,
.markdown-body blockquote {
  text-wrap: pretty;
}

.markdown-body code {
  border-radius: 5px;
  background: var(--code-bg);
  padding: 0.16em 0.32em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 0.92em;
}

.markdown-body pre {
  overflow: auto;
  border-radius: 8px;
  background: #1f2428;
  color: #f4f7f8;
  padding: 16px;
  box-shadow: var(--shadow-border);
}

.markdown-body pre code {
  background: transparent;
  padding: 0;
}

.markdown-body blockquote {
  margin: 1.2em 0;
  padding: 2px 0 2px 18px;
  color: var(--muted);
  box-shadow: inset 3px 0 0 var(--accent);
}

.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.2em 0;
  overflow: hidden;
  border-radius: 8px;
  box-shadow: var(--shadow-border);
}

.markdown-body th,
.markdown-body td {
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
}

.markdown-body tr + tr {
  box-shadow: inset 0 1px 0 rgba(0, 0, 0, 0.06);
}

.markdown-body img,
.embed {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1.2em 0;
  border-radius: 8px;
  outline: 1px solid rgba(0, 0, 0, 0.1);
  outline-offset: -1px;
}

.embed-audio,
.embed-video {
  width: 100%;
  margin: 1.2em 0;
}

.embed-video {
  display: block;
  max-width: min(100%, 760px);
  border-radius: 8px;
  background: #000;
  outline: 1px solid rgba(0, 0, 0, 0.1);
  outline-offset: -1px;
}

.internal-link {
  color: var(--accent);
  font-weight: 620;
}

.external-link::after {
  content: "\\2197";
  padding-left: 0.18em;
  font-size: 0.72em;
}

.unresolved,
.missing-asset {
  color: #9a3412;
  text-decoration-style: dashed;
}

.relation-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  max-width: 860px;
}

.relation-grid > div {
  padding: 18px;
}

.link-list a {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
}

body.site-theme-quiet-paper,
body.site-theme-terminal-ledger,
body.site-theme-swiss-ledger,
body.site-theme-soft-focus,
body.site-theme-field-notes {
  background: var(--bg);
  color: var(--fg);
}

body.site-theme-quiet-paper {
  --bg: #faf7f1;
  --panel: #f1ece1;
  --fg: #1c1a16;
  --muted: #8a8378;
  --faint: #a89f8f;
  --line: #e6e0d3;
  --line-soft: #eee8db;
  --line-strong: #cfc7b6;
  --accent: #a6603c;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --tag-bg: #f1ece1;
  --tag-text: #a6603c;
  --code-bg: #211e19;
  --code-fg: #eae4d6;
  font-family: "Newsreader", Georgia, serif;
}

body.site-theme-terminal-ledger {
  color-scheme: dark;
  --bg: #0b0d10;
  --panel: #11151a;
  --fg: #e8ebee;
  --muted: #7a848f;
  --faint: #5c6670;
  --line: #1a2027;
  --line-soft: #14181d;
  --line-strong: #2b333d;
  --accent: #ffb454;
  --text: #c6ccd2;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --tag-bg: #2b2418;
  --tag-text: #ffb454;
  --code-bg: #11151a;
  --code-fg: #c6ccd2;
  font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
}

body.site-theme-swiss-ledger {
  --bg: #ffffff;
  --panel: #f4f2ee;
  --fg: #141311;
  --muted: #5a564e;
  --faint: #9a968d;
  --line: #d6d3cb;
  --line-strong: #cfcbc0;
  --accent: #ff3e00;
  --invert-bg: #141311;
  --invert-fg: #ffffff;
  --font-mono: "Space Mono", ui-monospace, monospace;
  --tag-bg: #141311;
  --tag-text: #ffffff;
  --code-bg: #000000;
  --code-fg: #ffffff;
  font-family: Archivo, ui-sans-serif, system-ui, sans-serif;
}

body.site-theme-soft-focus {
  --bg: #f7f5f1;
  --panel: #efece4;
  --fg: #26241f;
  --muted: #6b6357;
  --faint: #b3ab9e;
  --line: #e7e2d8;
  --line-strong: #d8d1c3;
  --accent: #c96f4a;
  --font-mono: "Space Mono", ui-monospace, monospace;
  --tag-bg: #efece4;
  --tag-text: #c96f4a;
  --code-bg: #efece4;
  --code-fg: #4a453d;
  font-family: "Spline Sans", ui-sans-serif, system-ui, sans-serif;
}

body.site-theme-field-notes {
  --bg: #eef1f5;
  --panel: #e1e7ef;
  --fg: #232a33;
  --muted: #63707f;
  --faint: #9aa4b2;
  --line: #d4dbe4;
  --line-strong: #c3ccd8;
  --accent: #46688f;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --tag-bg: #e1e7ef;
  --tag-text: #46688f;
  --code-bg: #e2e8f0;
  --code-fg: #3a4551;
  font-family: "Spline Sans", ui-sans-serif, system-ui, sans-serif;
}

html[data-theme='dark'] body.site-theme-quiet-paper {
  color-scheme: dark;
  --bg: #16140f;
  --panel: #211d15;
  --fg: #ece7db;
  --muted: #9a9282;
  --faint: #6f685b;
  --line: #2b2618;
  --line-soft: #231f16;
  --line-strong: #3a3324;
  --accent: #db9d66;
  --tag-bg: #211d15;
  --tag-text: #db9d66;
  --code-bg: #0f0d09;
  --code-fg: #eae4d6;
}

html[data-theme='light'] body.site-theme-terminal-ledger {
  color-scheme: light;
  --bg: #f6f7f4;
  --panel: #ffffff;
  --fg: #14181d;
  --muted: #586069;
  --faint: #8b95a0;
  --line: #e3e6df;
  --line-soft: #edf0ea;
  --line-strong: #cfd6cd;
  --accent: #c07414;
  --text: #333b44;
  --tag-bg: #fff4df;
  --tag-text: #9b5600;
  --code-bg: #14181d;
  --code-fg: #dfe4df;
}

html[data-theme='dark'] body.site-theme-swiss-ledger {
  color-scheme: dark;
  --bg: #0d0d0c;
  --panel: #181613;
  --fg: #f2f0ea;
  --muted: #a3a099;
  --faint: #6b6862;
  --line: #282623;
  --line-strong: #35322d;
  --accent: #ff5a2c;
  --invert-bg: #f2f0ea;
  --invert-fg: #0d0d0c;
  --tag-bg: #f2f0ea;
  --tag-text: #0d0d0c;
}

html[data-theme='dark'] body.site-theme-soft-focus {
  color-scheme: dark;
  --bg: #1a1815;
  --panel: #232019;
  --fg: #ece8e0;
  --muted: #a49a8c;
  --faint: #6e675b;
  --line: #2c281f;
  --line-strong: #3a352b;
  --accent: #e08a5f;
  --tag-bg: #232019;
  --tag-text: #e08a5f;
  --code-bg: #232019;
  --code-fg: #cfc8ba;
}

html[data-theme='dark'] body.site-theme-field-notes {
  color-scheme: dark;
  --bg: #11151b;
  --panel: #1a212a;
  --fg: #e3e9f1;
  --muted: #8b96a6;
  --faint: #59616e;
  --line: #232b36;
  --line-strong: #333d4a;
  --accent: #7ea6d4;
  --tag-bg: #1a212a;
  --tag-text: #7ea6d4;
  --code-bg: #1a212a;
  --code-fg: #c2ccd9;
}

.blog-header {
  max-width: 680px;
  margin: 0 auto;
  padding: clamp(30px, 6vw, 52px) clamp(24px, 6vw, 60px) 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.blog-header.terminal {
  max-width: 960px;
}

.blog-header.swiss,
.blog-header.field {
  max-width: 920px;
}

.blog-brand,
.blog-nav a,
.blog-back,
.theme-toggle {
  color: var(--muted);
  text-decoration: none;
}

.blog-brand {
  color: var(--fg);
  font-weight: 600;
}

.blog-nav {
  display: flex;
  align-items: center;
  gap: 18px;
}

.theme-toggle {
  min-width: 40px;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  font: 500 11px/1 var(--font-mono, ui-monospace, monospace);
  cursor: pointer;
  transition-property: border-color, color, transform;
  transition-duration: 150ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.theme-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.theme-toggle:active {
  transform: scale(0.96);
}

.theme-toggle-moon,
html[data-theme='dark'] .theme-toggle-sun,
body.site-theme-terminal-ledger .theme-toggle-sun {
  display: none;
}

html[data-theme='dark'] .theme-toggle-moon,
body.site-theme-terminal-ledger .theme-toggle-moon {
  display: inline;
}

html[data-theme='light'] body.site-theme-terminal-ledger .theme-toggle-sun {
  display: inline;
}

html[data-theme='light'] body.site-theme-terminal-ledger .theme-toggle-moon {
  display: none;
}

.reading-progress {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 20;
  width: calc(var(--progress, 0) * 100%);
  height: 3px;
  background: var(--accent);
  transform-origin: left center;
}

.blog-reveal {
  animation: blogIn 0.5s ease both;
}

[data-stagger] > * {
  opacity: 0;
  animation: blogUp 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
}

[data-stagger] > *:nth-child(1) { animation-delay: 0.02s; }
[data-stagger] > *:nth-child(2) { animation-delay: 0.06s; }
[data-stagger] > *:nth-child(3) { animation-delay: 0.10s; }
[data-stagger] > *:nth-child(4) { animation-delay: 0.14s; }
[data-stagger] > *:nth-child(5) { animation-delay: 0.18s; }
[data-stagger] > *:nth-child(6) { animation-delay: 0.22s; }
[data-stagger] > *:nth-child(7) { animation-delay: 0.26s; }
[data-stagger] > *:nth-child(8) { animation-delay: 0.30s; }
[data-stagger] > *:nth-child(9) { animation-delay: 0.34s; }
[data-stagger] > *:nth-child(n+10) { animation-delay: 0.38s; }

@keyframes blogIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes blogUp {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}

.quiet-index,
.quiet-post {
  max-width: 680px;
  margin: 0 auto;
  padding: clamp(38px, 6vw, 56px) clamp(24px, 6vw, 60px) clamp(48px, 8vw, 80px);
}

.quiet-bio {
  max-width: 460px;
  margin: 0 0 clamp(40px, 7vw, 60px);
  color: var(--fg);
  font: italic 400 clamp(19px, 2.4vw, 22px)/1.55 "Newsreader", Georgia, serif;
  text-wrap: pretty;
}

.quiet-year {
  margin-bottom: 8px;
}

.quiet-year-label {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
  color: var(--faint);
  font: 400 12px "IBM Plex Mono", ui-monospace, monospace;
}

.quiet-row {
  display: flex;
  align-items: baseline;
  gap: 22px;
  padding: 15px 0;
  border-bottom: 1px solid var(--line-soft);
  color: var(--fg);
  text-decoration: none;
  transition-property: padding-left, color;
  transition-duration: 180ms;
  transition-timing-function: ease;
}

.quiet-row:hover {
  padding-left: 8px;
  color: var(--accent);
}

.quiet-row span {
  width: 52px;
  flex: none;
  color: var(--faint);
  font: 400 12px "IBM Plex Mono", ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}

.quiet-row strong {
  flex: 1;
  font: 400 clamp(17px, 2.1vw, 19px)/1.35 "Newsreader", Georgia, serif;
}

.blog-article {
  width: 100%;
  max-width: 620px;
}

.quiet-post .blog-article {
  max-width: 560px;
  margin: 0 auto;
}

.blog-back {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  margin-bottom: clamp(28px, 5vw, 46px);
  font: 400 12px var(--font-mono, ui-monospace, monospace);
}

.blog-back:hover {
  color: var(--accent);
}

.quiet-post-tag,
.soft-post-tag,
.terminal-label,
.swiss-label {
  margin: 0 0 14px;
  color: var(--accent);
  font: 600 11px var(--font-mono, ui-monospace, monospace);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.blog-article h1,
.soft-post h1,
.swiss-post h1 {
  margin: 0 0 16px;
  color: var(--fg);
  font-size: clamp(30px, 4.4vw, 42px);
  line-height: 1.12;
  letter-spacing: 0;
  text-wrap: balance;
}

.quiet-post .blog-article h1 {
  font-family: "Newsreader", Georgia, serif;
  font-weight: 400;
}

.blog-meta {
  margin: 0 0 34px;
  color: var(--faint);
  font: 400 12px var(--font-mono, ui-monospace, monospace);
}

.blog-toc {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 38px;
  padding: 18px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.blog-toc div {
  color: var(--faint);
  font: 600 11px var(--font-mono, ui-monospace, monospace);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.blog-toc a {
  width: fit-content;
  color: var(--muted);
  text-decoration: none;
}

.blog-toc a:hover {
  color: var(--accent);
}

.blog-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 24px;
}

.blog-prose {
  color: var(--fg);
  font-size: 17px;
  line-height: 1.72;
}

.blog-prose h1,
.blog-prose h2,
.blog-prose h3 {
  margin: 2em 0 0.65em;
  color: var(--fg);
  line-height: 1.22;
  text-wrap: balance;
}

.blog-prose h2 {
  font-size: 1.42em;
}

.blog-prose p,
.blog-prose li,
.blog-prose blockquote {
  text-wrap: pretty;
}

.blog-prose a {
  color: var(--accent);
}

.blog-prose pre {
  overflow: auto;
  margin: 1.6em 0;
  padding: 22px 24px;
  border-radius: 4px;
  background: var(--code-bg);
  color: var(--code-fg);
  font: 400 12.5px/1.75 var(--font-mono, ui-monospace, monospace);
}

.blog-prose code {
  border-radius: 5px;
  background: var(--code-bg);
  color: var(--code-fg);
  padding: 0.14em 0.32em;
  font-family: var(--font-mono, ui-monospace, monospace);
}

.blog-prose pre code {
  background: transparent;
  padding: 0;
}

.blog-prose blockquote {
  margin: 32px 0;
  padding-left: 22px;
  border-left: 2px solid var(--accent);
  color: var(--fg);
  font-style: italic;
}

.blog-prose img,
.blog-prose .embed {
  border-radius: 8px;
  outline: 1px solid rgba(0, 0, 0, 0.1);
  outline-offset: -1px;
}

html[data-theme='dark'] .blog-prose img,
html[data-theme='dark'] .blog-prose .embed,
body.site-theme-terminal-ledger .blog-prose img,
body.site-theme-terminal-ledger .blog-prose .embed {
  outline-color: rgba(255, 255, 255, 0.1);
}

.blog-pager {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin-top: 52px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
}

.blog-pager a {
  min-height: 52px;
  color: var(--fg);
  text-decoration: none;
}

.blog-pager a:last-child {
  text-align: right;
}

.blog-pager span {
  display: block;
  margin-bottom: 8px;
  color: var(--faint);
  font: 600 11px var(--font-mono, ui-monospace, monospace);
  text-transform: uppercase;
}

.blog-pager strong {
  font-weight: 500;
}

.blog-relations {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 34px;
}

.blog-relations > div {
  padding: 16px;
  border-radius: 8px;
  background: var(--panel);
}

.blog-relations h2 {
  margin: 0 0 10px;
  font-size: 0.9rem;
}

.terminal-index {
  max-width: 960px;
  margin: 0 auto;
  padding: clamp(40px, 6vw, 64px) clamp(24px, 6vw, 60px) clamp(48px, 8vw, 80px);
}

.terminal-bio {
  display: flex;
  align-items: flex-end;
  gap: 7px;
  max-width: 620px;
  margin-bottom: 44px;
}

.terminal-bio p {
  margin: 0;
  color: var(--text);
  font-size: clamp(18px, 2.2vw, 22px);
  line-height: 1.45;
}

.terminal-bio span {
  width: 8px;
  height: 1.15em;
  background: var(--accent);
  animation: cursorBlink 1s steps(2, start) infinite;
}

@keyframes cursorBlink {
  50% { opacity: 0; }
}

.terminal-table {
  border-top: 1px solid var(--line-strong);
}

.terminal-table-head,
.terminal-row {
  display: grid;
  grid-template-columns: 74px 130px minmax(0, 1fr) 120px;
  gap: 16px;
  align-items: center;
}

.terminal-table-head {
  padding: 12px 0;
  color: var(--faint);
  font: 600 11px "JetBrains Mono", ui-monospace, monospace;
}

.terminal-row {
  min-height: 58px;
  padding: 13px 0;
  border-top: 1px solid var(--line);
  color: var(--text);
  text-decoration: none;
  transition-property: background-color, color, padding-left;
  transition-duration: 160ms;
  transition-timing-function: ease;
}

.terminal-row:hover {
  padding-left: 10px;
  background: var(--panel);
  color: var(--fg);
}

.terminal-row span {
  color: var(--muted);
  font: 500 12px "JetBrains Mono", ui-monospace, monospace;
}

.terminal-row span:first-child {
  color: var(--accent);
}

.terminal-row strong {
  overflow: hidden;
  color: var(--fg);
  font: 500 15px "JetBrains Mono", ui-monospace, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-post {
  max-width: 960px;
  margin: 0 auto;
  padding: clamp(34px, 6vw, 52px) clamp(24px, 6vw, 60px) clamp(48px, 8vw, 80px);
  display: grid;
  grid-template-columns: 200px minmax(0, 660px);
  gap: 48px;
}

.terminal-rail {
  position: sticky;
  top: 28px;
  align-self: start;
}

.terminal-rail .blog-toc {
  margin-bottom: 24px;
  padding-left: 14px;
  border: 0;
  border-left: 1px solid var(--accent);
}

.terminal-rail dl,
.field-post-rail dl {
  display: grid;
  gap: 12px;
  margin: 0;
}

.terminal-rail dt,
.field-post-rail dt {
  color: var(--faint);
  font: 600 10px var(--font-mono, ui-monospace, monospace);
  text-transform: uppercase;
}

.terminal-rail dd,
.field-post-rail dd {
  margin: 3px 0 0;
  color: var(--fg);
  font: 500 12px var(--font-mono, ui-monospace, monospace);
}

.terminal-article h1 {
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-weight: 600;
}

.terminal-article .blog-prose {
  color: var(--text);
}

.terminal-article .blog-prose h2::before {
  content: "## ";
  color: var(--accent);
}

.swiss-index,
.swiss-post {
  max-width: 920px;
  margin: 0 auto;
  padding: clamp(36px, 6vw, 60px) clamp(24px, 6vw, 60px) clamp(48px, 8vw, 80px);
}

.swiss-index h1 {
  max-width: 780px;
  margin: 0;
  padding-bottom: 24px;
  border-bottom: 3px solid var(--fg);
  color: var(--fg);
  font: 900 clamp(56px, 12vw, 132px)/0.84 Archivo, ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0;
  text-transform: uppercase;
  text-wrap: balance;
}

.swiss-index h1 span,
.field-main h1 em {
  color: var(--accent);
  font-style: normal;
}

.swiss-index p {
  max-width: 580px;
  margin: 22px 0 42px;
  color: var(--muted);
  font-size: 18px;
  line-height: 1.5;
}

.swiss-row {
  display: grid;
  grid-template-columns: 72px 150px minmax(0, 1fr);
  gap: 18px;
  align-items: center;
  min-height: 70px;
  padding: 18px 0;
  border-top: 1px solid var(--line);
  color: var(--fg);
  text-decoration: none;
  transition-property: background-color, color, padding-left;
  transition-duration: 160ms;
  transition-timing-function: ease;
}

.swiss-row:hover,
.swiss-post .blog-toc a:hover,
.swiss-post .blog-pager a:hover {
  padding-left: 12px;
  background: var(--invert-bg);
  color: var(--invert-fg);
}

.swiss-row span:first-child {
  color: var(--accent);
  font: 700 20px "Space Mono", ui-monospace, monospace;
}

.swiss-row span:nth-child(2) {
  color: var(--muted);
  font: 700 11px "Space Mono", ui-monospace, monospace;
}

.swiss-row strong {
  font-size: clamp(20px, 3vw, 34px);
  line-height: 1;
  text-transform: uppercase;
}

.swiss-post h1 {
  max-width: 820px;
  font: 900 clamp(44px, 8vw, 86px)/0.92 Archivo, ui-sans-serif, system-ui, sans-serif;
  text-transform: uppercase;
}

.swiss-meta {
  display: flex;
  flex-wrap: wrap;
  margin: 28px 0 34px;
  border: 1px solid var(--line-strong);
}

.swiss-meta span,
.swiss-meta strong {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  padding: 0 14px;
  border-right: 1px solid var(--line-strong);
  font: 700 11px "Space Mono", ui-monospace, monospace;
  text-transform: uppercase;
}

.swiss-meta span {
  color: var(--muted);
}

.swiss-post .blog-toc {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  border: 1px solid var(--line-strong);
}

.swiss-post .blog-toc div {
  grid-column: 1 / -1;
  padding: 12px;
}

.swiss-post .blog-toc a {
  min-height: 46px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-top: 1px solid var(--line);
}

.soft-index,
.soft-post {
  max-width: 600px;
  margin: 0 auto;
  padding: clamp(38px, 7vw, 68px) clamp(24px, 6vw, 44px) clamp(48px, 8vw, 80px);
}

.soft-dot {
  width: 18px;
  height: 18px;
  margin-bottom: 28px;
  border-radius: 999px;
  background: var(--accent);
}

.soft-index h1 {
  margin: 0;
  color: var(--fg);
  font: 600 clamp(38px, 7vw, 62px)/0.98 "Space Grotesk", ui-sans-serif, sans-serif;
  text-wrap: balance;
}

.soft-index p {
  margin: 18px 0 54px;
  color: var(--muted);
  font-size: 18px;
  line-height: 1.55;
}

.soft-label {
  margin-bottom: 12px;
  color: var(--faint);
  font: 700 11px "Space Mono", ui-monospace, monospace;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.soft-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 18px;
  padding: 17px 0;
  border-top: 1px solid var(--line);
  color: var(--fg);
  text-decoration: none;
  transition-property: padding-left, color;
  transition-duration: 180ms;
  transition-timing-function: ease;
}

.soft-row:hover {
  padding-left: 8px;
  color: var(--accent);
}

.soft-row strong {
  font: 500 18px/1.3 "Space Grotesk", ui-sans-serif, sans-serif;
}

.soft-row span {
  color: var(--faint);
  font: 400 12px "Space Mono", ui-monospace, monospace;
}

.soft-post {
  max-width: 512px;
}

.soft-post h1 {
  font-family: "Space Grotesk", ui-sans-serif, sans-serif;
  font-weight: 600;
}

.soft-post .blog-toc {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
  border: 0;
  padding: 0;
}

.soft-post .blog-toc div {
  width: 100%;
}

.soft-post .blog-toc a {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--panel);
}

.soft-post .blog-prose pre,
.soft-post .blog-relations > div {
  border-radius: 18px;
}

.field-index,
.field-post {
  max-width: 920px;
  margin: 0 auto;
  padding: clamp(38px, 7vw, 68px) clamp(24px, 6vw, 60px) clamp(48px, 8vw, 80px);
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 46px;
}

.field-rail,
.field-post-rail {
  color: var(--muted);
  border-right: 1px solid var(--line-strong);
  font: 500 11px "IBM Plex Mono", ui-monospace, monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.field-rail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 10px;
}

.field-main h1 {
  margin: 0;
  color: var(--fg);
  font: 400 clamp(50px, 9vw, 92px)/0.9 "Instrument Serif", Georgia, serif;
  text-wrap: balance;
}

.field-main p {
  max-width: 560px;
  margin: 18px 0 44px;
  color: var(--muted);
  font-size: 18px;
  line-height: 1.55;
}

.field-row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 18px;
  padding: 18px 0;
  border-top: 1px solid var(--line);
  color: var(--fg);
  text-decoration: none;
  transition-property: color, padding-left;
  transition-duration: 180ms;
  transition-timing-function: ease;
}

.field-row:hover {
  padding-left: 8px;
  color: var(--accent);
}

.field-row span {
  color: var(--faint);
  font: 500 12px "IBM Plex Mono", ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}

.field-row strong {
  font-size: clamp(20px, 3vw, 30px);
  line-height: 1.12;
}

.field-post {
  grid-template-columns: 158px minmax(0, 600px);
}

.field-post-rail {
  position: sticky;
  top: 28px;
  align-self: start;
  padding-right: 24px;
  border-right: 1px solid var(--line-strong);
}

.field-article h1 {
  font: 400 clamp(38px, 6vw, 64px)/1 "Instrument Serif", Georgia, serif;
}

.field-post .blog-toc {
  margin-top: 28px;
  border: 0;
  padding: 0;
}

.field-post .blog-toc div {
  font-family: "Instrument Serif", Georgia, serif;
  font-size: 19px;
  letter-spacing: 0;
  text-transform: none;
}

@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --bg: #171916;
    --panel: #20231f;
    --panel-soft: #2a2e29;
    --text: #f2f4ef;
    --muted: #b2b9ad;
    --faint: #879080;
    --accent: #6fd6c8;
    --accent-strong: #9be8df;
    --link: #9db5ff;
    --tag-bg: #443a16;
    --tag-text: #ffe08a;
    --code-bg: #2d332e;
    --shadow-border: 0 0 0 1px rgba(255, 255, 255, 0.08);
    --shadow-border-hover: 0 0 0 1px rgba(255, 255, 255, 0.13);
  }

  body {
    background: linear-gradient(180deg, #171916 0%, #1b1f21 100%);
  }

  html:not([data-theme='light']) body.site-theme-quiet-paper {
    color-scheme: dark;
    --bg: #16140f;
    --panel: #211d15;
    --fg: #ece7db;
    --muted: #9a9282;
    --faint: #6f685b;
    --line: #2b2618;
    --line-soft: #231f16;
    --line-strong: #3a3324;
    --accent: #db9d66;
    --tag-bg: #211d15;
    --tag-text: #db9d66;
    --code-bg: #0f0d09;
    --code-fg: #eae4d6;
  }

  html:not([data-theme='light']) body.site-theme-swiss-ledger {
    color-scheme: dark;
    --bg: #0d0d0c;
    --panel: #181613;
    --fg: #f2f0ea;
    --muted: #a3a099;
    --faint: #6b6862;
    --line: #282623;
    --line-strong: #35322d;
    --accent: #ff5a2c;
    --invert-bg: #f2f0ea;
    --invert-fg: #0d0d0c;
    --tag-bg: #f2f0ea;
    --tag-text: #0d0d0c;
  }

  html:not([data-theme='light']) body.site-theme-soft-focus {
    color-scheme: dark;
    --bg: #1a1815;
    --panel: #232019;
    --fg: #ece8e0;
    --muted: #a49a8c;
    --faint: #6e675b;
    --line: #2c281f;
    --line-strong: #3a352b;
    --accent: #e08a5f;
    --tag-bg: #232019;
    --tag-text: #e08a5f;
    --code-bg: #232019;
    --code-fg: #cfc8ba;
  }

  html:not([data-theme='light']) body.site-theme-field-notes {
    color-scheme: dark;
    --bg: #11151b;
    --panel: #1a212a;
    --fg: #e3e9f1;
    --muted: #8b96a6;
    --faint: #59616e;
    --line: #232b36;
    --line-strong: #333d4a;
    --accent: #7ea6d4;
    --tag-bg: #1a212a;
    --tag-text: #7ea6d4;
    --code-bg: #1a212a;
    --code-fg: #c2ccd9;
  }

  body.site-theme-quiet-paper,
  body.site-theme-terminal-ledger,
  body.site-theme-swiss-ledger,
  body.site-theme-soft-focus,
  body.site-theme-field-notes {
    background: var(--bg);
  }

  html:not([data-theme]) .theme-toggle-sun {
    display: none;
  }

  html:not([data-theme]) .theme-toggle-moon {
    display: inline;
  }

  .site-sidebar {
    background: rgba(32, 35, 31, 0.82);
  }

  .markdown-body img,
  .embed {
    outline: 1px solid rgba(255, 255, 255, 0.1);
  }

  .markdown-body tr + tr {
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
}

@media (max-width: 860px) {
  .site-shell {
    grid-template-columns: 1fr;
    padding: 18px;
  }

  .site-sidebar {
    position: relative;
    top: 0;
    max-height: none;
  }

  .stats-grid,
  .relation-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .terminal-table-head,
  .terminal-row {
    grid-template-columns: 58px minmax(0, 1fr) 92px;
  }

  .terminal-table-head span:nth-child(2),
  .terminal-row span:nth-child(2) {
    display: none;
  }

  .terminal-post,
  .field-index,
  .field-post {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .terminal-rail,
  .field-post-rail {
    position: relative;
    top: 0;
  }

  .field-rail,
  .field-post-rail {
    padding: 0 0 18px;
    border-right: 0;
    border-bottom: 1px solid var(--line-strong);
  }

  .swiss-post .blog-toc,
  .blog-relations {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .site-shell {
    padding: 12px;
  }

  .page-header h1 {
    font-size: 2.2rem;
  }

  .stats-grid,
  .relation-grid {
    grid-template-columns: 1fr;
  }

  .blog-header {
    padding-inline: 18px;
  }

  .quiet-index,
  .quiet-post,
  .terminal-index,
  .terminal-post,
  .swiss-index,
  .swiss-post,
  .soft-index,
  .soft-post,
  .field-index,
  .field-post {
    padding-inline: 18px;
  }

  .quiet-row,
  .soft-row,
  .field-row {
    gap: 12px;
  }

  .swiss-row {
    grid-template-columns: 48px minmax(0, 1fr);
  }

  .swiss-row span:nth-child(2) {
    display: none;
  }

  .terminal-table-head,
  .terminal-row {
    grid-template-columns: 48px minmax(0, 1fr);
  }

  .terminal-table-head span:nth-child(4),
  .terminal-row span:nth-child(4) {
    display: none;
  }

  .blog-pager {
    grid-template-columns: 1fr;
  }

  .blog-pager a:last-child {
    text-align: left;
  }
}
`
}

function siteScript() {
  return `(() => {
  const storageKey = 'forge-publish-theme'
  const root = document.documentElement
  const saved = localStorage.getItem(storageKey)
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved

  function setTheme(theme) {
    root.dataset.theme = theme
    localStorage.setItem(storageKey, theme)
  }

  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      setTheme(current === 'dark' ? 'light' : 'dark')
    })
  })

  const progress = document.querySelector('[data-progress]')
  if (!progress) return
  let ticking = false
  const updateProgress = () => {
    ticking = false
    const scrollRoot = document.scrollingElement || document.documentElement
    const max = scrollRoot.scrollHeight - scrollRoot.clientHeight
    const value = max > 0 ? Math.min(1, scrollRoot.scrollTop / max) : 0
    progress.style.setProperty('--progress', value)
  }
  window.addEventListener('scroll', () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(updateProgress)
  }, { passive: true })
  updateProgress()
})()
`
}

async function prepareOutput(output, clean) {
  const stat = await fs.stat(output).catch(() => null)
  if (stat && !stat.isDirectory()) throw new Error(`Output path exists and is not a directory: ${output}`)

  if (clean && stat) {
    const entries = await fs.readdir(output)
    const marker = await readMarker(output)
    if (entries.length > 0 && !marker) {
      throw new Error(`Refusing to clean output without ${MARKER_FILE}: ${output}`)
    }
    await fs.rm(output, { recursive: true, force: true })
  }

  await fs.mkdir(output, { recursive: true })
}

async function readMarker(output) {
  try {
    const raw = await fs.readFile(path.join(output, MARKER_FILE), 'utf8')
    const marker = JSON.parse(raw)
    return marker.generator === GENERATOR ? marker : null
  } catch {
    return null
  }
}

async function writeText(output, rel, content, written) {
  const abs = path.join(output, rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, content, 'utf8')
  written.push(rel)
}

async function copyAsset(output, asset, copied) {
  const targetRel = assetOutputPath(asset.path)
  const targetAbs = path.join(output, targetRel)
  await fs.mkdir(path.dirname(targetAbs), { recursive: true })
  await fs.copyFile(asset.abs, targetAbs)
  copied.push(targetRel)
}

function outputIsUnsafe(vault, output) {
  const root = path.parse(output).root
  return output === root || output === vault
}

export async function publishVault({
  vault,
  output,
  title = '',
  description = '',
  theme = 'minimal',
  scopePath = '',
  clean = false,
  showTags = true,
  showBacklinks = true
}) {
  if (!vault) throw new Error('Missing vault path.')
  if (!output) throw new Error('Missing output path.')

  const resolvedVault = path.resolve(expandHome(vault))
  const resolvedOutput = path.resolve(expandHome(output))
  const normalizedScopePath = normalizeScopePath(scopePath)
  if (outputIsUnsafe(resolvedVault, resolvedOutput)) {
    throw new Error('Output must be a dedicated directory, not the vault root or filesystem root.')
  }

  const scan = await scanVault(resolvedVault, { excludeAbs: resolvedOutput })
  const scopedFiles = normalizedScopePath ? scan.files.filter((file) => isPathInScope(file.path, normalizedScopePath)) : scan.files
  const markdownFiles = scopedFiles.filter((file) => file.markdown)
  const assetFiles = scopedFiles.filter((file) => !file.markdown)
  const notes = []

  for (const file of markdownFiles) {
    const content = await fs.readFile(file.abs, 'utf8')
    const meta = parseNote(content, file.path)
    notes.push({
      ...file,
      ...meta,
      outputPath: noteOutputPath(file.path),
      links: [],
      backlinks: [],
      tagPages: []
    })
  }

  notes.sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path))

  const tagIndex = buildTagIndex(notes)
  const linkSummary = enrichLinks(notes, tagIndex)
  const notesByPath = new Map(notes.map((note) => [note.path, note]))
  const site = {
    title: title || path.basename(resolvedVault) || 'Forge Vault',
    description: String(description ?? '').trim(),
    theme: normalizeTheme(theme),
    scopePath: normalizedScopePath,
    showTags: showTags !== false,
    showBacklinks: showBacklinks !== false,
    vault: resolvedVault,
    output: resolvedOutput,
    notes,
    notesByPath,
    filePaths: notes.map((note) => note.path),
    assetPaths: assetFiles.map((asset) => asset.path),
    tagIndex,
    brokenLinks: linkSummary.brokenLinks,
    stats: {
      notes: notes.length,
      tags: tagIndex.length,
      links: notes.reduce((sum, note) => sum + note.links.length, 0),
      assets: assetFiles.length,
      words: notes.reduce((sum, note) => sum + note.words, 0)
    }
  }

  await prepareOutput(resolvedOutput, clean)

  const written = []
  const copied = []
  await writeText(resolvedOutput, MARKER_FILE, `${JSON.stringify({ generator: GENERATOR, version: 1, updatedAt: new Date().toISOString() }, null, 2)}\n`, written)
  await writeText(resolvedOutput, '.nojekyll', '', written)
  await writeText(resolvedOutput, '_forge/styles.css', styles(), written)
  await writeText(resolvedOutput, '_forge/site.js', siteScript(), written)
  await writeText(resolvedOutput, 'index.html', renderIndexPage(site), written)

  for (const tagPage of site.showTags ? tagIndex : []) {
    await writeText(resolvedOutput, tagPage.outputPath, renderTagPage(site, tagPage), written)
  }

  for (const note of notes) {
    await writeText(resolvedOutput, note.outputPath, renderNotePage(site, note), written)
  }

  for (const asset of assetFiles) {
    await copyAsset(resolvedOutput, asset, copied)
  }

  await writeText(
    resolvedOutput,
    '_forge/manifest.json',
    `${JSON.stringify(
      {
        generator: GENERATOR,
        title: site.title,
        description: site.description,
        theme: site.theme,
        scopePath: site.scopePath,
        options: {
          showTags: site.showTags,
          showBacklinks: site.showBacklinks
        },
        totals: site.stats,
        notes: notes.map((note) => ({
          path: note.path,
          title: note.title,
          outputPath: note.outputPath,
          tags: note.tags,
          links: note.links.map((link) => link.resolved).filter(Boolean),
          backlinks: note.backlinks.map((link) => link.resolved).filter(Boolean)
        })),
        tags: tagIndex.map((entry) => ({
          tag: entry.tag,
          outputPath: entry.outputPath,
          notes: entry.notes.map((note) => note.path)
        })),
        brokenLinks: site.brokenLinks
      },
      null,
      2
    )}\n`,
    written
  )

  return {
    ok: true,
    vault: resolvedVault,
    output: resolvedOutput,
    clean,
    totals: site.stats,
    written,
    copied,
    brokenLinks: site.brokenLinks
  }
}

export {
  MARKER_FILE,
  assetOutputPath,
  noteOutputPath
}
