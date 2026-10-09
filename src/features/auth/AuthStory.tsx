import { AuthIcon } from './AuthIcon'

const capabilities = [
  {
    title: '标准接入，能力灵活复用',
    icon: <AuthIcon name="layers" />,
    summary: '用 MCP 连接业务工具，用 Agent Skills 复用任务技能，让 AI 能力更快融入现有业务。',
  },
  {
    title: '可靠编排，执行有迹可循',
    icon: <AuthIcon name="document" />,
    summary: '支持保存进度、中断恢复。执行过程与调用用量，随时可查。',
  },
  {
    title: '多端接入，渠道独立管理',
    icon: <AuthIcon name="channels" />,
    summary: '统一 API 连接租号与陪玩多端，各渠道独立管理。',
  },
]

export function AuthStory() {
  return <section className="auth-story" aria-labelledby="auth-story-title">
    <h1 id="auth-story-title">把复杂留给系统<br />把创造留给你</h1>
    <div className="auth-capabilities">{capabilities.map(capability => <div className="auth-capability" key={capability.title}>
      <span className="auth-capability-icon">{capability.icon}</span>
      <div className="auth-capability-copy">
        <h2 className="auth-capability-title">{capability.title}</h2>
        <p className="auth-capability-description">{capability.summary}</p>
      </div>
    </div>)}</div>
  </section>
}
