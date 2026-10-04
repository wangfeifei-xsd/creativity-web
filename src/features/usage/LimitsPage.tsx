import { Button, Form, Input, InputNumber, Modal, Result, Select, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ErrorNotice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { BudgetPanel } from './BudgetPanel'
import { periods, zones } from './types'

type Limit = Schema<'PlatformLimitView'>
type Values = Schema<'PlatformLimitCreate'>

export function ConcurrencyPage() {
  const { session } = useSession()
  if (!session.workspace || !session.actions.some(a => a.action_key === 'budget:manage')) return <Result status="403" title="无权管理渠道并发限额" />
  return <PageContainer title="并发限额"><BudgetPanel concurrencyOnly /></PageContainer>
}

export function PlatformLimitsPage() {
  const { session } = useSession()
  const allowed = !session.workspace && session.actions.some(a => a.action_key === 'channel:govern')
  const query = useQuery<Limit[]>(allowed ? '/admin/v1/platform/budget-limits' : null)
  const [editing, setEditing] = useState<Limit | 'new'>()
  const [form] = Form.useForm<Values>()
  const unit = Form.useWatch('unit', form)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  function edit(limit: Limit | 'new') {
    form.resetFields(); setError(undefined)
    form.setFieldsValue(limit === 'new' ? { name: '平台并发', limit_code: 'concurrency', unit: 'concurrency', limit_value: 20, period: 'minute', timezone: 'Asia/Shanghai', status: 'ACTIVE' } : limit)
    setEditing(limit)
  }
  async function save(values: Values) {
    if (busy || !editing) return
    setBusy(true); setError(undefined)
    try {
      const previous = form.getFieldsValue(true)
      await send('/admin/v1/platform/budget-limits', 'POST', {
        name: values.name, limit_code: values.limit_code, unit: values.unit,
        limit_value: values.limit_value, status: values.status,
        period: values.period ?? previous.period, timezone: values.timezone ?? previous.timezone,
        revision: editing === 'new' ? null : editing.revision,
      })
      setEditing(undefined); query.reload()
    } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  if (!allowed) return <Result status="403" title="无权管理平台限额" />
  return <PageContainer title="平台限额" actions={<Space><Button onClick={query.reload}>刷新</Button><Button type="primary" onClick={() => edit('new')}>新增限额</Button></Space>}>
    <ErrorNotice error={query.error} />
    <Table<Limit> rowKey="limit_code" loading={!query.data && !query.error} dataSource={query.data} scroll={{ x: 760 }} columns={[
      { title: '限额名称', dataIndex: 'name' },
      { title: '类型', dataIndex: 'unit_label' },
      { title: '周期', render: (_, row) => row.unit === 'concurrency' ? '实时' : periods.find(p => p.value === row.period)?.label },
      { title: '上限', render: (_, row) => `${row.limit_value} ${row.unit === 'concurrency' ? '个' : '次'}` },
      { title: '当前占用', render: (_, row) => row.used == null ? '未确认' : `${row.used} ${row.unit === 'concurrency' ? '个' : '次'}` },
      { title: '剩余', render: (_, row) => row.remaining == null ? '未确认' : `${row.remaining} ${row.unit === 'concurrency' ? '个' : '次'}` },
      { title: '状态', render: (_, row) => <Tag>{row.status === 'ACTIVE' ? '启用' : '停用'}</Tag> },
      { title: '生效时间', render: (_, row) => formatTimestamp(row.effective_at) },
      { title: '操作', render: (_, row) => <Button onClick={() => edit(row)}>编辑</Button> },
    ]} />
    <Modal open={!!editing} title={editing === 'new' ? '新增平台限额' : '编辑平台限额'} onCancel={() => setEditing(undefined)} onOk={() => form.submit()} confirmLoading={busy} destroyOnHidden>
      <ErrorNotice error={error} />
      <Form form={form} layout="vertical" disabled={busy} onFinish={save}>
        <Form.Item name="name" label="限额名称" rules={[{ required: true }]}><Input maxLength={128} /></Form.Item>
        <Form.Item name="limit_code" label="限额标识" rules={[{ required: true }, { pattern: /^[a-z][a-z0-9_-]{0,63}$/, message: '使用小写字母开头，可含数字、下划线和短横线' }]}><Input disabled={editing !== 'new'} /></Form.Item>
        <Form.Item name="unit" label="限额类型" rules={[{ required: true }]}><Select options={[{ value: 'concurrency', label: '并发数' }, { value: 'requests', label: '请求数' }]} /></Form.Item>
        <Form.Item name="limit_value" label={unit === 'requests' ? '请求上限（次）' : '并发上限（个）'} rules={[{ required: true }]}><InputNumber min={1} precision={0} style={{ width: '100%' }} /></Form.Item>
        {unit === 'requests' && <><Form.Item name="period" label="周期" rules={[{ required: true }]}><Select options={periods} /></Form.Item><Form.Item name="timezone" label="周期时区" rules={[{ required: true }]}><Select options={zones} /></Form.Item></>}
        <Form.Item name="status" label="状态" rules={[{ required: true }]}><Select options={[{ value: 'ACTIVE', label: '启用' }, { value: 'DISABLED', label: '停用' }]} /></Form.Item>
      </Form>
    </Modal>
  </PageContainer>
}
