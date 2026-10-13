import { Tabs } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import { useSession } from '../../app/workspace/context'
import { PageContainer } from '../../components/PageContainer'
import { Automation } from './Automation'
import { DelegationKeys } from './DelegationKeys'
import { SubjectReviews } from './SubjectReviews'

export function IntegrationsPage() {
  const { session } = useSession()
  const [parameters, setParameters] = useSearchParams()
  const canManage = session.actions.some(action => action.action_key === 'integration:manage')
  const canManageKeys = session.actions.some(action => action.action_key === 'key:manage')
  const items = [
    ...(canManage ? [
      { key: 'automation', label: '运行与事件', children: <Automation /> },
      { key: 'review', label: '当前主体复核', children: <SubjectReviews /> },
    ] : []),
    ...(canManageKeys ? [{ key: 'delegation', label: '身份委托', children: <DelegationKeys /> }] : []),
  ]
  const activeKey = items.find(item => item.key === parameters.get('tab'))?.key ?? items[0]?.key
  return <PageContainer title="业务接入" actions={session.navigation.some(item => item.navigation_key === 'mcp-connections')
    ? <Link to="/mcp-connections">MCP 工具连接</Link> : undefined}>
    <Tabs activeKey={activeKey} onChange={key => setParameters(previous => {
      const next = new URLSearchParams(previous)
      next.set('tab', key)
      return next
    })} items={items} />
  </PageContainer>
}
