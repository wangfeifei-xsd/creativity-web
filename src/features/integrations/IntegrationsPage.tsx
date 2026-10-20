import { Tabs } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import { useSession } from '../../app/workspace/context'
import { PageContainer } from '../../components/PageContainer'
import { Automation } from './Automation'
import { ChannelCollection } from '../channels/ChannelCollection'
import { useQuery } from '../../api/useQuery'
import { ErrorState, LoadingState } from '../../components/States'
import type { Schema } from '../../components/Management'

function ChannelCredentials({ channelId }: { channelId: string }) {
  const query = useQuery<Schema<'ChannelPage'>>(`/admin/v1/channels/${channelId}/page`)
  if (query.error) return <ErrorState error={query.error} onRetry={query.reload} />
  if (!query.data) return <LoadingState />
  return <ChannelCollection page={query.data} kind="keys" onConfigured={query.reload} />
}

export function IntegrationsPage() {
  const { session } = useSession()
  const [parameters, setParameters] = useSearchParams()
  const canManage = session.actions.some(action => action.action_key === 'integration:manage')
  const canManageKeys = session.actions.some(action => action.action_key === 'key:manage')
  const items = [
    ...(canManageKeys && session.workspace ? [{ key: 'credentials', label: '渠道 Key 与密钥',
      children: <ChannelCredentials key={session.workspace.channel_id} channelId={session.workspace.channel_id} /> }] : []),
    ...(canManage ? [
      { key: 'automation', label: '运行与事件', children: <Automation /> },
    ] : []),
  ]
  const activeKey = items.find(item => item.key === parameters.get('tab'))?.key ?? items[0]?.key
  return <PageContainer title="业务接入" actions={session.workspace
    ? <Link to={`/channels/${session.workspace.channel_id}?tab=keys`}>渠道凭据管理</Link> : undefined}>
    <Tabs activeKey={activeKey} onChange={key => setParameters(previous => {
      const next = new URLSearchParams(previous)
      next.set('tab', key)
      return next
    })} items={items} />
  </PageContainer>
}
