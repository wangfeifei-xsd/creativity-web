import { names, send, statuses, actionsAsOptions } from '../../api/management'
import { Button, Select, Space, Table, Tabs, Tag } from 'antd'
import { ResourcePicker, type ResourceEntry } from './ResourcePicker'
import { CustomRoles } from './CustomRoles'
import { useState } from 'react'
import { apiClient } from '../../api/client'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ActionButtons, EditorDialog, type EditorProps, type Schema, type Field } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'

type Member = Schema<'MembershipView'>
type Grant = Schema<'GrantView'>
export function MembersPage({ channelId, initialTab = 'members' }: { channelId?: string; initialTab?: string }) {
  const { session } = useSession()
  const target = channelId ?? session.workspace?.channel_id
  if (!target) return <PageContainer title="成员与权限"><EmptyState message="请先选择渠道工作区" /></PageContainer>
  return <AccessPage key={target} channelId={target} initialTab={initialTab} />
}
export function GrantsPage() { return <MembersPage initialTab="grants" /> }
function AccessPage({ channelId, initialTab }: { channelId: string; initialTab: string }) {
  const options = useQuery<Schema<'AccessOptions'>>(`/admin/v1/channels/${channelId}/access-options`)
  const [tab, setTab] = useState(initialTab)
  const { session } = useSession()
  if (options.error) return <ErrorState error={options.error} onRetry={options.reload} />
  if (!options.data) return <LoadingState />
  const data = options.data
  const items = data.tabs.map(item => ({ key: item.navigation_key, label: item.label,
    children: item.navigation_key === 'members' ? <MemberTable channelId={channelId} options={data} onSaved={options.reload} /> :
      <GrantTable channelId={channelId} options={data} onSaved={options.reload} /> }))
  if (session.actions.some(a => a.action_key === 'membership:manage')) items.push({ key: 'roles', label: '角色', children: <CustomRoles onSaved={options.reload} /> })
  return <Tabs activeKey={items.some(item => item.key === tab) ? tab : items[0]?.key} onChange={setTab} destroyOnHidden items={items} />
}
function scopeFields(options: Schema<'AccessOptions'>): Field[] {
  return [
    { name: 'environments', label: '可用环境', kind: 'multiple', required: true,
      options: [...new Map(options.workspaces.map(o => [o.environment, { value: o.environment, label: o.environment_name }])).values()] },
    { name: 'data_scopes', label: '业务数据域', kind: 'multiple', required: true,
      options: options.workspaces.map(o => ({ value: o.data_scope_id, label: `${o.environment_name} · ${o.data_scope_name}` })) },
  ]
}
type AccessProps = { channelId: string; options: Schema<'AccessOptions'>; onSaved: () => void }
function MemberTable({ channelId, options, onSaved }: AccessProps) {
  const path = `/admin/v1/channels/${channelId}/members` as const
  const query = useQuery<Member[]>(path)
  const [editor, setEditor] = useState<Omit<EditorProps, 'onClose' | 'onSaved'>>()
  const latest = (row: Member) => async () => (await apiClient.request<Member[]>(path)).find(m => m.user_id === row.user_id)?.revision
  function edit(row?: Member) {
    setEditor({ title: row ? '编辑成员' : '添加成员', initial: row ? { ...row } : { status: 'ACTIVE', revision: null },
      fields: [...(!row ? [{ name: 'user_id', label: '账号', kind: 'select' as const, options: options.accounts, required: true }] : []),
        { name: 'roles', label: '角色', kind: 'multiple', required: true, options: options.roles.map(r => ({ value: r.role_code, label: r.name })) },
        ...scopeFields(options), { name: 'status', label: '状态', kind: 'select', required: true, options: statuses }],
      latestRevision: row ? latest(row) : undefined,
      onSave: values => { const { user_id, ...body } = values; return send(`${path}/${row?.user_id ?? String(user_id)}`, 'PUT', body) },
    })
  }
  function remove(row: Member) {
    setEditor({ title: `移除 ${row.display_name ?? '该成员'}`, fields: [], initial: { revision: row.revision }, danger: true,
      children: <div>该成员在本渠道的登录会话将失效，历史用量和审计保留。</div>, latestRevision: latest(row),
      onSave: values => send(`${path}/${row.user_id}?revision=${String(values.revision)}`, 'DELETE') })
  }
  return <PageContainer title="成员与权限" actions={<Space><Button onClick={query.reload}>刷新</Button>
    <ActionButtons actions={options.actions} handlers={{ 'member:create': () => edit() }} /></Space>}>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Table rowKey="user_id" dataSource={query.data} scroll={{ x: 800 }}
      columns={[{ title: '成员', render: (_, row) => row.display_name ?? '名称不可用' },
        { title: '角色', render: (_, row) => names(row.role_names) }, { title: '环境', render: (_, row) => names(row.environment_names) },
        { title: '数据域', render: (_, row) => names(row.data_scope_names) }, { title: '状态', render: (_, row) => <Tag>{row.status_label}</Tag> },
        { title: '操作', render: (_, row) => <ActionButtons actions={options.actions} handlers={{ 'member:edit': () => edit(row), 'member:remove': () => remove(row) }} /> }]} />}
    {editor && <EditorDialog {...editor} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); query.reload(); onSaved() }} />}
  </PageContainer>
}
function GrantTable({ channelId, options, onSaved }: AccessProps) {
  const path = `/admin/v1/channels/${channelId}/resource-grants` as const
  const query = useQuery<Grant[]>(path)
  const [editor, setEditor] = useState<{ row?: Grant; revoke?: boolean }>()
  const [granteeType, setGranteeType] = useState('account')
  const [selectedResource, setSelectedResource] = useState<ResourceEntry>()
  const latest = (row: Grant) => async () => (await apiClient.request<Grant[]>(path)).find(g => g.grant_id === row.grant_id)?.revision
  const row = editor?.row
  return <PageContainer title="资源授权" actions={<Space><Button onClick={query.reload}>刷新</Button>
    <ActionButtons actions={options.actions} handlers={{ 'grant:create': () => { setGranteeType('account'); setSelectedResource(undefined); setEditor({}) } }} /></Space>}>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Table rowKey="grant_id" dataSource={query.data} scroll={{ x: 900 }}
      columns={[{ title: '授权对象', render: (_, r) => r.grantee_name ?? '名称不可用' }, { title: '资源', render: (_, r) => r.resource_name ?? '名称不可用' },
        { title: '动作', render: (_, r) => names(r.action_names) }, { title: '环境', render: (_, r) => names(r.environment_names) },
        { title: '数据域', render: (_, r) => names(r.data_scope_names) }, { title: '操作', render: (_, r) => <ActionButtons actions={options.actions}
          handlers={{ 'grant:edit': () => { setGranteeType(r.grantee_type); setSelectedResource(undefined); setEditor({ row: r }) }, 'grant:revoke': () => setEditor({ row: r, revoke: true }) }} /> }]} />}
    {editor && <EditorDialog key={`${row?.grant_id ?? 'new'}-${granteeType}-${editor.revoke}`} title={editor.revoke ? '撤销资源授权' : row ? '编辑资源授权' : '添加资源授权'}
      initial={row ? { ...row, resource: `${row.resource_type}|${row.resource_id}` } : { revision: null }} danger={editor.revoke}
      latestRevision={row ? latest(row) : undefined} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); query.reload(); onSaved() }}
      fields={editor.revoke ? [] : [
        ...(!row ? [{ name: 'grantee_id', label: '授权对象', kind: 'select' as const, required: true, options: granteeType === 'role' ? options.grantee_roles :
          options.member_accounts },
          { name: 'resource', label: '资源', required: true, control: <ResourcePicker channelId={channelId} base={options.resources} onChosen={setSelectedResource} /> }] : []),
        { name: 'allowed_actions', label: '可操作动作', kind: 'multiple', required: true, options: actionsAsOptions(selectedResource?.actions ?? options.grant_actions) }, ...scopeFields(options),
      ]} onSave={values => {
        if (editor.revoke && row) return send(`${path}/${row.grant_id}?revision=${String(values.revision)}`, 'DELETE')
        const { resource, ...body } = values
        const [resource_type, resource_id] = String(resource ?? `${row?.resource_type}|${row?.resource_id}`).split('|')
        return send(`${path}/${row?.grant_id ?? `grant_${crypto.randomUUID()}`}`, 'PUT', { ...body,
          grantee_type: row?.grantee_type ?? granteeType, grantee_id: row?.grantee_id ?? body.grantee_id, resource_type, resource_id })
      }}>
      {editor.revoke ? <div>授权撤销后立即生效，历史记录保留。</div> : row ? <div>{row.grantee_name ?? '名称不可用'} · {row.resource_name ?? '名称不可用'}</div> :
        <Select aria-label="授权对象类型" value={granteeType} onChange={setGranteeType} options={[{ value: 'account', label: '渠道成员' }, { value: 'role', label: '渠道角色' }]} />}
    </EditorDialog>}
  </PageContainer>
}
