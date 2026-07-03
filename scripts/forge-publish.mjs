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
  --theme <name>          minimal, editorial, or reference
  --clean                 Remove a previous Forge publish output before writing
  --no-tags               Omit tag navigation and tag pages
  --no-backlinks          Omit backlink sections from note pages
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
      showBacklinks: options.showBacklinks
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
