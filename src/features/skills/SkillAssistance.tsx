import { Alert, App, Avatar, Badge, Button, Collapse, Descriptions, Input, Modal, Segmented, Select, Space, Spin, Tabs, Tag, Typography, theme } from 'antd'
import { ArrowLeftOutlined, ArrowRightOutlined, ArrowUpOutlined, CommentOutlined, FileTextOutlined, PlusOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { apiClient } from '../../api/client'
import { send } from '../../api/management'
import { isAbort, useQuery } from '../../api/useQuery'
import { ErrorNotice, type Schema } from '../../components/Management'
import { MarkdownContent } from '../../components/MarkdownContent'
import { ErrorState, LoadingState } from '../../components/States'
import '../agents/agents.css'
import './skill-assistance.css'

type Proposal = Schema<'SkillProposal'>
type Turn = Schema<'SkillAssistanceTurn'>
type Message = { text: string; runId: string; response?: Turn }
const terminal = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'])

export function SkillAssistance({ skillId }: { skillId?: string }) {
  const navigate = useNavigate()
  const detail = useQuery<Schema<'SkillDetail'>>(skillId ? `/admin/v1/skills/${encodeURIComponent(skillId)}` : null)
  const summary = detail.data?.versions.find(version => version.version_id === skillId)
  const version = useQuery<Schema<'SkillVersionView'>>(summary ? `/admin/v1/skills/${encodeURIComponent(skillId!)}/configuration` : null, false, summary?.revision)
  if (skillId && (!detail.data || !version.data || version.data.revision !== summary?.revision)) return <Space orientation="vertical">
    <Button onClick={() => navigate('/skills')}>返回技能列表</Button>
    {detail.error || version.error ? <ErrorState error={detail.error || version.error} onRetry={() => { detail.reload(); version.reload() }} /> : detail.data && !summary
      ? <Alert type="warning" showIcon title="技能当前配置不可用，请返回列表重新选择" /> : <LoadingState />}
  </Space>
  if (skillId && !detail.data?.skill.actions.some(action => action.action_key === 'assist')) return <Space orientation="vertical">
    <Button onClick={() => navigate('/skills')}>返回技能列表</Button><Alert type="warning" showIcon title="当前技能不可智能修改" />
  </Space>
  return <SkillWorkspace key={`${skillId ?? 'new'}:${version.data?.revision ?? ''}`} skill={detail.data?.skill} version={version.data}
    onReset={() => { detail.reload(); version.reload() }} />
}

function SkillWorkspace({ skill, version, onReset }: { skill?: Schema<'SkillView'>; version?: Schema<'SkillVersionView'>; onReset: () => void }) {
  const navigate = useNavigate()
  const { modal } = App.useApp()
  const { token } = theme.useToken()
  const routes = useQuery<Schema<'SkillAssistanceRoute'>[]>(`/admin/v1/skills/assistance/options${skill ? `?skill_id=${encodeURIComponent(skill.skill_id)}` : ''}`)
  const tools = useQuery<Schema<'SkillToolOption'>[]>('/admin/v1/skills/tool-options')
  const agents = useQuery<Schema<'SkillAgentOption'>[]>('/admin/v1/skills/agent-options')
  const [route, setRoute] = useState<string>()
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [error, setError] = useState<unknown>()
  const [pollError, setPollError] = useState<unknown>()
  const [retry, setRetry] = useState(0)
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pane, setPane] = useState('conversation')
  const [mode, setMode] = useState('formatted')
  const busy = useRef(false)
  const leaving = useRef(false)
  const request = useRef<{ body: string; key: string } | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const dirty = !!messages.length || !!text
  const blocker = useBlocker(() => dirty && !leaving.current)
  const last = messages.at(-1)
  const activeId = last && !terminal.has(last.response?.state ?? '') ? last.runId : undefined
  const pending = sending || !!activeId
  const candidate = [...messages].reverse().find(item => item.response?.state === 'SUCCEEDED' && item.response.reply?.proposal)
  const proposal = candidate?.response?.reply?.proposal
  const base: Proposal | undefined = skill && version ? { ...skill, version_label: version.version_label, instructions: version.instruction_preview, settings: version.settings } : undefined
  const preview = proposal ?? base
  const before = candidate?.response?.base ?? base
  const selectedRoute = route ?? routes.data?.[0]?.route_id
  const canGenerate = !pending && !saving && !!routes.data?.some(item => item.route_id === selectedRoute)
  const canSave = !!proposal && candidate === last && !pending && !saving
  const published = version?.status.value === 'PUBLISHED'
  const title = skill ? '智能修改' : '智能创建'

  useEffect(() => {
    if (!activeId) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    async function poll() {
      try {
        const response = await apiClient.request<Turn>(`/admin/v1/skills/assistance/runs/${activeId}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        setPollError(undefined)
        setMessages(items => items.map(item => item.runId === activeId ? { ...item, response } : item))
        if (!terminal.has(response.state)) timer = setTimeout(() => void poll(), 1500)
      } catch (failure) { if (!isAbort(failure)) setPollError(failure) }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [activeId, retry])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [messages, sending])
  useEffect(() => {
    if (!dirty) return
    const prevent = (event: BeforeUnloadEvent) => { if (!leaving.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])

  async function submit(message = text, regenerate = false) {
    if (busy.current || !canGenerate || !message.trim()) return
    busy.current = true; setSending(true); setError(undefined)
    const previous = [...messages].reverse().find(item => item.response?.state === 'SUCCEEDED')
    const body = { message: message.trim(), skill_id: skill?.skill_id ?? null, base_revision: version?.revision ?? null,
      model_route_id: selectedRoute ?? null, previous_run_id: previous?.runId ?? null }
    const encoded = JSON.stringify(body)
    if (request.current?.body !== encoded) request.current = { body: encoded, key: crypto.randomUUID() }
    try {
      const receipt = await send<Schema<'AdmissionReceipt'>>('/admin/v1/skills/assistance', 'POST', { ...body, idempotency_key: request.current.key })
      setMessages(items => [...items, { text: body.message, runId: receipt.run_id }])
      if (!regenerate) setText(current => current.trim() === body.message ? '' : current)
      request.current = null
    } catch (failure) { setError(failure) } finally { busy.current = false; setSending(false) }
  }
  async function save() {
    if (!candidate || !canSave || busy.current) return
    busy.current = true; setSaving(true); setError(undefined)
    try {
      const result = await send<Schema<'SkillAssistanceSaved'>>(`/admin/v1/skills/assistance/runs/${candidate.runId}/apply`, 'POST')
      leaving.current = true
      navigate(`/skills/${encodeURIComponent(result.skill_id)}`)
    } catch (failure) { setError(failure) } finally { busy.current = false; setSaving(false) }
  }
  function confirmSave() {
    if (published) modal.confirm({ title: '保存已发布技能的修改？', content: '所有引用此技能的新任务将使用修改后的内容。', okText: '保存修改', cancelText: '继续核对', onOk: save })
    else void save()
  }
  function reset() {
    const clear = () => { setMessages([]); setText(''); setError(undefined); setPollError(undefined); setPane('conversation'); request.current = null; routes.reload(); onReset() }
    if (dirty) modal.confirm({ title: '开始新对话？', content: '当前对话及未保存的技能书将清除。', okText: '开始新对话', cancelText: '继续编辑', onOk: clear })
    else clear()
  }
  const style = { '--assist-bg': token.colorBgContainer, '--assist-text': token.colorText, '--assist-muted': token.colorTextSecondary,
    '--assist-border': token.colorBorderSecondary, '--assist-line': token.colorBorder, '--assist-primary': token.colorPrimary,
    '--assist-tint': token.colorPrimaryBg, '--assist-soft': token.colorFillAlter, '--assist-success': token.colorSuccess,
    '--assist-radius': `${token.borderRadiusLG}px` } as CSSProperties
  const source = preview ? `---\n${JSON.stringify({ ...version?.metadata, name: preview.name, description: preview.description }, null, 2)}\n---\n\n${preview.instructions}\n` : ''
  const examples = skill ? ['补充这个技能的适用场景、操作步骤和异常处理，保留现有业务规则。', '检查这个技能的说明，为容易误解的步骤补充示例。'] : [
    '创建一个客服回复检查技能：根据客户问题和拟回复内容，检查遗漏、无依据的承诺和表达不清，并给出修改建议。',
    '创建一个会议纪要整理技能：从会议记录提取已确认的结论、负责人和待办事项，缺失信息标为待确认。',
  ]
  return <section className="agent-assistance skill-assistance" style={style} aria-label="技能智能协助工作区">
    <Modal open={blocker.state === 'blocked'} title="离开技能智能协助？" okText="离开" cancelText="继续编辑" okButtonProps={{ disabled: saving }}
      onOk={() => blocker.state === 'blocked' && blocker.proceed()} onCancel={() => blocker.state === 'blocked' && blocker.reset()}>当前对话及尚未保存的技能书不会保留。</Modal>
    <header className="agent-assistance-heading"><div className="agent-assistance-heading-title">
      <Button aria-label="返回技能列表" icon={<ArrowLeftOutlined aria-hidden />} onClick={() => navigate(skill ? `/skills/${skill.skill_id}` : '/skills')} disabled={saving} />
      <Typography.Title level={2}>{title}</Typography.Title><Tag icon={<ThunderboltOutlined aria-hidden />}>技能配置助手</Tag>
    </div><Button icon={<PlusOutlined aria-hidden />} onClick={reset} disabled={pending || saving}>新对话</Button></header>
    <ErrorNotice error={error ?? routes.error} />
    {routes.error != null && <Button onClick={routes.reload}>重新加载模型</Button>}
    {routes.data && !routes.data.length && <Alert type="warning" showIcon title="暂无可用模型，请先发布并授权支持文本生成的模型路由" />}
    <Segmented className="agent-assistance-pane-switch" aria-label="工作区视图" block value={pane} onChange={setPane} options={[
      { value: 'conversation', label: '需求对话' }, { value: 'preview', label: proposal ? '技能书 · 待保存' : skill ? '当前技能书' : '技能书预览' },
    ]} />
    <div className="agent-assistance-layout">
      <section className="agent-assistance-panel" data-active={pane === 'conversation'} aria-label="技能需求对话">
        <div className="agent-assistance-panel-heading"><span><CommentOutlined aria-hidden />需求对话</span></div>
        {skill && <div className="agent-assistance-target"><div><strong>{skill.name}</strong><span>{version?.status.label}</span></div><Tag>修改对象</Tag></div>}
        <div className={`agent-assistance-messages${messages.length ? '' : ' is-empty'}`} role="log" aria-live="polite">
          {!messages.length && <div className="agent-assistance-empty"><span className="agent-assistance-welcome-icon"><ThunderboltOutlined aria-hidden /></span>
            <Typography.Title level={4}>{skill ? '这个技能需要怎样调整？' : '你想创建怎样的技能？'}</Typography.Title>
            <div className="agent-assistance-examples">{examples.map((example, index) => <Button key={example} onClick={() => setText(example)}>
              {skill ? ['补齐技能步骤', '补充使用示例'][index] : ['客服回复检查', '会议纪要整理'][index]}<ArrowRightOutlined aria-hidden /></Button>)}</div>
          </div>}
          {messages.map(item => <div className="agent-assistance-turn" key={item.runId}>
            <div className="agent-assistance-message user"><Avatar size={30} icon={<UserOutlined aria-hidden />} /><div className="agent-assistance-bubble">{item.text}</div></div>
            {item.response?.reply && <div className="agent-assistance-message assistant"><Avatar size={30} icon={<ThunderboltOutlined aria-hidden />} /><div className="agent-assistance-answer">
              <div className="agent-assistance-bubble">{item.response.reply.message}</div>
              {item === candidate && proposal && <Button className="agent-assistance-result" onClick={() => setPane('preview')} aria-label="查看生成的技能书"><FileTextOutlined aria-hidden /><span><strong>{proposal.name}</strong><small>技能书已生成</small></span><ArrowRightOutlined aria-hidden /></Button>}
            </div></div>}
            {item.response?.error && <Alert type="error" showIcon title={item.response.error} />}
            {item.response && ['TIMED_OUT', 'CANCELLED'].includes(item.response.state) && !item.response.error && <Alert type="warning" title={item.response.state_label} />}
            {item === last && item.response && ['FAILED', 'TIMED_OUT', 'CANCELLED'].includes(item.response.state) && <Button disabled={!canGenerate} onClick={() => void submit(item.text, true)}>重新生成</Button>}
          </div>)}
          {pending && <Space className="agent-assistance-working"><Spin size="small" /><span>{last?.response?.state_label ?? '正在生成技能书'}</span></Space>}
          <ErrorNotice error={pollError} />{pollError != null && <Button onClick={() => { setPollError(undefined); setRetry(value => value + 1) }}>重新获取结果</Button>}
          <div ref={bottom} />
        </div>
        <div className="agent-assistance-composer"><Input.TextArea aria-label="技能创建或修改需求" placeholder={skill ? '描述要调整的规则、步骤或示例…' : '描述技能用途、处理步骤和期望结果…'}
          variant="borderless" value={text} onChange={event => setText(event.target.value)} autoSize={{ minRows: 3, maxRows: 7 }} maxLength={8000} disabled={saving}
          onKeyDown={event => { if (!event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void submit() } }} />
          <div className="agent-assistance-composer-toolbar"><Select aria-label="协助模型" value={selectedRoute} placeholder="选择协助模型" onChange={setRoute}
            disabled={pending || saving} loading={!routes.data && !routes.error} options={routes.data?.map(item => ({ value: item.route_id, label: item.name }))} />
            <span className="agent-assistance-keyboard">⌘ / Ctrl + Enter</span><Button type="primary" aria-label="发送" icon={<ArrowUpOutlined aria-hidden />} loading={sending} disabled={!canGenerate || !text.trim()} onClick={() => void submit()} /></div>
        </div>
      </section>
      <section className="agent-assistance-panel agent-assistance-preview" data-active={pane === 'preview'} aria-label="技能书预览">
        <div className="agent-assistance-panel-heading"><span><FileTextOutlined aria-hidden />{proposal || !skill ? '技能书预览' : '当前技能书'}</span>
          <Badge status={pending ? 'processing' : proposal ? 'success' : 'default'} text={pending ? '生成中' : proposal ? candidate === last ? '已生成' : '待更新' : skill ? '修改前' : '等待生成'} /></div>
        {preview ? <><div className="agent-assistance-preview-content">
          <div className="agent-assistance-preview-header"><Typography.Title level={4}>{preview.name}</Typography.Title><Tag>{proposal ? '待保存' : version?.status.label}</Tag></div>
          <Typography.Paragraph className="agent-assistance-purpose">{preview.description}</Typography.Paragraph>
          <Tabs className="agent-assistance-preview-tabs" items={[
            { key: 'book', label: '技能书', children: <><Segmented aria-label="技能书展示方式" value={mode} onChange={setMode} options={[{ value: 'formatted', label: '格式化' }, { value: 'source', label: '源文件' }]} />
              <div style={{ marginTop: 16 }}>{mode === 'formatted' ? <MarkdownContent text={preview.instructions} renderLink={(_href, children) => children} /> : <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{source}</pre>}</div></> },
            { key: 'settings', label: '技能配置', children: <SkillSettingsPreview proposal={preview} tools={tools.data ?? []} agents={agents.data ?? []} /> },
            ...(proposal && before ? [{ key: 'changes', label: '变更对照', children: <Collapse defaultActiveKey={['before', 'after']} items={[
              { key: 'before', label: '修改前', children: <><SkillSettingsPreview proposal={before} tools={tools.data ?? []} agents={agents.data ?? []} /><MarkdownContent text={before.instructions} renderLink={(_href, children) => children} /></> },
              { key: 'after', label: '修改后', children: <><SkillSettingsPreview proposal={proposal} tools={tools.data ?? []} agents={agents.data ?? []} /><MarkdownContent text={proposal.instructions} renderLink={(_href, children) => children} /></> },
            ]} /> }] : []),
          ]} />
          {published && <Alert type="warning" showIcon title="保存后，引用此技能的新任务将使用修改后的内容" />}
        </div><div className="agent-assistance-save"><span>{proposal ? candidate === last ? skill ? '保存到当前技能' : '保存为未发布技能' : '等待最新技能书' : '当前配置'}</span>
          {proposal && <Button type="primary" aria-label={skill ? '保存修改' : '创建技能'} loading={saving} disabled={!canSave} onClick={confirmSave}>{skill ? '保存修改' : '创建技能'}</Button>}
        </div></> : <div className="agent-assistance-preview-empty"><span><FileTextOutlined aria-hidden /></span><Typography.Text>技能书生成后在这里预览</Typography.Text></div>}
      </section>
    </div>
  </section>
}

function SkillSettingsPreview({ proposal, tools, agents }: { proposal: Proposal; tools: Schema<'SkillToolOption'>[]; agents: Schema<'SkillAgentOption'>[] }) {
  const settings = proposal.settings
  const capabilities: Record<string, string> = { text: '文本生成', tools: '工具调用', structured_output: '结构化输出', streaming: '流式输出', vision: '视觉理解', embedding: '向量生成' }
  const types: Record<string, string> = { string: '文本', number: '数值', boolean: '是或否', object: '对象', array: '列表' }
  return <Descriptions size="small" column={1} items={[
    { key: 'name', label: '技能名称', children: proposal.name }, { key: 'purpose', label: '用途', children: proposal.description },
    { key: 'owner', label: '负责人', children: proposal.owner }, { key: 'tags', label: '标签', children: proposal.tags?.join('、') || '未设置' },
    { key: 'mode', label: '加载方式', children: settings?.loading_mode === 'mandatory' ? '始终加载' : '按需加载' },
    { key: 'priority', label: '加载优先级', children: settings?.priority ?? 0 },
    { key: 'budget', label: '上下文上限', children: `${settings?.context_budget ?? 16000} 字节` },
    { key: 'tools', label: '依赖工具', children: Object.values(settings?.tool_bindings ?? {}).map(id => tools.find(tool => tool.version_id === id)?.name ?? '工具名称不可用').join('、') || '无' },
    { key: 'models', label: '模型能力', children: settings?.required_model_capabilities?.map(value => capabilities[value] ?? '能力名称不可用').join('、') || '无额外要求' },
    { key: 'agents', label: '授权智能体', children: settings?.allowed_agents?.map(id => agents.find(agent => agent.agent_id === id)?.name ?? '智能体名称不可用').join('、') || '按绑定与当前权限确定' },
    { key: 'groups', label: '互斥规则组', children: settings?.conflict_groups?.join('、') || '未设置' },
    { key: 'variables', label: '输入变量', children: settings?.input_variables?.map(variable => `${variable.label}（${types[variable.value_type ?? 'string']}，${variable.required === false ? '选填' : '必填'}）`).join('、') || '无' },
    { key: 'note', label: '变更说明', children: settings?.change_note || '未填写' },
  ]} />
}
