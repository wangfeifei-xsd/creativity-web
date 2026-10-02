import { names } from '../../api/management'
import { Button, Input, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { type Schema } from '../../components/Management'
import { PageContainer } from '../../components/PageContainer'
import { ErrorState, LoadingState } from '../../components/States'

export function AuditPage({ channelId }: { channelId?: string }) {
  const query = useQuery<Schema<'AuditView'>[]>(channelId ? `/admin/v1/channels/${channelId}/audit-events?limit=200` : '/admin/v1/audit-events?limit=200')
  const [filter, setFilter] = useState('')
  return <PageContainer title="操作审计" actions={<Space><Input aria-label="筛选审计" placeholder="操作或人员名称" value={filter} onChange={e => setFilter(e.target.value)} allowClear />
    <Button onClick={query.reload}>刷新</Button></Space>}>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> : <Table rowKey="event_id" scroll={{ x: 960 }}
      dataSource={query.data.filter(row => `${row.actor_name ?? ''}${row.action_name}${row.target_name ?? ''}`.includes(filter))}
      columns={[{ title: '时间', render: (_, row) => formatTimestamp(row.time) },
        { title: '操作人', render: (_, row) => row.actor_name ?? '名称不可用' },
        { title: '操作', dataIndex: 'action_name' }, { title: '对象', render: (_, row) => row.target_name ?? '名称不可用' },
        { title: '结果', render: (_, row) => <Tag>{row.outcome_label}</Tag> },
        { title: '变更字段', render: (_, row) => names(row.changed_fields) }]} />}
  </PageContainer>
}
