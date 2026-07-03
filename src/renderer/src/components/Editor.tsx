import { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { createEditorState } from '../editor/extensions'
import { getActiveEditor, setActiveEditor } from '../editor/active'
import { baseName, isMarkdown, resolveLink } from '../lib/parse'
import { noteContents, useStore } from '../store'

export default function Editor({ path }: { path: string }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const content = noteContents.get(path) ?? ''
    const view = new EditorView({
      state: createEditorState(content, {
        onChange: (c) => useStore.getState().updateContent(path, c),
        onNavigate: (target) => {
          const store = useStore.getState()
          const resolved = resolveLink(target, store.files)
          if (resolved) store.openFile(resolved)
          else store.createNoteNamed(target).catch(console.error)
        },
        getLinkTargets: () => {
          const files = useStore.getState().files.filter(isMarkdown)
          return files.map((f) => ({
            label: baseName(f),
            detail: f.includes('/') ? f.split('/').slice(0, -1).join('/') : undefined
          }))
        }
      }),
      parent: host.current!
    })
    setActiveEditor(view)
    view.focus()
    return () => {
      if (getActiveEditor() === view) setActiveEditor(null)
      view.destroy()
    }
  }, [path])

  return <div className="editor-host" ref={host} />
}
