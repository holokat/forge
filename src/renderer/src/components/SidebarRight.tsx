import { useMemo } from 'react'
import { FileAudio } from 'lucide-react'
import { getActiveEditor } from '../editor/active'
import { scrollToLine } from '../editor/extensions'
import { WIKILINK_RE, baseName, isAudio, linkTarget, resolveLink } from '../lib/parse'
import { activeTab, backlinksFor, noteContents, useStore } from '../store'

function Backlinks({ path }: { path: string }): React.JSX.Element {
  const files = useStore((s) => s.files)
  const index = useStore((s) => s.index)
  const openFile = useStore((s) => s.openFile)
  const backlinks = useMemo(() => backlinksFor(path, files, index), [path, files, index])

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
          const target = baseName(path)
          const lineWithLink =
            content.split('\n').find((line) => line.toLowerCase().includes(`[[${target.toLowerCase()}`)) ?? ''
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
          <AudioAttachments path={path} />
          <Outline path={path} />
          <Backlinks path={path} />
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
