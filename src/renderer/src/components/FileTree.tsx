import { ChevronRight, FileAudio, FileText, Image } from 'lucide-react'
import { useMemo, useState } from 'react'
import { baseName, isAudio, isMarkdown } from '../lib/parse'
import { buildTree, type TreeNode } from '../lib/tree'
import { activeTab, useStore } from '../store'

const DND_TYPE = 'application/x-forge-path'

const parentOf = (path: string): string => path.split('/').slice(0, -1).join('/')

function countFolderContents(node: TreeNode): { files: number; folders: number } {
  let files = 0
  let folders = 0
  for (const child of node.children) {
    if (child.isFolder) {
      folders += 1
      const nested = countFolderContents(child)
      files += nested.files
      folders += nested.folders
    } else {
      files += 1
    }
  }
  return { files, folders }
}

function confirmFolderTrash(node: TreeNode): boolean {
  const { files, folders } = countFolderContents(node)
  const parts = [
    files === 1 ? '1 file' : `${files} files`,
    folders === 1 ? '1 subfolder' : folders > 1 ? `${folders} subfolders` : ''
  ].filter(Boolean)
  const contents = parts.length > 0 ? `\n\nThis folder contains ${parts.join(' and ')}.` : ''
  return window.confirm(`Move "${node.name}" to Trash?${contents}\n\nYou can restore it from the Trash.`)
}

interface DndState {
  dragged: string | null
  dropTarget: string | null
  start: (path: string, e: React.DragEvent) => void
  clear: () => void
  over: (target: string, e: React.DragEvent) => void
  drop: (target: string, e: React.DragEvent) => void
}

function RenameInput({ path, isFolder }: { path: string; isFolder: boolean }): React.JSX.Element {
  const renamePath = useStore((s) => s.renamePath)
  const name = path.split('/').pop()!
  const [value, setValue] = useState(isFolder ? name : name.replace(/\.md$/i, ''))

  const commit = (): void => {
    const clean = value.replace(/[\\/:*?"<>|]/g, '').trim()
    useStore.setState({ contextMenu: null })
    setRenaming(null)
    if (!clean) return
    const parent = parentOf(path)
    const ext = isFolder || !isMarkdown(path) ? '' : '.md'
    const keepExt = !isFolder && !isMarkdown(path) ? '.' + path.split('.').pop() : ext
    const newPath = (parent ? parent + '/' : '') + clean + (isFolder ? '' : keepExt)
    if (newPath !== path) renamePath(path, newPath).catch(console.error)
  }

  return (
    <input
      className="tree-rename-input"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setRenaming(null)
      }}
      onClick={(e) => e.stopPropagation()}
    />
  )
}

// Module-level rename state so context-menu actions can trigger it
let setRenamingGlobal: (path: string | null) => void = () => {}
const setRenaming = (path: string | null): void => setRenamingGlobal(path)

function TreeItem({
  node,
  depth,
  expanded,
  toggle,
  renaming,
  dnd
}: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  toggle: (path: string) => void
  renaming: string | null
  dnd: DndState
}): React.JSX.Element | null {
  const openFile = useStore((s) => s.openFile)
  const setContextMenu = useStore((s) => s.setContextMenu)
  const active = useStore((s) => activeTab(s)?.path)
  const isOpen = expanded.has(node.path)

  const onContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    const store = useStore.getState()
    const items = node.isFolder
      ? [
          { label: 'New note', action: () => store.createNote(node.path) },
          { label: 'New folder', action: () => store.createFolder(node.path, 'Untitled folder') },
          { label: 'Rename…', action: () => setRenaming(node.path) },
          { label: 'Reveal in Finder', action: () => window.forge.reveal(store.vault!, node.path) },
          {
            label: 'Delete',
            danger: true,
            action: () => {
              if (confirmFolderTrash(node)) store.trashPath(node.path).catch(console.error)
            }
          }
        ]
      : [
          { label: 'Open in new tab', action: () => store.openFile(node.path, { newTab: true }) },
          { label: 'Rename…', action: () => setRenaming(node.path) },
          { label: 'Reveal in Finder', action: () => window.forge.reveal(store.vault!, node.path) },
          { label: 'Delete', danger: true, action: () => store.trashPath(node.path) }
        ]
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  const dragProps = {
    draggable: renaming !== node.path,
    onDragStart: (e: React.DragEvent) => dnd.start(node.path, e),
    onDragEnd: () => dnd.clear(),
    // dropping onto a file targets the folder that contains it
    onDragOver: (e: React.DragEvent) => dnd.over(node.isFolder ? node.path : parentOf(node.path), e),
    onDrop: (e: React.DragEvent) => dnd.drop(node.isFolder ? node.path : parentOf(node.path), e)
  }

  const dropClass = (target: string): string => (dnd.dropTarget === target ? ' drop-target' : '')
  const draggingClass = dnd.dragged === node.path ? ' dragging' : ''

  if (node.isFolder) {
    return (
      <div>
        <div
          className={`tree-item tree-folder${dropClass(node.path)}${draggingClass}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => toggle(node.path)}
          onContextMenu={onContextMenu}
          {...dragProps}
        >
          <ChevronRight size={13} className={`tree-chevron${isOpen ? ' open' : ''}`} />
          {renaming === node.path ? (
            <RenameInput path={node.path} isFolder />
          ) : (
            <span className="tree-label">{node.name}</span>
          )}
        </div>
        {isOpen && (
          <div>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                toggle={toggle}
                renaming={renaming}
                dnd={dnd}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  const md = isMarkdown(node.path)
  return (
    <div
      className={`tree-item tree-file${active === node.path ? ' active' : ''}${dropClass(parentOf(node.path))}${draggingClass}`}
      style={{ paddingLeft: 22 + depth * 14 }}
      onClick={(e) => md && openFile(node.path, { newTab: e.metaKey })}
      onContextMenu={onContextMenu}
      {...dragProps}
    >
      {md ? (
        <FileText size={14} className="tree-file-icon" />
      ) : isAudio(node.path) ? (
        <FileAudio size={14} className="tree-file-icon" />
      ) : (
        <Image size={14} className="tree-file-icon" />
      )}
      {renaming === node.path ? (
        <RenameInput path={node.path} isFolder={false} />
      ) : (
        <span className="tree-label">{md ? baseName(node.path) : node.name}</span>
      )}
    </div>
  )
}

export default function FileTree(): React.JSX.Element {
  const files = useStore((s) => s.files)
  const folders = useStore((s) => s.folders)
  const movePath = useStore((s) => s.movePath)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(folders))
  const [renaming, setRenamingState] = useState<string | null>(null)
  const [dragged, setDragged] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  setRenamingGlobal = setRenamingState

  const tree = useMemo(() => buildTree(files, folders), [files, folders])

  const toggle = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const expand = (path: string): void => {
    if (path) setExpanded((prev) => new Set(prev).add(path))
  }

  const validTarget = (target: string): boolean =>
    dragged !== null &&
    target !== dragged &&
    !target.startsWith(dragged + '/') &&
    parentOf(dragged) !== target

  const dnd: DndState = {
    dragged,
    dropTarget,
    start: (path, e) => {
      e.dataTransfer.setData(DND_TYPE, path)
      e.dataTransfer.effectAllowed = 'move'
      setDragged(path)
    },
    clear: () => {
      setDragged(null)
      setDropTarget(null)
    },
    over: (target, e) => {
      if (!validTarget(target)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget(target)
    },
    drop: (target, e) => {
      e.preventDefault()
      e.stopPropagation()
      const source = e.dataTransfer.getData(DND_TYPE) || dragged
      setDragged(null)
      setDropTarget(null)
      if (!source || !validTarget(target)) return
      expand(target)
      movePath(source, target).catch(console.error)
    }
  }

  if (files.length === 0) {
    return (
      <div className="pane-empty">
        <p>No notes yet.</p>
        <button className="btn btn-primary" onClick={() => useStore.getState().createNote()}>
          Create your first note
        </button>
      </div>
    )
  }

  return (
    <div
      className={`file-tree${dropTarget === '' ? ' drop-root' : ''}`}
      onDragOver={(e) => dnd.over('', e)}
      onDrop={(e) => dnd.drop('', e)}
      onDragLeave={(e) => {
        if (e.target === e.currentTarget) setDropTarget(null)
      }}
    >
      {tree.map((node) => (
        <TreeItem key={node.path} node={node} depth={0} expanded={expanded} toggle={toggle} renaming={renaming} dnd={dnd} />
      ))}
    </div>
  )
}
