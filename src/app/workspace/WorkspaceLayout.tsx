import { Button, Layout, Menu, Modal, Select, Space, Tag, Typography } from 'antd'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '../../api/useQuery'
import { type Schema, ErrorNotice } from '../../components/Management'
import { LoadingState, ErrorState, EmptyState } from '../../components/States'
import { PageContainer } from '../../components/PageContainer'
import { features } from '../../features/registry'
import { resolveNavigation } from '../../features/navigation'
import { useSession } from './context'
import type { ReactNode } from 'react'

function WorkspacePicker({ onClose }: { onClose: () => void }) {
  const { switchWorkspace } = useSession()
  const query = useQuery<Schema<'WorkspaceOption'>[]>('/admin/v1/auth/channels')
  const [value, setValue] = useState<number>()
  return <Modal open title="选择工作区" onCancel={onClose} footer={<Button type="primary" disabled={value === undefined}
    onClick={() => { if (value !== undefined && query.data) void switchWorkspace(query.data[value]) }}>进入工作区</Button>}>
    {query.error ? <ErrorState error={query.error} onRetry={query.reload} /> : !query.data ? <LoadingState /> :
      query.data.length === 0 ? <EmptyState message="暂无可进入的渠道" /> : <Select style={{ width: '100%' }}
        aria-label="选择渠道、环境和数据域" showSearch optionFilterProp="label" value={value} onChange={setValue}
        options={query.data.map((o, index) => ({ value: index, label: `${o.channel_name} · ${o.environment_name} · ${o.data_scope_name}` }))} />}
  </Modal>
}
export function WorkspaceHome() {
  const { session } = useSession()
  return <PageContainer title="工作台"><Space wrap size="large">
    {resolveNavigation(session.navigation, features).map(item => <Link key={item.navigationKey} to={item.path}>{item.label}</Link>)}
    {session.navigation.length === 0 && <EmptyState message="请选择可进入的工作区" />}
  </Space></PageContainer>
}
export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { session, switchWorkspace, logout } = useSession()
  const [picker, setPicker] = useState(false)
  const [error, setError] = useState<unknown>()
  const location = useLocation()
  const navigate = useNavigate()
  const entries = resolveNavigation(session.navigation, features)
  return <Layout className="workspace-layout">
    <Layout.Header className="workspace-header"><Space wrap>
      <Typography.Text strong>{session.workspace?.channel_name ?? '平台工作区'}</Typography.Text>
      {session.workspace && <><Tag>{session.workspace.environment_name}</Tag><Typography.Text>{session.workspace.data_scope_name}</Typography.Text></>}
      <Button onClick={() => setPicker(true)}>切换工作区</Button>
      {session.workspace && <Button onClick={() => void switchWorkspace(null)}>返回平台</Button>}
    </Space><Space wrap><Typography.Text>{session.user.display_name}</Typography.Text>
      <Button onClick={() => void logout().catch(setError)}>退出登录</Button></Space></Layout.Header>
    <Menu mode="horizontal" selectedKeys={entries.filter(e => location.pathname === e.path || location.pathname.startsWith(`${e.path}/`)).map(e => e.path)}
      onClick={({ key }) => navigate(key)} items={entries.map(e => ({ key: e.path, label: e.label }))} />
    <Layout.Content className="app-content"><ErrorNotice error={error} />{children}</Layout.Content>
    {picker && <WorkspacePicker onClose={() => setPicker(false)} />}
  </Layout>
}
