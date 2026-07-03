import { FilePlus2, LayoutTemplate, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { baseName, isMarkdown } from '../lib/parse'
import { useStore } from '../store'
import { ModalOverlay } from './CommandPalette'

function templateFolderPrefix(folder: string): string {
  return folder.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
}

function templateName(path: string, templatesFolder: string): string {
  const prefix = templateFolderPrefix(templatesFolder)
  const rel = prefix && path.startsWith(prefix + '/') ? path.slice(prefix.length + 1) : path
  return rel.replace(/\.md$/i, '')
}

export default function TemplatePicker(): React.JSX.Element {
  const files = useStore((s) => s.files)
  const folders = useStore((s) => s.folders)
  const templatesFolder = useStore((s) => s.templatesFolder)
  const createNoteFromTemplate = useStore((s) => s.createNoteFromTemplate)
  const createStarterTemplate = useStore((s) => s.createStarterTemplate)
  const setModal = useStore((s) => s.setModal)
  const [query, setQuery] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [title, setTitle] = useState('')
  const [folder, setFolder] = useState('')
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
    if (!needle) return templateFiles
    return templateFiles.filter((file) => templateName(file, templatesFolder).toLowerCase().includes(needle))
  }, [query, templateFiles, templatesFolder])

  useEffect(() => {
    if (!selectedTemplate || !templateFiles.includes(selectedTemplate)) {
      setSelectedTemplate(templateFiles[0] ?? '')
    }
  }, [selectedTemplate, templateFiles])

  const selectedLabel = selectedTemplate ? templateName(selectedTemplate, templatesFolder) : ''

  const create = async (): Promise<void> => {
    if (!selectedTemplate || isCreating) return
    setIsCreating(true)
    try {
      await createNoteFromTemplate(selectedTemplate, {
        title: title.trim() || baseName(selectedTemplate),
        folder
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
      for (const kind of ['daily', 'meeting', 'project', 'person', 'research'] as const) {
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
              <div className="template-list">
                {filteredTemplates.map((template) => (
                  <button
                    key={template}
                    className={`template-list-item${template === selectedTemplate ? ' selected' : ''}`}
                    onClick={() => setSelectedTemplate(template)}
                  >
                    <span>{templateName(template, templatesFolder)}</span>
                    <small>{template}</small>
                  </button>
                ))}
                {filteredTemplates.length === 0 && <div className="template-empty">No matching templates</div>}
              </div>
            </div>

            <div className="template-create-pane">
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
            <p>Create starter templates for daily notes, meetings, projects, people, and research.</p>
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
