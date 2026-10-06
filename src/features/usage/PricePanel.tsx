import { DateTimeInput } from '../../components/DateTimeInput'
import { Button, Form, Input, InputNumber, Modal, Select, Space, Typography } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { send } from '../../api/management'
import { useQuery } from '../../api/useQuery'
import { formatTimestamp } from '../../api/presentation'
import { useSession } from '../../app/workspace/context'
import { ErrorNotice, type Schema } from '../../components/Management'
import { localTime, type UsageOptions } from './types'

type Price = Schema<'PriceVersionView'>
type Values = { model_id: string; name: string; currency: string; effective_at: string; source: string; items: { dimension: string; amount: string; per_units: number; parent?: string }[] }
const dimensions = [{ value: 'input', label: '输入 Token' }, { value: 'output', label: '输出 Token' }, { value: 'cached', label: '缓存读取 Token' }, { value: 'cache_write', label: '缓存写入 Token' }, { value: 'reasoning', label: '推理 Token' }]
export function PricePanel({ options }: { options?: UsageOptions }) {
  const { session } = useSession()
  const query = useQuery<Price[]>('/admin/v1/usage/prices')
  const [editing, setEditing] = useState(false)
  const [form] = Form.useForm<Values>()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  async function save(values: Values) {
    if (busy) return
    setBusy(true); setError(undefined)
    try {
      await send(`/admin/v1/models/${values.model_id}/price-versions`, 'POST', {
        name: values.name, currency: values.currency, source: values.source, effective_at: new Date(values.effective_at).toISOString(),
        items: values.items.map(({ dimension, amount, per_units }) => ({ dimension, amount, per_units })),
        subset_relations: Object.fromEntries(values.items.filter(i => i.parent).map(i => [i.dimension, i.parent])),
      })
      setEditing(false); query.reload()
    } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  return <Space orientation="vertical" style={{ width: '100%' }}>
    <Space><Button onClick={query.reload}>刷新</Button>{session.actions.some(a => a.action_key === 'model:manage') && <Button type="primary" onClick={() => { setEditing(true); setError(undefined); form.resetFields() }}>新增价格版本</Button>}</Space>
    <ErrorNotice error={query.error} />
    <Table<Price> rowKey="id" dataSource={query.data} loading={!query.data && !query.error} columns={[
      { title: '模型', render: (_, r) => options?.models.find(m => m.value === r.model_id)?.label ?? '名称不可用' },
      { title: '价格版本', dataIndex: 'name' }, { title: '币种', dataIndex: 'currency' }, { title: '生效时间', render: (_, r) => formatTimestamp(r.effective_at) },
      { title: '计价维度', render: (_, r) => <Space orientation="vertical">{r.items.map(i => <Typography.Text key={i.dimension}>{dimensions.find(d => d.value === i.dimension)?.label ?? '扩展用量'}：{i.amount} {r.currency} / {i.per_units} Token{r.subset_relations?.[i.dimension] ? `，包含在${dimensions.find(d => d.value === r.subset_relations?.[i.dimension])?.label ?? '总量'}中` : ''}</Typography.Text>)}</Space> },
      { title: '来源', dataIndex: 'source' },
    ]} />
    <Modal open={editing} title="新增价格版本" width={800} onCancel={() => setEditing(false)} onOk={() => form.submit()} confirmLoading={busy} destroyOnHidden>
      <ErrorNotice error={error} />
      <Form form={form} layout="vertical" onFinish={save} disabled={busy} initialValues={{ currency: 'USD', effective_at: localTime(new Date()), items: [{ dimension: 'input', per_units: 1000000 }, { dimension: 'output', per_units: 1000000 }] }}>
        <Form.Item name="model_id" label="模型" rules={[{ required: true }]}><Select options={options?.models} /></Form.Item>
        <Form.Item name="name" label="版本名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="currency" label="币种" rules={[{ required: true }]}><Select options={[{ value: 'USD', label: '美元（USD）' }, { value: 'CNY', label: '人民币（CNY）' }]} /></Form.Item>
        <Form.Item name="effective_at" label="生效时间" rules={[{ required: true }]}><DateTimeInput /></Form.Item>
        <Form.Item name="source" label="价格来源" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.List name="items">{(fields, { add, remove }) => <Space orientation="vertical" style={{ width: '100%' }}>
          {fields.map(field => <Space key={field.key} align="start" wrap>
            <Form.Item name={[field.name, 'dimension']} label="计费维度" rules={[{ required: true }]}><Select style={{ width: 145 }} options={dimensions} /></Form.Item>
            <Form.Item name={[field.name, 'amount']} label="单价" rules={[{ required: true }]}><InputNumber stringMode min="0" /></Form.Item>
            <Form.Item name={[field.name, 'per_units']} label="每多少 Token" rules={[{ required: true }]}><InputNumber min={1} precision={0} /></Form.Item>
            <Form.Item name={[field.name, 'parent']} label="包含在"><Select allowClear style={{ width: 135 }} options={dimensions} /></Form.Item>
            <Button onClick={() => remove(field.name)}>移除</Button>
          </Space>)}
          <Button onClick={() => add({ per_units: 1000000 })}>增加维度</Button>
        </Space>}</Form.List>
      </Form>
    </Modal>
  </Space>
}
