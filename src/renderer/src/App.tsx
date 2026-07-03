import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReleaseNotesInfo } from '../../shared/types'
import CommandPalette from './components/CommandPalette'
import ContextMenu from './components/ContextMenu'
import QuickSwitcher from './components/QuickSwitcher'
import SettingsModal from './components/SettingsModal'
import TemplatePicker from './components/TemplatePicker'
import VaultPicker from './components/VaultPicker'
import Workspace from './components/Workspace'
import { activeTab, useStore } from './store'

function useTheme(): void {
  const theme = useStore((s) => s.theme)
  const fontSize = useStore((s) => s.fontSize)
  const lineWidth = useStore((s) => s.lineWidth)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--editor-font-size', `${fontSize}px`)
    document.documentElement.style.setProperty('--editor-line-width', `${lineWidth}px`)
  }, [fontSize, lineWidth])
}

function useShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const store = useStore.getState()
      const mod = e.metaKey || e.ctrlKey
      if (!mod) {
        if (e.key === 'Escape') {
          if (store.contextMenu) store.setContextMenu(null)
          else if (store.modal) store.setModal(null)
        }
        return
      }
      const key = e.key.toLowerCase()
      if (key === 'p' && !e.shiftKey) {
        e.preventDefault()
        store.setModal(store.modal === 'palette' ? null : 'palette')
      } else if (key === 'o' && !e.shiftKey) {
        e.preventDefault()
        store.setModal(store.modal === 'switcher' ? null : 'switcher')
      } else if (key === 'n' && !e.shiftKey && store.vault) {
        e.preventDefault()
        store.createNote()
      } else if (key === 't' && store.vault) {
        e.preventDefault()
        store.newTab()
      } else if (key === 'w' && store.vault && store.tabs.length > 1) {
        e.preventDefault()
        if (store.activeTabId) store.closeTab(store.activeTabId)
      } else if (key === 'e' && store.vault) {
        e.preventDefault()
        store.toggleActiveMode()
      } else if (key === 'g' && e.shiftKey && store.vault) {
        e.preventDefault()
        store.openGraph()
      } else if (key === ',') {
        e.preventDefault()
        store.setModal('settings')
      } else if (key === '\\') {
        e.preventDefault()
        store.setLeftOpen(!store.leftOpen)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}

function ReleaseNotesModal({
  notes,
  onClose
}: {
  notes: ReleaseNotesInfo
  onClose: () => void
}): React.JSX.Element {
  return (
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="release-notes-panel">
        <div className="release-notes-header">
          <div>
            <div className="release-notes-eyebrow">Updated to Forge {notes.version}</div>
            <h2>{notes.releaseName || 'What changed'}</h2>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="release-notes-body">
          {notes.releaseNotes ? notes.releaseNotes : 'Forge has been updated.'}
        </div>
      </div>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const booted = useStore((s) => s.booted)
  const vault = useStore((s) => s.vault)
  const modal = useStore((s) => s.modal)
  const contextMenu = useStore((s) => s.contextMenu)
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNotesInfo | null>(null)

  useTheme()
  useShortcuts()

  useEffect(() => {
    useStore.getState().boot()
  }, [])

  useEffect(() => {
    return window.forge.onVaultChanged(() => {
      useStore.getState().refreshVault()
    })
  }, [])

  useEffect(() => {
    window.forge.consumePendingReleaseNotes().then(setReleaseNotes).catch(console.error)
  }, [])

  if (!booted) return <div className="app-loading" />

  return (
    <>
      {vault ? <Workspace /> : <VaultPicker />}
      {modal === 'palette' && <CommandPalette />}
      {modal === 'switcher' && <QuickSwitcher />}
      {modal === 'template' && <TemplatePicker />}
      {modal === 'settings' && <SettingsModal />}
      {contextMenu && <ContextMenu {...contextMenu} />}
      {releaseNotes && <ReleaseNotesModal notes={releaseNotes} onClose={() => setReleaseNotes(null)} />}
    </>
  )
}
