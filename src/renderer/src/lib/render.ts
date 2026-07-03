import DOMPurify from 'dompurify'
import { marked, type TokenizerAndRendererExtension } from 'marked'
import { isAudio, isImage, isVideo, linkLabel, linkTarget, resolveLink } from './parse'

interface RenderContext {
  vault: string
  files: string[]
}

let ctx: RenderContext = { vault: '', files: [] }

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

marked.use({
  gfm: true,
  breaks: false,
  extensions: [wikilinkExt, hashtagExt],
  renderer: {
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
      return `<a class="external-link" href="${escapeHtml(href ?? '')}" target="_blank" rel="noreferrer"${t}>${body}</a>`
    }
  }
})

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderMarkdown(content: string, vault: string, files: string[]): string {
  ctx = { vault, files }
  const html = marked.parse(content, { async: false })
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['data-target', 'target', 'controls', 'preload', 'playsinline'],
    ADD_TAGS: ['audio', 'video'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|forge-asset|data|file):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
  })
}
