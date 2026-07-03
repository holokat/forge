import {
  AlertCircle,
  Bot,
  Check,
  Clipboard,
  Code2,
  Download,
  FileText,
  Globe2,
  Monitor,
  Moon,
  Palette,
  Plug,
  RefreshCw,
  Smartphone,
  SquarePen,
  Sun,
  Terminal,
  Vault as VaultIcon,
  X
} from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'
import type { AgentAccessInfo, MobilePairingInfo, ThemeMode, UpdateStatus } from '../../../shared/types'
import { useStore } from '../store'
import ExtensionMarketplace from './ExtensionMarketplace'

const THEMES: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'light', label: 'Light', icon: <Sun size={15} /> },
  { mode: 'dark', label: 'Dark', icon: <Moon size={15} /> },
  { mode: 'system', label: 'System', icon: <Monitor size={15} /> }
]

type SettingsTabId =
  | 'appearance'
  | 'editor'
  | 'notes'
  | 'vault'
  | 'publishing'
  | 'forgeBuddy'
  | 'agents'
  | 'extensions'
  | 'updates'

type SettingsNavGroup = 'Workspace' | 'Connections' | 'System'

interface SettingsNavItem {
  id: SettingsTabId
  label: string
  description: string
  group: SettingsNavGroup
  icon: React.ReactNode
  disabled?: boolean
}

function ThemePreview({ mode }: { mode: ThemeMode }): React.JSX.Element {
  if (mode === 'system') {
    return (
      <div className="theme-preview split">
        <div className="theme-preview-half light" />
        <div className="theme-preview-half dark" />
      </div>
    )
  }
  return (
    <div className={`theme-preview ${mode}`}>
      <div className="theme-preview-bar" />
      <div className="theme-preview-line w60" />
      <div className="theme-preview-line w80" />
      <div className="theme-preview-line w40 accent" />
    </div>
  )
}

function copyViaSelection(value: string): void {
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.readOnly = true
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Copy command was rejected')
}

async function writeClipboardText(value: string): Promise<void> {
  const forge = window.forge as typeof window.forge & { copyText?: (text: string) => Promise<void> }

  if (typeof forge.copyText === 'function') {
    try {
      await forge.copyText(value)
      return
    } catch (error) {
      console.warn('Electron clipboard copy failed, trying renderer fallback.', error)
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch (error) {
      console.warn('Navigator clipboard copy failed, trying selection fallback.', error)
    }
  }

  copyViaSelection(value)
}

function CopyButton({
  value,
  label = 'Copy',
  disabled = false
}: {
  value: string
  label?: string
  disabled?: boolean
}): React.JSX.Element {
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle')

  const copy = async (): Promise<void> => {
    if (disabled) return
    setState('copying')
    try {
      await writeClipboardText(value)
      setState('copied')
      window.setTimeout(() => setState('idle'), 1600)
    } catch (error) {
      console.error('Copy failed.', error)
      setState('failed')
      window.setTimeout(() => setState('idle'), 2200)
    }
  }

  const icon =
    state === 'copied' ? <Check size={14} /> : state === 'failed' ? <AlertCircle size={14} /> : <Clipboard size={14} />
  const text = state === 'copying' ? 'Copying' : state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label

  return (
    <button
      className={`btn btn-compact copy-btn ${state}`}
      disabled={disabled || state === 'copying'}
      aria-live="polite"
      onClick={() => copy()}
    >
      {icon}
      {text}
    </button>
  )
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_/@%+=:,.-]+$/.test(value)) return value
  return `'${value.replaceAll("'", "'\\''")}'`
}

function commandLine(command: string, args: string[] = []): string {
  return [command, ...args].map(shellQuote).join(' ')
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function codexConfig(info: AgentAccessInfo, vault: string): string {
  const lines = [
    '[mcp_servers.forge]',
    `command = ${tomlString(info.mcp.command)}`,
    info.mcp.args.length ? `args = [${info.mcp.args.map(tomlString).join(', ')}]` : '',
    '',
    '[mcp_servers.forge.env]',
    `FORGE_VAULT = ${tomlString(vault)}`
  ].filter(Boolean)
  return lines.join('\n')
}

function claudeDesktopConfig(info: AgentAccessInfo, vault: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        forge: {
          command: info.mcp.command,
          ...(info.mcp.args.length ? { args: info.mcp.args } : {}),
          env: { FORGE_VAULT: vault }
        }
      }
    },
    null,
    2
  )
}

function defaultPublishDir(vault: string): string {
  return `${vault.replace(/\/+$/, '')}/.forge/publish`
}

async function createPairingQr(pairingUrl: string | undefined): Promise<string> {
  if (!pairingUrl) return ''
  return QRCode.toDataURL(pairingUrl, {
    width: 184,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#1d1d21',
      light: '#ffffff'
    }
  })
}

function pairingErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'
  if (/No handler registered|not a function|getMobilePairingInfo|setMobileVault/i.test(message)) {
    return 'Restart Forge so the desktop pairing service is loaded.'
  }
  return `Could not start mobile pairing: ${message}`
}

function MobileRecorderCard({ vault }: { vault: string }): React.JSX.Element {
  const [pairing, setPairing] = useState<MobilePairingInfo | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [qrError, setQrError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isResetting, setIsResetting] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadPairing = async (): Promise<void> => {
      setIsLoading(true)
      try {
        setQrError('')
        await window.forge.setMobileVault(vault)
        const info = await window.forge.getMobilePairingInfo()
        if (!cancelled) {
          setPairing(info)
        }

        try {
          const qr = await createPairingQr(info.pairingUrl)
          if (!cancelled) setQrDataUrl(qr)
        } catch (error) {
          console.error('Mobile pairing QR failed.', error)
          if (!cancelled) {
            setQrDataUrl('')
            setQrError('QR failed. Copy the pairing link instead.')
          }
        }
      } catch (error) {
        console.error('Mobile pairing failed.', error)
        if (!cancelled) {
          setPairing({ available: false, reason: pairingErrorMessage(error) })
          setQrDataUrl('')
          setQrError('')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadPairing()
    return () => {
      cancelled = true
    }
  }, [vault])

  const resetPairing = async (): Promise<void> => {
    setIsResetting(true)
    try {
      setQrError('')
      await window.forge.setMobileVault(vault)
      const info = await window.forge.resetMobilePairingToken()
      setPairing(info)
      try {
        setQrDataUrl(await createPairingQr(info.pairingUrl))
      } catch (error) {
        console.error('Mobile pairing QR failed.', error)
        setQrDataUrl('')
        setQrError('QR failed. Copy the pairing link instead.')
      }
    } catch (error) {
      console.error('Mobile pairing reset failed.', error)
      setPairing({ available: false, reason: pairingErrorMessage(error) })
      setQrDataUrl('')
      setQrError('')
    } finally {
      setIsResetting(false)
    }
  }

  const pairingUrl = pairing?.pairingUrl ?? ''

  return (
    <div className="mobile-pairing-card">
      <div className="mobile-pairing-qr" aria-busy={isLoading}>
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="Forge Buddy pairing QR code" />
        ) : (
          <div className="mobile-pairing-qr-empty">{isLoading ? 'Loading' : pairing?.available ? 'Copy link' : 'Unavailable'}</div>
        )}
      </div>

      <div className="mobile-pairing-details">
        <div className="mobile-pairing-title">
          <Smartphone size={15} />
          <span>Forge Buddy for iPhone</span>
        </div>
        <div className="settings-row-desc">
          Scan this once from Forge Buddy. Folders, recordings, and transcripts sync directly into this vault.
        </div>
        {qrError && <div className="settings-row-desc">{qrError}</div>}

        {pairing?.available ? (
          <div className="mobile-pairing-meta">
            <div>
              <span>Desktop</span>
              <strong>{pairing.desktopName}</strong>
            </div>
            <div>
              <span>Vault</span>
              <strong>{pairing.vaultName}</strong>
            </div>
            <div>
              <span>Address</span>
              <strong>{pairing.baseUrl}</strong>
            </div>
            <div>
              <span>Anywhere</span>
              {pairing.hasTailscale ? (
                <strong title={pairing.altUrls?.join(', ')}>On — via Tailscale</strong>
              ) : (
                <strong title="Install Tailscale on this Mac and your iPhone, then re-pair. The recorder will reach this Mac from anywhere, privately.">
                  Wi-Fi only — add Tailscale
                </strong>
              )}
            </div>
          </div>
        ) : (
          <div className="settings-row-desc">{pairing?.reason ?? 'Open a vault before pairing.'}</div>
        )}

        <div className="mobile-pairing-actions">
          <CopyButton value={pairingUrl} label="Copy link" disabled={!pairing?.available} />
          <button
            className="btn btn-compact"
            disabled={!pairing?.available || isResetting}
            onClick={() => resetPairing()}
          >
            <RefreshCw size={14} />
            {isResetting ? 'Resetting' : 'Reset pairing'}
          </button>
        </div>
      </div>
    </div>
  )
}

function updateLabel(status: UpdateStatus | null): string {
  if (!status) return 'Loading update status'
  if (status.state === 'checking') return 'Checking for updates'
  if (status.state === 'available') return status.message || `Forge ${status.version} is available`
  if (status.state === 'downloading') return status.message || 'Downloading update'
  if (status.state === 'downloaded') return status.message || `Forge ${status.version} is ready`
  if (status.state === 'not-available') return status.message || 'Forge is up to date'
  if (status.state === 'disabled') return status.message || 'Updates are available in packaged builds'
  if (status.state === 'error') return status.message || 'Could not check for updates'
  return `Current version ${status.currentVersion}`
}

function UpdateCard(): React.JSX.Element {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.forge.getUpdateStatus().then((next) => {
      if (!cancelled) setStatus(next)
    }).catch((error) => {
      console.error('Update status failed.', error)
    })
    const unsubscribe = window.forge.onUpdateStatus((next) => setStatus(next))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const isBusy = status?.state === 'checking' || status?.state === 'available' || status?.state === 'downloading'
  const canInstall = Boolean(status?.canInstall && status.state === 'downloaded')
  const progress = Math.round(status?.progress ?? 0)

  const check = async (): Promise<void> => {
    try {
      setStatus(await window.forge.checkForUpdates())
    } catch (error) {
      console.error('Update check failed.', error)
    }
  }

  const install = async (): Promise<void> => {
    setIsInstalling(true)
    try {
      await window.forge.installUpdate()
    } catch (error) {
      console.error('Update install failed.', error)
      setIsInstalling(false)
    }
  }

  return (
    <div className="settings-callout update-card">
      <div className="update-card-header">
        <div>
          <div className="settings-row-label">Forge updates</div>
          <div className="settings-row-desc">Current version {status?.currentVersion ?? '...'}</div>
        </div>
        <div className={`update-badge ${status?.state ?? 'idle'}`}>{status?.state === 'downloaded' ? 'Ready' : status?.state === 'not-available' ? 'Current' : status?.state === 'error' ? 'Error' : 'Update'}</div>
      </div>

      <div className={`update-status ${status?.state ?? 'idle'}`}>
        {status?.state === 'error' ? <AlertCircle size={14} /> : status?.state === 'downloaded' ? <Check size={14} /> : <RefreshCw size={14} />}
        <span>{updateLabel(status)}</span>
      </div>

      {(status?.state === 'downloading' || status?.state === 'downloaded') && (
        <div className="update-progress" aria-label={`Download progress ${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
      )}

      {status?.releaseNotes && (
        <div className="update-release-notes">
          <div className="update-release-title">{status.releaseName || `Forge ${status.version}`}</div>
          <div>{status.releaseNotes}</div>
        </div>
      )}

      <div className="static-publish-actions">
        {canInstall ? (
          <button className="btn btn-primary" disabled={isInstalling} onClick={() => install()}>
            <Download size={14} />
            {isInstalling ? 'Installing' : 'Restart and install'}
          </button>
        ) : (
          <button className="btn" disabled={isBusy} onClick={() => check()}>
            <RefreshCw size={14} />
            {isBusy ? 'Checking' : 'Check for updates'}
          </button>
        )}
      </div>
    </div>
  )
}

export default function SettingsModal(): React.JSX.Element {
  const theme = useStore((s) => s.theme)
  const fontSize = useStore((s) => s.fontSize)
  const lineWidth = useStore((s) => s.lineWidth)
  const vault = useStore((s) => s.vault)
  const setTheme = useStore((s) => s.setTheme)
  const setFontSize = useStore((s) => s.setFontSize)
  const setLineWidth = useStore((s) => s.setLineWidth)
  const templatesFolder = useStore((s) => s.templatesFolder)
  const dailyNotesFolder = useStore((s) => s.dailyNotesFolder)
  const setTemplatesFolder = useStore((s) => s.setTemplatesFolder)
  const setDailyNotesFolder = useStore((s) => s.setDailyNotesFolder)
  const setModal = useStore((s) => s.setModal)
  const openVaultDialog = useStore((s) => s.openVaultDialog)
  const [activeTab, setActiveTab] = useState<SettingsTabId>('appearance')
  const [agentAccess, setAgentAccess] = useState<AgentAccessInfo | null>(null)
  const [publishState, setPublishState] = useState<{
    status: 'idle' | 'publishing' | 'done' | 'failed'
    message: string
    outDir: string
  }>({ status: 'idle', message: '', outDir: '' })

  useEffect(() => {
    let cancelled = false
    window.forge
      .getAgentAccessInfo()
      .then((info) => {
        if (!cancelled) setAgentAccess(info)
      })
      .catch((error) => {
        console.error('Agent access info failed.', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const settingsTabs = useMemo<SettingsNavItem[]>(
    () => [
      {
        id: 'appearance',
        label: 'Appearance',
        description: 'Theme and interface color.',
        group: 'Workspace',
        icon: <Palette size={15} />
      },
      {
        id: 'editor',
        label: 'Editor',
        description: 'Reading width and text scale.',
        group: 'Workspace',
        icon: <SquarePen size={15} />
      },
      {
        id: 'notes',
        label: 'Notes',
        description: 'Daily note and template folders.',
        group: 'Workspace',
        icon: <FileText size={15} />
      },
      {
        id: 'vault',
        label: 'Vault',
        description: 'Current local Markdown folder.',
        group: 'Workspace',
        icon: <VaultIcon size={15} />,
        disabled: !vault
      },
      {
        id: 'publishing',
        label: 'Publishing',
        description: 'Static site export.',
        group: 'Connections',
        icon: <Globe2 size={15} />,
        disabled: !vault
      },
      {
        id: 'forgeBuddy',
        label: 'Forge Buddy',
        description: 'Mobile recorder pairing.',
        group: 'Connections',
        icon: <Smartphone size={15} />,
        disabled: !vault
      },
      {
        id: 'agents',
        label: 'Agents',
        description: 'CLI and MCP access.',
        group: 'Connections',
        icon: <Bot size={15} />,
        disabled: !vault
      },
      {
        id: 'extensions',
        label: 'Extensions',
        description: 'Installed Forge add-ons.',
        group: 'System',
        icon: <Plug size={15} />
      },
      {
        id: 'updates',
        label: 'Updates',
        description: 'Release checks and installs.',
        group: 'System',
        icon: <Download size={15} />
      }
    ],
    [vault]
  )

  useEffect(() => {
    const current = settingsTabs.find((tab) => tab.id === activeTab)
    if (!current || current.disabled) {
      setActiveTab(settingsTabs.find((tab) => !tab.disabled)?.id ?? 'appearance')
    }
  }, [activeTab, settingsTabs])

  const agentBrief = useMemo(
    () =>
      vault
        ? [
            `Use this Forge vault: ${vault}`,
            '',
            'Treat it as a plain Markdown knowledge base. You may create folders and .md notes, update existing notes, retrieve files, search, organize, and analyze links or tags.',
            'Prefer the Forge MCP server or Forge CLI when available. Keep paths relative to the vault, preserve existing content unless asked, and use wikilinks like [[Note Name]] for connections.'
          ].join('\n')
        : '',
    [vault]
  )
  const cliCommand = vault && agentAccess ? commandLine(agentAccess.cli.command, [...agentAccess.cli.args, '--vault', vault, 'analyze', '--json']) : ''
  const mcpCommand = agentAccess ? commandLine(agentAccess.mcp.command, agentAccess.mcp.args) : ''
  const codexToml = vault && agentAccess ? codexConfig(agentAccess, vault) : ''
  const codexAddCommand =
    vault && agentAccess
      ? commandLine('codex', ['mcp', 'add', 'forge', '--env', `FORGE_VAULT=${vault}`, '--', agentAccess.mcp.command, ...agentAccess.mcp.args])
      : ''
  const claudeJson = vault && agentAccess ? claudeDesktopConfig(agentAccess, vault) : ''
  const claudeCodeCommand =
    vault && agentAccess
      ? commandLine('claude', [
          'mcp',
          'add',
          '--env',
          `FORGE_VAULT=${vault}`,
          '--transport',
          'stdio',
          'forge',
          '--',
          agentAccess.mcp.command,
          ...agentAccess.mcp.args
        ])
      : ''
  const publishDir = vault ? defaultPublishDir(vault) : ''
  const activeSettingsTab = settingsTabs.find((tab) => tab.id === activeTab) ?? settingsTabs[0]
  const groupedTabs = settingsTabs.reduce<Record<SettingsNavGroup, SettingsNavItem[]>>(
    (groups, tab) => {
      groups[tab.group].push(tab)
      return groups
    },
    { Workspace: [], Connections: [], System: [] }
  )

  const publishStaticSite = async (): Promise<void> => {
    if (!vault || !publishDir) return
    setPublishState({ status: 'publishing', message: 'Publishing site...', outDir: publishDir })
    try {
      const result = await window.forge.publishVault(vault, publishDir)
      setPublishState({
        status: 'done',
        message: `Published ${result.notes} notes and ${result.files} files.`,
        outDir: result.outDir
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setPublishState({ status: 'failed', message, outDir: publishDir })
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}>
      <div className="settings-panel">
        <div className="settings-header">
          <div>
            <h2>Settings</h2>
            <div className="settings-header-subtitle">{vault ? vault.split('/').pop() : 'No vault open'}</div>
          </div>
          <button className="icon-btn" onClick={() => setModal(null)}>
            <X size={16} />
          </button>
        </div>

        <div className="settings-shell">
          <nav className="settings-nav" aria-label="Settings sections">
            {(Object.keys(groupedTabs) as SettingsNavGroup[]).map((group) => (
              <div className="settings-nav-group" key={group}>
                <div className="settings-nav-title">{group}</div>
                {groupedTabs[group].map((tab) => (
                  <button
                    key={tab.id}
                    className={`settings-nav-btn${activeTab === tab.id ? ' active' : ''}`}
                    type="button"
                    disabled={tab.disabled}
                    aria-label={tab.label}
                    aria-current={activeTab === tab.id ? 'page' : undefined}
                    title={tab.disabled ? 'Open a vault to use this section' : tab.label}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span className="settings-nav-icon">{tab.icon}</span>
                    <span className="settings-nav-copy">
                      <span>{tab.label}</span>
                      <small>{tab.disabled ? 'Open a vault' : tab.description}</small>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <main className="settings-content">
            <div className="settings-content-header">
              <div className="settings-content-icon">{activeSettingsTab?.icon}</div>
              <div>
                <h3>{activeSettingsTab?.label}</h3>
                <p>{activeSettingsTab?.description}</p>
              </div>
            </div>

            <div className="settings-pane">
              {activeTab === 'appearance' && (
                <section className="settings-section">
                  <div className="theme-cards">
                    {THEMES.map(({ mode, label, icon }) => (
                      <button
                        key={mode}
                        className={`theme-card${theme === mode ? ' active' : ''}`}
                        onClick={() => setTheme(mode)}
                      >
                        <ThemePreview mode={mode} />
                        <span className="theme-card-label">
                          {icon}
                          {label}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {activeTab === 'editor' && (
                <section className="settings-section">
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-label">Font size</div>
                      <div className="settings-row-desc">Base size for editor and reading view</div>
                    </div>
                    <div className="settings-row-control">
                      <input
                        type="range"
                        min={13}
                        max={22}
                        value={fontSize}
                        onChange={(e) => setFontSize(Number(e.target.value))}
                      />
                      <span className="settings-value">{fontSize}px</span>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-label">Line width</div>
                      <div className="settings-row-desc">Maximum width of note content</div>
                    </div>
                    <div className="settings-row-control">
                      <input
                        type="range"
                        min={560}
                        max={960}
                        step={20}
                        value={lineWidth}
                        onChange={(e) => setLineWidth(Number(e.target.value))}
                      />
                      <span className="settings-value">{lineWidth}px</span>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'notes' && (
                <section className="settings-section">
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-label">Daily notes folder</div>
                      <div className="settings-row-desc">Where Forge creates date-based notes</div>
                    </div>
                    <div className="settings-row-control">
                      <input
                        className="settings-text-input"
                        value={dailyNotesFolder}
                        onChange={(event) => setDailyNotesFolder(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-label">Templates folder</div>
                      <div className="settings-row-desc">Use Templates/Daily.md for daily note content</div>
                    </div>
                    <div className="settings-row-control">
                      <input
                        className="settings-text-input"
                        value={templatesFolder}
                        onChange={(event) => setTemplatesFolder(event.target.value)}
                      />
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'vault' && vault && (
                <section className="settings-section">
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-label">{vault.split('/').pop()}</div>
                      <div className="settings-row-desc">{vault}</div>
                    </div>
                    <div className="settings-row-control">
                      <button
                        className="btn"
                        onClick={() => {
                          setModal(null)
                          openVaultDialog()
                        }}
                      >
                        Switch vault…
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'publishing' && vault && (
                <section className="settings-section">
                  <div className="settings-callout static-publish-card">
                    <div>
                      <div className="settings-row-label">Static site export</div>
                      <div className="settings-row-desc">
                        Generate local HTML from Markdown, wikilinks, tags, backlinks, and vault assets.
                      </div>
                    </div>
                    <div className="settings-code-row">
                      <code>{publishDir}</code>
                      <CopyButton value={publishDir} label="Copy path" />
                    </div>
                    <div className="static-publish-actions">
                      <button className="btn" disabled={publishState.status === 'publishing'} onClick={() => publishStaticSite()}>
                        {publishState.status === 'publishing' ? <RefreshCw size={14} /> : <Code2 size={14} />}
                        {publishState.status === 'publishing' ? 'Publishing' : 'Publish site'}
                      </button>
                      <button
                        className="btn btn-compact"
                        disabled={publishState.status !== 'done'}
                        onClick={() => window.forge.reveal(vault, '.forge/publish/index.html')}
                      >
                        Reveal output
                      </button>
                    </div>
                    {publishState.message && (
                      <div className={`static-publish-status ${publishState.status}`}>
                        {publishState.status === 'done' ? (
                          <Check size={14} />
                        ) : publishState.status === 'failed' ? (
                          <AlertCircle size={14} />
                        ) : (
                          <RefreshCw size={14} />
                        )}
                        <span>{publishState.message}</span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {activeTab === 'updates' && (
                <section className="settings-section">
                  <UpdateCard />
                </section>
              )}

              {activeTab === 'forgeBuddy' && vault && (
                <section className="settings-section">
                  <MobileRecorderCard vault={vault} />
                </section>
              )}

              {activeTab === 'agents' && vault && (
                <section className="settings-section">
                  <div className="settings-callout agent-access-summary">
                    <div>
                      <div className="settings-row-label">Local agent bridge</div>
                      <div className="settings-row-desc">
                        Codex and Claude can use Forge through MCP. Terminal-based agents can use the same local CLI.
                      </div>
                    </div>
                    <div className="settings-code-row">
                      <code>{vault}</code>
                      <CopyButton value={vault} label="Copy path" />
                    </div>
                  </div>

                  <div className="settings-row">
                    <div>
                      <div className="settings-row-label">Agent brief</div>
                      <div className="settings-row-desc">A short instruction block for agents that can read and write local files.</div>
                    </div>
                    <div className="settings-row-control">
                      <CopyButton value={agentBrief} label="Copy brief" />
                    </div>
                  </div>

                  <div className="agent-access-grid">
                    <div className="agent-access-card">
                      <div className="agent-access-card-title">
                        <Terminal size={14} />
                        <span>CLI</span>
                      </div>
                      <p>For Codex, Claude Code, Cursor, or any agent that can run shell commands.</p>
                      <div className="agent-code-block">{cliCommand || 'Loading command…'}</div>
                      <CopyButton value={cliCommand} label="Copy CLI" disabled={!cliCommand} />
                    </div>

                    <div className="agent-access-card">
                      <div className="agent-access-card-title">
                        <Bot size={14} />
                        <span>Codex MCP</span>
                      </div>
                      <p>Add this server to Codex for structured Forge tools.</p>
                      <div className="agent-code-block">{codexAddCommand || 'Loading command…'}</div>
                      <div className="agent-access-actions">
                        <CopyButton value={codexAddCommand} label="Copy add command" disabled={!codexAddCommand} />
                        <CopyButton value={codexToml} label="Copy TOML" disabled={!codexToml} />
                      </div>
                    </div>

                    <div className="agent-access-card">
                      <div className="agent-access-card-title">
                        <Code2 size={14} />
                        <span>Claude MCP</span>
                      </div>
                      <p>Use the JSON config for Claude Desktop, or the command for Claude Code.</p>
                      <div className="agent-code-block">{mcpCommand || 'Loading command…'}</div>
                      <div className="agent-access-actions">
                        <CopyButton value={claudeJson} label="Copy JSON" disabled={!claudeJson} />
                        <CopyButton value={claudeCodeCommand} label="Copy Claude Code" disabled={!claudeCodeCommand} />
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'extensions' && (
                <section className="settings-section">
                  <ExtensionMarketplace />
                </section>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
