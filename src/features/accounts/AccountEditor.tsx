import { Pagination, Select, Space } from 'antd'
import { useState } from 'react'
import { apiClient } from '../../api/client'
import { send, statuses } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import type { DirectoryPage } from '../../components/Directory'
import { EditorDialog, ErrorNotice, type Schema } from '../../components/Management'

type Account = Schema<'AccountView'>

function ChannelPicker({ labels, onLabelsChange, value, onChange }: {
  labels: Record<string, string>; onLabelsChange: (labels: Record<string, string>) => void;
  value?: string[]; onChange?: (ids: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const query = useQuery<DirectoryPage<Schema<'ChannelView'>>>(`/admin/v1/channels/page?${new URLSearchParams({
    search, offset: String((page - 1) * 20), limit: '20',
  })}`)
  const names = { ...labels, ...Object.fromEntries((query.data?.items ?? []).map(channel => [channel.channel_id, channel.name])) }
  return <Space orientation="vertical" style={{ width: '100%' }}>
    <Select aria-label="授权渠道" style={{ width: '100%' }} mode="multiple" maxCount={200}
      labelInValue value={(value ?? []).map(id => ({ value: id, label: names[id] ?? '名称不可用' }))}
      onChange={items => {
        onLabelsChange(Object.fromEntries(items.map(item => [item.value, String(item.label)])))
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
  const defaultRole = roles.find(item => item.grant_scope === 'channel')?.role_code ?? roles[0]?.role_code
  const initialRoles = account
    ? account.roles ?? (account.role ? [account.role] : account.platform_roles)
    : defaultRole ? [defaultRole] : []
  const [selectedRoles, setSelectedRoles] = useState(initialRoles)
  const [channelLabels, setChannelLabels] = useState<Record<string, string>>(() => Object.fromEntries(
    (account?.channel_ids ?? []).map((id, index) => [id, account?.channel_names?.[index] ?? '名称不可用']),
  ))
  const roleOptions = roles.map(item => ({ value: item.role_code, label: item.name, disabled: false }))
  const hasChannelRole = roles.some(item => selectedRoles.includes(item.role_code) && item.grant_scope === 'channel')
  for (const [index, code] of initialRoles.entries()) {
    if (!roleOptions.some(item => item.value === code)) {
      roleOptions.push({ value: code, label: account?.role_names?.[index] ?? account?.role_name ?? '角色不可用', disabled: true })
    }
  }
  return <EditorDialog title={account ? '编辑账号' : '创建账号'}
    initial={{ ...account, roles: initialRoles, channel_ids: account?.channel_ids ?? [] }}
    onClose={onClose} onSaved={onSaved}
    latestRevision={account ? async () => (await apiClient.request<Account>(`/admin/v1/accounts/${account.user_id}`)).revision : undefined}
    fields={[
      ...(!account ? [{ name: 'login_name', label: '登录名', required: true },
        { name: 'initial_password', label: '初始密码', kind: 'password' as const, required: true }] : []),
      { name: 'display_name', label: '显示名称', required: true },
      { name: 'roles', label: '角色', required: !account || initialRoles.length > 0, control: <Select
        mode="multiple" maxCount={50} showSearch optionFilterProp="label"
        options={roleOptions} disabled={roles.length === 0}
        onChange={(value: string[]) => setSelectedRoles(value)} /> },
      ...(hasChannelRole ? [{ name: 'channel_ids', label: '授权渠道',
        control: <ChannelPicker labels={channelLabels} onLabelsChange={labels => setChannelLabels(previous => ({ ...previous, ...labels }))} /> }] : []),
      ...(account ? [{ name: 'status', label: '状态', kind: 'select' as const, options: statuses, required: true }] : []),
    ]}
    onSave={values => {
      const selected = (values.roles ?? []) as string[]
      if (account && selected.some(code => !roles.some(item => item.role_code === code))
        && selected.length === initialRoles.length && selected.every(code => initialRoles.includes(code))) {
        const metadata = { ...values }
        delete metadata.roles; delete metadata.channel_ids
        return send(`/admin/v1/accounts/${account.user_id}`, 'PATCH', metadata)
      }
      return send(account ? `/admin/v1/accounts/${account.user_id}` : '/admin/v1/accounts',
        account ? 'PATCH' : 'POST', {
          ...values, channel_ids: roles.some(item => selected.includes(item.role_code) && item.grant_scope === 'channel')
            ? values.channel_ids ?? [] : [],
        })
    }}
  />
}
