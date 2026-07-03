import { FilePlus2, FolderPlus, Files, Search, Settings, Vault, Waypoints } from 'lucide-react'
import FileTree from './FileTree'
import SearchPane from './SearchPane'
import { useStore } from '../store'

export default function SidebarLeft(): React.JSX.Element {
  const vaultName = useStore((s) => s.vaultName)
  const leftPane = useStore((s) => s.leftPane)
  const setLeftPane = useStore((s) => s.setLeftPane)
  const createNote = useStore((s) => s.createNote)
  const createFolder = useStore((s) => s.createFolder)
  const openGraph = useStore((s) => s.openGraph)
  const setModal = useStore((s) => s.setModal)

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
          <button className="icon-btn" title="New note (⌘N)" onClick={() => createNote()}>
            <FilePlus2 size={15} />
          </button>
          <button className="icon-btn" title="New folder" onClick={() => createFolder('', 'Untitled folder')}>
            <FolderPlus size={15} />
          </button>
        </div>
      </div>

      <div className="sidebar-content">{leftPane === 'files' ? <FileTree /> : <SearchPane />}</div>

      <div className="sidebar-footer">
        <span className="sidebar-vault-name" title={vaultName}>
          <Vault size={14} strokeWidth={2.1} aria-hidden="true" />
          <span className="sidebar-vault-name-text">{vaultName}</span>
        </span>
        <div className="sidebar-footer-actions">
          <button className="icon-btn" title="Graph view (⌘⇧G)" onClick={() => openGraph()}>
            <Waypoints size={15} />
          </button>
          <button className="icon-btn" title="Settings (⌘,)" onClick={() => setModal('settings')}>
            <Settings size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
