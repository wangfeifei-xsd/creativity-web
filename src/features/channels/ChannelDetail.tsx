import { send } from '../../api/management'
import { Button, Descriptions, Space, Table, Tabs, Tag } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '../../api/client'
import { formatAmount, formatTimestamp } from '../../api/presentation'
import { useQuery } from '../../api/useQuery'
import { ActionButtons, EditorDialog, type Schema } from '../../components/Management'
import { ImpactDialog } from '../../components/ImpactDialog'
import { PageContainer } from '../../components/PageContainer'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { MembersPage } from '../members/MembersPage'
import { AuditPage } from '../audit/AuditPage'
import { ChannelCollection } from './ChannelCollection'

export function ChannelDetail({ channelId }: { channelId: string }) {
  const query = useQuery<Schema<'ChannelPage'>>(`/admin/v1/channels/${channelId}/page`)
  const [tab, setTab] = useState('overview')
  const [editing, setEditing] = useState(false)
  const [impact, setImpact] = useState<'suspend' | 'resume' | 'archive'>()
  const [generation, setGeneration] = useState(0)
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!query.data) return <LoadingState />
  const page = query.data
  const channel = page.channel
  const refresh = () => { setGeneration(n => n + 1); query.reload() }
  const titles = { suspend: '暂停渠道', resume: '恢复渠道', archive: '归档渠道' }
  return <PageContainer title={channel.name} actions={<Space wrap><Tag>{channel.status_label}</Tag><Link to="/channels">渠道列表</Link>
    <Button onClick={refresh}>刷新</Button><ActionButtons actions={page.actions} handlers={{ 'channel:edit': () => setEditing(true),
      'channel:suspend': () => setImpact('suspend'), 'channel:resume': () => setImpact('resume'), 'channel:archive': () => setImpact('archive') }} /></Space>}>
    <Tabs key={generation} activeKey={page.tabs.some(t => t.navigation_key === tab) ? tab : page.tabs[0]?.navigation_key} onChange={setTab} destroyOnHidden
      items={page.tabs.map(item => ({ key: item.navigation_key, label: item.label,
        children: item.navigation_key === 'overview' ? <Overview channelId={channelId} /> : item.navigation_key === 'members' ? <MembersPage channelId={channelId} /> :
          item.navigation_key === 'audit' ? <AuditPage channelId={channelId} /> : item.navigation_key === 'resources' ? <Overview channelId={channelId} resources /> :
            item.navigation_key === 'usage' ? <ChannelUsage channelId={channelId} /> :
              <ChannelCollection key={item.navigation_key} page={page} kind={item.navigation_key} />,
      }))} />
    {editing && <EditorDialog title="编辑渠道" initial={{ name: channel.name, owner: channel.owner, revision: channel.revision,
      retention_days: channel.retention_policy.retention_days }} fields={[{ name: 'name', label: '渠道名称', required: true },
      { name: 'owner', label: '负责人', required: true }, { name: 'retention_days', label: '数据保存天数（天）', kind: 'number', required: true }]}
      onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh() }}
      latestRevision={async () => (await apiClient.request<Schema<'ChannelView'>>(`/admin/v1/channels/${channelId}`)).revision}
      onSave={values => { const { retention_days, ...body } = values; return send(`/admin/v1/channels/${channelId}`, 'PATCH', { ...body, retention_policy: { retention_days } }) }} />}
    {impact && <ImpactDialog title={titles[impact]} previewPath={`/admin/v1/channels/${channelId}/impact?action=${impact}`}
      submitPath={`/admin/v1/channels/${channelId}/${impact}`} onClose={() => setImpact(undefined)} onSaved={() => { setImpact(undefined); refresh() }} />}
  </PageContainer>
}
function Overview({ channelId, resources }: { channelId: string; resources?: boolean }) {
  const query = useQuery<Schema<'OverviewView'>>(`/admin/v1/channels/${channelId}/overview`)
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!query.data) return <LoadingState />
  const data = query.data
  if (resources) return data.resource_references === null ? <EmptyState message="资源信息暂不可用" /> : <Table
    rowKey={row => `${row.resource_type}|${row.resource_id}`} dataSource={data.resource_references} columns={[
      { title: '资源', render: (_, row) => row.name ?? '名称不可用' }, { title: '数量', render: (_, row) => row.count === null ? '未提供' : `${row.count} 个` },
    ]} />
  return <Descriptions bordered column={{ xs: 1, sm: 2 }} items={[
    { key: 'owner', label: '负责人', children: data.channel.owner }, { key: 'business', label: '业务类型', children: data.channel.business_type_name },
    { key: 'created', label: '开通时间', children: formatTimestamp(data.channel.created_at) }, { key: 'retention', label: '数据保存', children: `${data.channel.retention_policy.retention_days} 天` },
    ...([['environments', '环境'], ['data_scopes', '数据域'], ['clients', '接入服务'], ['active_keys', '有效 Key']] as const).map(([key, label]) => ({ key, label, children: `${data[key]} 个` })),
  ]} />
}
function ChannelUsage({ channelId }: { channelId: string }) {
  const [range] = useState(() => ({ start: new Date(Date.now() - 7 * 86400000).toISOString(), end: new Date().toISOString() }))
  const query = useQuery<Schema<'UsageView'>>(`/admin/v1/channels/${channelId}/usage?start_at=${encodeURIComponent(range.start)}&end_at=${encodeURIComponent(range.end)}`)
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!query.data) return <LoadingState />
  const data = query.data
  return <Descriptions bordered column={1} items={[
    { key: 'range', label: '统计区间', children: `${formatTimestamp(data.start_at)} 至 ${formatTimestamp(data.end_at)}` },
    { key: 'calls', label: '调用次数', children: `${data.calls} 次` }, { key: 'input', label: '输入 Token', children: data.input_tokens == null ? '未确认' : `${data.input_tokens} 个` },
    { key: 'output', label: '输出 Token', children: data.output_tokens == null ? '未确认' : `${data.output_tokens} 个` },
    { key: 'provisional', label: '暂估费用', children: data.provisional_costs?.length ? data.provisional_costs.map(m => formatAmount(m.amount, m.currency)).join('、') : '费用未确认' },
    { key: 'updated', label: '聚合更新时间', children: formatTimestamp(data.aggregate_updated_at) },
    { key: 'costs', label: '已计价费用', children: data.costs.length ? data.costs.map(m => formatAmount(m.amount, m.currency)).join('、') : '费用未确认' },
  ]} />
}
