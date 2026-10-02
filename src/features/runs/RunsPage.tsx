import { Button, Form, Input, Select, Space, Table } from 'antd'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '../../api/useQuery'
import { formatTimestamp } from '../../api/presentation'
import { PageContainer } from '../../components/PageContainer'
import { RunViewer } from '../../components/run-viewer/RunViewer'
import { ErrorState, LoadingState } from '../../components/States'
import type { Schema } from '../../components/Management'

export function RunsPage() {
  const runId = useParams()['*']
  return runId ? <PageContainer title="运行详情" actions={<Link to="/runs">返回执行中心</Link>}><RunViewer key={runId} runId={runId} /></PageContainer> : <RunList />
}
function RunList() {
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [cursors, setCursors] = useState<string[]>([])
  const params = new URLSearchParams({ ...filters, limit: '30', ...(cursors.length ? { cursor: cursors.at(-1)! } : {}) })
  const query = useQuery<{ items: Schema<'RunSummary'>[]; next_cursor: string | null }>(`/admin/v1/runs?${params}`)
  const options = useQuery<Record<'agents' | 'keys' | 'errors', { value: string; label: string }[]>>('/admin/v1/runs/options')
  return <PageContainer title="执行中心" actions={<Button onClick={query.reload}>刷新</Button>}>
    <Form layout="inline" style={{ marginBottom: 20, rowGap: 12 }} onFinish={(values: Record<string, string>) => {
      setFilters(Object.fromEntries(Object.entries(values).filter(([, v]) => v).map(([k, v]) => [k, k.endsWith('_at') ? new Date(v).toISOString() : v])))
      setCursors([])
    }}>
      <Form.Item label="状态" name="state"><Select allowClear style={{ width: 130 }} options={Object.entries({ QUEUED: '排队中', RUNNING: '执行中', CANCEL_REQUESTED: '取消中', SUCCEEDED: '已完成', FAILED: '失败', CANCELLED: '已取消', TIMED_OUT: '已超时' }).map(([value, label]) => ({ value, label }))} /></Form.Item>
      <Form.Item label="用途" name="purpose"><Select allowClear style={{ width: 120 }} options={[{ value: 'production', label: '正式调用' }, { value: 'debug', label: '调试' }, { value: 'evaluation', label: '评测' }]} /></Form.Item>
      <Form.Item label="智能体" name="agent_id"><Select allowClear showSearch optionFilterProp="label" style={{ width: 180 }} options={options.data?.agents} /></Form.Item>
      <Form.Item label="调用密钥" name="key_id"><Select allowClear showSearch optionFilterProp="label" style={{ width: 160 }} options={options.data?.keys} /></Form.Item>
      <Form.Item label="错误类别" name="error_code"><Select allowClear style={{ width: 200 }} options={options.data?.errors} /></Form.Item>
      <Form.Item label="主体类型" name="subject_type"><Input style={{ width: 120 }} /></Form.Item>
      <Form.Item label="主体编号" name="subject_id"><Input style={{ width: 160 }} /></Form.Item>
      <Form.Item label="开始时间" name="start_at"><Input type="datetime-local" /></Form.Item>
      <Form.Item label="结束时间" name="end_at"><Input type="datetime-local" /></Form.Item>
      <Form.Item><Button htmlType="submit">筛选</Button></Form.Item>
    </Form>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <>
      <Table rowKey="run_id" pagination={false} dataSource={query.data.items} scroll={{ x: 700 }} columns={[
        { title: '任务', render: (_, row) => <Link to={`/runs/${row.run_id}`}>{row.name}</Link> },
        { title: '状态', dataIndex: 'state_label' },
        { title: '发起时间', render: (_, row) => formatTimestamp(row.created_at) },
        { title: '失败原因', render: (_, row) => row.error?.message ?? '—' },
      ]} /><Space style={{ marginTop: 16 }}><Button disabled={!cursors.length} onClick={() => setCursors(v => v.slice(0, -1))}>上一页</Button>
        <Button disabled={!query.data.next_cursor} onClick={() => setCursors(v => [...v, query.data!.next_cursor!])}>下一页</Button></Space>
    </>}
  </PageContainer>
}
