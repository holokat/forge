import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore, type ContextMenuState } from '../store'

export default function ContextMenu({ x, y, items }: ContextMenuState): React.JSX.Element {
  const setContextMenu = useStore((s) => s.setContextMenu)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({
      x: Math.min(x, window.innerWidth - rect.width - 8),
      y: Math.min(y, window.innerHeight - rect.height - 8)
    })
  }, [x, y])

  useEffect(() => {
    const close = (): void => setContextMenu(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
    }
  }, [setContextMenu])

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          className={`context-menu-item${item.danger ? ' danger' : ''}`}
          onClick={() => {
            setContextMenu(null)
            item.action()
          }}
        >
          {item.icon && <span className="context-menu-item-icon">{item.icon}</span>}
          <span className="context-menu-item-label">{item.label}</span>
        </button>
      ))}
    </div>
  )
}
