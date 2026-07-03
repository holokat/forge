import {
  DEFAULT_PUBLISH_SITE_INTEGRATIONS,
  type PublishSiteConfig,
  type PublishVaultOptions
} from '../../../shared/types'

export function slugifySiteName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'site'
  )
}

export function defaultPublishSiteDir(vault: string, name: string): string {
  return `${vault.replace(/[\\/]+$/, '')}/.forge/sites/${slugifySiteName(name)}`
}

export function outputIndexPath(outputDir: string): string {
  const clean = outputDir.replace(/[\\/]+$/, '')
  const separator = clean.includes('\\') && !clean.includes('/') ? '\\' : '/'
  return `${clean}${separator}index.html`
}

export function createDefaultPublishSiteIntegrations(): PublishSiteConfig['integrations'] {
  return structuredClone(DEFAULT_PUBLISH_SITE_INTEGRATIONS)
}

export function createPublishSite(
  vault: string,
  name: string,
  scope: PublishSiteConfig['scope'] = { kind: 'vault' }
): PublishSiteConfig {
  const now = new Date().toISOString()
  return {
    id: `site-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description: scope.kind === 'folder' ? `Published notes from ${scope.folder}.` : 'Published notes from this Forge vault.',
    theme: 'minimal',
    scope,
    outputDir: defaultPublishSiteDir(vault, scope.kind === 'folder' ? scope.folder : name),
    options: {
      clean: true,
      showTags: true,
      showBacklinks: true
    },
    integrations: createDefaultPublishSiteIntegrations(),
    createdAt: now,
    updatedAt: now
  }
}

export function siteScopeLabel(site: PublishSiteConfig): string {
  return site.scope.kind === 'folder' ? site.scope.folder : 'All folders'
}

export function publishVaultOptionsForSite(site: PublishSiteConfig): PublishVaultOptions {
  return {
    title: site.name,
    description: site.description,
    theme: site.theme,
    scopePath: site.scope.kind === 'folder' ? site.scope.folder : '',
    clean: site.options.clean,
    showTags: site.options.showTags,
    showBacklinks: site.options.showBacklinks,
    integrations: site.integrations
  }
}

export function publishSiteForPath(path: string, sites: PublishSiteConfig[]): PublishSiteConfig | null {
  const candidates = sites.filter((site) => {
    if (site.scope.kind === 'vault') return true
    return path === site.scope.folder || path.startsWith(`${site.scope.folder}/`)
  })
  candidates.sort((a, b) => {
    const aDepth = a.scope.kind === 'folder' ? a.scope.folder.length : -1
    const bDepth = b.scope.kind === 'folder' ? b.scope.folder.length : -1
    return bDepth - aDepth
  })
  return candidates[0] ?? null
}
