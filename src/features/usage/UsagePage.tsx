import { StatusTag } from '../../components/StatusTag'
import { DateTimeInput } from '../../components/DateTimeInput'
import { App, Button, Card, Checkbox, Col, Descriptions, Drawer, Form, Input, Row, Select, Space, Statistic, Tabs, Tooltip, Typography } from 'antd'
import { Table } from '../../components/Table'
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { apiClient } from '../../api/client'
import { environments, send } from '../../api/management'
import { formatAmount, formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { useSession } from '../../app/workspace/context'
import { ErrorNotice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { BudgetPanel } from './BudgetPanel'
import { Statements } from './Statements'
import { PricePanel } from './PricePanel'
import { dimensionNames } from '../models/options'
import { purposes, zones, type UsageOptions } from './types'

type Summary = Schema<'UsageSummary'>
type Record = Schema<'RecordView'>
type Detail = Schema<'RecordDetail'>
type FilterValues = { start_at: string; end_at: string; timezone: string; through_now: boolean; key_id?: string; environment?: string; model_id?: string; agent_id?: string; actor_id?: string; purpose?: string; subject_type?: string; subject_id?: string; target_currency?: string }
function parameters(values: FilterValues) {
  const { through_now, ...filters } = values
  return Object.fromEntries(Object.entries({ ...filters, start_at: new Date(values.start_at).toISOString(), end_at: through_now ? new Date().toISOString() : new Date(values.end_at).toISOString() }).filter(([, value]) => value)) as { [key: string]: string }
}
function number(value?: number | null) { return value == null ? '用量缺失' : value.toLocaleString('zh-CN') }

export function UsagePage() {
  const { session } = useSession()
  const { message } = App.useApp()
  const [form] = Form.useForm<FilterValues>()
  const throughNow = Form.useWatch('through_now', form) ?? true
  const [appliedThroughNow, setAppliedThroughNow] = useState(true)
  const [initial] = useState<FilterValues>(() => ({ start_at: dayjs().subtract(7, 'day').format('YYYY-MM-DDTHH:mm:ss'), end_at: dayjs().format('YYYY-MM-DDTHH:mm:ss'), timezone: 'Asia/Shanghai', through_now: true }))
  const [filters, setFilters] = useState(() => parameters(initial))
  const [offset, setOffset] = useState(0)
  const suffix = new URLSearchParams(filters).toString()
  const summary = useQuery<Summary>(`/admin/v1/usage/summary?${suffix}`)
  const records = useQuery<Schema<'RecordPage'>>(`/admin/v1/usage/records?${suffix}&offset=${offset}&limit=20`)
  const options = useQuery<UsageOptions>('/admin/v1/usage/options')
  const [selected, setSelected] = useState<string>()
  const [showExports, setShowExports] = useState(false)
  const [error, setError] = useState<unknown>()
  const [exporting, setExporting] = useState(false)
  const can = (action: string) => session.actions.some(a => a.action_key === action)
  function refresh() {
    if (appliedThroughNow) {
      const now = new Date().toISOString()
      setFilters(current => ({ ...current, end_at: now }))
      if (form.getFieldValue('through_now')) form.setFieldValue('end_at', now)
      setOffset(0)
    } else { summary.reload(); records.reload() }
  }
  async function exportUsage() {
    if (exporting) return
    setExporting(true); setError(undefined)
    try { await send('/admin/v1/usage/exports', 'POST', filters); setShowExports(true); void message.success('已提交导出') }
    catch (failure) { setError(failure) } finally { setExporting(false) }
  }
  const data = summary.data
  const noCalls = data?.attempts === 0
  const unavailable = summary.error ? '加载失败' : '加载中'
  const overview = <Space orientation="vertical" style={{ width: '100%' }} size="middle">
    <Row gutter={[16, 16]}>{[
      { label: '受理请求数', value: data?.requests, tip: '已受理的运行请求数；模型调用前失败的请求也计入。' },
      { label: '模型调用次数', value: data?.attempts, tip: '用量账本中已登记发送的模型尝试数，含重试；工具调用不计入。' },
      { label: '模型调用成功率', value: data?.success_rate == null ? null : `${(Number(data.success_rate) * 100).toFixed(2)}%`, empty: noCalls ? '暂无模型调用' : '结果待核实', tip: '模型调用成功次数 ÷ 已有成功或失败结果的模型调用次数。' },
      { label: '输入 Token', value: data?.input_tokens, empty: noCalls ? '暂无模型调用' : '用量缺失' },
      { label: '输出 Token', value: data?.output_tokens, empty: noCalls ? '暂无模型调用' : '用量缺失' },
      { label: '未定价数量', value: data?.unpriced },
    ].map(({ label, value, empty, tip }) => <Col xs={12} lg={8} xxl={4} key={label}><Card size="small" style={{ height: '100%' }} loading={!data && !summary.error}>{value == null ? <><Typography.Text type="secondary"><Tooltip title={tip}>{label}</Tooltip></Typography.Text><p>{data ? empty : unavailable}</p></> : <Statistic title={<Tooltip title={tip}>{label}</Tooltip>} value={value} />}</Card></Col>)}</Row>
    <Table rowKey="currency" dataSource={data?.costs} loading={!data && !summary.error} locale={{ emptyText: !data ? unavailable : noCalls ? '暂无模型调用' : '暂无可计价费用' }} pagination={false} columns={[
      { title: '币种', dataIndex: 'currency' }, { title: '已计价费用', render: (_, r) => formatAmount(r.priced, r.currency) }, { title: '暂估费用', render: (_, r) => formatAmount(r.provisional, r.currency) },
      { title: '折算金额', render: (_, r) => r.conversion ? <Space orientation="vertical"><span>{formatAmount(r.conversion.amount as string | null, r.conversion.currency as string)}</span><Typography.Text type="secondary">{r.currency === r.conversion.currency ? '同币种，无需折算' : r.conversion.source == null ? '汇率未配置' : `${String(r.conversion.source)} · ${formatTimestamp(r.conversion.date as string)} · 汇率 ${String(r.conversion.rate)}`}</Typography.Text></Space> : '未折算' },
    ]} />
    {data && <Space wrap>{!noCalls && <><StatusTag label={data.price_complete ? '价格完整' : '部分费用未确认'} /><Typography.Text>用量缺失：{number(data.missing_usage)} 次</Typography.Text></>}<Typography.Text type="secondary">更新于 {formatTimestamp(data.aggregate_updated_at, filters.timezone)}</Typography.Text></Space>}
  </Space>
  const trend = <Table rowKey="date" dataSource={data?.trend as { date: string; attempts: number; input_tokens: number | null; output_tokens: number | null; costs: { [currency: string]: { priced: string; provisional: string } } }[] | undefined} columns={[
    { title: '日期', render: (_, r) => dayjs(r.date).format('YYYY年M月D日') }, { title: '模型调用次数', dataIndex: 'attempts' }, { title: '输入 Token', render: (_, r) => number(r.input_tokens) }, { title: '输出 Token', render: (_, r) => number(r.output_tokens) },
    { title: '已计价 / 暂估费用', render: (_, r) => Object.keys(r.costs).length ? Object.entries(r.costs).map(([currency, cost]) => <div key={currency}>{formatAmount(cost.priced, currency)} / {formatAmount(cost.provisional, currency)}</div>) : '费用未确认' },
  ]} />
  return <PageContainer title="用量" actions={<Space><Button onClick={refresh}>刷新</Button>{can('data:export') && <><Button loading={exporting} onClick={() => void exportUsage()}>导出明细</Button><Button onClick={() => setShowExports(true)}>导出任务</Button></>}</Space>}>
    <Form form={form} layout="inline" initialValues={initial} onFinish={(values: FilterValues) => { const next = parameters(values); setFilters(next); setAppliedThroughNow(values.through_now); if (values.through_now) form.setFieldValue('end_at', next.end_at); setOffset(0); if (new URLSearchParams(next).toString() === suffix) { summary.reload(); records.reload() } }} style={{ marginBottom: 24 }}>
      <Form.Item name="start_at" label="开始时间" rules={[{ required: true }]}><DateTimeInput /></Form.Item>
      <Form.Item name="end_at" label="结束时间" rules={[{ required: true }]}><DateTimeInput disabled={throughNow} /></Form.Item>
      <Form.Item name="through_now" valuePropName="checked"><Checkbox>截至当前</Checkbox></Form.Item>
      <Form.Item name="timezone" label="统计时区"><Select style={{ width: 140 }} options={zones} /></Form.Item>
      {([
        ['key_id', '接入凭据', options.data?.keys], ['environment', '环境', environments], ['model_id', '模型', options.data?.models], ['agent_id', '智能体', options.data?.agents], ['actor_id', '操作人', options.data?.actors], ['purpose', '用途', purposes],
      ] as const).map(([name, label, choices]) => <Form.Item key={name} name={name} label={label}><Select style={{ width: 150 }} allowClear showSearch optionFilterProp="label" options={choices} /></Form.Item>)}
      <Form.Item name="subject_type" label="主体类型"><Input style={{ width: 100 }} /></Form.Item><Form.Item name="subject_id" label="主体编号"><Input style={{ width: 130 }} /></Form.Item>
      <Form.Item name="target_currency" label="折算币种"><Select allowClear style={{ width: 130 }} options={[{ value: 'USD', label: '美元（USD）' }, { value: 'CNY', label: '人民币（CNY）' }]} /></Form.Item>
      <Form.Item><Button type="primary" htmlType="submit">查询</Button></Form.Item>
    </Form>
    <ErrorNotice error={error ?? summary.error ?? records.error ?? options.error} />
    <Tabs destroyOnHidden items={[
      { key: 'overview', label: '总览', children: overview },
      { key: 'trend', label: '趋势', children: trend },
      { key: 'records', label: '调用明细', children: <Table<Record> rowKey="id" dataSource={records.data?.items} loading={!records.data && !records.error} scroll={{ x: 1100 }} pagination={{ current: offset / 20 + 1, pageSize: 20, total: records.data?.total, showSizeChanger: false, onChange: page => setOffset((page - 1) * 20) }} columns={[
        { title: '时间', render: (_, r) => formatTimestamp(r.created_at, filters.timezone) }, { title: '模型', render: (_, r) => r.names.model ?? '名称不可用' }, { title: '智能体', render: (_, r) => r.names.agent ?? '名称不可用' }, { title: '用途', dataIndex: 'purpose_label' },
        { title: '输入 Token', render: (_, r) => number(r.input_tokens) }, { title: '输出 Token', render: (_, r) => number(r.output_tokens) }, { title: '用量', dataIndex: 'usage_label', render: (label: string) => <StatusTag label={label} /> }, { title: '费用', render: (_, r) => <Space orientation="vertical"><span>{formatAmount(r.amount, r.currency)}</span><StatusTag label={r.pricing_label} /></Space> },
        { title: '结算', dataIndex: 'state_label', render: (label: string) => <StatusTag label={label} /> }, { title: '结果', dataIndex: 'outcome_label', render: (label: string) => <StatusTag label={label} /> }, { title: '操作', render: (_, r) => <Button onClick={() => setSelected(r.id)}>核查</Button> },
      ]} /> },
      ...(can('budget:manage') ? [{ key: 'budgets', label: '预算', children: <BudgetPanel options={options.data} /> }] : []),
      { key: 'prices', label: '价格', children: <PricePanel options={options.data} /> },
      { key: 'statements', label: '供应商账单', children: <Statements /> },
    ]} />
    {selected && <RecordDrawer id={selected} timezone={filters.timezone} onClose={() => setSelected(undefined)} onRepriced={() => { summary.reload(); records.reload() }} />}
    {showExports && <ExportDrawer onClose={() => setShowExports(false)} />}
  </PageContainer>
}

function RecordDrawer({ id, timezone, onClose, onRepriced }: { id: string; timezone: string; onClose: () => void; onRepriced: () => void }) {
  const { session } = useSession()
  const detail = useQuery<Detail>(`/admin/v1/usage/records/${id}`)
  const prices = useQuery<Schema<'PriceVersionView'>[]>('/admin/v1/usage/prices')
  const [price, setPrice] = useState<string>()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const record = detail.data
  async function reprice() {
    if (!price || !record || busy) return
    setBusy(true); setError(undefined)
    try { await send(`/admin/v1/usage/records/${id}/reprice`, 'POST', { price_version_id: price, revision: record.revision }); setPrice(undefined); detail.reload(); onRepriced() }
    catch (failure) { setError(failure) } finally { setBusy(false) }
  }
  return <Drawer open title="用量核查" width={850} onClose={onClose}>
    <ErrorNotice error={error ?? detail.error} />
    {record && <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Descriptions column={2} items={[
        { key: 'model', label: '模型', children: record.names.model ?? '名称不可用' }, { key: 'purpose', label: '用途', children: record.purpose_label }, { key: 'usage', label: '用量状态', children: record.usage_label }, { key: 'price', label: '费用', children: `${formatAmount(record.amount, record.currency)}（${record.pricing_label}）` },
        { key: 'cached', label: '缓存 Token', children: number(record.cached_tokens) }, { key: 'reasoning', label: '推理 Token', children: number(record.reasoning_tokens) }, { key: 'source', label: '供应商请求标识', children: String(record.source.source_request_id ?? '未提供') },
      ]} />
      <Table rowKey="id" size="small" dataSource={record.adjustments} columns={[{ title: '核算版本', render: (_, r) => `第 ${Number(r.previous_revision) + 1} 次修订` }, { title: '原因', dataIndex: 'reason' }, { title: '金额变化', render: (_, r) => formatAmount(r.amount_delta as string | null, r.currency as string | null) }, { title: '时间', render: (_, r) => formatTimestamp(r.created_at as string, timezone) }]} />
      <Typography.Text>计价来源：{String(record.calculation.source ?? record.calculation.reason ?? '尚未确认')}</Typography.Text>
      <Table rowKey="dimension" size="small" dataSource={record.calculation.formula as { dimension: string; quantity: number; billable_units: number; amount: string }[] | undefined} columns={[{ title: '计量维度', render: (_, r) => dimensionNames[r.dimension] ?? '扩展用量' }, { title: '供应商 Token', dataIndex: 'quantity' }, { title: '扣除子集后计费 Token', dataIndex: 'billable_units' }, { title: '核算金额', render: (_, r) => formatAmount(r.amount, record.currency) }]} />
      {session.actions.some(a => a.action_key === 'model:manage') && <Space><Select placeholder="重算价格版本" style={{ width: 240 }} value={price} options={prices.data?.filter(p => p.model_id === record.source.model_id).map(p => ({ value: p.id, label: p.name }))} onChange={setPrice} /><Button disabled={!price} loading={busy} onClick={() => void reprice()}>生成重算版本</Button></Space>}
    </Space>}
  </Drawer>
}

export function ExportDrawer({ onClose, platform = false }: { onClose: () => void; platform?: boolean }) {
  const base = platform ? '/admin/v1/platform/usage/exports' : '/admin/v1/usage/exports'
  const query = useQuery<Schema<'ExportView'>[]>(base)
  const [error, setError] = useState<unknown>()
  const pending = query.data?.some(j => j.state === 'QUEUED' || j.state === 'RUNNING')
  useEffect(() => { if (!pending) return; const timer = setInterval(query.reload, 5000); return () => clearInterval(timer) }, [pending, query.reload])
  async function download(id: string) {
    try { const result = await apiClient.download(`${base}/${id}/content`); const url = URL.createObjectURL(result.blob); const link = document.createElement('a'); link.href = url; link.download = result.name ?? '用量报表.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
    catch (failure) { setError(failure) }
  }
  return <Drawer open title="导出任务" width={760} onClose={onClose}><Space orientation="vertical" style={{ width: '100%' }}>
    <Button onClick={query.reload}>刷新</Button><ErrorNotice error={error ?? query.error} />
    <Table<Schema<'ExportView'>> rowKey="id" dataSource={query.data} columns={[{ title: '创建时间', render: (_, r) => formatTimestamp(r.created_at) }, { title: '状态', render: (_, r) => <><StatusTag label={r.state_label} />{r.error_message}</> }, { title: '有效期', render: (_, r) => formatTimestamp(r.expires_at) }, { title: '操作', render: (_, r) => r.download_path && <Button onClick={() => void download(r.id)}>下载</Button> }]} />
  </Space></Drawer>
}
