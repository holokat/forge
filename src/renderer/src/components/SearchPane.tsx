import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { baseName, isMarkdown, noteDisplayTitle, type NoteMeta } from '../lib/parse'
import { noteContents, useStore } from '../store'

interface SearchHit {
  path: string
  line: number
  text: string
  start: number
  end: number
}

function findMatches(query: string, files: string[]): SearchHit[] {
  const q = query.toLowerCase()
  const hits: SearchHit[] = []
  for (const path of files) {
    if (!isMarkdown(path)) continue
    const content = noteContents.get(path)
    if (!content) continue
    const lines = content.split('\n')
    for (let i = 0; i < lines.length && hits.length < 400; i++) {
      const idx = lines[i].toLowerCase().indexOf(q)
      if (idx >= 0) {
        hits.push({ path, line: i, text: lines[i], start: idx, end: idx + query.length })
      }
    }
  }
  return hits
}

function propertyText(meta: NoteMeta | undefined): string {
  if (!meta) return ''
  return Object.entries(meta.properties)
    .flatMap(([key, value]) => [key, Array.isArray(value) ? value.join(' ') : String(value)])
    .join(' ')
}

function findSmartMatches(query: string, files: string[], index: Record<string, NoteMeta>): SearchHit[] {
  const trimmed = query.trim()
  const tagFilter = /^#?tag:(.+)$/i.exec(trimmed) ?? /^#([A-Za-z][\w/-]*)$/.exec(trimmed)
  if (tagFilter) {
    const tag = tagFilter[1].replace(/^#/, '').toLowerCase()
    return files
      .filter(isMarkdown)
      .filter((path) => (index[path]?.tags ?? []).some((candidate) => candidate.toLowerCase() === tag))
      .map((path) => ({ path, line: 0, text: `#${tag}`, start: 0, end: tag.length + 1 }))
  }

  const lower = trimmed.toLowerCase()
  const hits: SearchHit[] = []
  for (const path of files) {
    if (!isMarkdown(path)) continue
    const meta = index[path]
    const title = noteDisplayTitle(path, meta)
    const aliases = meta?.aliases ?? []
    const tags = meta?.tags ?? []
    const properties = propertyText(meta)
    const titleHaystack = [title, baseName(path), ...aliases, ...tags.map((tag) => `#${tag}`), properties].join(' ')
    if (titleHaystack.toLowerCase().includes(lower)) {
      hits.push({ path, line: 0, text: titleHaystack, start: Math.max(0, titleHaystack.toLowerCase().indexOf(lower)), end: Math.max(0, titleHaystack.toLowerCase().indexOf(lower)) + trimmed.length })
      continue
    }
    hits.push(...findMatches(trimmed, [path]).slice(0, 3))
    if (hits.length >= 400) break
  }
  return hits.slice(0, 400)
}

export default function SearchPane(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const files = useStore((s) => s.files)
  const index = useStore((s) => s.index)
  const contentVersion = useStore((s) => s.contentVersion)
  const openFile = useStore((s) => s.openFile)

  const hits = useMemo(
    () => (query.trim().length >= 2 ? findSmartMatches(query.trim(), files, index) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, files, index, contentVersion]
  )

  const grouped = useMemo(() => {
    const map = new Map<string, SearchHit[]>()
    for (const hit of hits) {
      const list = map.get(hit.path) ?? []
      list.push(hit)
      map.set(hit.path, list)
    }
    return Array.from(map.entries())
  }, [hits])

  return (
    <div className="search-pane">
      <div className="search-input-wrap">
        <Search size={14} className="search-input-icon" />
        <input
          className="search-input"
          placeholder="Search notes…"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="search-clear" onClick={() => setQuery('')}>
            <X size={13} />
          </button>
        )}
      </div>

      {query.trim().length >= 2 && (
        <div className="search-meta">
          {hits.length === 0 ? 'No results' : `${hits.length} result${hits.length === 1 ? '' : 's'} in ${grouped.length} note${grouped.length === 1 ? '' : 's'}`}
        </div>
      )}

      <div className="search-results">
        {grouped.map(([path, pathHits]) => (
          <div key={path} className="search-group">
            <button className="search-group-title" onClick={() => openFile(path)}>
              {baseName(path)}
            </button>
            {pathHits.slice(0, 6).map((hit, i) => {
              const before = hit.text.slice(Math.max(0, hit.start - 32), hit.start)
              const match = hit.text.slice(hit.start, hit.end)
              const after = hit.text.slice(hit.end, hit.end + 80)
              return (
                <button key={i} className="search-hit" onClick={() => openFile(path)}>
                  <span className="search-hit-text">
                    {before}
                    <mark>{match}</mark>
                    {after}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
