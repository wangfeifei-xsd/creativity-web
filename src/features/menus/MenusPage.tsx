import { Button, Input, Select, Space, Tag, TreeSelect } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { apiClient } from '../../api/client'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { EditorDialog, ErrorNotice } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { menuTree, type MenuNode, type MenuTreeNode } from '../roles/types'

type Options = { pages: { value: string; label: string; workspace: string }[]; actions: { value: string; label: string }[] }
function NodeType({ value, onChange, changed }: { value?: string; onChange?: (value: string) => void; changed: (value: string) => void }) {
  return <Select value={value} onChange={next => { onChange?.(next); changed(next) }} options={[
    { value: 'DIR', label: '目录' }, { value: 'MENU', label: '菜单' }, { value: 'BUTTON', label: '按钮' },
  ]} />
}

export function MenusPage() {
  const query = useQuery<MenuNode[]>('/admin/v1/menus')
  const options = useQuery<Options>('/admin/v1/menus/options')
  const { reload } = useSession()
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<{ row?: MenuNode; parent?: string; remove?: boolean }>()
  const [kind, setKind] = useState('DIR')
  const nodes = query.data ?? []
  const row = editor?.row
  function edit(target?: MenuNode, parent?: string) { setKind(target?.kind ?? 'DIR'); setEditor({ row: target, parent }) }
  const blocked = new Set(row ? [row.id] : [])
  for (let depth = 0; depth < 8; depth++) for (const node of nodes) if (node.parent_id && blocked.has(node.parent_id)) blocked.add(node.id)
  const parents = nodes.filter(node => !blocked.has(node.id) && node.kind !== 'BUTTON')
  const latest = async () => (await apiClient.request<MenuNode[]>('/admin/v1/menus')).find(node => node.id === row?.id)?.revision
  return <PageContainer title="菜单管理" actions={<Space wrap>
    <Input.Search aria-label="搜索菜单" placeholder="菜单名称" allowClear onChange={e => setSearch(e.target.value)} />
    <Button onClick={query.reload}>刷新</Button>{options.data && <Button type="primary" onClick={() => edit()}>新增菜单</Button>}
  </Space>}>
    <ErrorNotice error={query.error ?? options.error} />
    <Table<MenuTreeNode> key={search} rowKey="id" loading={!query.data && !query.error} dataSource={menuTree(nodes, search)} pagination={false}
      expandable={{ defaultExpandAllRows: true }} scroll={{ x: 1050 }} columns={[
        { title: '名称', dataIndex: 'name' }, { title: '类型', dataIndex: 'kind_label', width: 80 },
        { title: '工作区', dataIndex: 'workspace_label' }, { title: '页面 / 操作', render: (_, node) => node.page_name ?? node.action_name ?? '—' },
        { title: '排序', dataIndex: 'sort_order', width: 70 }, { title: '显示', render: (_, node) => node.visible ? '显示' : '隐藏', width: 70 },
        { title: '状态', render: (_, node) => <Tag>{node.status_label}</Tag> },
        { title: '操作', width: 230, render: (_, node) => <Space wrap>
          <Button onClick={() => edit(node)}>编辑</Button>
          {node.kind !== 'BUTTON' && <Button onClick={() => { setKind(node.kind === 'MENU' ? 'BUTTON' : 'MENU'); setEditor({ parent: node.id }) }}>新增子项</Button>}
          {!node.protected && <Button danger onClick={() => setEditor({ row: node, remove: true })}>删除</Button>}
        </Space> },
      ]} />
    {editor && options.data && <EditorDialog title={editor.remove ? '删除菜单' : row ? '编辑菜单' : '新增菜单'} danger={editor.remove}
      initial={row ? { ...row } : { name: '', kind, parent_id: editor.parent, sort_order: 0, workspace: kind === 'BUTTON' ? 'channel' : 'both', visible: true, active: true }}
      latestRevision={row ? latest : undefined} onClose={() => setEditor(undefined)}
      onSaved={() => { setEditor(undefined); query.reload(); void reload() }}
      fields={editor.remove ? [] : [
        { name: 'name', label: '菜单名称', required: true },
        { name: 'kind', label: '节点类型', required: true, control: <NodeType changed={setKind} /> },
        { name: 'parent_id', label: '父级', control: <TreeSelect allowClear placeholder="根目录" treeDefaultExpandAll treeData={menuTree(parents).map(node => ({ ...node }))} fieldNames={{ value: 'id', label: 'name' }} /> },
        { name: 'workspace', label: '适用工作区', kind: 'select', required: true, options: [
          { value: 'both', label: '平台与渠道' }, { value: 'platform', label: '平台' }, { value: 'channel', label: '渠道' },
        ] },
        ...(kind === 'MENU' ? [{ name: 'page_key', label: '页面', kind: 'select' as const, required: true, options: options.data.pages }] : []),
        ...(kind === 'BUTTON' ? [{ name: 'action_key', label: '操作权限', kind: 'select' as const, required: true, options: options.data.actions }] : []),
        { name: 'sort_order', label: '排序', kind: 'number', min: 0, max: 10000, required: true },
        { name: 'visible', label: '显示', kind: 'switch' }, { name: 'active', label: '启用', kind: 'switch' },
      ]} onSave={values => {
        if (editor.remove && row) return send(`/admin/v1/menus/${row.id}?revision=${String(values.revision)}`, 'DELETE')
        return send(row ? `/admin/v1/menus/${row.id}` : '/admin/v1/menus', row ? 'PATCH' : 'POST', {
          name: values.name, kind: values.kind, parent_id: values.parent_id ?? null, workspace: values.workspace,
          page_key: values.kind === 'MENU' ? values.page_key : null, action_key: values.kind === 'BUTTON' ? values.action_key : null,
          sort_order: values.sort_order, visible: values.visible, active: values.active, revision: values.revision,
        })
      }}>
      {editor.remove && <div>删除前须解除子节点和角色关联；操作会记录审计。</div>}
    </EditorDialog>}
  </PageContainer>
}
