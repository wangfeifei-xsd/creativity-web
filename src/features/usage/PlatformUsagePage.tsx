import { DateTimeInput } from '../../components/DateTimeInput'
import { App, Button, Form, Pagination, Select, Space, Tag } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { send } from '../../api/management'
import { formatAmount, formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import type { DirectoryPage } from '../../components/Directory'
import { ErrorNotice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ExportDrawer } from './UsagePage'
import { localTime, zones } from './types'

type Values = { channel_ids: string[]; start_at: string; end_at: string; timezone: string }
function ChannelPicker({ value, onChange }: { value?: string[]; onChange?: (values: string[]) => void }) {
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const query = useQuery<DirectoryPage<{ value: string; label: string }>>(`/admin/v1/platform/usage/channels?${new URLSearchParams({ search, offset: String((page - 1) * 20), limit: '20' })}`)
  return <Space orientation="vertical"><Select aria-label="统计渠道" style={{ minWidth: 280 }} mode="multiple" maxCount={100} labelInValue value={value?.map(id => ({ value: id, label: selected[id] ?? '名称不可用' }))} onChange={items => { setSelected(previous => ({ ...previous, ...Object.fromEntries(items.map(item => [item.value, String(item.label)])) })); onChange?.(items.map(item => item.value)) }}
    showSearch filterOption={false} onSearch={text => { setSearch(text); setPage(1) }} options={query.data?.items}
    popupRender={menu => <>{menu}<Pagination size="small" current={page} total={query.data?.total} pageSize={20} showSizeChanger={false} onChange={setPage} /></>} />
    <ErrorNotice error={query.error} /></Space>
}

export function PlatformUsagePage() {
  const { message } = App.useApp()
  const [initial] = useState(() => ({ start_at: localTime(new Date(Date.now() - 7 * 86400000)), end_at: localTime(new Date()), timezone: 'Asia/Shanghai' }))
  const [filters, setFilters] = useState<Values>()
  const [exportsOpen, setExportsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const params = new URLSearchParams()
  if (filters) {
    filters.channel_ids.forEach(id => params.append('channel_ids', id))
    params.set('start_at', filters.start_at); params.set('end_at', filters.end_at)
  }
  const query = useQuery<Schema<'UsageView'>[]>(filters ? `/admin/v1/platform/usage?${params}` : null)
  async function exportReport() {
    if (!filters || busy) return
    setBusy(true); setError(undefined)
    try {
      const { channel_ids, ...query } = filters
      await send('/admin/v1/platform/usage/exports', 'POST', { channel_ids, query })
      void message.success('导出任务已创建'); setExportsOpen(true)
    } catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  return <PageContainer title="平台用量" actions={<Space>
    <Button onClick={query.reload} disabled={!filters}>刷新</Button>
    <Button disabled={!filters} loading={busy} onClick={() => void exportReport()}>导出汇总</Button>
    <Button onClick={() => setExportsOpen(true)}>导出任务</Button>
  </Space>}>
    <Form<Values> layout="inline" style={{ marginBottom: 16 }} initialValues={initial}
      onFinish={values => { setError(undefined); setFilters({ ...values, start_at: new Date(values.start_at).toISOString(), end_at: new Date(values.end_at).toISOString() }) }}>
      <Form.Item name="channel_ids" label="渠道" rules={[{ required: true, message: '请选择统计渠道' }]}><ChannelPicker /></Form.Item>
      <Form.Item name="start_at" label="开始时间" rules={[{ required: true }]}><DateTimeInput /></Form.Item>
      <Form.Item name="end_at" label="结束时间" rules={[{ required: true }]}><DateTimeInput /></Form.Item>
      <Form.Item name="timezone" label="报表时区" rules={[{ required: true }]}><Select style={{ width: 150 }} options={zones} /></Form.Item>
      <Form.Item><Button htmlType="submit" type="primary">查询</Button></Form.Item>
    </Form>
    <ErrorNotice error={error ?? query.error} />
    <Table<Schema<'UsageView'>> rowKey="channel_id" dataSource={query.data} loading={!!filters && !query.data && !query.error} scroll={{ x: 1250 }} columns={[
      { title: '渠道', dataIndex: 'channel_name' }, { title: '调用次数', render: (_, row) => `${row.calls} 次` },
      { title: '实际请求数', render: (_, row) => row.requests == null ? '未确认' : `${row.requests} 次` },
      { title: '输入 Token', render: (_, row) => row.input_tokens == null ? '未确认' : row.input_tokens.toLocaleString('zh-CN') },
      { title: '输出 Token', render: (_, row) => row.output_tokens == null ? '未确认' : row.output_tokens.toLocaleString('zh-CN') },
      { title: '已计价费用', render: (_, row) => row.costs.map(m => formatAmount(m.amount, m.currency)).join('、') || '费用未确认' },
      { title: '暂估费用', render: (_, row) => row.provisional_costs?.map(m => formatAmount(m.amount, m.currency)).join('、') || '费用未确认' },
      { title: '未定价', dataIndex: 'unpriced' }, { title: '用量缺失', dataIndex: 'missing_usage' },
      { title: '计价完整性', render: (_, row) => <Tag>{row.price_complete ? '完整' : '待核实'}</Tag> },
      { title: '聚合更新时间', render: (_, row) => formatTimestamp(row.aggregate_updated_at, filters?.timezone) },
    ]} />
    {exportsOpen && <ExportDrawer platform onClose={() => setExportsOpen(false)} />}
  </PageContainer>
}
