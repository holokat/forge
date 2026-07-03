/* Forge site — all motion, no dependencies */
'use strict'

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => [...document.querySelectorAll(sel)]

/* ============ scroll progress ============ */

const progressFill = $('#progressFill')
const onScroll = () => {
  const max = document.documentElement.scrollHeight - innerHeight
  progressFill.style.width = `${max > 0 ? (scrollY / max) * 100 : 0}%`
}
addEventListener('scroll', onScroll, { passive: true })
onScroll()

/* ============ nav hide on scroll down ============ */

const nav = $('#nav')
let lastY = 0
addEventListener(
  'scroll',
  () => {
    const y = scrollY
    nav.classList.toggle('hidden', y > 140 && y > lastY)
    lastY = y
  },
  { passive: true }
)

/* ============ reveal on scroll ============ */

const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in')
        revealObserver.unobserve(entry.target)
      }
    }
  },
  { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
)
$$('[data-reveal]').forEach((el) => revealObserver.observe(el))

/* ============ cursor glow ============ */

const glow = $('#cursorGlow')
addEventListener('pointermove', (e) => {
  glow.style.left = e.clientX + 'px'
  glow.style.top = e.clientY + 'px'
})

/* ============ 3D tilt ============ */

$$('[data-tilt]').forEach((el) => {
  if (reducedMotion) return
  const wrap = el.parentElement
  wrap.addEventListener('pointermove', (e) => {
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    el.style.transform = `rotateY(${px * 10}deg) rotateX(${-py * 8}deg) translateZ(0)`
  })
  wrap.addEventListener('pointerleave', () => {
    el.style.transition = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)'
    el.style.transform = 'rotateY(0) rotateX(0)'
    setTimeout(() => (el.style.transition = 'transform 0.15s ease-out'), 600)
  })
})

/* ============ magnetic buttons ============ */

$$('[data-magnet]').forEach((el) => {
  if (reducedMotion) return
  el.addEventListener('pointermove', (e) => {
    const rect = el.getBoundingClientRect()
    const dx = e.clientX - rect.left - rect.width / 2
    const dy = e.clientY - rect.top - rect.height / 2
    el.style.transform = `translate(${dx * 0.18}px, ${dy * 0.25}px)`
  })
  el.addEventListener('pointerleave', () => {
    el.style.transform = ''
  })
})

/* ============ glow-tracking cards ============ */

$$('[data-glow]').forEach((card) => {
  card.addEventListener('pointermove', (e) => {
    const rect = card.getBoundingClientRect()
    card.style.setProperty('--mx', `${e.clientX - rect.left}px`)
    card.style.setProperty('--my', `${e.clientY - rect.top}px`)
  })
})

/* ============ marquee: duplicate track for seamless loop ============ */

const track = $('#marqueeTrack')
track.innerHTML += track.innerHTML

/* ============ typing demo ============ */

const demoText = $('#demoText')
const demoComplete = $('#demoComplete')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let demoRunning = false

async function typeInto(el, text, speed = 42) {
  for (const ch of text) {
    if (!demoRunning) return false
    el.insertAdjacentText('beforeend', ch)
    await sleep(speed + Math.random() * 40)
  }
  return true
}

async function runDemo() {
  while (demoRunning) {
    demoText.innerHTML = ''
    demoComplete.hidden = true

    const line = document.createElement('span')
    const caret = document.createElement('span')
    caret.className = 'dt-caret'
    demoText.append(line, caret)

    if (!(await typeInto(line, 'Slow morning. That idea from '))) return

    // start a wikilink
    const link = document.createElement('span')
    link.className = 'dt-link'
    demoText.insertBefore(link, caret)
    if (!(await typeInto(link, '[[', 90))) return
    await sleep(150)

    // autocomplete appears, narrows as we type
    demoComplete.hidden = false
    const caretRect = caret.getBoundingClientRect()
    const editorRect = demoComplete.parentElement.getBoundingClientRect()
    demoComplete.style.left = Math.min(caretRect.left - editorRect.left, editorRect.width - 220) + 'px'
    demoComplete.style.top = caretRect.bottom - editorRect.top + 8 + 'px'

    if (!(await typeInto(link, 'Rea', 110))) return
    await sleep(160)
    demoComplete.querySelectorAll('.dc-item')[2].style.display = 'none'
    await sleep(420)

    // pick the completion
    demoComplete.hidden = true
    link.textContent = 'Reading Notes'
    link.classList.add('resolved')
    await sleep(120)

    if (!(await typeInto(line2(), ' keeps coming back. Link it, let the graph do the remembering.'))) return
    await sleep(2600)

    function line2() {
      const s = document.createElement('span')
      demoText.insertBefore(s, caret)
      return s
    }
  }
}

new IntersectionObserver((entries) => {
  const visible = entries[0].isIntersecting
  if (visible && !demoRunning) {
    demoRunning = true
    runDemo()
  } else if (!visible) {
    demoRunning = false
  }
}, { threshold: 0.4 }).observe($('#demo'))

/* ============ interactive graph ============ */

const graphCanvas = $('#graphCanvas')
const gctx = graphCanvas.getContext('2d')
const NOTE_NAMES = [
  'Ideas', 'Reading Notes', 'Forge Roadmap', 'Morning pages', 'Inbox',
  'How to Take Smart Notes', 'Zettelkasten', 'Weekly review', 'Deep work',
  'Digital garden', 'Writing', 'Attention', 'Rituals', 'Plain text',
  'Local-first', 'Second brain', 'Memory', 'Slow productivity', 'Systems', 'Play'
]
let gNodes = []
let gEdges = []
let gAlpha = 1
let gHover = null
let gDragged = null
let gRunning = false

function buildGraph() {
  gNodes = NOTE_NAMES.map((label, i) => {
    const angle = (i / NOTE_NAMES.length) * Math.PI * 2
    return {
      label,
      x: Math.cos(angle) * 160,
      y: Math.sin(angle) * 120,
      vx: 0, vy: 0,
      deg: 0
    }
  })
  gEdges = []
  const link = (a, b) => {
    gEdges.push([a, b])
    gNodes[a].deg++
    gNodes[b].deg++
  }
  // a hub-and-cluster shape that reads as a real vault
  link(0, 1); link(0, 2); link(0, 4); link(0, 15); link(1, 5); link(1, 6)
  link(5, 6); link(6, 16); link(15, 16); link(15, 13); link(13, 14)
  link(2, 7); link(7, 8); link(8, 17); link(3, 0); link(3, 12); link(12, 7)
  link(9, 10); link(10, 11); link(9, 13); link(18, 7); link(18, 2); link(19, 3)
  link(10, 1); link(11, 8); link(17, 19)
  gAlpha = 1
}

function sizeGraph() {
  const rect = graphCanvas.parentElement.getBoundingClientRect()
  const dpr = devicePixelRatio || 1
  graphCanvas.width = rect.width * dpr
  graphCanvas.height = rect.height * dpr
  gctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function graphTick() {
  const w = graphCanvas.clientWidth
  const h = graphCanvas.clientHeight
  if (gAlpha > 0.002) {
    for (let i = 0; i < gNodes.length; i++) {
      for (let j = i + 1; j < gNodes.length; j++) {
        const a = gNodes[i], b = gNodes[j]
        let dx = a.x - b.x, dy = a.y - b.y
        let d2 = Math.max(dx * dx + dy * dy, 1)
        const f = (2600 / d2) * gAlpha
        const d = Math.sqrt(d2)
        a.vx += (dx / d) * f; a.vy += (dy / d) * f
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
      }
    }
    for (const [ai, bi] of gEdges) {
      const a = gNodes[ai], b = gNodes[bi]
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.max(1, Math.hypot(dx, dy))
      const f = (d - 110) * 0.03 * gAlpha
      a.vx += (dx / d) * f; a.vy += (dy / d) * f
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
    }
    for (const n of gNodes) {
      if (n === gDragged) { n.vx = 0; n.vy = 0; continue }
      n.vx += -n.x * 0.003 * gAlpha
      n.vy += -n.y * 0.003 * gAlpha
      n.vx *= 0.86; n.vy *= 0.86
      n.x += n.vx; n.y += n.vy
    }
    gAlpha *= 0.997
  }

  gctx.clearRect(0, 0, w, h)
  gctx.save()
  gctx.translate(w / 2, h / 2)

  const neighbors = gHover
    ? new Set(gEdges.flatMap(([a, b]) => (gNodes[a] === gHover ? [gNodes[b]] : gNodes[b] === gHover ? [gNodes[a]] : [])))
    : null

  for (const [ai, bi] of gEdges) {
    const a = gNodes[ai], b = gNodes[bi]
    const hot = gHover && (a === gHover || b === gHover)
    gctx.strokeStyle = hot ? '#ff8a4c' : 'rgba(190,190,210,0.14)'
    gctx.lineWidth = hot ? 1.6 : 1
    gctx.globalAlpha = gHover && !hot ? 0.35 : 1
    gctx.beginPath(); gctx.moveTo(a.x, a.y); gctx.lineTo(b.x, b.y); gctx.stroke()
  }

  for (const n of gNodes) {
    const r = 4 + n.deg * 1.4
    const hot = n === gHover || (neighbors && neighbors.has(n))
    gctx.globalAlpha = gHover && !hot ? 0.35 : 1
    if (hot) { gctx.shadowColor = '#ff7a1f'; gctx.shadowBlur = 14 }
    gctx.fillStyle = hot ? '#ff8a4c' : '#7c7c88'
    gctx.beginPath(); gctx.arc(n.x, n.y, r, 0, Math.PI * 2); gctx.fill()
    gctx.shadowBlur = 0
    gctx.globalAlpha = gHover ? (hot ? 1 : 0.2) : 0.7
    gctx.fillStyle = hot ? '#f2f2f5' : '#9b9ba6'
    gctx.font = '11px -apple-system, sans-serif'
    gctx.textAlign = 'center'
    gctx.fillText(n.label, n.x, n.y + r + 14)
  }
  gctx.restore()
  gctx.globalAlpha = 1
  if (gRunning) requestAnimationFrame(graphTick)
}

function graphNodeAt(e) {
  const rect = graphCanvas.getBoundingClientRect()
  const x = e.clientX - rect.left - rect.width / 2
  const y = e.clientY - rect.top - rect.height / 2
  return gNodes.find((n) => Math.hypot(n.x - x, n.y - y) < 4 + n.deg * 1.4 + 8) ?? null
}

graphCanvas.addEventListener('pointermove', (e) => {
  if (gDragged) {
    const rect = graphCanvas.getBoundingClientRect()
    gDragged.x = e.clientX - rect.left - rect.width / 2
    gDragged.y = e.clientY - rect.top - rect.height / 2
    gAlpha = Math.max(gAlpha, 0.25)
  } else {
    gHover = graphNodeAt(e)
    graphCanvas.style.cursor = gHover ? 'pointer' : 'grab'
  }
})
graphCanvas.addEventListener('pointerdown', (e) => {
  gDragged = graphNodeAt(e)
  if (gDragged) {
    graphCanvas.setPointerCapture(e.pointerId)
    gAlpha = Math.max(gAlpha, 0.3)
  }
})
addEventListener('pointerup', () => (gDragged = null))

buildGraph()
sizeGraph()
addEventListener('resize', sizeGraph)
new IntersectionObserver((entries) => {
  const visible = entries[0].isIntersecting
  if (visible && !gRunning) {
    gRunning = true
    gAlpha = Math.max(gAlpha, 0.4)
    graphTick()
  } else if (!visible) {
    gRunning = false
  }
}, { threshold: 0.1 }).observe(graphCanvas)

/* ============ keycaps react to real keys ============ */

const keycaps = $$('.keycap')
function flashKeycaps(key, down) {
  for (const cap of keycaps) {
    if (cap.dataset.key === key) cap.classList.toggle('pressed', down)
  }
}
addEventListener('keydown', (e) => {
  flashKeycaps(e.key.toLowerCase(), true)
  if (e.metaKey || e.ctrlKey) flashKeycaps('meta', true)
  if (e.shiftKey) flashKeycaps('shift', true)
})
addEventListener('keyup', (e) => {
  flashKeycaps(e.key.toLowerCase(), false)
  if (!e.metaKey && !e.ctrlKey) flashKeycaps('meta', false)
  if (!e.shiftKey) flashKeycaps('shift', false)
})
addEventListener('blur', () => keycaps.forEach((c) => c.classList.remove('pressed')))

/* ============ command palette (⌘K) ============ */

const overlay = $('#paletteOverlay')
const paletteInput = $('#paletteInput')
const paletteList = $('#paletteList')
let paletteSelected = 0

const COMMANDS = [
  { name: 'Go to: Features', hint: 'section', run: () => $('#features').scrollIntoView() },
  { name: 'Go to: Live demo', hint: 'section', run: () => $('#demo').scrollIntoView() },
  { name: 'Go to: Graph playground', hint: 'section', run: () => $('#graph').scrollIntoView() },
  { name: 'Go to: Shortcuts', hint: 'section', run: () => $('#shortcuts').scrollIntoView() },
  { name: 'Download Forge', hint: '⚡', run: () => $('#download').scrollIntoView() },
  { name: 'Shake the graph', hint: 'fun', run: () => { buildGraph(); $('#graph').scrollIntoView() } },
  { name: 'Do a barrel roll', hint: '???', run: barrelRoll },
  { name: 'Back to top', hint: '↑', run: () => scrollTo({ top: 0, behavior: 'smooth' }) }
]

function barrelRoll() {
  document.body.classList.add('rolling')
  setTimeout(() => document.body.classList.remove('rolling'), 1200)
}

function renderPalette() {
  const q = paletteInput.value.trim().toLowerCase()
  const matches = COMMANDS.filter((c) => c.name.toLowerCase().includes(q))
  paletteSelected = Math.min(paletteSelected, Math.max(0, matches.length - 1))
  paletteList.innerHTML = ''
  matches.forEach((cmd, i) => {
    const btn = document.createElement('button')
    btn.className = 'palette-item' + (i === paletteSelected ? ' selected' : '')
    btn.innerHTML = `<span>${cmd.name}</span><span class="pi-hint">${cmd.hint}</span>`
    btn.addEventListener('pointerenter', () => {
      paletteSelected = i
      renderPalette()
    })
    btn.addEventListener('click', () => {
      closePalette()
      cmd.run()
    })
    paletteList.appendChild(btn)
  })
  if (matches.length === 0) {
    paletteList.innerHTML = '<div style="padding:18px;text-align:center;color:var(--text-faint);font-size:13px">Nothing here… yet ⚡</div>'
  }
  return matches
}

function openPalette() {
  overlay.hidden = false
  paletteInput.value = ''
  paletteSelected = 0
  renderPalette()
  paletteInput.focus()
}
function closePalette() {
  overlay.hidden = true
}

$('#paletteHint').addEventListener('click', openPalette)
overlay.addEventListener('pointerdown', (e) => {
  if (e.target === overlay) closePalette()
})

addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    overlay.hidden ? openPalette() : closePalette()
    return
  }
  if (overlay.hidden) return
  const matches = COMMANDS.filter((c) => c.name.toLowerCase().includes(paletteInput.value.trim().toLowerCase()))
  if (e.key === 'Escape') closePalette()
  else if (e.key === 'ArrowDown') {
    e.preventDefault()
    paletteSelected = (paletteSelected + 1) % Math.max(1, matches.length)
    renderPalette()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    paletteSelected = (paletteSelected - 1 + matches.length) % Math.max(1, matches.length)
    renderPalette()
  } else if (e.key === 'Enter' && matches[paletteSelected]) {
    e.preventDefault()
    closePalette()
    matches[paletteSelected].run()
  }
})
paletteInput.addEventListener('input', () => {
  paletteSelected = 0
  renderPalette()
})
