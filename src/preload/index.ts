import { contextBridge, ipcRenderer } from 'electron'
import type { Settings, ForgeAPI, ThemeMode } from '../shared/types'

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
  copyText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  getMobilePairingInfo: () => ipcRenderer.invoke('mobile:getPairingInfo'),
  resetMobilePairingToken: () => ipcRenderer.invoke('mobile:resetPairingToken'),
  setMobileVault: (vault) => ipcRenderer.invoke('mobile:setVault', vault),
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
