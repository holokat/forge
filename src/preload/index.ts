import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Settings, ForgeAPI, ThemeMode, UpdateStatus } from '../shared/types'

const api: ForgeAPI = {
  selectVault: () => ipcRenderer.invoke('dialog:selectVault'),
  openVault: (vault) => ipcRenderer.invoke('vault:open', vault),
  readFile: (vault, rel) => ipcRenderer.invoke('file:read', vault, rel),
  writeFile: (vault, rel, content) => ipcRenderer.invoke('file:write', vault, rel, content),
  createFile: (vault, rel, content) => ipcRenderer.invoke('file:create', vault, rel, content),
  rename: (vault, oldRel, newRel) => ipcRenderer.invoke('file:rename', vault, oldRel, newRel),
  trash: (vault, rel) => ipcRenderer.invoke('file:trash', vault, rel),
  createFolder: (vault, rel) => ipcRenderer.invoke('folder:create', vault, rel),
  reveal: (vault, rel) => ipcRenderer.invoke('file:reveal', vault, rel),
  readSettings: () => ipcRenderer.invoke('settings:read'),
  writeSettings: (settings: Settings) => ipcRenderer.invoke('settings:write', settings),
  getAgentAccessInfo: () => ipcRenderer.invoke('agent:getAccessInfo'),
  getAIStatus: () => ipcRenderer.invoke('ai:getStatus'),
  saveAISettings: (settings, secrets) => ipcRenderer.invoke('ai:saveSettings', settings, secrets),
  runAITextTask: (request) => ipcRenderer.invoke('ai:runTextTask', request),
  openAIProviderLogin: (provider) => ipcRenderer.invoke('ai:openProviderLogin', provider),
  copyText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  droppedFilePaths: (files) =>
    files
      .map((file) => {
        try {
          return webUtils.getPathForFile(file as never)
        } catch {
          return ''
        }
      })
      .filter((path): path is string => Boolean(path)),
  getMobilePairingInfo: () => ipcRenderer.invoke('mobile:getPairingInfo'),
  resetMobilePairingToken: () => ipcRenderer.invoke('mobile:resetPairingToken'),
  setMobileVault: (vault) => ipcRenderer.invoke('mobile:setVault', vault),
  importAttachments: (vault, noteRel, sourcePaths) => ipcRenderer.invoke('file:importAttachments', vault, noteRel, sourcePaths),
  importMedia: (vault, sourcePaths) => ipcRenderer.invoke('file:importMedia', vault, sourcePaths),
  publishVault: (vault, outDir, options) => ipcRenderer.invoke('vault:publish', vault, outDir, options),
  getUpdateStatus: () => ipcRenderer.invoke('updates:getStatus'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  consumePendingReleaseNotes: () => ipcRenderer.invoke('updates:consumePendingReleaseNotes'),
  onUpdateStatus: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void => cb(status)
    ipcRenderer.on('updates:status', listener)
    return () => ipcRenderer.removeListener('updates:status', listener)
  },
  setThemeSource: (mode: ThemeMode) => ipcRenderer.invoke('theme:setSource', mode),
  watchVault: (vault) => ipcRenderer.invoke('vault:watch', vault),
  onVaultChanged: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('vault:changed', listener)
    return () => ipcRenderer.removeListener('vault:changed', listener)
  },
  assetUrl: (vault, rel) => `forge-asset://v/${encodeURIComponent(vault + '/' + rel)}`
}

contextBridge.exposeInMainWorld('forge', api)
