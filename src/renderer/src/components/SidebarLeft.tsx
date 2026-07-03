import {
  Bookmark,
  BookmarkCheck,
  FilePlus2,
  FileText,
  FolderPlus,
  Files,
  LayoutDashboard,
  Search,
  Settings,
  Vault,
  Waypoints,
  X
} from 'lucide-react'
import { useMemo } from 'react'
import FileTree from './FileTree'
import SearchPane from './SearchPane'
import { isMarkdown, noteDisplayTitle } from '../lib/parse'
import { activeTab, useStore } from '../store'

function SidebarBookmarks(): React.JSX.Element | null {
  const bookmarks = useStore((s) => s.bookmarks)
  const files = useStore((s) => s.files)
  const index = useStore((s) => s.index)
  const openFile = useStore((s) => s.openFile)
  const removeBookmark = useStore((s) => s.removeBookmark)
  const activePath = useStore((s) => activeTab(s)?.path ?? null)

  const visibleBookmarks = useMemo(() => {
    const existing = new Set(files)
    return bookmarks.filter((path) => existing.has(path) && isMarkdown(path))
  }, [bookmarks, files])

  if (visibleBookmarks.length === 0) return null

  return (
    <section className="sidebar-bookmarks" aria-label="Bookmarked notes">
      <div className="sidebar-bookmarks-header">
        <Bookmark size={12} strokeWidth={2.1} aria-hidden="true" />
        <span>Bookmarks</span>
      </div>
      <div className="sidebar-bookmarks-list">
        {visibleBookmarks.map((path) => (
          <div key={path} className={`sidebar-bookmark-row${activePath === path ? ' active' : ''}`}>
            <button
              className="sidebar-bookmark-item"
              title={path}
              onClick={(e) => openFile(path, { newTab: e.metaKey })}
            >
              <FileText size={13} className="sidebar-bookmark-file-icon" aria-hidden="true" />
              <span>{noteDisplayTitle(path, index[path])}</span>
            </button>
            <button
              className="sidebar-bookmark-remove"
              title="Remove bookmark"
              aria-label={`Remove bookmark for ${noteDisplayTitle(path, index[path])}`}
              onClick={() => removeBookmark(path)}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function SidebarLeft(): React.JSX.Element {
  const vaultName = useStore((s) => s.vaultName)
  const leftPane = useStore((s) => s.leftPane)
  const setLeftPane = useStore((s) => s.setLeftPane)
  const createNote = useStore((s) => s.createNote)
  const createFolder = useStore((s) => s.createFolder)
  const openGraph = useStore((s) => s.openGraph)
  const openBoard = useStore((s) => s.openBoard)
  const setModal = useStore((s) => s.setModal)
  const active = useStore(activeTab)
  const bookmarks = useStore((s) => s.bookmarks)
  const toggleBookmark = useStore((s) => s.toggleBookmark)
  const activePath = active?.kind === 'note' ? active.path : null
  const activeBookmarked = activePath ? bookmarks.includes(activePath) : false

  return (
    <div className="sidebar-inner">
      <div className="sidebar-titlebar" />
      <div className="sidebar-toolbar">
        <div className="segmented">
          <button
            className={`segmented-btn${leftPane === 'files' ? ' active' : ''}`}
            title="Files"
            onClick={() => setLeftPane('files')}
          >
            <Files size={15} />
          </button>
          <button
            className={`segmented-btn${leftPane === 'search' ? ' active' : ''}`}
            title="Search (⌘⇧F)"
            onClick={() => setLeftPane('search')}
          >
            <Search size={15} />
          </button>
        </div>
        <div className="sidebar-toolbar-actions">
          {activePath && (
            <button
              className={`icon-btn sidebar-bookmark-toggle${activeBookmarked ? ' active' : ''}`}
              title={activeBookmarked ? 'Remove bookmark' : 'Bookmark current note'}
              aria-pressed={activeBookmarked}
              onClick={() => toggleBookmark(activePath)}
            >
              {activeBookmarked ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
            </button>
          )}
          <button className="icon-btn" title="New note (⌘N)" onClick={() => createNote()}>
            <FilePlus2 size={15} />
          </button>
          <button className="icon-btn" title="New folder" onClick={() => createFolder('', 'Untitled folder')}>
            <FolderPlus size={15} />
          </button>
        </div>
      </div>

      <div className="sidebar-content">
        {leftPane === 'files' ? (
          <>
            <SidebarBookmarks />
            <FileTree />
          </>
        ) : (
          <SearchPane />
        )}
      </div>

      <div className="sidebar-footer">
        <span className="sidebar-vault-name" title={vaultName}>
          <Vault size={14} strokeWidth={2.1} aria-hidden="true" />
          <span className="sidebar-vault-name-text">{vaultName}</span>
        </span>
        <div className="sidebar-footer-actions">
          <button className="icon-btn" title="Graph view (⌘⇧G)" onClick={() => openGraph()}>
            <Waypoints size={15} />
          </button>
          <button className="icon-btn" title="Board (⌘⇧B)" onClick={() => openBoard()}>
            <LayoutDashboard size={15} />
          </button>
          <button className="icon-btn" title="Settings (⌘,)" onClick={() => setModal('settings')}>
            <Settings size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
