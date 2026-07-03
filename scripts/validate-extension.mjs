#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { extensionPointDefinitions } from './lib/agent-catalog.mjs'

const MANIFEST_FILE = 'forge-extension.json'

const POINTS = extensionPointDefinitions().map((point) => ({
  id: point.id,
  allowed: point.allowedContributionKinds
}))

const CATEGORIES = new Set(['capture', 'editing', 'navigation', 'organization', 'publishing', 'visualization'])
const PERMISSIONS = new Set(['clipboard:write', 'settings:read', 'vault:metadata', 'vault:read', 'vault:write', 'workspace:ui'])
const CONTRIBUTION_KINDS = new Set(['command', 'markdown-transform', 'metadata-provider', 'sidebar-widget', 'view'])
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
const VIEWS = new Set(['graph-insights'])
const ID_RE = /^[a-z0-9][a-z0-9.-]*$/
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

function usage() {
  console.log(`Usage: npm run extensions:validate -- <path> [path...] [--json] [--recursive]

Validates Forge declarative extension manifests. A path may point to a ${MANIFEST_FILE}
file or a folder containing one. --recursive discovers manifests in child folders.`)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function push(issues, severity, code, message, field) {
  issues.push({ severity, code, message, path: field })
}

function stringValue(value, issues, field) {
  if (typeof value === 'string' && value.trim()) return value
  push(issues, 'error', 'required_string', `${field} must be a non-empty string.`, field)
  return ''
}

function stringArray(value, issues, field) {
  if (!Array.isArray(value)) {
    push(issues, 'error', 'required_array', `${field} must be an array.`, field)
    return []
  }
  const result = []
  value.forEach((item, index) => {
    if (typeof item === 'string' && item.trim()) {
      result.push(item)
    } else {
      push(issues, 'error', 'array_string', `${field}[${index}] must be a non-empty string.`, `${field}[${index}]`)
    }
  })
  return result
}

function validateManifest(manifest) {
  const issues = []
  const pointById = new Map(POINTS.map((point) => [point.id, point]))

  if (!isRecord(manifest)) {
    return { valid: false, issues: [{ severity: 'error', code: 'manifest_object', message: 'Manifest must be an object.' }] }
  }

  if (manifest.manifestVersion !== 1) push(issues, 'error', 'manifest_version', 'manifestVersion must be 1.', 'manifestVersion')
  const id = stringValue(manifest.id, issues, 'id')
  if (id && !ID_RE.test(id)) push(issues, 'error', 'extension_id', 'id must use lowercase letters, numbers, dots, or hyphens.', 'id')
  stringValue(manifest.name, issues, 'name')
  stringValue(manifest.displayName, issues, 'displayName')
  stringValue(manifest.description, issues, 'description')
  const version = stringValue(manifest.version, issues, 'version')
  if (version && !SEMVER_RE.test(version)) push(issues, 'error', 'semver', 'version must be semver, for example 1.0.0.', 'version')
  stringValue(manifest.publisher, issues, 'publisher')
  stringValue(manifest.license, issues, 'license')

  for (const category of stringArray(manifest.categories, issues, 'categories')) {
    if (!CATEGORIES.has(category)) push(issues, 'error', 'category', `Unsupported category "${category}".`, 'categories')
  }
  stringArray(manifest.keywords, issues, 'keywords')

  if (!isRecord(manifest.source)) {
    push(issues, 'error', 'source_required', 'source must be an object.', 'source')
  } else {
    if (manifest.source.kind !== 'built-in' && manifest.source.kind !== 'local-folder') {
      push(issues, 'error', 'source_kind', 'source.kind must be built-in or local-folder.', 'source.kind')
    }
    stringValue(manifest.source.label, issues, 'source.label')
    if (manifest.source.path !== undefined && typeof manifest.source.path !== 'string') {
      push(issues, 'error', 'source_path', 'source.path must be a string when present.', 'source.path')
    }
  }

  if (!isRecord(manifest.runtime)) {
    push(issues, 'error', 'runtime_required', 'runtime must be an object.', 'runtime')
  } else {
    if (manifest.runtime.kind !== 'declarative') push(issues, 'error', 'runtime_kind', 'Only declarative extensions are supported.', 'runtime.kind')
    if (manifest.runtime.networkAccess !== false) push(issues, 'error', 'runtime_network', 'networkAccess must be false.', 'runtime.networkAccess')
    if (manifest.runtime.arbitraryCode !== false) push(issues, 'error', 'runtime_code', 'arbitraryCode must be false.', 'runtime.arbitraryCode')
    if (!Array.isArray(manifest.runtime.allowedHosts) || manifest.runtime.allowedHosts.length !== 0) {
      push(issues, 'error', 'runtime_hosts', 'allowedHosts must be an empty array.', 'runtime.allowedHosts')
    }
  }

  const declaredPoints = new Set()
  if (!Array.isArray(manifest.extensionPoints)) {
    push(issues, 'error', 'extension_points_required', 'extensionPoints must be an array.', 'extensionPoints')
  } else {
    manifest.extensionPoints.forEach((point, index) => {
      const field = `extensionPoints[${index}]`
      if (!isRecord(point)) {
        push(issues, 'error', 'extension_point_object', `${field} must be an object.`, field)
        return
      }
      const pointId = stringValue(point.id, issues, `${field}.id`)
      stringValue(point.label, issues, `${field}.label`)
      if (pointId) {
        declaredPoints.add(pointId)
        if (!pointById.has(pointId)) push(issues, 'error', 'unknown_extension_point', `Unknown extension point "${pointId}".`, `${field}.id`)
      }
    })
  }

  if (!Array.isArray(manifest.permissions)) {
    push(issues, 'error', 'permissions_required', 'permissions must be an array.', 'permissions')
  } else {
    manifest.permissions.forEach((permission, index) => {
      const field = `permissions[${index}]`
      if (!isRecord(permission)) {
        push(issues, 'error', 'permission_object', `${field} must be an object.`, field)
        return
      }
      if (typeof permission.kind !== 'string' || !PERMISSIONS.has(permission.kind)) {
        push(issues, 'error', 'permission_kind', `${field}.kind is not a supported permission.`, `${field}.kind`)
      }
      stringValue(permission.reason, issues, `${field}.reason`)
    })
  }

  const contributionIds = new Set()
  if (!Array.isArray(manifest.contributes)) {
    push(issues, 'error', 'contributes_required', 'contributes must be an array.', 'contributes')
  } else {
    manifest.contributes.forEach((contribution, index) => {
      const field = `contributes[${index}]`
      if (!isRecord(contribution)) {
        push(issues, 'error', 'contribution_object', `${field} must be an object.`, field)
        return
      }

      const contributionId = stringValue(contribution.id, issues, `${field}.id`)
      const extensionPoint = stringValue(contribution.extensionPoint, issues, `${field}.extensionPoint`)
      const kind = stringValue(contribution.kind, issues, `${field}.kind`)
      stringValue(contribution.label, issues, `${field}.label`)

      if (contributionId) {
        if (contributionIds.has(contributionId)) push(issues, 'error', 'duplicate_contribution', `Duplicate contribution id "${contributionId}".`, `${field}.id`)
        contributionIds.add(contributionId)
      }
      if (kind && !CONTRIBUTION_KINDS.has(kind)) push(issues, 'error', 'contribution_kind', `${field}.kind is not supported.`, `${field}.kind`)

      const point = pointById.get(extensionPoint)
      if (!point) {
        push(issues, 'error', 'unknown_contribution_point', `Unknown contribution point "${extensionPoint}".`, `${field}.extensionPoint`)
      } else if (!point.allowed.includes(kind)) {
        push(issues, 'error', 'contribution_kind_mismatch', `${field}.kind "${kind}" is not allowed for ${extensionPoint}.`, `${field}.kind`)
      }
      if (extensionPoint && !declaredPoints.has(extensionPoint)) {
        push(issues, 'warning', 'undeclared_contribution_point', `${field} contributes to ${extensionPoint} but extensionPoints does not list it.`, `${field}.extensionPoint`)
      }

      if (kind === 'command') stringValue(contribution.command, issues, `${field}.command`)
      if (kind === 'markdown-transform' && !MARKDOWN_TRANSFORMS.has(contribution.transform)) {
        push(issues, 'error', 'markdown_transform', `${field}.transform is not supported.`, `${field}.transform`)
      }
      if (kind === 'metadata-provider') stringArray(contribution.fields, issues, `${field}.fields`)
      if (kind === 'sidebar-widget' && !SIDEBAR_WIDGETS.has(contribution.widget)) {
        push(issues, 'error', 'sidebar_widget', `${field}.widget is not supported.`, `${field}.widget`)
      }
      if (kind === 'view' && !VIEWS.has(contribution.view)) {
        push(issues, 'error', 'view', `${field}.view is not supported.`, `${field}.view`)
      }
    })
  }

  return { valid: !issues.some((issue) => issue.severity === 'error'), issues }
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function discoverManifests(input, recursive) {
  const absolute = path.resolve(input)
  const stat = await fs.stat(absolute)
  if (stat.isFile()) return [absolute]

  const rootManifest = path.join(absolute, MANIFEST_FILE)
  if (await exists(rootManifest)) return [rootManifest]
  if (!recursive) return []

  const found = []
  const entries = await fs.readdir(absolute, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const candidate = path.join(absolute, entry.name, MANIFEST_FILE)
    if (await exists(candidate)) found.push(candidate)
  }
  return found
}

function formatIssue(issue) {
  const label = issue.severity === 'error' ? 'error' : 'warning'
  return issue.path ? `${label}: ${issue.path}: ${issue.message}` : `${label}: ${issue.message}`
}

async function validateExtensionInputs(inputs, { recursive = false } = {}) {
  const results = []
  for (const input of inputs) {
    const manifestPaths = await discoverManifests(input, recursive)
    if (manifestPaths.length === 0) {
      results.push({
        input,
        manifestPath: null,
        valid: false,
        issues: [{ severity: 'error', code: 'manifest_missing', message: `No ${MANIFEST_FILE} found.` }]
      })
      continue
    }

    for (const manifestPath of manifestPaths) {
      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
        const result = validateManifest(manifest)
        results.push({ input, manifestPath, ...result })
      } catch (error) {
        results.push({
          input,
          manifestPath,
          valid: false,
          issues: [{ severity: 'error', code: 'manifest_read', message: error instanceof Error ? error.message : String(error) }]
        })
      }
    }
  }

  return { valid: results.every((result) => result.valid), results }
}

function formatValidationResults(validation) {
  return validation.results.map((result) => {
    const label = result.manifestPath ?? result.input
    const lines = [`${result.valid ? 'OK' : 'FAIL'} ${label}`]
    for (const issue of result.issues) lines.push(`  ${formatIssue(issue)}`)
    return lines.join('\n')
  }).join('\n')
}

async function main() {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const recursive = args.includes('--recursive')
  const inputs = args.filter((arg) => arg !== '--json' && arg !== '--recursive')

  if (inputs.includes('--help') || inputs.includes('-h') || inputs.length === 0) {
    usage()
    process.exit(inputs.length === 0 ? 1 : 0)
  }

  const validation = await validateExtensionInputs(inputs, { recursive })
  if (json) {
    console.log(JSON.stringify(validation, null, 2))
  } else {
    console.log(formatValidationResults(validation))
  }

  process.exit(validation.valid ? 0 : 1)
}

function isDirectRun() {
  return Boolean(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
}

export {
  discoverManifests,
  formatIssue,
  formatValidationResults,
  validateExtensionInputs,
  validateManifest
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
