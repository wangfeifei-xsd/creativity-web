import { useDirectory } from '../../api/useDirectory'
import { names, send, statuses } from '../../api/management'
import { Button, Space, Tag } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { apiClient } from '../../api/client'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ActionButtons, EditorDialog, ErrorNotice, type EditorProps, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { DirectoryFilters, type DirectoryPage } from '../../components/Directory'
import { AccountEditor } from './AccountEditor'

type Account = Schema<'AccountView'>
export function AccountsPage() {
  const directory = useDirectory()
  const query = useQuery<DirectoryPage<Account>>(`/admin/v1/accounts/page?${directory.parameters}`)
  const roles = useQuery<Schema<'RoleView'>[]>('/admin/v1/accounts/roles')
  const { session } = useSession()
  const [editor, setEditor] = useState<Omit<EditorProps, 'onClose' | 'onSaved'>>()
  const [editing, setEditing] = useState<{ account?: Account }>()
  const latest = (row: Account) => async () => (await apiClient.request<Account>(`/admin/v1/accounts/${row.user_id}`)).revision
  function edit(row?: Account) {
    setEditing({ account: row })
  }
  function reset(row: Account) {
    setEditor({ title: `重置 ${row.display_name} 的密码`, fields: [{ name: 'initial_password', label: '新初始密码', kind: 'password', required: true }],
      initial: { revision: row.revision }, danger: true, latestRevision: latest(row),
      children: <div>该账号全部登录会话将失效，下次登录须修改初始密码。</div>,
      onSave: values => send(`/admin/v1/accounts/${row.user_id}/reset-password`, 'POST', values) })
  }
  return <PageContainer title="账号管理" actions={<Space wrap><DirectoryFilters directory={directory} label="搜索账号名称或登录名" statuses={statuses} /><Button onClick={query.reload}>刷新</Button>
    <ActionButtons disabled={!roles.data?.length} actions={session.actions.map(a => a.action_key === 'account:manage' ? { ...a, label: '创建账号' } : a)} handlers={{ 'account:manage': () => edit() }} /></Space>}>
    <ErrorNotice error={query.error ? undefined : roles.error} />
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Table rowKey="user_id" dataSource={query.data.items} pagination={directory.pagination(query.data.total)} scroll={{ x: 850 }}
      columns={[{ title: '名称', dataIndex: 'display_name' }, { title: '登录名', dataIndex: 'login_name' },
        { title: '角色', dataIndex: 'role_name' },
        { title: '授权渠道', render: (_, row) => names(row.channel_names ?? []) },
        { title: '状态', render: (_, row) => <Tag>{row.status_label}</Tag> },
        { title: '更新时间', render: (_, row) => formatTimestamp(row.updated_at) },
        { title: '凭据更新时间', render: (_, row) => formatTimestamp(row.credential_updated_at) },
        { title: '操作', render: (_, row) => <ActionButtons actions={session.actions.flatMap(a => a.action_key === 'account:manage' ? [
          { action_key: 'edit', label: '编辑' }, { action_key: 'reset', label: '重置密码' }] : [])} handlers={{ edit: () => edit(row), reset: () => reset(row) }} /> },
      ]} />}
    {editor && <EditorDialog {...editor} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); query.reload() }} />}
    {editing && roles.data && <AccountEditor account={editing.account} roles={roles.data}
      onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); query.reload() }} />}
  </PageContainer>
}
