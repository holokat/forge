import { useEffect, useMemo, useRef, useState } from 'react'
import { fuzzyFilter } from '../lib/fuzzy'
import { activeTab, useStore } from '../store'

interface Command {
  name: string
  hint?: string
  action: () => void
}

export function useListNav(count: number, onPick: (index: number) => void): {
  selected: number
  setSelected: (i: number) => void
  onKeyDown: (e: React.KeyboardEvent) => void
} {
  const [selected, setSelected] = useState(0)
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, count - 1)))
  }, [count])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => (count === 0 ? 0 : (s + 1) % count))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => (count === 0 ? 0 : (s - 1 + count) % count))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onPick(selected)
    }
  }
  return { selected, setSelected, onKeyDown }
}

export function ModalOverlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  const setModal = useStore((s) => s.setModal)
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}>
      {children}
    </div>
  )
}

export default function CommandPalette(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands = useMemo<Command[]>(() => {
    const store = useStore.getState()
    const tab = activeTab(store)
    const close = (fn: () => void) => () => {
      store.setModal(null)
      fn()
    }
    const list: Command[] = [
      { name: 'New note', hint: '⌘N', action: close(() => store.createNote()) },
      { name: "Open today's daily note", action: close(() => store.createDailyNote()) },
      { name: 'Open quick switcher', hint: '⌘O', action: () => store.setModal('switcher') },
      { name: 'Open graph view', hint: '⌘⇧G', action: close(() => store.openGraph()) },
      { name: 'Search in all notes', hint: '⌘⇧F', action: close(() => store.setLeftPane('search')) },
      { name: 'Toggle reading view', hint: '⌘E', action: close(() => store.toggleActiveMode()) },
      { name: 'New tab', hint: '⌘T', action: close(() => store.newTab()) },
      { name: 'Toggle left sidebar', hint: '⌘\\', action: close(() => store.setLeftOpen(!store.leftOpen)) },
      { name: 'Toggle right panel', action: close(() => store.setRightOpen(!store.rightOpen)) },
      { name: 'Open settings', hint: '⌘,', action: () => store.setModal('settings') },
      { name: 'Theme: Light', action: close(() => store.setTheme('light')) },
      { name: 'Theme: Dark', action: close(() => store.setTheme('dark')) },
      { name: 'Theme: System', action: close(() => store.setTheme('system')) },
      { name: 'Open another vault…', action: close(() => store.openVaultDialog()) },
      { name: 'Close vault', action: close(() => store.closeVault()) }
    ]
    if (tab?.kind === 'note' && tab.path) {
      const path = tab.path
      list.push(
        { name: 'Reveal current note in Finder', action: close(() => window.forge.reveal(store.vault!, path)) },
        { name: 'Delete current note', action: close(() => store.trashPath(path)) }
      )
    }
    return list
  }, [])

  const filtered = useMemo(() => fuzzyFilter(query, commands, (c) => c.name), [query, commands])
  const { selected, setSelected, onKeyDown } = useListNav(filtered.length, (i) => filtered[i]?.action())

  useEffect(() => {
    listRef.current?.children[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <ModalOverlay>
      <div className="modal-panel">
        <input
          ref={inputRef}
          className="modal-input"
          placeholder="Type a command…"
          value={query}
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(0)
          }}
          onKeyDown={onKeyDown}
        />
        <div className="modal-list" ref={listRef}>
          {filtered.map((command, i) => (
            <button
              key={command.name}
              className={`modal-item${i === selected ? ' selected' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => command.action()}
            >
              <span>{command.name}</span>
              {command.hint && <kbd>{command.hint}</kbd>}
            </button>
          ))}
          {filtered.length === 0 && <div className="modal-empty">No matching commands</div>}
        </div>
      </div>
    </ModalOverlay>
  )
}
