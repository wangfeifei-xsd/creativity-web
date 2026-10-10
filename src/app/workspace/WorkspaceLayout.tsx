import { Avatar, Breadcrumb, Button, Card, Col, Drawer, Dropdown, Grid, Layout, Menu, Row, Select, Tooltip, Typography, theme } from 'antd'
import { ApartmentOutlined, AppstoreOutlined, ArrowRightOutlined, CloudServerOutlined, DownOutlined, HomeOutlined, LogoutOutlined, MenuOutlined, ReloadOutlined, UpOutlined, UserOutlined } from '@ant-design/icons'
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
import { WorkspaceGuide } from './WorkspaceGuide'
import type { CSSProperties, ReactNode } from 'react'
import './workspace.css'

export function WorkspaceHome() {
  const { session } = useSession()
  const { token } = theme.useToken()
  const entries = resolveNavigation(session.navigation, features)
  const screens = Grid.useBreakpoint()
  const [expanded, setExpanded] = useState(false)
  const collapsedCount = (screens.xl ? 4 : screens.md ? 3 : 2) * 2
  const visibleEntries = expanded ? entries : entries.slice(0, collapsedCount)
  const iconColors: Record<string, [string, string]> = {
    'model-routes': [token.purple6, token.purple1],
    skills: [token.purple6, token.purple1],
    agents: [token.cyan7, token.cyan1],
    runs: [token.cyan7, token.cyan1],
    tools: [token.orange6, token.orange1],
  }
  return <div className="workspace-home"><PageContainer title="工作台">
    {entries.length > 0 ? <nav aria-label="工作台入口" className="workspace-shortcuts" style={{
      '--shortcut-accent': token.colorPrimary,
      '--shortcut-icon-bg': token.colorPrimaryBg,
      '--shortcut-text': token.colorText,
      '--shortcut-muted': token.colorTextTertiary,
      '--shortcut-radius': `${token.borderRadiusLG}px`,
    } as CSSProperties}>
      <Row id="workspace-shortcut-grid" gutter={[16, 16]}>
        {visibleEntries.map(item => <Col key={item.navigationKey} xs={12} md={8} xl={6}>
          <Link className="workspace-shortcut" to={item.path}>
            <Card hoverable className="workspace-shortcut-card" styles={{ body: { padding: 0, height: '100%' } }}>
              <div className="workspace-shortcut-content">
                <span className="workspace-shortcut-icon" style={iconColors[item.navigationKey] && {
                  color: iconColors[item.navigationKey][0], background: iconColors[item.navigationKey][1],
                }}>{navigationIcon(item.navigationKey)}</span>
                <Typography.Text className="workspace-shortcut-label">{item.label}</Typography.Text>
                <ArrowRightOutlined className="workspace-shortcut-arrow" aria-hidden />
              </div>
            </Card>
          </Link>
        </Col>)}
      </Row>
      {entries.length > collapsedCount && <div className="workspace-shortcut-toggle">
        <Button type="text" aria-expanded={expanded} aria-controls="workspace-shortcut-grid"
          icon={expanded ? <UpOutlined /> : <DownOutlined />} onClick={() => setExpanded(value => !value)}>
          {expanded ? '收起快捷入口' : `展开全部快捷入口（${entries.length}）`}
        </Button>
      </div>}
    </nav> : <EmptyState message={session.workspace
      ? '暂无可用菜单，请联系管理员' : '尚未分配可用渠道，请联系平台管理员'} />}
  </PageContainer><WorkspaceGuide entries={entries} hasWorkspace={!!session.workspace} /></div>
}
export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { session, switchWorkspace, logout } = useSession()
  const { token } = theme.useToken()
  const [menuOpen, setMenuOpen] = useState(false)
  const [error, setError] = useState<unknown>()
  const screens = Grid.useBreakpoint()
  const location = useLocation()
  const navigate = useNavigate()
  const entries = resolveNavigation(session.navigation, features)
  const options = [...new Map([
    ...(session.workspace_options ?? []), ...(session.workspace ? [session.workspace] : []),
  ].map(option => [JSON.stringify([option.channel_id, option.environment]), option])).values()]
  const channels = [...new Map(options.map(option => [option.channel_id, { value: option.channel_id, label: option.channel_name }])).values()]
  const ranges = options.filter(option => option.channel_id === session.workspace?.channel_id)
  const environments = [...new Map(ranges.map(option => [option.environment, { value: option.environment, label: option.environment_name }])).values()]
  const preferredEnvironment = (available: typeof options) => available[0]
  function selectMode(mode: string) {
    if (mode === 'platform') { void switchWorkspace(null).catch(setError); return }
    const first = options[0]
    const target = first && preferredEnvironment(options.filter(option => option.channel_id === first.channel_id && option.environment === first.environment))
    if (target) void switchWorkspace(target).catch(setError)
  }
  function selectChannel(channelId: string) {
    const available = options.filter(option => option.channel_id === channelId)
    const sameEnvironment = available.filter(option => option.environment === session.workspace?.environment)
    const target = preferredEnvironment(sameEnvironment.length ? sameEnvironment : available)
    if (target) void switchWorkspace(target).catch(setError)
  }
  const current = entries.filter(entry => location.pathname === entry.path || location.pathname.startsWith(`${entry.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]
  const isDetail = current && location.pathname !== current.path && location.pathname !== `${current.path}/`
  const breadcrumbs = current ? [
    ...current.ancestors.map(parent => ({ title: parent.label })),
    { title: isDetail ? <Link to={current.path}>{current.label}</Link> : current.label },
    ...(isDetail ? [{ title: location.pathname === '/agents/assistance' ? new URLSearchParams(location.search).has('agent') ? '智能修改' : '智能创建' : '详情' }] : []),
  ] : [{ title: location.pathname === '/' ? '工作台' : <Link to="/">工作台</Link> }]
  const selectPage = (path: string) => { navigate(path); setMenuOpen(false) }
  const brand = <Link className="workspace-brand" to="/" aria-label="Creativity 工作台" onClick={() => setMenuOpen(false)}>
    <span className="workspace-brand-icon"><BrandMark variant="flat" /></span><span>Creativity</span>
  </Link>
  const menu = <nav aria-label="主导航" className="workspace-navigation"><Menu theme="light" mode="inline"
    className="workspace-menu" selectedKeys={current ? [current.path] : location.pathname === '/' ? ['/'] : []}
    onClick={({ key }) => selectPage(key)} items={[
      { key: '/', label: '工作台', icon: <HomeOutlined aria-hidden /> },
      ...navigationItems(entries),
    ]} /></nav>
  const workspaceStyle = {
    '--workspace-bg': token.colorBgContainer,
    '--workspace-border': token.colorBorderSecondary,
    '--workspace-text': token.colorText,
    '--workspace-muted': token.colorTextSecondary,
    '--workspace-subtle': token.colorTextTertiary,
    '--workspace-primary': token.colorPrimary,
  } as CSSProperties
  return <Layout className="workspace-layout" style={workspaceStyle}>
    {screens.lg && <Layout.Sider width={232} className="workspace-sidebar" theme="light">{brand}{menu}</Layout.Sider>}
    {!screens.lg && <Drawer rootStyle={workspaceStyle} classNames={{ section: 'workspace-drawer' }} title={brand} placement="left" size={256} open={menuOpen}
      onClose={() => setMenuOpen(false)} destroyOnHidden>{menu}</Drawer>}
    <Layout className="workspace-main">
      <Layout.Header className="workspace-header">
        <div className="workspace-location">
          {!screens.lg && <Button type="text" aria-label="打开导航菜单" icon={<MenuOutlined aria-hidden />} onClick={() => setMenuOpen(true)} />}
          <Breadcrumb aria-label="页面路径" items={breadcrumbs} />
        </div>
        <div className="workspace-context" style={{
          '--context-bg': token.colorBgLayout,
          '--context-border': token.colorBorderSecondary,
          '--context-text': token.colorText,
          '--context-muted': token.colorTextSecondary,
          '--context-accent': token.colorPrimary,
          '--context-accent-bg': token.colorPrimaryBg,
          '--context-hover': token.colorBgContainer,
          '--context-radius': `${token.borderRadius}px`,
        } as CSSProperties}>
          <div className="workspace-context-switches">
            {session.can_access_platform && channels.length > 0 ? <Select aria-label="管理模式" className="workspace-context-control workspace-mode-select" variant="borderless"
              prefix={<AppstoreOutlined aria-hidden />}
              value={session.workspace || !session.can_access_platform ? 'channel' : 'platform'}
              options={[
                { value: 'platform', label: '平台管理' },
                { value: 'channel', label: '渠道管理' },
              ]} onChange={selectMode} /> : <Typography.Text aria-label="管理模式" className="workspace-context-control workspace-context-label workspace-mode-select">
                <AppstoreOutlined aria-hidden /><span className="workspace-context-value">{session.workspace || !session.can_access_platform ? '渠道管理' : '平台管理'}</span>
              </Typography.Text>}
            {session.workspace && <>
              {channels.length > 1 ? <Select aria-label="切换渠道" className="workspace-context-control workspace-channel-select" variant="borderless"
                prefix={<ApartmentOutlined aria-hidden />}
                showSearch optionFilterProp="label" value={session.workspace.channel_id} options={channels}
                onChange={selectChannel} /> : <Typography.Text className="workspace-context-control workspace-context-label workspace-channel-select" title={session.workspace.channel_name}>
                  <ApartmentOutlined aria-hidden /><span className="workspace-context-value">{session.workspace.channel_name}</span>
                </Typography.Text>}
              {environments.length > 1 ? <Select aria-label="切换环境" variant="borderless" className="workspace-context-control workspace-environment-select"
                prefix={<CloudServerOutlined aria-hidden />}
                value={session.workspace.environment} options={environments}
                onChange={environment => {
                  const target = preferredEnvironment(ranges.filter(option => option.environment === environment))
                  if (target) void switchWorkspace(target).catch(setError)
                }} /> : <Typography.Text className="workspace-context-control workspace-context-label workspace-environment-select" title={session.workspace.environment_name}>
                  <CloudServerOutlined aria-hidden /><span className="workspace-context-value">{session.workspace.environment_name}</span>
                </Typography.Text>}
            </>}
          </div>
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
              <Avatar size={32} icon={<UserOutlined aria-hidden />} /><span className="workspace-user-name">{session.user.display_name}</span><DownOutlined aria-hidden />
            </Button>
          </Dropdown>
        </div>
      </Layout.Header>
      <Layout.Content className="app-content"><ErrorNotice error={error} />{children}</Layout.Content>
    </Layout>
  </Layout>
}
