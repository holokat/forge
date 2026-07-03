import type {
  ExtensionCategory,
  ExtensionContributionKind,
  ExtensionManifest,
  ExtensionPermissionKind,
  ExtensionPointDefinition,
  ExtensionRegistry,
  ExtensionRegistryDocument
} from './manifest'

export type ExtensionValidationSeverity = 'error' | 'warning'

export interface ExtensionValidationIssue {
  severity: ExtensionValidationSeverity
  code: string
  message: string
  path?: string
}

export interface ExtensionValidationResult {
  valid: boolean
  issues: ExtensionValidationIssue[]
}

export interface ExtensionRegistryDocumentValidationResult extends ExtensionValidationResult {
  document: ExtensionRegistryDocument | null
}

const EXTENSION_ID_RE = /^[a-z0-9][a-z0-9.-]*$/
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

const CATEGORIES = new Set<ExtensionCategory>([
  'capture',
  'editing',
  'navigation',
  'organization',
  'publishing',
  'visualization'
])

const PERMISSIONS = new Set<ExtensionPermissionKind>([
  'clipboard:write',
  'settings:read',
  'vault:metadata',
  'vault:read',
  'vault:write',
  'workspace:ui'
])

const CONTRIBUTION_KINDS = new Set<ExtensionContributionKind>([
  'command',
  'markdown-transform',
  'metadata-provider',
  'sidebar-widget',
  'view'
])

const MARKDOWN_TRANSFORMS = new Set([
  'append-template',
  'normalize-headings',
  'wrap-selection',
  'lines-to-checklist',
  'sort-lines',
  'callout',
  'insert-table-of-contents'
])
const SIDEBAR_WIDGETS = new Set([
  'reading-stats',
  'daily-note',
  'audio',
  'frontmatter',
  'outline',
  'backlinks',
  'unlinked-mentions',
  'tags',
  'tasks',
  'media-gallery',
  'link-health',
  'publish-checklist'
])
const VIEWS = new Set(['graph-insights', 'outline-board', 'tasks', 'vault-health'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function issue(
  issues: ExtensionValidationIssue[],
  severity: ExtensionValidationSeverity,
  code: string,
  message: string,
  path?: string
): void {
  issues.push({ severity, code, message, path })
}

function stringValue(value: unknown, issues: ExtensionValidationIssue[], path: string): string {
  if (typeof value === 'string' && value.trim()) return value
  issue(issues, 'error', 'required_string', `${path} must be a non-empty string.`, path)
  return ''
}

function stringArray(value: unknown, issues: ExtensionValidationIssue[], path: string): string[] {
  if (!Array.isArray(value)) {
    issue(issues, 'error', 'required_array', `${path} must be an array.`, path)
    return []
  }

  const result: string[] = []
  value.forEach((item, index) => {
    if (typeof item === 'string' && item.trim()) {
      result.push(item)
    } else {
      issue(issues, 'error', 'array_string', `${path}[${index}] must be a non-empty string.`, `${path}[${index}]`)
    }
  })
  return result
}

function validateRuntime(value: unknown, issues: ExtensionValidationIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, 'error', 'runtime_required', 'runtime must be an object.', 'runtime')
    return
  }

  if (value.kind !== 'declarative') {
    issue(issues, 'error', 'runtime_kind', 'Only declarative extensions are supported.', 'runtime.kind')
  }
  if (value.networkAccess !== false) {
    issue(issues, 'error', 'runtime_network', 'networkAccess must be false.', 'runtime.networkAccess')
  }
  if (value.arbitraryCode !== false) {
    issue(issues, 'error', 'runtime_code', 'arbitraryCode must be false.', 'runtime.arbitraryCode')
  }
  if (!Array.isArray(value.allowedHosts) || value.allowedHosts.length !== 0) {
    issue(issues, 'error', 'runtime_hosts', 'allowedHosts must be an empty array.', 'runtime.allowedHosts')
  }
}

function validateSource(value: unknown, issues: ExtensionValidationIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, 'error', 'source_required', 'source must be an object.', 'source')
    return
  }

  if (value.kind !== 'built-in' && value.kind !== 'local-folder') {
    issue(issues, 'error', 'source_kind', 'source.kind must be built-in or local-folder.', 'source.kind')
  }
  stringValue(value.label, issues, 'source.label')
  if (value.path !== undefined && typeof value.path !== 'string') {
    issue(issues, 'error', 'source_path', 'source.path must be a string when present.', 'source.path')
  }
}

function validatePermissions(value: unknown, issues: ExtensionValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issue(issues, 'error', 'permissions_required', 'permissions must be an array.', 'permissions')
    return
  }

  value.forEach((item, index) => {
    const path = `permissions[${index}]`
    if (!isRecord(item)) {
      issue(issues, 'error', 'permission_object', `${path} must be an object.`, path)
      return
    }
    if (typeof item.kind !== 'string' || !PERMISSIONS.has(item.kind as ExtensionPermissionKind)) {
      issue(issues, 'error', 'permission_kind', `${path}.kind is not a supported permission.`, `${path}.kind`)
    }
    stringValue(item.reason, issues, `${path}.reason`)
    if (item.optional !== undefined && typeof item.optional !== 'boolean') {
      issue(issues, 'error', 'permission_optional', `${path}.optional must be boolean when present.`, `${path}.optional`)
    }
  })
}

function validateExtensionPoints(
  value: unknown,
  pointById: Map<string, ExtensionPointDefinition>,
  issues: ExtensionValidationIssue[]
): Set<string> {
  const declared = new Set<string>()
  if (!Array.isArray(value)) {
    issue(issues, 'error', 'extension_points_required', 'extensionPoints must be an array.', 'extensionPoints')
    return declared
  }

  value.forEach((item, index) => {
    const path = `extensionPoints[${index}]`
    if (!isRecord(item)) {
      issue(issues, 'error', 'extension_point_object', `${path} must be an object.`, path)
      return
    }
    const id = stringValue(item.id, issues, `${path}.id`)
    stringValue(item.label, issues, `${path}.label`)
    if (id) {
      declared.add(id)
      if (!pointById.has(id)) {
        issue(issues, 'error', 'unknown_extension_point', `Unknown extension point "${id}".`, `${path}.id`)
      }
    }
  })
  return declared
}

function validateContributionShape(
  contribution: Record<string, unknown>,
  index: number,
  issues: ExtensionValidationIssue[]
): void {
  const path = `contributes[${index}]`
  if (contribution.kind === 'command') {
    stringValue(contribution.command, issues, `${path}.command`)
    return
  }
  if (contribution.kind === 'markdown-transform') {
    if (typeof contribution.transform !== 'string' || !MARKDOWN_TRANSFORMS.has(contribution.transform)) {
      issue(issues, 'error', 'markdown_transform', `${path}.transform is not supported.`, `${path}.transform`)
    }
    return
  }
  if (contribution.kind === 'metadata-provider') {
    stringArray(contribution.fields, issues, `${path}.fields`)
    return
  }
  if (contribution.kind === 'sidebar-widget') {
    if (typeof contribution.widget !== 'string' || !SIDEBAR_WIDGETS.has(contribution.widget)) {
      issue(issues, 'error', 'sidebar_widget', `${path}.widget is not supported.`, `${path}.widget`)
    }
    return
  }
  if (contribution.kind === 'view') {
    if (typeof contribution.view !== 'string' || !VIEWS.has(contribution.view)) {
      issue(issues, 'error', 'view', `${path}.view is not supported.`, `${path}.view`)
    }
  }
}

function validateContributions(
  value: unknown,
  pointById: Map<string, ExtensionPointDefinition>,
  declaredPoints: Set<string>,
  issues: ExtensionValidationIssue[]
): void {
  if (!Array.isArray(value)) {
    issue(issues, 'error', 'contributes_required', 'contributes must be an array.', 'contributes')
    return
  }

  const ids = new Set<string>()
  value.forEach((item, index) => {
    const path = `contributes[${index}]`
    if (!isRecord(item)) {
      issue(issues, 'error', 'contribution_object', `${path} must be an object.`, path)
      return
    }

    const id = stringValue(item.id, issues, `${path}.id`)
    const extensionPoint = stringValue(item.extensionPoint, issues, `${path}.extensionPoint`)
    const kind = stringValue(item.kind, issues, `${path}.kind`) as ExtensionContributionKind
    stringValue(item.label, issues, `${path}.label`)
    if (item.description !== undefined && typeof item.description !== 'string') {
      issue(issues, 'error', 'contribution_description', `${path}.description must be a string.`, `${path}.description`)
    }

    if (id) {
      if (ids.has(id)) issue(issues, 'error', 'duplicate_contribution', `Duplicate contribution id "${id}".`, `${path}.id`)
      ids.add(id)
    }

    if (kind && !CONTRIBUTION_KINDS.has(kind)) {
      issue(issues, 'error', 'contribution_kind', `${path}.kind is not supported.`, `${path}.kind`)
    }

    const point = pointById.get(extensionPoint)
    if (!point) {
      issue(issues, 'error', 'unknown_contribution_point', `Unknown contribution point "${extensionPoint}".`, `${path}.extensionPoint`)
    } else if (kind && !point.allowedContributionKinds.includes(kind)) {
      issue(
        issues,
        'error',
        'contribution_kind_mismatch',
        `${path}.kind "${kind}" is not allowed for ${extensionPoint}.`,
        `${path}.kind`
      )
    }

    if (extensionPoint && !declaredPoints.has(extensionPoint)) {
      issue(
        issues,
        'warning',
        'undeclared_contribution_point',
        `${path} contributes to ${extensionPoint} but the manifest does not list it in extensionPoints.`,
        `${path}.extensionPoint`
      )
    }

    validateContributionShape(item, index, issues)
  })
}

export function validateExtensionManifest(
  manifest: unknown,
  points: readonly ExtensionPointDefinition[]
): ExtensionValidationResult {
  const issues: ExtensionValidationIssue[] = []
  const pointById = new Map(points.map((point) => [point.id, point]))

  if (!isRecord(manifest)) {
    return {
      valid: false,
      issues: [{ severity: 'error', code: 'manifest_object', message: 'Manifest must be an object.' }]
    }
  }

  if (manifest.manifestVersion !== 1) {
    issue(issues, 'error', 'manifest_version', 'manifestVersion must be 1.', 'manifestVersion')
  }

  const id = stringValue(manifest.id, issues, 'id')
  if (id && !EXTENSION_ID_RE.test(id)) {
    issue(issues, 'error', 'extension_id', 'id must use lowercase letters, numbers, dots, or hyphens.', 'id')
  }
  stringValue(manifest.name, issues, 'name')
  stringValue(manifest.displayName, issues, 'displayName')
  stringValue(manifest.description, issues, 'description')

  const version = stringValue(manifest.version, issues, 'version')
  if (version && !SEMVER_RE.test(version)) {
    issue(issues, 'error', 'semver', 'version must be semver, for example 1.0.0.', 'version')
  }

  stringValue(manifest.publisher, issues, 'publisher')
  stringValue(manifest.license, issues, 'license')

  if (manifest.repository !== undefined && typeof manifest.repository !== 'string') {
    issue(issues, 'error', 'repository', 'repository must be a string when present.', 'repository')
  }
  if (manifest.homepage !== undefined && typeof manifest.homepage !== 'string') {
    issue(issues, 'error', 'homepage', 'homepage must be a string when present.', 'homepage')
  }

  for (const category of stringArray(manifest.categories, issues, 'categories')) {
    if (!CATEGORIES.has(category as ExtensionCategory)) {
      issue(issues, 'error', 'category', `Unsupported category "${category}".`, 'categories')
    }
  }
  stringArray(manifest.keywords, issues, 'keywords')

  validateSource(manifest.source, issues)
  validateRuntime(manifest.runtime, issues)
  const declaredPoints = validateExtensionPoints(manifest.extensionPoints, pointById, issues)
  validatePermissions(manifest.permissions, issues)
  validateContributions(manifest.contributes, pointById, declaredPoints, issues)

  if (manifest.defaultInstalled !== undefined && typeof manifest.defaultInstalled !== 'boolean') {
    issue(issues, 'error', 'default_installed', 'defaultInstalled must be boolean when present.', 'defaultInstalled')
  }
  if (manifest.defaultEnabled !== undefined && typeof manifest.defaultEnabled !== 'boolean') {
    issue(issues, 'error', 'default_enabled', 'defaultEnabled must be boolean when present.', 'defaultEnabled')
  }

  return { valid: !issues.some((item) => item.severity === 'error'), issues }
}

export function validateExtensionRegistry(registry: ExtensionRegistry): ExtensionValidationResult {
  const issues: ExtensionValidationIssue[] = []
  const pointIds = new Set<string>()

  for (const point of registry.points) {
    if (pointIds.has(point.id)) {
      issue(issues, 'error', 'duplicate_extension_point', `Duplicate extension point "${point.id}".`, 'points')
    }
    pointIds.add(point.id)
  }

  const manifestIds = new Set<string>()
  for (const manifest of registry.manifests) {
    if (manifestIds.has(manifest.id)) {
      issue(issues, 'error', 'duplicate_manifest', `Duplicate extension id "${manifest.id}".`, manifest.id)
    }
    manifestIds.add(manifest.id)

    const result = validateExtensionManifest(manifest, registry.points)
    for (const manifestIssue of result.issues) {
      issues.push({
        ...manifestIssue,
        path: manifestIssue.path ? `${manifest.id}.${manifestIssue.path}` : manifest.id
      })
    }
  }

  return { valid: !issues.some((item) => item.severity === 'error'), issues }
}

export function validateExtensionRegistryDocument(value: unknown): ExtensionRegistryDocumentValidationResult {
  const issues: ExtensionValidationIssue[] = []
  if (!isRecord(value)) {
    issue(issues, 'error', 'registry_document', 'Registry document must be an object.')
    return { valid: false, issues, document: null }
  }

  if (value.schemaVersion !== 1) {
    issue(issues, 'error', 'registry_schema_version', 'schemaVersion must be 1.', 'schemaVersion')
  }
  stringValue(value.generatedAt, issues, 'generatedAt')
  if (value.minForgeVersion !== undefined && typeof value.minForgeVersion !== 'string') {
    issue(issues, 'error', 'registry_min_forge_version', 'minForgeVersion must be a string when present.', 'minForgeVersion')
  }

  if (!Array.isArray(value.signatures) || value.signatures.length === 0) {
    issue(issues, 'error', 'registry_signatures_required', 'Signed registries must include at least one signature.', 'signatures')
  } else {
    value.signatures.forEach((signature, index) => {
      const path = `signatures[${index}]`
      if (!isRecord(signature)) {
        issue(issues, 'error', 'registry_signature_object', `${path} must be an object.`, path)
        return
      }
      if (signature.algorithm !== 'ed25519') {
        issue(issues, 'error', 'registry_signature_algorithm', `${path}.algorithm must be ed25519.`, `${path}.algorithm`)
      }
      stringValue(signature.keyId, issues, `${path}.keyId`)
      stringValue(signature.signature, issues, `${path}.signature`)
      stringValue(signature.signedPayloadSha256, issues, `${path}.signedPayloadSha256`)
      if (signature.signedAt !== undefined && typeof signature.signedAt !== 'string') {
        issue(issues, 'error', 'registry_signature_signed_at', `${path}.signedAt must be a string when present.`, `${path}.signedAt`)
      }
    })
  }

  if (!isRecord(value.registry)) {
    issue(issues, 'error', 'registry_required', 'registry must be an object.', 'registry')
  } else {
    const result = validateExtensionRegistry(value.registry as unknown as ExtensionRegistry)
    for (const registryIssue of result.issues) {
      issue(
        issues,
        registryIssue.severity,
        registryIssue.code,
        registryIssue.message,
        registryIssue.path ? `registry.${registryIssue.path}` : 'registry'
      )
    }
  }

  return {
    valid: !issues.some((item) => item.severity === 'error'),
    issues,
    document: value as unknown as ExtensionRegistryDocument
  }
}

export function formatExtensionIssue(issue: ExtensionValidationIssue): string {
  const prefix = issue.severity === 'error' ? 'Error' : 'Warning'
  return issue.path ? `${prefix}: ${issue.path}: ${issue.message}` : `${prefix}: ${issue.message}`
}
