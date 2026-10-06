import { DateTimeInput } from '../../components/DateTimeInput'
import { Button, Descriptions, Drawer, Form, Input, Select, Tag } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { type DirectoryPage } from '../../components/Directory'
import { ErrorNotice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'

type Audit = Schema<'AuditView'>
type Filters = { search?: string; request_id?: string; outcome?: string; start_at?: string; end_at?: string }
export function AuditPage({ channelId }: { channelId?: string }) {
  const [filters, setFilters] = useState<Filters>({})
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<Audit>()
  const params = new URLSearchParams({ limit: '20', offset: String((page - 1) * 20) })
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  const base: `/admin/v1/${string}` = channelId ? `/admin/v1/channels/${channelId}/audit-events/page` : '/admin/v1/audit-events/page'
  const query = useQuery<DirectoryPage<Audit>>(`${base}?${params}`)
  return <PageContainer title="操作审计" actions={<Button onClick={query.reload}>刷新</Button>}>
    <Form<Filters> layout="inline" style={{ marginBottom: 16 }} onFinish={values => {
      setPage(1); setFilters({ ...values, start_at: values.start_at ? new Date(values.start_at).toISOString() : undefined,
        end_at: values.end_at ? new Date(values.end_at).toISOString() : undefined })
    }}>
      <Form.Item name="search"><Input aria-label="筛选审计" placeholder="操作或人员名称" allowClear /></Form.Item>
      <Form.Item name="request_id"><Input aria-label="请求标识" placeholder="请求标识" allowClear /></Form.Item>
      <Form.Item name="outcome"><Select aria-label="操作结果" placeholder="全部结果" allowClear style={{ width: 120 }} options={[{ value: 'SUCCEEDED', label: '已完成' }, { value: 'DENIED', label: '已拒绝' }]} /></Form.Item>
      <Form.Item name="start_at" label="开始时间"><DateTimeInput /></Form.Item>
      <Form.Item name="end_at" label="结束时间"><DateTimeInput /></Form.Item>
      <Form.Item><Button type="primary" htmlType="submit">查询</Button></Form.Item>
    </Form>
    <ErrorNotice error={query.error} />
    <Table<Audit> rowKey="event_id" scroll={{ x: 1000 }} loading={!query.data && !query.error} dataSource={query.data?.items}
      pagination={{ current: page, pageSize: 20, total: query.data?.total, showSizeChanger: false, onChange: setPage, showTotal: total => `共 ${total} 条` }}
      columns={[{ title: '时间', render: (_, row) => formatTimestamp(row.time) },
        { title: '操作人', render: (_, row) => row.actor_name ?? '名称不可用' },
        { title: '操作', dataIndex: 'action_name' }, { title: '对象', render: (_, row) => row.target_name ?? '名称不可用' },
        { title: '结果', render: (_, row) => <Tag>{row.outcome_label}</Tag> },
        { title: '变更字段', render: (_, row) => row.changed_fields.join('、') || '未记录字段差异' },
        { title: '操作', render: (_, row) => <Button onClick={() => setDetail(row)}>详情</Button> },
      ]} />
    {detail && <Drawer open title="审计详情" onClose={() => setDetail(undefined)} size="large"><Descriptions column={1} bordered items={[
      { key: 'action', label: '操作', children: detail.action_name }, { key: 'target', label: '对象', children: detail.target_name ?? '名称不可用' },
      { key: 'actor', label: '操作人', children: detail.actor_name ?? '名称不可用' }, { key: 'time', label: '时间', children: formatTimestamp(detail.time) },
      { key: 'scope', label: '环境', children: detail.environment_name || '未提供' },
      { key: 'outcome', label: '结果', children: detail.outcome_label }, { key: 'request', label: '请求标识', children: detail.request_id },
      { key: 'fields', label: '变更字段', children: detail.changed_fields.join('、') || '本事件未记录字段差异' },
      ...Object.entries(detail.details ?? {}).map(([key, value]) => ({ key, label: key, children: value })),
    ]} /></Drawer>}
  </PageContainer>
}
