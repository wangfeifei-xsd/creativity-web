import { StatusTag } from '../../components/StatusTag'
import { names, send, statuses, environments, actionsAsOptions } from '../../api/management'
import { Button, Space, Typography } from 'antd'
import { Table } from '../../components/Table'
import { useRef, useState } from 'react'
import { apiClient } from '../../api/client'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ActionButtons, EditorDialog, SecretDialog, ErrorNotice, type EditorProps, type Field, type Schema, type Values } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'

type Item = Values & { revision: number; name: string; status_label: string }
const definitions: Record<string, { prefix: string; label: string; id: string }> = {
  environments: { prefix: 'environment', label: '环境', id: 'environment' },
  clients: { prefix: 'client', label: '接入服务', id: 'client_id' },
  keys: { prefix: 'key', label: '渠道凭据', id: 'key_id' },
}
export function ChannelCollection({ page, kind, onConfigured }: { page: Schema<'ChannelPage'>; kind: string; onConfigured?: () => void }) {
  const { session } = useSession()
  const channelId = page.channel.channel_id
  const path = `/admin/v1/channels/${channelId}/${kind}` as const
  const query = useQuery<Item[]>(path)
  const envs = useQuery<Schema<'EnvironmentView'>[]>(kind !== 'environments' ? `/admin/v1/channels/${channelId}/environments` : null)
  const [editor, setEditor] = useState<Omit<EditorProps, 'onClose' | 'onSaved'>>()
  const [secret, setSecret] = useState<{ keyId: string; value: string }>()
  const secretPending = useRef(false)
  const definition = definitions[kind]
  if (!definition) return null
  const catalogError = envs.error
  const catalogPending = kind !== 'environments' && !envs.data
  const latest = (row: Item) => async () => (await apiClient.request<Item[]>(path)).find(item => item[definition.id] === row[definition.id])?.revision
  const envOptions = envs.data?.filter(env => !session.workspace || env.environment === session.workspace.environment)
    .map(env => ({ value: env.environment, label: env.name })) ?? []
  function edit(row?: Item) {
    const prefix = definition.prefix
    const fields: Field[] = [{ name: 'name', label: '名称', required: true }]
    const initial: Values = row ? { ...row } : { environment: session.workspace?.environment }
    if (!row) fields.push({ name: 'environment', label: '环境', kind: 'select', required: true, options: kind === 'environments' ? environments : envOptions })
    if (row && kind !== 'keys') fields.push({ name: 'status', label: '状态', kind: 'select', required: true, options: statuses })
    if (kind === 'environments') {
      fields.push({ name: 'retention_days', label: '数据保存天数（天）', kind: 'number', required: true },
        { name: 'approval_required', label: '发布需要审批', kind: 'switch' })
      initial.retention_days = row ? (row.retention_policy as Schema<'RetentionPolicy'>).retention_days : 90
      initial.approval_required = row ? (row.release_policy as Schema<'ReleasePolicy'>).approval_required : true
    }
    if (kind === 'clients' && page.service_actions.length) fields.push({ name: 'scopes', label: '可调用能力', kind: 'multiple', required: true, options: actionsAsOptions(page.service_actions) })
    if (kind === 'keys') fields.push({ name: 'expires_at', label: '有效期至', kind: 'datetime', required: true })
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
        if (prefix === 'key' && 'api_key' in response) {
          secretPending.current = true
          const issued = response as Schema<'KeyCreated'>
          setSecret({ keyId: issued.key.key_id, value: issued.api_key })
        }
      },
    })
  }
  function rotate(row: Item) {
    setEditor({ title: '轮换 Key', initial: { revision: row.revision, overlap_seconds: 3600 }, latestRevision: latest(row),
      fields: [{ name: 'expires_at', label: '新 Key 有效期至', kind: 'datetime', required: true },
        { name: 'overlap_seconds', label: '新旧 Key 重叠时长（秒）', kind: 'number', required: true }],
      onSave: async values => { const response = await send<Schema<'KeyCreated'>>(`${path}/${String(row.key_id)}/rotate`, 'POST',
        { ...values, expires_at: new Date(String(values.expires_at)).toISOString() }); secretPending.current = true; setSecret({ keyId: response.key.key_id, value: response.api_key }) },
    })
  }
  function revoke(row: Item) {
    setEditor({ title: `吊销 ${row.name}`, initial: { revision: row.revision }, fields: [], danger: true, latestRevision: latest(row),
      children: <div>该 Key 及其派生 Token 将立即失效。</div>,
      onSave: values => send(`${path}/${String(row.key_id)}/revoke`, 'POST', values) })
  }
  function remove(row: Item) {
    setEditor({ title: `删除 ${row.name}`, initial: { revision: row.revision }, fields: [], danger: true, latestRevision: latest(row),
      children: <div>删除后将从凭据列表移除，历史用量和审计记录保留。</div>,
      onSave: values => send(`${path}/${String(row.key_id)}`, 'DELETE', values) })
  }
  const textValue = (value: unknown) => typeof value === 'string' ? value : '名称不可用'
  return <Space orientation="vertical" style={{ width: '100%' }} size="middle">
    <Space><Button onClick={() => { query.reload(); envs.reload() }}>刷新</Button>
      <ActionButtons disabled={catalogPending} actions={page.actions} handlers={{ [`${definition.prefix}:create`]: () => edit() }} /></Space>
    <ErrorNotice error={catalogError} />
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Table<Item>
      rowKey={row => String(row[definition.id])} dataSource={query.data} scroll={{ x: kind === 'keys' ? 1100 : 800 }} columns={[
        { title: '名称', dataIndex: 'name' },
        ...(kind !== 'environments' ? [{ title: '环境', render: (_: unknown, row: Item) => textValue(row.environment_name) }] : []),
        { title: '状态', render: (_, row) => <StatusTag label={row.status_label} /> },
        ...(kind === 'clients' ? [{ title: '可调用能力', render: (_: unknown, row: Item) => names(row.scope_names as string[]) }] : []),
        ...(kind === 'keys' ? [
          { title: '渠道 Key', render: (_: unknown, row: Item) => <Typography.Text copyable>{String(row.key_id)}</Typography.Text> },
          { title: '密钥', render: (_: unknown, row: Item) => textValue(row.masked_key) },
          { title: '有效期', render: (_: unknown, row: Item) => formatTimestamp(row.expires_at as string) },
          { title: '最近使用', render: (_: unknown, row: Item) => formatTimestamp(row.last_used_at as string | null) },
        ] : []),
        { title: '操作', render: (_, row) => <Space>
          <ActionButtons disabled={kind !== 'keys' && catalogPending} actions={page.actions} handlers={kind === 'keys' ? {
            'key:rotate': row.status === 'ACTIVE' ? () => rotate(row) : undefined,
            'key:revoke': row.status !== 'REVOKED' ? () => revoke(row) : undefined,
            'key:delete': row.status === 'REVOKED' ? () => remove(row) : undefined,
          } :
            { [`${definition.prefix}:edit`]: () => edit(row) }} />
        </Space> },
      ]} />}
    {editor && <EditorDialog {...editor} onClose={() => setEditor(undefined)} onSaved={() => {
      setEditor(undefined); query.reload()
      // 等用户保存一次性凭据后再刷新父页面，避免刷新卸载当前弹窗。
      if (!secretPending.current) onConfigured?.()
    }} />}
    {secret && <SecretDialog keyId={secret.keyId} secret={secret.value} onClose={() => {
      secretPending.current = false; setSecret(undefined); onConfigured?.()
    }} />}
  </Space>
}
