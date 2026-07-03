import {
  Check,
  Copy,
  File,
  FolderOpen,
  Image,
  Images,
  Music,
  Plus,
  SearchX,
  Trash2,
  Video
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ImportedAttachmentKind, VaultFileStat } from '../../../shared/types'
import { baseName, isAudio, isImage, isMarkdown, isVideo } from '../lib/parse'
import { useStore } from '../store'

type MediaKindFilter = 'all' | ImportedAttachmentKind
type MediaSort = 'type' | 'newest' | 'name' | 'size'

interface MediaItem {
  path: string
  name: string
  kind: ImportedAttachmentKind
  size: number
  modified: string
}

const TYPE_FILTERS: { id: MediaKindFilter; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'All media', icon: <Images size={15} /> },
  { id: 'image', label: 'Images', icon: <Image size={15} /> },
  { id: 'audio', label: 'Audio', icon: <Music size={15} /> },
  { id: 'video', label: 'Video', icon: <Video size={15} /> },
  { id: 'file', label: 'Files', icon: <File size={15} /> }
]

const KIND_ORDER: Record<ImportedAttachmentKind, number> = {
  image: 0,
  audio: 1,
  video: 2,
  file: 3
}

function mediaKind(path: string): ImportedAttachmentKind | null {
  if (isImage(path)) return 'image'
  if (isAudio(path)) return 'audio'
  if (isVideo(path)) return 'video'
  if (!isMarkdown(path)) return 'file'
  return null
}

function mediaMarkdown(item: Pick<MediaItem, 'kind' | 'path' | 'name'>): string {
  if (item.kind === 'image' || item.kind === 'audio' || item.kind === 'video') return `![[${item.path}]]`
  return `[${item.name}](<${item.path.replaceAll('>', '%3E')}>)`
}

function galleryMarkdown(items: MediaItem[]): string {
  return ['```forge-gallery', ...items.map((item) => `![[${item.path}]]`), '```'].join('\n')
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function cleanNoteTitle(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Media Gallery'
}

export default function MediaVault(): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const vault = useStore((s) => s.vault)
  const files = useStore((s) => s.files)
  const fileStats = useStore((s) => s.fileStats)
  const refreshVault = useStore((s) => s.refreshVault)
  const trashPath = useStore((s) => s.trashPath)
  const openFile = useStore((s) => s.openFile)
  const [filter, setFilter] = useState<MediaKindFilter>('all')
  const [sort, setSort] = useState<MediaSort>('type')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dragActive, setDragActive] = useState(false)
  const [status, setStatus] = useState<{ tone: 'neutral' | 'success' | 'danger'; text: string }>({
    tone: 'neutral',
    text: ''
  })

  const mediaItems = useMemo<MediaItem[]>(() => {
    return files
      .map((path) => {
        const kind = mediaKind(path)
        if (!kind) return null
        const stat: VaultFileStat | undefined = fileStats[path]
        return {
          path,
          name: path.split('/').pop() ?? path,
          kind,
          size: stat?.size ?? 0,
          modified: stat?.modified ?? ''
        }
      })
      .filter((item): item is MediaItem => Boolean(item))
  }, [fileStats, files])

  const visibleItems = useMemo(() => {
    const filtered = filter === 'all' ? mediaItems : mediaItems.filter((item) => item.kind === filter)
    return [...filtered].sort((a, b) => {
      if (sort === 'newest') return new Date(b.modified).getTime() - new Date(a.modified).getTime()
      if (sort === 'size') return b.size - a.size || a.name.localeCompare(b.name)
      if (sort === 'name') return a.name.localeCompare(b.name)
      return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name)
    })
  }, [filter, mediaItems, sort])

  const counts = useMemo(() => {
    const next: Record<MediaKindFilter, number> = { all: mediaItems.length, image: 0, audio: 0, video: 0, file: 0 }
    for (const item of mediaItems) next[item.kind] += 1
    return next
  }, [mediaItems])

  const selectedItems = useMemo(
    () => mediaItems.filter((item) => selected.has(item.path)),
    [mediaItems, selected]
  )
  const selectedImages = selectedItems.filter((item) => item.kind === 'image')

  useEffect(() => {
    const existing = new Set(mediaItems.map((item) => item.path))
    setSelected((current) => new Set([...current].filter((path) => existing.has(path))))
  }, [mediaItems])

  const toggleSelected = (path: string): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const copyText = async (text: string, message: string): Promise<void> => {
    try {
      await window.forge.copyText(text)
      setStatus({ tone: 'success', text: message })
    } catch (error) {
      console.error('Copy failed.', error)
      setStatus({ tone: 'danger', text: 'Copy failed.' })
    }
  }

  const copySelected = async (): Promise<void> => {
    if (selectedItems.length === 0) return
    await copyText(selectedItems.map(mediaMarkdown).join('\n\n'), `Copied ${selectedItems.length} embed${selectedItems.length === 1 ? '' : 's'}.`)
  }

  const addMedia = async (fileList: FileList | null): Promise<void> => {
    if (!vault || !fileList?.length) return
    const files = Array.from(fileList)
    const sourcePaths = window.forge.droppedFilePaths(files)
    if (sourcePaths.length === 0) {
      setStatus({ tone: 'danger', text: 'No local file paths were available.' })
      return
    }

    try {
      const imported = await window.forge.importMedia(vault, sourcePaths)
      await refreshVault()
      setSelected(new Set(imported.map((item) => item.path)))
      setStatus({
        tone: imported.length ? 'success' : 'danger',
        text: imported.length ? `Added ${imported.length} media file${imported.length === 1 ? '' : 's'}.` : 'No supported media files were added.'
      })
    } catch (error) {
      console.error('Media import failed.', error)
      setStatus({ tone: 'danger', text: 'Could not add media.' })
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const deleteItems = async (items: MediaItem[]): Promise<void> => {
    if (items.length === 0) return
    const confirmed = window.confirm(
      `Move ${items.length} media file${items.length === 1 ? '' : 's'} to Trash? Notes that embed them will keep their Markdown links.`
    )
    if (!confirmed) return
    for (const item of items) await trashPath(item.path)
    setSelected(new Set())
    setStatus({ tone: 'success', text: `Moved ${items.length} media file${items.length === 1 ? '' : 's'} to Trash.` })
  }

  const deleteSelected = async (): Promise<void> => {
    await deleteItems(selectedItems)
  }

  const createGalleryNote = async (): Promise<void> => {
    if (!vault || selectedImages.length === 0) return
    const title = cleanNoteTitle(window.prompt('Gallery note name', `Gallery ${new Date().toLocaleDateString()}`) ?? '')
    if (!title) return
    const content = [
      '---',
      'type: media-gallery',
      'tags: [media, gallery]',
      '---',
      '',
      `# ${title}`,
      '',
      galleryMarkdown(selectedImages),
      ''
    ].join('\n')
    try {
      await window.forge.createFolder(vault, 'Media Galleries')
      const created = await window.forge.createFile(vault, `Media Galleries/${title}.md`, content)
      await refreshVault()
      openFile(created)
      setStatus({ tone: 'success', text: `Created ${baseName(created)}.` })
    } catch (error) {
      console.error('Gallery note failed.', error)
      setStatus({ tone: 'danger', text: 'Could not create gallery note.' })
    }
  }

  if (!vault) {
    return (
      <div className="media-vault-empty">
        <SearchX size={28} />
        <h2>No vault open</h2>
        <p>Open a vault to browse local media.</p>
      </div>
    )
  }

  return (
    <div
      className={`media-vault${dragActive ? ' drop-active' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragActive(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.target === event.currentTarget) setDragActive(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragActive(false)
        addMedia(event.dataTransfer.files).catch(console.error)
      }}
    >
      <input
        ref={inputRef}
        className="media-file-input"
        type="file"
        multiple
        accept="image/*,audio/*,video/*,.pdf"
        onChange={(event) => addMedia(event.target.files).catch(console.error)}
      />
      <header className="media-vault-header">
        <div>
          <div className="media-vault-kicker">Media vault</div>
          <h1>All local media</h1>
          <p>{mediaItems.length} files from this vault, including images, audio, video, and documents.</p>
        </div>
        <div className="media-vault-actions">
          <button className="btn btn-compact" onClick={() => inputRef.current?.click()}>
            <Plus size={14} />
            Add media
          </button>
          <button className="btn btn-compact" disabled={selectedItems.length === 0} onClick={() => copySelected()}>
            <Copy size={14} />
            Copy embed
          </button>
          <button className="btn btn-compact" disabled={selectedImages.length === 0} onClick={() => copyText(galleryMarkdown(selectedImages), 'Copied gallery embed.')}>
            <Images size={14} />
            Copy gallery
          </button>
          <button className="btn btn-compact" disabled={selectedImages.length === 0} onClick={() => createGalleryNote()}>
            <Image size={14} />
            Gallery note
          </button>
          <button className="btn btn-compact danger" disabled={selectedItems.length === 0} onClick={() => deleteSelected()}>
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </header>

      <section className="media-vault-controls">
        <div className="media-type-segmented" aria-label="Media type">
          {TYPE_FILTERS.map((option) => (
            <button
              key={option.id}
              className={`media-type-btn${filter === option.id ? ' active' : ''}`}
              title={option.label}
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
            >
              {option.icon}
              <span>{counts[option.id]}</span>
            </button>
          ))}
        </div>
        <label className="media-sort-control">
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as MediaSort)}>
            <option value="type">Type</option>
            <option value="newest">Newest</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>
        </label>
        <button className="btn btn-compact" disabled={selectedItems.length !== 1} onClick={() => selectedItems[0] && window.forge.reveal(vault, selectedItems[0].path)}>
          <FolderOpen size={14} />
          Reveal
        </button>
        <button className="btn btn-compact" disabled={selectedItems.length === 0} onClick={() => setSelected(new Set())}>
          Clear
        </button>
      </section>

      {status.text && (
        <div className={`media-status ${status.tone}`} aria-live="polite">
          {status.tone === 'success' && <Check size={14} />}
          <span>{status.text}</span>
        </div>
      )}

      {visibleItems.length > 0 ? (
        <div className="media-grid">
          {visibleItems.map((item) => {
            const selectedItem = selected.has(item.path)
            return (
              <div
                key={item.path}
                className={`media-card ${item.kind}${selectedItem ? ' selected' : ''}`}
                title={item.path}
                onClick={() => toggleSelected(item.path)}
                onDoubleClick={() => window.forge.reveal(vault, item.path)}
              >
                <div className="media-card-preview">
                  {item.kind === 'image' ? (
                    <img src={window.forge.assetUrl(vault, item.path)} alt={item.name} loading="lazy" />
                  ) : item.kind === 'audio' ? (
                    <Music size={30} />
                  ) : item.kind === 'video' ? (
                    <Video size={30} />
                  ) : (
                    <File size={30} />
                  )}
                  {selectedItem && (
                    <span className="media-selected-badge" aria-hidden="true">
                      <Check size={13} />
                    </span>
                  )}
                </div>
                <div className="media-card-body">
                  <strong>{item.name}</strong>
                  <span>{item.path}</span>
                </div>
                <div className="media-card-meta">
                  <span>{item.kind}</span>
                  <span>{formatBytes(item.size)}</span>
                  <span>{formatDate(item.modified)}</span>
                </div>
                <div className="media-card-actions">
                  <button
                    className="icon-btn"
                    title="Copy embed"
                    onClick={(event) => {
                      event.stopPropagation()
                      copyText(mediaMarkdown(item), 'Copied embed.').catch(console.error)
                    }}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Reveal in Finder"
                    onClick={(event) => {
                      event.stopPropagation()
                      window.forge.reveal(vault, item.path)
                    }}
                  >
                    <FolderOpen size={14} />
                  </button>
                  <button
                    className="icon-btn danger"
                    title="Delete media"
                    onClick={(event) => {
                      event.stopPropagation()
                      deleteItems([item]).catch(console.error)
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="media-vault-empty">
          <SearchX size={28} />
          <h2>No media found</h2>
          <p>{filter === 'all' ? 'Add image, audio, video, or PDF files to this vault.' : `No ${filter} files match this filter.`}</p>
          <button className="btn btn-compact" onClick={() => inputRef.current?.click()}>
            <Plus size={14} />
            Add media
          </button>
        </div>
      )}
    </div>
  )
}
