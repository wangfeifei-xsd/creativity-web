import type { DataNode } from 'antd/es/tree'

export function fileTree(paths: string[]): DataNode[] {
  const roots: DataNode[] = []
  for (const path of paths) {
    const parts = path.split('/')
    let nodes = roots
    let prefix = ''
    parts.forEach((part, index) => {
      prefix = prefix ? `${prefix}/${part}` : part
      const leaf = index === parts.length - 1
      let node = nodes.find(n => n.key === prefix)
      if (!node) { node = { title: part, key: prefix, isLeaf: leaf, selectable: leaf, children: leaf ? undefined : [] }; nodes.push(node) }
      if (node.children) nodes = node.children
    })
  }
  return roots
}

