export interface TreeNode {
  name: string
  path: string
  isFolder: boolean
  children: TreeNode[]
}

const VOICE_INBOX_PATH = 'Inbox/Voice'

export function buildTree(files: string[], folders: string[], pinnedFolders: string[] = []): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isFolder: true, children: [] }
  const nodes = new Map<string, TreeNode>([['', root]])
  const pinned = new Set(pinnedFolders)

  const ensureFolder = (path: string): TreeNode => {
    const existing = nodes.get(path)
    if (existing) return existing
    const parts = path.split('/')
    const name = parts.pop()!
    const parent = ensureFolder(parts.join('/'))
    const node: TreeNode = { name, path, isFolder: true, children: [] }
    parent.children.push(node)
    nodes.set(path, node)
    return node
  }

  for (const folder of folders) ensureFolder(folder)

  for (const file of files) {
    const parts = file.split('/')
    const name = parts.pop()!
    const parent = ensureFolder(parts.join('/'))
    parent.children.push({ name, path: file, isFolder: false, children: [] })
  }

  const sortNode = (node: TreeNode): void => {
    node.children.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
      if (a.isFolder && b.isFolder) {
        const aPinned = pinned.has(a.path)
        const bPinned = pinned.has(b.path)
        if (aPinned !== bPinned) return aPinned ? -1 : 1
      }
      if (node.path === VOICE_INBOX_PATH && !a.isFolder && !b.isFolder) {
        return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' })
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    node.children.forEach(sortNode)
  }
  sortNode(root)
  return root.children
}
