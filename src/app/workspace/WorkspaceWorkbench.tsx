import { Button, Card, Col, Grid, Row, Typography, theme } from 'antd'
import { ArrowRightOutlined, DownOutlined, UpOutlined } from '@ant-design/icons'
import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/States'
import { PageContainer } from '../../components/PageContainer'
import { features } from '../../features/registry'
import { resolveNavigation } from '../../features/navigation'
import { useSession } from './context'
import { navigationIcon } from './navigation'
import { WorkspaceGuide } from './WorkspaceGuide'

export function WorkspaceWorkbench() {
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
  return <div className="workspace-workbench"><PageContainer title="工作台">
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
