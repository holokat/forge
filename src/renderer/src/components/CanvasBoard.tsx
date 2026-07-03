import { ArrowRight, CircleDot, Clock3, FileText, Inbox, Network, Shapes } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { isMarkdown, noteDisplayTitle, resolveLink, type NoteMeta } from '../lib/parse'
import { noteContents, useStore } from '../store'

interface BoardNote {
  path: string
  title: string
  folder: string
  excerpt: string
  tags: string[]
  outgoing: string[]
  incoming: string[]
  score: number
}

interface BoardLane {
  id: string
  title: string
  detail: string
  icon: ReactNode
  notes: BoardNote[]
}

function folderName(path: string): string {
  const parts = path.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : 'Vault root'
}

function excerptFor(content: string): string {
  const withoutFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
  const line = withoutFrontmatter
    .split(/\r?\n/)
    .map((part) => part.replace(/^#{1,6}\s+/, '').trim())
    .find((part) => part && !part.startsWith('![') && !part.startsWith('[['))
  return line ? line.slice(0, 148) : 'No preview text yet.'
}

function noteRank(path: string, tags: string[], linkCount: number, wordCount: number): number {
  let score = linkCount * 8 + Math.min(24, Math.floor(wordCount / 90))
  if (/inbox|todo|task|plan|brief|project|roadmap|spec|decision/i.test(path)) score += 12
  if (tags.some((tag) => /project|task|todo|idea|research|publish|seo/i.test(tag))) score += 10
  return score
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function buildBoard(files: string[], index: Record<string, NoteMeta>): BoardNote[] {
  const notePaths = files.filter(isMarkdown)
  const incomingByPath = new Map<string, string[]>()
  const outgoingByPath = new Map<string, string[]>()

  for (const path of notePaths) {
    incomingByPath.set(path, [])
    outgoingByPath.set(path, [])
  }

  for (const source of notePaths) {
    const resolvedTargets = uniq(
      (index[source]?.links ?? [])
        .map((target) => resolveLink(target, notePaths))
        .filter((target): target is string => Boolean(target) && target !== source)
    )
    outgoingByPath.set(source, resolvedTargets)
    for (const target of resolvedTargets) {
      incomingByPath.set(target, [...(incomingByPath.get(target) ?? []), source])
    }
  }

  return notePaths.map((path) => {
    const meta = index[path]
    const content = noteContents.get(path) ?? ''
    const outgoing = outgoingByPath.get(path) ?? []
    const incoming = uniq(incomingByPath.get(path) ?? [])
    const wordCount = content.split(/\s+/).filter(Boolean).length
    return {
      path,
      title: noteDisplayTitle(path, meta),
      folder: folderName(path),
      excerpt: excerptFor(content),
      tags: meta?.tags ?? [],
      outgoing,
      incoming,
      score: noteRank(path, meta?.tags ?? [], incoming.length + outgoing.length, wordCount)
    }
  })
}

function laneIcon(kind: 'hub' | 'recent' | 'inbox' | 'orphan'): ReactNode {
  if (kind === 'hub') return <Network size={15} />
  if (kind === 'recent') return <Clock3 size={15} />
  if (kind === 'inbox') return <Inbox size={15} />
  return <CircleDot size={15} />
}

function BoardCard({ note }: { note: BoardNote }): React.JSX.Element {
  const openFile = useStore((s) => s.openFile)
  const related = uniq([...note.incoming, ...note.outgoing]).slice(0, 3)

  return (
    <button className="canvas-board-card" onClick={() => openFile(note.path)} title={note.path}>
      <span className="canvas-board-card-topline">
        <span className="canvas-board-folder">{note.folder}</span>
        <span className="canvas-board-counts">
          {note.incoming.length}
          <ArrowRight size={10} />
          {note.outgoing.length}
        </span>
      </span>
      <span className="canvas-board-card-title">
        <FileText size={14} />
        <span>{note.title}</span>
      </span>
      <span className="canvas-board-excerpt">{note.excerpt}</span>
      {note.tags.length > 0 ? (
        <span className="canvas-board-tags">
          {note.tags.slice(0, 3).map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </span>
      ) : null}
      {related.length > 0 ? (
        <span className="canvas-board-links" aria-label="Connected notes">
          {related.map((path) => (
            <span key={path} />
          ))}
        </span>
      ) : null}
    </button>
  )
}

function BoardLaneView({ lane }: { lane: BoardLane }): React.JSX.Element {
  return (
    <section className="canvas-board-lane">
      <div className="canvas-board-lane-header">
        <div className="canvas-board-lane-title">
          {lane.icon}
          <div>
            <h2>{lane.title}</h2>
            <p>{lane.detail}</p>
          </div>
        </div>
        <span className="canvas-board-lane-count">{lane.notes.length}</span>
      </div>
      <div className="canvas-board-card-list">
        {lane.notes.length > 0 ? (
          lane.notes.map((note) => <BoardCard key={note.path} note={note} />)
        ) : (
          <div className="canvas-board-empty">Nothing needs attention here.</div>
        )}
      </div>
    </section>
  )
}

export default function CanvasBoard(): React.JSX.Element {
  const files = useStore((s) => s.files)
  const index = useStore((s) => s.index)
  const contentVersion = useStore((s) => s.contentVersion)

  const { lanes, totalConnections } = useMemo(() => {
    void contentVersion
    const notes = buildBoard(files, index)
    const byScore = [...notes].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    const byPath = [...notes].sort((a, b) => a.path.localeCompare(b.path))
    const linkedPaths = new Set<string>()
    let connections = 0
    for (const note of notes) {
      if (note.incoming.length > 0 || note.outgoing.length > 0) linkedPaths.add(note.path)
      connections += note.outgoing.length
    }

    const inboxNotes = notes
      .filter((note) => /(^|\/)(inbox|capture|voice|drafts?)(\/|$)/i.test(note.path) || note.tags.some((tag) => /todo|task|draft/i.test(tag)))
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))

    const lanes: BoardLane[] = [
      {
        id: 'hubs',
        title: 'Hubs',
        detail: 'Notes with the most active connections.',
        icon: laneIcon('hub'),
        notes: byScore.filter((note) => note.incoming.length + note.outgoing.length > 0).slice(0, 6)
      },
      {
        id: 'active',
        title: 'Active',
        detail: 'High-signal notes, plans, specs, and briefs.',
        icon: laneIcon('recent'),
        notes: byScore.slice(0, 8)
      },
      {
        id: 'inbox',
        title: 'Inbox',
        detail: 'Captures and drafts ready to sort.',
        icon: laneIcon('inbox'),
        notes: inboxNotes.slice(0, 8)
      },
      {
        id: 'orphans',
        title: 'Orphans',
        detail: 'Markdown notes without resolved links.',
        icon: laneIcon('orphan'),
        notes: byPath.filter((note) => !linkedPaths.has(note.path)).slice(0, 8)
      }
    ]

    return { lanes, totalConnections: connections }
  }, [contentVersion, files, index])

  const totalNotes = files.filter(isMarkdown).length

  return (
    <div className="canvas-board">
      <div className="canvas-board-hero">
        <div className="canvas-board-hero-title">
          <Shapes size={18} />
          <div>
            <h1>Board</h1>
            <p>Clustered from local notes, links, folders, and tags.</p>
          </div>
        </div>
        <div className="canvas-board-stats" aria-label="Board summary">
          <span>
            <strong>{totalNotes.toLocaleString()}</strong>
            Notes
          </span>
          <span>
            <strong>{totalConnections.toLocaleString()}</strong>
            Links
          </span>
        </div>
      </div>
      <div className="canvas-board-scroll">
        <div className="canvas-board-lanes">
          {lanes.map((lane) => (
            <BoardLaneView key={lane.id} lane={lane} />
          ))}
        </div>
      </div>
    </div>
  )
}
