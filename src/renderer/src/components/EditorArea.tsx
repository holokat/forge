import {
  AlertCircle,
  BookOpen,
  Check,
  Clipboard,
  FilePlus2,
  FileText,
  Globe2,
  Images,
  KeyRound,
  LayoutTemplate,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Waypoints,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AIStatus, AITextProvider } from '../../../shared/types'
import { getActiveEditor } from '../editor/active'
import { aiModelForProvider, aiProviderLabel, configuredAIProviders } from '../lib/ai'
import Editor from './Editor'
import { ForgeHexagonMark } from './ForgeLogo'
import GraphView from './GraphView'
import MediaVault from './MediaVault'
import Reading from './Reading'
import { baseName, isMarkdown } from '../lib/parse'
import { outputIndexPath, publishSiteForPath } from '../lib/publishing'
import { activeTab, noteContents, tabTitle, useStore, type Tab } from '../store'

const DEFAULT_AI_PROMPT = 'Improve the formatting and clarity of this note without changing its meaning.'

async function copyText(value: string): Promise<void> {
  try {
    await window.forge.copyText(value)
    return
  } catch (error) {
    console.warn('Forge clipboard copy failed, trying browser clipboard.', error)
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
  }
}

function insertionBlock(doc: string, pos: number, body: string): string {
  const before = doc.slice(0, pos)
  const after = doc.slice(pos)
  const prefix = before.length === 0 || /\n\n$/.test(before) ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const suffix = after.length === 0 || /^\n\n/.test(after) ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  return `${prefix}${body.trim()}${suffix}`
}

function providerIcon(provider: AITextProvider): React.JSX.Element {
  return provider === 'codex' ? <Sparkles size={14} /> : <KeyRound size={14} />
}

function NoteAIPromptButton({ tab }: { tab: Tab & { kind: 'note'; path: string } }): React.JSX.Element | null {
  const vault = useStore((s) => s.vault)
  const modal = useStore((s) => s.modal)
  const aiSettings = useStore((s) => s.aiSettings)
  const setAISettings = useStore((s) => s.setAISettings)
  const [status, setStatus] = useState<AIStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<AITextProvider>(aiSettings.defaultProvider)
  const [prompt, setPrompt] = useState(DEFAULT_AI_PROMPT)
  const [taskState, setTaskState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle')
  const [message, setMessage] = useState('')
  const [result, setResult] = useState('')
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const cancelStatusRefresh = useRef<(() => void) | null>(null)
  const providers = configuredAIProviders(status)

  const refreshStatus = (): void => {
    let cancelled = false
    window.forge
      .getAIStatus()
      .then((next) => {
        if (!cancelled) setStatus(next)
      })
      .catch((error) => {
        if (!cancelled) console.error('AI status check failed.', error)
      })
    const cancel = (): void => {
      cancelled = true
    }
    cancelStatusRefresh.current = cancel
  }

  useEffect(() => {
    cancelStatusRefresh.current?.()
    refreshStatus()
    return () => cancelStatusRefresh.current?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal])

  useEffect(() => {
    const onFocus = (): void => {
      cancelStatusRefresh.current?.()
      refreshStatus()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!providers.length) return
    if (!providers.includes(provider)) setProvider(providers.includes(aiSettings.defaultProvider) ? aiSettings.defaultProvider : providers[0])
  }, [aiSettings.defaultProvider, provider, providers])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', escape)
    }
  }, [open])

  if (!providers.length) return null

  const runPrompt = async (): Promise<void> => {
    if (!prompt.trim()) return
    setTaskState('running')
    setMessage(`Running ${aiProviderLabel(provider)}...`)
    setResult('')
    setCopied(false)
    try {
      const response = await window.forge.runAITextTask({
        provider,
        prompt,
        model: aiModelForProvider(aiSettings, provider),
        vault,
        documentPath: tab.path,
        documentContent: noteContents.get(tab.path) ?? ''
      })
      setResult(response.output)
      setTaskState('done')
      setMessage(`Finished with ${aiProviderLabel(response.provider)}${response.model ? ` (${response.model})` : ''}.`)
    } catch (error) {
      setTaskState('failed')
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const insertResult = (): void => {
    if (!result.trim()) return
    const view = tab.mode === 'edit' ? getActiveEditor() : null
    if (view) {
      const selection = view.state.selection.main
      const insert = selection.empty ? insertionBlock(view.state.doc.toString(), selection.from, result) : result.trim()
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert },
        selection: { anchor: selection.from + insert.length },
        scrollIntoView: true
      })
      view.focus()
      setMessage('Inserted into note.')
      return
    }

    const current = noteContents.get(tab.path) ?? ''
    useStore.getState().updateContent(tab.path, current + insertionBlock(current, current.length, result))
    setMessage('Appended to note.')
  }

  const copyResult = async (): Promise<void> => {
    if (!result.trim()) return
    await copyText(result)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="ai-toolbar" ref={rootRef}>
      <button
        className={`icon-btn tabbar-btn ai-toolbar-trigger${open ? ' active' : ''}`}
        title="Prompt current note"
        aria-label="Prompt current note"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Sparkles size={15} />
      </button>
      {open && (
        <div className="ai-prompt-popover" role="dialog" aria-label="Prompt current note">
          <div className="ai-prompt-popover-head">
            <span>Ask AI</span>
            <button className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
              <X size={14} />
            </button>
          </div>

          <div className="ai-provider-selector compact">
            {providers.map((option) => (
              <button
                key={option}
                className={provider === option ? 'active' : ''}
                onClick={() => {
                  setProvider(option)
                  setAISettings({ ...aiSettings, defaultProvider: option })
                }}
              >
                {providerIcon(option)}
                <span>{aiProviderLabel(option)}</span>
              </button>
            ))}
          </div>

          <label className="publish-field">
            <span>Prompt</span>
            <textarea
              className="settings-textarea ai-toolbar-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>

          <div className="ai-toolbar-actions">
            <button className="btn btn-primary btn-compact" disabled={!prompt.trim() || taskState === 'running'} onClick={() => runPrompt()}>
              {taskState === 'running' ? <RefreshCw size={14} /> : <Sparkles size={14} />}
              {taskState === 'running' ? 'Running' : 'Run'}
            </button>
            {result && (
              <>
                <button className="btn btn-compact" onClick={() => insertResult()}>
                  <Plus size={14} />
                  Insert
                </button>
                <button className="btn btn-compact" onClick={() => copyResult().catch(console.error)}>
                  {copied ? <Check size={14} /> : <Clipboard size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </>
            )}
          </div>

          {message && (
            <div className={`static-publish-status ${taskState === 'failed' ? 'failed' : taskState === 'done' ? 'done' : 'publishing'}`}>
              {taskState === 'failed' ? <AlertCircle size={14} /> : taskState === 'done' ? <Check size={14} /> : <RefreshCw size={14} />}
              <span>{message}</span>
            </div>
          )}

          {result && (
            <div className="ai-result-block ai-toolbar-result">
              <pre>{result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

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

function TabContent({ tab }: { tab: Tab }): React.JSX.Element {
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
