import { Button, Form, Input, InputNumber, Select, Space, Switch } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { ActionButtons, ErrorNotice, type Choice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { useResourceSummaries } from '../resources/useResourceSummaries'
import { resourceColumns } from '../resources/resourceColumns'
import { ModelDialog } from './shared'
import { capabilityOptions, jsonObject } from './options'

export function RoutesPage() {
  const query = useQuery<Schema<'RouteList'>>('/admin/v1/model-routes')
  const summaries = useResourceSummaries('model_route', query.data?.items.map(row => row.id) ?? [], query.data)
  const [create, setCreate] = useState(false)
  const [route, setRoute] = useState<Schema<'RouteView'>>()
  return <PageContainer title="模型路由" actions={<Space><Button onClick={query.reload}>刷新</Button><ActionButtons actions={query.data?.actions ?? []} handlers={{ create: () => setCreate(true) }} /></Space>}>
    <ErrorNotice error={summaries.error} />
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Table rowKey="id" dataSource={query.data.items} columns={[
      { title: '路由', dataIndex: 'name' },
      ...resourceColumns<Schema<'RouteView'>>('model_route', summaries.items, row => row.id, setRoute, query.reload),
    ]} />}
    {create && <ModelDialog title="新增路由" onClose={() => setCreate(false)} onSaved={() => { setCreate(false); query.reload() }} onSave={v => send('/admin/v1/model-routes', 'POST', v)}>
      <Form.Item name="name" label="路由名称" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="code" label="路由编码" rules={[{ required: true }]}><Input /></Form.Item>
    </ModelDialog>}
    {route && <RouteConfiguration route={route} onClose={() => { setRoute(undefined); query.reload() }} />}
  </PageContainer>
}
function RouteConfiguration({ route, onClose }: { route: Schema<'RouteView'>; onClose: () => void }) {
  const query = useQuery<Schema<'RouteVersionView'>[]>(`/admin/v1/model-routes/${route.id}/configuration`)
  const models = useQuery<Schema<'ModelList'>>('/admin/v1/models')
  const summaries = useResourceSummaries('model_route', [route.id], query.data)
  const choices = models.data?.items.map(m => ({ value: m.id, label: `${m.provider_name ?? '供应商名称不可用'} · ${m.connection_name} · ${m.name}` })) ?? []
  if (query.error || models.error || summaries.error) return <ErrorState error={query.error || models.error || summaries.error} />
  if (!query.data || !models.data || !summaries.items[route.id]) return <LoadingState />
  const current = query.data[0]
  const content = current?.content ?? {}
  const retry = content.retry_policy as { max_attempts?: number; retries_per_model?: number } | undefined
  return <ModelDialog title="修改路由配置" initial={{ ...content, name: route.name, required_capabilities: content.required_capabilities ?? ['text'], parameters: JSON.stringify(content.parameters ?? {}, null, 2), max_attempts: retry?.max_attempts ?? 3, retries_per_model: retry?.retries_per_model ?? 0, fallback_models: content.fallback_models ?? [], hard_amount_budget: content.hard_amount_budget ?? false }} onClose={onClose} onSaved={onClose} onSave={v => {
    const { max_attempts, retries_per_model, ...body } = v
    return send(`/admin/v1/model-routes/${route.id}/configuration`, 'PUT', { name: body.name, resource_revision: summaries.items[route.id].revision, primary_model: body.primary_model, fallback_models: body.fallback_models, required_capabilities: body.required_capabilities, hard_amount_budget: body.hard_amount_budget, parameters: jsonObject(v.parameters), retry_policy: { max_attempts, retries_per_model }, revision: summaries.items[route.id].configuration_revision })
  }}>
    <Form.Item name="name" label="路由名称" rules={[{ required: true }]}><Input /></Form.Item>
    <RouteModelFields choices={choices} />
    <Form.Item name="required_capabilities" label="必需能力"><Select mode="multiple" options={capabilityOptions} /></Form.Item>
    <Form.Item name="parameters" label="路由参数（JSON）"><Input.TextArea rows={3} /></Form.Item>
    <Form.Item name="max_attempts" label="总尝试上限（次）"><InputNumber min={1} max={10} /></Form.Item>
    <Form.Item name="retries_per_model" label="每个模型重试上限（次）"><InputNumber min={0} max={2} /></Form.Item>
    <Form.Item name="hard_amount_budget" label="要求硬金额预算" valuePropName="checked"><Switch /></Form.Item>
  </ModelDialog>
}

function RouteModelFields({ choices }: { choices: Choice[] }) {
  const form = Form.useFormInstance()
  const primary = Form.useWatch('primary_model', form)
  const fallbackChoices = choices.filter(option => option.value !== primary)
  return <>
    <Form.Item name="primary_model" label="首选模型" rules={[{ required: true, message: '请选择首选模型' }]}>
      <Select options={choices} onChange={value => {
        const fallbacks: string[] = form.getFieldValue('fallback_models') ?? []
        // 首选切换到原回退模型时，只移除该项，保留其他回退顺序。
        form.setFieldValue('fallback_models', fallbacks.filter(id => id !== value))
      }} />
    </Form.Item>
    <Form.Item name="fallback_models" label="回退模型（按选择顺序）" dependencies={['primary_model']}
      extra="可留空；首选模型失败后，按顺序尝试其他模型。同一模型重试请设置下方重试上限。"
      rules={[{ validator: (_, values: string[] = []) => {
        if (values.includes(form.getFieldValue('primary_model'))) return Promise.reject(new Error('回退模型不能与首选模型相同'))
        if (new Set(values).size !== values.length) return Promise.reject(new Error('回退模型不能重复选择'))
        return Promise.resolve()
      } }]}>
      <Select mode="multiple" options={fallbackChoices} placeholder="可留空"
        notFoundContent={primary && choices.length ? '暂无其他模型，可不设置回退' : '暂无模型'} />
    </Form.Item>
  </>
}
