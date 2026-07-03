import { useEffect, useRef } from 'react'
import { baseName, isMarkdown, resolveLink } from '../lib/parse'
import { useStore } from '../store'

interface GraphNode {
  path: string
  label: string
  x: number
  y: number
  vx: number
  vy: number
  degree: number
}

interface GraphEdge {
  a: number
  b: number
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export default function GraphView(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const files = useStore((s) => s.files)
  const index = useStore((s) => s.index)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    // ----- build graph -----
    const notePaths = files.filter(isMarkdown)
    const nodeIndex = new Map<string, number>()
    const nodes: GraphNode[] = notePaths.map((path, i) => {
      nodeIndex.set(path, i)
      const angle = (i / Math.max(1, notePaths.length)) * Math.PI * 2
      const radius = 120 + (i % 7) * 30
      return {
        path,
        label: baseName(path),
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        degree: 0
      }
    })
    const edgeSet = new Set<string>()
    const edges: GraphEdge[] = []
    for (const [source, meta] of Object.entries(index)) {
      const a = nodeIndex.get(source)
      if (a === undefined) continue
      for (const link of meta.links) {
        const resolved = resolveLink(link, notePaths)
        if (!resolved) continue
        const b = nodeIndex.get(resolved)
        if (b === undefined || a === b) continue
        const key = a < b ? `${a}-${b}` : `${b}-${a}`
        if (edgeSet.has(key)) continue
        edgeSet.add(key)
        edges.push({ a, b })
        nodes[a].degree++
        nodes[b].degree++
      }
    }

    // ----- interaction state -----
    const view = { x: 0, y: 0, k: 1 }
    let alpha = 1
    let hovered: GraphNode | null = null
    let draggedNode: GraphNode | null = null
    let panning = false
    let lastMouse = { x: 0, y: 0 }
    let raf = 0
    let width = 0
    let height = 0

    const neighbors = new Map<GraphNode, Set<GraphNode>>()
    for (const edge of edges) {
      const a = nodes[edge.a]
      const b = nodes[edge.b]
      if (!neighbors.has(a)) neighbors.set(a, new Set())
      if (!neighbors.has(b)) neighbors.set(b, new Set())
      neighbors.get(a)!.add(b)
      neighbors.get(b)!.add(a)
    }

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const observer = new ResizeObserver(() => {
      resize()
    })
    observer.observe(canvas)

    const toWorld = (sx: number, sy: number): { x: number; y: number } => ({
      x: (sx - width / 2 - view.x) / view.k,
      y: (sy - height / 2 - view.y) / view.k
    })

    const nodeRadius = (node: GraphNode): number => 3.5 + Math.min(8, node.degree * 1.1)

    const nodeAt = (sx: number, sy: number): GraphNode | null => {
      const world = toWorld(sx, sy)
      let best: GraphNode | null = null
      let bestDist = Infinity
      for (const node of nodes) {
        const dx = node.x - world.x
        const dy = node.y - world.y
        const dist = Math.hypot(dx, dy)
        if (dist < nodeRadius(node) + 6 / view.k && dist < bestDist) {
          best = node
          bestDist = dist
        }
      }
      return best
    }

    // ----- simulation -----
    const tick = (): void => {
      if (alpha < 0.003) return
      const repulsion = 1400
      const springLength = 90
      const springK = 0.035
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          let dx = a.x - b.x
          let dy = a.y - b.y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) {
            dx = (Math.random() - 0.5) * 2
            dy = (Math.random() - 0.5) * 2
            d2 = dx * dx + dy * dy
          }
          const force = (repulsion / d2) * alpha
          const dist = Math.sqrt(d2)
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          a.vx += fx
          a.vy += fy
          b.vx -= fx
          b.vy -= fy
        }
      }
      for (const edge of edges) {
        const a = nodes[edge.a]
        const b = nodes[edge.b]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.max(1, Math.hypot(dx, dy))
        const force = (dist - springLength) * springK * alpha
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }
      for (const node of nodes) {
        node.vx += -node.x * 0.004 * alpha
        node.vy += -node.y * 0.004 * alpha
        if (node === draggedNode) {
          node.vx = 0
          node.vy = 0
          continue
        }
        node.vx *= 0.85
        node.vy *= 0.85
        node.x += node.vx
        node.y += node.vy
      }
      alpha *= 0.995
    }

    // ----- render -----
    const draw = (): void => {
      tick()
      ctx.clearRect(0, 0, width, height)
      const accent = cssVar('--accent') || '#f97316'
      const nodeColor = cssVar('--graph-node') || '#8888aa'
      const edgeColor = cssVar('--graph-edge') || 'rgba(128,128,140,0.25)'
      const labelColor = cssVar('--text-muted') || '#888'

      ctx.save()
      ctx.translate(width / 2 + view.x, height / 2 + view.y)
      ctx.scale(view.k, view.k)

      const hoveredSet = hovered ? neighbors.get(hovered) : null

      ctx.lineWidth = 1 / view.k
      for (const edge of edges) {
        const a = nodes[edge.a]
        const b = nodes[edge.b]
        const isHot = hovered && (a === hovered || b === hovered)
        ctx.strokeStyle = isHot ? accent : edgeColor
        ctx.globalAlpha = hovered && !isHot ? 0.25 : 1
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }

      for (const node of nodes) {
        const r = nodeRadius(node)
        const isHot = node === hovered || (hoveredSet?.has(node) ?? false)
        ctx.globalAlpha = hovered && !isHot ? 0.3 : 1
        ctx.fillStyle = isHot ? accent : nodeColor
        ctx.beginPath()
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.globalAlpha = 1
      const showLabels = view.k > 0.65
      ctx.font = `${11 / view.k}px -apple-system, sans-serif`
      ctx.textAlign = 'center'
      for (const node of nodes) {
        const isHot = node === hovered || (hoveredSet?.has(node) ?? false)
        if (!showLabels && !isHot) continue
        ctx.globalAlpha = hovered ? (isHot ? 1 : 0.15) : 0.8
        ctx.fillStyle = isHot ? cssVar('--text-normal') : labelColor
        ctx.fillText(node.label, node.x, node.y + nodeRadius(node) + 13 / view.k)
      }
      ctx.restore()

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    // ----- events -----
    const onMouseDown = (e: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const node = nodeAt(sx, sy)
      if (node) {
        draggedNode = node
        alpha = Math.max(alpha, 0.3)
      } else {
        panning = true
      }
      lastMouse = { x: sx, y: sy }
    }

    const onMouseMove = (e: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      if (draggedNode) {
        const world = toWorld(sx, sy)
        draggedNode.x = world.x
        draggedNode.y = world.y
        alpha = Math.max(alpha, 0.2)
      } else if (panning) {
        view.x += sx - lastMouse.x
        view.y += sy - lastMouse.y
      } else {
        hovered = nodeAt(sx, sy)
        canvas.style.cursor = hovered ? 'pointer' : 'default'
      }
      lastMouse = { x: sx, y: sy }
    }

    const onMouseUp = (e: MouseEvent): void => {
      if (draggedNode) {
        const rect = canvas.getBoundingClientRect()
        const moved = Math.hypot(e.clientX - rect.left - lastMouse.x, e.clientY - rect.top - lastMouse.y)
        draggedNode = null
        void moved
      }
      panning = false
    }

    const onClick = (e: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect()
      const node = nodeAt(e.clientX - rect.left, e.clientY - rect.top)
      if (node) useStore.getState().openFile(node.path)
    }

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const factor = Math.exp(-e.deltaY * 0.002)
      const k = Math.min(4, Math.max(0.2, view.k * factor))
      // zoom around cursor
      const wx = (sx - width / 2 - view.x) / view.k
      const wy = (sy - height / 2 - view.y) / view.k
      view.x = sx - width / 2 - wx * k
      view.y = sy - height / 2 - wy * k
      view.k = k
    }

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('click', onClick)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [files, index])

  return (
    <div className="graph-view">
      <canvas ref={canvasRef} className="graph-canvas" />
      <div className="graph-hint">Scroll to zoom · drag to pan · click a node to open</div>
    </div>
  )
}
