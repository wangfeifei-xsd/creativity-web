import { Card, Typography, theme } from 'antd'
import type { CSSProperties, ReactNode } from 'react'
import './agent-workspace.css'

export function AgentWorkspace({ className, children }: { className: string; children: ReactNode }) {
  const { token } = theme.useToken()
  return <div className={`agent-workspace ${className}`} style={{
    '--agent-bg': token.colorBgContainer,
    '--agent-soft': token.colorFillAlter,
    '--agent-border': token.colorBorderSecondary,
    '--agent-line': token.colorBorder,
    '--agent-primary': token.colorPrimary,
    '--agent-tint': token.colorPrimaryBg,
    '--agent-text': token.colorText,
    '--agent-muted': token.colorTextSecondary,
  } as CSSProperties}>{children}</div>
}

export function AgentSection({ title, icon, extra, children, className = '' }: {
  title?: string; icon?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string
}) {
  return <Card className={`agent-section ${className}`} title={title ? <span className="agent-section-title">{icon}{title}</span> : undefined} extra={extra}>
    {children}
  </Card>
}

export function AgentValues({ items, className = '' }: {
  items: { label: string; value: ReactNode; wide?: boolean }[]; className?: string
}) {
  return <div className={`agent-values ${className}`}>{items.map(item => <div key={item.label} className={`agent-value${item.wide ? ' is-wide' : ''}`}>
    <Typography.Text type="secondary">{item.label}</Typography.Text><div className="agent-value-content">{item.value}</div>
  </div>)}</div>
}
