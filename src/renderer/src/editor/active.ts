import type { EditorView } from '@codemirror/view'

let activeView: EditorView | null = null

export const setActiveEditor = (view: EditorView | null): void => {
  activeView = view
}

export const getActiveEditor = (): EditorView | null => activeView
