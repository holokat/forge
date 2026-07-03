// In-browser mock of the Forge API so the renderer can run without Electron
// (used for design preview via `npm run dev:web`). Installed only when
// window.forge is missing.
import { DEFAULT_SETTINGS, type Settings, type ForgeAPI, type VaultData } from '../../../shared/types'

const WELCOME = `# Welcome to Forge

Forge is your **local-first** thinking space. Every note is a plain Markdown file on your Mac — no servers, no lock-in.

## Getting around

- Press **⌘O** to quickly open or create notes
- Press **⌘P** for the command palette
- Link your thoughts with [[Ideas]] or [[Projects/Forge Roadmap]]
- Organize with #tags like #inbox or #reading

> The moment you connect two notes, they become more than the sum of their parts.

## Why plain text?

1. It lasts *forever*
2. It's portable — \`grep\`, sync, or script it
3. It's yours

\`\`\`ts
const forge = { fast: true, local: true, beautiful: true }
\`\`\`

Check the graph view to see how everything connects. Happy writing.
`

const IDEAS = `# Ideas

A staging ground for half-formed thoughts. #inbox

- Spaced repetition for [[Reading Notes]]
- A weekly review ritual — see [[Projects/Forge Roadmap]]
- Digital garden vs. private vault?
- What would a *perfect* morning look like?

## Someday / maybe

- Learn letterpress printing
- Build a mechanical keyboard
- Write about [[Welcome to Forge|why local-first matters]]
`

const ROADMAP = `# Forge Roadmap

Status: #active

## Now

- [x] Core editor with live styling
- [x] Wikilinks and backlinks
- [ ] Graph view polish

## Next

- [ ] Daily notes
- [ ] Templates
- [ ] Publish pipeline

Related: [[Ideas]], [[Reading Notes]]
`

const READING = `# Reading Notes

#reading

## How to Take Smart Notes

The slip-box works because it forces **elaboration** — you can't just highlight, you must rewrite in your own words.

- Fleeting notes → literature notes → permanent notes
- Connect new notes to existing ones: [[Ideas]]

## The Shallows

Attention is the scarce resource. Deep reading is a skill that atrophies.

> We become, neurologically, what we think.
`

const MEETING = `# 2026-07-01 Sync

#meeting

Attendees: Kim, Ada, Grace

- Shipped the new editor theme 🎉
- Graph view perf: batch render, cap labels
- Next: [[Projects/Forge Roadmap]] review on Friday
`

const files: Record<string, string> = {
  'Welcome to Forge.md': WELCOME,
  'Ideas.md': IDEAS,
  'Reading Notes.md': READING,
  'Projects/Forge Roadmap.md': ROADMAP,
  'Journal/2026-07-01 Sync.md': MEETING
}

let settings: Settings = { ...DEFAULT_SETTINGS, lastVault: '/Users/demo/Notes', recentVaults: ['/Users/demo/Notes'] }

function vaultData(): VaultData {
  const modified = new Date().toISOString()
  return {
    files: Object.keys(files).sort(),
    folders: ['Journal', 'Projects'],
    contents: { ...files },
    fileStats: Object.fromEntries(
      Object.entries(files).map(([path, content]) => [path, { size: new Blob([content]).size, modified }])
    )
  }
}

export function installMockApi(): void {
  const api: ForgeAPI = {
    selectVault: async () => '/Users/demo/Notes',
    openVault: async () => vaultData(),
    readFile: async (_v, rel) => files[rel] ?? '',
    writeFile: async (_v, rel, content) => {
      files[rel] = content
    },
    createFile: async (_v, rel, content) => {
      let candidate = rel
      let n = 1
      while (candidate in files) {
        candidate = rel.replace(/\.md$/, ` ${n}.md`)
        n++
      }
      files[candidate] = content
      return candidate
    },
    rename: async (_v, oldRel, newRel) => {
      for (const key of Object.keys(files)) {
        if (key === oldRel || key.startsWith(oldRel + '/')) {
          files[newRel + key.slice(oldRel.length)] = files[key]
          delete files[key]
        }
      }
    },
    trash: async (_v, rel) => {
      for (const key of Object.keys(files)) {
        if (key === rel || key.startsWith(rel + '/')) delete files[key]
      }
    },
    createFolder: async () => {},
    reveal: async () => {},
    readSettings: async () => settings,
    writeSettings: async (s) => {
      settings = s
    },
    getAgentAccessInfo: async () => ({
      mode: 'source',
      cli: { command: 'node', args: ['/Users/demo/forge/scripts/forge-agent.mjs'] },
      mcp: { command: 'node', args: ['/Users/demo/forge/scripts/forge-mcp.mjs'] }
    }),
    getAIStatus: async () => ({
      safeStorageAvailable: true,
      codex: {
        installed: true,
        path: '/usr/local/bin/codex',
        version: 'codex 0.0.0-preview',
        authenticated: true,
        detail: 'Logged in using ChatGPT',
        setupCommand: 'codex login',
        docsUrl: 'https://developers.openai.com/codex/auth'
      },
      claude: {
        installed: false,
        path: null,
        version: null,
        authenticated: false,
        detail: 'Claude Code is not installed or is not on PATH.',
        setupCommand: 'claude',
        docsUrl: 'https://code.claude.com/docs/en/iam'
      },
      openai: { configured: false, updatedAt: null },
      anthropic: { configured: false, updatedAt: null },
      notes: [
        'Codex prompts run through the local Codex CLI.',
        'Use Anthropic API keys for direct Forge prompting.'
      ]
    }),
    saveAISettings: async (ai, _secrets) => {
      settings = { ...settings, ai }
      return {
        safeStorageAvailable: true,
        codex: {
          installed: true,
          path: '/usr/local/bin/codex',
          version: 'codex 0.0.0-preview',
          authenticated: true,
          detail: 'Logged in using ChatGPT',
          setupCommand: 'codex login',
          docsUrl: 'https://developers.openai.com/codex/auth'
        },
        claude: {
          installed: false,
          path: null,
          version: null,
          authenticated: false,
          detail: 'Claude Code is not installed or is not on PATH.',
          setupCommand: 'claude',
          docsUrl: 'https://code.claude.com/docs/en/iam'
        },
        openai: { configured: Boolean(_secrets?.openaiApiKey), updatedAt: _secrets?.openaiApiKey ? new Date().toISOString() : null },
        anthropic: {
          configured: Boolean(_secrets?.anthropicApiKey),
          updatedAt: _secrets?.anthropicApiKey ? new Date().toISOString() : null
        },
        notes: [
          'Codex prompts run through the local Codex CLI.',
          'Use Anthropic API keys for direct Forge prompting.'
        ]
      }
    },
    runAITextTask: async (request) => ({
      provider: request.provider,
      model: request.model || settings.ai.openaiModel,
      output: `Mock ${request.provider} result:\n\n${request.prompt}`
    }),
    openAIProviderLogin: async () => {},
    copyText: async (text) => {
      await navigator.clipboard?.writeText(text)
    },
    droppedFilePaths: () => [],
    getMobilePairingInfo: async () => ({
      available: true,
      baseUrl: 'http://127.0.0.1:47873',
      pairingUrl: 'forge-buddy://pair?baseURL=http%3A%2F%2F127.0.0.1%3A47873&token=mock-token&desktop=Preview',
      port: 47873,
      host: '127.0.0.1',
      desktopName: 'Preview',
      vaultName: 'Notes'
    }),
    resetMobilePairingToken: async () => ({
      available: true,
      baseUrl: 'http://127.0.0.1:47873',
      pairingUrl: 'forge-buddy://pair?baseURL=http%3A%2F%2F127.0.0.1%3A47873&token=mock-token-2&desktop=Preview',
      port: 47873,
      host: '127.0.0.1',
      desktopName: 'Preview',
      vaultName: 'Notes'
    }),
    setMobileVault: async () => {},
    importAttachments: async () => [],
    importMedia: async () => [],
    publishVault: async (_vault, outDir, _options) => ({ outDir, files: 0, notes: 0 }),
    getUpdateStatus: async () => ({
      state: 'disabled',
      currentVersion: '0.1.1',
      progress: null,
      message: 'Updates are available in packaged builds.',
      canInstall: false
    }),
    checkForUpdates: async () => ({
      state: 'disabled',
      currentVersion: '0.1.1',
      progress: null,
      message: 'Updates are available in packaged builds.',
      canInstall: false
    }),
    installUpdate: async () => {},
    consumePendingReleaseNotes: async () => null,
    onUpdateStatus: () => () => {},
    setThemeSource: async () => {},
    watchVault: async () => {},
    onVaultChanged: () => () => {},
    assetUrl: (_v, rel) => rel
  }
  window.forge = api
}
