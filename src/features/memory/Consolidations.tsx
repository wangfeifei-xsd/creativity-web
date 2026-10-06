import { Button, Drawer, Space } from 'antd'
import { Table } from '../../components/Table'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { send } from '../../api/management'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'
import { ErrorState, LoadingState } from '../../components/States'

export function Consolidations({ anchorId, onClose }: { anchorId?: string; onClose: () => void }) {
  const query = useQuery<Schema<'ConsolidationView'>[]>(`/admin/v1/memory-consolidations${anchorId ? `?anchor_id=${encodeURIComponent(anchorId)}` : ''}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  return <Drawer open title="后台记忆整理" onClose={onClose} size="large" extra={<Button onClick={query.reload}>刷新</Button>}>
    <ErrorNotice error={error} />
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Table rowKey="id" dataSource={query.data} scroll={{ x: 740 }} columns={[
      { title: '来源会话', dataIndex: 'conversation_name' }, { title: '状态', dataIndex: 'state_label' },
      { title: '生成记忆', render: (_, row) => `${row.generated_count} 条` },
      { title: '更新时间', render: (_, row) => formatTimestamp(row.updated_at) },
      { title: '操作', render: (_, row) => <Space>{row.generation_run_id && <Link to={`/runs/${row.generation_run_id}`}>查看运行</Link>}{row.can_retry && <Button disabled={busy} onClick={async () => {
        setBusy(true); setError(undefined)
        try { await send(`/admin/v1/memory-consolidations/${row.id}/retry`, 'POST', { revision: row.revision }); query.reload() }
        catch (failure) { setError(failure) } finally { setBusy(false) }
      }}>重试</Button>}</Space> },
    ]} />}
  </Drawer>
}
