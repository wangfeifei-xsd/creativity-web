export type MenuNode = { id: string; name: string; kind: 'DIR' | 'MENU' | 'BUTTON'; kind_label: string; parent_id: string | null;
  page_key: string | null; page_name: string | null; action_key: string | null; action_name: string | null;
  workspace: 'platform' | 'channel' | 'both'; workspace_label: string; sort_order: number; visible: boolean; active: boolean;
  status_label: string; revision: number; protected: boolean }
export type Role = { id: string; name: string; builtin: boolean; revision?: number; allowed_actions: string[]; action_names: string[];
  menu_ids: string[] | null; active: boolean; state_label: string; member_count: number; editable: boolean; updated_at?: string }
export type RoleOptions = { scope: string; scope_name: string; menus: MenuNode[]; actions: { value: string; label: string }[] }
export type MenuTreeNode = MenuNode & { key: string; title: string; children?: MenuTreeNode[] }

export function menuTree(nodes: MenuNode[], search = ''): MenuTreeNode[] {
  const known = new Set(nodes.map(node => node.id))
  function children(parent: string | null): MenuTreeNode[] {
    return nodes.filter(node => (known.has(node.parent_id ?? '') ? node.parent_id : null) === parent)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'zh-CN'))
      .map(node => ({ ...node, key: node.id, title: node.name, children: children(node.id) }))
      .filter(node => !search || node.name.includes(search) || node.action_name?.includes(search) || node.children.length > 0)
      .map(node => ({ ...node, children: node.children.length ? node.children : undefined }))
  }
  return children(null)
}
