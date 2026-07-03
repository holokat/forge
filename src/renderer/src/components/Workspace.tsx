import { useCallback, useEffect, useRef, useState } from 'react'
import EditorArea from './EditorArea'
import SidebarLeft from './SidebarLeft'
import SidebarRight from './SidebarRight'
import { useStore } from '../store'

function usePersistedWidth(key: string, initial: number): [number, (w: number) => void] {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(key))
    return saved >= 180 ? saved : initial
  })
  const update = useCallback(
    (w: number) => {
      setWidth(w)
      localStorage.setItem(key, String(w))
    },
    [key]
  )
  return [width, update]
}

function Resizer({ onResize }: { onResize: (dx: number) => void }): React.JSX.Element {
  const dragging = useRef(false)
  const lastX = useRef(0)

  useEffect(() => {
    const move = (e: MouseEvent): void => {
      if (!dragging.current) return
      onResize(e.clientX - lastX.current)
      lastX.current = e.clientX
    }
    const up = (): void => {
      dragging.current = false
      document.body.classList.remove('resizing')
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [onResize])

  return (
    <div
      className="pane-resizer"
      onMouseDown={(e) => {
        dragging.current = true
        lastX.current = e.clientX
        document.body.classList.add('resizing')
        e.preventDefault()
      }}
    />
  )
}

export default function Workspace(): React.JSX.Element {
  const leftOpen = useStore((s) => s.leftOpen)
  const rightOpen = useStore((s) => s.rightOpen)
  const [leftWidth, setLeftWidth] = usePersistedWidth('forge.leftWidth', 260)
  const [rightWidth, setRightWidth] = usePersistedWidth('forge.rightWidth', 280)

  const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

  return (
    <div className={`workspace${leftOpen ? '' : ' left-collapsed'}`}>
      {leftOpen && (
        <>
          <aside className="sidebar sidebar-left" style={{ width: leftWidth }}>
            <SidebarLeft />
          </aside>
          <Resizer onResize={(dx) => setLeftWidth(clamp(leftWidth + dx, 200, 420))} />
        </>
      )}
      <main className="main-area">
        <EditorArea />
      </main>
      {rightOpen && (
        <>
          <Resizer onResize={(dx) => setRightWidth(clamp(rightWidth - dx, 220, 440))} />
          <aside className="sidebar sidebar-right" style={{ width: rightWidth }}>
            <SidebarRight />
          </aside>
        </>
      )}
    </div>
  )
}
