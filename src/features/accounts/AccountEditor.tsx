import { Pagination, Select, Space } from 'antd'
import { useState } from 'react'
import { apiClient } from '../../api/client'
import { send, statuses } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import type { DirectoryPage } from '../../components/Directory'
import { EditorDialog, ErrorNotice, type Schema } from '../../components/Management'

type Account = Schema<'AccountView'>
type Role = 'platform_admin' | 'channel_admin'

function ChannelPicker({ account, value, onChange }: {
  account?: Account; value?: string[]; onChange?: (ids: string[]) => void
}) {
  const [selected, setSelected] = useState<Record<string, string>>(() => Object.fromEntries(
    (account?.channel_ids ?? []).map((id, index) => [id, account?.channel_names?.[index] ?? '名称不可用']),
  ))
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const query = useQuery<DirectoryPage<Schema<'ChannelView'>>>(`/admin/v1/channels/page?${new URLSearchParams({
    search, offset: String((page - 1) * 20), limit: '20',
  })}`)
  return <Space orientation="vertical" style={{ width: '100%' }}>
    <Select aria-label="授权渠道" style={{ width: '100%' }} mode="multiple" maxCount={200}
      labelInValue value={(value ?? []).map(id => ({ value: id, label: selected[id] ?? '名称不可用' }))}
      onChange={items => {
        setSelected(previous => ({ ...previous, ...Object.fromEntries(items.map(item => [item.value, String(item.label)])) }))
        onChange?.(items.map(item => item.value))
      }} showSearch filterOption={false} loading={!query.data && !query.error}
      onSearch={text => { setSearch(text); setPage(1) }}
      options={query.data?.items.map(channel => ({
        value: channel.channel_id, label: channel.name, disabled: channel.status === 'ARCHIVED',
      }))}
      popupRender={menu => <>{menu}<Pagination size="small" current={page} total={query.data?.total}
        pageSize={20} showSizeChanger={false} onChange={setPage} /></>} />
    <ErrorNotice error={query.error} />
  </Space>
}

export function AccountEditor({ account, roles, onClose, onSaved }: {
  account?: Account; roles: Schema<'RoleView'>[]; onClose: () => void; onSaved: () => void
}) {
  const [role, setRole] = useState<Role>(account?.role ?? 'channel_admin')
  const roleOptions = roles.map(item => ({ value: item.role_code, label: item.name, disabled: false }))
  const canAssignChannels = roles.some(item => item.role_code === 'channel_admin')
  if (account && !roleOptions.some(item => item.value === account.role)) {
    roleOptions.push({ value: account.role, label: account.role_name, disabled: true })
  }
  return <EditorDialog title={account ? '编辑账号' : '创建账号'}
    initial={account ? { ...account } : { role: 'channel_admin', channel_ids: [] }}
    onClose={onClose} onSaved={onSaved}
    latestRevision={account ? async () => (await apiClient.request<Account>(`/admin/v1/accounts/${account.user_id}`)).revision : undefined}
    fields={[
      ...(!account ? [{ name: 'login_name', label: '登录名', required: true },
        { name: 'initial_password', label: '初始密码', kind: 'password' as const, required: true }] : []),
      { name: 'display_name', label: '显示名称', required: true },
      { name: 'role', label: '角色', required: true, control: <Select
        options={roleOptions} disabled={roles.length === 0}
        onChange={(value: Role) => setRole(value)} /> },
      ...(role === 'channel_admin' && canAssignChannels ? [{ name: 'channel_ids', label: '授权渠道',
        control: <ChannelPicker account={account} /> }] : []),
      ...(account ? [{ name: 'status', label: '状态', kind: 'select' as const, options: statuses, required: true }] : []),
    ]}
    onSave={values => {
      if (account && !roles.some(item => item.role_code === values.role) && values.role === account.role) {
        const metadata = { ...values }
        delete metadata.role; delete metadata.channel_ids
        return send(`/admin/v1/accounts/${account.user_id}`, 'PATCH', metadata)
      }
      return send(account ? `/admin/v1/accounts/${account.user_id}` : '/admin/v1/accounts',
        account ? 'PATCH' : 'POST', {
          ...values, channel_ids: values.role === 'channel_admin' ? values.channel_ids ?? [] : [],
        })
    }}
  />
}
