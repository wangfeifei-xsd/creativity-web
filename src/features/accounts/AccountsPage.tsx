import { useDirectory } from '../../api/useDirectory'
import { names, send, statuses } from '../../api/management'
import { Button, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { apiClient } from '../../api/client'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ActionButtons, EditorDialog, type EditorProps, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { DirectoryFilters, type DirectoryPage } from '../../components/Directory'

type Account = Schema<'AccountView'>
export function AccountsPage() {
  const directory = useDirectory()
  const query = useQuery<DirectoryPage<Account>>(`/admin/v1/accounts/page?${directory.parameters}`)
  const roles = useQuery<Schema<'RoleView'>[]>('/admin/v1/roles')
  const { session } = useSession()
  const [editor, setEditor] = useState<Omit<EditorProps, 'onClose' | 'onSaved'>>()
  const latest = (row: Account) => async () => (await apiClient.request<Account>(`/admin/v1/accounts/${row.user_id}`)).revision
  function edit(row?: Account) {
    setEditor({ title: row ? '编辑账号' : '创建账号', initial: row ? { ...row } : { platform_roles: [] },
      fields: [
        ...(!row ? [{ name: 'login_name', label: '登录名', required: true },
          { name: 'initial_password', label: '初始密码', kind: 'password' as const, required: true }] : []),
        { name: 'display_name', label: '显示名称', required: true },
        ...(row ? [{ name: 'status', label: '状态', kind: 'select' as const, options: statuses, required: true }] : []),
        ...(roles.data?.length ? [{ name: 'platform_roles', label: '平台角色', kind: 'multiple' as const,
          options: roles.data.map(role => ({ value: role.role_code, label: role.name })) }] : []),
      ], latestRevision: row ? latest(row) : undefined,
      children: row ? <div>停用账号或修改平台角色后，原登录会话立即失效。</div> : undefined,
      onSave: values => send(row ? `/admin/v1/accounts/${row.user_id}` : '/admin/v1/accounts', row ? 'PATCH' : 'POST', values),
    })
  }
  function reset(row: Account) {
    setEditor({ title: `重置 ${row.display_name} 的密码`, fields: [{ name: 'initial_password', label: '新初始密码', kind: 'password', required: true }],
      initial: { revision: row.revision }, danger: true, latestRevision: latest(row),
      children: <div>该账号全部登录会话将失效，下次登录须修改初始密码。</div>,
      onSave: values => send(`/admin/v1/accounts/${row.user_id}/reset-password`, 'POST', values) })
  }
  return <PageContainer title="账号管理" actions={<Space wrap><DirectoryFilters directory={directory} label="搜索账号名称或登录名" statuses={statuses} /><Button onClick={query.reload}>刷新</Button>
    <ActionButtons actions={session.actions.map(a => a.action_key === 'account:manage' ? { ...a, label: '创建账号' } : a)} handlers={{ 'account:manage': () => edit() }} /></Space>}>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Table rowKey="user_id" dataSource={query.data.items} pagination={directory.pagination(query.data.total)} scroll={{ x: 850 }}
      columns={[{ title: '名称', dataIndex: 'display_name' }, { title: '登录名', dataIndex: 'login_name' },
        { title: '平台角色', render: (_, row) => names(row.platform_role_names) },
        { title: '状态', render: (_, row) => <Tag>{row.status_label}</Tag> },
        { title: '更新时间', render: (_, row) => formatTimestamp(row.updated_at) },
        { title: '凭据更新时间', render: (_, row) => formatTimestamp(row.credential_updated_at) },
        { title: '操作', render: (_, row) => <ActionButtons actions={session.actions.flatMap(a => a.action_key === 'account:manage' ? [
          { action_key: 'edit', label: '编辑' }, { action_key: 'reset', label: '重置密码' }] : [])} handlers={{ edit: () => edit(row), reset: () => reset(row) }} /> },
      ]} />}
    {editor && <EditorDialog {...editor} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); query.reload() }} />}
  </PageContainer>
}
