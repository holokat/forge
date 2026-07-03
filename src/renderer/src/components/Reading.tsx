import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { renderMarkdown } from '../lib/render'
import { baseName, noteDisplayTitle, parseNote, resolveLink } from '../lib/parse'
import { noteContents, useStore } from '../store'

const TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/gm
const PREVIEW_WIDTH = 320
const PREVIEW_MARGIN = 14
const PREVIEW_OFFSET = 10

interface LinkPreview {
  path: string
  title: string
  excerpt: string
  x: number
  y: number
  placement: 'above' | 'below'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function plainTextExcerpt(markdown: string): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[\[([^[\]]+?)\]\]/g, '')
    .replace(/\[\[([^[\]|#]+)(?:#[^[\]|]+)?(?:\|([^[\]]+))?\]\]/g, (_match, target: string, label?: string) => label ?? target)
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+[.)]\s+/gm, '')
    .replace(/[*_~>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) return 'Empty note.'
  if (text.length <= 220) return text
  return `${text.slice(0, 220).replace(/\s+\S*$/, '').trim()}...`
}

function markdownHrefTarget(href: string | null): string | null {
  if (!href) return null
  const trimmed = href.trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('/')) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null

  const withoutHash = trimmed.split('#')[0].split('?')[0].replace(/^\.\//, '').trim()
  if (!withoutHash) return null

  try {
    return decodeURIComponent(withoutHash)
  } catch {
    return withoutHash
  }
}

function targetFromLink(link: HTMLAnchorElement): string | null {
  const wikilinkTarget = link.getAttribute('data-target')
  if (wikilinkTarget) return wikilinkTarget
  return markdownHrefTarget(link.getAttribute('href'))
}

export default function Reading({ path }: { path: string }): React.JSX.Element {
  const vault = useStore((s) => s.vault)!
  const files = useStore((s) => s.files)
  const contentVersion = useStore((s) => s.contentVersion)
  const ref = useRef<HTMLDivElement>(null)
  const activePreviewLink = useRef<HTMLAnchorElement | null>(null)
  const previewHideTimer = useRef<number | null>(null)
  const [preview, setPreview] = useState<LinkPreview | null>(null)

  const html = useMemo(
    () => renderMarkdown(noteContents.get(path) ?? '', vault, files),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, vault, files, contentVersion]
  )

  // Make task checkboxes interactive: toggling one flips the matching
  // `- [ ]` in the source markdown.
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const boxes = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    boxes.forEach((box, i) => {
      box.disabled = false
      box.onchange = () => {
        const source = noteContents.get(path) ?? ''
        let n = -1
        const next = source.replace(TASK_RE, (match, prefix: string, state: string) => {
          n += 1
          if (n !== i) return match
          return `${prefix}[${state === ' ' ? 'x' : ' '}]`
        })
        useStore.getState().updateContent(path, next)
      }
    })
  }, [html, path])

  const clearPreviewTimer = useCallback(() => {
    if (!previewHideTimer.current) return
    window.clearTimeout(previewHideTimer.current)
    previewHideTimer.current = null
  }, [])

  const hidePreview = useCallback(() => {
    clearPreviewTimer()
    activePreviewLink.current = null
    setPreview(null)
  }, [clearPreviewTimer])

  const scheduleHidePreview = useCallback(() => {
    clearPreviewTimer()
    previewHideTimer.current = window.setTimeout(hidePreview, 90)
  }, [clearPreviewTimer, hidePreview])

  const showPreviewForLink = useCallback(
    (link: HTMLAnchorElement) => {
      clearPreviewTimer()
      const target = targetFromLink(link)
      if (!target) {
        hidePreview()
        return
      }

      const resolved = resolveLink(target, files)
      if (!resolved) {
        hidePreview()
        return
      }

      const source = noteContents.get(resolved)
      if (source === undefined) {
        hidePreview()
        return
      }

      const meta = parseNote(source)
      const rect = link.getBoundingClientRect()
      const maxLeft = Math.max(PREVIEW_MARGIN, window.innerWidth - PREVIEW_WIDTH - PREVIEW_MARGIN)
      const left = clamp(rect.left + rect.width / 2 - PREVIEW_WIDTH / 2, PREVIEW_MARGIN, maxLeft)
      const hasRoomBelow = rect.bottom + 190 < window.innerHeight
      const placement = hasRoomBelow ? 'below' : 'above'
      const top = placement === 'below'
        ? rect.bottom + PREVIEW_OFFSET
        : Math.max(PREVIEW_MARGIN, rect.top - PREVIEW_OFFSET)

      activePreviewLink.current = link
      setPreview({
        path: resolved,
        title: noteDisplayTitle(resolved, meta) || baseName(resolved),
        excerpt: plainTextExcerpt(meta.body),
        x: left,
        y: top,
        placement
      })
    },
    [clearPreviewTimer, files, hidePreview]
  )

  useEffect(() => hidePreview, [hidePreview])

  useEffect(() => {
    hidePreview()
  }, [hidePreview, html, path])

  const linkFromEvent = (target: EventTarget | null): HTMLAnchorElement | null => {
    const root = ref.current
    if (!(target instanceof HTMLElement) || !root) return null
    const link = target.closest<HTMLAnchorElement>('a.internal-link, a.external-link')
    return link && root.contains(link) ? link : null
  }

  const onMouseOver = (e: React.MouseEvent): void => {
    const link = linkFromEvent(e.target)
    if (!link || activePreviewLink.current === link) return
    showPreviewForLink(link)
  }

  const onMouseOut = (e: React.MouseEvent): void => {
    const link = linkFromEvent(e.target)
    if (!link) return
    if (e.relatedTarget instanceof Node && link.contains(e.relatedTarget)) return
    scheduleHidePreview()
  }

  const onFocus = (e: React.FocusEvent): void => {
    const link = linkFromEvent(e.target)
    if (link) showPreviewForLink(link)
  }

  const onBlur = (e: React.FocusEvent): void => {
    const link = linkFromEvent(e.target)
    if (!link) return
    if (e.relatedTarget instanceof Node && link.contains(e.relatedTarget)) return
    scheduleHidePreview()
  }

  const onClick = (e: React.MouseEvent): void => {
    const link = linkFromEvent(e.target)
    if (link) {
      const target = targetFromLink(link)
      if (!target) return
      const store = useStore.getState()
      const resolved = resolveLink(target, store.files)
      if (!resolved && !link.classList.contains('internal-link')) return
      e.preventDefault()
      if (resolved) store.openFile(resolved, { newTab: e.metaKey })
      else store.createNoteNamed(target).catch(console.error)
    }
  }

  return (
    <div className="reading-scroll" onScroll={hidePreview}>
      <div
        ref={ref}
        className="reading-view"
        onClick={onClick}
        onBlur={onBlur}
        onFocus={onFocus}
        onMouseOut={onMouseOut}
        onMouseOver={onMouseOver}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {preview ? (
        <div
          className={`reading-link-preview ${preview.placement === 'above' ? 'is-above' : 'is-below'}`}
          role="tooltip"
          style={{ left: preview.x, top: preview.y }}
        >
          <div className="reading-link-preview-title">{preview.title}</div>
          <div className="reading-link-preview-path">{preview.path}</div>
          <div className="reading-link-preview-excerpt">{preview.excerpt}</div>
        </div>
      ) : null}
    </div>
  )
}
