import Icon, { ArrowRightOutlined, ClockCircleOutlined, LinkOutlined } from '@ant-design/icons'
import { Card, Typography, theme } from 'antd'
import type { CSSProperties, ReactNode } from 'react'
import { useSession } from './context'
import { WorkspaceGuideLink } from './WorkspaceGuideLink'
import type { GuideAction } from './workspaceGuides'

function RobotGlyph() {
  return <svg viewBox="0 0 32 32" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M16 4v5M5 17H2v7h3m22-7h3v7h-3" />
    <rect x="5.5" y="9" width="21" height="21" rx="5" />
    <circle cx="16" cy="3" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="11.5" cy="18" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="20.5" cy="18" r="1.5" fill="currentColor" stroke="none" />
    <path d="M12 24h8" />
  </svg>
}

interface UsageFlow {
  key: string
  title: string
  icon: ReactNode
  steps: { title: string; description: string }[]
  actions: (GuideAction & { requiredAction?: string; channelDetail?: boolean })[]
}

const flows: readonly UsageFlow[] = [
  {
    key: 'publish', title: '配置并发布智能体', icon: <Icon component={RobotGlyph} aria-hidden />,
    steps: [
      { title: '准备资源', description: '配置模型路由，按需准备提示词、工具和技能。' },
      { title: '定义智能体', description: '设置任务、输入输出和执行步骤。' },
      { title: '调试与评测', description: '用业务样例检查结果和执行过程。' },
      { title: '发布到环境', description: '发布后，可选择下面任一方式使用。' },
    ],
    actions: [{ label: '配置智能体', navigationKey: 'agents' }],
  },
  {
    key: 'schedule', title: '方式一：定时运行', icon: <ClockCircleOutlined aria-hidden />,
    steps: [
      { title: '选择已发布智能体', description: '进入业务接入 → 运行与事件 → 定时运行。' },
      { title: '新增定时计划', description: '填写运行输入，设置固定间隔或每日时间。' },
      { title: '平台按时执行', description: '启用计划后，到时间自动创建一次运行。' },
      { title: '查看执行结果', description: '在运行记录查看状态、结果及每一步。' },
    ],
    actions: [
      { label: '配置定时运行', navigationKey: 'integrations', search: '?tab=automation&section=schedules', requiredAction: 'integration:manage' },
      { label: '查看运行记录', navigationKey: 'runs' },
    ],
  },
  {
    key: 'api', title: '方式二：外部接口调用', icon: <LinkOutlined aria-hidden />,
    steps: [
      { title: '开通调用权限', description: '配置接入服务、API Key 和资源授权。' },
      { title: '配置身份委托', description: '在业务接入中配置，凭据保存在业务后端。' },
      { title: '业务后端发起调用', description: '传入已发布智能体的编码和业务输入。' },
      { title: '获取并展示结果', description: '查询运行结果，或订阅执行事件。' },
    ],
    actions: [
      { label: '配置接入服务', navigationKey: 'channels', channelDetail: true, search: '?tab=clients' },
      { label: '配置身份委托', navigationKey: 'integrations', search: '?tab=delegation', requiredAction: 'key:manage' },
    ],
  },
]

export function WorkspaceUsage({ entries }: {
  entries: readonly { navigationKey: string; path: string }[]
}) {
  const { session } = useSession()
  const { token } = theme.useToken()
  const paths = new Map(entries.map(entry => [entry.navigationKey, entry.path]))
  const accents: Record<string, { color: string; background: string; iconBackground: string; border: string }> = {
    publish: { color: token.colorPrimary, background: token.colorPrimaryBg, iconBackground: token.colorPrimaryBgHover, border: token.colorPrimaryBorder },
    schedule: { color: token.cyan7, background: token.cyan1, iconBackground: token.cyan2, border: token.cyan6 },
    api: {
      color: `color-mix(in srgb, ${token.purple6} 50%, ${token.geekblue7})`,
      background: token.purple1,
      iconBackground: `color-mix(in srgb, ${token.purple2} 50%, ${token.geekblue2})`,
      border: `color-mix(in srgb, ${token.purple6} 50%, ${token.geekblue6})`,
    },
  }
  function renderActions(flow: UsageFlow) {
    return <div className="workspace-usage-actions">
      {flow.actions.map(action => {
        const allowed = !action.requiredAction || session.actions.some(item => item.action_key === action.requiredAction)
        const base = allowed ? paths.get(action.navigationKey) : undefined
        const path = base && action.channelDetail
          ? session.workspace ? `${base}/${encodeURIComponent(session.workspace.channel_id)}` : undefined
          : base
        return <WorkspaceGuideLink key={action.label} action={action} path={path} hasWorkspace={!!session.workspace} />
      })}
    </div>
  }
  return <section aria-labelledby="workspace-usage-title" className="workspace-usage" style={{
    '--usage-border': token.colorBorderSecondary,
    '--usage-card-border': token.colorBorderSecondary,
    '--usage-ink': token.geekblue10,
    '--usage-muted': `color-mix(in srgb, ${token.colorTextSecondary} 80%, ${token.geekblue4})`,
    '--usage-surface': token.colorBgContainer,
    '--usage-node-bg': token.colorFillAlter,
    '--usage-code-bg': token.colorFillSecondary,
    '--usage-primary': token.colorPrimary,
    '--usage-primary-hover': token.colorPrimaryHover,
    '--usage-on-primary': token.colorTextLightSolid,
    '--usage-radius': `${token.borderRadiusLG}px`,
  } as CSSProperties}>
    <Typography.Title id="workspace-usage-title" level={2}>使用流程</Typography.Title>
    <div className="workspace-usage-flows">
      {flows.map(flow => <section key={flow.key} className={`workspace-usage-flow workspace-usage-flow-${flow.key}`}
        aria-labelledby={`usage-${flow.key}-title`} style={{
          '--usage-accent': accents[flow.key].color,
          '--usage-accent-bg': accents[flow.key].background,
          '--usage-icon-bg': accents[flow.key].iconBackground,
          '--usage-accent-border': accents[flow.key].border,
        } as CSSProperties}>
        <Card className="workspace-usage-card">
          <div className="workspace-usage-heading">
            <Typography.Title id={`usage-${flow.key}-title`} level={3}>
              <span className="workspace-usage-icon" aria-hidden>{flow.icon}</span>{flow.title}
            </Typography.Title>
            {flow.key === 'publish' && renderActions(flow)}
          </div>
          <ol className="workspace-usage-diagram" aria-label={`${flow.title}步骤`}>
            {flow.steps.map((step, index) => <li key={step.title} className="workspace-usage-node">
              <span className="workspace-usage-number" aria-hidden>{index + 1}</span>
              <div className="workspace-usage-copy">
                <Typography.Text strong>{step.title}</Typography.Text>
                <Typography.Paragraph type="secondary">{step.description}</Typography.Paragraph>
              </div>
              {flow.key === 'publish' && index < flow.steps.length - 1 && <ArrowRightOutlined className="workspace-usage-arrow" aria-hidden />}
            </li>)}
          </ol>
          {flow.key === 'api' && <Typography.Paragraph className="workspace-usage-api" type="secondary">
            统一调用接口 <Typography.Text code>POST /api/v1/runs</Typography.Text>，通过 <Typography.Text code>agent_code</Typography.Text> 选择智能体、<Typography.Text code>input</Typography.Text> 传入业务参数。
          </Typography.Paragraph>}
          {flow.key !== 'publish' && <div className="workspace-usage-footer">{renderActions(flow)}</div>}
        </Card>
      </section>)}
    </div>
  </section>
}
