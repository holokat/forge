import {
  BookOpen,
  FilePlus2,
  FileText,
  LayoutTemplate,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  Search,
  Waypoints,
  X
} from 'lucide-react'
import { useState } from 'react'
import Editor from './Editor'
import { ForgeHexagonMark } from './ForgeLogo'
import GraphView from './GraphView'
import Reading from './Reading'
import { baseName, isMarkdown } from '../lib/parse'
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
  const setTabMode = useStore((s) => s.setTabMode)
  const active = useStore(activeTab)

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
      </div>
      <div className="tabbar-drag" />
      {active?.kind === 'note' && active.path && (
        <button
          className="icon-btn tabbar-btn"
          title={active.mode === 'edit' ? 'Reading view (⌘E)' : 'Edit (⌘E)'}
          onClick={() => setTabMode(active.id, active.mode === 'edit' ? 'read' : 'edit')}
        >
          {active.mode === 'edit' ? <BookOpen size={15} /> : <Pencil size={15} />}
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

function TabContent({ tab }: { tab: Tab }): React.JSX.Element {
  if (tab.kind === 'graph') return <GraphView />
  if (tab.kind === 'empty' || !tab.path) return <EmptyTab />
  if (!isMarkdown(tab.path)) {
    return (
      <div className="empty-tab">
        <div className="empty-tab-title">{tab.path.split('/').pop()}</div>
        <p className="empty-tab-subtitle">This file type can't be edited in Forge.</p>
      </div>
    )
  }
  return (
    <div className="note-pane">
      <div className="inline-title-wrap">
        <InlineTitle key={tab.path} path={tab.path} />
      </div>
      {tab.mode === 'edit' ? <Editor key={tab.path} path={tab.path} /> : <Reading path={tab.path} />}
    </div>
  )
}

export default function EditorArea(): React.JSX.Element {
  const active = useStore(activeTab)

  return (
    <div className="editor-area">
      <TabBar />
      <div className="editor-body">{active ? <TabContent key={active.id} tab={active} /> : <EmptyTab />}</div>
      <StatusBar />
    </div>
  )
}
