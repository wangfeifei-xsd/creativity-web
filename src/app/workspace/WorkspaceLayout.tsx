import { Avatar, Breadcrumb, Button, Card, Col, Drawer, Dropdown, Grid, Layout, Menu, Row, Select, Tooltip, Typography, theme } from 'antd'
import { ArrowRightOutlined, DownOutlined, HomeOutlined, LogoutOutlined, MenuOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ErrorNotice } from '../../components/Management'
import { EmptyState } from '../../components/States'
import { PageContainer } from '../../components/PageContainer'
import { features } from '../../features/registry'
import { resolveNavigation } from '../../features/navigation'
import { BrandMark } from '../../features/auth/BrandMark'
import { useSession } from './context'
import { navigationIcon, navigationItems } from './navigation'
import type { CSSProperties, ReactNode } from 'react'
import './workspace.css'

export function WorkspaceHome() {
  const { session } = useSession()
  const { token } = theme.useToken()
  const entries = resolveNavigation(session.navigation, features)
  return <PageContainer title="工作台">
    {entries.length > 0 ? <nav aria-label="工作台入口" className="workspace-shortcuts" style={{
      '--shortcut-accent': token.colorPrimary,
      '--shortcut-icon-bg': token.colorPrimaryBg,
      '--shortcut-text': token.colorText,
      '--shortcut-muted': token.colorTextQuaternary,
      '--shortcut-radius': `${token.borderRadiusLG}px`,
    } as CSSProperties}>
      <Row gutter={[16, 16]}>
        {entries.map(item => <Col key={item.navigationKey} xs={12} md={8} xl={6}>
          <Link className="workspace-shortcut" to={item.path}>
            <Card hoverable className="workspace-shortcut-card" styles={{ body: { padding: 0, height: '100%' } }}>
              <div className="workspace-shortcut-content">
                <span className="workspace-shortcut-icon">{navigationIcon(item.navigationKey)}</span>
                <Typography.Text className="workspace-shortcut-label">{item.label}</Typography.Text>
                <ArrowRightOutlined className="workspace-shortcut-arrow" aria-hidden />
              </div>
            </Card>
          </Link>
        </Col>)}
      </Row>
    </nav> : <EmptyState message={session.workspace
      ? '暂无可用菜单，请联系管理员' : '尚未分配可用渠道，请联系平台管理员'} />}
  </PageContainer>
}
export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { session, switchWorkspace, logout } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const [error, setError] = useState<unknown>()
  const screens = Grid.useBreakpoint()
  const location = useLocation()
  const navigate = useNavigate()
  const entries = resolveNavigation(session.navigation, features)
  const options = [...new Map([
    ...(session.workspace_options ?? []), ...(session.workspace ? [session.workspace] : []),
  ].map(option => [JSON.stringify([option.channel_id, option.environment, option.data_scope_id]), option])).values()]
  const channels = [...new Map(options.map(option => [option.channel_id, { value: option.channel_id, label: option.channel_name }])).values()]
  const ranges = options.filter(option => option.channel_id === session.workspace?.channel_id)
  const environments = [...new Map(ranges.map(option => [option.environment, { value: option.environment, label: option.environment_name }])).values()]
  const domains = ranges.filter(option => option.environment === session.workspace?.environment)
  function selectMode(mode: string) {
    if (mode === 'platform') { void switchWorkspace(null).catch(setError); return }
    const target = options[0]
    if (target) void switchWorkspace(target).catch(setError)
  }
  function selectChannel(channelId: string) {
    const available = options.filter(option => option.channel_id === channelId)
    const target = available.find(option => option.environment === session.workspace?.environment) ?? available[0]
    if (target) void switchWorkspace(target).catch(setError)
  }
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
          <Select aria-label="管理模式" className="workspace-mode-select" variant="borderless"
            value={session.workspace || !session.can_access_platform ? 'channel' : 'platform'}
            options={[
              ...(session.can_access_platform ? [{ value: 'platform', label: '平台管理' }] : []),
              { value: 'channel', label: '渠道管理', disabled: channels.length === 0 },
            ]} optionRender={option => option.value === 'channel' && channels.length === 0
              ? <Tooltip title="暂无可用渠道，请先配置环境及成员授权">
                <span style={{ display: 'block' }}>{option.label}</span>
              </Tooltip> : option.label}
            disabled={!session.can_access_platform} onChange={selectMode} />
          {session.workspace && <>
            <Select aria-label="切换渠道" className="workspace-channel-select" variant="borderless"
              showSearch optionFilterProp="label" value={session.workspace.channel_id} options={channels}
              disabled={channels.length < 2} onChange={selectChannel} />
            <Select aria-label="切换环境" variant="borderless" className="workspace-environment-select"
              value={session.workspace.environment} options={environments} disabled={environments.length < 2}
              onChange={environment => {
                const target = ranges.find(option => option.environment === environment)
                if (target) void switchWorkspace(target).catch(setError)
              }} />
            {domains.length > 1 ? <Select aria-label="切换数据域" variant="borderless" className="workspace-domain-select"
              showSearch optionFilterProp="label" value={session.workspace.data_scope_id}
              options={domains.map(option => ({ value: option.data_scope_id, label: option.data_scope_name }))}
              onChange={id => {
                const target = domains.find(option => option.data_scope_id === id)
                if (target) void switchWorkspace(target).catch(setError)
              }} /> : <span className="workspace-scope" title={session.workspace.data_scope_name}>{session.workspace.data_scope_name}</span>}
          </>}
        </div>
        <div className="workspace-tools">
          <Tooltip title="刷新当前页面"><Button type="text" aria-label="刷新当前页面" icon={<ReloadOutlined aria-hidden />}
            onClick={() => window.location.reload()} /></Tooltip>
          <Dropdown placement="bottomRight" trigger={['click']} autoFocus menu={{ items: [
            { key: 'logout', label: '退出登录', icon: <LogoutOutlined aria-hidden />, danger: true },
          ], onClick: ({ key }) => {
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
  </Layout>
}
