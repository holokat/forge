#!/usr/bin/env node
import readline from 'node:readline'
import process from 'node:process'
import { publishVault } from './lib/publisher.mjs'
import {
  ensureVault,
  resolveVault,
  runOperation
} from './forge-agent.mjs'

const SERVER_VERSION = '0.1.0'

function parseArgv(argv) {
  const options = { vault: process.env.FORGE_VAULT ?? '', help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--vault') {
      options.vault = argv[++i] ?? ''
    } else if (arg.startsWith('--vault=')) {
      options.vault = arg.slice('--vault='.length)
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    }
  }
  return options
}

const options = parseArgv(process.argv.slice(2))

const HELP = `Forge MCP server

Usage:
  forge-mcp [--vault <folder>]
  FORGE_VAULT=<folder> forge-mcp

When no vault is provided, Forge uses the active vault saved by the desktop app.
This process speaks MCP over stdio and is meant to be launched by Codex, Claude,
or another MCP client, not used interactively.
`

const text = (value) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2))

const tools = [
  {
    name: 'forge_active_vault',
    description: 'Return the active Forge vault path used by this MCP server.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        vault: { type: 'string', description: 'Optional explicit vault path.' }
      }
    }
  },
  {
    name: 'forge_list',
    description: 'List folders and files in the Forge vault.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        vault: { type: 'string', description: 'Optional explicit vault path.' }
      }
    }
  },
  {
    name: 'forge_tree',
    description: 'Return a compact text tree of the Forge vault.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        vault: { type: 'string', description: 'Optional explicit vault path.' }
      }
    }
  },
  {
    name: 'forge_read',
    description: 'Read a file from the Forge vault. Paths must be relative to the vault.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        vault: { type: 'string', description: 'Optional explicit vault path.' },
        path: { type: 'string', description: 'Relative file path to read.' }
      }
    }
  },
  {
    name: 'forge_write',
    description: 'Create or overwrite a file in the Forge vault.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'content'],
      properties: {
        vault: { type: 'string', description: 'Optional explicit vault path.' },
        path: { type: 'string', description: 'Relative file path to write.' },
        content: { type: 'string', description: 'Full file content.' }
      }
    }
  },
  {
    name: 'forge_append',
    description: 'Append text to a file in the Forge vault.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'content'],
      properties: {
        vault: { type: 'string', description: 'Optional explicit vault path.' },
        path: { type: 'string', description: 'Relative file path to append to.' },
        content: { type: 'string', description: 'Content to append.' }
      }
    }
  },
  {
    name: 'forge_create_doc',
    description: 'Create a Markdown document. The .md extension is added when omitted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        vault: { type: 'string', description: 'Optional explicit vault path.' },
        path: { type: 'string', description: 'Relative Markdown path.' },
        title: { type: 'string', description: 'Optional document title.' },
        content: { type: 'string', description: 'Optional initial content.' },
        overwrite: { type: 'boolean', description: 'Allow replacing an existing document.' }
      }
    }
  },
  {
    name: 'forge_templates',
    description: 'List Markdown templates in the Forge templates folder.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        vault: { type: 'string', description: 'Optional explicit vault path.' },
        folder: { type: 'string', description: 'Optional templates folder, relative to the vault. Defaults to Forge settings or Templates.' }
      }
    }
  },
  {
    name: 'forge_create_template',
    description: 'Create a Markdown template in the Forge templates folder.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        vault: { type: 'string', description: 'Optional explicit vault path.' },
        name: { type: 'string', description: 'Template filename or relative path. The .md extension is added when omitted.' },
        folder: { type: 'string', description: 'Optional templates folder, relative to the vault. Defaults to Forge settings or Templates.' },
        content: { type: 'string', description: 'Template Markdown content. Supports {{title}}, {{date}}, {{time}}, {{datetime}}, {{vault}}, and {{template}}.' },
        overwrite: { type: 'boolean', description: 'Allow replacing an existing template.' }
      }
    }
  },
  {
    name: 'forge_create_from_template',
    description: 'Create a Markdown note from a Forge template.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['template', 'path'],
      properties: {
        vault: { type: 'string', description: 'Optional explicit vault path.' },
        template: { type: 'string', description: 'Template name or path.' },
        path: { type: 'string', description: 'Destination note path. The .md extension is added when omitted.' },
        title: { type: 'string', description: 'Optional title used for {{title}}.' },
        folder: { type: 'string', description: 'Optional templates folder, relative to the vault. Defaults to Forge settings or Templates.' },
        overwrite: { type: 'boolean', description: 'Allow replacing an existing note.' }
      }
    }
  },
  {
    name: 'forge_create_folder',
    description: 'Create a folder in the Forge vault.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        vault: { type: 'string', description: 'Optional explicit vault path.' },
        path: { type: 'string', description: 'Relative folder path.' }
      }
    }
  },
  {
    name: 'forge_move',
    description: 'Move or rename a file or folder inside the Forge vault.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['from', 'to'],
      properties: {
        vault: { type: 'string', description: 'Optional explicit vault path.' },
        from: { type: 'string', description: 'Relative source path.' },
        to: { type: 'string', description: 'Relative destination path.' }
      }
    }
  },
  {
    name: 'forge_search',
    description: 'Search Markdown filenames and contents in the Forge vault.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        vault: { type: 'string', description: 'Optional explicit vault path.' },
        query: { type: 'string', description: 'Text to search for.' },
        limit: { type: 'number', description: 'Maximum result count.' }
      }
    }
  },
  {
    name: 'forge_analyze',
    description: 'Analyze notes, tags, links, backlinks, broken links, inbox notes, and orphan notes.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        vault: { type: 'string', description: 'Optional explicit vault path.' }
      }
    }
  },
  {
    name: 'forge_publish',
    description: 'Export the Forge vault to static HTML in a dedicated output folder.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['outDir'],
      properties: {
        vault: { type: 'string', description: 'Optional explicit vault path.' },
        outDir: { type: 'string', description: 'Output folder for generated static files.' },
        title: { type: 'string', description: 'Optional site title.' },
        clean: { type: 'boolean', description: 'Clean previous Forge publisher output before writing.' }
      }
    }
  },
  {
    name: 'forge_batch',
    description: 'Run multiple Forge operations in order. Stops after the first failed operation.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['operations'],
      properties: {
        vault: { type: 'string', description: 'Optional explicit vault path.' },
        operations: {
          type: 'array',
          description: 'Operations using CLI action names such as createFolder, createDoc, append, read, search, analyze.',
          items: { type: 'object' }
        }
      }
    }
  }
]

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

function toolResponse(value, isError = false) {
  return {
    content: [{ type: 'text', text: text(value) }],
    isError
  }
}

async function getVault(args = {}) {
  const vault = await resolveVault(args.vault || options.vault)
  await ensureVault(vault)
  return vault
}

async function callTool(name, args = {}) {
  const input = args && typeof args === 'object' ? args : {}

  if (name === 'forge_active_vault') {
    const vault = await getVault(input)
    return { vault }
  }

  const vault = await getVault(input)
  switch (name) {
    case 'forge_list':
      return runOperation(vault, { action: 'list' })
    case 'forge_tree':
      return runOperation(vault, { action: 'tree' })
    case 'forge_read':
      return runOperation(vault, { action: 'read', path: input.path })
    case 'forge_write':
      return runOperation(vault, { action: 'write', path: input.path, content: input.content ?? '' })
    case 'forge_append':
      return runOperation(vault, { action: 'append', path: input.path, content: input.content ?? '' })
    case 'forge_create_doc':
      return runOperation(vault, {
        action: 'createDoc',
        path: input.path,
        title: input.title,
        content: input.content ?? '',
        overwrite: Boolean(input.overwrite)
      })
    case 'forge_templates':
      return runOperation(vault, { action: 'templates', folder: input.folder })
    case 'forge_create_template':
      return runOperation(vault, {
        action: 'createTemplate',
        name: input.name,
        folder: input.folder,
        content: input.content ?? '',
        overwrite: Boolean(input.overwrite)
      })
    case 'forge_create_from_template':
      return runOperation(vault, {
        action: 'createFromTemplate',
        template: input.template,
        path: input.path,
        title: input.title,
        folder: input.folder,
        overwrite: Boolean(input.overwrite)
      })
    case 'forge_create_folder':
      return runOperation(vault, { action: 'createFolder', path: input.path })
    case 'forge_move':
      return runOperation(vault, { action: 'move', from: input.from, to: input.to })
    case 'forge_search':
      return runOperation(vault, { action: 'search', query: input.query, limit: input.limit })
    case 'forge_analyze':
      return runOperation(vault, { action: 'analyze' })
    case 'forge_publish': {
      const result = await publishVault({
        vault,
        output: input.outDir,
        title: input.title,
        clean: Boolean(input.clean)
      })
      return {
        ok: true,
        vault: result.vault,
        outDir: result.output,
        totals: result.totals,
        files: result.written.length + result.copied.length,
        written: result.written.length,
        copied: result.copied.length,
        brokenLinks: result.brokenLinks
      }
    }
    case 'forge_batch': {
      const operations = Array.isArray(input.operations) ? input.operations : []
      const results = []
      for (let i = 0; i < operations.length; i++) {
        try {
          results.push({ index: i, ok: true, result: await runOperation(vault, operations[i]) })
        } catch (error) {
          results.push({ index: i, ok: false, error: error instanceof Error ? error.message : String(error) })
          break
        }
      }
      return { vault, results, ok: results.every((result) => result.ok) }
    }
    default:
      throw new Error(`Unknown Forge tool: ${name}`)
  }
}

async function handleMessage(message) {
  const { id, method, params } = message

  if (method?.startsWith('notifications/')) return

  try {
    switch (method) {
      case 'initialize':
        sendResult(id, {
          protocolVersion: params?.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'forge', version: SERVER_VERSION },
          instructions:
            'Forge exposes a local Markdown vault. Use relative paths. Prefer create/append/move/template tools over destructive overwrites unless the user asks. Use forge_templates before creating notes from templates.'
        })
        break
      case 'ping':
        sendResult(id, {})
        break
      case 'tools/list':
        sendResult(id, { tools })
        break
      case 'tools/call': {
        try {
          const result = await callTool(params?.name, params?.arguments ?? {})
          sendResult(id, toolResponse(result))
        } catch (error) {
          sendResult(id, toolResponse(error instanceof Error ? error.message : String(error), true))
        }
        break
      }
      case 'resources/list':
        sendResult(id, { resources: [] })
        break
      case 'prompts/list':
        sendResult(id, { prompts: [] })
        break
      default:
        sendError(id, -32601, `Method not found: ${method}`)
    }
  } catch (error) {
    sendError(id, -32603, error instanceof Error ? error.message : String(error))
  }
}

if (options.help) {
  process.stdout.write(HELP)
  process.exit(0)
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
let queue = Promise.resolve()

rl.on('line', (line) => {
  if (!line.trim()) return
  let message
  try {
    message = JSON.parse(line)
  } catch (error) {
    sendError(null, -32700, error instanceof Error ? error.message : 'Invalid JSON')
    return
  }
  queue = queue.then(() => handleMessage(message)).catch((error) => {
    sendError(message.id ?? null, -32603, error instanceof Error ? error.message : String(error))
  })
})
