import {
  AlertTriangle,
  Archive,
  Clock3,
  CircleDot,
  FilePlus2,
  Files,
  Inbox,
  Link2Off,
  ListChecks,
  Search,
  ShieldCheck,
  Tags
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { VaultFileStat } from '../../../shared/types'
import { isMarkdown, noteDisplayTitle, parseNote, resolveLink, wordCount, type NoteMeta } from '../lib/parse'
import { markdownTasks } from '../lib/tasks'
import { noteContents, useStore } from '../store'

const STALE_NOTE_DAYS = 90

type HealthIssueKind = 'broken' | 'stale' | 'orphan' | 'untagged' | 'empty' | 'duplicate'

interface HealthIssue {
  kind: HealthIssueKind
  path: string
  title: string
  detail: string
  lineNumber: number
  target?: string
}

interface HealthNote {
  path: string
  title: string
  meta: NoteMeta
  content: string
  stat?: VaultFileStat
}

type HealthFilter = 'all' | HealthIssueKind

const ISSUE_ORDER: HealthIssueKind[] = ['broken', 'stale', 'duplicate', 'orphan', 'untagged', 'empty']

function folderName(path: string): string {
  const parts = path.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : 'Vault root'
}

function lineForLink(content: string, target: string): number {
  const lines = content.split(/\r?\n/)
  const normalized = target.toLowerCase()
  const index = lines.findIndex((line) => line.includes('[[') && line.toLowerCase().includes(normalized))
  return Math.max(0, index)
}

function cleanedBodyWords(meta: NoteMeta): number {
  const body = meta.body
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, '$2 $1')
    .replace(/```[\s\S]*?```/g, '')
  return wordCount(body).words
}

function daysSince(iso: string | undefined, now = Date.now()): number | null {
  if (!iso) return null
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return null
  return Math.max(0, Math.floor((now - time) / 86_400_000))
}

function isInboxPath(path: string): boolean {
  return /^inbox\//i.test(path) || /\/inbox\//i.test(path)
}

function missingNotePath(target: string | undefined): string | null {
  const clean = String(target ?? '')
    .replaceAll('\\', '/')
    .split('#')[0]
    .split('|')[0]
    .trim()
    .replace(/\.md$/i, '')
  if (!clean || clean.startsWith('/')) return null
  const parts = clean.split('/').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) return null
  return parts.join('/')
}

function issueMatches(issue: HealthIssue, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return `${issue.title} ${issue.path} ${issue.detail}`.toLowerCase().includes(normalized)
}

function issueMatchesFilter(issue: HealthIssue, filter: HealthFilter): boolean {
  return filter === 'all' || issue.kind === filter
}

function HealthStat({ value, label }: { value: number; label: string }): React.JSX.Element {
  return (
    <span>
      <strong>{value.toLocaleString()}</strong>
      {label}
    </span>
  )
}

function HealthRow({ issue }: { issue: HealthIssue }): React.JSX.Element {
  const icon =
    issue.kind === 'broken' ? (
      <Link2Off size={15} />
    ) : issue.kind === 'stale' ? (
      <Clock3 size={15} />
    ) : issue.kind === 'orphan' ? (
      <CircleDot size={15} />
    ) : issue.kind === 'untagged' ? (
      <Tags size={15} />
    ) : issue.kind === 'empty' ? (
      <Archive size={15} />
    ) : (
      <Files size={15} />
    )

  const missingPath = issue.kind === 'broken' ? missingNotePath(issue.target) : null
  const createMissing = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    if (!missingPath) return
    useStore.getState().createNoteNamed(missingPath).catch(console.error)
  }

  return (
    <div className={`vault-health-row is-${issue.kind}`}>
      <button
        className="vault-health-row-open"
        onClick={() => useStore.getState().openFile(issue.path, { line: issue.lineNumber })}
      >
        <span className="vault-health-row-icon">{icon}</span>
        <span className="vault-health-row-main">
          <strong>{issue.title}</strong>
          <span>{issue.detail}</span>
        </span>
        <span className="vault-health-folder">{folderName(issue.path)}</span>
      </button>
      <span className="vault-health-row-action-slot">
        {missingPath && (
          <button className="vault-health-row-action" title={`Create ${missingPath}.md`} onClick={createMissing}>
            <FilePlus2 size={14} />
          </button>
        )}
      </span>
    </div>
  )
}

function HealthSection({
  title,
  count,
  children
}: {
  title: string
  count: number
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="vault-health-section">
      <div className="vault-health-section-head">
        <h2>{title}</h2>
        <span>{count.toLocaleString()}</span>
      </div>
      {children}
    </section>
  )
}

export default function VaultHealthView(): React.JSX.Element {
  const files = useStore((s) => s.files)
  const fileStats = useStore((s) => s.fileStats)
  const index = useStore((s) => s.index)
  const contentVersion = useStore((s) => s.contentVersion)
  const [filter, setFilter] = useState<HealthFilter>('all')
  const [query, setQuery] = useState('')

  const health = useMemo(() => {
    void contentVersion
    const notePaths = files.filter(isMarkdown)
    const notes: HealthNote[] = notePaths.map((path) => {
      const content = noteContents.get(path) ?? ''
      const meta = index[path] ?? parseNote(content)
      return {
        path,
        title: noteDisplayTitle(path, meta),
        meta,
        content,
        stat: fileStats[path]
      }
    })
    const incoming = new Map<string, number>()
    const outgoing = new Map<string, Set<string>>()
    const broken: HealthIssue[] = []
    const titles = new Map<string, HealthNote[]>()
    let openTasks = 0
    let completedTasks = 0
    let inboxNotes = 0

    for (const note of notes) {
      outgoing.set(note.path, new Set())
      const titleKey = note.title.trim().toLowerCase()
      if (titleKey) titles.set(titleKey, [...(titles.get(titleKey) ?? []), note])
      if (isInboxPath(note.path)) inboxNotes += 1

      for (const task of markdownTasks(note.content)) {
        if (task.done) completedTasks += 1
        else openTasks += 1
      }

      for (const link of note.meta.links) {
        const resolved = resolveLink(link, notePaths)
        if (!resolved) {
          broken.push({
            kind: 'broken',
            path: note.path,
            title: note.title,
            detail: `Missing [[${link}]]`,
            lineNumber: lineForLink(note.content, link),
            target: link
          })
          continue
        }
        outgoing.get(note.path)?.add(resolved)
        incoming.set(resolved, (incoming.get(resolved) ?? 0) + 1)
      }
    }

    const stale: HealthIssue[] = notes
      .map((note) => ({ note, days: daysSince(note.stat?.modified) }))
      .filter((item): item is { note: HealthNote; days: number } => item.days !== null && item.days >= STALE_NOTE_DAYS)
      .map(({ note, days }) => ({
        kind: 'stale' as const,
        path: note.path,
        title: note.title,
        detail: `Last modified ${days.toLocaleString()} days ago`,
        lineNumber: 0
      }))

    const orphaned: HealthIssue[] = notes
      .filter((note) => (incoming.get(note.path) ?? 0) === 0 && (outgoing.get(note.path)?.size ?? 0) === 0)
      .map((note) => ({
        kind: 'orphan' as const,
        path: note.path,
        title: note.title,
        detail: 'No incoming or outgoing links',
        lineNumber: 0
      }))

    const untagged: HealthIssue[] = notes
      .filter((note) => note.meta.tags.length === 0)
      .map((note) => ({
        kind: 'untagged' as const,
        path: note.path,
        title: note.title,
        detail: 'No tags found',
        lineNumber: 0
      }))

    const empty: HealthIssue[] = notes
      .filter((note) => cleanedBodyWords(note.meta) <= 5)
      .map((note) => ({
        kind: 'empty' as const,
        path: note.path,
        title: note.title,
        detail: 'Very little body content',
        lineNumber: 0
      }))

    const duplicates: HealthIssue[] = [...titles.values()]
      .filter((group) => group.length > 1)
      .flatMap((group) =>
        group.map((note) => ({
          kind: 'duplicate' as const,
          path: note.path,
          title: note.title,
          detail: `${group.length.toLocaleString()} notes share this title`,
          lineNumber: 0
        }))
      )

    const issues = [...broken, ...stale, ...orphaned, ...untagged, ...empty, ...duplicates].sort(
      (a, b) => ISSUE_ORDER.indexOf(a.kind) - ISSUE_ORDER.indexOf(b.kind) || a.path.localeCompare(b.path)
    )

    return {
      noteCount: notes.length,
      openTasks,
      completedTasks,
      inboxNotes,
      broken,
      stale,
      orphaned,
      untagged,
      empty,
      duplicates,
      issues
    }
  }, [contentVersion, fileStats, files, index])

  const visible = health.issues.filter((issue) => issueMatchesFilter(issue, filter) && issueMatches(issue, query))

  return (
    <div className="vault-health-view">
      <div className="vault-health-hero">
        <div className="vault-health-hero-title">
          <ShieldCheck size={18} />
          <div>
            <h1>Vault Health</h1>
            <p>Local checks for notes, links, tasks, and organization.</p>
          </div>
        </div>
        <div className="vault-health-stats" aria-label="Vault health summary">
          <HealthStat value={health.noteCount} label="Notes" />
          <HealthStat value={health.broken.length} label="Broken links" />
          <HealthStat value={health.stale.length} label="Stale" />
          <HealthStat value={health.orphaned.length} label="Orphans" />
          <HealthStat value={health.openTasks} label="Open tasks" />
        </div>
      </div>

      <div className="vault-health-toolbar">
        <label className="vault-health-search">
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search health checks" />
        </label>
        <div className="vault-health-filter" aria-label="Vault health filter">
          {(['all', 'broken', 'stale', 'duplicate', 'orphan', 'untagged', 'empty'] as const).map((item) => (
            <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
              {item === 'orphan' ? 'orphans' : item}
            </button>
          ))}
        </div>
      </div>

      <div className="vault-health-scroll">
        <div className="vault-health-grid">
          <HealthSection title="Repair Queue" count={health.broken.length + health.stale.length}>
            {[...health.broken, ...health.stale].slice(0, 8).map((issue) => (
              <HealthRow key={`repair:${issue.kind}:${issue.path}:${issue.detail}`} issue={issue} />
            ))}
            {health.broken.length + health.stale.length === 0 && (
              <div className="vault-health-section-empty">No broken links or stale notes</div>
            )}
          </HealthSection>
          <HealthSection title="Structure" count={health.orphaned.length + health.duplicates.length}>
            {[...health.duplicates, ...health.orphaned].slice(0, 8).map((issue) => (
              <HealthRow key={`${issue.kind}:${issue.path}:${issue.detail}`} issue={issue} />
            ))}
            {health.duplicates.length + health.orphaned.length === 0 && (
              <div className="vault-health-section-empty">No duplicate titles or isolated notes</div>
            )}
          </HealthSection>
          <HealthSection title="Cleanup" count={health.untagged.length + health.empty.length}>
            {[...health.empty, ...health.untagged].slice(0, 8).map((issue) => (
              <HealthRow key={`${issue.kind}:${issue.path}:${issue.detail}`} issue={issue} />
            ))}
            {health.untagged.length + health.empty.length === 0 && (
              <div className="vault-health-section-empty">No empty or untagged notes</div>
            )}
          </HealthSection>
          <HealthSection title="Tasks" count={health.openTasks + health.completedTasks}>
            <div className="vault-health-task-card">
              <ListChecks size={17} />
              <strong>{health.openTasks.toLocaleString()} open</strong>
              <span>{health.completedTasks.toLocaleString()} completed</span>
            </div>
            <div className="vault-health-task-card">
              <Inbox size={17} />
              <strong>{health.inboxNotes.toLocaleString()} inbox</strong>
              <span>Capture notes waiting for triage</span>
            </div>
          </HealthSection>
        </div>

        <section className="vault-health-results">
          <div className="vault-health-section-head">
            <h2>Matching Checks</h2>
            <span>{visible.length.toLocaleString()}</span>
          </div>
          {visible.length > 0 ? (
            <div className="vault-health-list">
              {visible.map((issue) => (
                <HealthRow key={`visible:${issue.kind}:${issue.path}:${issue.detail}`} issue={issue} />
              ))}
            </div>
          ) : (
            <div className="vault-health-empty">
              <AlertTriangle size={18} />
              <strong>No matching checks</strong>
              <span>{health.issues.length === 0 ? 'This vault has no health issues.' : 'No results for this filter.'}</span>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
