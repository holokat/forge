import fs from 'node:fs/promises'
import path from 'node:path'
import { Marked } from 'marked'
import { siteScript, styles } from './publisher-assets.mjs'
import { BLOG_THEMES, normalizeTheme } from './publisher-themes.mjs'

const GENERATOR = 'forge-static-publisher'
const MARKER_FILE = '.forge-publish.json'
const WIKILINK_RE = /(!?)\[\[([^[\]]+?)\]\]/g
const TAG_RE = /(^|[\s([])#([A-Za-z][\w/-]*)/g
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const MARKDOWN_LINK_RE = /(!?)\[([^\]\n]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g
const EXTERNAL_REF_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i
const IMAGE_EXT_RE = /\.(?:apng|avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i
const AUDIO_EXT_RE = /\.(?:aac|aiff?|flac|m4a|mp3|oga|ogg|opus|wav|webm)$/i
const VIDEO_EXT_RE = /\.(?:m4v|mov|mp4|ogv|webm)$/i

const DEFAULT_INTEGRATIONS = {
  seoRss: {
    enabled: true,
    siteUrl: '',
    socialImage: '',
    authorName: '',
    language: 'en',
    robotsMode: 'index',
    favicon: '',
    customFooter: '',
    rss: true,
    sitemap: true,
    robots: true
  },
  analytics: {
    provider: 'none',
    domain: '',
    scriptUrl: '',
    websiteId: '',
    customSnippet: ''
  },
  deploy: {
    target: 'manual',
    projectName: '',
    productionUrl: '',
    notes: ''
  },
  embeds: {
    enabled: true,
    allowIframes: false,
    allowExternalMedia: true
  },
  forms: {
    enabled: false,
    provider: 'none',
    formName: 'contact',
    endpoint: '',
    buttonLabel: 'Send'
  }
}

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

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function booleanValue(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

function normalizeLanguage(value) {
  const language = stringValue(value)
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(language) ? language : DEFAULT_INTEGRATIONS.seoRss.language
}

function normalizePublicUrl(value) {
  const raw = stringValue(value).replace(/\/+$/, '')
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.href.replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function normalizeIntegrations(value = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const seoRss = raw.seoRss && typeof raw.seoRss === 'object' && !Array.isArray(raw.seoRss) ? raw.seoRss : {}
  const analytics =
    raw.analytics && typeof raw.analytics === 'object' && !Array.isArray(raw.analytics) ? raw.analytics : {}
  const deploy = raw.deploy && typeof raw.deploy === 'object' && !Array.isArray(raw.deploy) ? raw.deploy : {}
  const embeds = raw.embeds && typeof raw.embeds === 'object' && !Array.isArray(raw.embeds) ? raw.embeds : {}
  const forms = raw.forms && typeof raw.forms === 'object' && !Array.isArray(raw.forms) ? raw.forms : {}

  return {
    seoRss: {
      enabled: booleanValue(seoRss.enabled, DEFAULT_INTEGRATIONS.seoRss.enabled),
      siteUrl: normalizePublicUrl(seoRss.siteUrl),
      socialImage: stringValue(seoRss.socialImage),
      authorName: stringValue(seoRss.authorName),
      language: normalizeLanguage(seoRss.language),
      robotsMode: enumValue(seoRss.robotsMode, ['index', 'noindex'], DEFAULT_INTEGRATIONS.seoRss.robotsMode),
      favicon: stringValue(seoRss.favicon),
      customFooter: stringValue(seoRss.customFooter),
      rss: booleanValue(seoRss.rss, DEFAULT_INTEGRATIONS.seoRss.rss),
      sitemap: booleanValue(seoRss.sitemap, DEFAULT_INTEGRATIONS.seoRss.sitemap),
      robots: booleanValue(seoRss.robots, DEFAULT_INTEGRATIONS.seoRss.robots)
    },
    analytics: {
      provider: enumValue(analytics.provider, ['none', 'plausible', 'umami', 'custom'], 'none'),
      domain: stringValue(analytics.domain),
      scriptUrl: stringValue(analytics.scriptUrl),
      websiteId: stringValue(analytics.websiteId),
      customSnippet: stringValue(analytics.customSnippet)
    },
    deploy: {
      target: enumValue(
        deploy.target,
        ['manual', 'github-pages', 'cloudflare-pages', 'netlify', 'vercel', 's3-r2', 'ipfs'],
        'manual'
      ),
      projectName: stringValue(deploy.projectName),
      productionUrl: normalizePublicUrl(deploy.productionUrl),
      notes: stringValue(deploy.notes)
    },
    embeds: {
      enabled: booleanValue(embeds.enabled, DEFAULT_INTEGRATIONS.embeds.enabled),
      allowIframes: booleanValue(embeds.allowIframes, DEFAULT_INTEGRATIONS.embeds.allowIframes),
      allowExternalMedia: booleanValue(embeds.allowExternalMedia, DEFAULT_INTEGRATIONS.embeds.allowExternalMedia)
    },
    forms: {
      enabled: booleanValue(forms.enabled, DEFAULT_INTEGRATIONS.forms.enabled),
      provider: enumValue(forms.provider, ['none', 'netlify', 'formspree', 'custom'], 'none'),
      formName: stringValue(forms.formName) || DEFAULT_INTEGRATIONS.forms.formName,
      endpoint: stringValue(forms.endpoint),
      buttonLabel: stringValue(forms.buttonLabel) || DEFAULT_INTEGRATIONS.forms.buttonLabel
    }
  }
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

function sitePublicBaseUrl(site) {
  return site.integrations.seoRss.siteUrl || site.integrations.deploy.productionUrl || ''
}

function publicUrl(site, outputPath = 'index.html') {
  const base = sitePublicBaseUrl(site)
  if (!base) return ''
  const rel = outputPath === 'index.html' ? '' : encodePathForHref(outputPath).replace(/^\.\//, '')
  try {
    return new URL(rel, `${base}/`).href
  } catch {
    return ''
  }
}

function publicAssetUrl(site, value) {
  const raw = stringValue(value)
  if (!raw) return ''
  const absolute = normalizePublicUrl(raw)
  if (absolute) return absolute
  const localAsset = site.assetPaths?.find((file) => file.toLowerCase() === raw.replace(/^\/+/, '').toLowerCase())
  if (localAsset && sitePublicBaseUrl(site)) return publicUrl(site, assetOutputPath(localAsset))
  if (!sitePublicBaseUrl(site)) return ''
  return publicUrl(site, raw.replace(/^\/+/, ''))
}

function faviconHref(site, currentOutputPath) {
  const raw = stringValue(site.integrations.seoRss.favicon)
  if (!raw) return ''
  const absolute = normalizePublicUrl(raw)
  if (absolute) return absolute
  const normalized = raw.replace(/^\/+/, '')
  const localAsset = site.assetPaths?.find((file) => file.toLowerCase() === normalized.toLowerCase())
  if (localAsset) return relativeHref(currentOutputPath, assetOutputPath(localAsset))
  return raw
}

function pageTitle(title, site) {
  return title === site.title ? site.title : `${title} - ${site.title}`
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

function renderAnalyticsSnippet(site) {
  const analytics = site.integrations.analytics
  if (analytics.provider === 'none') return ''

  if (analytics.provider === 'plausible') {
    if (!analytics.domain) return ''
    const scriptUrl = analytics.scriptUrl || 'https://plausible.io/js/script.js'
    return `<script defer data-domain="${escapeAttribute(analytics.domain)}" src="${escapeAttribute(scriptUrl)}"></script>`
  }

  if (analytics.provider === 'umami') {
    if (!analytics.websiteId) return ''
    const scriptUrl = analytics.scriptUrl || 'https://cloud.umami.is/script.js'
    return `<script defer src="${escapeAttribute(scriptUrl)}" data-website-id="${escapeAttribute(analytics.websiteId)}"></script>`
  }

  if (analytics.provider === 'custom') {
    return analytics.customSnippet
  }

  return ''
}

function jsonLdScript(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
}

function dateIso(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function articleStructuredData({ title, site, description, currentOutputPath, article, socialImage }) {
  if (!article) return ''
  const url = publicUrl(site, currentOutputPath)
  if (!url) return ''
  const authorName = site.integrations.seoRss.authorName
  const published = dateIso(dateForNote(article))
  const modified = dateIso(article.modified)
  return jsonLdScript({
    '@context': 'https://schema.org',
    '@type': BLOG_THEMES.has(site.theme) ? 'BlogPosting' : 'Article',
    headline: title,
    description,
    url,
    datePublished: published || undefined,
    dateModified: modified || published || undefined,
    image: socialImage || undefined,
    author: authorName ? { '@type': 'Person', name: authorName } : undefined,
    publisher: { '@type': 'Organization', name: site.title },
    inLanguage: site.integrations.seoRss.language
  })
}

function renderHeadTags({ title, site, description = '', currentOutputPath, kind = 'website', article = null }) {
  const renderedTitle = pageTitle(title, site)
  const seo = site.integrations.seoRss
  const desc = String(description || site.description || '').trim()
  const canonical = seo.enabled ? publicUrl(site, currentOutputPath) : ''
  const socialImage = seo.enabled ? publicAssetUrl(site, seo.socialImage) : ''
  const rssHref = seo.enabled && seo.rss ? relativeHref(currentOutputPath, 'feed.xml') : ''
  const analytics = renderAnalyticsSnippet(site)
  const favicon = seo.enabled ? faviconHref(site, currentOutputPath) : ''
  const published = article ? dateIso(dateForNote(article)) : ''
  const modified = article ? dateIso(article.modified) : ''
  const authorName = seo.authorName
  const tags = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="generator" content="${GENERATOR}">`,
    seo.enabled ? `<meta name="robots" content="${seo.robotsMode === 'noindex' ? 'noindex,nofollow' : 'index,follow'}">` : '',
    desc ? `<meta name="description" content="${escapeAttribute(desc)}">` : '',
    seo.enabled && authorName ? `<meta name="author" content="${escapeAttribute(authorName)}">` : '',
    seo.enabled ? `<meta property="og:title" content="${escapeAttribute(renderedTitle)}">` : '',
    seo.enabled && desc ? `<meta property="og:description" content="${escapeAttribute(desc)}">` : '',
    seo.enabled ? `<meta property="og:type" content="${kind === 'article' ? 'article' : 'website'}">` : '',
    seo.enabled ? `<meta property="og:site_name" content="${escapeAttribute(site.title)}">` : '',
    canonical ? `<link rel="canonical" href="${escapeAttribute(canonical)}">` : '',
    canonical ? `<meta property="og:url" content="${escapeAttribute(canonical)}">` : '',
    socialImage ? `<meta property="og:image" content="${escapeAttribute(socialImage)}">` : '',
    seo.enabled ? `<meta name="twitter:title" content="${escapeAttribute(renderedTitle)}">` : '',
    seo.enabled && desc ? `<meta name="twitter:description" content="${escapeAttribute(desc)}">` : '',
    seo.enabled ? (socialImage ? '<meta name="twitter:card" content="summary_large_image">' : '<meta name="twitter:card" content="summary">') : '',
    socialImage ? `<meta name="twitter:image" content="${escapeAttribute(socialImage)}">` : '',
    kind === 'article' && published ? `<meta property="article:published_time" content="${escapeAttribute(published)}">` : '',
    kind === 'article' && modified ? `<meta property="article:modified_time" content="${escapeAttribute(modified)}">` : '',
    kind === 'article' && authorName ? `<meta property="article:author" content="${escapeAttribute(authorName)}">` : '',
    favicon ? `<link rel="icon" href="${escapeAttribute(favicon)}">` : '',
    rssHref ? `<link rel="alternate" type="application/rss+xml" title="${escapeAttribute(site.title)} RSS" href="${rssHref}">` : '',
    `<title>${escapeHtml(renderedTitle)}</title>`,
    `<link rel="stylesheet" href="${relativeHref(currentOutputPath, '_forge/styles.css')}">`,
    `<script src="${relativeHref(currentOutputPath, '_forge/site.js')}" defer></script>`,
    seo.enabled && kind === 'article'
      ? articleStructuredData({ title, site, description: desc, currentOutputPath, article, socialImage })
      : '',
    analytics
  ].filter(Boolean)

  return tags.join('\n  ')
}

function renderCustomFooter(site) {
  const footer = stringValue(site.integrations.seoRss.customFooter)
  if (!footer) return ''
  const body = escapeHtml(footer).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')
  return `<footer class="custom-site-footer"><p>${body}</p></footer>`
}

function parseEmbedBlock(body) {
  const data = {}
  const freeform = []
  for (const line of String(body ?? '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = /^([A-Za-z][\w-]*):\s*(.+)$/.exec(trimmed)
    if (match) {
      data[match[1].toLowerCase()] = match[2].trim()
    } else {
      freeform.push(trimmed)
    }
  }

  return {
    url: data.url || freeform[0] || '',
    title: data.title || freeform[1] || 'Embedded content',
    height: Number.parseInt(data.height || '', 10) || 420
  }
}

function renderEmbedBlock(site, body) {
  const embeds = site.integrations.embeds
  const parsed = parseEmbedBlock(body)
  const url = normalizePublicUrl(parsed.url)
  if (!url) return ''
  if (!embeds.enabled || !embeds.allowIframes) {
    return `<p><a class="external-link forge-embed-link" href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">${escapeHtml(parsed.title)}</a></p>`
  }

  const height = Math.max(220, Math.min(900, parsed.height))
  return `<figure class="forge-embed-frame">
    <iframe src="${escapeAttribute(url)}" title="${escapeAttribute(parsed.title)}" loading="lazy" height="${height}" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms" referrerpolicy="strict-origin-when-cross-origin"></iframe>
    <figcaption>${escapeHtml(parsed.title)}</figcaption>
  </figure>`
}

function renderSiteForm(site, currentOutputPath) {
  const form = site.integrations.forms
  if (!form.enabled || form.provider === 'none') return ''

  const formName = slugify(form.formName, 'contact')
  const label = form.buttonLabel || 'Send'
  const endpoint = form.provider === 'netlify' ? '' : normalizePublicUrl(form.endpoint)
  if (form.provider !== 'netlify' && !endpoint) return ''
  const action = endpoint ? ` action="${escapeAttribute(endpoint)}"` : ''
  const providerAttrs =
    form.provider === 'netlify'
      ? ` data-netlify="true" netlify-honeypot="bot-field"`
      : ''

  return `<section class="publish-form-section" aria-label="Contact">
    <div>
      <p class="eyebrow">Contact</p>
      <h2>Send a note</h2>
      <p>This static form is configured for ${escapeHtml(form.provider === 'netlify' ? 'Netlify Forms' : form.provider)}.</p>
    </div>
    <form class="publish-form" name="${escapeAttribute(formName)}" method="POST"${action}${providerAttrs}>
      <input type="hidden" name="form-name" value="${escapeAttribute(formName)}">
      ${form.provider === 'netlify' ? '<p class="form-honeypot"><label>Do not fill this out <input name="bot-field"></label></p>' : ''}
      <label><span>Name</span><input name="name" autocomplete="name"></label>
      <label><span>Email</span><input name="email" type="email" autocomplete="email"></label>
      <label><span>Message</span><textarea name="message" rows="5"></textarea></label>
      <button type="submit">${escapeHtml(label)}</button>
    </form>
  </section>`
}

function renderMarkdown(note, site) {
  let headingIndex = 0

  function galleryAssetFromLine(line) {
    const trimmed = line.trim()
    if (!trimmed) return null

    const wiki = /^!\[\[([^[\]]+?)\]\]$/.exec(trimmed)
    if (wiki) {
      const parsed = parseWikiInner(wiki[1])
      const asset = resolveAssetTarget(parsed.docTarget, note.path, site.assetPaths)
      if (!asset || !IMAGE_EXT_RE.test(asset)) return null
      return { asset, label: parsed.label || path.posix.basename(asset), suffix: '' }
    }

    const markdown = /^!\[([^\]\n]*)\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)$/.exec(trimmed)
    if (markdown) {
      const href = normalizeMarkdownHref(markdown[2])
      const asset = resolveAssetHref(href, note.path, site.assetPaths)
      if (!asset || !IMAGE_EXT_RE.test(asset.resolved)) return null
      const suffix = `${asset.query ? `?${asset.query}` : ''}${asset.hash ? `#${encodeURIComponent(asset.hash)}` : ''}`
      return { asset: asset.resolved, label: markdown[1] || path.posix.basename(asset.resolved), suffix }
    }

    const asset = resolveAssetTarget(trimmed, note.path, site.assetPaths)
    if (!asset || !IMAGE_EXT_RE.test(asset)) return null
    return { asset, label: path.posix.basename(asset), suffix: '' }
  }

  const galleryExt = {
    name: 'forgeGallery',
    level: 'block',
    start(src) {
      const match = src.match(/^```forge-gallery/m)
      return match?.index
    },
    tokenizer(src) {
      const match = /^```forge-gallery[^\n]*\n([\s\S]*?)\n```(?:\n|$)/.exec(src)
      if (!match) return undefined
      return { type: 'forgeGallery', raw: match[0], body: match[1] }
    },
    renderer(token) {
      const items = String(token.body ?? '')
        .split(/\r?\n/)
        .map(galleryAssetFromLine)
        .filter(Boolean)
      if (!items.length) return ''
      const figures = items
        .map((item) => {
          const src = `${relativeHref(note.outputPath, assetOutputPath(item.asset))}${item.suffix}`
          return `<figure><img src="${escapeAttribute(src)}" alt="${escapeAttribute(item.label)}" loading="lazy"><figcaption>${escapeHtml(item.label)}</figcaption></figure>`
        })
        .join('')
      return `<div class="media-gallery" data-count="${items.length}">${figures}</div>`
    }
  }

  const forgeEmbedExt = {
    name: 'forgeEmbed',
    level: 'block',
    start(src) {
      const match = src.match(/^```forge-embed/m)
      return match?.index
    },
    tokenizer(src) {
      const match = /^```forge-embed[^\n]*\n([\s\S]*?)\n```(?:\n|$)/.exec(src)
      if (!match) return undefined
      return { type: 'forgeEmbed', raw: match[0], body: match[1] }
    },
    renderer(token) {
      return renderEmbedBlock(site, token.body)
    }
  }

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
        if (!site.integrations.embeds.allowExternalMedia) {
          return `<a class="external-link missing-asset" href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">${escapeHtml(token.text || href)}</a>`
        }
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
    extensions: [galleryExt, forgeEmbedExt, wikilinkExt, hashtagExt],
    renderer
  })

  return marked.parse(note.body, { async: false })
}

function pageShell({ title, site, description = '', currentOutputPath, body, navNotes, tagIndex, article = null }) {
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
<html lang="${escapeAttribute(site.integrations.seoRss.language)}">
<head>
  ${renderHeadTags({ title, site, description, currentOutputPath, kind: article ? 'article' : 'website', article })}
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
      ${renderCustomFooter(site)}
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

function blogShell({ title, site, description = '', currentOutputPath, body, headerVariant = '', article = null }) {
  return `<!doctype html>
<html lang="${escapeAttribute(site.integrations.seoRss.language)}">
<head>
  ${renderHeadTags({ title, site, description, currentOutputPath, kind: article ? 'article' : 'website', article })}
</head>
<body class="site-theme-${escapeAttribute(site.theme)}">
  <a class="skip-link" href="#content">Skip to content</a>
  <div class="reading-progress" data-progress></div>
  ${blogHeader(site, currentOutputPath, headerVariant)}
  <main id="content">
${body}
    ${renderCustomFooter(site)}
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
    </section>
    ${renderSiteForm(site, outputPath)}`
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
    </section>
    ${renderSiteForm(site, outputPath)}`
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
    </section>
    ${renderSiteForm(site, outputPath)}`
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
    </section>
    ${renderSiteForm(site, outputPath)}`
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
    </section>
    ${renderSiteForm(site, outputPath)}`
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
      ${renderSiteForm(site, outputPath)}
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
      article: note,
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
      article: note,
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
      article: note,
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
      article: note,
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
    article: note,
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
    article: note,
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

function renderRssFeed(site) {
  const base = sitePublicBaseUrl(site)
  if (!base) return ''
  const items = blogNotes(site)
    .slice(0, 50)
    .map((note) => {
      const url = publicUrl(site, note.outputPath)
      const description = noteExcerpt(note)
      return `    <item>
      <title>${escapeXml(note.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid>${escapeXml(url)}</guid>
      <pubDate>${dateForNote(note).toUTCString()}</pubDate>
      <description>${escapeXml(description)}</description>
    </item>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(site.title)}</title>
    <link>${escapeXml(publicUrl(site, 'index.html'))}</link>
    <description>${escapeXml(site.description || `Published notes from ${site.title}`)}</description>
    <generator>${GENERATOR}</generator>
${items}
  </channel>
</rss>
`
}

function renderSitemap(site) {
  const base = sitePublicBaseUrl(site)
  if (!base) return ''
  const pages = [
    { loc: publicUrl(site, 'index.html'), modified: new Date().toISOString() },
    ...site.notes.map((note) => ({ loc: publicUrl(site, note.outputPath), modified: note.modified })),
    ...(site.showTags ? site.tagIndex.map((tag) => ({ loc: publicUrl(site, tag.outputPath), modified: new Date().toISOString() })) : [])
  ].filter((page) => page.loc)

  return `<?xml version="1.0" encoding="UTF-8" ?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) => `  <url>
    <loc>${escapeXml(page.loc)}</loc>
    <lastmod>${escapeXml(new Date(page.modified).toISOString())}</lastmod>
  </url>`
  )
  .join('\n')}
</urlset>
`
}

function renderRobots(site) {
  const sitemapUrl = publicUrl(site, 'sitemap.xml')
  const access = site.integrations.seoRss.robotsMode === 'noindex' ? 'Disallow: /' : 'Allow: /'
  return ['User-agent: *', access, sitemapUrl ? `Sitemap: ${sitemapUrl}` : ''].filter(Boolean).join('\n') + '\n'
}

function publicIntegrationManifest(site) {
  return {
    seoRss: {
      enabled: site.integrations.seoRss.enabled,
      siteUrl: site.integrations.seoRss.siteUrl,
      authorName: site.integrations.seoRss.authorName,
      language: site.integrations.seoRss.language,
      robotsMode: site.integrations.seoRss.robotsMode,
      favicon: site.integrations.seoRss.favicon,
      customFooter: Boolean(site.integrations.seoRss.customFooter),
      rss: site.integrations.seoRss.rss,
      sitemap: site.integrations.seoRss.sitemap,
      robots: site.integrations.seoRss.robots
    },
    analytics: {
      provider: site.integrations.analytics.provider,
      domain: site.integrations.analytics.provider === 'plausible' ? site.integrations.analytics.domain : '',
      websiteId: site.integrations.analytics.provider === 'umami' ? site.integrations.analytics.websiteId : ''
    },
    deploy: {
      target: site.integrations.deploy.target,
      projectName: site.integrations.deploy.projectName,
      productionUrl: site.integrations.deploy.productionUrl
    },
    embeds: site.integrations.embeds,
    forms: {
      enabled: site.integrations.forms.enabled,
      provider: site.integrations.forms.provider,
      formName: site.integrations.forms.formName
    }
  }
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
  showBacklinks = true,
  integrations = {}
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
    integrations: normalizeIntegrations(integrations),
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

  if (site.integrations.seoRss.enabled && site.integrations.seoRss.rss && sitePublicBaseUrl(site)) {
    const feed = renderRssFeed(site)
    await writeText(resolvedOutput, 'feed.xml', feed, written)
    await writeText(resolvedOutput, 'rss.xml', feed, written)
  }

  if (site.integrations.seoRss.enabled && site.integrations.seoRss.sitemap && sitePublicBaseUrl(site)) {
    await writeText(resolvedOutput, 'sitemap.xml', renderSitemap(site), written)
  }

  if (site.integrations.seoRss.enabled && site.integrations.seoRss.robots) {
    await writeText(resolvedOutput, 'robots.txt', renderRobots(site), written)
  }

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
        integrations: publicIntegrationManifest(site),
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
