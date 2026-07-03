import { create } from 'zustand'
import type { ReactNode } from 'react'
import { DEFAULT_SETTINGS, type ExtensionSettings, type Settings, type ThemeMode } from '../../shared/types'
import {
  createDefaultExtensionSettings,
  enabledExtensionIds,
  normalizeExtensionSettings,
  withExtensionEnabled,
  withExtensionInstalled
} from './extensions/preferences'
import { baseName, isMarkdown, noteDisplayTitle, parseNote, resolveLink, wordCount, type NoteMeta } from './lib/parse'
import { formatTemplateDateParts, renderTemplate } from './lib/templates'

export type TabKind = 'note' | 'graph' | 'board' | 'empty'
export type ViewMode = 'edit' | 'read'
export const STARTER_TEMPLATE_KINDS = [
  'daily',
  'weeklyReview',
  'meeting',
  'sourceNote',
  'knowledgeMap',
  'calloutLibrary',
  'agentTask',
  'agentReview',
  'seoBrief',
  'research',
  'sprintPlan',
  'productSpec',
  'project',
  'supportTicket',
  'experimentLog',
  'contentOutline',
  'interviewNotes',
  'bugReport',
  'decision',
  'publishPage',
  'changelog',
  'transcriptCleanup',
  'releaseNotes',
  'person'
] as const
export type StarterTemplateKind = (typeof STARTER_TEMPLATE_KINDS)[number]

export const STARTER_TEMPLATE_CATALOG: { kind: StarterTemplateKind; label: string; detail: string }[] = [
  { kind: 'daily', label: 'Daily note', detail: 'Focus, log, decisions, follow-ups' },
  { kind: 'weeklyReview', label: 'Weekly review', detail: 'Wins, learnings, open loops, next week' },
  { kind: 'meeting', label: 'Meeting notes', detail: 'Agenda, decisions, action items' },
  { kind: 'sourceNote', label: 'Source note', detail: 'Literature notes and source extraction' },
  { kind: 'knowledgeMap', label: 'Knowledge map', detail: 'MOC hub for linked notes and gaps' },
  { kind: 'calloutLibrary', label: 'Callout library / snippets', detail: 'Reusable note, tip, warning, question, and quote snippets' },
  { kind: 'agentTask', label: 'Agent task', detail: 'Precise AI work briefs' },
  { kind: 'agentReview', label: 'Agent review / QA', detail: 'Checklist for reviewing agent work' },
  { kind: 'seoBrief', label: 'SEO/content brief', detail: 'Audience, intent, outline, links' },
  { kind: 'research', label: 'Research brief', detail: 'Questions, sources, synthesis' },
  { kind: 'sprintPlan', label: 'Sprint plan', detail: 'Goals, scope, capacity, risks' },
  { kind: 'productSpec', label: 'PRD', detail: 'Requirements and launch criteria' },
  { kind: 'project', label: 'Project plan', detail: 'Scope, milestones, risks' },
  { kind: 'supportTicket', label: 'Support ticket', detail: 'Customer issue tracking and resolution' },
  { kind: 'experimentLog', label: 'Experiment log', detail: 'Hypothesis, procedure, results' },
  { kind: 'contentOutline', label: 'Content outline', detail: 'Structured drafting brief' },
  { kind: 'interviewNotes', label: 'Interview notes', detail: 'Research, customer, or hiring notes' },
  { kind: 'bugReport', label: 'Bug report', detail: 'Repro, impact, fix notes' },
  { kind: 'decision', label: 'Decision record', detail: 'Options, rationale, consequences' },
  { kind: 'publishPage', label: 'Publish page', detail: 'Public Markdown page draft' },
  { kind: 'changelog', label: 'Changelog entry', detail: 'Forge-style product entries' },
  { kind: 'transcriptCleanup', label: 'Transcript cleanup', detail: 'Raw transcript to polished notes' },
  { kind: 'releaseNotes', label: 'Release notes', detail: 'User-facing changes' },
  { kind: 'person', label: 'Person', detail: 'Relationship notes' }
]

export interface Tab {
  id: string
  kind: TabKind
  path: string | null
  mode: ViewMode
}

export interface ContextMenuItem {
  label: string
  icon?: ReactNode
  danger?: boolean
  action: () => void
}

export interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

export type ModalKind = 'palette' | 'switcher' | 'template' | 'settings' | null

/** Note contents live outside React state to avoid re-render storms. */
export const noteContents = new Map<string, string>()

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const parseTimers = new Map<string, ReturnType<typeof setTimeout>>()
let tabCounter = 0
const newTabId = (): string => `tab-${++tabCounter}`

export interface ForgeState {
  booted: boolean
  vault: string | null
  vaultName: string
  files: string[]
  folders: string[]
  index: Record<string, NoteMeta>
  tabs: Tab[]
  activeTabId: string | null
  theme: ThemeMode
  fontSize: number
  lineWidth: number
  templatesFolder: string
  dailyNotesFolder: string
  bookmarks: string[]
  bookmarkSettings: Record<string, string[]>
  enabledExtensions: string[]
  extensionSettings: ExtensionSettings
  recentVaults: string[]
  leftOpen: boolean
  rightOpen: boolean
  leftPane: 'files' | 'search'
  modal: ModalKind
  contextMenu: ContextMenuState | null
  counts: { words: number; chars: number }
  /** bumped whenever note contents change, for panes that read noteContents */
  contentVersion: number

  boot(): Promise<void>
  openVaultDialog(): Promise<void>
  openVaultPath(path: string): Promise<void>
  closeVault(): void
  refreshVault(): Promise<void>

  openFile(path: string, opts?: { newTab?: boolean }): void
  openGraph(): void
  openBoard(): void
  newTab(): void
  closeTab(id: string): void
  activateTab(id: string): void
  setTabMode(id: string, mode: ViewMode): void
  toggleActiveMode(): void

  updateContent(path: string, content: string): void
  createNote(folder?: string): Promise<void>
  createNoteNamed(name: string): Promise<string | null>
  createNoteFromTemplate(
    templatePath: string,
    opts?: { title?: string; folder?: string; variables?: Record<string, string> }
  ): Promise<string | null>
  createStarterTemplate(kind: StarterTemplateKind): Promise<string | null>
  createDailyNote(): Promise<string | null>
  createFolder(parent: string, name: string): Promise<void>
  renamePath(oldPath: string, newPath: string): Promise<void>
  /** Move a file or folder into `targetFolder` ('' = vault root). */
  movePath(source: string, targetFolder: string): Promise<void>
  trashPath(path: string): Promise<void>

  setTheme(theme: ThemeMode): void
  setFontSize(size: number): void
  setLineWidth(width: number): void
  setTemplatesFolder(folder: string): void
  setDailyNotesFolder(folder: string): void
  toggleBookmark(path: string): void
  removeBookmark(path: string): void
  setExtensionInstalled(extensionId: string, installed: boolean): void
  setExtensionEnabled(extensionId: string, enabled: boolean): void
  setLeftOpen(open: boolean): void
  setRightOpen(open: boolean): void
  setLeftPane(pane: 'files' | 'search'): void
  setModal(modal: ModalKind): void
  setContextMenu(menu: ContextMenuState | null): void
}

function buildIndex(contents: Record<string, string>): Record<string, NoteMeta> {
  const index: Record<string, NoteMeta> = {}
  for (const [path, content] of Object.entries(contents)) {
    index[path] = parseNote(content)
  }
  return index
}

async function persistSettings(state: ForgeState): Promise<void> {
  const settings: Settings = {
    theme: state.theme,
    lastVault: state.vault,
    recentVaults: state.recentVaults,
    fontSize: state.fontSize,
    lineWidth: state.lineWidth,
    templatesFolder: state.templatesFolder,
    dailyNotesFolder: state.dailyNotesFolder,
    bookmarks: bookmarkSettingsForState(state),
    enabledExtensions: enabledExtensionIds(state.extensionSettings),
    extensionSettings: state.extensionSettings
  }
  await window.forge.writeSettings(settings)
}

function normalizeBookmarkList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .filter((path): path is string => typeof path === 'string')
        .map((path) => path.replaceAll('\\', '/').trim())
        .filter((path) => path.length > 0 && !path.startsWith('/') && !path.split('/').includes('..'))
    )
  )
}

function normalizeBookmarkSettings(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const settings: Record<string, string[]> = {}
  for (const [vault, bookmarks] of Object.entries(value)) {
    if (typeof vault === 'string' && vault.trim()) settings[vault] = normalizeBookmarkList(bookmarks)
  }
  return settings
}

function bookmarkSettingsForState(state: ForgeState): Record<string, string[]> {
  if (!state.vault) return state.bookmarkSettings
  return { ...state.bookmarkSettings, [state.vault]: state.bookmarks }
}

function bookmarksForVault(settings: Record<string, string[]>, vault: string, files: string[]): string[] {
  const existing = new Set(files)
  return normalizeBookmarkList(settings[vault]).filter((path) => existing.has(path) && isMarkdown(path))
}

function normalizeFolderPath(value: string): string {
  return value
    .replaceAll('\\', '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== '.' && part !== '..')
    .join('/')
}

function noteTitle(value: string, fallback: string): string {
  return (value || fallback).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || fallback
}

function folderAncestors(folder: string): string[] {
  const clean = normalizeFolderPath(folder)
  if (!clean) return []
  const parts = clean.split('/')
  return parts.map((_part, index) => parts.slice(0, index + 1).join('/'))
}

const STARTER_TEMPLATES: Record<StarterTemplateKind, { file: string; content: string }> = {
  daily: {
    file: 'Daily.md',
    content: [
      '---',
      'date: {{date}}',
      'tags: [daily]',
      '---',
      '',
      '# {{date}}',
      '',
      '## Focus',
      '{{prompt:Focus}}',
      '',
      '## Priorities',
      '- [ ] ',
      '- [ ] ',
      '- [ ] ',
      '',
      '## Schedule',
      '- ',
      '',
      '## Notes',
      '',
      '## Decisions',
      '- ',
      '',
      '## Tasks',
      '- [ ] ',
      '',
      '## Follow-ups',
      '- '
    ].join('\n')
  },
  weeklyReview: {
    file: 'Weekly Review.md',
    content: [
      '---',
      'type: weekly-review',
      'week: {{prompt:Week}}',
      'status: {{select:Status|Draft,Reviewed,Archived}}',
      'created: {{date}}',
      'tags: [weekly-review, review]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Week',
      '{{prompt:Week}}',
      '',
      '## Wins',
      '- ',
      '',
      '## Shipped',
      '- ',
      '',
      '## Learned',
      '- ',
      '',
      '## Metrics',
      '- Metric:  Result:  Notes: ',
      '',
      '## Open Loops',
      '- [ ] ',
      '',
      '## Decisions',
      '- ',
      '',
      '## Next Week',
      '- Focus:',
      '- Risks:',
      '- First action:',
      '',
      '## Agent Follow-up',
      '- Notes to summarize:',
      '- Links to repair:',
      '- Tasks to extract:'
    ].join('\n')
  },
  meeting: {
    file: 'Meeting Notes.md',
    content: [
      '---',
      'type: meeting',
      'date: {{date}}',
      'status: {{select:Status|Scheduled,In progress,Done}}',
      'tags: [meeting]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Objective',
      '{{prompt:Objective}}',
      '',
      '## Attendees',
      '{{prompt:Attendees}}',
      '',
      '## Agenda',
      '{{prompt:Agenda}}',
      '',
      '## Notes',
      '',
      '## Decisions',
      '- ',
      '',
      '## Action Items',
      '- [ ] Owner:  Due:  Task: ',
      '',
      '## Follow-ups',
      '- '
    ].join('\n')
  },
  sourceNote: {
    file: 'Source Note.md',
    content: [
      '---',
      'type: source-note',
      'source_type: {{select:Source type|Book,Article,Paper,Podcast,Video,Docs,Other}}',
      'status: {{select:Status|Queued,Reading,Processed,Archived}}',
      'author: {{prompt:Author}}',
      'source: {{prompt:Source}}',
      'url: {{prompt:URL}}',
      'created: {{date}}',
      'tags: [source, literature]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Citation',
      '- Author: {{prompt:Author}}',
      '- Source: {{prompt:Source}}',
      '- URL: {{prompt:URL}}',
      '',
      '## Why This Matters',
      '{{prompt:Why this matters}}',
      '',
      '## Summary',
      '',
      '## Key Ideas',
      '- Idea:  Evidence:  Confidence: ',
      '',
      '## Quotes',
      '- ',
      '',
      '## Connections',
      '- Related notes: ',
      '- Contradicts: ',
      '- Supports: ',
      '',
      '## Questions',
      '- ',
      '',
      '## Agent Extraction Tasks',
      '- [ ] Pull durable claims into evergreen notes',
      '- [ ] Link people, organizations, and concepts',
      '- [ ] Flag uncertain or unsupported claims'
    ].join('\n')
  },
  knowledgeMap: {
    file: 'Knowledge Map.md',
    content: [
      '---',
      'type: knowledge-map',
      'topic: {{prompt:Topic}}',
      'status: {{select:Status|Draft,Living,Archived}}',
      'created: {{date}}',
      'tags: [moc, map]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Purpose',
      '{{prompt:Purpose}}',
      '',
      '## Core Notes',
      '- [[ ]]',
      '',
      '## Clusters',
      '### People',
      '- ',
      '',
      '### Concepts',
      '- ',
      '',
      '### Projects',
      '- ',
      '',
      '## Open Questions',
      '- ',
      '',
      '## Gaps',
      '- Missing note:',
      '- Stale note:',
      '- Broken link:',
      '',
      '## Next Links to Create',
      '- [[ ]]',
      '',
      '## Agent Maintenance',
      '- [ ] Find unlinked mentions for this topic',
      '- [ ] Suggest notes that belong in this map',
      '- [ ] Summarize changes since last review'
    ].join('\n')
  },
  calloutLibrary: {
    file: 'Callout Library.md',
    content: [
      '---',
      'type: callout-library',
      'status: {{select:Status|Draft,Active,Archived}}',
      'created: {{date}}',
      'tags: [callouts, templates]',
      '---',
      '',
      '# {{title}}',
      '',
      '## How to Use',
      '- Copy a snippet into any note.',
      '- Replace placeholder text with the actual context.',
      '- Keep callouts short enough to scan.',
      '',
      '## Note',
      '> [!note] Context',
      '> Use this for neutral background, definitions, or source notes.',
      '',
      '## Tip',
      '> [!tip] Better Path',
      '> Use this for a recommended action, shortcut, or pattern.',
      '',
      '## Warning',
      '> [!warning] Check Before Shipping',
      '> Use this for risks, blockers, caveats, or destructive steps.',
      '',
      '## Question',
      '> [!question] Open Question',
      '> Use this for unresolved decisions, research prompts, or agent follow-up.',
      '',
      '## Quote',
      '> [!quote] Source Quote',
      '> Use this for copied source text that needs attribution.',
      '> Source: {{prompt:Source}}',
      '',
      '## Agent Notes',
      '- Preserve callout type and title when rewriting notes.',
      '- Do not convert warnings into neutral notes.',
      '- Keep quoted text attributed to its source.'
    ].join('\n')
  },
  project: {
    file: 'Project Plan.md',
    content: [
      '---',
      'type: project-plan',
      'status: {{select:Status|Planning,Active,Paused,Done}}',
      'owner: {{prompt:Owner}}',
      'target: {{prompt:Target date}}',
      'tags: [project]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Goal',
      '{{prompt:Goal}}',
      '',
      '## Background',
      '',
      '## Scope',
      '### In scope',
      '- ',
      '',
      '### Out of scope',
      '- ',
      '',
      '## Deliverables',
      '- ',
      '',
      '## Milestones',
      '- [ ] Milestone:  Owner:  Date: ',
      '',
      '## Risks',
      '- Risk:  Mitigation: ',
      '',
      '## Open Questions',
      '- ',
      '',
      '## Next Actions',
      '- [ ] '
    ].join('\n')
  },
  person: {
    file: 'Person.md',
    content: [
      '---',
      'type: person',
      'tags: [person]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Role',
      '{{prompt:Role}}',
      '',
      '## Context',
      '',
      '## Notes',
      '',
      '## Follow-ups',
      ''
    ].join('\n')
  },
  research: {
    file: 'Research Brief.md',
    content: [
      '---',
      'type: research-brief',
      'status: {{select:Status|Scoping,Researching,Synthesizing,Done}}',
      'created: {{date}}',
      'tags: [research]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Research Question',
      '{{prompt:Research question}}',
      '',
      '## Decision or Use',
      '{{prompt:Decision or use}}',
      '',
      '## Source List',
      '- Source:  Why it matters: ',
      '',
      '## Findings',
      '- Finding:  Evidence:  Confidence: ',
      '',
      '## Synthesis',
      '',
      '## Risks and Gaps',
      '- ',
      '',
      '## Recommended Next Step',
      ''
    ].join('\n')
  },
  sprintPlan: {
    file: 'Sprint Plan.md',
    content: [
      '---',
      'type: sprint-plan',
      'sprint: {{prompt:Sprint}}',
      'status: {{select:Status|Planned,Active,Complete,Closed}}',
      'start: {{prompt:Start date}}',
      'end: {{prompt:End date}}',
      'created: {{date}}',
      'tags: [sprint, planning]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Sprint Goal',
      '{{prompt:Sprint goal}}',
      '',
      '## Capacity',
      '- People:',
      '- Focus days:',
      '- Known interruptions:',
      '',
      '## Commitments',
      '- [ ] Owner:  Work:  Done when: ',
      '',
      '## Backlog Candidates',
      '- ',
      '',
      '## Execution Board',
      '### Now',
      '- ',
      '',
      '### Next',
      '- ',
      '',
      '### Blocked',
      '- ',
      '',
      '## Risks',
      '- Risk:  Mitigation: ',
      '',
      '## Review Criteria',
      '- Demo:',
      '- Metrics:',
      '- Retro notes:',
      '',
      '## Agent Tasks',
      '- [ ] Break commitments into implementation tasks',
      '- [ ] Check linked specs and issues for stale assumptions',
      '- [ ] Draft end-of-sprint summary'
    ].join('\n')
  },
  agentTask: {
    file: 'Agent Task Brief.md',
    content: [
      '---',
      'type: agent-task',
      'status: {{select:Status|Ready,In progress,Blocked,Done}}',
      'created: {{date}}',
      'tags: [agent, task]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Objective',
      '{{prompt:Objective}}',
      '',
      '## Context',
      '- Vault: {{vault}}',
      '- Folder: {{folder}}',
      '- Related notes: {{prompt:Related notes}}',
      '',
      '## Constraints',
      '- Preserve existing user changes.',
      '- Keep paths relative to the vault.',
      '- Stay within the requested ownership boundary.',
      '- Prefer small, reviewable edits.',
      '',
      '## Inputs',
      '- Files or folders: {{prompt:Files or folders}}',
      '- External references: {{prompt:External references}}',
      '',
      '## Definition of Done',
      '- [ ] Requested change is complete',
      '- [ ] Targeted validation has run or is explained',
      '- [ ] Files changed are summarized',
      '',
      '## Checklist',
      '- [ ] Inspect current state',
      '- [ ] Implement the requested change',
      '- [ ] Verify behavior',
      '- [ ] Summarize outcome',
      '',
      '## Verification',
      '',
      '## Result',
      ''
    ].join('\n')
  },
  agentReview: {
    file: 'Agent Review QA.md',
    content: [
      '---',
      'type: agent-review',
      'status: {{select:Status|Ready,Reviewing,Changes requested,Approved,Blocked}}',
      'reviewer: {{prompt:Reviewer}}',
      'created: {{date}}',
      'tags: [agent, review, qa]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Scope',
      '- Request: {{prompt:Request}}',
      '- Files or notes reviewed: {{prompt:Files or notes reviewed}}',
      '- Ownership boundary:',
      '- Out of scope:',
      '',
      '## Review Checklist',
      '- [ ] Requested behavior is implemented',
      '- [ ] Unrelated edits are not included',
      '- [ ] Markdown renders cleanly',
      '- [ ] Links, tags, and frontmatter are valid',
      '- [ ] Agent-facing instructions are clear',
      '- [ ] Validation output is captured or explained',
      '',
      '## Findings',
      '- Severity:',
      '- Location:',
      '- Issue:',
      '- Recommendation:',
      '',
      '## Callouts to Add',
      '> [!warning] Risk',
      '> Note any risky follow-up or unresolved blocker.',
      '',
      '> [!question] Open Question',
      '> Note anything that needs user or owner input.',
      '',
      '## QA Notes',
      '',
      '## Decision',
      '{{select:Decision|Approve,Request changes,Block,Needs owner review}}',
      '',
      '## Follow-up Tasks',
      '- [ ] '
    ].join('\n')
  },
  seoBrief: {
    file: 'SEO Content Brief.md',
    content: [
      '---',
      'type: seo-brief',
      'status: {{select:Status|Brief,Drafting,Review,Published}}',
      'content_type: {{select:Content type|Article,Landing page,Docs,Case study,Email}}',
      'created: {{date}}',
      'tags: [seo, content]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Audience',
      '{{prompt:Audience}}',
      '',
      '## Search Target',
      '- Primary keyword: {{prompt:Primary keyword}}',
      '- Secondary keywords: {{prompt:Secondary keywords}}',
      '- Search intent: {{select:Search intent|Informational,Commercial,Transactional,Navigational}}',
      '',
      '## Angle',
      '{{prompt:Angle}}',
      '',
      '## Reader Promise',
      '',
      '## Outline',
      '- H1: {{title}}',
      '- H2:',
      '- H2:',
      '- H2:',
      '',
      '## Evidence and Sources',
      '- ',
      '',
      '## Internal Links',
      '- ',
      '',
      '## Meta',
      '- Title tag:',
      '- Description:',
      '- Slug:',
      '',
      '## Notes for Agent',
      '- Preserve factual uncertainty.',
      '- Suggest sources before drafting claims.',
      '- Keep headings scannable.',
      ''
    ].join('\n')
  },
  productSpec: {
    file: 'PRD.md',
    content: [
      '---',
      'type: prd',
      'status: {{select:Status|Draft,Review,Ready,Building,Shipped}}',
      'owner: {{prompt:Owner}}',
      'created: {{date}}',
      'tags: [product, prd]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Problem',
      '{{prompt:Problem}}',
      '',
      '## Users',
      '{{prompt:Users}}',
      '',
      '## Goals',
      '- ',
      '',
      '## Non-goals',
      '- ',
      '',
      '## Requirements',
      '- Must:',
      '- Should:',
      '- Could:',
      '',
      '## User Experience',
      '- Entry point:',
      '- Primary flow:',
      '- Empty/error states:',
      '',
      '## Data and Instrumentation',
      '- Events:',
      '- Success metrics:',
      '- Guardrails:',
      '',
      '## Rollout Plan',
      '- ',
      '',
      '## Open Questions',
      '- ',
      '',
      '## Launch Checklist',
      '- [ ] Product review',
      '- [ ] Engineering review',
      '- [ ] Support/docs ready',
      ''
    ].join('\n')
  },
  supportTicket: {
    file: 'Support Ticket.md',
    content: [
      '---',
      'type: support-ticket',
      'status: {{select:Status|New,Waiting on customer,Investigating,Resolved,Closed}}',
      'priority: {{select:Priority|Low,Normal,High,Urgent}}',
      'customer: {{prompt:Customer}}',
      'created: {{date}}',
      'tags: [support]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Summary',
      '{{prompt:Summary}}',
      '',
      '## Customer Context',
      '- Customer: {{prompt:Customer}}',
      '- Plan/account:',
      '- Related notes:',
      '',
      '## Timeline',
      '- {{datetime}} - Created',
      '',
      '## Reproduction',
      '1. ',
      '2. ',
      '3. ',
      '',
      '## Expected',
      '',
      '## Actual',
      '',
      '## Workaround',
      '',
      '## Resolution',
      '',
      '## Follow-up',
      '- [ ] Reply to customer',
      '- [ ] Update docs or saved reply',
      '- [ ] Link related bug or decision'
    ].join('\n')
  },
  experimentLog: {
    file: 'Experiment Log.md',
    content: [
      '---',
      'type: experiment-log',
      'status: {{select:Status|Proposed,Running,Analyzing,Concluded}}',
      'owner: {{prompt:Owner}}',
      'started: {{date}}',
      'tags: [experiment]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Hypothesis',
      '{{prompt:Hypothesis}}',
      '',
      '## Success Criteria',
      '- ',
      '',
      '## Variables',
      '- Independent:',
      '- Dependent:',
      '- Controls:',
      '',
      '## Setup',
      '',
      '## Procedure',
      '1. ',
      '2. ',
      '3. ',
      '',
      '## Observations',
      '- ',
      '',
      '## Data',
      '- Source:',
      '- Result:',
      '',
      '## Conclusion',
      '',
      '## Decision',
      '{{select:Decision|Keep,Iterate,Stop,Inconclusive}}',
      '',
      '## Follow-up',
      '- [ ] '
    ].join('\n')
  },
  contentOutline: {
    file: 'Content Outline.md',
    content: [
      '---',
      'type: content-outline',
      'status: {{select:Status|Outline,Drafting,Review,Published}}',
      'format: {{select:Format|Article,Guide,Newsletter,Video,Talk,Thread}}',
      'audience: {{prompt:Audience}}',
      'created: {{date}}',
      'tags: [content, outline]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Goal',
      '{{prompt:Goal}}',
      '',
      '## Audience',
      '{{prompt:Audience}}',
      '',
      '## Reader Promise',
      '',
      '## Angle',
      '{{prompt:Angle}}',
      '',
      '## Outline',
      '- H1: {{title}}',
      '- H2:',
      '  - Point:',
      '  - Evidence:',
      '- H2:',
      '  - Point:',
      '  - Evidence:',
      '- H2:',
      '  - Point:',
      '  - Evidence:',
      '',
      '## Evidence and Links',
      '- ',
      '',
      '## Distribution Notes',
      '- Channel:',
      '- CTA:',
      '',
      '## Agent Drafting Notes',
      '- Preserve claims that need citations.',
      '- Keep examples concrete.',
      '- Do not fill gaps with invented facts.'
    ].join('\n')
  },
  interviewNotes: {
    file: 'Interview Notes.md',
    content: [
      '---',
      'type: interview-notes',
      'interview_type: {{select:Interview type|User research,Candidate,Customer,Expert,Internal}}',
      'participant: {{prompt:Participant}}',
      'date: {{date}}',
      'status: {{select:Status|Scheduled,Completed,Synthesized,Archived}}',
      'tags: [interview]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Objective',
      '{{prompt:Objective}}',
      '',
      '## Participant Context',
      '- Name: {{prompt:Participant}}',
      '- Role/context:',
      '- Related notes:',
      '',
      '## Questions',
      '- ',
      '',
      '## Notes',
      '',
      '## Highlights',
      '- ',
      '',
      '## Pain Points',
      '- ',
      '',
      '## Quotes',
      '- ',
      '',
      '## Opportunities',
      '- ',
      '',
      '## Follow-ups',
      '- [ ] ',
      '',
      '## Agent Synthesis Instructions',
      '- Separate observation from interpretation.',
      '- Preserve exact quotes only when recorded.',
      '- Link themes back to source notes.'
    ].join('\n')
  },
  bugReport: {
    file: 'Bug Report.md',
    content: [
      '---',
      'type: bug',
      "status: {{select:Status|New,Triaged,Fixing,Fixed,Won't fix}}",
      'severity: {{select:Severity|Low,Medium,High,Critical}}',
      'created: {{date}}',
      'tags: [bug]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Summary',
      '{{prompt:Summary}}',
      '',
      '## Impact',
      '{{prompt:Impact}}',
      '',
      '## Environment',
      '{{prompt:Environment}}',
      '',
      '## Steps to Reproduce',
      '1. ',
      '2. ',
      '3. ',
      '',
      '## Expected',
      '',
      '## Actual',
      '',
      '## Suspected Cause',
      '',
      '## Workaround',
      '',
      '## Notes / Fix',
      ''
    ].join('\n')
  },
  decision: {
    file: 'Decision Record.md',
    content: [
      '---',
      'type: decision-record',
      'status: {{select:Status|Proposed,Accepted,Rejected,Superseded}}',
      'date: {{date}}',
      'tags: [decision]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Decision',
      '{{prompt:Decision}}',
      '',
      '## Context',
      '',
      '## Options',
      '- Option A:',
      '- Option B:',
      '',
      '## Rationale',
      '',
      '## Consequences',
      '- ',
      '',
      '## Review Date',
      '{{prompt:Review date}}',
      ''
    ].join('\n')
  },
  releaseNotes: {
    file: 'Release Notes.md',
    content: [
      '---',
      'type: release-notes',
      'version: {{prompt:Version}}',
      'date: {{date}}',
      'tags: [release]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Highlights',
      '- ',
      '',
      '## Added',
      '- ',
      '',
      '## Improved',
      '- ',
      '',
      '## Fixed',
      '- ',
      '',
      '## Notes',
      ''
    ].join('\n')
  },
  changelog: {
    file: 'Changelog Entry.md',
    content: [
      '---',
      'type: changelog',
      'date: {{datetime}}',
      'change_type: {{select:Change type|Feature,Improvement,Fix,Docs,Internal}}',
      'tags: [forge, changelog]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Date',
      '{{datetime}}',
      '',
      '## Type',
      '{{select:Change type|Feature,Improvement,Fix,Docs,Internal}}',
      '',
      '## Summary',
      '{{prompt:Summary}}',
      '',
      '## User Impact',
      '{{prompt:User impact}}',
      '',
      '## Website Copy Notes',
      '{{prompt:Website copy notes}}',
      '',
      '## Validation',
      '',
      '## Implementation Notes',
      ''
    ].join('\n')
  },
  publishPage: {
    file: 'Publish Page.md',
    content: [
      '---',
      'type: publish-page',
      'status: {{select:Status|Draft,Review,Published}}',
      'slug: {{prompt:Slug}}',
      'description: {{prompt:Description}}',
      'created: {{date}}',
      'tags: [publish]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Summary',
      '{{prompt:Summary}}',
      '',
      '## Body',
      '',
      '## Calls to Action',
      '- ',
      '',
      '## Assets',
      '- ',
      '',
      '## Links',
      '- ',
      '',
      '## Publishing Checklist',
      '- [ ] Check links',
      '- [ ] Check images and media',
      '- [ ] Check title and description',
      '- [ ] Export static site',
      ''
    ].join('\n')
  },
  transcriptCleanup: {
    file: 'Transcript Cleanup.md',
    content: [
      '---',
      'type: transcript-cleanup',
      'status: {{select:Status|Raw,Cleaning,Reviewed,Published}}',
      'source: {{prompt:Source recording or note}}',
      'created: {{date}}',
      'tags: [transcript, voice]',
      '---',
      '',
      '# {{title}}',
      '',
      '## Cleanup Instructions',
      '{{prompt:Cleanup instructions}}',
      '',
      '## Speaker Notes',
      '{{prompt:Speaker names}}',
      '',
      '## Raw Transcript',
      '',
      '## Cleaned Transcript',
      '',
      '## Summary',
      '- ',
      '',
      '## Key Points',
      '- ',
      '',
      '## Action Items',
      '- [ ] ',
      '',
      '## Quotes to Preserve',
      '- ',
      '',
      '## Follow-up Questions',
      '- ',
      '',
      '## Agent Instructions',
      '- Preserve speaker intent.',
      '- Remove filler and obvious transcription mistakes.',
      '- Keep uncertain phrases marked with [?].',
      '- Do not invent facts that are not in the transcript.'
    ].join('\n')
  }
}

export const useStore = create<ForgeState>((set, get) => ({
  booted: false,
  vault: null,
  vaultName: '',
  files: [],
  folders: [],
  index: {},
  tabs: [],
  activeTabId: null,
  theme: DEFAULT_SETTINGS.theme,
  fontSize: DEFAULT_SETTINGS.fontSize,
  lineWidth: DEFAULT_SETTINGS.lineWidth,
  templatesFolder: DEFAULT_SETTINGS.templatesFolder,
  dailyNotesFolder: DEFAULT_SETTINGS.dailyNotesFolder,
  bookmarks: [],
  bookmarkSettings: DEFAULT_SETTINGS.bookmarks,
  enabledExtensions: DEFAULT_SETTINGS.enabledExtensions,
  extensionSettings: createDefaultExtensionSettings(),
  recentVaults: [],
  leftOpen: true,
  rightOpen: true,
  leftPane: 'files',
  modal: null,
  contextMenu: null,
  counts: { words: 0, chars: 0 },
  contentVersion: 0,

  async boot() {
    const settings = await window.forge.readSettings()
    const extensionSettings = normalizeExtensionSettings(settings.extensionSettings, settings.enabledExtensions)
    const bookmarkSettings = normalizeBookmarkSettings(settings.bookmarks)
    set({
      theme: settings.theme,
      fontSize: settings.fontSize,
      lineWidth: settings.lineWidth,
      templatesFolder: settings.templatesFolder,
      dailyNotesFolder: settings.dailyNotesFolder,
      bookmarkSettings,
      extensionSettings,
      enabledExtensions: enabledExtensionIds(extensionSettings),
      recentVaults: settings.recentVaults,
      booted: true
    })
    window.forge.setThemeSource(settings.theme)
    if (settings.lastVault) {
      try {
        await get().openVaultPath(settings.lastVault)
      } catch {
        // vault moved or deleted; stay on the picker
      }
    }
  },

  async openVaultDialog() {
    const path = await window.forge.selectVault()
    if (path) await get().openVaultPath(path)
  },

  async openVaultPath(vault) {
    const data = await window.forge.openVault(vault)
    noteContents.clear()
    for (const [path, content] of Object.entries(data.contents)) noteContents.set(path, content)

    // Seed an empty vault with a welcome note
    let files = data.files
    if (!files.some(isMarkdown)) {
      const welcome = await window.forge.createFile(vault, 'Welcome.md', WELCOME_NOTE)
      noteContents.set(welcome, WELCOME_NOTE)
      files = [...files, welcome].sort()
    }

    const recents = [vault, ...get().recentVaults.filter((v) => v !== vault)].slice(0, 8)
    const firstNote = files.find(isMarkdown) ?? null
    const tab: Tab = { id: newTabId(), kind: firstNote ? 'note' : 'empty', path: firstNote, mode: 'edit' }
    const bookmarks = bookmarksForVault(get().bookmarkSettings, vault, files)

    set({
      vault,
      vaultName: vault.split('/').pop() ?? vault,
      files,
      folders: data.folders,
      index: buildIndex(data.contents),
      bookmarks,
      bookmarkSettings: { ...get().bookmarkSettings, [vault]: bookmarks },
      tabs: [tab],
      activeTabId: tab.id,
      recentVaults: recents,
      leftPane: 'files',
      modal: null,
      contentVersion: get().contentVersion + 1
    })
    if (firstNote) {
      set({ counts: wordCount(noteContents.get(firstNote) ?? '') })
    }
    await window.forge.watchVault(vault)
    persistSettings(get())
  },

  closeVault() {
    noteContents.clear()
    set({ vault: null, vaultName: '', files: [], folders: [], index: {}, bookmarks: [], tabs: [], activeTabId: null, modal: null })
    window.forge.setMobileVault(null).catch(console.error)
    persistSettings({ ...get(), vault: null } as ForgeState)
  },

  async refreshVault() {
    const { vault } = get()
    if (!vault) return
    const data = await window.forge.openVault(vault)
    // Keep locally-edited content that hasn't hit disk yet
    for (const [path, content] of Object.entries(data.contents)) {
      if (!saveTimers.has(path)) noteContents.set(path, content)
    }
    for (const key of Array.from(noteContents.keys())) {
      if (!(key in data.contents) && !saveTimers.has(key)) noteContents.delete(key)
    }
    const index = buildIndex(Object.fromEntries(noteContents))
    // Drop tabs whose file disappeared
    const tabs = get().tabs.map((t) =>
      t.kind === 'note' && t.path && !data.files.includes(t.path) ? { ...t, kind: 'empty' as TabKind, path: null } : t
    )
    const bookmarks = bookmarksForVault(get().bookmarkSettings, vault, data.files)
    set({
      files: data.files,
      folders: data.folders,
      index,
      bookmarks,
      bookmarkSettings: { ...get().bookmarkSettings, [vault]: bookmarks },
      tabs,
      contentVersion: get().contentVersion + 1
    })
  },

  openFile(path, opts) {
    const { tabs, activeTabId } = get()
    const existing = tabs.find((t) => t.kind === 'note' && t.path === path)
    if (existing) {
      set({ activeTabId: existing.id })
    } else if (!opts?.newTab && activeTabId) {
      set({
        tabs: tabs.map((t) => (t.id === activeTabId ? { ...t, kind: 'note' as TabKind, path, mode: t.mode } : t))
      })
    } else {
      const tab: Tab = { id: newTabId(), kind: 'note', path, mode: 'edit' }
      set({ tabs: [...tabs, tab], activeTabId: tab.id })
    }
    set({ counts: wordCount(noteContents.get(path) ?? '') })
  },

  openGraph() {
    const { tabs } = get()
    const existing = tabs.find((t) => t.kind === 'graph')
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    const tab: Tab = { id: newTabId(), kind: 'graph', path: null, mode: 'edit' }
    set({ tabs: [...tabs, tab], activeTabId: tab.id })
  },

  openBoard() {
    const { tabs } = get()
    const existing = tabs.find((t) => t.kind === 'board')
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    const tab: Tab = { id: newTabId(), kind: 'board', path: null, mode: 'edit' }
    set({ tabs: [...tabs, tab], activeTabId: tab.id })
  },

  newTab() {
    const tab: Tab = { id: newTabId(), kind: 'empty', path: null, mode: 'edit' }
    set({ tabs: [...get().tabs, tab], activeTabId: tab.id })
  },

  closeTab(id) {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    const next = tabs.filter((t) => t.id !== id)
    let nextActive = activeTabId
    if (activeTabId === id) {
      nextActive = next[Math.min(idx, next.length - 1)]?.id ?? null
    }
    set({ tabs: next, activeTabId: nextActive })
  },

  activateTab(id) {
    set({ activeTabId: id })
    const tab = get().tabs.find((t) => t.id === id)
    if (tab?.path) set({ counts: wordCount(noteContents.get(tab.path) ?? '') })
  },

  setTabMode(id, mode) {
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, mode } : t)) })
  },

  toggleActiveMode() {
    const { tabs, activeTabId } = get()
    const tab = tabs.find((t) => t.id === activeTabId)
    if (tab && tab.kind === 'note') {
      get().setTabMode(tab.id, tab.mode === 'edit' ? 'read' : 'edit')
    }
  },

  updateContent(path, content) {
    const { vault, tabs, activeTabId } = get()
    if (!vault) return
    noteContents.set(path, content)

    const existing = saveTimers.get(path)
    if (existing) clearTimeout(existing)
    saveTimers.set(
      path,
      setTimeout(() => {
        saveTimers.delete(path)
        window.forge.writeFile(vault, path, content).catch(console.error)
      }, 500)
    )

    const parseExisting = parseTimers.get(path)
    if (parseExisting) clearTimeout(parseExisting)
    parseTimers.set(
      path,
      setTimeout(() => {
        parseTimers.delete(path)
        set({
          index: { ...get().index, [path]: parseNote(content) },
          contentVersion: get().contentVersion + 1
        })
      }, 300)
    )

    const active = tabs.find((t) => t.id === activeTabId)
    if (active?.path === path) set({ counts: wordCount(content) })
  },

  async createNote(folder) {
    const { vault } = get()
    if (!vault) return
    const rel = (folder ? folder + '/' : '') + 'Untitled.md'
    const created = await window.forge.createFile(vault, rel, '')
    noteContents.set(created, '')
    set({
      files: [...get().files, created].sort(),
      index: { ...get().index, [created]: parseNote('') }
    })
    get().openFile(created)
  },

  async createNoteNamed(name) {
    const { vault } = get()
    if (!vault) return null
    const clean = name.replace(/[\\:*?"<>|]/g, '').trim()
    if (!clean) return null
    const created = await window.forge.createFile(vault, clean + '.md', '')
    noteContents.set(created, '')
    set({
      files: [...get().files, created].sort(),
      index: { ...get().index, [created]: parseNote('') }
    })
    get().openFile(created)
    return created
  },

  async createNoteFromTemplate(templatePath, opts) {
    const { vault, vaultName } = get()
    if (!vault) return null

    const template = await window.forge.readFile(vault, templatePath)
    const title = noteTitle(opts?.title ?? '', baseName(templatePath))
    const folder = normalizeFolderPath(opts?.folder ?? '')
    const rel = `${folder ? folder + '/' : ''}${title}.md`
    const content = renderTemplate(template || `# {{title}}\n`, {
      title,
      vaultName,
      templateName: baseName(templatePath),
      folder,
      variables: opts?.variables
    })

    const created = await window.forge.createFile(vault, rel, content)
    noteContents.set(created, content)
    set({
      files: [...get().files, created].sort(),
      folders: [...new Set([...get().folders, ...folderAncestors(folder)])].sort(),
      index: { ...get().index, [created]: parseNote(content) },
      contentVersion: get().contentVersion + 1
    })
    get().openFile(created)
    return created
  },

  async createStarterTemplate(kind) {
    const { vault, templatesFolder } = get()
    if (!vault) return null
    const starter = STARTER_TEMPLATES[kind]
    const folder = normalizeFolderPath(templatesFolder || DEFAULT_SETTINGS.templatesFolder)
    const rel = `${folder ? folder + '/' : ''}${starter.file}`
    const created = await window.forge.createFile(vault, rel, starter.content)
    noteContents.set(created, starter.content)
    set({
      files: [...get().files, created].sort(),
      folders: [...new Set([...get().folders, ...folderAncestors(folder)])].sort(),
      index: { ...get().index, [created]: parseNote(starter.content) },
      contentVersion: get().contentVersion + 1
    })
    get().openFile(created)
    return created
  },

  async createDailyNote() {
    const { vault, dailyNotesFolder, templatesFolder } = get()
    if (!vault) return null
    const today = formatTemplateDateParts(new Date())
    const rel = `${dailyNotesFolder || 'Daily'}/${today.date}.md`
    const existing = get().files.find((file) => file.toLowerCase() === rel.toLowerCase())
    if (existing) {
      get().openFile(existing)
      return existing
    }

    const templatePath = `${templatesFolder || 'Templates'}/Daily.md`
    let template = ''
    try {
      template = await window.forge.readFile(vault, templatePath)
    } catch {
      template = [
        '---',
        `date: ${today.date}`,
        'tags: [daily]',
        '---',
        '',
        '# {{date}}',
        '',
        '## Notes',
        '',
        '## Tasks',
        ''
      ].join('\n')
    }
    const content = renderTemplate(template, {
      title: today.date,
      vaultName: get().vaultName,
      templateName: 'Daily',
      folder: dailyNotesFolder || 'Daily'
    })

    const created = await window.forge.createFile(vault, rel, content)
    noteContents.set(created, content)
    set({
      files: [...get().files, created].sort(),
      folders: [...new Set([...get().folders, dailyNotesFolder || 'Daily'])].sort(),
      index: { ...get().index, [created]: parseNote(content) },
      contentVersion: get().contentVersion + 1
    })
    get().openFile(created)
    return created
  },

  async createFolder(parent, name) {
    const { vault } = get()
    if (!vault || !name.trim()) return
    const rel = (parent ? parent + '/' : '') + name.trim()
    await window.forge.createFolder(vault, rel)
    set({ folders: [...get().folders, rel].sort() })
  },

  async renamePath(oldPath, newPath) {
    const { vault } = get()
    if (!vault || oldPath === newPath) return
    await window.forge.rename(vault, oldPath, newPath)
    const mapPath = (p: string): string =>
      p === oldPath ? newPath : p.startsWith(oldPath + '/') ? newPath + p.slice(oldPath.length) : p

    for (const key of Array.from(noteContents.keys())) {
      const mapped = mapPath(key)
      if (mapped !== key) {
        noteContents.set(mapped, noteContents.get(key)!)
        noteContents.delete(key)
      }
    }
    const index: Record<string, NoteMeta> = {}
    for (const [key, value] of Object.entries(get().index)) index[mapPath(key)] = value

    const bookmarks = normalizeBookmarkList(get().bookmarks.map(mapPath))
    set({
      files: get().files.map(mapPath).sort(),
      folders: get().folders.map(mapPath).sort(),
      index,
      bookmarks,
      bookmarkSettings: { ...get().bookmarkSettings, [vault]: bookmarks },
      tabs: get().tabs.map((t) => (t.path ? { ...t, path: mapPath(t.path) } : t)),
      contentVersion: get().contentVersion + 1
    })
    persistSettings(get())
  },

  async movePath(source, targetFolder) {
    const { files, folders } = get()
    // A folder can't be moved into itself or its own descendant
    if (targetFolder === source || targetFolder.startsWith(source + '/')) return
    const parent = source.split('/').slice(0, -1).join('/')
    if (parent === targetFolder) return

    const name = source.split('/').pop()!
    const exists = (p: string): boolean => files.includes(p) || folders.includes(p)
    const inTarget = (n: string): string => (targetFolder ? targetFolder + '/' : '') + n
    let dest = inTarget(name)
    if (exists(dest)) {
      const dot = name.lastIndexOf('.')
      const stem = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      let n = 1
      while (exists(dest)) {
        dest = inTarget(`${stem} ${n}${ext}`)
        n += 1
      }
    }
    await get().renamePath(source, dest)
  },

  async trashPath(path) {
    const { vault } = get()
    if (!vault) return
    await window.forge.trash(vault, path)
    const gone = (p: string): boolean => p === path || p.startsWith(path + '/')
    for (const key of Array.from(noteContents.keys())) if (gone(key)) noteContents.delete(key)
    const index: Record<string, NoteMeta> = {}
    for (const [key, value] of Object.entries(get().index)) if (!gone(key)) index[key] = value
    const bookmarks = get().bookmarks.filter((bookmark) => !gone(bookmark))
    set({
      files: get().files.filter((f) => !gone(f)),
      folders: get().folders.filter((f) => !gone(f)),
      index,
      bookmarks,
      bookmarkSettings: { ...get().bookmarkSettings, [vault]: bookmarks },
      tabs: get().tabs.map((t) =>
        t.path && gone(t.path) ? { ...t, kind: 'empty' as TabKind, path: null } : t
      ),
      contentVersion: get().contentVersion + 1
    })
    persistSettings(get())
  },

  setTheme(theme) {
    set({ theme })
    window.forge.setThemeSource(theme)
    persistSettings(get())
  },

  setFontSize(fontSize) {
    set({ fontSize })
    persistSettings(get())
  },

  setLineWidth(lineWidth) {
    set({ lineWidth })
    persistSettings(get())
  },
  setTemplatesFolder(templatesFolder) {
    set({ templatesFolder: templatesFolder.trim() || DEFAULT_SETTINGS.templatesFolder })
    persistSettings(get())
  },
  setDailyNotesFolder(dailyNotesFolder) {
    set({ dailyNotesFolder: dailyNotesFolder.trim() || DEFAULT_SETTINGS.dailyNotesFolder })
    persistSettings(get())
  },
  toggleBookmark(path) {
    const { files, vault } = get()
    if (!vault || !files.includes(path) || !isMarkdown(path)) return
    const current = get().bookmarks
    const exists = current.includes(path)
    const bookmarks = exists ? current.filter((bookmark) => bookmark !== path) : [...current, path]
    set({ bookmarks, bookmarkSettings: { ...get().bookmarkSettings, [vault]: bookmarks } })
    persistSettings(get())
  },
  removeBookmark(path) {
    const { vault } = get()
    if (!vault) return
    const bookmarks = get().bookmarks.filter((bookmark) => bookmark !== path)
    if (bookmarks.length === get().bookmarks.length) return
    set({ bookmarks, bookmarkSettings: { ...get().bookmarkSettings, [vault]: bookmarks } })
    persistSettings(get())
  },
  setExtensionInstalled(extensionId, installed) {
    const extensionSettings = withExtensionInstalled(get().extensionSettings, extensionId, installed)
    set({ extensionSettings, enabledExtensions: enabledExtensionIds(extensionSettings) })
    persistSettings(get())
  },
  setExtensionEnabled(extensionId, enabled) {
    const baseSettings = enabled ? withExtensionInstalled(get().extensionSettings, extensionId, true) : get().extensionSettings
    const extensionSettings = withExtensionEnabled(baseSettings, extensionId, enabled)
    set({ extensionSettings, enabledExtensions: enabledExtensionIds(extensionSettings) })
    persistSettings(get())
  },

  setLeftOpen(leftOpen) {
    set({ leftOpen })
  },
  setRightOpen(rightOpen) {
    set({ rightOpen })
  },
  setLeftPane(leftPane) {
    set({ leftPane, leftOpen: true })
  },
  setModal(modal) {
    set({ modal })
  },
  setContextMenu(contextMenu) {
    set({ contextMenu })
  }
}))

/** All notes that link to `path` with the matched link text context. */
export function backlinksFor(path: string, files: string[], index: Record<string, NoteMeta>): string[] {
  const result: string[] = []
  for (const [source, meta] of Object.entries(index)) {
    if (source === path) continue
    if (meta.links.some((l) => resolveLink(l, files) === path)) result.push(source)
  }
  return result.sort()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function unlinkedMentionsFor(path: string, files: string[], index: Record<string, NoteMeta>): string[] {
  const meta = index[path]
  const names = [noteDisplayTitle(path, meta), baseName(path), ...(meta?.aliases ?? [])]
    .map((name) => name.trim())
    .filter((name, index, all) => name.length >= 3 && all.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index)
  if (names.length === 0) return []

  const linkedSources = new Set(backlinksFor(path, files, index))
  const patterns = names.map((name) => new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(name)}([^\\p{L}\\p{N}_]|$)`, 'iu'))
  const result: string[] = []
  for (const source of files.filter(isMarkdown)) {
    if (source === path || linkedSources.has(source)) continue
    const content = noteContents.get(source) ?? ''
    if (patterns.some((pattern) => pattern.test(content))) result.push(source)
  }
  return result.sort()
}

export function activeTab(state: ForgeState): Tab | null {
  return state.tabs.find((t) => t.id === state.activeTabId) ?? null
}

export function tabTitle(tab: Tab): string {
  if (tab.kind === 'graph') return 'Graph'
  if (tab.kind === 'board') return 'Board'
  if (tab.kind === 'empty' || !tab.path) return 'New tab'
  return baseName(tab.path)
}

const WELCOME_NOTE = `# Welcome to Forge

Forge keeps your notes as **plain Markdown files**, right here on your Mac.

## The basics

- Press **⌘O** to quickly open or create a note
- Press **⌘P** to run any command
- Make connections with wikilinks: type \`[[\` and start writing
- Add #tags anywhere to organize

## Make it yours

Open **Settings** from the command palette to switch between light, dark, and system themes.

> Your second brain should feel like home. Make a few notes, link them together, then open the graph view to watch your ideas connect.
`
