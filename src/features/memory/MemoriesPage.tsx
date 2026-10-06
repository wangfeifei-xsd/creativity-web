import { App, Button, Descriptions, Select, Space, Switch, Typography } from 'antd'
import { Table } from '../../components/Table'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ActionButtons, ErrorNotice, type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'
import { MemoryEditor } from './Editor'
import { MemoryPolicy } from './Policy'
import { Consolidations } from './Consolidations'

type Memory = Schema<'MemoryView'>
const states = [{ value: 'PROPOSED', label: '待确认' }, { value: 'ACTIVE', label: '生效中' }, { value: 'SUPERSEDED', label: '已替代' }, { value: 'EXPIRED', label: '已过期' }, { value: 'REVOKED', label: '已撤销' }]

export function MemoriesPage() {
  const tail = useParams()['*']
  if (tail?.startsWith('deletions/')) return <MemoryDeletion deletionId={tail.slice(10)} />
  if (tail?.startsWith('subjects/')) return <MemoryList key={tail} anchorId={tail.slice(9)} />
  return tail ? <MemoryDetail key={tail} memoryId={tail} /> : <MemoryList />
}

function MemoryTable({ items }: { items: Memory[] }) {
  return <Table rowKey="memory_id" pagination={false} dataSource={items} scroll={{ x: 840 }} columns={[
    { title: '属性', render: (_, row) => <Link to={`/memories/${row.memory_id}`}>{row.display_name}</Link> },
    { title: '记忆值', dataIndex: 'value_label' },
    { title: '主体', render: (_, row) => <Link to={`/memories/subjects/${row.memory_id}`}>{row.subject_name ?? '主体名称不可用'}</Link> },
    { title: '层级', dataIndex: 'layer_label' }, { title: '类型', dataIndex: 'type_label' }, { title: '状态', dataIndex: 'status_label' },
    { title: '有效截止时间', render: (_, row) => formatTimestamp(row.expires_at) },
    { title: '使用次数', render: (_, row) => `${row.usage_count} 次` },
  ]} />
}

function Preferences({ anchorId }: { anchorId: string }) {
  const query = useQuery<Schema<'PreferenceView'>>(`/admin/v1/memory-preferences?anchor_id=${encodeURIComponent(anchorId)}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const navigate = useNavigate()
  const { modal } = App.useApp()
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!query.data) return <LoadingState />
  const value = query.data
  return <Space orientation="vertical" style={{ width: '100%' }}>
    <ErrorNotice error={error} />
    <Space wrap><Typography.Text>长期记忆</Typography.Text><Switch aria-label="长期记忆" checked={value.enabled} loading={busy}
      disabled={!value.actions.some(a => a.action_key === 'preferences')} onChange={async enabled => {
        setBusy(true); setError(undefined)
        try { await send(`/admin/v1/memory-preferences?anchor_id=${encodeURIComponent(anchorId)}`, 'PUT', { enabled, revision: value.revision }); query.reload() }
        catch (failure) { setError(failure) } finally { setBusy(false) }
      }} />
      <ActionButtons actions={value.actions} handlers={{ clear: () => {
        modal.confirm({ title: '清空该主体的记忆', content: '全部记忆立即停止使用，并提交内容清理任务。', okText: '清空', cancelText: '取消', okButtonProps: { danger: true }, onOk: async () => {
          try { const result = await send<Schema<'MemoryDeletion'>>(`/admin/v1/memories/clear?anchor_id=${encodeURIComponent(anchorId)}`, 'POST'); navigate(`/memories/deletions/${result.deletion_id}`) }
          catch (failure) { setError(failure); throw failure }
        } })
      } }} disabled={busy} />
    </Space>
    <Typography.Text type="secondary">关闭后暂停归档、画像生成及跨会话读取，已有记忆仍保留。清空会删除已保存的记忆。</Typography.Text>
  </Space>
}

function MemoryList({ anchorId }: { anchorId?: string }) {
  const [layer, setLayer] = useState('profile')
  const [jobs, setJobs] = useState(false)
  const [status, setStatus] = useState<string>()
  const [attribute, setAttribute] = useState<string>()
  const [cursors, setCursors] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [policy, setPolicy] = useState(false)
  const navigate = useNavigate()
  const params = new URLSearchParams({ limit: '20', layer, ...(anchorId ? { anchor_id: anchorId } : {}), ...(status ? { status } : {}), ...(attribute ? { key: attribute } : {}), ...(cursors.length ? { cursor: cursors.at(-1)! } : {}) })
  const query = useQuery<Schema<'MemoryList'>>(`/admin/v1/memories?${params}`)
  const subjects = useQuery<Schema<'MemorySubject'>[]>('/admin/v1/memory-subjects')
  return <PageContainer title={anchorId ? '主体记忆' : '记忆管理'} actions={<Space wrap>
    {anchorId && <Link to="/memories">返回记忆列表</Link>}<Button onClick={query.reload}>刷新</Button>
    <Link to="/conversations">会话记忆</Link><Button onClick={() => setJobs(true)}>后台整理</Button>
    <ActionButtons actions={query.data?.actions ?? []} handlers={{ create: () => setCreating(true), policy: () => setPolicy(true) }} />
  </Space>}>
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      {anchorId && <Preferences anchorId={anchorId} />}
      <Space wrap className="query-filters">
        {!anchorId && <Select aria-label="主体筛选" placeholder="查看主体记忆" style={{ width: 190 }} options={subjects.data?.map(s => ({ value: s.anchor_id, label: s.label }))} onChange={value => navigate(`/memories/subjects/${value}`)} />}
        <Select aria-label="记忆层级" value={layer} style={{ width: 140 }} options={[{ value: "profile", label: "人物画像" }, { value: "archive", label: "归档" }]} onChange={value => { setLayer(value); setCursors([]); setAttribute(undefined) }} />
        <Select allowClear aria-label="状态筛选" placeholder="全部状态" style={{ width: 140 }} options={states} onChange={value => { setCursors([]); setStatus(value) }} />
        <Select allowClear aria-label="属性筛选" placeholder="全部属性" style={{ width: 150 }} options={query.data?.attributes.map(a => ({ value: a.key, label: a.label }))} onChange={value => { setCursors([]); setAttribute(value) }} />
      </Space>
      {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <>
        <MemoryTable items={query.data.items} />
        <Space><Button disabled={!cursors.length} onClick={() => setCursors(v => v.slice(0, -1))}>上一页</Button><Button disabled={!query.data.next_cursor} onClick={() => setCursors(v => [...v, query.data!.next_cursor!])}>下一页</Button></Space>
      </>}
    </Space>
    {creating && <MemoryEditor attributes={query.data?.attributes ?? []} subjects={subjects.data ?? []} anchorId={anchorId}
      onClose={() => setCreating(false)} onSaved={value => navigate(`/memories/${value.memory_id}`)} />}
    {jobs && <Consolidations anchorId={anchorId} onClose={() => setJobs(false)} />}
    {policy && <MemoryPolicy onClose={() => setPolicy(false)} />}
  </PageContainer>
}

function MemoryDetail({ memoryId }: { memoryId: string }) {
  const query = useQuery<Schema<'MemoryDetail'>>(`/admin/v1/memories/${memoryId}`)
  const catalog = useQuery<Schema<'MemoryList'>>(`/admin/v1/memories?anchor_id=${encodeURIComponent(memoryId)}&limit=1`)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const navigate = useNavigate()
  const { modal } = App.useApp()
  const row = query.data?.memory
  return <PageContainer title={row?.display_name ?? '记忆详情'} actions={<Space wrap><Link to="/memories">返回记忆列表</Link><Link to={`/memories/subjects/${memoryId}`}>主体记忆</Link><Button onClick={query.reload}>刷新</Button>
    <ActionButtons actions={row?.actions ?? []} disabled={busy} handlers={{ edit: row?.memory_type === 'PREFERENCE' ? () => setEditing(true) : undefined,
      confirm: async () => { setBusy(true); setError(undefined); try { await send(`/admin/v1/memories/${memoryId}/confirm`, 'POST', { revision: row!.revision }); query.reload() } catch (failure) { setError(failure) } finally { setBusy(false) } },
      delete: () => modal.confirm({ title: '遗忘这条记忆', content: '该记忆立即停止使用，并提交内容清理任务。', okText: '遗忘', cancelText: '取消', okButtonProps: { danger: true }, onOk: async () => {
        try { const result = await send<Schema<'MemoryDeletion'>>(`/admin/v1/memories/${memoryId}`, 'DELETE'); navigate(`/memories/deletions/${result.deletion_id}`) }
        catch (failure) { setError(failure); throw failure }
      } }),
    }} />
  </Space>}>
    <ErrorNotice error={error} />
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data || !row ? <LoadingState /> : <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Descriptions bordered column={{ xs: 1, sm: 2 }} items={[
        { key: 'value', label: '记忆值', children: row.value_label }, { key: 'type', label: '类型', children: row.type_label },
        { key: 'status', label: '状态', children: row.status_label }, { key: 'confirmed', label: '确认情况', children: row.confirmed ? '已明确确认' : '待确认' },
        { key: 'expires', label: '有效截止时间', children: formatTimestamp(row.expires_at) }, { key: 'usage', label: '使用次数', children: `${row.usage_count} 次` },
        { key: 'version', label: '版本', children: `第 ${row.version} 版` }, { key: 'subject', label: '主体', children: row.subject_name ?? '主体名称不可用' },
      ]} />
      <Table aria-label="记忆来源" rowKey={(_, index) => String(index)} pagination={false} dataSource={row.sources} scroll={{ x: 540 }} columns={[
        { title: '来源', dataIndex: 'name' }, { title: '来源类型', dataIndex: 'source_type_label' }, { title: '观测时间', render: (_, source) => formatTimestamp(source.observed_at) },
      ]} />
      <Table aria-label="变更记录" rowKey="version" pagination={false} dataSource={query.data.versions} scroll={{ x: 540 }} columns={[
        { title: '版本', render: (_, version) => `第 ${version.version} 版` }, { title: '状态', dataIndex: 'status_label' }, { title: '变更原因', dataIndex: 'reason' }, { title: '变更时间', render: (_, version) => formatTimestamp(version.changed_at) },
      ]} />
    </Space>}
    {editing && row && <MemoryEditor memory={row} attributes={catalog.data?.attributes ?? []} subjects={[]} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); query.reload() }} />}
  </PageContainer>
}

function MemoryDeletion({ deletionId }: { deletionId: string }) {
  const query = useQuery<Schema<'MemoryDeletion'>>(`/admin/v1/memory-deletions/${deletionId}`, true)
  const reload = query.reload, status = query.data?.status
  useEffect(() => {
    if (!status || status === 'COMPLETED') return
    const timer = window.setInterval(reload, 5000)
    return () => window.clearInterval(timer)
  }, [status, reload])
  return <PageContainer title="记忆删除进度" actions={<Space><Link to="/memories">返回记忆列表</Link><Button onClick={query.reload}>刷新</Button></Space>}>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Descriptions column={1} items={[
      { key: 'status', label: '状态', children: query.data.status_label }, { key: 'count', label: '记忆数量', children: `${query.data.count} 条` },
      { key: 'requested', label: '提交时间', children: formatTimestamp(query.data.requested_at) }, { key: 'completed', label: '完成时间', children: query.data.completed_at ? formatTimestamp(query.data.completed_at) : '尚未完成' },
    ]} />}
    {query.data && query.data.count > 0 && <DeletionSteps deletionId={deletionId} />}
  </PageContainer>
}
import { DeletionSteps } from '../../components/DeletionSteps'
