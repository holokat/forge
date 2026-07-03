import {
  AlertCircle,
  Check,
  Clipboard,
  KeyRound,
  Plus,
  RefreshCw,
  Sparkles,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AIStatus, AITextProvider } from '../../../shared/types'
import { getActiveEditor } from '../editor/active'
import { aiModelForProvider, aiProviderLabel, configuredAIProviders } from '../lib/ai'
import { noteContents, useStore, type Tab } from '../store'

const DEFAULT_AI_PROMPT = 'Improve the formatting and clarity of this note without changing its meaning.'
const SELECTION_AI_PROMPT = 'Improve this selected passage without changing its meaning.'

export interface NoteAIRequest {
  id: number
  selectedText: string
}

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

function useNoteAI(tab: Tab & { kind: 'note'; path: string }) {
  const vault = useStore((s) => s.vault)
  const modal = useStore((s) => s.modal)
  const aiSettings = useStore((s) => s.aiSettings)
  const setAISettings = useStore((s) => s.setAISettings)
  const setModal = useStore((s) => s.setModal)
  const [status, setStatus] = useState<AIStatus | null>(null)
  const [provider, setProvider] = useState<AITextProvider>(aiSettings.defaultProvider)
  const [prompt, setPrompt] = useState(DEFAULT_AI_PROMPT)
  const [taskState, setTaskState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle')
  const [message, setMessage] = useState('')
  const [result, setResult] = useState('')
  const [copied, setCopied] = useState(false)
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
    cancelStatusRefresh.current = () => {
      cancelled = true
    }
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

  const resetForPrompt = (nextPrompt = DEFAULT_AI_PROMPT): void => {
    setPrompt(nextPrompt)
    setMessage('')
    setResult('')
    setCopied(false)
    setTaskState('idle')
  }

  const selectProvider = (next: AITextProvider): void => {
    setProvider(next)
    setAISettings({ ...aiSettings, defaultProvider: next })
  }

  const runPrompt = async (contextText = ''): Promise<void> => {
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
        documentContent: contextText.trim() || noteContents.get(tab.path) || ''
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
      setMessage(selection.empty ? 'Inserted into note.' : 'Replaced selection.')
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

  const openSettings = (): void => setModal('settings')

  return {
    copied,
    insertResult,
    message,
    openSettings,
    prompt,
    provider,
    providers,
    refreshStatus,
    resetForPrompt,
    result,
    runPrompt,
    selectProvider,
    setPrompt,
    status,
    taskState,
    copyResult
  }
}

function ProviderSelector({
  provider,
  providers,
  onSelect,
  compact = false
}: {
  provider: AITextProvider
  providers: AITextProvider[]
  onSelect: (provider: AITextProvider) => void
  compact?: boolean
}): React.JSX.Element {
  return (
    <div className={`ai-provider-selector${compact ? ' compact' : ''}`}>
      {providers.map((option) => (
        <button key={option} className={provider === option ? 'active' : ''} onClick={() => onSelect(option)}>
          {providerIcon(option)}
          <span>{aiProviderLabel(option)}</span>
        </button>
      ))}
    </div>
  )
}

function AIStatusLine({
  message,
  taskState
}: {
  message: string
  taskState: 'idle' | 'running' | 'done' | 'failed'
}): React.JSX.Element | null {
  if (!message) return null
  return (
    <div className={`static-publish-status ${taskState === 'failed' ? 'failed' : taskState === 'done' ? 'done' : 'publishing'}`}>
      {taskState === 'failed' ? <AlertCircle size={14} /> : taskState === 'done' ? <Check size={14} /> : <RefreshCw size={14} />}
      <span>{message}</span>
    </div>
  )
}

export function NoteAIPromptButton({ tab }: { tab: Tab & { kind: 'note'; path: string } }): React.JSX.Element | null {
  const ai = useNoteAI(tab)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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

  if (!ai.providers.length) return null

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

          <ProviderSelector provider={ai.provider} providers={ai.providers} onSelect={ai.selectProvider} compact />

          <label className="publish-field">
            <span>Prompt</span>
            <textarea className="settings-textarea ai-toolbar-prompt" value={ai.prompt} onChange={(event) => ai.setPrompt(event.target.value)} />
          </label>

          <div className="ai-toolbar-actions">
            <button className="btn btn-primary btn-compact" disabled={!ai.prompt.trim() || ai.taskState === 'running'} onClick={() => ai.runPrompt()}>
              {ai.taskState === 'running' ? <RefreshCw size={14} /> : <Sparkles size={14} />}
              {ai.taskState === 'running' ? 'Running' : 'Run'}
            </button>
            {ai.result && (
              <>
                <button className="btn btn-compact" onClick={() => ai.insertResult()}>
                  <Plus size={14} />
                  Insert
                </button>
                <button className="btn btn-compact" onClick={() => ai.copyResult().catch(console.error)}>
                  {ai.copied ? <Check size={14} /> : <Clipboard size={14} />}
                  {ai.copied ? 'Copied' : 'Copy'}
                </button>
              </>
            )}
          </div>

          <AIStatusLine message={ai.message} taskState={ai.taskState} />

          {ai.result && (
            <div className="ai-result-block ai-toolbar-result">
              <pre>{ai.result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function NoteAIContextIsland({
  request,
  tab,
  onClose
}: {
  request: NoteAIRequest | null
  tab: Tab & { kind: 'note'; path: string }
  onClose: () => void
}): React.JSX.Element | null {
  const ai = useNoteAI(tab)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const selectedText = request?.selectedText.trim() ?? ''

  useEffect(() => {
    if (!request) return
    ai.resetForPrompt(selectedText ? SELECTION_AI_PROMPT : DEFAULT_AI_PROMPT)
    window.setTimeout(() => inputRef.current?.focus(), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id])

  if (!request) return null

  const providerReady = ai.providers.length > 0

  return (
    <div className="ai-context-island" role="dialog" aria-label="Ask AI">
      <div className="ai-context-main">
        <div className="ai-context-head-row">
          <div className="ai-context-head">
            <Sparkles size={15} />
            <span>{selectedText ? 'Ask AI about selection' : 'Ask AI about note'}</span>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {providerReady ? (
          <>
            <ProviderSelector provider={ai.provider} providers={ai.providers} onSelect={ai.selectProvider} compact />
            <textarea
              ref={inputRef}
              className="ai-context-input"
              value={ai.prompt}
              onChange={(event) => ai.setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') ai.runPrompt(selectedText).catch(console.error)
                if (event.key === 'Escape') onClose()
              }}
            />
          </>
        ) : (
          <div className="ai-context-empty">
            <span>{ai.status ? 'No AI provider configured.' : 'Checking AI status.'}</span>
            {ai.status && (
              <button className="btn btn-compact" onClick={ai.openSettings}>
                Open Settings
              </button>
            )}
          </div>
        )}

        <AIStatusLine message={ai.message} taskState={ai.taskState} />

        {ai.result && (
          <div className="ai-result-block ai-context-result">
            <pre>{ai.result}</pre>
          </div>
        )}
      </div>

      <div className="ai-context-actions">
        {providerReady && (
          <button className="btn btn-primary btn-compact" disabled={!ai.prompt.trim() || ai.taskState === 'running'} onClick={() => ai.runPrompt(selectedText)}>
            {ai.taskState === 'running' ? <RefreshCw size={14} /> : <Sparkles size={14} />}
            {ai.taskState === 'running' ? 'Running' : 'Run'}
          </button>
        )}
        {ai.result && (
          <>
            <button className="btn btn-compact" onClick={ai.insertResult}>
              <Plus size={14} />
              Insert
            </button>
            <button className="btn btn-compact" onClick={() => ai.copyResult().catch(console.error)}>
              {ai.copied ? <Check size={14} /> : <Clipboard size={14} />}
              {ai.copied ? 'Copied' : 'Copy'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
