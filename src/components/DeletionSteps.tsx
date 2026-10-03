import { Alert, Button, Progress, Space, Table } from 'antd'
import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { send } from '../api/management'
import { useQuery } from '../api/useQuery'
import { ErrorNotice, type Schema } from './Management'
import { ErrorState, LoadingState } from './States'

export function DeletionSteps({ deletionId }: { deletionId: string }) {
  const query = useQuery<Schema<'LifecycleProgress'>>(`/admin/v1/deletions/${deletionId}/progress`, true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const reload = query.reload
  const status = query.data?.status
  useEffect(() => {
    if (status === 'COMPLETED') return
    const timer = window.setInterval(reload, 3000)
    return () => window.clearInterval(timer)
  }, [status, reload])
  if (query.error instanceof ApiError && query.error.status === 404) return <Alert type="info" title="正在登记清理步骤" />
  if (query.error) return <ErrorState error={query.error} onRetry={reload} />
  if (!query.data) return <LoadingState />
  const value = query.data
  return <Space orientation="vertical" style={{ width: '100%' }}>
    <ErrorNotice error={error} />
    <Progress percent={value.status === 'COMPLETED' ? 100 : value.total ? Math.round(value.completed * 100 / value.total) : 0} status={value.status === 'FAILED' ? 'exception' : value.status === 'COMPLETED' ? 'success' : 'active'} />
    <Table rowKey="label" pagination={false} dataSource={value.steps} columns={[
      { title: '清理内容', dataIndex: 'label' },
      { title: '完成数量', render: (_, row) => `${row.completed} / ${row.total} 项` },
      { title: '待重试', render: (_, row) => `${row.failed} 项` },
    ]} />
    {value.status === 'FAILED' && <Button loading={busy} onClick={async () => {
      setBusy(true); setError(undefined)
      try { await send(`/admin/v1/deletions/${deletionId}/retry`, 'POST'); reload() }
      catch (failure) { setError(failure) }
      finally { setBusy(false) }
    }}>重试清理</Button>}
    {value.status === 'COMPLETED' && <Alert type="success" title="关联内容已清理完成" />}
  </Space>
}
