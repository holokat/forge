import { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import type { ImportedAttachment } from '../../../shared/types'
import { createEditorState, scrollToLine, type SlashCommandId } from '../editor/extensions'
import { getActiveEditor, setActiveEditor } from '../editor/active'
import { filePayloads } from '../lib/filePayloads'
import { baseName, isMarkdown, resolveLink } from '../lib/parse'
import { parseTemplateVariables, renderTemplate, type TemplateVariable } from '../lib/templates'
import { noteContents, useStore } from '../store'

function attachmentMarkdown(attachment: ImportedAttachment): string {
  if (attachment.kind === 'image' || attachment.kind === 'audio' || attachment.kind === 'video') {
    return `![[${attachment.path}]]`
  }
  return `[${attachment.name}](<${attachment.path.replaceAll('>', '%3E')}>)`
}

function templateFolderPrefix(folder: string): string {
  return folder.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
}

function templateName(path: string, templatesFolder: string): string {
  const prefix = templateFolderPrefix(templatesFolder)
  const rel = prefix && path.startsWith(prefix + '/') ? path.slice(prefix.length + 1) : path
  return rel.replace(/\.md$/i, '')
}

function templateFiles(files: string[], templatesFolder: string): string[] {
  const prefix = templateFolderPrefix(templatesFolder)
  return files
    .filter(isMarkdown)
    .filter((file) => !prefix || file === `${prefix}.md` || file.startsWith(prefix + '/'))
    .sort((a, b) => templateName(a, templatesFolder).localeCompare(templateName(b, templatesFolder)))
}

function promptTemplatePath(templates: string[], templatesFolder: string): string | null {
  if (templates.length === 0) {
    window.alert(`No templates found in ${templatesFolder || 'Templates'}.`)
    return null
  }

  const options = templates.map((template, index) => `${index + 1}. ${templateName(template, templatesFolder)}`).join('\n')
  const answer = window.prompt(`Insert which template?\n\n${options}`, '1')
  if (answer === null) return null

  const value = answer.trim()
  const index = Number.parseInt(value, 10)
  if (Number.isInteger(index) && index >= 1 && index <= templates.length) return templates[index - 1]

  const normalized = value.toLowerCase()
  const match = templates.find((template) => {
    return templateName(template, templatesFolder).toLowerCase() === normalized || template.toLowerCase() === normalized
  })
  if (!match) window.alert('No matching template.')
  return match ?? null
}

function promptTemplateVariables(
  fields: TemplateVariable[],
  defaults: Record<string, string> = {}
): Record<string, string> | null {
  const variables: Record<string, string> = { ...defaults }

  for (const field of fields) {
    const fallback = defaults[field.id] ?? defaults[field.label] ?? (field.kind === 'select' ? field.options[0] ?? '' : '')
    const label =
      field.kind === 'select'
        ? `${field.label}\n\n${field.options.map((option, index) => `${index + 1}. ${option}`).join('\n')}`
        : field.label
    const answer = window.prompt(label, fallback)
    if (answer === null) return null

    let value = answer.trim()
    if (field.kind === 'select') {
      const index = Number.parseInt(value, 10)
      if (Number.isInteger(index) && index >= 1 && index <= field.options.length) value = field.options[index - 1]
    }

    variables[field.id] = value
    variables[field.label] = value
  }

  return variables
}

function parentFolder(path: string): string {
  return path.includes('/') ? path.split('/').slice(0, -1).join('/') : ''
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function pickFiles(accept: string, multiple = true): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    let settled = false
    const finish = (files: File[] | null): void => {
      if (settled) return
      settled = true
      input.remove()
      resolve(files)
    }
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    input.addEventListener(
      'change',
      () => {
        const files = Array.from(input.files ?? [])
        finish(files.length ? files : null)
      },
      { once: true }
    )
    input.addEventListener('cancel', () => finish(null), { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

function replaceSlashCommand(view: EditorView, from: number, to: number, insert: string, cursorOffset = insert.length): void {
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + cursorOffset },
    scrollIntoView: true
  })
  view.focus()
}

function removeSlashCommandLine(view: EditorView, from: number, to: number): void {
  const line = view.state.doc.lineAt(from)
  const lineText = view.state.doc.sliceString(line.from, line.to)
  if (/^\s*\/[\w-]*\s*$/.test(lineText)) {
    const removeTo = line.to < view.state.doc.length ? line.to + 1 : line.to
    view.dispatch({ changes: { from: line.from, to: removeTo, insert: '' } })
    return
  }
  view.dispatch({ changes: { from, to, insert: '' } })
}

function galleryMarkdown(items: ImportedAttachment[]): string {
  return ['```forge-gallery', ...items.filter((item) => item.kind === 'image').map((item) => `![[${item.path}]]`), '```'].join('\n')
}

export default function Editor({ path }: { path: string }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function importPickedMedia(files: File[], gallery = false): Promise<string> {
      const store = useStore.getState()
      if (!store.vault) return ''
      const sourcePaths = window.forge.droppedFilePaths(files)
      const imported =
        sourcePaths.length === files.length
          ? await window.forge.importAttachments(store.vault, path, sourcePaths)
          : await window.forge.importAttachmentFiles(store.vault, path, await filePayloads(files))
      if (imported.length === 0) return ''
      await store.refreshVault()
      return gallery ? galleryMarkdown(imported) : imported.map(attachmentMarkdown).join('\n\n')
    }

    async function insertTemplate(view: EditorView, from: number, to: number): Promise<void> {
      const store = useStore.getState()
      if (!store.vault) return
      const templates = templateFiles(store.files, store.templatesFolder)
      const templatePath = promptTemplatePath(templates, store.templatesFolder)
      if (!templatePath) return

      const template = await window.forge.readFile(store.vault, templatePath)
      const fields = parseTemplateVariables(template)
      const variables = promptTemplateVariables(fields)
      if (!variables) return

      const content = renderTemplate(template, {
        title: baseName(path),
        vaultName: store.vaultName,
        templateName: baseName(templatePath),
        folder: parentFolder(path),
        variables
      })
      replaceSlashCommand(view, from, to, content)
    }

    async function insertMedia(view: EditorView, from: number, to: number): Promise<void> {
      const files = await pickFiles('image/*,audio/*,video/*,application/pdf')
      if (!files) return
      const markdown = await importPickedMedia(files)
      if (markdown) replaceSlashCommand(view, from, to, markdown)
    }

    async function insertGallery(view: EditorView, from: number, to: number): Promise<void> {
      const files = await pickFiles('image/*')
      if (!files) return
      const markdown = await importPickedMedia(files, true)
      if (markdown.trim() !== '```forge-gallery\n```') replaceSlashCommand(view, from, to, markdown)
    }

    async function runAICommand(view: EditorView, from: number, to: number): Promise<void> {
      const store = useStore.getState()
      const prompt = window.prompt('Ask AI to do what with this note?', 'Improve clarity and formatting without changing meaning.')
      if (!prompt?.trim()) return
      const provider = store.aiSettings.defaultProvider
      const model =
        provider === 'codex' ? store.aiSettings.codexModel : provider === 'openai' ? store.aiSettings.openaiModel : store.aiSettings.anthropicModel
      const result = await window.forge.runAITextTask({
        provider,
        prompt,
        model,
        vault: store.vault,
        documentPath: path,
        documentContent: view.state.doc.toString()
      })
      replaceSlashCommand(view, from, to, result.output)
    }

    function insertPublishMetadata(view: EditorView, from: number, to: number): void {
      const doc = view.state.doc.toString()
      const metadata = ['publish: true', `title: "${baseName(path).replaceAll('"', '\\"')}"`, 'description: ""', `date: ${todayStamp()}`]
      if (doc.startsWith('---\n')) {
        const close = doc.indexOf('\n---', 4)
        if (close > -1) {
          const frontmatter = doc.slice(4, close)
          const missing = metadata.filter((line) => {
            const key = line.split(':')[0]
            return !new RegExp(`^${key}:`, 'm').test(frontmatter)
          })
          removeSlashCommandLine(view, from, to)
          if (missing.length) {
            const insertAt = 4
            view.dispatch({ changes: { from: insertAt, insert: `${missing.join('\n')}\n` } })
          }
          view.focus()
          return
        }
      }
      replaceSlashCommand(view, from, to, `---\n${metadata.join('\n')}\n---\n\n`)
    }

    function onSlashCommand(command: SlashCommandId, view: EditorView, from: number, to: number): void {
      if (command === 'template') {
        insertTemplate(view, from, to).catch(console.error)
      } else if (command === 'image') {
        insertMedia(view, from, to).catch(console.error)
      } else if (command === 'gallery') {
        insertGallery(view, from, to).catch(console.error)
      } else if (command === 'callout') {
        const type = (window.prompt('Callout type', 'note') ?? '').trim() || 'note'
        const title = (window.prompt('Callout title', type[0].toUpperCase() + type.slice(1)) ?? '').trim()
        const body = `> [!${type}]${title ? ` ${title}` : ''}\n> Write here`
        replaceSlashCommand(view, from, to, body, body.length - 'Write here'.length)
      } else if (command === 'table') {
        const body = '| Column | Column |\n| --- | --- |\n|  |  |'
        replaceSlashCommand(view, from, to, body, body.lastIndexOf('|  |') + 2)
      } else if (command === 'today') {
        replaceSlashCommand(view, from, to, todayStamp())
      } else if (command === 'ai') {
        runAICommand(view, from, to).catch((error) => window.alert(error instanceof Error ? error.message : String(error)))
      } else if (command === 'publish') {
        insertPublishMetadata(view, from, to)
      }
    }

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
        onDropFiles: async (paths, files) => {
          const store = useStore.getState()
          if (!store.vault) return ''
          const imported =
            paths.length > 0
              ? await window.forge.importAttachments(store.vault, path, paths)
              : await window.forge.importAttachmentFiles(store.vault, path, await filePayloads(files))
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
        },
        onSlashCommand
      }),
      parent: host.current!
    })
    setActiveEditor(view)
    const lineNumber = useStore.getState().consumePendingEditorNavigation(path)
    if (lineNumber !== null) scrollToLine(view, lineNumber)
    else view.focus()
    return () => {
      if (getActiveEditor() === view) setActiveEditor(null)
      view.destroy()
    }
  }, [path])

  return <div className="editor-host" ref={host} />
}
