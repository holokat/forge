#!/usr/bin/env node
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import fsSync from 'node:fs'
import path from 'node:path'
import {
  ensureVault,
  resolveVault
} from './forge-agent.mjs'
import { publishVault } from './lib/publisher.mjs'

const HELP = `Forge static publisher

Usage:
  node scripts/forge-publish.mjs --vault <folder> --out <folder> [options]
  FORGE_VAULT=<folder> node scripts/forge-publish.mjs --out <folder> [options]
  npm run publish:vault -- --vault <folder> --out <folder> [options]

Options:
  --out, -o <folder>      Required output folder for generated static files
  --title <title>         Site title; defaults to the vault folder name
  --description <text>    Site description used in generated metadata
  --scope <folder>        Publish only one vault folder
  --theme <name>          minimal, editorial, reference, quiet-paper,
                          terminal-ledger, swiss-ledger, soft-focus, or field-notes
  --clean                 Remove a previous Forge publish output before writing
  --no-tags               Omit tag navigation and tag pages
  --no-backlinks          Omit backlink sections from note pages
  --site-url <url>        Public URL for canonical links, RSS, sitemap, robots
  --social-image <url>    Open Graph image URL
  --author <name>         Author name for metadata and JSON-LD
  --language <tag>        HTML language tag, defaults to en
  --robots <index|noindex>
  --favicon <path|url>    Favicon URL or vault-relative asset path
  --custom-footer <text>  Plain text footer shown on generated pages
  --no-rss                Skip rss.xml
  --no-sitemap            Skip sitemap.xml
  --no-robots             Skip robots.txt
  --analytics-provider <none|plausible|umami|custom>
  --analytics-domain <domain>
  --analytics-script <url>
  --analytics-website-id <id>
  --deploy-target <name>  github-pages, cloudflare-pages, netlify, vercel, s3-r2, ipfs
  --deploy-url <url>      Production URL for the deploy target
  --allow-iframes         Render forge-embed blocks as sandboxed iframes
  --no-external-media     Do not render remote image URLs
  --form                  Add a static contact form to the home page
  --form-provider <provider>
  --form-endpoint <url>
  --json                  Print a machine-readable summary
  --help, -h              Show this help

Safety:
  --clean only removes an existing output folder when it contains Forge's
  .forge-publish.json marker, or when the folder is empty.
`

function parseArgv(argv) {
  const options = {
    vault: process.env.FORGE_VAULT ?? '',
    output: '',
    title: '',
    description: '',
    scopePath: '',
    theme: 'minimal',
    clean: false,
    showTags: true,
    showBacklinks: true,
    integrations: {},
    json: false,
    help: false
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--vault') {
      options.vault = argv[++i] ?? ''
    } else if (arg.startsWith('--vault=')) {
      options.vault = arg.slice('--vault='.length)
    } else if (arg === '--out' || arg === '-o') {
      options.output = argv[++i] ?? ''
    } else if (arg.startsWith('--out=')) {
      options.output = arg.slice('--out='.length)
    } else if (arg === '--title') {
      options.title = argv[++i] ?? ''
    } else if (arg.startsWith('--title=')) {
      options.title = arg.slice('--title='.length)
    } else if (arg === '--description') {
      options.description = argv[++i] ?? ''
    } else if (arg.startsWith('--description=')) {
      options.description = arg.slice('--description='.length)
    } else if (arg === '--scope') {
      options.scopePath = argv[++i] ?? ''
    } else if (arg.startsWith('--scope=')) {
      options.scopePath = arg.slice('--scope='.length)
    } else if (arg === '--theme') {
      options.theme = argv[++i] ?? ''
    } else if (arg.startsWith('--theme=')) {
      options.theme = arg.slice('--theme='.length)
    } else if (arg === '--clean') {
      options.clean = true
    } else if (arg === '--no-tags') {
      options.showTags = false
    } else if (arg === '--no-backlinks') {
      options.showBacklinks = false
    } else if (arg === '--site-url') {
      options.siteUrl = argv[++i] ?? ''
    } else if (arg.startsWith('--site-url=')) {
      options.siteUrl = arg.slice('--site-url='.length)
    } else if (arg === '--social-image') {
      options.socialImage = argv[++i] ?? ''
    } else if (arg.startsWith('--social-image=')) {
      options.socialImage = arg.slice('--social-image='.length)
    } else if (arg === '--author') {
      options.author = argv[++i] ?? ''
    } else if (arg.startsWith('--author=')) {
      options.author = arg.slice('--author='.length)
    } else if (arg === '--language') {
      options.language = argv[++i] ?? ''
    } else if (arg.startsWith('--language=')) {
      options.language = arg.slice('--language='.length)
    } else if (arg === '--robots') {
      options.robotsMode = argv[++i] ?? ''
    } else if (arg.startsWith('--robots=')) {
      options.robotsMode = arg.slice('--robots='.length)
    } else if (arg === '--favicon') {
      options.favicon = argv[++i] ?? ''
    } else if (arg.startsWith('--favicon=')) {
      options.favicon = arg.slice('--favicon='.length)
    } else if (arg === '--custom-footer') {
      options.customFooter = argv[++i] ?? ''
    } else if (arg.startsWith('--custom-footer=')) {
      options.customFooter = arg.slice('--custom-footer='.length)
    } else if (arg === '--no-rss') {
      options.noRss = true
    } else if (arg === '--no-sitemap') {
      options.noSitemap = true
    } else if (arg === '--no-robots') {
      options.noRobots = true
    } else if (arg === '--analytics-provider') {
      options.analyticsProvider = argv[++i] ?? ''
    } else if (arg.startsWith('--analytics-provider=')) {
      options.analyticsProvider = arg.slice('--analytics-provider='.length)
    } else if (arg === '--analytics-domain') {
      options.analyticsDomain = argv[++i] ?? ''
    } else if (arg.startsWith('--analytics-domain=')) {
      options.analyticsDomain = arg.slice('--analytics-domain='.length)
    } else if (arg === '--analytics-script') {
      options.analyticsScript = argv[++i] ?? ''
    } else if (arg.startsWith('--analytics-script=')) {
      options.analyticsScript = arg.slice('--analytics-script='.length)
    } else if (arg === '--analytics-website-id') {
      options.analyticsWebsiteId = argv[++i] ?? ''
    } else if (arg.startsWith('--analytics-website-id=')) {
      options.analyticsWebsiteId = arg.slice('--analytics-website-id='.length)
    } else if (arg === '--deploy-target') {
      options.deployTarget = argv[++i] ?? ''
    } else if (arg.startsWith('--deploy-target=')) {
      options.deployTarget = arg.slice('--deploy-target='.length)
    } else if (arg === '--deploy-url') {
      options.deployUrl = argv[++i] ?? ''
    } else if (arg.startsWith('--deploy-url=')) {
      options.deployUrl = arg.slice('--deploy-url='.length)
    } else if (arg === '--allow-iframes') {
      options.allowIframes = true
    } else if (arg === '--no-external-media') {
      options.noExternalMedia = true
    } else if (arg === '--form') {
      options.form = true
    } else if (arg === '--form-provider') {
      options.formProvider = argv[++i] ?? ''
    } else if (arg.startsWith('--form-provider=')) {
      options.formProvider = arg.slice('--form-provider='.length)
    } else if (arg === '--form-endpoint') {
      options.formEndpoint = argv[++i] ?? ''
    } else if (arg.startsWith('--form-endpoint=')) {
      options.formEndpoint = arg.slice('--form-endpoint='.length)
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function publishIntegrationsFromOptions(options = {}) {
  return {
    seoRss: {
      siteUrl: options.siteUrl,
      socialImage: options.socialImage,
      authorName: options.author,
      language: options.language,
      robotsMode: options.robotsMode,
      favicon: options.favicon,
      customFooter: options.customFooter,
      rss: options.noRss ? false : undefined,
      sitemap: options.noSitemap ? false : undefined,
      robots: options.noRobots ? false : undefined
    },
    analytics: {
      provider: options.analyticsProvider,
      domain: options.analyticsDomain,
      scriptUrl: options.analyticsScript,
      websiteId: options.analyticsWebsiteId
    },
    deploy: {
      target: options.deployTarget,
      productionUrl: options.deployUrl
    },
    embeds: {
      allowIframes: Boolean(options.allowIframes),
      allowExternalMedia: options.noExternalMedia ? false : undefined
    },
    forms: {
      enabled: Boolean(options.form),
      provider: options.formProvider,
      endpoint: options.formEndpoint
    }
  }
}

function printSummary(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  console.log(`Published ${result.totals.notes} notes to ${result.output}`)
  console.log(`Tags: ${result.totals.tags}`)
  console.log(`Links: ${result.totals.links}`)
  console.log(`Assets copied: ${result.copied.length}`)
  console.log(`Files written: ${result.written.length}`)
  if (result.brokenLinks.length) {
    console.log(`Broken wikilinks: ${result.brokenLinks.length}`)
  }
}

function fail(error, json) {
  const message = error instanceof Error ? error.message : String(error)
  if (json) {
    console.error(JSON.stringify({ ok: false, error: message }, null, 2))
  } else {
    console.error(`Error: ${message}`)
  }
  process.exit(1)
}

async function main() {
  let options
  try {
    options = parseArgv(process.argv.slice(2))
  } catch (error) {
    fail(error, false)
  }

  if (options.help) {
    console.log(HELP)
    return
  }

  try {
    if (!options.output) throw new Error('Missing --out <folder>.')
    const vault = await resolveVault(options.vault)
    await ensureVault(vault)
    const result = await publishVault({
      vault,
      output: options.output,
      title: options.title,
      description: options.description,
      scopePath: options.scopePath,
      theme: options.theme,
      clean: options.clean,
      showTags: options.showTags,
      showBacklinks: options.showBacklinks,
      integrations: publishIntegrationsFromOptions(options)
    })
    printSummary(result, options.json)
  } catch (error) {
    fail(error, options.json)
  }
}

function isDirectRun() {
  const entry = process.argv[1]
  if (!entry) return false
  const current = fileURLToPath(import.meta.url)
  try {
    return fsSync.realpathSync(entry) === current
  } catch {
    return path.resolve(entry) === current
  }
}

export {
  HELP,
  parseArgv
}

if (isDirectRun()) main()
