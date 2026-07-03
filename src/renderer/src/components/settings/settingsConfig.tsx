import type { ReactNode } from 'react'
import {
  AlertCircle,
  BookOpen,
  Bot,
  Briefcase,
  Bug,
  CalendarDays,
  CalendarRange,
  Check,
  ClipboardCheck,
  ClipboardList,
  Code2,
  Download,
  FileAudio,
  FileCode2,
  FileSearch,
  FileText,
  FlaskConical,
  Globe2,
  GraduationCap,
  Library,
  LifeBuoy,
  Lightbulb,
  ListChecks,
  Monitor,
  Moon,
  Network,
  Newspaper,
  Palette,
  PenLine,
  Plug,
  Quote,
  RefreshCw,
  Rocket,
  ScrollText,
  Search,
  SearchCheck,
  Sparkles,
  Smartphone,
  Sun,
  Terminal,
  UserRound,
  Users,
  Vault as VaultIcon,
  Wrench
} from 'lucide-react'
import type { PublishSiteTheme, ThemeMode } from '../../../../shared/types'
import type { StarterTemplateKind } from '../../lib/starterTemplates'

export const THEMES: { mode: ThemeMode; label: string; icon: ReactNode }[] = [
  { mode: 'light', label: 'Light', icon: <Sun size={15} /> },
  { mode: 'dark', label: 'Dark', icon: <Moon size={15} /> },
  { mode: 'system', label: 'System', icon: <Monitor size={15} /> }
]

export const PUBLISH_THEMES: { id: PublishSiteTheme; label: string; detail: string }[] = [
  { id: 'minimal', label: 'Minimal', detail: 'Quiet, clean notes site' },
  { id: 'editorial', label: 'Editorial', detail: 'Sharper typography for essays' },
  { id: 'reference', label: 'Reference', detail: 'Dense docs-style browsing' },
  { id: 'quiet-paper', label: 'Quiet Paper', detail: 'Warm editorial paper, serif writing' },
  { id: 'terminal-ledger', label: 'Terminal Ledger', detail: 'Dark engineering ledger with mono rows' },
  { id: 'swiss-ledger', label: 'Swiss Ledger', detail: 'High-contrast numbered index' },
  { id: 'soft-focus', label: 'Soft Focus', detail: 'Airy narrow-column personal blog' },
  { id: 'field-notes', label: 'Field Notes', detail: 'Archival side-rail journal layout' }
]

export const STARTER_TEMPLATE_ICONS: Record<StarterTemplateKind, ReactNode> = {
  daily: <CalendarDays size={16} />,
  weeklyReview: <CalendarRange size={16} />,
  meeting: <Users size={16} />,
  sourceNote: <BookOpen size={16} />,
  knowledgeMap: <Network size={16} />,
  calloutLibrary: <Quote size={16} />,
  agentTask: <Bot size={16} />,
  agentReview: <SearchCheck size={16} />,
  taskReview: <ListChecks size={16} />,
  savedQuery: <Search size={16} />,
  publishPreflight: <ClipboardCheck size={16} />,
  savedQueryCatalog: <Library size={16} />,
  verificationReportWorkflow: <FileSearch size={16} />,
  implementationPlan: <ClipboardList size={16} />,
  refactorPlan: <Wrench size={16} />,
  seoBrief: <Globe2 size={16} />,
  contentRefreshBrief: <RefreshCw size={16} />,
  research: <Search size={16} />,
  sprintPlan: <CalendarRange size={16} />,
  productSpec: <FileText size={16} />,
  project: <Briefcase size={16} />,
  supportTicket: <LifeBuoy size={16} />,
  experimentLog: <FlaskConical size={16} />,
  contentOutline: <PenLine size={16} />,
  interviewNotes: <Users size={16} />,
  bugReport: <Bug size={16} />,
  decision: <Lightbulb size={16} />,
  incidentPostmortem: <AlertCircle size={16} />,
  technicalRFC: <FileCode2 size={16} />,
  apiSpec: <Code2 size={16} />,
  extensionSpec: <Plug size={16} />,
  launchPlan: <Rocket size={16} />,
  customerProfile: <UserRound size={16} />,
  contentCalendar: <CalendarDays size={16} />,
  learningPlan: <GraduationCap size={16} />,
  decisionReview: <ClipboardCheck size={16} />,
  publishPage: <Globe2 size={16} />,
  publishRunbook: <Terminal size={16} />,
  changelog: <Newspaper size={16} />,
  transcriptCleanup: <FileAudio size={16} />,
  releaseNotes: <ScrollText size={16} />,
  person: <UserRound size={16} />
}

export type SettingsTabId =
  | 'appearance'
  | 'notes'
  | 'vault'
  | 'publishing'
  | 'forgeBuddy'
  | 'agents'
  | 'ai'
  | 'extensions'
  | 'updates'

export type SettingsNavGroup = 'Workspace' | 'Connections' | 'System'

export interface SettingsNavItem {
  id: SettingsTabId
  label: string
  description: string
  group: SettingsNavGroup
  icon: ReactNode
  disabled?: boolean
}

export function createSettingsTabs(vault: string | null): SettingsNavItem[] {
  return [
    {
      id: 'appearance',
      label: 'Appearance',
      description: 'Theme, type size, and reading width.',
      group: 'Workspace',
      icon: <Palette size={15} />
    },
    {
      id: 'notes',
      label: 'Notes',
      description: 'Daily notes and templates.',
      group: 'Workspace',
      icon: <FileText size={15} />
    },
    {
      id: 'vault',
      label: 'Vault',
      description: 'Current local Markdown folder.',
      group: 'Workspace',
      icon: <VaultIcon size={15} />,
      disabled: !vault
    },
    {
      id: 'publishing',
      label: 'Publishing',
      description: 'Static site export.',
      group: 'Connections',
      icon: <Globe2 size={15} />,
      disabled: !vault
    },
    {
      id: 'forgeBuddy',
      label: 'Forge Buddy',
      description: 'Mobile recorder pairing.',
      group: 'Connections',
      icon: <Smartphone size={15} />,
      disabled: !vault
    },
    {
      id: 'agents',
      label: 'Agents',
      description: 'CLI and MCP access.',
      group: 'Connections',
      icon: <Bot size={15} />,
      disabled: !vault
    },
    {
      id: 'ai',
      label: 'AI',
      description: 'Codex and API providers.',
      group: 'Connections',
      icon: <Sparkles size={15} />
    },
    {
      id: 'extensions',
      label: 'Extensions',
      description: 'Installed Forge add-ons.',
      group: 'System',
      icon: <Plug size={15} />
    },
    {
      id: 'updates',
      label: 'Updates',
      description: 'Release checks and installs.',
      group: 'System',
      icon: <Download size={15} />
    }
  ]
}
