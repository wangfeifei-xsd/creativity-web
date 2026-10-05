import { Button, Descriptions, Drawer, Form, Input, Select, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { apiClient } from '../../api/client'
import { send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { EditorDialog, ErrorNotice } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { RoleTree } from './RoleTree'
import type { Role, RoleOptions } from './types'

function ScopeSelect({ id, value, onChange, choices, disabled, onScope }: {
  id?: string; value?: string; onChange?: (value: string) => void; choices: { value: string; label: string }[];
  disabled: boolean; onScope: (value: string) => void
}) {
  const form = Form.useFormInstance()
  return <Select id={id} value={value} options={choices} disabled={disabled} onChange={(scope: string) => {
    form.setFieldValue('menu_ids', [])
    onChange?.(scope); onScope(scope)
  }} />
}

export function RolesPage({ onSaved }: { onSaved?: () => void } = {}) {
  const query = useQuery<Role[]>('/admin/v1/custom-roles')
  const options = useQuery<RoleOptions>('/admin/v1/custom-roles/options')
  const { reload } = useSession()
  const [editor, setEditor] = useState<{ role?: Role; remove?: boolean; options: RoleOptions; loading?: boolean }>()
  const [detail, setDetail] = useState<{ role: Role; options: RoleOptions }>()
  const [optionError, setOptionError] = useState<unknown>()
  const [search, setSearch] = useState('')
  const row = editor?.role
  const nodes = editor?.options.menus ?? []
  const selected = (role: Role, menus = nodes) => menus.filter(node => node.kind === 'BUTTON'
    ? role.allowed_actions.includes(node.action_key ?? '') : role.menu_ids === null || role.menu_ids.includes(node.id)).map(node => node.id)
  const latest = async () => (await apiClient.request<Role[]>('/admin/v1/custom-roles')).find(role => role.id === row?.id)?.revision
  const loadOptions = (scope: string) => apiClient.request<RoleOptions>(`/admin/v1/custom-roles/options?grant_scope=${encodeURIComponent(scope)}`)
  const open = async (role: Role, mode: 'detail' | 'edit' | 'remove') => {
    try {
      setOptionError(undefined)
      const result = await loadOptions(role.grant_scope)
      if (mode === 'detail') setDetail({ role, options: result })
      else setEditor({ role, remove: mode === 'remove', options: result })
    } catch (error) { setOptionError(error) }
  }
  const changeScope = async (scope: string) => {
    const current = editor
    if (!current) return
    const pending = { ...current, loading: true }
    setEditor(pending); setOptionError(undefined)
    try {
      const result = await loadOptions(scope)
      setEditor(latest => latest === pending ? { ...pending, options: result, loading: false } : latest)
    } catch (error) {
      setOptionError(error)
      setEditor(latest => latest === pending ? { ...pending, loading: false } : latest)
    }
  }
  return <PageContainer title="角色管理" actions={<Space wrap>
    <Input.Search aria-label="搜索角色" placeholder="角色名称" allowClear onChange={e => setSearch(e.target.value)} />
    <Button onClick={() => { query.reload(); options.reload() }}>刷新</Button>
    {options.data && <Button type="primary" onClick={() => { setDetail(undefined); setOptionError(undefined); setEditor({ options: options.data! }) }}>新增角色</Button>}
  </Space>}>
    <ErrorNotice error={query.error ?? options.error ?? optionError} />
    <Table<Role> rowKey="id" loading={!query.data && !query.error} dataSource={query.data?.filter(role => role.name.includes(search))} scroll={{ x: 900 }} columns={[
      { title: '角色名称', render: (_, role) => <Button type="link" onClick={() => { void open(role, 'detail') }}>{role.name}</Button> },
      { title: '类型', render: (_, role) => <Tag>{role.builtin ? '内置' : '自定义'}</Tag> },
      { title: '作用域', dataIndex: 'grant_scope_name' },
      { title: '操作权限', render: (_, role) => role.action_names.join('、'), ellipsis: true },
      { title: '关联成员', dataIndex: 'member_count' }, { title: '状态', dataIndex: 'state_label' },
      { title: '更新时间', render: (_, role) => formatTimestamp(role.updated_at) },
      { title: '操作', render: (_, role) => role.editable && <Space><Button onClick={() => { void open(role, 'edit') }}>编辑</Button>
        <Button danger onClick={() => { void open(role, 'remove') }}>删除</Button></Space> },
    ]} />
    {editor && <EditorDialog title={editor.remove ? '删除角色' : row ? '编辑角色' : '新增角色'}
      initial={row ? { ...row, menu_ids: selected(row) } : { name: '', active: true, menu_ids: [], grant_scope: editor.options.scope }}
      danger={editor.remove} latestRevision={row ? latest : undefined} onClose={() => setEditor(undefined)}
      onSaved={() => { setEditor(undefined); query.reload(); options.reload(); onSaved?.(); void reload() }}
      fields={editor.remove ? [] : [
        { name: 'name', label: '角色名称', required: true },
        { name: 'grant_scope', label: '作用域', required: true, control: <ScopeSelect
          choices={editor.options.scopes} disabled={!!row || !!editor.loading || editor.options.scopes.length === 1} onScope={scope => { void changeScope(scope) }} /> },
        { name: 'menu_ids', label: '菜单与操作', required: true, control: <RoleTree key={editor.options.scope} nodes={nodes} disabled={editor.loading} /> },
        { name: 'active', label: '启用', kind: 'switch' },
      ]} onSave={values => {
        if (editor.remove && row) return send(`/admin/v1/custom-roles/${row.id}?revision=${String(values.revision)}`, 'DELETE')
        if (editor.loading || values.grant_scope !== editor.options.scope) return Promise.reject(new Error('角色选项尚未加载完成，请重试'))
        const keys = (values.menu_ids ?? []) as string[]
        const allowed_actions = [...new Set(nodes.filter(node => keys.includes(node.id) && node.kind === 'BUTTON').map(node => node.action_key))]
        return send(row ? `/admin/v1/custom-roles/${row.id}` : '/admin/v1/custom-roles', row ? 'PATCH' : 'POST', {
          name: values.name, active: values.active, revision: values.revision, grant_scope: values.grant_scope, menu_ids: keys, allowed_actions })
      }}>
      <ErrorNotice error={optionError} />
      {row && <div>当前关联 {row.member_count} 位有效成员，权限变更立即生效。{editor.remove && '删除前须解除账号、成员和资源授权关联。'}</div>}
    </EditorDialog>}
    {detail && <Drawer open title={detail.role.name} onClose={() => setDetail(undefined)} size="large">
      <Descriptions column={1} items={[{ key: 'scope', label: '作用域', children: detail.role.grant_scope_name },
        { key: 'actions', label: '允许动作', children: detail.role.action_names.join('、') },
        { key: 'members', label: '关联成员', children: `${detail.role.member_count} 位` },
        { key: 'state', label: '状态', children: detail.role.state_label }]} />
      <RoleTree nodes={detail.options.menus} value={selected(detail.role, detail.options.menus)} disabled />
    </Drawer>}
  </PageContainer>
}
