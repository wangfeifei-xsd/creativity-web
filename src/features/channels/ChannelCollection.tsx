import { names, send, statuses, environments, actionsAsOptions } from '../../api/management'
import { DownOutlined } from '@ant-design/icons'
import { AutoComplete, Button, Input, Space, Tag } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { apiClient } from '../../api/client'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ActionButtons, EditorDialog, SecretDialog, ErrorNotice, type EditorProps, type Field, type Schema, type Values } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'

type Item = Values & { revision: number; name: string; status_label: string }
const definitions: Record<string, { prefix: string; label: string; id: string }> = {
  environments: { prefix: 'environment', label: '环境', id: 'environment' },
  'data-scopes': { prefix: 'data_scope', label: '数据域', id: 'data_scope_id' },
  clients: { prefix: 'client', label: '接入服务', id: 'client_id' },
  keys: { prefix: 'key', label: 'Key', id: 'key_id' },
}
export function ChannelCollection({ page, kind, onConfigured }: { page: Schema<'ChannelPage'>; kind: string; onConfigured?: () => void }) {
  const { session } = useSession()
  const channelId = page.channel.channel_id
  const path = `/admin/v1/channels/${channelId}/${kind}` as const
  const query = useQuery<Item[]>(path)
  const envs = useQuery<Schema<'EnvironmentView'>[]>(kind !== 'environments' ? `/admin/v1/channels/${channelId}/environments` : null)
  const domains = useQuery<Schema<'DataScopeView'>[]>(kind === 'clients' ? `/admin/v1/channels/${channelId}/data-scopes` : null)
  const clients = useQuery<Schema<'ClientView'>[]>(kind === 'keys' ? `/admin/v1/channels/${channelId}/clients` : null)
  const createOptions = useQuery<Schema<'ChannelCreateOptions'>>(kind === 'data-scopes' && !session.workspace ? '/admin/v1/channel-create-options' : null)
  const [editor, setEditor] = useState<Omit<EditorProps, 'onClose' | 'onSaved'>>()
  const [secret, setSecret] = useState<string>()
  const definition = definitions[kind]
  if (!definition) return null
  const catalogError = envs.error || domains.error || clients.error || createOptions.error
  const catalogPending = (kind !== 'environments' && !envs.data) || (kind === 'clients' && !domains.data) ||
    (kind === 'keys' && !clients.data) || (kind === 'data-scopes' && !session.workspace && !createOptions.data)
  const latest = (row: Item) => async () => (await apiClient.request<Item[]>(path)).find(item => item[definition.id] === row[definition.id])?.revision
  const envOptions = envs.data?.map(env => ({ value: env.environment, label: env.name })) ?? []
  function edit(row?: Item) {
    const prefix = definition.prefix
    const fields: Field[] = [{ name: 'name', label: '名称', required: true }]
    const initial: Values = row ? { ...row } : {}
    if (!row) fields.push({ name: 'environment', label: '环境', kind: 'select', required: true, options: kind === 'environments' ? environments : envOptions })
    if (row && kind !== 'keys') fields.push({ name: 'status', label: '状态', kind: 'select', required: true, options: statuses })
    if (kind === 'environments') {
      fields.push({ name: 'retention_days', label: '数据保存天数（天）', kind: 'number', required: true },
        { name: 'approval_required', label: '发布需要审批', kind: 'switch' })
      initial.retention_days = row ? (row.retention_policy as Schema<'RetentionPolicy'>).retention_days : 90
      initial.approval_required = row ? (row.release_policy as Schema<'ReleasePolicy'>).approval_required : true
    }
    if (kind === 'data-scopes' && !row) {
      const types = [...new Map([
        ...(page.data_scope_types ?? []),
        ...(query.data ?? []).flatMap(scope => typeof scope.external_scope_type === 'string' && scope.external_scope_type.length > 0
          ? [{ value: scope.external_scope_type, label: typeof scope.external_scope_type_name === 'string'
            ? `${scope.external_scope_type_name}（${scope.external_scope_type}）` : scope.external_scope_type }] : []),
      ].map(option => [option.value, option])).values()]
      fields.push({ name: 'external_scope_type', label: '外部数据域类型', required: true,
        help: '选择源系统使用的范围类型；不在列表中时可直接输入原值。',
        control: <AutoComplete options={types} placeholder="选择工作区、组织等类型，或输入自定义类型"
          suffixIcon={<DownOutlined />} maxLength={64}
          filterOption={(value, option) => [option?.value, option?.label].some(text => String(text ?? '').toLowerCase().includes(value.toLowerCase()))} /> },
        { name: 'external_scope_id', label: '外部数据域编号', required: true,
          help: '填写对应组织、工作区等在源系统中的真实编号，须与接入系统传入的编号一致。',
          control: <Input placeholder="例如：源系统中的工作区编号" maxLength={128} /> })
      if (createOptions.data) {
        const pending = page.pending_administrator
        initial.administrator_id = pending?.value
        fields.push({ name: 'administrator_id', label: '该工作区管理员', kind: 'select',
          required: !!pending, disabled: !!pending, options: pending ? [pending] : createOptions.data.accounts })
      }
    }
    if ((kind === 'clients' || kind === 'keys') && page.service_actions.length) fields.push({ name: 'scopes', label: '可调用能力', kind: 'multiple', required: true, options: actionsAsOptions(page.service_actions) })
    if (kind === 'clients') fields.push({ name: 'data_scopes', label: '业务数据域', kind: 'multiple', required: true,
      options: domains.data?.map(scope => ({ value: scope.data_scope_id, label: `${scope.environment_name ?? '环境名称不可用'} · ${scope.name}` })) })
    if (kind === 'keys') fields.push({ name: 'client_id', label: '接入服务', kind: 'select', required: true,
      options: clients.data?.map(client => ({ value: client.client_id, label: `${client.name} · ${client.environment_name ?? '环境名称不可用'}` })) },
      { name: 'expires_at', label: '有效期至', kind: 'datetime', required: true })
    setEditor({ title: row ? `编辑${definition.label}` : `创建${definition.label}`, fields, initial,
      latestRevision: row ? latest(row) : undefined,
      children: row ? <div>停用或缩减范围将立即限制相关凭据与后续调用。</div> : undefined,
      onSave: async values => {
        const body = { ...values }
        if (kind === 'environments') {
          body.retention_policy = { ...(row?.retention_policy as Schema<'RetentionPolicy'> | undefined), retention_days: body.retention_days }; delete body.retention_days
          body.release_policy = { approval_required: body.approval_required ?? false }; delete body.approval_required
        }
        if (kind === 'keys') body.expires_at = new Date(String(body.expires_at)).toISOString()
        const response = await send<Schema<'KeyCreated'> | Item>(row ? `${path}/${String(row[definition.id])}` : path, row ? 'PATCH' : 'POST', body)
        if (prefix === 'key' && 'api_key' in response) setSecret(String(response.api_key))
      },
    })
  }
  function rotate(row: Item) {
    setEditor({ title: '轮换 Key', initial: { revision: row.revision, overlap_seconds: 3600 }, latestRevision: latest(row),
      fields: [{ name: 'expires_at', label: '新 Key 有效期至', kind: 'datetime', required: true },
        { name: 'overlap_seconds', label: '新旧 Key 重叠时长（秒）', kind: 'number', required: true }],
      onSave: async values => { const response = await send<Schema<'KeyCreated'>>(`${path}/${String(row.key_id)}/rotate`, 'POST',
        { ...values, expires_at: new Date(String(values.expires_at)).toISOString() }); setSecret(response.api_key) },
    })
  }
  function revoke(row: Item) {
    setEditor({ title: `吊销 ${row.name}`, initial: { revision: row.revision }, fields: [], danger: true, latestRevision: latest(row),
      children: <div>该 Key 及其派生 Token 将立即失效。</div>,
      onSave: values => send(`${path}/${String(row.key_id)}/revoke`, 'POST', values) })
  }
  const textValue = (value: unknown) => typeof value === 'string' ? value : '名称不可用'
  return <Space orientation="vertical" style={{ width: '100%' }} size="middle">
    <Space><Button onClick={() => { query.reload(); envs.reload(); domains.reload(); clients.reload(); createOptions.reload() }}>刷新</Button>
      <ActionButtons disabled={catalogPending} actions={page.actions} handlers={{ [`${definition.prefix}:create`]: () => edit() }} /></Space>
    <ErrorNotice error={catalogError} />
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Table<Item>
      rowKey={row => String(row[definition.id])} dataSource={query.data} scroll={{ x: kind === 'keys' ? 1100 : 800 }} columns={[
        { title: '名称', dataIndex: 'name' },
        ...(kind !== 'environments' ? [{ title: '环境', render: (_: unknown, row: Item) => textValue(row.environment_name) }] : []),
        { title: '状态', render: (_, row) => <Tag>{row.status_label}</Tag> },
        ...(kind === 'clients' || kind === 'keys' ? [{ title: '可调用能力', render: (_: unknown, row: Item) => names(row.scope_names as string[]) }] : []),
        ...(kind === 'clients' ? [{ title: '数据域', render: (_: unknown, row: Item) => names(row.data_scope_names as (string | null)[]) }] : []),
        ...(kind === 'keys' ? [
          { title: '接入服务', render: (_: unknown, row: Item) => textValue(row.client_name) },
          { title: 'Key', render: (_: unknown, row: Item) => textValue(row.masked_key) },
          { title: '有效期', render: (_: unknown, row: Item) => formatTimestamp(row.expires_at as string) },
          { title: '最近使用', render: (_: unknown, row: Item) => formatTimestamp(row.last_used_at as string | null) },
        ] : []),
        ...(kind === 'data-scopes' ? [
          { title: '外部数据域类型', render: (_: unknown, row: Item) => textValue(row.external_scope_type) },
          { title: '外部数据域编号', render: (_: unknown, row: Item) => textValue(row.external_scope_id) },
        ] : []),
        { title: '操作', render: (_, row) => <ActionButtons disabled={kind !== 'keys' && catalogPending} actions={page.actions} handlers={kind === 'keys' ? { 'key:rotate': () => rotate(row), 'key:revoke': () => revoke(row) } :
          { [`${definition.prefix}:edit`]: () => edit(row) }} /> },
      ]} />}
    {editor && <EditorDialog {...editor} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); query.reload(); onConfigured?.() }} />}
    {secret && <SecretDialog secret={secret} onClose={() => setSecret(undefined)} />}
  </Space>
}
