import { DateTimeInput } from '../../components/DateTimeInput'
import { RunViewer } from '../../components/run-viewer/RunViewer'
import { Alert, Button, Descriptions, Form, Input, InputNumber, Select, Space, Tabs, Tag } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ActionButtons, type Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'
import { VersionHistory } from './ModelsPage'
import { ModelDialog } from './shared'
import { dimensionNames } from './options'

export function ModelDetails({ modelId, initialTab = 'connection' }: { modelId: string; initialTab?: string }) {
  const [tab, setTab] = useState(initialTab)
  const query = useQuery<Schema<'ModelView'>>(`/admin/v1/models/${modelId}`)
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!query.data) return <LoadingState />
  const model = query.data
  return <Tabs activeKey={tab} onChange={setTab} destroyOnHidden items={[
    { key: 'connection', label: '连接', children: <Descriptions column={1} items={[
      { key: 'provider', label: '供应商', children: model.provider_name ?? '名称不可用' },
      { key: 'connection', label: '连接', children: model.connection_name }, { key: 'protocol', label: '协议', children: model.protocol_name },
      { key: 'alias', label: '稳定别名', children: model.model_code }, { key: 'actual', label: '供应商模型名', children: model.provider_model_name },
      { key: 'context', label: '上下文上限', children: model.context_limit ? `${model.context_limit.toLocaleString()} Token` : '未知' },
    ]} /> },
    { key: 'capabilities', label: '能力', children: <Table rowKey="capability" pagination={false} dataSource={model.capabilities} columns={[
      { title: '能力', dataIndex: 'name' }, { title: '状态', render: (_, c) => <Tag color={c.state === 'SUPPORTED' ? 'success' : c.state === 'UNSUPPORTED' ? 'error' : 'default'}>{c.label}</Tag> },
      { title: '验证时间', render: (_, c) => formatTimestamp(c.verified_at) }, { title: '原因', render: (_, c) => c.reason ?? '无' },
    ]} /> },
    { key: 'parameters', label: '参数', children: <Space orientation="vertical" style={{ width: '100%' }}>
      <Input.TextArea readOnly value={JSON.stringify(model.parameters, null, 2)} autoSize aria-label="当前参数" />
      <Table pagination={false} rowKey="name" dataSource={Object.entries(model.parameter_reasons).map(([name, reason]) => ({ name, reason }))} columns={[{ title: '参数', dataIndex: 'name' }, { title: '不支持原因', dataIndex: 'reason' }]} />
    </Space> },
    { key: 'prices', label: '价格', children: <Prices model={model} /> },
    { key: 'tests', label: '验证', children: <Tests modelId={modelId} onVerified={query.reload} /> },
    { key: 'grants', label: '授权', children: <Grants modelId={modelId} /> },
    { key: 'history', label: '历史', children: <VersionHistory path={`/admin/v1/models/${modelId}/versions`} /> },
  ]} />
}
function Tests({ modelId, onVerified }: { modelId: string; onVerified: () => void }) {
  const query = useQuery<Schema<'TestView'>[]>(`/admin/v1/models/${modelId}/tests`)
  const cases = useQuery<Schema<'CaseDefinition'>[]>('/admin/v1/model-test-cases')
  const [open, setOpen] = useState(false)
  return <Space orientation="vertical" style={{ width: '100%' }}><Space><Button onClick={() => setOpen(true)}>能力验证</Button><Button onClick={query.reload}>刷新</Button></Space>
    {query.error ? <ErrorState error={query.error} /> : !query.data ? <LoadingState /> : <Table rowKey="id" dataSource={query.data} expandable={{ expandedRowRender: t => <>{t.run_id && <RunViewer key={t.run_id} runId={t.run_id} />}<Table pagination={false} rowKey="case" dataSource={t.results} columns={[
      { title: '用例', render: (_, r) => cases.data?.find(c => c.case === r.case)?.name ?? '名称不可用' }, { title: '结果', render: (_, r) => r.passed ? '通过' : '未通过' },
      { title: '原因', render: (_, r) => r.reason ?? '无' }, { title: '尝试次数', render: (_, r) => r.attempt_ids.length },
    ]}/></> }} columns={[
      { title: '验证时间', render: (_, t) => formatTimestamp(t.created_at) }, { title: '配置修订', dataIndex: 'config_revision' },
      { title: '状态', render: (_, t) => <Tag>{t.state_label}</Tag> }, { title: '耗时', render: (_, t) => t.latency_ms === null ? '未记录' : `${t.latency_ms} 毫秒` },
      { title: '执行反馈', render: (_, t) => t.reason ?? (t.run_id ? '已关联调试运行' : '未创建运行') },
    ]} />}
    {open && <ModelDialog title="能力验证" initial={{ cases: ['text', 'usage'] }} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); query.reload(); onVerified() }} onSave={values => send(`/admin/v1/models/${modelId}/tests`, 'POST', values)}>
      {cases.error ? <ErrorState error={cases.error} onRetry={cases.reload} /> : null}
      <Form.Item name="cases" label="验证项目" rules={[{ required: true, message: '请至少选择一个验证项目' }]}>
        <Select mode="multiple" optionFilterProp="label" loading={!cases.data && !cases.error} options={[
          { label: '模型能力', options: cases.data?.filter(c => c.capability).map(c => ({ value: c.case, label: c.name })) ?? [] },
          { label: '附加验证项', options: cases.data?.filter(c => !c.capability).map(c => ({ value: c.case, label: c.name })) ?? [] },
        ]} />
      </Form.Item>
    </ModelDialog>}
  </Space>
}
function Prices({ model }: { model: Schema<'ModelView'> }) {
  const query = useQuery<Schema<'PriceVersionView'>[]>(`/admin/v1/models/${model.id}/price-versions`)
  const [open, setOpen] = useState(false)
  const dimensions = ['input', 'output', ...Object.keys(model.usage_subsets)]
  return <Space orientation="vertical" style={{ width: '100%' }}><Button onClick={() => setOpen(true)}>新增价格版本</Button>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : query.data.length === 0 ? <Alert type="info" title="未定价" /> : <Table rowKey="id" dataSource={query.data} columns={[
      { title: '名称', dataIndex: 'name' }, { title: '币种', dataIndex: 'currency' }, { title: '生效时间', render: (_, p) => formatTimestamp(p.effective_at) }, { title: '来源', dataIndex: 'source' },
      { title: '价格', render: (_, p) => <Space orientation="vertical">{p.items.map(i => <span key={i.dimension}>{dimensionNames[i.dimension] ?? '其他计量'}：{i.amount} {p.currency} / {i.per_units.toLocaleString()} Token</span>)}</Space> },
    ]} />}
    {open && <ModelDialog title="新增价格版本" initial={{ currency: 'CNY', per_units: 1000000 }} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); query.reload() }} onSave={values => send(`/admin/v1/models/${model.id}/price-versions`, 'POST', {
      name: values.name, currency: values.currency, effective_at: new Date(String(values.effective_at)).toISOString(), source: values.source,
      subset_relations: model.usage_subsets, items: dimensions.map(d => ({ dimension: d, amount: String(values[d]), per_units: values.per_units })),
    })}>
      <Form.Item name="name" label="价格名称" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="currency" label="币种" rules={[{ required: true }]}><Select options={[{ value: 'CNY', label: '人民币（CNY）' }, { value: 'USD', label: '美元（USD）' }]} /></Form.Item>
      <Form.Item name="per_units" label="计费单位（Token）" rules={[{ required: true }]}><InputNumber min={1} /></Form.Item>
      {dimensions.map(d => <Form.Item key={d} name={d} label={`${dimensionNames[d]}单价`} rules={[{ required: true }]}><InputNumber stringMode min="0" style={{ width: '100%' }} /></Form.Item>)}
      <Form.Item name="effective_at" label="生效时间" rules={[{ required: true }]}><DateTimeInput /></Form.Item>
      <Form.Item name="source" label="价格来源" rules={[{ required: true }]}><Input /></Form.Item>
    </ModelDialog>}
  </Space>
}
function Grants({ modelId }: { modelId: string }) {
  const { session } = useSession()
  const channelId = session.workspace?.channel_id
  const query = useQuery<Schema<'GrantView'>[]>(`/admin/v1/models/${modelId}/grants`)
  const options = useQuery<Schema<'AccessOptions'>>(channelId ? `/admin/v1/channels/${channelId}/access-options` : null)
  const [editor, setEditor] = useState<{ grant?: Schema<'GrantView'>; revoke?: boolean }>()
  const [grantee, setGrantee] = useState('account')
  return <Space orientation="vertical" style={{ width: '100%' }}><ActionButtons actions={session.actions} handlers={{ 'grant:manage': () => { setGrantee('account'); setEditor({}) } }} />
    {query.error ? <ErrorState error={query.error} /> : !query.data ? <LoadingState /> : <Table rowKey="grant_id" dataSource={query.data} columns={[
      { title: '授权对象', render: (_, g) => g.grantee_name ?? '名称不可用' }, { title: '授权来源', render: (_, g) => g.resource_name ?? '名称不可用' },
      { title: '实际授权', render: (_, g) => g.action_names.join('、') },
      { title: '操作', render: (_, g) => g.resource_type === 'model' ? <ActionButtons actions={session.actions} handlers={{ 'grant:manage': () => setEditor({ grant: g, revoke: true }) }} /> : null },
    ]} />}
    {editor && <ModelDialog title={editor.revoke ? '撤销模型使用授权' : '模型使用授权'} initial={{ grantee_type: grantee }} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); query.reload() }} onSave={values => editor.revoke && editor.grant ? send(`/admin/v1/channels/${channelId}/resource-grants/${editor.grant.grant_id}?revision=${editor.grant.revision}`, 'DELETE') : send(`/admin/v1/channels/${channelId}/model-grants/${modelId}`, 'PUT', values)}>
      {editor.revoke ? <Alert type="warning" title={`撤销 ${editor.grant?.grantee_name ?? '该对象'} 的模型使用授权`} /> : <>
        <Form.Item name="grantee_type" label="授权类型"><Select options={[{ value: 'account', label: '成员' }, { value: 'role', label: '角色' }]} onChange={setGrantee} /></Form.Item>
        <Form.Item name="grantee_id" label="授权对象" rules={[{ required: true }]}><Select options={grantee === 'account' ? options.data?.accounts : options.data?.roles.map(r => ({ value: r.role_code, label: r.name }))} /></Form.Item>
      </>}
    </ModelDialog>}
  </Space>
}
