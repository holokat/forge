import { useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Link2,
  ListChecks,
  Network,
  SquareCheckBig,
  Timer
} from 'lucide-react'
import { getActiveEditor } from '../editor/active'
import { scrollToLine } from '../editor/extensions'
import { createExtensionRuntime, type ExtensionRuntimeCatalog } from '../extensions/runtime'
import {
  WIKILINK_RE,
  baseName,
  isAudio,
  isImage,
  isVideo,
  linkTarget,
  noteDisplayTitle,
  resolveLink,
  type PropertyValue
} from '../lib/parse'
import { activeTab, backlinksFor, noteContents, unlinkedMentionsFor, useStore } from '../store'

interface MentionMatch {
  start: number
  end: number
  text: string
  line: string
  lineNumber: number
}

interface TaskItem {
  lineNumber: number
  text: string
  done: boolean
}

type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'file'

interface MediaAttachment {
  kind: MediaKind
  rel: string
  name: string
  url: string
  extension: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function lineContext(content: string, start: number): { line: string; lineNumber: number } {
  const lineStart = content.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const nextBreak = content.indexOf('\n', start)
  const lineEnd = nextBreak === -1 ? content.length : nextBreak
  const lineNumber = content.slice(0, lineStart).split('\n').length
  return { line: content.slice(lineStart, lineEnd).trim(), lineNumber }
}

function isInsideRange(start: number, end: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([rangeStart, rangeEnd]) => start >= rangeStart && end <= rangeEnd)
}

function protectedRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (const match of content.matchAll(WIKILINK_RE)) {
    if (match.index !== undefined) ranges.push([match.index, match.index + match[0].length])
  }
  for (const match of content.matchAll(/\[[^\]]+?\]\([^)]+?\)/g)) {
    if (match.index !== undefined) ranges.push([match.index, match.index + match[0].length])
  }
  for (const match of content.matchAll(/`[^`\n]+?`/g)) {
    if (match.index !== undefined) ranges.push([match.index, match.index + match[0].length])
  }
  return ranges
}

function mentionNamesFor(path: string): string[] {
  const meta = useStore.getState().index[path]
  return [noteDisplayTitle(path, meta), baseName(path), ...(meta?.aliases ?? [])]
    .map((name) => name.trim())
    .filter(
      (name, index, all) =>
        name.length >= 3 && all.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index
    )
}

function findMentionMatch(content: string, names: string[]): MentionMatch | null {
  const ranges = protectedRanges(content)
  const matches: MentionMatch[] = []

  for (const name of names) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRegExp(name)})(?=[^\\p{L}\\p{N}_]|$)`, 'giu')
    for (const match of content.matchAll(pattern)) {
      if (match.index === undefined) continue
      const start = match.index + match[1].length
      const end = start + match[2].length
      if (isInsideRange(start, end, ranges)) continue
      matches.push({ start, end, text: match[2], ...lineContext(content, start) })
    }
  }

  return matches.sort((a, b) => a.start - b.start)[0] ?? null
}

function findBacklinkLine(content: string, targetPath: string, files: string[]): string {
  for (const line of content.split('\n')) {
    for (const match of line.matchAll(WIKILINK_RE)) {
      const target = linkTarget(match[1])
      if (resolveLink(target, files) === targetPath) return line.trim()
    }
  }
  return ''
}

function todayKey(): string {
  const date = new Date()
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function runtimeHasWidget(runtime: ExtensionRuntimeCatalog, widget: string): boolean {
  return runtime.manifests.some((item) =>
    item.manifest.contributes.some((contribution) => {
      return contribution.kind === 'sidebar-widget' && contribution.widget === widget
    })
  )
}

function legacyWidgetEnabled(runtime: ExtensionRuntimeCatalog, widgets: Set<string>, widget: string): boolean {
  return widgets.has(widget) || !runtimeHasWidget(runtime, widget)
}

function ExtensionWidgets({
  path,
  runtime,
  widgets
}: {
  path: string
  runtime: ExtensionRuntimeCatalog
  widgets: Set<string>
}): React.JSX.Element | null {
  const counts = useStore((s) => s.counts)
  const dailyNotesFolder = useStore((s) => s.dailyNotesFolder)
  const createDailyNote = useStore((s) => s.createDailyNote)
  const showStats = widgets.has('reading-stats')
  const showDaily = widgets.has('daily-note')
  const readingMinutes = Math.max(1, Math.ceil(counts.words / 220))

  if (!showStats && !showDaily) return null

  return (
    <>
      {showDaily && (
        <div className="panel-section extension-widget">
          <div className="panel-heading">
            <span className="extension-widget-heading">
              <CalendarDays size={13} />
              Today
            </span>
          </div>
          <button className="extension-widget-action" onClick={() => createDailyNote().catch(console.error)}>
            <span>{todayKey()}</span>
            <small>{dailyNotesFolder || 'Daily'}</small>
          </button>
        </div>
      )}
      {showStats && (
        <div className="panel-section extension-widget">
          <div className="panel-heading">
            <span className="extension-widget-heading">
              <Timer size={13} />
              Reading stats
            </span>
          </div>
          <div className="extension-stats-grid" title={path}>
            <span>
              <strong>{counts.words.toLocaleString()}</strong>
              words
            </span>
            <span>
              <strong>{counts.chars.toLocaleString()}</strong>
              chars
            </span>
            <span>
              <strong>{readingMinutes}</strong>
              min
            </span>
          </div>
        </div>
      )}
    </>
  )
}

function linkedMediaCount(content: string, files: string[]): number {
  let count = 0
  for (const match of content.matchAll(WIKILINK_RE)) {
    const target = linkTarget(match[1])
    const resolved = resolveLink(target, files)
    if (resolved && (isImage(resolved) || isVideo(resolved) || isAudio(resolved) || isPdf(resolved))) count += 1
  }
  return count
}

function fileExtension(rel: string): string {
  const name = rel.split('/').pop() ?? rel
  const match = /\.([A-Za-z0-9]+)$/.exec(name)
  return match ? match[1].toLowerCase() : ''
}

function isPdf(rel: string): boolean {
  return fileExtension(rel) === 'pdf'
}

function isCommonAttachment(rel: string): boolean {
  return /(\.(docx?|xlsx?|pptx?|pages|numbers|key|txt|rtf|csv|tsv|json|ya?ml|zip|rar|7z|tar|gz|tgz|epub|ics))$/i.test(
    rel
  )
}

function mediaKind(rel: string): MediaKind | null {
  if (isImage(rel)) return 'image'
  if (isVideo(rel)) return 'video'
  if (isAudio(rel)) return 'audio'
  if (isPdf(rel)) return 'pdf'
  if (isCommonAttachment(rel)) return 'file'
  return null
}

function canPreviewImage(rel: string): boolean {
  return /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i.test(rel)
}

function mediaKindLabel(kind: MediaKind): string {
  switch (kind) {
    case 'image':
      return 'Image'
    case 'video':
      return 'Video'
    case 'audio':
      return 'Audio'
    case 'pdf':
      return 'PDF'
    case 'file':
      return 'File'
  }
}

function MediaIcon({ kind }: { kind: MediaKind }): React.JSX.Element {
  switch (kind) {
    case 'image':
      return <FileImage size={14} />
    case 'video':
      return <FileVideo size={14} />
    case 'audio':
      return <FileAudio size={14} />
    case 'pdf':
      return <FileText size={14} />
    case 'file':
      return <File size={14} />
  }
}

function linkedMediaAttachments(content: string, files: string[], vault: string): MediaAttachment[] {
  const found: MediaAttachment[] = []
  const seen = new Set<string>()

  for (const match of content.matchAll(WIKILINK_RE)) {
    const target = linkTarget(match[1])
    const resolved = resolveLink(target, files)
    if (!resolved || seen.has(resolved)) continue

    const kind = mediaKind(resolved)
    if (!kind) continue

    seen.add(resolved)
    found.push({
      kind,
      rel: resolved,
      name: baseName(resolved),
      url: window.forge.assetUrl(vault, resolved),
      extension: fileExtension(resolved).toUpperCase() || mediaKindLabel(kind)
    })
  }

  return found
}

function unresolvedLinks(path: string, files: string[]): string[] {
  const meta = useStore.getState().index[path]
  if (!meta) return []
  return Array.from(new Set(meta.links.filter((target) => !resolveLink(target, files)))).sort((a, b) =>
    a.localeCompare(b)
  )
}

function taskItems(content: string): TaskItem[] {
  return content
    .split('\n')
    .map((line, index) => {
      const match = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)$/.exec(line)
      if (!match) return null
      return {
        lineNumber: index,
        text: match[3].trim(),
        done: match[2].toLowerCase() === 'x'
      }
    })
    .filter((item): item is TaskItem => Boolean(item))
}

function TaskSummary({ path }: { path: string }): React.JSX.Element | null {
  const contentVersion = useStore((s) => s.contentVersion)
  const content = noteContents.get(path) ?? ''
  const tasks = useMemo(() => taskItems(content), [content, contentVersion])
  const open = tasks.filter((task) => !task.done)
  const done = tasks.length - open.length

  if (tasks.length === 0) return null

  return (
    <div className="panel-section extension-widget">
      <div className="panel-heading">
        <span className="extension-widget-heading">
          <SquareCheckBig size={13} />
          Tasks
        </span>
        <span className="panel-count">{tasks.length}</span>
      </div>
      <div className="extension-stats-grid extension-task-grid">
        <span>
          <strong>{open.length.toLocaleString()}</strong>
          open
        </span>
        <span>
          <strong>{done.toLocaleString()}</strong>
          done
        </span>
        <span>
          <strong>{Math.round((done / tasks.length) * 100).toLocaleString()}%</strong>
          complete
        </span>
      </div>
      {open.length > 0 && (
        <div className="extension-task-list">
          {open.slice(0, 6).map((task) => (
            <button
              key={`${task.lineNumber}:${task.text}`}
              type="button"
              onClick={() => {
                const view = getActiveEditor()
                if (view) scrollToLine(view, task.lineNumber)
              }}
            >
              <span>Line {task.lineNumber + 1}</span>
              <strong>{task.text}</strong>
            </button>
          ))}
          {open.length > 6 && <div className="extension-task-more">+{open.length - 6} more open tasks</div>}
        </div>
      )}
    </div>
  )
}

function LinkHealth({ path }: { path: string }): React.JSX.Element | null {
  const files = useStore((s) => s.files)
  const index = useStore((s) => s.index)
  const contentVersion = useStore((s) => s.contentVersion)
  const meta = index[path]
  const backlinks = useMemo(() => backlinksFor(path, files, index), [path, files, index, contentVersion])
  const broken = useMemo(() => unresolvedLinks(path, files), [path, files, index, contentVersion])
  const outbound = meta?.links.length ?? 0

  if (!meta) return null

  return (
    <div className="panel-section extension-widget">
      <div className="panel-heading">
        <span className="extension-widget-heading">
          <Network size={13} />
          Link health
        </span>
      </div>
      <div className="extension-stats-grid extension-health-grid">
        <span>
          <strong>{outbound.toLocaleString()}</strong>
          out
        </span>
        <span className={broken.length > 0 ? 'is-warning' : ''}>
          <strong>{broken.length.toLocaleString()}</strong>
          broken
        </span>
        <span>
          <strong>{backlinks.length.toLocaleString()}</strong>
          back
        </span>
      </div>
      {broken.length > 0 && (
        <div className="extension-compact-list">
          {broken.slice(0, 5).map((target) => (
            <span key={target}>{target}</span>
          ))}
          {broken.length > 5 && <span>+{broken.length - 5} more</span>}
        </div>
      )}
    </div>
  )
}

function PublishChecklist({ path }: { path: string }): React.JSX.Element | null {
  const files = useStore((s) => s.files)
  const index = useStore((s) => s.index)
  const contentVersion = useStore((s) => s.contentVersion)
  const meta = index[path]
  const content = noteContents.get(path) ?? ''
  const broken = useMemo(() => unresolvedLinks(path, files), [path, files, index, contentVersion])
  const mediaCount = useMemo(() => linkedMediaCount(content, files), [content, files])

  if (!meta) return null

  const checks = [
    {
      label: 'Title heading',
      passed: meta.headings.some((heading) => heading.level === 1)
    },
    {
      label: 'Slug or title metadata',
      passed: Boolean(meta.properties.slug || meta.properties.title)
    },
    {
      label: 'No broken wikilinks',
      passed: broken.length === 0
    },
    {
      label: 'Summary section',
      passed: meta.headings.some((heading) => /summary|overview|intro/i.test(heading.text))
    },
    {
      label: 'Assets referenced',
      passed: mediaCount > 0
    }
  ]

  return (
    <div className="panel-section extension-widget">
      <div className="panel-heading">
        <span className="extension-widget-heading">
          <ListChecks size={13} />
          Publish checklist
        </span>
      </div>
      <div className="extension-checklist">
        {checks.map((check) => (
          <div className={check.passed ? 'is-passed' : 'is-open'} key={check.label}>
            {check.passed ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
            <span>{check.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Backlinks({ path }: { path: string }): React.JSX.Element {
  const files = useStore((s) => s.files)
  const index = useStore((s) => s.index)
  const openFile = useStore((s) => s.openFile)
  const contentVersion = useStore((s) => s.contentVersion)
  const backlinks = useMemo(() => backlinksFor(path, files, index), [path, files, index, contentVersion])

  return (
    <div className="panel-section">
      <div className="panel-heading">
        Backlinks
        {backlinks.length > 0 && <span className="panel-count">{backlinks.length}</span>}
      </div>
      {backlinks.length === 0 ? (
        <div className="panel-empty">No notes link here yet.</div>
      ) : (
        backlinks.map((source) => {
          const content = noteContents.get(source) ?? ''
          const lineWithLink = findBacklinkLine(content, path, files)
          return (
            <button key={source} className="backlink-item" onClick={() => openFile(source)}>
              <span className="backlink-name">{baseName(source)}</span>
              {lineWithLink && <span className="backlink-snippet">{lineWithLink.trim().slice(0, 120)}</span>}
            </button>
          )
        })
      )}
    </div>
  )
}

function UnlinkedMentions({ path }: { path: string }): React.JSX.Element | null {
  const files = useStore((s) => s.files)
  const index = useStore((s) => s.index)
  const openFile = useStore((s) => s.openFile)
  const updateContent = useStore((s) => s.updateContent)
  const contentVersion = useStore((s) => s.contentVersion)
  const [linkedSource, setLinkedSource] = useState<string | null>(null)
  const names = useMemo(() => mentionNamesFor(path), [path, index])
  const mentions = useMemo(
    () =>
      unlinkedMentionsFor(path, files, index).map((source) => ({
        source,
        match: findMentionMatch(noteContents.get(source) ?? '', names)
      })),
    [path, files, index, names, contentVersion]
  )

  const linkMention = (source: string, match: MentionMatch | null): void => {
    if (!match) return
    const content = noteContents.get(source) ?? ''
    if (content.slice(match.start, match.end) !== match.text) return

    const target = path.replace(/\.md$/i, '')
    const replacement = `[[${target}|${match.text}]]`
    updateContent(source, content.slice(0, match.start) + replacement + content.slice(match.end))
    setLinkedSource(source)
  }

  if (mentions.length === 0) return null

  return (
    <div className="panel-section">
      <div className="panel-heading">
        Unlinked mentions
        <span className="panel-count">{mentions.length}</span>
      </div>
      {mentions.map(({ source, match }) => {
        const linked = linkedSource === source
        return (
          <div key={source} className="backlink-item unlinked-mention-item">
            <button className="unlinked-mention-open" onClick={() => openFile(source)}>
              <span className="backlink-name">{baseName(source)}</span>
              {match && (
                <span className="backlink-snippet">
                  Line {match.lineNumber}: {match.line.slice(0, 120)}
                </span>
              )}
            </button>
            <button
              className="unlinked-mention-link"
              disabled={!match || linked}
              title={match ? `Insert wikilink in ${baseName(source)}` : 'No safe plain-text mention found'}
              onClick={() => linkMention(source, match)}
            >
              <Link2 size={13} />
              <span>{linked ? 'Linked' : 'Link'}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

function propertyLabel(value: PropertyValue): string {
  return Array.isArray(value) ? value.join(', ') : String(value)
}

function Properties({ path }: { path: string }): React.JSX.Element | null {
  const meta = useStore((s) => s.index[path])
  const entries = Object.entries(meta?.properties ?? {})
  if (entries.length === 0) return null

  return (
    <div className="panel-section">
      <div className="panel-heading">Properties</div>
      <div className="property-list">
        {entries.map(([key, value]) => (
          <div className="property-row" key={key}>
            <span>{key}</span>
            <strong>{propertyLabel(value)}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function MediaGalleryPreview({ item }: { item: MediaAttachment }): React.JSX.Element | null {
  if (item.kind === 'image' && canPreviewImage(item.rel)) {
    return <img className="media-gallery-preview" src={item.url} alt={item.name} loading="lazy" />
  }

  if (item.kind === 'video') {
    return <video className="media-gallery-preview" controls preload="metadata" playsInline src={item.url} />
  }

  if (item.kind === 'pdf') {
    return (
      <object className="media-gallery-pdf" data={item.url} type="application/pdf" title={item.name}>
        <a href={item.url}>Open PDF</a>
      </object>
    )
  }

  return null
}

function MediaGallery({ path }: { path: string }): React.JSX.Element | null {
  const files = useStore((s) => s.files)
  const vault = useStore((s) => s.vault)
  const contentVersion = useStore((s) => s.contentVersion)
  const content = noteContents.get(path) ?? ''
  const mediaFiles = useMemo(
    () => (vault ? linkedMediaAttachments(content, files, vault) : []),
    [content, files, vault, contentVersion]
  )

  if (!vault || mediaFiles.length === 0) return null

  const counts: Record<MediaKind, number> = { image: 0, video: 0, audio: 0, pdf: 0, file: 0 }
  for (const item of mediaFiles) counts[item.kind] += 1

  const countItems = [
    { kind: 'image' as const, label: counts.image === 1 ? 'image' : 'images', count: counts.image },
    { kind: 'video' as const, label: counts.video === 1 ? 'video' : 'videos', count: counts.video },
    { kind: 'audio' as const, label: 'audio', count: counts.audio },
    { kind: 'pdf' as const, label: counts.pdf === 1 ? 'PDF' : 'PDFs', count: counts.pdf },
    { kind: 'file' as const, label: counts.file === 1 ? 'file' : 'files', count: counts.file }
  ].filter((item) => item.count > 0)
  const visibleMedia = mediaFiles.slice(0, 6)

  return (
    <div className="panel-section extension-widget media-gallery">
      <div className="panel-heading">
        <span className="extension-widget-heading">
          <FileArchive size={13} />
          Media gallery
        </span>
        <span className="panel-count">{mediaFiles.length}</span>
      </div>
      <div className="media-gallery-counts" aria-label="Linked media counts">
        {countItems.map((item) => (
          <span key={item.kind}>
            <strong>{item.count.toLocaleString()}</strong>
            {item.label}
          </span>
        ))}
      </div>
      <div className="media-gallery-list">
        {visibleMedia.map((item) => (
          <div className={`media-gallery-item is-${item.kind}`} key={item.rel}>
            <MediaGalleryPreview item={item} />
            <div className="media-gallery-caption">
              <MediaIcon kind={item.kind} />
              <span>{item.name}</span>
              <small>{item.extension}</small>
            </div>
            {item.kind === 'audio' && <audio controls preload="metadata" src={item.url} />}
          </div>
        ))}
        {mediaFiles.length > visibleMedia.length && (
          <div className="media-gallery-more">+{mediaFiles.length - visibleMedia.length} more linked files</div>
        )}
      </div>
    </div>
  )
}

function AudioAttachments({ path }: { path: string }): React.JSX.Element | null {
  const files = useStore((s) => s.files)
  const vault = useStore((s) => s.vault)
  const content = noteContents.get(path) ?? ''

  const audioFiles = useMemo(() => {
    const found: string[] = []
    for (const match of content.matchAll(WIKILINK_RE)) {
      const target = linkTarget(match[1])
      const resolved = resolveLink(target, files)
      if (resolved && isAudio(resolved) && !found.includes(resolved)) found.push(resolved)
    }
    return found
  }, [content, files])

  if (!vault || audioFiles.length === 0) return null

  return (
    <div className="panel-section">
      <div className="panel-heading">
        Audio
        <span className="panel-count">{audioFiles.length}</span>
      </div>
      <div className="audio-attachments">
        {audioFiles.map((rel) => (
          <div className="audio-attachment" key={rel}>
            <div className="audio-attachment-title">
              <FileAudio size={14} />
              <span>{baseName(rel)}</span>
            </div>
            <audio controls preload="metadata" src={window.forge.assetUrl(vault, rel)} />
          </div>
        ))}
      </div>
    </div>
  )
}

function Outline({ path }: { path: string }): React.JSX.Element {
  const index = useStore((s) => s.index)
  const headings = index[path]?.headings ?? []

  return (
    <div className="panel-section">
      <div className="panel-heading">Outline</div>
      {headings.length === 0 ? (
        <div className="panel-empty">No headings in this note.</div>
      ) : (
        headings.map((h, i) => (
          <button
            key={i}
            className="outline-item"
            style={{ paddingLeft: 12 + (h.level - 1) * 12 }}
            onClick={() => {
              const view = getActiveEditor()
              if (view) scrollToLine(view, h.line)
            }}
          >
            {h.text}
          </button>
        ))
      )}
    </div>
  )
}

function Tags({ path }: { path: string }): React.JSX.Element | null {
  const index = useStore((s) => s.index)
  const setLeftPane = useStore((s) => s.setLeftPane)
  const tags = index[path]?.tags ?? []
  if (tags.length === 0) return null

  return (
    <div className="panel-section">
      <div className="panel-heading">Tags</div>
      <div className="panel-tags">
        {tags.map((tag) => (
          <button key={tag} className="tag" onClick={() => setLeftPane('search')}>
            #{tag}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function SidebarRight(): React.JSX.Element {
  const active = useStore(activeTab)
  const extensionSettings = useStore((s) => s.extensionSettings)
  const runtime = useMemo(() => createExtensionRuntime(extensionSettings), [extensionSettings])
  const widgets = useMemo(() => new Set<string>(runtime.sidebarWidgets.map((widget) => widget.widget)), [runtime])
  const path = active?.kind === 'note' ? active.path : null

  return (
    <div className="sidebar-inner">
      <div className="sidebar-titlebar" />
      {path ? (
        <div className="sidebar-content panel-scroll">
          <ExtensionWidgets path={path} runtime={runtime} widgets={widgets} />
          {widgets.has('tasks') && <TaskSummary path={path} />}
          {widgets.has('link-health') && <LinkHealth path={path} />}
          {widgets.has('publish-checklist') && <PublishChecklist path={path} />}
          {widgets.has('media-gallery') && <MediaGallery path={path} />}
          {legacyWidgetEnabled(runtime, widgets, 'audio') && <AudioAttachments path={path} />}
          {legacyWidgetEnabled(runtime, widgets, 'frontmatter') && <Properties path={path} />}
          {legacyWidgetEnabled(runtime, widgets, 'outline') && <Outline path={path} />}
          {legacyWidgetEnabled(runtime, widgets, 'backlinks') && <Backlinks path={path} />}
          {legacyWidgetEnabled(runtime, widgets, 'unlinked-mentions') && <UnlinkedMentions path={path} />}
          {legacyWidgetEnabled(runtime, widgets, 'tags') && <Tags path={path} />}
        </div>
      ) : (
        <div className="sidebar-content">
          <div className="panel-empty" style={{ marginTop: 24 }}>
            Open a note to see its outline and backlinks.
          </div>
        </div>
      )}
    </div>
  )
}
