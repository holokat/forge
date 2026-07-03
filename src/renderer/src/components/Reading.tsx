import { useEffect, useMemo, useRef } from 'react'
import { renderMarkdown } from '../lib/render'
import { resolveLink } from '../lib/parse'
import { noteContents, useStore } from '../store'

const TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/gm

export default function Reading({ path }: { path: string }): React.JSX.Element {
  const vault = useStore((s) => s.vault)!
  const files = useStore((s) => s.files)
  const contentVersion = useStore((s) => s.contentVersion)
  const ref = useRef<HTMLDivElement>(null)

  const html = useMemo(
    () => renderMarkdown(noteContents.get(path) ?? '', vault, files),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, vault, files, contentVersion]
  )

  // Make task checkboxes interactive: toggling one flips the matching
  // `- [ ]` in the source markdown.
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const boxes = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    boxes.forEach((box, i) => {
      box.disabled = false
      box.onchange = () => {
        const source = noteContents.get(path) ?? ''
        let n = -1
        const next = source.replace(TASK_RE, (match, prefix: string, state: string) => {
          n += 1
          if (n !== i) return match
          return `${prefix}[${state === ' ' ? 'x' : ' '}]`
        })
        useStore.getState().updateContent(path, next)
      }
    })
  }, [html, path])

  const onClick = (e: React.MouseEvent): void => {
    const link = (e.target as HTMLElement).closest?.('a.internal-link')
    if (link) {
      e.preventDefault()
      const target = link.getAttribute('data-target')
      if (!target) return
      const store = useStore.getState()
      const resolved = resolveLink(target, store.files)
      if (resolved) store.openFile(resolved, { newTab: e.metaKey })
      else store.createNoteNamed(target).catch(console.error)
    }
  }

  return (
    <div className="reading-scroll">
      <div
        ref={ref}
        className="reading-view"
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
