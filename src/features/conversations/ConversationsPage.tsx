import { DateTimeInput } from '../../components/DateTimeInput'
import { Button, Form, Input, Select, Space } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { environments, send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ActionButtons, EditorDialog, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { ConversationDetail, DeletionProgress } from './Detail'

export function ConversationsPage() {
  const tail = useParams()['*']
  if (tail?.startsWith('deletions/')) return <DeletionProgress deletionId={tail.slice('deletions/'.length)} />
  return tail ? <ConversationDetail key={tail} conversationId={tail} /> : <ConversationList />
}

function ConversationList() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [cursors, setCursors] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const params = new URLSearchParams({ ...filters, limit: '20', ...(cursors.length ? { cursor: cursors.at(-1)! } : {}) })
  const query = useQuery<Schema<'ConversationList'>>(`/admin/v1/conversations?${params}`)
  return <PageContainer title="会话管理" actions={<Space><Button onClick={() => { setCursors([]); query.reload() }}>刷新</Button>
    <ActionButtons actions={query.data?.actions ?? []} handlers={{ create: () => setCreating(true) }} /></Space>}>
    <Form layout="inline" style={{ marginBottom: 20 }} onFinish={(values: Record<string, string | { value: string; label: string } | undefined>) => {
      setCursors([])
      setFilters(Object.fromEntries(Object.entries(values).filter(([, v]) => v).map(([k, v]) =>
        [k, typeof v === 'object' ? v.value : k.endsWith('_at') ? new Date(v!).toISOString() : v!])))
    }}>
      <Form.Item name="environment" label="环境"><Select allowClear placeholder="全部" options={environments} style={{ minWidth: 110 }} /></Form.Item>
      <Form.Item name="status" label="状态"><Select allowClear placeholder="全部" style={{ minWidth: 120 }}
        options={[{ value: 'ACTIVE', label: '使用中' }, { value: 'ARCHIVED', label: '已归档' }]} /></Form.Item>
      <Form.Item name="agent_id" label="智能体"><Select labelInValue allowClear placeholder="全部" style={{ minWidth: 160 }}
        options={[...new Map(query.data?.items.map(row => [row.agent_id, { value: row.agent_id, label: row.agent_name }]) ?? []).values()]} /></Form.Item>
      <Form.Item name="subject" label="主体"><Input placeholder="主体名称" allowClear /></Form.Item>
      <Form.Item name="start_at" label="开始时间"><DateTimeInput /></Form.Item>
      <Form.Item name="end_at" label="结束时间"><DateTimeInput /></Form.Item>
      <Form.Item><Button htmlType="submit">筛选</Button></Form.Item>
    </Form>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <>
      <Table rowKey="conversation_id" pagination={false} dataSource={query.data.items} scroll={{ x: 880 }} columns={[
        { title: '标题', render: (_, row) => <Link to={`/conversations/${row.conversation_id}`}>{row.title}</Link> },
        { title: '智能体', dataIndex: 'agent_name' }, { title: '主体', render: (_, row) => row.subject_name ?? '名称不可用' },
        { title: '环境', dataIndex: 'environment_label' }, { title: '状态', dataIndex: 'status_label' },
        { title: '创建时间', render: (_, row) => formatTimestamp(row.created_at) },
        { title: '计划清理时间', render: (_, row) => formatTimestamp(row.expires_at) },
      ]} />
      <Space style={{ marginTop: 16 }}><Button disabled={!cursors.length} onClick={() => setCursors(v => v.slice(0, -1))}>上一页</Button>
        <Button disabled={!query.data.next_cursor} onClick={() => setCursors(v => [...v, query.data!.next_cursor!])}>下一页</Button></Space>
    </>}
    {creating && <EditorDialog title="新建会话" fields={[
      { name: 'agent_code', label: '智能体', kind: 'select', required: true, options: query.data?.agents.map(a => ({ value: a.agent_code, label: a.name })) },
      { name: 'title', label: '标题' },
    ]} onClose={() => setCreating(false)} onSaved={() => setCreating(false)} onSave={async values => {
      const result = await send<Schema<'ConversationView'>>('/admin/v1/conversations', 'POST', { agent_code: values.agent_code, title: values.title || '未命名会话' })
      navigate(`/conversations/${result.conversation_id}`)
    }} />}
  </PageContainer>
}
