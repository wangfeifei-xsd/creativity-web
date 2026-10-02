import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ErrorNotice, type Schema } from '../../components/Management'
import { formatTimestamp } from '../../api/presentation'
import { periods, zones, type UsageOptions } from './types'

type Budget = Schema<'BudgetView'>
type Values = Schema<'BudgetCreate'>
const units = [{ value: 'amount', label: '金额' }, { value: 'tokens', label: 'Token 数' }, { value: 'attempts', label: '调用次数' }, { value: 'requests', label: '请求数' }, { value: 'concurrency', label: '并发数' }]
type Alert = { id: string; name: string; threshold: string; status_label: string; first_triggered_at: string }
export function BudgetPanel({ options }: { options?: UsageOptions }) {
  const { session } = useSession()
  const query = useQuery<Budget[]>('/admin/v1/budgets')
  const alerts = useQuery<Alert[]>('/admin/v1/usage/alerts')
  const [editing, setEditing] = useState<Budget | 'new'>()
  const [form] = Form.useForm<Values>()
  const kind = Form.useWatch('scope_type', form)
  const unit = Form.useWatch('unit', form)
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const allowed = session.actions.some(a => a.action_key === 'budget:manage')
  function edit(budget: Budget | 'new') {
    setError(undefined); form.resetFields()
    form.setFieldsValue(budget === 'new' ? { name: '', scope_type: 'channel', scope_id: session.workspace?.channel_id ?? '', period: 'month', timezone: 'Asia/Shanghai', unit: 'amount', currency: 'USD', limit_value: undefined, mode: 'HARD', thresholds: ['80', '100'], status: 'ACTIVE' } : { ...budget, thresholds: budget.thresholds?.map(value => String(Number(value) * 100)) })
    setEditing(budget)
  }
  async function save(values: Values) {
    if (busy || !editing) return
    setBusy(true); setError(undefined)
    try {
      const body = { ...values, thresholds: values.thresholds?.map(value => String(Number(value) / 100)), currency: values.unit === 'amount' ? values.currency : null, scope_id: values.scope_type === 'channel' ? session.workspace?.channel_id : values.scope_id }
      await send(editing === 'new' ? '/admin/v1/budgets' : `/admin/v1/budgets/${editing.id}`, editing === 'new' ? 'POST' : 'PATCH', editing === 'new' ? body : { ...body, revision: editing.revision })
      setEditing(undefined); query.reload(); alerts.reload()
    } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  return <Space orientation="vertical" style={{ width: '100%' }} size="middle">
    <Space><Button onClick={() => { query.reload(); alerts.reload() }}>刷新</Button>{allowed && <Button type="primary" onClick={() => edit('new')}>新增预算</Button>}</Space>
    <ErrorNotice error={query.error ?? alerts.error} />
    <Table<Budget> rowKey="id" loading={!query.data && !query.error} dataSource={query.data} scroll={{ x: 900 }} columns={[
      { title: '预算', dataIndex: 'name' }, { title: '对象', render: (_, r) => r.scope_name ?? '名称不可用' },
      { title: '周期', render: (_, r) => periods.find(p => p.value === r.period)?.label },
      { title: '控制方式', dataIndex: 'mode_label' }, { title: '限额', render: (_, r) => `${r.limit_value} ${r.currency ?? r.unit_label}` },
      { title: '当前占用', render: (_, r) => r.used == null ? '待核实' : `${r.used} ${r.currency ?? r.unit_label}` }, { title: '剩余', render: (_, r) => r.remaining == null ? '待核实' : `${r.remaining} ${r.currency ?? r.unit_label}` },
      { title: '状态', render: (_, r) => <Tag>{r.status === 'ACTIVE' ? '启用' : '停用'}</Tag> },
      { title: '操作', render: (_, r) => allowed && <Button onClick={() => edit(r)}>编辑</Button> },
    ]} />
    <Table<Alert> rowKey="id" dataSource={alerts.data} columns={[{ title: '预算提醒', dataIndex: 'name' }, { title: '阈值', render: (_, r) => `${Number(r.threshold) * 100}%` }, { title: '状态', dataIndex: 'status_label' }, { title: '首次触发', render: (_, r) => formatTimestamp(r.first_triggered_at) }]} />
    <Modal open={!!editing} title={editing === 'new' ? '新增预算' : '编辑预算'} onCancel={() => setEditing(undefined)} onOk={() => form.submit()} confirmLoading={busy} destroyOnHidden>
      <ErrorNotice error={error} />
      <Form form={form} layout="vertical" onFinish={save} disabled={busy}>
        <Form.Item name="name" label="预算名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="scope_type" label="预算对象"><Select options={[{ value: 'channel', label: '当前渠道' }, { value: 'key', label: '接入凭据' }, { value: 'model', label: '模型' }]} onChange={() => form.setFieldValue('scope_id', undefined)} /></Form.Item>
        {kind !== 'channel' && <Form.Item name="scope_id" label={kind === 'key' ? '接入凭据' : '模型'} rules={[{ required: true }]}><Select options={kind === 'key' ? options?.keys : options?.models} /></Form.Item>}
        <Form.Item name="unit" label="限额类型"><Select options={units} /></Form.Item>
        {unit === 'amount' && <Form.Item name="currency" label="币种" rules={[{ required: true }]}><Select options={[{ value: 'USD', label: '美元（USD）' }, { value: 'CNY', label: '人民币（CNY）' }]} /></Form.Item>}
        <Form.Item name="limit_value" label="限额" rules={[{ required: true }]}><InputNumber stringMode min="0.00000001" style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="period" label="业务周期"><Select options={periods} /></Form.Item>
        <Form.Item name="timezone" label="周期时区"><Select options={zones} /></Form.Item>
        <Form.Item name="mode" label="控制方式"><Select options={[{ value: 'HARD', label: '超额阻断' }, { value: 'ALERT_ONLY', label: '仅提醒' }]} /></Form.Item>
        <Form.Item name="thresholds" label="提醒阈值（%）" rules={[{ required: true }]}><Select mode="tags" options={[{ value: '50', label: '50%' }, { value: '80', label: '80%' }, { value: '100', label: '100%' }]} /></Form.Item>
        <Form.Item name="status" label="状态"><Select options={[{ value: 'ACTIVE', label: '启用' }, { value: 'DISABLED', label: '停用' }]} /></Form.Item>
      </Form>
    </Modal>
  </Space>
}
