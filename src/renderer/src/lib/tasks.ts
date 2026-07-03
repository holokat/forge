export interface MarkdownTask {
  lineNumber: number
  text: string
  done: boolean
}

export function markdownTasks(content: string): MarkdownTask[] {
  const tasks: MarkdownTask[] = []
  let inFence = false

  content.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return

    const match = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(.+)$/.exec(line)
    if (match) {
      tasks.push({
        lineNumber: index,
        text: match[3].trim(),
        done: match[2].toLowerCase() === 'x'
      })
    }
  })

  return tasks
}
