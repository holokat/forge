import { FilePlus2, LayoutTemplate, Search, Sparkles, Tags } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { baseName, isMarkdown } from '../lib/parse'
import { parseTemplateVariables, type TemplateVariable } from '../lib/templates'
import { STARTER_TEMPLATE_CATALOG, STARTER_TEMPLATE_KINDS, useStore } from '../store'
import { ModalOverlay } from './CommandPalette'

function templateFolderPrefix(folder: string): string {
  return folder.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
}

function templateName(path: string, templatesFolder: string): string {
  const prefix = templateFolderPrefix(templatesFolder)
  const rel = prefix && path.startsWith(prefix + '/') ? path.slice(prefix.length + 1) : path
  return rel.replace(/\.md$/i, '')
}

type TemplateCategory = 'all' | 'agent' | 'product' | 'content' | 'capture' | 'publishing'

const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'agent', label: 'Agent' },
  { id: 'product', label: 'Product' },
  { id: 'content', label: 'Content' },
  { id: 'capture', label: 'Capture' },
  { id: 'publishing', label: 'Publishing' }
]

function templateCategory(path: string, templatesFolder: string): TemplateCategory {
  const name = templateName(path, templatesFolder).toLowerCase()
  if (/agent|task|brief/.test(name)) return 'agent'
  if (/product|spec|bug|decision|project/.test(name)) return 'product'
  if (/seo|content|research/.test(name)) return 'content'
  if (/daily|meeting|person|inbox|capture/.test(name)) return 'capture'
  if (/publish|release|changelog/.test(name)) return 'publishing'
  return 'content'
}

function templateCategoryLabel(path: string, templatesFolder: string): string {
  return TEMPLATE_CATEGORIES.find((category) => category.id === templateCategory(path, templatesFolder))?.label ?? 'Template'
}

export default function TemplatePicker(): React.JSX.Element {
  const vault = useStore((s) => s.vault)
  const files = useStore((s) => s.files)
  const folders = useStore((s) => s.folders)
  const templatesFolder = useStore((s) => s.templatesFolder)
  const createNoteFromTemplate = useStore((s) => s.createNoteFromTemplate)
  const createStarterTemplate = useStore((s) => s.createStarterTemplate)
  const setModal = useStore((s) => s.setModal)
  const [query, setQuery] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [category, setCategory] = useState<TemplateCategory>('all')
  const [title, setTitle] = useState('')
  const [folder, setFolder] = useState('')
  const [templateFields, setTemplateFields] = useState<TemplateVariable[]>([])
  const [templateFieldCounts, setTemplateFieldCounts] = useState<Record<string, number>>({})
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [isCreating, setIsCreating] = useState(false)

  const templateFiles = useMemo(() => {
    const prefix = templateFolderPrefix(templatesFolder)
    return files
      .filter(isMarkdown)
      .filter((file) => !prefix || file === `${prefix}.md` || file.startsWith(prefix + '/'))
      .sort((a, b) => templateName(a, templatesFolder).localeCompare(templateName(b, templatesFolder)))
  }, [files, templatesFolder])

  const filteredTemplates = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return templateFiles.filter((file) => {
      if (category !== 'all' && templateCategory(file, templatesFolder) !== category) return false
      if (!needle) return true
      return `${templateName(file, templatesFolder)} ${file}`.toLowerCase().includes(needle)
    })
  }, [category, query, templateFiles, templatesFolder])

  useEffect(() => {
    if (!selectedTemplate || !templateFiles.includes(selectedTemplate)) {
      setSelectedTemplate(templateFiles[0] ?? '')
    }
  }, [selectedTemplate, templateFiles])

  useEffect(() => {
    if (!selectedTemplate || !filteredTemplates.includes(selectedTemplate)) {
      const nextTemplate = filteredTemplates[0] ?? templateFiles[0] ?? ''
      if (selectedTemplate !== nextTemplate) setSelectedTemplate(nextTemplate)
    }
  }, [filteredTemplates, selectedTemplate, templateFiles])

  useEffect(() => {
    let cancelled = false
    setTemplateFieldCounts({})

    if (!vault || templateFiles.length === 0) return

    Promise.all(
      templateFiles.map(async (template) => {
        try {
          const content = await window.forge.readFile(vault, template)
          return [template, parseTemplateVariables(content).length] as const
        } catch {
          return [template, 0] as const
        }
      })
    ).then((entries) => {
      if (!cancelled) setTemplateFieldCounts(Object.fromEntries(entries))
    })

    return () => {
      cancelled = true
    }
  }, [templateFiles, vault])

  useEffect(() => {
    let cancelled = false
    setTemplateFields([])
    setVariables({})

    if (!vault || !selectedTemplate) return

    window.forge
      .readFile(vault, selectedTemplate)
      .then((content) => {
        if (cancelled) return
        const fields = parseTemplateVariables(content)
        setTemplateFields(fields)
        setVariables(
          Object.fromEntries(fields.map((field) => [field.id, field.kind === 'select' ? field.options[0] ?? '' : '']))
        )
      })
      .catch((error) => {
        if (!cancelled) console.error('Template preview failed.', error)
      })

    return () => {
      cancelled = true
    }
  }, [selectedTemplate, vault])

  const selectedLabel = selectedTemplate ? templateName(selectedTemplate, templatesFolder) : ''

  const create = async (): Promise<void> => {
    if (!selectedTemplate || isCreating) return
    setIsCreating(true)
    try {
      await createNoteFromTemplate(selectedTemplate, {
        title: title.trim() || baseName(selectedTemplate),
        folder,
        variables
      })
      setModal(null)
    } catch (error) {
      console.error('Create from template failed.', error)
    } finally {
      setIsCreating(false)
    }
  }

  const seedStarterTemplates = async (): Promise<void> => {
    setIsCreating(true)
    try {
      for (const kind of STARTER_TEMPLATE_KINDS) {
        await createStarterTemplate(kind)
      }
    } catch (error) {
      console.error('Starter template creation failed.', error)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <ModalOverlay>
      <div className="template-modal-panel">
        <div className="template-modal-header">
          <div className="template-modal-icon">
            <LayoutTemplate size={17} />
          </div>
          <div>
            <h2>New from template</h2>
            <p>{templateFiles.length} templates in {templatesFolder || 'Templates'}</p>
          </div>
        </div>

        {templateFiles.length > 0 ? (
          <div className="template-modal-grid">
            <div className="template-list-pane">
              <div className="template-search">
                <Search size={14} />
                <input
                  value={query}
                  autoFocus
                  placeholder="Find template"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="template-category-filter" aria-label="Template categories">
                {TEMPLATE_CATEGORIES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={category === item.id ? 'active' : ''}
                    aria-pressed={category === item.id}
                    onClick={() => setCategory(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="template-list">
                {filteredTemplates.map((template) => (
                  <button
                    key={template}
                    className={`template-gallery-card${template === selectedTemplate ? ' selected' : ''}`}
                    onClick={() => setSelectedTemplate(template)}
                  >
                    <span className="template-gallery-card-title">
                      <LayoutTemplate size={14} />
                      <span>{templateName(template, templatesFolder)}</span>
                    </span>
                    <span className="template-gallery-card-meta">
                      <span>
                        <Tags size={11} />
                        {templateCategoryLabel(template, templatesFolder)}
                      </span>
                      <span>{templateFieldCounts[template] ?? 0} fields</span>
                    </span>
                    <small>{template}</small>
                  </button>
                ))}
                {filteredTemplates.length === 0 && <div className="template-empty">No matching templates</div>}
              </div>
            </div>

            <div className="template-create-pane">
              <div className="template-create-summary">
                <span>
                  <Sparkles size={14} />
                  {selectedLabel || 'Template'}
                </span>
                <small>{templateFields.length} fields</small>
              </div>
              <label className="template-field">
                <span>Title</span>
                <input
                  value={title}
                  placeholder={selectedLabel || 'Untitled'}
                  onChange={(event) => setTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') create().catch(console.error)
                  }}
                />
              </label>
              <label className="template-field">
                <span>Folder</span>
                <input
                  value={folder}
                  list="forge-template-folders"
                  placeholder="Vault root"
                  onChange={(event) => setFolder(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') create().catch(console.error)
                  }}
                />
                <datalist id="forge-template-folders">
                  {folders.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </label>
              {templateFields.length > 0 && (
                <div className="template-variable-fields">
                  <div className="template-variable-heading">
                    <span>Template fields</span>
                    <small>{templateFields.length}</small>
                  </div>
                  {templateFields.map((field) => (
                    <label className="template-field" key={field.id}>
                      <span>{field.label}</span>
                      {field.kind === 'select' ? (
                        <select
                          value={variables[field.id] ?? field.options[0] ?? ''}
                          onChange={(event) => setVariables((current) => ({ ...current, [field.id]: event.target.value }))}
                        >
                          {field.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={variables[field.id] ?? ''}
                          placeholder={field.label}
                          onChange={(event) => setVariables((current) => ({ ...current, [field.id]: event.target.value }))}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') create().catch(console.error)
                          }}
                        />
                      )}
                    </label>
                  ))}
                </div>
              )}
              <button className="btn btn-primary template-create-btn" disabled={!selectedTemplate || isCreating} onClick={() => create()}>
                <FilePlus2 size={14} />
                {isCreating ? 'Creating' : 'Create note'}
              </button>
            </div>
          </div>
        ) : (
          <div className="template-empty-state">
            <LayoutTemplate size={22} />
            <h3>No templates yet</h3>
            <p>Create starter templates for planning, research, product, SEO, agent tasks, releases, and publishing.</p>
            <div className="template-empty-starters">
              {STARTER_TEMPLATE_CATALOG.slice(0, 8).map((template) => (
                <button
                  key={template.kind}
                  type="button"
                  className="template-empty-starter"
                  disabled={isCreating}
                  onClick={() => createStarterTemplate(template.kind).catch(console.error)}
                >
                  <strong>{template.label}</strong>
                  <span>{template.detail}</span>
                </button>
              ))}
            </div>
            <button className="btn btn-primary" disabled={isCreating} onClick={() => seedStarterTemplates()}>
              <FilePlus2 size={14} />
              {isCreating ? 'Creating' : 'Create starter templates'}
            </button>
          </div>
        )}
      </div>
    </ModalOverlay>
  )
}
