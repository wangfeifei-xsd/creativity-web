import { Button, Descriptions, Drawer, Form, Input, InputNumber, Select, Space, Tabs, Tag } from 'antd'
import { Table } from '../../components/Table'
import { useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { send, statuses } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ActionButtons, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { ModelDialog } from './shared'
import { jsonObject, parameterOptions } from './options'
import { ModelDetails } from './ModelDetails'
import { ConnectionTest, type ConnectionTestState } from './ConnectionTest'

type Model = Schema<'ModelView'>
type Connection = Schema<'ConnectionView'>
export function ModelsPage() {
  const modelId = useParams()['*']?.split('/')[0]
  const [searchParams, setSearchParams] = useSearchParams()
  if (modelId) return <PageContainer title="模型详情" actions={<Link to="/models">返回模型列表</Link>}>
    <ModelDetails key={modelId} modelId={modelId} />
  </PageContainer>
  return <Tabs destroyOnHidden activeKey={searchParams.get('tab') === 'connections' ? 'connections' : 'models'}
    onChange={tab => setSearchParams(previous => {
      const next = new URLSearchParams(previous)
      if (tab === 'connections') next.set('tab', tab)
      else next.delete('tab')
      return next
    })} items={[{ key: 'models', label: '模型', children: <Models /> },
    { key: 'connections', label: '供应商连接', children: <Connections /> }]} />
}
function Models() {
  const query = useQuery<Schema<'ModelList'>>('/admin/v1/models')
  const connections = useQuery<Schema<'ConnectionList'>>('/admin/v1/model-connections')
  const [editor, setEditor] = useState<{ model?: Model }>()
  const [selected, setSelected] = useState<Model>()
  const [detailTab, setDetailTab] = useState('connection')
  const [connectionTest, setConnectionTest] = useState<ConnectionTestState>()
  const testingConnection = useRef(false)
  async function testConnection(model: Model) {
    if (testingConnection.current) return
    testingConnection.current = true
    setConnectionTest({ modelName: model.name, busy: true })
    try {
      const result = await send<Schema<'ConnectionTestView'>>(`/admin/v1/models/${model.id}/connection-test`, 'POST')
      setConnectionTest({ modelName: model.name, busy: false, result })
    } catch (error) {
      setConnectionTest({ modelName: model.name, busy: false, error })
    } finally { testingConnection.current = false }
  }
  const row = editor?.model
  const choices = connections.data?.items.map(c => ({ value: c.id, label: `${c.provider_name ?? '供应商名称不可用'} · ${c.name}` })) ?? []
  return <PageContainer title="模型配置" actions={<Space><Button onClick={query.reload}>刷新</Button><ActionButtons actions={query.data?.actions ?? []} handlers={{ create: () => setEditor({}) }} /></Space>}>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> :
      <Table rowKey="id" dataSource={query.data.items} scroll={{ x: 850 }} columns={[
        { title: '模型', render: (_, r) => <Button type="link" onClick={() => { setDetailTab('connection'); setSelected(r) }}>{r.name}</Button> },
        { title: '供应商', render: (_, r) => r.provider_name ?? '名称不可用' }, { title: '连接', dataIndex: 'connection_name' },
        { title: '协议', dataIndex: 'protocol_name' }, { title: '状态', render: (_, r) => <Tag>{r.status_label}</Tag> },
        { title: '最近验证', render: (_, r) => formatTimestamp(r.verified_at) },
        { title: '操作', render: (_, r) => <ActionButtons actions={r.actions ?? []} disabled={connectionTest?.busy} handlers={{ edit: () => setEditor({ model: r }), test_connection: () => { void testConnection(r) }, test: () => { setDetailTab('tests'); setSelected(r) }, history: () => { setDetailTab('history'); setSelected(r) } }} /> },
      ]} />}
    {editor && <ModelDialog title={row ? '编辑模型' : '新增模型'} initial={row ? { ...row, parameters: JSON.stringify(row.parameters, null, 2) } : { status: 'ACTIVE', parameter_allowlist: ['max_tokens'], parameters: '{}' }} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); query.reload() }}
      onSave={v => send(row ? `/admin/v1/models/${row.id}` : '/admin/v1/models', row ? 'PATCH' : 'POST', { ...v, context_limit: v.context_limit ?? null, parameters: jsonObject(v.parameters), revision: row?.revision ?? null })}>
      <Form.Item name="name" label="模型名称" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="model_code" label="稳定别名" rules={[{ required: true }]}><Input disabled={!!row} /></Form.Item>
      <Form.Item name="connection_id" label="供应商连接" rules={[{ required: true }]}><Select options={choices} /></Form.Item>
      <Form.Item name="provider_model_name" label="供应商模型名" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="context_limit" label="上下文上限（Token）"><InputNumber min={1} placeholder="未知" style={{ width: '100%' }} /></Form.Item>
      <Form.Item name="parameter_allowlist" label="允许参数"><Select mode="multiple" options={parameterOptions} /></Form.Item>
      <Form.Item name="parameters" label="默认参数（JSON）"><Input.TextArea rows={4} /></Form.Item>
      <Form.Item name="status" label="状态"><Select options={statuses} /></Form.Item>
    </ModelDialog>}
    {selected && <Drawer open width={920} title={selected.name} onClose={() => { setSelected(undefined); query.reload() }} destroyOnHidden><ModelDetails modelId={selected.id} initialTab={detailTab} /></Drawer>}
    {connectionTest && <ConnectionTest state={connectionTest} onClose={() => setConnectionTest(undefined)} />}
  </PageContainer>
}
function Connections() {
  const query = useQuery<Schema<'ConnectionList'>>('/admin/v1/model-connections')
  const providers = useQuery<Schema<'ProviderView'>[]>('/admin/v1/model-providers')
  const protocols = useQuery<Schema<'ProtocolView'>[]>('/admin/v1/model-protocols')
  const [editor, setEditor] = useState<{ connection?: Connection }>()
  const [history, setHistory] = useState<Connection>()
  const row = editor?.connection
  return <PageContainer title="供应商连接" actions={<Space><Button onClick={query.reload}>刷新</Button><ActionButtons actions={query.data?.actions ?? []} handlers={{ create: () => setEditor({}) }} /></Space>}>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Table rowKey="id" dataSource={query.data.items} scroll={{ x: 900 }} columns={[
      { title: '连接', dataIndex: 'name' }, { title: '供应商', render: (_, r) => r.provider_name ?? '名称不可用' }, { title: '协议', dataIndex: 'protocol_name' },
      { title: '状态', render: (_, r) => <Tag>{r.status_label}</Tag> }, { title: '最近健康状态', render: (_, r) => <Space orientation="vertical"><Tag>{r.health_label}</Tag>{r.health_reason}</Space> },
      { title: '检查时间', render: (_, r) => formatTimestamp(r.health_checked_at) },
      { title: '操作', render: (_, r) => <Space><ActionButtons actions={r.actions ?? []} handlers={{ edit: () => setEditor({ connection: r }) }} /><Button onClick={() => setHistory(r)}>历史</Button></Space> },
    ]} />}
    {editor && <ModelDialog title={row ? '编辑连接' : '新增连接'} initial={row ? { name: row.name, provider_id: row.provider_id, protocol: row.protocol, endpoint: row.endpoint, allowed_networks: row.allowed_networks?.join('\n') ?? '', timeout_seconds: row.timeout_seconds, status: row.status } : { timeout_seconds: 60, status: 'ACTIVE' }}
      onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); query.reload() }} onSave={async values => {
        const { secret, allowed_networks, ...body } = values
        const credential = secret ? await send<Schema<'CredentialView'>>('/admin/v1/model-credentials', 'POST', { secret }) : null
        return send(row ? `/admin/v1/model-connections/${row.id}` : '/admin/v1/model-connections', row ? 'PATCH' : 'POST', { ...body, allowed_networks: String(allowed_networks ?? '').split(/\r?\n/).map(value => value.trim()).filter(Boolean), credential_ref: credential?.credential_ref ?? row?.credential_ref, revision: row?.revision ?? null })
      }}>{form => <>
        <Form.Item name="name" label="连接名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="provider_id" label="供应商" rules={[{ required: true }]}><Select options={providers.data?.map(p => ({ value: p.id, label: p.name }))} onChange={id => {
          const template = providers.data?.find(p => p.id === id)?.template_content
          if (template) form.setFieldsValue(template)
        }} /></Form.Item>
        <Form.Item name="protocol" label="协议" rules={[{ required: true }]}><Select options={protocols.data?.map(p => ({ value: p.code, label: `${p.name}${p.enabled ? '' : '（未启用）'}` }))} /></Form.Item>
        <Form.Item name="endpoint" label="基础地址" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="allowed_networks" label="允许的 IP 范围" extra="留空仅允许公网；内网模型或代理请填写 CIDR，每行一个。"><Input.TextArea rows={2} placeholder="例如：10.20.0.0/16" /></Form.Item>
        <Form.Item name="secret" label="API Key" extra={row ? '留空保留原密钥，填写后替换。' : undefined} rules={row ? [] : [{ required: true }]}><Input.Password autoComplete="new-password" /></Form.Item>
        <Form.Item name="timeout_seconds" label="超时（秒）"><InputNumber min={1} max={600} /></Form.Item>
        <Form.Item name="status" label="状态"><Select options={statuses} /></Form.Item>
      </>}</ModelDialog>}
    {history && <Drawer open title={`${history.name} · 历史`} onClose={() => setHistory(undefined)} width={760} destroyOnHidden>
      <Descriptions items={[{ key: 'address', label: '当前地址', children: history.endpoint }, { key: 'protocol', label: '协议', children: history.protocol_name }, { key: 'networks', label: '允许的 IP 范围', children: history.allowed_networks?.length ? history.allowed_networks.join('、') : '仅公网' }]} />
      <VersionHistory path={`/admin/v1/model-connections/${history.id}/versions`} />
    </Drawer>}
  </PageContainer>
}
export function VersionHistory({ path }: { path: `/admin/v1/${string}` }) {
  const query = useQuery<Schema<'ResourceVersion'>[]>(path)
  return query.error ? <ErrorState error={query.error} /> : !query.data ? <LoadingState /> : <Table rowKey="version_id" dataSource={query.data} columns={[
    { title: '版本', dataIndex: 'version_label' }, { title: '状态', render: (_, row) => row.state === 'RETIRED' ? '已停用' : row.state === 'DRAFT' ? '草稿' : '已冻结' },
    { title: '供应商模型名', render: (_, row) => typeof row.content.provider_model_name === 'string' ? row.content.provider_model_name : '不适用' },
    { title: '地址', render: (_, row) => typeof row.content.endpoint === 'string' ? row.content.endpoint : '见连接版本' },
  ]} />
}
