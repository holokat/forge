export type TemplateVariableKind = 'prompt' | 'select'

export interface TemplateVariable {
  id: string
  kind: TemplateVariableKind
  label: string
  options: string[]
}

export interface TemplateRenderContext {
  title: string
  vaultName: string
  templateName: string
  folder?: string
  variables?: Record<string, string>
  now?: Date
}

const SIMPLE_TOKEN_RE = /\{\{\s*(title|date|time|datetime|vault|template|folder)\s*\}\}/gi
const PROMPT_TOKEN_RE = /\{\{\s*prompt:([^}]+?)\s*\}\}/gi
const SELECT_TOKEN_RE = /\{\{\s*select:([^|}]+?)\|([^}]+?)\s*\}\}/gi
const CUSTOM_TOKEN_RE = /\{\{\s*([A-Za-z][A-Za-z0-9 _-]*)\s*\}\}/g
const VARIABLE_TOKEN_RE = /\{\{\s*(?:(prompt):([^}]+?)|(select):([^|}]+?)\|([^}]+?)|([A-Za-z][A-Za-z0-9 _-]*))\s*\}\}/gi
const BUILT_IN_VARIABLES = new Set(['title', 'date', 'time', 'datetime', 'vault', 'template', 'folder'])

export function templateVariableId(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function cleanLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function parseOptions(value: string): string[] {
  return value
    .split(/[|,]/)
    .map((option) => cleanLabel(option))
    .filter(Boolean)
}

function variableValue(label: string, variables: Record<string, string> | undefined, fallback = ''): string {
  if (!variables) return fallback
  const cleaned = cleanLabel(label)
  const normalized = templateVariableId(cleaned)
  return variables[cleaned] ?? variables[normalized] ?? fallback
}

export function parseTemplateVariables(template: string): TemplateVariable[] {
  const fields = new Map<string, TemplateVariable>()

  for (const match of template.matchAll(VARIABLE_TOKEN_RE)) {
    const directive = (match[1] ?? match[3] ?? '').toLowerCase()
    const kind = directive === 'select' ? 'select' : 'prompt'
    const label = cleanLabel(match[2] ?? match[4] ?? match[6] ?? '')
    if (!label || BUILT_IN_VARIABLES.has(label.toLowerCase())) continue
    const options = kind === 'select' ? parseOptions(match[5] ?? '') : []
    if (kind === 'select' && options.length === 0) continue
    const id = templateVariableId(label)
    if (!fields.has(id)) fields.set(id, { id, kind, label, options })
  }

  return Array.from(fields.values())
}

export function formatTemplateDateParts(date: Date): { date: string; time: string; datetime: string } {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const dateValue = `${yyyy}-${mm}-${dd}`
  const time = `${hh}:${min}`
  return { date: dateValue, time, datetime: `${dateValue} ${time}` }
}

export function renderTemplate(template: string, context: TemplateRenderContext): string {
  const parts = formatTemplateDateParts(context.now ?? new Date())
  const values: Record<string, string> = {
    title: context.title,
    date: parts.date,
    time: parts.time,
    datetime: parts.datetime,
    vault: context.vaultName,
    template: context.templateName,
    folder: context.folder ?? ''
  }

  return template
    .replace(SIMPLE_TOKEN_RE, (_match, key: string) => values[key.toLowerCase()] ?? '')
    .replace(PROMPT_TOKEN_RE, (_match, label: string) => variableValue(label, context.variables, ''))
    .replace(SELECT_TOKEN_RE, (_match, label: string, rawOptions: string) => {
      const fallback = parseOptions(rawOptions)[0] ?? ''
      return variableValue(label, context.variables, fallback)
    })
    .replace(CUSTOM_TOKEN_RE, (match, label: string) => variableValue(label, context.variables, match))
}
