import { Button, Drawer, Form, Input, InputNumber, Select, Space, Switch, Tag, Typography } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { ActionButtons, type Choice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { ModelDialog } from './shared'
import { capabilityOptions, jsonObject } from './options'

export function RoutesPage() {
  const query = useQuery<Schema<'RouteList'>>('/admin/v1/model-routes')
  const [create, setCreate] = useState(false)
  const [route, setRoute] = useState<Schema<'RouteView'>>()
  return <PageContainer title="模型路由" actions={<Space><Button onClick={query.reload}>刷新</Button><ActionButtons actions={query.data?.actions ?? []} handlers={{ create: () => setCreate(true) }} /></Space>}>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Table rowKey="id" dataSource={query.data.items} columns={[
      { title: '路由', dataIndex: 'name' }, { title: '状态', render: (_, r) => <Tag>{r.status_label}</Tag> }, { title: '发布状态', render: (_, r) => r.released_version_id ? '已发布' : '未发布' },
      { title: '操作', render: (_, r) => <Button onClick={() => setRoute(r)}>版本</Button> },
    ]} />}
    {create && <ModelDialog title="新增路由" onClose={() => setCreate(false)} onSaved={() => { setCreate(false); query.reload() }} onSave={v => send('/admin/v1/model-routes', 'POST', v)}>
      <Form.Item name="name" label="路由名称" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="code" label="路由编码" rules={[{ required: true }]}><Input /></Form.Item>
    </ModelDialog>}
    {route && <Drawer open width={840} title={route.name} onClose={() => { setRoute(undefined); query.reload() }} destroyOnHidden><RouteVersions route={route} /></Drawer>}
  </PageContainer>
}
function RouteVersions({ route }: { route: Schema<'RouteView'> }) {
  const query = useQuery<Schema<'RouteVersionView'>[]>(`/admin/v1/model-routes/${route.id}/versions`)
  const models = useQuery<Schema<'ModelList'>>('/admin/v1/models')
  const [open, setOpen] = useState(false)
  const [release, setRelease] = useState<Schema<'ResourceVersion'>>()
  const [current, setCurrent] = useState(route.released_version_id)
  const choices = models.data?.items.map(m => ({ value: m.id, label: `${m.provider_name ?? '供应商名称不可用'} · ${m.connection_name} · ${m.name}` })) ?? []
  const modelName = (id: unknown) => models.data?.items.find(m => m.id === id)?.name ?? '名称不可用'
  return <Space orientation="vertical" style={{ width: '100%' }}><Button onClick={() => setOpen(true)}>新增版本</Button>
    {query.error ? <ErrorState error={query.error} /> : !query.data ? <LoadingState /> : <Table rowKey="version_id" dataSource={query.data} columns={[
      { title: '版本', dataIndex: 'version_label' }, { title: '首选模型', render: (_, v) => modelName(v.content.primary_model) },
      { title: '回退顺序', render: (_, v) => Array.isArray(v.content.fallback_models) ? v.content.fallback_models.map(modelName).join(' → ') || '无' : '未记录' },
      { title: '发布状态', render: (_, v) => current === v.version_id ? '当前发布' : '未发布' },
      { title: '操作', render: (_, v) => <Space orientation="vertical" size={4}>
        <ActionButtons actions={v.actions ?? []} handlers={{ release: () => setRelease(v) }} disabled={current === v.version_id} />
        {v.actions?.filter(a => a.enabled === false && a.disabled_reason).map(a =>
          <Typography.Text key={a.action_key} type="secondary" style={{ display: 'block', maxWidth: 260 }}>{a.disabled_reason}</Typography.Text>)}
      </Space> },
    ]} />}
    {open && <ModelDialog title="新增路由版本" initial={{ required_capabilities: ['text'], parameters: '{}', max_attempts: 3, retries_per_model: 0, fallback_models: [], hard_amount_budget: false }} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); query.reload() }} onSave={v => {
      const { max_attempts, retries_per_model, ...body } = v
      return send(`/admin/v1/model-routes/${route.id}/versions`, 'POST', { ...body, parameters: jsonObject(v.parameters), retry_policy: { max_attempts, retries_per_model } })
    }}>
      <Form.Item name="label" label="版本名称" rules={[{ required: true }]}><Input /></Form.Item>
      <RouteModelFields choices={choices} />
      <Form.Item name="required_capabilities" label="必需能力"><Select mode="multiple" options={capabilityOptions} /></Form.Item>
      <Form.Item name="parameters" label="路由参数（JSON）"><Input.TextArea rows={3} /></Form.Item>
      <Form.Item name="max_attempts" label="总尝试上限（次）"><InputNumber min={1} max={10} /></Form.Item>
      <Form.Item name="retries_per_model" label="每个模型重试上限（次）"><InputNumber min={0} max={2} /></Form.Item>
      <Form.Item name="hard_amount_budget" label="要求硬金额预算" valuePropName="checked"><Switch /></Form.Item>
    </ModelDialog>}
    {release && <ModelDialog title={`发布 ${release.version_label}`} onClose={() => setRelease(undefined)} onSaved={() => { setCurrent(release.version_id); setRelease(undefined); query.reload() }} onSave={() => send(`/admin/v1/model-routes/${route.id}/releases`, 'POST', { version_id: release.version_id, expected_version_id: current })}>
      <span>发布后新的运行将使用该路由版本。</span>
    </ModelDialog>}
  </Space>
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
