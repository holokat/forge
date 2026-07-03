import { useMemo, useState } from 'react'
import { CalendarDays, FileAudio, Link2, Timer } from 'lucide-react'
import { getActiveEditor } from '../editor/active'
import { scrollToLine } from '../editor/extensions'
import { createExtensionRuntime } from '../extensions/runtime'
import {
  WIKILINK_RE,
  baseName,
  isAudio,
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

function ExtensionWidgets({ path }: { path: string }): React.JSX.Element | null {
  const extensionSettings = useStore((s) => s.extensionSettings)
  const counts = useStore((s) => s.counts)
  const dailyNotesFolder = useStore((s) => s.dailyNotesFolder)
  const createDailyNote = useStore((s) => s.createDailyNote)
  const runtime = useMemo(() => createExtensionRuntime(extensionSettings), [extensionSettings])
  const widgets = new Set(runtime.sidebarWidgets.map((widget) => widget.widget))
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
  const path = active?.kind === 'note' ? active.path : null

  return (
    <div className="sidebar-inner">
      <div className="sidebar-titlebar" />
      {path ? (
        <div className="sidebar-content panel-scroll">
          <ExtensionWidgets path={path} />
          <AudioAttachments path={path} />
          <Properties path={path} />
          <Outline path={path} />
          <Backlinks path={path} />
          <UnlinkedMentions path={path} />
          <Tags path={path} />
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
