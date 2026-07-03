import { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import type { ImportedAttachment } from '../../../shared/types'
import { createEditorState } from '../editor/extensions'
import { getActiveEditor, setActiveEditor } from '../editor/active'
import { baseName, isMarkdown, resolveLink } from '../lib/parse'
import { noteContents, useStore } from '../store'

function attachmentMarkdown(attachment: ImportedAttachment): string {
  if (attachment.kind === 'image' || attachment.kind === 'audio' || attachment.kind === 'video') {
    return `![[${attachment.path}]]`
  }
  return `[${attachment.name}](<${attachment.path.replaceAll('>', '%3E')}>)`
}

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
        onDropFiles: async (paths) => {
          const store = useStore.getState()
          if (!store.vault) return ''
          const imported = await window.forge.importAttachments(store.vault, path, paths)
          if (imported.length === 0) return ''
          await store.refreshVault()
          return imported.map(attachmentMarkdown).join('\n\n')
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
