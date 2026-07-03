import { DEFAULT_SETTINGS, type ExtensionInstallPreference, type ExtensionSettings } from '../../../shared/types'
import { LOCAL_EXTENSION_MANIFESTS } from './registry'

const KNOWN_EXTENSION_IDS = new Set(LOCAL_EXTENSION_MANIFESTS.map((manifest) => manifest.id))

export function normalizeExtensionSettings(
  settings: ExtensionSettings | undefined,
  enabledExtensions: string[] = []
): ExtensionSettings {
  const entries: Record<string, ExtensionInstallPreference> = {}

  for (const manifest of LOCAL_EXTENSION_MANIFESTS) {
    if (!manifest.defaultInstalled) continue
    entries[manifest.id] = {
      installed: true,
      enabled: manifest.defaultEnabled ?? true,
      installedAt: null,
      updatedAt: null
    }
  }

  for (const [id, entry] of Object.entries(settings?.entries ?? {})) {
    if (!KNOWN_EXTENSION_IDS.has(id)) continue
    entries[id] = {
      installed: Boolean(entry.installed),
      enabled: Boolean(entry.installed && entry.enabled),
      installedAt: entry.installedAt ?? null,
      updatedAt: entry.updatedAt ?? null
    }
  }

  for (const id of enabledExtensions) {
    if (!KNOWN_EXTENSION_IDS.has(id)) continue
    if (entries[id]) continue
    entries[id] = {
      installed: true,
      enabled: true,
      installedAt: null,
      updatedAt: null
    }
  }

  return {
    schemaVersion: 1,
    registry: 'local',
    entries
  }
}

export function extensionEntry(settings: ExtensionSettings, id: string): ExtensionInstallPreference {
  return (
    settings.entries[id] ?? {
      installed: false,
      enabled: false,
      installedAt: null,
      updatedAt: null
    }
  )
}

export function enabledExtensionIds(settings: ExtensionSettings): string[] {
  return Object.entries(settings.entries)
    .filter(([, entry]) => entry.installed && entry.enabled)
    .map(([id]) => id)
    .sort()
}

export function createDefaultExtensionSettings(): ExtensionSettings {
  return normalizeExtensionSettings(DEFAULT_SETTINGS.extensionSettings, DEFAULT_SETTINGS.enabledExtensions)
}

export function withExtensionInstalled(settings: ExtensionSettings, id: string, installed: boolean): ExtensionSettings {
  const normalized = normalizeExtensionSettings(settings)
  if (!KNOWN_EXTENSION_IDS.has(id)) return normalized
  const current = extensionEntry(normalized, id)
  const now = new Date().toISOString()
  const nextEntry: ExtensionInstallPreference = {
    installed,
    enabled: installed ? current.enabled || !current.installed : false,
    installedAt: installed ? current.installedAt ?? now : current.installedAt,
    updatedAt: now
  }

  return {
    ...normalized,
    entries: {
      ...normalized.entries,
      [id]: nextEntry
    }
  }
}

export function withExtensionEnabled(settings: ExtensionSettings, id: string, enabled: boolean): ExtensionSettings {
  const normalized = normalizeExtensionSettings(settings)
  if (!KNOWN_EXTENSION_IDS.has(id)) return normalized
  const current = extensionEntry(normalized, id)
  if (!current.installed) return normalized

  return {
    ...normalized,
    entries: {
      ...normalized.entries,
      [id]: {
        ...current,
        enabled,
        updatedAt: new Date().toISOString()
      }
    }
  }
}
