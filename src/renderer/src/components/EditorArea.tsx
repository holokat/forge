import {
  BookOpen,
  FilePlus2,
  FileText,
  Globe2,
  Images,
  LayoutTemplate,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Waypoints,
  X
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { getActiveEditor } from '../editor/active'
import Editor from './Editor'
import { ForgeHexagonMark } from './ForgeLogo'
import GraphView from './GraphView'
import MediaVault from './MediaVault'
import { NoteAIContextIsland, NoteAIPromptButton, type NoteAIRequest } from './NoteAIControls'
import Reading from './Reading'
import { baseName, isMarkdown } from '../lib/parse'
import { outputIndexPath, publishSiteForPath } from '../lib/publishing'
import { activeTab, tabTitle, useStore, type Tab } from '../store'

function TabBar(): React.JSX.Element {
  const tabs = useStore((s) => s.tabs)
  const activeTabId = useStore((s) => s.activeTabId)
  const leftOpen = useStore((s) => s.leftOpen)
  const rightOpen = useStore((s) => s.rightOpen)
  const setLeftOpen = useStore((s) => s.setLeftOpen)
  const setRightOpen = useStore((s) => s.setRightOpen)
  const activateTab = useStore((s) => s.activateTab)
  const closeTab = useStore((s) => s.closeTab)
  const newTab = useStore((s) => s.newTab)
  const openMediaVault = useStore((s) => s.openMediaVault)
  const setTabMode = useStore((s) => s.setTabMode)
  const active = useStore(activeTab)
  const publishSites = useStore((s) => s.publishSites)
  const activePublishSite = active?.kind === 'note' && active.path ? publishSiteForPath(active.path, publishSites) : null

  return (
    <div className={`tabbar${leftOpen ? '' : ' with-traffic-lights'}`}>
      {!leftOpen && <div className="traffic-light-space" />}
      <button className="icon-btn tabbar-btn" title="Toggle sidebar (⌘\)" onClick={() => setLeftOpen(!leftOpen)}>
        <PanelLeft size={15} />
      </button>
      <div className="tabbar-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab${tab.id === activeTabId ? ' active' : ''}`}
            onMouseDown={(e) => {
              if (e.button === 1) closeTab(tab.id)
              else activateTab(tab.id)
            }}
            title={tab.path ?? undefined}
          >
            {tab.kind === 'graph' ? (
              <Waypoints size={13} className="tab-icon" />
            ) : tab.kind === 'media' ? (
              <Images size={13} className="tab-icon" />
            ) : (
              <FileText size={13} className="tab-icon" />
            )}
            <span className="tab-title">{tabTitle(tab)}</span>
            <button
              className="tab-close"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button className="icon-btn tabbar-btn" title="New tab (⌘T)" onClick={() => newTab()}>
          <Plus size={15} />
        </button>
        <button className="icon-btn tabbar-btn" title="Media vault" onClick={() => openMediaVault()}>
          <Images size={15} />
        </button>
      </div>
      <div className="tabbar-drag" />
      {active?.kind === 'note' && active.path && (
        <>
          <NoteAIPromptButton tab={active as Tab & { kind: 'note'; path: string }} />
          <button
            className="icon-btn tabbar-btn"
            title={active.mode === 'edit' ? 'Reading view (⌘E)' : 'Edit (⌘E)'}
            onClick={() => setTabMode(active.id, active.mode === 'edit' ? 'read' : 'edit')}
          >
            {active.mode === 'edit' ? <BookOpen size={15} /> : <Pencil size={15} />}
          </button>
        </>
      )}
      {activePublishSite && (
        <button
          className="icon-btn tabbar-btn"
          title={`Preview published site: ${activePublishSite.name}`}
          onClick={() =>
            window.forge.openPath(outputIndexPath(activePublishSite.outputDir)).catch((error) => {
              const message = error instanceof Error ? error.message : String(error)
              window.alert(`Could not open "${activePublishSite.name}". Generate the site first.\n\n${message}`)
            })
          }
        >
          <Globe2 size={15} />
        </button>
      )}
      <button className="icon-btn tabbar-btn" title="Toggle right panel" onClick={() => setRightOpen(!rightOpen)}>
        <PanelRight size={15} />
      </button>
    </div>
  )
}

function InlineTitle({ path }: { path: string }): React.JSX.Element {
  const renamePath = useStore((s) => s.renamePath)
  const [value, setValue] = useState(baseName(path))
  const [editing, setEditing] = useState(false)

  const commit = (): void => {
    setEditing(false)
    const clean = value.replace(/[\\/:*?"<>|]/g, '').trim()
    if (!clean || clean === baseName(path)) {
      setValue(baseName(path))
      return
    }
    const parent = path.split('/').slice(0, -1).join('/')
    renamePath(path, (parent ? parent + '/' : '') + clean + '.md').catch(console.error)
  }

  return (
    <input
      className="inline-title"
      value={editing ? value : baseName(path)}
      onFocus={() => {
        setValue(baseName(path))
        setEditing(true)
      }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
      }}
      spellCheck={false}
    />
  )
}

function EmptyTab(): React.JSX.Element {
  const createNote = useStore((s) => s.createNote)
  const setModal = useStore((s) => s.setModal)
  const openGraph = useStore((s) => s.openGraph)
  const openMediaVault = useStore((s) => s.openMediaVault)

  return (
    <div className="empty-tab">
      <div className="empty-tab-logo">
        <ForgeHexagonMark size={28} />
      </div>
      <div className="empty-tab-title">No file open</div>
      <div className="empty-tab-actions">
        <button className="empty-tab-action" onClick={() => createNote()}>
          <FilePlus2 size={15} />
          Create new note
          <kbd>⌘N</kbd>
        </button>
        <button className="empty-tab-action" onClick={() => setModal('template')}>
          <LayoutTemplate size={15} />
          New from template
        </button>
        <button className="empty-tab-action" onClick={() => setModal('switcher')}>
          <Search size={15} />
          Open a note
          <kbd>⌘O</kbd>
        </button>
        <button className="empty-tab-action" onClick={() => openGraph()}>
          <Waypoints size={15} />
          Open graph view
          <kbd>⌘⇧G</kbd>
        </button>
        <button className="empty-tab-action" onClick={() => openMediaVault()}>
          <Images size={15} />
          Open media vault
        </button>
      </div>
    </div>
  )
}

function StatusBar(): React.JSX.Element | null {
  const counts = useStore((s) => s.counts)
  const active = useStore(activeTab)
  if (active?.kind !== 'note' || !active.path) return null
  return (
    <div className="status-bar">
      {counts.words.toLocaleString()} words · {counts.chars.toLocaleString()} characters
    </div>
  )
}

function selectedTextForTab(tab: Tab): string {
  if (tab.kind === 'note' && tab.mode === 'edit') {
    const view = getActiveEditor()
    const selection = view?.state.selection.main
    if (view && selection && !selection.empty) return view.state.doc.sliceString(selection.from, selection.to).trim()
  }
  return window.getSelection()?.toString().trim() ?? ''
}

function TabContent({
  aiRequest,
  onCloseAI,
  onOpenAI,
  tab
}: {
  aiRequest: NoteAIRequest | null
  onCloseAI: () => void
  onOpenAI: (selectedText: string) => void
  tab: Tab
}): React.JSX.Element {
  const setContextMenu = useStore((s) => s.setContextMenu)

  if (tab.kind === 'graph') return <GraphView />
  if (tab.kind === 'media') return <MediaVault />
  if (tab.kind === 'empty' || !tab.path) return <EmptyTab />
  if (!isMarkdown(tab.path)) {
    return (
      <div className="empty-tab">
        <div className="empty-tab-title">{tab.path.split('/').pop()}</div>
        <p className="empty-tab-subtitle">This file type can't be edited in Forge.</p>
      </div>
    )
  }

  const noteTab = tab as Tab & { kind: 'note'; path: string }
  const onContextMenu = (event: React.MouseEvent): void => {
    const target = event.target as HTMLElement
    if (!target.closest('.cm-editor, .reading-view, .reading-scroll')) return
    event.preventDefault()
    event.stopPropagation()
    const selectedText = selectedTextForTab(tab)
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: selectedText ? 'Ask AI about selection' : 'Ask AI about note',
          icon: <Sparkles size={14} />,
          action: () => onOpenAI(selectedText)
        }
      ]
    })
  }

  return (
    <div className="note-pane" onContextMenu={onContextMenu}>
      <div className="inline-title-wrap">
        <InlineTitle key={tab.path} path={tab.path} />
      </div>
      {tab.mode === 'edit' ? <Editor key={tab.path} path={tab.path} /> : <Reading path={tab.path} />}
      <NoteAIContextIsland request={aiRequest} tab={noteTab} onClose={onCloseAI} />
    </div>
  )
}

export default function EditorArea(): React.JSX.Element {
  const active = useStore(activeTab)
  const [aiIsland, setAIIsland] = useState<{ tabId: string; request: NoteAIRequest } | null>(null)

  useEffect(() => {
    if (aiIsland && active?.id !== aiIsland.tabId) setAIIsland(null)
  }, [active?.id, aiIsland])

  return (
    <div className="editor-area">
      <TabBar />
      <div className="editor-body">
        {active ? (
          <TabContent
            key={active.id}
            aiRequest={aiIsland?.tabId === active.id ? aiIsland.request : null}
            onCloseAI={() => setAIIsland(null)}
            onOpenAI={(selectedText) =>
              setAIIsland({
                tabId: active.id,
                request: { id: Date.now(), selectedText }
              })
            }
            tab={active}
          />
        ) : (
          <EmptyTab />
        )}
      </div>
      <StatusBar />
    </div>
  )
}
