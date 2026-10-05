import { Avatar, Breadcrumb, Button, Drawer, Dropdown, Grid, Layout, Menu, Modal, Select, Space, Tag, Tooltip } from 'antd'
import { DownOutlined, HomeOutlined, LogoutOutlined, MenuOutlined, ReloadOutlined, SwapOutlined, UserOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '../../api/useQuery'
import { type Schema, ErrorNotice } from '../../components/Management'
import { LoadingState, ErrorState, EmptyState } from '../../components/States'
import { PageContainer } from '../../components/PageContainer'
import { features } from '../../features/registry'
import { resolveNavigation } from '../../features/navigation'
import { BrandMark } from '../../features/auth/BrandMark'
import { useSession } from './context'
import { navigationItems } from './navigation'
import type { ReactNode } from 'react'
import './workspace.css'

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
  const [menuOpen, setMenuOpen] = useState(false)
  const [error, setError] = useState<unknown>()
  const screens = Grid.useBreakpoint()
  const location = useLocation()
  const navigate = useNavigate()
  const entries = resolveNavigation(session.navigation, features)
  const current = entries.filter(entry => location.pathname === entry.path || location.pathname.startsWith(`${entry.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]
  const isDetail = current && location.pathname !== current.path && location.pathname !== `${current.path}/`
  const breadcrumbs = current ? [
    ...current.ancestors.map(parent => ({ title: parent.label })),
    { title: isDetail ? <Link to={current.path}>{current.label}</Link> : current.label },
    ...(isDetail ? [{ title: '详情' }] : []),
  ] : [{ title: location.pathname === '/' ? '工作台' : <Link to="/">工作台</Link> }]
  const selectPage = (path: string) => { navigate(path); setMenuOpen(false) }
  const brand = <Link className="workspace-brand" to="/" aria-label="Creativity 工作台" onClick={() => setMenuOpen(false)}>
    <span className="workspace-brand-icon"><BrandMark /></span><span>Creativity</span>
  </Link>
  const menu = <nav aria-label="主导航" className="workspace-navigation"><Menu theme="dark" mode="inline"
    className="workspace-menu" selectedKeys={current ? [current.path] : location.pathname === '/' ? ['/'] : []}
    onClick={({ key }) => selectPage(key)} items={[
      { key: '/', label: '工作台', icon: <HomeOutlined aria-hidden /> },
      ...navigationItems(entries),
    ]} /></nav>
  return <Layout className="workspace-layout">
    {screens.lg && <Layout.Sider width={232} className="workspace-sidebar" theme="dark">{brand}{menu}</Layout.Sider>}
    {!screens.lg && <Drawer classNames={{ section: 'workspace-drawer' }} title={brand} placement="left" size={256} open={menuOpen}
      onClose={() => setMenuOpen(false)} destroyOnHidden>{menu}</Drawer>}
    <Layout className="workspace-main">
      <Layout.Header className="workspace-header">
        <div className="workspace-location">
          {!screens.lg && <Button type="text" aria-label="打开导航菜单" icon={<MenuOutlined aria-hidden />} onClick={() => setMenuOpen(true)} />}
          <Breadcrumb aria-label="页面路径" items={breadcrumbs} />
        </div>
        <div className="workspace-context">
          <Tooltip title="切换工作区"><Button type="text" className="workspace-switch" aria-label="切换工作区"
            icon={<SwapOutlined aria-hidden />} onClick={() => setPicker(true)}>
            <span className="workspace-channel">{session.workspace?.channel_name ?? '平台工作区'}</span>
          </Button></Tooltip>
          {session.workspace && <><Tag>{session.workspace.environment_name}</Tag>
            <span className="workspace-scope" title={session.workspace.data_scope_name}>{session.workspace.data_scope_name}</span></>}
        </div>
        <div className="workspace-tools">
          <Tooltip title="刷新当前页面"><Button type="text" aria-label="刷新当前页面" icon={<ReloadOutlined aria-hidden />}
            onClick={() => window.location.reload()} /></Tooltip>
          <Dropdown placement="bottomRight" trigger={['click']} autoFocus menu={{ items: [
            ...(session.workspace ? [{ key: 'platform', label: '返回平台', icon: <SwapOutlined aria-hidden /> }] : []),
            { key: 'logout', label: '退出登录', icon: <LogoutOutlined aria-hidden />, danger: true },
          ], onClick: ({ key }) => {
            if (key === 'platform') void switchWorkspace(null).catch(setError)
            if (key === 'logout') void logout().catch(setError)
          } }}>
            <Button className="workspace-user" aria-label="用户菜单">
              <Avatar size={28} icon={<UserOutlined aria-hidden />} /><span className="workspace-user-name">{session.user.display_name}</span><DownOutlined aria-hidden />
            </Button>
          </Dropdown>
        </div>
      </Layout.Header>
      <Layout.Content className="app-content"><ErrorNotice error={error} />{children}</Layout.Content>
    </Layout>
    {picker && <WorkspacePicker onClose={() => setPicker(false)} />}
  </Layout>
}
