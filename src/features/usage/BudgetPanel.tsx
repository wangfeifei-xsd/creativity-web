import { Button, Form, Input, InputNumber, Modal, Select, Space, Tag } from 'antd'
import { Table } from '../../components/Table'
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
function quantity(row: Budget, value: string | number | null | undefined): string {
  if (value == null) return '待核实'
  return row.unit === 'concurrency' ? `${String(value).replace(/\.0+$/, '')} 个` : `${value} ${row.currency ?? row.unit_label}`
}
export function BudgetPanel({ options, concurrencyOnly = false }: { options?: UsageOptions; concurrencyOnly?: boolean }) {
  const { session } = useSession()
  const query = useQuery<Budget[]>('/admin/v1/budgets')
  const alerts = useQuery<Alert[]>('/admin/v1/usage/alerts')
  const [editing, setEditing] = useState<Budget | 'new'>()
  const [form] = Form.useForm<Values>()
  const watchedKind = Form.useWatch('scope_type', form)
  const watchedUnit = Form.useWatch('unit', form)
  const kind = concurrencyOnly ? 'channel' : watchedKind
  const unit = concurrencyOnly ? 'concurrency' : watchedUnit
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const allowed = session.actions.some(a => a.action_key === 'budget:manage')
  const budgets = query.data?.filter(b => !concurrencyOnly || (b.scope_type === 'channel' && b.unit === 'concurrency'))
  function edit(budget: Budget | 'new') {
    setError(undefined); form.resetFields()
    form.setFieldsValue(budget === 'new' ? { name: '', scope_type: 'channel', scope_id: session.workspace?.channel_id ?? '', period: 'month', timezone: 'Asia/Shanghai', unit: 'amount', currency: 'USD', limit_value: undefined, mode: 'HARD', thresholds: ['80', '100'], status: 'ACTIVE' } : { ...budget, thresholds: budget.thresholds?.map(value => String(Number(value) * 100)) })
    if (budget === 'new' && concurrencyOnly) form.setFieldsValue({ name: '渠道并发', unit: 'concurrency', limit_value: '5', currency: null })
    setEditing(budget)
  }
  async function save(values: Values) {
    if (busy || !editing) return
    setBusy(true); setError(undefined)
    try {
      const stored = form.getFieldsValue(true) as Values
      const settings = concurrencyOnly ? {
        name: values.name, scope_type: 'channel', scope_id: session.workspace?.channel_id,
        unit: 'concurrency', limit_value: values.limit_value, mode: values.mode,
        period: stored.period, timezone: stored.timezone, currency: null,
        thresholds: values.thresholds, status: values.status,
      } : { ...values, period: values.period ?? stored.period, timezone: values.timezone ?? stored.timezone }
      const body = { ...settings, thresholds: settings.thresholds?.map((value: string | number) => String(Number(value) / 100)), currency: settings.unit === 'amount' ? settings.currency : null, scope_id: settings.scope_type === 'channel' ? session.workspace?.channel_id : settings.scope_id }
      await send(editing === 'new' ? '/admin/v1/budgets' : `/admin/v1/budgets/${editing.id}`, editing === 'new' ? 'POST' : 'PATCH', editing === 'new' ? body : { ...body, revision: editing.revision })
      setEditing(undefined); query.reload(); alerts.reload()
    } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  return <Space orientation="vertical" style={{ width: '100%' }} size="middle">
    <Space><Button onClick={() => { query.reload(); alerts.reload() }}>刷新</Button>{allowed && <Button type="primary" onClick={() => edit('new')}>{concurrencyOnly ? '新增限额' : '新增预算'}</Button>}</Space>
    <ErrorNotice error={query.error ?? alerts.error} />
    <Table<Budget> rowKey="id" loading={!query.data && !query.error} dataSource={budgets} scroll={{ x: 900 }} columns={[
      { title: concurrencyOnly ? '限额名称' : '预算', dataIndex: 'name' }, { title: '对象', render: (_, r) => r.scope_name ?? '名称不可用' },
      { title: '周期', render: (_, r) => r.unit === 'concurrency' ? '实时' : periods.find(p => p.value === r.period)?.label },
      { title: '控制方式', dataIndex: 'mode_label' }, { title: '限额', render: (_, r) => quantity(r, r.limit_value) },
      { title: '当前占用', render: (_, r) => quantity(r, r.used) }, { title: '剩余', render: (_, r) => quantity(r, r.remaining) },
      { title: '状态', render: (_, r) => <Tag>{r.status === 'ACTIVE' ? '启用' : '停用'}</Tag> },
      { title: '操作', render: (_, r) => allowed && <Button onClick={() => edit(r)}>编辑</Button> },
    ]} />
    {!concurrencyOnly && <Table<Alert> rowKey="id" dataSource={alerts.data} columns={[{ title: '预算提醒', dataIndex: 'name' }, { title: '阈值', render: (_, r) => `${Number(r.threshold) * 100}%` }, { title: '状态', dataIndex: 'status_label' }, { title: '首次触发', render: (_, r) => formatTimestamp(r.first_triggered_at) }]} />}
    <Modal open={!!editing} title={concurrencyOnly ? (editing === 'new' ? '新增并发限额' : '编辑并发限额') : (editing === 'new' ? '新增预算' : '编辑预算')} onCancel={() => setEditing(undefined)} onOk={() => form.submit()} confirmLoading={busy} destroyOnHidden>
      <ErrorNotice error={error} />
      <Form form={form} layout="vertical" onFinish={save} disabled={busy}>
        <Form.Item name="name" label={concurrencyOnly ? '限额名称' : '预算名称'} rules={[{ required: true }]}><Input /></Form.Item>
        {!concurrencyOnly && <Form.Item name="scope_type" label="预算对象"><Select options={[{ value: 'channel', label: '当前渠道' }, { value: 'key', label: '接入凭据' }, { value: 'model', label: '模型' }]} onChange={() => form.setFieldValue('scope_id', undefined)} /></Form.Item>}
        {kind !== 'channel' && <Form.Item name="scope_id" label={kind === 'key' ? '接入凭据' : '模型'} rules={[{ required: true }]}><Select options={kind === 'key' ? options?.keys : options?.models} /></Form.Item>}
        {!concurrencyOnly && <Form.Item name="unit" label="限额类型"><Select options={units} /></Form.Item>}
        {unit === 'amount' && <Form.Item name="currency" label="币种" rules={[{ required: true }]}><Select options={[{ value: 'USD', label: '美元（USD）' }, { value: 'CNY', label: '人民币（CNY）' }]} /></Form.Item>}
        <Form.Item name="limit_value" label={concurrencyOnly ? '并发上限（个）' : '限额'} rules={[{ required: true }]}><InputNumber stringMode min={unit === 'amount' ? '0.00000001' : '1'} precision={unit === 'amount' ? 8 : 0} style={{ width: '100%' }} /></Form.Item>
        {unit !== 'concurrency' && <><Form.Item name="period" label="业务周期"><Select options={periods} /></Form.Item>
        <Form.Item name="timezone" label="周期时区"><Select options={zones} /></Form.Item></>}
        <Form.Item name="mode" label="控制方式"><Select options={[{ value: 'HARD', label: '超额阻断' }, { value: 'ALERT_ONLY', label: '仅提醒' }]} /></Form.Item>
        <Form.Item name="thresholds" label="提醒阈值（%）" rules={[{ required: true }]}><Select mode="tags" options={[{ value: '50', label: '50%' }, { value: '80', label: '80%' }, { value: '100', label: '100%' }]} /></Form.Item>
        <Form.Item name="status" label="状态"><Select options={[{ value: 'ACTIVE', label: '启用' }, { value: 'DISABLED', label: '停用' }]} /></Form.Item>
      </Form>
    </Modal>
  </Space>
}
