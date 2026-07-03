import { useEffect, useMemo, useRef, useState } from 'react'
import { getActiveEditor } from '../editor/active'
import { createExtensionRuntime } from '../extensions/runtime'
import { fuzzyFilter } from '../lib/fuzzy'
import { baseName, isMarkdown } from '../lib/parse'
import { parseTemplateVariables, renderTemplate, type TemplateVariable } from '../lib/templates'
import { activeTab, useStore } from '../store'

interface Command {
  name: string
  hint?: string
  action: () => void
}

function cleanNoteTitle(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
}

function parentFolder(path: string): string {
  return path.includes('/') ? path.split('/').slice(0, -1).join('/') : ''
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
  if (Number.isInteger(index) && index >= 1 && index <= templates.length) {
    return templates[index - 1]
  }

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
      if (Number.isInteger(index) && index >= 1 && index <= field.options.length) {
        value = field.options[index - 1]
      }
    }

    variables[field.id] = value
    variables[field.label] = value
  }

  return variables
}

function defaultExtractTitle(markdown: string): string {
  const firstLine =
    markdown
      .split('\n')
      .map((line) => line.replace(/^#{1,6}\s+/, '').replace(/^[-*+]\s+/, '').trim())
      .find(Boolean) ?? 'Extracted Note'
  return cleanNoteTitle(firstLine.slice(0, 64)) || 'Extracted Note'
}

async function extractSelectionToNote(sourcePath: string): Promise<void> {
  const store = useStore.getState()
  const view = getActiveEditor()
  if (!store.vault || !view) return

  const selection = view.state.selection.main
  if (selection.empty) {
    window.alert('Select text in the editor before extracting a note.')
    return
  }

  const selectedText = view.state.doc.sliceString(selection.from, selection.to).trim()
  if (!selectedText) {
    window.alert('Select text in the editor before extracting a note.')
    return
  }

  const suggestedTitle = defaultExtractTitle(selectedText)
  const requestedTitle = window.prompt('New note title', suggestedTitle)
  if (requestedTitle === null) return

  const title = cleanNoteTitle(requestedTitle) || suggestedTitle
  const folder = parentFolder(sourcePath)
  const requestedPath = `${folder ? folder + '/' : ''}${title}.md`
  const content = selectedText.startsWith('#') ? `${selectedText}\n` : `# ${title}\n\n${selectedText}\n`
  const created = await window.forge.createFile(store.vault, requestedPath, content)
  const link = `[[${baseName(created)}]]`

  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: link },
    selection: { anchor: selection.from + link.length }
  })
  view.focus()

  await store.refreshVault()
  store.openFile(created, { newTab: true })
}

async function insertTemplateAtCursor(sourcePath: string): Promise<void> {
  const store = useStore.getState()
  const view = getActiveEditor()
  if (!store.vault || !view) {
    window.alert('Open a note before inserting a template.')
    return
  }

  const templates = templateFiles(store.files, store.templatesFolder)
  const templatePath = promptTemplatePath(templates, store.templatesFolder)
  if (!templatePath) return

  const template = await window.forge.readFile(store.vault, templatePath)
  const selection = view.state.selection.main
  const selectedText = view.state.doc.sliceString(selection.from, selection.to)
  const fields = parseTemplateVariables(template)
  const variables = promptTemplateVariables(fields, {
    selection: selectedText,
    selected_text: selectedText
  })
  if (!variables) return

  const content = renderTemplate(template, {
    title: baseName(sourcePath),
    vaultName: store.vaultName,
    templateName: baseName(templatePath),
    folder: parentFolder(sourcePath),
    variables
  })

  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: content },
    selection: { anchor: selection.from + content.length }
  })
  view.focus()
}

function selectedMarkdown(): { from: number; to: number; text: string } | null {
  const view = getActiveEditor()
  if (!view) return null
  const selection = view.state.selection.main
  if (selection.empty) return null
  return {
    from: selection.from,
    to: selection.to,
    text: view.state.doc.sliceString(selection.from, selection.to)
  }
}

function normalizeHeadingSpacing(): void {
  const view = getActiveEditor()
  const selection = selectedMarkdown()
  if (!view || !selection) {
    window.alert('Select Markdown before running this transform.')
    return
  }
  const next = selection.text.replace(/^(#{1,6})\s*(.*?)\s*$/gm, (_match, hashes: string, text: string) => {
    return text ? `${hashes} ${text}` : hashes
  })
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: next },
    selection: { anchor: selection.from, head: selection.from + next.length }
  })
  view.focus()
}

function wrapSelection(): void {
  const view = getActiveEditor()
  const selection = selectedMarkdown()
  if (!view || !selection) {
    window.alert('Select Markdown before running this transform.')
    return
  }
  const wrapper = window.prompt('Wrap selection with', '**')
  if (wrapper === null) return
  const marker = wrapper || '**'
  const next = `${marker}${selection.text}${marker}`
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: next },
    selection: { anchor: selection.from + marker.length, head: selection.from + marker.length + selection.text.length }
  })
  view.focus()
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
    const runtime = createExtensionRuntime(store.extensionSettings)
    const close = (fn: () => void) => () => {
      store.setModal(null)
      fn()
    }
    const list: Command[] = [
      { name: 'New note', hint: '⌘N', action: close(() => store.createNote()) },
      { name: 'New note from template', action: () => store.setModal('template') },
      { name: "Open today's daily note", action: close(() => store.createDailyNote()) },
      { name: 'Open quick switcher', hint: '⌘O', action: () => store.setModal('switcher') },
      { name: 'Open graph view', hint: '⌘⇧G', action: close(() => store.openGraph()) },
      { name: 'Open board', hint: '⌘⇧B', action: close(() => store.openBoard()) },
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
      const editor = getActiveEditor()
      const hasSelection = Boolean(editor && !editor.state.selection.main.empty)
      const transforms = new Set(runtime.markdownTransforms.map((transform) => transform.transform))
      if (hasSelection) {
        list.push({ name: 'Extract selection to new note', action: close(() => extractSelectionToNote(path).catch(console.error)) })
        if (transforms.has('normalize-headings')) {
          list.push({ name: 'Markdown: Normalize heading spacing', action: close(() => normalizeHeadingSpacing()) })
        }
        if (transforms.has('wrap-selection')) {
          list.push({ name: 'Markdown: Wrap selection', action: close(() => wrapSelection()) })
        }
      }
      list.push(
        { name: 'Insert template at cursor', action: close(() => insertTemplateAtCursor(path).catch(console.error)) },
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
