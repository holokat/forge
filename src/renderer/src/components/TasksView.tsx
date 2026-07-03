import { CheckCircle2, Circle, ListChecks, Search, SquareCheckBig } from 'lucide-react'
import { useMemo, useState } from 'react'
import { isMarkdown, noteDisplayTitle } from '../lib/parse'
import { markdownTasks, type MarkdownTask } from '../lib/tasks'
import { noteContents, useStore } from '../store'

type TaskFilter = 'open' | 'done' | 'all'

interface VaultTask extends MarkdownTask {
  path: string
  title: string
}

function folderName(path: string): string {
  const parts = path.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : 'Vault root'
}

function taskMatchesQuery(task: VaultTask, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return `${task.text} ${task.title} ${task.path}`.toLowerCase().includes(normalized)
}

function taskMatchesFilter(task: VaultTask, filter: TaskFilter): boolean {
  if (filter === 'all') return true
  return filter === 'done' ? task.done : !task.done
}

function openTask(path: string, lineNumber: number): void {
  useStore.getState().openFile(path, { line: lineNumber })
}

function TaskRow({ task }: { task: VaultTask }): React.JSX.Element {
  return (
    <button
      className={`tasks-view-row${task.done ? ' is-done' : ''}`}
      onClick={() => openTask(task.path, task.lineNumber)}
    >
      <span className="tasks-view-check">{task.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}</span>
      <span className="tasks-view-row-main">
        <strong>{task.text}</strong>
        <span>
          {task.title} · Line {task.lineNumber + 1}
        </span>
      </span>
      <span className="tasks-view-folder">{folderName(task.path)}</span>
    </button>
  )
}

export default function TasksView(): React.JSX.Element {
  const files = useStore((s) => s.files)
  const index = useStore((s) => s.index)
  const contentVersion = useStore((s) => s.contentVersion)
  const [filter, setFilter] = useState<TaskFilter>('open')
  const [query, setQuery] = useState('')

  const tasks = useMemo(() => {
    void contentVersion
    return files
      .filter(isMarkdown)
      .flatMap((path) =>
        markdownTasks(noteContents.get(path) ?? '').map((task) => ({
          ...task,
          path,
          title: noteDisplayTitle(path, index[path])
        }))
      )
      .sort((a, b) => Number(a.done) - Number(b.done) || a.path.localeCompare(b.path) || a.lineNumber - b.lineNumber)
  }, [contentVersion, files, index])

  const open = tasks.filter((task) => !task.done)
  const done = tasks.length - open.length
  const visible = tasks.filter((task) => taskMatchesFilter(task, filter) && taskMatchesQuery(task, query))

  return (
    <div className="tasks-view">
      <div className="tasks-view-hero">
        <div className="tasks-view-hero-title">
          <SquareCheckBig size={18} />
          <div>
            <h1>Tasks</h1>
            <p>Markdown checkboxes across the vault.</p>
          </div>
        </div>
        <div className="tasks-view-stats" aria-label="Task summary">
          <span>
            <strong>{open.length.toLocaleString()}</strong>
            Open
          </span>
          <span>
            <strong>{done.toLocaleString()}</strong>
            Done
          </span>
          <span>
            <strong>{tasks.length.toLocaleString()}</strong>
            Total
          </span>
        </div>
      </div>
      <div className="tasks-view-toolbar">
        <label className="tasks-view-search">
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" />
        </label>
        <div className="tasks-view-filter" aria-label="Task filter">
          {(['open', 'done', 'all'] as const).map((item) => (
            <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="tasks-view-scroll">
        {visible.length > 0 ? (
          <div className="tasks-view-list">
            {visible.map((task) => (
              <TaskRow key={`${task.path}:${task.lineNumber}:${task.text}`} task={task} />
            ))}
          </div>
        ) : (
          <div className="tasks-view-empty">
            <ListChecks size={18} />
            <strong>No matching tasks</strong>
            <span>{tasks.length === 0 ? 'No tasks in this vault.' : 'No results for this filter.'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
