import {
  CheckCircle2,
  PackageCheck,
  PackagePlus,
  Puzzle,
  Search,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  X
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ExtensionInstallPreference } from '../../../shared/types'
import type { ExtensionManifest } from '../extensions/manifest'
import { extensionEntry } from '../extensions/preferences'
import { LOCAL_EXTENSION_MANIFESTS, LOCAL_EXTENSION_POINTS, searchLocalExtensions } from '../extensions/registry'
import { useStore } from '../store'

type ExtensionFilter = 'all' | 'installed' | 'available'

interface ExtensionMarketplaceProps {
  className?: string
}

const FILTERS: { id: ExtensionFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'installed', label: 'Installed' },
  { id: 'available', label: 'Available' }
]

function statusLabel(entry: ExtensionInstallPreference): string {
  if (!entry.installed) return 'Available'
  return entry.enabled ? 'Enabled' : 'Disabled'
}

function statusClass(entry: ExtensionInstallPreference): string {
  if (!entry.installed) return 'available'
  return entry.enabled ? 'enabled' : 'disabled'
}

function extensionMatchesFilter(entry: ExtensionInstallPreference, filter: ExtensionFilter): boolean {
  if (filter === 'installed') return entry.installed
  if (filter === 'available') return !entry.installed
  return true
}

function ExtensionCard({
  manifest,
  entry,
  onInstallToggle,
  onEnableToggle
}: {
  manifest: ExtensionManifest
  entry: ExtensionInstallPreference
  onInstallToggle: () => void
  onEnableToggle: () => void
}): React.JSX.Element {
  const permissions = manifest.permissions.map((permission) => permission.kind).join(', ')
  const extensionPoints = manifest.extensionPoints.map((point) => point.label).join(', ')

  return (
    <article className={`extension-card ${statusClass(entry)}`}>
      <div className="extension-card-icon" aria-hidden="true">
        <Puzzle size={18} />
      </div>

      <div className="extension-card-main">
        <div className="extension-card-header">
          <div className="extension-card-title-block">
            <h3>{manifest.displayName}</h3>
            <div className="extension-card-meta">
              <span>{manifest.publisher}</span>
              <span>v{manifest.version}</span>
              <span>{manifest.license}</span>
            </div>
          </div>
          <span className={`extension-status ${statusClass(entry)}`}>{statusLabel(entry)}</span>
        </div>

        <p className="extension-card-desc">{manifest.description}</p>

        <div className="extension-card-tags" aria-label="Extension categories">
          {manifest.categories.map((category) => (
            <span key={category}>{category}</span>
          ))}
        </div>

        <div className="extension-card-details">
          <div title={extensionPoints}>
            <CheckCircle2 size={13} />
            <span>{extensionPoints}</span>
          </div>
          <div title={permissions || 'No elevated permissions'}>
            <ShieldCheck size={13} />
            <span>{permissions || 'No elevated permissions'}</span>
          </div>
        </div>
      </div>

      <div className="extension-card-actions">
        {entry.installed && (
          <button
            className={`extension-enable-toggle ${entry.enabled ? 'enabled' : 'disabled'}`}
            type="button"
            aria-pressed={entry.enabled}
            onClick={onEnableToggle}
            title={entry.enabled ? 'Disable extension' : 'Enable extension'}
          >
            {entry.enabled ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
            <span>{entry.enabled ? 'Enabled' : 'Disabled'}</span>
          </button>
        )}
        <button
          className={`extension-install-btn ${entry.installed ? 'installed' : 'available'}`}
          type="button"
          aria-pressed={entry.installed}
          onClick={onInstallToggle}
        >
          {entry.installed ? <PackageCheck size={15} /> : <PackagePlus size={15} />}
          <span>{entry.installed ? 'Remove' : 'Install'}</span>
        </button>
      </div>
    </article>
  )
}

export default function ExtensionMarketplace({ className = '' }: ExtensionMarketplaceProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ExtensionFilter>('all')
  const extensionSettings = useStore((state) => state.extensionSettings)
  const setExtensionInstalled = useStore((state) => state.setExtensionInstalled)
  const setExtensionEnabled = useStore((state) => state.setExtensionEnabled)

  const visibleExtensions = useMemo(() => {
    return searchLocalExtensions(query, LOCAL_EXTENSION_MANIFESTS).filter((manifest) =>
      extensionMatchesFilter(extensionEntry(extensionSettings, manifest.id), filter)
    )
  }, [extensionSettings, filter, query])

  const installedCount = useMemo(() => {
    return LOCAL_EXTENSION_MANIFESTS.filter((manifest) => extensionEntry(extensionSettings, manifest.id).installed).length
  }, [extensionSettings])

  const rootClassName = ['extension-marketplace', className].filter(Boolean).join(' ')

  return (
    <section className={rootClassName} aria-label="Extensions">
      <header className="extension-marketplace-header">
        <div>
          <div className="extension-eyebrow">
            <Puzzle size={14} />
            <span>Local registry</span>
          </div>
          <h2>Extensions</h2>
        </div>
        <div className="extension-marketplace-counts">
          <span>
            <strong>{installedCount}</strong> installed
          </span>
          <span>
            <strong>{LOCAL_EXTENSION_POINTS.length}</strong> points
          </span>
        </div>
      </header>

      <div className="extension-marketplace-toolbar">
        <div className="extension-search">
          <Search size={15} className="extension-search-icon" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search local extensions"
            aria-label="Search local extensions"
          />
          {query && (
            <button type="button" className="extension-search-clear" onClick={() => setQuery('')} title="Clear search">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="extension-filter" aria-label="Filter extensions">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={filter === item.id ? 'active' : ''}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="extension-list" aria-live="polite">
        {visibleExtensions.length ? (
          visibleExtensions.map((manifest) => {
            const entry = extensionEntry(extensionSettings, manifest.id)
            return (
              <ExtensionCard
                key={manifest.id}
                manifest={manifest}
                entry={entry}
                onInstallToggle={() => setExtensionInstalled(manifest.id, !entry.installed)}
                onEnableToggle={() => setExtensionEnabled(manifest.id, !entry.enabled)}
              />
            )
          })
        ) : (
          <div className="extension-empty">
            <Puzzle size={18} />
            <span>No local extensions match.</span>
          </div>
        )}
      </div>
    </section>
  )
}
