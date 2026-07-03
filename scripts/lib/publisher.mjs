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
  return ['minimal', 'editorial', 'reference'].includes(value) ? value : 'minimal'
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

function renderIndexPage(site) {
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

function renderNotePage(site, note) {
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
  return `:root {
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
}
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
