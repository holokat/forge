import { CornerDownLeft, FilePlus2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fuzzyFilter } from '../lib/fuzzy'
import { baseName, isMarkdown, noteDisplayTitle } from '../lib/parse'
import { useStore } from '../store'
import { ModalOverlay, useListNav } from './CommandPalette'

export default function QuickSwitcher(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const files = useStore((s) => s.files)
  const index = useStore((s) => s.index)
  const openFile = useStore((s) => s.openFile)
  const createNoteNamed = useStore((s) => s.createNoteNamed)
  const setModal = useStore((s) => s.setModal)
  const listRef = useRef<HTMLDivElement>(null)

  const notes = useMemo(() => files.filter(isMarkdown), [files])
  const filtered = useMemo(
    () => fuzzyFilter(query, notes, (f) => [f, noteDisplayTitle(f, index[f]), ...(index[f]?.aliases ?? [])].join(' '), 40),
    [query, notes, index]
  )

  const canCreate =
    query.trim().length > 0 && !notes.some((n) => baseName(n).toLowerCase() === query.trim().toLowerCase())
  const total = filtered.length + (canCreate ? 1 : 0)

  const pick = (index: number): void => {
    if (index < filtered.length) {
      setModal(null)
      openFile(filtered[index])
    } else if (canCreate) {
      setModal(null)
      createNoteNamed(query.trim()).catch(console.error)
    }
  }

  const { selected, setSelected, onKeyDown } = useListNav(total, pick)

  useEffect(() => {
    listRef.current?.children[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <ModalOverlay>
      <div className="modal-panel">
        <input
          className="modal-input"
          placeholder="Find or create a note…"
          value={query}
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(0)
          }}
          onKeyDown={onKeyDown}
        />
        <div className="modal-list" ref={listRef}>
          {filtered.map((path, i) => (
            <button
              key={path}
              className={`modal-item${i === selected ? ' selected' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => pick(i)}
            >
              <span>{noteDisplayTitle(path, index[path])}</span>
              {path.includes('/') && <span className="modal-item-detail">{path.split('/').slice(0, -1).join('/')}</span>}
            </button>
          ))}
          {canCreate && (
            <button
              className={`modal-item modal-item-create${selected === filtered.length ? ' selected' : ''}`}
              onMouseEnter={() => setSelected(filtered.length)}
              onClick={() => pick(filtered.length)}
            >
              <span className="modal-item-create-label">
                <FilePlus2 size={14} />
                Create “{query.trim()}”
              </span>
              <CornerDownLeft size={13} />
            </button>
          )}
          {total === 0 && <div className="modal-empty">No notes found</div>}
        </div>
      </div>
    </ModalOverlay>
  )
}
