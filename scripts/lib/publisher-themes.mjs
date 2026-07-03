export const PUBLISH_THEMES = [
  'minimal',
  'editorial',
  'reference',
  'quiet-paper',
  'terminal-ledger',
  'swiss-ledger',
  'soft-focus',
  'field-notes'
]

export const BLOG_THEMES = new Set(['quiet-paper', 'terminal-ledger', 'swiss-ledger', 'soft-focus', 'field-notes'])

export function normalizeTheme(value) {
  return PUBLISH_THEMES.includes(value) ? value : 'minimal'
}
