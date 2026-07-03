import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { indentOnInput, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { searchKeymap } from '@codemirror/search'
import { EditorState, type Extension } from '@codemirror/state'
import {
  Decoration,
  dropCursor,
  EditorView,
  keymap,
  MatchDecorator,
  placeholder,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { linkTarget } from '../lib/parse'

export interface EditorCallbacks {
  onChange(content: string): void
  onNavigate(target: string): void
  onDropFiles(paths: string[]): Promise<string>
  getLinkTargets(): { label: string; detail?: string }[]
}

// ---------- typography ----------

const mdHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.6em', fontWeight: '700', lineHeight: '1.3' },
  { tag: t.heading2, fontSize: '1.35em', fontWeight: '700', lineHeight: '1.3' },
  { tag: t.heading3, fontSize: '1.17em', fontWeight: '650', lineHeight: '1.3' },
  { tag: t.heading4, fontSize: '1.05em', fontWeight: '650' },
  { tag: t.heading5, fontWeight: '650' },
  { tag: t.heading6, fontWeight: '650', color: 'var(--text-muted)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--text-muted)' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.url, color: 'var(--text-faint)' },
  { tag: t.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.875em', color: 'var(--syn-code)' },
  { tag: t.quote, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: t.processingInstruction, color: 'var(--text-faint)' },
  { tag: t.contentSeparator, color: 'var(--text-faint)' },
  { tag: t.meta, color: 'var(--text-faint)' },
  { tag: t.escape, color: 'var(--syn-keyword)' },
  // fenced code
  { tag: t.keyword, color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--syn-string)' },
  { tag: t.comment, color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.number, t.bool, t.atom], color: 'var(--syn-number)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--syn-function)' },
  { tag: [t.className, t.typeName], color: 'var(--syn-type)' },
  { tag: t.propertyName, color: 'var(--syn-property)' },
  { tag: t.operator, color: 'var(--text-muted)' }
])

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--editor-font-size)',
    backgroundColor: 'transparent',
    color: 'var(--text-normal)'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-text)',
    fontVariantLigatures: 'none',
    fontKerning: 'none',
    lineHeight: '1.65',
    letterSpacing: '0',
    padding: '0 48px'
  },
  '.cm-content': {
    maxWidth: 'var(--editor-line-width)',
    margin: '0 auto',
    padding: '8px 0 45vh',
    position: 'relative',
    textRendering: 'geometricPrecision',
    caretColor: 'var(--accent)'
  },
  '.cm-line': {
    padding: '1px 0',
    fontVariantLigatures: 'none',
    fontKerning: 'none'
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '1px' },
  '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    background: 'var(--selection) !important'
  },
  '.cm-placeholder': {
    color: 'var(--text-faint)',
    pointerEvents: 'none',
    userSelect: 'none'
  }
})

// ---------- wikilinks & tags ----------

const wikilinkDecorator = new MatchDecorator({
  regexp: /\[\[([^[\]]+?)\]\]/g,
  decoration: (match) =>
    Decoration.mark({
      class: 'cm-wikilink',
      attributes: { 'data-target': linkTarget(match[1]), title: '⌘ Click to open' }
    })
})

const tagDecorator = new MatchDecorator({
  regexp: /(^|[\s([])(#[A-Za-z][\w/-]*)/g,
  decorate: (add, from, _to, match) => {
    const start = from + match[1].length
    add(start, start + match[2].length, Decoration.mark({ class: 'cm-hashtag' }))
  }
})

function decoratorPlugin(decorator: MatchDecorator): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view)
      }
      update(update: ViewUpdate) {
        this.decorations = decorator.updateDeco(update, this.decorations)
      }
    },
    { decorations: (v) => v.decorations }
  )
}

function wikilinkClick(onNavigate: (target: string) => void): Extension {
  return EditorView.domEventHandlers({
    mousedown(event) {
      const el = (event.target as HTMLElement).closest?.('.cm-wikilink')
      if (el && (event.metaKey || event.ctrlKey)) {
        const target = el.getAttribute('data-target')
        if (target) {
          event.preventDefault()
          onNavigate(target)
          return true
        }
      }
      return false
    }
  })
}

function droppedFilePaths(event: DragEvent): string[] {
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (files.length === 0) return []

  const pathsFromPreload = window.forge.droppedFilePaths(files)
  const fallbackPaths = files
    .map((file) => (file as File & { path?: string }).path ?? '')
    .filter(Boolean)
  return [...new Set([...pathsFromPreload, ...fallbackPaths])]
}

function insertionBlock(doc: string, pos: number, body: string): string {
  const before = doc.slice(0, pos)
  const after = doc.slice(pos)
  const prefix = before.length === 0 || /\n\n$/.test(before) ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const suffix = after.length === 0 || /^\n\n/.test(after) ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  return `${prefix}${body.trim()}${suffix}`
}

function fileDropHandler(onDropFiles: EditorCallbacks['onDropFiles']): Extension {
  return EditorView.domEventHandlers({
    drop(event, view) {
      const paths = droppedFilePaths(event)
      if (paths.length === 0) return false

      event.preventDefault()
      event.stopPropagation()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'

      const requestedPos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.from

      onDropFiles(paths)
        .then((markdown) => {
          if (!markdown.trim()) return
          const pos = Math.min(requestedPos, view.state.doc.length)
          const insert = insertionBlock(view.state.doc.toString(), pos, markdown)
          view.dispatch({
            changes: { from: pos, insert },
            selection: { anchor: pos + insert.length },
            scrollIntoView: true
          })
          view.focus()
        })
        .catch((error) => console.error('Attachment import failed.', error))

      return true
    }
  })
}

// ---------- [[ autocomplete ----------

function wikiCompletionSource(getLinkTargets: EditorCallbacks['getLinkTargets']) {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/\[\[[^[\]]*$/)
    if (!match) return null
    return {
      from: match.from + 2,
      options: getLinkTargets().map((target) => ({
        label: target.label,
        detail: target.detail,
        type: 'wikilink',
        apply: target.label + ']]'
      })),
      validFor: /^[^[\]]*$/
    }
  }
}

// ---------- assembly ----------

export function createEditorState(content: string, callbacks: EditorCallbacks): EditorState {
  return EditorState.create({
    doc: content,
    extensions: [
      history(),
      dropCursor(),
      indentOnInput(),
      EditorView.lineWrapping,
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(mdHighlight),
      editorTheme,
      placeholder('Start writing…'),
      decoratorPlugin(wikilinkDecorator),
      decoratorPlugin(tagDecorator),
      wikilinkClick(callbacks.onNavigate),
      fileDropHandler(callbacks.onDropFiles),
      autocompletion({ override: [wikiCompletionSource(callbacks.getLinkTargets)], icons: false }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) callbacks.onChange(update.state.doc.toString())
      })
    ]
  })
}

export function scrollToLine(view: EditorView, line: number): void {
  const docLine = view.state.doc.line(Math.min(line + 1, view.state.doc.lines))
  view.dispatch({
    selection: { anchor: docLine.from },
    effects: EditorView.scrollIntoView(docLine.from, { y: 'start', yMargin: 24 })
  })
  view.focus()
}
