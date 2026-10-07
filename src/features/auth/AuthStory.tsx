import { Tooltip } from 'antd'

const capabilities = [
  {
    title: '标准接入，能力灵活复用',
    label: '查看标准接入完整介绍',
    summary: '用 MCP 连接业务工具，用 Agent Skills 复用任务技能，让 AI 能力更快融入现有业务。',
    detail: '通过 MCP 标准协议连接业务工具，兼容 Agent Skills 技能包。工具与技能按需组合、灵活复用，让 AI 能力更快融入现有业务。',
  },
  {
    title: '可靠编排，执行有迹可循',
    label: '查看可靠编排完整介绍',
    summary: '基于 LangGraph 编排任务，支持保存进度、中断恢复。执行过程与调用用量，随时可查。',
    detail: '基于 LangGraph 编排任务，支持保存进度和中断恢复。执行步骤、工具证据与调用用量均有记录，方便查看过程、核实结果。',
  },
  {
    title: '多端接入，渠道独立管理',
    label: '查看多端接入完整介绍',
    summary: '统一 API 连接租号与陪玩多端，各渠道独立管理。首批聚焦商品智能推荐和服务发布风险审核。',
    detail: '通过统一 API 为客户端和管理端提供 AI 能力，业务系统独立演进，各渠道的数据与权限相互隔离。首批面向租号平台、陪玩客户端和陪玩管理端，聚焦客户端商品智能推荐与管理端服务发布风险审核。',
  },
]

export function AuthStory() {
  return <section className="auth-story" aria-labelledby="auth-story-title">
    <div className="auth-eyebrow"><strong>COMPOSE YOUR INTELLIGENCE</strong></div>
    <h1 id="auth-story-title">把复杂留给系统<br />把创造留给你</h1>
    <div className="auth-capabilities">{capabilities.map(capability => <div className="auth-capability" key={capability.title}>
      <h2 className="auth-capability-title">{capability.title}</h2>
      <Tooltip title={capability.detail} trigger={['hover', 'focus', 'click']} placement="bottom" styles={{ root: { maxWidth: 'min(360px, calc(100vw - 32px))' } }}>
        <button type="button" className="auth-capability-description" aria-label={capability.label}>
          <span>{capability.summary}</span>
        </button>
      </Tooltip>
    </div>)}</div>
  </section>
}
