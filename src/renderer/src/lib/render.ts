import DOMPurify from 'dompurify'
import { marked, type TokenizerAndRendererExtension } from 'marked'
import { baseName, isAudio, isImage, isVideo, linkLabel, linkTarget, resolveLink } from './parse'

interface RenderContext {
  vault: string
  files: string[]
}

let ctx: RenderContext = { vault: '', files: [] }
let headingSlugs = new Set<string>()

function stripInlineMarkdown(value: string): string {
  return String(value ?? '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]/g, '')
    .trim()
}

function slugify(value: string, fallback = 'section'): string {
  const slug = stripInlineMarkdown(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}\s/_-]/gu, '')
    .replace(/[\/_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || fallback
}

function uniqueSlug(value: string, fallback: string): string {
  const base = slugify(value, fallback)
  let slug = base
  let index = 2
  while (headingSlugs.has(slug)) {
    slug = `${base}-${index}`
    index += 1
  }
  headingSlugs.add(slug)
  return slug
}

const wikilinkExt: TokenizerAndRendererExtension = {
  name: 'wikilink',
  level: 'inline',
  start(src: string) {
    const i = src.search(/!?\[\[/)
    return i < 0 ? undefined : i
  },
  tokenizer(src: string) {
    const m = /^(!?)\[\[([^[\]]+?)\]\]/.exec(src)
    if (!m) return undefined
    return { type: 'wikilink', raw: m[0], embed: m[1] === '!', inner: m[2] }
  },
  renderer(token) {
    const target = linkTarget(token.inner as string)
    const label = linkLabel(token.inner as string)
    const resolved = resolveLink(target, ctx.files)
    if (token.embed && resolved && isImage(resolved)) {
      return `<img class="embed" src="${window.forge.assetUrl(ctx.vault, resolved)}" alt="${escapeHtml(label)}">`
    }
    if (token.embed && resolved && isAudio(resolved)) {
      return `<audio class="embed-audio" controls preload="metadata" src="${window.forge.assetUrl(ctx.vault, resolved)}"></audio>`
    }
    if (token.embed && resolved && isVideo(resolved)) {
      return `<video class="embed-video" controls preload="metadata" playsinline src="${window.forge.assetUrl(ctx.vault, resolved)}"></video>`
    }
    const cls = resolved ? 'internal-link' : 'internal-link unresolved'
    return `<a class="${cls}" data-target="${escapeHtml(target)}" href="#">${escapeHtml(label)}</a>`
  }
}

const hashtagExt: TokenizerAndRendererExtension = {
  name: 'hashtag',
  level: 'inline',
  start(src: string) {
    const i = src.search(/#[A-Za-z]/)
    return i < 0 ? undefined : i
  },
  tokenizer(src: string, tokens) {
    const m = /^#[A-Za-z][\w/-]*/.exec(src)
    if (!m) return undefined
    const prev = tokens[tokens.length - 1]
    if (prev && prev.type === 'text' && /\S$/.test(prev.raw)) return undefined
    return { type: 'hashtag', raw: m[0] }
  },
  renderer(token) {
    return `<span class="tag">${escapeHtml(token.raw as string)}</span>`
  }
}

interface GalleryItem {
  path: string
  label: string
}

function normalizeGalleryHref(value: string): string {
  return value.trim().replace(/^<|>$/g, '')
}

function galleryItemFromLine(line: string): GalleryItem | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const wiki = /^!\[\[([^[\]]+?)\]\]$/.exec(trimmed)
  if (wiki) {
    const target = linkTarget(wiki[1])
    const resolved = resolveLink(target, ctx.files)
    if (!resolved || !isImage(resolved)) return null
    return { path: resolved, label: linkLabel(wiki[1]) || baseName(resolved) }
  }

  const markdown = /^!\[([^\]\n]*)\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)$/.exec(trimmed)
  if (markdown) {
    const target = normalizeGalleryHref(markdown[2])
    const resolved = resolveLink(target, ctx.files)
    if (!resolved || !isImage(resolved)) return null
    return { path: resolved, label: markdown[1] || baseName(resolved) }
  }

  const resolved = resolveLink(trimmed, ctx.files)
  if (!resolved || !isImage(resolved)) return null
  return { path: resolved, label: baseName(resolved) }
}

function galleryItems(body: string): GalleryItem[] {
  return body
    .split(/\r?\n/)
    .map(galleryItemFromLine)
    .filter((item): item is GalleryItem => Boolean(item))
}

const galleryExt: TokenizerAndRendererExtension = {
  name: 'forgeGallery',
  level: 'block',
  start(src: string) {
    const match = src.match(/^```forge-gallery/m)
    return match?.index
  },
  tokenizer(src: string) {
    const match = /^```forge-gallery[^\n]*\n([\s\S]*?)\n```(?:\n|$)/.exec(src)
    if (!match) return undefined
    return { type: 'forgeGallery', raw: match[0], body: match[1] }
  },
  renderer(token) {
    const items = galleryItems(token.body as string)
    if (!items.length) return ''
    const figures = items
      .map(
        (item) => `<figure><img src="${window.forge.assetUrl(ctx.vault, item.path)}" alt="${escapeHtml(item.label)}" loading="lazy"><figcaption>${escapeHtml(item.label)}</figcaption></figure>`
      )
      .join('')
    return `<div class="media-gallery" data-count="${items.length}">${figures}</div>`
  }
}

marked.use({
  gfm: true,
  breaks: false,
  extensions: [galleryExt, wikilinkExt, hashtagExt],
  renderer: {
    heading({ tokens, depth, text }) {
      const body = this.parser.parseInline(tokens)
      const slug = uniqueSlug(text ?? body, `heading-${headingSlugs.size + 1}`)
      return `<h${depth} id="${escapeHtml(slug)}">${body}<a class="heading-anchor" href="#${escapeHtml(slug)}" aria-label="Link to this heading">#</a></h${depth}>`
    },
    image({ href, title, text }) {
      let src = href ?? ''
      if (!/^(https?:|data:|forge-asset:)/.test(src)) {
        const resolved = resolveLink(src, ctx.files) ?? src
        src = window.forge.assetUrl(ctx.vault, resolved)
      }
      return `<img class="embed" src="${escapeHtml(src)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ''}>`
    },
    link({ href, title, tokens }) {
      const body = this.parser.parseInline(tokens)
      const t = title ? ` title="${escapeHtml(title)}"` : ''
      const target = href ?? ''
      if (target.startsWith('#')) {
        return `<a class="heading-link" href="${escapeHtml(target)}"${t}>${body}</a>`
      }
      return `<a class="external-link" href="${escapeHtml(target)}" target="_blank" rel="noreferrer"${t}>${body}</a>`
    }
  }
})

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderMarkdown(content: string, vault: string, files: string[]): string {
  ctx = { vault, files }
  headingSlugs = new Set<string>()
  const html = marked.parse(content, { async: false })
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['data-target', 'data-count', 'target', 'controls', 'preload', 'playsinline', 'id', 'aria-label', 'loading'],
    ADD_TAGS: ['audio', 'video', 'figure', 'figcaption'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|forge-asset|data|file):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
  })
}
