import {
  AlertCircle,
  BarChart3,
  Bot,
  Braces,
  Check,
  Clipboard,
  Code2,
  Download,
  ExternalLink,
  Folder,
  FolderOpen,
  FileText,
  Globe2,
  KeyRound,
  LockKeyhole,
  Mail,
  Plus,
  RefreshCw,
  Rocket,
  Rss,
  SearchCheck,
  ShieldAlert,
  Sparkles,
  Smartphone,
  Terminal,
  Trash2,
  Vault as VaultIcon,
  X
} from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'
import type {
  AgentAccessInfo,
  AISettings,
  AIStatus,
  AITextProvider,
  PublishAnalyticsProvider,
  PublishDeployTarget,
  PublishFormProvider,
  MobilePairingInfo,
  PublishSiteConfig,
  PublishSiteIntegrations,
  ThemeMode,
  UpdateStatus
} from '../../../shared/types'
import { DEFAULT_PUBLISH_SITE_INTEGRATIONS } from '../../../shared/types'
import { activeTab as selectActiveTab, noteContents, STARTER_TEMPLATE_CATALOG, useStore } from '../store'
import ExtensionMarketplace from './ExtensionMarketplace'
import {
  createSettingsTabs,
  PUBLISH_THEMES,
  STARTER_TEMPLATE_ICONS,
  THEMES,
  type SettingsNavGroup,
  type SettingsNavItem,
  type SettingsTabId
} from './settings/settingsConfig'

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

function slugifySiteName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'site'
  )
}

function defaultPublishSiteDir(vault: string, name: string): string {
  return `${vault.replace(/\/+$/, '')}/.forge/sites/${slugifySiteName(name)}`
}

function createPublishSite(vault: string, name: string, scope: PublishSiteConfig['scope'] = { kind: 'vault' }): PublishSiteConfig {
  const now = new Date().toISOString()
  return {
    id: `site-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description: scope.kind === 'folder' ? `Published notes from ${scope.folder}.` : 'Published notes from this Forge vault.',
    theme: 'minimal',
    scope,
    outputDir: defaultPublishSiteDir(vault, name),
    options: {
      clean: true,
      showTags: true,
      showBacklinks: true
    },
    integrations: structuredClone(DEFAULT_PUBLISH_SITE_INTEGRATIONS),
    createdAt: now,
    updatedAt: now
  }
}

function siteScopeLabel(site: PublishSiteConfig): string {
  return site.scope.kind === 'folder' ? site.scope.folder : 'All folders'
}

function publishThemeLabel(theme: PublishSiteConfig['theme']): string {
  return PUBLISH_THEMES.find((option) => option.id === theme)?.label ?? theme
}

function vaultDisplayName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function aiProviderLabel(provider: AITextProvider): string {
  if (provider === 'codex') return 'Codex'
  if (provider === 'openai') return 'OpenAI API'
  return 'Anthropic API'
}

function aiModelForProvider(settings: AISettings, provider: AITextProvider): string {
  if (provider === 'codex') return settings.codexModel
  if (provider === 'openai') return settings.openaiModel
  return settings.anthropicModel
}

function updateAIModel(settings: AISettings, provider: AITextProvider, model: string): AISettings {
  if (provider === 'codex') return { ...settings, codexModel: model }
  if (provider === 'openai') return { ...settings, openaiModel: model }
  return { ...settings, anthropicModel: model }
}

function statusLabel(value: boolean | null): string {
  if (value === true) return 'Connected'
  if (value === false) return 'Needs setup'
  return 'Local only'
}

function statusTone(value: boolean | null): 'good' | 'warn' | 'neutral' {
  if (value === true) return 'good'
  if (value === false) return 'warn'
  return 'neutral'
}

function dateStamp(value: string | null): string {
  if (!value) return 'Not saved'
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function openExternalUrl(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function revealRelForOutput(vault: string, outputDir: string): string | null {
  const cleanVault = vault.replace(/\/+$/, '')
  const cleanOutput = outputDir.replace(/\/+$/, '')
  if (cleanOutput === cleanVault || !cleanOutput.startsWith(`${cleanVault}/`)) return null
  return `${cleanOutput.slice(cleanVault.length + 1)}/index.html`
}

function publicPublishNotes(publishDir: string): string {
  return [
    'Forge publishing is static and host-neutral.',
    '',
    `1. Click "Generate site" in Forge, or run forge-publish --out ${shellQuote(publishDir)} --clean.`,
    '2. Upload the generated folder to any static host: GitHub Pages, Cloudflare Pages, Netlify, Vercel, S3/R2, or IPFS.',
    '3. Images, audio, video, PDFs, backlinks, tags, and wikilinks are emitted as plain HTML/assets. No Forge server is required.',
    '',
    'For GitHub Pages, keep the generated .nojekyll file so the _forge asset folder is served.'
  ].join('\n')
}

function publishDeployTargetLabel(target: PublishDeployTarget): string {
  const labels: Record<PublishDeployTarget, string> = {
    manual: 'Manual upload',
    'github-pages': 'GitHub Pages',
    'cloudflare-pages': 'Cloudflare Pages',
    netlify: 'Netlify',
    vercel: 'Vercel',
    's3-r2': 'S3 / R2',
    ipfs: 'IPFS'
  }
  return labels[target]
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
  const recentVaults = useStore((s) => s.recentVaults)
  const setTheme = useStore((s) => s.setTheme)
  const setFontSize = useStore((s) => s.setFontSize)
  const setLineWidth = useStore((s) => s.setLineWidth)
  const templatesFolder = useStore((s) => s.templatesFolder)
  const dailyNotesFolder = useStore((s) => s.dailyNotesFolder)
  const folders = useStore((s) => s.folders)
  const publishSites = useStore((s) => s.publishSites)
  const aiSettings = useStore((s) => s.aiSettings)
  const setTemplatesFolder = useStore((s) => s.setTemplatesFolder)
  const setDailyNotesFolder = useStore((s) => s.setDailyNotesFolder)
  const setPublishSites = useStore((s) => s.setPublishSites)
  const setAISettings = useStore((s) => s.setAISettings)
  const createStarterTemplate = useStore((s) => s.createStarterTemplate)
  const setModal = useStore((s) => s.setModal)
  const addVaultPath = useStore((s) => s.addVaultPath)
  const openVaultPath = useStore((s) => s.openVaultPath)
  const removeRecentVault = useStore((s) => s.removeRecentVault)
  const currentTab = useStore(selectActiveTab)
  const [activeTab, setActiveTab] = useState<SettingsTabId>('appearance')
  const [vaultAddState, setVaultAddState] = useState<{
    status: 'idle' | 'selecting' | 'added' | 'failed'
    message: string
  }>({ status: 'idle', message: '' })
  const [selectedPublishSiteId, setSelectedPublishSiteId] = useState<string | null>(null)
  const [agentAccess, setAgentAccess] = useState<AgentAccessInfo | null>(null)
  const [aiStatus, setAIStatus] = useState<AIStatus | null>(null)
  const [aiStatusError, setAIStatusError] = useState('')
  const [aiSecrets, setAISecrets] = useState({ openaiApiKey: '', anthropicApiKey: '' })
  const [aiSaveState, setAISaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [aiTaskProvider, setAITaskProvider] = useState<AITextProvider>(aiSettings.defaultProvider)
  const [aiPrompt, setAIPrompt] = useState('Improve the formatting and clarity of this note without changing its meaning.')
  const [aiTaskState, setAITaskState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle')
  const [aiTaskMessage, setAITaskMessage] = useState('')
  const [aiTaskResult, setAITaskResult] = useState('')
  const [publishState, setPublishState] = useState<{
    siteId: string | null
    status: 'idle' | 'publishing' | 'done' | 'failed'
    message: string
    outDir: string
  }>({ siteId: null, status: 'idle', message: '', outDir: '' })

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

  const refreshAIStatus = async (): Promise<void> => {
    try {
      setAIStatusError('')
      setAIStatus(await window.forge.getAIStatus())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setAIStatusError(message)
    }
  }

  useEffect(() => {
    refreshAIStatus().catch(console.error)
  }, [])

  const saveProviderKey = async (provider: 'openai' | 'anthropic'): Promise<void> => {
    setAISaveState('saving')
    try {
      const update =
        provider === 'openai'
          ? { openaiApiKey: aiSecrets.openaiApiKey }
          : { anthropicApiKey: aiSecrets.anthropicApiKey }
      const next = await window.forge.saveAISettings(aiSettings, update)
      setAIStatus(next)
      setAISecrets((current) =>
        provider === 'openai' ? { ...current, openaiApiKey: '' } : { ...current, anthropicApiKey: '' }
      )
      setAISaveState('saved')
      window.setTimeout(() => setAISaveState('idle'), 1600)
    } catch (error) {
      console.error('AI key save failed.', error)
      setAIStatusError(error instanceof Error ? error.message : String(error))
      setAISaveState('failed')
      window.setTimeout(() => setAISaveState('idle'), 2200)
    }
  }

  const clearProviderKey = async (provider: 'openai' | 'anthropic'): Promise<void> => {
    setAISaveState('saving')
    try {
      const next = await window.forge.saveAISettings(
        aiSettings,
        provider === 'openai' ? { clearOpenAIKey: true } : { clearAnthropicKey: true }
      )
      setAIStatus(next)
      setAISaveState('saved')
      window.setTimeout(() => setAISaveState('idle'), 1600)
    } catch (error) {
      console.error('AI key clear failed.', error)
      setAIStatusError(error instanceof Error ? error.message : String(error))
      setAISaveState('failed')
      window.setTimeout(() => setAISaveState('idle'), 2200)
    }
  }

  const updateAISettings = (next: AISettings): void => {
    setAISettings(next)
  }

  const runAITask = async (): Promise<void> => {
    if (!aiPrompt.trim()) return
    const activeNotePath = currentTab?.kind === 'note' ? currentTab.path : null
    const documentContent =
      aiSettings.includeActiveNote && activeNotePath ? noteContents.get(activeNotePath) ?? '' : ''
    setAITaskState('running')
    setAITaskMessage(`Running ${aiProviderLabel(aiTaskProvider)}...`)
    setAITaskResult('')
    try {
      const result = await window.forge.runAITextTask({
        provider: aiTaskProvider,
        prompt: aiPrompt,
        model: aiModelForProvider(aiSettings, aiTaskProvider),
        vault,
        documentPath: activeNotePath,
        documentContent
      })
      setAITaskResult(result.output)
      setAITaskMessage(`Finished with ${aiProviderLabel(result.provider)}${result.model ? ` (${result.model})` : ''}.`)
      setAITaskState('done')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setAITaskMessage(message)
      setAITaskState('failed')
    }
  }

  const addVaultFromDialog = async (): Promise<void> => {
    setVaultAddState({ status: 'selecting', message: 'Choose a folder to save as a vault.' })
    try {
      const selectedVault = await window.forge.selectVault()
      if (!selectedVault) {
        setVaultAddState({ status: 'idle', message: '' })
        return
      }
      const wasAlreadySaved = selectedVault === vault || recentVaults.includes(selectedVault)
      await addVaultPath(selectedVault)
      setVaultAddState({
        status: 'added',
        message: wasAlreadySaved
          ? `${vaultDisplayName(selectedVault)} is already saved.`
          : `Added ${vaultDisplayName(selectedVault)} to saved vaults.`
      })
      window.setTimeout(() => setVaultAddState({ status: 'idle', message: '' }), 2200)
    } catch (error) {
      console.error('Add vault failed.', error)
      setVaultAddState({
        status: 'failed',
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const settingsTabs = useMemo<SettingsNavItem[]>(() => createSettingsTabs(vault), [vault])

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
  const activeSettingsTab = settingsTabs.find((tab) => tab.id === activeTab) ?? settingsTabs[0]
  const starterTemplates = STARTER_TEMPLATE_CATALOG
  const selectedPublishSite = publishSites.find((site) => site.id === selectedPublishSiteId) ?? publishSites[0] ?? null
  const savedVaults = useMemo(
    () => (vault ? [vault, ...recentVaults.filter((path) => path !== vault)] : recentVaults),
    [recentVaults, vault]
  )
  const groupedTabs = settingsTabs.reduce<Record<SettingsNavGroup, SettingsNavItem[]>>(
    (groups, tab) => {
      groups[tab.group].push(tab)
      return groups
    },
    { Workspace: [], Connections: [], System: [] }
  )

  useEffect(() => {
    if (!vault || publishSites.length > 0) return
    const firstSite = createPublishSite(vault, 'Full vault')
    setPublishSites([firstSite])
    setSelectedPublishSiteId(firstSite.id)
  }, [publishSites.length, setPublishSites, vault])

  useEffect(() => {
    if (publishSites.length === 0) {
      setSelectedPublishSiteId(null)
      return
    }
    if (!selectedPublishSiteId || !publishSites.some((site) => site.id === selectedPublishSiteId)) {
      setSelectedPublishSiteId(publishSites[0].id)
    }
  }, [publishSites, selectedPublishSiteId])

  const updatePublishSite = (siteId: string, updater: (site: PublishSiteConfig) => PublishSiteConfig): void => {
    setPublishSites(publishSites.map((site) => (site.id === siteId ? { ...updater(site), updatedAt: new Date().toISOString() } : site)))
  }

  const updatePublishIntegrations = (
    siteId: string,
    updater: (integrations: PublishSiteIntegrations) => PublishSiteIntegrations
  ): void => {
    updatePublishSite(siteId, (site) => ({
      ...site,
      integrations: updater(site.integrations ?? structuredClone(DEFAULT_PUBLISH_SITE_INTEGRATIONS))
    }))
  }

  const addPublishSite = (): void => {
    if (!vault) return
    const index = publishSites.length + 1
    const site = createPublishSite(vault, `New site ${index}`)
    setPublishSites([...publishSites, site])
    setSelectedPublishSiteId(site.id)
  }

  const addTopLevelFolderSites = (): void => {
    if (!vault) return
    const existingFolderSites = new Set(
      publishSites
        .filter((site) => site.scope.kind === 'folder')
        .map((site) => (site.scope.kind === 'folder' ? site.scope.folder : ''))
    )
    const folderSites = folders
      .filter((folder) => !folder.includes('/'))
      .filter((folder) => !existingFolderSites.has(folder))
      .map((folder) => createPublishSite(vault, folder, { kind: 'folder', folder }))
    if (folderSites.length === 0) return
    setPublishSites([...publishSites, ...folderSites])
    setSelectedPublishSiteId(folderSites[0].id)
  }

  const deletePublishSite = (siteId: string): void => {
    const next = publishSites.filter((site) => site.id !== siteId)
    setPublishSites(next)
    setSelectedPublishSiteId(next[0]?.id ?? null)
  }

  const publishStaticSite = async (site: PublishSiteConfig): Promise<void> => {
    if (!vault || !site.outputDir) return
    setPublishState({ siteId: site.id, status: 'publishing', message: 'Publishing site...', outDir: site.outputDir })
    try {
      const result = await window.forge.publishVault(vault, site.outputDir, {
        title: site.name,
        description: site.description,
        theme: site.theme,
        scopePath: site.scope.kind === 'folder' ? site.scope.folder : '',
        clean: site.options.clean,
        showTags: site.options.showTags,
        showBacklinks: site.options.showBacklinks,
        integrations: site.integrations
      })
      setPublishState({
        siteId: site.id,
        status: 'done',
        message: `Published ${result.notes} notes and ${result.files} files.`,
        outDir: result.outDir
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setPublishState({ siteId: site.id, status: 'failed', message, outDir: site.outputDir })
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
                      <div className="settings-row-desc">Markdown files here appear in New from template</div>
                    </div>
                    <div className="settings-row-control">
                      <input
                        className="settings-text-input"
                        value={templatesFolder}
                        onChange={(event) => setTemplatesFolder(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="settings-callout template-starters-card">
                    <div>
                      <div className="settings-row-label">Starter templates</div>
                      <div className="settings-row-desc">
                        Templates can be daily notes, meetings, projects, people, research briefs, or any repeatable Markdown shape.
                      </div>
                    </div>
                    <div className="template-starter-grid">
                      {starterTemplates.map((template) => (
                        <button
                          key={template.kind}
                          className="template-starter"
                          onClick={() => createStarterTemplate(template.kind).catch(console.error)}
                        >
                          <span className="template-starter-icon" aria-hidden="true">
                            {STARTER_TEMPLATE_ICONS[template.kind]}
                          </span>
                          <span className="template-starter-copy">
                            <strong>{template.label}</strong>
                            <span>{template.detail}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    <button className="btn btn-compact" onClick={() => setModal('template')}>
                      <FileText size={14} />
                      New from template
                    </button>
                  </div>
                </section>
              )}

              {activeTab === 'vault' && vault && (
                <section className="settings-section">
                  <div className="vault-settings-header">
                    <div>
                      <div className="settings-row-label">Saved vaults</div>
                      <div className="settings-row-desc">Add local Markdown folders and switch between them from here.</div>
                    </div>
                    <button className="btn btn-compact" disabled={vaultAddState.status === 'selecting'} onClick={() => addVaultFromDialog()}>
                      <Plus size={14} />
                      {vaultAddState.status === 'selecting' ? 'Choosing...' : 'Add vault'}
                    </button>
                  </div>

                  {vaultAddState.status !== 'idle' && (
                    <div
                      className={`settings-inline-status ${
                        vaultAddState.status === 'failed' ? 'error' : vaultAddState.status === 'selecting' ? 'info' : 'success'
                      }`}
                      role={vaultAddState.status === 'failed' ? 'alert' : 'status'}
                    >
                      {vaultAddState.status === 'failed' ? (
                        <AlertCircle size={14} />
                      ) : vaultAddState.status === 'selecting' ? (
                        <FolderOpen size={14} />
                      ) : (
                        <Check size={14} />
                      )}
                      <span>{vaultAddState.message}</span>
                    </div>
                  )}

                  <div className="vault-list">
                    {savedVaults.map((savedVault) => {
                      const isActive = savedVault === vault
                      return (
                        <div key={savedVault} className={`vault-list-row${isActive ? ' active' : ''}`}>
                          <span className="vault-list-icon" aria-hidden="true">
                            <VaultIcon size={16} />
                          </span>
                          <span className="vault-list-copy">
                            <strong>{vaultDisplayName(savedVault)}</strong>
                            <span>{savedVault}</span>
                          </span>
                          <span className="vault-list-actions">
                            {isActive ? (
                              <span className="vault-active-badge">
                                <Check size={13} />
                                Active
                              </span>
                            ) : (
                              <button className="btn btn-compact" onClick={() => openVaultPath(savedVault).catch(console.error)}>
                                Switch
                              </button>
                            )}
                            <button className="icon-btn" title="Reveal in Finder" onClick={() => window.forge.reveal(savedVault, '')}>
                              <FolderOpen size={15} />
                            </button>
                            {!isActive && (
                              <button className="icon-btn" title="Remove from saved vaults" onClick={() => removeRecentVault(savedVault)}>
                                <Trash2 size={15} />
                              </button>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {activeTab === 'publishing' && vault && (
                <section className="settings-section">
                  <div className="publish-sites-header">
                    <div>
                      <div className="settings-row-label">Sites</div>
                      <div className="settings-row-desc">
                        Publish any folder, space, or the whole vault as separate static websites.
                      </div>
                    </div>
                    <div className="publish-sites-actions">
                      <button className="btn btn-compact" disabled={folders.length === 0} onClick={addTopLevelFolderSites}>
                        <Folder size={14} />
                        Sites from folders
                      </button>
                      <button className="btn btn-compact" onClick={addPublishSite}>
                        <Plus size={14} />
                        New site
                      </button>
                    </div>
                  </div>

                  <div className="publish-sites-layout">
                    <div className="publish-site-list" aria-label="Publish sites">
                      {publishSites.map((site) => (
                        <button
                          key={site.id}
                          className={`publish-site-card${site.id === selectedPublishSite?.id ? ' active' : ''}`}
                          onClick={() => setSelectedPublishSiteId(site.id)}
                        >
                          <span className="publish-site-card-icon">
                            {site.scope.kind === 'folder' ? <Folder size={15} /> : <Globe2 size={15} />}
                          </span>
                          <span className="publish-site-card-copy">
                            <strong>{site.name}</strong>
                            <span>{siteScopeLabel(site)}</span>
                          </span>
                        </button>
                      ))}
                    </div>

                    {selectedPublishSite && (
                      <div className="settings-callout publish-site-editor">
                        <div className="publish-site-editor-header">
                          <div>
                            <div className="settings-row-label">{selectedPublishSite.name}</div>
                            <div className="settings-row-desc">
                              {siteScopeLabel(selectedPublishSite)} · {publishThemeLabel(selectedPublishSite.theme)}
                            </div>
                          </div>
                          {publishSites.length > 1 && (
                            <button className="icon-btn" title="Delete site" onClick={() => deletePublishSite(selectedPublishSite.id)}>
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>

                        <div className="publish-site-form-grid">
                          <label className="publish-field">
                            <span>Site name</span>
                            <input
                              className="settings-text-input"
                              value={selectedPublishSite.name}
                              onChange={(event) =>
                                updatePublishSite(selectedPublishSite.id, (site) => ({
                                  ...site,
                                  name: event.target.value,
                                  outputDir:
                                    site.outputDir === defaultPublishSiteDir(vault, site.name)
                                      ? defaultPublishSiteDir(vault, event.target.value)
                                      : site.outputDir
                                }))
                              }
                            />
                          </label>
                          <label className="publish-field">
                            <span>Source</span>
                            <select
                              className="settings-text-input"
                              value={selectedPublishSite.scope.kind}
                              onChange={(event) =>
                                updatePublishSite(selectedPublishSite.id, (site) => ({
                                  ...site,
                                  scope:
                                    event.target.value === 'folder'
                                      ? { kind: 'folder', folder: folders[0] ?? '' }
                                      : { kind: 'vault' }
                                }))
                              }
                            >
                              <option value="vault">All folders</option>
                              <option value="folder">Single folder</option>
                            </select>
                          </label>
                          {selectedPublishSite.scope.kind === 'folder' && (
                            <label className="publish-field publish-field-wide">
                              <span>Folder</span>
                              <select
                                className="settings-text-input"
                                value={selectedPublishSite.scope.folder}
                                onChange={(event) =>
                                  updatePublishSite(selectedPublishSite.id, (site) => ({
                                    ...site,
                                    scope: { kind: 'folder', folder: event.target.value }
                                  }))
                                }
                              >
                                {folders.map((folder) => (
                                  <option key={folder} value={folder}>
                                    {folder}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <label className="publish-field publish-field-wide">
                            <span>Description</span>
                            <textarea
                              className="settings-textarea"
                              value={selectedPublishSite.description}
                              onChange={(event) =>
                                updatePublishSite(selectedPublishSite.id, (site) => ({ ...site, description: event.target.value }))
                              }
                            />
                          </label>
                        </div>

                        <div className="publish-subsection">
                          <div className="settings-row-label">Theme</div>
                          <div className="publish-theme-grid">
                            {PUBLISH_THEMES.map((themeOption) => (
                              <button
                                key={themeOption.id}
                                className={`publish-theme-card${selectedPublishSite.theme === themeOption.id ? ' active' : ''}`}
                                onClick={() =>
                                  updatePublishSite(selectedPublishSite.id, (site) => ({ ...site, theme: themeOption.id }))
                                }
                              >
                                <span className={`publish-theme-preview ${themeOption.id}`} aria-hidden="true">
                                  <span />
                                  <span />
                                  <span />
                                </span>
                                <span className="publish-theme-card-copy">
                                  <strong>{themeOption.label}</strong>
                                  <span>{themeOption.detail}</span>
                                </span>
                                {selectedPublishSite.theme === themeOption.id && (
                                  <span className="publish-theme-selected">
                                    <Check size={12} />
                                    Selected
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="publish-subsection">
                          <div className="settings-row-label">Per-site settings</div>
                          <div className="publish-options-grid">
                            {[
                              ['clean', 'Clean before publishing', 'Remove stale generated files first.'],
                              ['showTags', 'Tag navigation', 'Generate tag pages and tag navigation.'],
                              ['showBacklinks', 'Backlink sections', 'Show backlinks on note pages.']
                            ].map(([key, label, detail]) => (
                              <label key={key} className="publish-option">
                                <input
                                  type="checkbox"
                                  checked={Boolean(selectedPublishSite.options[key as keyof typeof selectedPublishSite.options])}
                                  onChange={(event) =>
                                    updatePublishSite(selectedPublishSite.id, (site) => ({
                                      ...site,
                                      options: { ...site.options, [key]: event.target.checked }
                                    }))
                                  }
                                />
                                <span>
                                  <strong>{label}</strong>
                                  <small>{detail}</small>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="publish-subsection">
                          <div>
                            <div className="settings-row-label">Publishing integrations</div>
                            <div className="settings-row-desc">
                              Provider-neutral primitives emitted into this static site. No Forge-hosted server is required.
                            </div>
                          </div>
                          <div className="publish-integrations-grid">
                            <div className="publish-integration-card">
                              <div className="publish-integration-title">
                                <SearchCheck size={15} />
                                <span>SEO / RSS</span>
                              </div>
                              <label className="publish-option compact">
                                <input
                                  type="checkbox"
                                  checked={selectedPublishSite.integrations.seoRss.enabled}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      seoRss: { ...integrations.seoRss, enabled: event.target.checked }
                                    }))
                                  }
                                />
                                <span>
                                  <strong>Search metadata</strong>
                                  <small>Canonical, Open Graph, and feed links.</small>
                                </span>
                              </label>
                              <label className="publish-field">
                                <span>Public URL</span>
                                <input
                                  className="settings-text-input"
                                  placeholder="https://example.com"
                                  value={selectedPublishSite.integrations.seoRss.siteUrl}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      seoRss: { ...integrations.seoRss, siteUrl: event.target.value }
                                    }))
                                  }
                                />
                              </label>
                              <label className="publish-field">
                                <span>Social image</span>
                                <input
                                  className="settings-text-input"
                                  placeholder="https://example.com/og.png or Media/og.png"
                                  value={selectedPublishSite.integrations.seoRss.socialImage}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      seoRss: { ...integrations.seoRss, socialImage: event.target.value }
                                    }))
                                  }
                                />
                              </label>
                              <label className="publish-field">
                                <span>Author name</span>
                                <input
                                  className="settings-text-input"
                                  placeholder="Optional"
                                  value={selectedPublishSite.integrations.seoRss.authorName}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      seoRss: { ...integrations.seoRss, authorName: event.target.value }
                                    }))
                                  }
                                />
                              </label>
                              <label className="publish-field">
                                <span>Language</span>
                                <input
                                  className="settings-text-input"
                                  placeholder="en"
                                  value={selectedPublishSite.integrations.seoRss.language}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      seoRss: { ...integrations.seoRss, language: event.target.value }
                                    }))
                                  }
                                />
                              </label>
                              <label className="publish-field">
                                <span>Robots</span>
                                <select
                                  className="settings-text-input"
                                  value={selectedPublishSite.integrations.seoRss.robotsMode}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      seoRss: {
                                        ...integrations.seoRss,
                                        robotsMode: event.target.value === 'noindex' ? 'noindex' : 'index'
                                      }
                                    }))
                                  }
                                >
                                  <option value="index">Index</option>
                                  <option value="noindex">Noindex</option>
                                </select>
                              </label>
                              <label className="publish-field">
                                <span>Favicon</span>
                                <input
                                  className="settings-text-input"
                                  placeholder="favicon.ico or https://..."
                                  value={selectedPublishSite.integrations.seoRss.favicon}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      seoRss: { ...integrations.seoRss, favicon: event.target.value }
                                    }))
                                  }
                                />
                              </label>
                              <label className="publish-field">
                                <span>Custom footer</span>
                                <textarea
                                  className="settings-textarea compact"
                                  placeholder="Plain text footer shown on every generated page."
                                  value={selectedPublishSite.integrations.seoRss.customFooter}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      seoRss: { ...integrations.seoRss, customFooter: event.target.value }
                                    }))
                                  }
                                />
                              </label>
                              <div className="publish-mini-options">
                                {[
                                  ['rss', 'RSS', <Rss size={13} />],
                                  ['sitemap', 'Sitemap', <Globe2 size={13} />],
                                  ['robots', 'Robots', <Braces size={13} />]
                                ].map(([key, label, icon]) => (
                                  <label key={key as string}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(
                                        selectedPublishSite.integrations.seoRss[
                                          key as keyof typeof selectedPublishSite.integrations.seoRss
                                        ]
                                      )}
                                      onChange={(event) =>
                                        updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                          ...integrations,
                                          seoRss: { ...integrations.seoRss, [key as string]: event.target.checked }
                                        }))
                                      }
                                    />
                                    {icon}
                                    <span>{label as string}</span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            <div className="publish-integration-card">
                              <div className="publish-integration-title">
                                <BarChart3 size={15} />
                                <span>Analytics</span>
                              </div>
                              <label className="publish-field">
                                <span>Provider</span>
                                <select
                                  className="settings-text-input"
                                  value={selectedPublishSite.integrations.analytics.provider}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      analytics: {
                                        ...integrations.analytics,
                                        provider: event.target.value as PublishAnalyticsProvider
                                      }
                                    }))
                                  }
                                >
                                  <option value="none">None</option>
                                  <option value="plausible">Plausible</option>
                                  <option value="umami">Umami</option>
                                  <option value="custom">Custom snippet</option>
                                </select>
                              </label>
                              <label className="publish-field">
                                <span>Domain</span>
                                <input
                                  className="settings-text-input"
                                  placeholder="example.com"
                                  value={selectedPublishSite.integrations.analytics.domain}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      analytics: { ...integrations.analytics, domain: event.target.value }
                                    }))
                                  }
                                />
                              </label>
                              <label className="publish-field">
                                <span>Script URL</span>
                                <input
                                  className="settings-text-input"
                                  placeholder="Optional"
                                  value={selectedPublishSite.integrations.analytics.scriptUrl}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      analytics: { ...integrations.analytics, scriptUrl: event.target.value }
                                    }))
                                  }
                                />
                              </label>
                              <label className="publish-field">
                                <span>Website ID</span>
                                <input
                                  className="settings-text-input"
                                  placeholder="For Umami"
                                  value={selectedPublishSite.integrations.analytics.websiteId}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      analytics: { ...integrations.analytics, websiteId: event.target.value }
                                    }))
                                  }
                                />
                              </label>
                              <label className="publish-field">
                                <span>Custom snippet</span>
                                <textarea
                                  className="settings-textarea compact"
                                  placeholder="<script defer ...></script>"
                                  value={selectedPublishSite.integrations.analytics.customSnippet}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      analytics: { ...integrations.analytics, customSnippet: event.target.value }
                                    }))
                                  }
                                />
                              </label>
                              <div className="publish-warning">
                                <AlertCircle size={14} />
                                <span>
                                  Custom analytics snippets are injected into every generated page. Only use code from providers you trust.
                                </span>
                              </div>
                            </div>

                            <div className="publish-integration-card">
                              <div className="publish-integration-title">
                                <Rocket size={15} />
                                <span>Deploy targets</span>
                              </div>
                              <label className="publish-field">
                                <span>Target</span>
                                <select
                                  className="settings-text-input"
                                  value={selectedPublishSite.integrations.deploy.target}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      deploy: { ...integrations.deploy, target: event.target.value as PublishDeployTarget }
                                    }))
                                  }
                                >
                                  <option value="manual">Manual upload</option>
                                  <option value="github-pages">GitHub Pages</option>
                                  <option value="cloudflare-pages">Cloudflare Pages</option>
                                  <option value="netlify">Netlify</option>
                                  <option value="vercel">Vercel</option>
                                  <option value="s3-r2">S3 / R2</option>
                                  <option value="ipfs">IPFS</option>
                                </select>
                              </label>
                              <label className="publish-field">
                                <span>Production URL</span>
                                <input
                                  className="settings-text-input"
                                  placeholder="https://site.example"
                                  value={selectedPublishSite.integrations.deploy.productionUrl}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      deploy: { ...integrations.deploy, productionUrl: event.target.value }
                                    }))
                                  }
                                />
                              </label>
                              <label className="publish-field">
                                <span>Project name</span>
                                <input
                                  className="settings-text-input"
                                  placeholder={publishDeployTargetLabel(selectedPublishSite.integrations.deploy.target)}
                                  value={selectedPublishSite.integrations.deploy.projectName}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      deploy: { ...integrations.deploy, projectName: event.target.value }
                                    }))
                                  }
                                />
                              </label>
                              <label className="publish-field">
                                <span>Deploy notes</span>
                                <textarea
                                  className="settings-textarea compact"
                                  placeholder="Anything the user or agent should remember before deploy."
                                  value={selectedPublishSite.integrations.deploy.notes}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      deploy: { ...integrations.deploy, notes: event.target.value }
                                    }))
                                  }
                                />
                              </label>
                            </div>

                            <div className="publish-integration-card">
                              <div className="publish-integration-title">
                                <Code2 size={15} />
                                <span>Embeds</span>
                              </div>
                              <label className="publish-option compact">
                                <input
                                  type="checkbox"
                                  checked={selectedPublishSite.integrations.embeds.enabled}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      embeds: { ...integrations.embeds, enabled: event.target.checked }
                                    }))
                                  }
                                />
                                <span>
                                  <strong>Embed blocks</strong>
                                  <small>Enable fenced forge-embed blocks.</small>
                                </span>
                              </label>
                              <label className="publish-option compact">
                                <input
                                  type="checkbox"
                                  checked={selectedPublishSite.integrations.embeds.allowIframes}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      embeds: { ...integrations.embeds, allowIframes: event.target.checked }
                                    }))
                                  }
                                />
                                <span>
                                  <strong>Iframe embeds</strong>
                                  <small>Render approved HTTPS URLs as sandboxed iframes.</small>
                                </span>
                              </label>
                              <label className="publish-option compact">
                                <input
                                  type="checkbox"
                                  checked={selectedPublishSite.integrations.embeds.allowExternalMedia}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      embeds: { ...integrations.embeds, allowExternalMedia: event.target.checked }
                                    }))
                                  }
                                />
                                <span>
                                  <strong>External media</strong>
                                  <small>Allow remote image URLs in published notes.</small>
                                </span>
                              </label>
                            </div>

                            <div className="publish-integration-card">
                              <div className="publish-integration-title">
                                <Mail size={15} />
                                <span>Forms</span>
                              </div>
                              <label className="publish-option compact">
                                <input
                                  type="checkbox"
                                  checked={selectedPublishSite.integrations.forms.enabled}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      forms: { ...integrations.forms, enabled: event.target.checked }
                                    }))
                                  }
                                />
                                <span>
                                  <strong>Contact form</strong>
                                  <small>Add a static form to the generated home page.</small>
                                </span>
                              </label>
                              <label className="publish-field">
                                <span>Provider</span>
                                <select
                                  className="settings-text-input"
                                  value={selectedPublishSite.integrations.forms.provider}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      forms: { ...integrations.forms, provider: event.target.value as PublishFormProvider }
                                    }))
                                  }
                                >
                                  <option value="none">None</option>
                                  <option value="netlify">Netlify Forms</option>
                                  <option value="formspree">Formspree</option>
                                  <option value="custom">Custom endpoint</option>
                                </select>
                              </label>
                              <label className="publish-field">
                                <span>Form name</span>
                                <input
                                  className="settings-text-input"
                                  value={selectedPublishSite.integrations.forms.formName}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      forms: { ...integrations.forms, formName: event.target.value }
                                    }))
                                  }
                                />
                              </label>
                              <label className="publish-field">
                                <span>Endpoint</span>
                                <input
                                  className="settings-text-input"
                                  placeholder="https://formspree.io/f/..."
                                  value={selectedPublishSite.integrations.forms.endpoint}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      forms: { ...integrations.forms, endpoint: event.target.value }
                                    }))
                                  }
                                />
                              </label>
                              <label className="publish-field">
                                <span>Button label</span>
                                <input
                                  className="settings-text-input"
                                  value={selectedPublishSite.integrations.forms.buttonLabel}
                                  onChange={(event) =>
                                    updatePublishIntegrations(selectedPublishSite.id, (integrations) => ({
                                      ...integrations,
                                      forms: { ...integrations.forms, buttonLabel: event.target.value }
                                    }))
                                  }
                                />
                              </label>
                            </div>
                          </div>
                        </div>

                        <div className="settings-code-row">
                          <code>{selectedPublishSite.outputDir}</code>
                          <CopyButton value={selectedPublishSite.outputDir} label="Copy path" />
                        </div>

                        <div className="static-publish-actions">
                          <button
                            className="btn"
                            disabled={publishState.status === 'publishing'}
                            onClick={() => publishStaticSite(selectedPublishSite)}
                          >
                            {publishState.status === 'publishing' && publishState.siteId === selectedPublishSite.id ? (
                              <RefreshCw size={14} />
                            ) : (
                              <Code2 size={14} />
                            )}
                            {publishState.status === 'publishing' && publishState.siteId === selectedPublishSite.id ? 'Generating' : 'Generate site'}
                          </button>
                          <button
                            className="btn btn-compact"
                            disabled={publishState.status !== 'done' || publishState.siteId !== selectedPublishSite.id || !revealRelForOutput(vault, selectedPublishSite.outputDir)}
                            onClick={() => {
                              const rel = revealRelForOutput(vault, selectedPublishSite.outputDir)
                              if (rel) window.forge.reveal(vault, rel)
                            }}
                          >
                            Reveal output
                          </button>
                          <CopyButton value={publicPublishNotes(selectedPublishSite.outputDir)} label="Copy deploy notes" />
                        </div>

                        {publishState.message && publishState.siteId === selectedPublishSite.id && (
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
                    )}
                  </div>

                  <div className="settings-callout public-publish-card">
                    <div>
                      <div className="settings-row-label">Good ideas to borrow from Feather</div>
                      <div className="settings-row-desc">
                        Feather is strongest at SEO and growth defaults. Forge can keep those ideas local and open source.
                      </div>
                    </div>
                    <div className="public-publish-options">
                      <div className="public-publish-option">
                        <span className="public-publish-option-icon" aria-hidden="true">
                          <SearchCheck size={15} />
                        </span>
                        <span className="public-publish-option-copy">
                          <strong>SEO defaults</strong>
                          <span>Sitemaps, canonical URLs, Open Graph, schema, per-page title and description overrides.</span>
                        </span>
                      </div>
                      <div className="public-publish-option">
                        <span className="public-publish-option-icon" aria-hidden="true">
                          <Rocket size={15} />
                        </span>
                        <span className="public-publish-option-copy">
                          <strong>Growth surfaces</strong>
                          <span>RSS, search, related posts, authors, analytics hooks, email capture snippets, and newsletter export.</span>
                        </span>
                      </div>
                    </div>
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

              {activeTab === 'ai' && (
                <section className="settings-section">
                  <div className="settings-callout ai-policy-card">
                    <span className="ai-policy-icon">
                      <ShieldAlert size={16} />
                    </span>
                    <span>
                      <strong>Subscription access stays local.</strong>
                      <small>
                        Codex runs through the user’s local Codex CLI login. Claude subscription login remains in Claude Code;
                        Forge supports Claude through MCP setup and direct Anthropic API keys.
                      </small>
                    </span>
                  </div>

                  {aiStatusError && (
                    <div className="static-publish-status failed">
                      <AlertCircle size={14} />
                      <span>{aiStatusError}</span>
                    </div>
                  )}

                  <div className="ai-provider-grid">
                    <div className="ai-provider-card">
                      <div className="ai-provider-head">
                        <span className="ai-provider-icon">
                          <Sparkles size={16} />
                        </span>
                        <span>
                          <strong>Codex</strong>
                          <small>ChatGPT subscription via local CLI</small>
                        </span>
                        <span className={`ai-status-pill ${statusTone(aiStatus?.codex.authenticated ?? false)}`}>
                          {statusLabel(aiStatus?.codex.authenticated ?? false)}
                        </span>
                      </div>
                      <p>{aiStatus?.codex.detail ?? 'Checking Codex...'}</p>
                      <div className="ai-meta-grid">
                        <span>CLI</span>
                        <code>{aiStatus?.codex.path ?? 'Not found'}</code>
                        <span>Version</span>
                        <code>{aiStatus?.codex.version ?? 'Unknown'}</code>
                      </div>
                      <label className="publish-field">
                        <span>Model override</span>
                        <input
                          className="settings-text-input"
                          placeholder="Use Codex default"
                          value={aiSettings.codexModel}
                          onChange={(event) => updateAISettings(updateAIModel(aiSettings, 'codex', event.target.value))}
                        />
                      </label>
                      <div className="ai-card-actions">
                        <button
                          className="btn btn-compact"
                          onClick={() => window.forge.openAIProviderLogin('codex').then(refreshAIStatus).catch(console.error)}
                        >
                          <Terminal size={14} />
                          Open login
                        </button>
                        <CopyButton value={aiStatus?.codex.setupCommand ?? 'codex login'} label="Copy login" />
                        <button className="btn btn-compact" onClick={() => openExternalUrl(aiStatus?.codex.docsUrl ?? 'https://developers.openai.com/codex/auth')}>
                          <ExternalLink size={14} />
                          Docs
                        </button>
                      </div>
                    </div>

                    <div className="ai-provider-card">
                      <div className="ai-provider-head">
                        <span className="ai-provider-icon">
                          <Terminal size={16} />
                        </span>
                        <span>
                          <strong>Claude Code</strong>
                          <small>Subscription access through MCP</small>
                        </span>
                        <span className={`ai-status-pill ${aiStatus?.claude.installed ? 'neutral' : 'warn'}`}>
                          {aiStatus?.claude.installed ? 'Installed' : 'Needs setup'}
                        </span>
                      </div>
                      <p>{aiStatus?.claude.detail ?? 'Checking Claude Code...'}</p>
                      <div className="ai-meta-grid">
                        <span>CLI</span>
                        <code>{aiStatus?.claude.path ?? 'Not found'}</code>
                        <span>Version</span>
                        <code>{aiStatus?.claude.version ?? 'Unknown'}</code>
                      </div>
                      <div className="publish-warning compact">
                        <AlertCircle size={14} />
                        <span>Forge does not route prompts through Claude.ai Free, Pro, or Max credentials.</span>
                      </div>
                      <div className="ai-card-actions">
                        <button
                          className="btn btn-compact"
                          onClick={() => window.forge.openAIProviderLogin('claude').then(refreshAIStatus).catch(console.error)}
                        >
                          <Terminal size={14} />
                          Open login
                        </button>
                        <CopyButton value={aiStatus?.claude.setupCommand ?? 'claude'} label="Copy login" />
                        <CopyButton value={claudeCodeCommand} label="Copy MCP" disabled={!claudeCodeCommand} />
                        <button className="btn btn-compact" onClick={() => openExternalUrl(aiStatus?.claude.docsUrl ?? 'https://code.claude.com/docs/en/iam')}>
                          <ExternalLink size={14} />
                          Docs
                        </button>
                      </div>
                    </div>

                    <div className="ai-provider-card">
                      <div className="ai-provider-head">
                        <span className="ai-provider-icon">
                          <KeyRound size={16} />
                        </span>
                        <span>
                          <strong>OpenAI API</strong>
                          <small>Bring your own API key</small>
                        </span>
                        <span className={`ai-status-pill ${aiStatus?.openai.configured ? 'good' : 'warn'}`}>
                          {aiStatus?.openai.configured ? 'Saved' : 'No key'}
                        </span>
                      </div>
                      <p>Direct text generation through the Responses API. Usage is billed to the user’s OpenAI Platform account.</p>
                      <div className="ai-meta-grid">
                        <span>Storage</span>
                        <code>{aiStatus?.safeStorageAvailable ? 'Encrypted on device' : 'Unavailable'}</code>
                        <span>Updated</span>
                        <code>{dateStamp(aiStatus?.openai.updatedAt ?? null)}</code>
                      </div>
                      <label className="publish-field">
                        <span>Model</span>
                        <input
                          className="settings-text-input"
                          value={aiSettings.openaiModel}
                          onChange={(event) => updateAISettings(updateAIModel(aiSettings, 'openai', event.target.value))}
                        />
                      </label>
                      <label className="publish-field">
                        <span>API key</span>
                        <input
                          className="settings-text-input"
                          type="password"
                          placeholder={aiStatus?.openai.configured ? 'Key saved' : 'sk-...'}
                          value={aiSecrets.openaiApiKey}
                          onChange={(event) => setAISecrets((current) => ({ ...current, openaiApiKey: event.target.value }))}
                        />
                      </label>
                      <div className="ai-card-actions">
                        <button
                          className="btn btn-compact"
                          disabled={!aiSecrets.openaiApiKey.trim() || aiSaveState === 'saving'}
                          onClick={() => saveProviderKey('openai')}
                        >
                          <LockKeyhole size={14} />
                          Save key
                        </button>
                        <button
                          className="btn btn-compact"
                          disabled={!aiStatus?.openai.configured || aiSaveState === 'saving'}
                          onClick={() => clearProviderKey('openai')}
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="ai-provider-card">
                      <div className="ai-provider-head">
                        <span className="ai-provider-icon">
                          <KeyRound size={16} />
                        </span>
                        <span>
                          <strong>Anthropic API</strong>
                          <small>Bring your own API key</small>
                        </span>
                        <span className={`ai-status-pill ${aiStatus?.anthropic.configured ? 'good' : 'warn'}`}>
                          {aiStatus?.anthropic.configured ? 'Saved' : 'No key'}
                        </span>
                      </div>
                      <p>Direct Claude API calls from Forge. This is the compliant path for in-app Claude-powered prompting.</p>
                      <div className="ai-meta-grid">
                        <span>Storage</span>
                        <code>{aiStatus?.safeStorageAvailable ? 'Encrypted on device' : 'Unavailable'}</code>
                        <span>Updated</span>
                        <code>{dateStamp(aiStatus?.anthropic.updatedAt ?? null)}</code>
                      </div>
                      <label className="publish-field">
                        <span>Model</span>
                        <input
                          className="settings-text-input"
                          value={aiSettings.anthropicModel}
                          onChange={(event) => updateAISettings(updateAIModel(aiSettings, 'anthropic', event.target.value))}
                        />
                      </label>
                      <label className="publish-field">
                        <span>API key</span>
                        <input
                          className="settings-text-input"
                          type="password"
                          placeholder={aiStatus?.anthropic.configured ? 'Key saved' : 'sk-ant-...'}
                          value={aiSecrets.anthropicApiKey}
                          onChange={(event) => setAISecrets((current) => ({ ...current, anthropicApiKey: event.target.value }))}
                        />
                      </label>
                      <div className="ai-card-actions">
                        <button
                          className="btn btn-compact"
                          disabled={!aiSecrets.anthropicApiKey.trim() || aiSaveState === 'saving'}
                          onClick={() => saveProviderKey('anthropic')}
                        >
                          <LockKeyhole size={14} />
                          Save key
                        </button>
                        <button
                          className="btn btn-compact"
                          disabled={!aiStatus?.anthropic.configured || aiSaveState === 'saving'}
                          onClick={() => clearProviderKey('anthropic')}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>

                  {aiSaveState !== 'idle' && (
                    <div className={`static-publish-status ${aiSaveState === 'failed' ? 'failed' : aiSaveState === 'saved' ? 'done' : 'publishing'}`}>
                      {aiSaveState === 'failed' ? <AlertCircle size={14} /> : aiSaveState === 'saved' ? <Check size={14} /> : <RefreshCw size={14} />}
                      <span>{aiSaveState === 'saving' ? 'Saving key...' : aiSaveState === 'saved' ? 'AI settings saved.' : 'Could not save AI settings.'}</span>
                    </div>
                  )}

                  <div className="settings-callout ai-task-card">
                    <div className="ai-task-header">
                      <div>
                        <div className="settings-row-label">Prompt current note</div>
                        <div className="settings-row-desc">Run a local Codex or API-backed text task without changing files automatically.</div>
                      </div>
                      <button className="btn btn-compact" onClick={() => refreshAIStatus().catch(console.error)}>
                        <RefreshCw size={14} />
                        Refresh status
                      </button>
                    </div>

                    <div className="ai-provider-selector">
                      {(['codex', 'openai', 'anthropic'] as AITextProvider[]).map((provider) => (
                        <button
                          key={provider}
                          className={aiTaskProvider === provider ? 'active' : ''}
                          onClick={() => {
                            setAITaskProvider(provider)
                            updateAISettings({ ...aiSettings, defaultProvider: provider })
                          }}
                        >
                          {provider === 'codex' ? <Sparkles size={14} /> : <KeyRound size={14} />}
                          <span>{aiProviderLabel(provider)}</span>
                        </button>
                      ))}
                    </div>

                    <label className="publish-field">
                      <span>Prompt</span>
                      <textarea
                        className="settings-textarea ai-prompt-input"
                        value={aiPrompt}
                        onChange={(event) => setAIPrompt(event.target.value)}
                      />
                    </label>

                    <div className="ai-task-options">
                      <label className="publish-option compact">
                        <input
                          type="checkbox"
                          checked={aiSettings.includeActiveNote}
                          onChange={(event) => updateAISettings({ ...aiSettings, includeActiveNote: event.target.checked })}
                        />
                        <span>
                          <strong>Include active note</strong>
                          <small>{currentTab?.kind === 'note' && currentTab.path ? currentTab.path : 'No active note open'}</small>
                        </span>
                      </label>
                      <button className="btn" disabled={!aiPrompt.trim() || aiTaskState === 'running'} onClick={() => runAITask()}>
                        {aiTaskState === 'running' ? <RefreshCw size={14} /> : <Sparkles size={14} />}
                        {aiTaskState === 'running' ? 'Running' : `Run ${aiProviderLabel(aiTaskProvider)}`}
                      </button>
                    </div>

                    {aiTaskMessage && (
                      <div className={`static-publish-status ${aiTaskState === 'failed' ? 'failed' : aiTaskState === 'done' ? 'done' : 'publishing'}`}>
                        {aiTaskState === 'failed' ? <AlertCircle size={14} /> : aiTaskState === 'done' ? <Check size={14} /> : <RefreshCw size={14} />}
                        <span>{aiTaskMessage}</span>
                      </div>
                    )}

                    {aiTaskResult && (
                      <div className="ai-result-block">
                        <div className="ai-result-head">
                          <strong>Result</strong>
                          <CopyButton value={aiTaskResult} label="Copy result" />
                        </div>
                        <pre>{aiTaskResult}</pre>
                      </div>
                    )}
                  </div>

                  {aiStatus?.notes.length ? (
                    <div className="ai-notes">
                      {aiStatus.notes.map((note) => (
                        <div key={note}>
                          <AlertCircle size={13} />
                          <span>{note}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
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
