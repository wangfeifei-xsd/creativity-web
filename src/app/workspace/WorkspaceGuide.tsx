import { Alert, Button, Grid, Select, Tabs, Tooltip, Typography, theme } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { useState, type CSSProperties } from 'react'
import { workspaceGuides } from './workspaceGuides'

export function WorkspaceGuide({ entries, hasWorkspace }: {
  entries: readonly { navigationKey: string; path: string }[]
  hasWorkspace: boolean
}) {
  const { token } = theme.useToken()
  const screens = Grid.useBreakpoint()
  const [activeKey, setActiveKey] = useState('initialization')
  const paths = new Map(entries.map(entry => [entry.navigationKey, entry.path]))
  const items = workspaceGuides.map(guide => ({
      key: guide.key,
      label: guide.label,
      children: <ol className="workspace-guide-steps" aria-label={`${guide.label}步骤`}>
        {guide.steps.map((step, index) => {
          const path = hasWorkspace ? paths.get(step.action.navigationKey) : undefined
          return <li key={step.title} className="workspace-guide-step">
            <span className="workspace-guide-number" aria-hidden>{index + 1}</span>
            <div className="workspace-guide-copy">
              <Typography.Text strong>{step.title}</Typography.Text>
              <Typography.Paragraph type="secondary">{step.description}</Typography.Paragraph>
            </div>
            <div className="workspace-guide-action">
              {path ? <Link to={`${path}${step.action.search ?? ''}`}>{step.action.label}<ArrowRightOutlined aria-hidden /></Link>
                : <Tooltip title={hasWorkspace ? '当前账号没有此配置入口，请联系渠道管理员' : '请先切换到渠道环境'}>
                  <Button disabled>{step.action.label}</Button>
                </Tooltip>}
            </div>
          </li>
        })}
      </ol>,
    }))
  return <section aria-labelledby="workspace-guide-title" className="workspace-guide" style={{
    '--guide-border': token.colorBorderSecondary,
    '--guide-accent': token.colorPrimary,
    '--guide-accent-bg': token.colorPrimaryBg,
  } as CSSProperties}>
    <Typography.Title id="workspace-guide-title" level={4}>配置指引</Typography.Title>
    {!hasWorkspace && <Alert type="info" showIcon title="请先在顶部切换到已授权的渠道与环境，再按指引配置。" />}
    {screens.md ? <Tabs activeKey={activeKey} onChange={setActiveKey} items={items} /> : <>
      <Select aria-label="指引类型" className="workspace-guide-select" value={activeKey} onChange={setActiveKey}
        options={workspaceGuides.map(guide => ({ value: guide.key, label: guide.label }))} />
      {items.find(item => item.key === activeKey)?.children}
    </>}
  </section>
}
