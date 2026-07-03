import { FolderOpen } from 'lucide-react'
import { useStore } from '../store'
import { ForgeAppLogo } from './ForgeLogo'

export default function VaultPicker(): React.JSX.Element {
  const recentVaults = useStore((s) => s.recentVaults)
  const openVaultDialog = useStore((s) => s.openVaultDialog)
  const openVaultPath = useStore((s) => s.openVaultPath)

  return (
    <div className="vault-picker">
      <div className="vault-picker-drag" />
      <div className="vault-picker-card">
        <div className="vault-picker-logo">
          <ForgeAppLogo size={68} />
        </div>
        <h1>Forge</h1>
        <p className="vault-picker-tagline">Your thoughts, connected. Plain Markdown, on your Mac.</p>

        <button className="btn btn-primary btn-large" onClick={() => openVaultDialog()}>
          <FolderOpen size={16} />
          Open vault
        </button>
        <p className="vault-picker-hint">
          A vault is just a folder of Markdown files.
          <br />
          Pick an empty folder to start fresh.
        </p>

        {recentVaults.length > 0 && (
          <div className="vault-picker-recents">
            <div className="vault-picker-recents-label">Recent vaults</div>
            {recentVaults.map((vault) => (
              <button key={vault} className="vault-picker-recent" onClick={() => openVaultPath(vault).catch(console.error)}>
                <span className="vault-picker-recent-name">{vault.split('/').pop()}</span>
                <span className="vault-picker-recent-path">{vault.replace(/^\/Users\/[^/]+/, '~')}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
